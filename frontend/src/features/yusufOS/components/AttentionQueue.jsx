import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "@phosphor-icons/react";
import { toneStyle } from "../state/statusSemantics";
import {
  EmptyState,
  LoadingBlock,
  StatusIcon,
  Timestamp,
  UntrustedText,
} from "./primitives";

/**
 * "Needs Yusuf" — the most important surface in the product.
 *
 * Ordered by how hard each item blocks the operator, not by recency, and every
 * row is a real link to the surface that resolves it. There are no advisory
 * rows with nowhere to go, and no notification-badge-only signalling: each
 * item states what it is in words.
 *
 * When the queue is genuinely empty it says so plainly. That is a real,
 * verified answer about the system, not an absence of data.
 */
export default function AttentionQueue({ items, loading }) {
  const { t } = useTranslation();

  if (loading) return <LoadingBlock rows={3} />;
  if (!items) return <LoadingBlock rows={3} />;

  if (!items.length)
    return (
      <EmptyState
        title={t("yusufOS:attention.empty")}
        detail={t("yusufOS:attention.emptyDetail")}
      />
    );

  return (
    <>
      {/*
       * A single polite announcement of the count. Announcing every row on
       * every snapshot refresh would flood a screen reader with noise.
       */}
      <p className="sr-only" aria-live="polite">
        {t("yusufOS:attention.count", { count: items.length })}
      </p>
      <ul className="flex flex-col">
        {items.map((item) => {
          const style = toneStyle(item.tone);
          return (
            <li key={item.id}>
              <Link
                to={item.href}
                className="yos-row yos-touch-target flex items-start gap-3 border-b px-4 py-3.5"
                style={{ borderColor: "var(--yos-border-faint)" }}
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${style.graphic} 16%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${style.graphic} 34%, transparent)`,
                  }}
                >
                  <StatusIcon tone={item.tone} size={14} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {/* Risk level leads on an approval: it is the first thing
                      that changes how Yusuf reads the row. */}
                  {item.values.riskLevel ? (
                    <span
                      // Visual emphasis only: the risk level is already part of
                      // the translated sentence below, so announcing it twice
                      // would just make the row noisier to listen to.
                      aria-hidden="true"
                      className="w-fit rounded px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em]"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${style.graphic} 18%, transparent)`,
                        color: style.text,
                      }}
                    >
                      {item.values.riskLevel}
                    </span>
                  ) : null}
                  <UntrustedText
                    className="text-pretty text-sm font-medium leading-snug"
                    style={{ color: "var(--yos-text)" }}
                  >
                    {t(`yusufOS:attention.kind.${item.kind}`, item.values)}
                  </UntrustedText>
                  {item.values.targetSummary ? (
                    <UntrustedText
                      className="text-xs"
                      style={{ color: "var(--yos-text-secondary)" }}
                    >
                      {item.values.targetSummary}
                    </UntrustedText>
                  ) : null}
                  {item.values.blockingReason ? (
                    <UntrustedText
                      className="text-xs"
                      style={{ color: "var(--yos-text-secondary)" }}
                    >
                      {item.values.blockingReason}
                    </UntrustedText>
                  ) : null}
                  {item.values.expiresAt ? (
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--yos-text-muted)" }}
                    >
                      {t("yusufOS:approval.expiresAt")}:{" "}
                      <Timestamp value={item.values.expiresAt} />
                    </span>
                  ) : null}
                </span>
                <ArrowRight
                  size={14}
                  aria-hidden="true"
                  className="mt-1 shrink-0 rtl:rotate-180"
                  style={{ color: "var(--yos-text-muted)" }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
