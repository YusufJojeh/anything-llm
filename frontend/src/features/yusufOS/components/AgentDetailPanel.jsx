import React, { useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { yusufApi } from "../api/client";
import { useYusufResource, useYusufOS, PHASES } from "../state/YusufOSProvider";
import {
  ErrorBlock,
  KeyValue,
  LoadingBlock,
  SectionTitle,
  StatusChip,
  Timestamp,
  UntrustedText,
} from "./primitives";

/**
 * Agent detail.
 *
 * Everything shown is either roster identity or a field from the run
 * projection. There is no "current step" invented from Agent prose — if the
 * backend does not record a step, the panel does not claim one. Actions are
 * limited to navigation: there is no control here the control plane would
 * refuse, because Gate G exposes no Agent lifecycle mutations.
 */
export default function AgentDetailPanel({ agent, edges }) {
  const { t } = useTranslation();
  const { realtime } = useYusufOS();
  const runId = agent?.currentRunId || null;

  const loadRun = useCallback(
    (options) =>
      runId ? yusufApi.runDetail(runId, options) : Promise.resolve(null),
    [runId]
  );
  const run = useYusufResource(loadRun, {
    watch: realtime.lastAppliedSequence,
  });

  if (!agent) return null;

  const relations = edges.filter(
    (edge) =>
      edge.fromAgentId === agent.agentId || edge.toAgentId === agent.agentId
  );
  // Guarded rather than trusted: `run.data` is a server response, and a
  // response that is missing `run` (an unexpected shape, a truncated body)
  // must render as an error, not throw out of render and take the console
  // down with it.
  const detail = run.data && run.data.run ? run.data : null;
  const detailUnusable = run.phase === PHASES.READY && runId && !detail;

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4">
        <KeyValue label={t("yusufOS:agent.status")}>
          <StatusChip domain="agent" status={agent.status} />
        </KeyValue>
        <KeyValue label={t("yusufOS:agent.role")} mono>
          {agent.agentId}
        </KeyValue>
      </dl>

      {agent.mission ? (
        <div className="flex flex-col gap-1.5">
          <SectionTitle>{t("yusufOS:agent.mission")}</SectionTitle>
          <UntrustedText
            as="p"
            className="text-sm leading-relaxed"
            style={{ color: "var(--yos-text-secondary)" }}
          >
            {agent.mission}
          </UntrustedText>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <SectionTitle>{t("yusufOS:agent.capabilities")}</SectionTitle>
        <p className="text-sm" style={{ color: "var(--yos-text-secondary)" }}>
          {agent.capabilityCount === null
            ? t("yusufOS:state.notRecorded")
            : t("yusufOS:agent.capabilityCount", {
                count: agent.capabilityCount,
              })}
        </p>
        {agent.capabilityKeys.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {agent.capabilityKeys.map((key) => (
              <li
                key={key}
                className="rounded px-2 py-0.5 font-mono text-[11px]"
                style={{
                  backgroundColor: "var(--yos-surface-hover)",
                  color: "var(--yos-text-secondary)",
                }}
              >
                {key}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle>{t("yusufOS:agent.currentRun")}</SectionTitle>
        {!runId ? (
          <p className="text-sm" style={{ color: "var(--yos-text-muted)" }}>
            {t("yusufOS:agent.noCurrentWork")}
          </p>
        ) : run.phase === PHASES.LOADING ? (
          <LoadingBlock rows={3} />
        ) : run.phase === PHASES.ERROR || detailUnusable ? (
          <ErrorBlock
            error={run.error || { code: "MALFORMED_RESPONSE", message: null }}
          />
        ) : detail ? (
          <>
            <dl className="grid grid-cols-2 gap-4">
              <KeyValue label={t("yusufOS:run.kind")}>
                {detail.run.runKind}
              </KeyValue>
              <KeyValue label={t("yusufOS:agent.status")}>
                <StatusChip domain="agent" status={detail.run.status} />
              </KeyValue>
              <KeyValue label={t("yusufOS:run.model")}>
                {detail.run.modelRef || t("yusufOS:run.modelUnknown")}
              </KeyValue>
              <KeyValue label={t("yusufOS:run.started")}>
                <Timestamp value={detail.run.startedAt} />
              </KeyValue>
            </dl>
            {detail.task ? (
              <div className="flex flex-col gap-1">
                <SectionTitle>{t("yusufOS:agent.currentTask")}</SectionTitle>
                <UntrustedText
                  className="text-sm"
                  style={{ color: "var(--yos-text)" }}
                >
                  {detail.task.title}
                </UntrustedText>
              </div>
            ) : null}
            {detail.run.blockingReason ? (
              <UntrustedText
                as="p"
                className="text-sm"
                style={{ color: "var(--yos-blocked-text)" }}
              >
                {detail.run.blockingReason}
              </UntrustedText>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                to={`/os/runs/${detail.run.runId}`}
                className="yos-touch-target inline-flex items-center rounded px-3 text-xs font-medium"
                style={{
                  border: "1px solid var(--yos-border-strong)",
                  color: "var(--yos-text)",
                }}
              >
                {t("yusufOS:agent.openRun")}
              </Link>
              {detail.task ? (
                <Link
                  to={`/os/tasks/${detail.task.taskId}`}
                  className="yos-touch-target inline-flex items-center rounded px-3 text-xs font-medium"
                  style={{
                    border: "1px solid var(--yos-border-strong)",
                    color: "var(--yos-text)",
                  }}
                >
                  {t("yusufOS:agent.openTask")}
                </Link>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle>{t("yusufOS:agent.relationships")}</SectionTitle>
        {relations.length ? (
          <ul className="flex flex-col gap-2">
            {relations.map((edge) => (
              <li
                key={edge.id}
                className="flex flex-col gap-1 rounded p-2.5"
                style={{ backgroundColor: "var(--yos-surface-hover)" }}
              >
                <UntrustedText
                  className="text-xs"
                  style={{ color: "var(--yos-text)" }}
                >
                  {t("yusufOS:constellation.edgeLabel", {
                    from: edge.fromAgentId,
                    to: edge.toAgentId,
                    gate: edge.gate,
                  })}
                </UntrustedText>
                <span className="flex items-center gap-2">
                  <StatusChip domain="handoff" status={edge.status} size="sm" />
                  <Link
                    to={`/os/tasks/${edge.taskId}`}
                    className="text-[11px] underline"
                    style={{ color: "var(--yos-accent-strong)" }}
                  >
                    {t("yusufOS:agent.openTask")}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: "var(--yos-text-muted)" }}>
            {t("yusufOS:agent.noRelationships")}
          </p>
        )}
      </div>
    </div>
  );
}
