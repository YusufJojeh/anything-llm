import React, { useCallback, useId, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useYusufOS, PHASES } from "@/features/yusufOS/state/YusufOSProvider";
import { coreStateTone } from "@/features/yusufOS/state/commandCenterModel";
import { toneStyle } from "@/features/yusufOS/state/statusSemantics";
import AgentConstellation from "@/features/yusufOS/components/AgentConstellation";
import AgentRoster from "@/features/yusufOS/components/AgentRoster";
import AttentionQueue from "@/features/yusufOS/components/AttentionQueue";
import AgentDetailPanel from "@/features/yusufOS/components/AgentDetailPanel";
import SystemHealth from "@/features/yusufOS/components/SystemHealth";
import Drawer from "@/features/yusufOS/components/Drawer";
import {
  Count,
  LoadingBlock,
  Panel,
  SectionTitle,
  StatusIcon,
} from "@/features/yusufOS/components/primitives";

/**
 * The Command Center.
 *
 * Composition, deliberately: the constellation is the canvas and the operator
 * surfaces sit beside it. "Needs Yusuf" is placed above the fold on every
 * viewport — it is the single most important thing on the screen, and it is
 * not reachable only through a badge.
 *
 * Selection lives in the URL (`?agent=` / `?focus=core`) so a view is
 * shareable, survives a refresh, and works with the browser back button.
 */

function CoreSummary({ coreState, summary, onOpen }) {
  const { t } = useTranslation();
  const tone = coreStateTone(coreState);
  const style = toneStyle(tone);
  return (
    <Panel className="p-4">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col items-start gap-2 text-start"
      >
        <span
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: style.text }}
        >
          <StatusIcon tone={tone} size={13} />
          {coreState
            ? t(`yusufOS:core.state.${coreState}`)
            : t("yusufOS:state.unknown")}
        </span>
        <span
          className="text-sm leading-relaxed"
          style={{ color: "var(--yos-text-secondary)" }}
        >
          {coreState ? t(`yusufOS:core.detail.${coreState}`) : null}
        </span>
        <span className="text-xs" style={{ color: "var(--yos-text-muted)" }}>
          {summary.agentsTotal === 0
            ? t("yusufOS:core.noAgents")
            : t("yusufOS:core.agentsReporting", {
                reporting: summary.agentsReporting,
                total: summary.agentsTotal,
              })}
        </span>
      </button>

      {/*
       * Real counts only. Every one of these is a length or a number the
       * dashboard projection asserted — none are derived percentages and none
       * are shown while the value is unknown.
       */}
      <dl
        className="mt-4 grid grid-cols-3 gap-3 border-t pt-3"
        style={{ borderColor: "var(--yos-border-faint)" }}
      >
        {[
          ["yusufOS:approval.pending", summary.pendingApprovals],
          ["yusufOS:task.blockers", summary.blockedTasks],
          ["yusufOS:run.title", summary.activeRuns],
        ].map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5">
            <dt
              className="text-[10px] uppercase tracking-[0.1em]"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {t(key)}
            </dt>
            <dd
              className="text-xl font-semibold tabular-nums"
              style={{ color: "var(--yos-text)" }}
            >
              <Count value={value} />
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export default function CommandCenter() {
  const { t } = useTranslation();
  const { phase, dashboard, model, connection, realtime } = useYusufOS();
  const [params, setParams] = useSearchParams();
  const rosterHeadingId = useId();
  const attentionHeadingId = useId();

  const selectedAgentId = params.get("agent");
  const coreOpen = params.get("focus") === "core";

  const selectAgent = useCallback(
    (agentId) => {
      const next = new URLSearchParams(params);
      next.delete("focus");
      if (agentId) next.set("agent", agentId);
      else next.delete("agent");
      setParams(next, { replace: false });
    },
    [params, setParams]
  );

  const openCore = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("agent");
    next.set("focus", "core");
    setParams(next, { replace: false });
  }, [params, setParams]);

  const closePanels = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("agent");
    next.delete("focus");
    setParams(next, { replace: false });
  }, [params, setParams]);

  const selectedAgent = useMemo(
    () =>
      model.agents.find((agent) => agent.agentId === selectedAgentId) || null,
    [model.agents, selectedAgentId]
  );

  const loading = phase === PHASES.LOADING && !dashboard;

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 md:p-6 xl:flex-row">
      {/*
       * The constellation. Hidden below `lg` rather than shrunk: a ring of
       * nodes squeezed into 390px is unreadable, and the roster list below
       * carries the same information properly on that width.
       */}
      <section
        aria-labelledby="yos-constellation-heading"
        className="hidden min-w-0 flex-1 lg:block"
      >
        <h2 id="yos-constellation-heading" className="sr-only">
          {t("yusufOS:constellation.title")}
        </h2>
        <p className="sr-only">{t("yusufOS:constellation.description")}</p>
        <Panel className="h-full min-h-[520px] overflow-hidden">
          {loading ? (
            <LoadingBlock rows={8} />
          ) : (
            <AgentConstellation
              agents={model.agents}
              edges={model.edges}
              coreState={model.coreState}
              selectedAgentId={selectedAgentId}
              coreSelected={coreOpen}
              onSelectAgent={selectAgent}
              onSelectCore={openCore}
            />
          )}
        </Panel>
        {model.orphanedEdges.length ? (
          <p
            className="mt-2 px-1 text-[11px]"
            style={{ color: "var(--yos-warning-text)" }}
          >
            {t("yusufOS:constellation.orphanEdges", {
              count: model.orphanedEdges.length,
            })}
          </p>
        ) : null}
      </section>

      <div className="flex w-full min-w-0 flex-col gap-4 xl:w-[380px] xl:shrink-0">
        {loading || !model.summary ? (
          <Panel>
            <LoadingBlock rows={4} />
          </Panel>
        ) : (
          <CoreSummary
            coreState={model.coreState}
            summary={model.summary}
            onOpen={openCore}
          />
        )}

        <Panel aria-labelledby={attentionHeadingId}>
          <SectionTitle id={attentionHeadingId} className="px-4 pt-4">
            {t("yusufOS:attention.title")}
          </SectionTitle>
          <div className="mt-2">
            <AttentionQueue items={model.attention} loading={loading} />
          </div>
        </Panel>

        {/*
         * The accessible, non-graph equivalent of the constellation — and on
         * narrow screens, the primary representation. Always rendered, never a
         * fallback that only appears when the graph fails.
         */}
        <Panel aria-labelledby={rosterHeadingId}>
          <SectionTitle id={rosterHeadingId} className="px-4 pt-4">
            {t("yusufOS:agent.title")}
          </SectionTitle>
          <div className="mt-2">
            {loading ? (
              <LoadingBlock rows={4} />
            ) : (
              <AgentRoster
                agents={model.agents}
                edges={model.edges}
                selectedAgentId={selectedAgentId}
                onSelectAgent={selectAgent}
                labelledBy={rosterHeadingId}
              />
            )}
          </div>
        </Panel>
      </div>

      <Drawer
        open={Boolean(selectedAgent)}
        onClose={closePanels}
        title={selectedAgent?.name || ""}
      >
        <AgentDetailPanel agent={selectedAgent} edges={model.edges} />
      </Drawer>

      <Drawer
        open={coreOpen}
        onClose={closePanels}
        title={t("yusufOS:core.title")}
      >
        <SystemHealth
          dashboard={dashboard}
          summary={model.summary}
          connection={connection}
          realtime={realtime}
        />
      </Drawer>
    </div>
  );
}
