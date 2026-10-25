// Standalone hero fish — used by the fish bag turntable and the QTE fight, and
// by the studio hero render. It owns its own geometry + material (never the
// InstancedMesh school), is NOT added to the main scene, and can be moved into
// any scene/renderer by the caller. Owner: fish-v2.
//
// Orientation: the fish's nose points along local +Z (three.js Object3D.lookAt
// aims +Z at the target for non-camera objects). The root group's scale is the
// fork length in metres, so `group.scale.setScalar(1.4)` would be wrong — use
// setLengthCm() or add the group as-is.
import * as THREE from 'three';
import { buildFishGeometry } from './geometry.js';
import { createFishMaterial, updateFishMaterial } from './material.js';
import { getSpecies, getForm } from '../../data/species.js';
import { mulberry32 } from '../../core/util.js';

// The fishing sim looks fish up by its own normalised ids ("mahi", "grouper").
const ALIASES = {
  'yellowfin': 'yellowfin-tuna',
  'yellowfin-tuna': 'yellowfin-tuna',
  'tuna': 'yellowfin-tuna',
  'cobia': 'cobia',
  'mahi': 'mahi-mahi',
  'mahi-mahi': 'mahi-mahi',
  'dolphinfish': 'mahi-mahi',
  'dolphin': 'mahi-mahi',
  'snapper': 'red-snapper',
  'red-snapper': 'red-snapper',
  'grouper': 'giant-grouper',
  'giant-grouper': 'giant-grouper',
  'jewfish': 'giant-grouper',
  'parrotfish': 'parrotfish',
  'lionfish': 'lionfish',
  'hairtail': 'hairtail',
  'scad': 'scad',
};

/** Accepts both the canonical species id and the fishing sim's short ids. */
export function resolveSpeciesId(id) {
  if (!id) return null;
  const key = String(id).trim().toLowerCase().replace(/\s+/g, '-');
  return ALIASES[key] || (getSpecies(key) ? key : null);
}

/** Length → weight with a cube law; clamped to the species' catalogue range. */
export function estimateWeightKg(species, lengthCm) {
  if (!species) return 0;
  const [, lMax] = species.sizeCm;
  const [wMin, wMax] = species.weightKg;
  const w = wMax * Math.pow(Math.max(1, lengthCm) / lMax, 3);
  return +Math.max(wMin * 0.55, Math.min(wMax * 1.06, w)).toFixed(2);
}

function clampLength(species, cm) {
  const min = species ? species.sizeCm[0] * 0.55 : 5;
  const max = species ? species.sizeCm[1] * 1.12 : 300;
  return Math.max(min, Math.min(max, +cm));
}

function createStudioLights() {
  // Only meaningful when the group is the only thing in its own scene (bag
  // turntable / studio page). Off by default so a fight fish added to the main
  // scene never adds scene lights.
  const rig = new THREE.Group();
  rig.name = 'fish-studio-lights';
  rig.visible = false;

  const hemi = new THREE.HemisphereLight(0x9fc8dd, 0x141d1c, 0.55);
  rig.add(hemi);

  const key = new THREE.DirectionalLight(0xfff0d6, 3.1);
  key.position.set(-1.7, 2.3, 2.2);
  rig.add(key);
  rig.add(key.target);

  const fill = new THREE.DirectionalLight(0x86bad6, 1.15);
  fill.position.set(2.6, 0.35, 1.1);
  rig.add(fill);
  rig.add(fill.target);

  const rim = new THREE.DirectionalLight(0xffb173, 2.4);
  rim.position.set(0.5, 1.5, -2.8);
  rig.add(rim);
  rig.add(rim.target);

  return rig;
}

/**
 * @param {string} speciesId canonical or short id (see ALIASES)
 * @param {{lengthCm?:number, weightKg?:number, detail?:number,
 *          studioLighting?:boolean, animate?:boolean, wet?:number, seed?:number}} [opts]
 * @returns {null | {
 *   group: THREE.Group, mesh: THREE.Mesh, species: object,
 *   weightKg: number, lengthCm: number,
 *   update(dt:number):void, setLengthCm(cm:number):number,
 *   setStudioLighting(on:boolean):void, dispose():void
 * }}
 */
export function createFishPreview(speciesId, opts = {}) {
  const id = resolveSpeciesId(speciesId);
  if (!id) return null;
  const species = getSpecies(id);
  const form = getForm(id);
  if (!species || !form) return null;

  const rand = mulberry32((opts.seed ?? 0x7f4a7c15) ^ (id.length * 2654435761));
  const [minL, maxL] = species.sizeCm;
  let lengthCm = clampLength(
    species,
    opts.lengthCm ?? (minL + (maxL - minL) * (0.28 + rand() * 0.5)),
  );
  lengthCm = Math.round(lengthCm * 10) / 10;

  const detail = Math.max(1, Math.min(3, opts.detail ?? 3));
  const geometry = buildFishGeometry(form, { detail });
  geometry.name = `fish-preview-geo-${id}`;
  const material = createFishMaterial(species, form);
  material.name = `fish-preview-skin-${id}`;
  // a fresh-caught, wet fish reads better than a dry one in a studio
  const uniforms = material.userData.uniforms;
  if (uniforms?.uWet) uniforms.uWet.value = opts.wet ?? Math.max(0.55, form.wet ?? 0.45);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'fish-body';
  mesh.frustumCulled = false;

  const group = new THREE.Group();
  group.name = `fish-preview-${id}`;
  group.add(mesh);

  const lights = createStudioLights();
  lights.visible = !!opts.studioLighting;
  group.add(lights);

  let time = opts.seed ? (opts.seed % 100) * 0.37 : 0;
  let disposed = false;
  const animate = opts.animate !== false;

  function applyLength(cm) {
    lengthCm = Math.round(clampLength(species, cm) * 10) / 10;
    group.scale.setScalar(lengthCm / 100);
  }

  applyLength(lengthCm);

  const preview = {
    group,
    mesh,
    material,
    geometry,
    species,
    form,
    get lengthCm() { return lengthCm; },
    get lengthM() { return lengthCm / 100; },
    weightKg: opts.weightKg != null
      ? +opts.weightKg
      : estimateWeightKg(species, lengthCm),

    /** Advance the skin (tail beat, gill shimmer). Safe to call at 0 fps. */
    update(dt = 0) {
      if (disposed) return;
      time += Math.max(0, Math.min(0.1, dt || 0));
      updateFishMaterial(material, time, 0, 0);
      if (animate) {
        // a living, nearly-still fish: the tail beat lives in the shader, the
        // body only breathes a fraction of a degree so the bag never feels frozen
        mesh.rotation.z = Math.sin(time * 0.9) * 0.012;
      }
    },

    setLengthCm(cm) {
      applyLength(cm);
      preview.weightKg = estimateWeightKg(species, lengthCm);
      return lengthCm;
    },

    /** Studio key/fill/rim rig, for an isolated scene (bag turntable). */
    setStudioLighting(on) {
      lights.visible = !!on;
    },

    /** Optional turntable pose driven by the caller (radians about world Y). */
    setYaw(yaw) {
      group.rotation.y = yaw;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (group.parent) group.parent.remove(group);
      geometry.dispose();
      material.dispose();
    },
  };
  return preview;
}
