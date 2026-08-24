import React, {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ErrorBoundary } from "react-error-boundary";
import { coreVisual } from "../../state/coreVisualState";
import {
  resolveCssColor,
  usePrefersReducedMotion,
  useWebGLSupport,
} from "../../state/displayCapabilities";
import { toneGraphicVariable } from "../../state/statusSemantics";
import CoreRingsCSS from "./CoreRingsCSS";

/**
 * The System Core's 3D structure.
 *
 * One decision lives here and nowhere else: **which renderer draws the core.**
 *
 *   reduced motion  → CSS rings, paused. WebGL is never fetched.
 *   no WebGL        → CSS rings, animated.
 *   WebGL           → the real scene, with CSS rings shown while it loads and
 *                     permanently if it fails.
 *
 * That ordering is the whole performance and accessibility story. `three` and
 * `@react-three/fiber` sit behind a dynamic import, so they are a separate
 * chunk that a machine which cannot or should not run them never downloads —
 * and `/` never touches this module at all.
 *
 * What the core is *not*: it is not the readout. Every fact an operator needs —
 * the state name, what it means, the counts — is DOM text rendered by
 * `SystemCoreReadout`, which sits above this layer. If this component rendered
 * nothing at all, the Command Center would still be fully usable and fully
 * truthful. That is the property that makes it safe to have a 3D core here at
 * all.
 */

const CoreRingsWebGL = lazy(() => import("./CoreRingsWebGL"));

export default function SystemCore({ coreState, className = "", style }) {
  const reducedMotion = usePrefersReducedMotion();
  const webglSupported = useWebGLSupport();
  const hostRef = useRef(null);
  const [color, setColor] = useState(null);
  // Latches on a WebGL failure. Once the scene has thrown, we stay on CSS for
  // the rest of the session rather than retrying into the same error every time
  // the state changes.
  const [webglFailed, setWebglFailed] = useState(false);

  const visual = useMemo(
    () => coreVisual(coreState, { reducedMotion }),
    [coreState, reducedMotion]
  );

  // Resolve the tone's colour from the live cascade, so the WebGL scene is
  // painted with the exact token every other surface uses.
  useEffect(() => {
    setColor(
      resolveCssColor(hostRef.current, toneGraphicVariable(visual.tone))
    );
  }, [visual.tone]);

  const useWebgl =
    !reducedMotion && webglSupported === true && !webglFailed && color !== null;

  return (
    <div
      ref={hostRef}
      // Sized by the caller to match the constellation's core field exactly, so
      // the rings and the SVG core disc are concentric at every viewport.
      className={`pointer-events-none absolute ${className}`}
      style={style}
      data-core-renderer={useWebgl ? "webgl" : "css"}
      data-core-state={visual.state || "UNKNOWN"}
      data-core-energy={visual.energy}
    >
      {useWebgl ? (
        <ErrorBoundary
          onError={() => setWebglFailed(true)}
          fallbackRender={() => <CoreRingsCSS visual={visual} />}
        >
          {/* The CSS core is the Suspense fallback, so there is never a frame
              where the centre of the product is empty. */}
          <Suspense fallback={<CoreRingsCSS visual={visual} />}>
            <CoreRingsWebGL visual={visual} color={color} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <CoreRingsCSS visual={visual} />
      )}
    </div>
  );
}
