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
  UntrustedText,
} from "@/features/yusufOS/components/primitives";

/**
 * Task list.
 *
 * A card list rather than a dense table: the operator question is "what is
 * happening and what is stuck", and a blocked reason needs room to be read.
 * Re-reads whenever the realtime layer says server state moved.
 */
export default function Tasks() {
  const { t } = useTranslation();
  const { realtime } = useYusufOS();
  const load = useCallback((options) => yusufApi.tasks(options), []);
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

  const tasks = data?.tasks || [];

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <Panel>
        {tasks.length === 0 ? (
          <EmptyState title={t("yusufOS:task.empty")} />
        ) : (
          <ul>
            {tasks.map((task) => (
              <li key={task.uuid}>
                <Link
                  to={`/os/tasks/${task.uuid}`}
                  className="yos-touch-target flex items-start gap-3 border-b px-4 py-3 hover:bg-[var(--yos-surface-hover)]"
                  style={{ borderColor: "var(--yos-border-faint)" }}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <UntrustedText
                      className="text-sm font-semibold"
                      style={{ color: "var(--yos-text)" }}
                    >
                      {task.title}
                    </UntrustedText>
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusChip
                        domain="task"
                        status={task.status}
                        size="sm"
                      />
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: "var(--yos-surface-hover)",
                          color: "var(--yos-text-muted)",
                        }}
                      >
                        {task.priority}
                      </span>
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--yos-text-muted)" }}
                      >
                        <Timestamp value={task.updatedAt} />
                      </span>
                    </span>
                    {task.blockedReason ? (
                      <UntrustedText
                        className="text-xs"
                        style={{ color: "var(--yos-blocked-text)" }}
                      >
                        {task.blockedReason}
                      </UntrustedText>
                    ) : null}
                  </span>
                  <CaretRight
                    size={14}
                    aria-hidden="true"
                    className="mt-1 shrink-0 rtl:rotate-180"
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
