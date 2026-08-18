import React from "react";
import { useYusufOS, PHASES } from "@/features/yusufOS/state/YusufOSProvider";
import SystemHealth from "@/features/yusufOS/components/SystemHealth";
import { LoadingBlock, Panel } from "@/features/yusufOS/components/primitives";

/** Full-route System Health. Same component the core drawer renders. */
export default function System() {
  const { phase, dashboard, model, connection, realtime } = useYusufOS();

  if (phase === PHASES.LOADING && !dashboard)
    return (
      <div className="p-4 md:p-6">
        <Panel>
          <LoadingBlock rows={8} />
        </Panel>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <SystemHealth
        dashboard={dashboard}
        summary={model.summary}
        connection={connection}
        realtime={realtime}
      />
    </div>
  );
}
