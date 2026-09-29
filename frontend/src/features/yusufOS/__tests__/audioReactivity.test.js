import { describe, expect, test, vi } from "vitest";
import {
  SATURATION_RMS,
  SIGNAL_SOURCES,
  SILENCE_FLOOR,
  bandsFromFrequency,
  createAudioMeter,
  createVoiceSignal,
  energyFromLevel,
  normalizeLevel,
  rmsFromTimeDomain,
  smoothLevel,
  timingEnvelope,
} from "../state/audioReactivity";

/** 8-bit time-domain frame of a sine with the given peak amplitude (0..1). */
function sineFrame(peak, length = 1024) {
  return Uint8Array.from({ length }, (_, i) =>
    Math.round(128 + 127 * peak * Math.sin((2 * Math.PI * i) / 32))
  );
}

describe("amplitude measurement", () => {
  test("silence is exactly zero energy", () => {
    const rms = rmsFromTimeDomain(new Uint8Array(1024).fill(128));
    expect(rms).toBe(0);
    expect(normalizeLevel(rms)).toBe(0);
    expect(energyFromLevel(0)).toMatchObject({
      scale: 1,
      ringOffset: 0,
      particles: 0,
    });
  });

  test("room noise below the floor stays silent", () => {
    expect(normalizeLevel(SILENCE_FLOOR * 0.9)).toBe(0);
  });

  test("low < normal < high, monotonically", () => {
    const low = normalizeLevel(rmsFromTimeDomain(sineFrame(0.05)));
    const normal = normalizeLevel(rmsFromTimeDomain(sineFrame(0.25)));
    const high = normalizeLevel(rmsFromTimeDomain(sineFrame(0.45)));
    expect(low).toBeGreaterThan(0);
    expect(normal).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(normal);
  });

  test("loud input is clamped, never exceeds the bounded range", () => {
    expect(normalizeLevel(SATURATION_RMS * 4)).toBe(1);
    expect(normalizeLevel(rmsFromTimeDomain(sineFrame(1)))).toBeLessThanOrEqual(
      1
    );
    const energy = energyFromLevel(7);
    expect(energy.level).toBe(1);
    expect(energy.scale).toBeLessThanOrEqual(1.07);
    expect(energy.ringOffset).toBeLessThanOrEqual(9);
    expect(energy.glow).toBeLessThanOrEqual(0.9);
  });

  test("garbage input never produces NaN motion", () => {
    expect(normalizeLevel(Number.NaN)).toBe(0);
    expect(energyFromLevel(Number.NaN).scale).toBe(1);
    expect(rmsFromTimeDomain(null)).toBe(0);
  });

  test("reduced motion keeps intensity but removes displacement and scaling", () => {
    const energy = energyFromLevel(1, { reducedMotion: true });
    expect(energy.scale).toBe(1);
    expect(energy.ringOffset).toBe(0);
    expect(energy.particles).toBe(0);
    expect(energy.glow).toBeGreaterThan(
      energyFromLevel(0, { reducedMotion: true }).glow
    );
  });

  test("smoothing attacks fast, releases slowly and settles to zero", () => {
    const up = smoothLevel(0, 1);
    const down = smoothLevel(1, 0);
    expect(up).toBeGreaterThan(1 - down);
    let value = 1;
    for (let i = 0; i < 80; i += 1) value = smoothLevel(value, 0);
    expect(value).toBe(0);
  });

  test("spectrum bands are bounded and sized", () => {
    const bands = bandsFromFrequency(new Uint8Array(128).fill(255), 16);
    expect(bands).toHaveLength(16);
    expect(Math.max(...bands)).toBeLessThanOrEqual(1);
    expect(bandsFromFrequency(null, 4)).toEqual([0, 0, 0, 0]);
  });
});

describe("speech timing envelope (speechSynthesis has no audio to analyse)", () => {
  test("is deterministic, zero without a boundary and decays", () => {
    expect(timingEnvelope(1000, null)).toBe(0);
    expect(timingEnvelope(1000, 1000)).toBe(1);
    const a = timingEnvelope(1100, 1000);
    expect(timingEnvelope(1100, 1000)).toBe(a);
    expect(timingEnvelope(1300, 1000)).toBeLessThan(a);
    expect(timingEnvelope(5000, 1000)).toBe(0);
  });
});

function fakeAudioContext() {
  const analyser = {
    fftSize: 0,
    frequencyBinCount: 64,
    getByteTimeDomainData: vi.fn((array) =>
      array.set(sineFrame(0.3, array.length))
    ),
    getByteFrequencyData: vi.fn((array) => array.fill(100)),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const instances = [];
  class Context {
    constructor() {
      this.destination = {};
      this.close = vi.fn(() => Promise.resolve());
      instances.push(this);
    }
    createAnalyser() {
      return analyser;
    }
    createMediaStreamSource() {
      return source;
    }
    createMediaElementSource() {
      return source;
    }
  }
  return { Context, analyser, source, instances };
}

describe("audio meter lifecycle", () => {
  test("browser without AudioContext degrades to null, not a throw", () => {
    expect(
      createAudioMeter({ AudioContextClass: undefined, stream: {} })
    ).toBeNull();
  });

  test("reads real analyser data and closes idempotently", () => {
    const fake = fakeAudioContext();
    const track = { stop: vi.fn() };
    const meter = createAudioMeter({
      AudioContextClass: fake.Context,
      stream: { getTracks: () => [track] },
    });
    expect(meter.read()).toBeGreaterThan(0);
    expect(meter.bands(8)).toHaveLength(8);
    meter.close();
    meter.close();
    expect(fake.instances[0].close).toHaveBeenCalledTimes(1);
    expect(fake.source.disconnect).toHaveBeenCalled();
    // The meter never owns the microphone: the caller stops its tracks.
    expect(track.stop).not.toHaveBeenCalled();
    expect(meter.read()).toBe(0);
    expect(meter.bands()).toBeNull();
  });

  test("a microphone is never routed to the speakers", () => {
    const fake = fakeAudioContext();
    createAudioMeter({ AudioContextClass: fake.Context, stream: {} });
    expect(fake.analyser.connect).not.toHaveBeenCalled();
    const media = fakeAudioContext();
    createAudioMeter({ AudioContextClass: media.Context, mediaElement: {} });
    expect(media.analyser.connect).toHaveBeenCalled();
  });
});

describe("voice signal store", () => {
  test("notifies only on phase/source changes, not every frame", () => {
    const signal = createVoiceSignal();
    const listener = vi.fn();
    const unsubscribe = signal.subscribe(listener);
    signal.set({ level: 0.4 });
    signal.set({ level: 0.5 });
    expect(listener).not.toHaveBeenCalled();
    signal.set({ source: SIGNAL_SOURCES.MIC });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    signal.set({ source: SIGNAL_SOURCES.NONE });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(signal.get().level).toBe(0.5);
  });
});
