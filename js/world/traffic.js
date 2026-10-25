// Traffic / life on the horizon — owned by the traffic teammate.
//
// Procedural ambient life above the waterline for all surface-facing states
// (dive surface, rod shop, fishing):
//   * a small flock of seagulls (instanced, shader-flapped wings, one close pass)
//   * a distant trawler, a steam ship (with smoke puffs) and an aircraft carrier
//     silhouette, each with a V wake; at most two vessels at once
//   * J20 / J15 flyovers with thin contrails and an afterburner flicker
//
// Everything is authored against the same sunset as the rest of the site; the
// module adds no lights (it only borrows the scene sun / hemisphere / env), and
// it hides itself whenever the camera is underwater or deeper than 1 m.
//
// Budget: <= 12 draw calls and <= 100k triangles. One merged geometry per
// vessel / jet, one InstancedMesh for all birds, one merged smoke mesh, one
// wake mesh (child of each vessel) and one trail mesh (child of each jet).
// The update loop is allocation-free.

import * as THREE from 'three';
import { SUN_DIR, WORLD } from '../core/world.js';
import { clamp, mulberry32 } from '../core/util.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const PONTOON = WORLD.shop.center; // (0, 0.15, -2.5)

// ---------------------------------------------------------------------------
// palette — THREE.Color turns these sRGB hex values into the linear working
// space, so vertex colours feed the PBR material correctly.
// ---------------------------------------------------------------------------
const C = {
  hull: new THREE.Color(0x0a1418),
  hullDeep: new THREE.Color(0x061014),
  boot: new THREE.Color(0x4e352a),
  deck: new THREE.Color(0x202b2b),
  deckLine: new THREE.Color(0x8a7a61),
  superstructure: new THREE.Color(0x96897a),
  superstructureLight: new THREE.Color(0xbcb09b),
  funnel: new THREE.Color(0x1a2225),
  funnelBand: new THREE.Color(0x7c4a32),
  glass: new THREE.Color(0xffc47c),
  warmLight: new THREE.Color(0xffd9a2),
  redLight: new THREE.Color(0xff5a3d),
  greenLight: new THREE.Color(0x66e08c),
  metal: new THREE.Color(0x3b4549),
  carrierDeck: new THREE.Color(0x2a3133),
  carrierDeckLight: new THREE.Color(0x3d4648),
  carrierLine: new THREE.Color(0x8f8674),
  jetTop: new THREE.Color(0x26333b),
  jetSide: new THREE.Color(0x172128),
  jetBelly: new THREE.Color(0x0e171c),
  jetTip: new THREE.Color(0x3c4c54),
  birdBody: new THREE.Color(0xe6dfd1),
  birdHead: new THREE.Color(0xf0e9dc),
  birdBelly: new THREE.Color(0x8f8b80),
  birdWing: new THREE.Color(0xded7c9),
  birdTip: new THREE.Color(0x2b3136),
  birdBeak: new THREE.Color(0xd9a35a),
  contrail: new THREE.Color(0xf0f2f0),
  smoke: new THREE.Color(0x6f685e),
  wake: new THREE.Color(0xb4c0bb),
};

// ---------------------------------------------------------------------------
// tiny flat-shaded geometry builder. Each primitive writes unindexed vertices
// with per-face normals, then the builder is merged into one BufferGeometry.
// ---------------------------------------------------------------------------
function makeGB() {
  return { pos: [], nor: [], col: [], glow: [], idx: [] };
}

function tri(gb, ax, ay, az, bx, by, bz, cx, cy, cz, color, glow = 0) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const base = gb.pos.length / 3;
  gb.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  gb.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  const r = color.r, g = color.g, b = color.b;
  gb.col.push(r, g, b, r, g, b, r, g, b);
  gb.glow.push(glow, glow, glow);
  gb.idx.push(base, base + 1, base + 2);
}

function quad(gb, p0, p1, p2, p3, color, glow = 0) {
  tri(gb, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], color, glow);
  tri(gb, p0[0], p0[1], p0[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], color, glow);
}

function rotXZ(x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x * c + z * s, -x * s + z * c];
}

function box(gb, cx, cy, cz, sx, sy, sz, color, glow = 0, ry = 0, rz = 0, rx = 0) {
  const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
  const cY = Math.cos(ry), sY = Math.sin(ry);
  const cZ = Math.cos(rz), sZ = Math.sin(rz);
  const cX = Math.cos(rx), sX = Math.sin(rx);
  const local = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ];
  const p = [];
  for (let i = 0; i < 8; i++) {
    let x = local[i][0], y = local[i][1], z = local[i][2];
    if (rx) { const yy = y * cX - z * sX; const zz = y * sX + z * cX; y = yy; z = zz; }
    if (rz) { const xx = x * cZ - y * sZ; const yy = x * sZ + y * cZ; x = xx; y = yy; }
    if (ry) { const xx = x * cY + z * sY; const zz = -x * sY + z * cY; x = xx; z = zz; }
    p.push([x + cx, y + cy, z + cz]);
  }
  quad(gb, p[4], p[5], p[6], p[7], color, glow);
  quad(gb, p[1], p[0], p[3], p[2], color, glow);
  quad(gb, p[5], p[1], p[2], p[6], color, glow);
  quad(gb, p[0], p[4], p[7], p[3], color, glow);
  quad(gb, p[3], p[7], p[6], p[2], color, glow);
  quad(gb, p[4], p[0], p[1], p[5], color, glow);
}

function cyl(gb, cx, y0, cz, rBot, rTop, h, seg, color, glow = 0) {
  const y1 = y0 + h;
  const b = [], t = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    b.push([cx + ca * rBot, y0, cz + sa * rBot]);
    t.push([cx + ca * rTop, y1, cz + sa * rTop]);
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    quad(gb, b[i], t[i], t[j], b[j], color, glow);
  }
  const center = [cx, y1, cz];
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    tri(gb, center[0], center[1], center[2], t[j][0], t[j][1], t[j][2], t[i][0], t[i][1], t[i][2], color, glow);
  }
}

// Hull: a tapered box with a pointed bow, a flared deck and a slightly
// rockered keel. Local +z is the stern, -z the bow.
function hull(gb, len, beam, free, draft, colors) {
  const N = 6;
  const st = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let w;
    if (t < 0.14) w = 0.09 + (t / 0.14) * 0.35;
    else if (t < 0.45) w = 0.44 + ((t - 0.14) / 0.31) * 0.06;
    else if (t < 0.86) w = 0.50 - ((t - 0.45) / 0.41) * 0.02;
    else w = 0.48 - ((t - 0.86) / 0.14) * 0.06;
    w *= beam;
    const yt = free * (1.06 - t * 0.08 + (t > 0.9 ? ((t - 0.9) / 0.1) * 0.04 : 0));
    const yb = -draft * (0.22 + Math.min(1, t * 2.1) * 0.78);
    const wb = w * (0.34 + Math.min(1, t * 1.5) * 0.56);
    st.push({ z: -len / 2 + t * len, w, wb, yt, yb });
  }
  for (let i = 0; i < N - 1; i++) {
    const a = st[i], b = st[i + 1];
    quad(gb, [-a.w, a.yt, a.z], [-b.w, b.yt, b.z], [b.w, b.yt, b.z], [a.w, a.yt, a.z], colors.deck);
    quad(gb, [-a.wb, a.yb, a.z], [-b.wb, b.yb, b.z], [-b.w, b.yt, b.z], [-a.w, a.yt, a.z], colors.side);
    quad(gb, [a.wb, a.yb, a.z], [a.w, a.yt, a.z], [b.w, b.yt, b.z], [b.wb, b.yb, b.z], colors.side);
    quad(gb, [-a.wb, a.yb, a.z], [a.wb, a.yb, a.z], [b.wb, b.yb, b.z], [-b.wb, b.yb, b.z], colors.bottom);
  }
  const f = st[0], s = st[N - 1];
  quad(gb, [-f.wb, f.yb, f.z], [-f.w, f.yt, f.z], [f.w, f.yt, f.z], [f.wb, f.yb, f.z], colors.side);
  quad(gb, [-s.wb, s.yb, s.z], [s.wb, s.yb, s.z], [s.w, s.yt, s.z], [-s.w, s.yt, s.z], colors.side);
  // a thin boot stripe at the waterline
  for (let i = 0; i < N - 1; i++) {
    const a = st[i], b = st[i + 1];
    const ya = -draft * 0.07, yb = -draft * 0.07;
    const aw = a.w * 0.985, bw = b.w * 0.985;
    quad(gb, [-aw, ya - 0.22, a.z], [-bw, yb - 0.22, b.z], [-bw, yb + 0.22, b.z], [-aw, ya + 0.22, a.z], colors.boot);
    quad(gb, [aw, ya - 0.22, a.z], [aw, ya + 0.22, a.z], [bw, yb + 0.22, b.z], [bw, yb - 0.22, b.z], colors.boot);
  }
}

// Fuselage-like prism along z; rectangular cross sections.
function prismZ(gb, stations, top, side, belly) {
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    const aTop = a.y + a.h * 0.5, aBot = a.y - a.h * 0.5;
    const bTop = b.y + b.h * 0.5, bBot = b.y - b.h * 0.5;
    quad(gb, [-a.w, aTop, a.z], [-b.w, bTop, b.z], [b.w, bTop, b.z], [a.w, aTop, a.z], top);
    quad(gb, [-a.w, aBot, a.z], [a.w, aBot, a.z], [b.w, bBot, b.z], [-b.w, bBot, b.z], belly);
    quad(gb, [a.w, aBot, a.z], [a.w, aTop, a.z], [b.w, bTop, b.z], [b.w, bBot, b.z], side);
    quad(gb, [-a.w, aTop, a.z], [-a.w, aBot, a.z], [-b.w, bBot, b.z], [-b.w, bTop, b.z], side);
  }
  const f = stations[0], l = stations[stations.length - 1];
  quad(gb, [-f.w, f.y - f.h * 0.5, f.z], [-f.w, f.y + f.h * 0.5, f.z], [f.w, f.y + f.h * 0.5, f.z], [f.w, f.y - f.h * 0.5, f.z], side);
  quad(gb, [-l.w, l.y - l.h * 0.5, l.z], [l.w, l.y - l.h * 0.5, l.z], [l.w, l.y + l.h * 0.5, l.z], [-l.w, l.y + l.h * 0.5, l.z], side);
}

function lerpColor(a, b, t) {
  return new THREE.Color(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
}

// Horizontal lifting surface (wing, canard, stabiliser). Stations run along x.
function bladeX(gb, stations, th, colRoot, colTip, colEdge) {
  const n = stations.length;
  for (let i = 0; i < n - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    const k = i / Math.max(1, n - 2);
    const cA = lerpColor(colRoot, colTip, k);
    const cB = lerpColor(colRoot, colTip, (i + 1) / Math.max(1, n - 2));
    const aT = a.h + th * 0.5, aB = a.h - th * 0.5;
    const bT = b.h + th * 0.5, bB = b.h - th * 0.5;
    quad(gb, [a.u, aT, a.le], [b.u, bT, b.le], [b.u, bT, b.te], [a.u, aT, a.te], cA);
    quad(gb, [a.u, aB, a.te], [b.u, bB, b.te], [b.u, bB, b.le], [a.u, aB, a.le], cB);
    quad(gb, [a.u, aB, a.le], [b.u, bB, b.le], [b.u, bT, b.le], [a.u, aT, b.le], colEdge);
    quad(gb, [a.u, aT, a.te], [b.u, bT, b.te], [b.u, bB, b.te], [a.u, aB, a.te], colEdge);
  }
  const t = stations[n - 1], p = stations[n - 2];
  const c = colTip;
  const tT = t.h + th * 0.5, tB = t.h - th * 0.5;
  quad(gb, [t.u, tB, t.le], [t.u, tT, t.le], [t.u, tT, t.te], [t.u, tB, t.te], c);
  // root cap keeps the wing watertight when it is not buried in the body
  const r = stations[0], rT = r.h + th * 0.5, rB = r.h - th * 0.5;
  quad(gb, [r.u, rB, r.te], [r.u, rT, r.te], [r.u, rT, r.le], [r.u, rB, r.le], colRoot);
  void p;
}

// Vertical lifting surface (fin, tail). Stations run along y.
function bladeY(gb, stations, th, colRoot, colTip, colEdge) {
  const n = stations.length;
  for (let i = 0; i < n - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    const cA = lerpColor(colRoot, colTip, i / Math.max(1, n - 2));
    const cB = lerpColor(colRoot, colTip, (i + 1) / Math.max(1, n - 2));
    const aP = a.x + th * 0.5, aN = a.x - th * 0.5;
    const bP = b.x + th * 0.5, bN = b.x - th * 0.5;
    quad(gb, [aP, a.u, a.le], [bP, b.u, b.le], [bP, b.u, b.te], [aP, a.u, a.te], cA);
    quad(gb, [aN, a.u, a.te], [bN, b.u, b.te], [bN, b.u, b.le], [aN, a.u, a.le], cB);
    quad(gb, [aN, a.u, a.le], [bN, b.u, b.le], [bP, b.u, b.le], [aP, a.u, b.le], colEdge);
    quad(gb, [aP, a.u, a.te], [bP, b.u, b.te], [bN, b.u, b.te], [aN, a.u, a.te], colEdge);
  }
  const t = stations[n - 1];
  quad(gb, [t.x - th * 0.5, t.u, t.le], [t.x + th * 0.5, t.u, t.le], [t.x + th * 0.5, t.u, t.te], [t.x - th * 0.5, t.u, t.te], colTip);
}

function gbToGeometry(gb) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(gb.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(gb.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(gb.col, 3));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(gb.glow, 1));
  g.setIndex(gb.idx);
  g.computeBoundingSphere();
  return g;
}

// RGBA vertex-colour builder for unlit transparent geometry (wake, smoke, trail).
function makeGBC() {
  return { pos: [], col: [], idx: [] };
}

function quadC(gb, p0, p1, p2, p3, color, a0, a1, a2, a3) {
  const base = gb.pos.length / 3;
  gb.pos.push(
    p0[0], p0[1], p0[2],
    p1[0], p1[1], p1[2],
    p2[0], p2[1], p2[2],
    p3[0], p3[1], p3[2],
  );
  const r = color.r, g = color.g, b = color.b;
  gb.col.push(r, g, b, a0, r, g, b, a1, r, g, b, a2, r, g, b, a3);
  gb.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function triC(gb, p0, p1, p2, color, a0, a1, a2) {
  const base = gb.pos.length / 3;
  gb.pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
  const r = color.r, g = color.g, b = color.b;
  gb.col.push(r, g, b, a0, r, g, b, a1, r, g, b, a2);
  gb.idx.push(base, base + 1, base + 2);
}

function gbcToGeometry(gb) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(gb.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(gb.col, 4));
  g.setIndex(gb.idx);
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------
// vessel geometry
// ---------------------------------------------------------------------------

// Small fishing trawler, 32 m: dark hull, cream wheelhouse, mast + boom,
// outriggers, warm cabin windows and two navigation lights.
function buildTrawler() {
  const gb = makeGB();
  const L = 32, B = 7.4;
  hull(gb, L, B, 2.5, 2.3, { deck: C.deck, side: C.hull, bottom: C.hullDeep, boot: C.boot });
  // deckhouse and bridge
  box(gb, 0, 4.4, 6.2, 5.6, 3.8, 5.2, C.superstructure, 0.04);
  box(gb, 0, 6.65, 6.2, 6.2, 0.5, 5.8, C.superstructureLight);
  box(gb, 0, 5.0, 8.95, 5.0, 1.35, 0.18, C.glass, 1.2);
  box(gb, 0, 5.95, 8.95, 4.0, 0.7, 0.18, C.glass, 0.7);
  // funnel
  cyl(gb, 0, 6.9, 5.2, 0.62, 0.5, 2.9, 7, C.funnel);
  cyl(gb, 0, 9.5, 5.2, 0.52, 0.52, 0.34, 7, C.funnelBand, 0.28);
  // mast + boom
  cyl(gb, 0, 2.6, -3.0, 0.16, 0.10, 11.4, 5, C.metal);
  box(gb, 0, 9.6, -1.0, 0.16, 0.16, 11.0, C.metal, 0, 0, 0, 0.22);
  box(gb, 0, 10.9, -3.0, 4.6, 0.14, 0.14, C.metal);
  // outriggers
  box(gb, -3.3, 6.2, 1.8, 0.18, 0.18, 10.0, C.metal, 0, 0, 0.62, 0.16);
  box(gb, 3.3, 6.2, 1.8, 0.18, 0.18, 10.0, C.metal, 0, 0, -0.62, 0.16);
  // stern gantry
  box(gb, -1.9, 3.0, 14.0, 0.2, 0.2, 4.4, C.metal, 0, 0, 0.55);
  box(gb, 1.9, 3.0, 14.0, 0.2, 0.2, 4.4, C.metal, 0, 0, -0.55);
  box(gb, 0, 4.8, 14.4, 4.2, 0.18, 0.18, C.metal);
  // hatches / winch
  box(gb, 0, 2.62, -1.0, 2.6, 0.5, 4.0, C.deckLine);
  box(gb, 0, 2.9, 9.7, 1.4, 1.0, 1.2, C.metal);
  // warm lights and nav lights
  box(gb, -2.85, 6.9, 6.9, 0.24, 0.24, 0.24, C.redLight, 2.4);
  box(gb, 2.85, 6.9, 6.9, 0.24, 0.24, 0.24, C.greenLight, 2.4);
  box(gb, 0, 9.9, 5.2, 0.2, 0.2, 0.2, C.warmLight, 2.2);
  box(gb, 0, 5.28, 13.9, 1.6, 0.2, 0.2, C.warmLight, 1.4);
  const geo = gbToGeometry(gb);
  return { geo, length: L, beam: B, wakeLen: 110, wakeFan: 2.4, height: 12 };
}

// Coastal freighter / steam ship, 84 m: long dark hull, tall funnel, masts,
// cargo booms, a warm bridge window line and rows of portholes.
function buildSteamer() {
  const gb = makeGB();
  const L = 86, B = 12.5;
  hull(gb, L, B, 4.6, 4.0, { deck: C.deck, side: C.hull, bottom: C.hullDeep, boot: C.boot });
  // bridge deck structure
  box(gb, 0, 7.6, 6.0, 13.0, 6.0, 13.0, C.superstructure);
  box(gb, 0, 10.9, 6.0, 13.6, 0.5, 13.6, C.superstructureLight);
  box(gb, 0, 9.0, 12.7, 11.6, 1.6, 0.2, C.glass, 1.2);
  box(gb, 0, 7.6, 12.75, 8.0, 0.75, 0.2, C.glass, 0.6);
  // lit hull line (portholes merge into a warm line at this distance)
  box(gb, -6.24, 3.4, 2.0, 0.12, 0.42, 46.0, C.glass, 0.35);
  box(gb, 6.24, 3.4, 2.0, 0.12, 0.42, 46.0, C.glass, 0.35);
  // bridge wings
  box(gb, -7.2, 9.6, 9.6, 2.8, 0.4, 3.6, C.superstructureLight);
  box(gb, 7.2, 9.6, 9.6, 2.8, 0.4, 3.6, C.superstructureLight);
  // funnel
  cyl(gb, 0, 10.9, 15.0, 2.55, 2.55, 8.6, 10, C.funnel);
  cyl(gb, 0, 18.1, 15.0, 2.58, 2.58, 1.2, 10, C.funnelBand, 0.10);
  cyl(gb, 0, 12.2, 15.0, 2.58, 2.58, 0.5, 10, C.superstructureLight, 0.08);
  // masts fore and aft, with crossbars and booms
  cyl(gb, 0, 4.6, -26.0, 0.24, 0.13, 17.0, 5, C.metal);
  box(gb, 0, 17.0, -26.0, 6.8, 0.16, 0.16, C.metal);
  box(gb, 0, 19.4, -26.0, 4.2, 0.14, 0.14, C.metal);
  box(gb, 0, 11.0, -17.5, 0.16, 0.16, 16.0, C.metal, 0, 0, 0.18);
  cyl(gb, 0, 4.6, 30.0, 0.22, 0.12, 14.5, 5, C.metal);
  box(gb, 0, 15.6, 30.0, 6.0, 0.16, 0.16, C.metal);
  // cargo hatches and deck gear
  box(gb, 0, 4.92, -15.0, 7.0, 0.7, 12.0, C.deckLine);
  box(gb, 0, 4.92, -1.0, 6.0, 0.65, 8.0, C.deckLine);
  box(gb, 0, 4.92, 22.0, 5.0, 0.6, 7.0, C.deckLine);
  box(gb, 0, 5.6, -20.0, 1.2, 1.4, 1.2, C.metal);
  box(gb, 0, 5.6, 25.0, 1.2, 1.4, 1.2, C.metal);
  // lifeboats
  box(gb, -6.9, 7.0, 8.0, 1.6, 1.1, 4.4, C.superstructureLight);
  box(gb, 6.9, 7.0, 8.0, 1.6, 1.1, 4.4, C.superstructureLight);
  // portholes / deck lighting, warm pinpoints along the hull
  for (let i = 0; i < 9; i++) {
    const z = -26 + i * 7.2;
    box(gb, -6.27, 3.5, z, 0.1, 0.22, 0.22, C.warmLight, 0.9);
    box(gb, 6.27, 3.5, z, 0.1, 0.22, 0.22, C.warmLight, 0.9);
  }
  box(gb, 0, 21.6, -26.0, 0.15, 0.15, 0.15, C.warmLight, 1.5);
  box(gb, 0, 20.2, 15.0, 0.16, 0.16, 0.16, C.warmLight, 1.4);
  const geo = gbToGeometry(gb);
  return { geo, length: L, beam: B, wakeLen: 280, wakeFan: 2.1, height: 22, funnel: new THREE.Vector3(0, 20.4, 15.0) };
}

// Aircraft carrier, 322 m: flat flight deck with an angled landing strip, an
// island on the starboard side, deck-edge lights and a handful of tiny aircraft.
function buildCarrier() {
  const gb = makeGB();
  const L = 322, B = 40;
  hull(gb, L, B, 9.2, 7.0, { deck: C.deck, side: C.hull, bottom: C.hullDeep, boot: C.boot });
  // flight deck with overhang and a slightly lighter centre
  box(gb, 0, 9.9, 0, 338, 2.6, 62, C.carrierDeck);
  box(gb, 0, 11.28, 0, 312, 0.18, 3.2, C.carrierLine, 0.10);
  box(gb, 0, 11.28, 0, 0.7, 0.18, 44, C.carrierLine, 0.08);
  // angled landing strip (port side, canted)
  box(gb, -18, 11.3, 30, 150, 0.2, 20, C.carrierDeckLight, 0, -0.16);
  for (let i = 0; i < 7; i++) {
    const z = -30 + i * 9;
    box(gb, -18 + (z - 30) * 0.161, 11.44, z, 120, 0.12, 0.5, C.carrierLine, 0.2, -0.16);
  }
  // island (starboard, amidships)
  box(gb, 19.0, 13.8, -8.0, 15.0, 5.6, 28.0, C.carrierDeckLight);
  box(gb, 20.5, 19.2, -8.0, 10.0, 7.2, 16.0, C.carrierDeck);
  box(gb, 20.5, 22.9, -8.0, 11.6, 0.5, 17.6, C.carrierDeckLight);
  box(gb, 20.5, 20.2, 0.15, 9.4, 1.2, 0.25, C.glass, 1.0);
  box(gb, 20.5, 18.2, 0.15, 9.0, 0.7, 0.2, C.glass, 0.6);
  // island stack + mast
  box(gb, 22.4, 25.0, -10.0, 3.2, 8.5, 5.0, C.carrierDeck);
  box(gb, 22.4, 29.4, -10.0, 3.6, 0.6, 5.4, C.carrierDeckLight);
  cyl(gb, 23.4, 29.8, -10.0, 0.5, 0.28, 12.0, 6, C.metal);
  box(gb, 23.4, 38.0, -10.0, 5.2, 0.2, 0.2, C.metal);
  box(gb, 23.4, 41.4, -10.0, 0.28, 0.28, 0.28, C.warmLight, 2.2);
  // deck-edge lights
  for (let i = 0; i < 14; i++) {
    const z = -150 + i * 22;
    box(gb, -32.0, 11.4, z, 0.9, 0.3, 0.9, C.warmLight, 1.6);
    box(gb, 32.0, 11.4, z, 0.9, 0.3, 0.9, C.warmLight, 1.3);
  }
  // small aircraft on deck
  const planes = [
    [-8, -110, 0.12], [-2, -92, 0.12], [5, -74, 0.1], [12, -56, 0.1],
    [-6, 66, 0.2], [2, 84, 0.2], [10, 102, 0.2], [-16, 128, -0.16],
    [-13, 96, -0.16], [-22, 60, -0.16],
  ];
  for (let i = 0; i < planes.length; i++) {
    miniPlane(gb, planes[i][0], 11.25, planes[i][1], planes[i][2], 1.0);
  }
  // bow catapult lines
  box(gb, -14, 11.42, -140, 1.2, 0.12, 40, C.carrierLine, 0.18);
  box(gb, 14, 11.42, -140, 1.2, 0.12, 40, C.carrierLine, 0.14);
  const geo = gbToGeometry(gb);
  return { geo, length: L, beam: B, wakeLen: 620, wakeFan: 2.6, height: 33 };
}

function miniPlane(gb, x, y, z, yaw, s) {
  box(gb, x, y + 0.55 * s, z, 1.5 * s, 0.9 * s, 12.0 * s, C.carrierDeckLight, 0, yaw);
  // wingspan across the local x axis
  box(gb, x, y + 0.5 * s, z - 0.3 * s, 13.0 * s, 0.18 * s, 3.0 * s, C.deck, 0, yaw);
  box(gb, x, y + 0.5 * s, z + 5.0 * s, 5.2 * s, 0.15 * s, 2.0 * s, C.deck, 0, yaw);
  // twin canted tails, placed with the aircraft yaw
  const dx1 = rotXZ(-0.45 * s, 5.6 * s, yaw);
  const dx2 = rotXZ(0.45 * s, 5.6 * s, yaw);
  box(gb, x + dx1[0], y + 1.5 * s, z + dx1[1], 0.16 * s, 2.0 * s, 1.6 * s, C.carrierDeck, 0, yaw, 0.2);
  box(gb, x + dx2[0], y + 1.5 * s, z + dx2[1], 0.16 * s, 2.0 * s, 1.6 * s, C.carrierDeck, 0, yaw, -0.2);
}

// ---------------------------------------------------------------------------
// jets
// ---------------------------------------------------------------------------
function buildJ20() {
  const gb = makeGB();
  // fuselage
  prismZ(gb, [
    { z: -10.6, w: 0.10, h: 0.12, y: 0.02 },
    { z: -8.4, w: 0.50, h: 0.42, y: 0.06 },
    { z: -5.6, w: 1.02, h: 0.68, y: 0.10 },
    { z: -1.2, w: 1.66, h: 0.84, y: 0.05 },
    { z: 3.6, w: 1.88, h: 0.82, y: 0.00 },
    { z: 8.4, w: 1.52, h: 0.74, y: -0.01 },
    { z: 10.1, w: 1.32, h: 0.64, y: 0.00 },
  ], C.jetTop, C.jetSide, C.jetBelly);
  // canopy
  box(gb, 0, 0.52, -5.0, 1.05, 0.32, 3.2, C.jetTip, 0.03, 0, 0, 0.08);
  // delta wing
  const wing = [];
  const xs = [0.35, 1.6, 3.0, 4.4, 5.7, 6.9];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    wing.push({ u: x, le: -2.6 + x * 0.82, te: 6.7 - x * 0.36, h: 0.02 + x * 0.012 });
  }
  bladeX(gb, wing, 0.20, C.jetSide, C.jetTip, C.jetBelly);
  const wingL = wing.map((s) => ({ ...s, u: -s.u }));
  bladeX(gb, wingL, 0.20, C.jetSide, C.jetTip, C.jetBelly);
  // canards
  const canard = [
    { u: 1.25, le: -4.9, te: -2.7, h: 0.22 },
    { u: 2.3, le: -4.4, te: -3.0, h: 0.28 },
    { u: 3.05, le: -4.0, te: -3.25, h: 0.3 },
  ];
  bladeX(gb, canard, 0.14, C.jetSide, C.jetTip, C.jetBelly);
  bladeX(gb, canard.map((s) => ({ ...s, u: -s.u })), 0.14, C.jetSide, C.jetTip, C.jetBelly);
  // twin canted tails
  const fin = [
    { u: 0.0, x: 1.28, le: 6.1, te: 8.6 },
    { u: 1.6, x: 1.62, le: 7.2, te: 9.2 },
    { u: 3.1, x: 1.95, le: 8.3, te: 10.0 },
  ];
  bladeY(gb, fin, 0.18, C.jetSide, C.jetTip, C.jetBelly);
  bladeY(gb, fin.map((s) => ({ ...s, x: -s.x })), 0.18, C.jetSide, C.jetTip, C.jetBelly);
  // twin nozzles + engine humps
  cyl(gb, -0.82, -0.35, 9.4, 0.5, 0.55, 1.4, 8, C.jetBelly);
  cyl(gb, 0.82, -0.35, 9.4, 0.5, 0.55, 1.4, 8, C.jetBelly);
  box(gb, -0.82, 0.18, 6.4, 1.0, 0.35, 6.0, C.jetTop, 0, 0, 0);
  box(gb, 0.82, 0.18, 6.4, 1.0, 0.35, 6.0, C.jetTop, 0, 0, 0);
  // DSI intakes
  box(gb, -1.62, -0.22, -2.6, 0.45, 1.5, 4.2, C.jetSide, 0, 0.12);
  box(gb, 1.62, -0.22, -2.6, 0.45, 1.5, 4.2, C.jetSide, 0, -0.12);
  const geo = gbToGeometry(gb);
  return {
    geo,
    length: 21.0,
    nozzles: [{ x: -0.82, y: -0.05 }, { x: 0.82, y: -0.05 }],
    tailZ: 10.8,
    trail: 210,
  };
}

function buildJ15() {
  const gb = makeGB();
  prismZ(gb, [
    { z: -11.2, w: 0.10, h: 0.12, y: 0.02 },
    { z: -8.6, w: 0.55, h: 0.46, y: 0.05 },
    { z: -5.4, w: 1.12, h: 0.72, y: 0.09 },
    { z: -1.0, w: 1.72, h: 0.9, y: 0.04 },
    { z: 4.6, w: 2.0, h: 0.86, y: 0.0 },
    { z: 8.8, w: 1.7, h: 0.78, y: 0.0 },
    { z: 10.7, w: 1.45, h: 0.7, y: 0.0 },
  ], C.jetTop, C.jetSide, C.jetBelly);
  // canopy
  box(gb, 0, 0.56, -5.6, 1.05, 0.32, 3.4, C.jetTip, 0.03, 0, 0, 0.08);
  // wings
  const wing = [
    { u: 1.35, le: -2.7, te: 3.4, h: 0.02 },
    { u: 3.0, le: -1.4, te: 3.2, h: 0.05 },
    { u: 4.7, le: 0.1, te: 3.1, h: 0.07 },
    { u: 6.3, le: 1.3, te: 3.15, h: 0.08 },
    { u: 8.0, le: 2.3, te: 3.2, h: 0.08 },
  ];
  bladeX(gb, wing, 0.20, C.jetSide, C.jetTip, C.jetBelly);
  bladeX(gb, wing.map((s) => ({ ...s, u: -s.u })), 0.20, C.jetSide, C.jetTip, C.jetBelly);
  // LERX
  box(gb, -1.25, 0.05, -2.9, 0.38, 0.18, 5.4, C.jetSide, 0, 0, 0.06);
  box(gb, 1.25, 0.05, -2.9, 0.38, 0.18, 5.4, C.jetSide, 0, 0, -0.06);
  // horizontal stabilisers
  const stab = [
    { u: 1.25, le: 3.6, te: 7.4, h: -0.02 },
    { u: 3.0, le: 4.4, te: 7.6, h: 0.0 },
    { u: 4.6, le: 5.2, te: 7.8, h: 0.02 },
    { u: 5.7, le: 5.8, te: 7.9, h: 0.03 },
  ];
  bladeX(gb, stab, 0.16, C.jetSide, C.jetTip, C.jetBelly);
  bladeX(gb, stab.map((s) => ({ ...s, u: -s.u })), 0.16, C.jetSide, C.jetTip, C.jetBelly);
  // twin tails
  const fin = [
    { u: 0.0, x: 2.15, le: 4.8, te: 7.4 },
    { u: 1.8, x: 2.3, le: 5.8, te: 8.2 },
    { u: 3.6, x: 2.5, le: 7.0, te: 8.9 },
  ];
  bladeY(gb, fin, 0.18, C.jetSide, C.jetTip, C.jetBelly);
  bladeY(gb, fin.map((s) => ({ ...s, x: -s.x })), 0.18, C.jetSide, C.jetTip, C.jetBelly);
  // twin engines/nozzles
  cyl(gb, -0.9, -0.4, 9.8, 0.62, 0.68, 1.5, 8, C.jetBelly);
  cyl(gb, 0.9, -0.4, 9.8, 0.62, 0.68, 1.5, 8, C.jetBelly);
  box(gb, -0.9, 0.12, 6.4, 1.2, 0.4, 6.8, C.jetTop);
  box(gb, 0.9, 0.12, 6.4, 1.2, 0.4, 6.8, C.jetTop);
  box(gb, 0, -0.2, 2.0, 2.2, 0.6, 9.0, C.jetSide);
  const geo = gbToGeometry(gb);
  return {
    geo,
    length: 22.0,
    nozzles: [{ x: -0.9, y: -0.1 }, { x: 0.9, y: -0.1 }],
    tailZ: 11.3,
    trail: 210,
  };
}

// ---------------------------------------------------------------------------
// wake, smoke, contrail, seagull
// ---------------------------------------------------------------------------
function buildWake(len, beam, wakeLen, fan) {
  const gb = makeGBC();
  const z0 = len * 0.5 - 1.0;
  const sections = 6;
  for (const side of [-1, 1]) {
    for (let i = 0; i < sections; i++) {
      const t0 = i / sections, t1 = (i + 1) / sections;
      const zA = z0 + wakeLen * t0, zB = z0 + wakeLen * t1;
      const cA = beam * (0.45 + fan * t0);
      const cB = beam * (0.45 + fan * t1);
      const wA = 0.6 + t0 * beam * 0.45;
      const wB = 0.6 + t1 * beam * 0.45;
      const a0 = 0.62 * Math.pow(1 - t0, 1.5) + 0.04;
      const a1 = 0.62 * Math.pow(1 - t1, 1.5) + 0.04;
      quadC(
        gb,
        [side * (cA - wA), 0, zA], [side * (cB - wB), 0, zB],
        [side * (cB + wB), 0, zB], [side * (cA + wA), 0, zA],
        C.wake, a0, a1, a1, a0,
      );
      // A camera standing 2 m above the sea sees a flat wake almost edge-on;
      // a low foam wall along the same arm keeps the trail readable at 800 m.
      const hA = 2.3 * Math.pow(1 - t0, 0.75) + 0.35;
      const hB = 2.3 * Math.pow(1 - t1, 0.75) + 0.35;
      quadC(
        gb,
        [side * cA, 0.1, zA], [side * cB, 0.1, zB],
        [side * cB, hB, zB], [side * cA, hA, zA],
        C.wake, a0 * 1.1, a1 * 1.1, a1 * 0.25, a0 * 0.25,
      );
    }
  }
  // churn behind the stern
  const churn = len * 0.12;
  quadC(gb, [-beam * 0.32, 0, z0], [beam * 0.32, 0, z0], [beam * 0.6, 0, z0 + churn], [-beam * 0.6, 0, z0 + churn], C.wake, 0.62, 0.62, 0.0, 0.0);
  quadC(gb, [-beam * 0.3, 0.1, z0], [beam * 0.3, 0.1, z0], [beam * 0.3, 3.0, z0], [-beam * 0.3, 3.0, z0], C.wake, 0.7, 0.7, 0.1, 0.1);
  // bow wave
  for (const side of [-1, 1]) {
    triC(gb, [side * beam * 0.35, 0, -len * 0.44], [side * beam * 0.55, 0, -len * 0.33], [side * beam * 0.75, 0, -len * 0.18], C.wake, 0.4, 0.2, 0.0);
    quadC(
      gb,
      [side * beam * 0.4, 0.1, -len * 0.42], [side * beam * 0.62, 0.1, -len * 0.28],
      [side * beam * 0.62, 1.4, -len * 0.28], [side * beam * 0.4, 1.4, -len * 0.42],
      C.wake, 0.35, 0.15, 0.02, 0.05,
    );
  }
  const geo = gbcToGeometry(gb);
  return geo;
}

const AB_COLOR = new THREE.Color(1.8, 0.55, 0.15);

function buildTrail(nozzles, tailZ, len) {
  const gb = makeGBC();
  const N = 7;
  for (let n = 0; n < nozzles.length; n++) {
    const nx = nozzles[n].x, ny = nozzles[n].y;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const z0 = tailZ + t0 * len;
      const z1 = tailZ + t1 * len;
      const w0 = 1.1 + t0 * 6.0;
      const w1 = 1.1 + t1 * 6.0;
      const a0 = 0.42 * Math.pow(1 - t0, 1.25);
      const a1 = 0.42 * Math.pow(1 - t1, 1.25);
      quadC(
        gb,
        [nx - w0, ny, z0], [nx + w0, ny, z0],
        [nx + w1, ny, z1], [nx - w1, ny, z1],
        C.contrail, a0, a0, a1, a1,
      );
    }
    // afterburner: soft crossed quads, very short and bright
    const gz = tailZ + 0.15;
    const s = 2.0;
    for (const plane of [0, 1]) {
      const c = [nx, ny, gz];
      const corners = plane === 0
        ? [[nx - s, ny - s, gz], [nx + s, ny - s, gz], [nx + s, ny + s, gz], [nx - s, ny + s, gz]]
        : [[nx, ny - s, gz - s], [nx, ny - s, gz + s], [nx, ny + s, gz + s], [nx, ny + s, gz - s]];
      for (let k = 0; k < 4; k++) {
        const a = corners[k], b = corners[(k + 1) % 4];
        triC(gb, c, a, b, AB_COLOR, 0.9, 0.0, 0.0);
      }
    }
  }
  return gbcToGeometry(gb);
}

function buildBird() {
  const gb = makeGB();
  // body (head at -z)
  prismZ(gb, [
    { z: -0.26, w: 0.035, h: 0.055, y: 0.035 },
    { z: -0.19, w: 0.065, h: 0.085, y: 0.03 },
    { z: -0.06, w: 0.08, h: 0.105, y: 0.012 },
    { z: 0.09, w: 0.066, h: 0.085, y: 0.008 },
    { z: 0.24, w: 0.03, h: 0.035, y: 0.012 },
  ], C.birdBody, C.birdBody, C.birdBelly);
  // beak
  prismZ(gb, [
    { z: -0.37, w: 0.006, h: 0.012, y: 0.026 },
    { z: -0.255, w: 0.03, h: 0.03, y: 0.03 },
  ], C.birdBeak, C.birdBeak, C.birdBelly);
  // tail fan
  const tailY = 0.02;
  for (const side of [-1, 1]) {
    tri(gb, 0, tailY, 0.22, side * 0.11, tailY, 0.4, side * 0.02, tailY, 0.3, C.birdWing);
  }
  tri(gb, -0.11, tailY, 0.4, 0.11, tailY, 0.4, 0, tailY, 0.3, C.birdTip);
  // wings — root at +/-0.075, tip at 0.74
  const wing = [
    { u: 0.075, le: -0.14, te: 0.17, h: 0.035 },
    { u: 0.26, le: -0.16, te: 0.13, h: 0.05 },
    { u: 0.46, le: -0.13, te: 0.10, h: 0.062 },
    { u: 0.62, le: -0.06, te: 0.075, h: 0.07 },
    { u: 0.74, le: 0.015, te: 0.05, h: 0.076 },
  ];
  bladeX(gb, wing, 0.022, C.birdWing, C.birdTip, C.birdBelly);
  bladeX(gb, wing.map((s) => ({ ...s, u: -s.u })), 0.022, C.birdWing, C.birdTip, C.birdBelly);
  const geo = gbToGeometry(gb);
  // wingtip colour band: the last segment already reads dark from the gradient
  return geo;
}

function buildSmokeMesh(count) {
  const gb = makeGBC();
  for (let i = 0; i < count; i++) {
    const base = gb.pos.length / 3;
    gb.pos.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const c = C.smoke;
    gb.col.push(c.r, c.g, c.b, 0, c.r, c.g, c.b, 0, c.r, c.g, c.b, 0, c.r, c.g, c.b, 0, c.r, c.g, c.b, 0);
    gb.idx.push(
      base, base + 1, base + 2,
      base, base + 2, base + 3,
      base, base + 3, base + 4,
      base, base + 4, base + 1,
    );
  }
  return gbcToGeometry(gb);
}

// ---------------------------------------------------------------------------
// materials — PBR-ish standard materials with an injected warm rim + emissive
// window/nav lights. No additional scene lights are used.
// ---------------------------------------------------------------------------
const uTime = { value: 0 };
const uSunView = { value: new THREE.Vector3(0, 0.2, -1) };
const uRimColor = { value: new THREE.Color(1.0, 0.46, 0.2) };
const uGlowColor = { value: new THREE.Color(1.0, 0.8, 0.55) };

const RIM_GLSL = /* glsl */`
  float trafficRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
  float trafficSun = clamp(dot(normalize(normal), normalize(uSunView)), 0.0, 1.0);
  totalEmissiveRadiance += uRimColor * (trafficRim * uRimStrength * (0.22 + 0.78 * trafficSun));
  totalEmissiveRadiance += vColor.rgb * vGlow * uGlowStrength * uGlowColor;
`;

function attachSolidShader(material, rimStrength, glowStrength) {
  const uRimStrength = { value: rimStrength };
  const uGlowStrength = { value: glowStrength };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTrafficTime = uTime;
    shader.uniforms.uSunView = uSunView;
    shader.uniforms.uRimColor = uRimColor;
    shader.uniforms.uGlowColor = uGlowColor;
    shader.uniforms.uRimStrength = uRimStrength;
    shader.uniforms.uGlowStrength = uGlowStrength;
    shader.vertexShader = `attribute float aGlow;
varying float vGlow;
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\tvGlow = aGlow;',
    );
    shader.fragmentShader = `uniform vec3 uRimColor;
uniform vec3 uGlowColor;
uniform vec3 uSunView;
uniform float uRimStrength;
uniform float uGlowStrength;
varying float vGlow;
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
${RIM_GLSL}`,
    );
  };
  material.customProgramCacheKey = () => 'traffic-solid-v1';
  return material;
}

function makeSolidMaterial(rimStrength = 1.0, glowStrength = 1.6, transparent = false) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: 0xffffff,
    roughness: 0.66,
    metalness: 0.14,
    side: THREE.DoubleSide,
    transparent,
    opacity: 1,
    depthWrite: true,
    envMapIntensity: 0.5,
  });
  return attachSolidShader(material, rimStrength, glowStrength);
}

function makeBirdMaterial(rimStrength = 0.7) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.15,
  });
  const uRimStrength = { value: rimStrength };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTrafficTime = uTime;
    shader.uniforms.uSunView = uSunView;
    shader.uniforms.uRimColor = uRimColor;
    shader.uniforms.uRimStrength = uRimStrength;
    shader.vertexShader = `attribute float aPhase;
attribute float aFlapRate;
attribute float aWingAmp;
uniform float uTrafficTime;
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */`vec3 transformed = vec3(position);
  float span = abs(position.x);
  float bend = max(span - 0.07, 0.0);
  float glide = smoothstep(0.36, 0.86, 0.5 + 0.5 * sin(uTrafficTime * aFlapRate * 0.21 + aPhase * 2.17));
  float amp = mix(0.035, aWingAmp, glide);
  float ang = (sin(uTrafficTime * aFlapRate + aPhase) * amp + 0.07) * smoothstep(0.0, 0.95, bend);
  float side = position.x < 0.0 ? -1.0 : 1.0;
  transformed.x = side * (0.07 + bend * cos(ang));
  transformed.y += bend * sin(ang);`,
    );
    shader.fragmentShader = `uniform vec3 uRimColor;
uniform vec3 uSunView;
uniform float uRimStrength;
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      /* glsl */`#include <lights_fragment_end>
  float trafficRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);
  float trafficSun = clamp(dot(normalize(normal), normalize(uSunView)), 0.0, 1.0);
  totalEmissiveRadiance += uRimColor * (trafficRim * uRimStrength * (0.2 + 0.8 * trafficSun));`,
    );
  };
  material.customProgramCacheKey = () => 'traffic-bird-v1';
  return material;
}

function makeWakeMaterial() {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    opacity: 1,
  });
}

function makeSmokeMaterial() {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    opacity: 1,
  });
}

function makeTrailMaterial() {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: true,
    opacity: 1,
  });
}

// ---------------------------------------------------------------------------
// module
// ---------------------------------------------------------------------------
export function createTraffic(engine, app, ctx) {
  const rng = mulberry32(20261023);
  const scene = engine.scene;
  const camera = engine.camera;
  const trafficQ = Math.max(0.25, Math.min(1, engine.qualityPreset?.traffic ?? 1));
  const lowTier = trafficQ < 0.5;

  const group = new THREE.Group();
  group.name = 'traffic';
  group.matrixAutoUpdate = true;
  scene.add(group);

  let userVisible = true;
  let visible = false;
  let clock = 0;
  let lastMode = app.mode;
  let lastUnderwater = false;
  let lastDepth = 0;
  let prewarmed = false;

  // -- shared temp objects (no per-frame allocations) ------------------------
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _s = new THREE.Vector3(1, 1, 1);
  const _m = new THREE.Matrix4();
  const _camQ = new THREE.Quaternion();
  const _camRight = new THREE.Vector3();
  const _camUp = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const _puff = new THREE.Vector3();

  // =========================================================================
  // birds
  // =========================================================================
  const BIRD_COUNT = Math.max(2, Math.round(6 * trafficQ));
  const birdGeo = buildBird();
  birdGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(BIRD_COUNT), 1));
  birdGeo.setAttribute('aFlapRate', new THREE.InstancedBufferAttribute(new Float32Array(BIRD_COUNT), 1));
  birdGeo.setAttribute('aWingAmp', new THREE.InstancedBufferAttribute(new Float32Array(BIRD_COUNT), 1));
  const birdMaterial = makeBirdMaterial(0.72);
  const birdMesh = new THREE.InstancedMesh(birdGeo, birdMaterial, BIRD_COUNT);
  birdMesh.name = 'traffic-gulls';
  birdMesh.frustumCulled = false;
  birdMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(birdMesh);

  const aPhase = birdGeo.getAttribute('aPhase');
  const aFlapRate = birdGeo.getAttribute('aFlapRate');
  const aWingAmp = birdGeo.getAttribute('aWingAmp');

  const birds = [];
  for (let i = 0; i < BIRD_COUNT; i++) {
    let b;
    if (i === 0) {
      // the one that passes close to the pontoon
      b = {
        cx: PONTOON.x + 1.2,
        cy: 5.0,
        cz: PONTOON.z - 11.5,
        rx: 8.6,
        rz: 6.6,
        a: rng() * TAU,
        dir: rng() < 0.5 ? -1 : 1,
        speed: 0.145,
        bob: 0.55,
        bobPhase: rng() * TAU,
        bank: 0.24,
        scale: 1.0,
        pitch: 0,
      };
    } else {
      b = {
        cx: -14 + rng() * 28,
        cy: 6.6 + rng() * 3.4,
        cz: -68 - rng() * 46,
        rx: 14 + rng() * 22,
        rz: 10 + rng() * 20,
        a: rng() * TAU,
        dir: rng() < 0.5 ? -1 : 1,
        speed: 0.06 + rng() * 0.07,
        bob: 0.7 + rng() * 1.3,
        bobPhase: rng() * TAU,
        bank: 0.18 + rng() * 0.16,
        scale: 0.82 + rng() * 0.3,
        pitch: 0,
      };
    }
    b.y = b.cy;
    b.vx = 0; b.vz = 0; b.vy = 0;
    birds.push(b);
    aPhase.array[i] = rng() * TAU;
    aFlapRate.array[i] = 4.2 + rng() * 2.2;
    aWingAmp.array[i] = 0.22 + rng() * 0.18;
  }
  aPhase.needsUpdate = true;
  aFlapRate.needsUpdate = true;
  aWingAmp.needsUpdate = true;

  // =========================================================================
  // boats
  // =========================================================================
  const trawlerGeo = buildTrawler();
  const steamerGeo = trafficQ >= 0.55 ? buildSteamer() : null;
  const carrierGeo = trafficQ >= 0.85 ? buildCarrier() : null;
  const wakeMaterial = makeWakeMaterial();

  const boatDefs = [
    {
      kind: 'trawler', z: -800, half: 540, speedMin: 9, speedMax: 12.5,
      geo: trawlerGeo.geo, length: trawlerGeo.length, wakeLen: trawlerGeo.wakeLen,
      wakeFan: trawlerGeo.wakeFan, rim: 1.7, next: 7, gapMin: 55, gapMax: 90,
    },
  ];
  if (steamerGeo) {
    boatDefs.push({
      kind: 'steamer', z: -1420, half: 720, speedMin: 12, speedMax: 16,
      geo: steamerGeo.geo, length: steamerGeo.length, wakeLen: steamerGeo.wakeLen,
      wakeFan: steamerGeo.wakeFan, rim: 1.6, next: 42, gapMin: 70, gapMax: 110,
      funnel: steamerGeo.funnel,
    });
  }
  if (carrierGeo) {
    boatDefs.push({
      kind: 'carrier', z: -2050, half: 620, speedMin: 10, speedMax: 13,
      geo: carrierGeo.geo, length: carrierGeo.length, wakeLen: carrierGeo.wakeLen,
      wakeFan: carrierGeo.wakeFan, rim: 1.9, next: 102, gapMin: 110, gapMax: 170,
    });
  }

  // hull beams used by the wake generator (the builders already carry them)
  const beams = { trawler: 7.4, steamer: 12.5, carrier: 40 };
  const boats = boatDefs.map((def) => {
    const wakeGeo = buildWake(def.length, beams[def.kind], def.wakeLen, def.wakeFan);
    const material = makeSolidMaterial(def.rim, 2.6, true);
    const mesh = new THREE.Mesh(def.geo, material);
    mesh.name = `traffic-${def.kind}`;
    mesh.visible = false;
    mesh.frustumCulled = false;
    const wake = new THREE.Mesh(wakeGeo, wakeMaterial);
    wake.name = `traffic-${def.kind}-wake`;
    wake.position.y = 0.5;
    wake.frustumCulled = false;
    wake.renderOrder = 1;
    mesh.add(wake);
    group.add(mesh);
    const b = {
      ...def,
      mesh,
      material,
      wake,
      active: false,
      t: 0,
      duration: 1,
      dir: 1,
      x0: 0,
      zNow: def.z,
      speed: 10,
      phase: rng() * TAU,
      puffsUntil: 0,
      smokeAccum: 0,
    };
    return b;
  });

  const funnelLocal = steamerGeo?.funnel || null;

  // =========================================================================
  // jets
  // =========================================================================
  const j20 = buildJ20();
  const j15 = trafficQ >= 0.5 ? buildJ15() : null;
  const jetMaterial = makeSolidMaterial(2.2, 2.0, true);
  const jetSlots = [];
  const jetCount = lowTier ? 2 : 4;
  for (let i = 0; i < jetCount; i++) {
    const is20 = lowTier ? true : i < 2;
    const def = is20 ? j20 : j15;
    const mesh = new THREE.Mesh(def.geo, jetMaterial);
    mesh.name = `traffic-${is20 ? 'j20' : 'j15'}`;
    mesh.scale.setScalar(1.3);
    mesh.visible = false;
    mesh.frustumCulled = false;
    const trailMat = makeTrailMaterial();
    const trail = new THREE.Mesh(buildTrail(def.nozzles, def.tailZ, def.trail), trailMat);
    trail.name = 'traffic-contrail';
    trail.frustumCulled = false;
    trail.renderOrder = 2;
    mesh.add(trail);
    group.add(mesh);
    jetSlots.push({
      type: is20 ? 'j20' : 'j15',
      mesh,
      trail,
      trailMat,
      active: false,
      t: 0,
      duration: 14,
      dir: 1,
      x0: 0,
      x1: 0,
      z: -1300,
      y: 380,
      speed: 240,
      phase: rng() * TAU,
    });
  }

  // =========================================================================
  // smoke puffs (steamer)
  // =========================================================================
  const SMOKE_COUNT = 14;
  const smokeGeo = buildSmokeMesh(SMOKE_COUNT);
    const smokeMat = makeSmokeMaterial();
  const smokeMesh = new THREE.Mesh(smokeGeo, smokeMat);
  smokeMesh.name = 'traffic-smoke';
  smokeMesh.frustumCulled = false;
  smokeMesh.visible = false;
  smokeMesh.renderOrder = 2;
  group.add(smokeMesh);
  const smokePos = smokeGeo.getAttribute('position');
  const smokeCol = smokeGeo.getAttribute('color');
  const smokePuffs = [];
  for (let i = 0; i < SMOKE_COUNT; i++) {
    smokePuffs.push({
      active: false,
      age: 0,
      life: 12,
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      size0: 2.5,
      size1: 12,
      alpha: 0.5,
    });
  }

  // =========================================================================
  // selection / spawning
  // =========================================================================
  const nextBoat = { trawler: boatDefs[0].next, steamer: Infinity, carrier: Infinity };
  for (const b of boatDefs) nextBoat[b.kind] = b.next;
  let nextJet = lowTier ? 38 : 17;
  let jetToggle = false;
  let puffCursor = 0;

  function activeBoatCount() {
    let n = 0;
    for (let i = 0; i < boats.length; i++) if (boats[i].active) n++;
    return n;
  }

  function activeJetCount() {
    let n = 0;
    for (let i = 0; i < jetSlots.length; i++) if (jetSlots[i].active) n++;
    return n;
  }

  function boatByName(kind) {
    for (let i = 0; i < boats.length; i++) if (boats[i].kind === kind) return boats[i];
    return null;
  }

  function placeBoat(b) {
    const x = b.x0 + b.dir * b.speed * b.t;
    const bob = Math.sin(clock * 0.55 + b.phase) * 0.35;
    const roll = Math.sin(clock * 0.41 + b.phase * 1.7) * 0.014;
    const pitch = Math.sin(clock * 0.33 + b.phase * 0.6) * 0.009;
    b.mesh.position.set(x, bob, b.zNow);
    b.mesh.rotation.set(pitch, b.dir > 0 ? -Math.PI / 2 : Math.PI / 2, roll, 'YXZ');
    const fadeIn = clamp(b.t / 2.6, 0, 1);
    const fadeOut = clamp((b.duration - b.t) / 3.2, 0, 1);
    b.material.opacity = Math.min(1, fadeIn, fadeOut);
  }

  function spawnBoat(b, opts = {}) {
    if (!b) return null;
    if (!opts.force && activeBoatCount() >= 2) return null;
    b.dir = opts.dir !== undefined ? opts.dir : (rng() < 0.5 ? 1 : -1);
    b.speed = b.speedMin + rng() * (b.speedMax - b.speedMin);
    b.duration = (b.half * 2) / b.speed;
    b.x0 = -b.dir * b.half;
    b.zNow = b.z * (0.92 + rng() * 0.16);
    b.t = opts.center ? b.duration * 0.5 : 0;
    b.active = true;
    b.smokeAccum = 0;
    b.mesh.visible = true;
    b.material.opacity = opts.center ? Math.min(1, (b.duration * 0.5) / 2.6) : 0;
    placeBoat(b);
    return b;
  }

  function despawnBoat(b) {
    b.active = false;
    b.mesh.visible = false;
  }

  function scheduleBoat(b, now) {
    nextBoat[b.kind] = now + b.gapMin + rng() * (b.gapMax - b.gapMin);
  }

  function placeJet(j) {
    const k = clamp(j.t / Math.max(0.01, j.duration), 0, 1);
    const x = j.x0 + (j.x1 - j.x0) * k;
    const y = j.y + Math.sin(k * Math.PI) * 22;
    j.mesh.position.set(x, y, j.z);
    _e.set(0.015, j.dir > 0 ? -Math.PI / 2 : Math.PI / 2, j.dir * 0.09, 'YXZ');
    j.mesh.quaternion.setFromEuler(_e);
    j.trailMat.opacity = 0.82 + 0.18 * Math.sin(clock * 17 + j.phase);
  }

  function spawnJet(type, opts = {}) {
    let slot = null;
    for (let i = 0; i < jetSlots.length; i++) {
      const s = jetSlots[i];
      if (!s.active && s.type === (type || s.type)) { slot = s; break; }
    }
    if (!slot && !type) {
      for (let i = 0; i < jetSlots.length; i++) if (!jetSlots[i].active) { slot = jetSlots[i]; break; }
    }
    if (!slot && opts.force) {
      // free the oldest jet
      slot = jetSlots[0];
      for (let i = 1; i < jetSlots.length; i++) if (jetSlots[i].t > slot.t) slot = jetSlots[i];
    }
    if (!slot) return null;
    if (!opts.force && activeJetCount() >= 2) return null;
    const dist = 880 + rng() * 400;
    const elev = (11 + rng() * 4.5) * DEG;
    const duration = 15 + rng() * 5;
    const alt = Math.tan(elev) * dist + 2.5;
    slot.dir = opts.dir !== undefined ? opts.dir : (rng() < 0.5 ? 1 : -1);
    slot.z = -dist;
    slot.y = alt;
    slot.duration = duration;
    slot.speed = (dist * 3.0) / duration;
    slot.x0 = -slot.dir * dist * 1.5;
    slot.x1 = slot.dir * dist * 1.5;
    slot.t = opts.center ? duration * 0.5 : 0;
    slot.active = true;
    slot.mesh.visible = true;
    placeJet(slot);
    return slot;
  }

  // =========================================================================
  // smoke emission
  // =========================================================================
  function emitPuff(x, y, z) {
    const p = smokePuffs[puffCursor];
    puffCursor = (puffCursor + 1) % SMOKE_COUNT;
    p.active = true;
    p.age = 0;
    p.life = 10 + rng() * 5;
    p.x = x + (rng() - 0.5) * 2.0;
    p.y = y + (rng() - 0.5) * 1.2;
    p.z = z + (rng() - 0.5) * 2.0;
    p.vx = 1.0 + rng() * 0.9;
    p.vy = 3.6 + rng() * 2.2;
    p.vz = -0.5 + rng() * 0.8;
    p.size0 = 3.0 + rng() * 1.5;
    p.size1 = 17 + rng() * 9;
    p.alpha = 0.5 + rng() * 0.18;
  }

  function steamerFunnelWorld(out) {
    const s = boatByName('steamer');
    if (!s || !s.active) return null;
    const yaw = s.mesh.rotation.y;
    const lx = funnelLocal.x, ly = funnelLocal.y, lz = funnelLocal.z;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    out.set(
      s.mesh.position.x + lx * c + lz * sn,
      s.mesh.position.y + ly,
      s.mesh.position.z - lx * sn + lz * c,
    );
    return out;
  }

  function updateSmoke(dt) {
    let puffLive = 0;
    const s = boatByName('steamer');
    if (s && s.active && s.t > 2.2 && s.t < s.duration - 2.0) {
      s.smokeAccum += dt;
      const interval = 0.8;
      let guard = 0;
      while (s.smokeAccum > interval && guard++ < 3) {
        s.smokeAccum -= interval;
        if (steamerFunnelWorld(_v)) emitPuff(_v.x, _v.y, _v.z);
      }
    }
    // an eye-facing billboard per puff keeps a small soft round plume
    _camQ.copy(camera.quaternion);
    _camRight.set(1, 0, 0).applyQuaternion(_camQ);
    _camUp.set(0, 1, 0).applyQuaternion(_camQ);
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const p = smokePuffs[i];
      const base = i * 5;
      if (!p.active) {
        smokeCol.array[base * 4 + 3] = 0;
        continue;
      }
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        smokeCol.array[base * 4 + 3] = 0;
        continue;
      }
      puffLive++;
      const k = p.age / p.life;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.996;
      p.vy *= 0.997;
      const size = p.size0 + (p.size1 - p.size0) * Math.pow(k, 0.7);
      const alpha = p.alpha * Math.min(1, k / 0.12) * Math.pow(1 - k, 1.35);
      const rx = _camRight.x * size, ry = _camRight.y * size, rz = _camRight.z * size;
      const ux = _camUp.x * size, uy = _camUp.y * size, uz = _camUp.z * size;
      const o = base * 3;
      smokePos.array[o + 0] = p.x;
      smokePos.array[o + 1] = p.y;
      smokePos.array[o + 2] = p.z;
      smokePos.array[o + 3] = p.x + rx + ux;
      smokePos.array[o + 4] = p.y + ry + uy;
      smokePos.array[o + 5] = p.z + rz + uz;
      smokePos.array[o + 6] = p.x - rx + ux;
      smokePos.array[o + 7] = p.y - ry + uy;
      smokePos.array[o + 8] = p.z - rz + uz;
      smokePos.array[o + 9] = p.x - rx - ux;
      smokePos.array[o + 10] = p.y - ry - uy;
      smokePos.array[o + 11] = p.z - rz - uz;
      smokePos.array[o + 12] = p.x + rx - ux;
      smokePos.array[o + 13] = p.y + ry - uy;
      smokePos.array[o + 14] = p.z + rz - uz;
      const co = base * 4;
      smokeCol.array[co + 3] = alpha;
      smokeCol.array[co + 7] = 0;
      smokeCol.array[co + 11] = 0;
      smokeCol.array[co + 15] = 0;
      smokeCol.array[co + 19] = 0;
    }
    smokePos.needsUpdate = true;
    smokeCol.needsUpdate = true;
    smokeMesh.visible = puffLive > 0;
  }

  // =========================================================================
  // per-frame updates
  // =========================================================================
  updateSmoke(0); // zero out the alpha on the first frame

  function updateBirds(dt) {
    for (let i = 0; i < BIRD_COUNT; i++) {
      const b = birds[i];
      b.a += b.dir * b.speed * dt;
      const ca = Math.cos(b.a), sa = Math.sin(b.a);
      const x = b.cx + ca * b.rx;
      const z = b.cz + sa * b.rz;
      const y = b.cy + Math.sin(b.a * 2 + b.bobPhase) * b.bob * 0.5 + Math.sin(clock * 0.7 + b.bobPhase) * 0.18;
      // analytic tangent (world) for heading
      const dx = -sa * b.rx * b.dir * b.speed;
      const dz = ca * b.rz * b.dir * b.speed;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.sin(b.a * 2 + b.bobPhase) * 0.06 - 0.03;
      const roll = b.dir * b.bank + Math.sin(clock * 0.8 + b.bobPhase) * 0.04;
      _p.set(x, y, z);
      _e.set(pitch, yaw, roll, 'YXZ');
      _q.setFromEuler(_e);
      _s.set(b.scale, b.scale, b.scale);
      _m.compose(_p, _q, _s);
      birdMesh.setMatrixAt(i, _m);
      b.y = y;
      b.vx = dx; b.vz = dz;
    }
    birdMesh.instanceMatrix.needsUpdate = true;
  }

  function updateBoats(dt) {
    for (let i = 0; i < boats.length; i++) {
      const b = boats[i];
      if (!b.active) continue;
      b.t += dt;
      if (b.t >= b.duration) {
        despawnBoat(b);
        scheduleBoat(b, clock);
        continue;
      }
      placeBoat(b);
    }
  }

  function updateJets(dt) {
    for (let i = 0; i < jetSlots.length; i++) {
      const j = jetSlots[i];
      if (!j.active) continue;
      j.t += dt;
      if (j.t >= j.duration) {
        j.active = false;
        j.mesh.visible = false;
        continue;
      }
      placeJet(j);
    }
  }

  function updateSchedule(dt) {
    for (let i = 0; i < boats.length; i++) {
      const b = boats[i];
      if (clock >= nextBoat[b.kind]) {
        const before = activeBoatCount();
        spawnBoat(b);
        if (activeBoatCount() > before) scheduleBoat(b, clock);
        else nextBoat[b.kind] = clock + 24;
      }
    }
    if (clock >= nextJet) {
      const type = lowTier ? 'j20' : (jetToggle ? 'j15' : 'j20');
      if (!lowTier) jetToggle = !jetToggle;
      spawnJet(type);
      nextJet = clock + (22 + rng() * 18) * (lowTier ? 1.8 : 1);
    }
  }

  function updateSunView() {
    _camQ.copy(camera.quaternion).invert();
    uSunView.value.copy(SUN_DIR).applyQuaternion(_camQ);
    uTime.value = clock;
  }

  // =========================================================================
  // visibility
  // =========================================================================
  function applyVisibility() {
    const show = userVisible
      && !lastUnderwater
      && lastDepth <= 1
      && (lastMode === 'dive' || lastMode === 'shop' || lastMode === 'fishing' || lastMode === 'rebound');
    if (show !== visible) {
      visible = show;
      group.visible = show;
    }
  }

  // =========================================================================
  // debug helpers
  // =========================================================================
  function debugSpawn(kind, opts = {}) {
    const k = String(kind || '').toLowerCase();
    if (k === 'gull' || k === 'gulls' || k === 'bird' || k === 'birds') {
      const b = birds[0];
      // put the near gull in the camera's forward half-space
      const fx = camera.getWorldDirection(_v).x;
      const fz = _v.z;
      b.a = Math.atan2(fz, fx);
      b.t = 0;
      return { kind: 'gull', visible: group.visible };
    }
    if (k === 'trawler' || k === 'steamer' || k === 'carrier') {
      const b = boatByName(k);
      if (!b) return { error: 'unknown boat' };
      if (activeBoatCount() >= 2) {
        // free the oldest active boat so a debug shot is deterministic
        let oldest = null;
        for (const other of boats)
        if (other.active && (!oldest || other.t > oldest.t)) oldest = other;
        if (oldest) despawnBoat(oldest);
      }
      const s = spawnBoat(b, { ...opts, force: true, center: opts.center !== false });
      return s ? { kind: b.kind, active: true, duration: +s.duration.toFixed(1) } : { error: 'spawn failed' };
    }
    if (k === 'j20' || k === 'j15') {
      const s = spawnJet(k, { ...opts, force: true, center: opts.center !== false });
      return s ? { kind: s.type, active: true, duration: +s.duration.toFixed(1) } : { error: 'spawn failed' };
    }
    if (k === 'jet' || k === 'jets') {
      const s = spawnJet(null, { ...opts, force: true, center: opts.center !== false });
      return s ? { kind: s.type, active: true, duration: +s.duration.toFixed(1) } : { error: 'spawn failed' };
    }
    return { error: `unknown traffic kind: ${kind}` };
  }

  function debugClear() {
    for (const b of boats) despawnBoat(b);
    for (const j of jetSlots) { j.active = false; j.mesh.visible = false; }
    for (const p of smokePuffs) p.active = false;
    for (let i = 0; i < SMOKE_COUNT; i++) smokeCol.array[i * 20 + 3] = 0;
    smokeCol.needsUpdate = true;
    smokeMesh.visible = false;
    return { cleared: true };
  }

  function countTraffic() {
    let drawCalls = 0;
    let triangles = 0;
    if (!group.visible) return { drawCalls, triangles };
    const visit = (o) => {
      if (!o.visible) return;
      if (o.isMesh) {
        const geo = o.geometry;
        if (geo) {
          drawCalls++;
          const n = geo.index ? geo.index.count / 3 : (geo.attributes.position?.count || 0) / 3;
          triangles += o.isInstancedMesh ? n * o.count : n;
        }
      }
      for (let i = 0; i < o.children.length; i++) visit(o.children[i]);
    };
    visit(group);
    return { drawCalls, triangles };
  }

  function debugInfo() {
    const activeBoats = [];
    for (const b of boats) {
      if (b.active) activeBoats.push({ kind: b.kind, t: +b.t.toFixed(1), duration: +b.duration.toFixed(1), x: +b.mesh.position.x.toFixed(1), z: +b.mesh.position.z.toFixed(1) });
    }
    const activeJets = [];
    for (const j of jetSlots) {
      if (j.active) activeJets.push({ type: j.type, t: +j.t.toFixed(1), duration: +j.duration.toFixed(1), x: +j.mesh.position.x.toFixed(1), y: +j.mesh.position.y.toFixed(1), z: +j.mesh.position.z.toFixed(1) });
    }
    const livePuffs = [];
    for (const p of smokePuffs) {
      if (p.active) livePuffs.push({ x: +p.x.toFixed(0), y: +p.y.toFixed(0), z: +p.z.toFixed(0), age: +p.age.toFixed(1) });
    }
    const counts = countTraffic();
    const info = engine.renderer.info;
    return {
      visible: group.visible,
      userVisible,
      mode: lastMode,
      clock: +clock.toFixed(1),
      birds: BIRD_COUNT,
      activeBoats,
      activeJets,
      smokePuffs: livePuffs.length,
      smoke: livePuffs.slice(0, 3),
      smokeVisible: smokeMesh.visible,
      trafficDrawCalls: counts.drawCalls,
      trafficTriangles: counts.triangles,
      rendererDrawCalls: info.render.calls,
      rendererTriangles: info.render.triangles,
      nextBoatIn: { trawler: +(nextBoat.trawler - clock).toFixed(1), steamer: +(nextBoat.steamer - clock).toFixed(1), carrier: +(nextBoat.carrier - clock).toFixed(1) },
      nextJetIn: +(nextJet - clock).toFixed(1),
      quality: { density: trafficQ, birds: BIRD_COUNT, boats: boatDefs.map((b) => b.kind), jets: jetSlots.length },
    };
  }

  // =========================================================================
  // public surface
  // =========================================================================
  function applyTrafficQuality(preset) {
    const q = Math.max(0.25, Math.min(1, preset?.traffic ?? engine.qualityPreset?.traffic ?? 1));
    birdMesh.count = Math.max(2, Math.round(6 * q));
    for (const b of boats) {
      if (b.kind !== 'trawler' && q < 0.55) {
        if (b.active) despawnBoat(b);
        nextBoat[b.kind] = Infinity;
      }
    }
    for (const j of jetSlots) {
      if (q < 0.5 && j.type === 'j15' && j.active) { j.active = false; j.mesh.visible = false; }
    }
    return { density: q, birds: birdMesh.count };
  }
  const offQuality = engine.onQuality?.((tier, preset) => applyTrafficQuality(preset));

  return {
    update(dt, info) {
      if (info) {
        lastMode = info.mode;
        lastUnderwater = !!info.underwater;
        lastDepth = info.depth || 0;
      } else {
        lastMode = app.mode;
        lastUnderwater = camera.position.y < 0.02;
        lastDepth = app.cameraDepth;
      }
      applyVisibility();
      if (!visible || dt <= 0) return;
      const step = Math.min(dt, 0.05);
      clock += step;
      updateSunView();
      updateBirds(step);
      updateBoats(step);
      updateSchedule(step);
      updateJets(step);
      updateSmoke(step);
    },
    setVisible(v) {
      userVisible = !!v;
      applyVisibility();
    },
    prewarm() {
      if (prewarmed) return true;
      prewarmed = true;
      // On low/medium the composer warm already covered the traffic shaders;
      // a second full-scene compile is a large cold-boot cost for no benefit.
      if (engine.qualityPreset?.prewarm?.trafficCompile === false) return true;
      try {
        // Compiles every material in the scene; the traffic materials are new, so
        // this warms their onBeforeCompile variants without a first-frame hitch.
        engine.renderer.compile(engine.scene, engine.camera);
      } catch (err) {
        prewarmed = false;
      }
      return prewarmed;
    },
    setQuality(preset) {
      return applyTrafficQuality(preset);
    },
    dispose() {
      try { offQuality?.(); } catch (err) { /* noop */ }
      scene.remove(group);
      group.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
          else o.material?.dispose?.();
        }
      });
      group.clear();
      visible = false;
    },
    debugInfo,
    debugSpawn,
    debugClear,
  };
}
