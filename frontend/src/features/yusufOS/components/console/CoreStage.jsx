import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NA } from "../../state/consoleModel";
import { STAGES, STAGE_STATUS } from "../../state/operationStages";
import { toneFor, toneStyle } from "../../state/statusSemantics";
import { UntrustedText } from "../primitives";

/** Renders a console value honestly: unknowns are words, never zeros. */
export function ConsoleValue({
  value,
  unit = null,
  raw = false,
  className = "",
}) {
  const { t, i18n } = useTranslation();
  if (value === null || value === undefined)
    return (
      <span
        className={`yos-mono ${className}`}
        style={{ color: "var(--yos-text-muted)" }}
      >
        {t("yusufOS:na.UNAVAILABLE")}
      </span>
    );
  if (Object.values(NA).includes(value))
    return (
      <span
        className={`yos-mono ${className}`}
        style={{ color: "var(--yos-text-muted)" }}
        data-na={value}
      >
        {t(`yusufOS:na.${value}`)}
      </span>
    );
  if (typeof value === "number")
    return (
      <span className={`yos-mono ${className}`} dir="ltr">
        {value.toLocaleString(i18n.language)}
        {unit ? (
          <span style={{ color: "var(--yos-text-muted)" }}> {unit}</span>
        ) : null}
      </span>
    );
  return raw ? (
    <UntrustedText className={`yos-mono ${className}`}>{value}</UntrustedText>
  ) : (
    <span className={`yos-mono ${className}`} dir="ltr">
      {t(`yusufOS:consoleValue.${value}`, { defaultValue: value })}
    </span>
  );
}

function LatencyBars({ completions }) {
  const values = (completions || [])
    .slice(0, 16)
    .map((entry) => entry.latencyMs)
    .filter((value) => Number.isFinite(value))
    .reverse();
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  return (
    <svg
      viewBox={`0 0 ${values.length * 6} 20`}
      className="h-5 w-full"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      {values.map((value, index) => {
        const height = Math.max(1.5, (value / max) * 20);
        return (
          <rect
            key={index}
            x={index * 6}
            y={20 - height}
            width="3.5"
            height={height}
            fill="var(--yos-cyan)"
            opacity="0.75"
          />
        );
      })}
    </svg>
  );
}

export function CorePanel({ id, panel, completions }) {
  const { t } = useTranslation();
  const headingId = `yos-core-panel-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      className="yos-frame-inset flex min-w-0 flex-col gap-1.5 p-2.5"
      data-core-panel={id}
    >
      <div>
        <h3 id={headingId} className="yos-title" style={{ fontSize: 11 }}>
          {t(`yusufOS:corePanel.${id}.title`)}
        </h3>
        <p className="yos-label" style={{ fontSize: 9 }}>
          {t(`yusufOS:corePanel.${id}.subtitle`)}
        </p>
      </div>
      {id === "PROCESSING" ? <LatencyBars completions={completions} /> : null}
      <div className="flex items-baseline justify-between gap-2">
        <span className="yos-label" style={{ fontSize: 9 }}>
          {t(`yusufOS:corePanel.value.${panel.valueKey}`)}
        </span>
        <ConsoleValue
          value={panel.value}
          className="text-lg font-semibold leading-none"
        />
      </div>
      <dl className="flex flex-col gap-0.5">
        {panel.lines.map(([key, value, unit, raw]) => (
          <div
            key={key}
            className="flex items-baseline justify-between gap-2 text-[11px]"
          >
            <dt style={{ color: "var(--yos-text-secondary)" }}>
              {t(`yusufOS:corePanel.line.${key}`)}
            </dt>
            <dd
              className="min-w-0 truncate text-end"
              style={{ color: "var(--yos-amber)" }}
            >
              <ConsoleValue value={value} unit={unit} raw={raw} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * REASON · PLAN · EXECUTE · VERIFY · LEARN. Indicators, not controls: they
 * reflect streamed runtime stages and cannot be clicked into a "mode".
 */
export function StageRail({ stages }) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="sr-only">{t("yusufOS:stages.title")}</h3>
      <ol
        className="flex items-stretch justify-center border yos-divider"
        style={{ borderRadius: 3 }}
      >
        {STAGES.map((stage) => {
          const status = stages?.[stage] || STAGE_STATUS.IDLE;
          const active = status === STAGE_STATUS.ACTIVE;
          return (
            <li
              key={stage}
              data-stage={stage}
              data-stage-status={status}
              aria-current={active ? "step" : undefined}
              className="yos-mono flex min-w-0 flex-1 flex-col items-center justify-center border-e uppercase px-2 py-1.5 text-center last:border-e-0 yos-divider"
              style={{
                background: active ? "rgb(34 184 245 / 0.14)" : "transparent",
                boxShadow: active
                  ? "inset 0 0 0 1px var(--yos-cyan)"
                  : undefined,
              }}
            >
              <span
                className="text-[11px] font-semibold"
                style={{
                  color: active
                    ? "var(--yos-cyan-bright)"
                    : status === STAGE_STATUS.RECENT
                      ? "var(--yos-text)"
                      : "var(--yos-text-muted)",
                }}
              >
                {t(`yusufOS:stages.${stage}`)}
              </span>
              <span
                className="text-[8.5px] uppercase"
                style={{
                  color: "var(--yos-text-muted)",
                  letterSpacing: "0.1em",
                }}
              >
                {t(`yusufOS:stages.status.${status}`)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only">{t("yusufOS:stages.note")}</p>
    </div>
  );
}

export function CurrentOperation({ operation }) {
  const { t } = useTranslation();
  if (!operation)
    return (
      <div
        className="yos-frame-inset flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2"
        data-operation="none"
      >
        <span className="yos-title" style={{ fontSize: 11 }}>
          {t("yusufOS:operation.title")}
        </span>
        <span
          className="text-xs"
          style={{ color: "var(--yos-text-secondary)" }}
        >
          {t("yusufOS:operation.none")}
        </span>
      </div>
    );
  const tone = toneFor(
    operation.kind === "RUN" ? "agent" : "task",
    operation.state === "APPROVAL_REQUIRED"
      ? "WAITING_APPROVAL"
      : operation.state
  );
  const style = toneStyle(tone);
  return (
    <div
      className="yos-frame-inset grid gap-x-4 gap-y-2 px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto]"
      data-operation={operation.kind}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className="yos-title"
            style={{ fontSize: 11, color: "var(--yos-cyan-bright)" }}
          >
            {t("yusufOS:operation.title")}
          </span>
          <span className="text-xs" style={{ color: "var(--yos-text)" }}>
            {t(`yusufOS:operation.kind.${operation.kind}`)}
          </span>
          {operation.state ? (
            <span
              className="yos-mono text-[10px] uppercase"
              style={{ color: style.text }}
            >
              {t(
                operation.kind === "LAST_COMMAND" ||
                  operation.kind === "COMMAND"
                  ? `yusufOS:comms.state.${operation.state}`
                  : `yusufOS:status.${operation.kind === "RUN" ? "agent" : "task"}.${operation.state}`,
                { defaultValue: operation.state }
              )}
            </span>
          ) : null}
        </div>
        {operation.progress ? (
          <div className="mt-2 flex items-center gap-3">
            <div
              className="h-1 flex-1 overflow-hidden rounded-full"
              style={{ background: "var(--yos-line-faint)" }}
              role="progressbar"
              aria-label={t("yusufOS:operation.gates")}
              aria-valuemin={0}
              aria-valuemax={operation.progress.total}
              aria-valuenow={operation.progress.done}
            >
              <div
                className="h-full origin-left rtl:origin-right"
                style={{
                  transform: `scaleX(${operation.progress.ratio})`,
                  background: "var(--yos-cyan)",
                }}
              />
            </div>
            <span className="yos-mono text-[11px]">
              {t("yusufOS:operation.gateCount", {
                done: operation.progress.done,
                total: operation.progress.total,
              })}
            </span>
          </div>
        ) : (
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--yos-text-muted)" }}
          >
            {t("yusufOS:operation.noProgress")}
          </p>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-3 text-[11px] md:border-s md:ps-4 yos-divider">
        <div className="min-w-0">
          <dt className="yos-label" style={{ fontSize: 9 }}>
            {t("yusufOS:operation.agent")}
          </dt>
          <dd className="truncate">
            {operation.agentName ? (
              <UntrustedText>{operation.agentName}</UntrustedText>
            ) : (
              <ConsoleValue value={NA.NOT_REPORTED} />
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="yos-label" style={{ fontSize: 9 }}>
            {t("yusufOS:operation.model")}
          </dt>
          <dd className="truncate">
            <ConsoleValue value={operation.model || NA.NOT_REPORTED} raw />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="yos-label" style={{ fontSize: 9 }}>
            {t("yusufOS:operation.links")}
          </dt>
          <dd className="flex gap-2">
            {operation.taskId ? (
              <Link
                className="underline decoration-dotted underline-offset-2"
                style={{ color: "var(--yos-cyan-strong)" }}
                to={`/os/tasks/${operation.taskId}`}
              >
                {t("yusufOS:operation.task")}
              </Link>
            ) : null}
            {operation.runId ? (
              <Link
                className="underline decoration-dotted underline-offset-2"
                style={{ color: "var(--yos-cyan-strong)" }}
                to={`/os/runs/${operation.runId}`}
              >
                {t("yusufOS:operation.run")}
              </Link>
            ) : null}
            {!operation.taskId && !operation.runId ? (
              <span style={{ color: "var(--yos-text-muted)" }}>—</span>
            ) : null}
          </dd>
        </div>
      </dl>
    </div>
  );
}
