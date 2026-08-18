/**
 * SSE reconciliation for the Gate F event contract.
 *
 * The persisted HTTP snapshot is the source of truth; this stream is a
 * delivery optimization (Gate B §5). So this reducer's job is not to maintain
 * a client-side event-sourced database — it is to decide, correctly, **when
 * the snapshot must be refetched**, and to keep a resumable cursor.
 *
 * The contract says at-least-once delivery with a monotonic global sequence.
 * That means the client must survive duplicates, out-of-order arrival,
 * sequence gaps, retention resets, unknown schema versions, and reconnects —
 * and none of those may be resolved by guessing. Every one of them resolves to
 * the same safe answer: reload the snapshot.
 */

export const SUPPORTED_SCHEMA_VERSION = 1;
// Enough to absorb realistic duplicate bursts without growing unbounded in a
// tab left open for days.
const MAX_SEEN_IDS = 500;

export const CONNECTION = Object.freeze({
  IDLE: "IDLE",
  CONNECTING: "CONNECTING",
  LIVE: "LIVE",
  RECONNECTING: "RECONNECTING",
  STALE: "STALE",
  OFFLINE: "OFFLINE",
});

export function initialRealtimeState(cursor = 0) {
  return {
    cursor: Number(cursor) || 0,
    lastAppliedSequence: Number(cursor) || 0,
    seenIds: [],
    connection: CONNECTION.IDLE,
    // Set whenever the stream can no longer prove it is in sync. The provider
    // watches this and refetches; it is cleared only by an applied snapshot.
    needsSnapshot: false,
    resyncReason: null,
    lastEventAt: null,
    // Aggregates touched since the last snapshot, so a refetch can be targeted
    // and, more importantly, so the UI can say *what* changed.
    touched: {},
    // Monotonic counter the provider uses to trigger effects without having to
    // diff the whole object.
    resyncNonce: 0,
  };
}

function remember(seenIds, id) {
  const next = seenIds.includes(id) ? seenIds : [...seenIds, id];
  return next.length > MAX_SEEN_IDS
    ? next.slice(next.length - MAX_SEEN_IDS)
    : next;
}

function requestResync(state, reason) {
  return {
    ...state,
    needsSnapshot: true,
    resyncReason: reason,
    resyncNonce: state.resyncNonce + 1,
  };
}

function touch(touched, envelope) {
  const bucket = touched[envelope.aggregateType] || [];
  if (bucket.includes(envelope.aggregateId)) return touched;
  return {
    ...touched,
    [envelope.aggregateType]: [...bucket, envelope.aggregateId],
  };
}

/**
 * @param {object} state
 * @param {{type: string}} action
 */
export function realtimeReducer(state, action) {
  switch (action.type) {
    case "connecting":
      return {
        ...state,
        connection:
          state.connection === CONNECTION.LIVE ||
          state.connection === CONNECTION.RECONNECTING
            ? CONNECTION.RECONNECTING
            : CONNECTION.CONNECTING,
      };

    case "open":
      return { ...state, connection: CONNECTION.LIVE };

    /**
     * A dropped connection can hide an arbitrary number of events, and the
     * retained-history window may have moved on. Reconnecting therefore always
     * schedules a snapshot rather than assuming the resume cursor is enough.
     */
    case "error":
      return requestResync(
        { ...state, connection: CONNECTION.RECONNECTING },
        "CONNECTION_LOST"
      );

    case "offline":
      return { ...state, connection: CONNECTION.OFFLINE };

    /** The server told us the cursor is unusable (`CURSOR_AHEAD_OF_CHAIN`,
     *  `RETENTION_GAP`). Take the cursor it offers and reload. */
    case "reset":
      return requestResync(
        {
          ...state,
          cursor: Number(action.cursor) || 0,
          lastAppliedSequence: Number(action.cursor) || 0,
          seenIds: [],
        },
        action.reason || "SERVER_RESET"
      );

    case "event": {
      const envelope = action.envelope;
      if (!envelope || typeof envelope.id !== "string")
        return requestResync(state, "MALFORMED_EVENT");

      // A schema we do not understand must not be partially applied.
      if (envelope.schemaVersion !== SUPPORTED_SCHEMA_VERSION)
        return requestResync(state, "UNKNOWN_SCHEMA_VERSION");

      // At-least-once delivery: the same event can legitimately arrive twice.
      // Dedupe by id and change nothing else — a duplicate is not a resync.
      if (state.seenIds.includes(envelope.id)) return state;

      const sequence = Number(envelope.sequence);
      if (!Number.isInteger(sequence))
        return requestResync(state, "MALFORMED_EVENT");

      // Already applied (or older than) what we have: ignore it. Out-of-order
      // arrival is expected and is not, on its own, a reason to reload.
      if (sequence <= state.lastAppliedSequence)
        return { ...state, seenIds: remember(state.seenIds, envelope.id) };

      // A real gap means events we will never see otherwise. Apply this one
      // and reload the snapshot to recover whatever fell in the hole.
      const gapped = sequence > state.lastAppliedSequence + 1;

      const next = {
        ...state,
        cursor: sequence,
        lastAppliedSequence: sequence,
        seenIds: remember(state.seenIds, envelope.id),
        lastEventAt: action.at || new Date().toISOString(),
        touched: touch(state.touched, envelope),
        connection: CONNECTION.LIVE,
      };
      return gapped ? requestResync(next, "SEQUENCE_GAP") : next;
    }

    /** A snapshot landed: the client is authoritative again. */
    case "snapshotApplied":
      return {
        ...state,
        cursor: Number(action.cursor) || state.cursor,
        lastAppliedSequence: Math.max(
          state.lastAppliedSequence,
          Number(action.cursor) || 0
        ),
        needsSnapshot: false,
        resyncReason: null,
        touched: {},
      };

    /** Tab became visible again — cheap to reconcile, expensive to be wrong. */
    case "visible":
      return requestResync(state, "VISIBILITY_RESTORED");

    /** No traffic for long enough that "LIVE" would be an overstatement. */
    case "stale":
      return state.connection === CONNECTION.LIVE
        ? { ...state, connection: CONNECTION.STALE }
        : state;

    default:
      return state;
  }
}
