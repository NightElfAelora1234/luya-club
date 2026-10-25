// First-person lure rig: procedural rod blank, spinning reel, guides, braid,
// fluorocarbon leader, knot and the five lure bodies — all authored in CAMERA
// space as children of the camera, so the composition is stable at any FOV.
//
// The rod blank bends by re-sampling a cubic Bézier every frame and rebuilding
// three small dynamic tubes (blank + two grips). That costs ~350 vertices/frame
// and avoids skinned meshes, morph targets or shader hacks.

import * as THREE from 'three';
import { clamp, makeCanvas, canvasTexture, mulberry32 } from '../core/util.js';
import { leaderGauge, LURE_TYPES, LURE_BY_ID } from '../data/lures.js';

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const DEG = Math.PI / 180;

// Grip (butt) sits off-screen lower right; the blank runs forward and slightly
// left so the tip lands around 60% across, 25% down — never in the centre of
// the frame. The reel hangs just inside the bottom-right corner.
const GRIP = new THREE.Vector3(0.46, -0.565, -0.52);
const BASE_DIR = new THREE.Vector3(-0.012, 0.556, -0.83).normalize();
const BEND_VEC = new THREE.Vector3(0.01, -0.62, -0.78).normalize();
const ROD_LENGTH = 2.05;
const HANG_TARGET = new THREE.Vector3(0.27, -0.24, -1.5);

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpC = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _dummy = new THREE.Object3D();
const _grip = new THREE.Vector3();
const _tipLocal = new THREE.Vector3();
const _tipWorld = new THREE.Vector3();
const _lureLocal = new THREE.Vector3();
const _worldTmp = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Dynamic tapered tube
// ---------------------------------------------------------------------------

function buildTube(stations, radial) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(stations * radial * 3);
  const nrm = new Float32Array(stations * radial * 3);
  const idx = [];
  for (let i = 0; i < stations - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      const a = i * radial + j;
      const b = i * radial + j2;
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + j2;
      idx.push(a, b, c, b, d, c);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  geo.frustumCulled = false;

  const points = Array.from({ length: stations }, () => new THREE.Vector3());
  const radii = new Float32Array(stations);
  const tangents = Array.from({ length: stations }, () => new THREE.Vector3());
  const sides = Array.from({ length: stations }, () => new THREE.Vector3());
  const ups = Array.from({ length: stations }, () => new THREE.Vector3());
  return { geo, pos, nrm, points, radii, tangents, sides, ups, stations, radial };
}

function updateTube(tube, curveFn, radiusFn, side = 'camera') {
  const { stations, radial, points, radii, tangents, sides, ups, pos, nrm } = tube;
  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    curveFn(t, points[i]);
    radii[i] = radiusFn(t);
  }
  for (let i = 0; i < stations; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(stations - 1, i + 1)];
    tangents[i].subVectors(b, a).normalize();
    // Stable side vector: use the camera's x axis projected perpendicular.
    if (side === 'camera') _tmpA.set(1, 0, 0);
    else _tmpA.set(0, 1, 0);
    _tmpB.copy(_tmpA).addScaledVector(tangents[i], -_tmpA.dot(tangents[i]));
    if (_tmpB.lengthSq() < 1e-6) _tmpB.set(0, 0, 1).addScaledVector(tangents[i], -tangents[i].z);
    sides[i].copy(_tmpB).normalize();
    ups[i].crossVectors(tangents[i], sides[i]).normalize();
  }
  for (let i = 0; i < stations; i++) {
    const p = points[i];
    const s = sides[i];
    const u = ups[i];
    const r = radii[i];
    for (let j = 0; j < radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const cx = Math.cos(ang), sx = Math.sin(ang);
      const k = (i * radial + j) * 3;
      pos[k] = p.x + (s.x * cx + u.x * sx) * r;
      pos[k + 1] = p.y + (s.y * cx + u.y * sx) * r;
      pos[k + 2] = p.z + (s.z * cx + u.z * sx) * r;
      nrm[k] = s.x * cx + u.x * sx;
      nrm[k + 1] = s.y * cx + u.y * sx;
      nrm[k + 2] = s.z * cx + u.z * sx;
    }
  }
  tube.geo.attributes.position.needsUpdate = true;
  tube.geo.attributes.normal.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Screen-space line ribbon (1–2 px wide at any distance)
// ---------------------------------------------------------------------------

function buildRibbon(stations) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(stations * 2 * 3);
  const idx = [];
  for (let i = 0; i < stations - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.setDrawRange(0, (stations - 1) * 6);
  geo.frustumCulled = false;
  return { geo, pos, stations };
}

function updateRibbon(ribbon, points, pixelWidth, fovDeg, screenH, camSpace = true) {
  const { stations, pos } = ribbon;
  const tanHalf = Math.tan(fovDeg * 0.5 * DEG);
  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const p = samplePolyline(points, t, _tmpC);
    const pNext = samplePolyline(points, Math.min(1, t + 0.02), _tmpB);
    const tan = _tmpA.subVectors(pNext, p);
    if (tan.lengthSq() < 1e-9) tan.set(0, 0, -1);
    tan.normalize();
    const dist = camSpace ? Math.max(0.05, -p.z) : Math.max(0.05, p.length());
    const width = Math.max(0.0004, pixelWidth * (2 * tanHalf * dist) / Math.max(1, screenH));
    const side = _tmpB.crossVectors(tan, camSpace ? p : _worldTmp.copy(p).normalize());
    if (side.lengthSq() < 1e-9) side.set(0, 1, 0);
    side.normalize().multiplyScalar(width * 0.5);
    const k = i * 6;
    pos[k] = p.x - side.x; pos[k + 1] = p.y - side.y; pos[k + 2] = p.z - side.z;
    pos[k + 3] = p.x + side.x; pos[k + 4] = p.y + side.y; pos[k + 5] = p.z + side.z;
  }
  ribbon.geo.attributes.position.needsUpdate = true;
}

// points is a flat array of Vector3; sample by normalized t.
function samplePolyline(points, t, out) {
  const n = points.length;
  if (n === 0) return out.set(0, 0, 0);
  const f = clamp(t) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const k = f - i;
  if (n === 1) return out.copy(points[0]);
  return out.lerpVectors(points[i], points[i + 1], k);
}

// ---------------------------------------------------------------------------
// Materials / textures
// ---------------------------------------------------------------------------

function speckleTexture(base = '#1d1c1a', flecks = 'rgba(214,204,180,0.22)') {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    const a = 0.04 + Math.random() * 0.16;
    g.fillStyle = `rgba(${180 + Math.random() * 60 | 0},${170 + Math.random() * 60 | 0},${150 + Math.random() * 50 | 0},${a})`;
    const s = Math.random() < 0.85 ? 1 : 2;
    g.fillRect(x, y, s, s);
  }
  g.fillStyle = flecks;
  for (let i = 0; i < 60; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
  const tex = canvasTexture(c, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createMaterials(rod) {
  const blankColor = new THREE.Color(rod?.color ?? 0x1b2b30);
  return {
    blank: new THREE.MeshStandardMaterial({
      color: blankColor.clone().multiplyScalar(1.05),
      metalness: 0.5, roughness: 0.28, envMapIntensity: 1.7,
      emissive: new THREE.Color(0x061215), emissiveIntensity: 0.7,
    }),
    seat: new THREE.MeshStandardMaterial({
      color: 0x14181a, metalness: 0.75, roughness: 0.3,
    }),
    grip: new THREE.MeshStandardMaterial({
      map: speckleTexture(),
      color: 0x9a958c, roughness: 0.88, metalness: 0.05,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: new THREE.Color(rod?.accent ?? 0xd9a86c), metalness: 1.0, roughness: 0.26, envMapIntensity: 1.6,
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x232a2b, metalness: 0.7, roughness: 0.34, envMapIntensity: 1.4 }),
    spool: new THREE.MeshStandardMaterial({ color: 0xb9b3a4, metalness: 0.95, roughness: 0.24, envMapIntensity: 1.7 }),
    mono: new THREE.MeshBasicMaterial({
      color: 0xc8d4c4, transparent: true, opacity: 0.6, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: true,
    }),
    knot: new THREE.MeshBasicMaterial({ color: 0xe8dcc0 }),
  };
}

// ---------------------------------------------------------------------------
// Lure bodies — five procedural baits built once at rig init.
//
// Conventions: nose points to +Z, dorsal is +Y, the body is centred on z = 0.
// Every bait is authored from small parametric surfaces and then merged per
// material, so a complete lure costs only 2–5 draw calls. Shared paint, metal,
// eye, foil, feather and silicone materials keep shader variants down; all five
// groups are built during createRodRig() and compiled by the boot prewarm.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

// ---- shared procedural texture / environment family -----------------------

let lureAssets = null;

// A tiny hand-painted sunset used only as an environment map for the lures.
// Without it metal, foil and clearcoat have nothing to reflect and read flat.
function makeLureEnv(engine) {
  const c = makeCanvas(256, 128);
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 66);
  sky.addColorStop(0, '#0b2a36');
  sky.addColorStop(0.45, '#2f6f78');
  sky.addColorStop(0.78, '#c68a5e');
  sky.addColorStop(1, '#ffd9a4');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 66);
  const sun = g.createRadialGradient(172, 48, 1, 172, 48, 44);
  sun.addColorStop(0, 'rgba(255,248,225,1)');
  sun.addColorStop(0.22, 'rgba(255,224,168,0.85)');
  sun.addColorStop(1, 'rgba(255,200,140,0)');
  g.fillStyle = sun;
  g.fillRect(126, 2, 92, 66);
  g.fillStyle = 'rgba(30,60,76,0.32)';
  for (let i = 0; i < 9; i++) g.fillRect(0, 12 + i * 5, 256, 1 + (i % 2));
  const sea = g.createLinearGradient(0, 66, 0, 128);
  sea.addColorStop(0, '#1a4c58');
  sea.addColorStop(0.35, '#0b2831');
  sea.addColorStop(1, '#031016');
  g.fillStyle = sea;
  g.fillRect(0, 66, 256, 62);
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    g.fillStyle = `rgba(255,${208 + Math.round(t * 26)},${156 + Math.round(t * 34)},${(0.22 * (1 - t) + 0.03).toFixed(3)})`;
    const w = 20 - t * 14;
    g.fillRect(172 - w * 0.5 + Math.sin(i * 1.7) * 3, 66 + t * 56, w, 1.5);
  }
  const tex = canvasTexture(c, { srgb: true });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(engine.renderer);
  if (pmrem.compileEquirectangularShader) pmrem.compileEquirectangularShader();
  const rt = pmrem.fromEquirectangular(tex);
  tex.dispose();
  pmrem.dispose();
  return rt.texture;
}

// Fine overlapping scales, deliberately low contrast: the lure's paint colour
// comes from vertex colours, this map only adds the "made of scales" read and
// breaks up the clearcoat highlight.
function makeScaleTexture(engine) {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#d8d4c6';
  g.fillRect(0, 0, 256, 256);
  const rng = mulberry32(0x1a2b3c);
  for (let row = -1; row < 34; row++) {
    const y = row * 8;
    const off = (row % 2) * 8;
    for (let col = -1; col < 18; col++) {
      const x = col * 16 + off;
      const a = 0.10 + rng() * 0.10;
      g.strokeStyle = `rgba(255,255,250,${a.toFixed(3)})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(x + 8, y, 9, Math.PI * 0.08, Math.PI * 0.92);
      g.stroke();
      g.strokeStyle = `rgba(24,32,30,${(a * 0.55).toFixed(3)})`;
      g.beginPath();
      g.arc(x + 8, y + 1.4, 9, Math.PI * 0.10, Math.PI * 0.90);
      g.stroke();
    }
  }
  for (let i = 0; i < 1400; i++) {
    const v = 200 + Math.floor(rng() * 55);
    g.fillStyle = `rgba(${v},${v},${v - 6},${(0.04 + rng() * 0.08).toFixed(3)})`;
    g.fillRect(rng() * 256, rng() * 256, 1, 1);
  }
  const tex = canvasTexture(c, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (engine?.renderer) tex.anisotropy = Math.min(8, engine.renderer.capabilities.getMaxAnisotropy());
  return tex;
}

// Holographic foil: pale metal with a full-hue shimmer and fine facets.
function makeFoilTexture(engine) {
  const c = makeCanvas(256, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1e8';
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x++) {
    const h = (x / 256) * 360;
    const l = 64 + Math.sin((x / 256) * TAU * 3) * 9;
    g.fillStyle = `hsla(${h}, 70%, ${l}%, 0.34)`;
    g.fillRect(x, 0, 1, 128);
  }
  const rng = mulberry32(0x77a9);
  for (let i = 0; i < 240; i++) {
    const x = rng() * 256;
    const y = rng() * 128;
    g.strokeStyle = `rgba(255,255,255,${(0.12 + rng() * 0.36).toFixed(3)})`;
    g.lineWidth = 0.6 + rng();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 6 + rng() * 16, y + 2 + rng() * 4);
    g.stroke();
  }
  for (let i = 0; i < 320; i++) {
    const v = 232 + Math.floor(rng() * 23);
    g.fillStyle = `rgba(${v},${v},255,${(0.2 + rng() * 0.5).toFixed(3)})`;
    g.fillRect(rng() * 256, rng() * 128, 1, 1);
  }
  const tex = canvasTexture(c, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (engine?.renderer) tex.anisotropy = Math.min(8, engine.renderer.capabilities.getMaxAnisotropy());
  return tex;
}

function lureMaterials(engine) {
  if (lureAssets) return lureAssets;
  const tex = { scale: makeScaleTexture(engine), foil: makeFoilTexture(engine) };
  const env = makeLureEnv(engine);
  const M = {
    // painted hard bait: satin lacquer, scale map, colour from vertices
    paint: new THREE.MeshPhysicalMaterial({
      map: tex.scale, vertexColors: true, color: 0xffffff,
      metalness: 0.14, roughness: 0.36,
      clearcoat: 1, clearcoatRoughness: 0.045,
      envMap: env, envMapIntensity: 1.15, side: THREE.DoubleSide,
    }),
    // painted metal jig: same vertex paint, much more metallic
    paintMetal: new THREE.MeshPhysicalMaterial({
      map: tex.scale, vertexColors: true, color: 0xffffff,
      metalness: 0.86, roughness: 0.26,
      clearcoat: 0.7, clearcoatRoughness: 0.12,
      envMap: env, envMapIntensity: 1.55, side: THREE.DoubleSide,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0xd6dcd8, metalness: 1, roughness: 0.26,
      envMap: env, envMapIntensity: 1.8,
    }),
    // cast lead: matte grey, no chrome, used for the jighead
    lead: new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0xffffff, metalness: 0.55, roughness: 0.5,
      envMap: env, envMapIntensity: 0.6,
    }),
    eye: new THREE.MeshPhysicalMaterial({
      vertexColors: true, metalness: 0.1, roughness: 0.05,
      clearcoat: 1, clearcoatRoughness: 0.02,
      envMap: env, envMapIntensity: 1.5,
    }),
    foil: new THREE.MeshPhysicalMaterial({
      map: tex.foil, vertexColors: true, color: 0xffffff,
      metalness: 0.8, roughness: 0.18,
      emissive: 0xffffff, emissiveMap: tex.foil, emissiveIntensity: 0.22,
      clearcoat: 1, clearcoatRoughness: 0.03,
      envMap: env, envMapIntensity: 2.1, side: THREE.DoubleSide,
    }),
    clear: new THREE.MeshPhysicalMaterial({
      color: 0xdff0e6, metalness: 0.0, roughness: 0.03,
      transparent: true, opacity: 0.3, depthWrite: false, forceSinglePass: true,
      envMap: env, envMapIntensity: 1.8,
      clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide,
    }),
    feather: new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0xffffff, metalness: 0.0, roughness: 0.72,
      side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.35,
    }),
    silicone: new THREE.MeshPhysicalMaterial({
      vertexColors: true, color: 0xffffff, metalness: 0.02, roughness: 0.6,
      clearcoat: 0.3, clearcoatRoughness: 0.28,
      envMap: env, envMapIntensity: 0.55,
      transparent: true, opacity: 0.9, side: THREE.DoubleSide, forceSinglePass: true,
    }),
    soft: new THREE.MeshPhysicalMaterial({
      vertexColors: true, color: 0xffffff, metalness: 0.0, roughness: 0.26,
      clearcoat: 0.8, clearcoatRoughness: 0.14,
      envMap: env, envMapIntensity: 0.85,
      transparent: true, opacity: 0.84, side: THREE.DoubleSide, forceSinglePass: true,
    }),
  };
  lureAssets = { M, tex, env };
  return lureAssets;
}

// ---- small geometry utilities --------------------------------------------

function smoothKeys(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i];
      const [t1, v1] = keys[i + 1];
      if (t <= t1) {
        const u = clamp((t - t0) / Math.max(1e-6, t1 - t0));
        const e = u * u * (3 - 2 * u);
        return v0 + (v1 - v0) * e;
      }
    }
    return keys[keys.length - 1][1];
  };
}

function composeMatrix(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(scale[0], scale[1], scale[2]),
  );
}

function prepGeo(geo, matrix, color) {
  let g = geo;
  if (g.index) g = g.toNonIndexed();
  if (matrix) g.applyMatrix4(matrix);
  if (!g.attributes.normal) g.computeVertexNormals();
  const count = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  if (!g.attributes.color) {
    const col = color == null ? new THREE.Color(0xffffff) : new THREE.Color(color);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

// Merge parts that share one material into a single draw call. Parts may carry
// their own vertex colours (the painted body) or a flat colour.
function mergeParts(parts) {
  const geos = [];
  let total = 0;
  for (const part of parts) {
    if (!part || !part.geo) continue;
    const g = prepGeo(part.geo, part.matrix, part.color);
    geos.push(g);
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    col.set(g.attributes.color.array, o * 3);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

function lureMesh(geo, mat, name) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = false;
  m.receiveShadow = false;
  m.frustumCulled = false;
  return m;
}

function triCount(geo) {
  const n = geo?.index ? geo.index.count : (geo?.attributes?.position?.count || 0);
  return n / 3;
}

// ---- organic body surface -------------------------------------------------

// Elliptical cross-sections swept along +Z with a shared seam vertex pair at
// the bottom (so the scale texture tiles without a mirror stripe on the flank).
// profile(t) -> { rx, ry, cx, cy } with t = 0 at the tail, 1 at the nose.
function makeBody({
  length, stations = 20, radial = 16, profile,
  color, capTail = true, capNose = true,
  uvRepeatX = 2, uvRepeatV = 3.4, angleOffset = -Math.PI * 0.5,
}) {
  const ringN = radial + 1;
  const pos = [], uvs = [], cols = [], idx = [];
  const tmp = new THREE.Color();
  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const pr = profile(t);
    const rx = Math.max(1e-6, pr.rx);
    const ry = Math.max(1e-6, pr.ry);
    const cx = pr.cx || 0;
    const cy = pr.cy || 0;
    const z = (t - 0.5) * length;
    for (let j = 0; j <= radial; j++) {
      const a = angleOffset + (j / radial) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = cx + rx * ca;
      const y = cy + ry * sa;
      pos.push(x, y, z);
      uvs.push((j / radial) * uvRepeatX, t * uvRepeatV);
      if (color) {
        color(t, a, x, y, z, tmp);
        cols.push(tmp.r, tmp.g, tmp.b);
      }
    }
  }
  for (let i = 0; i < stations - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ringN + j;
      const b = a + 1;
      const c = (i + 1) * ringN + j;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const addPole = (t, z, capTailWinding) => {
    const pr = profile(t);
    const pole = pos.length / 3;
    const px = pr.cx || 0;
    const py = pr.cy || 0;
    pos.push(px, py, z);
    uvs.push(0.5, t * uvRepeatV);
    if (color) {
      color(t, angleOffset, px, py, z, tmp);
      cols.push(tmp.r, tmp.g, tmp.b);
    }
    const base = Math.round((t === 0 ? 0 : stations - 1)) * ringN;
    for (let j = 0; j < radial; j++) {
      const a = base + j;
      const b = base + j + 1;
      if (capTailWinding) idx.push(a, pole, b);
      else idx.push(a, b, pole);
    }
  };
  if (capTail) addPole(0, -length * 0.5 - length * 0.004, true);
  if (capNose) addPole(1, length * 0.5 + length * 0.004, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  if (color) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // average the duplicated seam normals so the flank shading is continuous
  const nrm = geo.attributes.normal;
  for (let i = 0; i < stations; i++) {
    const a = i * ringN;
    const b = i * ringN + radial;
    const nx = nrm.getX(a) + nrm.getX(b);
    const ny = nrm.getY(a) + nrm.getY(b);
    const nz = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l);
    nrm.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return geo;
}

// Swept tapered tube through a list of points, used for hooks, wires, hackle.
function sweepTube(points, radial, radiusFn) {
  const n = points.length;
  if (n < 2) return new THREE.BufferGeometry();
  const frames = [];
  let prevSide = null;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const tangent = new THREE.Vector3().subVectors(b, a).normalize();
    let side;
    if (prevSide) {
      side = prevSide.clone().addScaledVector(tangent, -prevSide.dot(tangent));
      if (side.lengthSq() < 1e-9) side = new THREE.Vector3(1, 0, 0).addScaledVector(tangent, -tangent.x);
    } else {
      side = Math.abs(tangent.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      side.addScaledVector(tangent, -side.dot(tangent));
    }
    side.normalize();
    const up = new THREE.Vector3().crossVectors(tangent, side).normalize();
    frames.push({ p, side, up });
    prevSide = side;
  }
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i < n; i++) {
    const { p, side, up } = frames[i];
    const r = Math.max(0.00004, radiusFn(i / (n - 1), i));
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * TAU;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      pos.push(
        p.x + (side.x * ca + up.x * sa) * r,
        p.y + (side.y * ca + up.y * sa) * r,
        p.z + (side.z * ca + up.z * sa) * r,
      );
      uvs.push(j / radial, i / (n - 1));
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + 1;
      const c = (i + 1) * (radial + 1) + j;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Flattened swept paddle: a solid, rounded ribbon for the soft-plastic curl
// tail. `widthFn` runs across the face, `thickness` across the edge.
function sweepPaddle(points, { radial = 8, widthFn, thickness = 0.001, colorFn }) {
  const n = points.length;
  if (n < 2) return new THREE.BufferGeometry();
  const frames = [];
  let prevSide = null;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const tangent = new THREE.Vector3().subVectors(b, a).normalize();
    let side;
    if (prevSide) {
      side = prevSide.clone().addScaledVector(tangent, -prevSide.dot(tangent));
      if (side.lengthSq() < 1e-9) side = new THREE.Vector3(1, 0, 0).addScaledVector(tangent, -tangent.x);
    } else {
      side = Math.abs(tangent.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      side.addScaledVector(tangent, -side.dot(tangent));
    }
    side.normalize();
    const up = new THREE.Vector3().crossVectors(tangent, side).normalize();
    frames.push({ p, side, up });
    prevSide = side;
  }
  const pos = [], uvs = [], cols = [], idx = [];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const { p, side, up } = frames[i];
    const t = i / (n - 1);
    const w = Math.max(0.0002, widthFn(t));
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * TAU;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      pos.push(
        p.x + (side.x * ca * w + up.x * sa * thickness),
        p.y + (side.y * ca * w + up.y * sa * thickness),
        p.z + (side.z * ca * w + up.z * sa * thickness),
      );
      uvs.push(j / radial, t);
      if (colorFn) {
        colorFn(t, c);
        cols.push(c.r, c.g, c.b);
      }
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + 1;
      const cc = (i + 1) * (radial + 1) + j;
      const d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  if (colorFn) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function curvePoints(pts, samples) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  return curve.getPoints(Math.max(2, samples));
}

// ---- eyes, hooks, rings, fins, hackle -------------------------------------

// A real 3D bait eye: sunken dark socket, pale sclera, domed amber iris,
// black pupil and a tiny catch-light bead. Built facing +Z, then oriented.
function addEyeAssembly(eyeParts, { pos, dir, r }) {
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const pose = new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]).addScaledVector(d, -r * 0.22),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d),
    new THREE.Vector3(1, 1, 1),
  );
  const add = (geo, localPos, localScale, color) => {
    const local = composeMatrix(localPos, [0, 0, 0], localScale);
    eyeParts.push({
      geo,
      matrix: new THREE.Matrix4().multiplyMatrices(pose, local),
      color,
    });
  };
  // dark eyeball base, gold iris ring, black pupil, tiny catch-light
  add(new THREE.SphereGeometry(r * 1.22, 10, 6), [0, 0, -r * 0.32], [1, 1, 0.3], 0x0e1312);
  add(new THREE.SphereGeometry(r, 12, 9), [0, 0, 0], [1, 1, 1], 0x1a1c18);
  add(new THREE.TorusGeometry(r * 0.47, r * 0.085, 4, 14), [0, 0, r * 0.84], [1, 1, 1], 0xc79a3c);
  add(new THREE.SphereGeometry(r * 0.48, 10, 7), [0, 0, r * 0.9], [1, 1, 0.5], 0x05080a);
  add(new THREE.SphereGeometry(r * 0.09, 6, 5), [r * 0.16, r * 0.17, r * 0.99], [1, 1, 1], 0xffffff);
}

function addEyePair(eyeParts, { x, y, z, r }) {
  for (const sx of [-1, 1]) {
    addEyeAssembly(eyeParts, {
      pos: [sx * x, y, z],
      dir: [sx * 0.94, 0.1, 0.24],
      r,
    });
  }
}

// Classic 3-prong treble: eye, shank, three curved prongs with tapered points.
function trebleParts(parts, { pos = [0, 0, 0], rot = [0, 0, 0], size = 1.7, spin = 0 }) {
  const u = 0.0012 * size;
  const matrix = composeMatrix(pos, rot, [1, 1, 1]);
  const wire = (f) => u * (0.62 - 0.5 * Math.pow(f, 0.75));
  const add = (geo) => parts.push({ geo, matrix: matrix.clone(), color: 0xdfe6e2 });

  const eye = new THREE.TorusGeometry(u * 1.5, u * 0.4, 4, 10);
  eye.rotateY(Math.PI * 0.5);
  add(eye);

  const shank = curvePoints([
    new THREE.Vector3(0, -u * 0.25, 0),
    new THREE.Vector3(0, -u * 2.2, 0),
    new THREE.Vector3(0, -u * 4.3, 0),
  ], 4);
  add(sweepTube(shank, 5, wire));

  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * TAU + Math.PI * 0.5 + spin;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const pts = [
      new THREE.Vector3(0, -u * 3.5, 0),
      new THREE.Vector3(dx * u * 1.0, -u * 6.1, dz * u * 1.0),
      new THREE.Vector3(dx * u * 2.7, -u * 6.5, dz * u * 2.7),
      new THREE.Vector3(dx * u * 3.65, -u * 5.2, dz * u * 3.65),
      new THREE.Vector3(dx * u * 3.7, -u * 2.9, dz * u * 3.7),
    ];
    const curve = curvePoints(pts, 9);
    add(sweepTube(curve, 5, (f) => wire(f * 0.92)));
  }
}

function addSplitRing(parts, { pos, rot = [0, Math.PI * 0.5, 0], radius = 0.0045, tube = 0.00085 }) {
  const geo = new THREE.TorusGeometry(radius, tube, 5, 14);
  parts.push({ geo, matrix: composeMatrix(pos, rot), color: 0xdfe6e2 });
}

function addEyelet(parts, { pos, rot = [0, Math.PI * 0.5, 0], radius = 0.0028 }) {
  const geo = new THREE.TorusGeometry(radius, radius * 0.26, 4, 10);
  parts.push({ geo, matrix: composeMatrix(pos, rot), color: 0xdfe6e2 });
}

// A single J-hook (offset worm hook, assist hook, trailer). `offset` jogs the
// shank sideways like an EWG worm hook.
function singleHookParts(parts, { pos = [0, 0, 0], rot = [0, 0, 0], size = 1.4, offset = 0 }) {
  const u = 0.0012 * size;
  const matrix = composeMatrix(pos, rot, [1, 1, 1]);
  const wire = (f) => u * (0.6 - 0.46 * Math.pow(f, 0.7));
  const add = (geo) => parts.push({ geo, matrix: matrix.clone(), color: 0xdfe6e2 });

  const eye = new THREE.TorusGeometry(u * 1.4, u * 0.38, 4, 10);
  eye.rotateY(Math.PI * 0.5);
  add(eye);

  const pts = [
    new THREE.Vector3(0, -u * 0.3, 0),
    new THREE.Vector3(0, -u * 4.6, 0),
    new THREE.Vector3(offset > 0 ? u * 1.1 : 0, -u * 6.4, offset > 0 ? u * 0.4 : 0),
    new THREE.Vector3(offset > 0 ? u * 1.1 : 0, -u * 7.2, -u * 3.1),
    new THREE.Vector3(0, -u * 6.2, -u * 5.4),
    new THREE.Vector3(0, -u * 3.4, -u * 4.9),
    new THREE.Vector3(0, -u * 2.6, -u * 3.5),
  ];
  add(sweepTube(curvePoints(pts, 14), 5, wire));
}

// Flat scalloped fin built as a triangle fan bent gently out of plane.
function addFin(parts, { origin, dir, side, size, outline, color, edge, bend = 0 }) {
  const o = new THREE.Vector3(origin[0], origin[1], origin[2]);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const s = new THREE.Vector3(side[0], side[1], side[2]).normalize();
  const n = new THREE.Vector3().crossVectors(d, s).normalize();
  const c0 = new THREE.Color(color);
  const c1 = new THREE.Color(edge ?? color);
  const pos = [o.x, o.y, o.z];
  const uvs = [0.5, 0];
  const cols = [c0.r, c0.g, c0.b];
  const idx = [];
  const c = new THREE.Color();
  for (let i = 0; i < outline.length; i++) {
    const [x, y] = outline[i];
    const bendAmt = bend * size * x * x;
    pos.push(
      o.x + d.x * x * size + s.x * y * size + n.x * bendAmt,
      o.y + d.y * x * size + s.y * y * size + n.y * bendAmt,
      o.z + d.z * x * size + s.z * y * size + n.z * bendAmt,
    );
    uvs.push(clamp(x, 0, 1), clamp(y, 0, 1));
    c.copy(c0).lerp(c1, clamp(Math.hypot(x, y) * 0.9));
    cols.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < outline.length - 1; i++) idx.push(0, i + 1, i + 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  parts.push({ geo, matrix: new THREE.Matrix4(), color: null });
}

// Forked caudal fin: four triangles in the vertical plane, tinted from body
// colour at the peduncle to a lighter translucent edge at the tips.
function addTailFin(parts, { origin, length, height, bend = 0.15, color, edge }) {
  const z0 = origin[2];
  const c0 = new THREE.Color(color);
  const c1 = new THREE.Color(edge ?? color);
  const pt = (x, y, z) => [x, y, z];
  const base = pt(0, 0, z0);
  const upperLead = pt(0, height * 0.36, z0 - length * 0.3);
  const upperTip = pt(0, height, z0 - length);
  const notch = pt(0, height * 0.04, z0 - length * 0.5);
  const lowerTip = pt(0, -height, z0 - length);
  const lowerLead = pt(0, -height * 0.36, z0 - length * 0.3);
  const verts = [base, upperLead, upperTip, notch, lowerTip, lowerLead];
  const dist = [0, 0.36, 1, 0.5, 1, 0.36];
  const pos = [], uvs = [], cols = [], idx = [];
  const c = new THREE.Color();
  verts.forEach((v, i) => {
    const d = Math.hypot(v[1], z0 - v[2]);
    const x = bend * height * (d / Math.max(1e-5, height)) * (v[1] < 0 ? -0.55 : 1);
    pos.push(x, v[1], v[2]);
    uvs.push(0.5 + x, dist[i]);
    c.copy(c0).lerp(c1, Math.min(1, dist[i] * 1.1));
    cols.push(c.r, c.g, c.b);
  });
  idx.push(0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  parts.push({ geo, matrix: new THREE.Matrix4(), color: null });
}

// Ribbon strip along a 3D path (hackle, skirt strands, soft curl tail).
function makeRibbon({ points, sideHint, widths, colors, taperTip = true }) {
  const n = points.length;
  const pos = [], uvs = [], cols = [], idx = [];
  const side = new THREE.Vector3(sideHint[0], sideHint[1], sideHint[2]).normalize();
  const c0 = colors?.[0] ? new THREE.Color(colors[0]) : new THREE.Color(0xffffff);
  const c1 = colors?.[1] ? new THREE.Color(colors[1]) : c0.clone();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const tan = new THREE.Vector3().subVectors(b, a).normalize();
    const s = side.clone().addScaledVector(tan, -side.dot(tan));
    if (s.lengthSq() < 1e-9) s.set(1, 0, 0);
    s.normalize();
    const w = Math.max(0.00015, widths(i / (n - 1)));
    c.copy(c0).lerp(c1, i / (n - 1));
    pos.push(points[i].x - s.x * w, points[i].y - s.y * w, points[i].z - s.z * w);
    pos.push(points[i].x + s.x * w, points[i].y + s.y * w, points[i].z + s.z * w);
    uvs.push(0, i / (n - 1), 1, i / (n - 1));
    cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function addHackle(parts, { origin, dir, length, count = 6, spread = 0.005, colors = [0xefe3c4], seed = 7, droop = 0.004 }) {
  const rng = mulberry32(seed);
  const o = new THREE.Vector3(origin[0], origin[1], origin[2]);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const baseColor = new THREE.Color(colors[0]);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * TAU + rng() * 0.45;
    const r = spread * (0.55 + rng() * 0.6);
    const bx = Math.cos(ang) * r;
    const by = Math.sin(ang) * r;
    const len = length * (0.72 + rng() * 0.4);
    const pts = [
      o.clone(),
      o.clone().addScaledVector(d, len * 0.34).add(new THREE.Vector3(bx * 0.4, by * 0.4 + droop * 0.3, 0)),
      o.clone().addScaledVector(d, len * 0.72).add(new THREE.Vector3(bx * 0.9, by - droop, 0)),
      o.clone().addScaledVector(d, len).add(new THREE.Vector3(bx * 1.3, by * 1.1 - droop * 1.6, 0)),
    ];
    const strandColor = i % 3 === 0 ? (colors[1] ?? baseColor) : baseColor;
    const geo = makeRibbon({
      points: curvePoints(pts, 6),
      sideHint: [Math.cos(ang + Math.PI * 0.5), Math.sin(ang + Math.PI * 0.5), 0.2],
      widths: (t) => spread * 0.16 * (1 - t * 0.88) + 0.00015,
      colors: [strandColor, strandColor],
    });
    parts.push({ geo, matrix: new THREE.Matrix4(), color: null });
  }
}

function addSkirt(parts, { origin, dir, length, count = 10, colors = [0x7f4b2a, 0x3a2214], seed = 11, width = 0.0021 }) {
  const rng = mulberry32(seed);
  const o = new THREE.Vector3(origin[0], origin[1], origin[2]);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const c0 = new THREE.Color(colors[0]);
  const c1 = new THREE.Color(colors[1]);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * TAU + rng() * 0.22;
    const r0 = 0.0036;
    const len = length * (0.72 + rng() * 0.5);
    const flare = 0.010 + rng() * 0.009;
    const sx = Math.cos(ang);
    const sy = Math.sin(ang);
    const pts = [
      o.clone().add(new THREE.Vector3(sx * r0, sy * r0, 0)),
      o.clone().add(new THREE.Vector3(sx * (r0 + flare * 0.35), sy * (r0 + flare * 0.35), 0)).addScaledVector(d, len * 0.38),
      o.clone().add(new THREE.Vector3(sx * (r0 + flare), sy * (r0 + flare), 0)).addScaledVector(d, len * 0.74),
      o.clone().add(new THREE.Vector3(sx * (r0 + flare * 1.25), sy * (r0 + flare * 1.25) - 0.0015, 0)).addScaledVector(d, len),
    ];
    const geo = makeRibbon({
      points: curvePoints(pts, 5),
      sideHint: [Math.cos(ang + Math.PI * 0.5), Math.sin(ang + Math.PI * 0.5), 0.1],
      widths: (t) => width * (1 - t * 0.5) + 0.00015,
      colors: [i % 3 === 0 ? c1.getHex() : c0.getHex(), c1.getHex()],
    });
    parts.push({ geo, matrix: new THREE.Matrix4(), color: null });
  }
}

// Popper cup: lathe the concave face and its outer rim, then squash the rim to
// the body's elliptical cross-section.
function makeCup({ rimRx, rimRy, depth, segments = 18, inner = 0x2a1410, rim = 0xc4522e, lip = 0xefe4cc }) {
  const pts = [];
  const rings = 7;
  for (let k = 0; k <= rings; k++) {
    const f = k / rings;
    // centre of the throat (deep) -> rim (at the nose), a true open bowl
    pts.push(new THREE.Vector2(Math.sin(f * Math.PI * 0.5) * 0.995 + 0.001, -depth * Math.cos(f * Math.PI * 0.5)));
  }
  pts.push(new THREE.Vector2(1.045, 0.0018));
  pts.push(new THREE.Vector2(1.09, 0.0002));
  const geo = new THREE.LatheGeometry(pts, segments);
  const count = geo.attributes.position.count;
  const col = new Float32Array(count * 3);
  const cIn = new THREE.Color(inner);
  const cRim = new THREE.Color(rim);
  const cLip = new THREE.Color(lip);
  const tmp = new THREE.Color();
  const rowN = pts.length;
  for (let i = 0; i < count; i++) {
    const row = i % rowN;
    if (row <= rings - 1) {
      const k = row / Math.max(1, rings - 1);
      const t = THREE.MathUtils.smoothstep(k, 0.78, 1);
      tmp.copy(cIn).lerp(cRim, t * 0.92);
    } else if (row === rings) {
      tmp.copy(cRim);
    } else {
      tmp.copy(cLip);
    }
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.rotateX(Math.PI * 0.5);
  geo.scale(rimRx, rimRy, 1);
  // the cup is a moulded face, not a scaled flank: pin its UVs so the body
  // scale pattern does not print a flower on the throat
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.5);
  return geo;
}

// ---- paint helpers --------------------------------------------------------

function paintFish(def, { back, side, belly, headTint, bands, mottle = 0, deepBelly = 0, gain = 0 }) {
  const cBack = new THREE.Color(back ?? def.accent);
  const cSide = new THREE.Color(side ?? def.color);
  const cBelly = new THREE.Color(belly ?? def.belly);
  const cHead = headTint != null ? new THREE.Color(headTint) : null;
  const bandList = (bands || []).map((b) => ({
    ...b,
    color: new THREE.Color(b.color),
    center: b.t,
    half: (b.width ?? 0.03) * 0.5,
    strength: b.strength ?? 0.8,
  }));
  const tmp = new THREE.Color();
  return (t, a, x, y, z, out) => {
    const sa = Math.sin(a);
    out.copy(cBelly);
    out.lerp(cSide, THREE.MathUtils.smoothstep(sa, -0.92, 0.08));
    out.lerp(cBack, THREE.MathUtils.smoothstep(sa, 0.02, 0.94));
    if (deepBelly) out.lerp(cBelly, THREE.MathUtils.smoothstep(-sa, 0.15, 0.96) * deepBelly);
    if (cHead) out.lerp(cHead, THREE.MathUtils.smoothstep(t, 0.82, 0.99) * 0.6);
    for (let i = 0; i < bandList.length; i++) {
      const b = bandList[i];
      const d = Math.abs(t - b.center);
      if (d < b.half) out.lerp(b.color, (1 - d / b.half) * b.strength);
    }
    if (mottle) {
      const n = Math.sin(t * 47 + sa * 6.3) * 0.5 + Math.sin(t * 19 - sa * 3.1) * 0.5;
      out.offsetHSL(0, 0, n * mottle);
    }
    if (gain) out.offsetHSL(0, 0, gain);
    return out;
  };
}

// Thin strip hugging one or both flanks (foil side band, lateral line).
function flankStrip({ profile, length, side, fromT, toT, span, steps = 12, outward = 1.015, offsetAngle = 0 }) {
  const pos = [], uvs = [], idx = [];
  // the body is built with x = rx*cos(a): the flanks are at a = 0 / PI
  const flankAngle = side > 0 ? 0 : Math.PI;
  const offset = (offsetAngle || 0) * side;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const t = fromT + (toT - fromT) * f;
    const pr = profile(t);
    const z = (t - 0.5) * length;
    const w = span * Math.pow(Math.sin(Math.PI * f), 0.45);
    for (let k = 0; k < 2; k++) {
      const a = flankAngle + offset + (k === 0 ? -w : w);
      const rx = pr.rx * outward;
      const ry = pr.ry * outward;
      pos.push((pr.cx || 0) + rx * Math.cos(a), (pr.cy || 0) + ry * Math.sin(a), z);
      uvs.push(k, f);
    }
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Raised gill cover flap plus the dark crease behind it.
function gillParts(parts, { profile, length, atT, color, crease }) {
  const pr = profile(atT);
  const z = (atT - 0.5) * length;
  const radial = 16;
  const cFront = new THREE.Color(color).lerp(new THREE.Color(crease), 0.16);
  const cCrease = new THREE.Color(color).lerp(new THREE.Color(crease), 0.6);
  const cRear = new THREE.Color(color).multiplyScalar(0.88);
  const rows = [
    { z: z + length * 0.003, r: 1.004, ry: 1.004, color: cFront },
    { z: z - length * 0.0005, r: 1.014, ry: 1.016, color: cCrease },
    { z: z - length * 0.0075, r: 1.0, ry: 1.002, color: cRear },
  ];
  const pos = [], uvs = [], cols = [], idx = [];
  const c = new THREE.Color();
  for (const row of rows) {
    for (let j = 0; j <= radial; j++) {
      const a = -Math.PI * 0.5 + (j / radial) * TAU;
      pos.push(
        (pr.cx || 0) + pr.rx * row.r * Math.cos(a),
        (pr.cy || 0) + pr.ry * row.ry * Math.sin(a),
        row.z,
      );
      uvs.push(j / radial, 0.5);
      c.copy(row.color);
      cols.push(c.r, c.g, c.b);
    }
  }
  const ringN = radial + 1;
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ringN + j;
      const b = a + 1;
      const cc = (i + 1) * ringN + j;
      const d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  parts.push({ geo, matrix: new THREE.Matrix4(), color: null });
}

// Translucent diving lip pressed into the underside of a minnow's nose.
function makeLipGeometry({ width, length, thickness, color }) {
  const s = new THREE.Shape();
  const hw = width * 0.5;
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  s.quadraticCurveTo(hw * 0.98, length * 0.62, hw * 0.62, length * 0.94);
  s.quadraticCurveTo(0, length * 1.04, -hw * 0.62, length * 0.94);
  s.quadraticCurveTo(-hw * 0.98, length * 0.62, -hw, 0);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: thickness, bevelEnabled: true, bevelSize: thickness * 0.5,
    bevelThickness: thickness * 0.5, bevelSegments: 1, curveSegments: 5,
  });
  geo.rotateX(Math.PI * 0.5);
  geo.translate(0, 0, 0);
  return geo;
}

// ---- the five baits -------------------------------------------------------

function buildMinnow(def, M) {
  const partsBody = [], partsFoil = [], partsMetal = [], partsEye = [];
  const L = 0.094;
  const profile = (t) => {
    const f = smoothKeys([
      [0, 0.34], [0.08, 0.48], [0.2, 0.8], [0.36, 0.97],
      [0.52, 1.0], [0.66, 0.93], [0.78, 0.8], [0.87, 0.58],
      [0.93, 0.34], [0.97, 0.14], [1, 0.045],
    ])(t);
    const head = THREE.MathUtils.smoothstep(t, 0.8, 1);
    return {
      rx: 0.0108 * f * (1 - 0.02 * head),
      ry: 0.0134 * f * (1 - 0.1 * head),
      cy: -0.0009 * Math.sin(Math.PI * t) - 0.0012 * head,
    };
  };
  const paint = paintFish(def, {
    back: 0x203a36, side: def.color, belly: def.belly,
    headTint: 0x2b4843, mottle: 0.01, gain: 0.02,
    bands: [{ t: 0.78, width: 0.016, color: 0x182622, strength: 0.4 }],
  });
  partsBody.push({
    geo: makeBody({ length: L, stations: 26, radial: 16, profile, color: paint }),
    matrix: new THREE.Matrix4(),
  });
  gillParts(partsBody, {
    profile, length: L, atT: 0.78, color: 0x33504a, crease: 0x1a2a26,
  });
  // soft pectoral fins + forked caudal fin
  for (const sx of [-1, 1]) {
    addFin(partsBody, {
      origin: [sx * 0.0102, -0.0046, 0.017],
      dir: [sx * 0.55, -0.3, -0.78],
      side: [0, 0.9, -0.32],
      size: 0.017,
      outline: [[0, 0], [0.32, 0.18], [0.78, 0.42], [1, 0.3], [0.68, 0.08], [0.3, -0.05]],
      color: 0xb7c8bf, edge: 0x78938a, bend: 0.35,
    });
  }
  addTailFin(partsBody, {
    origin: [0, 0.0004, -L * 0.5 + 0.004], length: 0.0235, height: 0.0165,
    bend: 0.18, color: 0x8fa79c, edge: 0xa9bdb2,
  });
  // holographic side band + lateral line + mouth line on both flanks
  for (const side of [-1, 1]) {
    partsFoil.push({
      geo: flankStrip({ profile, length: L, side, fromT: 0.17, toT: 0.87, span: 0.44, steps: 16, outward: 1.032 }),
      matrix: new THREE.Matrix4(),
      color: 0xe8f8f0,
    });
    partsBody.push({
      geo: flankStrip({ profile, length: L, side, fromT: 0.22, toT: 0.8, span: 0.04, steps: 10, outward: 1.055, offsetAngle: 0.24 }),
      matrix: new THREE.Matrix4(),
      color: 0x243d36,
    });
  }
  // translucent diving lip
  const lipGeo = makeLipGeometry({ width: 0.0155, length: 0.018, thickness: 0.001 });
  const lipMesh = lureMesh(lipGeo, M.clear, 'lip');
  lipMesh.position.set(0, -0.009, 0.032);
  lipMesh.rotation.set(-0.58, 0, 0);
  // line tie + belly / tail hangers (hook sizes are real proportions: ~7 mm)
  addEyelet(partsMetal, { pos: [0, 0.0032, L * 0.5 - 0.0015], rot: [0, Math.PI * 0.5, 0], radius: 0.0018 });
  const hangers = [
    { z: 0.012, y: -0.012, size: 0.6, spin: 0.4 },
    { z: -0.028, y: -0.0097, size: 0.56, spin: 1.1 },
  ];
  for (const h of hangers) {
    addEyelet(partsMetal, { pos: [0, h.y, h.z], rot: [0, Math.PI * 0.5, 0], radius: 0.0012 });
    addSplitRing(partsMetal, { pos: [0, h.y - 0.0017, h.z], radius: 0.0017, tube: 0.00038 });
    trebleParts(partsMetal, { pos: [0, h.y - 0.0039, h.z], rot: [0.1, h.spin, 0], size: h.size });
  }
  addEyePair(partsEye, { x: 0.0072, y: 0.0033, z: 0.0295, r: 0.0032 });
  const g = new THREE.Group();
  g.add(lureMesh(mergeParts(partsBody), M.paint, 'body'));
  g.add(lureMesh(mergeParts(partsFoil), M.foil, 'foil'));
  g.add(lureMesh(mergeParts(partsMetal), M.metal, 'hooks'));
  g.add(lureMesh(mergeParts(partsEye), M.eye, 'eyes'));
  g.add(lipMesh);
  return g;
}

function buildPopper(def, M) {
  const partsBody = [], partsMetal = [], partsEye = [], partsFeather = [];
  const L = 0.072;
  const profile = (t) => {
    const f = smoothKeys([
      [0, 0.16], [0.14, 0.34], [0.3, 0.52], [0.48, 0.72],
      [0.64, 0.88], [0.8, 1.0], [0.92, 1.0], [1, 0.97],
    ])(t);
    return { rx: 0.0118 * f, ry: 0.0132 * f, cy: -0.0008 * Math.sin(Math.PI * t) };
  };
  const paint = paintFish(def, {
    back: def.accent, side: def.color, belly: def.belly,
    headTint: 0xd9603a, deepBelly: 0.3, mottle: 0.008, gain: 0.02,
    bands: [{ t: 0.73, width: 0.014, color: 0x92401f, strength: 0.42 }],
  });
  partsBody.push({
    geo: makeBody({ length: L, stations: 22, radial: 16, profile, color: paint, capNose: false }),
    matrix: new THREE.Matrix4(),
  });
  gillParts(partsBody, { profile, length: L, atT: 0.73, color: 0xe7d8ba, crease: 0x92401f });
  // cup face: dark throat, orange rim, flared lip + a rounded rim ring
  const prNose = profile(1);
  const rimK = 1.0;
  partsBody.push({
    geo: makeCup({
      rimRx: prNose.rx * rimK, rimRy: prNose.ry * rimK, depth: 0.0075,
      segments: 20, inner: 0x160806, rim: def.accent, lip: 0xb24a2c,
    }),
    matrix: composeMatrix([0, 0, L * 0.5 - 0.0004]),
  });
  partsBody.push({
    geo: new THREE.TorusGeometry(1, 0.05, 5, 22),
    matrix: composeMatrix([0, 0, L * 0.5 + 0.0002], [0, 0, 0], [prNose.rx * rimK, prNose.ry * rimK, prNose.rx * rimK]),
    color: def.accent,
  });
  // chin line tie
  addEyelet(partsMetal, { pos: [0, -0.0115, L * 0.5 - 0.011], rot: [0, Math.PI * 0.5, 0], radius: 0.002 });
  const hangers = [
    { z: 0.002, y: -0.0106, size: 0.58, spin: 0.2 },
    { z: -0.031, y: -0.0047, size: 0.6, spin: 0.8, feather: true },
  ];
  for (const h of hangers) {
    addEyelet(partsMetal, { pos: [0, h.y, h.z], rot: [0, Math.PI * 0.5, 0], radius: 0.0012 });
    addSplitRing(partsMetal, { pos: [0, h.y - 0.0017, h.z], radius: 0.0017, tube: 0.00038 });
    trebleParts(partsMetal, { pos: [0, h.y - 0.0039, h.z], rot: [0.08, h.spin, 0], size: h.size });
    if (h.feather) {
      addHackle(partsFeather, {
        origin: [0, h.y - 0.006, h.z - 0.0015],
        dir: [0, -0.22, -0.975], length: 0.021, count: 8, spread: 0.006,
        colors: [0xf0e4c8, 0xd4623c], seed: 5, droop: 0.005,
      });
    }
  }
  addEyePair(partsEye, { x: 0.0102, y: 0.0036, z: 0.0195, r: 0.0032 });
  const g = new THREE.Group();
  g.add(lureMesh(mergeParts(partsBody), M.paint, 'body'));
  g.add(lureMesh(mergeParts(partsMetal), M.metal, 'hooks'));
  g.add(lureMesh(mergeParts(partsEye), M.eye, 'eyes'));
  g.add(lureMesh(mergeParts(partsFeather), M.feather, 'hackle'));
  return g;
}

function buildJig(def, M) {
  const partsHead = [], partsMetal = [], partsSilk = [], partsEye = [];
  const L = 0.06;
  // cast-lead bullet head at the nose, with an eye socket on each flank
  partsHead.push({
    geo: new THREE.SphereGeometry(1, 16, 12),
    matrix: composeMatrix([0, 0.0004, 0.0265], [0.12, 0, 0], [0.0058, 0.0072, 0.0118]),
    color: 0x7c817a,
  });
  // small dark collar where the skirt is tied on (lead material keeps it matte)
  partsHead.push({
    geo: new THREE.CylinderGeometry(0.0046, 0.0038, 0.007, 12),
    matrix: composeMatrix([0, 0, 0.0105], [Math.PI * 0.5, 0, 0]),
    color: 0x3a3a36,
  });
  // line tie at the nose
  addEyelet(partsMetal, { pos: [0, 0.0032, 0.0405], rot: [0, Math.PI * 0.5, 0], radius: 0.0019 });
  // weed guard: head -> over the rear hook point
  const guard = curvePoints([
    new THREE.Vector3(0, 0.0058, 0.030),
    new THREE.Vector3(0, 0.0098, 0.004),
    new THREE.Vector3(0, 0.0094, -0.018),
    new THREE.Vector3(0, 0.0052, -0.034),
    new THREE.Vector3(0, 0.0004, -0.043),
  ], 12);
  partsMetal.push({ geo: sweepTube(guard, 5, () => 0.00032), matrix: new THREE.Matrix4(), color: 0xdfe6e2 });
  // the hook is moulded into the head: a long shank runs through the skirt and
  // the treble trails behind the silicone tips
  const shank = curvePoints([
    new THREE.Vector3(0, -0.0005, 0.020),
    new THREE.Vector3(0, -0.0012, -0.012),
    new THREE.Vector3(0, -0.0022, -0.036),
    new THREE.Vector3(0, -0.0042, -0.046),
  ], 10);
  partsMetal.push({ geo: sweepTube(shank, 5, () => 0.0005), matrix: new THREE.Matrix4(), color: 0xdfe6e2 });
  trebleParts(partsMetal, { pos: [0, -0.004, -0.045], rot: [0.1, 0.5, 0], size: 0.6 });
  singleHookParts(partsMetal, { pos: [0, -0.0076, 0.028], rot: [0.3, Math.PI, 0], size: 0.55, offset: 0.45 });
  // 10 thin silicone strands flowing back over the shank
  addSkirt(partsSilk, {
    origin: [0, 0, 0.011], dir: [0, -0.06, -0.998], length: 0.052,
    count: 12, colors: [0x9a6238, 0x6e4a2c], seed: 19, width: 0.00082,
  });
  addEyePair(partsEye, { x: 0.0052, y: 0.0028, z: 0.0275, r: 0.002 });
  const g = new THREE.Group();
  g.add(lureMesh(mergeParts(partsHead), M.lead, 'jighead'));
  g.add(lureMesh(mergeParts(partsMetal), M.metal, 'hooks'));
  g.add(lureMesh(mergeParts(partsSilk), M.silicone, 'skirt'));
  g.add(lureMesh(mergeParts(partsEye), M.eye, 'eyes'));
  return g;
}
function buildSoft(def, M) {
  const partsBody = [], partsMetal = [];
  const L = 0.108;
  const ribs = 10;
  const ribPhase = (t) => Math.sin((t - 0.14) * TAU * ribs);
  const profile = (t) => {
    const f = smoothKeys([
      [0, 0.55], [0.15, 0.82], [0.3, 0.98], [0.5, 1.0],
      [0.68, 0.94], [0.8, 0.85], [0.9, 0.7], [1, 0.32],
    ])(t);
    const rib = t > 0.14 ? 1 + ribPhase(t) * 0.115 * Math.sin(Math.PI * clamp((t - 0.14) / 0.72)) : 1;
    return {
      rx: 0.0068 * f * rib,
      ry: 0.0082 * f * rib,
      cy: -0.0004 + Math.sin(t * 5.2 + 0.6) * 0.0012,
      cx: Math.sin(t * 4.4) * 0.0008,
    };
  };
  const cBelly = new THREE.Color(def.belly);
  const cSide = new THREE.Color(def.color);
  const cBack = new THREE.Color(def.accent);
  const paint = (t, a, x, y, z, out) => {
    const sa = Math.sin(a);
    out.copy(cBelly);
    out.lerp(cSide, THREE.MathUtils.smoothstep(sa, -0.85, 0.2));
    out.lerp(cBack, THREE.MathUtils.smoothstep(sa, 0.1, 0.95));
    if (t > 0.14) {
      const ridge = 0.5 + 0.5 * ribPhase(t);
      out.offsetHSL(0, 0, -0.055 * ridge + 0.012);
    }
    out.offsetHSL(0, 0, Math.sin(t * 26 + sa * 4) * 0.008 + 0.012);
    return out;
  };
  partsBody.push({
    geo: makeBody({ length: L, stations: 38, radial: 16, profile, color: paint, uvRepeatV: 4.2 }),
    matrix: new THREE.Matrix4(),
  });
  partsBody.push({
    geo: new THREE.SphereGeometry(1, 12, 8),
    matrix: composeMatrix([0, 0.0004, L * 0.5 - 0.0015], [0, 0, 0], [0.0026, 0.003, 0.0045]),
    color: def.color,
  });
  // curl tail: a solid, rounded paddle curling back, up and around
  const tailPts = [
    new THREE.Vector3(0, 0.0012, -L * 0.49),
    new THREE.Vector3(0.0004, -0.0012, -0.0585),
    new THREE.Vector3(0.0016, 0.0042, -0.0665),
    new THREE.Vector3(0.0028, 0.0132, -0.0695),
    new THREE.Vector3(0.003, 0.0184, -0.0655),
    new THREE.Vector3(0.0022, 0.0188, -0.0585),
    new THREE.Vector3(0.0012, 0.0152, -0.0538),
  ];
  const cTail0 = new THREE.Color(def.color);
  const cTail1 = new THREE.Color(def.accent);
  partsBody.push({
    geo: sweepPaddle(curvePoints(tailPts, 14), {
      radial: 8,
      widthFn: (t) => 0.0076 * (1 - t * 0.62) + 0.0005,
      thickness: 0.0015,
      colorFn: (t, out) => out.copy(cTail0).lerp(cTail1, Math.pow(t, 0.8)),
    }),
    matrix: new THREE.Matrix4(),
    color: null,
  });
  // offset worm hook lying along the back, point buried near the tail
  const hookPts = [
    new THREE.Vector3(0, 0.0060, L * 0.5 - 0.006),
    new THREE.Vector3(0, 0.0078, 0.034),
    new THREE.Vector3(0, 0.0078, 0.014),
    new THREE.Vector3(0.0028, 0.0064, 0.002),
    new THREE.Vector3(0.0028, 0.0014, -0.008),
    new THREE.Vector3(0.0012, -0.0032, -0.005),
    new THREE.Vector3(0, -0.0040, 0.003),
    new THREE.Vector3(0, -0.0018, 0.008),
  ];
  partsMetal.push({
    geo: sweepTube(curvePoints(hookPts, 18), 6, (f) => 0.00085 * (1 - f * 0.82)),
    matrix: new THREE.Matrix4(),
    color: 0xcdd5d0,
  });
  addEyelet(partsMetal, { pos: [0, 0.0060, L * 0.5 - 0.005], rot: [0, Math.PI * 0.5, 0], radius: 0.0018 });
  const g = new THREE.Group();
  g.add(lureMesh(mergeParts(partsBody), M.soft, 'body'));
  g.add(lureMesh(mergeParts(partsMetal), M.metal, 'hook'));
  return g;
}

function buildPencil(def, M) {
  const partsBody = [], partsMetal = [], partsEye = [], partsFeather = [];
  const L = 0.104;
  const profile = (t) => {
    const f = smoothKeys([
      [0, 0.18], [0.08, 0.32], [0.22, 0.72], [0.38, 0.95],
      [0.52, 1.0], [0.68, 0.95], [0.8, 0.85], [0.9, 0.68],
      [0.96, 0.42], [1, 0.1],
    ])(t);
    return {
      rx: 0.0084 * f,
      ry: 0.0112 * f,
      cy: 0.0006 - 0.0014 * Math.sin(Math.PI * t),
    };
  };
  const bandColor = new THREE.Color(def.accent).multiplyScalar(0.55).getHex();
  const backColor = new THREE.Color(def.accent).lerp(new THREE.Color(0x5a4033), 0.5).getHex();
  const paint = paintFish(def, {
    back: backColor, side: def.color, belly: def.belly,
    headTint: 0xa89b7d, mottle: 0.009, deepBelly: 0.32, gain: 0.015,
    bands: [
      { t: 0.3, width: 0.055, color: bandColor, strength: 0.4 },
      { t: 0.54, width: 0.045, color: bandColor, strength: 0.34 },
      { t: 0.76, width: 0.04, color: bandColor, strength: 0.28 },
    ],
  });
  partsBody.push({
    geo: makeBody({ length: L, stations: 28, radial: 16, profile, color: paint }),
    matrix: new THREE.Matrix4(),
  });
  gillParts(partsBody, { profile, length: L, atT: 0.8, color: 0xc6ba98, crease: 0x82352c });
  for (const sx of [-1, 1]) {
    addFin(partsBody, {
      origin: [sx * 0.0082, -0.0062, 0.011],
      dir: [sx * 0.82, -0.42, -0.45],
      side: [0, 0.86, -0.5],
      size: 0.0125,
      outline: [[0, 0], [0.34, 0.16], [0.82, 0.38], [1, 0.24], [0.62, 0.04], [0.26, -0.05]],
      color: 0xcabfa2, edge: 0x8a816b, bend: 0.32,
    });
  }
  addTailFin(partsBody, {
    origin: [0, 0.0004, -L * 0.5 + 0.004], length: 0.026, height: 0.017,
    bend: 0.15, color: 0xc3baa0, edge: 0x8f3932,
  });
  addEyelet(partsMetal, { pos: [0, 0.0034, L * 0.5 - 0.0015], rot: [0, Math.PI * 0.5, 0], radius: 0.002 });
  const hangers = [
    { z: 0.004, y: -0.0098, size: 0.58, spin: 0.15 },
    { z: -0.043, y: -0.0043, size: 0.62, spin: 0.75, feather: true },
  ];
  for (const h of hangers) {
    addEyelet(partsMetal, { pos: [0, h.y, h.z], rot: [0, Math.PI * 0.5, 0], radius: 0.0012 });
    addSplitRing(partsMetal, { pos: [0, h.y - 0.0017, h.z], radius: 0.0017, tube: 0.00038 });
    trebleParts(partsMetal, { pos: [0, h.y - 0.0039, h.z], rot: [0.08, h.spin, 0], size: h.size });
    if (h.feather) {
      addHackle(partsFeather, {
        origin: [0, h.y - 0.006, h.z - 0.0015],
        dir: [0, -0.2, -0.98], length: 0.026, count: 7, spread: 0.0062,
        colors: [0xefe0c0, 0x8f3932], seed: 13, droop: 0.006,
      });
    }
  }
  addEyePair(partsEye, { x: 0.0072, y: 0.0035, z: 0.0345, r: 0.0029 });
  const g = new THREE.Group();
  g.add(lureMesh(mergeParts(partsBody), M.paint, 'body'));
  g.add(lureMesh(mergeParts(partsMetal), M.metal, 'hooks'));
  g.add(lureMesh(mergeParts(partsEye), M.eye, 'eyes'));
  g.add(lureMesh(mergeParts(partsFeather), M.feather, 'feather'));
  return g;
}

const LURE_BUILDERS = {
  minnow: buildMinnow,
  popper: buildPopper,
  jig: buildJig,
  soft: buildSoft,
  pencil: buildPencil,
};

function buildLure(def, engine) {
  const builder = LURE_BUILDERS[def?.id];
  const { M } = lureMaterials(engine);
  const make = builder || buildMinnow;
  const group = make(def, M);
  group.name = `lure:${def?.id ?? 'minnow'}`;
  group.userData.lureId = def?.id ?? 'minnow';
  group.userData.lureGroup = true;
  return group;
}

function lureStats(group) {
  const mats = new Set();
  let meshes = 0;
  let tris = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (o.material) mats.add(o.material.uuid);
    const n = o.geometry?.index ? o.geometry.index.count : (o.geometry?.attributes?.position?.count || 0);
    tris += n / 3;
  });
  return { meshes, tris: Math.round(tris), materials: mats.size };
}

// ---------------------------------------------------------------------------
// Reel
// ---------------------------------------------------------------------------

function buildReel(mats) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.0085, 0.05, 0.011), mats.dark);
  stem.position.set(0, -0.024, 0.006);
  g.add(stem);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.033, 0.052, 14), mats.dark);
  body.rotation.x = Math.PI * 0.5;
  body.position.set(0, -0.058, 0.008);
  g.add(body);

  const rotor = new THREE.Group();
  rotor.position.set(0, -0.058, -0.024);
  const rotorShell = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.027, 0.026, 14, 1, true), mats.dark);
  rotorShell.rotation.x = Math.PI * 0.5;
  rotor.add(rotorShell);
  const rotorRing = new THREE.Mesh(new THREE.TorusGeometry(0.0235, 0.0018, 5, 16), mats.brass);
  rotorRing.rotation.y = 0;
  rotor.add(rotorRing);
  // bail wire: a swinging arc
  const bail = new THREE.Group();
  const bailWire = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0014, 4, 14, Math.PI * 1.15), mats.spool);
  bailWire.rotation.z = -0.4;
  bail.add(bailWire);
  bail.position.z = -0.002;
  rotor.add(bail);
  g.add(rotor);

  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 14), mats.spool);
  spool.rotation.x = Math.PI * 0.5;
  spool.position.set(0, -0.058, -0.045);
  g.add(spool);

  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8), mats.brass);
  knob.rotation.x = Math.PI * 0.5;
  knob.position.set(0, -0.058, -0.056);
  g.add(knob);

  const handle = new THREE.Group();
  handle.position.set(0.032, -0.072, 0.02);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.007), mats.dark);
  arm.position.y = -0.015;
  handle.add(arm);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.02, 8), mats.brass);
  grip.rotation.z = Math.PI * 0.5;
  grip.position.set(0.014, -0.03, 0.004);
  handle.add(grip);
  g.add(handle);

  return { group: g, rotor, bail, spool, handle };
}

// ---------------------------------------------------------------------------

export function createRodRig(engine, camera) {
  const root = new THREE.Group();
  root.name = 'fishingRig';
  root.visible = false;
  camera.add(root);
  if (!camera.parent) engine.scene.add(camera);

  const mats = createMaterials({});
  const blank = buildTube(34, 7);
  const blankMesh = new THREE.Mesh(blank.geo, mats.blank);
  const rearGrip = buildTube(9, 7);
  const rearGripMesh = new THREE.Mesh(rearGrip.geo, mats.grip);
  const foreGrip = buildTube(9, 7);
  const foreGripMesh = new THREE.Mesh(foreGrip.geo, mats.grip);
  const seat = buildTube(9, 7);
  const seatMesh = new THREE.Mesh(seat.geo, mats.seat);
  for (const m of [blankMesh, rearGripMesh, foreGripMesh, seatMesh]) {
    m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
    root.add(m);
  }

  // brass winding checks + butt cap
  const ringGeo = new THREE.TorusGeometry(0.016, 0.0018, 5, 12);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(ringGeo, mats.brass);
    rings.push(r); root.add(r);
  }
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0165, 0.014, 12), mats.brass);
  root.add(butt);

  // guides (instanced)
  const GUIDE_T = [0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.89, 0.96];
  const guideGeo = new THREE.TorusGeometry(0.011, 0.0016, 5, 12);
  const guides = new THREE.InstancedMesh(guideGeo, mats.spool, GUIDE_T.length);
  guides.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  guides.frustumCulled = false;
  root.add(guides);

  // reel
  const reel = buildReel(mats);
  reel.group.scale.setScalar(1.12);
  root.add(reel.group);

  // lures — all five are constructed here so no bait is built on cast/swap.
  // fishing.prewarm() compiles every material once (renderer.compile walks the
  // whole scene, including these hidden groups), so the first cast is clean.
  const lureGroups = new Map();
  let currentLureDef = null;
  let currentLureGroup = null;

  const lureDebugState = {
    active: false, mode: 'single', id: 'minnow',
    yaw: 1.38, pitch: 0.08, roll: 0.02, scale: 3.4,
    x: 0, y: -0.004, z: -0.62, spin: 0, spacing: 0.212,
  };
  // a three-quarter yaw per bait so each hero angle shows its best feature
  const LINEUP_YAW = [1.32, 0.68, 1.12, 1.55, 1.22];

  function ensureLure(def) {
    if (!def || !def.id) return null;
    let g = lureGroups.get(def.id);
    if (!g) {
      g = buildLure(def, engine);
      g.visible = false;
      lureGroups.set(def.id, g);
      root.add(g);
      g.updateMatrixWorld(true);
    }
    return g;
  }

  for (const def of LURE_TYPES) ensureLure(def);

  function debugSetRodHidden(hide) {
    for (const child of root.children) {
      if (child.userData?.lureGroup || child.isLight) continue;
      if (hide) {
        if (child.userData.__dbgVis === undefined) child.userData.__dbgVis = child.visible;
        child.visible = false;
      } else if (child.userData.__dbgVis !== undefined) {
        child.visible = child.userData.__dbgVis;
        delete child.userData.__dbgVis;
      }
    }
  }

  function applyLureDebugPose() {
    const d = lureDebugState;
    if (!d.active) return;
    root.visible = true;
    debugSetRodHidden(true);
    if (d.mode === 'lineup') {
      LURE_TYPES.forEach((def, i) => {
        const g = ensureLure(def);
        if (!g) return;
        g.visible = true;
        g.position.set(
          (i - 2) * d.spacing,
          d.y + Math.sin(i * 1.7) * 0.002,
          d.z - Math.abs(i - 2) * 0.014,
        );
        g.rotation.set(
          d.pitch + (i % 2 ? -0.03 : 0.03),
          LINEUP_YAW[i] + (i - 2) * 0.04,
          d.roll + (i - 2) * 0.03,
        );
        g.scale.setScalar(d.scale);
      });
      return;
    }
    for (const [id, g] of lureGroups) g.visible = id === d.id;
    const g = ensureLure(LURE_BY_ID[d.id]);
    if (!g) return;
    currentLureDef = LURE_BY_ID[d.id];
    currentLureGroup = g;
    g.visible = true;
    g.position.set(d.x, d.y, d.z);
    g.rotation.set(d.pitch, d.yaw + d.spin, d.roll);
    g.scale.setScalar(d.scale);
  }

  // line ribbons
  const braidPts = Array.from({ length: 26 }, () => new THREE.Vector3());
  const leaderPts = Array.from({ length: 14 }, () => new THREE.Vector3());
  const braidRibbon = buildRibbon(26);
  const leaderRibbon = buildRibbon(14);
  const braidMesh = new THREE.Mesh(braidRibbon.geo, mats.mono);
  const leaderMesh = new THREE.Mesh(leaderRibbon.geo, mats.mono.clone());
  braidMesh.frustumCulled = false;
  leaderMesh.frustumCulled = false;
  braidMesh.renderOrder = 4;
  leaderMesh.renderOrder = 5;
  root.add(braidMesh, leaderMesh);

  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 6, 5), mats.knot);
  knot.renderOrder = 6;
  root.add(knot);

  // A short warm fill attached to the camera; it only reaches the rod, the
  // leader and the near deck, so the black blank still reads at sunset.
  const fill = new THREE.PointLight(0xffd9a8, 1.5, 2.8, 2.0);
  fill.position.set(0.52, 0.32, -0.35);
  root.add(fill);

  const state = {
    sweep: 0, pitch: 0, bend: 0, reeling: 0, bailOpen: false,
    castPhase: -1, strike: 0, L: 2.05,
  };
  let leaderDef = null;
  let leaderWear = 0;
  let rotorAngle = 0;
  let spoolPhase = 0;
  let bailAmount = 0;
  let visible = false;
  let swayTime = 0;
  let rodProfile = null;
  let lurePop = 0;
  const hangingLure = new THREE.Vector3();
  const hangTarget = new THREE.Vector3();
  let hasLureWorld = false;
  const lureWorld = new THREE.Vector3();

  const rig = {
    root,
    get visible() { return visible; },

    setRod(profile) {
      rodProfile = profile;
      mats.blank.color.set(profile.color ?? 0x1b2b30).multiplyScalar(1.05);
      mats.brass.color.set(profile.accent ?? 0xd9a86c);
      state.L = (profile.lengthM || 2.1) / 2.1 * 2.05;
      rodProfile = profile;
    },

    setLeader(def, wear = 0) {
      leaderDef = def;
      leaderWear = clamp(wear);
      const gauge = leaderGauge(def);
      if (leaderMesh.material) {
        const fresh = new THREE.Color(def?.color ?? 0xdfe9e2);
        const worn = new THREE.Color(0x9d8a63);
        leaderMesh.material.color.copy(fresh).lerp(worn, clamp(wear) * 0.75);
        leaderMesh.material.opacity = 0.5 + clamp(wear) * 0.3;
      }
      rig.lineWidths = { braid: 1.3, leader: 0.8 + gauge * 0.62 };
    },

    setLure(def) {
      if (!def) return;
      if (!lureGroups.has(def.id)) ensureLure(def);
      if (currentLureGroup) currentLureGroup.visible = false;
      currentLureDef = def;
      currentLureGroup = lureGroups.get(def.id);
      if (!currentLureGroup) return;
      currentLureGroup.visible = true;
      lurePop = 1;
    },

    setVisible(v) {
      visible = !!v;
      root.visible = visible;
      if (!visible) {
        // idle/exit: stop and zero the reel visual
        rotorAngle = 0;
        spoolPhase = 0;
        reel.rotor.rotation.z = 0;
        reel.handle.rotation.z = 0;
        reel.spool.position.z = -0.045;
      }
    },

    // ---- debug-only lure tools (screenshots / QA; no gameplay effect) ----
    // Build every bait once, then compile + upload every bait under the real
    // scene light set. Runs behind the boot loader, so the first cast or lure
    // swap never pays for a shader compile or a geometry upload.
    prewarmLures() {
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const built = [];
      const visibility = [];
      for (const def of LURE_TYPES) {
        const g = ensureLure(def);
        if (!g) continue;
        built.push({ id: def.id, ...lureStats(g) });
        visibility.push([g, g.visible]);
        g.visible = true;
      }
      const rootWas = root.visible;
      root.visible = true; // the camera-space fill light must be in the light set
      const rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
      try {
        engine.renderer.compile(engine.scene, camera);
        // the off-screen pass both compiles the composer-target variants and
        // uploads every merged geometry buffer
        engine.renderer.setRenderTarget(rt);
        engine.renderer.render(engine.scene, camera);
      } catch (err) { /* noop */ } finally {
        engine.renderer.setRenderTarget(null);
        rt.dispose();
      }
      for (const [g, v] of visibility) g.visible = v;
      root.visible = rootWas;
      const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      return { built, ms: +ms.toFixed(1) };
    },

    debugShowLure(id = 'minnow', opts = {}) {
      const def = LURE_BY_ID[id] || LURE_TYPES[0];
      ensureLure(def);
      Object.assign(lureDebugState, {
        active: true, mode: 'single', id: def.id,
        yaw: opts.yaw ?? 1.38, pitch: opts.pitch ?? 0.08, roll: opts.roll ?? 0.02,
        scale: opts.scale ?? 3.4, x: opts.x ?? 0, y: opts.y ?? -0.004,
        z: opts.z ?? -0.62, spin: opts.spin ?? 0,
      });
      applyLureDebugPose();
      return true;
    },

    debugLineup(opts = {}) {
      for (const def of LURE_TYPES) ensureLure(def);
      Object.assign(lureDebugState, {
        active: true, mode: 'lineup', id: null,
        yaw: opts.yaw ?? 1.42, pitch: opts.pitch ?? 0.06, roll: opts.roll ?? 0,
        scale: opts.scale ?? 2.25, x: 0, y: opts.y ?? -0.014, z: opts.z ?? -0.74,
        spacing: opts.spacing ?? 0.248, spin: 0,
      });
      applyLureDebugPose();
      return LURE_TYPES.map((def) => ({ id: def.id, ...lureStats(lureGroups.get(def.id)) }));
    },

    debugEnd() {
      lureDebugState.active = false;
      debugSetRodHidden(false);
      for (const [, g] of lureGroups) g.visible = false;
      if (currentLureGroup) currentLureGroup.visible = true;
      return true;
    },

    debugStats() {
      const out = {};
      for (const [id, g] of lureGroups) out[id] = lureStats(g);
      out.activeLure = currentLureDef?.id ?? null;
      return out;
    },

    tipWorld(out = new THREE.Vector3()) {
      root.localToWorld(_tipLocal.copy(rig.tipLocal));
      return out.copy(_tipLocal);
    },
    get reelAngle() { return rotorAngle; },

    // state:
    // { sweep, pitch, bend, reeling, bailOpen, castPhase, strike,
    //   lureWorld|null, lureVisible, lureSurface, lineSag, fov, height }
    update(dt, s) {
      if (lureDebugState.active) {
        applyLureDebugPose();
        return;
      }
      if (!root.visible) return;
      swayTime += dt;
      state.sweep = s.sweep || 0;
      state.pitch = s.pitch || 0;
      state.bend = clamp(s.bend || 0, 0, 1.4);
      state.reeling = clamp(s.reeling || 0, 0, 1);
      state.strike = clamp(s.strike || 0, 0, 1);
      state.castPhase = s.castPhase ?? -1;
      const L = state.L;

      // ---- rod axis -----------------------------------------------------
      // On a narrow (portrait) canvas the horizontal FOV collapses, so slide
      // the rig toward the centre and keep the blank in frame.
      const aspect = s.aspect || camera.aspect || 1.78;
      const narrow = clamp((1.28 - aspect) / 0.8, 0, 1);
      const xs = 1 - narrow * 0.52;
      const grip = _grip.set(GRIP.x * xs, GRIP.y + narrow * 0.02, GRIP.z);
      const hangX = HANG_TARGET.x * xs;

      _dir.copy(BASE_DIR);
      _dir.applyAxisAngle(UP, state.sweep);
      let pitch = state.pitch;
      if (state.strike > 0) pitch += Math.sin(state.strike * Math.PI) * 0.85;
      if (state.castPhase >= 0) {
        const t = clamp(state.castPhase);
        const wind = smooth01(0, 0.26, t);
        const snap = smooth01(0.26, 0.5, t);
        const settle = smooth01(0.5, 1, t);
        pitch += 0.55 * wind - 1.02 * snap + 0.47 * settle * snap;
        root.position.set(0.02 * wind - 0.035 * snap, 0.012 * wind, -0.055 * snap);
      } else {
        root.position.set(0, 0, 0);
      }
      // idle breathing, smaller under load
      const idle = (1 - state.bend * 0.5) * 0.006;
      pitch += Math.sin(swayTime * 0.9) * idle;
      _dir.applyAxisAngle(RIGHT, pitch);
      _dir.normalize();

      // ---- Bézier control points ---------------------------------------
      const bendAmt = state.bend * 0.82;
      _p0.copy(grip);
      _p1.copy(grip).addScaledVector(_dir, L * 0.34);
      _p2.copy(grip).addScaledVector(_dir, L * 0.72).addScaledVector(BEND_VEC, bendAmt * 0.42);
      _p3.copy(grip).addScaledVector(_dir, L).addScaledVector(BEND_VEC, bendAmt);
      // slight downward pull when the line is loaded
      const curveFn = (t, out) => cubic(_p0, _p1, _p2, _p3, t, out);
      _tipLocal.copy(_p3);

      // ---- blank / grips / seat ----------------------------------------
      updateTube(blank, curveFn, (t) => 0.0074 * (1 - t) + 0.00125 * t);
      updateTube(rearGrip, curveFn, () => 0.0138);
      updateTube(foreGrip, curveFn, () => 0.0126);
      updateTube(seat, curveFn, () => 0.0104);

      // rings + butt
      const ringTs = [0.155, 0.245, 0.352];
      for (let i = 0; i < rings.length; i++) {
        const t = ringTs[i];
        curveFn(t, _tmpA);
        const tan = cubicTangent(_p0, _p1, _p2, _p3, t, _tmpB);
        rings[i].position.copy(_tmpA);
        rings[i].quaternion.setFromUnitVectors(FWD, tan);
        rings[i].scale.setScalar(t < 0.2 ? 0.98 : 0.9);
      }
      curveFn(0, _tmpA);
      butt.position.copy(_tmpA).addScaledVector(_dir, -0.006);
      butt.quaternion.setFromUnitVectors(UP, _dir);

      // guides
      for (let i = 0; i < GUIDE_T.length; i++) {
        const t = GUIDE_T[i];
        curveFn(t, _tmpA);
        const tan = cubicTangent(_p0, _p1, _p2, _p3, t, _tmpB);
        const down = _tmpC.set(0, -1, 0).addScaledVector(tan, tan.y);
        if (down.lengthSq() < 1e-6) down.set(0, 0, 1);
        down.normalize();
        const r = 0.0074 * (1 - t) + 0.00125 * t;
        _dummy.position.copy(_tmpA).addScaledVector(down, r + 0.007);
        _dummy.quaternion.setFromUnitVectors(FWD, tan);
        _dummy.scale.setScalar(1 - t * 0.25);
        _dummy.updateMatrix();
        guides.setMatrixAt(i, _dummy.matrix);
      }
      guides.instanceMatrix.needsUpdate = true;

      // reel
      const reelT = 0.285;
      curveFn(reelT, _tmpA);
      const reelTan = cubicTangent(_p0, _p1, _p2, _p3, reelT, _tmpB);
      reel.group.position.copy(_tmpA).addScaledVector(_dir, 0.006);
      reel.group.quaternion.setFromUnitVectors(UP, reelTan);
      const spin = state.reeling;
      // round 7: the rotor/handle must be perfectly still at idle/rigged.
      // Only actual line movement (wheel, auto-reel, retrieving) spins it.
      if (spin > 0.004) {
        rotorAngle += dt * (2.2 + spin * 26);
        spoolPhase += dt * (2 + spin * 16);
      } else {
        rotorAngle = 0;
        spoolPhase = 0;
      }
      reel.rotor.rotation.z = rotorAngle;
      reel.spool.position.z = -0.045 + Math.sin(spoolPhase) * 0.0035;
      reel.handle.rotation.z = rotorAngle * 0.85;
      bailAmount += ((state.bailOpen ? 1 : 0) - bailAmount) * Math.min(1, dt * 14);
      reel.bail.rotation.z = bailAmount * 1.1;

      // ---- lure / line --------------------------------------------------
      hasLureWorld = !!s.lureWorld;
      if (s.lureWorld) lureWorld.copy(s.lureWorld);
      let lureLocal;
      if (hasLureWorld) {
        camera.worldToLocal(_worldTmp.copy(lureWorld));
        _lureLocal.copy(_worldTmp);
        lureLocal = _lureLocal;
      } else {
        // dangling in front of the rod tip, slightly broadside to the camera
        hangTarget.copy(HANG_TARGET);
        hangTarget.x = hangX + Math.sin(swayTime * 0.7) * 0.012;
        hangTarget.y += Math.sin(swayTime * 1.1) * 0.008;
        lurePop = Math.max(0, lurePop - dt * 2.4);
        hangingLure.lerp(hangTarget, Math.min(1, dt * 9));
        lureLocal = _lureLocal.copy(hangingLure);
      }

      const tip = _tipLocal;
      const lineDx = lureLocal.x - tip.x;
      const lineDy = lureLocal.y - tip.y;
      const lineDz = lureLocal.z - tip.z;
      const lineDist = Math.sqrt(lineDx * lineDx + lineDy * lineDy + lineDz * lineDz);
      const sag = clamp(s.lineSag ?? 0.15, 0, 1.6) + (hasLureWorld ? 0 : 0.16);
      const knotFrac = hasLureWorld
        ? clamp(1 - 1.35 / Math.max(1.36, lineDist), 0.42, 0.975)
        : 0.24;

      // braid + leader sample points
      const braidCount = braidPts.length;
      for (let i = 0; i < braidCount; i++) {
        const t = (i / (braidCount - 1)) * knotFrac;
        sampleLinePoint(tip, lureLocal, sag, t, braidPts[i]);
      }
      const knotPt = braidPts[braidCount - 1];
      knot.position.copy(knotPt);
      const leaderCount = leaderPts.length;
      for (let i = 0; i < leaderCount; i++) {
        const t = knotFrac + (1 - knotFrac) * (i / (leaderCount - 1));
        sampleLinePoint(tip, lureLocal, sag, t, leaderPts[i]);
      }
      const fov = s.fov || camera.fov;
      const screenH = s.height || engine.size?.y || 900;
      const widths = rig.lineWidths || { braid: 1.4, leader: 1.15 };
      const lineVisible = s.lineVisible !== false;
      braidMesh.visible = lineVisible;
      leaderMesh.visible = lineVisible;
      knot.visible = lineVisible;
      if (lineVisible) {
        updateRibbon(braidRibbon, braidPts, widths.braid, fov, screenH, true);
        updateRibbon(leaderRibbon, leaderPts, widths.leader, fov, screenH, true);
        knot.scale.setScalar(hasLureWorld ? clamp(1.6 - lineDist * 0.06, 0.7, 1.6) : 1);
      }

      // lure transform
      if (currentLureGroup) {
        const show = s.lureVisible !== false;
        currentLureGroup.visible = show;
        currentLureGroup.position.copy(lureLocal);
        if (hasLureWorld) {
          _tmpA.subVectors(tip, lureLocal).normalize();
          currentLureGroup.quaternion.setFromUnitVectors(FWD, _tmpA);
          currentLureGroup.rotateY(Math.PI * 0.5);
        } else {
          currentLureGroup.rotation.set(0.12, Math.PI * 0.6 + Math.sin(swayTime * 0.8) * 0.1, 0.06 + Math.sin(swayTime * 1.1) * 0.1);
          currentLureGroup.position.x += -0.035;
          currentLureGroup.position.y += 0.004;
        }
        currentLureGroup.scale.setScalar((hasLureWorld ? 1 : 1.34) + lurePop * 0.18);
      }
    },
  };

  rig.tipLocal = _tipLocal;
  rig.lineWidths = { braid: 1.4, leader: 1.15 };
  // debug/QA handle: lets tooling drive the close-up turntable without touching
  // gameplay code. Nothing in the game reads it.
  if (typeof window !== 'undefined') window.__LURE_RIG = rig;
  // Prewarm while the boot loader still covers the canvas: this compiles every
  // bait material and uploads every geometry, so the first cast/swap is free.
  // `?noprewarm=1` is a QA escape hatch.
  if (typeof window !== 'undefined' && !new URLSearchParams(location.search).has('noprewarm')) {
    setTimeout(() => {
      try { window.__LURE_PREWARM = rig.prewarmLures(); } catch (err) { /* noop */ }
    }, 0);
  }
  return rig;
}

function smooth01(a, b, v) {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function cubic(p0, p1, p2, p3, t, out) {
  const it = 1 - t;
  const a = it * it * it;
  const b = 3 * it * it * t;
  const c = 3 * it * t * t;
  const d = t * t * t;
  return out.set(
    p0.x * a + p1.x * b + p2.x * c + p3.x * d,
    p0.y * a + p1.y * b + p2.y * c + p3.y * d,
    p0.z * a + p1.z * b + p2.z * c + p3.z * d,
  );
}

function cubicTangent(p0, p1, p2, p3, t, out) {
  const it = 1 - t;
  const a = 3 * it * it;
  const b = 6 * it * t;
  const c = 3 * t * t;
  return out.set(
    (p1.x - p0.x) * a + (p2.x - p1.x) * b + (p3.x - p2.x) * c,
    (p1.y - p0.y) * a + (p2.y - p1.y) * b + (p3.y - p2.y) * c,
    (p1.z - p0.z) * a + (p2.z - p1.z) * b + (p3.z - p2.z) * c,
  ).normalize();
}

// Sample a sagging line. `sag` pushes the middle of the curve downward in
// camera space; a second, smaller sideways bow keeps it from looking like a
// ruler, and a taut line straightens out.
function sampleLinePoint(a, b, sag, t, out) {
  out.lerpVectors(a, b, t);
  const bow = Math.sin(Math.PI * t);
  // catenary-ish: heavier drop plus a sideways bow so a near-vertical hang
  // still reads as a soft curve instead of a ruler line
  out.y -= sag * bow * 0.7;
  out.x -= sag * bow * 0.62;
  out.z += sag * bow * 0.34;
  return out;
}

// Debug / studio entry points: the temporary lure studio imports these to
// render the exact same bait geometry and materials as the game.
export { buildLure, lureMaterials, lureStats };

