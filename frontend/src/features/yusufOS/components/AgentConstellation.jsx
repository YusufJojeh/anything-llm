import React, { useCallback, useId, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  layoutConstellation,
  edgeGeometry,
  nodeIndex,
  VIEWBOX,
} from "../state/constellationLayout";
import { toneStyle, TONES } from "../state/statusSemantics";
import { coreStateTone, CORE_STATES } from "../state/commandCenterModel";

/**
 * The Agent constellation.
 *
 * Plain SVG, no graph library. Three things it must never do:
 *
 * 1. Draw an edge that does not exist in `yusuf_handoffs`. Every line here
 *    comes from the backend's `activeHandoffs`; there is no layout-time edge
 *    invention and no "related agent" heuristic.
 * 2. Animate to imply activity. Motion appears only on an edge the backend
 *    marks `ACCEPTED`, and on the core when its real state calls for it.
 * 3. Be the only way to use Yusuf OS. It is `aria-hidden`, and the
 *    synchronized `AgentRoster` list beside it is the accessible equivalent —
 *    same data, same selection, full keyboard operation.
 */

const CORE_RADIUS = 86;
const NODE_RADIUS = 34;

/** Core states whose motion is an attention signal rather than an ambient one. */
const ATTENTION_STATES = new Set([
  CORE_STATES.EMERGENCY_STOP,
  CORE_STATES.SECURITY_ALERT,
  CORE_STATES.WAITING_APPROVAL,
  CORE_STATES.BLOCKED,
]);

function coreMotionClass(coreState) {
  if (ATTENTION_STATES.has(coreState)) return "yos-pulse-attention";
  if (coreState === CORE_STATES.WORKING) return "yos-pulse-ambient";
  if (coreState === CORE_STATES.HEALTHY) return "yos-pulse-ambient";
  return "";
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
  const svgRef = useRef(null);

  const layout = useMemo(() => layoutConstellation(agents), [agents]);
  const index = useMemo(() => nodeIndex(layout), [layout]);

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

  if (!agents.length)
    return (
      <div
        className="flex min-h-[320px] items-center justify-center px-6 text-center text-sm"
        style={{ color: "var(--yos-text-secondary)" }}
      >
        {t("yusufOS:constellation.empty")}
      </div>
    );

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      className="h-full w-full"
      // The list beside this is the accessible equivalent and carries the same
      // data and the same controls, so exposing a duplicate (and far worse)
      // graph tree to assistive technology would only add noise.
      aria-hidden="true"
      focusable="false"
      role="presentation"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{t("yusufOS:constellation.title")}</title>
      <defs>
        <radialGradient id="yos-core-glow">
          <stop offset="0%" stopColor={coreStyle.graphic} stopOpacity="0.34" />
          <stop offset="70%" stopColor={coreStyle.graphic} stopOpacity="0.06" />
          <stop offset="100%" stopColor={coreStyle.graphic} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ring guides. Structure, not data — deliberately near-invisible. */}
      {[...new Set(layout.nodes.map((node) => node.radius))].map((radius) => (
        <circle
          key={radius}
          cx={layout.center.x}
          cy={layout.center.y}
          r={radius}
          fill="none"
          stroke="var(--yos-border-faint)"
          strokeWidth="1"
        />
      ))}

      {/* Real relationship edges. */}
      <g>
        {edges.map((edge) => {
          const geometry = edgeGeometry(
            index.get(edge.fromAgentId),
            index.get(edge.toAgentId),
            { fromInset: NODE_RADIUS, toInset: NODE_RADIUS + 10 }
          );
          if (!geometry) return null;
          const style = toneStyle(edge.tone);
          const faded =
            related &&
            !(related.has(edge.fromAgentId) && related.has(edge.toAgentId));
          return (
            <g key={edge.id} opacity={faded ? 0.16 : 1}>
              <line
                x1={geometry.x1}
                y1={geometry.y1}
                x2={geometry.x2}
                y2={geometry.y2}
                stroke={style.graphic}
                strokeWidth={edge.active ? 2.4 : 1.6}
                strokeLinecap="round"
                // Dashes flow only while the backend says the handoff is live.
                className={edge.active ? "yos-edge-active" : ""}
                opacity={edge.active ? 0.95 : 0.5}
              />
              <circle
                cx={geometry.x2}
                cy={geometry.y2}
                r={edge.active ? 4.5 : 3}
                fill={style.graphic}
                opacity={edge.active ? 1 : 0.6}
              />
            </g>
          );
        })}
      </g>

      {/* The Yusuf OS core. */}
      <g opacity={related ? 0.5 : 1}>
        <circle
          cx={layout.center.x}
          cy={layout.center.y}
          r={CORE_RADIUS * 2.6}
          fill="url(#yos-core-glow)"
          className={coreMotionClass(coreState)}
        />
        <circle
          cx={layout.center.x}
          cy={layout.center.y}
          r={CORE_RADIUS + 16}
          fill="none"
          stroke={coreStyle.graphic}
          strokeWidth="1"
          opacity="0.35"
        />
        <circle
          cx={layout.center.x}
          cy={layout.center.y}
          r={CORE_RADIUS}
          fill="var(--yos-surface-raised)"
          stroke={coreStyle.graphic}
          strokeWidth={coreSelected ? 3 : 2}
        />
        <text
          x={layout.center.x}
          y={layout.center.y - 8}
          textAnchor="middle"
          fill="var(--yos-text)"
          fontSize="19"
          fontWeight="600"
          letterSpacing="0.06em"
        >
          {t("yusufOS:brand.name")}
        </text>
        <text
          x={layout.center.x}
          y={layout.center.y + 16}
          textAnchor="middle"
          fill="var(--yos-text-muted)"
          fontSize="13"
        >
          {t("yusufOS:brand.core")}
        </text>
        <text
          x={layout.center.x}
          y={layout.center.y + 40}
          textAnchor="middle"
          fill={coreStyle.text}
          fontSize="12"
          fontWeight="600"
          letterSpacing="0.08em"
        >
          {coreState
            ? t(`yusufOS:core.state.${coreState}`)
            : t("yusufOS:state.unknown")}
        </text>
      </g>

      {/* Agent nodes. */}
      <g>
        {layout.nodes.map((node) => {
          const agent = agents.find((item) => item.agentId === node.agentId);
          if (!agent) return null;
          const style = toneStyle(agent.tone);
          const isSelected = agent.agentId === selectedAgentId;
          const isDimmed = dimmed(agent.agentId);
          const labelOffset = node.y > layout.center.y ? 58 : -54;
          return (
            <g
              key={agent.agentId}
              opacity={isDimmed ? 0.22 : 1}
              className="yos-node"
            >
              {agent.status === "RUNNING" ? (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS + 11}
                  fill="none"
                  stroke={style.graphic}
                  strokeWidth="1.5"
                  strokeDasharray="3 7"
                  opacity="0.7"
                  className="yos-spin-working"
                  style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                />
              ) : null}
              {isSelected ? (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS + 7}
                  fill="none"
                  stroke="var(--yos-focus)"
                  strokeWidth="2"
                />
              ) : null}
              <circle
                cx={node.x}
                cy={node.y}
                r={NODE_RADIUS}
                fill="var(--yos-surface-raised)"
                stroke={style.graphic}
                strokeWidth="2"
              />
              <circle
                cx={node.x}
                cy={node.y - 9}
                r="4.5"
                fill={style.graphic}
              />
              <text
                x={node.x}
                y={node.y + 12}
                textAnchor="middle"
                fill="var(--yos-text-secondary)"
                fontSize="10"
                letterSpacing="0.06em"
              >
                {(agent.status
                  ? t(`yusufOS:status.agent.${agent.status}`, {
                      defaultValue: agent.status,
                    })
                  : t("yusufOS:status.none")
                ).slice(0, 14)}
              </text>
              <text
                x={node.x}
                y={node.y + labelOffset}
                textAnchor="middle"
                fill={
                  isSelected ? "var(--yos-text)" : "var(--yos-text-secondary)"
                }
                fontSize="14"
                fontWeight="600"
              >
                {agent.name}
              </text>
            </g>
          );
        })}
      </g>

      {/*
       * Pointer targets, drawn last so they sit above the artwork. Keyboard
       * users operate the synchronized roster list instead — an SVG group with
       * a bolted-on tabindex is a worse control than a real button.
       */}
      <g>
        <circle
          cx={layout.center.x}
          cy={layout.center.y}
          r={CORE_RADIUS}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onClick={onSelectCore}
        />
        {layout.nodes.map((node) => (
          <circle
            key={`hit-${node.agentId}`}
            cx={node.x}
            cy={node.y}
            r={NODE_RADIUS + 6}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => onSelectAgent(node.agentId)}
          />
        ))}
      </g>
    </svg>
  );
}

export { TONES };
