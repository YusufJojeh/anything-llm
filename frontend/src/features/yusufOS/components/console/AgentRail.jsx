import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain,
  Briefcase,
  ChartLineUp,
  Code,
  Crown,
  MagnifyingGlass,
  Megaphone,
  Robot,
  Rocket,
  SealCheck,
  ShieldCheck,
} from "@phosphor-icons/react";
import { roleFor } from "../../state/agentRoles";
import { TONES, toneStyle } from "../../state/statusSemantics";
import { StatusIcon, UntrustedText } from "../primitives";

const ROLE_ICONS = {
  orchestration: Crown,
  engineering: Code,
  review: SealCheck,
  research: MagnifyingGlass,
  memory: Brain,
  security: ShieldCheck,
  career: Briefcase,
  marketing: Megaphone,
  sales: ChartLineUp,
  founder: Rocket,
  generic: Robot,
};

export function RoleIcon({ agentId, size = 18 }) {
  const Icon = ROLE_ICONS[roleFor(agentId).icon] || Robot;
  return <Icon size={size} aria-hidden="true" />;
}

const ATTENTION_TONES = new Set([
  TONES.APPROVAL,
  TONES.BLOCKED,
  TONES.ERROR,
  TONES.WARNING,
]);

export const RAIL_FILTERS = Object.freeze({
  ALL: () => true,
  ACTIVE: (agent) => agent.tone === TONES.ACTIVE,
  IDLE: (agent) => agent.status === "IDLE",
  ATTENTION: (agent) => ATTENTION_TONES.has(agent.tone),
  UNKNOWN: (agent) => agent.status === null,
});

function shortId(value) {
  return value ? String(value).slice(0, 8) : null;
}

/**
 * The left rail: every real Agent as a dense operational row. It is also the
 * accessible, keyboard-operable equivalent of the Core's Agent orbit.
 */
export default function AgentRail({
  agents,
  departments,
  selectedAgentId,
  onSelectAgent,
  loading = false,
  headingId,
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("ALL");
  const counts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(RAIL_FILTERS).map(([key, test]) => [
          key,
          (agents || []).filter(test).length,
        ])
      ),
    [agents]
  );
  const visible = (agents || []).filter(RAIL_FILTERS[filter]);
  const reporting = (agents || []).filter(
    (agent) => agent.status !== null
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <h2 id={headingId} className="yos-title">
          {t("yusufOS:rail.title")}
        </h2>
        <span
          className="yos-label"
          style={{ color: "var(--yos-text-secondary)" }}
        >
          {loading
            ? t("yusufOS:state.loading")
            : t("yusufOS:rail.reporting", {
                reporting,
                total: agents?.length || 0,
              })}
        </span>
      </div>
      <div
        role="group"
        aria-label={t("yusufOS:rail.filterLabel")}
        className="mx-3 mt-2 flex flex-wrap gap-1 border-b pb-2 yos-divider"
      >
        {Object.keys(RAIL_FILTERS)
          .filter((key) => key === "ALL" || counts[key] > 0 || key === filter)
          .map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className="yos-tab yos-press min-h-[32px] rounded-sm px-2"
            >
              {t(`yusufOS:rail.filter.${key}`)} ({counts[key]})
            </button>
          ))}
      </div>

      {loading ? (
        <p
          className="px-3 py-4 text-xs"
          style={{ color: "var(--yos-text-muted)" }}
        >
          {t("yusufOS:state.loading")}
        </p>
      ) : !agents?.length ? (
        <p
          className="px-3 py-4 text-xs"
          style={{ color: "var(--yos-text-secondary)" }}
        >
          {t("yusufOS:rail.empty")}
        </p>
      ) : (
        <ul
          className="yos-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2"
          aria-labelledby={headingId}
        >
          {visible.map((agent) => {
            const style = toneStyle(agent.tone);
            const selected = agent.agentId === selectedAgentId;
            const department = departments?.get(agent.agentId) || null;
            const statusLabel = agent.status
              ? t(`yusufOS:status.agent.${agent.status}`, {
                  defaultValue: agent.status,
                })
              : t("yusufOS:state.unknown");
            return (
              <li key={agent.agentId}>
                <button
                  type="button"
                  onClick={() => onSelectAgent(selected ? null : agent.agentId)}
                  aria-pressed={selected}
                  data-selected={selected ? "true" : "false"}
                  data-tone={agent.tone}
                  data-agent-row={agent.agentId}
                  className="yos-interactive yos-press yos-frame-inset flex w-full items-start gap-3 px-2.5 py-2 text-start"
                >
                  <span
                    className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-sm border"
                    style={{
                      borderColor: `color-mix(in srgb, ${style.graphic} 55%, transparent)`,
                      color:
                        agent.tone === TONES.APPROVAL
                          ? "var(--yos-amber)"
                          : "var(--yos-cyan-bright)",
                      background: "rgb(2 7 11 / 0.6)",
                    }}
                  >
                    <RoleIcon agentId={agent.agentId} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <UntrustedText
                        className="yos-mono truncate text-[12px] font-semibold uppercase"
                        style={{ color: "var(--yos-text)" }}
                      >
                        {agent.name}
                      </UntrustedText>
                      <span
                        className="yos-mono inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-px text-[9.5px] font-semibold uppercase"
                        style={{
                          color: style.text,
                          borderColor: `color-mix(in srgb, ${style.graphic} 60%, transparent)`,
                          background: `color-mix(in srgb, ${style.graphic} 12%, transparent)`,
                        }}
                      >
                        <StatusIcon tone={agent.tone} size={10} />
                        {statusLabel}
                      </span>
                    </span>
                    <span
                      className="mt-0.5 block truncate text-[11px]"
                      style={{ color: "var(--yos-text-secondary)" }}
                    >
                      {department ? (
                        <UntrustedText>{department.name}</UntrustedText>
                      ) : (
                        t("yusufOS:rail.noDepartment")
                      )}
                      {" · "}
                      {agent.capabilityCount === null
                        ? t("yusufOS:state.unknown")
                        : t("yusufOS:rail.capabilities", {
                            count: agent.capabilityCount,
                          })}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[10.5px]">
                      <span
                        className="yos-mono truncate"
                        style={{
                          color: agent.activeTaskId
                            ? style.text
                            : "var(--yos-text-muted)",
                        }}
                      >
                        {agent.activeTaskId
                          ? t("yusufOS:rail.onTask", {
                              id: shortId(agent.activeTaskId),
                            })
                          : t("yusufOS:rail.noWork")}
                      </span>
                      {department && Number.isFinite(department.jobs) ? (
                        <span
                          className="yos-mono shrink-0"
                          style={{ color: "var(--yos-text-muted)" }}
                        >
                          {t("yusufOS:rail.jobs", { count: department.jobs })}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!visible.length ? (
            <li
              className="px-2 py-3 text-xs"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {t("yusufOS:rail.filterEmpty")}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
