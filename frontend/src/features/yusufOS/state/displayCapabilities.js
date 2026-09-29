import { useEffect, useState } from "react";

/**
 * What this display can actually do.
 *
 * Two questions, both of which must be answered before the console decides how
 * to draw the System Core:
 *
 * 1. **Does the operator want motion?** `prefers-reduced-motion` is a stated
 *    preference, not a hint. When it is set, Yusuf OS does not load the WebGL
 *    core at all — a still WebGL scene is a quarter of a megabyte of JavaScript
 *    doing nothing.
 * 2. **Can this machine run WebGL at all?** Software rasterisers, locked-down
 *    browsers, remote desktops and headless environments all answer no. Asking
 *    once and falling back is honest; letting a canvas fail silently is not.
 *
 * Both are live: the operator can flip the motion preference mid-session and
 * the console follows without a reload.
 */

/** Media-query subscription that tolerates jsdom and older Safari. */
export function useMediaQuery(query, fallback = false) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return fallback;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const list = window.matchMedia(query);
    const update = (event) => setMatches(event.matches);
    setMatches(list.matches);
    // `addEventListener` on MediaQueryList is the modern API; `addListener` is
    // kept for Safari < 14, which is still a real browser on real machines.
    if (list.addEventListener) {
      list.addEventListener("change", update);
      return () => list.removeEventListener("change", update);
    }
    list.addListener(update);
    return () => list.removeListener(update);
  }, [query]);

  return matches;
}

export function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/**
 * Whether a WebGL context can genuinely be created here.
 *
 * Probed once with a throwaway canvas and then explicitly released, so the
 * check cannot leak a context — browsers cap how many a document may hold, and
 * a leaked probe would eventually starve the real scene.
 */
export function detectWebGL() {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * `null` until the probe has run, then a boolean.
 *
 * The tri-state matters: rendering the fallback during the unknown window and
 * then swapping is correct, but rendering *nothing* would make the core blink
 * out on every mount.
 */
export function useWebGLSupport() {
  const [supported, setSupported] = useState(null);
  useEffect(() => {
    setSupported(detectWebGL());
  }, []);
  return supported;
}

/**
 * Resolves a CSS custom property to a concrete colour string.
 *
 * WebGL cannot consume `var(--yos-active-graphic)`; it needs `#4a90d9`. Reading
 * the computed value keeps the 3D core on exactly the same palette as every
 * other surface, so a token change moves both at once and the two can never
 * drift into two different blues.
 */
export function resolveCssColor(element, variable, fallback = "#6aa9e0") {
  if (!element || typeof window === "undefined") return fallback;
  const value = window
    .getComputedStyle(element)
    .getPropertyValue(variable)
    .trim();
  return value || fallback;
}
