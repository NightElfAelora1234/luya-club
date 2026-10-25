// Catch moment fish — high-detail single meshes handed to the fishing sim via
// ctx.fish.spawnFighter(speciesId). Owner: fish.
import * as THREE from 'three';
import { buildFishGeometry } from './geometry.js';
import { createFishMaterial, updateFishMaterial } from './material.js';
import { mulberry32 } from '../../core/util.js';

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _euler = new THREE.Euler();

export function createFighterPool(engine, app, speciesList, forms) {
  const rand = mulberry32(0x2f7c12ab);
  const cache = new Map(); // speciesId -> { mesh, material, geometry, species }
  const active = new Set();

  function build(species) {
    const form = forms[species.id];
    const geometry = buildFishGeometry(form, { detail: 2 });
    const material = createFishMaterial(species, form);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `fighter-${species.id}`;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    engine.scene.add(mesh);
    return { mesh, material, geometry, species, form };
  }

  function spawnFighter(speciesId) {
    const species = speciesList.find((s) => s.id === speciesId) || speciesList[0];
    if (!species) return null;
    if (!cache.has(species.id)) cache.set(species.id, build(species));
    const entry = cache.get(species.id);
    const [minL, maxL] = species.sizeCm;
    const lengthCm = Math.round(minL + (maxL - minL) * (0.35 + rand() * 0.55));
    const [minW, maxW] = species.weightKg;
    const weightKg = +(minW + (maxW - minW) * (0.25 + rand() * 0.6)).toFixed(2);

    const fighter = {
      object: entry.mesh,
      species,
      weightKg,
      lengthCm,
      followCamera: true,
      visible: false,
      entry,
      // contract: added to the scene, hidden until the catch moment
      bornAt: app.time,
      showInFrontOfCamera() {
        this.visible = true;
        entry.mesh.visible = true;
        this.bornAt = app.time;
        placeInFront(entry, this);
      },      hide() {
        this.visible = false;
        entry.mesh.visible = false;
        active.delete(fighter);
      },
      release() {
        this.visible = false;
        entry.mesh.visible = false;
        active.delete(fighter);
      },
    };
    entry.mesh.visible = false;
    entry.mesh.userData.fighter = fighter;
    active.add(fighter);
    return fighter;
  }

  function placeInFront(entry, fighter) {
    const cam = engine.camera;
    cam.updateMatrixWorld();
    cam.getWorldDirection(_dir);
    _right.setFromMatrixColumn(cam.matrixWorld, 0);
    _up.setFromMatrixColumn(cam.matrixWorld, 1);
    const lenM = fighter.lengthCm / 100;
    const dist = Math.min(2.75, Math.max(1.35, 0.95 + lenM * 0.85));
    _pos.copy(cam.position)
      .addScaledVector(_dir, dist)
      .addScaledVector(_right, -0.26 - lenM * 0.06)
      .addScaledVector(_up, -0.2 - lenM * 0.04);
    entry.mesh.position.copy(_pos);
    const yaw = Math.atan2(_dir.x, _dir.z) + 1.22 + Math.sin(app.time * 0.6) * 0.04;
    const pitch = 0.12 + Math.sin(app.time * 0.9) * 0.03;
    const roll = 0.2;
    _euler.set(pitch, yaw, roll, 'YXZ');
    entry.mesh.quaternion.setFromEuler(_euler);
    entry.mesh.scale.setScalar(lenM);
    entry.mesh.visible = true;
  }

  function update(dt) {
    if (active.size === 0) return;
    for (const fighter of active) {
      if (!fighter.visible) continue;
      // keep the catch fish framed even if the fishing camera drifts
      if (fighter.followCamera) {
        placeInFront(fighter.entry, fighter);
        fighter.entry.mesh.rotation.z += Math.sin(app.time * 1.7) * 0.02;
      }
    }
  }

  function hideAll() {
    for (const fighter of active) {
      fighter.visible = false;
      fighter.entry.mesh.visible = false;
    }
    active.clear();
  }

  function updateMaterials(time, depth) {
    for (const entry of cache.values()) updateFishMaterial(entry.material, time, depth, 0);
  }

  function dispose() {
    for (const entry of cache.values()) {
      engine.scene.remove(entry.mesh);
      entry.geometry.dispose();
      entry.material.dispose();
    }
    cache.clear();
    active.clear();
  }

  return { spawnFighter, update, hideAll, updateMaterials, dispose, get activeCount() { return active.size; } };
}
