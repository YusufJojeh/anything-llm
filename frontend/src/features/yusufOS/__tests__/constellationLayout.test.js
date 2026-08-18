import { describe, expect, test } from "vitest";
import {
  layoutConstellation,
  edgeGeometry,
  nodeIndex,
  ringCapacity,
  VIEWBOX,
  CORE_RADIUS,
  NODE_RADIUS,
} from "../state/constellationLayout";

const roster = (count) =>
  Array.from({ length: count }, (_, index) => ({ agentId: `agent-${index}` }));

/** Smallest edge-to-edge distance between any two nodes, in user units. */
function minGap(layout) {
  const { nodes } = layout;
  let smallest = Infinity;
  for (let i = 0; i < nodes.length; i += 1)
    for (let j = i + 1; j < nodes.length; j += 1)
      smallest = Math.min(
        smallest,
        Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) -
          2 * NODE_RADIUS
      );
  return smallest;
}

describe("constellation layout", () => {
  test("tolerates an empty roster", () => {
    const layout = layoutConstellation([]);
    expect(layout.nodes).toEqual([]);
    expect(layout.rings).toBe(0);
    expect(layout.ringRadii).toEqual([]);
  });

  test.each([1, 3, 6, 9, 10, 16, 24, 40])(
    "places every agent inside the canvas for a roster of %i",
    (count) => {
      const layout = layoutConstellation(roster(count));
      expect(layout.nodes).toHaveLength(count);
      for (const node of layout.nodes) {
        // Node plus its halo must stay inside the viewBox.
        expect(node.x - NODE_RADIUS).toBeGreaterThan(0);
        expect(node.x + NODE_RADIUS).toBeLessThan(VIEWBOX);
        expect(node.y - NODE_RADIUS).toBeGreaterThan(0);
        expect(node.y + NODE_RADIUS).toBeLessThan(VIEWBOX);
      }
    }
  );

  test.each([3, 6, 9, 10, 16, 24, 40])(
    "never overlaps nodes for a roster of %i",
    (count) => {
      expect(minGap(layoutConstellation(roster(count)))).toBeGreaterThan(0);
    }
  );

  test.each([1, 3, 6, 10, 24])(
    "never places an agent on top of the core for a roster of %i",
    (count) => {
      const layout = layoutConstellation(roster(count));
      for (const node of layout.nodes) {
        const distance = Math.hypot(
          node.x - layout.center.x,
          node.y - layout.center.y
        );
        expect(distance).toBeGreaterThan(CORE_RADIUS + NODE_RADIUS);
      }
    }
  );

  test("is deterministic — the same roster always yields the same picture", () => {
    expect(layoutConstellation(roster(6)).nodes).toEqual(
      layoutConstellation(roster(6)).nodes
    );
    expect(layoutConstellation(roster(17)).nodes).toEqual(
      layoutConstellation(roster(17)).nodes
    );
  });

  describe("adaptive spacing", () => {
    const radiusOf = (count) => layoutConstellation(roster(count)).ringRadii[0];

    test("a small roster orbits closer to the core than a large one", () => {
      // The whole point of Gate G.1 §8: three agents must not be flung to the
      // edge of an empty canvas.
      expect(radiusOf(3)).toBeLessThan(radiusOf(6));
      expect(radiusOf(6)).toBeLessThan(radiusOf(9));
    });

    test("1-3 agents share one compact orbit", () => {
      for (const count of [1, 2, 3]) {
        const layout = layoutConstellation(roster(count));
        expect(layout.rings).toBe(1);
        expect(layout.ringRadii[0]).toBe(radiusOf(3));
      }
    });

    test("4-9 agents stay on a single, wider ring", () => {
      for (const count of [4, 6, 8, 9])
        expect(layoutConstellation(roster(count)).rings).toBe(1);
    });

    test("10+ agents gain a second ring rather than crowding one", () => {
      expect(layoutConstellation(roster(10)).rings).toBe(2);
      expect(layoutConstellation(roster(24)).rings).toBe(2);
    });

    test("a very large roster adds a third ring instead of overlapping", () => {
      const layout = layoutConstellation(roster(48));
      expect(layout.rings).toBe(3);
      expect(minGap(layout)).toBeGreaterThan(0);
    });

    test("ring capacity is derived from real geometry, not guessed", () => {
      // A larger ring must hold at least as many agents as a smaller one.
      expect(ringCapacity(390)).toBeGreaterThan(ringCapacity(250));
      expect(ringCapacity(1)).toBe(1);
    });
  });

  test("the core dominates an agent node by a wide margin", () => {
    // Gate G.1 §5 asked for ~20-30% more core dominance. The ratio is asserted
    // so a future tweak cannot quietly shrink the centre of the product.
    expect(CORE_RADIUS / NODE_RADIUS).toBeGreaterThanOrEqual(3);
  });

  test("a single agent sits directly above the core", () => {
    const [node] = layoutConstellation(roster(1)).nodes;
    expect(node.x).toBeCloseTo(VIEWBOX / 2, 1);
    expect(node.y).toBeLessThan(VIEWBOX / 2);
  });

  test("adjacent rings are offset so nodes do not line up on one spoke", () => {
    const layout = layoutConstellation(roster(16));
    const inner = layout.nodes.filter((n) => n.ring === 0);
    const outer = layout.nodes.filter((n) => n.ring === 1);
    expect(inner.length).toBeGreaterThan(0);
    expect(outer.length).toBeGreaterThan(0);
    for (const a of inner)
      for (const b of outer)
        expect(Math.abs(a.angle - b.angle)).toBeGreaterThan(0.01);
  });

  describe("edges", () => {
    test("are inset so they stop at the node ring", () => {
      const layout = layoutConstellation(roster(2));
      const index = nodeIndex(layout);
      const geometry = edgeGeometry(index.get("agent-0"), index.get("agent-1"));
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

    test("carry a midpoint and angle for the direction marker", () => {
      const layout = layoutConstellation(roster(2));
      const index = nodeIndex(layout);
      const geometry = edgeGeometry(index.get("agent-0"), index.get("agent-1"));
      expect(Number.isFinite(geometry.mx)).toBe(true);
      expect(Number.isFinite(geometry.my)).toBe(true);
      expect(Number.isFinite(geometry.angleDeg)).toBe(true);
    });

    test("an edge to a node that is not laid out fails gracefully", () => {
      const layout = layoutConstellation(roster(2));
      const index = nodeIndex(layout);
      expect(
        edgeGeometry(index.get("agent-0"), index.get("missing"))
      ).toBeNull();
    });
  });
});
