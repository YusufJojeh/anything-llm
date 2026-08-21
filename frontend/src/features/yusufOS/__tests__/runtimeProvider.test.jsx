import React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  roster: vi.fn(),
  runtime: vi.fn(),
}));

vi.mock("../api/client", () => ({
  yusufApi: {
    sessionStatus: vi.fn().mockResolvedValue({
      configured: true,
      unlocked: true,
      csrfToken: "csrf",
    }),
    dashboard: mocks.dashboard,
    roster: mocks.roster,
    runtime: mocks.runtime,
  },
  eventStreamUrl: () => "/events",
  setCsrfToken: vi.fn(),
  onSessionLost: () => () => {},
}));

import { YusufOSProvider, useYusufOS } from "../state/YusufOSProvider";

function Probe() {
  const state = useYusufOS();
  return (
    <div>
      <span>{state.dashboard?.marker || "no-dashboard"}</span>
      <span>{state.roster?.marker || "no-roster"}</span>
      <span>{state.runtimePhase}</span>
    </div>
  );
}

describe("runtime state isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  test("a runtime failure cannot blank the existing Command Center snapshot", async () => {
    mocks.dashboard.mockResolvedValue({
      marker: "dashboard-ok",
      eventCursor: 0,
    });
    mocks.roster.mockResolvedValue({ marker: "roster-ok", agents: [] });
    mocks.runtime.mockRejectedValue(new Error("runtime unavailable"));

    const view = render(
      <YusufOSProvider>
        <Probe />
      </YusufOSProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("dashboard-ok")).toBeInTheDocument();
      expect(screen.getByText("roster-ok")).toBeInTheDocument();
      expect(screen.getByText("ERROR")).toBeInTheDocument();
    });
    view.unmount();
  });

  test("quiet runtime state is refreshed without requiring an SSE event", async () => {
    vi.useFakeTimers();
    mocks.dashboard.mockResolvedValue({
      marker: "dashboard-ok",
      eventCursor: 0,
    });
    mocks.roster.mockResolvedValue({ marker: "roster-ok", agents: [] });
    mocks.runtime.mockResolvedValue({ asOf: "2026-08-21T12:00:00.000Z" });

    const view = render(
      <YusufOSProvider>
        <Probe />
      </YusufOSProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.runtime).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(mocks.runtime).toHaveBeenCalledTimes(2);
    view.unmount();
    vi.useRealTimers();
  });
});
