import React from "react";
import { useTranslation } from "react-i18next";
import { CORE_FIELD_RADIUS, VIEWBOX } from "../state/constellationLayout";
import AgentConstellation from "./AgentConstellation";
import SystemCore from "./core/SystemCore";
import { LoadingBlock } from "./primitives";

/**
 * The mission-control stage: the 3D System Core and the Agent constellation,
 * composited into one object.
 *
 * The only structurally interesting thing here is *alignment*. The constellation
 * is an SVG with a square viewBox; the core's rings are a separate layer drawn
 * behind it, in WebGL or CSS 3D. For the rings to stay concentric with the core
 * disc at every viewport, both layers have to agree on where the centre is and
 * how large a viewBox unit currently is.
 *
 * That is solved geometrically, not by measurement: the stage centres a strictly
 * square box (`.yos-stage-square`), both layers fill it, and the core layer is
 * sized to exactly `2 × CORE_FIELD_RADIUS` viewBox units expressed as a
 * percentage of that square. No ResizeObserver, no layout effect, and no frame
 * in which the two layers disagree.
 */

/** The core layer's size, as a percentage of the square stage. */
export const CORE_FIELD_PERCENT = `${((CORE_FIELD_RADIUS * 2) / VIEWBOX) * 100}%`;

export default function CommandStage({
  agents,
  edges,
  coreState,
  selectedAgentId,
  coreSelected,
  onSelectAgent,
  onSelectCore,
  loading = false,
  orphanedEdgeCount = 0,
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="yos-stage relative flex min-h-0 flex-1 items-center justify-center">
        {loading ? (
          <LoadingBlock rows={8} />
        ) : (
          <div className="yos-stage-square relative">
            <SystemCore
              coreState={coreState}
              style={{
                inlineSize: CORE_FIELD_PERCENT,
                blockSize: CORE_FIELD_PERCENT,
                // Physical centring on purpose: a centred box is centred in
                // both directions, so this needs no RTL variant and cannot
                // drift when the document direction flips.
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />
            <AgentConstellation
              agents={agents}
              edges={edges}
              coreState={coreState}
              selectedAgentId={selectedAgentId}
              coreSelected={coreSelected}
              onSelectAgent={onSelectAgent}
              onSelectCore={onSelectCore}
            />
          </div>
        )}
      </div>

      {/*
       * An edge whose endpoint is not in the roster is a real inconsistency, not
       * a rendering detail, so it is reported in words rather than dropped
       * silently.
       */}
      {orphanedEdgeCount ? (
        <p
          className="mt-2 px-1 text-[11px]"
          style={{ color: "var(--yos-warning-text)" }}
        >
          {t("yusufOS:constellation.orphanEdges", { count: orphanedEdgeCount })}
        </p>
      ) : null}
    </div>
  );
}
