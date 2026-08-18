import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { LockKey, Warning } from "@phosphor-icons/react";
import { useYusufOS, SESSION } from "../state/YusufOSProvider";
import { Panel } from "./primitives";

/**
 * Control-plane unlock.
 *
 * The token is typed, POSTed once over loopback, and exchanged for an httpOnly
 * session cookie the page cannot read. It is never written to `localStorage`,
 * a URL, a query string or a log line, and the input is not autofilled or
 * remembered by the browser. The field is `type="password"` with
 * `autoComplete="off"` so it is not offered to a password manager as a site
 * credential — it is a server-side environment secret, not an account.
 */
export default function UnlockScreen() {
  const { t } = useTranslation();
  const { session, unlock } = useYusufOS();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  const unconfigured = session === SESSION.UNCONFIGURED;

  const submit = async (event) => {
    event.preventDefault();
    if (!value || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await unlock(value);
      setValue("");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <Panel className="w-full max-w-md p-7">
        <div
          className="mb-5 flex h-11 w-11 items-center justify-center rounded-full"
          style={{
            backgroundColor: "var(--yos-surface-hover)",
            color: unconfigured
              ? "var(--yos-warning-text)"
              : "var(--yos-accent-strong)",
          }}
        >
          {unconfigured ? (
            <Warning size={20} aria-hidden="true" />
          ) : (
            <LockKey size={20} aria-hidden="true" />
          )}
        </div>

        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--yos-text)" }}
        >
          {unconfigured
            ? t("yusufOS:session.unconfiguredTitle")
            : t("yusufOS:session.lockedTitle")}
        </h1>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--yos-text-secondary)" }}
        >
          {unconfigured
            ? t("yusufOS:session.unconfiguredBody")
            : t("yusufOS:session.lockedBody")}
        </p>

        {unconfigured ? null : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-2">
            <label
              htmlFor={fieldId}
              className="text-xs font-medium uppercase tracking-[0.1em]"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {t("yusufOS:session.tokenLabel")}
            </label>
            <input
              id={fieldId}
              type="password"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              spellCheck="false"
              aria-describedby={failed ? `${hintId} ${errorId}` : hintId}
              aria-invalid={failed || undefined}
              className="yos-touch-target w-full rounded px-3 font-mono text-sm"
              style={{
                backgroundColor: "var(--yos-canvas)",
                border: `1px solid ${
                  failed
                    ? "var(--yos-error-graphic)"
                    : "var(--yos-border-strong)"
                }`,
                color: "var(--yos-text)",
              }}
            />
            <p
              id={hintId}
              className="text-[11px] leading-relaxed"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {t("yusufOS:session.tokenHint")}
            </p>
            {failed ? (
              <p
                id={errorId}
                role="alert"
                className="text-xs"
                style={{ color: "var(--yos-error-text)" }}
              >
                {t("yusufOS:session.failed")}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !value}
              className="yos-touch-target mt-2 w-full rounded text-sm font-semibold disabled:opacity-50"
              style={{
                backgroundColor: "var(--yos-accent)",
                color: "#04070b",
              }}
            >
              {busy
                ? t("yusufOS:session.unlocking")
                : t("yusufOS:session.unlock")}
            </button>
          </form>
        )}
      </Panel>
    </main>
  );
}
