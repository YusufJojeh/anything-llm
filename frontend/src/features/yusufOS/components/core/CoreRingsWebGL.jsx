import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  MathUtils,
} from "three";
import {
  RING_RADII,
  RING_TILTS,
  ringAngularVelocity,
} from "../../state/coreVisualState";

/**
 * The System Core, in WebGL.
 *
 * Loaded lazily and only when the display can actually run it — see
 * `SystemCore.jsx`, which owns that decision. Everything about the scene is
 * driven by the same `coreVisual(coreState)` object the CSS core consumes, so
 * the two are one object rendered two ways rather than two pictures that happen
 * to look similar.
 *
 * Scope is deliberately narrow. This renders *structure*: three inclined rings,
 * a containment shell and a volumetric halo. It renders no agents, no data, no
 * particles and no text. Everything an operator has to read is DOM, where it is
 * selectable, translatable, RTL-correct and reachable by a screen reader.
 *
 * Performance budget: ~800 triangles, no shadows, no post-processing, no
 * environment map, capped device pixel ratio, and `powerPreference: "low-power"`
 * so a laptop does not spin up its discrete GPU to draw three rings.
 */

/** Ring radii in world units. The scene is authored inside a unit sphere. */
const WORLD_SCALE = 1.0;

function Ring({ radius, tiltDeg, velocity, color, opacity, thickness }) {
  const ref = useRef(null);

  useFrame((_, delta) => {
    if (!ref.current || velocity === 0) return;
    ref.current.rotation.z += velocity * delta;
  });

  return (
    <mesh
      ref={ref}
      // The inclination is baked into the parent group's X rotation and the
      // spin happens on Z, so a ring turns *within its own plane* rather than
      // wobbling — which is what a still ring and a spinning ring must have in
      // common for the motion to read as speed rather than as a different shape.
      rotation={[MathUtils.degToRad(tiltDeg), 0, 0]}
    >
      <torusGeometry args={[radius, thickness, 8, 128]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * The halo: a back-faced sphere with additive blending. Cheaper and steadier
 * than a bloom pass, and it cannot blow out the UI around it the way real bloom
 * does on a bright status colour.
 */
function Halo({ color, intensity, cadenceMs, animated }) {
  const ref = useRef(null);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (!ref.current) return;
    if (!animated) {
      ref.current.material.opacity = intensity;
      return;
    }
    elapsed.current += delta;
    // Same cadence as the CSS core's `yos-halo-breathe`, so switching renderers
    // does not change how fast the system appears to breathe.
    const phase = Math.sin(
      (elapsed.current * 2 * Math.PI) / (cadenceMs / 1000)
    );
    ref.current.material.opacity = intensity * (0.83 + 0.17 * phase);
    const scale = 1 + 0.035 * phase;
    ref.current.scale.setScalar(scale);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1.42 * WORLD_SCALE, 32, 24]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={intensity}
        side={BackSide}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** The core's containment shell — the boundary of the system itself. */
function Shell({ color }) {
  return (
    <mesh>
      <icosahedronGeometry args={[0.42 * WORLD_SCALE, 1]} />
      <meshBasicMaterial
        color={color}
        wireframe
        transparent
        opacity={0.16}
        toneMapped={false}
      />
    </mesh>
  );
}

function Scene({ visual, color }) {
  const threeColor = useMemo(() => new Color(color), [color]);

  return (
    <>
      <Halo
        color={threeColor}
        intensity={visual.haloIntensity * 0.42}
        cadenceMs={visual.haloCadenceMs}
        animated={visual.animated}
      />
      <Shell color={threeColor} />
      {RING_RADII.map((radius, index) => (
        <Ring
          key={radius}
          radius={radius * WORLD_SCALE}
          tiltDeg={RING_TILTS[index]}
          velocity={ringAngularVelocity(visual, index)}
          color={threeColor}
          opacity={[0.34, 0.52, 0.72][index]}
          thickness={[0.006, 0.008, 0.011][index]}
        />
      ))}
    </>
  );
}

export default function CoreRingsWebGL({ visual, color }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <Canvas
        // `demand` when nothing should move: the scene renders once and then the
        // frame loop stops entirely, so a paused core costs no GPU at all.
        frameloop={visual.animated ? "always" : "demand"}
        dpr={[1, 1.75]}
        // z is chosen so one world unit equals exactly half the canvas: at
        // fov 42, half-height = z * tan(21°), so z = 1 / tan(21°). That makes a
        // ring authored at radius `r` land at `r` of the half-box — the same
        // place the CSS core puts it, which is why switching renderers does not
        // resize the core.
        camera={{ position: [0, 0, 2.605], fov: 42 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "low-power",
          // The stage behind the canvas already paints the background; clearing
          // to transparent lets the grid and the glow show through.
          preserveDrawingBuffer: false,
        }}
        style={{ background: "transparent" }}
      >
        <Scene visual={visual} color={color} />
      </Canvas>
    </div>
  );
}
