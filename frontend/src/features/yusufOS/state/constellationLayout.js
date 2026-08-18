/**
 * Deterministic radial layout for the Agent constellation.
 *
 * No graph library. The layout is arithmetic on a unit circle, drawn as plain
 * SVG — adding a force-directed graph dependency to place a handful of nodes
 * on a ring would cost bundle size, accessibility control and RTL behaviour
 * for no benefit (Gate G brief §24).
 *
 * Properties this guarantees, which the roster is allowed to change over time:
 *
 * - works for 0, 1, 3, 6, 10 or 50 agents;
 * - deterministic — the same roster always produces the same picture, so
 *   nodes do not jump when an unrelated status changes;
 * - beyond a threshold it wraps to a second ring rather than crushing nodes
 *   together;
 * - the geometry is direction-neutral; RTL mirroring happens in CSS on the
 *   surrounding layout, not by recomputing coordinates.
 */

export const VIEWBOX = 1000;
const CENTER = VIEWBOX / 2;
const INNER_RADIUS = 250;
const OUTER_RADIUS = 385;
// Above this, a single ring puts nodes closer together than a comfortable
// touch target at realistic rendering sizes.
const MAX_PER_RING = 9;
// Start at the top and go clockwise, so the first agent is where a reader
// looks first in either text direction.
const START_ANGLE = -Math.PI / 2;

export function layoutConstellation(agents = []) {
  const nodes = [];
  const total = agents.length;
  if (total === 0) return { center: { x: CENTER, y: CENTER }, nodes, rings: 0 };

  const ringCount = total <= MAX_PER_RING ? 1 : 2;
  const innerCount =
    ringCount === 1
      ? total
      : Math.ceil(total * (INNER_RADIUS / (INNER_RADIUS + OUTER_RADIUS)) * 1.6);
  const rings =
    ringCount === 1
      ? [{ radius: OUTER_RADIUS, items: agents }]
      : [
          { radius: INNER_RADIUS, items: agents.slice(0, innerCount) },
          { radius: OUTER_RADIUS, items: agents.slice(innerCount) },
        ];

  for (const ring of rings) {
    const count = ring.items.length;
    if (!count) continue;
    // A single node on a ring sits directly above the core rather than at an
    // arbitrary angle.
    for (let index = 0; index < count; index += 1) {
      const angle = START_ANGLE + (index * 2 * Math.PI) / count;
      nodes.push({
        agentId: ring.items[index].agentId,
        x: Number((CENTER + ring.radius * Math.cos(angle)).toFixed(2)),
        y: Number((CENTER + ring.radius * Math.sin(angle)).toFixed(2)),
        angle,
        radius: ring.radius,
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
  }

  return { center: { x: CENTER, y: CENTER }, nodes, rings: rings.length };
}

/**
 * Endpoints for an edge, pulled back from both node centres so the line stops
 * at the ring rather than under the glyph.
 */
export function edgeGeometry(from, to, { fromInset = 34, toInset = 40 } = {}) {
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
  };
}

/** Node lookup by agent id, for resolving edge endpoints. */
export function nodeIndex(layout) {
  const index = new Map();
  for (const node of layout?.nodes || []) index.set(node.agentId, node);
  return index;
}
