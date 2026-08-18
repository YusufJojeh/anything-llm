/*
 * ============================================================================
 * YUSUF OS VISUAL HARNESS — DEVELOPMENT ONLY. NOT PRODUCTION CODE.
 * ============================================================================
 *
 * This file is NOT imported by `src/main.jsx`, is NOT part of any route, and is
 * NOT included in `vite build` output (its only entry point is the sibling
 * `yusuf-os-harness.html`, which Vite serves in dev and never bundles).
 *
 * WHY IT EXISTS
 * Gate G's one open evidence gap was live visual acceptance of the *unlocked*
 * Command Center. Reaching the real unlocked UI requires presenting the control
 * token, which the implementing agent does not do. This harness renders the
 * **real** `YusufOSProvider`, the **real** `CommandCenter`, and every real child
 * component, driven by the same deterministic fixtures the Vitest suite uses —
 * so layout, overlap, clipping, RTL, focus order and motion can be measured in
 * a real browser without any credential and without inventing production data.
 *
 * WHAT IT IS NOT
 * It is not a data source, not a demo mode, and not reachable from `/os`. Every
 * value below is a fixture. Nothing here may ever be presented as real system
 * state — that would be exactly the fake data Gate G forbids.
 *
 * The banner rendered at the top of the page says so on screen, so no
 * screenshot taken from this harness can be mistaken for production.
 * ============================================================================
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { registerYusufOSTranslations } from "../i18n";
import { dashboardFixture, rosterFixture } from "../__tests__/fixtures";

const params = new URLSearchParams(window.location.search);
const scenario = params.get("scenario") || "healthy";
const language = params.get("lang") || "en";

/** Builds a roster + matching statuses of arbitrary size, for layout QA. */
function sizedRoster(count, { longNames = false } = {}) {
  const agents = Array.from({ length: count }, (_, index) => ({
    agentId: `agent_${index}`,
    name: longNames
      ? `Extremely Long Specialist Agent Name Number ${index}`
      : `Agent ${index}`,
    mission: "Fixture agent.",
    lifecycleStatus: "ACTIVE",
    capabilityCount: index % 4,
    capabilityKeys: [],
    maxConcurrentRuns: 1,
    createdAt: "2026-08-17T00:00:00.000Z",
  }));
  return {
    roster: { agents },
    statuses: agents.map((agent, index) => ({
      agentId: agent.agentId,
      status: ["IDLE", "RUNNING", "WAITING", "BLOCKED"][index % 4],
    })),
  };
}

/**
 * Every scenario returns a `{ dashboard, roster }` pair shaped exactly like the
 * Gate F projections. Deliberately includes the states that are hard to
 * reproduce on a clean local database.
 */
const SCENARIOS = {
  // All quiet: the honest empty/healthy state.
  healthy: () => ({
    dashboard: dashboardFixture({
      agentStatuses: [
        { agentId: "chief_of_staff", status: "IDLE" },
        { agentId: "engineering", status: "IDLE" },
        { agentId: "reviewer", status: "IDLE" },
      ],
      taskStatuses: [],
    }),
    roster: rosterFixture(),
  }),

  // Nothing registered at all.
  empty: () => ({
    dashboard: dashboardFixture({
      agentStatuses: [],
      taskStatuses: [],
      adapterHealth: [],
    }),
    roster: { agents: [] },
  }),

  // Real delegation in flight: one live handoff edge, one running agent.
  working: () => ({
    dashboard: dashboardFixture({
      activeHandoffs: [
        {
          fromAgentId: "chief_of_staff",
          toAgentId: "engineering",
          taskId: "11111111-1111-4111-8111-111111111111",
          gate: "DELEGATED_FOR_IMPLEMENTATION",
          status: "ACCEPTED",
        },
      ],
      runProgress: [
        {
          runId: "22222222-2222-4222-8222-222222222222",
          taskId: "11111111-1111-4111-8111-111111111111",
          state: "RUNNING",
          completedGates: 2,
          totalGates: 6,
        },
      ],
    }),
    roster: rosterFixture(),
  }),

  // Everything that should demand the operator's attention at once.
  attention: () => ({
    dashboard: dashboardFixture({
      systemStatus: {
        controlPlane: "HEALTHY",
        emergencyStop: false,
        pendingReconciliation: 2,
      },
      agentStatuses: [
        { agentId: "chief_of_staff", status: "IDLE" },
        {
          agentId: "engineering",
          status: "WAITING",
          activeTaskId: "11111111-1111-4111-8111-111111111111",
          currentRunId: "22222222-2222-4222-8222-222222222222",
        },
        { agentId: "reviewer", status: "BLOCKED" },
      ],
      taskStatuses: [
        {
          taskId: "11111111-1111-4111-8111-111111111111",
          status: "BLOCKED",
          priority: "P1",
          blockingReason:
            "Reviewer returned BLOCK: validation evidence missing.",
          updatedAt: "2026-08-18T08:40:00.000Z",
        },
        {
          taskId: "33333333-3333-4333-8333-333333333333",
          status: "WAITING_APPROVAL",
          priority: "P0",
          updatedAt: "2026-08-18T08:45:00.000Z",
        },
      ],
      approvalAttentionQueue: [
        {
          approvalId: "44444444-4444-4444-8444-444444444444",
          intentId: "55555555-5555-4555-8555-555555555555",
          capabilityKey: "git.push_feature_branch",
          riskLevel: "L3",
          targetSummary:
            "Push a feature branch to the bound remote → repository:gate-g",
          expiresAt: "2026-08-18T11:00:00.000Z",
        },
      ],
      activeHandoffs: [
        {
          fromAgentId: "chief_of_staff",
          toAgentId: "engineering",
          taskId: "11111111-1111-4111-8111-111111111111",
          gate: "DELEGATED_FOR_IMPLEMENTATION",
          status: "ACCEPTED",
        },
        {
          fromAgentId: "engineering",
          toAgentId: "reviewer",
          taskId: "11111111-1111-4111-8111-111111111111",
          gate: "REQUESTED_REVIEW",
          status: "PENDING",
        },
      ],
      adapterHealth: [
        {
          adapterId: "local-git",
          kind: "git",
          status: "AVAILABLE",
          capabilityCount: 7,
        },
        {
          adapterId: "project-local",
          kind: "project",
          status: "UNAVAILABLE",
          capabilityCount: 3,
        },
      ],
      auditSummary: {
        chainStatus: "STALE",
        lastSequence: 214,
        lastCheckedAt: "2026-08-18T07:10:00.000Z",
        verifiedThroughSequence: 88,
      },
    }),
    roster: rosterFixture(),
  }),

  // Audit chain actually broken — the highest-precedence core state.
  security: () => ({
    dashboard: dashboardFixture({
      auditSummary: {
        chainStatus: "BROKEN",
        lastSequence: 214,
        lastCheckedAt: "2026-08-18T07:10:00.000Z",
        verifiedThroughSequence: 214,
        reason: "sequence gap at 91",
      },
    }),
    roster: rosterFixture(),
  }),
};

// Constellation size scenarios: 1, 3, 6, 10, 24, plus a long-name stress case.
for (const count of [1, 3, 6, 10, 24]) {
  SCENARIOS[`agents${count}`] = () => {
    const { roster, statuses } = sizedRoster(count);
    return {
      dashboard: dashboardFixture({
        agentStatuses: statuses,
        taskStatuses: [],
      }),
      roster,
    };
  };
}
SCENARIOS.longnames = () => {
  const { roster, statuses } = sizedRoster(6, { longNames: true });
  return {
    dashboard: dashboardFixture({ agentStatuses: statuses, taskStatuses: [] }),
    roster,
  };
};

const active = (SCENARIOS[scenario] || SCENARIOS.healthy)();

/** Fixture drilldown responses, shaped exactly like the Gate G projections. */
const RUN_DETAIL = {
  run: {
    runId: "22222222-2222-4222-8222-222222222222",
    agentId: "engineering",
    agentName: "Engineering",
    runKind: "IMPLEMENTATION",
    status: "WAITING_APPROVAL",
    failureKind: null,
    blockingReason: null,
    modelRef: "deterministic-test-model",
    tokenUsage: null,
    estimatedCostMicros: null,
    startedAt: "2026-08-18T08:30:00.000Z",
    completedAt: null,
    createdAt: "2026-08-18T08:29:00.000Z",
    updatedAt: "2026-08-18T08:45:00.000Z",
  },
  task: {
    taskId: "11111111-1111-4111-8111-111111111111",
    title: "Fix the calculator so the registered validation command passes",
    status: "BLOCKED",
    project: { projectId: "p-1", key: "gate_g", name: "Gate G Project" },
  },
  intents: [
    {
      intentId: "55555555-5555-4555-8555-555555555555",
      capabilityKey: "git.push_feature_branch",
      capabilityDescription: "Push a feature branch to the bound remote.",
      resourceType: "repository",
      resourceId: "gate-g",
      status: "WAITING_APPROVAL",
      createdAt: "2026-08-18T08:44:00.000Z",
      policyDecisions: [
        {
          decisionId: "d-1",
          outcome: "REQUIRE_APPROVAL",
          riskLevel: "L3",
          reasonCode: "EXTERNAL_MUTATION_REQUIRES_APPROVAL",
          explanation:
            "Pushing to a remote is an external mutation. L3 actions require an explicit single-use approval from Yusuf.",
          decidedAt: "2026-08-18T08:44:01.000Z",
        },
      ],
      approval: {
        approvalId: "44444444-4444-4444-8444-444444444444",
        status: "PENDING",
        riskLevel: "L3",
        requestedAt: "2026-08-18T08:44:02.000Z",
        decidedAt: null,
        expiresAt: "2026-08-18T11:00:00.000Z",
        consumedAt: null,
        invalidationReason: null,
      },
      receipt: null,
    },
  ],
  evidence: [
    {
      evidenceId: "e-1",
      kind: "IMPLEMENTATION",
      status: "RECORDED",
      summary: "Rewrote add() to return a + b.",
      createdAt: "2026-08-18T08:35:00.000Z",
    },
  ],
  reviewVerdict: null,
  handoffs: [
    {
      handoffId: "h-1",
      direction: "INCOMING",
      counterpartAgentId: "chief_of_staff",
      status: "ACCEPTED",
      gate: "DELEGATED_FOR_IMPLEMENTATION",
      createdAt: "2026-08-18T08:29:00.000Z",
    },
  ],
};

const APPROVAL_REVIEW = {
  approval: {
    approvalId: "44444444-4444-4444-8444-444444444444",
    status: "PENDING",
    riskLevel: "L3",
    requestedAt: "2026-08-18T08:44:02.000Z",
    expiresAt: "2026-08-18T11:00:00.000Z",
    decidedAt: null,
    consumedAt: null,
    invalidatedAt: null,
    invalidationReason: null,
    decisionNote: null,
    singleUse: true,
  },
  requestedBy: {
    principalType: "AGENT",
    agentId: "engineering",
    agentName: "Engineering",
  },
  context: {
    taskId: "11111111-1111-4111-8111-111111111111",
    taskTitle: "Fix the calculator so the registered validation command passes",
    taskStatus: "BLOCKED",
    runId: "22222222-2222-4222-8222-222222222222",
    runKind: "IMPLEMENTATION",
    project: { projectId: "p-1", key: "gate_g", name: "Gate G Project" },
    latestReviewVerdict: "BLOCK",
    latestReviewAt: "2026-08-18T08:40:00.000Z",
  },
  capability: {
    key: "git.push_feature_branch",
    version: 1,
    description: "Push a feature branch to the bound remote.",
    domain: "git",
    mutation: true,
  },
  target: {
    resourceType: "repository",
    resourceId: "gate-g",
    resourceVersion: "abc123",
    environment: "local",
    targetIdentityDigest: "9f2b7c1e4a6d8f03" + "0".repeat(48),
    accountIdentityDigest: null,
  },
  policy: {
    outcome: "REQUIRE_APPROVAL",
    riskLevel: "L3",
    reasonCode: "EXTERNAL_MUTATION_REQUIRES_APPROVAL",
    explanation:
      "Pushing to a remote is an external mutation. L3 actions require an explicit single-use approval from Yusuf.",
    matchedRules: ["capability.default_risk.L3"],
    decidedAt: "2026-08-18T08:44:01.000Z",
  },
  execution: {
    intentStatus: "WAITING_APPROVAL",
    receiptOutcome: null,
    verificationStatus: null,
  },
  decision: {
    approvalRouteId: 1,
    expectedPayloadHash: "a".repeat(64),
    expectedIntentVersion: 1,
    expectedApprovalVersion: 1,
    decidable: true,
  },
};

// Deliberately covers every lifecycle state so they can be compared visually.
const APPROVAL_LIST = {
  approvals: [
    ["44444444-4444-4444-8444-444444444444", "PENDING", "L3"],
    ["44444444-4444-4444-8444-444444444445", "APPROVED", "L3"],
    ["44444444-4444-4444-8444-444444444446", "CONSUMED", "L3"],
    ["44444444-4444-4444-8444-444444444447", "REJECTED", "L4"],
    ["44444444-4444-4444-8444-444444444448", "EXPIRED", "L3"],
    ["44444444-4444-4444-8444-444444444449", "INVALIDATED", "L4"],
  ].map(([uuid, status, requiredRiskLevel]) => ({
    uuid,
    status,
    requiredRiskLevel,
    requestedAt: "2026-08-18T08:44:02.000Z",
  })),
  page: {},
};

/**
 * Intercept the network *before* the provider module is imported, so the real
 * snapshot-first flow runs unchanged against fixture responses. Nothing about
 * the provider, the model, or any component is stubbed.
 */
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(typeof input === "string" ? input : input?.url || "");
  const json = (body) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  if (url.includes("/yusuf-os-ui/session"))
    return json({
      unlocked: true,
      configured: true,
      // Not a credential: a harness placeholder for a value the real server
      // generates. The harness never talks to the real control plane.
      csrfToken: "harness-not-a-real-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
  if (url.includes("/yusuf-os-ui/dashboard")) return json(active.dashboard);
  if (url.includes("/yusuf-os-ui/agents/roster")) return json(active.roster);
  if (url.includes("/runs/") && url.includes("/detail"))
    return json(RUN_DETAIL);
  if (url.includes("/approvals/") && url.includes("/review"))
    return json(APPROVAL_REVIEW);
  if (url.includes("/yusuf-os-ui/approvals")) return json(APPROVAL_LIST);
  if (url.includes("/yusuf-os-ui/")) return json({});
  return realFetch(input, init);
};

// The harness does not exercise SSE; that path is covered by the reducer suite.
class InertEventSource {
  constructor() {
    this.readyState = 0;
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}
window.EventSource = InertEventSource;

registerYusufOSTranslations();
i18n.changeLanguage(language);

function Banner() {
  return (
    <div
      id="harness-banner"
      style={{
        position: "fixed",
        insetInlineStart: 0,
        insetBlockEnd: 0,
        zIndex: 9999,
        padding: "4px 10px",
        font: "600 11px/1.4 ui-monospace, monospace",
        letterSpacing: "0.08em",
        background: "#4a1d1d",
        color: "#ffd9d4",
        borderTop: "1px solid #7a3030",
        borderInlineEnd: "1px solid #7a3030",
      }}
    >
      FIXTURE HARNESS — NOT REAL SYSTEM STATE · scenario={scenario} · lang=
      {language}
    </div>
  );
}

/*
 * Imported after the fetch/EventSource interception above is installed, so the
 * real provider performs its real snapshot-first load against fixtures.
 */
async function boot() {
  const [
    { YusufOSProvider },
    { default: OSShell },
    { default: CommandCenter },
    { default: Approvals },
    { default: ApprovalReview },
    { default: System },
    { default: Agents },
  ] = await Promise.all([
    import("../state/YusufOSProvider"),
    import("../components/OSShell"),
    import("@/pages/YusufOS/CommandCenter"),
    import("@/pages/YusufOS/Approvals"),
    import("@/pages/YusufOS/ApprovalReview"),
    import("@/pages/YusufOS/System"),
    import("@/pages/YusufOS/Agents"),
  ]);

  ReactDOM.createRoot(document.getElementById("harness-root")).render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[params.get("route") || "/os"]}>
        <YusufOSProvider>
          <Routes>
            <Route path="/os" element={<OSShell />}>
              <Route index element={<CommandCenter />} />
              <Route path="agents" element={<Agents />} />
              <Route path="approvals" element={<Approvals />} />
              <Route
                path="approvals/:approvalId"
                element={<ApprovalReview />}
              />
              <Route path="system" element={<System />} />
            </Route>
          </Routes>
        </YusufOSProvider>
        <Banner />
      </MemoryRouter>
    </I18nextProvider>
  );
}

boot();
