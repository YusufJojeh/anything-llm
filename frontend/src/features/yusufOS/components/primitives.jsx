import React from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Check,
  Hourglass,
  PlugsConnected,
  Prohibit,
  Question,
  ShieldWarning,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { toneFor, toneIcon, toneStyle, TONES } from "../state/statusSemantics";

/**
 * Shared Yusuf OS primitives.
 *
 * Deliberately small and unopinionated about layout — the design system here
 * is tokens plus a handful of behaviours (status semantics, untrusted text,
 * load/empty/error separation), not a component bureaucracy.
 */

const ICONS = {
  check: Check,
  activity: Activity,
  hourglass: Hourglass,
  shieldQuestion: ShieldWarning,
  warning: Warning,
  prohibit: Prohibit,
  xCircle: XCircle,
  plugsDisconnected: PlugsConnected,
  question: Question,
};

export function StatusIcon({ tone, size = 14, className = "" }) {
  const Icon = ICONS[toneIcon(tone)] || Question;
  return (
    <Icon
      size={size}
      weight="bold"
      aria-hidden="true"
      className={className}
      style={{ color: toneStyle(tone).text }}
    />
  );
}

/**
 * Renders a value that originated outside Yusuf OS's own vocabulary — an Agent
 * name, a task objective, a handoff reason, an error message.
 *
 * Two things matter here. React escapes the content (there is no
 * `dangerouslySetInnerHTML` anywhere in this feature), and `dir="auto"` with
 * bidi isolation keeps a Latin identifier embedded in Arabic prose — or the
 * reverse — from reordering the sentence around it.
 */
export function UntrustedText({
  children,
  className = "",
  as: As = "span",
  style = {},
  ...rest
}) {
  if (children === null || children === undefined || children === "")
    return null;
  return (
    <As
      dir="auto"
      className={className}
      style={{ unicodeBidi: "isolate", ...style }}
      {...rest}
    >
      {String(children)}
    </As>
  );
}

/**
 * Status chip. Colour is never alone: there is always an icon and a text
 * label, and the label is the backend's own vocabulary translated.
 */
export function StatusChip({ domain, status, size = "md", className = "" }) {
  const { t } = useTranslation();
  const tone = toneFor(domain, status);
  const style = toneStyle(tone);
  const label = status
    ? t(`yusufOS:status.${domain}.${status}`, { defaultValue: status })
    : t("yusufOS:status.none");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      } font-medium ${className}`}
      style={{
        color: style.text,
        borderColor: `color-mix(in srgb, ${style.graphic} 45%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${style.graphic} 12%, transparent)`,
      }}
    >
      <StatusIcon tone={tone} size={size === "sm" ? 11 : 13} />
      {label}
    </span>
  );
}

export function Panel({
  children,
  className = "",
  as: As = "section",
  ...rest
}) {
  return (
    <As className={`yos-panel ${className}`} {...rest}>
      {children}
    </As>
  );
}

export function SectionTitle({ children, id, action = null, className = "" }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h2
        id={id}
        className="text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--yos-text-muted)" }}
      >
        {children}
      </h2>
      {action}
    </div>
  );
}

export function KeyValue({ label, children, mono = false }) {
  return (
    <div className="flex flex-col gap-1">
      <dt
        className="text-[11px] uppercase tracking-[0.1em]"
        style={{ color: "var(--yos-text-muted)" }}
      >
        {label}
      </dt>
      <dd
        className={`text-sm ${mono ? "font-mono text-[12px] break-all" : ""}`}
        style={{ color: "var(--yos-text)" }}
      >
        {children}
      </dd>
    </div>
  );
}

/**
 * An empty state is a real answer, not a gap. It never invites the reader to
 * imagine data that is not there.
 */
export function EmptyState({ title, detail = null, icon = TONES.HEALTHY }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center"
      style={{ color: "var(--yos-text-secondary)" }}
    >
      <StatusIcon tone={icon} size={20} />
      <p className="text-sm font-medium" style={{ color: "var(--yos-text)" }}>
        {title}
      </p>
      {detail ? <p className="max-w-sm text-xs">{detail}</p> : null}
    </div>
  );
}

/**
 * Loading is visually distinct from empty on purpose: a skeleton says "not
 * known yet", a zero says "known to be zero". Rendering a 0 while loading
 * would be a lie with a short half-life.
 */
export function LoadingBlock({ rows = 3, label }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label || t("yusufOS:state.loadingLabel")}
      className="flex flex-col gap-2 p-4"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-4 w-full animate-pulse rounded"
          style={{ backgroundColor: "var(--yos-surface-hover)" }}
        />
      ))}
      <span className="sr-only">{t("yusufOS:state.loading")}</span>
    </div>
  );
}

/**
 * Errors show the server's structured message and code only. No stack, no raw
 * object, no invented advice.
 */
export function ErrorBlock({ error, onRetry = null }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 p-4 text-sm"
      style={{ color: "var(--yos-error-text)" }}
    >
      <span className="flex items-center gap-2 font-medium">
        <StatusIcon tone={TONES.ERROR} size={15} />
        {t("yusufOS:state.errorTitle")}
      </span>
      <UntrustedText
        className="text-xs"
        style={{ color: "var(--yos-text-secondary)" }}
      >
        {error?.message || null}
      </UntrustedText>
      {error?.code && error.code !== "UNKNOWN" ? (
        <code
          className="rounded px-1.5 py-0.5 font-mono text-[11px]"
          style={{
            backgroundColor: "var(--yos-surface-hover)",
            color: "var(--yos-text-muted)",
          }}
        >
          {error.code}
        </code>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="yos-touch-target rounded px-3 text-xs font-medium"
          style={{
            border: "1px solid var(--yos-border-strong)",
            color: "var(--yos-text)",
          }}
        >
          {t("yusufOS:state.retry")}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Locale-aware datetime string for interpolation *into* a translated sentence.
 *
 * Exists because rendering `t("... {{time}}")` next to a separate <Timestamp>
 * element assembles a sentence out of fragments — which reads as a dangling
 * clause in English and puts the time in the wrong place entirely in Arabic.
 */
export function formatDateTime(language, value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Locale-aware timestamp, with the machine value in `title`/`dateTime`. */
export function Timestamp({ value, relative = false }) {
  const { i18n } = useTranslation();
  if (!value) return <span>{"—"}</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>{"—"}</span>;
  const formatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: relative ? undefined : "medium",
    timeStyle: "short",
  });
  return (
    <time dateTime={date.toISOString()} title={date.toISOString()}>
      {formatter.format(date)}
    </time>
  );
}

/** Locale-aware count. Never used to render a value that is `null`. */
export function Count({ value }) {
  const { i18n } = useTranslation();
  if (value === null || value === undefined) return <span>{"—"}</span>;
  return <span>{new Intl.NumberFormat(i18n.language).format(value)}</span>;
}

export function Money({ micros, currency }) {
  const { i18n } = useTranslation();
  if (micros === null || micros === undefined || !currency)
    return <span>{"—"}</span>;
  return (
    <span>
      {new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency,
        maximumFractionDigits: 4,
      }).format(micros / 1_000_000)}
    </span>
  );
}
