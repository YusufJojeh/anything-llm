import React from "react";
import { describe, expect, test, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithI18n, i18n } from "./renderWithI18n";
import AgentRoster from "../components/AgentRoster";
import AttentionQueue from "../components/AttentionQueue";
import Drawer from "../components/Drawer";
import { StatusChip } from "../components/primitives";
import {
  buildAgents,
  buildEdges,
  buildAttentionQueue,
} from "../state/commandCenterModel";
import { dashboardFixture, rosterFixture } from "./fixtures";

function modelWithHandoff() {
  const dashboard = dashboardFixture({
    activeHandoffs: [
      {
        fromAgentId: "chief_of_staff",
        toAgentId: "engineering",
        taskId: "task-1",
        gate: "DELEGATED_FOR_IMPLEMENTATION",
        status: "ACCEPTED",
      },
    ],
  });
  const agents = buildAgents(dashboard, rosterFixture());
  return { dashboard, agents, edges: buildEdges(dashboard, agents) };
}

describe("agent status rendering", () => {
  test("status is carried by text, not only by colour", () => {
    const { agents, edges } = modelWithHandoff();
    renderWithI18n(
      <AgentRoster agents={agents} edges={edges} onSelectAgent={() => {}} />
    );
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getAllByText("Idle").length).toBeGreaterThan(0);
  });

  test("relationships are readable without the graph", () => {
    const { agents, edges } = modelWithHandoff();
    renderWithI18n(
      <AgentRoster agents={agents} edges={edges} onSelectAgent={() => {}} />
    );
    expect(
      screen.getAllByText(/chief_of_staff → engineering/).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/DELEGATED_FOR_IMPLEMENTATION/).length
    ).toBeGreaterThan(0);
  });

  test("an agent with no relationships says so instead of showing nothing", () => {
    const dashboard = dashboardFixture();
    const agents = buildAgents(dashboard, rosterFixture());
    renderWithI18n(
      <AgentRoster agents={agents} edges={[]} onSelectAgent={() => {}} />
    );
    expect(screen.getAllByText("No active relationships.").length).toBe(
      agents.length
    );
  });

  test("a real zero capability count is shown as zero", () => {
    const dashboard = dashboardFixture();
    const agents = buildAgents(dashboard, rosterFixture());
    renderWithI18n(
      <AgentRoster agents={agents} edges={[]} onSelectAgent={() => {}} />
    );
    expect(screen.getByText("No capabilities granted")).toBeInTheDocument();
  });

  test("an empty roster renders an intentional empty state", () => {
    renderWithI18n(
      <AgentRoster agents={[]} edges={[]} onSelectAgent={() => {}} />
    );
    expect(
      screen.getByText("No agents are registered yet.")
    ).toBeInTheDocument();
  });

  test("agents are keyboard operable and expose selection state", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { agents, edges } = modelWithHandoff();
    renderWithI18n(
      <AgentRoster
        agents={agents}
        edges={edges}
        selectedAgentId="engineering"
        onSelectAgent={onSelect}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(agents.length);

    const selected = buttons.find(
      (button) => button.getAttribute("aria-pressed") === "true"
    );
    expect(selected).toBeDefined();
    expect(within(selected).getByText("Engineering")).toBeInTheDocument();

    await user.tab();
    expect(document.activeElement).toBe(buttons[0]);
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("chief_of_staff");
  });
});

describe("approval lifecycle rendering", () => {
  test.each([
    ["PENDING", "Pending"],
    ["APPROVED", "Approved — not yet executed"],
    ["CONSUMED", "Consumed"],
    ["REJECTED", "Rejected"],
    ["EXPIRED", "Expired"],
    ["INVALIDATED", "Invalidated"],
  ])("%s is labelled distinctly", (status, label) => {
    renderWithI18n(<StatusChip domain="approval" status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  test("an approved-but-unexecuted approval never reads as complete", () => {
    renderWithI18n(<StatusChip domain="approval" status="APPROVED" />);
    expect(screen.getByText(/not yet executed/)).toBeInTheDocument();
  });

  test("execution states keep FAILED_UNKNOWN distinct from FAILED", () => {
    const { unmount } = renderWithI18n(
      <StatusChip domain="execution" status="FAILED_UNKNOWN" />
    );
    expect(screen.getByText(/Outcome unknown/)).toBeInTheDocument();
    unmount();
    renderWithI18n(<StatusChip domain="execution" status="FAILED" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  test("a status the frontend does not know shows its raw value, not a guess", () => {
    renderWithI18n(<StatusChip domain="approval" status="SOMETHING_NEW" />);
    expect(screen.getByText("SOMETHING_NEW")).toBeInTheDocument();
  });
});

describe("loading, empty and error are distinguishable", () => {
  test("loading never renders a count", () => {
    renderWithI18n(<AttentionQueue items={null} loading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/needs you/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Nothing is waiting on you.")
    ).not.toBeInTheDocument();
  });

  test("an unknown queue is not rendered as an empty one", () => {
    renderWithI18n(<AttentionQueue items={null} loading={false} />);
    expect(
      screen.queryByText("Nothing is waiting on you.")
    ).not.toBeInTheDocument();
  });

  test("a proven-empty queue states it plainly", () => {
    renderWithI18n(<AttentionQueue items={[]} loading={false} />);
    expect(screen.getByText("Nothing is waiting on you.")).toBeInTheDocument();
  });

  test("real items link to the surface that resolves them", () => {
    const items = buildAttentionQueue(
      dashboardFixture({
        approvalAttentionQueue: [
          {
            approvalId: "apr-1",
            intentId: "int-1",
            capabilityKey: "git.push_feature_branch",
            riskLevel: "L3",
            targetSummary: "push feature/gate-g",
            expiresAt: "2026-08-18T10:00:00.000Z",
          },
        ],
      })
    );
    renderWithI18n(<AttentionQueue items={items} loading={false} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/os/approvals/apr-1");
    expect(
      screen.getByText(/L3 approval · git.push_feature_branch/)
    ).toBeInTheDocument();
    expect(screen.getByText("push feature/gate-g")).toBeInTheDocument();
  });
});

describe("dialog behaviour", () => {
  test("has dialog semantics, an accessible name, and traps focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithI18n(
      <Drawer open onClose={onClose} title="Engineering">
        <button type="button">first</button>
        <button type="button">second</button>
      </Drawer>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Engineering");

    // Opening the dialog moves focus into it, so reading starts at the title.
    await waitFor(() => expect(dialog).toHaveFocus());

    const first = screen.getByRole("button", { name: "first" });
    const second = screen.getByRole("button", { name: "second" });
    first.focus();
    await user.tab();
    expect(document.activeElement).toBe(second);
    // Tabbing off the last control wraps back inside rather than escaping.
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  test("focus lands in the dialog without waiting for an animation frame", () => {
    // A hidden or throttled tab never runs requestAnimationFrame. If focus
    // depended on it, the dialog would open with focus stranded outside.
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    try {
      renderWithI18n(
        <Drawer open onClose={() => {}} title="Engineering">
          <button type="button">first</button>
        </Drawer>
      );
      expect(screen.getByRole("dialog")).toHaveFocus();
    } finally {
      window.requestAnimationFrame = raf;
    }
  });

  test("Escape closes it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithI18n(
      <Drawer open onClose={onClose} title="Engineering">
        <button type="button">first</button>
      </Drawer>
    );
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    screen.getByRole("button", { name: "first" }).focus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  test("focus returns to the opener when it closes", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          <Drawer open={open} onClose={() => setOpen(false)} title="Panel">
            <button type="button">inside</button>
          </Drawer>
        </>
      );
    }
    const user = userEvent.setup();
    renderWithI18n(<Harness />);
    const opener = screen.getByRole("button", { name: "open" });
    await user.click(opener);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe("Arabic and RTL", () => {
  test("Yusuf OS strings resolve in Arabic, not English fallbacks", () => {
    const { agents, edges } = modelWithHandoff();
    renderWithI18n(
      <AgentRoster agents={agents} edges={edges} onSelectAgent={() => {}} />,
      { language: "ar" }
    );
    // "قيد التشغيل" = RUNNING.
    expect(screen.getByText("قيد التشغيل")).toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    i18n.changeLanguage("en");
  });

  test("untrusted values are bidi-isolated so mixed-direction text stays readable", () => {
    const { agents, edges } = modelWithHandoff();
    renderWithI18n(
      <AgentRoster agents={agents} edges={edges} onSelectAgent={() => {}} />,
      { language: "ar" }
    );
    const name = screen.getByText("Engineering");
    expect(name).toHaveAttribute("dir", "auto");
    expect(name.style.unicodeBidi).toBe("isolate");
    i18n.changeLanguage("en");
  });

  test("Arabic plural categories are supplied, so counts never fall back to English", () => {
    for (const count of [0, 1, 2, 3, 11, 100]) {
      const value = i18n.t("yusufOS:agent.capabilityCount", {
        count,
        lng: "ar",
      });
      expect(value).not.toMatch(/capabilit/i);
    }
  });
});
