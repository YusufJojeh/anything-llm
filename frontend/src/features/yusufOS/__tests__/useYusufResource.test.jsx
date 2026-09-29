import React, { useCallback } from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../api/client", () => ({
  yusufApi: {},
  eventStreamUrl: () => "/events",
  setCsrfToken: () => {},
  onSessionLost: () => () => {},
}));

import { useYusufResource, PHASES } from "../state/YusufOSProvider";

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function Probe({ resourceId, loaders }) {
  const load = useCallback(() => loaders[resourceId].promise, [resourceId]);
  const { phase, data } = useYusufResource(load);
  return (
    <div>
      <span data-testid="phase">{phase}</span>
      <span data-testid="value">{data?.value ?? "none"}</span>
    </div>
  );
}

describe("useYusufResource — resource-identity isolation", () => {
  test("switching to a different resource never paints the previous resource's data as current", async () => {
    const loaders = {
      a: deferred(),
      b: deferred(),
    };

    const view = render(<Probe resourceId="a" loaders={loaders} />);
    loaders.a.resolve({ value: "A" });
    await waitFor(() =>
      expect(screen.getByTestId("value")).toHaveTextContent("A")
    );

    // Switch to a genuinely different resource, whose fetch has not resolved
    // yet. The old resource's data ("A") must never appear labeled as the
    // new resource's data, not even for one paint before the fetch settles.
    view.rerender(<Probe resourceId="b" loaders={loaders} />);
    expect(screen.getByTestId("phase")).toHaveTextContent(PHASES.LOADING);
    expect(screen.getByTestId("value")).toHaveTextContent("none");

    loaders.b.resolve({ value: "B" });
    await waitFor(() =>
      expect(screen.getByTestId("value")).toHaveTextContent("B")
    );
  });
});
