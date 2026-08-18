import React, { useCallback, useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X } from "@phosphor-icons/react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal side panel with real dialog semantics.
 *
 * Implements the four things a hand-rolled dialog usually gets wrong:
 * a labelled `role="dialog" aria-modal`, a focus trap, Escape to close, and
 * deterministic focus return to whatever opened it. Positioning uses logical
 * inset properties so it opens from the correct edge in RTL without a
 * direction-specific stylesheet.
 */
export default function Drawer({
  open,
  onClose,
  title,
  titleId: providedTitleId,
  descriptionId = undefined,
  children,
  footer = null,
  width = "min(560px, 100vw)",
}) {
  const { t } = useTranslation();
  const generatedId = useId();
  const titleId = providedTitleId || generatedId;
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!focusable || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    // Focus the panel itself rather than its first control: reading starts at
    // the title, and a screen reader announces the dialog name on entry.
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      const target = returnFocusRef.current;
      if (target && typeof target.focus === "function") target.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex">
      <button
        type="button"
        aria-label={t("yusufOS:common.dismiss")}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ backgroundColor: "rgba(3, 5, 8, 0.66)" }}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="yos-panel relative ms-auto flex h-full flex-col overflow-hidden shadow-2xl"
        style={{
          inlineSize: width,
          maxInlineSize: "100vw",
          backgroundColor: "var(--yos-surface-overlay)",
          borderRadius: 0,
          borderInlineStartWidth: "1px",
        }}
      >
        <header
          className="flex items-start justify-between gap-4 border-b px-5 py-4"
          style={{ borderColor: "var(--yos-border)" }}
        >
          <h2
            id={titleId}
            className="text-base font-semibold"
            style={{ color: "var(--yos-text)" }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("yusufOS:common.close")}
            className="yos-touch-target flex w-11 items-center justify-center rounded"
            style={{ color: "var(--yos-text-secondary)" }}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer
            className="border-t px-5 py-4"
            style={{ borderColor: "var(--yos-border)" }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
