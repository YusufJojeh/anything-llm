import React from "react";
import { useTranslation } from "react-i18next";
import { toneFor, toneStyle } from "../state/statusSemantics";
import { formatDateTime } from "./primitives";

/**
 * Realtime connection state, stated honestly and quietly.
 *
 * A brief SSE reconnect must not make the console look broken: the snapshot on
 * screen is still the last thing the server actually confirmed, so the
 * indicator degrades the *freshness claim* rather than the data. "LIVE" is
 * only claimed while the stream is genuinely open and recently active.
 */
export default function ConnectionIndicator({ connection, asOf, reconciling }) {
  const { t, i18n } = useTranslation();
  const asOfText = formatDateTime(i18n.language, asOf);
  const tone = toneFor("connection", connection);
  const style = toneStyle(tone);

  return (
    <div className="flex flex-col items-end gap-0.5 text-end">
      <p
        className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em]"
        style={{ color: style.text }}
      >
        <span className="sr-only">{t("yusufOS:connection.label")}: </span>
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${
            connection === "LIVE" ? "yos-pulse-ambient" : ""
          }`}
          style={{ backgroundColor: style.graphic }}
        />
        {t(`yusufOS:connection.${connection}`, { defaultValue: connection })}
      </p>
      {/*
       * Freshness is announced politely — an operator needs to know the view
       * went stale, but not to have every heartbeat read aloud.
       */}
      <p
        className="text-[11px]"
        style={{ color: "var(--yos-text-muted)" }}
        aria-live="polite"
      >
        {reconciling
          ? t("yusufOS:connection.reconciling")
          : asOfText
            ? t("yusufOS:connection.asOf", { time: asOfText })
            : null}
      </p>
    </div>
  );
}
