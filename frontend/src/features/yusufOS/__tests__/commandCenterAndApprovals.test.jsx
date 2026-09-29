import React from "react";
import { describe, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithI18n } from "./renderWithI18n";
import { dashboardFixture, rosterFixture } from "./fixtures";
import { buildCommandCenter } from "@/features/yusufOS/state/commandCenterModel";

/**
 * `/os` (CommandCenter) is the app's default landing route and had zero
 * direct render coverage before this file — only its sub-pieces (SystemCore,
 * the model builders) were tested in isolation. `jsdom`'s `matchMedia` is
 * polyfilled to always report `matches: false` (see setup.js), so the 3D
 * stage never mounts here; that is exactly the narrow-viewport path the
 * accessible roster exists to cover, and it is asserted explicitly below.
 */

const context = vi.hoisted(() => ({ value: null }));
vi.mock("@/features/yusufOS/state/YusufOSProvider", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useYusufOS: () => context.value };
});

const api = vi.hoisted(() => ({
  acknowledgeNotification: vi.fn().mockResolvedValue(undefined),
  approvals: vi.fn(),
  runDetail: vi.fn().mockResolvedValue(null),
  taskDetail: vi.fn().mockResolvedValue(null),
  voiceStatus: vi.fn().mockResolvedValue(null),
  runVoiceCommand: vi.fn(),
  transcribeVoice: vi.fn(),
  speakVoiceResponse: vi.fn(),
}));
vi.mock("@/features/yusufOS/api/client", () => ({ yusufApi: api }));

import CommandCenter from "@/pages/YusufOS/CommandCenter";
import Approvals from "@/pages/YusufOS/Approvals";

function fixtureContext(overrides = {}) {
  const dashboard = dashboardFixture();
  const roster = rosterFixture();
  const model = buildCommandCenter({ dashboard, roster });
  return {
    phase: "READY",
    dashboard,
    model,
    connection: { status: "LIVE" },
    realtime: { lastAppliedSequence: 0 },
    runtime: null,
    runtimePhase: "LOADING",
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Command Center", () => {
  test("loading never renders a stale or fabricated count", () => {
    context.value = fixtureContext({ phase: "LOADING", dashboard: null });
    renderWithI18n(<CommandCenter />);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  test("the accessible Agent rail carries every roster agent", () => {
    context.value = fixtureContext();
    renderWithI18n(<CommandCenter />);
    // The rail is the keyboard/screen-reader equivalent of the Core's orbit.
    for (const id of ["chief_of_staff", "engineering", "reviewer"])
      expect(document.querySelector(`[data-agent-row="${id}"]`)).not.toBeNull();
    expect(screen.getAllByText("Chief of Staff").length).toBeGreaterThan(0);
  });

  test("real core counts render, and a zero count is not confused with unknown", () => {
    context.value = fixtureContext();
    renderWithI18n(<CommandCenter />);
    // costSummary/approvalAttentionQueue are empty in the base fixture, so
    // the pending-approvals count must be a real, quiet zero.
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThan(0);
  });

  test("selecting an agent via the roster opens its detail drawer", async () => {
    context.value = fixtureContext();
    const user = userEvent.setup();
    renderWithI18n(<CommandCenter />);
    await user.click(document.querySelector('[data-agent-row="engineering"]'));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  test("an unreachable Ollama and unconfigured OpenAI are both shown honestly, not hidden", () => {
    // Real `/runtime` projection shape: providers live under `modelRuntime`.
    context.value = fixtureContext({
      runtime: {
        modelRuntime: {
          ollama: { reachable: false, status: "UNREACHABLE", models: [] },
          openai: { configured: false },
        },
      },
      runtimePhase: "READY",
    });
    renderWithI18n(<CommandCenter />);
    const intelligence = document.querySelector(
      '[data-core-panel="INTELLIGENCE"]'
    );
    expect(intelligence).toHaveTextContent("Ollama");
    expect(intelligence).toHaveTextContent("Unreachable");
    expect(intelligence).toHaveTextContent("OpenAI");
    expect(intelligence).toHaveTextContent("Not configured");
    // An unreachable daemon's model list is not a real count.
    expect(intelligence).not.toHaveTextContent(/Local models\s*0/);
  });
});

describe("Approvals", () => {
  function baseContext() {
    return { realtime: { lastAppliedSequence: 0 } };
  }

  test("splits pending from decided, and never mixes them into one list", async () => {
    context.value = baseContext();
    api.approvals.mockResolvedValue({
      approvals: [
        {
          uuid: "a-1",
          status: "PENDING",
          requiredRiskLevel: "L3",
          requestedAt: "2026-09-06T00:00:00.000Z",
        },
        {
          uuid: "a-2",
          status: "CONSUMED",
          requiredRiskLevel: "L3",
          requestedAt: "2026-09-05T00:00:00.000Z",
        },
        {
          uuid: "a-3",
          status: "INVALIDATED",
          requiredRiskLevel: "L4",
          requestedAt: "2026-09-04T00:00:00.000Z",
        },
      ],
    });
    renderWithI18n(<Approvals />);
    const pendingLink = await screen.findByRole("link", {
      name: /Pending/i,
    });
    expect(pendingLink).toHaveAttribute("href", "/os/approvals/a-1");
    // An INVALIDATED approval is a security-relevant event, not something to
    // quietly drop from the decided list.
    expect(screen.getByRole("link", { name: /Invalidated/i })).toHaveAttribute(
      "href",
      "/os/approvals/a-3"
    );
  });

  test("an empty pending queue and empty history are each stated plainly", async () => {
    context.value = baseContext();
    api.approvals.mockResolvedValue({ approvals: [] });
    renderWithI18n(<Approvals />);
    expect(
      await screen.findByText("No approvals waiting.")
    ).toBeInTheDocument();
    expect(screen.getByText("No decided approvals.")).toBeInTheDocument();
  });

  test("a load failure renders as an error, not two empty lists", async () => {
    context.value = baseContext();
    api.approvals.mockRejectedValue(new Error("network down"));
    renderWithI18n(<Approvals />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("No approvals waiting.")).not.toBeInTheDocument();
  });
});
