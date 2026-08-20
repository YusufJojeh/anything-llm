const prisma = require("../../../utils/prisma");
const { YusufActionBoundary } = require("../runtime/YusufActionBoundary");
const { IntentService } = require("../actions/IntentService");
const { PolicyEngine } = require("../policy/PolicyEngine");
const { ExecutionCoordinator } = require("../execution/ExecutionCoordinator");
const { LocalGitAdapter } = require("../adapters/localGit/LocalGitAdapter");
const { ProjectAdapter } = require("../adapters/project/ProjectAdapter");
const { BrowserAdapter } = require("../adapters/browser/BrowserAdapter");
const { KnowledgeAdapter } = require("../adapters/knowledge/KnowledgeAdapter");
const { MemoryAdapter } = require("../adapters/memory/MemoryAdapter");
const {
  SystemHealthAdapter,
} = require("../adapters/systemHealth/SystemHealthAdapter");
const {
  MonitoringAdapter,
} = require("../adapters/monitoring/MonitoringAdapter");
const { CareerAdapter } = require("../adapters/career/CareerAdapter");
const { MarketingAdapter } = require("../adapters/marketing/MarketingAdapter");
const { FounderAdapter } = require("../adapters/founder/FounderAdapter");
const localGitBuilders = require("../adapters/localGit/requestBuilders");
const projectBuilders = require("../adapters/project/requestBuilders");
const browserBuilders = require("../adapters/browser/requestBuilders");
const knowledgeBuilders = require("../adapters/knowledge/requestBuilders");
const memoryBuilders = require("../adapters/memory/requestBuilders");
const systemHealthBuilders = require("../adapters/systemHealth/requestBuilders");
const monitoringBuilders = require("../adapters/monitoring/requestBuilders");
const careerBuilders = require("../adapters/career/requestBuilders");
const marketingBuilders = require("../adapters/marketing/requestBuilders");
const founderBuilders = require("../adapters/founder/requestBuilders");
const { getAgentDefinition } = require("./definitions");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

/**
 * Maps each governed capability to the request builder that turns an Agent's
 * semantic arguments into a canonical ActionRequest.
 *
 * These are the same Gate D builders used by the Gate D tests — reused, not
 * reimplemented. That matters for the protected-branch guarantee recorded in
 * KNOWN_RISKS #7: Gate E adds no second code path that constructs a
 * `git.push_feature_branch` request, so the source- and destination-branch
 * protected checks in the single existing builder remain the only path.
 */
const CAPABILITY_BUILDERS = Object.freeze({
  "git.read_status": (args, db) =>
    localGitBuilders.buildReadRequest("git.read_status", args, db),
  "git.read_diff": (args, db) =>
    localGitBuilders.buildReadRequest("git.read_diff", args, db),
  "git.read_log": (args, db) =>
    localGitBuilders.buildReadRequest("git.read_log", args, db),
  "git.read_show": (args, db) =>
    localGitBuilders.buildReadRequest("git.read_show", args, db),
  "git.create_branch": (args, db) =>
    localGitBuilders.buildCreateBranchRequest(args, db),
  "git.switch_branch": (args, db) =>
    localGitBuilders.buildSwitchBranchRequest(args, db),
  "git.stage_paths": (args, db) =>
    localGitBuilders.buildStagePathsRequest(args, db),
  "git.commit_local": (args, db) =>
    localGitBuilders.buildCommitLocalRequest(args, db),
  "git.push_feature_branch": (args, db) =>
    localGitBuilders.buildPushFeatureBranchRequest(args, db),
  "project.read_file": (args, db) =>
    projectBuilders.buildReadFileRequest(args, db),
  "project.write_file": (args, db) =>
    projectBuilders.buildWriteFileRequest(args, db),
  "project.run_command": (args, db) =>
    projectBuilders.buildRunCommandRequest(args, db),
  "browser.submit_form": (args, db) =>
    browserBuilders.buildSubmitFormRequest(args, db),
  "knowledge.read": (args) => knowledgeBuilders.buildReadRequest(args),
  "knowledge.write": (args) => knowledgeBuilders.buildWriteRequest(args),
  "memory.read": (args, db) => memoryBuilders.buildReadRequest(args, db),
  "memory.write": (args, db) => memoryBuilders.buildWriteRequest(args, db),
  "system.read_health": () => systemHealthBuilders.buildReadHealthRequest(),
  "monitoring.record_check": (args) =>
    monitoringBuilders.buildRecordCheckRequest(args),
  "career.read_opportunities": (args) => careerBuilders.buildReadRequest(args),
  "career.record_opportunity": (args) =>
    careerBuilders.buildRecordOpportunityRequest(args),
  "career.update_status": (args, db) =>
    careerBuilders.buildUpdateStatusRequest(args, db),
  "marketing.read_content": (args) => marketingBuilders.buildReadRequest(args),
  "marketing.record_content": (args) =>
    marketingBuilders.buildRecordContentRequest(args),
  "marketing.update_status": (args, db) =>
    marketingBuilders.buildUpdateStatusRequest(args, db),
  "founder.read_ventures": (args) => founderBuilders.buildReadRequest(args),
  "founder.record_venture": (args) =>
    founderBuilders.buildRecordVentureRequest(args),
  "founder.update_status": (args, db) =>
    founderBuilders.buildUpdateStatusRequest(args, db),
});

function adapterForCapability(capabilityKey, db) {
  if (capabilityKey.startsWith("git.")) return new LocalGitAdapter({ db });
  if (capabilityKey.startsWith("project.")) return new ProjectAdapter({ db });
  // Phase H. The adapter is wired so the capability is *reachable*; no role's
  // code-owned allowlist grants it yet, so `assertGrantAllowed` still refuses
  // every grant. Reachability and authority are deliberately separate steps —
  // the Agent that needs browser reads (Research/Career) arrives with them.
  if (capabilityKey.startsWith("browser.")) return new BrowserAdapter();
  if (capabilityKey.startsWith("knowledge."))
    return new KnowledgeAdapter({ db });
  if (capabilityKey.startsWith("memory.")) return new MemoryAdapter({ db });
  if (capabilityKey.startsWith("system."))
    return new SystemHealthAdapter({ db });
  if (capabilityKey.startsWith("monitoring."))
    return new MonitoringAdapter({ db });
  if (capabilityKey.startsWith("career.")) return new CareerAdapter({ db });
  if (capabilityKey.startsWith("marketing."))
    return new MarketingAdapter({ db });
  if (capabilityKey.startsWith("founder.")) return new FounderAdapter({ db });
  throw new YusufOSError(
    ErrorCodes.POLICY_DENIED,
    `No governed adapter is registered for ${capabilityKey}.`,
    { status: 503 }
  );
}

/**
 * Builds the governed toolset for one Agent role.
 *
 * Capability isolation is enforced here at bind time from the code-owned role
 * definition, in addition to the database grant that Policy checks at
 * evaluation time. An Agent therefore cannot be handed a tool its role never
 * allows, even if a stray DB grant existed — and Policy would still deny it.
 */
function buildAgentToolset({ agentKey, db = prisma, actionBoundary = null }) {
  const definition = getAgentDefinition(agentKey);
  if (!definition)
    throw new YusufOSError(
      ErrorCodes.NOT_FOUND,
      `Unknown agent role: ${agentKey}`,
      { status: 404 }
    );

  const boundary =
    actionBoundary ||
    new YusufActionBoundary({
      intentService: new IntentService(db),
      policyEngine: new PolicyEngine(db),
      executionCoordinatorFactory: ({ capability }) =>
        new ExecutionCoordinator({
          db,
          adapter: adapterForCapability(capability, db),
        }),
    });

  const tools = {};
  for (const capabilityKey of definition.allowedCapabilities) {
    const builder = CAPABILITY_BUILDERS[capabilityKey];
    if (!builder)
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `No request builder registered for ${capabilityKey}.`,
        { status: 500 }
      );
    tools[capabilityKey] = boundary.bindTool({
      name: `${agentKey}:${capabilityKey}`,
      description: `Governed ${capabilityKey} for the ${agentKey} agent.`,
      capability: capabilityKey,
      buildActionRequest: (args) => builder(args || {}, db),
    });
  }
  return { boundary, tools, definition };
}

/**
 * Single entry point an Agent run uses to invoke a capability. Rejects any
 * capability outside the role's allowlist before the Action Boundary is even
 * reached, then defers entirely to Gate C for policy, approval, execution,
 * verification, and audit.
 */
async function invokeCapability({
  toolset,
  capabilityKey,
  args,
  runtimeContext,
}) {
  const tool = toolset.tools[capabilityKey];
  if (!tool)
    throw new YusufOSError(
      ErrorCodes.POLICY_DENIED,
      `Capability ${capabilityKey} is not available to the ${toolset.definition.key} agent.`,
      {
        status: 403,
        details: { capabilityKey, agentKey: toolset.definition.key },
      }
    );
  return toolset.boundary.dispatch({
    functionConfig: tool,
    arguments: args,
    runtimeContext,
  });
}

module.exports = {
  CAPABILITY_BUILDERS,
  adapterForCapability,
  buildAgentToolset,
  invokeCapability,
};
