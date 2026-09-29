import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  yusufApi,
  eventStreamUrl,
  setCsrfToken,
  onSessionLost,
} from "../api/client";
import {
  realtimeReducer,
  initialRealtimeState,
  CONNECTION,
} from "../realtime/eventReducer";
import { buildCommandCenter } from "./commandCenterModel";

/**
 * The one place Yusuf OS server state lives.
 *
 * Ownership, per the Gate B state rules:
 * - this provider owns the normalized server projections, the event cursor and
 *   the connection state;
 * - the URL owns the selected aggregate and any filters;
 * - disclosure state and form drafts stay local to their components.
 *
 * Load order is snapshot-first, always: fetch `/dashboard` and the roster,
 * render real state, *then* connect the stream. The UI is never waiting on SSE
 * to show anything.
 */

const YusufOSContext = createContext(null);

export const PHASES = Object.freeze({
  LOADING: "LOADING",
  READY: "READY",
  ERROR: "ERROR",
});

export const SESSION = Object.freeze({
  CHECKING: "CHECKING",
  LOCKED: "LOCKED",
  UNLOCKED: "UNLOCKED",
  UNCONFIGURED: "UNCONFIGURED",
});

// How long without any stream traffic before "LIVE" stops being an honest
// claim. The server heartbeats every 15s, so 45s is three missed beats.
const STALE_AFTER_MS = 45000;
// Collapses a burst of resync triggers into one refetch.
const RESYNC_DEBOUNCE_MS = 350;
const RUNTIME_REFRESH_MS = 30000;
const EVENT_REFRESH_DEBOUNCE_MS = 600;

export function YusufOSProvider({ children }) {
  const [session, setSession] = useState(SESSION.CHECKING);
  const [phase, setPhase] = useState(PHASES.LOADING);
  const [error, setError] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [roster, setRoster] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [runtimePhase, setRuntimePhase] = useState(PHASES.LOADING);
  const [runtimeError, setRuntimeError] = useState(null);
  const [realtime, dispatch] = useReducer(
    realtimeReducer,
    0,
    initialRealtimeState
  );

  const streamRef = useRef(null);
  const staleTimerRef = useRef(null);
  const resyncTimerRef = useRef(null);
  const inFlightRef = useRef(null);
  const runtimeInFlightRef = useRef(null);

  /** Reads the durable snapshot. This is the only thing that can clear a resync. */
  const loadSnapshot = useCallback(async ({ silent = false } = {}) => {
    if (inFlightRef.current) inFlightRef.current.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    if (!silent) setPhase(PHASES.LOADING);
    try {
      const [nextDashboard, nextRoster] = await Promise.all([
        yusufApi.dashboard({ signal: controller.signal }),
        yusufApi.roster({ signal: controller.signal }),
      ]);
      setDashboard(nextDashboard);
      setRoster(nextRoster);
      setError(null);
      setPhase(PHASES.READY);
      dispatch({
        type: "snapshotApplied",
        cursor: Number(nextDashboard?.eventCursor) || 0,
      });
      return true;
    } catch (cause) {
      if (cause?.name === "AbortError") return false;
      if (cause?.status === 401) {
        setSession(SESSION.LOCKED);
        return false;
      }
      setError(cause);
      // A failed *refresh* keeps the last good snapshot on screen with a
      // freshness warning rather than blanking the console.
      setPhase(silent && dashboard ? PHASES.READY : PHASES.ERROR);
      return false;
    } finally {
      if (inFlightRef.current === controller) inFlightRef.current = null;
    }
    // `dashboard` is read only to decide whether a silent failure may keep the
    // previous view; including it would re-create the callback on every poll.
  }, []);

  const loadRuntime = useCallback(async ({ silent = false } = {}) => {
    if (runtimeInFlightRef.current) runtimeInFlightRef.current.abort();
    const controller = new AbortController();
    runtimeInFlightRef.current = controller;
    if (!silent) setRuntimePhase(PHASES.LOADING);
    try {
      const nextRuntime = await yusufApi.runtime({ signal: controller.signal });
      setRuntime(nextRuntime);
      setRuntimeError(null);
      setRuntimePhase(PHASES.READY);
      return true;
    } catch (cause) {
      if (cause?.name === "AbortError") return false;
      setRuntimeError(cause);
      setRuntimePhase((previous) =>
        silent && previous === PHASES.READY ? previous : PHASES.ERROR
      );
      return false;
    } finally {
      if (runtimeInFlightRef.current === controller)
        runtimeInFlightRef.current = null;
    }
  }, []);

  /** Session bootstrap. */
  const refreshSession = useCallback(async () => {
    try {
      const status = await yusufApi.sessionStatus();
      if (!status.configured) {
        setSession(SESSION.UNCONFIGURED);
        return;
      }
      setCsrfToken(status.csrfToken);
      setSession(status.unlocked ? SESSION.UNLOCKED : SESSION.LOCKED);
    } catch {
      setSession(SESSION.LOCKED);
    }
  }, []);

  const unlock = useCallback(async (controlToken) => {
    const result = await yusufApi.unlock(controlToken);
    setCsrfToken(result.csrfToken);
    setSession(SESSION.UNLOCKED);
    return result;
  }, []);

  const lock = useCallback(async () => {
    try {
      await yusufApi.lock();
    } finally {
      setCsrfToken(null);
      setSession(SESSION.LOCKED);
      setDashboard(null);
      setRoster(null);
      setRuntime(null);
      setRuntimeError(null);
      setRuntimePhase(PHASES.LOADING);
      setPhase(PHASES.LOADING);
    }
  }, []);

  useEffect(() => {
    refreshSession();
    return onSessionLost(() => setSession(SESSION.LOCKED));
  }, [refreshSession]);

  useEffect(() => {
    if (session !== SESSION.UNLOCKED) return undefined;
    loadSnapshot();
    return () => inFlightRef.current?.abort();
  }, [session, loadSnapshot]);

  useEffect(() => {
    if (session !== SESSION.UNLOCKED) return undefined;
    loadRuntime();
    const interval = setInterval(
      () => loadRuntime({ silent: true }),
      RUNTIME_REFRESH_MS
    );
    return () => {
      clearInterval(interval);
      runtimeInFlightRef.current?.abort();
    };
  }, [session, loadRuntime]);

  /**
   * Stream connection. Opened only after the first snapshot has been applied,
   * and resumed from the cursor that snapshot reported.
   */
  useEffect(() => {
    if (session !== SESSION.UNLOCKED || phase !== PHASES.READY)
      return undefined;
    if (streamRef.current) return undefined;
    if (typeof window === "undefined" || !("EventSource" in window))
      return undefined;

    dispatch({ type: "connecting" });
    const source = new EventSource(eventStreamUrl(realtime.cursor));
    streamRef.current = source;

    const bumpStale = () => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = setTimeout(
        () => dispatch({ type: "stale" }),
        STALE_AFTER_MS
      );
    };

    source.onopen = () => {
      dispatch({ type: "open" });
      bumpStale();
    };
    source.onerror = () => {
      // EventSource reconnects on its own; we only record that we may have
      // missed something so the snapshot gets reloaded.
      dispatch({ type: "error" });
      bumpStale();
    };
    source.addEventListener("yusuf", (message) => {
      bumpStale();
      try {
        dispatch({ type: "event", envelope: JSON.parse(message.data) });
      } catch {
        dispatch({ type: "event", envelope: null });
      }
    });
    source.addEventListener("reset", (message) => {
      try {
        const payload = JSON.parse(message.data);
        dispatch({
          type: "reset",
          cursor: payload.cursor,
          reason: payload.reason,
        });
      } catch {
        dispatch({ type: "reset", cursor: 0, reason: "SERVER_RESET" });
      }
    });

    return () => {
      source.close();
      streamRef.current = null;
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
    // Intentionally not re-running on cursor changes: the stream owns its own
    // resume position once open, and re-opening on every event would thrash.
  }, [session, phase]);

  /** Any reconciliation trigger lands here and becomes exactly one refetch. */
  useEffect(() => {
    if (!realtime.needsSnapshot || session !== SESSION.UNLOCKED)
      return undefined;
    if (resyncTimerRef.current) clearTimeout(resyncTimerRef.current);
    resyncTimerRef.current = setTimeout(
      () => loadSnapshot({ silent: true }),
      RESYNC_DEBOUNCE_MS
    );
    return () => clearTimeout(resyncTimerRef.current);
  }, [realtime.resyncNonce, realtime.needsSnapshot, session, loadSnapshot]);

  /**
   * An applied event means server state moved. The stream never carries the
   * new state itself, so re-read the snapshot (debounced, so a burst of events
   * from one agent turn is one refetch). Without this the console only changed
   * on a sequence gap or a manual refresh.
   */
  const eventRefreshTimerRef = useRef(null);
  useEffect(() => {
    if (!realtime.lastEventAt || session !== SESSION.UNLOCKED) return undefined;
    if (eventRefreshTimerRef.current)
      clearTimeout(eventRefreshTimerRef.current);
    // Coalesce rather than abort: if a snapshot read is already in flight,
    // wait for it and re-read afterwards, so a steady event stream against a
    // slow /dashboard can never starve the view of every snapshot.
    const refresh = () => {
      if (inFlightRef.current) {
        eventRefreshTimerRef.current = setTimeout(
          refresh,
          EVENT_REFRESH_DEBOUNCE_MS
        );
        return;
      }
      loadSnapshot({ silent: true });
    };
    eventRefreshTimerRef.current = setTimeout(
      refresh,
      EVENT_REFRESH_DEBOUNCE_MS
    );
    return () => clearTimeout(eventRefreshTimerRef.current);
  }, [realtime.lastEventAt, session, loadSnapshot]);

  /** Returning to the tab reconciles rather than trusting a background stream. */
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "visible") dispatch({ type: "visible" });
    };
    const onOffline = () => dispatch({ type: "offline" });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onVisibility);
    };
  }, []);

  const model = useMemo(
    () => buildCommandCenter({ dashboard, roster }),
    [dashboard, roster]
  );

  const value = useMemo(
    () => ({
      session,
      phase,
      error,
      dashboard,
      roster,
      runtime,
      runtimePhase,
      runtimeError,
      refreshRuntime: () => loadRuntime({ silent: true }),
      model,
      realtime,
      connection: realtime.connection,
      // True when the snapshot on screen is known to be behind the server.
      reconciling: realtime.needsSnapshot,
      stale:
        realtime.connection === CONNECTION.STALE ||
        realtime.connection === CONNECTION.OFFLINE,
      refresh: () => loadSnapshot({ silent: true }),
      unlock,
      lock,
      refreshSession,
    }),
    [
      session,
      phase,
      error,
      dashboard,
      roster,
      runtime,
      runtimePhase,
      runtimeError,
      model,
      realtime,
      loadSnapshot,
      loadRuntime,
      unlock,
      lock,
      refreshSession,
    ]
  );

  return (
    <YusufOSContext.Provider value={value}>{children}</YusufOSContext.Provider>
  );
}

export function useYusufOS() {
  const context = useContext(YusufOSContext);
  if (!context)
    throw new Error("useYusufOS must be used inside a YusufOSProvider.");
  return context;
}

/**
 * Loader for the detail surfaces (task, run, approval). Deliberately small:
 * these are read-once-on-navigate views, and the Command Center's stream
 * already tells us when to re-read.
 */
export function useYusufResource(loader, { watch = null } = {}) {
  const [state, setState] = useState({
    phase: PHASES.LOADING,
    data: null,
    error: null,
    loader,
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState((previous) =>
      previous.loader === loader
        ? { ...previous, phase: PHASES.LOADING, loader }
        : { phase: PHASES.LOADING, data: null, error: null, loader }
    );
    loader({ signal: controller.signal })
      .then((data) => {
        if (!cancelled)
          setState({ phase: PHASES.READY, data, error: null, loader });
      })
      .catch((cause) => {
        if (cancelled || cause?.name === "AbortError") return;
        setState({ phase: PHASES.ERROR, data: null, error: cause, loader });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // `loader` is expected to be a `useCallback` whose identity encodes the
    // resource being read; `watch` re-reads the same resource when the realtime
    // layer says server state moved.
  }, [loader, watch]);

  // A `loader` identity change means a genuinely different resource (e.g. the
  // selected Agent/Task/Run changed) — never let the previous resource's data
  // paint under the new resource's identity, even for the one frame before
  // the effect above fires. A `watch`-only change re-reads the *same*
  // resource, so the last-known `state` (and its `data`) is left as-is here
  // and only flips to LOADING once the effect runs, avoiding a refresh flicker.
  if (state.loader !== loader) {
    return { phase: PHASES.LOADING, data: null, error: null };
  }
  return state;
}
