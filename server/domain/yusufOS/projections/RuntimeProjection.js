const prisma = require("../../../utils/prisma");
const { OllamaProvider } = require("../models/OllamaProvider");
const { OpenAIProvider } = require("../models/OpenAIProvider");
const { CONFIDENCE } = require("../models/constants");
const { AGENT_DEFINITIONS } = require("../agents/definitions");
const { listDepartments } = require("../organization/departments");
const { redactString, redactForPersistence } = require("../security/redaction");

/**
 * Phase S: read-only Command Center projections for the model runtime
 * (Phase R), the Department/Agent/Skill/Job organization model, Monitoring
 * check history (Phase K), and the Knowledge/Evidence/Memory split (Phase J).
 *
 * Every rule `DashboardProjection`/`DetailProjections` already established
 * applies here too: nothing is fabricated, nothing is coerced to 0 in place
 * of UNAVAILABLE, and the OpenAI key value itself is never read into any
 * field this class returns — only `Boolean(...)` of its presence.
 */

const GEMMA_FAMILY = /^gemma(?:\d+(?:\.\d+)?)?$/i;
const RECENT_COMPLETIONS_LIMIT = 20;
const MONITORING_HISTORY_LIMIT = 50;
const MODEL_LIMIT = 100;
const MAX_TEXT = 500;

function text(value, max = MAX_TEXT) {
  if (value === null || value === undefined) return null;
  return redactString(String(value)).slice(0, max);
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function parseJson(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function confidence(value) {
  return Object.values(CONFIDENCE).includes(value)
    ? value
    : CONFIDENCE.UNAVAILABLE;
}

function safeIdentifier(value, max = 200) {
  return typeof value === "string" && value.trim()
    ? text(
        value
          .trim()
          // Control and bidi-formatting characters cannot be operator-facing
          // model identity. The escapes are intentional, not raw literals.
          .replace(
            // eslint-disable-next-line no-control-regex
            /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
            ""
          ),
        max
      )
    : null;
}

function safeEndpoint(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value));
    if (!/^https?:$/.test(parsed.protocol)) return null;
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return text(parsed.origin, 500);
  } catch {
    return null;
  }
}

class RuntimeProjection {
  constructor(db = prisma, { ollama, openai } = {}) {
    this.db = db;
    // Constructible with fakes for tests; real providers are stateless and
    // read-only (never issue a pull/create/delete, never persist anything).
    this.ollama = ollama || new OllamaProvider();
    this.openai = openai || new OpenAIProvider();
  }

  async build() {
    const [modelRuntime, departments, monitoring, knowledgeEvidenceMemory] =
      await Promise.all([
        this.#modelRuntime(),
        this.#departments(),
        this.#monitoringHistory(),
        this.#knowledgeEvidenceMemory(),
      ]);
    return {
      asOf: new Date().toISOString(),
      modelRuntime,
      departments,
      monitoring,
      knowledgeEvidenceMemory,
    };
  }

  async #modelRuntime() {
    const [ollamaHealth, openaiHealth] = await Promise.all([
      this.ollama.health().catch((error) => ({
        status: "ERROR",
        available: false,
        models: [],
        error: String(error?.message || error),
      })),
      this.openai.health(),
    ]);

    const models = Array.isArray(ollamaHealth.models)
      ? ollamaHealth.models
      : [];
    // Generic tag-aware match, same rule the router itself uses
    // (`isModelInstalled`) — no hardcoded gemma4-only detection path.
    const gemmaMatches = models.filter((m) => GEMMA_FAMILY.test(m.name));

    const agentModelPolicies = Object.values(AGENT_DEFINITIONS).map(
      (definition) => ({
        agentId: definition.key,
        role: definition.modelPolicy?.role || null,
        routingPolicy: definition.modelPolicy?.routingPolicy || null,
        explicitProvider: definition.modelPolicy?.explicitProvider || null,
        explicitModel: definition.modelPolicy?.explicitModel || null,
        temperature:
          typeof definition.modelPolicy?.temperature === "number"
            ? definition.modelPolicy.temperature
            : null,
      })
    );

    const recentRuns = await this.db.yusuf_agent_runs.findMany({
      where: {
        modelRef: { contains: '"telemetryKind":"ROUTED_COMPLETION"' },
      },
      orderBy: { updatedAt: "desc" },
      take: RECENT_COMPLETIONS_LIMIT,
      include: { agent: { select: { key: true } } },
    });

    const recentCompletions = recentRuns
      .flatMap((run) => {
        const ref = parseJson(run.modelRef, null);
        if (ref?.telemetryKind !== "ROUTED_COMPLETION") return [];
        const usage = parseJson(run.tokenUsage, null);
        const costConfidence = confidence(ref.costConfidence);
        return [
          {
            runId: run.uuid,
            agentId: run.agent?.key || null,
            provider: safeIdentifier(ref?.provider),
            model: safeIdentifier(ref?.model),
            routingPolicy: safeIdentifier(ref?.policy),
            fallbackOccurred:
              typeof ref?.fallbackOccurred === "boolean"
                ? ref.fallbackOccurred
                : null,
            latencyMs: finiteNonNegative(ref?.latencyMs),
            usage:
              usage && typeof usage === "object" && !Array.isArray(usage)
                ? {
                    confidence: confidence(usage.confidence),
                    promptTokens: finiteNonNegative(usage.promptTokens),
                    completionTokens: finiteNonNegative(usage.completionTokens),
                    totalTokens: finiteNonNegative(usage.totalTokens),
                  }
                : { confidence: CONFIDENCE.UNAVAILABLE },
            costConfidence,
            // Never coerced to 0: a null cost with UNAVAILABLE confidence must
            // render distinctly from a genuine zero-cost completion.
            estimatedCostMicros:
              costConfidence === CONFIDENCE.UNAVAILABLE
                ? null
                : finiteNonNegative(run.estimatedCostMicros),
            updatedAt: iso(run.updatedAt),
          },
        ];
      })
      .slice(0, RECENT_COMPLETIONS_LIMIT);

    return {
      ollama: {
        endpoint: safeEndpoint(this.ollama.baseUrl),
        reachable: ollamaHealth.status === "HEALTHY",
        status: ollamaHealth.status,
        error: text(ollamaHealth.error, 500),
        models: models.slice(0, MODEL_LIMIT).flatMap((m) => {
          const fullName = safeIdentifier(m.fullName);
          const name = safeIdentifier(m.name);
          const tag = safeIdentifier(m.tag);
          if (!fullName || !name || !tag) return [];
          return [
            {
              fullName,
              name,
              tag,
              sizeBytes: finiteNonNegative(m.sizeBytes),
            },
          ];
        }),
        gemmaFamily: {
          present: gemmaMatches.length > 0,
          matches: gemmaMatches
            .slice(0, MODEL_LIMIT)
            .map((model) => safeIdentifier(model.fullName))
            .filter(Boolean),
        },
      },
      // Boolean presence only. The key value never reaches this object, any
      // log, or any downstream consumer — see OpenAIProvider's own contract.
      openai: {
        configured: Boolean(openaiHealth.available),
      },
      agentModelPolicies,
      recentCompletions,
    };
  }

  async #departments() {
    const agentRows = await this.db.yusuf_agents.findMany({
      select: { id: true, key: true, uuid: true, status: true },
    });
    const agentByKey = new Map(agentRows.map((row) => [row.key, row]));
    const taskCountsByAgentId = new Map();
    if (agentRows.length) {
      const grouped = await this.db.yusuf_tasks.groupBy({
        by: ["assignedAgentId", "status"],
        where: { assignedAgentId: { in: agentRows.map((r) => r.id) } },
        _count: { _all: true },
      });
      for (const row of grouped) {
        const existing = taskCountsByAgentId.get(row.assignedAgentId) || {};
        existing[row.status] = row._count._all;
        taskCountsByAgentId.set(row.assignedAgentId, existing);
      }
    }

    return listDepartments().map((department) => ({
      departmentId: department.key,
      name: text(department.name, 200),
      mission: text(department.mission, 500),
      agents: department.memberAgentKeys.map((agentKey) => {
        const definition = AGENT_DEFINITIONS[agentKey];
        const row = agentByKey.get(agentKey);
        const jobCounts = row ? taskCountsByAgentId.get(row.id) || {} : {};
        return {
          agentId: agentKey,
          name: text(definition?.name, 200),
          lifecycleStatus: row?.status || null,
          autonomyLevel: definition?.autonomyLevel || null,
          skills: definition?.allowedCapabilities || [],
          jobs: {
            byStatus: jobCounts,
            total: Object.values(jobCounts).reduce((a, b) => a + b, 0),
          },
        };
      }),
    }));
  }

  async #monitoringHistory() {
    let rows;
    try {
      rows = await this.db.yusuf_monitoring_checks.findMany({
        orderBy: { createdAt: "desc" },
        take: MONITORING_HISTORY_LIMIT,
      });
    } catch {
      // Table not reachable in this deployment (e.g. migration not applied
      // yet) — honestly report unavailable rather than a fabricated empty.
      return { available: false, checks: [] };
    }
    return {
      available: true,
      checks: rows.map((row) => ({
        checkId: row.uuid,
        checkKey: row.checkKey,
        status: row.status,
        summary: text(row.summary, 1000),
        observedValue: redactForPersistence(parseJson(row.observedValue, null)),
        threshold: redactForPersistence(parseJson(row.threshold, null)),
        createdAt: iso(row.createdAt),
      })),
    };
  }

  async #knowledgeEvidenceMemory() {
    const [knowledgeCount, memoryCount, evidenceByClass, evidenceTombstoned] =
      await Promise.all([
        this.db.yusuf_knowledge_entries.count(),
        this.db.yusuf_memory_entries.count(),
        this.db.yusuf_run_evidence.groupBy({
          by: ["evidenceClass"],
          _count: { _all: true },
        }),
        this.db.yusuf_run_evidence.count({
          where: { tombstonedAt: { not: null } },
        }),
      ]);
    const [knowledgeBySource, memoryByScope] = await Promise.all([
      this.db.yusuf_knowledge_entries.groupBy({
        by: ["sourceType"],
        _count: { _all: true },
      }),
      this.db.yusuf_memory_entries.groupBy({
        by: ["scope"],
        _count: { _all: true },
      }),
    ]);
    return {
      knowledge: {
        total: knowledgeCount,
        bySourceType: Object.fromEntries(
          knowledgeBySource.map((row) => [row.sourceType, row._count._all])
        ),
      },
      memory: {
        total: memoryCount,
        byScope: Object.fromEntries(
          memoryByScope.map((row) => [row.scope, row._count._all])
        ),
      },
      evidence: {
        byClass: Object.fromEntries(
          evidenceByClass.map((row) => [row.evidenceClass, row._count._all])
        ),
        tombstoned: evidenceTombstoned,
      },
    };
  }
}

module.exports = { RuntimeProjection };
