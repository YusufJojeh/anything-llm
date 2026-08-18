import { describe, expect, test } from "vitest";
import {
  layoutConstellation,
  edgeGeometry,
  nodeIndex,
  VIEWBOX,
} from "../state/constellationLayout";

const roster = (count) =>
  Array.from({ length: count }, (_, index) => ({ agentId: `agent-${index}` }));

describe("constellation layout", () => {
  test("tolerates an empty roster", () => {
    const layout = layoutConstellation([]);
    expect(layout.nodes).toEqual([]);
    expect(layout.rings).toBe(0);
  });

  test.each([1, 3, 6, 10, 24])(
    "places every agent for a roster of %i",
    (count) => {
      const layout = layoutConstellation(roster(count));
      expect(layout.nodes).toHaveLength(count);
      for (const node of layout.nodes) {
        expect(node.x).toBeGreaterThan(0);
        expect(node.x).toBeLessThan(VIEWBOX);
        expect(node.y).toBeGreaterThan(0);
        expect(node.y).toBeLessThan(VIEWBOX);
      }
    }
  );

  test("is deterministic — the same roster always yields the same picture", () => {
    const first = layoutConstellation(roster(6));
    const second = layoutConstellation(roster(6));
    expect(second.nodes).toEqual(first.nodes);
  });

  test("wraps to a second ring rather than crushing a large roster", () => {
    expect(layoutConstellation(roster(6)).rings).toBe(1);
    expect(layoutConstellation(roster(14)).rings).toBe(2);
  });

  test("a single agent sits directly above the core", () => {
    const [node] = layoutConstellation(roster(1)).nodes;
    expect(node.x).toBeCloseTo(VIEWBOX / 2, 1);
    expect(node.y).toBeLessThan(VIEWBOX / 2);
  });

  test("edges are inset so they stop at the node ring", () => {
    const layout = layoutConstellation(roster(2));
    const index = nodeIndex(layout);
    const geometry = edgeGeometry(index.get("agent-0"), index.get("agent-1"), {
      fromInset: 34,
      toInset: 44,
    });
    expect(geometry).not.toBeNull();
    const full = Math.hypot(
      index.get("agent-1").x - index.get("agent-0").x,
      index.get("agent-1").y - index.get("agent-0").y
    );
    const drawn = Math.hypot(
      geometry.x2 - geometry.x1,
      geometry.y2 - geometry.y1
    );
    expect(drawn).toBeLessThan(full);
  });

  test("an edge to a node that is not laid out fails gracefully", () => {
    const layout = layoutConstellation(roster(2));
    const index = nodeIndex(layout);
    expect(edgeGeometry(index.get("agent-0"), index.get("missing"))).toBeNull();
  });
});
