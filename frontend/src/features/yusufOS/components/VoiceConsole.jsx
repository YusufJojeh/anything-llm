import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Microphone,
  MicrophoneSlash,
  PaperPlaneRight,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  Stop,
  X,
} from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { ShieldWarning } from "@phosphor-icons/react";
import { yusufApi } from "../api/client";
import { TONES, toneStyle } from "../state/statusSemantics";
import { Panel, SectionTitle, UntrustedText } from "./primitives";

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];
const MAX_RECORDING_MS = 60_000;
// Mirrors VoiceService's MAX_UTTERANCE_CHARS (server/domain/yusufOS/voice/VoiceService.js).
// Kept as a literal, not an import, since the frontend never depends on server code — the
// backend remains the source of truth and rejects anything longer regardless of this cap.
const MAX_COMMAND_CHARS = 10000;
const COMPOSER_MAX_HEIGHT_PX = 128;

/**
 * Phase → status tone.
 *
 * The voice console does not own a colour vocabulary. It borrows the same one
 * every status in Yusuf OS uses, so "waiting on Yusuf" here is the exact colour
 * of a pending approval on the Approvals page. A phase that is not in this map
 * resolves to UNKNOWN, which never reads as healthy.
 */
const VOICE_PHASE_TONE = Object.freeze({
  IDLE: TONES.UNKNOWN,
  LISTENING: TONES.ACTIVE,
  TRANSCRIBING: TONES.ACTIVE,
  PROCESSING: TONES.ACTIVE,
  SPEAKING: TONES.ACTIVE,
  READY: TONES.HEALTHY,
  APPROVAL_REQUIRED: TONES.APPROVAL,
  ERROR: TONES.ERROR,
});

function extensionForMime(mimeType) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function browserRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * @param {object} props
 * @param {"panel"|"dock"} [props.variant] `panel` is the standalone surface used
 *   on secondary routes; `dock` is the persistent command bar in the Command
 *   Center shell. Both render the same state machine and the same controls —
 *   only the chrome differs — so no accessible name or guarantee is variant
 *   specific.
 */
export default function VoiceConsole({ variant = "panel" }) {
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState("IDLE");
  const [permission, setPermission] = useState("prompt");
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [approvalId, setApprovalId] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [runId, setRunId] = useState(null);
  const [draft, setDraft] = useState("");
  const [provider, setProvider] = useState(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState("");
  const recorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const cancelledRef = useRef(false);
  const animationRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const composerRef = useRef(null);
  const composerId = useId();

  const browserStt = provider?.stt?.scope === "BROWSER";
  const allowBrowserSpeech = Boolean(provider?.browser?.allowSpeechServices);
  const availableVoices = useMemo(
    () =>
      voices.filter(
        (voice) =>
          (voice.localService === true || allowBrowserSpeech) &&
          voice.lang
            ?.toLowerCase()
            .startsWith(i18n.language.startsWith("ar") ? "ar" : "en")
      ),
    [allowBrowserSpeech, i18n.language, voices]
  );
  const ttsAvailable =
    availableVoices.length > 0 || Boolean(provider?.tts?.eligible);
  const supported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  useEffect(() => {
    let active = true;
    let permissionStatus;
    yusufApi
      .voiceStatus()
      .then((status) => active && setProvider(status))
      .catch(() => active && setProvider(null))
      .finally(() => active && setStatusLoaded(true));
    navigator.permissions
      ?.query({ name: "microphone" })
      .then((result) => {
        if (!active) return;
        permissionStatus = result;
        setPermission(result.state);
        result.onchange = () => setPermission(result.state);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, []);

  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    const refresh = () => {
      const next = window.speechSynthesis.getVoices();
      setVoices(next);
    };
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
  }, []);

  useEffect(() => {
    setVoiceName((current) =>
      availableVoices.some((voice) => voice.name === current)
        ? current
        : availableVoices[0]?.name || ""
    );
  }, [availableVoices]);

  const stopMedia = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    recordingTimeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setLevel(0);
  }, []);

  /**
   * The single command entry point. Both the mic (after transcription) and
   * the typed composer call this — same request, same governed pipeline,
   * same result handling. Neither input modality is allowed a shortcut of
   * its own.
   */
  const runCommand = useCallback(
    async (value) => {
      const clean = String(value || "").trim();
      if (!clean) {
        setPhase("IDLE");
        return;
      }
      setTranscript(clean);
      setResponse("");
      setApprovalId(null);
      setTaskId(null);
      setRunId(null);
      setPhase("PROCESSING");
      setError("");
      try {
        const result = await yusufApi.runVoiceCommand(clean);
        setResponse(result.response || "");
        setApprovalId(result.approvalId || null);
        setTaskId(result.taskId || null);
        setRunId(result.runId || null);
        setPhase(
          result.state === "APPROVAL_REQUIRED" ? "APPROVAL_REQUIRED" : "READY"
        );
      } catch (cause) {
        setError(cause.message || t("yusufOS:voice.failed"));
        setPhase("ERROR");
      }
    },
    [t]
  );

  const submitDraft = useCallback(() => {
    const clean = draft.trim();
    if (!clean) return;
    setDraft("");
    runCommand(clean);
  }, [draft, runCommand]);

  const handleComposerKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitDraft();
      }
    },
    [submitDraft]
  );

  // Lightweight auto-grow so a Shift+Enter newline is actually visible,
  // without pulling in a textarea-sizing library for one field.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [draft]);

  const transcribeRecording = useCallback(
    async (blob, mimeType) => {
      setPhase("TRANSCRIBING");
      try {
        const extension = extensionForMime(mimeType);
        const result = await yusufApi.transcribeVoice(
          blob,
          `voice.${extension}`
        );
        await runCommand(result.text);
      } catch (cause) {
        setError(cause.message || t("yusufOS:voice.transcriptionFailed"));
        setPhase("ERROR");
      }
    },
    [runCommand, t]
  );

  const start = useCallback(async () => {
    if (!statusLoaded || !provider?.stt?.eligible) {
      setError(t("yusufOS:voice.providerUnavailable"));
      setPhase("ERROR");
      return;
    }
    if (!supported) {
      setError(t("yusufOS:voice.unsupported"));
      setPhase("ERROR");
      return;
    }
    cancelledRef.current = false;
    setError("");
    setTranscript("");
    setResponse("");
    setApprovalId(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermission("granted");
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      const context = AudioContextClass ? new AudioContextClass() : null;
      audioContextRef.current = context;
      if (!context) throw new Error(t("yusufOS:voice.unsupported"));
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(samples);
        setLevel(
          Math.round(
            samples.reduce((sum, item) => sum + item, 0) / samples.length
          )
        );
        animationRef.current = requestAnimationFrame(draw);
      };
      draw();

      const mimeType = MIME_TYPES.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = ({ data }) => {
        if (data?.size) chunksRef.current.push(data);
      };
      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        stopMedia();
        if (cancelledRef.current || browserStt || !chunks.length) return;
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (blob.size) transcribeRecording(blob, recorder.mimeType);
      };
      recorder.start();
      recordingTimeoutRef.current = setTimeout(() => {
        setPhase("TRANSCRIBING");
        if (recorderRef.current?.state !== "inactive")
          recorderRef.current?.stop();
        recognitionRef.current?.stop();
      }, MAX_RECORDING_MS);

      if (browserStt) {
        const Recognition = browserRecognition();
        if (!Recognition)
          throw new Error(t("yusufOS:voice.browserSttUnavailable"));
        const recognition = new Recognition();
        recognition.lang = i18n.language.startsWith("ar") ? "ar" : "en";
        recognition.interimResults = true;
        recognition.continuous = false;
        let finalText = "";
        let recognitionFailed = false;
        recognition.onresult = (event) => {
          finalText = Array.from(event.results)
            .map((result) => result[0]?.transcript || "")
            .join(" ")
            .trim();
          setTranscript(finalText);
        };
        recognition.onerror = (event) => {
          recognitionFailed = true;
          if (!cancelledRef.current) {
            setError(event.error || t("yusufOS:voice.transcriptionFailed"));
            setPhase("ERROR");
          }
        };
        recognition.onend = () => {
          recognitionRef.current = null;
          if (recorderRef.current?.state !== "inactive")
            recorderRef.current?.stop();
          if (!cancelledRef.current && !recognitionFailed)
            runCommand(finalText);
        };
        recognitionRef.current = recognition;
        recognition.start();
      }
      setPhase("LISTENING");
    } catch (cause) {
      cancelledRef.current = true;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (recorderRef.current?.state !== "inactive")
        recorderRef.current?.stop();
      stopMedia();
      setPermission(cause?.name === "NotAllowedError" ? "denied" : permission);
      setError(cause.message || t("yusufOS:voice.micDenied"));
      setPhase("ERROR");
    }
  }, [
    browserStt,
    i18n.language,
    permission,
    provider,
    runCommand,
    statusLoaded,
    stopMedia,
    supported,
    t,
    transcribeRecording,
  ]);

  const stop = useCallback(() => {
    setPhase("TRANSCRIBING");
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    recognitionRef.current?.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    stopMedia();
    setPhase("IDLE");
  }, [stopMedia]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setPhase(response ? "READY" : "IDLE");
  }, [response]);

  const speak = useCallback(async () => {
    if (!response || muted) return;
    stopSpeaking();
    setPhase("SPEAKING");
    const selectedVoice = availableVoices.find(
      (voice) => voice.name === voiceName
    );
    if (window.speechSynthesis && selectedVoice) {
      const utterance = new SpeechSynthesisUtterance(response);
      utterance.lang = i18n.language.startsWith("ar") ? "ar" : "en";
      utterance.rate = rate;
      utterance.voice = selectedVoice;
      utterance.onend = () => setPhase("READY");
      utterance.onerror = () => {
        setError(t("yusufOS:voice.speechFailed"));
        setPhase("ERROR");
      };
      window.speechSynthesis.speak(utterance);
      return;
    }
    try {
      const blob = await yusufApi.speakVoiceResponse(response);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audio.playbackRate = rate;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
        audioRef.current = null;
        setPhase("READY");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
        audioRef.current = null;
        setError(t("yusufOS:voice.speechFailed"));
        setPhase("ERROR");
      };
      audioRef.current = audio;
      await audio.play();
    } catch (cause) {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      audioRef.current = null;
      setError(cause.message || t("yusufOS:voice.speechFailed"));
      setPhase("ERROR");
    }
  }, [
    i18n.language,
    muted,
    rate,
    response,
    availableVoices,
    stopSpeaking,
    t,
    voiceName,
    voices,
  ]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (recorderRef.current?.state !== "inactive")
        recorderRef.current?.stop();
      stopMedia();
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      audioRef.current = null;
    },
    [stopMedia]
  );

  const phaseLabel = t(`yusufOS:voice.phase.${phase}`);
  const tone = VOICE_PHASE_TONE[phase] || TONES.UNKNOWN;
  const style = toneStyle(tone);
  const listening = phase === "LISTENING";
  const busy = ["PROCESSING", "TRANSCRIBING", "SPEAKING"].includes(phase);
  const levelPercent = Math.min(100, (level / 255) * 100);
  // Voice and text are mutually exclusive at any instant: while the mic is
  // capturing or a command is already in flight, the composer does not
  // accept a second, competing origination of work.
  const composerDisabled = busy || listening;

  /**
   * The microphone control.
   *
   * The ring around it is the phase, in the same tone vocabulary every other
   * status in Yusuf OS uses — so "listening" here is the same colour as
   * "running" on an Agent, and neither had to be chosen twice. The live input
   * level is drawn as a second ring inside it, which is the only element on the
   * dock that moves continuously; it is a direct readout of the microphone, not
   * an idle animation.
   */
  const micControl = (
    <span className="relative flex shrink-0 items-center justify-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full"
        style={{
          inlineSize: "100%",
          blockSize: "100%",
          border: `1px solid color-mix(in srgb, ${style.graphic} ${
            listening ? 70 : 34
          }%, transparent)`,
          // Grows with the measured input level and nothing else. At silence it
          // is exactly the button's own outline.
          transform: `scale(${1 + (listening ? levelPercent / 260 : 0)})`,
          transition: "transform 90ms linear",
        }}
      />
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={!statusLoaded || busy}
        className="yos-touch-target relative flex size-12 shrink-0 items-center justify-center rounded-full border disabled:opacity-60"
        style={{
          borderColor: `color-mix(in srgb, ${style.graphic} 55%, transparent)`,
          backgroundColor: "var(--yos-surface-raised)",
          color: style.text,
          boxShadow: "var(--yos-elev-2)",
        }}
        aria-label={
          listening ? t("yusufOS:voice.stop") : t("yusufOS:voice.start")
        }
        aria-pressed={listening}
      >
        {permission === "denied" ? (
          <MicrophoneSlash size={22} />
        ) : (
          <Microphone size={22} />
        )}
      </button>
    </span>
  );

  const levelMeter = (
    <div
      className="h-1.5 overflow-hidden rounded-full"
      style={{ background: "var(--yos-border-faint)" }}
      aria-label={t("yusufOS:voice.level")}
      role="meter"
      aria-valuemin="0"
      aria-valuemax="255"
      aria-valuenow={level}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${levelPercent}%`,
          background: style.graphic,
          transition: "width 90ms linear",
        }}
      />
    </div>
  );

  const cancelButton = listening ? (
    <button
      type="button"
      onClick={cancel}
      className="yos-touch-target rounded px-2"
      style={{ color: "var(--yos-text-secondary)" }}
      aria-label={t("yusufOS:voice.cancel")}
    >
      <X size={18} />
    </button>
  ) : null;

  const approvalLink = approvalId ? (
    <Link
      to={`/os/approvals/${approvalId}`}
      className="yos-touch-target inline-flex items-center gap-1.5 rounded border px-3 text-xs font-semibold"
      style={{
        color: "var(--yos-approval-text)",
        borderColor:
          "color-mix(in srgb, var(--yos-approval-graphic) 50%, transparent)",
        backgroundColor:
          "color-mix(in srgb, var(--yos-approval-graphic) 14%, transparent)",
      }}
    >
      <ShieldWarning size={13} aria-hidden="true" />
      {t("yusufOS:voice.approvalRequired")}
    </Link>
  ) : null;

  // Only rendered when the server actually returned an id — never inferred
  // or guessed at from the client side.
  const taskLink = taskId ? (
    <Link
      to={`/os/tasks/${taskId}`}
      className="yos-touch-target inline-flex items-center rounded border px-3 text-xs font-semibold"
      style={{
        color: "var(--yos-text-secondary)",
        borderColor: "var(--yos-border-strong)",
      }}
    >
      {t("yusufOS:voice.viewTask")}
    </Link>
  ) : null;

  const runLink = runId ? (
    <Link
      to={`/os/runs/${runId}`}
      className="yos-touch-target inline-flex items-center rounded border px-3 text-xs font-semibold"
      style={{
        color: "var(--yos-text-secondary)",
        borderColor: "var(--yos-border-strong)",
      }}
    >
      {t("yusufOS:voice.viewRun")}
    </Link>
  ) : null;

  const errorBlock = error ? (
    <p
      className="text-xs"
      role="alert"
      style={{ color: "var(--yos-error-text)" }}
    >
      <UntrustedText>{error}</UntrustedText>
    </p>
  ) : null;

  /**
   * The typed command composer. It is a second entry point onto exactly the
   * same `runCommand` used by the mic — same route, same session/CSRF
   * handling in `yusufApi`, same governed pipeline. There is no separate
   * "text command" backend path and none is created here.
   */
  const composer = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitDraft();
      }}
      className="flex items-end gap-2"
    >
      <label htmlFor={composerId} className="sr-only">
        {t("yusufOS:voice.commandInput")}
      </label>
      <textarea
        id={composerId}
        ref={composerRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleComposerKeyDown}
        disabled={composerDisabled}
        maxLength={MAX_COMMAND_CHARS}
        rows={1}
        dir="auto"
        placeholder={t("yusufOS:voice.commandPlaceholder")}
        className="yos-touch-target min-w-0 flex-1 resize-none rounded-lg border bg-transparent px-3 py-2 text-sm leading-relaxed disabled:opacity-60"
        style={{
          borderColor: "var(--yos-border-strong)",
          color: "var(--yos-text)",
          maxHeight: `${COMPOSER_MAX_HEIGHT_PX}px`,
        }}
      />
      <button
        type="submit"
        disabled={composerDisabled || !draft.trim()}
        aria-label={t("yusufOS:voice.send")}
        className="yos-touch-target flex size-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-50"
        style={{
          borderColor: "var(--yos-border-strong)",
          color: "var(--yos-text)",
        }}
      >
        <PaperPlaneRight size={18} />
      </button>
    </form>
  );

  const playbackControls = (
    <>
      {phase === "ERROR" ? (
        <button
          type="button"
          onClick={() => (transcript ? runCommand(transcript) : start())}
          className="yos-touch-target rounded border px-3 text-xs"
          style={{ borderColor: "var(--yos-border-strong)" }}
        >
          {t("yusufOS:voice.retry")}
        </button>
      ) : null}
      {response && ttsAvailable ? (
        <button
          type="button"
          onClick={phase === "SPEAKING" ? stopSpeaking : speak}
          disabled={muted}
          className="yos-touch-target flex items-center gap-1 rounded border px-3 text-xs disabled:opacity-50"
          style={{ borderColor: "var(--yos-border-strong)" }}
        >
          {phase === "SPEAKING" ? <Stop size={14} /> : <Play size={14} />}
          {phase === "SPEAKING"
            ? t("yusufOS:voice.stopSpeaking")
            : t("yusufOS:voice.replay")}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setMuted((value) => !value);
          stopSpeaking();
        }}
        className="yos-touch-target flex items-center gap-1 rounded px-2 text-xs"
        style={{ color: "var(--yos-text-secondary)" }}
        aria-pressed={muted}
      >
        {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />}
        {muted ? t("yusufOS:voice.unmute") : t("yusufOS:voice.mute")}
      </button>
      <label className="text-xs" style={{ color: "var(--yos-text-secondary)" }}>
        {t("yusufOS:voice.rate")}{" "}
        <select
          value={rate}
          onChange={(event) => setRate(Number(event.target.value))}
          className="rounded border bg-transparent px-1 py-1"
          style={{ borderColor: "var(--yos-border-strong)" }}
        >
          <option value="0.8">0.8×</option>
          <option value="1">1×</option>
          <option value="1.2">1.2×</option>
          <option value="1.5">1.5×</option>
        </select>
      </label>
      {availableVoices.length ? (
        <label
          className="min-w-0 text-xs"
          style={{ color: "var(--yos-text-secondary)" }}
        >
          {t("yusufOS:voice.voice")}{" "}
          <select
            value={voiceName}
            onChange={(event) => setVoiceName(event.target.value)}
            className="max-w-36 rounded border bg-transparent px-1 py-1"
            style={{ borderColor: "var(--yos-border-strong)" }}
          >
            {availableVoices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );

  const securityNote = (
    <p className="text-[11px]" style={{ color: "var(--yos-text-muted)" }}>
      {t("yusufOS:voice.securityNote")}
    </p>
  );

  const transcriptBlock = transcript ? (
    <div className="min-w-0">
      <p
        className="text-[10px] uppercase tracking-[0.12em]"
        style={{ color: "var(--yos-text-muted)" }}
      >
        {t("yusufOS:voice.transcript")}
      </p>
      <UntrustedText as="p" className="mt-1 text-sm leading-relaxed">
        {transcript}
      </UntrustedText>
    </div>
  ) : null;

  const responseBlock = response ? (
    <div className="min-w-0">
      <p
        className="text-[10px] uppercase tracking-[0.12em]"
        style={{ color: "var(--yos-text-muted)" }}
      >
        {t("yusufOS:voice.response")}
      </p>
      <UntrustedText as="p" className="mt-1 text-sm leading-relaxed">
        {response}
      </UntrustedText>
    </div>
  ) : null;

  /**
   * The dock: the persistent command bar at the foot of the OS shell.
   *
   * It is the same machine as the panel — same handlers, same phases, same
   * guarantees. What differs is that it is always present and always states the
   * current phase in words, so "is it listening?" is never a question the
   * operator has to answer by watching an animation.
   */
  if (variant === "dock")
    return (
      <section
        aria-labelledby="yos-voice-title"
        className="yos-glass flex flex-col gap-3 p-3 md:p-4"
      >
        <h2 id="yos-voice-title" className="sr-only">
          {t("yusufOS:voice.title")}
        </h2>
        {composer}
        <div className="flex items-center gap-3 md:gap-4">
          {micControl}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p
                className="text-sm font-semibold"
                aria-live="polite"
                style={{ color: style.text }}
              >
                {phaseLabel}
              </p>
              <p
                className="text-[11px]"
                style={{ color: "var(--yos-text-muted)" }}
              >
                {t(`yusufOS:voice.permission.${permission}`, {
                  defaultValue: permission,
                })}
              </p>
            </div>
            <div className="mt-2">{levelMeter}</div>
          </div>
          {taskLink}
          {runLink}
          {approvalLink}
          {cancelButton}
        </div>

        {transcriptBlock || responseBlock || errorBlock ? (
          <div
            className="flex flex-col gap-3 border-t pt-3 md:flex-row md:gap-6"
            style={{ borderColor: "var(--yos-border-faint)" }}
          >
            {transcriptBlock}
            {responseBlock}
            {errorBlock}
          </div>
        ) : null}

        <div
          className="flex flex-wrap items-center gap-2 border-t pt-3"
          style={{ borderColor: "var(--yos-border-faint)" }}
        >
          {playbackControls}
          <span className="ms-auto">{securityNote}</span>
        </div>
      </section>
    );

  return (
    <Panel className="p-4" aria-labelledby="yos-voice-title">
      <SectionTitle id="yos-voice-title">
        {t("yusufOS:voice.title")}
      </SectionTitle>
      <div className="mt-3">{composer}</div>
      <div className="mt-3 flex items-center gap-3">
        {micControl}
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-medium"
            aria-live="polite"
            style={{ color: style.text }}
          >
            {phaseLabel}
          </p>
          <p
            className="mt-0.5 text-[11px]"
            style={{ color: "var(--yos-text-muted)" }}
          >
            {t(`yusufOS:voice.permission.${permission}`, {
              defaultValue: permission,
            })}
          </p>
          <div className="mt-2">{levelMeter}</div>
        </div>
        {cancelButton}
      </div>

      {transcriptBlock ? <div className="mt-4">{transcriptBlock}</div> : null}
      {responseBlock ? (
        <div
          className="mt-4 border-t pt-3"
          style={{ borderColor: "var(--yos-border-faint)" }}
        >
          {responseBlock}
        </div>
      ) : null}
      {taskLink || runLink || approvalLink ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {taskLink}
          {runLink}
          {approvalLink}
        </div>
      ) : null}
      {errorBlock ? <div className="mt-3">{errorBlock}</div> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {playbackControls}
      </div>
      <div className="mt-3">{securityNote}</div>
    </Panel>
  );
}
