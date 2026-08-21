import React from "react";
import { useTranslation } from "react-i18next";
import { useYusufOS } from "@/features/yusufOS/state/YusufOSProvider";
import {
  Count,
  EmptyState,
  ErrorBlock,
  KeyValue,
  LoadingBlock,
  Panel,
  SectionTitle,
  Timestamp,
  UntrustedText,
} from "@/features/yusufOS/components/primitives";

function Availability({ available, trueLabel, falseLabel }) {
  return (
    <span
      className="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{
        color: available ? "var(--yos-accent-strong)" : "var(--yos-text-muted)",
        borderColor: available
          ? "var(--yos-accent)"
          : "var(--yos-border-strong)",
      }}
    >
      {available ? trueLabel : falseLabel}
    </span>
  );
}

function JsonSummary({ value }) {
  if (value === null || value === undefined) return <span>{"—"}</span>;
  return (
    <UntrustedText
      as="code"
      className="block break-words font-mono text-[11px] leading-5"
      style={{ color: "var(--yos-text-secondary)" }}
    >
      {JSON.stringify(value)}
    </UntrustedText>
  );
}

function ModelRuntime({ data }) {
  const { t } = useTranslation();
  const ollama = data.ollama;
  return (
    <Panel className="p-4 md:p-5" aria-labelledby="runtime-models-title">
      <SectionTitle id="runtime-models-title">
        {t("yusufOS:runtime.models")}
      </SectionTitle>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--yos-border-faint)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium" style={{ color: "var(--yos-text)" }}>
              Ollama
            </h3>
            <Availability
              available={ollama.reachable}
              trueLabel={t("yusufOS:runtime.reachable")}
              falseLabel={ollama.status || t("yusufOS:state.unknown")}
            />
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <KeyValue label={t("yusufOS:runtime.endpoint")} mono>
              <UntrustedText>{ollama.endpoint || "—"}</UntrustedText>
            </KeyValue>
            <KeyValue label={t("yusufOS:runtime.gemma")}>
              {ollama.gemmaFamily?.present ? (
                <UntrustedText>
                  {ollama.gemmaFamily.matches.join(", ")}
                </UntrustedText>
              ) : (
                t("yusufOS:runtime.notInstalled")
              )}
            </KeyValue>
          </dl>
          <div className="mt-4">
            <p
              className="text-[11px] uppercase tracking-[0.1em]"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {t("yusufOS:runtime.installedModels")}
            </p>
            {ollama.models.length ? (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {ollama.models.map((model) => (
                  <li
                    key={model.fullName}
                    className="rounded border px-3 py-2"
                    style={{ borderColor: "var(--yos-border-faint)" }}
                  >
                    <UntrustedText className="font-mono text-xs">
                      {model.fullName}
                    </UntrustedText>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                className="mt-2 text-xs"
                style={{ color: "var(--yos-text-secondary)" }}
              >
                {t("yusufOS:runtime.noModels")}
              </p>
            )}
          </div>
        </div>
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--yos-border-faint)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium" style={{ color: "var(--yos-text)" }}>
              OpenAI
            </h3>
            <Availability
              available={data.openai.configured}
              trueLabel={t("yusufOS:runtime.configured")}
              falseLabel={t("yusufOS:runtime.notConfigured")}
            />
          </div>
          <p
            className="mt-3 text-xs leading-5"
            style={{ color: "var(--yos-text-secondary)" }}
          >
            {t("yusufOS:runtime.keySafe")}
          </p>
          <div className="mt-5">
            <p
              className="text-[11px] uppercase tracking-[0.1em]"
              style={{ color: "var(--yos-text-muted)" }}
            >
              {t("yusufOS:runtime.modelPolicies")}
            </p>
            <ul
              className="mt-2 divide-y"
              style={{ borderColor: "var(--yos-border-faint)" }}
            >
              {data.agentModelPolicies.map((policy) => (
                <li
                  key={policy.agentId}
                  className="grid gap-1 py-2 text-xs sm:grid-cols-[1fr_auto]"
                >
                  <UntrustedText
                    className="font-medium"
                    style={{ color: "var(--yos-text)" }}
                  >
                    {policy.agentId}
                  </UntrustedText>
                  <span
                    className="font-mono"
                    style={{ color: "var(--yos-text-secondary)" }}
                  >
                    {policy.routingPolicy || "UNAVAILABLE"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="mt-5">
        <h3
          className="text-sm font-medium"
          style={{ color: "var(--yos-text)" }}
        >
          {t("yusufOS:runtime.recentCompletions")}
        </h3>
        {data.recentCompletions.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-[760px] w-full text-start text-xs">
              <thead style={{ color: "var(--yos-text-muted)" }}>
                <tr>
                  {[
                    "agent",
                    "providerModel",
                    "routing",
                    "fallback",
                    "latency",
                    "tokens",
                    "cost",
                    "updated",
                  ].map((key) => (
                    <th
                      key={key}
                      scope="col"
                      className="px-2 py-2 text-start font-medium"
                    >
                      {t(`yusufOS:runtime.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recentCompletions.map((row) => (
                  <tr
                    key={row.runId}
                    className="border-t"
                    style={{ borderColor: "var(--yos-border-faint)" }}
                  >
                    <td className="px-2 py-2">
                      <UntrustedText>{row.agentId || "—"}</UntrustedText>
                    </td>
                    <td className="px-2 py-2 font-mono">
                      <UntrustedText>
                        {row.provider && row.model
                          ? `${row.provider} / ${row.model}`
                          : "UNAVAILABLE"}
                      </UntrustedText>
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {row.routingPolicy || "UNAVAILABLE"}
                    </td>
                    <td className="px-2 py-2">
                      {row.fallbackOccurred === null
                        ? "UNAVAILABLE"
                        : row.fallbackOccurred
                          ? t("yusufOS:runtime.yes")
                          : t("yusufOS:runtime.no")}
                    </td>
                    <td className="px-2 py-2">
                      {row.latencyMs === null ? "—" : `${row.latencyMs} ms`}
                    </td>
                    <td className="px-2 py-2">
                      <Count value={row.usage?.totalTokens} />
                    </td>
                    <td className="px-2 py-2">
                      {row.costConfidence}
                      {row.estimatedCostMicros === null
                        ? ""
                        : ` / ${row.estimatedCostMicros}`}
                    </td>
                    <td className="px-2 py-2">
                      <Timestamp value={row.updatedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t("yusufOS:runtime.noCompletions")} />
        )}
      </div>
    </Panel>
  );
}

function Organization({ departments }) {
  const { t } = useTranslation();
  return (
    <Panel className="p-4 md:p-5" aria-labelledby="runtime-organization-title">
      <SectionTitle id="runtime-organization-title">
        {t("yusufOS:runtime.organization")}
      </SectionTitle>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {departments.map((department) => (
          <section
            key={department.departmentId}
            className="rounded-lg border p-4"
            style={{ borderColor: "var(--yos-border-faint)" }}
          >
            <h3 className="font-medium" style={{ color: "var(--yos-text)" }}>
              <UntrustedText>{department.name}</UntrustedText>
            </h3>
            <UntrustedText
              as="p"
              className="mt-1 text-xs leading-5"
              style={{ color: "var(--yos-text-secondary)" }}
            >
              {department.mission}
            </UntrustedText>
            <ul className="mt-3 space-y-3">
              {department.agents.map((agent) => (
                <li
                  key={agent.agentId}
                  className="rounded border p-3"
                  style={{ borderColor: "var(--yos-border-faint)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <UntrustedText className="text-sm font-medium">
                      {agent.name || agent.agentId}
                    </UntrustedText>
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--yos-accent-strong)" }}
                    >
                      {agent.autonomyLevel || "—"}
                    </span>
                  </div>
                  <p
                    className="mt-2 text-xs"
                    style={{ color: "var(--yos-text-secondary)" }}
                  >
                    {t("yusufOS:runtime.jobsSkills", {
                      jobs: agent.jobs.total,
                      skills: agent.skills.length,
                    })}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {agent.skills.slice(0, 6).map((skill) => (
                      <code
                        key={skill}
                        className="rounded px-1.5 py-0.5 text-[10px]"
                        style={{ backgroundColor: "var(--yos-surface-hover)" }}
                      >
                        {skill}
                      </code>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}

function MonitoringAndMemory({ monitoring, kem }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="p-4 md:p-5" aria-labelledby="runtime-monitoring-title">
        <SectionTitle id="runtime-monitoring-title">
          {t("yusufOS:runtime.monitoring")}
        </SectionTitle>
        {!monitoring.available ? (
          <EmptyState title={t("yusufOS:runtime.monitoringUnavailable")} />
        ) : monitoring.checks.length ? (
          <ul className="mt-3 space-y-3">
            {monitoring.checks.map((check) => (
              <li
                key={check.checkId}
                className="rounded-lg border p-3"
                style={{ borderColor: "var(--yos-border-faint)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="text-xs">{check.checkKey}</code>
                  <span className="text-xs font-medium">{check.status}</span>
                </div>
                <UntrustedText
                  as="p"
                  className="mt-2 text-xs"
                  style={{ color: "var(--yos-text-secondary)" }}
                >
                  {check.summary}
                </UntrustedText>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <KeyValue label={t("yusufOS:runtime.observed")}>
                    <JsonSummary value={check.observedValue} />
                  </KeyValue>
                  <KeyValue label={t("yusufOS:runtime.threshold")}>
                    <JsonSummary value={check.threshold} />
                  </KeyValue>
                </dl>
                <p
                  className="mt-2 text-[11px]"
                  style={{ color: "var(--yos-text-muted)" }}
                >
                  <Timestamp value={check.createdAt} />
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t("yusufOS:runtime.noChecks")} />
        )}
      </Panel>
      <Panel className="p-4 md:p-5" aria-labelledby="runtime-memory-title">
        <SectionTitle id="runtime-memory-title">
          {t("yusufOS:runtime.knowledgeMemory")}
        </SectionTitle>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          <KeyValue label={t("yusufOS:runtime.knowledge")}>
            <Count value={kem.knowledge.total} />
          </KeyValue>
          <KeyValue label={t("yusufOS:runtime.memory")}>
            <Count value={kem.memory.total} />
          </KeyValue>
          <KeyValue label={t("yusufOS:runtime.tombstoned")}>
            <Count value={kem.evidence.tombstoned} />
          </KeyValue>
        </dl>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <KeyValue label={t("yusufOS:runtime.knowledgeBySource")}>
            <JsonSummary value={kem.knowledge.bySourceType} />
          </KeyValue>
          <KeyValue label={t("yusufOS:runtime.memoryByScope")}>
            <JsonSummary value={kem.memory.byScope} />
          </KeyValue>
        </div>
        <p
          className="mt-5 text-xs leading-5"
          style={{ color: "var(--yos-text-secondary)" }}
        >
          {t("yusufOS:runtime.safeSummary")}
        </p>
      </Panel>
    </div>
  );
}

export default function Runtime() {
  const { t } = useTranslation();
  const { runtime, runtimePhase, runtimeError, refreshRuntime } = useYusufOS();
  if (!runtime && runtimePhase === "LOADING") return <LoadingBlock rows={8} />;
  if (!runtime)
    return <ErrorBlock error={runtimeError} onRetry={refreshRuntime} />;
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div
          className="flex flex-wrap items-center justify-between gap-3 text-xs"
          style={{ color: "var(--yos-text-muted)" }}
        >
          <span>
            {t("yusufOS:runtime.observedAt")} <Timestamp value={runtime.asOf} />
          </span>
          <button
            type="button"
            onClick={refreshRuntime}
            className="yos-touch-target rounded border px-3"
            style={{ borderColor: "var(--yos-border-strong)" }}
          >
            {t("yusufOS:runtime.refresh")}
          </button>
        </div>
        {runtimeError ? <ErrorBlock error={runtimeError} /> : null}
        <ModelRuntime data={runtime.modelRuntime} />
        <Organization departments={runtime.departments} />
        <MonitoringAndMemory
          monitoring={runtime.monitoring}
          kem={runtime.knowledgeEvidenceMemory}
        />
      </div>
    </div>
  );
}
