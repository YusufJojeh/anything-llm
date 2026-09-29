import React, { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ErrorBoundary } from "react-error-boundary";
import { useYusufOS, SESSION, PHASES } from "../state/YusufOSProvider";
import { registerYusufOSTranslations, isRtlLanguage } from "../i18n";
import UnlockScreen from "./UnlockScreen";
import { CommandNav, TelemetryStrip, sectionFor } from "./console/ShellChrome";
import { ErrorBlock, LoadingBlock } from "./primitives";
import "../styles/tokens.css";
import "../styles/depth.css";

/**
 * The `/os` application shell.
 *
 * Mission-control chrome: a compact telemetry strip on top (real state only)
 * and an operational navigation rail at the bottom, so the Command Center
 * reads as one integrated console rather than an admin template.
 *
 * Direction is set on the shell element, not globally, so switching to Arabic
 * flips the whole Yusuf OS layout — rail, drawers, list affordances — without
 * touching the rest of AnythingLLM. Every layout rule inside uses logical
 * properties, so this is the only place direction is decided.
 */

export default function OSShell() {
  const { t, i18n } = useTranslation();
  const {
    session,
    phase,
    error,
    dashboard,
    connection,
    reconciling,
    refresh,
    model,
    runtime,
    runtimePhase,
    lock,
  } = useYusufOS();
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
      className="yos-root flex min-h-dvh flex-col xl:h-dvh xl:min-h-0 xl:overflow-hidden"
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
      <TelemetryStrip
        section={sectionFor(location.pathname)}
        model={model}
        runtime={runtime}
        runtimePhase={runtimePhase}
        connection={connection}
        dashboard={dashboard}
        reconciling={reconciling}
        onLock={lock}
      />
      <main
        id="yos-main"
        className="min-w-0 flex-1 xl:min-h-0 xl:overflow-y-auto"
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
      <CommandNav model={model} connection={connection} />
    </div>
  );
}
