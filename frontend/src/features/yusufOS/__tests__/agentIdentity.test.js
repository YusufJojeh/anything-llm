import { describe, expect, test } from "vitest";
import { roleFor, ROLE_KEYS } from "../state/agentRoles";
import { i18n } from "./renderWithI18n";
import { edgeKind, buildEdges, buildAgents } from "../state/commandCenterModel";
import { dashboardFixture, rosterFixture } from "./fixtures";

describe("agent role identity", () => {
  test("the registered core staff each have their own glyph", () => {
    const glyphs = ["chief_of_staff", "engineering", "reviewer"].map(
      (key) => roleFor(key).glyph
    );
    expect(new Set(glyphs).size).toBe(3);
    expect(roleFor("engineering").known).toBe(true);
  });

  test("an unregistered agent still gets a stable identity", () => {
    const first = roleFor("data_science");
    const second = roleFor("data_science");
    expect(first.glyph).toBe(second.glyph);
    expect(first.known).toBe(false);
    expect(first.glyph).toBe("DS");
  });

  test("a single-word key falls back to its first two letters", () => {
    expect(roleFor("logistics").glyph).toBe("LO");
  });

  test("an empty or malformed key never throws", () => {
    expect(roleFor(undefined).glyph).toBe("??");
    expect(roleFor("").glyph).toBe("??");
    expect(roleFor("___").glyph).toBe("??");
  });

  test("role identity carries no colour — colour is reserved for status", () => {
    // Gate G.1 §24: a per-agent colour would turn the palette into a rainbow
    // and would compete with the status vocabulary.
    for (const key of ROLE_KEYS) {
      const role = roleFor(key);
      expect(role).not.toHaveProperty("color");
      expect(JSON.stringify(role)).not.toMatch(/#[0-9a-f]{3,6}/i);
    }
  });
});

describe("relationship semantics", () => {
  test("classifies edges from the persisted handoff reason", () => {
    expect(edgeKind("DELEGATED_FOR_IMPLEMENTATION")).toBe("DELEGATION");
    expect(edgeKind("REQUESTED_REVIEW")).toBe("REVIEW");
    expect(edgeKind("ESCALATED_TO_YUSUF")).toBe("ESCALATION");
    expect(edgeKind("DEPENDENCY_WAIT")).toBe("DEPENDENCY");
  });

  test("an unrecognised reason stays a plain handoff rather than being guessed", () => {
    expect(edgeKind("SOMETHING_NEW")).toBe("HANDOFF");
    expect(edgeKind(null)).toBe("HANDOFF");
    expect(edgeKind("")).toBe("HANDOFF");
  });

  test("the kind travels with the edge the constellation draws", () => {
    const dashboard = dashboardFixture({
      activeHandoffs: [
        {
          fromAgentId: "engineering",
          toAgentId: "reviewer",
          taskId: "task-1",
          gate: "REQUESTED_REVIEW",
          status: "PENDING",
        },
      ],
    });
    const agents = buildAgents(dashboard, rosterFixture());
    const [edge] = buildEdges(dashboard, agents);
    expect(edge.kind).toBe("REVIEW");
    // Still not active: PENDING is not a live handoff, so it must not animate.
    expect(edge.active).toBe(false);
  });
});

describe("the system core is not an Agent", () => {
  /*
   * `chief_of_staff` is a real, independent AgentDefinition with its own node,
   * role glyph and server-owned status. The centre of the constellation names
   * the *system*. If the core ever borrows an Agent's name again, the operator
   * cannot tell whether the centre is a machine or a member of staff.
   */
  test.each([
    ["en", "System Core", "Chief of Staff"],
    ["ar", "نواة النظام", "رئيس الأركان"],
  ])(
    "the core identifies as the system, not the Chief of Staff (%s)",
    (lng, expected, agentName) => {
      const core = i18n.t("yusufOS:brand.core", { lng });
      expect(core).toBe(expected);
      expect(core).not.toBe(agentName);
    }
  );

  test("the Chief of Staff survives as a separate Agent identity", () => {
    const chief = roleFor("chief_of_staff");
    expect(chief.known).toBe(true);
    expect(chief.glyph).toBe("CS");
  });

  test("no Agent role borrows the core's identity", () => {
    for (const lng of ["en", "ar"]) {
      const core = i18n.t("yusufOS:brand.core", { lng });
      for (const key of ROLE_KEYS) {
        // A role must never resolve to the same label the core uses.
        expect(
          i18n.t(`yusufOS:status.agent.${key}`, { lng, defaultValue: key })
        ).not.toBe(core);
      }
    }
  });

  test("the core label and the core drawer title name the same thing", () => {
    // Both surfaces describe the system core; they must not drift apart into
    // two different names for one object.
    for (const lng of ["en", "ar"]) {
      const core = i18n.t("yusufOS:brand.core", { lng }).toLowerCase();
      const title = i18n.t("yusufOS:core.title", { lng }).toLowerCase();
      expect(title).toBe(core);
    }
  });
});
