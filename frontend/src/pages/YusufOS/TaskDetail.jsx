import React, { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle, Circle } from "@phosphor-icons/react";
import { yusufApi } from "@/features/yusufOS/api/client";
import {
  useYusufResource,
  useYusufOS,
  PHASES,
} from "@/features/yusufOS/state/YusufOSProvider";
import {
  ErrorBlock,
  KeyValue,
  LoadingBlock,
  Panel,
  SectionTitle,
  StatusChip,
  Timestamp,
  UntrustedText,
} from "@/features/yusufOS/components/primitives";

/**
 * Task detail — the relationship view of one piece of work.
 *
 * Answers, in order: who owns it, who delegated it to whom, who reviewed it
 * and what they said, what is waiting on Yusuf, and exactly which completion
 * gates are unsatisfied. The completion assessment is the server's
 * deterministic verdict; nothing here recomputes or softens it.
 */

function Timeline({ handoffs, reviews }) {
  const { t } = useTranslation();
  const entries = [
    ...handoffs.map((handoff) => ({
      id: `h-${handoff.handoffId}`,
      at: handoff.createdAt,
      kind: "handoff",
      handoff,
    })),
    ...reviews.map((review) => ({
      id: `r-${review.verdictId}`,
      at: review.createdAt,
      kind: "review",
      review,
    })),
  ].sort((left, right) => String(left.at).localeCompare(String(right.at)));

  if (!entries.length)
    return (
      <p
        className="px-4 pb-4 text-sm"
        style={{ color: "var(--yos-text-muted)" }}
      >
        {t("yusufOS:task.noHandoffs")}
      </p>
    );

  return (
    <ol className="flex flex-col">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex gap-3 border-b px-4 py-3 last:border-b-0"
          style={{ borderColor: "var(--yos-border-faint)" }}
        >
          <Circle
            size={9}
            weight="fill"
            aria-hidden="true"
            className="mt-1.5 shrink-0"
            style={{ color: "var(--yos-border-strong)" }}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {entry.kind === "handoff" ? (
              <>
                <span
                  className="flex flex-wrap items-center gap-1.5 text-sm"
                  style={{ color: "var(--yos-text)" }}
                >
                  <UntrustedText className="font-semibold">
                    {entry.handoff.fromAgentId}
                  </UntrustedText>
                  <ArrowRight
                    size={12}
                    aria-hidden="true"
                    className="rtl:rotate-180"
                  />
                  <UntrustedText className="font-semibold">
                    {entry.handoff.toAgentId}
                  </UntrustedText>
                  <StatusChip
                    domain="handoff"
                    status={entry.handoff.status}
                    size="sm"
                  />
                </span>
                <UntrustedText
                  className="text-xs"
                  style={{ color: "var(--yos-text-secondary)" }}
                >
                  {entry.handoff.gate}
                </UntrustedText>
              </>
            ) : (
              <>
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <UntrustedText
                    className="font-semibold"
                    style={{ color: "var(--yos-text)" }}
                  >
                    {entry.review.reviewerAgentId}
                  </UntrustedText>
                  <StatusChip
                    domain="review"
                    status={entry.review.verdict}
                    size="sm"
                  />
                </span>
                <UntrustedText
                  className="text-xs"
                  style={{ color: "var(--yos-text-secondary)" }}
                >
                  {entry.review.summary}
                </UntrustedText>
              </>
            )}
            <span
              className="text-[11px]"
              style={{ color: "var(--yos-text-muted)" }}
            >
              <Timestamp value={entry.at} />
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function TaskDetail() {
  const { t } = useTranslation();
  const { taskId } = useParams();
  const { realtime } = useYusufOS();
  const load = useCallback(
    (options) => yusufApi.taskDetail(taskId, options),
    [taskId]
  );
  const { phase, data, error } = useYusufResource(load, {
    watch: realtime.lastAppliedSequence,
  });

  if (phase === PHASES.LOADING)
    return (
      <div className="p-4 md:p-6">
        <Panel>
          <LoadingBlock rows={8} />
        </Panel>
      </div>
    );
  if (phase === PHASES.ERROR)
    return (
      <div className="p-4 md:p-6">
        <Panel>
          <ErrorBlock error={error} />
        </Panel>
      </div>
    );

  const {
    task,
    runs,
    handoffs,
    reviewHistory,
    dependencies,
    waitingApprovals,
    evidence,
    completion,
  } = data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <Panel className="p-4">
        <UntrustedText
          as="h2"
          className="text-lg font-semibold"
          style={{ color: "var(--yos-text)" }}
        >
          {task.title}
        </UntrustedText>
        <UntrustedText
          as="p"
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--yos-text-secondary)" }}
        >
          {task.objective}
        </UntrustedText>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KeyValue label={t("yusufOS:task.status")}>
            <StatusChip domain="task" status={task.status} size="sm" />
          </KeyValue>
          <KeyValue label={t("yusufOS:task.priority")}>
            {task.priority}
          </KeyValue>
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
        {task.blockingReason ? (
          <p
            className="mt-4 rounded p-3 text-sm"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--yos-blocked-graphic) 12%, transparent)",
              color: "var(--yos-blocked-text)",
            }}
          >
            <span className="font-semibold">
              {t("yusufOS:task.blockingReason")}:{" "}
            </span>
            <UntrustedText>{task.blockingReason}</UntrustedText>
          </p>
        ) : null}
      </Panel>

      <Panel className="p-4">
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
          <>
            <SectionTitle className="mt-4">
              {t("yusufOS:task.blockers")}
            </SectionTitle>
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
          </>
        )}
      </Panel>

      {waitingApprovals.length ? (
        <Panel>
          <SectionTitle className="px-4 pt-4">
            {t("yusufOS:task.waitingApprovals")}
          </SectionTitle>
          <ul className="mt-2">
            {waitingApprovals.map((approval) => (
              <li key={approval.approvalId}>
                <Link
                  to={`/os/approvals/${approval.approvalId}`}
                  className="yos-touch-target flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                  style={{ borderColor: "var(--yos-border-faint)" }}
                >
                  <span
                    className="font-mono text-xs"
                    style={{ color: "var(--yos-text)" }}
                  >
                    {approval.capabilityKey}
                  </span>
                  <StatusChip domain="approval" status="PENDING" size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:task.handoffs")} · {t("yusufOS:task.reviewHistory")}
        </SectionTitle>
        <div className="mt-2">
          <Timeline handoffs={handoffs} reviews={reviewHistory} />
        </div>
      </Panel>

      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:task.runs")}
        </SectionTitle>
        <ul className="mt-2">
          {runs.length === 0 ? (
            <li
              className="px-4 pb-4 text-sm"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {t("yusufOS:task.noRuns")}
            </li>
          ) : (
            runs.map((run) => (
              <li key={run.runId}>
                <Link
                  to={`/os/runs/${run.runId}`}
                  className="yos-touch-target flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 last:border-b-0"
                  style={{ borderColor: "var(--yos-border-faint)" }}
                >
                  <span
                    className="text-sm"
                    style={{ color: "var(--yos-text)" }}
                  >
                    {run.agentId || t("yusufOS:state.unknown")} · {run.runKind}
                  </span>
                  <StatusChip domain="agent" status={run.status} size="sm" />
                </Link>
              </li>
            ))
          )}
        </ul>
      </Panel>

      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:task.evidence")}
        </SectionTitle>
        <ul className="mt-2">
          {evidence.length === 0 ? (
            <li
              className="px-4 pb-4 text-sm"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {t("yusufOS:task.noEvidence")}
            </li>
          ) : (
            evidence.map((row) => (
              <li
                key={row.evidenceId}
                className="flex flex-col gap-1 border-b px-4 py-3 last:border-b-0"
                style={{ borderColor: "var(--yos-border-faint)" }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-[0.1em]"
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
            ))
          )}
        </ul>
      </Panel>

      {dependencies.length ? (
        <Panel>
          <SectionTitle className="px-4 pt-4">
            {t("yusufOS:task.dependencies")}
          </SectionTitle>
          <ul className="mt-2">
            {dependencies.map((dependency) => (
              <li key={dependency.taskId}>
                <Link
                  to={`/os/tasks/${dependency.taskId}`}
                  className="yos-touch-target flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                  style={{ borderColor: "var(--yos-border-faint)" }}
                >
                  <UntrustedText
                    className="text-sm"
                    style={{ color: "var(--yos-text)" }}
                  >
                    {dependency.title}
                  </UntrustedText>
                  <StatusChip
                    domain="task"
                    status={dependency.status}
                    size="sm"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
