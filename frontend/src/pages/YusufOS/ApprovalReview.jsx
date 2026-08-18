import React, { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Info, ShieldWarning } from "@phosphor-icons/react";
import { yusufApi } from "@/features/yusufOS/api/client";
import {
  useYusufResource,
  useYusufOS,
  PHASES,
} from "@/features/yusufOS/state/YusufOSProvider";
import Drawer from "@/features/yusufOS/components/Drawer";
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
 * Approval review.
 *
 * This is not an "are you sure?" dialog. It is a full route that shows every
 * fact the Gate B §8 contract requires before a decision: who asked, in what
 * task and project, which canonical capability, what exact target, the bound
 * identity digests, the policy's own explanation of why this needs a human,
 * the expiry and one-use behaviour, and the current execution state.
 *
 * Two invariants are enforced in code, not by convention:
 *
 * - There is no always-allow, no wildcard, and no bulk approve. The only
 *   affirmative action is "approve once", and the page says so in words.
 * - Nothing is optimistically rendered as approved, executed or verified. The
 *   decision posts to the existing server route with the server's own
 *   concurrency values, and the page then re-reads server state. If the intent
 *   drifted, the server rejects it and the error is shown as-is.
 */

function Field({ label, children, mono = false }) {
  return (
    <div
      className="border-b px-4 py-3 last:border-b-0"
      style={{ borderColor: "var(--yos-border-faint)" }}
    >
      <KeyValue label={label} mono={mono}>
        {children}
      </KeyValue>
    </div>
  );
}

export default function ApprovalReview() {
  const { t } = useTranslation();
  const { approvalId } = useParams();
  const { refresh, realtime } = useYusufOS();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState(null);
  const [note, setNote] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    (options) => yusufApi.approvalReview(approvalId, options),
    // `reloadKey` is a deliberate dependency: after a decision the only
    // trustworthy state is a fresh server read, so changing it re-runs this.

    [approvalId, reloadKey]
  );
  const { phase, data, error } = useYusufResource(
    load,
    [approvalId, reloadKey],
    {
      watch: realtime.lastAppliedSequence,
    }
  );

  const decide = async (verdict) => {
    if (!data || busy) return;
    setBusy(true);
    setDecisionError(null);
    try {
      await yusufApi.decideApproval(data.decision.approvalRouteId, {
        decision: verdict,
        expectedPayloadHash: data.decision.expectedPayloadHash,
        expectedIntentVersion: data.decision.expectedIntentVersion,
        expectedApprovalVersion: data.decision.expectedApprovalVersion,
        ...(note ? { note } : {}),
      });
    } catch (cause) {
      setDecisionError(cause);
    } finally {
      setBusy(false);
      setConfirming(false);
      // Whether the decision succeeded or was rejected, the only trustworthy
      // next state is the server's. Re-read rather than assume.
      setReloadKey((key) => key + 1);
      refresh();
    }
  };

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
    approval,
    requestedBy,
    context,
    capability,
    target,
    policy,
    execution,
    decision,
  } = data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <Panel className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded px-2 py-1 text-xs font-bold"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--yos-approval-graphic) 18%, transparent)",
              color: "var(--yos-approval-text)",
            }}
          >
            {approval.riskLevel}
          </span>
          <StatusChip domain="approval" status={approval.status} />
        </div>
        <p
          className="mt-3 font-mono text-sm font-semibold"
          style={{ color: "var(--yos-text)" }}
        >
          {capability.key}
        </p>
        {capability.description ? (
          <UntrustedText
            as="p"
            className="mt-1 text-sm"
            style={{ color: "var(--yos-text-secondary)" }}
          >
            {capability.description}
          </UntrustedText>
        ) : null}

        {/* Approval is not execution. Said plainly, every time. */}
        <p
          className="mt-4 flex items-start gap-2 rounded p-3 text-xs"
          style={{
            backgroundColor: "var(--yos-surface-hover)",
            color: "var(--yos-text-secondary)",
          }}
        >
          <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            {t("yusufOS:approval.notExecuted")} —{" "}
            {t("yusufOS:approval.singleUse")}
          </span>
        </p>
      </Panel>

      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:approval.reviewTitle")}
        </SectionTitle>
        <div className="mt-2">
          <Field label={t("yusufOS:approval.requestedBy")}>
            <UntrustedText>
              {requestedBy.agentName ||
                requestedBy.agentId ||
                requestedBy.principalType}
            </UntrustedText>
          </Field>
          <Field label={t("yusufOS:task.title")}>
            {context.taskId ? (
              <Link
                to={`/os/tasks/${context.taskId}`}
                className="underline"
                style={{ color: "var(--yos-accent-strong)" }}
              >
                <UntrustedText>{context.taskTitle}</UntrustedText>
              </Link>
            ) : (
              t("yusufOS:state.notRecorded")
            )}
          </Field>
          <Field label={t("yusufOS:approval.resource")} mono>
            <UntrustedText>
              {`${target.resourceType}:${target.resourceId}`}
            </UntrustedText>
          </Field>
          <Field label={t("yusufOS:approval.environment")} mono>
            {target.environment}
          </Field>
          <Field label={t("yusufOS:approval.targetDigest")} mono>
            {target.targetIdentityDigest}
          </Field>
          {target.accountIdentityDigest ? (
            <Field label={t("yusufOS:approval.accountDigest")} mono>
              {target.accountIdentityDigest}
            </Field>
          ) : null}
          <Field label={t("yusufOS:approval.policyExplanation")}>
            <UntrustedText>{policy.explanation}</UntrustedText>
            <p
              className="mt-1 font-mono text-[11px]"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {policy.outcome} · {policy.reasonCode}
            </p>
          </Field>
          <Field label={t("yusufOS:approval.reviewerStatus")}>
            {context.latestReviewVerdict ? (
              <StatusChip
                domain="review"
                status={context.latestReviewVerdict}
                size="sm"
              />
            ) : (
              t("yusufOS:approval.noReviewerStatus")
            )}
          </Field>
          <Field label={t("yusufOS:approval.expiresAt")}>
            <Timestamp value={approval.expiresAt} />
          </Field>
          <Field label={t("yusufOS:approval.executionState")}>
            <StatusChip
              domain="execution"
              status={execution.intentStatus}
              size="sm"
            />
            {execution.verificationStatus ? (
              <span
                className="ms-2 text-xs"
                style={{ color: "var(--yos-text-secondary)" }}
              >
                {execution.verificationStatus}
              </span>
            ) : null}
          </Field>
          {approval.invalidationReason ? (
            <Field label={t("yusufOS:status.approval.INVALIDATED")}>
              <UntrustedText style={{ color: "var(--yos-warning-text)" }}>
                {approval.invalidationReason}
              </UntrustedText>
            </Field>
          ) : null}
        </div>
      </Panel>

      <Panel className="p-4">
        {decision.decidable ? (
          <>
            <label
              htmlFor="yos-approval-note"
              className="text-xs font-medium uppercase tracking-[0.1em]"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {t("yusufOS:approval.noteLabel")}
            </label>
            <textarea
              id="yos-approval-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="mt-1.5 w-full rounded p-2 text-sm"
              style={{
                backgroundColor: "var(--yos-canvas)",
                border: "1px solid var(--yos-border-strong)",
                color: "var(--yos-text)",
              }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="yos-touch-target rounded px-4 text-sm font-semibold disabled:opacity-60"
                style={{
                  backgroundColor: "var(--yos-approval-graphic)",
                  color: "#0a0703",
                }}
              >
                {busy
                  ? t("yusufOS:approval.deciding")
                  : t("yusufOS:approval.approveOnce")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide("REJECT")}
                className="yos-touch-target rounded px-4 text-sm font-semibold disabled:opacity-60"
                style={{
                  border: "1px solid var(--yos-blocked-graphic)",
                  color: "var(--yos-blocked-text)",
                }}
              >
                {t("yusufOS:approval.reject")}
              </button>
            </div>
            <p
              className="mt-3 flex items-start gap-2 text-[11px]"
              style={{ color: "var(--yos-text-muted)" }}
            >
              <ShieldWarning
                size={13}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
              {t("yusufOS:approval.noWildcard")}
            </p>
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--yos-text-secondary)" }}>
            {t("yusufOS:approval.notDecidable")}
          </p>
        )}
        {decisionError ? <ErrorBlock error={decisionError} /> : null}
      </Panel>

      <Drawer
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t("yusufOS:approval.confirmTitle")}
        width="min(440px, 100vw)"
        footer={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => decide("APPROVE")}
              className="yos-touch-target rounded px-4 text-sm font-semibold disabled:opacity-60"
              style={{
                backgroundColor: "var(--yos-approval-graphic)",
                color: "#0a0703",
              }}
            >
              {t("yusufOS:approval.confirmApprove")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="yos-touch-target rounded px-4 text-sm font-medium"
              style={{
                border: "1px solid var(--yos-border-strong)",
                color: "var(--yos-text)",
              }}
            >
              {t("yusufOS:approval.confirmCancel")}
            </button>
          </div>
        }
      >
        <p className="text-sm" style={{ color: "var(--yos-text-secondary)" }}>
          {t("yusufOS:approval.confirmBody", {
            capability: capability.key,
            target: `${target.resourceType}:${target.resourceId}`,
          })}
        </p>
      </Drawer>
    </div>
  );
}
