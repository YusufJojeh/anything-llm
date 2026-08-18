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
  YusufOSError,
  ErrorCodes,
} = require("../../domain/yusufOS/errors/YusufOSError");
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
const {
  DashboardProjection,
  recordAuditCheck,
} = require("../../domain/yusufOS/projections/DashboardProjection");
const {
  EventProjection,
} = require("../../domain/yusufOS/projections/EventProjection");
const {
  DetailProjections,
} = require("../../domain/yusufOS/projections/DetailProjections");

function asyncRoute(handler) {
  return async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      handleYusufError(error, response);
    }
  };
}

// Public identifiers are uuids everywhere the Command Center can see them.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Registers the Yusuf OS control-plane routes.
 *
 * `basePath` exists so the identical handler set can also be mounted under
 * `/api/yusuf-os-ui`, which is guarded by the browser session bootstrap
 * instead of the bearer header (see `domain/yusufOS/api/uiSession.js`). The
 * handlers, validation and projections are the same code either way — only
 * the authentication mechanism in front of them differs.
 */
function yusufOSEndpoints(
  app,
  { db = prisma, preGuarded = false, basePath = "/yusuf-os" } = {}
) {
  if (!app) return;
  const guard = preGuarded ? [] : [yusufRequestContext, yusufControlPlaneGuard];
  const audit = new AuditService(db);
  const settings = new SecuritySettings(db);
  const approvals = new ApprovalService(db);
  const details = new DetailProjections(db);
  const path = (suffix) => `${basePath}${suffix}`;

  app.get(
    path("/bootstrap"),
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
    path("/agents"),
    guard,
    asyncRoute(async (_request, response) => {
      response.status(200).json({ agents: await YusufAgent.list({}, db) });
    })
  );

  app.post(
    path("/agents"),
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
    path("/projects"),
    guard,
    asyncRoute(async (_request, response) => {
      response.status(200).json({ projects: await YusufProject.list({}, db) });
    })
  );

  app.post(
    path("/projects"),
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
    path("/tasks"),
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
    path("/tasks"),
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
    path("/tasks/:id"),
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
    path("/runs"),
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
    path("/runs/:id"),
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
    path("/intents/:id"),
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
    path("/approvals"),
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
    path("/approvals/:id"),
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
    path("/approvals/:id/decisions"),
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
    path("/audit-events"),
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
    path("/audit/verify"),
    guard,
    asyncRoute(async (_request, response) => {
      response.status(200).json({ integrity: await audit.verify() });
    })
  );

  // --- Gate F: Command Center projections (read-only) ---------------------
  // Every route below is a projection of persisted state. None of them mutate
  // anything, and all inherit the same localhost + bearer-token guard as the
  // rest of the control plane.

  app.get(
    path("/dashboard"),
    guard,
    asyncRoute(async (request, response) => {
      const projection = new DashboardProjection(db);
      response.status(200).json(
        await projection.build({
          taskLimit: request.query.taskLimit,
        })
      );
    })
  );

  app.get(
    path("/events"),
    guard,
    asyncRoute(async (request, response) => {
      const events = new EventProjection(db);
      response
        .status(200)
        .json(
          await events.since(request.query.after || 0, request.query.limit)
        );
    })
  );

  app.post(
    path("/audit-integrity/check"),
    guard,
    asyncRoute(async (_request, response) => {
      // Deliberately a command, not part of the dashboard read: verifying the
      // chain walks every audit event, so it must never be triggered
      // implicitly by a UI poll. Until it is run, the dashboard honestly
      // reports UNCHECKED.
      const integrity = await audit.verify();
      const checkpoint = await db.yusuf_audit_checkpoints.findUnique({
        where: { key: "PRIMARY" },
      });
      response.status(200).json({
        integrity,
        summary: recordAuditCheck(integrity, checkpoint?.lastSequence || 0),
      });
    })
  );

  /**
   * SSE delivery for the same events `/events` returns.
   *
   * The HTTP snapshot remains the source of truth (Gate B §5); this is a
   * delivery optimization. Control mutations never travel over this channel —
   * it is strictly server-to-client projection data.
   */
  app.get(
    path("/events/stream"),
    guard,
    asyncRoute(async (request, response) => {
      const events = new EventProjection(db);
      const startCursor = Number(
        request.headers["last-event-id"] || request.query.after || 0
      );

      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      let cursor =
        Number.isInteger(startCursor) && startCursor >= 0 ? startCursor : 0;
      let closed = false;
      let poll = null;
      let heartbeat = null;
      let pumping = false;

      const shutdown = () => {
        if (closed) return;
        closed = true;
        if (poll) clearTimeout(poll);
        if (heartbeat) clearInterval(heartbeat);
        try {
          response.end();
        } catch {
          /* connection already torn down */
        }
      };
      // Registered before the first await: `close` can fire while the initial
      // pump is still querying, and a listener attached afterwards would miss
      // it, leaking both timers for the life of the process.
      request.on("close", shutdown);
      request.on("aborted", shutdown);
      response.on("error", shutdown);
      const write = (payload, { id, event } = {}) => {
        if (closed) return;
        if (id !== undefined) response.write(`id: ${id}\n`);
        if (event) response.write(`event: ${event}\n`);
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      const pump = async () => {
        if (closed) return;
        try {
          const batch = await events.since(cursor, 100);
          if (batch.reset) {
            // Tell the client to reload /dashboard rather than trying to
            // reconcile from an unusable cursor.
            write(
              { reason: batch.reason, cursor: batch.cursor },
              { event: "reset" }
            );
            cursor = Number(batch.cursor);
            return;
          }
          for (const envelope of batch.events)
            write(envelope, { id: envelope.sequence, event: "yusuf" });
          cursor = Math.max(cursor, Number(batch.cursor));
        } catch (error) {
          write({ code: error.code || "INTERNAL_ERROR" }, { event: "error" });
        }
      };

      // Self-scheduling rather than setInterval: a pump that outruns a fixed
      // interval would start again from the same cursor, re-emitting events
      // and letting a late-finishing write move the cursor backwards.
      const tick = async () => {
        if (closed || pumping) return;
        pumping = true;
        try {
          await pump();
        } finally {
          pumping = false;
          if (!closed) poll = setTimeout(tick, 1000);
        }
      };
      await tick();
      // Comment frames keep intermediaries from closing an idle connection
      // without injecting anything a client would parse as an event.
      heartbeat = setInterval(() => {
        if (!closed) response.write(": keep-alive\n\n");
      }, 15000);
      // The socket may have dropped while the first pump was still querying.
      if (closed) shutdown();
    })
  );

  // --- Gate G: uuid-addressed drilldown projections (read-only) ------------
  // The Gate F dashboard identifies entities by uuid, but the pre-existing
  // detail routes only accept the internal numeric key, so nothing on the
  // dashboard was actually openable. These are additive: the numeric routes
  // above keep their exact Gate F behaviour and response shape.

  const uuidParam = (value, field) => {
    const candidate = String(value || "");
    if (!UUID_PATTERN.test(candidate))
      throw new YusufOSError(
        ErrorCodes.VALIDATION_ERROR,
        `${field} must be a uuid.`,
        { status: 422 }
      );
    return candidate;
  };

  app.get(
    path("/agents/roster"),
    guard,
    asyncRoute(async (_request, response) => {
      response.status(200).json(await details.roster());
    })
  );

  app.get(
    path("/tasks/:taskId/detail"),
    guard,
    asyncRoute(async (request, response) => {
      response
        .status(200)
        .json(await details.task(uuidParam(request.params.taskId, "taskId")));
    })
  );

  app.get(
    path("/runs/:runId/detail"),
    guard,
    asyncRoute(async (request, response) => {
      response
        .status(200)
        .json(await details.run(uuidParam(request.params.runId, "runId")));
    })
  );

  app.get(
    path("/approvals/:approvalId/review"),
    guard,
    asyncRoute(async (request, response) => {
      response
        .status(200)
        .json(
          await details.approvalReview(
            uuidParam(request.params.approvalId, "approvalId")
          )
        );
    })
  );
}

module.exports = { yusufOSEndpoints };
