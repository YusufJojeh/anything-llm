import React, { useCallback, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  layoutConstellation,
  edgeGeometry,
  nodeIndex,
  ORBIT_TILT,
  VIEWBOX,
  CORE_RADIUS,
  NODE_RADIUS,
} from "../state/constellationLayout";
import { toneStyle } from "../state/statusSemantics";
import { coreStateTone, CORE_STATES } from "../state/commandCenterModel";
import { roleFor } from "../state/agentRoles";

/**
 * The Agent constellation.
 *
 * Plain SVG, no graph library. Four rules it must never break:
 *
 * 1. No edge that does not exist in `yusuf_handoffs`. Every line comes from the
 *    backend's `activeHandoffs`; there is no layout-time edge invention.
 * 2. No motion that implies activity the server did not assert. The work arc
 *    appears only when the projection reports an active task, and an edge only
 *    flows when the backend marks the handoff live.
 * 3. It is never the only way to use Yusuf OS. It is `aria-hidden`; the
 *    synchronized `AgentRoster` beside it is the accessible equivalent.
 * 4. **Depth is geometry, not emphasis.** A node is drawn larger because it sits
 *    on the near edge of its orbit, full stop. It never grows because it is
 *    busy, important, or selected — those are carried by the ring, the halo and
 *    the text, exactly as before.
 *
 * The System Core's rings and halo are *not* drawn here. They are a separate
 * layer (`components/core/SystemCore`) rendered behind this SVG, in WebGL where
 * the machine supports it and in CSS 3D where it does not. What stays here is
 * the core's disc, its identity and its state text — everything that has to
 * scale with the composition and stay crisp at any size.
 */

/** Core states whose treatment should read as low-energy rather than alive. */
const DORMANT_STATES = new Set([
  CORE_STATES.OFFLINE_ADAPTER,
  CORE_STATES.DEGRADED,
]);

const MAX_LABEL = 18;

function truncate(value) {
  const text = String(value ?? "");
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
}

/**
 * Polar helper for the activity arc. Kept local because it only ever describes
 * a fraction of a node's halo.
 */
function arcPath(cx, cy, radius, startDeg, sweepDeg) {
  const toXY = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  };
  const [x1, y1] = toXY(startDeg);
  const [x2, y2] = toXY(startDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function SystemCoreDisc({ coreState, selected, center, onSelect, t }) {
  const tone = coreStateTone(coreState);
  const style = toneStyle(tone);
  const dormant = DORMANT_STATES.has(coreState);

  return (
    <g opacity={dormant ? 0.72 : 1}>
      {/* Structural ring — the boundary of the core itself. The animated rings
          outside it belong to the 3D layer behind this SVG. */}
      <circle
        cx={center.x}
        cy={center.y}
        r={CORE_RADIUS + 14}
        fill="none"
        stroke="var(--yos-border-strong)"
        strokeWidth="1"
        opacity="0.75"
      />

      <circle
        cx={center.x}
        cy={center.y}
        r={CORE_RADIUS}
        fill="url(#yos-core-fill)"
        stroke={style.graphic}
        strokeWidth={selected ? 3 : 2.25}
        filter="url(#yos-core-shadow)"
      />

      {/* Selection is a ring, not a colour change, so it cannot be confused
          with a status transition. */}
      {selected ? (
        <circle
          cx={center.x}
          cy={center.y}
          r={CORE_RADIUS + 44}
          fill="none"
          stroke="var(--yos-focus)"
          strokeWidth="1.5"
          strokeDasharray="4 8"
          opacity="0.85"
        />
      ) : null}

      <text
        x={center.x}
        y={center.y - 20}
        textAnchor="middle"
        fill="var(--yos-text)"
        fontSize="30"
        fontWeight="700"
        letterSpacing="0.1em"
      >
        {t("yusufOS:brand.name")}
      </text>
      <text
        x={center.x}
        y={center.y + 6}
        textAnchor="middle"
        fill="var(--yos-text-muted)"
        fontSize="13"
        letterSpacing="0.18em"
      >
        {t("yusufOS:brand.core").toUpperCase()}
      </text>
      <line
        x1={center.x - 46}
        y1={center.y + 22}
        x2={center.x + 46}
        y2={center.y + 22}
        stroke="var(--yos-border-strong)"
        strokeWidth="1"
      />
      <text
        x={center.x}
        y={center.y + 48}
        textAnchor="middle"
        fill={style.text}
        fontSize="14"
        fontWeight="600"
        letterSpacing="0.09em"
      >
        {(coreState
          ? t(`yusufOS:core.state.${coreState}`)
          : t("yusufOS:state.unknown")
        ).toUpperCase()}
      </text>

      <circle
        cx={center.x}
        cy={center.y}
        r={CORE_RADIUS}
        fill="transparent"
        style={{ cursor: "pointer" }}
        onClick={onSelect}
      />
    </g>
  );
}

function AgentNode({ agent, node, selected, dimmed, onSelect, t }) {
  const style = toneStyle(agent.tone);
  const role = roleFor(agent.agentId);
  // Only the projection can say an Agent is on something. No task id, no arc.
  const hasActiveWork = Boolean(agent.activeTaskId || agent.currentRunId);
  const running = agent.status === "RUNNING";
  const labelBelow = node.y > VIEWBOX / 2;
  const labelY = labelBelow ? 62 : -50;
  const statusLabel = agent.status
    ? t(`yusufOS:status.agent.${agent.status}`, { defaultValue: agent.status })
    : t("yusufOS:status.none");

  return (
    <g
      opacity={dimmed ? 0.24 : 1}
      className="yos-node"
      // The one place depth becomes visible on a node. Scale comes from the
      // layout's `scale`, which is a pure function of where the node sits on its
      // orbit — see `constellationLayout.js`.
      transform={`translate(${node.x} ${node.y}) scale(${node.scale}) translate(${-node.x} ${-node.y})`}
    >
      <title>{`${agent.name} — ${statusLabel}`}</title>

      {/* Status halo. Present for every Agent so the ring reads as structure;
          its weight and opacity carry how much attention the state deserves. */}
      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS + 11}
        fill="none"
        stroke={style.graphic}
        strokeWidth={selected ? 2 : 1.25}
        opacity={agent.status === "IDLE" ? 0.3 : 0.62}
      />

      {/* Activity arc — a real assertion that this Agent is attached to work.
          Rotates only while the run is RUNNING. */}
      {hasActiveWork ? (
        <path
          d={arcPath(node.x, node.y, NODE_RADIUS + 11, -34, 68)}
          fill="none"
          stroke={style.graphic}
          strokeWidth="3"
          strokeLinecap="round"
          className={running ? "yos-spin-working" : ""}
          style={
            running ? { transformOrigin: `${node.x}px ${node.y}px` } : undefined
          }
        />
      ) : null}

      {selected ? (
        <circle
          cx={node.x}
          cy={node.y}
          r={NODE_RADIUS + 18}
          fill="none"
          stroke="var(--yos-focus)"
          strokeWidth="1.5"
          opacity="0.9"
        />
      ) : null}

      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS}
        fill="url(#yos-node-fill)"
        stroke={style.graphic}
        strokeWidth="1.75"
        filter="url(#yos-node-shadow)"
      />

      {/* Role identity: code-owned, never a status signal. */}
      <text
        x={node.x}
        y={node.y + 6}
        textAnchor="middle"
        fill="var(--yos-text-secondary)"
        fontSize="17"
        fontWeight="700"
        letterSpacing="0.06em"
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
      >
        {role.glyph}
      </text>

      {/* Status marker, offset so it never collides with the role glyph. */}
      <circle
        cx={node.x + NODE_RADIUS * 0.72}
        cy={node.y - NODE_RADIUS * 0.72}
        r="6.5"
        fill="var(--yos-surface)"
        stroke={style.graphic}
        strokeWidth="1.5"
      />
      <circle
        cx={node.x + NODE_RADIUS * 0.72}
        cy={node.y - NODE_RADIUS * 0.72}
        r="3"
        fill={style.graphic}
      />

      <text
        x={node.x}
        y={node.y + labelY}
        textAnchor="middle"
        fill={selected ? "var(--yos-text)" : "var(--yos-text-secondary)"}
        fontSize="15"
        fontWeight="600"
      >
        {truncate(agent.name)}
      </text>
      <text
        x={node.x}
        y={node.y + labelY + 17}
        textAnchor="middle"
        fill="var(--yos-text-muted)"
        fontSize="11"
        letterSpacing="0.05em"
      >
        {statusLabel}
      </text>

      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS + 8}
        fill="transparent"
        style={{ cursor: "pointer" }}
        onClick={() => onSelect(agent.agentId)}
      />
    </g>
  );
}

export default function AgentConstellation({
  agents,
  edges,
  coreState,
  selectedAgentId,
  coreSelected,
  onSelectAgent,
  onSelectCore,
}) {
  const { t } = useTranslation();
  const titleId = useId();

  const layout = useMemo(() => layoutConstellation(agents), [agents]);
  const index = useMemo(() => nodeIndex(layout), [layout]);
  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.agentId, agent])),
    [agents]
  );

  /** Agents with a persisted relationship to the selection, for focus dimming. */
  const related = useMemo(() => {
    if (!selectedAgentId) return null;
    const set = new Set([selectedAgentId]);
    for (const edge of edges) {
      if (edge.fromAgentId === selectedAgentId) set.add(edge.toAgentId);
      if (edge.toAgentId === selectedAgentId) set.add(edge.fromAgentId);
    }
    return set;
  }, [selectedAgentId, edges]);

  const dimmed = useCallback(
    (agentId) => (related ? !related.has(agentId) : false),
    [related]
  );

  const coreTone = coreStateTone(coreState);
  const coreStyle = toneStyle(coreTone);

  /**
   * Painter's algorithm across the core.
   *
   * Everything on the far half of the formation is drawn before the core disc
   * and everything on the near half after it, so the core genuinely occludes
   * what is behind it. Without this the tilt reads as a squashed circle rather
   * than a plane.
   */
  const { farEdges, nearEdges } = useMemo(() => {
    const resolved = edges
      .map((edge) => ({
        edge,
        geometry: edgeGeometry(
          index.get(edge.fromAgentId),
          index.get(edge.toAgentId)
        ),
      }))
      .filter((entry) => entry.geometry !== null);
    return {
      farEdges: resolved.filter((entry) => entry.geometry.depth <= 0),
      nearEdges: resolved.filter((entry) => entry.geometry.depth > 0),
    };
  }, [edges, index]);

  const farNodes = layout.nodes.filter((node) => node.depth <= 0);
  const nearNodes = layout.nodes.filter((node) => node.depth > 0);

  const renderEdge = ({ edge, geometry }) => {
    const style = toneStyle(edge.tone);
    const faded =
      related &&
      !(related.has(edge.fromAgentId) && related.has(edge.toAgentId));
    return (
      <g key={edge.id} opacity={faded ? 0.12 : 1}>
        <line
          x1={geometry.x1}
          y1={geometry.y1}
          x2={geometry.x2}
          y2={geometry.y2}
          stroke={style.graphic}
          strokeWidth={edge.active ? 2.2 : 1.4}
          strokeLinecap="round"
          // Review relationships are dashed even when idle, so the two kinds of
          // relationship are distinguishable without motion.
          strokeDasharray={
            edge.active ? undefined : edge.kind === "REVIEW" ? "6 8" : undefined
          }
          opacity={edge.active ? 0.9 : 0.45}
        />
        {/* Flow marker: only on an edge the backend says is live. */}
        {edge.active ? (
          <line
            x1={geometry.x1}
            y1={geometry.y1}
            x2={geometry.x2}
            y2={geometry.y2}
            stroke={style.text}
            strokeWidth="3"
            strokeLinecap="round"
            className="yos-edge-active"
          />
        ) : null}
        {/* Direction marker at the midpoint — who delegated to whom is the whole
            point of the graph. */}
        <path
          d="M -7 -5 L 3 0 L -7 5 Z"
          fill={style.graphic}
          opacity={edge.active ? 1 : 0.6}
          transform={`translate(${geometry.mx} ${geometry.my}) rotate(${geometry.angleDeg})`}
        />
      </g>
    );
  };

  const renderNode = (node) => {
    const agent = agentsById.get(node.agentId);
    if (!agent) return null;
    return (
      <AgentNode
        key={agent.agentId}
        agent={agent}
        node={node}
        selected={agent.agentId === selectedAgentId}
        dimmed={dimmed(agent.agentId)}
        onSelect={onSelectAgent}
        t={t}
      />
    );
  };

  if (!agents.length)
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
        {/* Even with no roster the core is present — the system exists, it
            simply has no staff yet. */}
        <div
          className="flex size-24 items-center justify-center rounded-full"
          style={{
            border: `2px solid ${coreStyle.graphic}`,
            backgroundColor: "var(--yos-surface-raised)",
          }}
        >
          <span
            className="text-[11px] font-bold tracking-[0.14em]"
            style={{ color: "var(--yos-text)" }}
          >
            {t("yusufOS:brand.name")}
          </span>
        </div>
        <p
          className="max-w-xs text-pretty text-sm"
          style={{ color: "var(--yos-text-secondary)" }}
        >
          {t("yusufOS:constellation.empty")}
        </p>
      </div>
    );

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      className="relative h-full w-full"
      // The roster beside this carries the same data and the same controls, so
      // exposing a duplicate (and far worse) graph tree to assistive technology
      // would only add noise.
      aria-hidden="true"
      focusable="false"
      role="presentation"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{t("yusufOS:constellation.title")}</title>
      <defs>
        <radialGradient id="yos-core-fill" cx="50%" cy="38%">
          <stop offset="0%" stopColor="var(--yos-surface-overlay)" />
          <stop offset="100%" stopColor="var(--yos-surface)" />
        </radialGradient>
        <radialGradient id="yos-node-fill" cx="50%" cy="34%">
          <stop offset="0%" stopColor="var(--yos-surface-raised)" />
          <stop offset="100%" stopColor="var(--yos-surface)" />
        </radialGradient>
        {/*
         * Contact shadows. These are what lift a node off the orbital plane
         * instead of leaving it pasted onto it — the cheapest honest depth cue
         * there is, and the only one that survives a still frame.
         */}
        <filter
          id="yos-node-shadow"
          x="-60%"
          y="-60%"
          width="220%"
          height="220%"
        >
          <feDropShadow
            dx="0"
            dy="6"
            stdDeviation="7"
            floodColor="#000"
            floodOpacity="0.55"
          />
        </filter>
        <filter
          id="yos-core-shadow"
          x="-60%"
          y="-60%"
          width="220%"
          height="220%"
        >
          <feDropShadow
            dx="0"
            dy="14"
            stdDeviation="20"
            floodColor="#000"
            floodOpacity="0.6"
          />
        </filter>
      </defs>

      {/*
       * Orbit guides. Drawn as ellipses at the layout's own inclination, so the
       * ring an Agent sits on is literally the ring that is drawn. One per real
       * orbit — they describe the formation, they do not decorate it.
       */}
      {layout.ringRadii.map((radius) => (
        <ellipse
          key={radius}
          cx={layout.center.x}
          cy={layout.center.y}
          rx={radius}
          ry={radius * ORBIT_TILT}
          fill="none"
          stroke="var(--yos-border)"
          strokeWidth="1"
          opacity="0.5"
          strokeDasharray="2 10"
        />
      ))}

      {/* Far half of the formation: behind the core. */}
      <g>{farEdges.map(renderEdge)}</g>
      <g>{farNodes.map(renderNode)}</g>

      <SystemCoreDisc
        coreState={coreState}
        selected={coreSelected}
        center={layout.center}
        onSelect={onSelectCore}
        t={t}
      />

      {/* Near half: in front of the core. */}
      <g>{nearEdges.map(renderEdge)}</g>
      <g>{nearNodes.map(renderNode)}</g>
    </svg>
  );
}
