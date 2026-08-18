import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { yusufApi } from "@/features/yusufOS/api/client";
import {
  useYusufResource,
  PHASES,
} from "@/features/yusufOS/state/YusufOSProvider";
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Panel,
  Timestamp,
  UntrustedText,
} from "@/features/yusufOS/components/primitives";

/**
 * Projects. A thin surface on purpose — a project is currently a binding
 * context for tasks, repositories and commands, and Gate G shows exactly what
 * the backend records rather than padding the page with derived metrics.
 */
export default function Projects() {
  const { t } = useTranslation();
  const load = useCallback((options) => yusufApi.projects(options), []);
  const { phase, data, error } = useYusufResource(load);

  if (phase === PHASES.LOADING)
    return (
      <div className="p-4 md:p-6">
        <Panel>
          <LoadingBlock rows={4} />
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

  const projects = data?.projects || [];

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <Panel>
        {projects.length === 0 ? (
          <EmptyState title={t("yusufOS:project.empty")} />
        ) : (
          <ul>
            {projects.map((project) => (
              <li
                key={project.uuid}
                className="flex flex-col gap-1 border-b px-4 py-3 last:border-b-0"
                style={{ borderColor: "var(--yos-border-faint)" }}
              >
                <UntrustedText
                  className="text-sm font-semibold"
                  style={{ color: "var(--yos-text)" }}
                >
                  {project.name}
                </UntrustedText>
                <span
                  className="font-mono text-[11px]"
                  style={{ color: "var(--yos-text-muted)" }}
                >
                  {project.key}
                </span>
                <span
                  className="text-[11px]"
                  style={{ color: "var(--yos-text-muted)" }}
                >
                  <Timestamp value={project.updatedAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
