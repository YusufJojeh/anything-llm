import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  PaperPlaneRight,
  Paperclip,
  ShieldWarning,
} from "@phosphor-icons/react";
import { yusufApi } from "../../api/client";
import { useCommandSession } from "../../state/CommandSession";
import { toneFor, toneStyle } from "../../state/statusSemantics";
import { UntrustedText, formatDateTime } from "../primitives";
import VoiceConsole from "../VoiceConsole";
import Tabs from "./Tabs";

function timeOf(language, iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(language, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/**
 * Governed approval block. Reads the real approval review projection and
 * links to the approval page — there is deliberately no approve/reject here:
 * a decision is made only on the governed review surface.
 */
export function ApprovalBlock({ approvalId, at }) {
  const { t, i18n } = useTranslation();
  const [review, setReview] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    yusufApi
      .approvalReview?.(approvalId, { signal: controller.signal })
      ?.then((data) => setReview(data))
      .catch((cause) => cause?.name !== "AbortError" && setFailed(true));
    return () => controller.abort();
  }, [approvalId]);

  const rows = review
    ? [
        ["agent", review.requestedBy?.agentName || review.requestedBy?.agentId],
        ["capability", review.capability?.key],
        ["risk", review.approval?.riskLevel || review.policy?.riskLevel],
        [
          "target",
          review.target
            ? `${review.target.resourceType}:${review.target.resourceId}`
            : null,
        ],
        ["payload", review.capability?.description],
        ["task", review.context?.taskId?.slice(0, 8)],
        ["run", review.context?.runId?.slice(0, 8)],
        [
          "requested",
          review.approval?.requestedAt
            ? formatDateTime(i18n.language, review.approval.requestedAt)
            : null,
        ],
      ]
    : [];

  return (
    <div
      className="rounded-sm border p-3"
      data-approval-block={approvalId}
      style={{
        borderColor: "rgb(255 184 77 / 0.55)",
        background: "rgb(255 184 77 / 0.07)",
      }}
    >
      <p
        className="flex items-center gap-2 text-xs font-semibold uppercase"
        style={{ color: "var(--yos-amber)" }}
      >
        <ShieldWarning size={15} weight="bold" aria-hidden="true" />
        <span className="yos-mono">{t("yusufOS:comms.approval.title")}</span>
        <span
          className="ms-auto yos-mono text-[10px]"
          style={{ color: "var(--yos-text-muted)" }}
        >
          {timeOf(i18n.language, at)}
        </span>
      </p>
      <p
        className="mt-1 text-[11.5px]"
        style={{ color: "var(--yos-text-secondary)" }}
      >
        {t("yusufOS:comms.approval.detail")}
      </p>
      {review ? (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11px]">
          {rows.map(([key, value]) => (
            <React.Fragment key={key}>
              <dt className="yos-label" style={{ fontSize: 9.5 }}>
                {t(`yusufOS:comms.approval.${key}`)}
              </dt>
              <dd className="min-w-0 truncate">
                {value ? (
                  <UntrustedText className="yos-mono">{value}</UntrustedText>
                ) : (
                  <span style={{ color: "var(--yos-text-muted)" }}>
                    {t("yusufOS:na.NOT_REPORTED")}
                  </span>
                )}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : failed ? (
        <p
          className="mt-2 text-[11px]"
          style={{ color: "var(--yos-text-muted)" }}
        >
          {t("yusufOS:comms.approval.detailUnavailable")}
        </p>
      ) : null}
      <Link
        to={`/os/approvals/${approvalId}`}
        className="yos-press mt-3 inline-flex min-h-[44px] items-center rounded-sm border px-3 text-xs font-semibold uppercase"
        style={{ borderColor: "var(--yos-amber)", color: "var(--yos-amber)" }}
      >
        <span className="yos-mono">{t("yusufOS:comms.approval.view")}</span>
      </Link>
    </div>
  );
}

function Message({ message }) {
  const { t, i18n } = useTranslation();
  if (message.role === "event") {
    return (
      <li
        className="yos-trace-new flex items-center gap-2 rounded-sm px-2 py-1 text-[10.5px]"
        data-message-role="event"
      >
        <span
          className="yos-status-dot"
          style={{ color: "var(--yos-cyan)", inlineSize: 5, blockSize: 5 }}
          aria-hidden="true"
        />
        <span
          className="yos-mono truncate"
          style={{ color: "var(--yos-text-secondary)" }}
          dir="ltr"
        >
          {message.type}
        </span>
        {message.aggregateId ? (
          <span
            className="yos-mono"
            style={{ color: "var(--yos-text-muted)" }}
            dir="ltr"
          >
            {message.aggregateId.slice(0, 8)}
          </span>
        ) : null}
        <span
          className="ms-auto yos-mono"
          style={{ color: "var(--yos-text-muted)" }}
        >
          {timeOf(i18n.language, message.at)}
        </span>
      </li>
    );
  }
  if (message.role === "yusuf")
    return (
      <li className="flex justify-end" data-message-role="yusuf">
        <div
          className="max-w-[88%] rounded-sm border px-3 py-2"
          style={{
            borderColor: "var(--yos-line-strong)",
            background: "rgb(34 184 245 / 0.08)",
          }}
        >
          <p className="flex items-center justify-between gap-4">
            <span
              className="yos-mono text-[10px] font-semibold uppercase"
              style={{ color: "var(--yos-cyan-bright)" }}
            >
              {t("yusufOS:comms.you")}{" "}
              {message.via === "voice"
                ? `· ${t("yusufOS:comms.viaVoice")}`
                : ""}
            </span>
            <span
              className="yos-mono text-[10px]"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {timeOf(i18n.language, message.at)}
            </span>
          </p>
          <UntrustedText
            as="p"
            className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed"
          >
            {message.text}
          </UntrustedText>
        </div>
      </li>
    );
  if (message.role === "error")
    return (
      <li data-message-role="error">
        <p
          role="alert"
          className="rounded-sm border px-3 py-2 text-xs"
          style={{
            borderColor: "rgb(255 94 108 / 0.5)",
            color: "var(--yos-red)",
          }}
        >
          <UntrustedText>{message.text}</UntrustedText>
        </p>
      </li>
    );
  const tone = toneFor(
    "task",
    message.state === "APPROVAL_REQUIRED" ? "WAITING_APPROVAL" : message.state
  );
  return (
    <li className="flex flex-col gap-2" data-message-role="agent">
      <div
        className="max-w-[92%] rounded-sm border px-3 py-2"
        style={{
          borderColor: "var(--yos-line)",
          background: "rgb(11 23 32 / 0.8)",
        }}
      >
        <p className="flex items-center justify-between gap-4">
          <span
            className="yos-mono text-[10px] font-semibold uppercase"
            style={{ color: "var(--yos-green)" }}
          >
            {t("yusufOS:comms.chief")}
          </span>
          <span
            className="yos-mono text-[10px]"
            style={{ color: "var(--yos-text-muted)" }}
          >
            {timeOf(i18n.language, message.at)}
          </span>
        </p>
        <UntrustedText
          as="p"
          className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed"
        >
          {message.text || t("yusufOS:comms.noResponseText")}
        </UntrustedText>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
          {message.state ? (
            <span
              className="yos-mono uppercase"
              style={{ color: toneStyle(tone).text }}
            >
              {t(`yusufOS:comms.state.${message.state}`, {
                defaultValue: message.state,
              })}
            </span>
          ) : null}
          {message.taskId ? (
            <Link
              to={`/os/tasks/${message.taskId}`}
              className="underline decoration-dotted underline-offset-2"
              style={{ color: "var(--yos-cyan-strong)" }}
            >
              {t("yusufOS:comms.openTask")}
            </Link>
          ) : null}
          {message.runId ? (
            <Link
              to={`/os/runs/${message.runId}`}
              className="underline decoration-dotted underline-offset-2"
              style={{ color: "var(--yos-cyan-strong)" }}
            >
              {t("yusufOS:comms.openRun")}
            </Link>
          ) : null}
        </p>
      </div>
      {message.approvalId ? (
        <ApprovalBlock approvalId={message.approvalId} at={message.at} />
      ) : null}
    </li>
  );
}

export function Composer() {
  const { t } = useTranslation();
  const session = useCommandSession();
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
    if (!result) setDraft(value);
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
      <label className="sr-only" htmlFor="yos-composer">
        {t("yusufOS:comms.placeholder")}
      </label>
      <textarea
        id="yos-composer"
        ref={textareaRef}
        rows={2}
        value={draft}
        maxLength={10000}
        onChange={(event) => setDraft(event.target.value)}
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
        aria-describedby="yos-composer-hint"
        className="min-h-[44px] flex-1 px-2 py-2 text-[13px] leading-snug"
        dir="auto"
      />
      <span id="yos-composer-hint" className="sr-only">
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
        aria-label={busy ? t("yusufOS:comms.sending") : t("yusufOS:comms.send")}
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

const TAB_KEYS = ["CHAT", "TASKS", "PLANS", "FILES", "MEMORY"];

export default function CommunicationConsole({
  dashboard,
  runtime,
  recentEvents = [],
  connection,
  headingId,
}) {
  const { t, i18n } = useTranslation();
  const session = useCommandSession();
  const [tab, setTab] = useState("CHAT");
  const logRef = useRef(null);
  const [sessionStart] = useState(() => Date.now());
  const tasks = dashboard?.taskStatuses || [];
  const memory = runtime?.knowledgeEvidenceMemory?.memory || null;

  // Interleave the command transcript with operational events received
  // during this session, by time. Events carry types and ids only.
  const timeline = useMemo(() => {
    const events = recentEvents
      .filter((event) => Date.parse(event.receivedAt || "") >= sessionStart)
      .map((event) => ({
        id: `e-${event.id}`,
        role: "event",
        type: event.type,
        aggregateId: event.aggregateId,
        at: event.receivedAt,
      }));
    return [...session.messages, ...events]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .slice(-80);
  }, [recentEvents, session.messages, sessionStart]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [timeline.length, tab]);

  const tabs = TAB_KEYS.map((key) => ({
    key,
    label: t(`yusufOS:comms.tab.${key}`),
    available:
      key === "PLANS" || key === "FILES"
        ? false
        : key === "MEMORY"
          ? Boolean(memory)
          : true,
    count: key === "TASKS" && dashboard ? tasks.length : undefined,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <h2 id={headingId} className="yos-title">
          {t("yusufOS:comms.title")}
        </h2>
        <span
          className="yos-mono flex items-center gap-1.5 text-[10px] font-semibold uppercase"
          style={{ color: toneStyle(toneFor("connection", connection)).text }}
        >
          <span className="yos-status-dot" aria-hidden="true" />
          {t(`yusufOS:connection.${connection || "IDLE"}`)}
        </span>
      </div>
      <Tabs
        label={t("yusufOS:comms.tabsLabel")}
        tabs={tabs}
        selected={tab}
        onSelect={setTab}
        className="mt-1 flex-1 px-1"
      >
        {tab === "CHAT" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
            <ol
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-label={t("yusufOS:comms.logLabel")}
              className="yos-scroll flex min-h-[160px] flex-1 flex-col gap-2 overflow-y-auto pe-1"
            >
              <li
                className="rounded-sm border px-3 py-2"
                style={{
                  borderColor: "rgb(255 184 77 / 0.35)",
                  background: "rgb(255 184 77 / 0.05)",
                }}
              >
                <p
                  className="yos-mono text-[10px] font-semibold uppercase"
                  style={{ color: "var(--yos-amber)" }}
                >
                  {t("yusufOS:comms.system")}
                </p>
                <p
                  className="mt-1 text-[11.5px] leading-relaxed"
                  style={{ color: "var(--yos-text-secondary)" }}
                >
                  {t("yusufOS:comms.systemNote")}
                </p>
              </li>
              {timeline.map((message) => (
                <Message key={message.id} message={message} />
              ))}
              {session.phase === "PROCESSING" ? (
                <li
                  className="yos-mono text-[11px]"
                  style={{ color: "var(--yos-cyan-strong)" }}
                  data-message-role="pending"
                >
                  {t("yusufOS:comms.processing")}
                </li>
              ) : null}
            </ol>
            <VoiceConsole embedded />
            <Composer />
          </div>
        ) : tab === "TASKS" ? (
          <ul className="yos-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
            {!dashboard ? (
              <li
                className="text-xs"
                style={{ color: "var(--yos-text-muted)" }}
              >
                {t("yusufOS:state.loading")}
              </li>
            ) : !tasks.length ? (
              <li
                className="text-xs"
                style={{ color: "var(--yos-text-secondary)" }}
              >
                {t("yusufOS:comms.noTasks")}
              </li>
            ) : (
              tasks.map((task) => {
                const style = toneStyle(toneFor("task", task.status));
                return (
                  <li key={task.taskId}>
                    <Link
                      to={`/os/tasks/${task.taskId}`}
                      className="yos-interactive yos-frame-inset flex min-h-[44px] items-center gap-3 px-2.5 py-1.5 text-xs"
                    >
                      <span
                        className="yos-mono"
                        dir="ltr"
                        style={{ color: "var(--yos-text)" }}
                      >
                        {String(task.taskId).slice(0, 8)}
                      </span>
                      <span
                        className="yos-mono text-[10px] uppercase"
                        style={{ color: style.text }}
                      >
                        {t(`yusufOS:status.task.${task.status}`, {
                          defaultValue: task.status,
                        })}
                      </span>
                      {task.priority ? (
                        <span
                          className="yos-mono text-[10px]"
                          style={{ color: "var(--yos-text-muted)" }}
                        >
                          {task.priority}
                        </span>
                      ) : null}
                      <span
                        className="ms-auto yos-mono text-[10px]"
                        style={{ color: "var(--yos-text-muted)" }}
                      >
                        {task.updatedAt
                          ? formatDateTime(i18n.language, task.updatedAt)
                          : ""}
                      </span>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        ) : tab === "MEMORY" && memory ? (
          <div className="p-3 text-xs">
            <p className="yos-label">{t("yusufOS:runtime.memoryByScope")}</p>
            <dl className="mt-2 grid grid-cols-2 gap-1">
              {Object.entries(memory.byScope || {}).map(([scope, count]) => (
                <React.Fragment key={scope}>
                  <dt className="yos-mono" dir="ltr">
                    {scope}
                  </dt>
                  <dd className="yos-mono text-end">{count}</dd>
                </React.Fragment>
              ))}
            </dl>
            <p className="mt-3" style={{ color: "var(--yos-text-muted)" }}>
              {t("yusufOS:runtime.safeSummary")}
            </p>
          </div>
        ) : (
          <div className="p-4 text-xs" data-unavailable-tab={tab}>
            <p
              className="yos-mono font-semibold uppercase"
              style={{ color: "var(--yos-text-secondary)" }}
            >
              {t("yusufOS:comms.unavailableTitle")}
            </p>
            <p className="mt-1" style={{ color: "var(--yos-text-muted)" }}>
              {t(`yusufOS:comms.unavailable.${tab}`)}
            </p>
          </div>
        )}
      </Tabs>
    </div>
  );
}
