const prisma = require("../../utils/prisma");
const { reqBody } = require("../../utils/http");
const { YusufAgent } = require("../../models/yusufOS/agent");
const { YusufProject } = require("../../models/yusufOS/project");
const { YusufTask } = require("../../models/yusufOS/task");
const { AuditService } = require("../../domain/yusufOS/audit/AuditService");
const {
  SecuritySettings,
} = require("../../domain/yusufOS/security/SecuritySettings");
const {
  CAPABILITIES,
  HARD_FORBIDDEN_DEFINITIONS,
} = require("../../domain/yusufOS/capabilities/registry");
const {
  yusufRequestContext,
} = require("../../domain/yusufOS/api/requestContext");
const {
  yusufControlPlaneGuard,
} = require("../../domain/yusufOS/api/controlPlaneGuard");
const { handleYusufError } = require("../../domain/yusufOS/api/errorHandler");
const {
  validateObject,
  stringValue,
  positiveInt,
  enumValue,
  pagination,
} = require("../../domain/yusufOS/api/validation");
const {
  ApprovalService,
} = require("../../domain/yusufOS/approvals/ApprovalService");

function asyncRoute(handler) {
  return async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      handleYusufError(error, response);
    }
  };
}

function yusufOSEndpoints(app, { db = prisma, preGuarded = false } = {}) {
  if (!app) return;
  const guard = preGuarded ? [] : [yusufRequestContext, yusufControlPlaneGuard];
  const audit = new AuditService(db);
  const settings = new SecuritySettings(db);
  const approvals = new ApprovalService(db);

  app.get(
    "/yusuf-os/bootstrap",
    guard,
    asyncRoute(async (_request, response) => {
      response.status(200).json({
        systemStatus: {
          controlPlane: "HEALTHY",
          externalMutationsDisabled: await settings.externalMutationsDisabled(),
        },
        capabilities: Object.values(CAPABILITIES).map((item) => ({
          key: item.key,
          version: item.version,
          domain: item.domain,
          defaultRisk: item.defaultRisk,
          mutation: item.mutation,
        })),
        hardForbiddenCapabilities: Object.keys(HARD_FORBIDDEN_DEFINITIONS),
      });
    })
  );

  app.get(
    "/yusuf-os/agents",
    guard,
    asyncRoute(async (_request, response) => {
      response.status(200).json({ agents: await YusufAgent.list({}, db) });
    })
  );

  app.post(
    "/yusuf-os/agents",
    guard,
    asyncRoute(async (request, response) => {
      const body = validateObject(reqBody(request), {
        allowed: [
          "key",
          "name",
          "mission",
          "instructions",
          "maxConcurrentRuns",
        ],
        required: ["key", "name", "mission", "instructions"],
      });
      const agent = await YusufAgent.create(
        {
          key: stringValue(body.key, "key", {
            max: 100,
            pattern: /^[a-z][a-z0-9_-]*$/,
          }),
          name: stringValue(body.name, "name", { max: 255 }),
          mission: stringValue(body.mission, "mission", { max: 5000 }),
          instructions: stringValue(body.instructions, "instructions", {
            max: 50000,
          }),
          maxConcurrentRuns:
            body.maxConcurrentRuns === undefined
              ? 1
              : positiveInt(body.maxConcurrentRuns, "maxConcurrentRuns"),
        },
        db
      );
      response.status(201).json({ agent });
    })
  );

  app.get(
    "/yusuf-os/projects",
    guard,
    asyncRoute(async (_request, response) => {
      response.status(200).json({ projects: await YusufProject.list({}, db) });
    })
  );

  app.post(
    "/yusuf-os/projects",
    guard,
    asyncRoute(async (request, response) => {
      const body = validateObject(reqBody(request), {
        allowed: ["key", "name", "metadata"],
        required: ["key", "name"],
      });
      const project = await YusufProject.create(
        {
          key: stringValue(body.key, "key", {
            max: 100,
            pattern: /^[a-z][a-z0-9_-]*$/,
          }),
          name: stringValue(body.name, "name", { max: 255 }),
          metadata: body.metadata || {},
        },
        db
      );
      response.status(201).json({ project });
    })
  );

  app.get(
    "/yusuf-os/tasks",
    guard,
    asyncRoute(async (request, response) => {
      const page = pagination(request.query);
      const tasks = await db.yusuf_tasks.findMany({
        ...page,
        orderBy: { updatedAt: "desc" },
      });
      response.status(200).json({ tasks, page });
    })
  );

  app.post(
    "/yusuf-os/tasks",
    guard,
    asyncRoute(async (request, response) => {
      const body = validateObject(reqBody(request), {
        allowed: [
          "projectId",
          "assignedAgentId",
          "title",
          "objective",
          "priority",
          "completionGates",
        ],
        required: ["title", "objective"],
      });
      const task = await YusufTask.create(
        {
          projectId: body.projectId
            ? positiveInt(body.projectId, "projectId")
            : null,
          assignedAgentId: body.assignedAgentId
            ? positiveInt(body.assignedAgentId, "assignedAgentId")
            : null,
          title: stringValue(body.title, "title", { max: 500 }),
          objective: stringValue(body.objective, "objective", { max: 10000 }),
          priority:
            body.priority === undefined
              ? "P2"
              : enumValue(body.priority, "priority", ["P0", "P1", "P2", "P3"]),
          completionGates: Array.isArray(body.completionGates)
            ? body.completionGates
            : [],
          principal: response.locals.yusufOS.principal,
          requestId: response.locals.yusufOS.requestId,
        },
        db
      );
      response.status(201).json({ task });
    })
  );

  app.get(
    "/yusuf-os/tasks/:id",
    guard,
    asyncRoute(async (request, response) => {
      const id = positiveInt(request.params.id, "id");
      const task = await YusufTask.get({ id }, db);
      if (!task)
        return response.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: "Task not found.",
            details: {},
            requestId: response.locals.yusufOS.requestId,
          },
        });
      response.status(200).json({ task });
    })
  );

  app.get(
    "/yusuf-os/runs",
    guard,
    asyncRoute(async (request, response) => {
      const page = pagination(request.query);
      const runs = await db.yusuf_agent_runs.findMany({
        ...page,
        orderBy: { createdAt: "desc" },
      });
      response.status(200).json({ runs, page });
    })
  );

  app.get(
    "/yusuf-os/runs/:id",
    guard,
    asyncRoute(async (request, response) => {
      const run = await db.yusuf_agent_runs.findUnique({
        where: { id: positiveInt(request.params.id, "id") },
      });
      if (!run)
        return response.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: "Run not found.",
            details: {},
            requestId: response.locals.yusufOS.requestId,
          },
        });
      response.status(200).json({ run });
    })
  );

  app.get(
    "/yusuf-os/intents/:id",
    guard,
    asyncRoute(async (request, response) => {
      const intent = await db.yusuf_action_intents.findUnique({
        where: { id: positiveInt(request.params.id, "id") },
        include: { policyDecisions: true, approval: true, receipt: true },
      });
      if (!intent)
        return response.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: "Intent not found.",
            details: {},
            requestId: response.locals.yusufOS.requestId,
          },
        });
      response.status(200).json({ intent });
    })
  );

  app.get(
    "/yusuf-os/approvals",
    guard,
    asyncRoute(async (request, response) => {
      const page = pagination(request.query);
      const status = request.query.status
        ? enumValue(String(request.query.status), "status", [
            "PENDING",
            "APPROVED",
            "REJECTED",
            "EXPIRED",
            "INVALIDATED",
            "CONSUMED",
          ])
        : undefined;
      const approvalsList = await db.yusuf_approval_requests.findMany({
        where: status ? { status } : {},
        ...page,
        orderBy: { requestedAt: "desc" },
      });
      response.status(200).json({ approvals: approvalsList, page });
    })
  );

  app.get(
    "/yusuf-os/approvals/:id",
    guard,
    asyncRoute(async (request, response) => {
      const approval = await db.yusuf_approval_requests.findUnique({
        where: { id: positiveInt(request.params.id, "id") },
        include: { intent: true, policyDecision: true },
      });
      if (!approval)
        return response.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: "Approval not found.",
            details: {},
            requestId: response.locals.yusufOS.requestId,
          },
        });
      response.status(200).json({ approval });
    })
  );

  app.post(
    "/yusuf-os/approvals/:id/decisions",
    guard,
    asyncRoute(async (request, response) => {
      const body = validateObject(reqBody(request), {
        allowed: [
          "decision",
          "expectedPayloadHash",
          "expectedIntentVersion",
          "expectedApprovalVersion",
          "note",
        ],
        required: [
          "decision",
          "expectedPayloadHash",
          "expectedIntentVersion",
          "expectedApprovalVersion",
        ],
      });
      const approval = await approvals.decide(
        positiveInt(request.params.id, "id"),
        {
          decision: enumValue(body.decision, "decision", ["APPROVE", "REJECT"]),
          expectedPayloadHash: stringValue(
            body.expectedPayloadHash,
            "expectedPayloadHash",
            {
              max: 64,
              pattern: /^[a-f0-9]{64}$/,
            }
          ),
          expectedIntentVersion: positiveInt(
            body.expectedIntentVersion,
            "expectedIntentVersion"
          ),
          expectedApprovalVersion: positiveInt(
            body.expectedApprovalVersion,
            "expectedApprovalVersion"
          ),
          note: body.note,
          principal: response.locals.yusufOS.principal,
          requestId: response.locals.yusufOS.requestId,
        }
      );
      response.status(200).json({ approval });
    })
  );

  app.get(
    "/yusuf-os/audit-events",
    guard,
    asyncRoute(async (request, response) => {
      const page = pagination(request.query);
      const events = await db.yusuf_audit_events.findMany({
        ...page,
        orderBy: { sequence: "desc" },
      });
      response.status(200).json({ events, page });
    })
  );

  app.post(
    "/yusuf-os/audit/verify",
    guard,
    asyncRoute(async (_request, response) => {
      response.status(200).json({ integrity: await audit.verify() });
    })
  );
}

module.exports = { yusufOSEndpoints };
