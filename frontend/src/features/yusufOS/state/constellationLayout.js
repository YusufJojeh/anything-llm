/**
 * Deterministic radial layout for the Agent constellation.
 *
 * No graph library. The layout is arithmetic on a tilted circle, drawn as plain
 * SVG — adding a force-directed graph dependency to place a handful of nodes on
 * a ring would cost bundle size, accessibility control and RTL behaviour for no
 * benefit.
 *
 * Guarantees the roster is allowed to rely on:
 *
 * - works for 0, 1, 3, 6, 10, 24 or 50 agents;
 * - **deterministic** — the same roster always produces the same picture, so a
 *   node never jumps because an unrelated status changed;
 * - **adaptive** — the orbit radius is chosen from the roster size, so a small
 *   elite staff sits in a tight, deliberate formation instead of being flung to
 *   the edge of an empty canvas (Gate G.1 §8);
 * - **depth-aware** — orbits are inclined, so the formation reads as a plane
 *   seen from slightly above rather than a flat dial. The inclination is a
 *   fixed property of the composition, never a state signal;
 * - nodes never overlap: ring capacity is derived from the actual chord length
 *   between neighbours *under the inclination*, and rings are added when a ring
 *   is full;
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

/**
 * Orbit inclination: how much the vertical axis of every orbit is compressed.
 *
 * 0.86 is a deliberate choice. It is enough that the eye reads a plane receding
 * away from it — which is what makes the constellation feel three-dimensional
 * without any 3D machinery — and gentle enough that a node near the left or
 * right extreme is still unambiguously *on* the ring rather than lost in
 * foreshortening. A steeper tilt looks like a game HUD and starts costing real
 * node separation.
 */
export const ORBIT_TILT = 0.86;

/**
 * How far a node's apparent size may vary between the near and far edge of its
 * orbit. Small on purpose: this is a depth cue, not a size ranking, and an
 * Agent must never look more important because of where it happens to sit.
 */
export const DEPTH_SCALE_RANGE = 0.09;

/**
 * How far the System Core's 3D structure reaches, in viewBox units.
 *
 * Exported so the core renderer and the orbit planner agree on where the core
 * ends and the staff begins, instead of each guessing. The innermost orbit is
 * derived from it, which is what keeps a core ring from ever grazing an Agent.
 */
export const CORE_FIELD_RADIUS = 220;

// Minimum edge-to-edge space between two neighbouring Agents, in user units.
const MIN_NODE_GAP = 26;
/**
 * Minimum radial distance between two orbits.
 *
 * Adjacent-on-the-same-ring spacing and ring-to-ring spacing are different
 * constraints, and only the first one is a chord problem. Two nodes on
 * *different* rings can sit at nearly the same angle, in which case the only
 * thing keeping them apart is the gap between the orbits themselves — so it is
 * stated here rather than left to emerge from the radii someone picked.
 */
const MIN_RING_SEPARATION = 2 * NODE_RADIUS + MIN_NODE_GAP;
// The closest an Agent may orbit: clear of the core's full 3D structure plus
// breathing room, so a ring of the core never grazes an Agent node.
const MIN_ORBIT = CORE_FIELD_RADIUS + NODE_RADIUS + 32;
// The furthest an Agent may orbit and still leave room for its label inside
// the viewBox.
const MAX_ORBIT = 440;

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
  if (total <= 6) return 306;
  return 360;
}

/** Multi-ring radii, evenly spread between the innermost and outermost orbit. */
const MULTI_RING_RADII = Object.freeze({
  2: [MAX_ORBIT - MIN_RING_SEPARATION * 1.5, MAX_ORBIT],
  3: [
    MAX_ORBIT - MIN_RING_SEPARATION * 2,
    MAX_ORBIT - MIN_RING_SEPARATION,
    MAX_ORBIT,
  ],
});

/**
 * How many nodes fit on a ring of this radius without breaching `MIN_NODE_GAP`.
 *
 * Derived from the chord between neighbours rather than guessed, which is what
 * makes "no overlap" a property of the algorithm instead of a property of the
 * roster sizes someone happened to test.
 *
 * Callers planning a *tilted* orbit must pass the foreshortened radius: two
 * neighbours separated mainly along the compressed axis are the worst case, and
 * planning against the uncompressed radius would silently overfill the ring.
 */
export function ringCapacity(radius) {
  const halfSpacing = NODE_RADIUS + MIN_NODE_GAP / 2;
  if (radius <= halfSpacing) return 1;
  return Math.max(1, Math.floor(Math.PI / Math.asin(halfSpacing / radius)));
}

/** Capacity of an orbit once its inclination is taken into account. */
function tiltedCapacity(radius) {
  return ringCapacity(radius * ORBIT_TILT);
}

/** Chooses ring radii for a roster size. */
function planRings(total) {
  if (total <= 9) return [singleRingRadius(total)];
  for (const count of [2, 3]) {
    const radii = MULTI_RING_RADII[count];
    const capacity = radii.reduce((sum, r) => sum + tiltedCapacity(r), 0);
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
  const capacities = radii.map(tiltedCapacity);
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
      tilt: ORBIT_TILT,
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
      // `depth` is -1 at the far edge of the orbit and +1 at the near edge. It
      // is pure geometry: where the node sits on the ring, nothing else. It
      // never encodes status, priority or activity.
      const depth = Math.sin(angle);
      nodes.push({
        agentId: items[index].agentId,
        x: Number((CENTER + radius * Math.cos(angle)).toFixed(2)),
        y: Number((CENTER + radius * ORBIT_TILT * depth).toFixed(2)),
        angle,
        radius,
        ring: ringIndex,
        depth: Number(depth.toFixed(4)),
        // Nearer nodes are marginally larger. Bounded by DEPTH_SCALE_RANGE so
        // the cue never becomes a hierarchy.
        scale: Number((1 + depth * DEPTH_SCALE_RANGE).toFixed(4)),
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

  // Painter's algorithm: far nodes are emitted first so nearer ones overlap
  // them, which is the whole reason the depth field exists. Ties break on
  // agentId so the order stays deterministic for an unchanged roster.
  nodes.sort(
    (left, right) =>
      left.depth - right.depth || left.agentId.localeCompare(right.agentId)
  );

  return {
    center: { x: CENTER, y: CENTER },
    nodes,
    rings: radii.length,
    ringRadii: radii,
    coreRadius: CORE_RADIUS,
    nodeRadius: NODE_RADIUS,
    tilt: ORBIT_TILT,
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
    // The mean depth of the two endpoints, so an edge can be drawn behind the
    // core when it passes across the far side of the formation.
    depth: Number((((from.depth ?? 0) + (to.depth ?? 0)) / 2).toFixed(4)),
  };
}

/** Node lookup by agent id, for resolving edge endpoints. */
export function nodeIndex(layout) {
  const index = new Map();
  for (const node of layout?.nodes || []) index.set(node.agentId, node);
  return index;
}
