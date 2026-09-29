import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { yusufApi } from "../api/client";
import { createVoiceSignal } from "./audioReactivity";

/**
 * The one command front door in the browser.
 *
 * Typed commands and spoken commands both end in `runCommand()`, which posts
 * to the existing `/voice/commands` route — the same Chief-of-Staff task, the
 * same `AgentReasoningLoop`, the same policy/approval/audit path. There is no
 * second command route, and nothing here can approve or execute anything: an
 * L3 request comes back as `APPROVAL_REQUIRED` with an approval id that only
 * the governed approval page can decide.
 *
 * The transcript lives in memory for this `/os` tab only (lost on reload). The backend
 * has no chat-history projection, so the UI does not pretend to have one.
 */

const CommandSessionContext = createContext(null);

export const BUSY_PHASES = Object.freeze([
  "PROCESSING",
  "TRANSCRIBING",
  "LISTENING",
]);
const MAX_MESSAGES = 60;

export function CommandSessionProvider({ children }) {
  const [phase, setPhase] = useState("IDLE");
  const [messages, setMessages] = useState([]);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [approvalId, setApprovalId] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState("");
  const inFlightRef = useRef(false);
  const idRef = useRef(0);
  const signalRef = useRef(null);
  if (!signalRef.current) signalRef.current = createVoiceSignal();

  const append = useCallback((message) => {
    idRef.current += 1;
    const entry = {
      id: `m${idRef.current}`,
      at: new Date().toISOString(),
      ...message,
    };
    setMessages((previous) => [...previous, entry].slice(-MAX_MESSAGES));
    return entry;
  }, []);

  const runCommand = useCallback(
    async (value, { via = "text", failedMessage = "" } = {}) => {
      const clean = String(value || "").trim();
      if (!clean) {
        setPhase("IDLE");
        return null;
      }
      // Duplicate submission guard: one governed command in flight at a time.
      if (inFlightRef.current) return null;
      inFlightRef.current = true;
      setTranscript(clean);
      setResponse("");
      setApprovalId(null);
      setError("");
      setPhase("PROCESSING");
      signalRef.current.set({ phase: "PROCESSING" });
      append({ role: "yusuf", text: clean, via });
      try {
        const result = await yusufApi.runVoiceCommand(clean);
        const nextApproval = result?.approvalId || null;
        setResponse(result?.response || "");
        setApprovalId(nextApproval);
        setLastResult({
          taskId: result?.taskId || null,
          runId: result?.runId || null,
          state: result?.state || null,
          approvalId: nextApproval,
          at: new Date().toISOString(),
        });
        append({
          role: "agent",
          text: result?.response || "",
          state: result?.state || null,
          taskId: result?.taskId || null,
          runId: result?.runId || null,
          approvalId: nextApproval,
        });
        const nextPhase =
          result?.state === "APPROVAL_REQUIRED" ? "APPROVAL_REQUIRED" : "READY";
        setPhase(nextPhase);
        signalRef.current.set({ phase: nextPhase });
        return result;
      } catch (cause) {
        const message = cause?.message || failedMessage;
        setError(message);
        append({ role: "error", text: message });
        setPhase("ERROR");
        signalRef.current.set({ phase: "ERROR" });
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [append]
  );

  const publishPhase = useCallback((next) => {
    setPhase(next);
    signalRef.current.set({ phase: next });
  }, []);

  const value = useMemo(
    () => ({
      phase,
      setPhase: publishPhase,
      messages,
      transcript,
      setTranscript,
      response,
      approvalId,
      lastResult,
      error,
      setError,
      runCommand,
      signal: signalRef.current,
      busy: BUSY_PHASES.includes(phase),
    }),
    [
      phase,
      publishPhase,
      messages,
      transcript,
      response,
      approvalId,
      lastResult,
      error,
      runCommand,
    ]
  );

  return (
    <CommandSessionContext.Provider value={value}>
      {children}
    </CommandSessionContext.Provider>
  );
}

export function useCommandSession() {
  return useContext(CommandSessionContext);
}
