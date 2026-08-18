import React, { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  Money,
  Panel,
  SectionTitle,
  StatusChip,
  Timestamp,
  UntrustedText,
} from "@/features/yusufOS/components/primitives";

/**
 * Run detail — the explainability surface.
 *
 * For each capability the Agent requested this run, it shows the chain that
 * actually governed it: policy decision and why, the approval and its state,
 * the execution receipt, and the verification outcome. That chain is the
 * product. It is rendered as structured fields, never as a dumped object, and
 * it never includes the canonical payload, principal identifiers or anything
 * the projection deliberately withheld.
 */

function IntentCard({ intent }) {
  const { t } = useTranslation();
  return (
    <li
      className="flex flex-col gap-3 border-b px-4 py-4 last:border-b-0"
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

      {intent.capabilityDescription ? (
        <UntrustedText
          className="text-xs"
          style={{ color: "var(--yos-text-secondary)" }}
        >
          {intent.capabilityDescription}
        </UntrustedText>
      ) : null}

      <dl className="grid grid-cols-2 gap-3">
        <KeyValue label={t("yusufOS:approval.resource")} mono>
          <UntrustedText>
            {`${intent.resourceType}:${intent.resourceId}`}
          </UntrustedText>
        </KeyValue>
      </dl>

      {intent.policyDecisions.length ? (
        <div className="flex flex-col gap-2">
          <SectionTitle>{t("yusufOS:run.policy")}</SectionTitle>
          {intent.policyDecisions.map((decision) => (
            <div
              key={decision.decisionId}
              className="rounded p-2.5"
              style={{ backgroundColor: "var(--yos-surface-hover)" }}
            >
              <p
                className="text-xs font-semibold"
                style={{ color: "var(--yos-text)" }}
              >
                {decision.outcome} · {decision.riskLevel} ·{" "}
                {decision.reasonCode}
              </p>
              <UntrustedText
                as="p"
                className="mt-1 text-xs"
                style={{ color: "var(--yos-text-secondary)" }}
              >
                {decision.explanation}
              </UntrustedText>
            </div>
          ))}
        </div>
      ) : null}

      {intent.approval ? (
        <div className="flex flex-col gap-1.5">
          <SectionTitle>{t("yusufOS:run.approval")}</SectionTitle>
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip
              domain="approval"
              status={intent.approval.status}
              size="sm"
            />
            <Link
              to={`/os/approvals/${intent.approval.approvalId}`}
              className="text-[11px] underline"
              style={{ color: "var(--yos-accent-strong)" }}
            >
              {t("yusufOS:approval.open")}
            </Link>
          </span>
          {intent.approval.invalidationReason ? (
            <UntrustedText
              className="text-xs"
              style={{ color: "var(--yos-warning-text)" }}
            >
              {intent.approval.invalidationReason}
            </UntrustedText>
          ) : null}
        </div>
      ) : null}

      {intent.receipt ? (
        <div className="flex flex-col gap-1.5">
          <SectionTitle>{t("yusufOS:run.receipt")}</SectionTitle>
          <dl className="grid grid-cols-2 gap-3">
            <KeyValue label={t("yusufOS:run.receipt")}>
              {intent.receipt.outcome}
            </KeyValue>
            <KeyValue label={t("yusufOS:run.verification")}>
              {intent.receipt.verificationStatus}
            </KeyValue>
            <KeyValue label="adapter" mono>
              {intent.receipt.adapterId}
            </KeyValue>
            {intent.receipt.externalReference ? (
              <KeyValue label={t("yusufOS:run.receipt")} mono>
                <UntrustedText>
                  {intent.receipt.externalReference}
                </UntrustedText>
              </KeyValue>
            ) : null}
          </dl>
        </div>
      ) : null}
    </li>
  );
}

export default function RunDetail() {
  const { t } = useTranslation();
  const { runId } = useParams();
  const { realtime } = useYusufOS();
  const load = useCallback(
    (options) => yusufApi.runDetail(runId, options),
    [runId]
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

  const { run, task, intents, evidence, reviewVerdict, handoffs } = data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <Panel className="p-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KeyValue label={t("yusufOS:run.agent")}>
            {run.agentId || t("yusufOS:state.unknown")}
          </KeyValue>
          <KeyValue label={t("yusufOS:run.kind")}>{run.runKind}</KeyValue>
          <KeyValue label={t("yusufOS:agent.status")}>
            <StatusChip domain="agent" status={run.status} size="sm" />
          </KeyValue>
          <KeyValue label={t("yusufOS:run.model")}>
            {run.modelRef || t("yusufOS:run.modelUnknown")}
          </KeyValue>
          <KeyValue label={t("yusufOS:run.started")}>
            <Timestamp value={run.startedAt} />
          </KeyValue>
          <KeyValue label={t("yusufOS:run.completed")}>
            <Timestamp value={run.completedAt} />
          </KeyValue>
        </dl>
        {run.failureKind ? (
          <p
            className="mt-3 text-sm"
            style={{ color: "var(--yos-warning-text)" }}
          >
            {t("yusufOS:run.failureKind")}: {run.failureKind}
          </p>
        ) : null}
        {run.blockingReason ? (
          <UntrustedText
            as="p"
            className="mt-2 text-sm"
            style={{ color: "var(--yos-blocked-text)" }}
          >
            {run.blockingReason}
          </UntrustedText>
        ) : null}
        {task ? (
          <Link
            to={`/os/tasks/${task.taskId}`}
            className="mt-3 inline-block text-xs underline"
            style={{ color: "var(--yos-accent-strong)" }}
          >
            <UntrustedText>{task.title}</UntrustedText>
          </Link>
        ) : null}
      </Panel>

      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:run.intents")}
        </SectionTitle>
        <ul className="mt-2">
          {intents.length === 0 ? (
            <li
              className="px-4 pb-4 text-sm"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {t("yusufOS:run.noIntents")}
            </li>
          ) : (
            intents.map((intent) => (
              <IntentCard key={intent.intentId} intent={intent} />
            ))
          )}
        </ul>
      </Panel>

      {reviewVerdict ? (
        <Panel className="p-4">
          <SectionTitle>{t("yusufOS:run.reviewVerdict")}</SectionTitle>
          <div className="mt-2 flex flex-col gap-2">
            <StatusChip domain="review" status={reviewVerdict.verdict} />
            <UntrustedText
              className="text-sm"
              style={{ color: "var(--yos-text-secondary)" }}
            >
              {reviewVerdict.summary}
            </UntrustedText>
          </div>
        </Panel>
      ) : null}

      {evidence.length ? (
        <Panel>
          <SectionTitle className="px-4 pt-4">
            {t("yusufOS:run.evidence")}
          </SectionTitle>
          <ul className="mt-2">
            {evidence.map((row) => (
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

      {handoffs.length ? (
        <Panel>
          <SectionTitle className="px-4 pt-4">
            {t("yusufOS:run.handoffs")}
          </SectionTitle>
          <ul className="mt-2">
            {handoffs.map((handoff) => (
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

      <Panel className="p-4">
        <SectionTitle>{t("yusufOS:run.cost")}</SectionTitle>
        <p className="mt-2 text-sm" style={{ color: "var(--yos-text)" }}>
          {run.estimatedCostMicros === null ? (
            t("yusufOS:run.costNone")
          ) : (
            <Money micros={run.estimatedCostMicros} currency="USD" />
          )}
        </p>
      </Panel>
    </div>
  );
}
