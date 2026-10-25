// Underwater ambience — marine snow, plankton, bubbles, light shafts, deep
// bioluminescence and shallow caustic dapple. Owner: fish.
// Contract: { update(dt, info), splash(pos, strength), bubbleBurst(pos, count),
//             setUnderwater(v) } and it hooks app.bus 'sign:splash' itself.
import * as THREE from 'three';
import { app } from '../core/state.js';
import { WORLD } from '../core/world.js';
import { clamp, mulberry32, smoothstep } from '../core/util.js';

const _cam = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _scale = new THREE.Vector3();

const SNOW_VERT = /* glsl */`
  uniform vec3 uCam;
  uniform float uTime;
  uniform float uBox;
  uniform float uFall;
  uniform float uPixel;
  uniform float uOpacity;
  attribute vec3 aRand;
  attribute float aSize;
  attribute float aSeed;
  varying float vA;
  varying float vSeed;
  void main() {
    vec3 p = aRand * uBox;
    p.y -= uTime * uFall * (0.3 + aSeed * 1.1);
    p.x += sin(uTime * 0.13 + aSeed * 12.0) * 0.7;
    p.z += cos(uTime * 0.10 + aSeed * 9.0) * 0.6;
    p = uCam + (fract((p - uCam + 0.5 * uBox) / uBox) - 0.5) * uBox;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    gl_PointSize = clamp(aSize * 46.0 * uPixel / max(dist, 0.55), 0.5, 5.0);
    vA = uOpacity * smoothstep(0.7, 2.4, dist) * (0.45 + 0.55 * fract(aSeed * 7.3));
    vSeed = aSeed;
  }
`;

const SNOW_FRAG = /* glsl */`
  varying float vA;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = (1.0 - smoothstep(0.12, 0.5, d)) * vA;
    vec3 col = mix(vec3(0.52, 0.72, 0.74), vec3(0.88, 0.93, 0.87), fract(vSeed * 3.7));
    gl_FragColor = vec4(col, a * 0.72);
  }
`;

const PLANKTON_VERT = /* glsl */`
  uniform vec3 uCam;
  uniform float uTime;
  uniform float uBox;
  uniform float uPixel;
  uniform float uOpacity;
  attribute vec3 aRand;
  attribute float aSize;
  attribute float aSeed;
  varying float vA;
  varying float vSeed;
  void main() {
    vec3 p = aRand * uBox;
    p.y -= uTime * 0.16 * (0.2 + aSeed);
    p.x += sin(uTime * 0.5 + aSeed * 14.0) * 0.5;
    p.z += cos(uTime * 0.4 + aSeed * 11.0) * 0.5;
    p = uCam + (fract((p - uCam + 0.5 * uBox) / uBox) - 0.5) * uBox;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    gl_PointSize = clamp(aSize * 26.0 * uPixel / max(dist, 0.5), 0.5, 3.4);
    float twinkle = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * 2.1 + aSeed * 40.0), 2.0);
    vA = uOpacity * twinkle * smoothstep(0.5, 1.8, dist);
    vSeed = aSeed;
  }
`;

const PLANKTON_FRAG = /* glsl */`
  varying float vA;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = (1.0 - smoothstep(0.0, 0.5, d)) * vA;
    vec3 col = mix(vec3(0.55, 1.0, 0.62), vec3(0.55, 0.92, 0.88), fract(vSeed * 5.1));
    gl_FragColor = vec4(col, a * 0.85);
  }
`;

const BIOLUM_VERT = /* glsl */`
  uniform vec3 uCam;
  uniform float uTime;
  uniform float uBox;
  uniform float uPixel;
  uniform float uOpacity;
  attribute vec3 aRand;
  attribute float aSize;
  attribute float aSeed;
  varying float vA;
  varying float vSeed;
  void main() {
    vec3 p = aRand * uBox;
    p.y += uTime * (0.035 + aSeed * 0.05);
    p.x += sin(uTime * 0.22 + aSeed * 18.0) * 0.9;
    p.z += cos(uTime * 0.18 + aSeed * 12.0) * 0.9;
    p = uCam + (fract((p - uCam + 0.5 * uBox) / uBox) - 0.5) * uBox;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    float big = step(0.9, aSeed);
    gl_PointSize = clamp((aSize + big * 1.9) * 30.0 * uPixel / max(dist, 0.6), 0.5, 6.5);
    float pulse = pow(0.5 + 0.5 * sin(uTime * 0.8 + aSeed * 55.0), 4.0);
    vA = uOpacity * (0.25 + 0.75 * pulse) * smoothstep(0.6, 2.0, dist);
    vSeed = aSeed;
  }
`;

const BIOLUM_FRAG = /* glsl */`
  varying float vA;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.0, 0.24, d);
    float glow = 1.0 - smoothstep(0.0, 0.5, d);
    vec3 col = mix(vec3(0.15, 0.95, 0.95), vec3(0.2, 0.55, 1.0), fract(vSeed * 6.3));
    gl_FragColor = vec4(col, (core + glow * 0.4) * vA);
  }
`;

const BUBBLE_VERT = /* glsl */`
  uniform float uPixel;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSeed;
  varying float vA;
  varying float vSeed;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    gl_PointSize = clamp(aSize * 78.0 * uPixel / max(dist, 0.5), 1.0, 26.0);
    vA = aAlpha * smoothstep(0.35, 1.4, dist);
    vSeed = aSeed;
  }
`;

const BUBBLE_FRAG = /* glsl */`
  varying float vA;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r = length(c);
    if (r > 1.0) discard;
    float rim = smoothstep(0.55, 0.93, r) * (1.0 - smoothstep(0.93, 1.0, r));
    float spec = (1.0 - smoothstep(0.0, 0.34, length(c - vec2(-0.26, 0.3)))) * 0.9;
    float body = (1.0 - smoothstep(0.35, 1.0, r)) * 0.09;
    float a = (rim * 0.55 + spec + body) * vA;
    vec3 col = mix(vec3(0.62, 0.9, 0.92), vec3(0.92, 0.99, 0.99), fract(vSeed * 4.1));
    gl_FragColor = vec4(col, a);
  }
`;

const SHAFT_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vW;
  varying float vSeed;
  attribute float aSeed;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SHAFT_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vW;
  varying float vSeed;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    float u = clamp(vUv.x, 0.0, 1.0);
    float v = clamp(vUv.y, 0.0, 1.0);
    // cosine taper across the full ribbon width — no visible plane edges
    float edge = pow(sin(u * 3.14159265), 1.55);
    // fade at the surface and dissolve toward the bottom of the shaft
    float vert = smoothstep(0.0, 0.26, v) * (1.0 - smoothstep(0.34, 0.98, v));
    // slow noise breakup so it reads as a volume, not a rectangle
    float n1 = noise(vec2(u * 7.0 + vSeed * 11.0, v * 22.0 - uTime * 0.09));
    float n2 = noise(vec2(u * 17.0 - vSeed * 4.0, v * 9.0 + uTime * 0.05));
    float breakup = smoothstep(0.18, 0.82, n1 * 0.65 + n2 * 0.5);
    float stripe = 0.55 + 0.45 * sin(u * 34.0 + vSeed * 17.0 + v * 5.0 + uTime * 0.25);
    float shaft = edge * vert * (0.28 + 0.72 * breakup) * (0.72 + 0.28 * stripe);
    // world-space height fade keeps the bottom of the shafts from cutting a line
    float heightFade = smoothstep(-58.0, -36.0, vW.y);
    shaft *= heightFade;
    gl_FragColor = vec4(uColor, shaft * uOpacity * 0.115);
  }
`;

const CAUSTIC_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CAUSTIC_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;

  float caustic(vec2 p, float t) {
    vec2 i = p;
    float c = 0.0;
    const float inten = 0.0035;
    for (int n = 0; n < 3; n++) {
      float tt = t * 0.42 + float(n) * 1.7;
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c /= 3.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 7.0), 0.0, 1.0);
  }

  void main() {
    vec2 c = vUv - 0.5;
    float radial = 1.0 - smoothstep(0.18, 0.5, length(c));
    float cst = caustic(vUv * 26.0 + vec2(uTime * 0.04, -uTime * 0.03), uTime);
    gl_FragColor = vec4(vec3(0.55, 0.92, 0.82), cst * radial * uOpacity * 0.26);
  }
`;

/** Ambient point cloud that wraps around the camera (marine snow). */
function makeWrapPoints({ count, box, fall, sizeMin, sizeMax, vert, frag, uniforms, blending, seed }) {
  const rand = mulberry32(seed);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const aRand = new Float32Array(count * 3);
  const aSize = new Float32Array(count);
  const aSeed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    aRand[i * 3] = rand();
    aRand[i * 3 + 1] = rand();
    aRand[i * 3 + 2] = rand();
    aSize[i] = sizeMin + rand() * (sizeMax - sizeMin);
    aSeed[i] = rand();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(aRand, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.baseBox = box;
  return points;
}

/** Tapered crossed-ribbon light shafts. */
function buildShaftGeometry(seed) {
  const rand = mulberry32(seed);
  const positions = [];
  const uvs = [];
  const seeds = [];
  const indices = [];
  const SHAFTS = 11;
  const dir = new THREE.Vector3(-0.2, -1.0, -0.42).normalize();
  let base = 0;
  for (let s = 0; s < SHAFTS; s++) {
    const ang = rand() * Math.PI * 2;
    const radius = 8 + rand() * 40;
    const top = new THREE.Vector3(
      Math.cos(ang) * radius,
      0.4 + rand() * 2.4,
      -22 + Math.sin(ang) * radius,
    );
    const len = 40 + rand() * 30;
    const segs = 7;
    const seedV = rand();
    const topWidth = 3.5 + rand() * 6.0;
    for (let plane = 0; plane < 2; plane++) {
      const n = new THREE.Vector3(Math.cos(ang + plane * Math.PI * 0.5), 0, Math.sin(ang + plane * Math.PI * 0.5));
      const wAxis = new THREE.Vector3().crossVectors(dir, n).normalize();
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const center = top.clone().addScaledVector(dir, len * t);
        const width = topWidth * (1.0 - 0.78 * t) * (0.6 + 0.4 * Math.sin(t * 9.0 + s));
        const p1 = center.clone().addScaledVector(wAxis, width * 0.5);
        const p2 = center.clone().addScaledVector(wAxis, -width * 0.5);
        positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        uvs.push(0, t, 1, t);
        seeds.push(seedV, seedV);
      }
      for (let k = 0; k < segs; k++) {
        const a = base + k * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      base += (segs + 1) * 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createAmbience(engine, appState, ctx = {}) {
  const appRef = appState || app;
  const group = new THREE.Group();
  group.name = 'ambience';
  engine.scene.add(group);
  const rand = mulberry32(0x7f3ac1d5);
  const mobile = appRef.isMobile || Math.min(window.innerWidth, window.innerHeight) < 620;
  const qPreset = engine.qualityPreset;
  const particleScale = Math.max(0.25, Math.min(1, qPreset?.particles ?? 1));
  const lowTier = (qPreset?.tier || engine.quality) === 'low';
  const snowCount = Math.max(260, Math.round((mobile ? 900 : 2100) * particleScale));
  const plankCount = Math.max(120, Math.round((mobile ? 300 : 720) * particleScale));
  const biolumCount = Math.max(120, Math.round((mobile ? 320 : 720) * particleScale));
  const bubbleCount = Math.max(120, Math.round((mobile ? 300 : 720) * particleScale));
  const pixel = Math.min(window.devicePixelRatio || 1, lowTier ? 1 : 1.75);

  // ── marine snow ──
  const snowUniforms = {
    uCam: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uBox: { value: 82 },
    uFall: { value: 0.55 },
    uPixel: { value: pixel },
    uOpacity: { value: 0 },
  };
  const snow = makeWrapPoints({
    count: snowCount, box: 82, fall: 0.55, sizeMin: 0.12, sizeMax: 0.55,
    vert: SNOW_VERT, frag: SNOW_FRAG, uniforms: snowUniforms,
    blending: THREE.NormalBlending, seed: 0x5a0b,
  });
  snow.renderOrder = 0;
  group.add(snow);

  // ── plankton ──
  const plankUniforms = {
    uCam: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uBox: { value: 26 },
    uPixel: { value: pixel },
    uOpacity: { value: 0 },
  };
  const plankton = makeWrapPoints({
    count: plankCount, box: 26, fall: 0.16, sizeMin: 0.08, sizeMax: 0.32,
    vert: PLANKTON_VERT, frag: PLANKTON_FRAG, uniforms: plankUniforms,
    blending: THREE.AdditiveBlending, seed: 0x13c7,
  });
  plankton.renderOrder = 1;
  group.add(plankton);

  // ── deep bioluminescence ──
  const biolumUniforms = {
    uCam: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uBox: { value: 44 },
    uPixel: { value: pixel },
    uOpacity: { value: 0 },
  };
  const biolum = makeWrapPoints({
    count: biolumCount, box: 44, fall: 0, sizeMin: 0.06, sizeMax: 0.22,
    vert: BIOLUM_VERT, frag: BIOLUM_FRAG, uniforms: biolumUniforms,
    blending: THREE.AdditiveBlending, seed: 0x9f21,
  });
  biolum.renderOrder = 1;
  group.add(biolum);

  // ── bubbles ──
  const bubbGeo = new THREE.BufferGeometry();
  const bubbPos = new Float32Array(bubbleCount * 3).fill(-9999);
  const bubbSize = new Float32Array(bubbleCount);
  const bubbAlpha = new Float32Array(bubbleCount);
  const bubbSeed = new Float32Array(bubbleCount);
  const bubVel = new Float32Array(bubbleCount * 3);
  const bubLife = new Float32Array(bubbleCount);
  const bubMaxLife = new Float32Array(bubbleCount);
  bubbGeo.setAttribute('position', new THREE.BufferAttribute(bubbPos, 3).setUsage(THREE.DynamicDrawUsage));
  bubbGeo.setAttribute('aSize', new THREE.BufferAttribute(bubbSize, 1).setUsage(THREE.DynamicDrawUsage));
  bubbGeo.setAttribute('aAlpha', new THREE.BufferAttribute(bubbAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  bubbGeo.setAttribute('aSeed', new THREE.BufferAttribute(bubbSeed, 1));
  const bubUniforms = { uPixel: { value: pixel } };
  const bubMat = new THREE.ShaderMaterial({
    uniforms: bubUniforms,
    vertexShader: BUBBLE_VERT,
    fragmentShader: BUBBLE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const bubbles = new THREE.Points(bubbGeo, bubMat);
  bubbles.frustumCulled = false;
  bubbles.renderOrder = 3;
  group.add(bubbles);
  let bubCursor = 0;
  let bubAlive = 0;

  function emitBubble(x, y, z, size = 0.12, rise = 0.55) {
    // find a free slot (bounded scan) then overwrite round-robin
    let slot = -1;
    for (let n = 0; n < 24; n++) {
      const i = (bubCursor + n) % bubbleCount;
      if (bubLife[i] <= 0) { slot = i; bubCursor = i + 1; break; }
    }
    if (slot < 0) { slot = bubCursor % bubbleCount; bubCursor++; }
    const i = slot;
    bubbPos[i * 3] = x + (rand() - 0.5) * 0.16;
    bubbPos[i * 3 + 1] = y + (rand() - 0.5) * 0.14;
    bubbPos[i * 3 + 2] = z + (rand() - 0.5) * 0.16;
    bubVel[i * 3] = (rand() - 0.5) * 0.1;
    bubVel[i * 3 + 1] = rise * (0.6 + rand() * 0.8);
    bubVel[i * 3 + 2] = (rand() - 0.5) * 0.1;
    bubbSize[i] = size * (0.55 + rand() * 0.9);
    bubbSeed[i] = rand() * Math.PI * 2;
    bubLife[i] = 2.2 + rand() * 4.0;
    bubMaxLife[i] = bubLife[i];
    bubbAlpha[i] = 0;
    bubAlive++;
  }

  // ── god rays / light shafts ──
  const shaftUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uColor: { value: new THREE.Color(1.0, 0.85, 0.66) },
  };
  const shaftGeo = buildShaftGeometry(0x4d5e);
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: shaftUniforms,
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const shafts = new THREE.Mesh(shaftGeo, shaftMat);
  shafts.frustumCulled = false;
  shafts.renderOrder = -1;
  group.add(shafts);

  // ── shallow caustic dapple layer ──
  // Kept deliberately off: a flat additive plane intersects the ocean's wave
  // troughs near the surface and reads as a hard sheet. Caustics live on the
  // fish skin (see fish/material.js) instead.
  const causticUniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
  const causticMat = new THREE.ShaderMaterial({
    uniforms: causticUniforms,
    vertexShader: CAUSTIC_VERT,
    fragmentShader: CAUSTIC_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const caustic = new THREE.Mesh(new THREE.PlaneGeometry(130, 130, 1, 1), causticMat);
  caustic.rotation.x = -Math.PI / 2;
  caustic.position.y = -6.5;
  caustic.frustumCulled = false;
  caustic.renderOrder = -2;
  caustic.visible = false;
  group.add(caustic);

  const vents = [
    new THREE.Vector3(2.4, WORLD.floorY + 0.5, -13.6),
    new THREE.Vector3(-4.2, WORLD.floorY + 0.3, -11.2),
    new THREE.Vector3(6.2, WORLD.floorY + 0.6, -19.4),
    new THREE.Vector3(-1.2, WORLD.floorY + 0.2, -24.0),
  ];
  const rodTip = new THREE.Vector3(WORLD.rodPos.x, WORLD.rodPos.y + 3.0, WORLD.rodPos.z);
  let ventTimer = 0;
  let rodTimer = 0;
  let underwater = false;
  let time = 0;

  function splash(pos, strength = 1) {
    const p = pos && pos.x !== undefined ? pos : new THREE.Vector3(0, 0.05, -17);
    const n = Math.round(30 + 50 * clamp(strength, 0.2, 2));
    for (let i = 0; i < n; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = rand() * 1.4 * strength;
      emitBubble(
        p.x + Math.cos(ang) * rad,
        Math.max(-0.4, p.y - rand() * 0.7),
        p.z + Math.sin(ang) * rad,
        0.12 + rand() * 0.26,
        0.5 + rand() * 0.8,
      );
      // downward jet for the first quarter of the splash
      if (i < n * 0.35) {
        const idx = (bubCursor - 1 + bubbleCount) % bubbleCount;
        bubVel[idx * 3 + 1] = -0.8 - rand() * 1.6;
      }
    }
    if (ctx.ocean?.addRipple) ctx.ocean.addRipple(p.x, p.z, 1.3 * strength);
  }

  function bubbleBurst(pos, count = 4) {
    if (!pos) return;
    for (let i = 0; i < count; i++) {
      emitBubble(pos.x + (rand() - 0.5) * 0.5, pos.y + (rand() - 0.5) * 0.3, pos.z + (rand() - 0.5) * 0.5, 0.08 + rand() * 0.12, 0.45);
    }
  }

  function setUnderwater(v) { underwater = !!v; }

  const off = appRef.bus.on('sign:splash', (pos) => {
    splash(pos, 1.15);
  });

  function update(dt, info = {}) {
    const mode = info.mode ?? appRef.mode;
    const depth = info.depth ?? appRef.cameraDepth;
    const under = info.underwater ?? engine.camera.position.y < 0.02;
    underwater = under;
    time += dt;
    const live = mode === 'dive' || mode === 'rebound';
    const active = live && under;
    _cam.copy(engine.camera.position);

    group.visible = active;
    if (!active) {
      // keep the pool ageing out when we surface so nothing pops back in
      for (let i = 0; i < bubbleCount; i++) bubLife[i] = Math.max(0, bubLife[i] - dt * 2);
      return;
    }

    const shallow = smoothstep(0.0, 2.2, depth);
    const deep = smoothstep(48, 66, depth);

    // marine snow — denser and brighter with depth, never a blizzard
    snowUniforms.uCam.value.copy(_cam);
    snowUniforms.uTime.value = time;
    snowUniforms.uOpacity.value = (0.45 + 0.45 * smoothstep(0, 40, depth)) * shallow;
    snow.visible = true;

    // plankton — sunlit band
    plankUniforms.uCam.value.copy(_cam);
    plankUniforms.uTime.value = time;
    plankUniforms.uOpacity.value = smoothstep(1.0, 5.0, depth) * (1 - smoothstep(38, 56, depth)) * 0.9;
    plankton.visible = plankUniforms.uOpacity.value > 0.01;

    // bioluminescence — genuinely dark water only
    biolumUniforms.uCam.value.copy(_cam);
    biolumUniforms.uTime.value = time;
    biolumUniforms.uOpacity.value = smoothstep(46, 62, depth) * (0.55 + 0.45 * smoothstep(62, 80, depth));
    biolum.visible = biolumUniforms.uOpacity.value > 0.01;

    // light shafts — sunlit zone, fade with depth
    shaftUniforms.uTime.value = time;
    shaftUniforms.uOpacity.value = smoothstep(0.8, 3.0, depth) * (1 - smoothstep(18, 44, depth)) * 1.0;
    shafts.visible = shaftUniforms.uOpacity.value > 0.008;

    // shallow caustic dapple (off — see note above)
    causticUniforms.uTime.value = time;
    causticUniforms.uOpacity.value = 0;
    caustic.visible = false;

    // bubbles
    let alive = 0;
    for (let i = 0; i < bubbleCount; i++) {
      if (bubLife[i] <= 0) { if (bubbAlpha[i] !== 0) bubbAlpha[i] = 0; continue; }
      bubLife[i] -= dt;
      if (bubLife[i] <= 0) { bubbAlpha[i] = 0; continue; }
      const y = bubbPos[i * 3 + 1];
      if (y > -0.06) { bubLife[i] = 0; bubbAlpha[i] = 0; continue; }
      const wob = bubbSeed[i];
      bubVel[i * 3 + 1] += (0.28 + bubbSize[i] * 0.7) * dt;
      bubVel[i * 3 + 1] = Math.min(bubVel[i * 3 + 1], 1.9);
      bubbPos[i * 3] += (bubVel[i * 3] + Math.sin(time * 2.3 + wob) * 0.16) * dt;
      bubbPos[i * 3 + 1] += bubVel[i * 3 + 1] * dt;
      bubbPos[i * 3 + 2] += (bubVel[i * 3 + 2] + Math.cos(time * 1.9 + wob) * 0.16) * dt;
      const age = bubMaxLife[i] - bubLife[i];
      const fadeIn = Math.min(1, age * 3.5);
      const fadeOut = Math.min(1, bubLife[i] * 1.6);
      bubbAlpha[i] = fadeIn * fadeOut * 0.85;
      alive++;
    }
    bubAlive = alive;
    bubbles.visible = alive > 0;
    if (alive > 0) {
      bubbGeo.attributes.position.needsUpdate = true;
      bubbGeo.attributes.aAlpha.needsUpdate = true;
      bubbGeo.attributes.aSize.needsUpdate = true;
    }

    // vents breathe when we are near the seabed
    if (depth > 55) {
      ventTimer -= dt;
      const near = _cam.distanceTo(vents[0]) < 55 || depth > 78;
      if (near && ventTimer <= 0) {
        ventTimer = 0.11;
        for (const v of vents) {
          if (_cam.distanceTo(v) > 46) continue;
          emitBubble(v.x, v.y + 0.2, v.z, 0.1 + rand() * 0.16, 0.55 + rand() * 0.5);
        }
      }
    }

    // the seabed rod exhales a thin stream
    if (depth > 82) {
      rodTimer -= dt;
      if (rodTimer <= 0 && _cam.distanceTo(rodTip) < 26) {
        rodTimer = 0.34;
        emitBubble(rodTip.x + 0.1, rodTip.y - 0.2, rodTip.z, 0.06 + rand() * 0.08, 0.5);
      }
    }
  }

  function debugInfo() {
    return {
      snow: snowCount,
      plankton: plankCount,
      biolum: Math.round(biolumUniforms.uOpacity.value * 100),
      bubbles: bubAlive,
      shafts: shafts.visible ? +shaftUniforms.uOpacity.value.toFixed(2) : 0,
      drawCalls: engine.renderer.info.render.calls,
      qualityTier: engine.quality,
      particles: particleScale,
    };
  }

  /** Adaptive hook: point sprites are already sized in screen space, so tier
   *  changes only need the pixel-ratio uniform refreshed. */
  function setQuality(preset) {
    const q = preset || engine.qualityPreset || {};
    const px = Math.min(window.devicePixelRatio || 1, (q.tier || engine.quality) === 'low' ? 1 : 1.75);
    for (const u of [snowUniforms, plankUniforms, biolumUniforms, bubUniforms]) {
      if (u?.uPixel) u.uPixel.value = px;
    }
    return { pixel: px };
  }
  const offQuality = engine.onQuality?.((tier, preset) => setQuality(preset));

  function dispose() {
    try { offQuality?.(); } catch (err) { /* noop */ }
    off?.();
    engine.scene.remove(group);
    for (const obj of [snow, plankton, biolum, bubbles, shafts, caustic]) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  }

  return {
    update,
    splash,
    bubbleBurst,
    setUnderwater,
    setQuality,
    debugInfo,
    dispose,
    // extras
    get bubblesAlive() { return bubAlive; },
  };
}
