import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderWithI18n, i18n } from "./renderWithI18n";
import { dashboardFixture, rosterFixture } from "./fixtures";
import { buildCommandCenter } from "../state/commandCenterModel";

const state = vi.hoisted(() => ({ value: null }));
const api = vi.hoisted(() => ({
  voiceStatus: vi.fn(),
  runVoiceCommand: vi.fn(),
  transcribeVoice: vi.fn(),
  speakVoiceResponse: vi.fn(),
  approvalReview: vi.fn(),
}));

vi.mock("@/features/yusufOS/state/YusufOSProvider", () => ({
  useYusufOS: () => state.value,
  PHASES: { LOADING: "LOADING", READY: "READY", ERROR: "ERROR" },
}));
vi.mock("@/features/yusufOS/api/client", () => ({ yusufApi: api }));

import CommandCenter from "@/pages/YusufOS/CommandCenter";

function providerState({
  dashboard = dashboardFixture(),
  runtime = null,
  runtimePhase = "LOADING",
  recent = [],
  connection = "LIVE",
} = {}) {
  const roster = rosterFixture();
  return {
    phase: dashboard ? "READY" : "LOADING",
    dashboard,
    roster,
    model: buildCommandCenter({ dashboard, roster }),
    connection,
    realtime: { recent, connection, lastEventAt: null },
    runtime,
    runtimePhase,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Jarvis Command Center", () => {
  beforeEach(() => {
    api.voiceStatus.mockResolvedValue({
      stt: { provider: "native", scope: "LOCAL", eligible: true },
      tts: { provider: null, eligible: false },
      browser: { allowSpeechServices: false },
    });
    api.approvalReview.mockResolvedValue({
      approval: { riskLevel: "L3", requestedAt: "2026-08-18T08:44:02.000Z" },
      requestedBy: { agentName: "Engineering" },
      capability: {
        key: "git.push_feature_branch",
        description: "Push a feature branch.",
      },
      target: { resourceType: "repository", resourceId: "gate-g" },
      context: { taskId: "11111111-aaaa", runId: "22222222-bbbb" },
    });
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();
  });
  afterEach(() => i18n.changeLanguage("en"));

  test("renders one integrated console with every area and real agents", async () => {
    state.value = providerState();
    renderWithI18n(<CommandCenter />);
    await flush();
    for (const name of [
      "Needs Yusuf",
      "Agents & workflows",
      "System Core",
      "Communication console",
    ])
      expect(screen.getAllByRole("heading", { name }).length).toBeGreaterThan(
        0
      );
    for (const id of ["chief_of_staff", "engineering", "reviewer"])
      expect(document.querySelector(`[data-agent-row="${id}"]`)).not.toBeNull();
    // No decorative agents beyond the roster.
    expect(document.querySelectorAll("[data-orbit-agent]")).toHaveLength(3);
    expect(document.querySelector(".yos-core").dataset.mode).toBe("WORKING");
  });

  test("falls back to the SVG nucleus when WebGL is unavailable (jsdom)", async () => {
    state.value = providerState();
    renderWithI18n(<CommandCenter />);
    await waitFor(() =>
      expect(document.querySelector("[data-renderer]").dataset.renderer).toBe(
        "svg"
      )
    );
    expect(document.querySelector("[data-renderer=svg] svg")).not.toBeNull();
  });

  test("unknown state renders as unknown, and runtime-backed values as loading", async () => {
    state.value = providerState({ dashboard: null });
    renderWithI18n(<CommandCenter />);
    await flush();
    expect(document.querySelector(".yos-core").dataset.mode).toBe("UNKNOWN");
    expect(document.querySelector("[data-core-state-label]")).toHaveTextContent(
      "Unknown"
    );
    expect(
      document.querySelectorAll('[data-na="LOADING"]').length
    ).toBeGreaterThan(0);
  });

  test("approval state renders amber and edges come only from real handoffs", async () => {
    state.value = providerState({
      dashboard: dashboardFixture({
        approvalAttentionQueue: [
          {
            approvalId: "a1",
            capabilityKey: "git.push",
            riskLevel: "L3",
            targetSummary: "x",
          },
        ],
        activeHandoffs: [
          {
            fromAgentId: "chief_of_staff",
            toAgentId: "engineering",
            taskId: "t",
            gate: "DELEGATED_FOR_IMPLEMENTATION",
            status: "ACCEPTED",
          },
        ],
      }),
    });
    renderWithI18n(<CommandCenter />);
    await flush();
    const core = document.querySelector(".yos-core");
    expect(core.dataset.mode).toBe("WAITING_APPROVAL");
    expect(core.dataset.hue).toBe("amber");
    const edges = document.querySelectorAll("[data-edge]");
    expect(edges).toHaveLength(1);
    expect(edges[0].dataset.edgeActive).toBe("true");
  });

  test("composer: Shift+Enter is a newline, Enter sends once through the governed command path", async () => {
    let resolve;
    api.runVoiceCommand.mockImplementation(
      () => new Promise((r) => (resolve = r))
    );
    state.value = providerState();
    renderWithI18n(<CommandCenter />);
    await flush();
    const box = screen.getByRole("textbox", {
      name: "Type a command",
    });
    fireEvent.change(box, { target: { value: "line one" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(api.runVoiceCommand).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(api.runVoiceCommand).toHaveBeenCalledTimes(1);
    expect(api.runVoiceCommand).toHaveBeenCalledWith("line one");
    // While in flight the Core shows processing and the send button is disabled.
    await flush();
    expect(document.querySelector(".yos-core").dataset.mode).toBe("THINKING");
    expect(screen.getByRole("button", { name: "Send command" })).toBeDisabled();
    await act(async () =>
      resolve({
        taskId: "t-1",
        runId: "r-1",
        state: "APPROVAL_REQUIRED",
        response: "Needs you.",
        approvalId: "ap-1",
      })
    );
    await flush();
    const log = screen.getByRole("log");
    expect(within(log).getByText("line one")).toBeInTheDocument();
    expect(within(log).getByText("Needs you.")).toBeInTheDocument();
    const block = document.querySelector('[data-approval-block="ap-1"]');
    expect(block).not.toBeNull();
    // Approval is a link to the governed page — never an approve button here.
    expect(
      within(block).getByRole("link", { name: "View details" })
    ).toHaveAttribute("href", "/os/approvals/ap-1");
    expect(
      within(block).queryByRole("button", { name: /approve|reject/i })
    ).toBeNull();
    await waitFor(() =>
      expect(
        within(block).getByText("git.push_feature_branch")
      ).toBeInTheDocument()
    );
    // Amber comes only from the backend snapshot (still WORKING here), never
    // from the local command result, which goes stale once decided.
    expect(document.querySelector(".yos-core").dataset.mode).toBe("WORKING");
  });

  test("a failed command keeps the draft and shows the error in place", async () => {
    api.runVoiceCommand.mockRejectedValue(
      new Error("Chief of Staff unavailable")
    );
    state.value = providerState();
    renderWithI18n(<CommandCenter />);
    await flush();
    const box = screen.getByRole("textbox", {
      name: "Type a command",
    });
    fireEvent.change(box, { target: { value: "retry me" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await flush();
    await flush();
    expect(
      screen
        .getAllByRole("alert")
        .some((node) => node.textContent.includes("Chief of Staff unavailable"))
    ).toBe(true);
    expect(box).toHaveValue("retry me");
  });

  test("tabs without a backend path say so instead of faking content", async () => {
    state.value = providerState();
    renderWithI18n(<CommandCenter />);
    await flush();
    const plans = screen.getByRole("tab", { name: "Plans" });
    expect(plans).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(plans);
    expect(
      document.querySelector('[data-unavailable-tab="PLANS"]')
    ).not.toBeNull();
    // Keyboard: arrow moves between tabs.
    fireEvent.keyDown(plans, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("host telemetry is never faked", async () => {
    state.value = providerState();
    renderWithI18n(<CommandCenter />);
    await flush();
    expect(document.body.textContent).not.toMatch(/CPU\s*\d/);
    expect(document.body.textContent).not.toMatch(/\d+(\.\d+)?%/);
  });

  test("recent events light up only the stages they justify", async () => {
    const now = new Date().toISOString();
    state.value = providerState({
      recent: [
        {
          id: "e1",
          type: "execution.verified",
          receivedAt: now,
          aggregateId: "run-1",
        },
      ],
    });
    renderWithI18n(<CommandCenter />);
    await flush();
    expect(
      document.querySelector('[data-stage="VERIFY"]').dataset.stageStatus
    ).toBe("ACTIVE");
    expect(
      document.querySelector('[data-stage="LEARN"]').dataset.stageStatus
    ).toBe("NOT_REPORTED");
  });

  test("renders fully in Arabic with RTL-safe technical values", async () => {
    state.value = providerState();
    renderWithI18n(<CommandCenter />, { language: "ar" });
    await flush();
    expect(
      screen.getAllByRole("heading", { name: "نواة النظام" }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: "وحدة الاتصال" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Communication console")).toBeNull();
    // Agent names are untrusted, bidi-isolated values.
    const name = document.querySelector(
      '[data-agent-row="engineering"] [dir="auto"]'
    );
    expect(name.style.unicodeBidi).toBe("isolate");
  });

  test("reduced motion turns ambient rotation and pulses off", async () => {
    const original = window.matchMedia;
    window.matchMedia = (query) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    state.value = providerState();
    renderWithI18n(<CommandCenter />);
    await flush();
    const core = document.querySelector(".yos-core");
    expect(core.dataset.spin).toBe("off");
    expect(core.dataset.pulse).toBe("none");
    window.matchMedia = original;
  });

  test("unmount cancels the Core's animation frame", async () => {
    state.value = providerState();
    const view = renderWithI18n(<CommandCenter />);
    await flush();
    view.unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});
