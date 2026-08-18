import React, { useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CaretRight } from "@phosphor-icons/react";
import { yusufApi } from "@/features/yusufOS/api/client";
import {
  useYusufResource,
  useYusufOS,
  PHASES,
} from "@/features/yusufOS/state/YusufOSProvider";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Panel,
  SectionTitle,
  StatusChip,
  Timestamp,
} from "@/features/yusufOS/components/primitives";

/**
 * Approvals.
 *
 * Split into what is waiting on Yusuf and what has already been decided,
 * because those are different jobs. The decided list exists so the full
 * lifecycle stays visible: an `APPROVED` row that has not been consumed is not
 * the same as a `CONSUMED` one, and an `INVALIDATED` one is a security event
 * worth seeing, not a row to hide.
 */
function ApprovalRow({ approval }) {
  return (
    <li>
      <Link
        to={`/os/approvals/${approval.uuid}`}
        className="yos-touch-target flex items-center gap-3 border-b px-4 py-3 hover:bg-[var(--yos-surface-hover)]"
        style={{ borderColor: "var(--yos-border-faint)" }}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--yos-approval-graphic) 18%, transparent)",
                color: "var(--yos-approval-text)",
              }}
            >
              {approval.requiredRiskLevel}
            </span>
            <StatusChip domain="approval" status={approval.status} size="sm" />
          </span>
          <span
            className="text-[11px]"
            style={{ color: "var(--yos-text-muted)" }}
          >
            <Timestamp value={approval.requestedAt} />
          </span>
        </span>
        <CaretRight
          size={14}
          aria-hidden="true"
          className="shrink-0 rtl:rotate-180"
          style={{ color: "var(--yos-text-muted)" }}
        />
      </Link>
    </li>
  );
}

export default function Approvals() {
  const { t } = useTranslation();
  const { realtime } = useYusufOS();
  const load = useCallback((options) => yusufApi.approvals(null, options), []);
  const { phase, data, error } = useYusufResource(load, {
    watch: realtime.lastAppliedSequence,
  });

  if (phase === PHASES.LOADING)
    return (
      <div className="p-4 md:p-6">
        <Panel>
          <LoadingBlock rows={5} />
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

  const all = data?.approvals || [];
  const pending = all.filter((approval) => approval.status === "PENDING");
  const decided = all.filter((approval) => approval.status !== "PENDING");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:approval.pending")}
        </SectionTitle>
        <div className="mt-2">
          {pending.length === 0 ? (
            <EmptyState title={t("yusufOS:approval.empty")} />
          ) : (
            <ul>
              {pending.map((approval) => (
                <ApprovalRow key={approval.uuid} approval={approval} />
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionTitle className="px-4 pt-4">
          {t("yusufOS:approval.history")}
        </SectionTitle>
        <div className="mt-2">
          {decided.length === 0 ? (
            <EmptyState title={t("yusufOS:approval.emptyHistory")} />
          ) : (
            <ul>
              {decided.map((approval) => (
                <ApprovalRow key={approval.uuid} approval={approval} />
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}
