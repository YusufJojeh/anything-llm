import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Microphone,
  MicrophoneSlash,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  Stop,
  Vibrate,
  X,
} from "@phosphor-icons/react";
import { yusufApi } from "../api/client";
import {
  CommandSessionProvider,
  useCommandSession,
} from "../state/CommandSession";
import {
  SIGNAL_SOURCES,
  createAudioMeter,
  smoothLevel,
} from "../state/audioReactivity";
import {
  hapticsEnabled,
  hapticsSupported,
  pulseHaptic,
  setHapticsEnabled,
} from "../state/haptics";
import { Panel, SectionTitle, UntrustedText } from "./primitives";

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];
const MAX_RECORDING_MS = 60_000;
// The on-screen meter is React state; it only needs ~10 updates a second.
// The Core reads the per-frame level from the signal store instead.
const METER_UPDATE_MS = 100;

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
 * Voice input/output. Push-to-talk only; it never autoplays and never
 * approves. When mounted inside a `CommandSessionProvider` it shares the
 * session (and therefore the command path and the Core signal) with the text
 * composer; mounted alone it creates its own session.
 */
export default function VoiceConsole(props) {
  const session = useCommandSession();
  if (session) return <VoiceConsoleInner {...props} session={session} />;
  return (
    <CommandSessionProvider>
      <StandaloneVoiceConsole {...props} />
    </CommandSessionProvider>
  );
}

function StandaloneVoiceConsole(props) {
  const session = useCommandSession();
  return <VoiceConsoleInner {...props} session={session} />;
}

function VoiceConsoleInner({ session, embedded = false }) {
  const { t, i18n } = useTranslation();
  const {
    phase,
    setPhase,
    transcript,
    setTranscript,
    response,
    approvalId,
    error,
    setError,
    runCommand: runSessionCommand,
    signal,
  } = session;
  const [permission, setPermission] = useState("prompt");
  const [level, setLevel] = useState(0);
  const [provider, setProvider] = useState(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState("");
  const [haptics, setHaptics] = useState(() => hapticsEnabled());
  const recorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const cancelledRef = useRef(false);
  const animationRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  const meterRef = useRef(null);
  const outputMeterRef = useRef(null);
  const outputFrameRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);

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
  const canVibrate = useMemo(() => hapticsSupported(), []);

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

  // Semantic haptics: only on a real approval result, opt-in, never repeating.
  useEffect(() => {
    if (phase === "APPROVAL_REQUIRED") pulseHaptic("APPROVAL_NEEDED");
  }, [phase]);

  const stopMedia = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    recordingTimeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    meterRef.current?.close();
    meterRef.current = null;
    signal.set({ source: SIGNAL_SOURCES.NONE, level: 0, bands: null });
    setLevel(0);
  }, [signal]);

  const stopOutputMeter = useCallback(() => {
    if (outputFrameRef.current) cancelAnimationFrame(outputFrameRef.current);
    outputFrameRef.current = null;
    outputMeterRef.current?.close();
    outputMeterRef.current = null;
    signal.set({
      source: SIGNAL_SOURCES.NONE,
      level: 0,
      boundaryAt: null,
      bands: null,
    });
  }, [signal]);

  const runCommand = useCallback(
    (value) =>
      runSessionCommand(value, {
        via: "voice",
        failedMessage: t("yusufOS:voice.failed"),
      }),
    [runSessionCommand, t]
  );

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
    [runCommand, setError, setPhase, t]
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermission("granted");
      pulseHaptic("VOICE_ACTIVATED");
      const meter = createAudioMeter({ stream });
      if (!meter) throw new Error(t("yusufOS:voice.unsupported"));
      meterRef.current = meter;
      let smoothed = 0;
      let lastMeterUpdate = 0;
      const draw = (now = 0) => {
        smoothed = smoothLevel(smoothed, meter.read());
        signal.set({
          source: SIGNAL_SOURCES.MIC,
          level: smoothed,
          bands: meter.bands?.(32) || null,
        });
        if (!lastMeterUpdate || now - lastMeterUpdate >= METER_UPDATE_MS) {
          lastMeterUpdate = now || 1;
          setLevel(Math.round(smoothed * 255));
        }
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
    setError,
    setPhase,
    setTranscript,
    signal,
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
  }, [setPhase]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    stopMedia();
    setPhase("IDLE");
  }, [setPhase, stopMedia]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    stopOutputMeter();
    setPhase(response ? "READY" : "IDLE");
  }, [response, setPhase, stopOutputMeter]);

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
      // speechSynthesis exposes no audio to analyse. Its word boundaries are
      // the only real signal, so the Core runs a timing envelope, labelled as
      // such — never presented as amplitude.
      signal.set({ source: SIGNAL_SOURCES.SPEECH_TIMING, boundaryAt: null });
      utterance.onboundary = () =>
        signal.set({
          source: SIGNAL_SOURCES.SPEECH_TIMING,
          boundaryAt: performance.now(),
        });
      utterance.onend = () => {
        stopOutputMeter();
        setPhase("READY");
      };
      utterance.onerror = () => {
        stopOutputMeter();
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
      const finish = () => {
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
        audioRef.current = null;
        stopOutputMeter();
      };
      audio.onended = () => {
        finish();
        setPhase("READY");
      };
      audio.onerror = () => {
        finish();
        setError(t("yusufOS:voice.speechFailed"));
        setPhase("ERROR");
      };
      audioRef.current = audio;
      // Real output amplitude: the server TTS audio runs through an analyser.
      const meter = createAudioMeter({ mediaElement: audio });
      outputMeterRef.current = meter;
      if (meter) {
        let smoothed = 0;
        const frame = () => {
          smoothed = smoothLevel(smoothed, meter.read());
          signal.set({
            source: SIGNAL_SOURCES.TTS_AUDIO,
            level: smoothed,
            bands: meter.bands?.(32) || null,
          });
          outputFrameRef.current = requestAnimationFrame(frame);
        };
        frame();
      }
      await audio.play();
    } catch (cause) {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      audioRef.current = null;
      stopOutputMeter();
      setError(cause.message || t("yusufOS:voice.speechFailed"));
      setPhase("ERROR");
    }
  }, [
    i18n.language,
    muted,
    rate,
    response,
    availableVoices,
    setError,
    setPhase,
    signal,
    stopOutputMeter,
    stopSpeaking,
    t,
    voiceName,
  ]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (recorderRef.current?.state !== "inactive")
        recorderRef.current?.stop();
      stopMedia();
      stopOutputMeter();
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      audioRef.current = null;
    },
    [stopMedia, stopOutputMeter]
  );

  const phaseLabel = t(`yusufOS:voice.phase.${phase}`);
  const listening = phase === "LISTENING";
  const micButton = (
    <button
      type="button"
      onClick={listening ? stop : start}
      disabled={
        !statusLoaded ||
        ["PROCESSING", "TRANSCRIBING", "SPEAKING"].includes(phase)
      }
      className="yos-press yos-touch-target flex size-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-40"
      data-active={listening ? "true" : undefined}
      style={{
        borderColor: listening ? "var(--yos-cyan)" : "var(--yos-line-strong)",
        color: "var(--yos-cyan-bright)",
        minWidth: 44,
      }}
      aria-label={
        listening ? t("yusufOS:voice.stop") : t("yusufOS:voice.start")
      }
      aria-pressed={listening}
    >
      {permission === "denied" ? (
        <MicrophoneSlash size={20} aria-hidden="true" />
      ) : (
        <Microphone size={20} aria-hidden="true" />
      )}
    </button>
  );

  const body = (
    <>
      <div className="flex items-center gap-3">
        {micButton}
        <div className="min-w-0 flex-1">
          <p
            className="yos-mono text-[11px] font-semibold uppercase"
            aria-live="polite"
            data-voice-phase={phase}
            style={{ color: "var(--yos-text)" }}
          >
            {phaseLabel}
          </p>
          <p
            className="mt-0.5 truncate text-[11px]"
            style={{ color: "var(--yos-text-muted)" }}
          >
            {t(`yusufOS:voice.permission.${permission}`, {
              defaultValue: permission,
            })}
          </p>
          <div
            className="mt-1.5 h-1 overflow-hidden rounded-full"
            style={{ background: "var(--yos-line-faint)" }}
            aria-label={t("yusufOS:voice.level")}
            role="meter"
            aria-valuemin="0"
            aria-valuemax="255"
            aria-valuenow={level}
          >
            <div
              className="h-full origin-left rounded-full rtl:origin-right"
              style={{
                transform: `scaleX(${Math.min(1, level / 255)})`,
                background: "var(--yos-cyan)",
              }}
            />
          </div>
        </div>
        {listening ? (
          <button
            type="button"
            onClick={cancel}
            className="yos-press yos-touch-target flex min-w-[44px] items-center justify-center rounded"
            aria-label={t("yusufOS:voice.cancel")}
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {!embedded && transcript ? (
        <div className="mt-4">
          <p className="yos-label">{t("yusufOS:voice.transcript")}</p>
          <UntrustedText as="p" className="mt-1 text-sm leading-relaxed">
            {transcript}
          </UntrustedText>
        </div>
      ) : null}
      {!embedded && response ? (
        <div
          className="mt-4 border-t pt-3"
          style={{ borderColor: "var(--yos-line-faint)" }}
        >
          <p className="yos-label">{t("yusufOS:voice.response")}</p>
          <UntrustedText as="p" className="mt-1 text-sm leading-relaxed">
            {response}
          </UntrustedText>
        </div>
      ) : null}
      {!embedded && approvalId ? (
        <a
          href={`/os/approvals/${approvalId}`}
          className="mt-3 inline-flex rounded border px-3 py-2 text-xs font-semibold"
          style={{
            color: "var(--yos-approval-text)",
            borderColor: "var(--yos-approval)",
          }}
        >
          {t("yusufOS:voice.approvalRequired")}
        </a>
      ) : null}
      {!embedded && error ? (
        <p
          className="mt-3 text-xs"
          role="alert"
          style={{ color: "var(--yos-danger-text)" }}
        >
          <UntrustedText>{error}</UntrustedText>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {phase === "ERROR" ? (
          <button
            type="button"
            onClick={() => (transcript ? runCommand(transcript) : start())}
            className="yos-press yos-touch-target rounded border px-3 text-xs"
            style={{ borderColor: "var(--yos-line-strong)" }}
          >
            {t("yusufOS:voice.retry")}
          </button>
        ) : null}
        {response && ttsAvailable ? (
          <button
            type="button"
            onClick={phase === "SPEAKING" ? stopSpeaking : speak}
            disabled={muted}
            className="yos-press yos-touch-target flex items-center gap-1 rounded border px-3 text-xs"
            style={{ borderColor: "var(--yos-line-strong)" }}
          >
            {phase === "SPEAKING" ? (
              <Stop size={14} aria-hidden="true" />
            ) : (
              <Play size={14} aria-hidden="true" />
            )}
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
          className="yos-press yos-touch-target flex items-center gap-1 rounded px-2 text-xs"
          aria-pressed={muted}
        >
          {muted ? (
            <SpeakerSlash size={14} aria-hidden="true" />
          ) : (
            <SpeakerHigh size={14} aria-hidden="true" />
          )}
          {muted ? t("yusufOS:voice.unmute") : t("yusufOS:voice.mute")}
        </button>
        <label className="text-xs">
          {t("yusufOS:voice.rate")}{" "}
          <select
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            className="yos-select rounded border px-1 py-1"
          >
            <option value="0.8">0.8×</option>
            <option value="1">1×</option>
            <option value="1.2">1.2×</option>
            <option value="1.5">1.5×</option>
          </select>
        </label>
        {availableVoices.length ? (
          <label className="min-w-0 text-xs">
            {t("yusufOS:voice.voice")}{" "}
            <select
              value={voiceName}
              onChange={(event) => setVoiceName(event.target.value)}
              className="yos-select max-w-36 rounded border px-1 py-1"
            >
              {availableVoices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {canVibrate ? (
          <button
            type="button"
            onClick={() => {
              setHapticsEnabled(!haptics);
              setHaptics(!haptics);
            }}
            className="yos-press yos-touch-target flex items-center gap-1 rounded px-2 text-xs"
            aria-pressed={haptics}
          >
            <Vibrate size={14} aria-hidden="true" />
            {t("yusufOS:voice.haptics")}
          </button>
        ) : null}
      </div>
      <p
        className="mt-2 text-[11px] leading-snug"
        style={{ color: "var(--yos-text-muted)" }}
      >
        {t("yusufOS:voice.securityNote")}
      </p>
    </>
  );

  if (embedded)
    return (
      <section aria-labelledby="yos-voice-title" className="yos-voice">
        <h3 id="yos-voice-title" className="sr-only">
          {t("yusufOS:voice.title")}
        </h3>
        {body}
      </section>
    );

  return (
    <Panel className="p-4" aria-labelledby="yos-voice-title">
      <SectionTitle id="yos-voice-title">
        {t("yusufOS:voice.title")}
      </SectionTitle>
      <div className="mt-3">{body}</div>
    </Panel>
  );
}
