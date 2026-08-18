import React, { useCallback, useId, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useYusufOS, PHASES } from "@/features/yusufOS/state/YusufOSProvider";
import AgentRoster from "@/features/yusufOS/components/AgentRoster";
import AgentDetailPanel from "@/features/yusufOS/components/AgentDetailPanel";
import Drawer from "@/features/yusufOS/components/Drawer";
import {
  EmptyState,
  LoadingBlock,
  Panel,
  SectionTitle,
} from "@/features/yusufOS/components/primitives";

/**
 * The Agents surface: the same roster and the same relationship sentences the
 * Command Center shows, given a full-width route of its own. There is no
 * second data path — both read the identical provider model, so they can never
 * disagree.
 */
export default function Agents() {
  const { t } = useTranslation();
  const { phase, dashboard, model } = useYusufOS();
  const [params, setParams] = useSearchParams();
  const headingId = useId();
  const selectedAgentId = params.get("agent");

  const select = useCallback(
    (agentId) => {
      const next = new URLSearchParams(params);
      if (agentId) next.set("agent", agentId);
      else next.delete("agent");
      setParams(next);
    },
    [params, setParams]
  );

  const selected = useMemo(
    () =>
      model.agents.find((agent) => agent.agentId === selectedAgentId) || null,
    [model.agents, selectedAgentId]
  );

  const loading = phase === PHASES.LOADING && !dashboard;

  return (
    <div className="p-4 md:p-6">
      <Panel aria-labelledby={headingId} className="mx-auto max-w-3xl">
        <SectionTitle id={headingId} className="px-4 pt-4">
          {t("yusufOS:agent.listLabel")}
        </SectionTitle>
        <div className="mt-2">
          {loading ? (
            <LoadingBlock rows={5} />
          ) : model.agents.length === 0 ? (
            <EmptyState title={t("yusufOS:agent.empty")} />
          ) : (
            <AgentRoster
              agents={model.agents}
              edges={model.edges}
              selectedAgentId={selectedAgentId}
              onSelectAgent={select}
              labelledBy={headingId}
            />
          )}
        </div>
      </Panel>

      <Drawer
        open={Boolean(selected)}
        onClose={() => select(null)}
        title={selected?.name || ""}
      >
        <AgentDetailPanel agent={selected} edges={model.edges} />
      </Drawer>
    </div>
  );
}
