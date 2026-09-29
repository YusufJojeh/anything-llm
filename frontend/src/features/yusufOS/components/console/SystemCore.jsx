import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CORE_MODES, coreModeParams } from "../../state/coreVisualState";
import {
  SIGNAL_SOURCES,
  energyFromLevel,
  timingEnvelope,
} from "../../state/audioReactivity";
import { toneStyle } from "../../state/statusSemantics";
import { roleFor } from "../../state/agentRoles";
import { useReducedMotion } from "./useReducedMotion";

/**
 * The System Core — the hero of `/os`.
 *
 * Layers (outside in): technical grid and radial traces, a tick ring, two
 * tilted orbital ellipses, rotating arc rings, the Agent orbit (real roster
 * only), real handoff edges, a spectrum ring driven by real audio, and the
 * nucleus (raw WebGL sphere, SVG fallback).
 *
 * Every moving thing is explained by state:
 * - ring speed / hue / pulse come from `mode` (see `coreVisualState.js`);
 * - scale, glow and the spectrum ring come from the voice signal store, which
 *   only ever holds measured microphone/TTS amplitude or speech-boundary
 *   timing — silence is exactly still;
 * - edges exist only for persisted handoffs; only ACCEPTED ones carry a pulse,
 *   and a handoff that newly appears gets a brief arrival pulse.
 *
 * The SVG is `aria-hidden`. The Agent rail is the accessible equivalent, and
 * the centre button carries the state as text.
 */

const SIZE = 600;
const C = SIZE / 2;
const ORBIT_R = 196;
const WAVE_R = 134;
const WAVE_POINTS = 64;

const HUES = {
  cyan: [0.22, 0.84, 1],
  amber: [1, 0.72, 0.3],
  critical: [1, 0.37, 0.42],
  neutral: [0.49, 0.58, 0.65],
};

function polar(radius, degrees) {
  const rad = (degrees * Math.PI) / 180;
  return [C + radius * Math.cos(rad), C + radius * Math.sin(rad)];
}

function arc(radius, start, sweep) {
  const [x1, y1] = polar(radius, start);
  const [x2, y2] = polar(radius, start + sweep);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${radius} ${radius} 0 ${
    sweep > 180 ? 1 : 0
  } 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Deterministic orbit placement: Chief of Staff at the top, others evenly. */
export function orbitPositions(agents) {
  const ordered = [...agents].sort((a, b) =>
    a.agentId === "chief_of_staff" ? -1 : b.agentId === "chief_of_staff" ? 1 : 0
  );
  const step = ordered.length ? 360 / ordered.length : 0;
  return new Map(
    ordered.map((agent, index) => {
      const angle = -90 + index * step;
      const [x, y] = polar(ORBIT_R, angle);
      return [agent.agentId, { x, y, angle }];
    })
  );
}

/** Circular spectrum path. `bands` are real analyser bins (0..1). */
export function wavePath(bands, level, amplitude = 34) {
  const points = [];
  for (let index = 0; index < WAVE_POINTS; index += 1) {
    const half = WAVE_POINTS / 2;
    const bandIndex = index < half ? index : WAVE_POINTS - 1 - index;
    const band = bands?.length
      ? bands[Math.floor((bandIndex / half) * bands.length)] || 0
      : level;
    const radius = WAVE_R + band * amplitude;
    const [x, y] = polar(radius, -90 + (index / WAVE_POINTS) * 360);
    points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M ${points.join(" L ")} Z`;
}

const TICKS = Array.from({ length: 120 }, (_, index) => index * 3);
const TRACES = Array.from({ length: 24 }, (_, index) => index * 15);
const MARKERS = [18, 96, 151, 212, 268, 331];

function Nucleus({ rendererRef, onRenderer }) {
  const canvasRef = useRef(null);
  const [renderer, setRenderer] = useState("pending");

  useEffect(() => {
    let cancelled = false;
    let instance = null;
    import("./nucleusGL")
      .then(({ createNucleusRenderer }) => {
        if (cancelled || !canvasRef.current) return;
        instance = createNucleusRenderer(canvasRef.current);
        if (!instance) {
          setRenderer("svg");
          return;
        }
        rendererRef.current = instance;
        setRenderer("webgl");
        onRenderer?.();
      })
      .catch(() => !cancelled && setRenderer("svg"));
    return () => {
      cancelled = true;
      if (rendererRef.current === instance) rendererRef.current = null;
      instance?.dispose();
    };
    // One renderer per mount.
  }, []);

  // A lost context falls back rather than leaving a blank centre.
  useEffect(() => {
    if (renderer !== "webgl") return undefined;
    const canvas = canvasRef.current;
    const onLost = () => setRenderer("svg");
    canvas?.addEventListener("webglcontextlost", onLost);
    return () => canvas?.removeEventListener("webglcontextlost", onLost);
  }, [renderer]);

  return (
    <div className="yos-core-nucleus" data-renderer={renderer}>
      {renderer !== "svg" ? (
        <canvas ref={canvasRef} aria-hidden="true" />
      ) : (
        <svg viewBox="-100 -100 200 200" aria-hidden="true">
          <defs>
            <radialGradient id="yos-nucleus-fill" cx="42%" cy="38%" r="70%">
              <stop
                offset="0%"
                stopColor="var(--yos-core-hue)"
                stopOpacity="0.35"
              />
              <stop
                offset="60%"
                stopColor="var(--yos-core-hue)"
                stopOpacity="0.08"
              />
              <stop
                offset="100%"
                stopColor="var(--yos-core-hue)"
                stopOpacity="0.45"
              />
            </radialGradient>
          </defs>
          <circle r="96" fill="url(#yos-nucleus-fill)" />
          <circle
            r="96"
            fill="none"
            stroke="var(--yos-core-hue)"
            strokeOpacity="0.7"
            strokeWidth="1.2"
          />
          {/* Static on purpose: rotating inside SVG costs a layout per frame,
              and the fallback exists for constrained browsers. */}
          <g
            stroke="var(--yos-core-hue)"
            strokeOpacity="0.3"
            fill="none"
            strokeWidth="0.8"
          >
            {[20, 45, 70, 90].map((rx) => (
              <ellipse key={rx} rx={rx} ry="96" />
            ))}
            {[-60, -30, 0, 30, 60].map((y) => (
              <ellipse
                key={y}
                cy={y}
                rx={Math.sqrt(96 * 96 - y * y)}
                ry={Math.sqrt(96 * 96 - y * y) * 0.18}
              />
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}

export default function SystemCore({
  mode = CORE_MODES.UNKNOWN,
  stateLabel,
  agents = [],
  edges = [],
  selectedAgentId = null,
  onSelectAgent,
  onOpenCore,
  signal = null,
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const params = coreModeParams(mode);
  const rootRef = useRef(null);
  const waveRef = useRef(null);
  const rendererRef = useRef(null);
  const visibleRef = useRef(true);
  const [signalSource, setSignalSource] = useState(
    () => signal?.get().source || SIGNAL_SOURCES.NONE
  );
  const positions = useMemo(() => orbitPositions(agents), [agents]);

  // Arrival pulse for handoffs the snapshot did not contain last time.
  const seenEdgesRef = useRef(null);
  const [freshEdges, setFreshEdges] = useState(() => new Set());
  useEffect(() => {
    const ids = new Set(edges.map((edge) => edge.id));
    if (seenEdgesRef.current) {
      const fresh = [...ids].filter((id) => !seenEdgesRef.current.has(id));
      if (fresh.length) {
        setFreshEdges(new Set(fresh));
        const timer = setTimeout(() => setFreshEdges(new Set()), 5000);
        seenEdgesRef.current = ids;
        return () => clearTimeout(timer);
      }
    }
    seenEdgesRef.current = ids;
    return undefined;
  }, [edges]);

  useEffect(() => {
    if (!signal) return undefined;
    return signal.subscribe((state) => setSignalSource(state.source));
  }, [signal]);

  // Pause all per-frame work while the Core is off-screen.
  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      node.dataset.paused = entry.isIntersecting ? "false" : "true";
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /**
   * The frame loop. Reads the signal store (never React state), writes three
   * CSS variables, the spectrum path and one WebGL draw. Idle (no audio) it
   * runs at ~24fps and only if the nucleus actually needs to animate; hidden
   * tabs and off-screen cores do no work.
   */
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;
    const hue = HUES[params.hue] || HUES.cyan;
    let frame = 0;
    let last = 0;
    let wasActive = true;
    let lastLevel = -1;
    const start = performance.now();

    const draw = (now) => {
      const state = signal?.get();
      let level = 0;
      if (
        state?.source === SIGNAL_SOURCES.MIC ||
        state?.source === SIGNAL_SOURCES.TTS_AUDIO
      )
        level = state.level || 0;
      else if (state?.source === SIGNAL_SOURCES.SPEECH_TIMING)
        level = 0.7 * timingEnvelope(now, state.boundaryAt);
      const energy = energyFromLevel(level, { reducedMotion });
      // Silence after silence changes nothing on screen: skip the DOM writes
      // (and the style recalculation they would trigger).
      const quiet = energy.level === 0 && lastLevel === 0;
      lastLevel = energy.level;
      if (!quiet) writeEnergy(energy, state);
      rendererRef.current?.render({
        time:
          reducedMotion || !params.spin
            ? 0
            : ((now - start) / 1000) * (60 / params.spin),
        energy: energy.level,
        intensity: params.intensity + 0.3,
        hue,
      });
      return state?.source && state.source !== SIGNAL_SOURCES.NONE;
    };

    const writeEnergy = (energy, state) => {
      node.style.setProperty("--yos-core-scale", energy.scale.toFixed(4));
      node.style.setProperty("--yos-core-glow", energy.glow.toFixed(3));
      node.style.setProperty(
        "--yos-core-offset",
        `${energy.ringOffset.toFixed(2)}px`
      );
      node.dataset.energy = energy.level.toFixed(2);
      waveRef.current?.setAttribute(
        "d",
        wavePath(
          state?.source === SIGNAL_SOURCES.SPEECH_TIMING ? null : state?.bands,
          energy.wave,
          reducedMotion ? 10 : 34
        )
      );
    };

    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || !visibleRef.current) return;
      const audioActive =
        signal?.get().source !== SIGNAL_SOURCES.NONE && Boolean(signal);
      const nucleusAnimates =
        Boolean(rendererRef.current) && !reducedMotion && Boolean(params.spin);
      if (!audioActive && !nucleusAnimates) {
        // Settle once to the silent state, then stop doing work.
        if (wasActive) wasActive = Boolean(draw(now));
        return;
      }
      if (!audioActive && now - last < 40) return;
      last = now;
      wasActive = true;
      draw(now);
    };
    draw(performance.now());
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [params, reducedMotion, signal]);

  const signalKey =
    signalSource === SIGNAL_SOURCES.NONE
      ? null
      : `yusufOS:coreView.signal.${signalSource}`;

  return (
    <div
      ref={rootRef}
      className="yos-core"
      data-mode={mode}
      data-hue={params.hue}
      data-pulse={reducedMotion ? "none" : params.pulse || "none"}
      data-spin={reducedMotion || !params.spin ? "off" : "on"}
      data-signal={signalSource}
      style={{
        "--yos-core-spin": `${params.spin || 60}s`,
        opacity: mode === CORE_MODES.OFFLINE ? 0.55 : 1,
      }}
    >
      <div className="yos-core-halo" aria-hidden="true">
        <div className="yos-core-pulse" data-pulse-slot="halo" />
      </div>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="yos-core-halo" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor="var(--yos-core-hue)"
              stopOpacity="0.18"
            />
            <stop
              offset="45%"
              stopColor="var(--yos-core-hue)"
              stopOpacity="0.05"
            />
            <stop
              offset="100%"
              stopColor="var(--yos-core-hue)"
              stopOpacity="0"
            />
          </radialGradient>
        </defs>

        {/* Technical grid + radial traces */}
        <g stroke="var(--yos-core-hue)" strokeOpacity="0.07" strokeWidth="1">
          {TRACES.map((deg) => {
            const [x1, y1] = polar(92, deg);
            const [x2, y2] = polar(296, deg);
            return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>

        {/* Tick ring */}
        <g stroke="var(--yos-core-hue)" strokeOpacity="0.28">
          {TICKS.map((deg) => {
            const long = deg % 30 === 0;
            const [x1, y1] = polar(long ? 282 : 286, deg);
            const [x2, y2] = polar(292, deg);
            return (
              <line
                key={deg}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={long ? 1.4 : 0.7}
              />
            );
          })}
        </g>

        {/* Tilted orbital planes — reads as depth without a 3D engine */}
        <g
          fill="none"
          stroke="var(--yos-core-hue)"
          strokeOpacity="0.16"
          strokeWidth="1"
        >
          <ellipse
            cx={C}
            cy={C}
            rx="292"
            ry="74"
            transform={`rotate(-14 ${C} ${C})`}
          />
          <ellipse
            cx={C}
            cy={C}
            rx="292"
            ry="74"
            transform={`rotate(14 ${C} ${C})`}
          />
        </g>
      </svg>

      {/* Rotating rings live on their own compositor layers: an HTML
          wrapper rotated with a CSS transform costs no style or layout work
          per frame, unlike animating inside an SVG. */}
      <div className="yos-core-layer yos-core-spin" aria-hidden="true">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full">
          {/* Outer rotating arc ring with orbital markers */}
          <g>
            <circle
              cx={C}
              cy={C}
              r="270"
              fill="none"
              stroke="var(--yos-core-hue)"
              strokeOpacity="0.14"
              strokeDasharray="2 6"
            />
            {[0, 120, 240].map((start) => (
              <path
                key={start}
                d={arc(270, start, 54)}
                fill="none"
                stroke="var(--yos-core-hue)"
                strokeOpacity="0.7"
                strokeWidth="2"
              />
            ))}
            {MARKERS.map((deg) => {
              const [x, y] = polar(270, deg);
              return (
                <circle
                  key={deg}
                  cx={x}
                  cy={y}
                  r="2.4"
                  fill="var(--yos-core-hue)"
                  fillOpacity="0.8"
                />
              );
            })}
          </g>
        </svg>
      </div>
      <div className="yos-core-layer yos-core-spin-rev" aria-hidden="true">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full">
          {/* Inner counter-rotating rings, displaced by real amplitude */}
          <g>
            <circle
              cx={C}
              cy={C}
              r="205"
              fill="none"
              stroke="var(--yos-core-hue)"
              strokeOpacity="0.22"
            />
            {[30, 150, 270].map((start) => (
              <path
                key={start}
                d={arc(205, start, 70)}
                fill="none"
                stroke="var(--yos-core-hue)"
                strokeOpacity="0.55"
                strokeWidth="1.2"
              />
            ))}
          </g>
        </svg>
      </div>
      <div
        className="yos-core-pulse yos-core-ring"
        data-pulse-slot="outer"
        aria-hidden="true"
      />
      <div
        className="yos-core-pulse yos-core-ring"
        data-pulse-slot="inner"
        aria-hidden="true"
      />

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        <g className="yos-core-reactive">
          <circle
            cx={C}
            cy={C}
            r="172"
            fill="none"
            stroke="var(--yos-core-hue)"
            strokeOpacity="0.35"
            strokeDasharray="1 4"
          />
          <circle
            cx={C}
            cy={C}
            r="160"
            fill="none"
            stroke="var(--yos-core-hue)"
            strokeOpacity="0.5"
            strokeWidth="1"
            style={{
              transform: "translateY(calc(var(--yos-core-offset) * -0.4))",
            }}
          />
        </g>

        {/* Real audio spectrum ring */}
        <path
          ref={waveRef}
          d={wavePath(null, 0)}
          fill="none"
          stroke="var(--yos-core-hue)"
          strokeOpacity="0.8"
          strokeWidth="1.3"
        />

        {/* Real handoff edges between orbiting Agents */}
        <g fill="none">
          {edges.map((edge) => {
            const from = positions.get(edge.fromAgentId);
            const to = positions.get(edge.toAgentId);
            if (!from || !to) return null;
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            const cx = C + (mx - C) * 0.3;
            const cy = C + (my - C) * 0.3;
            const d = `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
            const color = toneStyle(edge.tone).graphic;
            const fresh = freshEdges.has(edge.id);
            return (
              <g
                key={edge.id}
                data-edge={edge.id}
                data-edge-active={edge.active ? "true" : "false"}
              >
                <path
                  d={d}
                  stroke={color}
                  strokeOpacity="0.45"
                  strokeWidth="1.2"
                  strokeDasharray={edge.kind === "REVIEW" ? "4 5" : undefined}
                />
                {edge.active || fresh ? (
                  <path
                    d={d}
                    pathLength="1"
                    stroke="var(--yos-cyan-bright)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="yos-handoff-pulse"
                    data-once={!edge.active && fresh ? "true" : undefined}
                  />
                ) : null}
              </g>
            );
          })}
        </g>

        {/* Agent orbit — only the real roster */}
        {agents.map((agent) => {
          const position = positions.get(agent.agentId);
          if (!position) return null;
          const style = toneStyle(agent.tone);
          const selected = agent.agentId === selectedAgentId;
          const role = roleFor(agent.agentId);
          return (
            <g
              key={agent.agentId}
              data-orbit-agent={agent.agentId}
              onClick={() => onSelectAgent?.(agent.agentId)}
              style={{ cursor: onSelectAgent ? "pointer" : "default" }}
            >
              {selected ? (
                <circle
                  cx={position.x}
                  cy={position.y}
                  r="21"
                  fill="none"
                  stroke="var(--yos-cyan-bright)"
                  strokeWidth="1.2"
                />
              ) : null}
              <circle
                cx={position.x}
                cy={position.y}
                r="15"
                fill="var(--yos-bg-2)"
                stroke={style.graphic}
                strokeWidth="1.6"
              />
              <text
                x={position.x}
                y={position.y + 3.5}
                textAnchor="middle"
                fontSize="10"
                fontFamily="var(--yos-font-mono)"
                fill="var(--yos-text)"
              >
                {role.glyph}
              </text>
            </g>
          );
        })}
      </svg>

      <Nucleus rendererRef={rendererRef} />

      <button
        type="button"
        onClick={onOpenCore}
        className="yos-press absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full text-center"
        style={{
          inlineSize: "30%",
          blockSize: "30%",
          background:
            "radial-gradient(circle, rgb(2 7 11 / 0.82) 0%, rgb(2 7 11 / 0.55) 62%, transparent 72%)",
        }}
        aria-label={`${t("yusufOS:core.open")}: ${stateLabel}`}
      >
        <span
          className="yos-mono text-[clamp(10px,1.1vw,13px)]"
          style={{ color: "var(--yos-text-secondary)" }}
        >
          {t("yusufOS:brand.name").toUpperCase()}
        </span>
        <span
          className="yos-mono text-[clamp(13px,1.8vw,22px)] font-semibold"
          style={{ color: "var(--yos-text)" }}
        >
          {t("yusufOS:coreView.systemCore")}
        </span>
        <span
          aria-hidden="true"
          className="h-px w-8"
          style={{ background: "var(--yos-core-hue)" }}
        />
        <span
          className="yos-label max-w-[92%] text-center leading-tight"
          data-core-state-label
          style={{ color: "var(--yos-core-hue)" }}
        >
          {stateLabel}
        </span>
        {signalKey ? (
          <span className="yos-label" style={{ fontSize: 9 }}>
            {t(signalKey)}
          </span>
        ) : null}
      </button>
    </div>
  );
}
