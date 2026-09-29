/**
 * Raw WebGL nucleus for the System Core — one full-quad fragment shader, no
 * 3D library. A lat/long-gridded sphere with a Fresnel rim, lit by a state hue
 * and brightened by a real audio energy uniform.
 *
 * Loaded lazily by `CoreNucleus`; if WebGL is unavailable, fails to compile or
 * loses its context, `createNucleusRenderer` returns null / reports lost and
 * the caller shows the SVG nucleus instead. Nothing here allocates per frame.
 */

const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uEnergy;
uniform float uIntensity;
uniform vec3 uHue;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 p = vUv * 1.18;
  float r = length(p);
  vec3 color = vec3(0.0);
  float alpha = 0.0;

  if (r < 1.0) {
    float z = sqrt(1.0 - r * r);
    vec3 n = vec3(p, z);
    float lon = atan(n.x, n.z) + uTime * 0.12;
    float lat = asin(clamp(n.y, -1.0, 1.0));

    float lonLines = abs(fract(lon * 12.0 / 6.2831853) - 0.5);
    float latLines = abs(fract(lat * 9.0 / 3.1415926) - 0.5);
    float grid = smoothstep(0.47, 0.5, max(lonLines, latLines));

    // Deterministic land-like dot field on a lat/long lattice.
    vec2 cell = floor(vec2(lon * 28.0 / 6.2831853, lat * 18.0 / 3.1415926));
    vec2 local = fract(vec2(lon * 28.0 / 6.2831853, lat * 18.0 / 3.1415926)) - 0.5;
    float land = step(0.58, hash(cell));
    float dots = land * smoothstep(0.22, 0.1, length(local));

    float fresnel = pow(1.0 - z, 2.4);
    float core = pow(z, 3.0);
    vec3 base = uHue * (0.05 + 0.08 * core);
    color = base
      + uHue * grid * (0.22 + 0.25 * uEnergy)
      + uHue * dots * (0.35 + 0.4 * uEnergy) * z
      + uHue * fresnel * (0.75 + 0.9 * uEnergy);
    color *= uIntensity;
    alpha = 0.92;
  } else {
    float halo = exp(-(r - 1.0) * (9.0 - 4.0 * uEnergy));
    color = uHue * halo * (0.35 + 0.5 * uEnergy) * uIntensity;
    alpha = halo * 0.8;
  }
  gl_FragColor = vec4(color, alpha);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createNucleusRenderer(canvas, { maxDpr = 1.5 } = {}) {
  let gl = null;
  try {
    gl =
      canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
        powerPreference: "low-power",
      }) || null;
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const uniforms = {
    time: gl.getUniformLocation(program, "uTime"),
    energy: gl.getUniformLocation(program, "uEnergy"),
    intensity: gl.getUniformLocation(program, "uIntensity"),
    hue: gl.getUniformLocation(program, "uHue"),
  };

  let lost = false;
  const onLost = (event) => {
    event.preventDefault();
    lost = true;
  };
  canvas.addEventListener("webglcontextlost", onLost);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  return {
    get lost() {
      return lost;
    },
    render({ time = 0, energy = 0, intensity = 1, hue = [0.22, 0.84, 1] }) {
      if (lost) return false;
      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1f(uniforms.energy, energy);
      gl.uniform1f(uniforms.intensity, intensity);
      gl.uniform3f(uniforms.hue, hue[0], hue[1], hue[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return true;
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      try {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* context already gone */
      }
    },
  };
}
