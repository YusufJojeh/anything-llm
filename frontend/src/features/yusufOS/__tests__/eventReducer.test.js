import { describe, expect, test } from "vitest";
import {
  realtimeReducer,
  initialRealtimeState,
  CONNECTION,
} from "../realtime/eventReducer";
import { envelope } from "./fixtures";

const apply = (state, action) => realtimeReducer(state, action);

describe("SSE reconciliation", () => {
  test("applies an in-order event and advances the cursor", () => {
    const state = apply(initialRealtimeState(10), {
      type: "event",
      envelope: envelope(11),
    });
    expect(state.lastAppliedSequence).toBe(11);
    expect(state.cursor).toBe(11);
    expect(state.needsSnapshot).toBe(false);
    expect(state.touched.run).toEqual(["run-1"]);
  });

  test("at-least-once delivery: a duplicate event changes nothing", () => {
    const first = apply(initialRealtimeState(10), {
      type: "event",
      envelope: envelope(11),
    });
    const second = apply(first, { type: "event", envelope: envelope(11) });
    expect(second).toBe(first);
    expect(second.needsSnapshot).toBe(false);
  });

  test("an out-of-order older event is ignored without forcing a reload", () => {
    let state = apply(initialRealtimeState(4), {
      type: "event",
      envelope: envelope(5),
    });
    state = apply(state, { type: "event", envelope: envelope(3) });
    expect(state.lastAppliedSequence).toBe(5);
    expect(state.needsSnapshot).toBe(false);
  });

  test("a sequence gap applies the event and schedules a snapshot refetch", () => {
    const state = apply(initialRealtimeState(10), {
      type: "event",
      envelope: envelope(15),
    });
    expect(state.lastAppliedSequence).toBe(15);
    expect(state.needsSnapshot).toBe(true);
    expect(state.resyncReason).toBe("SEQUENCE_GAP");
  });

  test("a server reset frame takes the offered cursor and reloads", () => {
    const state = apply(initialRealtimeState(999), {
      type: "reset",
      cursor: "42",
      reason: "CURSOR_AHEAD_OF_CHAIN",
    });
    expect(state.cursor).toBe(42);
    expect(state.lastAppliedSequence).toBe(42);
    expect(state.seenIds).toEqual([]);
    expect(state.needsSnapshot).toBe(true);
    expect(state.resyncReason).toBe("CURSOR_AHEAD_OF_CHAIN");
  });

  test("an unknown schema version is never partially applied", () => {
    const state = apply(initialRealtimeState(10), {
      type: "event",
      envelope: envelope(11, { schemaVersion: 2 }),
    });
    expect(state.lastAppliedSequence).toBe(10);
    expect(state.resyncReason).toBe("UNKNOWN_SCHEMA_VERSION");
    expect(state.needsSnapshot).toBe(true);
  });

  test("a malformed envelope reconciles rather than corrupting state", () => {
    const state = apply(initialRealtimeState(10), {
      type: "event",
      envelope: null,
    });
    expect(state.needsSnapshot).toBe(true);
    expect(state.lastAppliedSequence).toBe(10);
  });

  test("a dropped connection always schedules reconciliation", () => {
    const state = apply(initialRealtimeState(10), { type: "error" });
    expect(state.connection).toBe(CONNECTION.RECONNECTING);
    expect(state.needsSnapshot).toBe(true);
    expect(state.resyncReason).toBe("CONNECTION_LOST");
  });

  test("returning to the tab reconciles instead of trusting the stream", () => {
    const state = apply(initialRealtimeState(10), { type: "visible" });
    expect(state.needsSnapshot).toBe(true);
    expect(state.resyncReason).toBe("VISIBILITY_RESTORED");
  });

  test("an applied snapshot is the only thing that clears the resync flag", () => {
    const gapped = apply(initialRealtimeState(10), {
      type: "event",
      envelope: envelope(20),
    });
    expect(gapped.needsSnapshot).toBe(true);
    const settled = apply(gapped, { type: "snapshotApplied", cursor: 25 });
    expect(settled.needsSnapshot).toBe(false);
    expect(settled.resyncReason).toBeNull();
    expect(settled.lastAppliedSequence).toBe(25);
    expect(settled.touched).toEqual({});
  });

  test("a snapshot never moves the applied sequence backwards", () => {
    const ahead = apply(initialRealtimeState(0), {
      type: "event",
      envelope: envelope(30),
    });
    const settled = apply(ahead, { type: "snapshotApplied", cursor: 5 });
    expect(settled.lastAppliedSequence).toBe(30);
  });

  test("the seen-id set stays bounded over a long-lived connection", () => {
    let state = initialRealtimeState(0);
    for (let sequence = 1; sequence <= 700; sequence += 1)
      state = apply(state, { type: "event", envelope: envelope(sequence) });
    expect(state.seenIds.length).toBeLessThanOrEqual(500);
    expect(state.lastAppliedSequence).toBe(700);
  });

  test("a quiet stream degrades to STALE rather than claiming LIVE", () => {
    const live = apply(initialRealtimeState(0), { type: "open" });
    expect(live.connection).toBe(CONNECTION.LIVE);
    expect(apply(live, { type: "stale" }).connection).toBe(CONNECTION.STALE);
  });

  test("reconnecting is distinguished from a first connection", () => {
    const live = apply(initialRealtimeState(0), { type: "open" });
    expect(apply(live, { type: "connecting" }).connection).toBe(
      CONNECTION.RECONNECTING
    );
    expect(
      apply(initialRealtimeState(0), { type: "connecting" }).connection
    ).toBe(CONNECTION.CONNECTING);
  });
});
