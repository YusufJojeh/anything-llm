import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { yusufApi } from "../api/client";
import { toneFor, toneStyle, TONES } from "../state/statusSemantics";
import {
  Count,
  formatDateTime,
  ErrorBlock,
  KeyValue,
  Money,
  Panel,
  SectionTitle,
  StatusChip,
  StatusIcon,
} from "./primitives";

/**
 * System Health, built strictly from the Gate F projection.
 *
 * Two honesty rules are enforced here rather than assumed:
 *
 * - UNCHECKED is not healthy. The audit chain has its own tone and an explicit
 *   sentence saying it has never been verified in this process.
 * - STALE is not current green. A verdict that covered sequence 40 while the
 *   chain is now at 200 is displayed as describing an older tip.
 *
 * Nothing here reports "healthy" because a JavaScript object exists — every
 * row shows a value the server asserted, or says it was not reported.
 */

function HealthRow({ label, domain, status, detail = null, children = null }) {
  const tone = toneFor(domain, status);
  const style = toneStyle(tone);
  return (
    <div
      className="flex flex-col gap-1.5 border-b px-4 py-3 last:border-b-0"
      style={{ borderColor: "var(--yos-border-faint)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: "var(--yos-text)" }}
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: style.graphic }}
          />
          {label}
        </span>
        <StatusChip domain={domain} status={status} size="sm" />
      </div>
      {detail ? (
        <p className="text-xs" style={{ color: "var(--yos-text-secondary)" }}>
          {detail}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export default function SystemHealth({
  dashboard,
  summary,
  connection,
  realtime,
}) {
  const { t, i18n } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(null);

  if (!dashboard || !summary) return null;

  const audit = summary.auditStatus;
  const auditDetail =
    audit === "UNCHECKED"
      ? t("yusufOS:system.auditNeverChecked")
      : audit === "STALE"
        ? t("yusufOS:system.auditStale")
        : null;

  const runCheck = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      await yusufApi.checkAuditIntegrity();
    } catch (error) {
      setCheckError(error);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:system.controlPlane")}
        </SectionTitle>
        <div className="mt-2">
          <HealthRow
            label={t("yusufOS:system.controlPlane")}
            domain="system"
            status={summary.controlPlane}
          />
          <HealthRow
            label={t("yusufOS:system.emergencyStop")}
            domain="system"
            status={summary.emergencyStop ? "STOPPED" : "HEALTHY"}
            detail={
              summary.emergencyStop
                ? t("yusufOS:system.emergencyStopOn")
                : t("yusufOS:system.emergencyStopOff")
            }
          />
        </div>
      </Panel>

      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:system.audit")}
        </SectionTitle>
        <div className="mt-2">
          <HealthRow
            label={t("yusufOS:system.audit")}
            domain="audit"
            status={audit}
            detail={auditDetail}
          >
            <dl className="mt-2 grid grid-cols-2 gap-3">
              <KeyValue label={t("yusufOS:system.chainTip")}>
                <Count value={summary.auditLastSequence} />
              </KeyValue>
              <KeyValue label={t("yusufOS:system.verifiedThrough")}>
                {summary.auditVerifiedThrough === null ? (
                  t("yusufOS:state.never")
                ) : (
                  <Count value={summary.auditVerifiedThrough} />
                )}
              </KeyValue>
            </dl>
            {summary.auditLastCheckedAt ? (
              <p
                className="mt-2 text-[11px]"
                style={{ color: "var(--yos-text-muted)" }}
              >
                {t("yusufOS:system.auditLastChecked", {
                  time: formatDateTime(
                    i18n.language,
                    summary.auditLastCheckedAt
                  ),
                })}
              </p>
            ) : null}
            <button
              type="button"
              onClick={runCheck}
              disabled={checking}
              className="yos-touch-target mt-3 inline-flex items-center rounded px-3 text-xs font-medium disabled:opacity-60"
              style={{
                border: "1px solid var(--yos-border-strong)",
                color: "var(--yos-text)",
              }}
            >
              {checking
                ? t("yusufOS:system.auditChecking")
                : t("yusufOS:system.auditCheck")}
            </button>
            {checkError ? <ErrorBlock error={checkError} /> : null}
          </HealthRow>
        </div>
      </Panel>

      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:system.reconciliation")}
        </SectionTitle>
        <div className="mt-2">
          <HealthRow
            label={t("yusufOS:system.reconciliation")}
            domain="execution"
            status={
              summary.pendingReconciliation === null
                ? null
                : summary.pendingReconciliation > 0
                  ? "FAILED_UNKNOWN"
                  : "VERIFIED"
            }
            detail={
              summary.pendingReconciliation === null
                ? null
                : summary.pendingReconciliation > 0
                  ? t("yusufOS:system.reconciliationPending", {
                      count: summary.pendingReconciliation,
                    })
                  : t("yusufOS:system.reconciliationNone")
            }
          />
          {/*
           * An empty backlog is "nothing pending", not "consumed" — reusing
           * the approval vocabulary here made a real lifecycle state mean
           * something it does not.
           */}
          <HealthRow
            label={t("yusufOS:system.approvalBacklog")}
            domain="approval"
            status={summary.pendingApprovals > 0 ? "PENDING" : null}
            detail={
              summary.pendingApprovals > 0
                ? null
                : t("yusufOS:system.approvalBacklogEmpty")
            }
          >
            <p
              className="text-sm"
              style={{ color: "var(--yos-text-secondary)" }}
            >
              <Count value={summary.pendingApprovals} />
            </p>
          </HealthRow>
        </div>
      </Panel>

      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:system.adapters")}
        </SectionTitle>
        <div className="mt-2">
          {(dashboard.adapterHealth || []).map((adapter) => (
            <HealthRow
              key={adapter.adapterId}
              label={adapter.adapterId}
              domain="adapter"
              status={adapter.status}
              detail={t("yusufOS:system.adapterCapabilities", {
                count: adapter.capabilityCount,
              })}
            />
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:system.scheduler")}
        </SectionTitle>
        <div className="mt-2">
          {(dashboard.scheduler || []).length ? (
            dashboard.scheduler.map((schedule) => (
              <HealthRow
                key={schedule.scheduleKey}
                label={schedule.scheduleKey}
                domain="system"
                status={schedule.status}
                detail={
                  schedule.failureCount > 0
                    ? t("yusufOS:system.schedulerFailure", {
                        count: schedule.failureCount,
                        code:
                          schedule.lastErrorCode || t("yusufOS:state.unknown"),
                      })
                    : t("yusufOS:system.schedulerNext", {
                        time: formatDateTime(i18n.language, schedule.nextRunAt),
                      })
                }
              />
            ))
          ) : (
            <p
              className="px-4 py-3 text-sm"
              style={{ color: "var(--yos-text-secondary)" }}
            >
              {t("yusufOS:system.schedulerNone")}
            </p>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:system.realtime")}
        </SectionTitle>
        <div className="mt-2">
          <HealthRow
            label={t("yusufOS:system.realtime")}
            domain="connection"
            status={connection}
            detail={realtime?.lastEventAt ? null : t("yusufOS:system.noEvents")}
          >
            {realtime?.lastEventAt ? (
              <p
                className="text-xs"
                style={{ color: "var(--yos-text-secondary)" }}
              >
                {t("yusufOS:system.lastEvent", {
                  time: formatDateTime(i18n.language, realtime.lastEventAt),
                })}
              </p>
            ) : null}
          </HealthRow>
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionTitle>{t("yusufOS:system.cost")}</SectionTitle>
        <dl className="mt-3 grid grid-cols-2 gap-4">
          <KeyValue label={t("yusufOS:system.costToday")}>
            <Money
              micros={summary.costTodayMicros}
              currency={summary.costCurrency}
            />
          </KeyValue>
          <KeyValue label={t("yusufOS:system.costMonth")}>
            <Money
              micros={summary.costMonthMicros}
              currency={summary.costCurrency}
            />
          </KeyValue>
        </dl>
        <p
          className="mt-3 flex items-start gap-2 text-[11px]"
          style={{ color: "var(--yos-text-muted)" }}
        >
          <StatusIcon tone={TONES.UNKNOWN} size={12} />
          {t("yusufOS:system.costNote")}
        </p>
      </Panel>
    </div>
  );
}
