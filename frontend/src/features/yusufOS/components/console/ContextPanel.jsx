import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toneFor, toneStyle } from "../../state/statusSemantics";
import { NA, latestCompletion } from "../../state/consoleModel";
import { UntrustedText } from "../primitives";
import { ConsoleValue } from "./CoreStage";
import Tabs from "./Tabs";

const TAB_KEYS = ["CONTEXT", "EVIDENCE", "TOOLS", "MEMORY", "RUNTIME"];

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1 text-[11.5px] yos-divider last:border-b-0">
      <dt style={{ color: "var(--yos-text-secondary)" }}>{label}</dt>
      <dd className="min-w-0 truncate text-end">{children}</dd>
    </div>
  );
}

function Counts({ entries, empty }) {
  const list = Object.entries(entries || {});
  if (!list.length)
    return (
      <p className="text-xs" style={{ color: "var(--yos-text-muted)" }}>
        {empty}
      </p>
    );
  return (
    <dl>
      {list.map(([key, count]) => (
        <Row
          key={key}
          label={
            <span className="yos-mono" dir="ltr">
              {key}
            </span>
          }
        >
          <ConsoleValue value={count} />
        </Row>
      ))}
    </dl>
  );
}

/**
 * Bottom-right context tabs. Only safe labels and counts — no prompt text,
 * memory values, knowledge bodies or evidence payloads (the runtime projection
 * never carries them, and this panel does not ask for them).
 */
export default function ContextPanel({
  operation,
  lastCommand,
  runtime,
  runtimePhase,
  dashboard,
  selectedAgent,
  headingId,
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("CONTEXT");
  const kem = runtime?.knowledgeEvidenceMemory || null;
  const latest = latestCompletion(runtime);
  const pending =
    !runtime && runtimePhase !== "ERROR" ? NA.LOADING : NA.UNAVAILABLE;
  const adapters = dashboard?.adapterHealth || [];

  const tabs = TAB_KEYS.map((key) => ({
    key,
    label: t(`yusufOS:context.tab.${key}`),
    count:
      key === "EVIDENCE" && kem
        ? Object.values(kem.evidence?.byClass || {}).reduce((a, b) => a + b, 0)
        : key === "TOOLS" && dashboard
          ? adapters.length
          : undefined,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 id={headingId} className="sr-only">
        {t("yusufOS:context.title")}
      </h2>
      <Tabs
        label={t("yusufOS:context.title")}
        tabs={tabs}
        selected={tab}
        onSelect={setTab}
        className="flex-1 px-1 pt-1"
      >
        <div className="yos-scroll min-h-0 flex-1 overflow-y-auto p-3">
          {tab === "CONTEXT" ? (
            <>
              <p className="yos-label mb-1">{t("yusufOS:context.active")}</p>
              <dl>
                <Row label={t("yusufOS:context.task")}>
                  {operation?.taskId ? (
                    <Link
                      to={`/os/tasks/${operation.taskId}`}
                      className="yos-mono underline decoration-dotted"
                      style={{ color: "var(--yos-cyan-strong)" }}
                      dir="ltr"
                    >
                      {operation.taskId.slice(0, 8)}
                    </Link>
                  ) : (
                    <ConsoleValue value={NA.NOT_REPORTED} />
                  )}
                </Row>
                <Row label={t("yusufOS:context.run")}>
                  {operation?.runId ? (
                    <Link
                      to={`/os/runs/${operation.runId}`}
                      className="yos-mono underline decoration-dotted"
                      style={{ color: "var(--yos-cyan-strong)" }}
                      dir="ltr"
                    >
                      {operation.runId.slice(0, 8)}
                    </Link>
                  ) : (
                    <ConsoleValue value={NA.NOT_REPORTED} />
                  )}
                </Row>
                <Row label={t("yusufOS:context.lastCommand")}>
                  {lastCommand?.state ? (
                    <span
                      className="yos-mono text-[10.5px] uppercase"
                      style={{
                        color: toneStyle(
                          toneFor(
                            "task",
                            lastCommand.state === "APPROVAL_REQUIRED"
                              ? "WAITING_APPROVAL"
                              : lastCommand.state
                          )
                        ).text,
                      }}
                    >
                      {t(`yusufOS:comms.state.${lastCommand.state}`, {
                        defaultValue: lastCommand.state,
                      })}
                    </span>
                  ) : (
                    <ConsoleValue value={NA.NOT_REPORTED} />
                  )}
                </Row>
                <Row label={t("yusufOS:context.selectedAgent")}>
                  {selectedAgent ? (
                    <UntrustedText>{selectedAgent.name}</UntrustedText>
                  ) : (
                    <span style={{ color: "var(--yos-text-muted)" }}>—</span>
                  )}
                </Row>
                <Row label={t("yusufOS:context.model")}>
                  <ConsoleValue
                    value={
                      runtime
                        ? latest
                          ? `${latest.provider || "?"} / ${latest.model || "?"}`
                          : NA.NOT_REPORTED
                        : pending
                    }
                    raw={Boolean(latest)}
                  />
                </Row>
                <Row label={t("yusufOS:context.routing")}>
                  <ConsoleValue
                    value={
                      runtime
                        ? latest?.routingPolicy || NA.NOT_REPORTED
                        : pending
                    }
                    raw={Boolean(latest?.routingPolicy)}
                  />
                </Row>
              </dl>
            </>
          ) : tab === "EVIDENCE" ? (
            kem ? (
              <>
                <Counts
                  entries={kem.evidence?.byClass}
                  empty={t("yusufOS:context.noEvidence")}
                />
                <dl className="mt-2">
                  <Row label={t("yusufOS:runtime.tombstoned")}>
                    <ConsoleValue value={kem.evidence?.tombstoned ?? null} />
                  </Row>
                </dl>
              </>
            ) : (
              <ConsoleValue value={pending} />
            )
          ) : tab === "TOOLS" ? (
            <>
              {!dashboard ? (
                <ConsoleValue value={NA.LOADING} />
              ) : !adapters.length ? (
                <p
                  className="text-xs"
                  style={{ color: "var(--yos-text-muted)" }}
                >
                  {t("yusufOS:context.noAdapters")}
                </p>
              ) : (
                <dl>
                  {adapters.map((adapter) => (
                    <Row
                      key={adapter.adapterId}
                      label={
                        <UntrustedText className="yos-mono">
                          {adapter.adapterId}
                        </UntrustedText>
                      }
                    >
                      <span
                        className="yos-mono text-[10.5px] uppercase"
                        style={{
                          color: toneStyle(toneFor("adapter", adapter.status))
                            .text,
                        }}
                      >
                        {t(`yusufOS:status.adapter.${adapter.status}`, {
                          defaultValue: adapter.status,
                        })}
                      </span>
                      <span
                        className="yos-mono ms-2"
                        style={{ color: "var(--yos-text-muted)" }}
                      >
                        {t("yusufOS:rail.capabilities", {
                          count: adapter.capabilityCount ?? 0,
                        })}
                      </span>
                    </Row>
                  ))}
                </dl>
              )}
              {selectedAgent?.capabilityKeys?.length ? (
                <>
                  <p className="yos-label mt-3">
                    {t("yusufOS:context.agentCapabilities", {
                      name: selectedAgent.name,
                    })}
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {selectedAgent.capabilityKeys.map((key) => (
                      <li
                        key={key}
                        className="yos-mono rounded-sm border px-1.5 py-0.5 text-[10px] yos-divider"
                        dir="ltr"
                      >
                        {key}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : tab === "MEMORY" ? (
            kem ? (
              <>
                <p className="yos-label mb-1">
                  {t("yusufOS:runtime.memoryByScope")}
                </p>
                <Counts
                  entries={kem.memory?.byScope}
                  empty={t("yusufOS:context.none")}
                />
                <p className="yos-label mb-1 mt-3">
                  {t("yusufOS:runtime.knowledgeBySource")}
                </p>
                <Counts
                  entries={kem.knowledge?.bySourceType}
                  empty={t("yusufOS:context.none")}
                />
              </>
            ) : (
              <ConsoleValue value={pending} />
            )
          ) : (
            <>
              <dl>
                <Row label="Ollama">
                  <ConsoleValue
                    value={
                      runtime
                        ? runtime.modelRuntime?.ollama?.reachable
                          ? "REACHABLE"
                          : runtime.modelRuntime?.ollama?.status ||
                            NA.UNAVAILABLE
                        : pending
                    }
                  />
                </Row>
                <Row label="OpenAI">
                  <ConsoleValue
                    value={
                      runtime
                        ? runtime.modelRuntime?.openai?.configured
                          ? "CONFIGURED"
                          : "NOT_CONFIGURED"
                        : pending
                    }
                  />
                </Row>
                <Row label={t("yusufOS:runtime.latency")}>
                  <ConsoleValue
                    value={
                      latest
                        ? (latest.latencyMs ?? NA.NOT_REPORTED)
                        : runtime
                          ? NA.NOT_REPORTED
                          : pending
                    }
                    unit="ms"
                  />
                </Row>
                <Row label={t("yusufOS:runtime.cost")}>
                  <ConsoleValue
                    value={
                      latest
                        ? latest.costConfidence || NA.NOT_REPORTED
                        : runtime
                          ? NA.NOT_REPORTED
                          : pending
                    }
                  />
                </Row>
              </dl>
              <Link
                to="/os/runtime"
                className="mt-3 inline-flex min-h-[44px] items-center text-xs underline decoration-dotted"
                style={{ color: "var(--yos-cyan-strong)" }}
              >
                {t("yusufOS:context.openRuntime")}
              </Link>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}
