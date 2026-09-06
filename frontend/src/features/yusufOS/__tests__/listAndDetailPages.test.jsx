import React from "react";
import { describe, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithI18n } from "./renderWithI18n";
import { runDetailFixture, taskDetailFixture } from "./fixtures";

/**
 * Direct render coverage for the list/detail route pages. Before this file,
 * Tasks/Runs/Projects/TaskDetail/RunDetail were exercised only indirectly
 * (through the primitives they compose, or through the Agent Workspace's own
 * use of taskDetail/runDetail) — never through their own LOADING/EMPTY/
 * POPULATED/ERROR wiring. This closes that gap.
 */

const context = vi.hoisted(() => ({ value: null }));
vi.mock("@/features/yusufOS/state/YusufOSProvider", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useYusufOS: () => context.value };
});

const api = vi.hoisted(() => ({
  tasks: vi.fn(),
  taskDetail: vi.fn(),
  runs: vi.fn(),
  runDetail: vi.fn(),
  projects: vi.fn(),
}));
vi.mock("@/features/yusufOS/api/client", () => ({ yusufApi: api }));

import Tasks from "@/pages/YusufOS/Tasks";
import TaskDetail from "@/pages/YusufOS/TaskDetail";
import Runs from "@/pages/YusufOS/Runs";
import RunDetail from "@/pages/YusufOS/RunDetail";
import Projects from "@/pages/YusufOS/Projects";

function baseContext() {
  return { realtime: { lastAppliedSequence: 0 } };
}

describe("Tasks list", () => {
  test("loading is distinguishable from a real result", () => {
    context.value = baseContext();
    api.tasks.mockReturnValue(new Promise(() => {}));
    renderWithI18n(<Tasks />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  test("a proven-empty task list states it plainly, not silently", async () => {
    context.value = baseContext();
    api.tasks.mockResolvedValue({ tasks: [] });
    renderWithI18n(<Tasks />);
    expect(await screen.findByText("No tasks yet.")).toBeInTheDocument();
  });

  test("a real task links to its own detail route and hides an absent block reason", async () => {
    context.value = baseContext();
    api.tasks.mockResolvedValue({
      tasks: [
        {
          uuid: "task-uuid-1",
          title: "Ship the feature",
          status: "RUNNING",
          priority: "P1",
          updatedAt: "2026-09-06T00:00:00.000Z",
          blockedReason: null,
        },
      ],
    });
    renderWithI18n(<Tasks />);
    const link = await screen.findByRole("link", { name: /Ship the feature/ });
    expect(link).toHaveAttribute("href", "/os/tasks/task-uuid-1");
    expect(screen.getByText("P1")).toBeInTheDocument();
    // No stray empty paragraph for a null blockedReason.
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  test("a blocked task's real reason is shown, not swallowed", async () => {
    context.value = baseContext();
    api.tasks.mockResolvedValue({
      tasks: [
        {
          uuid: "task-uuid-2",
          title: "Fix the migration",
          status: "BLOCKED",
          priority: "P0",
          updatedAt: "2026-09-06T00:00:00.000Z",
          blockedReason: "Waiting on reviewer verdict.",
        },
      ],
    });
    renderWithI18n(<Tasks />);
    expect(
      await screen.findByText("Waiting on reviewer verdict.")
    ).toBeInTheDocument();
  });

  test("a load failure renders as an error, not an empty list", async () => {
    context.value = baseContext();
    api.tasks.mockRejectedValue(new Error("network down"));
    renderWithI18n(<Tasks />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
  });
});

describe("Runs list", () => {
  test("a real run links to its own detail route and shows its failure kind honestly", async () => {
    context.value = baseContext();
    api.runs.mockResolvedValue({
      runs: [
        {
          uuid: "run-uuid-1",
          runKind: "IMPLEMENTATION",
          status: "FAILED",
          failureKind: "FAILED_UNKNOWN",
          createdAt: "2026-09-06T00:00:00.000Z",
        },
      ],
    });
    renderWithI18n(<Runs />);
    const link = await screen.findByRole("link", { name: /IMPLEMENTATION/ });
    expect(link).toHaveAttribute("href", "/os/runs/run-uuid-1");
    expect(screen.getByText("FAILED_UNKNOWN")).toBeInTheDocument();
  });

  test("an empty run list states it plainly", async () => {
    context.value = baseContext();
    api.runs.mockResolvedValue({ runs: [] });
    renderWithI18n(<Runs />);
    expect(await screen.findByText("No runs yet.")).toBeInTheDocument();
  });
});

describe("Projects list", () => {
  test("a real project shows its key and name without padding", async () => {
    context.value = baseContext();
    api.projects.mockResolvedValue({
      projects: [
        {
          uuid: "project-uuid-1",
          key: "gate_g",
          name: "Gate G Project",
          updatedAt: "2026-09-06T00:00:00.000Z",
        },
      ],
    });
    renderWithI18n(<Projects />);
    expect(await screen.findByText("Gate G Project")).toBeInTheDocument();
    expect(screen.getByText("gate_g")).toBeInTheDocument();
  });

  test("an empty project list states it plainly", async () => {
    context.value = baseContext();
    api.projects.mockResolvedValue({ projects: [] });
    renderWithI18n(<Projects />);
    expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
  });
});

describe("Task detail", () => {
  test("renders the real title/objective bidi-isolated and an honest no-project state", async () => {
    context.value = baseContext();
    api.taskDetail.mockResolvedValue(taskDetailFixture());
    renderWithI18n(<TaskDetail />, { route: "/os/tasks/task-1" });
    const title = await screen.findByText("Implement the thing");
    expect(title).toHaveAttribute("dir", "auto");
    expect(screen.getByText("No project")).toBeInTheDocument();
  });

  test("an incomplete task shows its real blockers, translated, not a false-complete state", async () => {
    context.value = baseContext();
    api.taskDetail.mockResolvedValue(
      taskDetailFixture({
        completion: {
          complete: false,
          gates: { satisfied: 1, total: 2 },
          blockers: ["NO_IMPLEMENTATION_EVIDENCE"],
        },
      })
    );
    renderWithI18n(<TaskDetail />, { route: "/os/tasks/task-1" });
    expect(
      await screen.findByText("No implementation evidence")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("All completion gates satisfied.")
    ).not.toBeInTheDocument();
  });

  test("a load failure renders as an error", async () => {
    context.value = baseContext();
    api.taskDetail.mockRejectedValue(new Error("not found"));
    renderWithI18n(<TaskDetail />, { route: "/os/tasks/task-1" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("Run detail", () => {
  test("an unknown agent identity says so instead of rendering nothing", async () => {
    context.value = baseContext();
    api.runDetail.mockResolvedValue(
      runDetailFixture({ run: { ...runDetailFixture().run, agentId: null } })
    );
    renderWithI18n(<RunDetail />, { route: "/os/runs/run-1" });
    expect(await screen.findByText("Unknown")).toBeInTheDocument();
  });

  test("an unpriced run states cost is unavailable rather than showing $0.00", async () => {
    context.value = baseContext();
    api.runDetail.mockResolvedValue(runDetailFixture());
    renderWithI18n(<RunDetail />, { route: "/os/runs/run-1" });
    await screen.findByText("Implement the thing");
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.getByText("No cost recorded")).toBeInTheDocument();
  });

  test("a load failure renders as an error", async () => {
    context.value = baseContext();
    api.runDetail.mockRejectedValue(new Error("not found"));
    renderWithI18n(<RunDetail />, { route: "/os/runs/run-1" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
