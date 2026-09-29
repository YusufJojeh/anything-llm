import { CORE_STATES, coreStateTone } from "./commandCenterModel";

/**
 * How the System Core *looks*, derived from the state the backend asserted.
 *
 * This module is the single reason the 3D core can be trusted. Every visual
 * property the core has — how fast a ring turns, which way it turns, how bright
 * the halo burns, how quickly it breathes — is a pure function of
 * `deriveCoreState(dashboard)`. Nothing here reads a clock, a random seed, or a
 * frame counter, and nothing animates unless a real state asked it to.
 *
 * That matters because a spinning ring reads as "the system is doing
 * something". If the speed were arbitrary, the core would be a decoration that
 * lies. Here, a faster ring means exactly one thing: the projection says the
 * staff is working. A still ring means the projection says it is not.
 *
 * Three energies exist, and they are the only vocabulary:
 *
 * - `CALM`      — nominal. Slow, quiet, low halo.
 * - `ACTIVE`    — real work is running. Faster, brighter, still unhurried.
 * - `ATTENTION` — something needs Yusuf, or something is wrong. Urgent cadence.
 * - `DORMANT`   — the system is degraded or partly offline. Slowed and dimmed.
 *
 * The WebGL core and the CSS core both consume this object, which is what makes
 * them the same object rendered two ways rather than two different pictures.
 */

export const CORE_ENERGY = Object.freeze({
  CALM: "CALM",
  ACTIVE: "ACTIVE",
  ATTENTION: "ATTENTION",
  DORMANT: "DORMANT",
});

/**
 * Per-state visual parameters.
 *
 * `ringPeriods` are seconds per full revolution for the outer, middle and inner
 * ring. Longer is slower. The three differ so the rings never lock into a
 * single rigid disc, which is what gives the core depth at rest.
 *
 * Every key of `CORE_STATES` is present. A state that is missing here would
 * silently fall back to calm — i.e. would render an alarm as "fine" — so the
 * completeness of this table is asserted by a test.
 */
const VISUALS = Object.freeze({
  // Nothing is blocked and nothing is waiting. The core is alive but idle.
  [CORE_STATES.HEALTHY]: {
    energy: CORE_ENERGY.CALM,
    ringPeriods: [96, 68, 44],
    haloIntensity: 0.3,
    haloCadenceMs: 6200,
    coreScale: 1,
  },
  // Agents are genuinely executing governed work: the only state that spins up.
  [CORE_STATES.WORKING]: {
    energy: CORE_ENERGY.ACTIVE,
    ringPeriods: [34, 22, 13],
    haloIntensity: 0.44,
    haloCadenceMs: 3400,
    coreScale: 1.02,
  },
  // Waiting on Yusuf. Urgent cadence, but never frantic — this is a prompt to
  // act, not an emergency.
  [CORE_STATES.WAITING_APPROVAL]: {
    energy: CORE_ENERGY.ATTENTION,
    ringPeriods: [46, 30, 19],
    haloIntensity: 0.56,
    haloCadenceMs: 2200,
    coreScale: 1.02,
  },
  // Work has stopped. The rings reverse: the formation reads as held back
  // rather than progressing, without needing a colour to say so.
  [CORE_STATES.BLOCKED]: {
    energy: CORE_ENERGY.ATTENTION,
    ringPeriods: [70, 48, 30],
    ringReversed: true,
    haloIntensity: 0.5,
    haloCadenceMs: 2400,
    coreScale: 1,
  },
  // The audit chain did not verify. The loudest state the core has.
  [CORE_STATES.SECURITY_ALERT]: {
    energy: CORE_ENERGY.ATTENTION,
    ringPeriods: [26, 17, 10],
    haloIntensity: 0.66,
    haloCadenceMs: 1600,
    coreScale: 1.03,
  },
  // External mutations are disabled. Deliberately near-frozen: the system is
  // holding still on purpose, and it should look like it.
  [CORE_STATES.EMERGENCY_STOP]: {
    energy: CORE_ENERGY.ATTENTION,
    ringPeriods: [150, 120, 96],
    ringReversed: true,
    haloIntensity: 0.6,
    haloCadenceMs: 1800,
    coreScale: 0.98,
  },
  // An external effect may have happened and is still being proven.
  [CORE_STATES.RECONCILING]: {
    energy: CORE_ENERGY.ATTENTION,
    ringPeriods: [40, 26, 16],
    haloIntensity: 0.46,
    haloCadenceMs: 2600,
    coreScale: 1,
  },
  // The control plane is not fully configured.
  [CORE_STATES.DEGRADED]: {
    energy: CORE_ENERGY.DORMANT,
    ringPeriods: [130, 92, 60],
    haloIntensity: 0.26,
    haloCadenceMs: 7200,
    coreScale: 0.97,
  },
  // An execution adapter is unavailable: part of the body is not reachable.
  [CORE_STATES.OFFLINE_ADAPTER]: {
    energy: CORE_ENERGY.DORMANT,
    ringPeriods: [150, 108, 72],
    haloIntensity: 0.2,
    haloCadenceMs: 8000,
    coreScale: 0.96,
  },
});

/**
 * The core state is unknown — the dashboard has not been read yet, or it did
 * not assert one. Nothing moves and nothing glows, because there is nothing to
 * report. An unknown core must never look healthy.
 */
const UNKNOWN_VISUAL = Object.freeze({
  energy: CORE_ENERGY.DORMANT,
  ringPeriods: [180, 140, 100],
  haloIntensity: 0.14,
  haloCadenceMs: 9000,
  coreScale: 0.95,
  ringReversed: false,
});

/** Inclination of each ring, outermost first. Fixed: this is the core's shape,
 *  not a state signal, so it must not change when the system's mood does. */
export const RING_TILTS = Object.freeze([74, 58, 22]);

/**
 * Radius of each ring as a fraction of the scene's half-size.
 *
 * The innermost is held clear of the core disc the constellation SVG draws on
 * top (`CORE_RADIUS` plus its structural ring), so a ring never emerges from
 * behind the disc looking like it is cutting through it.
 */
export const RING_RADII = Object.freeze([0.94, 0.76, 0.6]);

/**
 * Resolves a core state to its full visual description.
 *
 * @param {string|null} coreState one of `CORE_STATES`, or null when unknown.
 * @param {{reducedMotion?: boolean}} options
 * @returns a frozen description both core renderers consume.
 */
export function coreVisual(coreState, { reducedMotion = false } = {}) {
  const base = VISUALS[coreState] || UNKNOWN_VISUAL;
  return Object.freeze({
    state: coreState || null,
    known: Boolean(VISUALS[coreState]),
    tone: coreStateTone(coreState),
    energy: base.energy,
    // Under reduced motion the periods are still reported so a consumer can
    // show them as a static readout, but `animated` tells it not to move.
    animated: !reducedMotion,
    ringPeriods: base.ringPeriods,
    ringReversed: Boolean(base.ringReversed),
    haloIntensity: base.haloIntensity,
    haloCadenceMs: base.haloCadenceMs,
    coreScale: base.coreScale,
  });
}

/**
 * Angular velocity in radians per second for a ring, for the WebGL core.
 *
 * Derived from the same periods the CSS core animates with, so the two
 * implementations turn at genuinely the same rate rather than approximately.
 */
export function ringAngularVelocity(visual, ringIndex) {
  const period = visual.ringPeriods[ringIndex];
  if (!period || !visual.animated) return 0;
  const magnitude = (Math.PI * 2) / period;
  return visual.ringReversed ? -magnitude : magnitude;
}

/** Every core state this module knows how to draw. Exported for the test that
 *  asserts the table stays complete as the backend's enum grows. */
export const VISUAL_STATE_KEYS = Object.freeze(Object.keys(VISUALS));
