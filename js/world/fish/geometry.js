// Procedural fish anatomy — lofted body from cross-sections, jaw/gape, operculum
// plates, ray-ribbed fins, turret eyes, lips.  Everything is built in units of
// fork length along +Z (nose at +0.5, tail at -0.5); the fish system scales each
// instance to metres. Owner: fish-v2.
//
// Parts (aPart attribute consumed by material.js):
//   0 body · 1 fin membrane · 2 eyeball · 3 iris · 4 pupil · 5 socket/lid
//   6 mouth cavity · 8 lips
import * as THREE from 'three';

const BELLY_SCALE = 1.055;
const TAU = Math.PI * 2;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
};

// ── body silhouette ──────────────────────────────────────────────────────────
export function girthAt(body, t) {
  const peak = body.peak;
  let g;
  if (t <= peak) {
    g = Math.pow(Math.sin(Math.max(0, t / peak) * Math.PI * 0.5), body.headPow);
  } else {
    g = Math.pow(Math.cos(Math.min(1, (t - peak) / (1 - peak)) * Math.PI * 0.5), body.tailPow);
  }
  // blunt forehead (mahi, grouper) — keep girth at the very front of the snout
  const noseW = 1 - smooth(0.0, 0.085, t);
  g = Math.max(g, body.noseGirth * noseW);
  // fleshy caudal peduncle
  const tailW = smooth(0.78, 1.0, t);
  g = Math.max(g, body.peduncle * (0.45 + 0.55 * tailW));
  // forehead / cheek volume (hairtail's large head, grouper's jaw)
  const bulge = body.headBulge || 0;
  if (bulge > 0) {
    const bc = body.headBulgeCenter ?? 0.055;
    const bw = body.headBulgeWidth ?? 0.075;
    g *= 1 + bulge * Math.exp(-Math.pow((t - bc) / bw, 2));
  }
  // raised operculum ridge — catches the key light and separates head from body
  if (body._gillT != null) {
    g *= 1 + 0.035 * Math.exp(-Math.pow((t - body._gillT) / 0.022, 2));
  }
  return g;
}

/** Extra lateral thickness through the cheeks / head (grouper, cobia). */
function cheekFactor(body, t) {
  const c = body.cheek || 0;
  if (c <= 0) return 1;
  const cc = body.cheekCenter ?? 0.14;
  const cw = body.cheekWidth ?? 0.1;
  return 1 + c * Math.exp(-Math.pow((t - cc) / cw, 2));
}

/** Sloping forehead: the dorsal profile drops toward the snout. */
function dorsalShift(body, t) {
  const s = body.headSlope || 0;
  if (s <= 0) return 0;
  const peak = body.peak;
  const nose = 1 - smooth(0, peak * 0.86, t);
  const nape = Math.exp(-Math.pow((t - peak * 0.8) / 0.11, 2));
  return (-s * nose * nose + s * 0.28 * nape);
}

export function centerY(body, t) {
  return body.headRise * (0.28 - t) + body.bellyBias * Math.sin(t * Math.PI);
}

export function halfHeight(form, t) {
  return form.body.depth * 0.5 * girthAt(form.body, t);
}
export function halfWidth(form, t) {
  return form.body.width * 0.5 * girthAt(form.body, t) * cheekFactor(form.body, t);
}
export function topY(form, t) {
  const hh = halfHeight(form, t);
  const shift = Math.max(-hh * 0.85, Math.min(hh * 0.3, dorsalShift(form.body, t)));
  return centerY(form.body, t) + hh + shift;
}
export function bottomY(form, t) {
  return centerY(form.body, t) - halfHeight(form, t) * BELLY_SCALE;
}

function sectionPoint(form, t, theta) {
  const body = form.body;
  const g = girthAt(body, t);
  const hh = body.depth * 0.5 * g;
  const hw = body.width * 0.5 * g * cheekFactor(body, t);
  const cy = centerY(body, t);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / Math.max(1.5, body.section);
  const sx = Math.sign(c) * Math.pow(Math.abs(c), e);
  const sy = Math.sign(s) * Math.pow(Math.abs(s), e);
  const belly = s >= 0 ? 1.0 : BELLY_SCALE;
  // the sloping forehead only lifts/lowers the dorsal half of the section,
  // clamped so the snout can never fold inside out
  const topWeight = Math.pow(Math.max(0, s), 1.25);
  const shift = Math.max(-hh * 0.85, Math.min(hh * 0.3, dorsalShift(body, t) * topWeight));
  return [sx * hw, cy + sy * hh * belly + shift, 0.5 - t];
}

/** Surface normal of the section at (t, theta), in the XY plane. */
function sectionNormal(form, t, theta) {
  const body = form.body;
  const g = girthAt(body, t);
  const hh = body.depth * 0.5 * g;
  const hw = body.width * 0.5 * g * cheekFactor(body, t);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const belly = s >= 0 ? 1.0 : BELLY_SCALE;
  const nx = c / Math.max(1e-4, hw);
  const ny = s / Math.max(1e-4, hh * belly);
  const len = Math.hypot(nx, ny) || 1;
  return [nx / len, ny / len, 0];
}

// ── mesh accumulation ────────────────────────────────────────────────────────
class Builder {
  constructor() {
    this.pos = [];
    this.norm = [];
    this.uv = [];
    this.part = [];
    this.idx = [];
  }
  get count() { return this.pos.length / 3; }

  vert(p, uv, part) {
    const i = this.count;
    this.pos.push(p[0], p[1], p[2]);
    this.norm.push(0, 0, 1);
    this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
    this.part.push(part);
    return i;
  }

  triangle(a, b, c) { this.idx.push(a, b, c); }

  addGeometry(geo, matrix, part) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uvA = geo.attributes.uv;
    const base = this.count;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z);
      this.norm.push(n.x, n.y, n.z);
      this.uv.push(uvA ? uvA.getX(i) : 0, uvA ? uvA.getY(i) : 0);
      this.part.push(part);
    }
    const ind = geo.index;
    if (ind) {
      for (let i = 0; i < ind.count; i++) this.idx.push(base + ind.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    }
  }

  /** Add a parametric grid; fn(i,j) -> [x,y,z]. uvFn(u,v) -> [u,v]. */
  grid(nu, nv, fn, part, uvFn) {
    const rows = [];
    for (let j = 0; j < nv; j++) {
      const row = [];
      for (let i = 0; i < nu; i++) {
        const u = nu === 1 ? 0 : i / (nu - 1);
        const v = nv === 1 ? 0 : j / (nv - 1);
        const p = fn(u, v, i, j);
        const uv = uvFn ? uvFn(u, v, i, j) : [u, v];
        row.push(this.vert(p, uv, part));
      }
      rows.push(row);
    }
    for (let j = 0; j < nv - 1; j++) {
      for (let i = 0; i < nu - 1; i++) {
        const a = rows[j][i], b = rows[j][i + 1];
        const c = rows[j + 1][i], d = rows[j + 1][i + 1];
        this.triangle(a, c, b);
        this.triangle(b, c, d);
      }
    }
    return rows;
  }

  finish() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    geo.setIndex(this.idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

// ── fins ─────────────────────────────────────────────────────────────────────
function finProfile(style, u) {
  switch (style) {
    case 'sail': return 0.26 + 0.8 * Math.pow(Math.sin(Math.PI * (0.08 + 0.86 * u)), 0.62);
    case 'sickle': return (0.5 + 0.64 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.92 + 0.06)), 0.8)) * (1 - 0.3 * u);
    case 'notched': {
      const base = 0.58 + 0.42 * Math.sin(Math.PI * u);
      const notch = 1 - 0.34 * Math.exp(-Math.pow((u - 0.58) / 0.11, 2));
      return base * notch;
    }
    case 'ribbon': return 0.45 + 0.55 * Math.sin(Math.PI * u);
    case 'long':
    default: return 0.55 + 0.45 * Math.pow(Math.sin(Math.PI * u), 0.7);
  }
}

function addDorsal(build, form, spec, detail, top) {
  if (!spec) return;
  const style = spec.style || 'long';
  const rays = spec.rays || (style === 'sail' ? 17 : style === 'notched' ? 13 : 11);
  const NUP = detail >= 3 ? rays * 3 : detail >= 2 ? rays * 2 + 2 : rays + 3;
  const NV = detail >= 3 ? 9 : detail >= 2 ? 7 : 5;
  const [t0, t1] = spec.t;
  const side = top ? 1 : -1;
  const base = [];
  const tip = [];
  for (let i = 0; i < NUP; i++) {
    const u = i / (NUP - 1);
    const t = lerp(t0, t1, u);
    const y = (top ? topY(form, t) : bottomY(form, t)) - side * 0.003;
    // scalloped trailing edge: rays stand proud of the web between them
    const phase = u * rays * TAU;
    const scallop = 1 + 0.075 * Math.cos(phase);
    const len = spec.height * finProfile(style, u) * scallop;
    base.push([0, y, 0.5 - t]);
    tip.push([0, y + side * len, 0.5 - t - spec.sweep * len]);
  }
  build.grid(NUP, NV, (u, v) => {
    const fi = u * (NUP - 1);
    const i0 = Math.min(NUP - 2, Math.floor(fi));
    const k = fi - i0;
    const bx = lerp(base[i0][0], base[i0 + 1][0], k);
    const by = lerp(base[i0][1], base[i0 + 1][1], k);
    const bz = lerp(base[i0][2], base[i0 + 1][2], k);
    const tx = lerp(tip[i0][0], tip[i0 + 1][0], k);
    const ty = lerp(tip[i0][1], tip[i0 + 1][1], k);
    const tz = lerp(tip[i0][2], tip[i0 + 1][2], k);
    const bow = Math.sin(v * Math.PI) * 0.008 * (0.4 + 0.6 * Math.sin(u * Math.PI));
    // ray ribs: alternate a shallow corrugation across the membrane
    const rib = Math.cos(u * rays * TAU) * 0.0026 * Math.pow(v, 0.55);
    return [
      lerp(bx, tx, v) + bow + rib,
      lerp(by, ty, v),
      lerp(bz, tz, v),
    ];
  }, 1);
}

function addCaudal(build, form, spec, detail) {
  if (!spec || spec.type === 'none') return;
  const rays = spec.rays || (spec.type === 'lunate' ? 17 : 15);
  const NU = detail >= 3 ? rays * 3 : detail >= 2 ? rays * 2 + 2 : rays + 3;
  const NV = detail >= 3 ? 6 : detail >= 2 ? 5 : 3;
  const t = 1;
  const zTail = -0.5;
  const yPed = centerY(form.body, t);
  const rootH = Math.max(0.014, halfHeight(form, t) * 1.25);
  const span = spec.span;
  const len = spec.len;

  const edgeZ = (v) => {
    const a = Math.abs(v * 2 - 1);
    switch (spec.type) {
      case 'lunate': return 0.14 + 0.86 * Math.pow(a, 1.85);
      case 'forked': return 0.3 + 0.7 * Math.pow(a, 1.45);
      case 'rounded': return 1 - 0.3 * Math.pow(v * 2 - 1, 2);
      case 'truncate': return 0.94;
      case 'fan': return 0.92 - 0.28 * Math.pow(v * 2 - 1, 2);
      default: return 0.85;
    }
  };
  const edgeY = (v) => yPed + (v - 0.5) * span;

  build.grid(NU, NV, (u, v) => {
    const rootY = yPed + (u - 0.5) * rootH * 2.0;
    const outY = edgeY(u);
    // ray tips stand slightly proud of the web
    const scallop = 1 + (spec.type === 'rounded' ? 0.018 : 0.035) * Math.cos(u * rays * TAU);
    const outZ = zTail - len * edgeZ(u) * scallop;
    const w = Math.pow(v, 0.9);
    const bow = Math.sin(u * Math.PI) * spec.bow * Math.sin(v * Math.PI);
    const rib = Math.cos(u * rays * TAU) * 0.0022 * Math.pow(v, 1.2);
    return [
      bow + rib,
      lerp(rootY, outY, w),
      lerp(zTail, outZ, w),
    ];
  }, 1);
}

function addPectoral(build, form, spec, detail, side) {
  if (!spec) return;
  const rays = spec.big && detail < 2 ? Math.min(spec.rays, 11) : spec.rays;
  const NV = detail >= 3 ? 7 : detail >= 2 ? 5 : 4;
  const t = spec.t;
  const bw = halfWidth(form, t);
  const attach = [side * (bw * 1.02 + 0.004), centerY(form.body, t) + 0.004, 0.5 - t];
  const dirs = [];
  const lens = [];
  for (let i = 0; i < rays; i++) {
    const u = i / (rays - 1);
    const a = spec.down + spec.spread * (u - 0.5);
    // lie the fin back along the flank instead of straight at the camera
    const outward = 0.2 + 0.16 * Math.sin(u * Math.PI);
    const dx = side * outward;
    const dy = -Math.sin(a);
    const dz = -Math.cos(a) * 0.92;
    const inv = 1 / Math.hypot(dx, dy, dz);
    dirs.push([dx * inv, dy * inv, dz * inv]);
    let prof;
    switch (spec.shape) {
      case 'sickle': prof = 0.42 + 0.66 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.08)), 0.8) * (1 - 0.28 * u); break;
      case 'fan': prof = 0.62 + 0.4 * Math.pow(Math.sin(Math.PI * u), 0.5); break;
      case 'round':
      default: prof = 0.7 + 0.3 * Math.sin(Math.PI * u); break;
    }
    const scallop = 1 + 0.05 * Math.cos(u * rays * TAU);
    lens.push(spec.len * prof * scallop * (1 + 0.04 * Math.sin(i * 2.1 + 0.5)));
  }
  build.grid(rays, NV, (u, v) => {
    const fi = u * (rays - 1);
    const i0 = Math.min(rays - 2, Math.floor(fi));
    const k = fi - i0;
    const d = [
      lerp(dirs[i0][0], dirs[i0 + 1][0], k),
      lerp(dirs[i0][1], dirs[i0 + 1][1], k),
      lerp(dirs[i0][2], dirs[i0 + 1][2], k),
    ];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    const L = lerp(lens[i0], lens[i0 + 1], k);
    const bow = side * 0.14 * L * Math.pow(v, 1.5) * Math.sin(u * Math.PI * 0.9 + 0.3);
    const rib = Math.cos(u * rays * TAU) * 0.0018 * Math.pow(v, 1.1) * side;
    return [
      attach[0] + (d[0] / dl) * L * v + bow + rib,
      attach[1] + (d[1] / dl) * L * v,
      attach[2] + (d[2] / dl) * L * v,
    ];
  }, 1);
}

function addPelvic(build, form, spec, detail, side) {
  if (!spec) return;
  const t = spec.t;
  const bw = halfWidth(form, t);
  const attach = [side * bw * 0.34, bottomY(form, t) + 0.006, 0.5 - t];
  const rays = spec.style === 'spine' ? 4 : 5;
  const NV = detail >= 2 ? 4 : 3;
  const dirs = [];
  const lens = [];
  for (let i = 0; i < rays; i++) {
    const u = i / (rays - 1);
    const a = 0.55 + spec.spread * (u - 0.5);
    const dx = side * 0.24;
    const dy = -Math.sin(a);
    const dz = -Math.cos(a) * 0.9;
    const inv = 1 / Math.hypot(dx, dy, dz);
    dirs.push([dx * inv, dy * inv, dz * inv]);
    lens.push(spec.len * (spec.style === 'spine' ? 1.0 : 0.7 + 0.3 * Math.sin(Math.PI * u)));
  }
  build.grid(rays, NV, (u, v) => {
    const fi = u * (rays - 1);
    const i0 = Math.min(rays - 2, Math.floor(fi));
    const k = fi - i0;
    const d = [
      lerp(dirs[i0][0], dirs[i0 + 1][0], k),
      lerp(dirs[i0][1], dirs[i0 + 1][1], k),
      lerp(dirs[i0][2], dirs[i0 + 1][2], k),
    ];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    const L = lerp(lens[i0], lens[i0 + 1], k);
    return [
      attach[0] + (d[0] / dl) * L * v,
      attach[1] + (d[1] / dl) * L * v,
      attach[2] + (d[2] / dl) * L * v,
    ];
  }, 1);
}

// lionfish dorsal spines: tapered, curved, banded (the shader bands by fuv.y)
function addSpines(build, form, spec, detail) {
  if (!spec) return;
  const count = detail >= 2 ? spec.count + 3 : spec.count;
  const t0 = spec.t[0], t1 = spec.t[1];
  const SEG = detail >= 2 ? 8 : 6;
  const w = spec.width ?? 0.0085;
  for (let s = 0; s < count; s++) {
    const u = count === 1 ? 0.5 : s / (count - 1);
    const t = lerp(t0, t1, u);
    const y0 = topY(form, t) - 0.002;
    const z0 = 0.5 - t;
    const len = spec.len * (0.5 + 0.72 * Math.sin(Math.PI * (0.12 + u * 0.78)));
    const lean = spec.lean * len;
    const curve = 0.16 * len;
    // two crossed ribbons give the spine volume from any angle
    for (let plane = 0; plane < 2; plane++) {
      build.grid(2, SEG, (a, b) => {
        const sideSign = a < 0.5 ? -1 : 1;
        const taper = 1 - 0.9 * b;
        const cx = plane === 0 ? sideSign * w * taper : Math.sin(b * Math.PI * 0.55) * curve * 0.28;
        const cz = plane === 1 ? sideSign * w * taper : 0;
        return [
          cx * (plane === 0 ? 1 : 1),
          y0 + len * (b - 0.06 * b * b),
          z0 - lean * b + cz + (plane === 0 ? 0 : curve * Math.sin(b * Math.PI) * 0.12),
        ];
      }, 1, (a, b) => [a, b * (1 - 0.15 * Math.abs(a - 0.5))]);
    }
  }
}

function addFinlets(build, form, spec, detail) {
  if (!spec) return;
  const count = detail >= 2 ? spec.count + 2 : spec.count;
  const [t0, t1] = spec.t;
  for (let row = 0; row < spec.rows; row++) {
    const top = row === 0;
    for (let s = 0; s < count; s++) {
      const u = count === 1 ? 0.5 : s / (count - 1);
      const t = lerp(t0, t1, u);
      const y0 = top ? topY(form, t) : bottomY(form, t);
      const z0 = 0.5 - t;
      const h = spec.height * (0.72 + 0.5 * Math.sin(Math.PI * u));
      const side = top ? 1 : -1;
      // little backward-swept triangular flap with a slight keel
      build.grid(3, 2, (a, b) => {
        if (b < 0.5) {
          const dz = (a - 0.5) * 0.034;
          return [0, y0 + side * 0.002, z0 + dz];
        }
        const dz = -0.018;
        return [
          Math.sin(a * Math.PI) * 0.004,
          y0 + side * h * (0.4 + 0.6 * Math.sin(a * Math.PI) ** 0.5),
          z0 + dz,
        ];
      }, 1);
    }
  }
}

function halfWidthAtHeight(form, t, yLocal) {
  const g = girthAt(form.body, t);
  const hh = form.body.depth * 0.5 * g;
  const hw = halfWidth(form, t);
  const cy = centerY(form.body, t);
  if (hh <= 1e-6) return 0;
  const yn = Math.abs((yLocal - cy - Math.max(-hh * 0.85, Math.min(hh * 0.3, dorsalShift(form.body, t)))) / hh);
  if (yn >= 1) return hw * 0.14;
  const n = Math.max(1.5, form.body.section);
  return hw * Math.pow(1 - Math.pow(yn, n), 1 / n);
}

// Operculum: a raised gill cover with a free rear edge standing off the flank.
function addGillPlate(build, form, detail) {
  const g = form.gill;
  if (!g) return;
  const NA = detail >= 3 ? 16 : detail >= 2 ? 13 : 10;
  const width = (g.width || 0.022) * (g.plate || 1.4);
  const rear = g.t + width;
  for (const side of [1, -1]) {
    const front = [];
    const rim = [];
    const rearPts = [];
    for (let i = 0; i < NA; i++) {
      const v = i / (NA - 1);
      const a = lerp(-0.98, 0.98, v);
      const theta = side > 0 ? a : Math.PI - a;
      const p0 = sectionPoint(form, g.t, theta);
      const p1 = sectionPoint(form, rear, theta);
      const n0 = sectionNormal(form, g.t, theta);
      const n1 = sectionNormal(form, rear, theta);
      // the plate starts on the body, then lifts off toward the free rear edge
      const lift = 0.0025 + 0.0065 * Math.sin(v * Math.PI) ** 0.5;
      front.push([p0[0] + n0[0] * 0.0025, p0[1] + n0[1] * 0.0025, p0[2]]);
      rim.push([p1[0] + n1[0] * lift, p1[1] + n1[1] * lift, p1[2] - 0.006]);
      rearPts.push([p1[0] + n1[0] * 0.002, p1[1] + n1[1] * 0.002, p1[2] + 0.003]);
    }
    // outer face of the gill cover (owns the scale skin)
    build.grid(2, NA, (u, v) => {
      const i = Math.round(v * (NA - 1));
      const f = front[i];
      const r = rim[i];
      return [lerp(f[0], r[0], u), lerp(f[1], r[1], u), lerp(f[2], r[2], u)];
    }, 0, (u, v) => {
      const i = Math.round(v * (NA - 1));
      // match the body's cylindrical UVs so the scale lattice lines up
      const a = lerp(-0.98, 0.98, i / (NA - 1));
      let theta = side > 0 ? a : Math.PI - a;
      if (theta < 0) theta += TAU;
      return [theta / TAU, lerp(g.t, rear, u)];
    });
    // free trailing edge: a thin under-lip that closes the cover against the body
    build.grid(2, NA, (u, v) => {
      const i = Math.round(v * (NA - 1));
      const r = rim[i];
      const b = rearPts[i];
      return [lerp(r[0], b[0], u), lerp(r[1], b[1], u), lerp(r[2], b[2], u)];
    }, 0, (u, v) => {
      const i = Math.round(v * (NA - 1));
      return [i / (NA - 1), lerp(rear, rear, u)];
    });
  }
}

// Mouth: a compact gape tucked under the snout. The visible mouth line is drawn
// by the skin shader (uMouthV/uMouthSize); this mesh supplies the dark cavity,
// the wet lip rim and the lower-jaw shelf.
function addMouth(build, form, detail) {
  const m = form.mouth;
  if (!m) return;
  const size = Math.max(0.5, m.size ?? 1);
  const open = m.open ?? 0.35;
  const t = m.t ?? 0.045;
  const cy = centerY(form.body, t);
  const hh = halfHeight(form, t);
  const hw = halfWidth(form, t);
  const z = 0.5 - t * 0.9;
  const cyM = cy - hh * (0.48 + 0.12 * open);
  const rx = Math.max(hw * 0.36, 0.005 + 0.0046 * size);
  const ry = rx * (0.55 + 0.08 * size) * (0.7 + 0.5 * open);

  // mouth plane faces forward and down: it sits under the snout, not in front
  const n = new THREE.Vector3(0, -0.78, 0.62).normalize();
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(n, right).normalize();
  const SEG = detail >= 3 ? 22 : detail >= 2 ? 16 : 12;

  const pnt = (a, rad, push, jawBoost) => [
    Math.cos(a) * rx * rad,
    cyM + up.y * Math.sin(a) * ry * rad * (1 + (jawBoost || 0) * Math.max(0, -Math.sin(a)))
      - n.y * push,
    z + up.z * Math.sin(a) * ry * rad - n.z * push,
  ];

  // dark cavity receding into the head
  const rings = [[1.0, 0.0], [0.62, 0.008], [0.26, 0.018]];
  for (let r = 0; r < rings.length - 1; r++) {
    build.grid(SEG, 2, (u, v) => {
      const a = u * TAU;
      return pnt(a, lerp(rings[r][0], rings[r + 1][0], v), lerp(rings[r][1], rings[r + 1][1], v), 0);
    }, 6);
  }
  const capA = [];
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * TAU;
    capA.push(build.vert(pnt(a, 0.26, 0.018, 0), [0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5], 6));
  }
  const capC = build.vert(pnt(0, 0, 0.022, 0), [0.5, 0.5], 6);
  for (let i = 0; i < SEG; i++) build.triangle(capC, capA[i], capA[(i + 1) % SEG]);

  // wet lip rim: a hairline edge; the mouth line itself is drawn by the shader
  const jaw = m.jaw || 0;
  build.grid(SEG, 2, (u, v) => {
    const a = u * TAU;
    return pnt(a, lerp(1.05, 1.0, v), lerp(-0.001, 0.0, v), jaw * (1 - v) * 0.15);
  }, 8, (u, v) => [u, v]);
}

function addEyes(build, form, detail) {
  const eye = form.eye;
  const t = eye.t;
  const r = eye.size;
  const y = centerY(form.body, t) + eye.y;
  const z = 0.5 - t;
  const surfaceX = halfWidthAtHeight(form, t, y) * (eye.bulge || 1);
  const segW = detail >= 3 ? 26 : detail >= 2 ? 20 : 12;
  const segH = detail >= 3 ? 20 : detail >= 2 ? 15 : 8;
  const sphere = new THREE.SphereGeometry(1, segW, segH);
  const circle = new THREE.CircleGeometry(1, detail >= 3 ? 36 : detail >= 2 ? 28 : 16);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (const side of [1, -1]) {
    const cx = side * surfaceX;
    q.setFromEuler(new THREE.Euler(0, side * Math.PI * 0.5, 0));
    // dark socket ring hugs the body before the lens/pupil layer
    m.compose(p.set(cx + side * r * 0.02, y, z), q, sc.set(r * 1.14, r * 1.14, 1));
    build.addGeometry(circle, m, 5);
    // eyeball: a lens sitting half out of the head
    m.compose(
      p.set(cx - side * r * 0.08, y, z),
      q.setFromEuler(new THREE.Euler(0, 0, 0)),
      sc.set(r * 0.7, r * 0.92, r * 0.92),
    );
    build.addGeometry(sphere, m, 2);
    // iris
    q.setFromEuler(new THREE.Euler(0, side * Math.PI * 0.5, 0));
    m.compose(p.set(cx + side * r * 0.7, y, z), q, sc.set(r * 0.84, r * 0.84, 1));
    build.addGeometry(circle, m, 3);
    // pupil
    m.compose(p.set(cx + side * r * 0.75, y, z), q, sc.set(r * 0.5, r * 0.5, 1));
    build.addGeometry(circle, m, 4);
  }
  sphere.dispose();
  circle.dispose();
}

// ── public build ─────────────────────────────────────────────────────────────
export function buildFishGeometry(form, { detail = 1 } = {}) {
  const build = new Builder();
  const body = form.body;
  body._gillT = form.gill ? form.gill.t : null;
  const RINGS = detail >= 3 ? 96 : detail >= 2 ? 76 : 40;
  const SIDES = detail >= 3 ? 44 : detail >= 2 ? 34 : 20;

  // ---- body loft ----
  const ringIds = [];
  const ringT = [];
  for (let i = 0; i < RINGS; i++) {
    const u = i / (RINGS - 1);
    const t = 0.5 - 0.5 * Math.cos(Math.PI * u);
    ringT.push(t);
    const ring = [];
    for (let j = 0; j < SIDES; j++) {
      const theta = (j / SIDES) * Math.PI * 2;
      const p = sectionPoint(form, t, theta);
      ring.push(build.vert(p, [j / SIDES, t], 0));
    }
    ringIds.push(ring);
  }
  for (let i = 0; i < RINGS - 1; i++) {
    for (let j = 0; j < SIDES; j++) {
      const j2 = (j + 1) % SIDES;
      const a = ringIds[i][j];
      const b = ringIds[i][j2];
      const c = ringIds[i + 1][j];
      const d = ringIds[i + 1][j2];
      build.triangle(a, c, b);
      build.triangle(b, c, d);
    }
  }
  // nose + tail caps (the nose tip must sit proud of ring 0 or the snout hangs
  // open and the interior shows through)
  const noseZ = 0.5 + 0.009 + (body.noseGirth || 0) * 0.02;
  const noseTip = [0, centerY(body, 0) + dorsalShift(body, 0) * 0.35, noseZ];
  const noseC = build.vert(noseTip, [0.5, 0.0], 0);
  for (let j = 0; j < SIDES; j++) {
    const j2 = (j + 1) % SIDES;
    build.triangle(noseC, ringIds[0][j], ringIds[0][j2]);
  }
  const tailRing = ringIds[RINGS - 1];
  const tailC = build.vert(
    [0, centerY(body, 1), -0.502],
    [0.5, 1.0], 0,
  );
  for (let j = 0; j < SIDES; j++) {
    const j2 = (j + 1) % SIDES;
    build.triangle(tailC, tailRing[j2], tailRing[j]);
  }

  // ---- gill cover: authored by the girth ridge + skin shader gill line ----

  // ---- fins ----
  const fins = form.fins || {};
  addDorsal(build, form, fins.dorsal, detail, true);
  addDorsal(build, form, fins.dorsal2, detail, true);
  addDorsal(build, form, fins.anal, detail, false);
  addCaudal(build, form, fins.caudal, detail);
  addPectoral(build, form, fins.pectoral, detail, 1);
  addPectoral(build, form, fins.pectoral, detail, -1);
  addPelvic(build, form, fins.pelvic, detail, 1);
  addPelvic(build, form, fins.pelvic, detail, -1);
  addSpines(build, form, fins.spines, detail);
  addFinlets(build, form, fins.finlets, detail);

  // ---- mouth and eyes ----
  // The mouth itself is shaded by the skin shader (jaw line + dark gape) so it
  // never turns into a lip disc on the snout; only the eyes need geometry.
  addEyes(build, form, detail);

  const geo = build.finish();
  geo.name = 'fish';
  return geo;
}

// Instanced attributes: tail-beat phase, amplitude jitter, colour jitter.
export function attachInstanceAttributes(geometry, count, rand) {
  const phase = new Float32Array(count);
  const amp = new Float32Array(count);
  const tint = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    phase[i] = rand() * Math.PI * 2;
    amp[i] = (rand() - 0.5) * 0.3;
    tint[i] = (rand() - 0.5) * 0.14;
  }
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geometry.setAttribute('aAmp', new THREE.InstancedBufferAttribute(amp, 1));
  geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  return geometry;
}
