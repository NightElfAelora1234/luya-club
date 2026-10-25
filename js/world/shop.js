// =============================================================================
// 路亚俱乐部 · LUYA CLUB — ROD ATELIER (surface rod shop)
// A floating pontoon on the sunset South China Sea: wet teak deck, brass rails,
// rope, a raised display counter and five concept lure rods. Everything is
// procedural (no external assets) and authored for the camera in js/world/camera.js
// (local +Z faces the camera at the start of the shop orbit).
// Owned by: shop teammate. Exports createShop(engine, app, ctx) per CONTRACT.md.
// =============================================================================
import * as THREE from 'three';
import { app } from '../core/state.js';
import { WORLD } from '../core/world.js';
import { RODS, createShopUI, toRodSpec } from '../ui/shop.js';
import { damp, mulberry32 } from '../core/util.js';

const UP = new THREE.Vector3(0, 1, 0);
const GROUP_YAW = WORLD.shop.orbitStart;

// ---- local layout (the group sits at WORLD.shop.center) ---------------------
const DECK_W = 12.0;
const DECK_D = 4.6;
const DECK_T = 0.2;
const DECK_TOP = 0.9;
const PLINTH_X = -1.45;
const PLINTH_W = 7.7;
const PLINTH_D = 0.84;
const PLINTH_Z = 1.25;
const PLINTH_H = 0.72;
const PLINTH_TOP = DECK_TOP + PLINTH_H;
const ROD_Z = PLINTH_Z + 0.03;
const ROD_XS = RODS.map((_, i) => PLINTH_X + (i - 2) * 1.625);
const ROD_BASE_Y = PLINTH_TOP + 0.05;
const ROD_SCALE = 1.56;
const GUIDE_START = 0.74;

// ---- small shared temporaries (never allocate in update) --------------------
const TMP_V1 = new THREE.Vector3();
const TMP_V2 = new THREE.Vector3();
const TMP_COLOR = new THREE.Color();
const TMP_Q = new THREE.Quaternion();
const TMP_M = new THREE.Matrix4();
const TMP_M2 = new THREE.Matrix4();
const TMP_E = new THREE.Euler();
const TMP_S = new THREE.Vector3(1, 1, 1);

// =============================================================================
// procedural textures
// =============================================================================
function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') };
}

function tex(canvas, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** Wet teak pontoon planks: colour + roughness + bump. */
function makeWoodTextures(seed = 0x5ea51) {
  const rand = mulberry32(seed);
  const W = 1024, H = 512;
  const col = canvas2d(W, H);
  const rough = canvas2d(W, H);
  const bump = canvas2d(W, H);
  const ctx = col.ctx;
  const rctx = rough.ctx;
  const bctx = bump.ctx;

  ctx.fillStyle = '#3b2d20';
  ctx.fillRect(0, 0, W, H);
  rctx.fillStyle = '#a8a8a8';
  rctx.fillRect(0, 0, W, H);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, W, H);

  const planks = 9;
  const ph = H / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    const tone = 0.82 + rand() * 0.34;
    const r = Math.round(62 * tone + rand() * 12);
    const g = Math.round(47 * tone + rand() * 8);
    const b = Math.round(32 * tone + rand() * 6);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y0 + 1, W, ph - 2);

    // broad grain bands
    for (let band = 0; band < 5; band++) {
      const by = y0 + ph * (0.12 + rand() * 0.76);
      const bh = 1 + rand() * 2.6;
      ctx.fillStyle = `rgba(${r + 10},${g + 8},${b + 4},${0.16 + rand() * 0.22})`;
      ctx.fillRect(0, by, W, bh);
      bctx.fillStyle = `rgba(190,190,190,${0.05 + rand() * 0.12})`;
      bctx.fillRect(0, by, W, bh);
    }

    // fine grain lines
    for (let i = 0; i < 22; i++) {
      const gy = y0 + 3 + rand() * (ph - 6);
      const amp = 0.6 + rand() * 2.4;
      const freq = 0.004 + rand() * 0.012;
      const phase = rand() * 6.28;
      ctx.beginPath();
      bctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const yy = gy + Math.sin(x * freq + phase) * amp + Math.sin(x * 0.09 + phase) * 0.4;
        if (x === 0) { ctx.moveTo(x, yy); bctx.moveTo(x, yy); }
        else { ctx.lineTo(x, yy); bctx.lineTo(x, yy); }
      }
      const dark = 0.05 + rand() * 0.14;
      ctx.strokeStyle = `rgba(12,9,6,${dark})`;
      ctx.lineWidth = 0.6 + rand();
      ctx.stroke();
      bctx.strokeStyle = `rgba(255,255,255,${0.06 + rand() * 0.16})`;
      bctx.lineWidth = 0.8;
      bctx.stroke();
    }

    // butt joints + nail heads
    const joints = 1 + Math.floor(rand() * 3);
    for (let j = 0; j < joints; j++) {
      const jx = 70 + rand() * (W - 140);
      ctx.fillStyle = 'rgba(6,4,3,.72)';
      ctx.fillRect(jx, y0 + 2, 2.6, ph - 4);
      bctx.fillStyle = 'rgba(24,24,24,.65)';
      bctx.fillRect(jx, y0 + 2, 3, ph - 4);
      for (const ny of [y0 + 11, y0 + ph - 11]) {
        ctx.beginPath();
        ctx.arc(jx + (rand() > 0.5 ? 7 : -7), ny, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(170,150,118,.34)';
        ctx.fill();
        bctx.beginPath();
        bctx.arc(jx, ny, 2.2, 0, Math.PI * 2);
        bctx.fillStyle = 'rgba(40,40,40,.8)';
        bctx.fill();
      }
    }

    // knots
    if (rand() > 0.55) {
      const kx = 80 + rand() * (W - 160);
      const ky = y0 + ph * (0.3 + rand() * 0.4);
      const kr = 3 + rand() * 7;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.ellipse(kx, ky, kr + k * 2.4, (kr + k * 2.4) * 0.45, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(14,10,7,${0.28 - k * 0.05})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // seam shadow + highlight
    ctx.fillStyle = 'rgba(6,4,3,.92)';
    ctx.fillRect(0, y0, W, 4.6);
    ctx.fillStyle = 'rgba(214,180,132,.22)';
    ctx.fillRect(0, y0 + 4.6, W, 1.6);
    bctx.fillStyle = 'rgba(14,14,14,.9)';
    bctx.fillRect(0, y0, W, 5);
  }

  // wet blotches: darker colour, smoother, pooled along the middle
  for (let i = 0; i < 22; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 30 + rand() * 120;
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, `rgba(10,18,20,${0.1 + rand() * 0.14})`);
    g.addColorStop(1, 'rgba(10,18,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    const rg = rctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    rg.addColorStop(0, 'rgba(92,92,92,.6)');
    rg.addColorStop(1, 'rgba(92,92,92,0)');
    rctx.fillStyle = rg;
    rctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // thin standing water sheen streaks
  for (let i = 0; i < 16; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const len = 60 + rand() * 260;
    const grad = ctx.createLinearGradient(x, y, x + len, y + 8);
    grad.addColorStop(0, 'rgba(180,205,204,0)');
    grad.addColorStop(0.5, `rgba(190,215,214,${0.018 + rand() * 0.03})`);
    grad.addColorStop(1, 'rgba(180,205,204,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, len, 1.4);
  }

  // salt / wear speckle
  for (let i = 0; i < 2400; i++) {
    const x = rand() * W;
    const y = rand() * H;
    ctx.fillStyle = `rgba(${rand() > 0.5 ? '215,205,185' : '10,10,9'},${rand() * 0.035})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }

  return {
    map: tex(col.c, { repeat: [1, 1], aniso: 12 }),
    roughnessMap: tex(rough.c, { srgb: false, repeat: [1, 1], aniso: 4 }),
    bumpMap: tex(bump.c, { srgb: false, repeat: [1, 1], aniso: 4 }),
  };
}

/** Soft vertical streak used for the fake rod reflections on the wet deck. */
function makeStreakTexture() {
  const { c, ctx } = canvas2d(64, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,.95)');
  g.addColorStop(0.22, 'rgba(255,255,255,.55)');
  g.addColorStop(0.62, 'rgba(255,255,255,.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  ctx.globalCompositeOperation = 'destination-in';
  const h = ctx.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.26, 'rgba(0,0,0,.85)');
  h.addColorStop(0.5, 'rgba(0,0,0,1)');
  h.addColorStop(0.74, 'rgba(0,0,0,.85)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 64, 256);
  return tex(c, { repeat: null, aniso: 4 });
}

function makeGlowTexture(inner = 0.0, mid = 0.35) {
  const { c, ctx } = canvas2d(256, 256);
  const g = ctx.createRadialGradient(128, 128, 128 * inner, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(mid, 'rgba(255,236,205,.42)');
  g.addColorStop(0.7, 'rgba(255,210,150,.09)');
  g.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return tex(c, { repeat: null, aniso: 2 });
}

function makeRopeBump() {
  const { c, ctx } = canvas2d(64, 64);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 64, 64);
  ctx.lineWidth = 3;
  for (let i = -64; i < 128; i += 9) {
    ctx.strokeStyle = 'rgba(235,235,235,.85)';
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 40, 64);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(30,30,30,.5)';
    ctx.beginPath();
    ctx.moveTo(i + 4, 0);
    ctx.lineTo(i + 44, 64);
    ctx.stroke();
  }
  return tex(c, { srgb: false, repeat: [1, 10], aniso: 4 });
}

function makePlateTexture() {
  const { c, ctx } = canvas2d(1024, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#c9a068');
  g.addColorStop(0.45, '#a97e49');
  g.addColorStop(1, '#805c33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 240; i++) {
    ctx.fillStyle = `rgba(${i % 2 ? '255,240,210' : '40,28,14'},${0.02 + Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * 1024, Math.random() * 128, 2, 1);
  }
  ctx.strokeStyle = 'rgba(48,33,16,.65)';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, 1000, 104);
  ctx.fillStyle = 'rgba(30,20,9,.82)';
  ctx.textBaseline = 'middle';
  ctx.font = '600 34px Bahnschrift, "Arial Narrow", sans-serif';
  ctx.fillText('LUYA CLUB · ROD ATELIER', 46, 52);
  ctx.font = '500 17px Bahnschrift, "Arial Narrow", sans-serif';
  ctx.fillStyle = 'rgba(38,26,12,.72)';
  ctx.fillText('SOUTH CHINA SEA  —  CONCEPT RODS 01–05  —  NOT FOR SALE', 46, 90);
  ctx.textAlign = 'right';
  ctx.font = '300 54px Bahnschrift, "Arial Narrow", sans-serif';
  ctx.fillStyle = 'rgba(244,226,190,.32)';
  ctx.fillText('05', 990, 66);
  return tex(c, { repeat: null, aniso: 8 });
}

function makeChartTexture() {
  const { c, ctx } = canvas2d(512, 512);
  ctx.fillStyle = '#d8ccb0';
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = 'rgba(150,130,96,.18)';
  for (let i = 0; i < 1500; i++) ctx.fillRect(Math.random() * 512, Math.random() * 512, 1, 1);
  // depth contours
  for (let k = 0; k < 14; k++) {
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 12) {
      const y = 60 + k * 29 + Math.sin(x * 0.014 + k * 1.7) * (9 + k * 1.2);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = k % 4 === 0 ? 'rgba(84,104,96,.42)' : 'rgba(110,120,104,.22)';
    ctx.lineWidth = k % 4 === 0 ? 1.4 : 0.8;
    ctx.stroke();
  }
  // survey route
  ctx.beginPath();
  ctx.moveTo(60, 400);
  ctx.bezierCurveTo(150, 310, 240, 370, 318, 250);
  ctx.bezierCurveTo(370, 176, 430, 190, 460, 120);
  ctx.strokeStyle = 'rgba(150,82,58,.72)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [x, y] of [[60, 400], [318, 250], [460, 120]]) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(150,82,58,.8)';
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(42,54,50,.66)';
  ctx.font = '600 18px Bahnschrift, sans-serif';
  ctx.fillText('SOUTH CHINA SEA', 34, 44);
  ctx.font = '500 12px Bahnschrift, sans-serif';
  ctx.fillStyle = 'rgba(42,54,50,.45)';
  ctx.fillText('18°11′N  109°42′E   ·   LUYA SURVEY 07', 34, 66);
  ctx.strokeStyle = 'rgba(42,54,50,.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, 472, 472);
  return tex(c, { repeat: null, aniso: 4 });
}

// =============================================================================
// geometry helpers
// =============================================================================
function transformGeo(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  TMP_E.set(rx, ry, rz);
  TMP_Q.setFromEuler(TMP_E);
  TMP_M.compose(TMP_V1.set(x, y, z), TMP_Q, TMP_S.set(sx, sy, sz));
  geo.applyMatrix4(TMP_M);
  return geo;
}

function mergeGeoms(list) {
  let vCount = 0;
  let iCount = 0;
  let hasNormal = true;
  let hasUv = true;
  let hasColor = true;
  for (const g of list) {
    const p = g.getAttribute('position');
    vCount += p.count;
    iCount += g.index ? g.index.count : p.count;
    if (!g.getAttribute('normal')) hasNormal = false;
    if (!g.getAttribute('uv')) hasUv = false;
    if (!g.getAttribute('color')) hasColor = false;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = hasNormal ? new Float32Array(vCount * 3) : null;
  const uv = hasUv ? new Float32Array(vCount * 2) : null;
  const col = hasColor ? new Float32Array(vCount * 3) : null;
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    pos.set(p.array, vo * 3);
    if (nor) nor.set(g.getAttribute('normal').array, vo * 3);
    if (uv) uv.set(g.getAttribute('uv').array, vo * 2);
    if (col) col.set(g.getAttribute('color').array, vo * 3);
    if (g.index) {
      const a = g.index.array;
      for (let k = 0; k < a.length; k++) idx[io + k] = a[k] + vo;
      io += a.length;
    } else {
      for (let k = 0; k < p.count; k++) idx[io + k] = vo + k;
      io += p.count;
    }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (nor) out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Tapered carbon blank, colours baked per-vertex (base + thread wraps). */
function buildBlankGeometry(L, palette, guideYs) {
  const rButt = 0.0285;
  const rTip = 0.011;
  const radial = 20;
  const strips = [];
  const push = (a, b, color, stripe = false) => {
    if (b - a < 0.0008) return;
    strips.push({ a, b, color, stripe });
  };

  push(0, 0.642, palette.blank, true);
  push(0.642, 0.712, palette.wrap);
  push(0.712, 0.722, palette.metal);
  let cursor = 0.722;
  for (let i = 0; i < guideYs.length; i++) {
    const y = guideYs[i];
    const half = 0.016 - i * 0.0011;
    if (y - half > cursor) push(cursor, y - half, palette.blank, true);
    push(y - half, y + half, palette.wrap);
    cursor = y + half;
  }
  push(cursor, L - 0.075, palette.blank, true);
  push(L - 0.075, L - 0.028, palette.blank, true);
  push(L - 0.028, L - 0.006, palette.wrap);
  push(L - 0.006, L, palette.metal);

  const stripeCol = new THREE.Color(palette.wrap).lerp(new THREE.Color(0xffffff), 0.3);
  const geos = [];
  for (const strip of strips) {
    const len = strip.b - strip.a;
    const seg = Math.max(1, Math.ceil(len / 0.05));
    const rings = seg + 1;
    const count = rings * radial;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color(strip.color);
    let vi = 0;
    for (let r = 0; r < rings; r++) {
      const y = strip.a + len * (r / seg);
      const t = Math.min(1, Math.max(0, y / L));
      const rad = rTip + (rButt - rTip) * Math.pow(1 - t, 1.2);
      for (let j = 0; j < radial; j++) {
        const ang = (j / radial) * Math.PI * 2;
        pos[vi * 3] = Math.sin(ang) * rad;
        pos[vi * 3 + 1] = y;
        pos[vi * 3 + 2] = Math.cos(ang) * rad;
        const cc = strip.stripe && j === 0 ? stripeCol : c;
        col[vi * 3] = cc.r;
        col[vi * 3 + 1] = cc.g;
        col[vi * 3 + 2] = cc.b;
        vi++;
      }
    }
    const idx = [];
    for (let r = 0; r < seg; r++) {
      for (let j = 0; j < radial; j++) {
        const j2 = (j + 1) % radial;
        const a = r * radial + j;
        const b = r * radial + j2;
        const cc = (r + 1) * radial + j2;
        const d = (r + 1) * radial + j;
        idx.push(a, b, d, b, cc, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
  }
  return mergeGeoms(geos);
}

function buildGripGeometry() {
  const rear = new THREE.LatheGeometry([
    new THREE.Vector2(0.028, 0.018),
    new THREE.Vector2(0.034, 0.050),
    new THREE.Vector2(0.036, 0.110),
    new THREE.Vector2(0.0345, 0.220),
    new THREE.Vector2(0.031, 0.320),
    new THREE.Vector2(0.033, 0.400),
    new THREE.Vector2(0.030, 0.432),
  ], 16);
  const fore = new THREE.LatheGeometry([
    new THREE.Vector2(0.027, 0.548),
    new THREE.Vector2(0.0305, 0.574),
    new THREE.Vector2(0.030, 0.606),
    new THREE.Vector2(0.026, 0.642),
  ], 16);
  return mergeGeoms([rear, fore]);
}

function buildHardwareGeometries() {
  const dark = [];
  const bright = [];
  const knobs = [];
  const add = (arr, g) => arr.push(g);

  // butt cap + winding check
  add(dark, transformGeo(new THREE.CylinderGeometry(0.038, 0.035, 0.03, 18), 0, 0.015, 0));
  add(dark, transformGeo(new THREE.CylinderGeometry(0.035, 0.038, 0.012, 18), 0, 0.034, 0));
  add(bright, transformGeo(new THREE.TorusGeometry(0.032, 0.0035, 6, 18), 0, 0.436, 0, Math.PI / 2, 0, 0));

  // reel seat
  add(dark, transformGeo(new THREE.CylinderGeometry(0.029, 0.029, 0.132, 16), 0, 0.500, 0));
  add(bright, transformGeo(new THREE.TorusGeometry(0.031, 0.005, 6, 20), 0, 0.436, 0, Math.PI / 2, 0, 0));
  add(bright, transformGeo(new THREE.TorusGeometry(0.031, 0.005, 6, 20), 0, 0.565, 0, Math.PI / 2, 0, 0));

  // reel stem + body + rotor + spool (spool axis is +Z, toward the viewer)
  add(dark, transformGeo(new THREE.BoxGeometry(0.022, 0.022, 0.1), 0, 0.48, 0.052, -0.55, 0, 0));
  add(dark, transformGeo(new THREE.CylinderGeometry(0.078, 0.067, 0.058, 22), 0, 0.425, 0.12, Math.PI / 2, 0, 0));
  add(dark, transformGeo(new THREE.CylinderGeometry(0.069, 0.059, 0.034, 20), 0, 0.425, 0.09, Math.PI / 2, 0, 0));
  add(bright, transformGeo(new THREE.CylinderGeometry(0.083, 0.083, 0.042, 24, 1, true), 0, 0.425, 0.168, Math.PI / 2, 0, 0));
  add(bright, transformGeo(new THREE.TorusGeometry(0.085, 0.004, 6, 28), 0, 0.425, 0.19));
  add(bright, transformGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 12), 0, 0.425, 0.2, Math.PI / 2, 0, 0));
  add(dark, transformGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.014, 14), 0, 0.447, 0.086, Math.PI / 2, 0, 0));
  add(dark, transformGeo(new THREE.CylinderGeometry(0.079, 0.079, 0.012, 22), 0, 0.425, 0.193, Math.PI / 2, 0, 0));
  add(dark, transformGeo(new THREE.TorusGeometry(0.094, 0.0055, 5, 22, Math.PI * 1.28), 0, 0.425, 0.198, 0, 0, 0.65));
  add(dark, transformGeo(new THREE.SphereGeometry(0.012, 10, 8), 0.012, 0.425, 0.204));

  // handle arm + knob
  add(dark, transformGeo(new THREE.BoxGeometry(0.012, 0.12, 0.012), 0.07, 0.315, 0.13, 0, 0, 0.62));
  add(knobs, transformGeo(new THREE.SphereGeometry(0.018, 12, 10), 0.106, 0.253, 0.13));

  return {
    dark: mergeGeoms(dark),
    bright: mergeGeoms(bright),
    knobs: mergeGeoms(knobs),
  };
}

function buildGuideGeometry() {
  const ring = new THREE.TorusGeometry(1, 0.075, 5, 16);
  transformGeo(ring, 0, 0, 2.6, Math.PI / 2, 0, 0);
  const foot = new THREE.BoxGeometry(0.11, 0.15, 1.9);
  transformGeo(foot, 0, 0, 0.95);
  return mergeGeoms([ring, foot]);
}

// =============================================================================
// scene
// =============================================================================
export function createShop(engine, appState, ctx = {}) {
  const group = new THREE.Group();
  group.name = 'rod-atelier';
  group.position.copy(WORLD.shop.center);
  group.rotation.y = GROUP_YAW;
  group.visible = false;
  engine.scene.add(group);

  const rand = mulberry32(0xa6e1c7);
  const wood = makeWoodTextures();
  const streakTex = makeStreakTexture();
  const glowTex = makeGlowTexture();
  const softGlowTex = makeGlowTexture(0.05, 0.5);
  const ropeBump = makeRopeBump();
  const plateTex = makePlateTexture();
  const chartTex = makeChartTexture();

  // ---------- materials ----------
  const deckMat = new THREE.MeshPhysicalMaterial({
    map: wood.map,
    roughnessMap: wood.roughnessMap,
    bumpMap: wood.bumpMap,
    bumpScale: 0.024,
    roughness: 1.0,
    metalness: 0.05,
    envMapIntensity: 0.4,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
  });
  const plinthMat = new THREE.MeshPhysicalMaterial({
    map: wood.map.clone(),
    roughnessMap: wood.roughnessMap.clone(),
    bumpMap: wood.bumpMap.clone(),
    bumpScale: 0.018,
    roughness: 0.92,
    metalness: 0.04,
    envMapIntensity: 0.85,
    clearcoat: 0.4,
    clearcoatRoughness: 0.28,
  });
  plinthMat.map.repeat.set(1, 0.35);
  plinthMat.roughnessMap.repeat.set(1, 0.35);
  plinthMat.bumpMap.repeat.set(1, 0.35);
  plinthMat.map.needsUpdate = true;
  plinthMat.roughnessMap.needsUpdate = true;
  plinthMat.bumpMap.needsUpdate = true;

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc79a63, metalness: 0.95, roughness: 0.27, envMapIntensity: 1.45,
  });
  const brassDarkMat = new THREE.MeshStandardMaterial({
    color: 0x94703f, metalness: 0.9, roughness: 0.36, envMapIntensity: 1.2,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x2a3031, metalness: 0.85, roughness: 0.38, envMapIntensity: 1.0,
  });
  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0xb7a77f, roughness: 0.95, metalness: 0.0, bumpMap: ropeBump, bumpScale: 0.008,
  });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3e2a1d, roughness: 0.58, metalness: 0.04 });
  const canvasMat = new THREE.MeshStandardMaterial({ color: 0xc9bc9c, roughness: 0.92, metalness: 0.0 });
  const glassWarmMat = new THREE.MeshStandardMaterial({
    color: 0xffd7a0, emissive: 0xffab5c, emissiveIntensity: 3.2, roughness: 0.32, metalness: 0.1,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0xffc98d, emissive: 0xffa95e, emissiveIntensity: 1.8, roughness: 0.5,
  });
  const darkRubberMat = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.88, metalness: 0.0 });
  const silverMat = new THREE.MeshStandardMaterial({
    color: 0x9a9d99, metalness: 0.85, roughness: 0.3, envMapIntensity: 0.8,
  });

  // fake contact shadow material factory (needs a new map per opacity use)
  const shadowTex = makeGlowTexture(0.2, 0.6);
  function shadowPlane(w, d, opacity = 0.45) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({
        map: shadowTex, transparent: true, opacity, depthWrite: false,
        color: 0x000000, blending: THREE.NormalBlending,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    return m;
  }

  // ===========================================================================
  // pontoon deck
  // ===========================================================================
  const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_W, DECK_T, DECK_D), deckMat);
  deck.position.y = DECK_TOP - DECK_T / 2;
  group.add(deck);

  // deck fascia + brass edge trim
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(DECK_W + 0.12, 0.24, DECK_D + 0.12), darkMetalMat);
  fascia.position.y = DECK_TOP - DECK_T - 0.1;
  group.add(fascia);
  // deck edge trim: a thin frame around the planks (not a slab over them)
  const edgeTrimGeos = [
    transformGeo(new THREE.BoxGeometry(DECK_W + 0.14, 0.032, 0.06), 0, DECK_TOP - 0.014, DECK_D / 2 + 0.04),
    transformGeo(new THREE.BoxGeometry(DECK_W + 0.14, 0.032, 0.06), 0, DECK_TOP - 0.014, -DECK_D / 2 - 0.04),
    transformGeo(new THREE.BoxGeometry(0.06, 0.032, DECK_D + 0.14), DECK_W / 2 + 0.04, DECK_TOP - 0.014, 0),
    transformGeo(new THREE.BoxGeometry(0.06, 0.032, DECK_D + 0.14), -DECK_W / 2 - 0.04, DECK_TOP - 0.014, 0),
  ];
  const edgeTrim = new THREE.Mesh(mergeGeoms(edgeTrimGeos), brassDarkMat);
  group.add(edgeTrim);

  // floats under the deck
  const floatGeo = new THREE.CylinderGeometry(0.34, 0.34, DECK_W - 0.4, 14);
  const floatMat = new THREE.MeshStandardMaterial({ color: 0x121c1d, roughness: 0.62, metalness: 0.15 });
  for (const fz of [-1.15, 1.15]) {
    const f = new THREE.Mesh(floatGeo, floatMat);
    f.rotation.z = Math.PI / 2;
    f.position.set(0, DECK_TOP - 0.62, fz);
    group.add(f);
  }

  // wet puddles (glossy, environment-reflecting) — standard material instead of
  // clearcoat physical: the two physical variants were the only shader compile
  // left on the first rack frame, and the difference is invisible at this scale.
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x0a1416, roughness: 0.08, metalness: 0.32, transparent: true, opacity: 0.26,
    envMapIntensity: 1.5, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const puddleGeos = [];
  for (const [px, pz, sx, sz] of [[-2.5, 1.98, 1.55, 0.36], [1.6, 1.92, 1.05, 0.28], [-5.1, 1.0, 0.8, 0.26]]) {
    const g = new THREE.CircleGeometry(1, 22);
    transformGeo(g, px, DECK_TOP + 0.004, pz, -Math.PI / 2, 0, 0, sx, sz, 1);
    puddleGeos.push(g);
  }
  const puddles = new THREE.Mesh(mergeGeoms(puddleGeos), puddleMat);
  puddles.renderOrder = 1;
  group.add(puddles);

  // long wet strip along the near deck edge (reads as standing water)
  const wetStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(9.4, 0.5),
    new THREE.MeshStandardMaterial({
      color: 0x071012, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.42,
      envMapIntensity: 1.7, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }),
  );
  wetStrip.rotation.x = -Math.PI / 2;
  wetStrip.position.set(-0.2, DECK_TOP + 0.005, 2.03);
  wetStrip.renderOrder = 1;
  group.add(wetStrip);

  // contact shadows under the big volumes
  const deckShade = shadowPlane(8.8, 1.65, 0.42);
  deckShade.position.set(PLINTH_X, DECK_TOP + 0.006, PLINTH_Z);
  group.add(deckShade);

  // ===========================================================================
  // atelier display table: slim teak top on brass legs, rods in brass cups
  // ===========================================================================
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(PLINTH_W, 0.16, PLINTH_D), plinthMat);
  tableTop.position.set(PLINTH_X, PLINTH_TOP - 0.08, PLINTH_Z);
  group.add(tableTop);

  // dark leather-ish inlay where the rods sit
  const inlay = new THREE.Mesh(
    new THREE.BoxGeometry(PLINTH_W - 0.16, 0.014, PLINTH_D - 0.14),
    new THREE.MeshStandardMaterial({ color: 0x0c100f, roughness: 0.62, metalness: 0.06, envMapIntensity: 0.5 }),
  );
  inlay.position.set(PLINTH_X, PLINTH_TOP + 0.002, PLINTH_Z - 0.02);
  group.add(inlay);

  const tableGeos = [];
  // brass edge trim on the tabletop
  tableGeos.push(
    transformGeo(new THREE.BoxGeometry(PLINTH_W + 0.03, 0.03, 0.024), PLINTH_X, PLINTH_TOP - 0.012, PLINTH_Z + PLINTH_D / 2),
    transformGeo(new THREE.BoxGeometry(PLINTH_W + 0.03, 0.03, 0.024), PLINTH_X, PLINTH_TOP - 0.012, PLINTH_Z - PLINTH_D / 2),
    transformGeo(new THREE.BoxGeometry(0.024, 0.03, PLINTH_D), PLINTH_X - PLINTH_W / 2, PLINTH_TOP - 0.012, PLINTH_Z),
    transformGeo(new THREE.BoxGeometry(0.024, 0.03, PLINTH_D), PLINTH_X + PLINTH_W / 2, PLINTH_TOP - 0.012, PLINTH_Z),
  );
  // brass legs + feet + stretcher
  const legXs = [PLINTH_X - 3.32, PLINTH_X, PLINTH_X + 3.32];
  for (const lx of legXs) {
    for (const lz of [PLINTH_Z - 0.27, PLINTH_Z + 0.27]) {
      tableGeos.push(
        transformGeo(new THREE.CylinderGeometry(0.032, 0.036, 0.62, 10), lx, DECK_TOP + 0.31, lz),
        transformGeo(new THREE.CylinderGeometry(0.06, 0.07, 0.032, 12), lx, DECK_TOP + 0.016, lz),
        transformGeo(new THREE.SphereGeometry(0.038, 10, 8), lx, DECK_TOP + 0.63, lz),
      );
    }
  }
  for (const lz of [PLINTH_Z - 0.27, PLINTH_Z + 0.27]) {
    tableGeos.push(transformGeo(new THREE.CylinderGeometry(0.016, 0.016, PLINTH_W - 0.5, 8), PLINTH_X, DECK_TOP + 0.2, lz, 0, 0, Math.PI / 2));
  }
  const tableMetal = new THREE.Mesh(mergeGeoms(tableGeos), brassMat);
  group.add(tableMetal);

  // warm LED strip tucked under the front lip + soft wash on the legs
  const led = new THREE.Mesh(
    new THREE.BoxGeometry(PLINTH_W - 0.24, 0.014, 0.014),
    ledMat,
  );
  led.position.set(PLINTH_X, PLINTH_TOP - 0.17, PLINTH_Z + PLINTH_D / 2 + 0.002);
  group.add(led);
  const ledWash = new THREE.Mesh(
    new THREE.PlaneGeometry(PLINTH_W - 0.3, 0.46),
    new THREE.MeshBasicMaterial({
      map: glowTex, color: 0xffb877, transparent: true, opacity: 0.09,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  ledWash.position.set(PLINTH_X, PLINTH_TOP - 0.4, PLINTH_Z + PLINTH_D / 2 + 0.012);
  ledWash.renderOrder = 2;
  group.add(ledWash);

  // engraved brass plate inlaid on the table front
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.33),
    new THREE.MeshStandardMaterial({
      map: plateTex, metalness: 0.68, roughness: 0.36, envMapIntensity: 1.3,
      emissive: 0xffffff, emissiveMap: plateTex, emissiveIntensity: 0.2,
    }),
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(PLINTH_X, PLINTH_TOP + 0.007, PLINTH_Z + 0.26);
  group.add(plate);

  // brass rod cups
  const cupGeos = [];
  for (const rx of ROD_XS) {
    cupGeos.push(transformGeo(new THREE.CylinderGeometry(0.052, 0.043, 0.075, 16, 1, true), rx, PLINTH_TOP + 0.038, ROD_Z));
    cupGeos.push(transformGeo(new THREE.TorusGeometry(0.052, 0.006, 6, 20), rx, PLINTH_TOP + 0.075, ROD_Z, Math.PI / 2, 0, 0));
    cupGeos.push(transformGeo(new THREE.CylinderGeometry(0.043, 0.043, 0.012, 16), rx, PLINTH_TOP + 0.007, ROD_Z));
  }
  group.add(new THREE.Mesh(mergeGeoms(cupGeos), brassMat));

  // small shadows under each rod (baked into one mesh)
  const rodShadowGeos = [];
  {
    const plane = new THREE.PlaneGeometry(0.8, 0.8);
    transformGeo(plane, 0, 0, 0, -Math.PI / 2, 0, 0);
    for (const rx of ROD_XS) {
      const g = plane.clone();
      transformGeo(g, rx, PLINTH_TOP + 0.032, ROD_Z);
      rodShadowGeos.push(g);
    }
  }
  const rodShadows = new THREE.Mesh(mergeGeoms(rodShadowGeos), new THREE.MeshBasicMaterial({
    map: shadowTex, color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false,
  }));
  rodShadows.renderOrder = 2;
  group.add(rodShadows);

  // ===========================================================================
  // railing (back + rear sides only, so nothing floats in front of the rods)
  // ===========================================================================
  const railPostPositions = [];
  const railGeos = [];
  const halfW = DECK_W / 2 - 0.12;
  const halfD = DECK_D / 2 - 0.12;
  for (const x of [-halfW, -3.1, 0, 3.1, halfW]) railPostPositions.push([x, -halfD]);
  for (const sx of [-1, 1]) railPostPositions.push([sx * halfW, -1.2]);

  // posts (cylinder + ball finial baked together)
  const postGeos = railPostPositions.map(([x, z]) => {
    const g = mergeGeoms([
      transformGeo(new THREE.CylinderGeometry(0.026, 0.03, 1.05, 10), 0, 0.525, 0),
      transformGeo(new THREE.SphereGeometry(0.034, 10, 8), 0, 1.065, 0),
      transformGeo(new THREE.CylinderGeometry(0.055, 0.06, 0.032, 10), 0, 0.016, 0),
    ]);
    return transformGeo(g, x, DECK_TOP, z);
  });
  group.add(new THREE.Mesh(mergeGeoms(postGeos), brassDarkMat));

  // back rail + short rear side rails, two heights
  const sideRailStart = -halfD;
  const sideRailEnd = -1.2;
  for (const h of [1.02, 0.56]) {
    railGeos.push(transformGeo(new THREE.CylinderGeometry(0.018, 0.018, halfW * 2, 8), 0, DECK_TOP + h, -halfD, 0, 0, Math.PI / 2));
    for (const sx of [-1, 1]) {
      const len = sideRailEnd - sideRailStart;
      railGeos.push(transformGeo(new THREE.CylinderGeometry(0.018, 0.018, len, 8), sx * halfW, DECK_TOP + h, (sideRailStart + sideRailEnd) / 2, Math.PI / 2, 0, 0));
    }
  }
  group.add(new THREE.Mesh(mergeGeoms(railGeos), brassMat));

  // rope swags between back posts + short swags on the rear sides + mooring lines
  const ropeGeos = [];
  const backX = [-halfW, -3.1, 0, 3.1, halfW];
  for (let i = 0; i < backX.length - 1; i++) {
    const x0 = backX[i];
    const x1 = backX[i + 1];
    const sag = 0.14 + Math.abs(x1 - x0) * 0.05;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push(new THREE.Vector3(
        x0 + (x1 - x0) * t,
        DECK_TOP + 0.98 - Math.sin(t * Math.PI) * sag,
        -halfD * 0.985,
      ));
    }
    ropeGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.011, 5, false));
  }
  for (const sx of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push(new THREE.Vector3(
        sx * halfW * 0.985,
        DECK_TOP + 0.98 - Math.sin(t * Math.PI) * 0.1,
        sideRailStart + (sideRailEnd - sideRailStart) * t,
      ));
    }
    ropeGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.011, 5, false));
    // slack mooring line from the end post down to a deck cleat
    const moor = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      moor.push(new THREE.Vector3(
        sx * (halfW - 0.25 * t),
        DECK_TOP + 1.0 - t * 0.84 - Math.sin(t * Math.PI) * 0.12,
        sideRailEnd + t * 0.75,
      ));
    }
    ropeGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(moor), 9, 0.012, 5, false));
  }
  // coils resting on the deck
  for (let c = 0; c < 3; c++) {
    const coil = new THREE.TorusGeometry(0.22 + c * 0.015, 0.014, 5, 22);
    transformGeo(coil, -2.25, DECK_TOP + 0.026 + c * 0.026, 1.98, -Math.PI / 2, 0, 0.2 + c * 0.6);
    ropeGeos.push(coil);
  }
  for (let c = 0; c < 2; c++) {
    const coil = new THREE.TorusGeometry(0.19 + c * 0.02, 0.013, 5, 20);
    transformGeo(coil, -3.96, DECK_TOP + 0.026 + c * 0.026, 1.62, -Math.PI / 2, 0, 0.9 + c * 0.5);
    ropeGeos.push(coil);
  }
  // a rope loop hung from the left rail post
  {
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const a = t * Math.PI * 2;
      pts.push(new THREE.Vector3(
        -halfW + 0.18 + Math.cos(a) * 0.13,
        DECK_TOP + 0.72 - t * 0.32,
        -1.2 + Math.sin(a) * 0.06,
      ));
    }
    ropeGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.011, 5, false));
  }
  group.add(new THREE.Mesh(mergeGeoms(ropeGeos), ropeMat));

  // deck cleats under the mooring lines
  const cleatGeos = [];
  for (const sx of [-1, 1]) {
    cleatGeos.push(
      transformGeo(new THREE.BoxGeometry(0.28, 0.035, 0.06), sx * (halfW - 0.3), DECK_TOP + 0.09, -0.42),
      transformGeo(new THREE.CylinderGeometry(0.035, 0.045, 0.075, 8), sx * (halfW - 0.3), DECK_TOP + 0.05, -0.42),
    );
  }
  group.add(new THREE.Mesh(mergeGeoms(cleatGeos), brassMat));

  // display lamp posts at both ends of the plinth (warm opal globes)
  const lampPostGeos = [];
  const lampGlobeGeos = [];
  const lampXs = [PLINTH_X - PLINTH_W / 2 + 0.18, PLINTH_X + PLINTH_W / 2 - 0.18];
  for (const lx of lampXs) {
    const lz = PLINTH_Z - 0.36;
    lampPostGeos.push(
      transformGeo(new THREE.CylinderGeometry(0.022, 0.026, 1.32, 10), lx, PLINTH_TOP + 0.66, lz),
      transformGeo(new THREE.TorusGeometry(0.05, 0.008, 5, 16), lx, PLINTH_TOP + 1.31, lz, Math.PI / 2, 0, 0),
      transformGeo(new THREE.CylinderGeometry(0.06, 0.045, 0.03, 12), lx, PLINTH_TOP + 1.35, lz),
    );
    const globe = new THREE.SphereGeometry(0.062, 14, 10);
    transformGeo(globe, lx, PLINTH_TOP + 1.41, lz);
    lampGlobeGeos.push(globe);
  }
  group.add(new THREE.Mesh(mergeGeoms(lampPostGeos), brassMat));
  group.add(new THREE.Mesh(mergeGeoms(lampGlobeGeos), glassWarmMat));

  // ===========================================================================
  // deck still-life: lantern on a teak tray, chart, rod case
  // ===========================================================================
  const lanternX = -4.95;
  const lanternZ = 1.98;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.045, 0.48), plinthMat);
  tray.position.set(lanternX, DECK_TOP + 0.022, lanternZ);
  tray.rotation.y = 0.08;
  group.add(tray);

  const lanternGeos = [
    transformGeo(new THREE.CylinderGeometry(0.105, 0.115, 0.035, 14), 0, 0.017, 0),
    transformGeo(new THREE.CylinderGeometry(0.062, 0.08, 0.042, 14), 0, 0.25, 0),
    transformGeo(new THREE.CylinderGeometry(0.024, 0.035, 0.05, 10), 0, 0.29, 0),
    transformGeo(new THREE.TorusGeometry(0.075, 0.007, 5, 18), 0, 0.36, 0, Math.PI / 2, 0, 0),
    transformGeo(new THREE.TorusGeometry(0.045, 0.006, 5, 14, Math.PI), 0, 0.40, 0, 0, Math.PI / 2, 0),
  ];
  const lanternBody = new THREE.Mesh(mergeGeoms(lanternGeos), brassDarkMat);
  const lanternGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.083, 0.17, 14, 1, true), glassWarmMat);
  lanternGlass.position.y = 0.132;
  const lantern = new THREE.Group();
  lantern.add(lanternBody, lanternGlass);
  lantern.position.set(lanternX, DECK_TOP + 0.045, lanternZ);
  group.add(lantern);

  const lanternLight = new THREE.PointLight(0xffa95e, 6.0, 3.4, 2.0);
  lanternLight.position.set(lanternX, DECK_TOP + 0.32, lanternZ + 0.06);
  group.add(lanternLight);

  // chart weighed down on the planks
  const chart = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.64),
    new THREE.MeshStandardMaterial({ map: chartTex, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide }),
  );
  chart.rotation.x = -Math.PI / 2;
  chart.rotation.z = 0.2;
  chart.position.set(-3.45, DECK_TOP + 0.008, 2.02);
  group.add(chart);
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.055, 16), brassMat);
  weight.position.set(-3.0, DECK_TOP + 0.036, 2.14);
  group.add(weight);

  // leather rod case lying in the foreground
  const caseGroup = new THREE.Group();
  const caseBody = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.155, 1.65, 16), leatherMat);
  caseBody.rotation.z = Math.PI / 2;
  const caseCapA = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.06, 16), brassDarkMat);
  caseCapA.rotation.z = Math.PI / 2;
  caseCapA.position.x = 0.86;
  const caseCapB = caseCapA.clone();
  caseCapB.position.x = -0.86;
  const caseStrap = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.011, 5, 18), leatherMat);
  caseStrap.rotation.y = Math.PI / 2;
  caseStrap.position.x = 0.32;
  caseGroup.add(caseBody, caseCapA, caseCapB, caseStrap);
  caseGroup.position.set(0.25, DECK_TOP + 0.16, 2.02);
  caseGroup.rotation.y = 0.16;
  caseGroup.rotation.z = 0.02;
  group.add(caseGroup);

  // a pair of cream fenders hanging on the side rail
  const fenderMat = new THREE.MeshStandardMaterial({ color: 0xd9cfb4, roughness: 0.7, metalness: 0.02 });
  const fenderGeos = [];
  for (const fz of [-1.7, -1.1]) {
    fenderGeos.push(transformGeo(new THREE.CapsuleGeometry(0.085, 0.3, 6, 12), -halfW - 0.08, DECK_TOP + 0.5, fz));
  }
  group.add(new THREE.Mesh(mergeGeoms(fenderGeos), fenderMat));

  // low teak bench on the open right side of the pontoon
  {
    const bx = 4.15;
    const bz = 0.7;
    const benchWood = [];
    benchWood.push(transformGeo(new THREE.BoxGeometry(1.95, 0.075, 0.52), bx, DECK_TOP + 0.45, bz));
    for (const sx of [-0.78, 0, 0.78]) {
      benchWood.push(transformGeo(new THREE.BoxGeometry(0.42, 0.06, 0.08), bx + sx, DECK_TOP + 0.47, bz + 0.24));
      benchWood.push(transformGeo(new THREE.BoxGeometry(0.42, 0.06, 0.08), bx + sx, DECK_TOP + 0.47, bz - 0.24));
    }
    // back rest
    benchWood.push(transformGeo(new THREE.BoxGeometry(1.95, 0.06, 0.13), bx, DECK_TOP + 0.88, bz - 0.26));
    benchWood.push(transformGeo(new THREE.BoxGeometry(1.95, 0.05, 0.11), bx, DECK_TOP + 0.7, bz - 0.26));
    const benchMesh = new THREE.Mesh(mergeGeoms(benchWood), plinthMat);
    group.add(benchMesh);
    const benchMetal = [];
    for (const sx of [-0.82, 0.82]) {
      for (const sz of [-0.2, 0.2]) {
        benchMetal.push(transformGeo(new THREE.CylinderGeometry(0.026, 0.03, 0.44, 8), bx + sx, DECK_TOP + 0.22, bz + sz));
      }
      benchMetal.push(transformGeo(new THREE.BoxGeometry(0.035, 0.6, 0.035), bx + sx, DECK_TOP + 0.62, bz - 0.27, 0.1, 0, 0));
    }
    group.add(new THREE.Mesh(mergeGeoms(benchMetal), brassDarkMat));
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.1, 0.4), canvasMat);
    blanket.position.set(bx - 0.45, DECK_TOP + 0.535, bz + 0.02);
    blanket.rotation.y = 0.12;
    group.add(blanket);
  }

  // teak crates stacked near the right end of the table
  {
    const cx = 2.95;
    const cz = 1.88;
    const crateWood = [
      transformGeo(new THREE.BoxGeometry(0.9, 0.52, 0.6), cx, DECK_TOP + 0.27, cz, 0, 0.08, 0),
      transformGeo(new THREE.BoxGeometry(0.58, 0.34, 0.44), cx - 0.03, DECK_TOP + 0.7, cz + 0.02, 0, 0.22, 0),
    ];
    const crateMesh = new THREE.Mesh(mergeGeoms(crateWood), plinthMat);
    group.add(crateMesh);
    const crateTrim = [];
    for (const [y, h] of [[0.08, 0.52], [0.46, 0.12]]) {
      crateTrim.push(
        transformGeo(new THREE.BoxGeometry(0.93, 0.028, 0.63), cx, DECK_TOP + y, cz, 0, 0.08, 0),
        transformGeo(new THREE.BoxGeometry(0.028, h, 0.028), cx - 0.44, DECK_TOP + 0.27, cz - 0.3, 0, 0.08, 0),
        transformGeo(new THREE.BoxGeometry(0.028, h, 0.028), cx + 0.44, DECK_TOP + 0.27, cz + 0.3, 0, 0.08, 0),
      );
    }
    crateTrim.push(transformGeo(new THREE.BoxGeometry(0.61, 0.026, 0.47), cx - 0.03, DECK_TOP + 0.54, cz + 0.02, 0, 0.22, 0));
    group.add(new THREE.Mesh(mergeGeoms(crateTrim), brassDarkMat));
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.055, 0.3), canvasMat);
    cloth.position.set(cx - 0.04, DECK_TOP + 0.9, cz + 0.02);
    cloth.rotation.y = 0.22;
    group.add(cloth);
  }

  // ===========================================================================
  // five concept rods
  // ===========================================================================
  const hardware = buildHardwareGeometries();
  const guideProto = buildGuideGeometry();
  const gripProto = buildGripGeometry();

  const rodPivots = [];
  const rodRuntime = [];
  const guideMatrices = [];
  const guideCount = 8;

  // shared instanced metal sets (5 rods, 3 sets) — matrices + instance colours
  const reelDark = new THREE.InstancedMesh(hardware.dark, new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: 0.72, roughness: 0.42, envMapIntensity: 0.45,
  }), RODS.length);
  const reelBright = new THREE.InstancedMesh(hardware.bright, new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: 0.62, roughness: 0.4, envMapIntensity: 0.45,
  }), RODS.length);
  const reelKnobs = new THREE.InstancedMesh(hardware.knobs, new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.9, metalness: 0.0,
  }), RODS.length);
  const gripMesh = new THREE.InstancedMesh(gripProto, new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.86, metalness: 0.0,
    bumpMap: ropeBump, bumpScale: 0.0025,
  }), RODS.length);
  reelDark.frustumCulled = false;
  reelBright.frustumCulled = false;
  reelKnobs.frustumCulled = false;
  gripMesh.frustumCulled = false;

  const tipPositions = new Float32Array(RODS.length * 3);
  const tipColors = new Float32Array(RODS.length * 3);
  const tipSizes = new Float32Array(RODS.length);
  const tipGlow = new Float32Array(RODS.length);

  for (let i = 0; i < RODS.length; i++) {
    const spec = RODS[i];
    const L = spec.lengthM * ROD_SCALE;
    const lean = spec.visual.lean;
    const yaw = spec.visual.yaw;
    const basePos = new THREE.Vector3(ROD_XS[i], ROD_BASE_Y, ROD_Z);
    const baseQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-lean, yaw, 0, 'YXZ'));
    const baseMat = new THREE.Matrix4().compose(basePos, baseQuat, new THREE.Vector3(1, 1, 1));

    // guide heights (denser toward the tip)
    const guideYs = [];
    for (let k = 0; k < guideCount; k++) {
      const t = k / (guideCount - 1);
      guideYs.push(GUIDE_START + (L - 0.115 - GUIDE_START) * Math.pow(t, 0.86));
    }
    guideYs.sort((a, b) => a - b);

    const blankGeo = buildBlankGeometry(L, spec.palette, guideYs);
    const sheenColor = new THREE.Color(spec.palette.wrap).lerp(new THREE.Color(0xffd9a8), 0.45);
    const blankMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.55, metalness: 0.03, clearcoat: 0.2,
      clearcoatRoughness: 0.4, envMapIntensity: 0.28,
      sheen: 0.12, sheenColor, sheenRoughness: 0.65,
      emissive: new THREE.Color(spec.palette.wrap), emissiveIntensity: 0.0,
    });
    const blank = new THREE.Mesh(blankGeo, blankMat);
    blank.frustumCulled = false;

    const pivot = new THREE.Group();
    pivot.position.copy(basePos);
    pivot.rotation.order = 'YXZ';
    pivot.rotation.set(-lean, yaw, 0);
    pivot.add(blank);
    group.add(pivot);
    rodPivots.push({ pivot, lean, yaw, phase: i * 1.37 + 0.4 });

    // instanced grip / reel hardware (static matrices, sway is imperceptible)
    gripMesh.setMatrixAt(i, baseMat);
    reelDark.setMatrixAt(i, baseMat);
    reelBright.setMatrixAt(i, baseMat);
    reelKnobs.setMatrixAt(i, baseMat);
    gripMesh.setColorAt(i, TMP_COLOR.set(spec.palette.grip));
    reelDark.setColorAt(i, TMP_COLOR.set(spec.palette.metal).multiplyScalar(0.58));
    reelBright.setColorAt(i, TMP_COLOR.set(spec.palette.metal).multiplyScalar(0.9));
    reelKnobs.setColorAt(i, TMP_COLOR.set(spec.palette.knob));

    // guides
    for (let k = 0; k < guideCount; k++) {
      const t = k / (guideCount - 1);
      const radius = 0.018 + 0.024 * Math.pow(1 - t, 1.2);
      const m = new THREE.Matrix4().makeTranslation(0, guideYs[k], 0);
      m.multiply(new THREE.Matrix4().makeScale(radius, radius, radius));
      guideMatrices.push({ m: new THREE.Matrix4().copy(baseMat).multiply(m), rod: i });
    }

    // tip position (world-local to the shop group)
    TMP_V1.set(0, L, 0).applyQuaternion(baseQuat).add(basePos);
    tipPositions[i * 3] = TMP_V1.x;
    tipPositions[i * 3 + 1] = TMP_V1.y;
    tipPositions[i * 3 + 2] = TMP_V1.z;
    TMP_COLOR.set(spec.palette.tip);
    tipColors[i * 3] = TMP_COLOR.r;
    tipColors[i * 3 + 1] = TMP_COLOR.g;
    tipColors[i * 3 + 2] = TMP_COLOR.b;
    tipSizes[i] = 0.14 + (spec.lengthM - 1.98) * 0.02;
    tipGlow[i] = 0.55;

    rodRuntime.push({
      spec, L, blank, blankMat, basePos, baseQuat, baseMat, guideYs,
      emissive: 0.0, targetEmissive: 0.03,
    });
  }

  // guide instancing
  const guides = new THREE.InstancedMesh(guideProto, silverMat, guideMatrices.length);
  guides.frustumCulled = false;
  for (let i = 0; i < guideMatrices.length; i++) guides.setMatrixAt(i, guideMatrices[i].m);
  guides.instanceMatrix.needsUpdate = true;
  group.add(guides);

  group.add(gripMesh, reelDark, reelBright, reelKnobs);

  // dark matte spool hubs (front face of each spinning reel)
  {
    const hubGeos = rodRuntime.map((r) => {
      const g = new THREE.CylinderGeometry(0.079, 0.079, 0.008, 22);
      transformGeo(g, 0, 0.425, 0.194, Math.PI / 2, 0, 0);
      g.applyMatrix4(r.baseMat);
      return g;
    });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x141719, roughness: 0.5, metalness: 0.2 });
    const hubs = new THREE.Mesh(mergeGeoms(hubGeos), hubMat);
    group.add(hubs);
  }
  gripMesh.instanceMatrix.needsUpdate = true;
  reelDark.instanceMatrix.needsUpdate = true;
  reelBright.instanceMatrix.needsUpdate = true;
  reelKnobs.instanceMatrix.needsUpdate = true;
  for (const m of [gripMesh, reelDark, reelBright, reelKnobs]) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  // ---------- tip glows (one draw, additive points) ----------
  const tipGeo = new THREE.BufferGeometry();
  tipGeo.setAttribute('position', new THREE.BufferAttribute(tipPositions, 3));
  tipGeo.setAttribute('aColor', new THREE.BufferAttribute(tipColors, 3));
  tipGeo.setAttribute('aSize', new THREE.BufferAttribute(tipSizes, 1));
  tipGeo.setAttribute('aGlow', new THREE.BufferAttribute(tipGlow, 1));
  const tipMat = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uTime: { value: 0 },
      uScale: { value: 1.0 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aGlow;
      uniform float uPixelRatio;
      uniform float uTime;
      uniform float uScale;
      varying vec3 vColor;
      varying float vGlow;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float pulse = 0.9 + 0.1 * sin(uTime * 1.7 + position.x * 0.7 + position.y);
        gl_PointSize = aSize * uScale * uPixelRatio * (900.0 / max(0.1, -mv.z)) * (0.75 + aGlow * 0.7) * pulse;
        vColor = aColor;
        vGlow = aGlow;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vGlow;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float a = smoothstep(0.5, 0.02, d);
        a = pow(a, 2.4);
        vec3 col = mix(vColor, vec3(1.0, 0.9, 0.72), 0.22 + vGlow * 0.2);
        gl_FragColor = vec4(col * (1.0 + vGlow * 0.9), a * 0.72);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const tips = new THREE.Points(tipGeo, tipMat);
  tips.frustumCulled = false;
  tips.renderOrder = 5;
  group.add(tips);

  // crisp emissive tip tops (one merged draw, picked up by bloom)
  const tipCoreGeos = [];
  for (let i = 0; i < RODS.length; i++) {
    const g = new THREE.SphereGeometry(0.009, 8, 6);
    transformGeo(g, tipPositions[i * 3], tipPositions[i * 3 + 1] + 0.012, tipPositions[i * 3 + 2]);
    tipCoreGeos.push(g);
  }
  const tipCores = new THREE.Mesh(mergeGeoms(tipCoreGeos), new THREE.MeshStandardMaterial({
    color: 0xffc080, emissive: 0xff8a3c, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.2,
  }));
  tipCores.frustumCulled = false;
  group.add(tipCores);

  // ===========================================================================
  // selection marker + focus light
  // ===========================================================================
  const markerGroup = new THREE.Group();
  const markerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.006, 6, 48),
    new THREE.MeshStandardMaterial({
      color: 0xcfa06a, emissive: 0xffb976, emissiveIntensity: 0.2, metalness: 0.8, roughness: 0.3,
    }),
  );
  markerRing.rotation.x = Math.PI / 2;
  markerGroup.add(markerRing);
  const markerGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.8),
    new THREE.MeshBasicMaterial({
      map: glowTex, color: 0xffc98a, transparent: true, opacity: 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  markerGlow.rotation.x = -Math.PI / 2;
  markerGroup.add(markerGlow);
  markerGroup.position.set(ROD_XS[1], PLINTH_TOP + 0.035, ROD_Z);
  group.add(markerGroup);

  const focusLight = new THREE.PointLight(0xffcf9c, 0.0, 4.2, 2.0);
  focusLight.position.set(ROD_XS[1], PLINTH_TOP + 1.6, ROD_Z + 0.25);
  group.add(focusLight);

  // a lure hanging from the selected rod tip (small, warm silhouette detail)
  const lurePivot = new THREE.Group();
  const lureLinePts = [
    new THREE.Vector3(0.015, -0.01, 0.02),
    new THREE.Vector3(0.035, -0.18, 0.05),
    new THREE.Vector3(0.03, -0.38, 0.06),
    // treble hook
    new THREE.Vector3(0.03, -0.44, 0.06), new THREE.Vector3(0.03, -0.51, 0.055),
    new THREE.Vector3(0.03, -0.44, 0.06), new THREE.Vector3(0.012, -0.5, 0.075),
    new THREE.Vector3(0.03, -0.44, 0.06), new THREE.Vector3(0.052, -0.5, 0.04),
  ];
  const lureLineGeo = new THREE.BufferGeometry().setFromPoints(lureLinePts);
  const lureLine = new THREE.LineSegments(lureLineGeo, new THREE.LineBasicMaterial({
    color: 0xd8cdb4, transparent: true, opacity: 0.42,
  }));
  lurePivot.add(lureLine);
  const lureBodyGeo = new THREE.SphereGeometry(0.045, 12, 9);
  lureBodyGeo.scale(0.7, 1.35, 0.45);
  const lureBody = new THREE.Mesh(lureBodyGeo, new THREE.MeshStandardMaterial({
    color: 0xd9ae6c, metalness: 0.9, roughness: 0.24, envMapIntensity: 1.2,
    emissive: 0x3a2408, emissiveIntensity: 0.6,
  }));
  lureBody.position.set(0.03, -0.415, 0.06);
  lurePivot.add(lureBody);
  // position uses the default selection (index 1); show()/select() re-anchor it
  lurePivot.position.set(tipPositions[3], tipPositions[4], tipPositions[5]);
  group.add(lurePivot);

  // ===========================================================================
  // fake wet reflections on the deck + plinth top
  // ===========================================================================
  function makeReflectionInstances(count, width, length, colorMul) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: streakTex, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    mesh.userData.width = width;
    mesh.userData.length = length;
    mesh.userData.colorMul = colorMul;
    for (let i = 0; i < count; i++) {
      TMP_COLOR.set(RODS[i].palette.wrap).multiplyScalar(colorMul);
      mesh.setColorAt(i, TMP_COLOR);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    return mesh;
  }
  const deckReflections = makeReflectionInstances(RODS.length, 0.38, 0.6, 0.9);
  const plinthReflections = makeReflectionInstances(RODS.length, 0.2, 0.62, 1.15);
  const deckReflBase = ROD_XS.map((x) => ({ x, y: DECK_TOP + 0.012, z: PLINTH_Z + PLINTH_D / 2 + 0.09 }));
  const plinthReflBase = ROD_XS.map((x) => ({ x, y: PLINTH_TOP + 0.014, z: ROD_Z - 0.02 }));

  function updateReflections(camLX, camLZ) {
    for (let i = 0; i < ROD_XS.length; i++) {
      // deck streak: from the plinth base toward the viewer
      let bx = deckReflBase[i].x;
      let bz = deckReflBase[i].z;
      let dx = camLX - bx;
      let dz = camLZ - bz;
      let len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const dLen = deckReflections.userData.length;
      const dW = deckReflections.userData.width;
      TMP_V1.set(bx + dx * dLen * 0.5, deckReflBase[i].y, bz + dz * dLen * 0.5);
      TMP_Q.setFromAxisAngle(UP, Math.atan2(dx, dz));
      TMP_M.compose(TMP_V1, TMP_Q, TMP_S.set(dW, 1, dLen));
      deckReflections.setMatrixAt(i, TMP_M);

      // plinth-top streak: shorter, brighter
      bx = plinthReflBase[i].x;
      bz = plinthReflBase[i].z;
      dx = camLX - bx;
      dz = camLZ - bz;
      len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const pLen = plinthReflections.userData.length;
      const pW = plinthReflections.userData.width;
      TMP_V1.set(bx + dx * pLen * 0.5, plinthReflBase[i].y, bz + dz * pLen * 0.5);
      TMP_Q.setFromAxisAngle(UP, Math.atan2(dx, dz));
      TMP_M.compose(TMP_V1, TMP_Q, TMP_S.set(pW, 1, pLen));
      plinthReflections.setMatrixAt(i, TMP_M);
    }
    deckReflections.instanceMatrix.needsUpdate = true;
    plinthReflections.instanceMatrix.needsUpdate = true;
  }
  updateReflections(0, 11.5);

  // ===========================================================================
  // warm haze band at the horizon behind the pontoon + marine dust
  // ===========================================================================
  const horizonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softGlowTex, color: 0xffb87a, transparent: true, opacity: 0.24,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  horizonGlow.scale.set(36, 6.5, 1);
  horizonGlow.position.set(-2, 5.2, -60);
  horizonGlow.visible = false;
  engine.scene.add(horizonGlow);

  const moteCount = 18;
  const motePos = new Float32Array(moteCount * 3);
  const moteSeed = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (rand() - 0.5) * 12;
    motePos[i * 3 + 1] = 1.0 + rand() * 4.4;
    motePos[i * 3 + 2] = -3.2 + rand() * 4.2;
    moteSeed[i] = rand() * 10;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1));
  const moteMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * 0.035 + aSeed * 0.2, 4.2) + 0.9;
        p.x += sin(uTime * 0.1 + aSeed) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.8 + aSeed * 0.22) * uPixelRatio * (40.0 / max(0.5, -mv.z));
        vAlpha = 0.24 + 0.3 * (0.5 + 0.5 * sin(uTime * 0.6 + aSeed * 3.0));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(p));
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.52), a * vAlpha * 0.1);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  group.add(motes);

  // ===========================================================================
  // lighting: warm sunset key/rim + cool sea fill + practicals
  // ===========================================================================
  const lightTarget = new THREE.Object3D();
  lightTarget.position.set(PLINTH_X, 1.3, PLINTH_Z - 0.3);
  group.add(lightTarget);

  const dirFill = new THREE.DirectionalLight(0xffd6ac, 0.8);
  dirFill.position.set(6.5, 9.5, 7.5);
  dirFill.target = lightTarget;
  group.add(dirFill);

  const dirFront = new THREE.DirectionalLight(0xfff1db, 0.8);
  dirFront.position.set(1.5, 6.0, 15.0);
  dirFront.target = lightTarget;
  group.add(dirFront);

  const dirRim = new THREE.DirectionalLight(0xff9a56, 1.3);
  dirRim.position.set(-7.5, 6.5, -6.5);
  dirRim.target = lightTarget;
  group.add(dirRim);

  const dirCool = new THREE.DirectionalLight(0x8fd8d0, 0.9);
  dirCool.position.set(-5.5, 4.5, 8.0);
  dirCool.target = lightTarget;
  group.add(dirCool);

  const keyLight = new THREE.PointLight(0xffe0ba, 7, 18, 2.0);
  keyLight.position.set(4.6, 5.6, 6.2);
  group.add(keyLight);
  const rimLight = new THREE.PointLight(0xffa864, 15, 16, 2.0);
  rimLight.position.set(-3.0, 4.3, -3.4);
  group.add(rimLight);
  const tealFill = new THREE.PointLight(0x5ecbc4, 11, 13, 2.0);
  tealFill.position.set(-6.4, 1.5, 3.0);
  group.add(tealFill);
  const plinthLamp = new THREE.PointLight(0xffbf80, 6, 8.5, 2.0);
  plinthLamp.position.set(PLINTH_X, 4.85, PLINTH_Z - 1.1);
  group.add(plinthLamp);
  const frontFill = new THREE.PointLight(0xffb878, 6, 5.5, 2.0);
  frontFill.position.set(PLINTH_X + 1.2, DECK_TOP + 0.55, PLINTH_Z + 1.35);
  group.add(frontFill);

  // atmospheric separation behind the rack (hidden with the group)
  const stageHaze = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softGlowTex, color: 0xffb070, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  stageHaze.scale.set(13, 4.4, 1);
  stageHaze.position.set(PLINTH_X, 2.5, -5.5);
  group.add(stageHaze);
  const coolMist = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softGlowTex, color: 0x4fc9c2, transparent: true, opacity: 0.05,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  coolMist.scale.set(10, 2.0, 1);
  coolMist.position.set(PLINTH_X, 1.5, -2.6);
  group.add(coolMist);

  // ===========================================================================
  // state + UI wiring
  // ===========================================================================
  let visible = false;
  let hoverIndex = -1;
  let selectedIndex = 1;
  let reveal = 1;
  let time = 0;
  let rippleTimer = 0;
  let rippleSlot = 0;
  let lastPick = -1;
  let lastPickTime = 0;
  let lastNdcX = 10;
  let lastNdcY = 10;
  let cursorOn = false;
  let panelOver = false;
  let hoverFromUI = false;

  const reducedMotion = (() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  })();

  // off-scene hit proxies (zero draw calls); re-anchored to the group each pick
  const hitProxies = rodRuntime.map((r, i) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.42, r.L + 0.3, 8, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.matrixAutoUpdate = false;
    mesh.userData.rodIndex = i;
    mesh.userData.base = r.baseMat;
    mesh.userData.local = new THREE.Matrix4().makeTranslation(0, (r.L + 0.3) / 2 - 0.1, 0);
    return mesh;
  });

  const ui = createShopUI({
    onSelect: (i) => select(i, { fromUI: true }),
    onHover: (i) => setHover(i, { fromUI: true }),
    onTestCast: (rod) => testCast(rod),
    onDiveAgain: () => {
      app.actions.resetDive?.();
    },
  });

  function testCast(rod) {
    if (app.mode !== 'shop') return;
    const spec = toRodSpec(rod || RODS[selectedIndex]);
    app.bus.emit('shop:testcast', spec);
    app.actions.enterFishing?.(spec);
  }

  function setCursor(on) {
    if (on === cursorOn) return;
    cursorOn = on;
    document.body.style.cursor = on ? 'pointer' : '';
  }

  function applyHighlight() {
    for (let i = 0; i < rodRuntime.length; i++) {
      const r = rodRuntime[i];
      const glow = i === selectedIndex ? (hoverIndex === i ? 1.0 : 0.62) : (hoverIndex === i ? 0.9 : 0.0);
      r.targetEmissive = glow * 0.5;
      tipGlow[i] = 0.45 + glow * 1.15;
    }
    tipGeo.getAttribute('aGlow').needsUpdate = true;
    setCursor(hoverIndex >= 0);
  }

  function select(i, { fromUI = false } = {}) {
    const n = Math.max(0, Math.min(RODS.length - 1, i | 0));
    selectedIndex = n;
    lurePivot.position.set(tipPositions[n * 3], tipPositions[n * 3 + 1], tipPositions[n * 3 + 2]);
    if (!fromUI) ui.setSelected(n);
    applyHighlight();
    app.bus.emit('shop:select', { index: n, rod: RODS[n] });
  }

  function setHover(i, { fromUI = false } = {}) {
    const n = Number.isInteger(i) && i >= 0 && i < RODS.length ? i : -1;
    hoverFromUI = !!fromUI && n >= 0;
    if (n === hoverIndex) return;
    hoverIndex = n;
    if (!fromUI) ui.setHovered(n);
    applyHighlight();
  }

  function pickRod(ndc, force = false) {
    const now = performance.now();
    if (!force && now - lastPickTime < 80) return lastPick;
    lastPickTime = now;
    group.updateMatrixWorld(true);
    for (const proxy of hitProxies) {
      TMP_M.copy(group.matrixWorld).multiply(proxy.userData.base).multiply(proxy.userData.local);
      proxy.matrix.copy(TMP_M);
      proxy.matrixWorld.copy(TMP_M);
      proxy.matrixWorldNeedsUpdate = false;
    }
    engine.pickRay(ndc);
    const hits = engine.raycaster.intersectObjects(hitProxies, false);
    lastPick = hits.length ? hits[0].object.userData.rodIndex : -1;
    return lastPick;
  }

  function responsive() {
    const mobile = window.innerWidth < 760;
    const scale = mobile ? 0.8 : 1.0;
    group.scale.setScalar(scale);
    group.position.set(WORLD.shop.center.x, WORLD.shop.center.y, WORLD.shop.center.z);
    tipMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    moteMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
  }
  responsive();
  window.addEventListener('resize', responsive);

  // place the marker on the default selection
  markerGroup.position.set(ROD_XS[selectedIndex], PLINTH_TOP + 0.035, ROD_Z);
  focusLight.position.set(ROD_XS[selectedIndex], PLINTH_TOP + 1.6, ROD_Z + 0.25);
  applyHighlight();

  function addRipples() {
    const ocean = ctx?.ocean;
    if (!ocean?.addRipple) return;
    const slots = [
      [-5.4, 2.0], [5.4, 1.8], [-5.0, -1.6], [5.0, -1.4],
    ];
    for (const [lx, lz] of slots) {
      TMP_V1.set(lx, 0, lz);
      group.localToWorld(TMP_V1);
      ocean.addRipple(TMP_V1.x, TMP_V1.z, 0.55);
    }
  }

  function isPointerOnUI() {
    if (ui.isOverPanel()) return true;
    const px = app.pointer.x;
    const py = app.pointer.y;
    if (!px && !py) return false;
    const el = document.elementFromPoint(px, py);
    return !!(el && el.closest && el.closest('.shop-panel'));
  }

  function onKeyDown(code, ev) {
    if (!visible || app.mode !== 'shop') return;
    const active = document.activeElement;
    const uiFocused = active && active.closest && active.closest('.shop-panel');
    if (code === 'Enter') {
      if (uiFocused) return;
      testCast(RODS[selectedIndex]);
      return;
    }
    if (uiFocused && (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown')) {
      // the focused card strip owns arrow-key roving; its handler syncs the world
      return;
    }
    if (code === 'Escape') return;
    if (code === 'ArrowLeft' || code === 'ArrowUp') {
      select((selectedIndex + RODS.length - 1) % RODS.length);
    } else if (code === 'ArrowRight' || code === 'ArrowDown') {
      select((selectedIndex + 1) % RODS.length);
    } else if (/^Digit[1-5]$/.test(code)) {
      select(Number(code.slice(5)) - 1);
    }
  }
  app.bus.on('key:down', onKeyDown);

  return {
    group,
    ui,
    rods: RODS,
    scene: group,
    get visible() { return visible; },
    get selected() { return selectedIndex; },
    get hovered() { return hoverIndex; },
    show() {
      if (visible) return;
      visible = true;
      group.visible = true;
      horizonGlow.visible = true;
      reveal = 0;
      time = 0;
      lastPick = -1;
      markerGroup.position.set(ROD_XS[selectedIndex], PLINTH_TOP + 0.035, ROD_Z);
      focusLight.position.set(ROD_XS[selectedIndex], PLINTH_TOP + 1.6, ROD_Z + 0.25);
      lurePivot.position.set(tipPositions[selectedIndex * 3], tipPositions[selectedIndex * 3 + 1], tipPositions[selectedIndex * 3 + 2]);
      ui.show();
      ui.setSelected(selectedIndex);
      applyHighlight();
      addRipples();
      rippleTimer = 0;
    },
    hide() {
      if (!visible) return;
      visible = false;
      group.visible = false;
      horizonGlow.visible = false;
      ui.hide();
      setHover(-1);
      setCursor(false);
      panelOver = false;
    },
    select,
    setHover,
    update(dt) {
      if (!visible) return;
      time += dt;
      reveal = Math.min(1, reveal + dt * 1.6);
      const sway = reducedMotion ? 0 : 1;

      // pontoon bob + slow settle-in
      const settle = 1 - Math.pow(1 - reveal, 3);
      group.position.y = WORLD.shop.center.y + (1 - settle) * -0.55
        + Math.sin(time * 0.62) * 0.018 * sway;
      group.position.x = WORLD.shop.center.x + Math.sin(time * 0.33) * 0.012 * sway;
      group.rotation.z = Math.sin(time * 0.55 + 1.0) * 0.0022 * sway;
      group.rotation.x = Math.sin(time * 0.41 + 0.3) * 0.0015 * sway;

      // rod sway
      for (let i = 0; i < rodPivots.length; i++) {
        const r = rodPivots[i];
        const ph = r.phase;
        r.pivot.rotation.x = -r.lean + Math.sin(time * 0.82 + ph) * 0.0022 * sway;
        r.pivot.rotation.z = Math.sin(time * 0.63 + ph * 1.7) * 0.0028 * sway + Math.sin(time * 1.9 + ph) * 0.0007 * sway;
      }

      // hanging lure sways from the selected tip
      lurePivot.rotation.z = Math.sin(time * 1.25 + 0.6) * 0.14 * sway;
      lurePivot.rotation.x = Math.sin(time * 0.95) * 0.08 * sway;

      // emissive damping (selection / hover)
      for (let i = 0; i < rodRuntime.length; i++) {
        const r = rodRuntime[i];
        r.emissive = damp(r.emissive, r.targetEmissive, 7, dt);
        r.blankMat.emissiveIntensity = r.emissive;
      }
      const focusTarget = hoverIndex >= 0 ? 5 : 1.6;
      focusLight.intensity = damp(focusLight.intensity, focusTarget, 6, dt);
      const mx = ROD_XS[hoverIndex >= 0 ? hoverIndex : selectedIndex];
      const mz = ROD_Z + (hoverIndex >= 0 ? 0.7 : 0.55);
      focusLight.position.x = damp(focusLight.position.x, mx, 8, dt);
      focusLight.position.z = damp(focusLight.position.z, mz, 8, dt);
      focusLight.position.y = damp(focusLight.position.y, PLINTH_TOP + 1.9, 8, dt);

      // selection marker glide + pulse
      markerGroup.position.x = damp(markerGroup.position.x, ROD_XS[selectedIndex], 9, dt);
      markerGroup.position.z = damp(markerGroup.position.z, ROD_Z, 9, dt);
      const pulse = 0.75 + Math.sin(time * 2.1) * 0.12;
      markerGlow.material.opacity = 0.05 + pulse * 0.035;
      markerRing.material.emissiveIntensity = 0.16 + pulse * 0.1;

      // horizon haze + tips + dust
      horizonGlow.material.opacity = 0.2 + Math.sin(time * 0.35) * 0.03;
      tipMat.uniforms.uTime.value = time;
      moteMat.uniforms.uTime.value = time;

      // fake reflections track the camera azimuth
      const dx = engine.camera.position.x - WORLD.shop.center.x;
      const dz = engine.camera.position.z - WORLD.shop.center.z;
      const cy = Math.cos(GROUP_YAW);
      const sy = Math.sin(GROUP_YAW);
      const scale = group.scale.x;
      const camLX = (dx * cy - dz * sy) / scale;
      const camLZ = (dx * sy + dz * cy) / scale;
      updateReflections(camLX, camLZ);

      // periodic ripples around the pontoon
      rippleTimer += dt;
      if (rippleTimer > 6.5) {
        rippleTimer = 0;
        const ocean = ctx?.ocean;
        if (ocean?.addRipple) {
          const corners = [[-5.6, 2.1], [5.6, 1.9], [-5.2, -1.8], [5.2, -1.5]];
          const [lx, lz] = corners[rippleSlot++ % corners.length];
          TMP_V1.set(lx, 0, lz);
          group.localToWorld(TMP_V1);
          ocean.addRipple(TMP_V1.x, TMP_V1.z, 0.4);
        }
      }

      // hover picking (throttled + only when the pointer moves)
      if (app.mode === 'shop') {
        panelOver = ui.isOverPanel();
        if (app.pointer.inside && !panelOver) {
          const nx = app.pointer.ndc.x;
          const ny = app.pointer.ndc.y;
          if (nx !== lastNdcX || ny !== lastNdcY) {
            lastNdcX = nx;
            lastNdcY = ny;
            const hit = pickRod(app.pointer.ndc, true);
            setHover(hit);
          }
        } else if (hoverIndex !== -1 && !(panelOver && hoverFromUI)) {
          setHover(-1);
        }

        if (!panelOver && app.pointer.justDown && !isPointerOnUI()) {
          const hit = pickRod(app.pointer.ndc, true);
          if (hit >= 0) {
            select(hit);
            app.pointer.justDown = false;
          }
        }
      }
    },
    debugInfo() {
      return {
        visible,
        selected: selectedIndex,
        hovered: hoverIndex,
        drawCalls: engine.renderer.info.render.calls,
        triangles: engine.renderer.info.render.triangles,
      };
    },
    // exposed for QA; not part of the contract
    pickAt(x, y) {
      TMP_V2.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
      return pickRod(TMP_V2, true);
    },
    testCast,
  };
}
