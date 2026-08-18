import React from "react";
import { useTranslation } from "react-i18next";
import { CaretRight } from "@phosphor-icons/react";
import { StatusChip, UntrustedText, EmptyState } from "./primitives";
import { toneStyle } from "../state/statusSemantics";

/**
 * The accessible, non-graph equivalent of the constellation.
 *
 * This is not a fallback or a degraded view — it is the same data, the same
 * selection state, and the same relationships, expressed as a list. It is what
 * keyboard and screen-reader users operate, what narrow screens show instead
 * of the graph, and what makes the constellation optional rather than load
 * bearing.
 *
 * Each row states, in text: who the Agent is, what state it is in, what it is
 * working on, and who it is currently handing work to or receiving it from.
 */
export default function AgentRoster({
  agents,
  edges,
  selectedAgentId,
  onSelectAgent,
  labelledBy,
}) {
  const { t } = useTranslation();

  if (!agents.length) return <EmptyState title={t("yusufOS:agent.empty")} />;

  const relationsFor = (agentId) =>
    edges.filter(
      (edge) => edge.fromAgentId === agentId || edge.toAgentId === agentId
    );

  return (
    <ul
      className="flex flex-col"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : t("yusufOS:agent.listLabel")}
    >
      {agents.map((agent) => {
        const relations = relationsFor(agent.agentId);
        const selected = agent.agentId === selectedAgentId;
        const style = toneStyle(agent.tone);
        return (
          <li key={agent.agentId}>
            <button
              type="button"
              onClick={() => onSelectAgent(agent.agentId)}
              aria-pressed={selected}
              className="yos-touch-target flex w-full items-center gap-3 border-b px-4 py-3 text-start transition-colors"
              style={{
                borderColor: "var(--yos-border-faint)",
                backgroundColor: selected
                  ? "var(--yos-surface-hover)"
                  : "transparent",
              }}
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: style.graphic }}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <UntrustedText
                    className="text-sm font-semibold"
                    style={{ color: "var(--yos-text)" }}
                  >
                    {agent.name}
                  </UntrustedText>
                  <StatusChip domain="agent" status={agent.status} size="sm" />
                </span>

                {/*
                 * Relationships as sentences, so the graph's meaning survives
                 * without the graph.
                 */}
                {relations.length ? (
                  <span
                    className="flex flex-col gap-0.5 text-xs"
                    style={{ color: "var(--yos-text-secondary)" }}
                  >
                    {relations.map((edge) => (
                      <UntrustedText key={edge.id}>
                        {t("yusufOS:constellation.edgeLabel", {
                          from: edge.fromAgentId,
                          to: edge.toAgentId,
                          gate: edge.gate,
                        })}
                      </UntrustedText>
                    ))}
                  </span>
                ) : (
                  <span
                    className="text-xs"
                    style={{ color: "var(--yos-text-muted)" }}
                  >
                    {t("yusufOS:agent.noRelationships")}
                  </span>
                )}

                {agent.capabilityCount !== null ? (
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--yos-text-muted)" }}
                  >
                    {t("yusufOS:agent.capabilityCount", {
                      count: agent.capabilityCount,
                    })}
                  </span>
                ) : null}

                {!agent.hasIdentity ? (
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--yos-warning-text)" }}
                  >
                    {t("yusufOS:agent.unknownIdentity")}
                  </span>
                ) : null}
              </span>
              <CaretRight
                size={14}
                aria-hidden="true"
                className="shrink-0 rtl:rotate-180"
                style={{ color: "var(--yos-text-muted)" }}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
