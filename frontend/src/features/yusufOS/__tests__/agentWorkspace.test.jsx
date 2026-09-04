import React from "react";
import { describe, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithI18n } from "./renderWithI18n";
import {
  dashboardFixture,
  rosterFixture,
  runDetailFixture,
  taskDetailFixture,
} from "./fixtures";
import {
  buildAgents,
  buildEdges,
} from "@/features/yusufOS/state/commandCenterModel";

const context = vi.hoisted(() => ({ value: null }));
vi.mock("@/features/yusufOS/state/YusufOSProvider", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useYusufOS: () => context.value };
});

const api = vi.hoisted(() => ({
  runDetail: vi.fn(),
  taskDetail: vi.fn(),
  // The Workspace's bottom dock is a real <VoiceConsole variant="dock" />,
  // which calls these on its own regardless of what a given test exercises.
  voiceStatus: vi.fn().mockResolvedValue(null),
  runVoiceCommand: vi.fn(),
  transcribeVoice: vi.fn(),
  speakVoiceResponse: vi.fn(),
}));
vi.mock("@/features/yusufOS/api/client", () => ({ yusufApi: api }));

import Agents from "@/pages/YusufOS/Agents";

function fixtureContext(overrides = {}) {
  const dashboard = dashboardFixture();
  const roster = rosterFixture();
  const agents = buildAgents(dashboard, roster);
  const edges = buildEdges(dashboard, agents);
  return {
    phase: "READY",
    dashboard,
    model: { agents, edges },
    runtime: null,
    realtime: { lastAppliedSequence: 0 },
    ...overrides,
  };
}

describe("Agent Workspace", () => {
  test("prompts for a selection before any Agent is chosen", () => {
    context.value = fixtureContext();
    renderWithI18n(<Agents />);
    expect(
      screen.getByText("Select an Agent to open its workspace.")
    ).toBeInTheDocument();
    expect(api.runDetail).not.toHaveBeenCalled();
  });

  test("an Agent with no current run says so, without fetching a run", async () => {
    context.value = fixtureContext();
    const user = userEvent.setup();
    renderWithI18n(<Agents />, { route: "/os/agents" });

    await user.click(screen.getByText("Chief of Staff"));
    // Both the console (no run) and the default Agent tab (no current run)
    // honestly report the same real absence — asserting "at least one" avoids
    // coupling this test to which panel happens to render it first.
    expect(
      (await screen.findAllByText("Not currently assigned to a run.")).length
    ).toBeGreaterThan(0);
    expect(api.runDetail).not.toHaveBeenCalled();
  });

  test("a running Agent's console shows the real run status and a live capability request", async () => {
    context.value = fixtureContext();
    api.runDetail.mockResolvedValue(
      runDetailFixture({
        intents: [
          {
            intentId: "intent-1",
            capabilityKey: "project.write_file",
            capabilityDescription:
              "Write a file inside the governed workspace.",
            resourceType: "FILE",
            resourceId: "src/index.js",
            status: "EXECUTING",
            createdAt: "2026-08-18T09:00:00.000Z",
            policyDecisions: [
              {
                decisionId: "dec-1",
                outcome: "ALLOW",
                riskLevel: "L2",
                reasonCode: "GRANTED_CAPABILITY",
                explanation: "Engineering holds this capability.",
                decidedAt: "2026-08-18T09:00:00.000Z",
              },
            ],
            approval: null,
            receipt: null,
          },
        ],
      })
    );
    api.taskDetail.mockResolvedValue(taskDetailFixture());

    const user = userEvent.setup();
    renderWithI18n(<Agents />, { route: "/os/agents" });
    await user.click(screen.getByText("Engineering"));

    expect(await screen.findByText("Using a tool")).toBeInTheDocument();
    // Renders in both the console's intent card and the default Agent tab's
    // capability list — asserting "at least one" avoids coupling to which
    // panel happens to render it first.
    expect(screen.getAllByText("project.write_file").length).toBeGreaterThan(0);
    expect(api.runDetail).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ signal: expect.anything() })
    );

    // The Task tab is real data too, fetched from the same governed
    // projection the standalone Task Detail page uses.
    await user.click(screen.getByRole("tab", { name: "Task" }));
    expect(
      await screen.findByText("Ship the feature end to end.")
    ).toBeInTheDocument();
    expect(screen.getByText("0 of 2 gates satisfied")).toBeInTheDocument();
  });

  test("a malformed run response renders as an error, not a crash", async () => {
    context.value = fixtureContext();
    api.runDetail.mockResolvedValue({});
    api.taskDetail.mockResolvedValue(taskDetailFixture());

    const user = userEvent.setup();
    renderWithI18n(<Agents />, { route: "/os/agents" });
    await user.click(screen.getByText("Engineering"));

    // The console and the default Agent tab both fetch the same run
    // independently, so a malformed response surfaces as an alert in both.
    await waitFor(() =>
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0)
    );
  });
});
