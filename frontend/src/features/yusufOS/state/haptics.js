/**
 * Optional semantic haptics.
 *
 * Off by default, opt-in per device, only offered where the Vibration API
 * exists on a touch-primary device (never desktop), and limited to three short
 * patterns. It never vibrates continuously and never follows speech: the
 * "talking" experience is visual.
 */

const STORAGE_KEY = "yusufOS.haptics";

export const HAPTIC_PATTERNS = Object.freeze({
  APPROVAL_NEEDED: [40, 60, 40],
  CRITICAL: [120],
  VOICE_ACTIVATED: [18],
});

export function hapticsSupported(
  win = typeof window !== "undefined" ? window : null
) {
  if (!win || typeof win.navigator?.vibrate !== "function") return false;
  const coarse = win.matchMedia?.("(pointer: coarse)")?.matches;
  return Boolean(coarse);
}

export function hapticsEnabled() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setHapticsEnabled(enabled) {
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, "on");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: stays off */
  }
}

export function pulseHaptic(
  kind,
  win = typeof window !== "undefined" ? window : null
) {
  const pattern = HAPTIC_PATTERNS[kind];
  if (!pattern || !hapticsSupported(win) || !hapticsEnabled()) return false;
  try {
    return win.navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
