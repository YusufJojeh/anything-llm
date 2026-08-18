/**
 * Deterministic radial layout for the Agent constellation.
 *
 * No graph library. The layout is arithmetic on a unit circle, drawn as plain
 * SVG — adding a force-directed graph dependency to place a handful of nodes
 * on a ring would cost bundle size, accessibility control and RTL behaviour
 * for no benefit.
 *
 * Guarantees the roster is allowed to rely on:
 *
 * - works for 0, 1, 3, 6, 10, 24 or 50 agents;
 * - **deterministic** — the same roster always produces the same picture, so a
 *   node never jumps because an unrelated status changed;
 * - **adaptive** — the orbit radius is chosen from the roster size, so a small
 *   elite staff sits in a tight, deliberate formation instead of being flung to
 *   the edge of an empty canvas (Gate G.1 §8);
 * - nodes never overlap: ring capacity is derived from the actual chord length
 *   between neighbours, and rings are added when a ring is full;
 * - direction-neutral geometry; RTL mirroring happens in CSS on the surrounding
 *   layout, never by recomputing coordinates.
 */

export const VIEWBOX = 1000;
const CENTER = VIEWBOX / 2;

/**
 * Geometry shared with the renderer. Exported so the component cannot drift
 * from the maths — one source of truth for how big the core is relative to an
 * Agent, which is the single most important ratio in the composition.
 */
export const CORE_RADIUS = 108;
export const NODE_RADIUS = 34;

// Minimum edge-to-edge space between two neighbouring Agents, in user units.
const MIN_NODE_GAP = 26;
// The closest an Agent may orbit: clear of the core plus breathing room.
const MIN_ORBIT = CORE_RADIUS + NODE_RADIUS + 74;
// The furthest an Agent may orbit and still leave room for its label inside
// the viewBox.
const MAX_ORBIT = 390;

// Start at the top and go clockwise, so the first Agent sits where a reader
// looks first in either text direction.
const START_ANGLE = -Math.PI / 2;

/**
 * Orbit radius for a roster small enough to sit on one ring.
 *
 * Banded rather than continuous so the composition reads as a deliberate
 * formation at each size instead of drifting by a few pixels per Agent.
 */
function singleRingRadius(total) {
  if (total <= 3) return MIN_ORBIT;
  if (total <= 6) return 268;
  return 322;
}

/** Multi-ring radii, evenly spread between the innermost and outermost orbit. */
const MULTI_RING_RADII = Object.freeze({
  2: [250, MAX_ORBIT],
  3: [MIN_ORBIT, 300, MAX_ORBIT],
});

/**
 * How many nodes fit on a ring of this radius without breaching `MIN_NODE_GAP`.
 *
 * Derived from the chord between neighbours rather than guessed, which is what
 * makes "no overlap" a property of the algorithm instead of a property of the
 * roster sizes someone happened to test.
 */
export function ringCapacity(radius) {
  const halfSpacing = NODE_RADIUS + MIN_NODE_GAP / 2;
  if (radius <= halfSpacing) return 1;
  return Math.max(1, Math.floor(Math.PI / Math.asin(halfSpacing / radius)));
}

/** Chooses ring radii for a roster size. */
function planRings(total) {
  if (total <= 9) return [singleRingRadius(total)];
  for (const count of [2, 3]) {
    const radii = MULTI_RING_RADII[count];
    const capacity = radii.reduce((sum, r) => sum + ringCapacity(r), 0);
    if (total <= capacity) return radii;
  }
  // Beyond what three rings hold, keep the outer rings and let the innermost
  // absorb the remainder. Crowded is acceptable here; silently dropping an
  // Agent is not.
  return MULTI_RING_RADII[3];
}

/**
 * Distributes agents across rings proportionally to each ring's capacity, so
 * density is even rather than an arbitrary inner/outer split.
 */
function allocate(total, radii) {
  if (radii.length === 1) return [total];
  const capacities = radii.map(ringCapacity);
  const totalCapacity = capacities.reduce((a, b) => a + b, 0);
  const counts = capacities.map((capacity) =>
    Math.floor((total * capacity) / totalCapacity)
  );
  // Hand out the rounding remainder from the outside in: the outer rings have
  // the most room, so they absorb extras with the least crowding.
  let remainder = total - counts.reduce((a, b) => a + b, 0);
  for (
    let i = counts.length - 1;
    remainder > 0;
    i = (i - 1 + counts.length) % counts.length
  ) {
    counts[i] += 1;
    remainder -= 1;
  }
  return counts;
}

export function layoutConstellation(agents = []) {
  const nodes = [];
  const total = agents.length;
  if (total === 0)
    return {
      center: { x: CENTER, y: CENTER },
      nodes,
      rings: 0,
      ringRadii: [],
      coreRadius: CORE_RADIUS,
      nodeRadius: NODE_RADIUS,
    };

  const radii = planRings(total);
  const counts = allocate(total, radii);

  let cursor = 0;
  radii.forEach((radius, ringIndex) => {
    const items = agents.slice(cursor, cursor + counts[ringIndex]);
    cursor += counts[ringIndex];
    const count = items.length;
    if (!count) return;
    // Offset every other ring by half a step so an outer node does not sit
    // directly behind an inner one along the same spoke.
    const offset = ringIndex % 2 === 1 ? Math.PI / count : 0;
    for (let index = 0; index < count; index += 1) {
      const angle = START_ANGLE + offset + (index * 2 * Math.PI) / count;
      nodes.push({
        agentId: items[index].agentId,
        x: Number((CENTER + radius * Math.cos(angle)).toFixed(2)),
        y: Number((CENTER + radius * Math.sin(angle)).toFixed(2)),
        angle,
        radius,
        ring: ringIndex,
        // Which side of the core the node sits on, so a label can be placed
        // outside the ring without overlapping it.
        labelAnchor:
          Math.cos(angle) > 0.2
            ? "start"
            : Math.cos(angle) < -0.2
              ? "end"
              : "middle",
      });
    }
  });

  return {
    center: { x: CENTER, y: CENTER },
    nodes,
    rings: radii.length,
    ringRadii: radii,
    coreRadius: CORE_RADIUS,
    nodeRadius: NODE_RADIUS,
  };
}

/**
 * Endpoints for an edge, pulled back from both node centres so the line stops
 * at the ring rather than under the glyph.
 */
export function edgeGeometry(
  from,
  to,
  { fromInset = NODE_RADIUS, toInset = NODE_RADIUS + 10 } = {}
) {
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const ux = dx / length;
  const uy = dy / length;
  return {
    x1: Number((from.x + ux * fromInset).toFixed(2)),
    y1: Number((from.y + uy * fromInset).toFixed(2)),
    x2: Number((to.x - ux * toInset).toFixed(2)),
    y2: Number((to.y - uy * toInset).toFixed(2)),
    // Midpoint, for a direction marker that reads at any edge length.
    mx: Number(((from.x + to.x) / 2).toFixed(2)),
    my: Number(((from.y + to.y) / 2).toFixed(2)),
    angleDeg: Number(((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(2)),
  };
}

/** Node lookup by agent id, for resolving edge endpoints. */
export function nodeIndex(layout) {
  const index = new Map();
  for (const node of layout?.nodes || []) index.set(node.agentId, node);
  return index;
}
