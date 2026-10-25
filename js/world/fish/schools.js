// Instanced schools authored against the real dive route. Every pod is anchored
// relative to the camera key pose at its progress, so the school is inside the
// actual shot when the visitor reaches that beat. Owner: fish.
import * as THREE from 'three';
import { CAMERA_KEYS, WORLD } from '../../core/world.js';
import { clamp, damp, easeInOutCubic, mulberry32, smoothstep } from '../../core/util.js';
import { buildFishGeometry, attachInstanceAttributes } from './geometry.js';
import { createFishMaterial, updateFishMaterial } from './material.js';

const UP = new THREE.Vector3(0, 1, 0);
const posCurve = new THREE.CatmullRomCurve3(
  CAMERA_KEYS.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal', 0.5,
);
const lookCurve = new THREE.CatmullRomCurve3(
  CAMERA_KEYS.map((k) => new THREE.Vector3(...k.look)), false, 'centripetal', 0.5,
);
const _posePos = new THREE.Vector3();
const _poseLook = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();

/** Camera pose exactly as js/world/camera.js samples it (minus handheld noise). */
function pathPose(p) {
  let i = 0;
  while (i < CAMERA_KEYS.length - 2 && p > CAMERA_KEYS[i + 1].p) i++;
  const a = CAMERA_KEYS[i], b = CAMERA_KEYS[i + 1];
  const k = clamp((p - a.p) / Math.max(1e-6, b.p - a.p));
  const e = easeInOutCubic(k) * 0.35 + k * 0.65;
  const u = (i + e) / (CAMERA_KEYS.length - 1);
  posCurve.getPoint(u, _posePos);
  lookCurve.getPoint(u, _poseLook);
  return { pos: _posePos, look: _poseLook };
}

// ── pod authoring ────────────────────────────────────────────────────────────
// p      dive progress of the camera key the pod is staged for
// fwd    metres along the camera's view direction
// side   metres to camera right (+ = right)
// up     metres along world Y
// count  fish in the pod
// radius pod orbit radius (m)
const PODS = [
  // surface 0–5 m — mahi and tuna crossing the sunlit ceiling
  { species: 'mahi-mahi', p: 0.19, fwd: 9.5, side: -4.5, up: 0.2, count: 5, radius: 2.4, size: 0.88, speed: 0.17, zone: 'surface' },
  { species: 'mahi-mahi', p: 0.196, fwd: 5.4, side: 2.6, up: 0.55, count: 3, radius: 1.1, size: 0.95, speed: 0.2, zone: 'surface', hero: true },
  { species: 'yellowfin-tuna', p: 0.212, fwd: 7.2, side: -2.6, up: 1.3, count: 3, radius: 1.5, size: 1.06, speed: 0.16, zone: 'surface', hero: true },
  { species: 'mahi-mahi', p: 0.23, fwd: 15, side: 6.0, up: 0.1, count: 4, radius: 2.6, size: 0.8, speed: 0.15, zone: 'surface' },
  { species: 'yellowfin-tuna', p: 0.235, fwd: 17, side: -2.5, up: -0.4, count: 5, radius: 4.4, size: 1.05, speed: 0.12, zone: 'surface' },

  // sunlit 6–26 m — tuna school + scad bait ball
  { species: 'yellowfin-tuna', p: 0.285, fwd: 16, side: 4.5, up: 0.6, count: 5, radius: 5.0, size: 1.0, speed: 0.11, zone: 'sunlit' },
  { species: 'yellowfin-tuna', p: 0.3, fwd: 8.5, side: 3.8, up: 0.7, count: 2, radius: 1.7, size: 1.02, speed: 0.18, zone: 'sunlit', hero: true },
  { species: 'scad', p: 0.305, fwd: 14, side: 7.0, up: -0.5, count: 26, radius: 2.4, size: 0.24, speed: 0.34, zone: 'sunlit', ball: true },
  { species: 'yellowfin-tuna', p: 0.345, fwd: 21, side: -9.5, up: 2.4, count: 5, radius: 5.5, size: 1.08, speed: 0.1, zone: 'sunlit' },
  { species: 'scad', p: 0.365, fwd: 15, side: -4.0, up: 3.0, count: 24, radius: 2.6, size: 0.23, speed: 0.3, zone: 'sunlit', ball: true },
  { species: 'cobia', p: 0.4, fwd: 17, side: 5.5, up: 1.5, count: 3, radius: 2.4, size: 0.95, speed: 0.11, zone: 'sunlit' },

  // twilight 26–62 m — snapper, grouper, parrotfish, cobia
  { species: 'parrotfish', p: 0.43, fwd: 14, side: -7.0, up: 1.2, count: 8, radius: 2.8, size: 0.46, speed: 0.16, zone: 'twilight' },
  { species: 'red-snapper', p: 0.465, fwd: 16, side: 6.0, up: 0.4, count: 8, radius: 3.2, size: 0.52, speed: 0.14, zone: 'twilight' },
  { species: 'giant-grouper', p: 0.5, fwd: 17, side: -8.0, up: -3.0, count: 1, radius: 1.4, size: 1.15, speed: 0.07, zone: 'twilight' },
  { species: 'scad', p: 0.48, fwd: 11.5, side: -4.5, up: 2.2, count: 26, radius: 2.8, size: 0.23, speed: 0.32, zone: 'twilight', ball: true },
  { species: 'scad', p: 0.5, fwd: 16, side: 6.5, up: 5.0, count: 30, radius: 3.2, size: 0.24, speed: 0.3, zone: 'twilight', ball: true },
  { species: 'red-snapper', p: 0.5, fwd: 8.2, side: 2.8, up: 0.4, count: 3, radius: 1.4, size: 0.56, speed: 0.18, zone: 'twilight', hero: true },
  { species: 'red-snapper', p: 0.505, fwd: 11, side: -4.0, up: 1.6, count: 10, radius: 2.2, size: 0.58, speed: 0.15, zone: 'twilight' },
  { species: 'giant-grouper', p: 0.51, fwd: 9.0, side: 3.6, up: -0.6, count: 1, radius: 0.8, size: 1.2, speed: 0.08, zone: 'twilight', hero: true },
  { species: 'red-snapper', p: 0.515, fwd: 13, side: -6.0, up: 3.0, count: 8, radius: 3.0, size: 0.54, speed: 0.14, zone: 'twilight' },
  { species: 'parrotfish', p: 0.49, fwd: 8.5, side: -1.5, up: 2.0, count: 4, radius: 1.5, size: 0.48, speed: 0.19, zone: 'twilight' },
  { species: 'giant-grouper', p: 0.535, fwd: 10.5, side: 4.2, up: -1.0, count: 1, radius: 1.0, size: 1.2, speed: 0.07, zone: 'twilight', hero: true },
  { species: 'red-snapper', p: 0.545, fwd: 21, side: -5.0, up: 2.6, count: 8, radius: 3.4, size: 0.55, speed: 0.13, zone: 'twilight' },
  { species: 'parrotfish', p: 0.58, fwd: 13, side: 8.0, up: -1.5, count: 6, radius: 2.6, size: 0.44, speed: 0.17, zone: 'twilight' },
  { species: 'giant-grouper', p: 0.625, fwd: 15, side: -6.5, up: -2.5, count: 1, radius: 1.4, size: 1.25, speed: 0.06, zone: 'twilight' },
  { species: 'red-snapper', p: 0.665, fwd: 19, side: 5.5, up: 3.2, count: 6, radius: 3.0, size: 0.5, speed: 0.12, zone: 'twilight' },
  { species: 'cobia', p: 0.63, fwd: 18, side: 4.0, up: -1.0, count: 1, radius: 1.8, size: 1.05, speed: 0.1, zone: 'twilight' },

  // deep 62–96 m — hairtail, lionfish, grouper
  { species: 'hairtail', p: 0.69, fwd: 15, side: 5.0, up: -2.0, count: 6, radius: 2.4, size: 1.0, speed: 0.09, zone: 'deep', upright: true },
  { species: 'lionfish', p: 0.72, fwd: 13, side: -6.0, up: -2.5, count: 3, radius: 1.3, size: 0.3, speed: 0.07, zone: 'deep' },
  { species: 'lionfish', p: 0.735, fwd: 6.0, side: 3.4, up: 0.8, count: 1, radius: 0.7, size: 0.34, speed: 0.1, zone: 'deep', hero: true },
  { species: 'hairtail', p: 0.765, fwd: 17, side: -8.0, up: 2.4, count: 6, radius: 2.6, size: 0.95, speed: 0.08, zone: 'deep', upright: true },
  { species: 'lionfish', p: 0.8, fwd: 14, side: 7.0, up: -3.0, count: 2, radius: 1.2, size: 0.32, speed: 0.06, zone: 'deep' },
  { species: 'giant-grouper', p: 0.845, fwd: 14, side: -5.0, up: -3.5, count: 2, radius: 1.8, size: 1.2, speed: 0.06, zone: 'deep' },
  { species: 'hairtail', p: 0.885, fwd: 13, side: 6.5, up: 2.0, count: 5, radius: 2.2, size: 0.92, speed: 0.09, zone: 'deep', upright: true },

  // floor 86–96 m — the big residents and a last drift of bait
  { species: 'giant-grouper', p: 0.9, fwd: 10.5, side: -3.8, up: 0.2, count: 1, radius: 0.9, size: 1.2, speed: 0.06, zone: 'floor', hero: true },
  { species: 'giant-grouper', p: 0.915, fwd: 12, side: -4.5, up: -1.5, count: 2, radius: 2.0, size: 1.25, speed: 0.05, zone: 'floor' },
  { species: 'lionfish', p: 0.93, fwd: 9, side: -3.2, up: 0.6, count: 2, radius: 1.1, size: 0.31, speed: 0.06, zone: 'floor' },
  { species: 'hairtail', p: 0.945, fwd: 11, side: 5.0, up: 1.6, count: 4, radius: 1.8, size: 0.9, speed: 0.08, zone: 'deep', upright: true },
  { species: 'giant-grouper', p: 0.965, fwd: 10, side: -3.0, up: 0.8, count: 1, radius: 0.7, size: 1.25, speed: 0.04, zone: 'floor', hero: true },
  { species: 'lionfish', p: 0.98, fwd: 6.2, side: 3.4, up: 0.5, count: 1, radius: 0.5, size: 0.34, speed: 0.05, zone: 'floor', hero: true },
  { species: 'giant-grouper', p: 0.995, fwd: 9.2, side: 2.6, up: 1.0, count: 1, radius: 0.4, size: 1.3, speed: 0.04, zone: 'floor' },
];

const ZONE_WINDOWS = {
  surface: [-2, 8],
  sunlit: [1, 34],
  twilight: [16, 72],
  deep: [46, 100],
  floor: [80, 100],
};

const NOMINAL_LEN = {
  'yellowfin-tuna': 1.05,
  cobia: 0.95,
  'mahi-mahi': 0.85,
  'red-snapper': 0.52,
  'giant-grouper': 1.45,
  parrotfish: 0.45,
  lionfish: 0.3,
  hairtail: 0.95,
  scad: 0.24,
};

function zoneGate(zones, depth) {
  let g = 0;
  for (let i = 0; i < zones.length; i++) {
    const w = ZONE_WINDOWS[zones[i]];
    if (!w) continue;
    const lo = smoothstep(w[0] - 3, w[0] + 3, depth);
    const hi = 1 - smoothstep(w[1] - 3, w[1] + 4, depth);
    g = Math.max(g, lo * hi);
  }
  return g;
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _zero = new THREE.Vector3(0, 0, 0);

export function createSchools(engine, app, speciesList, forms, opts = {}) {
  const rand = mulberry32(0x51ce4a);
  const clampDensity = (v) => Math.max(0.25, Math.min(1, Number(v) || 1));
  let density = clampDensity(opts.quality || 1);
  const motionScale = density < 1 ? 0.7 : 1;
  const group = new THREE.Group();
  group.name = 'fish-schools';
  engine.scene.add(group);

  // group pods by species so a species is one draw call
  const bySpecies = new Map();
  for (const pod of PODS) {
    if (!bySpecies.has(pod.species)) bySpecies.set(pod.species, []);
    bySpecies.get(pod.species).push(pod);
  }

  /** @type {Array} */
  const schools = [];
  const materialList = [];

  for (const species of speciesList) {
    const podList = bySpecies.get(species.id);
    if (!podList) continue;
    const form = forms[species.id];
    if (!form) continue;

    const counts = podList.map((p) => Math.max(p.count > 3 ? 2 : 1, Math.round(p.count * density)));
    const total = counts.reduce((n, c) => n + c, 0);
    const detail = 1;
    const geometry = buildFishGeometry(form, { detail });
    attachInstanceAttributes(geometry, total, rand);
    const material = createFishMaterial(species, form);
    materialList.push(material);

    const mesh = new THREE.InstancedMesh(geometry, material, total);
    mesh.name = `school-${species.id}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.visible = false;
    group.add(mesh);

    const pods = [];
    const instances = [];
    let cursor = 0;
    for (let podIdx = 0; podIdx < podList.length; podIdx++) {
      const podSpec = podList[podIdx];
      const activeCount = counts[podIdx];
      const pose = pathPose(podSpec.p);
      _dir.copy(pose.look).sub(pose.pos).normalize();
      _right.crossVectors(_dir, UP).normalize();
      const center = new THREE.Vector3()
        .copy(pose.pos)
        .addScaledVector(_dir, podSpec.fwd)
        .addScaledVector(_right, podSpec.side)
        .addScaledVector(UP, podSpec.up);
      // keep the school in the water column
      center.y = Math.min(center.y, -1.1);
      center.y = Math.max(center.y, WORLD.floorY + 2.4);

      const pod = {
        spec: podSpec,
        center,
        vis: 0,
        targetVis: 0,
        phase: rand() * Math.PI * 2,
        ellipse: 0.72 + rand() * 0.5,
        drift: 0.55 + rand() * 0.5,
        species,
        activeCount,
        maxCount: activeCount,
        specCount: podSpec.count,
      };
      pods.push(pod);

      for (let k = 0; k < activeCount; k++) {
        const isBig = !!podSpec.upright;
        const radius = podSpec.radius * (0.42 + 0.58 * Math.sqrt(rand()));
        const speciesMaxM = (species.sizeCm?.[1] || 200) / 100;
        const fishLen = Math.min(
          speciesMaxM,
          (NOMINAL_LEN[species.id] || 0.6) * podSpec.size * (0.8 + rand() * 0.38),
        );
        instances.push({
          pod,
          mesh,
          index: cursor++,
          localIndex: k,
          angle0: rand() * Math.PI * 2,
          radius,
          yOff: (rand() - 0.5) * podSpec.radius * (podSpec.ball ? 1.3 : 0.65),
          bob: 0.18 + rand() * 0.5,
          bobPhase: rand() * Math.PI * 2,
          seed: rand() * Math.PI * 2,
          speedMul: 0.82 + rand() * 0.36,
          size: fishLen,
          minDist: Math.min(7, Math.max(1.6, fishLen * 4.6)),
          hero: !!podSpec.hero,
          quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * Math.PI * 2, 0)),
          heading: new THREE.Vector3(Math.sin(rand() * Math.PI * 2), 0, Math.cos(rand() * Math.PI * 2)),
          prev: new THREE.Vector3(),
          upright: !!podSpec.upright,
          init: false,
          isBig,
        });
      }
    }

    schools.push({ species, form, geometry, material, mesh, pods, instances });
    for (const inst of instances) {
      const p = sampleInstance(inst, 0, 0, true);
      inst.prev.copy(p);
      inst.init = true;
      inst.quat.setFromEuler(_euler.set(0, rand() * Math.PI * 2, 0));
    }
  }

  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  let visibleFish = 0;
  let lastDepth = 0;

  function sampleInstance(inst, time, vis, force) {
    const p = inst.pod;
    const a = inst.angle0 + time * p.spec.speed * inst.speedMul + Math.sin(time * 0.23 + inst.seed) * 0.4;
    const r = inst.radius * (1 + 0.1 * Math.sin(time * 0.31 + inst.seed * 2));
    const cx = p.center.x + Math.sin(time * 0.07 + p.phase) * p.drift;
    const cz = p.center.z + Math.cos(time * 0.055 + p.phase * 1.7) * p.drift;
    const cy = p.center.y + Math.sin(time * 0.12 + p.phase) * 0.35;
    const ballK = p.spec.ball ? 0.4 : 0.1;
    _pos.set(
      cx + Math.cos(a) * r,
      cy + inst.yOff + Math.sin(a * 1.35 + inst.seed) * r * ballK + Math.sin(time * 0.5 + inst.bobPhase) * inst.bob * 0.35,
      cz + Math.sin(a) * r * p.ellipse,
    );
    // hard water-column rules: no fish above the surface, none inside the sand
    _pos.y = Math.min(_pos.y, -0.42);
    _pos.y = Math.max(_pos.y, WORLD.floorY + 1.35);
    return _pos;
  }

  function update(dt, info) {
    const time = app.time;
    const depth = info.depth || 0;
    lastDepth = depth;
    visibleFish = 0;

    const modeOk = info.mode === 'dive';
    const underwater = !!info.underwater;
    const active = modeOk && underwater;

    engine.camera.getWorldDirection(camDir);
    camPos.copy(engine.camera.position);

    const caustic = active ? clamp(1 - depth / 34) * 0.85 : 0;
    for (const mat of materialList) updateFishMaterial(mat, time, depth, caustic);

    for (const school of schools) {
      // pod gating: distance + in front + depth window
      let anyVisible = false;
      for (const pod of school.pods) {
        const zone = zoneGate(school.species.zones, depth);
        let target = 0;
        if (active) {
          const dx = pod.center.x - camPos.x;
          const dy = pod.center.y - camPos.y;
          const dz = pod.center.z - camPos.z;
          const dist = Math.hypot(dx, dy, dz);
          const front = dist > 0.001 ? (dx * camDir.x + dy * camDir.y + dz * camDir.z) / dist : 0;
          target = smoothstep(76, 24, dist) * smoothstep(-0.04, 0.22, front) * zone;
        }
        pod.targetVis = target;
        pod.vis = damp(pod.vis, target, 5.5, dt);
        if (pod.vis > 0.01) anyVisible = true;
      }
      if (!anyVisible) {
        school.mesh.visible = false;
        continue;
      }
      school.mesh.visible = true;
      for (const inst of school.instances) {
        if (!inst.init) {
          sampleInstance(inst, time, inst.pod.vis);
          inst.prev.copy(_pos);
          inst.init = true;
        }
        const p = sampleInstance(inst, time, inst.pod.vis);
        const vis = inst.pod.vis;
        const active = inst.localIndex < inst.pod.activeCount;
        // never let a fish pass through the lens or fill the frame
        const ddx = p.x - camPos.x, ddy = p.y - camPos.y, ddz = p.z - camPos.z;
        const camDist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        const crowd = smoothstep(inst.minDist * 0.8, inst.minDist * 1.2, camDist);
        const scale = active ? inst.size * (vis > 0.015 ? Math.pow(vis, 0.4) : 0) * crowd : 0;
        // heading from actual travel, but bobbing must not pitch the fish vertical
        _vel.copy(p).sub(inst.prev);
        _vel.y *= 0.12;
        const speed = _vel.length();
        if (active && speed > 1e-5 && vis > 0.03) {
          _vel.multiplyScalar(1 / speed);
          inst.heading.lerp(_vel, 1 - Math.exp(-2.4 * dt * motionScale));
          if (inst.heading.lengthSq() < 1e-6) inst.heading.set(0, 0, 1);
          inst.heading.normalize();
          const hy = Math.max(-0.24, Math.min(0.24, inst.heading.y));
          const yaw = Math.atan2(inst.heading.x, inst.heading.z);
          const pitch = -Math.asin(hy);
          const pitchAdj = inst.upright ? -1.15 + Math.sin(time * 0.5 + inst.seed) * 0.14 : pitch;
          const roll = inst.upright
            ? Math.sin(time * 0.4 + inst.seed) * 0.1
            : -0.14 * Math.sign(inst.pod.spec.speed || 1) + Math.sin(time * 0.3 + inst.seed) * 0.05;
          _euler.set(pitchAdj, yaw, roll, 'YXZ');
          _q.setFromEuler(_euler);
          const k = 1 - Math.exp(-4.2 * dt * motionScale);
          inst.quat.slerp(_q, k);
        }
        inst.prev.copy(p);
        _scale.setScalar(scale);
        _m4.compose(p, inst.quat, _scale);
        meshSetMatrix(school.mesh, inst.index, _m4);
        if (vis > 0.08 && active) visibleFish++;
      }
      school.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function meshSetMatrix(mesh, index, m) {
    mesh.setMatrixAt(index, m);
  }

  function setVisible(v) {
    group.visible = v;
  }

  function dispose() {
    for (const s of schools) {
      s.geometry.dispose();
      s.material.dispose();
    }
    engine.scene.remove(group);
  }

  return {
    group,
    schools,
    materialList,
    update,
    setVisible,
    /** Adaptive hook: show a subset of each pod without rebuilding geometry. */
    setDensity(scale) {
      density = clampDensity(scale);
      let shown = 0;
      let total = 0;
      for (const s of schools) {
        for (const pod of s.pods) {
          pod.activeCount = Math.max(1, Math.min(pod.maxCount, Math.round(pod.specCount * density)));
          shown += pod.activeCount;
          total += pod.maxCount;
        }
      }
      return { density, shown, total };
    },
    get density() { return density; },
    dispose,
    get visibleFish() { return visibleFish; },
    get podCount() { return PODS.length; },
    getActivePods(out = []) {
      out.length = 0;
      for (const s of schools) {
        for (const pod of s.pods) {
          if (pod.vis > 0.25) out.push({ pod, species: s.species, center: pod.center, vis: pod.vis });
        }
      }
      return out;
    },
    getFishSample(out = []) {
      out.length = 0;
      for (const s of schools) {
        if (!s.mesh.visible) continue;
        for (let i = 0; i < s.instances.length; i += 7) {
          const inst = s.instances[i];
          if (inst.pod.vis < 0.2) continue;
          out.push({ pos: inst.prev, species: s.species, vis: inst.pod.vis });
        }
      }
      return out;
    },
    get depth() { return lastDepth; },
  };
}
