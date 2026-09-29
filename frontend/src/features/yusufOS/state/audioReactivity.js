/**
 * Audio reactivity for the System Core.
 *
 * Everything the Core does in response to sound is derived here, from real
 * samples read out of a Web Audio `AnalyserNode`. There is no random motion in
 * this module: silence maps to exactly zero energy, and every output is a
 * bounded, monotonic function of the measured amplitude, so "louder" can only
 * ever mean "more", and never more than the clamp.
 *
 * Two honest sources exist:
 *
 * - `AMPLITUDE` — a live analyser over the microphone stream or over the
 *   `<audio>` element playing server TTS. This is real signal.
 * - `SPEECH_TIMING` — browser `speechSynthesis` does not expose its audio, so
 *   the only real signal is its word-boundary events. Those drive a
 *   deterministic decay envelope, and the UI labels it as timing, never as
 *   amplitude.
 */

export const SIGNAL_SOURCES = Object.freeze({
  NONE: "NONE",
  MIC: "MIC",
  TTS_AUDIO: "TTS_AUDIO",
  SPEECH_TIMING: "SPEECH_TIMING",
});

// Below this RMS the input is treated as silence (room noise, mic hiss).
export const SILENCE_FLOOR = 0.015;
// RMS at which normal-to-loud speech saturates the visual range.
export const SATURATION_RMS = 0.32;

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** RMS of 8-bit time-domain samples centred on 128. Returns 0..1. */
export function rmsFromTimeDomain(samples) {
  if (!samples || !samples.length) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centred = (samples[index] - 128) / 128;
    sum += centred * centred;
  }
  return clamp01(Math.sqrt(sum / samples.length));
}

/** Mean magnitude of 8-bit frequency bins. Returns 0..1. */
export function levelFromFrequency(samples) {
  if (!samples || !samples.length) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index];
  return clamp01(sum / samples.length / 255);
}

/**
 * Averages frequency bins into `count` bands (0..1). Only the lower 70% of the
 * spectrum is used — that is where voice energy lives.
 */
export function bandsFromFrequency(samples, count = 32) {
  const out = new Array(count).fill(0);
  if (!samples || !samples.length || count <= 0) return out;
  const usable = Math.max(1, Math.floor(samples.length * 0.7));
  const per = usable / count;
  for (let band = 0; band < count; band += 1) {
    const from = Math.floor(band * per);
    const to = Math.max(from + 1, Math.floor((band + 1) * per));
    let sum = 0;
    let n = 0;
    for (let index = from; index < to && index < samples.length; index += 1) {
      sum += samples[index];
      n += 1;
    }
    out[band] = n ? clamp01(sum / n / 255) : 0;
  }
  return out;
}

/**
 * Maps a raw RMS onto the 0..1 visual range. A square-root curve so quiet
 * speech is still visible without loud speech blowing past the clamp.
 */
export function normalizeLevel(rms) {
  if (!Number.isFinite(rms) || rms <= SILENCE_FLOOR) return 0;
  return clamp01(
    Math.sqrt((rms - SILENCE_FLOOR) / (SATURATION_RMS - SILENCE_FLOOR))
  );
}

/**
 * Attack/release smoothing: rises quickly with a syllable, falls back slowly,
 * so the Core reads as rhythm rather than flicker.
 */
export function smoothLevel(
  previous,
  target,
  { attack = 0.55, release = 0.14 } = {}
) {
  const from = clamp01(previous);
  const to = clamp01(target);
  const factor = to > from ? attack : release;
  const next = from + (to - from) * factor;
  return next < 0.002 ? 0 : clamp01(next);
}

/**
 * The visual response to a level. Every field is bounded. Reduced motion keeps
 * a small, non-moving intensity change (glow) so the Core still confirms "I
 * hear you" without displacement or scaling.
 */
export function energyFromLevel(level, { reducedMotion = false } = {}) {
  const value = clamp01(level);
  if (reducedMotion)
    return {
      level: value,
      scale: 1,
      ringOffset: 0,
      glow: 0.3 + 0.25 * value,
      wave: value,
      particles: 0,
    };
  return {
    level: value,
    scale: 1 + 0.07 * value,
    ringOffset: 9 * value,
    glow: 0.3 + 0.6 * value,
    wave: value,
    particles: value,
  };
}

/**
 * Word-timed envelope for `speechSynthesis`: 1 at a boundary event, decaying
 * exponentially. Deterministic in `now`, and zero when no boundary has
 * happened — nothing moves unless speech is actually progressing.
 */
export function timingEnvelope(now, lastBoundaryAt, { decayMs = 220 } = {}) {
  if (!Number.isFinite(lastBoundaryAt) || !Number.isFinite(now)) return 0;
  const elapsed = now - lastBoundaryAt;
  if (elapsed < 0) return 0;
  const value = Math.exp(-elapsed / decayMs);
  return value < 0.01 ? 0 : clamp01(value);
}

/**
 * Wraps an `AnalyserNode` over a microphone stream or a media element.
 *
 * Returns `null` when the browser has no AudioContext, so callers fall back to
 * a non-reactive Core rather than throwing. `close()` disconnects the graph and
 * closes the context; it is idempotent and never stops the caller's stream
 * tracks (the caller owns those).
 */
export function createAudioMeter({
  AudioContextClass = typeof window !== "undefined"
    ? window.AudioContext || window.webkitAudioContext
    : undefined,
  stream = null,
  mediaElement = null,
  fftSize = 1024,
} = {}) {
  if (!AudioContextClass || (!stream && !mediaElement)) return null;
  let context;
  try {
    context = new AudioContextClass();
  } catch {
    return null;
  }
  const analyser = context.createAnalyser();
  analyser.fftSize = fftSize;
  let source;
  try {
    source = stream
      ? context.createMediaStreamSource(stream)
      : context.createMediaElementSource(mediaElement);
    source.connect(analyser);
    // A media element routed through Web Audio is silent unless the graph
    // reaches the destination. A microphone must never be routed there.
    if (mediaElement && context.destination)
      analyser.connect(context.destination);
  } catch {
    context.close?.().catch?.(() => {});
    return null;
  }
  const timeDomain =
    typeof analyser.getByteTimeDomainData === "function"
      ? new Uint8Array(analyser.fftSize || 1)
      : null;
  const frequency = new Uint8Array(analyser.frequencyBinCount || 1);
  let closed = false;

  return {
    context,
    read() {
      if (closed) return 0;
      if (timeDomain) {
        analyser.getByteTimeDomainData(timeDomain);
        return normalizeLevel(rmsFromTimeDomain(timeDomain));
      }
      analyser.getByteFrequencyData?.(frequency);
      return clamp01(levelFromFrequency(frequency) * 2);
    },
    /** Real spectrum, downsampled to `count` bands in 0..1. */
    bands(count = 32) {
      if (closed || typeof analyser.getByteFrequencyData !== "function")
        return null;
      analyser.getByteFrequencyData(frequency);
      return bandsFromFrequency(frequency, count);
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        source?.disconnect?.();
        analyser.disconnect?.();
      } catch {
        /* already disconnected */
      }
      context.close?.()?.catch?.(() => {});
    },
    get closed() {
      return closed;
    },
  };
}

/**
 * A tiny external store for the per-frame voice signal. The Core reads it
 * inside `requestAnimationFrame` so 60 updates a second never become 60 React
 * renders.
 */
export function createVoiceSignal() {
  let state = {
    source: SIGNAL_SOURCES.NONE,
    level: 0,
    phase: "IDLE",
    boundaryAt: null,
    bands: null,
  };
  const listeners = new Set();
  return {
    get: () => state,
    set(partial) {
      const next = { ...state, ...partial };
      const phaseChanged =
        next.phase !== state.phase || next.source !== state.source;
      state = next;
      if (phaseChanged) for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
