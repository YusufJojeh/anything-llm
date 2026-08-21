import React from "react";
import { describe, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithI18n } from "./renderWithI18n";

const runtimeState = vi.hoisted(() => ({ value: null }));
vi.mock("@/features/yusufOS/state/YusufOSProvider", () => ({
  useYusufOS: () => runtimeState.value,
}));

import Runtime from "@/pages/YusufOS/Runtime";

function fixture() {
  return {
    runtime: {
      asOf: "2026-08-21T12:00:00.000Z",
      modelRuntime: {
        ollama: {
          reachable: true,
          status: "HEALTHY",
          endpoint: "http://localhost:11434/",
          models: [],
          gemmaFamily: { present: false, matches: [] },
        },
        openai: { configured: false },
        agentModelPolicies: [],
        recentCompletions: [
          {
            runId: "run-1",
            agentId: "engineering",
            provider: "OLLAMA-نموذج",
            model: "gemma3:4b",
            routingPolicy: "LOCAL_ONLY",
            fallbackOccurred: false,
            latencyMs: 10,
            usage: { confidence: "KNOWN", totalTokens: 4 },
            costConfidence: "UNAVAILABLE",
            estimatedCostMicros: null,
            updatedAt: "2026-08-21T12:00:00.000Z",
          },
        ],
      },
      departments: [],
      monitoring: { available: true, checks: [] },
      knowledgeEvidenceMemory: {
        knowledge: { total: 1, bySourceType: { AGENT_DERIVED: 1 } },
        memory: { total: 1, byScope: { AGENT: 1 } },
        evidence: { byClass: {}, tombstoned: 0 },
      },
    },
    runtimePhase: "READY",
    runtimeError: null,
    refreshRuntime: vi.fn(),
  };
}

describe("Runtime surface", () => {
  test("renders observation time, safe counts, and bidi-isolated model identity", () => {
    runtimeState.value = fixture();
    renderWithI18n(<Runtime />);
    expect(screen.getByText("Runtime observed at")).toBeInTheDocument();
    const identity = screen.getByText("OLLAMA-نموذج / gemma3:4b");
    expect(identity).toHaveAttribute("dir", "auto");
    expect(screen.getByText(/AGENT_DERIVED/)).toBeInTheDocument();
    expect(
      screen.queryByText("private memory sentinel")
    ).not.toBeInTheDocument();
  });

  test("distinguishes loading from runtime failure", () => {
    runtimeState.value = {
      runtime: null,
      runtimePhase: "LOADING",
      runtimeError: null,
      refreshRuntime: vi.fn(),
    };
    const view = renderWithI18n(<Runtime />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    view.unmount();

    runtimeState.value = {
      runtime: null,
      runtimePhase: "ERROR",
      runtimeError: { message: "runtime unavailable", code: "UNAVAILABLE" },
      refreshRuntime: vi.fn(),
    };
    renderWithI18n(<Runtime />);
    expect(screen.getByRole("alert")).toHaveTextContent("runtime unavailable");
  });
});
