import React from "react";
import { toneStyle } from "../../state/statusSemantics";
import { RING_RADII, RING_TILTS } from "../../state/coreVisualState";

/**
 * The System Core's layered rings, in CSS 3D.
 *
 * This is the *baseline* implementation, not a placeholder. It renders on every
 * machine, in every browser, with no WebGL context and no extra bytes, and it
 * is what the console shows when:
 *
 * - the operator prefers reduced motion (the WebGL chunk is then never fetched);
 * - WebGL is unavailable or was refused;
 * - the WebGL chunk is still loading, or failed to load.
 *
 * Three rings, each on its own inclination, rotating at a period the *core
 * state* chose. That is the whole object: real perspective (a shared
 * `perspective` on the scene, `rotateX` per ring), real depth ordering, and no
 * frame loop of our own — the compositor animates the transforms.
 *
 * `aria-hidden` throughout: the state these rings express is stated in words by
 * the readout next to them, and a screen reader gains nothing from three
 * nested decorative divs.
 */
export default function CoreRingsCSS({ visual, className = "" }) {
  const style = toneStyle(visual.tone);

  return (
    <div
      aria-hidden="true"
      className={`yos-scene pointer-events-none absolute inset-0 ${className}`}
    >
      <div className="yos-scene-3d relative h-full w-full">
        {/* Volumetric halo. Its brightness and cadence are the core state's,
            never a constant — a dormant system does not glow like a working
            one. */}
        <div
          className="yos-halo"
          style={{
            "--yos-halo-color": style.graphic,
            "--yos-halo-intensity": visual.haloIntensity,
            "--yos-halo-dur": `${visual.haloCadenceMs}ms`,
          }}
        />

        {RING_RADII.map((radius, index) => {
          const period = visual.ringPeriods[index];
          const size = `${radius * 100}%`;
          return (
            <div
              key={radius}
              className="yos-ring"
              style={{
                inlineSize: size,
                blockSize: size,
                borderWidth: index === 0 ? "1px" : "1.5px",
                borderColor: `color-mix(in srgb, ${style.graphic} ${
                  [34, 52, 72][index]
                }%, transparent)`,
                "--yos-ring-tilt": `${RING_TILTS[index]}deg`,
                "--yos-ring-dur": `${period}s`,
                "--yos-ring-dir": visual.ringReversed ? "reverse" : "normal",
                // `animated` is the reduced-motion decision. The ring keeps its
                // inclination and colour; it simply stops turning.
                animationPlayState: visual.animated ? "running" : "paused",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
