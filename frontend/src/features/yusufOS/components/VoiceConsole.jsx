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
  X,
} from "@phosphor-icons/react";
import { yusufApi } from "../api/client";
import { Panel, SectionTitle, UntrustedText } from "./primitives";

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];
const MAX_RECORDING_MS = 60_000;

function extensionForMime(mimeType) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function browserRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function VoiceConsole() {
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState("IDLE");
  const [permission, setPermission] = useState("prompt");
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [approvalId, setApprovalId] = useState(null);
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

  const runCommand = useCallback(
    async (value) => {
      const clean = String(value || "").trim();
      if (!clean) {
        setPhase("IDLE");
        return;
      }
      setTranscript(clean);
      setPhase("PROCESSING");
      setError("");
      try {
        const result = await yusufApi.runVoiceCommand(clean);
        setResponse(result.response || "");
        setApprovalId(result.approvalId || null);
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
  return (
    <Panel className="p-4" aria-labelledby="yos-voice-title">
      <SectionTitle id="yos-voice-title">
        {t("yusufOS:voice.title")}
      </SectionTitle>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={phase === "LISTENING" ? stop : start}
          disabled={
            !statusLoaded ||
            ["PROCESSING", "TRANSCRIBING", "SPEAKING"].includes(phase)
          }
          className="yos-touch-target flex size-12 shrink-0 items-center justify-center rounded-full border"
          style={{
            borderColor: "var(--yos-border-strong)",
            color: "var(--yos-accent-strong)",
          }}
          aria-label={
            phase === "LISTENING"
              ? t("yusufOS:voice.stop")
              : t("yusufOS:voice.start")
          }
          aria-pressed={phase === "LISTENING"}
        >
          {permission === "denied" ? (
            <MicrophoneSlash size={22} />
          ) : (
            <Microphone size={22} />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" aria-live="polite">
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
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full"
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
                width: `${Math.min(100, (level / 255) * 100)}%`,
                background: "var(--yos-accent)",
              }}
            />
          </div>
        </div>
        {phase === "LISTENING" ? (
          <button
            type="button"
            onClick={cancel}
            className="yos-touch-target rounded px-2"
            aria-label={t("yusufOS:voice.cancel")}
          >
            <X size={18} />
          </button>
        ) : null}
      </div>

      {transcript ? (
        <div className="mt-4">
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
      ) : null}
      {response ? (
        <div
          className="mt-4 border-t pt-3"
          style={{ borderColor: "var(--yos-border-faint)" }}
        >
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
      ) : null}
      {approvalId ? (
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
      {error ? (
        <p
          className="mt-3 text-xs"
          role="alert"
          style={{ color: "var(--yos-danger-text)" }}
        >
          <UntrustedText>{error}</UntrustedText>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {phase === "ERROR" ? (
          <button
            type="button"
            onClick={() => (transcript ? runCommand(transcript) : start())}
            className="yos-touch-target rounded border px-3 text-xs"
          >
            {t("yusufOS:voice.retry")}
          </button>
        ) : null}
        {response && ttsAvailable ? (
          <button
            type="button"
            onClick={phase === "SPEAKING" ? stopSpeaking : speak}
            disabled={muted}
            className="yos-touch-target flex items-center gap-1 rounded border px-3 text-xs"
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
          aria-pressed={muted}
        >
          {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />}
          {muted ? t("yusufOS:voice.unmute") : t("yusufOS:voice.mute")}
        </button>
        <label className="text-xs">
          {t("yusufOS:voice.rate")}{" "}
          <select
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            className="rounded border bg-transparent px-1 py-1"
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
              className="max-w-36 rounded border bg-transparent px-1 py-1"
            >
              {availableVoices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <p
        className="mt-3 text-[11px]"
        style={{ color: "var(--yos-text-muted)" }}
      >
        {t("yusufOS:voice.securityNote")}
      </p>
    </Panel>
  );
}
