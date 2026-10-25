// Ambient surface pods — the sea is never empty while you stand at the pontoon.
// Two loose pods (mahi + scad) cross the surface 8–30 m from the camera, backs
// and dorsal fins breaking the water, leaving wake rings. Deliberately pointer-
// free: this runs in shop / fishing mode where the diver's pointer encounter
// does not exist. Owner: fish-v2.
import * as THREE from 'three';
import { mulberry32, damp } from '../../core/util.js';
import { buildFishGeometry, attachInstanceAttributes } from './geometry.js';
import { createFishMaterial, updateFishMaterial } from './material.js';

const POD_SPECS = [
  // big mahi — close enough that the sail and the back break the surface
  {
    speciesId: 'mahi-mahi', count: 3, length: 1.32, speed: 2.15,
    dist: [8, 15], side: [3.5, 8.5], pathLen: 26, baseY: 0.3,
  },
  // scad bait ball — smaller, faster, a bit nearer the pontoon
  {
    speciesId: 'scad', count: 9, length: 0.4, speed: 2.9,
    dist: [6.5, 11.5], side: [3, 7], pathLen: 20, baseY: 0.075,
  },
];

const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _zero = new THREE.Vector3(0, 0, 0);

export function createAmbientPods(engine, app, ctx, options = {}) {
  const rand = mulberry32(0x1a5f3d27);
  const clampDensity = (v) => Math.max(0.25, Math.min(1, Number(v) || 1));
  let density = clampDensity(options.countScale ?? 1);
  const schoolList = options.schools || [];
  const fishInfo = options.forms || null;
  const speciesList = options.species || [];
  const getSpeciesById = options.getSpeciesById || (() => null);
  const getFormById = options.getFormById || (() => null);

  const group = new THREE.Group();
  group.name = 'fish-ambient-pods';
  group.visible = false;
  engine.scene.add(group);

  const podMaterials = [];
  const pods = [];
  const owned = [];
  let mode = 'off';
  let enabled = true;
  let visible = false;
  let lastCameraOn = false;

  for (const spec of POD_SPECS) {
    const school = schoolList.find((s) => s.species && s.species.id === spec.speciesId);
    const species = school ? school.species : (getSpeciesById(spec.speciesId) || null);
    const count = Math.max(2, Math.round(spec.count * density));
    let geometry = school ? school.geometry : null;
    let material = school ? school.material : null;
    if (!geometry || !material) {
      const form = school ? school.form : getFormById(spec.speciesId);
      if (!species || !form) continue;
      geometry = buildFishGeometry(form, { detail: 1 });
      attachInstanceAttributes(geometry, count, rand);
      material = createFishMaterial(species, form);
      owned.push(geometry, material);
    }
    podMaterials.push(material);

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = `ambient-${spec.speciesId}`;
    mesh.frustumCulled = false;
    // drawn after the opaque-from-above sea surface (-10) so the backs and
    // dorsal fins that break the water stay readable from the pontoon
    mesh.renderOrder = 1;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.visible = false;
    group.add(mesh);
    // keep every instance at zero scale until the pod is staged
    for (let i = 0; i < count; i++) {
      _scale.setScalar(0);
      _m4.compose(_zero, _q.identity(), _scale);
      mesh.setMatrixAt(i, _m4);
    }
    mesh.instanceMatrix.needsUpdate = true;

    const insts = [];
    for (let i = 0; i < count; i++) {
      insts.push({
        index: i,
        localIndex: i,
        along: (rand() - 0.5) * (spec.speciesId === 'scad' ? 2.6 : 3.6),
        side: (rand() - 0.5) * (spec.speciesId === 'scad' ? 2.0 : 2.8),
        up: (rand() - 0.5) * (spec.speciesId === 'scad' ? 0.10 : 0.16),
        seed: rand() * Math.PI * 2,
        size: 0.78 + rand() * 0.4,
        speedMul: 0.86 + rand() * 0.3,
      });
    }

    pods.push({
      spec,
      species,
      mesh,
      insts,
      material,
      activeCount: count,
      maxCount: count,
      heading: new THREE.Vector3(1, 0, 0),
      center: new THREE.Vector3(),
      start: new THREE.Vector3(),
      travel: 0,
      vis: 0,
      targetVis: 0,
      baseY: -0.1,
      dirSign: 1,
      rippleTimer: rand() * 0.4,
      reroll: 0,
      staged: false,
      seed: rand() * 10,
    });
  }

  if (pods.length === 0) {
    engine.scene.remove(group);
    return {
      group,
      update() {},
      setMode() {},
      setVisible() {},
      hide() {},
      dispose() {},
      debugInfo() { return { active: 0, pods: [] }; },
    };
  }

  function stage(pod, hard) {
    const cam = engine.camera;
    cam.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _right.crossVectors(_fwd, UP).normalize();
    const spec = pod.spec;
    const dist = spec.dist[0] + rand() * (spec.dist[1] - spec.dist[0]);
    const sideAmt = (spec.side[0] + rand() * (spec.side[1] - spec.side[0])) * (rand() < 0.5 ? -1 : 1);
    const activeCam = engine.camera.position;
    pod.start.copy(activeCam)
      .addScaledVector(_fwd, dist)
      .addScaledVector(_right, sideAmt);
    pod.start.y = 0;
    // cross the view at a shallow angle, roughly perpendicular to the look dir
    pod.dirSign = rand() < 0.5 ? -1 : 1;
    pod.heading.copy(_right).multiplyScalar(pod.dirSign)
      .addScaledVector(_fwd, (rand() - 0.5) * 0.7)
      .normalize();
    pod.travel = -spec.pathLen * (0.12 + rand() * 0.3);
    pod.baseY = spec.baseY ?? -0.04;
    pod.reroll = 0;
    pod.staged = true;
    if (hard) pod.vis = 0;
  }

  function setMode(m) {
    mode = m || 'off';
  }

  function hide() {
    visible = false;
    group.visible = false;
    for (const pod of pods) {
      pod.mesh.visible = false;
      pod.vis = 0;
      pod.targetVis = 0;
    }
  }

  function update(dt, info = {}) {
    if (!enabled) { hide(); return; }
    const modeNow = info.mode ?? mode;
    const camY = engine.camera.position.y;
    const wantVisible = modeNow === 'shop' || modeNow === 'fishing';
    const cameraOk = camY > 0.32;
    const active = wantVisible && cameraOk;

    const time = app.time;
    const cam = engine.camera;
    cam.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _right.crossVectors(_fwd, UP).normalize();

    visible = active;
    group.visible = active;

    for (const pod of pods) {
      if (!active) {
        pod.mesh.visible = false;
        pod.vis = 0;
        pod.targetVis = 0;
        continue;
      }
      if (!pod.staged) stage(pod, true);

      // reseed when the pod has crossed the frame or the camera moved far away
      pod.travel += pod.spec.speed * dt;
      _tmp.copy(pod.start).addScaledVector(pod.heading, pod.travel);
      const toPodX = _tmp.x - cam.position.x;
      const toPodZ = _tmp.z - cam.position.z;
      const dist = Math.hypot(toPodX, toPodZ);
      const inFront = (toPodX * _fwd.x + toPodZ * _fwd.z) / Math.max(1e-4, dist);
      if (pod.travel > pod.spec.pathLen * 0.5 || inFront < -0.25 || dist > 44) {
        pod.reroll += dt;
        if (pod.reroll > 0.6) stage(pod, false);
      } else {
        pod.reroll = 0;
      }

      pod.targetVis = 1;
      pod.vis = damp(pod.vis, pod.targetVis, 2.2, dt);
      if (pod.vis < 0.02) {
        pod.mesh.visible = false;
        continue;
      }
      pod.mesh.visible = true;

      // wake rings + a little foam where the backs break the surface
      if (ctx.ocean && typeof ctx.ocean.addRipple === 'function') {
        pod.rippleTimer -= dt;
        if (pod.rippleTimer <= 0) {
          pod.rippleTimer = 0.26 + rand() * 0.22;
          for (const inst of pod.insts) {
            if (inst.index > 2) break; // two or three rings per beat is enough
            _tmp.copy(pod.start).addScaledVector(pod.heading, pod.travel);
            ctx.ocean.addRipple(
              _tmp.x + pod.heading.x * inst.along + _right.x * inst.side,
              _tmp.z + pod.heading.z * inst.along + _right.z * inst.side,
              pod.vis * (pod.species.id === 'scad' ? 0.16 : 0.3),
            );
          }
        }
      }

      const yaw = Math.atan2(pod.heading.x, pod.heading.z);
      for (const inst of pod.insts) {
        const active = inst.localIndex < pod.activeCount;
        const bob = Math.sin(time * 1.55 + inst.seed + pod.seed) * 0.022;
        _pos.copy(pod.start)
          .addScaledVector(pod.heading, pod.travel + inst.along)
          .addScaledVector(_right, inst.side);
        _pos.y = pod.baseY + inst.up + bob;
        // nose rides up a touch on the surface, roll with the swell
        const pitch = Math.sin(time * 1.2 + inst.seed) * 0.035 - 0.02;
        const roll = pod.dirSign * 0.1 + Math.sin(time * 1.7 + inst.seed * 2.1) * 0.055;
        _euler.set(pitch, yaw, roll, 'YXZ');
        _q.setFromEuler(_euler);
        const size = active ? pod.spec.length * inst.size * Math.pow(pod.vis, 0.42) : 0;
        _scale.setScalar(size);
        _m4.compose(_pos, _q, _scale);
        pod.mesh.setMatrixAt(inst.index, _m4);
      }
      pod.mesh.instanceMatrix.needsUpdate = true;
    }

    // keep the skin animated even if the dive-school path is not running
    for (const mat of podMaterials) updateFishMaterial(mat, app.time, 0, 0);
    lastCameraOn = cameraOk;
  }

  function setVisible(v) {
    enabled = !!v;
    if (!enabled) hide();
  }

  function dispose() {
    engine.scene.remove(group);
    for (const res of owned) res.dispose();
    // geometry/material reused from the schools are owned there
    group.clear();
  }

  function debugInfo() {
    return {
      mode,
      visible,
      cameraOn: lastCameraOn,
      density,
      active: pods.filter((p) => p.mesh.visible).length,
      pods: pods.map((p) => ({
        species: p.species.id,
        vis: +p.vis.toFixed(2),
        pos: [+p.start.x.toFixed(1), +p.start.z.toFixed(1)],
        travel: +p.travel.toFixed(1),
        fish: p.activeCount,
      })),
    };
  }

  function setDensity(scale) {
    density = clampDensity(scale);
    for (const pod of pods) {
      pod.activeCount = Math.max(2, Math.min(pod.maxCount, Math.round(pod.spec.count * density)));
    }
    return { density, pods: pods.map((p) => p.activeCount) };
  }

  return {
    group, update, setMode, setVisible, hide, dispose, debugInfo, setDensity,
    get density() { return density; },
    get visible() { return visible; },
  };
}
