import React, { useId, useRef } from "react";

/**
 * WAI-ARIA tabs with roving focus (Arrow/Home/End). Unavailable tabs stay
 * focusable and announce why they are unavailable instead of disappearing —
 * the console never implies a data path it does not have.
 */
export default function Tabs({
  label,
  tabs,
  selected,
  onSelect,
  children,
  className = "",
  actions = null,
}) {
  const baseId = useId();
  const refs = useRef({});
  const keys = tabs.map((tab) => tab.key);

  const onKeyDown = (event) => {
    const index = keys.indexOf(selected);
    const rtl =
      event.currentTarget.closest("[dir]")?.getAttribute("dir") === "rtl";
    let next = null;
    if (event.key === (rtl ? "ArrowLeft" : "ArrowRight"))
      next = keys[(index + 1) % keys.length];
    if (event.key === (rtl ? "ArrowRight" : "ArrowLeft"))
      next = keys[(index - 1 + keys.length) % keys.length];
    if (event.key === "Home") next = keys[0];
    if (event.key === "End") next = keys[keys.length - 1];
    if (!next) return;
    event.preventDefault();
    onSelect(next);
    refs.current[next]?.focus();
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex items-end justify-between gap-2 border-b yos-divider">
        <div
          role="tablist"
          aria-label={label}
          className="yos-scroll flex min-w-0 overflow-x-auto"
          onKeyDown={onKeyDown}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              ref={(node) => {
                refs.current[tab.key] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.key}`}
              aria-controls={`${baseId}-panel`}
              aria-selected={selected === tab.key}
              aria-disabled={tab.available === false ? "true" : undefined}
              tabIndex={selected === tab.key ? 0 : -1}
              onClick={() => onSelect(tab.key)}
              className="yos-tab min-h-[40px] shrink-0 whitespace-nowrap px-3"
              data-tab={tab.key}
            >
              {tab.label}
              {Number.isFinite(tab.count) ? (
                <span className="ms-1 opacity-80">({tab.count})</span>
              ) : null}
            </button>
          ))}
        </div>
        {actions}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${selected}`}
        className="flex min-h-0 flex-1 flex-col"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
