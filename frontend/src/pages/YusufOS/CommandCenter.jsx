import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CaretDown } from "@phosphor-icons/react";
import { useYusufOS, PHASES } from "@/features/yusufOS/state/YusufOSProvider";
import { yusufApi } from "@/features/yusufOS/api/client";
import {
  CommandSessionProvider,
  useCommandSession,
} from "@/features/yusufOS/state/CommandSession";
import { deriveCoreMode } from "@/features/yusufOS/state/coreMode";
import {
  deriveStages,
  hasRecentStageEvent,
} from "@/features/yusufOS/state/operationStages";
import {
  buildCorePanels,
  buildCurrentOperation,
  departmentIndex,
} from "@/features/yusufOS/state/consoleModel";
import AttentionQueue from "@/features/yusufOS/components/AttentionQueue";
import AgentDetailPanel from "@/features/yusufOS/components/AgentDetailPanel";
import SystemHealth from "@/features/yusufOS/components/SystemHealth";
import Drawer from "@/features/yusufOS/components/Drawer";
import AgentRail from "@/features/yusufOS/components/console/AgentRail";
import SystemCore from "@/features/yusufOS/components/console/SystemCore";
import CommunicationConsole from "@/features/yusufOS/components/console/CommunicationConsole";
import ContextPanel from "@/features/yusufOS/components/console/ContextPanel";
import {
  CorePanel,
  CurrentOperation,
  StageRail,
} from "@/features/yusufOS/components/console/CoreStage";
import { toneFor, toneStyle } from "@/features/yusufOS/state/statusSemantics";

/**
 * The Command Center — a single integrated console:
 *
 *   telemetry strip (shell)
 *   Needs Yusuf + Agents │ System Core + panels + stages + operation │ Comms + Context
 *   mission nav (shell)
 *
 * Selection lives in the URL (`?agent=` / `?focus=core`) so a view is
 * shareable, survives a refresh, and works with the back button. Below 1024px
 * the same areas stack in operator order (core, needs Yusuf, communication,
 * agents, context) — see `.yos-console` in tokens.css.
 */

const LEFT_PANELS = ["PROCESSING", "KNOWLEDGE", "TOOLS"];
const RIGHT_PANELS = ["INTELLIGENCE", "AUTOMATION", "HEALTH"];

/**
 * Re-evaluates time-windowed stage state only while something can still
 * expire: an in-flight command or an event inside the RECENT window. Once
 * everything has aged out the interval stops, so an idle console does not
 * re-render on a timer.
 */
function useNow(recentEvents, processing, interval = 3000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!processing && !recentEvents.length) return undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (!processing && !hasRecentStageEvent(recentEvents, current))
        clearInterval(timer);
    };
    // Take a fresh reading as soon as a new event lands, not 3s later: a
    // stale clock would make a just-received event look like the future.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, interval);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [recentEvents, processing, interval]);
  return now;
}

function Console() {
  const { t } = useTranslation();
  const {
    phase,
    dashboard,
    model,
    connection,
    realtime,
    runtime,
    runtimePhase,
    refresh,
  } = useYusufOS();
  const session = useCommandSession();
  const [params, setParams] = useSearchParams();
  const [agentsOpen, setAgentsOpen] = useState(true);
  // Phones show the Core first and fold its six telemetry panels away.
  const [panelsOpen, setPanelsOpen] = useState(false);
  const ids = {
    attention: useId(),
    agents: useId(),
    core: useId(),
    comms: useId(),
    context: useId(),
  };

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

  // Acknowledging a durable notification is the existing governed endpoint;
  // the snapshot is re-read so the queue reflects what the server recorded.
  const acknowledgeNotification = useCallback(
    async (notificationId) => {
      await yusufApi.acknowledgeNotification(notificationId);
      await refresh();
    },
    [refresh]
  );

  const selectedAgent = useMemo(
    () =>
      model.agents.find((agent) => agent.agentId === selectedAgentId) || null,
    [model.agents, selectedAgentId]
  );
  const loading = phase === PHASES.LOADING && !dashboard;
  const recentEvents = realtime?.recent || [];
  const now = useNow(recentEvents, session.phase === "PROCESSING");
  const stages = useMemo(
    () => deriveStages({ recentEvents, voicePhase: session.phase, now }),
    [recentEvents, session.phase, now]
  );
  const mode = deriveCoreMode({
    coreState: model.coreState,
    connection,
    voicePhase: session.phase,
    stages,
  });
  const departments = useMemo(() => departmentIndex(runtime), [runtime]);
  const panels = useMemo(
    () =>
      buildCorePanels({
        summary: model.summary,
        runtime,
        runtimePhase,
        dashboard,
      }),
    [model.summary, runtime, runtimePhase, dashboard]
  );
  const operation = useMemo(
    () =>
      buildCurrentOperation({
        dashboard,
        agents: model.agents,
        runtime,
        commandPhase: session.phase,
        lastCommand: session.lastResult,
      }),
    [dashboard, model.agents, runtime, session.phase, session.lastResult]
  );
  const completions = runtime?.modelRuntime?.recentCompletions || [];
  const stateLabel = model.coreState
    ? t(`yusufOS:core.state.${model.coreState}`)
    : t("yusufOS:state.unknown");
  const attentionCount = model.attention ? model.attention.length : null;

  return (
    <div className="yos-console" data-core-mode={mode}>
      <section
        data-area="attention"
        aria-labelledby={ids.attention}
        className="yos-frame flex min-h-0 flex-col"
      >
        <div className="flex items-center justify-between px-3 pt-3">
          <h2
            id={ids.attention}
            className="yos-title"
            style={{ color: attentionCount ? "var(--yos-amber)" : undefined }}
          >
            {t("yusufOS:attention.title")}
          </h2>
          {attentionCount !== null ? (
            <span
              className="yos-mono rounded-sm px-1.5 text-[11px]"
              style={{
                background: attentionCount
                  ? "rgb(255 184 77 / 0.18)"
                  : "rgb(75 202 255 / 0.08)",
                color: attentionCount
                  ? "var(--yos-amber)"
                  : "var(--yos-text-muted)",
              }}
            >
              {attentionCount}
            </span>
          ) : null}
        </div>
        <div className="yos-scroll mt-1 max-h-[260px] overflow-y-auto">
          <AttentionQueue
            items={model.attention}
            loading={loading}
            onAcknowledge={acknowledgeNotification}
          />
        </div>
      </section>

      <section
        data-area="agents"
        aria-labelledby={ids.agents}
        className="yos-frame flex min-h-0 flex-col"
      >
        <button
          type="button"
          className="flex min-h-[44px] items-center justify-between px-3 lg:hidden"
          aria-expanded={agentsOpen}
          onClick={() => setAgentsOpen((open) => !open)}
        >
          <span className="yos-label">{t("yusufOS:rail.toggle")}</span>
          <CaretDown
            size={14}
            aria-hidden="true"
            style={{ transform: agentsOpen ? "rotate(180deg)" : undefined }}
          />
        </button>
        <div
          className={`min-h-0 flex-1 ${agentsOpen ? "flex" : "hidden lg:flex"} flex-col`}
        >
          <AgentRail
            agents={model.agents}
            departments={departments}
            selectedAgentId={selectedAgentId}
            onSelectAgent={selectAgent}
            loading={loading}
            headingId={ids.agents}
          />
        </div>
      </section>

      <section
        data-area="core"
        aria-labelledby={ids.core}
        className="yos-frame flex min-h-0 flex-col gap-2 p-2 md:p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h2 id={ids.core} className="yos-title">
              {t("yusufOS:coreView.systemCore")}
            </h2>
            <nav
              aria-label={t("yusufOS:coreView.viewsLabel")}
              className="hidden items-center md:flex"
            >
              <span className="yos-tab px-3 py-2" aria-current="page">
                {t("yusufOS:coreView.live")}
              </span>
              <Link to="/os/runtime" className="yos-tab px-3 py-2">
                {t("yusufOS:nav.runtime")}
              </Link>
              <Link to="/os/runs" className="yos-tab px-3 py-2">
                {t("yusufOS:nav.runs")}
              </Link>
              <Link to="/os/system" className="yos-tab px-3 py-2">
                {t("yusufOS:nav.system")}
              </Link>
            </nav>
          </div>
          <span
            className="yos-mono flex items-center gap-1.5 text-[10px] font-semibold uppercase"
            style={{ color: toneStyle(toneFor("connection", connection)).text }}
          >
            <span className="yos-status-dot" aria-hidden="true" />
            {t("yusufOS:coreView.realtime")} ·{" "}
            {t(`yusufOS:connection.${connection || "IDLE"}`)}
          </span>
        </div>

        {/*
         * The Core fills the whole stage and the support panels overlay its
         * outer rings, as in a mission display; on phones they stack below.
         */}
        <div
          className="yos-core-stage"
          data-panels={panelsOpen ? "open" : "closed"}
        >
          <div className="yos-core-cell">
            <SystemCore
              mode={mode}
              stateLabel={stateLabel}
              agents={model.agents}
              edges={model.edges}
              selectedAgentId={selectedAgentId}
              onSelectAgent={selectAgent}
              onOpenCore={openCore}
              signal={session.signal}
            />
          </div>
          <div className="yos-core-side" data-side="start">
            {LEFT_PANELS.map((id) => (
              <CorePanel
                key={id}
                id={id}
                panel={panels[id]}
                completions={completions}
              />
            ))}
          </div>
          <div className="yos-core-side" data-side="end">
            {RIGHT_PANELS.map((id) => (
              <CorePanel
                key={id}
                id={id}
                panel={panels[id]}
                completions={completions}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          className="yos-press flex min-h-[44px] items-center justify-between rounded-sm border px-3 md:hidden yos-divider"
          aria-expanded={panelsOpen}
          onClick={() => setPanelsOpen((open) => !open)}
        >
          <span className="yos-label">
            {t("yusufOS:coreView.panelsToggle")}
          </span>
          <CaretDown
            size={14}
            aria-hidden="true"
            style={{ transform: panelsOpen ? "rotate(180deg)" : undefined }}
          />
        </button>
        <p className="sr-only" aria-live="polite" data-core-mode-announce>
          {t("yusufOS:coreView.modeAnnounce", {
            mode: t(`yusufOS:coreView.mode.${mode}`),
          })}
        </p>
        <div className="mx-auto w-full max-w-[560px]">
          <StageRail stages={stages} />
        </div>
        {model.orphanedEdges.length ? (
          <p
            className="px-1 text-[11px]"
            style={{ color: "var(--yos-warning-text)" }}
          >
            {t("yusufOS:constellation.orphanEdges", {
              count: model.orphanedEdges.length,
            })}
          </p>
        ) : null}
        <CurrentOperation operation={operation} />
      </section>

      <section
        data-area="comms"
        aria-labelledby={ids.comms}
        className="yos-frame flex min-h-[520px] flex-col xl:min-h-0"
      >
        <CommunicationConsole
          dashboard={dashboard}
          runtime={runtime}
          recentEvents={recentEvents}
          connection={connection}
          headingId={ids.comms}
        />
      </section>

      <section
        data-area="context"
        aria-labelledby={ids.context}
        className="yos-frame flex min-h-[240px] flex-col xl:min-h-0"
      >
        <ContextPanel
          operation={operation}
          lastCommand={session.lastResult}
          runtime={runtime}
          runtimePhase={runtimePhase}
          dashboard={dashboard}
          selectedAgent={selectedAgent}
          headingId={ids.context}
        />
      </section>

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

export default function CommandCenter() {
  // The /os root provides the session so the transcript survives navigating
  // to a task/approval and back; standalone renders get their own.
  const existing = useCommandSession();
  if (existing) return <Console />;
  return (
    <CommandSessionProvider>
      <Console />
    </CommandSessionProvider>
  );
}
