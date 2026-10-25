// 路亚俱乐部 · 钓鱼用鱼模型
//
// Resolves the fish-v2 preview API (`ctx.fish.createFishPreview`) into a small
// wrapper that can be dropped into any THREE scene (the fishing set, the bag
// turntable) and animated by the caller. While the shared API is missing or
// refuses a species, a procedural fallback fish keeps the fight readable —
// the flow must never depend on the ecology module being ready.
//
// Convention: the wrapper root faces +Z (nose at +Z) for every source, so the
// caller can orient with `root.rotation.y = atan2(dir.x, dir.z)`.

import * as THREE from 'three';
import { clamp } from '../core/util.js';

// ---------------------------------------------------------------------------
// Fallback fish — moved out of scene.js so the fight/net/bag can all use it.
// Nose at +X in its own space; the wrapper rotates it to +Z.
// ---------------------------------------------------------------------------

function smooth01(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function buildFallbackFish(species) {
  const colors = species?.colors || {};
  const back = new THREE.Color(colors.back ?? 0x2c4147);
  const side = new THREE.Color(colors.side ?? 0x8fa3a1);
  const belly = new THREE.Color(colors.belly ?? 0xe4ddc9);
  const fin = new THREE.Color(colors.fin ?? 0x5a6a66);
  const accent = new THREE.Color(colors.accent ?? 0xd9a86c);

  const L = 0.62;                  // body length in local units (1 unit ≈ 1 m)
  const STATIONS = 24;
  const RADIAL = 16;
  const H = 0.105;                 // max half-height
  const W = 0.058;                 // max half-width
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();

  for (let i = 0; i < STATIONS; i++) {
    const t = i / (STATIONS - 1);
    const x = (0.5 - t) * L;
    const taper = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.68)), 0.62);
    const hh = H * (0.08 + 0.92 * taper) * (1 - 0.35 * t * t);
    const ww = W * (0.08 + 0.92 * taper) * (1 - 0.15 * t);
    for (let j = 0; j < RADIAL; j++) {
      const a = (j / RADIAL) * Math.PI * 2;
      const sy = Math.sin(a);
      const sz = Math.cos(a);
      const yy = sy > 0 ? sy * hh : sy * hh * 0.78;
      const zz = sz * ww;
      pos.push(x, yy, zz);
      const v = (sy + 1) * 0.5;
      if (v < 0.5) c.copy(belly).lerp(side, smooth01(0.05, 0.5, v));
      else c.copy(side).lerp(back, smooth01(0.5, 0.95, v));
      if (Math.abs(v - 0.62) < 0.055) c.lerp(accent, 0.18);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < STATIONS - 1; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const j2 = (j + 1) % RADIAL;
      const a = i * RADIAL + j;
      const b = i * RADIAL + j2;
      const d = (i + 1) * RADIAL + j;
      const e = (i + 1) * RADIAL + j2;
      idx.push(a, b, d, b, e, d);
    }
  }
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  bodyGeo.setIndex(idx);
  bodyGeo.computeVertexNormals();
  const bodyMat = new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 0.3, roughness: 0.33,
    envMapIntensity: 1.15, side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  const g = new THREE.Group();
  g.add(body);
  const noseMat = new THREE.MeshStandardMaterial({ color: side, metalness: 0.2, roughness: 0.4 });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.045, 10), noseMat);
  nose.rotation.z = -Math.PI * 0.5;
  nose.position.x = L * 0.5 + 0.004;
  g.add(nose);

  const finMat = new THREE.MeshStandardMaterial({
    color: fin, roughness: 0.55, metalness: 0.15,
    side: THREE.DoubleSide, transparent: true, opacity: 0.92,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accent, roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide,
  });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x060808, roughness: 0.15, metalness: 0.5 });
  const ringMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.3, metalness: 0.8 });

  // tail fin — forked, thin
  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, -0.19, 0.16, 0.002, -0.15, 0.015, 0,
    0, 0, 0, -0.15, -0.015, 0, -0.19, -0.16, 0.002,
  ], 3));
  tailGeo.computeVertexNormals();
  const tail = new THREE.Mesh(tailGeo, finMat);
  tail.position.set(-L * 0.49, 0, 0);
  g.add(tail);

  const dorsalGeo = new THREE.BufferGeometry();
  dorsalGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0.1, 0.085, 0, -0.08, 0.09, 0, -0.1, 0.205, 0,
    -0.02, 0.095, 0, -0.13, 0.07, 0, -0.16, 0.16, 0,
  ], 3));
  dorsalGeo.computeVertexNormals();
  g.add(new THREE.Mesh(dorsalGeo, finMat));
  const analGeo = new THREE.BufferGeometry();
  analGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0.02, -0.08, 0, -0.11, -0.065, 0, -0.12, -0.15, 0,
  ], 3));
  analGeo.computeVertexNormals();
  g.add(new THREE.Mesh(analGeo, finMat));

  for (const sz of [-1, 1]) {
    const pectGeo = new THREE.BufferGeometry();
    pectGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0.06, -0.005, sz * 0.05, 0.0, -0.04, sz * 0.16, 0.08, -0.03, sz * 0.12,
    ], 3));
    pectGeo.computeVertexNormals();
    g.add(new THREE.Mesh(pectGeo, finMat));
  }

  for (const sz of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), ringMat);
    ring.position.set(0.2, 0.03, sz * 0.046);
    ring.scale.set(0.7, 1, 1);
    g.add(ring);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), eyeMat);
    eye.position.set(0.207, 0.032, sz * 0.052);
    g.add(eye);
    const gill = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.004, 5, 14, Math.PI * 1.15), accentMat);
    gill.position.set(0.12, 0.0, sz * 0.058);
    gill.rotation.set(Math.PI * 0.5, 0, sz * 0.28);
    gill.scale.set(1, 0.75, 1);
    g.add(gill);
  }

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0.18, 0.03, 0.05, 0.0, 0.015, 0.062, -0.2, 0.0, 0.028,
  ], 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.35 }));
  g.add(line);

  g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; });
  return g;
}

// ---------------------------------------------------------------------------
// Preview factory
// ---------------------------------------------------------------------------

const ALIASES = {
  yellowfin: ['yellowfin-tuna', 'yellowfin'],
  'yellowfin-tuna': ['yellowfin'],
  mahi: ['mahi-mahi', 'mahi', 'dolphinfish'],
  'mahi-mahi': ['mahi'],
  snapper: ['red-snapper', 'snapper'],
  'red-snapper': ['snapper'],
  grouper: ['giant-grouper', 'grouper'],
  'giant-grouper': ['grouper'],
  hairtail: ['hairtail', 'largehead-hairtail'],
  scad: ['scad', 'round-scad'],
  cobia: ['cobia'],
  lionfish: ['lionfish'],
  parrotfish: ['parrotfish'],
};

function candidateIds(species) {
  const ids = [];
  const push = (id) => {
    if (id == null) return;
    const s = String(id);
    if (s && !ids.includes(s)) ids.push(s);
  };
  push(species?.sourceId);
  push(species?.id);
  const aliasKeys = [species?.sourceId, species?.id, species?.nameEn, species?.nameCn];
  for (const key of aliasKeys) {
    if (!key) continue;
    const lower = String(key).toLowerCase();
    for (const [k, v] of Object.entries(ALIASES)) {
      if (lower.includes(k)) v.forEach(push);
    }
  }
  return ids;
}

export function createPreviewFactory(ctx = {}) {
  let sharedOk = typeof ctx?.fish?.createFishPreview === 'function';
  let lastWarn = '';
  const detailCap = Number(ctx?.engine?.qualityPreset?.fish?.previewDetail) || 3;

  function create(species, opts = {}) {
    const lengthCm = Number(opts.lengthCm) > 0 ? Number(opts.lengthCm) : null;
    const weightKg = Number(opts.weightKg) > 0 ? Number(opts.weightKg) : null;
    const detail = Math.max(1, Math.min(detailCap, Number(opts.detail ?? 2)));
    const root = new THREE.Group();
    root.name = `fishActor-${species?.id || 'fish'}`;

    let preview = null;
    if (sharedOk) {
      for (const id of candidateIds(species)) {
        try {
          preview = ctx.fish.createFishPreview(id, {
            lengthCm: lengthCm || undefined,
            detail,
            animate: opts.animate !== false,
          });
        } catch (err) {
          const msg = String(err?.message || err);
          if (msg !== lastWarn) { lastWarn = msg; console.warn('[fishing] createFishPreview failed', msg); }
          preview = null;
        }
        if (preview?.group) break;
      }
    }
    if (preview?.group) {
      if (species) {
        preview.species = preview.species || species;
        try { if (lengthCm) preview.setLengthCm?.(lengthCm); } catch (e) { /* noop */ }
      }
      preview.group.position.set(0, 0, 0);
      preview.group.rotation.set(0, 0, 0);
      root.add(preview.group);
      let previewLen = preview.lengthCm || lengthCm || 60;
      let previewWeight = weightKg || preview.weightKg || 1;
      const actor = {
        root,
        preview,
        inner: preview.group,
        source: 'fish',
        species,
        get lengthCm() { return previewLen; },
        get weightKg() { return previewWeight; },
        setLengthCm(cm) {
          const n = Number(cm);
          if (!(n > 0)) return previewLen;
          try {
            previewLen = preview.setLengthCm?.(n) || n;
            previewWeight = preview.weightKg || previewWeight;
          } catch (e) { /* noop */ }
          return previewLen;
        },
        update(dt) { try { preview.update(dt); } catch (e) { /* noop */ } },
        dispose() {
          try { preview.dispose(); } catch (e) { /* noop */ }
          root.clear();
        },
      };
      return actor;
    }

    // ---- fallback ---------------------------------------------------------
    const fish = buildFallbackFish(species);
    const len = lengthCm || ((species?.sizeCm?.[0] ?? 40) + (species?.sizeCm?.[1] ?? 70)) * 0.5;
    // base mesh is ~0.62 long; in this space 1 unit ≈ 1 m
    const idText = `${species?.id || ''} ${species?.nameCn || ''}`;
    let fallbackLen = len;
    const applyFallbackScale = (cm) => {
      const scale = clamp(cm / 62, 0.35, 3.2);
      if (/hairtail|带鱼/i.test(idText)) fish.scale.set(scale * 1.25, scale * 0.55, scale * 0.72);
      else if (/grouper|石斑/i.test(idText)) fish.scale.set(scale * 0.92, scale * 1.12, scale * 1.12);
      else fish.scale.setScalar(scale);
      fallbackLen = cm;
    };
    applyFallbackScale(len);
    // fallback nose is +X; rotate to the shared +Z convention
    fish.rotation.y = -Math.PI * 0.5;
    root.add(fish);
    let wiggle = 0;
    const actor = {
      root,
      preview: null,
      inner: fish,
      source: 'fallback',
      species,
      get lengthCm() { return fallbackLen; },
      weightKg: weightKg || 1,
      setLengthCm(cm) {
        const n = Number(cm);
        if (!(n > 0)) return fallbackLen;
        applyFallbackScale(clamp(n, 8, 320));
        return fallbackLen;
      },
      update(dt) {
        wiggle += dt;
        fish.rotation.x = Math.sin(wiggle * 7.2) * 0.05;
        fish.position.y = Math.sin(wiggle * 3.1) * 0.004;
      },
      dispose() {
        fish.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        });
        root.clear();
      },
    };
    return actor;
  }

  return {
    create,
    get shared() { return sharedOk; },
    refresh() { sharedOk = typeof ctx?.fish?.createFishPreview === 'function'; return sharedOk; },
  };
}
