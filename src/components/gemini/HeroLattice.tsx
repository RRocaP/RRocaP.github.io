import { useEffect, useRef, useState } from 'react';

type Props = {
  posterBase?: string;
};

const COLORS = {
  bg: [0.031, 0.043, 0.066] as const,
  edge: [0.768, 0.585, 0.416] as const,
  edgeDim: [0.95, 0.94, 0.92] as const,
  wave: [1.0, 0.842, 0.609] as const,
  hub: [0.92, 0.18, 0.12] as const,
};

/* -------------------------------------------------------------------------
 * Scene pass — instanced cube wireframes with attention-sweep illumination
 * ------------------------------------------------------------------------- */

const SCENE_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aLocal;
layout(location = 1) in vec3 aOffset;
layout(location = 2) in float aPhase;
layout(location = 3) in float aIsHub;

uniform mat4 uView;
uniform mat4 uProj;
uniform float uTime;
uniform float uWavePos;

out float vWave;
out float vDepth;
out float vIsHub;
out float vEdgeMix;

void main() {
  float pulse = 1.0 + 0.04 * sin(uTime * 0.6 + aPhase * 6.2831);
  vec3 local = aLocal * pulse;
  vec3 world = local + aOffset;

  vec4 viewPos = uView * vec4(world, 1.0);
  gl_Position = uProj * viewPos;

  float distToWave = abs(world.z - uWavePos);
  vWave = exp(-distToWave * distToWave * 0.5);

  float lead = world.z - uWavePos;
  if (lead < 0.0) vWave *= 0.5;

  vDepth = clamp(-viewPos.z / 22.0, 0.0, 1.0);
  vIsHub = aIsHub;
  vEdgeMix = 0.5 + 0.5 * sin(uTime * 0.3 + aPhase * 3.1);
}
`;

const SCENE_FS = `#version 300 es
precision highp float;

in float vWave;
in float vDepth;
in float vIsHub;
in float vEdgeMix;

uniform vec3 uEdge;
uniform vec3 uEdgeDim;
uniform vec3 uWave;
uniform vec3 uHub;
uniform vec3 uBg;
uniform vec2 uViewport;

out vec4 fragColor;

void main() {
  vec3 baseEdge = mix(uEdgeDim, uEdge, vEdgeMix * 0.6);
  vec3 hub = mix(baseEdge, uHub, vIsHub);
  vec3 lit = mix(hub, uWave, clamp(vWave, 0.0, 0.96));

  // Hub cubes always glow at base intensity, lifted by wave.
  if (vIsHub > 0.5) {
    lit = mix(uHub, uWave, vWave * 0.6);
  }

  float fog = smoothstep(0.0, 1.0, vDepth);
  vec3 withFog = mix(lit, uBg, fog * 0.85);

  // HDR-style amplification on wave-lit + hub fragments so bloom has something to extract.
  float bright = vWave * 1.6 + vIsHub * 1.4;
  vec3 emit = withFog + lit * bright * 0.6;

  float alpha = mix(1.0, 0.30, fog);
  alpha *= mix(0.7, 1.0, clamp(vWave + 0.3, 0.0, 1.0));
  if (vIsHub > 0.5) alpha = max(alpha, 0.95);

  float yNorm = gl_FragCoord.y / uViewport.y;
  float bottomFade = smoothstep(0.0, 0.10, yNorm);
  alpha *= bottomFade;

  fragColor = vec4(emit, alpha);
}
`;

/* -------------------------------------------------------------------------
 * Face pass — translucent filled cubes for solid silhouette mass
 * ------------------------------------------------------------------------- */

const FACE_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aLocal;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aOffset;
layout(location = 3) in float aPhase;
layout(location = 4) in float aIsHub;

uniform mat4 uView;
uniform mat4 uProj;
uniform float uTime;
uniform float uWavePos;

out float vWave;
out float vDepth;
out float vIsHub;
out float vNDotL;
out float vRim;

void main() {
  float pulse = 1.0 + 0.04 * sin(uTime * 0.6 + aPhase * 6.2831);
  vec3 local = aLocal * pulse;
  vec3 world = local + aOffset;

  vec4 viewPos = uView * vec4(world, 1.0);
  gl_Position = uProj * viewPos;

  // Fake directional lighting in view space — front-up-right.
  vec3 lightDir = normalize(vec3(0.4, 0.5, 0.8));
  vec3 worldNormal = aNormal; // cubes don't rotate per-instance
  vNDotL = max(0.0, dot(worldNormal, lightDir));

  // Rim term — brighter at silhouette edges, makes solid faces feel volumetric.
  vec3 viewDir = normalize(-viewPos.xyz);
  vec3 viewNormal = mat3(uView) * worldNormal;
  vRim = pow(1.0 - max(0.0, dot(normalize(viewNormal), viewDir)), 2.0);

  float distToWave = abs(world.z - uWavePos);
  vWave = exp(-distToWave * distToWave * 0.5);
  if (world.z - uWavePos < 0.0) vWave *= 0.5;

  vDepth = clamp(-viewPos.z / 22.0, 0.0, 1.0);
  vIsHub = aIsHub;
}
`;

const FACE_FS = `#version 300 es
precision highp float;

in float vWave;
in float vDepth;
in float vIsHub;
in float vNDotL;
in float vRim;

uniform vec3 uEdge;
uniform vec3 uWave;
uniform vec3 uHub;
uniform vec3 uBg;

out vec4 fragColor;

void main() {
  vec3 baseTone = vIsHub > 0.5 ? uHub : uEdge;
  vec3 lit = baseTone * (0.20 + 0.55 * vNDotL);
  lit = mix(lit, uWave, vWave * 0.65);
  lit += baseTone * vRim * 0.45;

  float fog = smoothstep(0.0, 1.0, vDepth);
  vec3 withFog = mix(lit, uBg, fog * 0.9);

  // Faces are mostly translucent — silhouette mass without occluding the wireframe edges.
  float alpha = (0.10 + vWave * 0.18 + vIsHub * 0.18) * (1.0 - fog * 0.6);
  fragColor = vec4(withFog, alpha);
}
`;

/* -------------------------------------------------------------------------
 * Post-processing — fullscreen quad shaders
 * ------------------------------------------------------------------------- */

const QUAD_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform float uThreshold;
out vec4 fragColor;
void main() {
  vec4 c = texture(uScene, vUV);
  float lum = max(max(c.r, c.g), c.b);
  float k = smoothstep(uThreshold, uThreshold + 0.35, lum);
  fragColor = vec4(c.rgb * k, c.a);
}
`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;     // (1/w, 0) or (0, 1/h)
out vec4 fragColor;

const float W0 = 0.227027;
const float W1 = 0.1945946;
const float W2 = 0.1216216;
const float W3 = 0.054054;
const float W4 = 0.016216;

void main() {
  vec3 r = texture(uTex, vUV).rgb * W0;
  r += texture(uTex, vUV + uDir * 1.0).rgb * W1;
  r += texture(uTex, vUV - uDir * 1.0).rgb * W1;
  r += texture(uTex, vUV + uDir * 2.0).rgb * W2;
  r += texture(uTex, vUV - uDir * 2.0).rgb * W2;
  r += texture(uTex, vUV + uDir * 3.0).rgb * W3;
  r += texture(uTex, vUV - uDir * 3.0).rgb * W3;
  r += texture(uTex, vUV + uDir * 4.0).rgb * W4;
  r += texture(uTex, vUV - uDir * 4.0).rgb * W4;
  fragColor = vec4(r, 1.0);
}
`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uCA;       // chromatic-aberration amount
out vec4 fragColor;

void main() {
  vec4 scene = texture(uScene, vUV);

  // Tiny radial chromatic separation — sample R and B at offset coords.
  vec2 off = (vUV - 0.5) * uCA;
  float r = texture(uScene, vUV + off).r;
  float b = texture(uScene, vUV - off).b;
  vec3 chroma = vec3(r, scene.g, b);
  vec3 base = mix(scene.rgb, chroma, 0.25);

  vec3 bloom = texture(uBloom, vUV).rgb;
  vec3 result = base + bloom * uBloomStrength;

  fragColor = vec4(result, scene.a);
}
`;

/* -------------------------------------------------------------------------
 * GL helpers
 * ------------------------------------------------------------------------- */

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`Program link failed: ${log}`);
  }
  return p;
}

function createRenderTarget(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { tex, fbo, w, h };
}

function cubeEdgeVerts(scale: number) {
  const s = scale * 0.5;
  const c: [number, number, number][] = [
    [-s, -s, -s], [ s, -s, -s], [ s,  s, -s], [-s,  s, -s],
    [-s, -s,  s], [ s, -s,  s], [ s,  s,  s], [-s,  s,  s],
  ];
  const edges = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7],
  ];
  const out = new Float32Array(edges.length * 2 * 3);
  let o = 0;
  for (const [a, b] of edges) {
    out[o++] = c[a][0]; out[o++] = c[a][1]; out[o++] = c[a][2];
    out[o++] = c[b][0]; out[o++] = c[b][1]; out[o++] = c[b][2];
  }
  return out;
}

// 36 triangle vertices (12 tris × 3 verts) plus a per-vertex face normal.
function cubeFaceVerts(scale: number) {
  const s = scale * 0.5;
  const faces: { quad: [number, number, number][]; n: [number, number, number] }[] = [
    { quad: [[-s,-s, s],[ s,-s, s],[ s, s, s],[-s, s, s]], n: [0, 0, 1] },
    { quad: [[ s,-s,-s],[-s,-s,-s],[-s, s,-s],[ s, s,-s]], n: [0, 0,-1] },
    { quad: [[ s,-s, s],[ s,-s,-s],[ s, s,-s],[ s, s, s]], n: [1, 0, 0] },
    { quad: [[-s,-s,-s],[-s,-s, s],[-s, s, s],[-s, s,-s]], n: [-1, 0, 0] },
    { quad: [[-s, s, s],[ s, s, s],[ s, s,-s],[-s, s,-s]], n: [0, 1, 0] },
    { quad: [[-s,-s,-s],[ s,-s,-s],[ s,-s, s],[-s,-s, s]], n: [0,-1, 0] },
  ];
  const pos = new Float32Array(faces.length * 6 * 3);
  const nrm = new Float32Array(faces.length * 6 * 3);
  let o = 0;
  for (const f of faces) {
    const [a, b, c, d] = f.quad;
    const tris: [number, number, number][] = [a, b, c, a, c, d];
    for (const v of tris) {
      pos[o + 0] = v[0]; pos[o + 1] = v[1]; pos[o + 2] = v[2];
      nrm[o + 0] = f.n[0]; nrm[o + 1] = f.n[1]; nrm[o + 2] = f.n[2];
      o += 3;
    }
  }
  return { pos, nrm };
}

function hash(seed: number) {
  let x = seed | 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = (x + (x << 3)) | 0;
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return (x >>> 0) / 0xffffffff;
}

/**
 * Density-modulated cube cluster — cubes are placed on a grid candidate set,
 * but each cell is *kept* only if a density field at that point exceeds a
 * threshold. The field is built from three overlapping Gaussian "blobs"
 * arranged into a horizontally elongated cluster — reads as the silhouette
 * of a small molecular complex (a hub + two satellite domains), with sparse
 * "branches" that taper out from the centre. The visual is cubes-as-substrate
 * for a molecular *form*, not cubes-as-wallpaper.
 */
function buildLattice(nx: number, ny: number, nz: number, spacing: number) {
  const offsets: number[] = [];
  const phases: number[] = [];
  const hubs: number[] = [];
  const cx = (nx - 1) * 0.5;
  const cy = (ny - 1) * 0.5;
  const cz = (nz - 1) * 0.5;

  // Cluster anatomy — molecular silhouette offset to the right of the world origin,
  // so it lands in the right two-thirds of the canvas (text reads in the left third,
  // matching the isomorphic-labs / latent-labs hero layout). Generous negative space,
  // bright dense core, tapered outward.
  const OFFX = 3.5;
  const blobs: { x: number; y: number; z: number; rx: number; ry: number; rz: number; w: number }[] = [
    { x:  0.0 + OFFX, y:  0.0, z:  0.0, rx: 2.6, ry: 1.7, rz: 1.9, w: 1.20 }, // bright core
    { x: -2.8 + OFFX, y:  1.3, z: -0.6, rx: 1.8, ry: 1.3, rz: 1.5, w: 0.90 }, // left anchor
    { x:  3.2 + OFFX, y: -1.0, z:  0.8, rx: 1.9, ry: 1.4, rz: 1.6, w: 0.95 }, // right anchor
    { x: -0.6 + OFFX, y:  2.6, z: -1.2, rx: 1.4, ry: 1.0, rz: 1.2, w: 0.55 }, // upper wisp
    { x:  1.4 + OFFX, y: -2.4, z:  1.4, rx: 1.4, ry: 1.0, rz: 1.2, w: 0.55 }, // lower wisp
  ];

  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        const wx = (x - cx) * spacing;
        const wy = (y - cy) * spacing * 1.0;
        const wz = (z - cz) * spacing;

        // Sample the (anisotropic) density field at this candidate cube position.
        let density = 0;
        for (const b of blobs) {
          const dx = (wx - b.x) / b.rx;
          const dy = (wy - b.y) / b.ry;
          const dz = (wz - b.z) / b.rz;
          const d2 = dx * dx + dy * dy + dz * dz;
          density += b.w * Math.exp(-d2);
        }

        // Noise to break the geometric smoothness — molecular surfaces are rough.
        const seed = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
        const n = hash(seed) * 0.35;

        // Threshold: high near the cluster, sparse outside. Some cubes survive
        // far from the centre to read as "noise" / "scaffolding".
        const keep = density + n * 0.6 > 0.55;
        if (!keep) continue;

        const jx = (hash(seed) - 0.5) * 0.22;
        const jy = (hash(seed + 1) - 0.5) * 0.22;
        const jz = (hash(seed + 2) - 0.5) * 0.22;
        offsets.push(wx + jx, wy + jy, wz + jz);
        phases.push(hash(seed + 7));
        // Hubs concentrate in the dense core (high density → more likely to be a hub).
        const hubProb = Math.min(0.18, density * 0.10);
        hubs.push(hash(seed + 11) < hubProb ? 1 : 0);
      }
    }
  }

  return {
    offsets: new Float32Array(offsets),
    phases: new Float32Array(phases),
    hubs: new Float32Array(hubs),
    count: phases.length,
  };
}

function perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
}

function lookAt(out: Float32Array, ex: number, ey: number, ez: number, cx: number, cy: number, cz: number) {
  let zx = ex - cx, zy = ey - cy, zz = ez - cz;
  let zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
  let xx = -zz, xy = 0, xz = zx;
  let xl = Math.hypot(xx, xy, xz);
  if (xl === 0) { xx = 1; xy = 0; xz = 0; } else { xx /= xl; xy /= xl; xz /= xl; }
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
}

/* -------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

export default function HeroLattice({ posterBase = '/hero/video-poster' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const isMobile = window.innerWidth < 768;

    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: isMobile ? 'low-power' : 'high-performance',
    });
    if (!gl) { setFailed(true); return; }

    let scenePrg: WebGLProgram, facePrg: WebGLProgram, brightPrg: WebGLProgram, blurPrg: WebGLProgram, compositePrg: WebGLProgram;
    try {
      scenePrg = link(gl, SCENE_VS, SCENE_FS);
      facePrg = link(gl, FACE_VS, FACE_FS);
      brightPrg = link(gl, QUAD_VS, BRIGHT_FS);
      blurPrg = link(gl, QUAD_VS, BLUR_FS);
      compositePrg = link(gl, QUAD_VS, COMPOSITE_FS);
    } catch (e) {
      console.warn('HeroLattice: shader build failed', e);
      setFailed(true);
      return;
    }

    /* --- Lattice geometry --- */

    const lattice = isMobile
      ? buildLattice(13, 9, 12, 0.95)
      : buildLattice(20, 12, 16, 0.85);
    const cubeSize = isMobile ? 0.5 : 0.55;
    const cubeVerts = cubeEdgeVerts(cubeSize);
    const cubeFaces = cubeFaceVerts(cubeSize);

    const sceneVAO = gl.createVertexArray();
    gl.bindVertexArray(sceneVAO);

    const cubeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cubeVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const offsetBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuf);
    gl.bufferData(gl.ARRAY_BUFFER, lattice.offsets, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    const phaseBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, phaseBuf);
    gl.bufferData(gl.ARRAY_BUFFER, lattice.phases, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    const hubBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, hubBuf);
    gl.bufferData(gl.ARRAY_BUFFER, lattice.hubs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    /* --- Face VAO: per-vertex pos + normal, shares the instance buffers --- */

    const faceVAO = gl.createVertexArray();
    gl.bindVertexArray(faceVAO);

    const facePosBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, facePosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cubeFaces.pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const faceNrmBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, faceNrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cubeFaces.nrm, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    // Reuse the same offset/phase/hub buffers as the wireframe pass.
    gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, phaseBuf);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, hubBuf);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);

    /* --- Fullscreen quad --- */

    const quadVAO = gl.createVertexArray();
    gl.bindVertexArray(quadVAO);
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1,  1,
      -1,  1,  1, -1,   1,  1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    /* --- Uniforms --- */

    const uScene = {
      view: gl.getUniformLocation(scenePrg, 'uView'),
      proj: gl.getUniformLocation(scenePrg, 'uProj'),
      time: gl.getUniformLocation(scenePrg, 'uTime'),
      wavePos: gl.getUniformLocation(scenePrg, 'uWavePos'),
      edge: gl.getUniformLocation(scenePrg, 'uEdge'),
      edgeDim: gl.getUniformLocation(scenePrg, 'uEdgeDim'),
      wave: gl.getUniformLocation(scenePrg, 'uWave'),
      hub: gl.getUniformLocation(scenePrg, 'uHub'),
      bg: gl.getUniformLocation(scenePrg, 'uBg'),
      viewport: gl.getUniformLocation(scenePrg, 'uViewport'),
    };
    const uFace = {
      view: gl.getUniformLocation(facePrg, 'uView'),
      proj: gl.getUniformLocation(facePrg, 'uProj'),
      time: gl.getUniformLocation(facePrg, 'uTime'),
      wavePos: gl.getUniformLocation(facePrg, 'uWavePos'),
      edge: gl.getUniformLocation(facePrg, 'uEdge'),
      wave: gl.getUniformLocation(facePrg, 'uWave'),
      hub: gl.getUniformLocation(facePrg, 'uHub'),
      bg: gl.getUniformLocation(facePrg, 'uBg'),
    };
    const uBright = {
      scene: gl.getUniformLocation(brightPrg, 'uScene'),
      threshold: gl.getUniformLocation(brightPrg, 'uThreshold'),
    };
    const uBlur = {
      tex: gl.getUniformLocation(blurPrg, 'uTex'),
      dir: gl.getUniformLocation(blurPrg, 'uDir'),
    };
    const uComp = {
      scene: gl.getUniformLocation(compositePrg, 'uScene'),
      bloom: gl.getUniformLocation(compositePrg, 'uBloom'),
      strength: gl.getUniformLocation(compositePrg, 'uBloomStrength'),
      ca: gl.getUniformLocation(compositePrg, 'uCA'),
    };

    /* --- Sizing + framebuffers --- */

    const view = new Float32Array(16);
    const proj = new Float32Array(16);
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75);
    const bloomScale = isMobile ? 0.35 : 0.5;
    const enableBloom = !isMobile;

    type RT = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };
    let sceneRT: RT | null = null;
    let bloomA: RT | null = null;
    let bloomB: RT | null = null;
    let bloomC: RT | null = null;

    function disposeRT(rt: RT | null) {
      if (!rt) return;
      gl!.deleteTexture(rt.tex);
      gl!.deleteFramebuffer(rt.fbo);
    }

    function resize() {
      if (!canvas) return;
      const w = wrapper!.clientWidth;
      const h = wrapper!.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      perspective(proj, (45 * Math.PI) / 180, canvas.width / canvas.height, 0.1, 100);

      if (enableBloom) {
        disposeRT(sceneRT); disposeRT(bloomA); disposeRT(bloomB); disposeRT(bloomC);
        sceneRT = createRenderTarget(gl!, canvas.width, canvas.height);
        const bw = Math.max(2, Math.floor(canvas.width * bloomScale));
        const bh = Math.max(2, Math.floor(canvas.height * bloomScale));
        bloomA = createRenderTarget(gl!, bw, bh);
        bloomB = createRenderTarget(gl!, bw, bh);
        bloomC = createRenderTarget(gl!, bw, bh);
      }
    }
    resize();

    const resizeObs = new ResizeObserver(resize);
    resizeObs.observe(wrapper);

    let visible = true;
    const intersectObs = new IntersectionObserver(
      (entries) => { for (const e of entries) visible = e.isIntersecting; },
      { threshold: 0 }
    );
    intersectObs.observe(wrapper);

    const reducedNow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    const start = performance.now();

    function drawLatticePass(t: number, target: WebGLFramebuffer | null, w: number, h: number) {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, target);
      gl!.viewport(0, 0, w, h);
      gl!.clearColor(0, 0, 0, 0);
      gl!.disable(gl!.DEPTH_TEST);
      gl!.enable(gl!.BLEND);
      // Premultiplied additive — gives a luminous, layered look as cubes overlap in screen space.
      gl!.blendFuncSeparate(gl!.SRC_ALPHA, gl!.ONE, gl!.ONE, gl!.ONE);
      gl!.clear(gl!.COLOR_BUFFER_BIT);

      // Small-amplitude orbital sway — keeps the cluster framed on the right of the canvas
      // rather than sweeping it across the view. Echoes the slow turntable feel of the references.
      const yaw = reducedNow ? 0.25 : 0.25 + Math.sin(t * 0.18) * 0.18;
      const pitch = reducedNow ? 0.10 : 0.10 + Math.sin(t * 0.13) * 0.06;
      const radius = 13;
      const ex = Math.sin(yaw) * radius;
      const ez = Math.cos(yaw) * radius;
      const ey = Math.sin(pitch) * radius * 0.45;
      lookAt(view, ex, ey, ez, 0, 0, 0);

      const wavePeriod = 9.0;
      const wavePos = reducedNow ? -2.0 : ((t % wavePeriod) / wavePeriod) * 16 - 8;

      // Pass 1: translucent cube faces — gives solid mass to the silhouette.
      gl!.useProgram(facePrg);
      gl!.uniformMatrix4fv(uFace.view, false, view);
      gl!.uniformMatrix4fv(uFace.proj, false, proj);
      gl!.uniform1f(uFace.time, t);
      gl!.uniform1f(uFace.wavePos, wavePos);
      gl!.uniform3fv(uFace.edge, COLORS.edge as unknown as Float32List);
      gl!.uniform3fv(uFace.wave, COLORS.wave as unknown as Float32List);
      gl!.uniform3fv(uFace.hub, COLORS.hub as unknown as Float32List);
      gl!.uniform3fv(uFace.bg, COLORS.bg as unknown as Float32List);
      gl!.bindVertexArray(faceVAO);
      gl!.drawArraysInstanced(gl!.TRIANGLES, 0, cubeFaces.pos.length / 3, lattice.count);

      // Pass 2: wireframe edges on top — crisp silhouette + structure.
      gl!.useProgram(scenePrg);
      gl!.uniformMatrix4fv(uScene.view, false, view);
      gl!.uniformMatrix4fv(uScene.proj, false, proj);
      gl!.uniform1f(uScene.time, t);
      gl!.uniform1f(uScene.wavePos, wavePos);
      gl!.uniform3fv(uScene.edge, COLORS.edge as unknown as Float32List);
      gl!.uniform3fv(uScene.edgeDim, COLORS.edgeDim as unknown as Float32List);
      gl!.uniform3fv(uScene.wave, COLORS.wave as unknown as Float32List);
      gl!.uniform3fv(uScene.hub, COLORS.hub as unknown as Float32List);
      gl!.uniform3fv(uScene.bg, COLORS.bg as unknown as Float32List);
      gl!.uniform2f(uScene.viewport, w, h);
      gl!.bindVertexArray(sceneVAO);
      gl!.drawArraysInstanced(gl!.LINES, 0, cubeVerts.length / 3, lattice.count);
    }

    function drawQuad(prg: WebGLProgram, target: WebGLFramebuffer | null, w: number, h: number, setup: () => void) {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, target);
      gl!.viewport(0, 0, w, h);
      gl!.disable(gl!.BLEND);
      gl!.useProgram(prg);
      setup();
      gl!.bindVertexArray(quadVAO);
      gl!.drawArrays(gl!.TRIANGLES, 0, 6);
    }

    function frame(tNow: number) {
      const t = (tNow - start) / 1000;
      if (!visible) { if (!reducedNow) raf = requestAnimationFrame(frame); return; }

      if (!enableBloom || !sceneRT || !bloomA || !bloomB || !bloomC) {
        drawLatticePass(t, null, canvas!.width, canvas!.height);
      } else {
        // 1. Lattice → sceneRT
        drawLatticePass(t, sceneRT.fbo, sceneRT.w, sceneRT.h);
        // 2. Bright extract: sceneRT → bloomA
        drawQuad(brightPrg, bloomA.fbo, bloomA.w, bloomA.h, () => {
          gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, sceneRT!.tex);
          gl!.uniform1i(uBright.scene, 0);
          gl!.uniform1f(uBright.threshold, 0.55);
        });
        // 3. Horizontal blur: bloomA → bloomB
        drawQuad(blurPrg, bloomB.fbo, bloomB.w, bloomB.h, () => {
          gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, bloomA!.tex);
          gl!.uniform1i(uBlur.tex, 0);
          gl!.uniform2f(uBlur.dir, 1 / bloomA!.w, 0);
        });
        // 4. Vertical blur: bloomB → bloomC
        drawQuad(blurPrg, bloomC.fbo, bloomC.w, bloomC.h, () => {
          gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, bloomB!.tex);
          gl!.uniform1i(uBlur.tex, 0);
          gl!.uniform2f(uBlur.dir, 0, 1 / bloomB!.h);
        });
        // 5. Second blur iteration for softer halo: bloomC → bloomB → bloomA
        drawQuad(blurPrg, bloomB.fbo, bloomB.w, bloomB.h, () => {
          gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, bloomC!.tex);
          gl!.uniform1i(uBlur.tex, 0);
          gl!.uniform2f(uBlur.dir, 2 / bloomC!.w, 0);
        });
        drawQuad(blurPrg, bloomA.fbo, bloomA.w, bloomA.h, () => {
          gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, bloomB!.tex);
          gl!.uniform1i(uBlur.tex, 0);
          gl!.uniform2f(uBlur.dir, 0, 2 / bloomB!.h);
        });
        // 6. Composite to default framebuffer
        drawQuad(compositePrg, null, canvas!.width, canvas!.height, () => {
          gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, sceneRT!.tex);
          gl!.uniform1i(uComp.scene, 0);
          gl!.activeTexture(gl!.TEXTURE1); gl!.bindTexture(gl!.TEXTURE_2D, bloomA!.tex);
          gl!.uniform1i(uComp.bloom, 1);
          gl!.uniform1f(uComp.strength, 0.85);
          gl!.uniform1f(uComp.ca, 0.0008);
        });
      }

      if (!reducedNow) raf = requestAnimationFrame(frame);
    }

    if (reducedNow) {
      frame(performance.now());
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObs.disconnect();
      intersectObs.disconnect();
      disposeRT(sceneRT); disposeRT(bloomA); disposeRT(bloomB); disposeRT(bloomC);
      gl.deleteBuffer(cubeBuf);
      gl.deleteBuffer(offsetBuf);
      gl.deleteBuffer(phaseBuf);
      gl.deleteBuffer(hubBuf);
      gl.deleteBuffer(facePosBuf);
      gl.deleteBuffer(faceNrmBuf);
      gl.deleteBuffer(quadBuf);
      gl.deleteVertexArray(sceneVAO);
      gl.deleteVertexArray(faceVAO);
      gl.deleteVertexArray(quadVAO);
      gl.deleteProgram(scenePrg);
      gl.deleteProgram(facePrg);
      gl.deleteProgram(brightPrg);
      gl.deleteProgram(blurPrg);
      gl.deleteProgram(compositePrg);
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    };
  }, []);

  return (
    <div ref={wrapperRef} className="hero-lattice" aria-hidden="true">
      {failed && (
        <picture className="hero-lattice__poster">
          <source srcSet={`${posterBase}.avif`} type="image/avif" />
          <source srcSet={`${posterBase}.webp`} type="image/webp" />
          <img src={`${posterBase}.jpg`} alt="" loading="eager" decoding="async" />
        </picture>
      )}
      <canvas ref={canvasRef} className="hero-lattice__canvas" />
      <div className="hero-lattice__vignette" />
      <style>{`
        .hero-lattice {
          position: absolute;
          inset: 0;
          overflow: hidden;
          background: #080B11;
        }
        .hero-lattice__canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
        }
        .hero-lattice__poster { position: absolute; inset: 0; }
        .hero-lattice__poster img {
          width: 100%; height: 100%; object-fit: cover;
          opacity: 0.55; filter: saturate(0.7) contrast(1.05);
        }
        .hero-lattice__vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse 70% 42% at 50% 52%, rgba(8,11,17,0.55) 0%, rgba(8,11,17,0.25) 45%, transparent 80%),
            radial-gradient(ellipse at 50% 35%, transparent 0%, transparent 65%, rgba(8,11,17,0.35) 100%),
            linear-gradient(to bottom, transparent 0%, transparent 75%, rgba(8,11,17,0.80) 100%);
        }
      `}</style>
    </div>
  );
}
