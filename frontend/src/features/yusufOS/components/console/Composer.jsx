import React, { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PaperPlaneRight, Paperclip } from "@phosphor-icons/react";
import { useCommandSession } from "../../state/CommandSession";

// The backend's `/voice/commands` utterance limit.
export const MAX_COMMAND_CHARS = 10000;

/**
 * The typed command composer. A second entry point onto exactly the same
 * `runCommand` the microphone uses — same `yusufApi.runVoiceCommand` route,
 * same session/CSRF handling, same governed pipeline. There is no separate
 * text-command backend path and none is created here.
 *
 * Enter sends, Shift+Enter adds a newline, and a command already in flight
 * (or a live recording) disables sending so nothing is submitted twice.
 */
export default function Composer({ compact = false }) {
  const { t } = useTranslation();
  const session = useCommandSession();
  const inputId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState("");
  const textareaRef = useRef(null);
  const busy = session.busy;

  const submit = async () => {
    const value = draft.trim();
    if (!value || busy) return;
    setDraft("");
    const result = await session.runCommand(value, {
      via: "text",
      failedMessage: t("yusufOS:voice.failed"),
    });
    // A failed command keeps the text so Yusuf can retry without retyping.
    if (!result) setDraft((current) => (current ? current : value));
    textareaRef.current?.focus();
  };

  return (
    <form
      className="yos-input flex items-end gap-1 p-1"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      aria-label={t("yusufOS:comms.composerLabel")}
    >
      {compact ? null : (
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-sm opacity-40"
          aria-label={t("yusufOS:comms.attachUnavailable")}
          title={t("yusufOS:comms.attachUnavailable")}
        >
          <Paperclip size={17} aria-hidden="true" />
        </button>
      )}
      <label className="sr-only" htmlFor={inputId}>
        {t("yusufOS:voice.commandInput")}
      </label>
      <textarea
        id={inputId}
        ref={textareaRef}
        rows={compact ? 1 : 2}
        value={draft}
        maxLength={MAX_COMMAND_CHARS}
        onChange={(event) => setDraft(event.target.value)}
        // Disabled while a command (or recording) is in flight: one governed
        // command at a time, and a failed draft can be restored safely.
        disabled={busy}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={t("yusufOS:comms.placeholder")}
        aria-describedby={hintId}
        className="min-h-[44px] flex-1 px-2 py-2 text-[13px] leading-snug disabled:opacity-60"
        dir="auto"
      />
      <span id={hintId} className="sr-only">
        {t("yusufOS:comms.hint")}
      </span>
      <button
        type="submit"
        disabled={busy || !draft.trim()}
        className="yos-press flex size-11 shrink-0 items-center justify-center rounded-sm border disabled:opacity-40"
        style={{
          borderColor: "var(--yos-cyan)",
          background: "rgb(34 184 245 / 0.18)",
          color: "var(--yos-cyan-bright)",
        }}
        aria-label={t("yusufOS:voice.send")}
        aria-busy={busy || undefined}
      >
        <PaperPlaneRight
          size={17}
          weight="fill"
          aria-hidden="true"
          className="rtl:-scale-x-100"
        />
      </button>
    </form>
  );
}
