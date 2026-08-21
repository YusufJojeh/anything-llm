import React, { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ErrorBoundary } from "react-error-boundary";
import {
  Pulse,
  CirclesThree,
  Cpu,
  HardDrives,
  GitBranch,
  Lock,
  ShieldCheck,
  Stack,
  UsersThree,
} from "@phosphor-icons/react";
import { useYusufOS, SESSION, PHASES } from "../state/YusufOSProvider";
import { registerYusufOSTranslations, isRtlLanguage } from "../i18n";
import UnlockScreen from "./UnlockScreen";
import ConnectionIndicator from "./ConnectionIndicator";
import { ErrorBlock, LoadingBlock } from "./primitives";
import "../styles/tokens.css";

/**
 * The `/os` application shell.
 *
 * Navigation is a compact icon rail rather than a conventional sidebar: the
 * Command Center canvas is the product's identity, and a 240px list of links
 * down the side would make this read as an admin template. The rail collapses
 * to a horizontal bar on narrow screens.
 *
 * Direction is set on the shell element, not globally, so switching to Arabic
 * flips the whole Yusuf OS layout — rail, drawers, list affordances — without
 * touching the rest of AnythingLLM. Every layout rule inside uses logical
 * properties, so this is the only place direction is decided.
 */

const SECTIONS = [
  { to: "/os", end: true, key: "commandCenter", Icon: CirclesThree },
  { to: "/os/agents", key: "agents", Icon: UsersThree },
  { to: "/os/tasks", key: "tasks", Icon: Stack },
  { to: "/os/approvals", key: "approvals", Icon: ShieldCheck },
  { to: "/os/runs", key: "runs", Icon: Cpu },
  { to: "/os/runtime", key: "runtime", Icon: HardDrives },
  { to: "/os/projects", key: "projects", Icon: GitBranch },
  { to: "/os/system", key: "system", Icon: Pulse },
];

function Rail() {
  const { t } = useTranslation();
  const { lock } = useYusufOS();
  return (
    <nav
      aria-label={t("yusufOS:nav.label")}
      // The rail is a utility, not the product. It shares the canvas surface
      // instead of sitting on a raised panel, which is what made it read as a
      // conventional admin sidebar.
      className="flex shrink-0 flex-row items-center gap-1 border-b px-2 py-2 md:flex-col md:items-stretch md:gap-0.5 md:border-b-0 md:border-e md:px-1.5 md:py-4"
      style={{
        borderColor: "var(--yos-border-faint)",
        backgroundColor: "var(--yos-canvas)",
      }}
    >
      <span
        aria-hidden="true"
        className="mb-0 me-2 hidden size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold tracking-[0.08em] md:mb-5 md:me-0 md:flex"
        style={{
          border: "1px solid var(--yos-border-strong)",
          color: "var(--yos-accent-strong)",
        }}
      >
        Y
      </span>
      <ul className="flex flex-1 flex-row gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {SECTIONS.map(({ to, end, key, Icon }) => (
          <li key={key}>
            <NavLink
              to={to}
              end={end}
              className="yos-touch-target group flex min-w-[44px] items-center justify-center gap-2 rounded px-2 transition-colors md:justify-start md:px-2"
              style={({ isActive }) => ({
                color: isActive ? "var(--yos-text)" : "var(--yos-text-muted)",
                boxShadow: isActive
                  ? "inset 2px 0 0 0 var(--yos-accent)"
                  : "inset 2px 0 0 0 transparent",
                transitionDuration: "var(--yos-motion-hover)",
                transitionTimingFunction: "var(--yos-ease)",
              })}
            >
              <Icon size={18} aria-hidden="true" className="shrink-0" />
              {/*
               * The label is always in the accessible name; it is only
               * visually hidden on the narrow rail, never removed.
               */}
              <span className="hidden text-[11px] font-medium tracking-[0.02em] 2xl:inline">
                {t(`yusufOS:nav.${key}`)}
              </span>
              <span className="sr-only 2xl:hidden">
                {t(`yusufOS:nav.${key}`)}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={lock}
        className="yos-touch-target flex min-w-[44px] items-center justify-center gap-2 rounded px-2 md:mt-3 md:justify-start md:px-2"
        style={{ color: "var(--yos-text-muted)" }}
      >
        <Lock size={15} aria-hidden="true" className="shrink-0" />
        <span className="hidden text-[11px] font-medium 2xl:inline">
          {t("yusufOS:nav.lock")}
        </span>
        <span className="sr-only 2xl:hidden">{t("yusufOS:nav.lock")}</span>
      </button>
    </nav>
  );
}

export default function OSShell() {
  const { t, i18n } = useTranslation();
  const { session, phase, error, dashboard, connection, reconciling, refresh } =
    useYusufOS();
  const location = useLocation();
  const rtl = isRtlLanguage(i18n.language);

  useEffect(() => {
    registerYusufOSTranslations();
  }, []);

  /**
   * `lang` and `dir` are set on the document while `/os` is mounted, and
   * restored on the way out. AnythingLLM does not currently set a root
   * direction, so this is what makes bidi text, logical properties, scroll
   * direction and native controls behave correctly in Arabic.
   */
  useEffect(() => {
    const root = document.documentElement;
    const previousLang = root.getAttribute("lang");
    const previousDir = root.getAttribute("dir");
    root.setAttribute("lang", i18n.language);
    root.setAttribute("dir", rtl ? "rtl" : "ltr");
    return () => {
      if (previousLang) root.setAttribute("lang", previousLang);
      else root.removeAttribute("lang");
      if (previousDir) root.setAttribute("dir", previousDir);
      else root.removeAttribute("dir");
    };
  }, [i18n.language, rtl]);

  if (session === SESSION.CHECKING)
    return (
      <div className="yos-root min-h-dvh">
        <LoadingBlock rows={4} />
      </div>
    );

  if (session !== SESSION.UNLOCKED)
    return (
      <div className="yos-root min-h-dvh" dir={rtl ? "rtl" : "ltr"}>
        <UnlockScreen />
      </div>
    );

  return (
    <div
      className="yos-root flex min-h-dvh flex-col md:flex-row xl:h-dvh xl:min-h-0 xl:overflow-hidden"
      dir={rtl ? "rtl" : "ltr"}
    >
      <a
        href="#yos-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[70] focus:m-2 focus:rounded focus:px-3 focus:py-2"
        style={{
          backgroundColor: "var(--yos-surface-overlay)",
          color: "var(--yos-text)",
        }}
      >
        {t("yusufOS:nav.skipToContent")}
      </a>
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col xl:min-h-0">
        <header
          className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 md:px-6"
          style={{ borderColor: "var(--yos-border-faint)" }}
        >
          <div className="flex flex-col">
            <p
              className="text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {t("yusufOS:brand.name")}
            </p>
            <h1
              className="text-lg font-semibold leading-tight"
              style={{ color: "var(--yos-text)" }}
            >
              {t(
                `yusufOS:nav.${
                  SECTIONS.find((section) =>
                    section.end
                      ? location.pathname === section.to
                      : location.pathname.startsWith(section.to)
                  )?.key || "commandCenter"
                }`
              )}
            </h1>
          </div>
          <ConnectionIndicator
            connection={connection}
            asOf={dashboard?.asOf}
            reconciling={reconciling}
          />
        </header>

        <main
          id="yos-main"
          className="min-w-0 flex-1 xl:min-h-0 xl:overflow-hidden"
        >
          {phase === PHASES.LOADING && !dashboard ? (
            <LoadingBlock rows={6} />
          ) : phase === PHASES.ERROR && !dashboard ? (
            <ErrorBlock error={error} onRetry={refresh} />
          ) : (
            <ErrorBoundary
              // Keyed on the route so navigating away clears a failed surface.
              resetKeys={[location.pathname]}
              FallbackComponent={({ error: renderError }) => (
                <ErrorBlock
                  error={{
                    code: "RENDER_FAILED",
                    message: renderError?.message || null,
                  }}
                  onRetry={refresh}
                />
              )}
            >
              <Outlet />
            </ErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
}
