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
  StatusChip,
  Timestamp,
} from "@/features/yusufOS/components/primitives";

/** Run list. Newest first, with the failure kind kept distinct from status. */
export default function Runs() {
  const { t } = useTranslation();
  const { realtime } = useYusufOS();
  const load = useCallback((options) => yusufApi.runs(options), []);
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

  const runs = data?.runs || [];

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <Panel>
        {runs.length === 0 ? (
          <EmptyState title={t("yusufOS:run.empty")} />
        ) : (
          <ul>
            {runs.map((run) => (
              <li key={run.uuid}>
                <Link
                  to={`/os/runs/${run.uuid}`}
                  className="yos-touch-target flex items-center gap-3 border-b px-4 py-3 hover:bg-[var(--yos-surface-hover)]"
                  style={{ borderColor: "var(--yos-border-faint)" }}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--yos-text)" }}
                    >
                      {run.runKind}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusChip
                        domain="agent"
                        status={run.status}
                        size="sm"
                      />
                      {run.failureKind ? (
                        <span
                          className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                          style={{
                            backgroundColor: "var(--yos-surface-hover)",
                            color: "var(--yos-warning-text)",
                          }}
                        >
                          {run.failureKind}
                        </span>
                      ) : null}
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--yos-text-muted)" }}
                      >
                        <Timestamp value={run.createdAt} />
                      </span>
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
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
