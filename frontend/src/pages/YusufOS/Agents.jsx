import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CaretRight, CheckCircle } from "@phosphor-icons/react";
import { yusufApi } from "@/features/yusufOS/api/client";
import {
  useYusufOS,
  useYusufResource,
  PHASES,
} from "@/features/yusufOS/state/YusufOSProvider";
import {
  buildWorkspaceGroups,
  deriveWorkspaceState,
  workspaceStateTone,
} from "@/features/yusufOS/state/commandCenterModel";
import { toneStyle } from "@/features/yusufOS/state/statusSemantics";
import { roleFor } from "@/features/yusufOS/state/agentRoles";
import AgentDetailPanel from "@/features/yusufOS/components/AgentDetailPanel";
import VoiceConsole from "@/features/yusufOS/components/VoiceConsole";
import {
  EmptyState,
  ErrorBlock,
  KeyValue,
  LoadingBlock,
  Panel,
  SectionTitle,
  StatusChip,
  StatusIcon,
  Timestamp,
  UntrustedText,
} from "@/features/yusufOS/components/primitives";

/**
 * The Agent Workspace.
 *
 * LEFT: the roster, grouped by real Department. CENTER: the selected Agent's
 * current run, told through the same governed chain every run drilldown
 * shows — capability requested, policy decision, approval, execution
 * receipt, verification, evidence, review verdict. RIGHT: Agent identity,
 * its current Task, and that Task's evidence. BOTTOM: the real voice dock.
 *
 * Nothing here is invented. The console state shown in the header is a
 * coarse label derived only from `run.status` and intent status
 * (`deriveWorkspaceState` in `commandCenterModel.js`) — it is never chain-of-
 * thought, and the literal backend status is always rendered next to it. An
 * Agent with no current run says so; a Task with no evidence says so.
 */

const RIGHT_TABS = ["agent", "task", "evidence"];

function WorkspaceStateChip({ state }) {
  const { t } = useTranslation();
  if (!state) return null;
  const tone = workspaceStateTone(state);
  const style = toneStyle(tone);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
      style={{
        color: style.text,
        borderColor: `color-mix(in srgb, ${style.graphic} 45%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${style.graphic} 12%, transparent)`,
      }}
    >
      <StatusIcon tone={tone} size={13} />
      {t(`yusufOS:workspace.state.${state}`)}
    </span>
  );
}

function AgentRow({ agent, selected, onSelect }) {
  const { t } = useTranslation();
  const role = roleFor(agent.agentId);
  const style = toneStyle(agent.tone);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(agent.agentId)}
        aria-pressed={selected}
        data-selected={selected ? "true" : "false"}
        className="yos-row yos-touch-target flex w-full items-center gap-2.5 border-b px-3 py-2.5 text-start"
        style={{
          borderColor: "var(--yos-border-faint)",
          backgroundColor: selected
            ? "var(--yos-surface-hover)"
            : "transparent",
        }}
      >
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
          style={{
            border: `1.5px solid ${style.graphic}`,
            color: "var(--yos-text-secondary)",
            backgroundColor: "var(--yos-surface-raised)",
          }}
        >
          {role.glyph}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <UntrustedText
            className="text-sm font-medium"
            style={{ color: "var(--yos-text)" }}
          >
            {agent.name}
          </UntrustedText>
          <StatusChip domain="agent" status={agent.status} size="sm" />
        </span>
        <CaretRight
          size={12}
          aria-hidden="true"
          className="shrink-0 rtl:rotate-180"
          style={{ color: "var(--yos-text-muted)" }}
        />
        {!agent.hasIdentity ? (
          <span className="sr-only">{t("yusufOS:agent.unknownIdentity")}</span>
        ) : null}
      </button>
    </li>
  );
}

function WorkspaceRoster({ groups, selectedAgentId, onSelect, headingId }) {
  const { t } = useTranslation();
  const ungroupedOnly = groups.length === 1 && groups[0].departmentId === null;

  if (groups.every((group) => group.agents.length === 0))
    return <EmptyState title={t("yusufOS:agent.empty")} />;

  return (
    <div aria-labelledby={headingId}>
      {groups.map((group) =>
        group.agents.length === 0 ? null : (
          <div key={group.departmentId || "ungrouped"} className="mb-1">
            {group.name || (!ungroupedOnly && group.departmentId === null) ? (
              <p
                className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--yos-text-muted)" }}
              >
                <UntrustedText>
                  {group.name || t("yusufOS:workspace.otherAgents")}
                </UntrustedText>
              </p>
            ) : null}
            <ul className="flex flex-col">
              {group.agents.map((agent) => (
                <AgentRow
                  key={agent.agentId}
                  agent={agent}
                  selected={agent.agentId === selectedAgentId}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

function ConsoleIntent({ intent }) {
  const { t } = useTranslation();
  const latestDecision =
    intent.policyDecisions[intent.policyDecisions.length - 1] || null;
  return (
    <li
      className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0"
      style={{ borderColor: "var(--yos-border-faint)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="font-mono text-xs font-semibold"
          style={{ color: "var(--yos-text)" }}
        >
          {intent.capabilityKey}
        </span>
        <StatusChip domain="execution" status={intent.status} size="sm" />
      </div>
      {latestDecision ? (
        <p className="text-xs" style={{ color: "var(--yos-text-secondary)" }}>
          {latestDecision.outcome} · {latestDecision.riskLevel} ·{" "}
          {latestDecision.reasonCode}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {intent.approval ? (
          <StatusChip
            domain="approval"
            status={intent.approval.status}
            size="sm"
          />
        ) : null}
        {intent.receipt ? (
          <span
            className="text-[11px]"
            style={{ color: "var(--yos-text-muted)" }}
          >
            {t("yusufOS:run.receipt")}: {intent.receipt.outcome} ·{" "}
            {intent.receipt.verificationStatus}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function WorkspaceConsole({ agent }) {
  const { t } = useTranslation();
  const { realtime } = useYusufOS();
  const runId = agent.currentRunId || null;
  const role = roleFor(agent.agentId);

  const loadRun = useCallback(
    (options) =>
      runId ? yusufApi.runDetail(runId, options) : Promise.resolve(null),
    [runId]
  );
  const run = useYusufResource(loadRun, {
    watch: realtime.lastAppliedSequence,
  });

  const detail = run.data && run.data.run ? run.data : null;
  const loading = Boolean(runId) && run.phase === PHASES.LOADING;
  const failed =
    Boolean(runId) &&
    (run.phase === PHASES.ERROR || (run.phase === PHASES.READY && !detail));
  const workspaceState =
    loading || failed
      ? null
      : deriveWorkspaceState({
          agentStatus: agent.status,
          runStatus: detail?.run?.status ?? null,
          intents: detail?.intents ?? [],
        });

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        className="flex flex-wrap items-center gap-3 border-b px-4 py-4"
        style={{ borderColor: "var(--yos-border-faint)" }}
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold"
          style={{
            border: `1.5px solid ${toneStyle(agent.tone).graphic}`,
            color: "var(--yos-text-secondary)",
            backgroundColor: "var(--yos-surface-raised)",
          }}
        >
          {role.glyph}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <UntrustedText
            as="h2"
            className="text-base font-semibold"
            style={{ color: "var(--yos-text)" }}
          >
            {agent.name}
          </UntrustedText>
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip domain="agent" status={agent.status} size="sm" />
            <WorkspaceStateChip state={workspaceState} />
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {!runId ? (
          <EmptyState title={t("yusufOS:workspace.noRun")} />
        ) : loading ? (
          <LoadingBlock rows={6} />
        ) : failed ? (
          <ErrorBlock
            error={run.error || { code: "MALFORMED_RESPONSE", message: null }}
          />
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {detail.task ? (
              <Panel className="p-4">
                <SectionTitle>{t("yusufOS:agent.currentTask")}</SectionTitle>
                <UntrustedText
                  as="p"
                  className="mt-2 text-sm"
                  style={{ color: "var(--yos-text)" }}
                >
                  {detail.task.title}
                </UntrustedText>
                <StatusChip
                  domain="task"
                  status={detail.task.status}
                  size="sm"
                  className="mt-2"
                />
              </Panel>
            ) : null}

            <Panel>
              <SectionTitle className="px-4 pt-4">
                {t("yusufOS:run.timeline")}
              </SectionTitle>
              <ul className="mt-2">
                {detail.intents.length === 0 ? (
                  <li
                    className="px-4 pb-4 text-sm"
                    style={{ color: "var(--yos-text-muted)" }}
                  >
                    {t("yusufOS:run.noIntents")}
                  </li>
                ) : (
                  detail.intents.map((intent) => (
                    <ConsoleIntent key={intent.intentId} intent={intent} />
                  ))
                )}
              </ul>
            </Panel>

            {detail.reviewVerdict ? (
              <Panel className="p-4">
                <SectionTitle>{t("yusufOS:run.reviewVerdict")}</SectionTitle>
                <div className="mt-2 flex flex-col gap-2">
                  <StatusChip
                    domain="review"
                    status={detail.reviewVerdict.verdict}
                    size="sm"
                  />
                  <UntrustedText
                    className="text-sm"
                    style={{ color: "var(--yos-text-secondary)" }}
                  >
                    {detail.reviewVerdict.summary}
                  </UntrustedText>
                </div>
              </Panel>
            ) : null}

            {detail.evidence.length ? (
              <Panel>
                <SectionTitle className="px-4 pt-4">
                  {t("yusufOS:run.evidence")}
                </SectionTitle>
                <ul className="mt-2">
                  {detail.evidence.map((row) => (
                    <li
                      key={row.evidenceId}
                      className="flex flex-col gap-1 border-b px-4 py-3 last:border-b-0"
                      style={{ borderColor: "var(--yos-border-faint)" }}
                    >
                      <span
                        className="text-[11px] font-semibold uppercase tracking-[0.1em]"
                        style={{ color: "var(--yos-text-muted)" }}
                      >
                        {row.kind} · {row.status}
                      </span>
                      <UntrustedText
                        className="text-sm"
                        style={{ color: "var(--yos-text-secondary)" }}
                      >
                        {row.summary}
                      </UntrustedText>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            {detail.handoffs.length ? (
              <Panel>
                <SectionTitle className="px-4 pt-4">
                  {t("yusufOS:run.handoffs")}
                </SectionTitle>
                <ul className="mt-2">
                  {detail.handoffs.map((handoff) => (
                    <li
                      key={`${handoff.handoffId}-${handoff.direction}`}
                      className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 last:border-b-0"
                      style={{ borderColor: "var(--yos-border-faint)" }}
                    >
                      <UntrustedText
                        className="text-sm"
                        style={{ color: "var(--yos-text)" }}
                      >
                        {`${handoff.direction} · ${handoff.counterpartAgentId} · ${handoff.gate}`}
                      </UntrustedText>
                      <StatusChip
                        domain="handoff"
                        status={handoff.status}
                        size="sm"
                      />
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            <Link
              to={`/os/runs/${detail.run.runId}`}
              className="yos-touch-target self-start rounded px-3 text-xs font-medium"
              style={{
                border: "1px solid var(--yos-border-strong)",
                color: "var(--yos-text)",
              }}
            >
              {t("yusufOS:workspace.openFullRun")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskTab({ agent, taskResource }) {
  const { t } = useTranslation();
  if (!agent.activeTaskId)
    return <EmptyState title={t("yusufOS:workspace.noTask")} />;
  if (taskResource.phase === PHASES.LOADING) return <LoadingBlock rows={5} />;
  const data = taskResource.data;
  if (taskResource.phase === PHASES.ERROR || !data?.task)
    return (
      <ErrorBlock
        error={
          taskResource.error || { code: "MALFORMED_RESPONSE", message: null }
        }
      />
    );

  const { task, completion } = data;
  return (
    <div className="flex flex-col gap-4">
      <UntrustedText
        as="p"
        className="text-sm leading-relaxed"
        style={{ color: "var(--yos-text-secondary)" }}
      >
        {task.objective}
      </UntrustedText>
      <dl className="grid grid-cols-2 gap-3">
        <KeyValue label={t("yusufOS:task.status")}>
          <StatusChip domain="task" status={task.status} size="sm" />
        </KeyValue>
        <KeyValue label={t("yusufOS:task.priority")}>{task.priority}</KeyValue>
        <KeyValue label={t("yusufOS:task.owner")}>
          {task.ownerAgentId || t("yusufOS:task.unassigned")}
        </KeyValue>
        <KeyValue label={t("yusufOS:task.project")}>
          {task.project ? (
            <UntrustedText>{task.project.name}</UntrustedText>
          ) : (
            t("yusufOS:task.noProject")
          )}
        </KeyValue>
      </dl>
      <div>
        <SectionTitle>{t("yusufOS:task.completion")}</SectionTitle>
        <p className="mt-2 text-sm" style={{ color: "var(--yos-text)" }}>
          {t("yusufOS:task.gatesSatisfied", {
            satisfied: completion.gates.satisfied,
            total: completion.gates.total,
          })}
        </p>
        {completion.complete ? (
          <p
            className="mt-2 flex items-center gap-2 text-sm"
            style={{ color: "var(--yos-healthy-text)" }}
          >
            <CheckCircle size={15} aria-hidden="true" />
            {t("yusufOS:task.complete")}
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {completion.blockers.map((blocker) => (
              <li
                key={blocker}
                className="rounded px-2 py-1 text-[11px] font-medium"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--yos-blocked-graphic) 14%, transparent)",
                  color: "var(--yos-blocked-text)",
                }}
              >
                {t(`yusufOS:blocker.${blocker}`, { defaultValue: blocker })}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link
        to={`/os/tasks/${task.taskId}`}
        className="yos-touch-target self-start rounded px-3 text-xs font-medium"
        style={{
          border: "1px solid var(--yos-border-strong)",
          color: "var(--yos-text)",
        }}
      >
        {t("yusufOS:workspace.openFullTask")}
      </Link>
    </div>
  );
}

function EvidenceTab({ agent, taskResource }) {
  const { t } = useTranslation();
  if (!agent.activeTaskId)
    return <EmptyState title={t("yusufOS:workspace.noTask")} />;
  if (taskResource.phase === PHASES.LOADING) return <LoadingBlock rows={5} />;
  const data = taskResource.data;
  if (taskResource.phase === PHASES.ERROR || !data?.task)
    return (
      <ErrorBlock
        error={
          taskResource.error || { code: "MALFORMED_RESPONSE", message: null }
        }
      />
    );
  if (!data.evidence.length)
    return <EmptyState title={t("yusufOS:task.noEvidence")} />;
  return (
    <ul className="flex flex-col gap-3">
      {data.evidence.map((row) => (
        <li
          key={row.evidenceId}
          className="flex flex-col gap-1 rounded p-2.5"
          style={{ backgroundColor: "var(--yos-surface-hover)" }}
        >
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--yos-text-muted)" }}
          >
            {row.kind} · {row.status}
          </span>
          <UntrustedText
            className="text-sm"
            style={{ color: "var(--yos-text-secondary)" }}
          >
            {row.summary}
          </UntrustedText>
          <span
            className="text-[11px]"
            style={{ color: "var(--yos-text-muted)" }}
          >
            <Timestamp value={row.createdAt} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function WorkspaceTabs({ agent, edges }) {
  const { t } = useTranslation();
  const [active, setActive] = useState("agent");
  const tabRefs = useRef([]);

  const loadTask = useCallback(
    (options) =>
      agent.activeTaskId
        ? yusufApi.taskDetail(agent.activeTaskId, options)
        : Promise.resolve(null),
    [agent.activeTaskId]
  );
  const { realtime } = useYusufOS();
  const taskResource = useYusufResource(loadTask, {
    watch: realtime.lastAppliedSequence,
  });

  const onKeyDown = (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = RIGHT_TABS.indexOf(active);
    const nextIndex =
      event.key === "ArrowRight"
        ? (index + 1) % RIGHT_TABS.length
        : (index - 1 + RIGHT_TABS.length) % RIGHT_TABS.length;
    const next = RIGHT_TABS[nextIndex];
    setActive(next);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="flex w-full min-w-0 flex-col xl:w-[340px] xl:shrink-0 xl:overflow-y-auto">
      <div
        role="tablist"
        aria-label={t("yusufOS:workspace.console")}
        className="flex border-b"
        style={{ borderColor: "var(--yos-border-faint)" }}
        onKeyDown={onKeyDown}
      >
        {RIGHT_TABS.map((tab, index) => (
          <button
            key={tab}
            ref={(el) => (tabRefs.current[index] = el)}
            type="button"
            role="tab"
            id={`workspace-tab-${tab}`}
            aria-selected={active === tab}
            aria-controls={`workspace-tabpanel-${tab}`}
            tabIndex={active === tab ? 0 : -1}
            onClick={() => setActive(tab)}
            className="yos-touch-target flex-1 border-b-2 px-3 py-2.5 text-xs font-semibold"
            style={{
              borderColor: active === tab ? "var(--yos-accent)" : "transparent",
              color:
                active === tab
                  ? "var(--yos-text)"
                  : "var(--yos-text-secondary)",
            }}
          >
            {t(`yusufOS:workspace.tabs.${tab}`)}
          </button>
        ))}
      </div>
      {RIGHT_TABS.map((tab) => (
        <div
          key={tab}
          role="tabpanel"
          id={`workspace-tabpanel-${tab}`}
          aria-labelledby={`workspace-tab-${tab}`}
          hidden={active !== tab}
          className="p-4"
        >
          {tab === "agent" ? (
            <AgentDetailPanel agent={agent} edges={edges} />
          ) : tab === "task" ? (
            <TaskTab agent={agent} taskResource={taskResource} />
          ) : (
            <EvidenceTab agent={agent} taskResource={taskResource} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function Agents() {
  const { t } = useTranslation();
  const { phase, dashboard, model, runtime } = useYusufOS();
  const [params, setParams] = useSearchParams();
  const headingId = useId();
  const selectedAgentId = params.get("agent");

  const select = useCallback(
    (agentId) => {
      const next = new URLSearchParams(params);
      if (agentId) next.set("agent", agentId);
      else next.delete("agent");
      setParams(next);
    },
    [params, setParams]
  );

  const groups = useMemo(
    () => buildWorkspaceGroups({ runtime, agents: model.agents }),
    [runtime, model.agents]
  );

  const selected = useMemo(
    () =>
      model.agents.find((agent) => agent.agentId === selectedAgentId) || null,
    [model.agents, selectedAgentId]
  );

  const loading = phase === PHASES.LOADING && !dashboard;

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 md:p-6 xl:h-full xl:min-h-0">
      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row xl:overflow-hidden">
        <Panel
          aria-labelledby={headingId}
          className="flex w-full min-w-0 flex-col xl:w-[280px] xl:shrink-0 xl:overflow-y-auto"
        >
          <SectionTitle id={headingId} className="px-4 pt-4">
            {t("yusufOS:agent.listLabel")}
          </SectionTitle>
          <div className="mt-2">
            {loading ? (
              <LoadingBlock rows={5} />
            ) : (
              <WorkspaceRoster
                groups={groups}
                selectedAgentId={selectedAgentId}
                onSelect={select}
                headingId={headingId}
              />
            )}
          </div>
        </Panel>

        <Panel className="flex min-w-0 flex-1 flex-col xl:min-h-0">
          {loading ? (
            <LoadingBlock rows={8} />
          ) : selected ? (
            <WorkspaceConsole key={selected.agentId} agent={selected} />
          ) : (
            <EmptyState title={t("yusufOS:workspace.selectPrompt")} />
          )}
        </Panel>

        {selected ? (
          <WorkspaceTabs agent={selected} edges={model.edges} />
        ) : null}
      </div>

      <VoiceConsole variant="dock" />
    </div>
  );
}
