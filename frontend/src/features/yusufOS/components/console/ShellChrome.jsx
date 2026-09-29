import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  CirclesThree,
  Cpu,
  GitBranch,
  HardDrives,
  Lock,
  Pulse,
  ShieldCheck,
  Stack,
  UsersThree,
} from "@phosphor-icons/react";
import { buildTelemetry, NA } from "../../state/consoleModel";
import { coreStateTone } from "../../state/commandCenterModel";
import { toneFor, toneStyle } from "../../state/statusSemantics";
import ConnectionIndicator from "../ConnectionIndicator";

export const SECTIONS = [
  { to: "/os", end: true, key: "commandCenter", Icon: CirclesThree },
  { to: "/os/agents", key: "agents", Icon: UsersThree },
  { to: "/os/tasks", key: "tasks", Icon: Stack },
  { to: "/os/approvals", key: "approvals", Icon: ShieldCheck },
  { to: "/os/runs", key: "runs", Icon: Cpu },
  { to: "/os/runtime", key: "runtime", Icon: HardDrives },
  { to: "/os/projects", key: "projects", Icon: GitBranch },
  { to: "/os/system", key: "system", Icon: Pulse },
];

export function sectionFor(pathname) {
  return (
    SECTIONS.find((section) =>
      section.end ? pathname === section.to : pathname.startsWith(section.to)
    )?.key || "commandCenter"
  );
}

function Clock() {
  const { i18n } = useTranslation();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  let time = "";
  let date = "";
  let zone = "";
  try {
    time = new Intl.DateTimeFormat(i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(now);
    date = new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(now);
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    time = now.toISOString().slice(11, 19);
  }
  return (
    <div
      className="hidden flex-col items-end leading-tight 2xl:flex"
      aria-label={`${date} ${time}`}
    >
      <span
        className="yos-mono text-[12px]"
        style={{ color: "var(--yos-text)" }}
        dir="ltr"
      >
        {time}
      </span>
      <span className="yos-label" style={{ fontSize: 9 }}>
        {date} · <span dir="ltr">{zone}</span>
      </span>
    </div>
  );
}

function Cell({ label, children, className = "" }) {
  return (
    <div
      className={`flex min-w-0 flex-col justify-center border-s px-3 yos-divider ${className}`}
    >
      <span className="yos-label" style={{ fontSize: 9 }}>
        {label}
      </span>
      <span className="yos-mono truncate text-[11.5px] font-semibold">
        {children}
      </span>
    </div>
  );
}

/**
 * Top telemetry strip. Real state only: control plane, model runtime, audit
 * chain, realtime connection, system core state and the local clock. Host
 * CPU/GPU/MEM/NET are not exposed by Yusuf OS and say NOT REPORTED.
 */
export function TelemetryStrip({
  section,
  model,
  runtime,
  runtimePhase,
  connection,
  dashboard,
  reconciling,
  onLock,
}) {
  const { t } = useTranslation();
  const telemetry = buildTelemetry({
    summary: model.summary,
    runtime,
    runtimePhase,
    connection,
  });
  const coreTone = coreStateTone(model.coreState);
  const tone = (domain, value) => toneStyle(toneFor(domain, value)).text;

  return (
    <header
      className="flex items-stretch gap-2 border-b px-3 py-2 md:px-4"
      style={{
        borderColor: "var(--yos-line)",
        background:
          "linear-gradient(180deg, rgb(9 20 29 / 0.95), rgb(5 10 15 / 0.95))",
      }}
    >
      <div className="flex shrink-0 items-center gap-3 pe-2">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border"
          style={{
            borderColor: "var(--yos-cyan)",
            color: "var(--yos-cyan-bright)",
            boxShadow: "0 0 14px -6px var(--yos-cyan)",
          }}
        >
          <span className="yos-mono text-[13px] font-bold">Y</span>
        </span>
        <div className="min-w-0">
          <p className="yos-title truncate" style={{ fontSize: 13 }}>
            {t("yusufOS:brand.name")}
          </p>
          <h1
            className="yos-label truncate"
            style={{ color: "var(--yos-text-secondary)" }}
          >
            {t(`yusufOS:nav.${section}`)}
          </h1>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 items-stretch lg:flex">
        <div
          className="hidden items-stretch xl:flex"
          aria-label={t("yusufOS:telemetry.hostLabel")}
          role="group"
        >
          {telemetry.host.map((metric) => (
            <Cell key={metric.key} label={metric.key}>
              <span
                style={{ color: "var(--yos-text-muted)" }}
                title={t("yusufOS:telemetry.hostNote")}
              >
                {t("yusufOS:na.NOT_REPORTED_SHORT")}
              </span>
            </Cell>
          ))}
        </div>
        <Cell label={t("yusufOS:telemetry.controlPlane")}>
          <span
            style={{
              color: telemetry.controlPlane
                ? tone("system", telemetry.controlPlane)
                : "var(--yos-text-muted)",
            }}
          >
            {telemetry.controlPlane
              ? t(`yusufOS:status.system.${telemetry.controlPlane}`, {
                  defaultValue: telemetry.controlPlane,
                })
              : t("yusufOS:state.unknown")}
          </span>
        </Cell>
        <Cell label={t("yusufOS:telemetry.model")}>
          <span
            style={{
              color:
                telemetry.model === "OLLAMA" || telemetry.model === "OPENAI"
                  ? "var(--yos-cyan-strong)"
                  : "var(--yos-text-muted)",
            }}
          >
            {Object.values(NA).includes(telemetry.model)
              ? t(`yusufOS:na.${telemetry.model}`)
              : t(`yusufOS:telemetry.provider.${telemetry.model}`)}
          </span>
        </Cell>
        <Cell label={t("yusufOS:telemetry.audit")} className="hidden xl:flex">
          <span
            style={{
              color: telemetry.audit
                ? tone("audit", telemetry.audit)
                : "var(--yos-text-muted)",
            }}
          >
            {telemetry.audit
              ? t(`yusufOS:status.audit.${telemetry.audit}`, {
                  defaultValue: telemetry.audit,
                })
              : t("yusufOS:state.unknown")}
          </span>
        </Cell>
        <Cell label={t("yusufOS:telemetry.agents")} className="hidden xl:flex">
          {telemetry.agents ? (
            <span dir="ltr">
              {telemetry.agents.reporting} / {telemetry.agents.total}
            </span>
          ) : (
            <span style={{ color: "var(--yos-text-muted)" }}>
              {t("yusufOS:state.unknown")}
            </span>
          )}
        </Cell>
        <div
          className="flex items-center gap-2 border-s px-3 yos-divider"
          data-system-status={model.coreState || "UNKNOWN"}
        >
          <span
            className="yos-status-dot"
            aria-hidden="true"
            style={{ color: toneStyle(coreTone).graphic }}
          />
          <span
            className="yos-mono truncate text-[11.5px] font-semibold uppercase"
            style={{ color: toneStyle(coreTone).text }}
          >
            {model.coreState
              ? t(`yusufOS:core.state.${model.coreState}`)
              : t("yusufOS:state.unknown")}
          </span>
        </div>
      </div>

      <div className="ms-auto flex min-w-0 items-center gap-3">
        <ConnectionIndicator
          connection={connection}
          asOf={dashboard?.asOf}
          reconciling={reconciling}
        />
        <Clock />
        <button
          type="button"
          onClick={onLock}
          className="yos-press yos-touch-target flex min-w-[44px] items-center justify-center gap-2 rounded-sm border px-2"
          style={{
            borderColor: "var(--yos-line)",
            color: "var(--yos-text-secondary)",
          }}
        >
          <Lock size={15} aria-hidden="true" />
          <span className="hidden text-[11px] 2xl:inline">
            {t("yusufOS:nav.lock")}
          </span>
          <span className="sr-only 2xl:hidden">{t("yusufOS:nav.lock")}</span>
        </button>
      </div>
    </header>
  );
}

/** Bottom mission-control navigation. Only existing routes; no dead items. */
export function CommandNav({ model, connection }) {
  const { t } = useTranslation();
  const approvals = model.summary?.pendingApprovals ?? null;
  const attention = model.attention ? model.attention.length : null;
  return (
    <nav
      aria-label={t("yusufOS:nav.label")}
      className="flex items-center gap-1 border-t px-2 py-1.5 md:gap-2 md:px-3"
      style={{
        borderColor: "var(--yos-line)",
        background:
          "linear-gradient(0deg, rgb(9 20 29 / 0.96), rgb(5 10 15 / 0.96))",
        paddingBottom: "max(6px, env(safe-area-inset-bottom))",
      }}
    >
      <ul className="grid flex-1 grid-cols-8 gap-0.5 md:flex md:flex-none md:gap-1">
        {SECTIONS.map(({ to, end, key, Icon }) => (
          <li key={key}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `yos-press yos-interactive flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-sm border px-2 md:px-3 ${isActive ? "" : "border-transparent"}`
              }
              style={({ isActive }) => ({
                color: isActive
                  ? "var(--yos-cyan-bright)"
                  : "var(--yos-text-secondary)",
                borderColor: isActive ? "var(--yos-cyan)" : undefined,
                background: isActive ? "rgb(34 184 245 / 0.12)" : undefined,
                boxShadow: isActive
                  ? "0 0 16px -8px var(--yos-cyan)"
                  : undefined,
              })}
            >
              <Icon size={18} aria-hidden="true" className="shrink-0" />
              <span className="yos-mono hidden text-[10.5px] font-semibold uppercase xl:inline">
                {t(`yusufOS:nav.${key}`)}
              </span>
              <span className="sr-only xl:hidden">
                {t(`yusufOS:nav.${key}`)}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="ms-auto hidden items-center gap-2 lg:flex">
        <NavLink
          to="/os/approvals"
          className="yos-press yos-interactive flex min-h-[44px] items-center gap-2 rounded-sm border px-3"
          style={{ borderColor: "var(--yos-line)" }}
        >
          <ShieldCheck
            size={16}
            aria-hidden="true"
            style={{
              color: approvals
                ? "var(--yos-amber)"
                : "var(--yos-text-secondary)",
            }}
          />
          <span className="yos-mono text-[10.5px] font-semibold uppercase">
            {t("yusufOS:nav.approvals")}
          </span>
          <span
            className="yos-mono rounded-sm px-1.5 text-[10.5px]"
            style={{
              background: approvals
                ? "rgb(255 184 77 / 0.2)"
                : "rgb(75 202 255 / 0.1)",
              color: approvals ? "var(--yos-amber)" : "var(--yos-text-muted)",
            }}
          >
            {approvals === null ? "—" : approvals}
          </span>
        </NavLink>
        <NavLink
          to="/os"
          end
          className="yos-press yos-interactive flex min-h-[44px] items-center gap-2 rounded-sm border px-3"
          style={{ borderColor: "var(--yos-line)" }}
          aria-label={
            attention === null
              ? `${t("yusufOS:nav.alerts")}: ${t("yusufOS:state.unknown")}`
              : t("yusufOS:nav.alertsLabel", { count: attention })
          }
        >
          <Bell
            size={16}
            aria-hidden="true"
            style={{
              color: attention ? "var(--yos-red)" : "var(--yos-text-secondary)",
            }}
          />
          <span
            className="yos-mono text-[10.5px] font-semibold uppercase"
            aria-hidden="true"
          >
            {t("yusufOS:nav.alerts")}
          </span>
          <span
            aria-hidden="true"
            className="yos-mono rounded-sm px-1.5 text-[10.5px]"
            style={{
              background: attention
                ? "rgb(255 94 108 / 0.2)"
                : "rgb(75 202 255 / 0.1)",
              color: attention ? "var(--yos-red)" : "var(--yos-text-muted)",
            }}
          >
            {attention === null ? "—" : attention}
          </span>
        </NavLink>
        <span
          className="flex min-h-[44px] items-center gap-2 rounded-sm border px-3 yos-divider"
          title={t("yusufOS:nav.realtime")}
        >
          <span
            className="yos-mono text-[10.5px] font-semibold uppercase"
            style={{ color: "var(--yos-text-secondary)" }}
          >
            {t("yusufOS:nav.realtime")}
          </span>
          <span
            className="yos-status-dot"
            aria-hidden="true"
            style={{
              color: toneStyle(toneFor("connection", connection)).graphic,
            }}
          />
          <span className="sr-only">
            {t(`yusufOS:connection.${connection || "IDLE"}`)}
          </span>
        </span>
        <span
          className="flex min-h-[44px] items-center gap-2 rounded-sm border px-3 yos-divider"
          title={t("yusufOS:nav.secureNote")}
        >
          <Lock
            size={14}
            aria-hidden="true"
            style={{ color: "var(--yos-green)" }}
          />
          <span
            className="yos-mono text-[10.5px] font-semibold uppercase"
            style={{ color: "var(--yos-text-secondary)" }}
          >
            {t("yusufOS:nav.secure")}
          </span>
          <span
            className="yos-status-dot"
            aria-hidden="true"
            style={{ color: "var(--yos-green)" }}
          />
        </span>
      </div>
    </nav>
  );
}
