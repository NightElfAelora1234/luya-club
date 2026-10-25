// Fish ecology — procedural South China Sea schools + surface encounter.
// Public API is CONTRACT.md §2.1. Owner: fish.
import * as THREE from 'three';
import { SPECIES, FORMS, getSpecies, getForm } from '../../data/species.js';
import { createSchools } from './schools.js';
import { createSurfaceFish } from './surface.js';
import { createFighterPool } from './fighter.js';
import { createAmbientPods } from './ambient.js';
import { createFishPreview, resolveSpeciesId, estimateWeightKg } from './previewFish.js';

const _camPos = new THREE.Vector3();
const _bubblePos = new THREE.Vector3();
const _fillPos = new THREE.Vector3();

export function createFishSystem(engine, app, ctx = {}) {
  const species = SPECIES;
  const forms = FORMS;
  const fishQ = engine.qualityPreset?.fish || { schoolScale: 1, ambientScale: 1 };

  const schools = createSchools(engine, app, species, forms, { quality: fishQ.schoolScale ?? 1 });

  // the pointer encounter reuses the mahi school's geometry + skin
  const mahiSchool = schools.schools.find((s) => s.species.id === 'mahi-mahi');
  const mahiSpecies = getSpecies('mahi-mahi');
  const mahiForm = getForm('mahi-mahi');
  const surface = createSurfaceFish(engine, app, ctx, {
    species: mahiSpecies,
    form: mahiForm,
    geometry: mahiSchool ? mahiSchool.geometry : null,
    material: mahiSchool ? mahiSchool.material : null,
  });

  const fighters = createFighterPool(engine, app, species, forms);

  // surface pods for shop / fishing — no pointer, no extra scene lights
  const ambient = createAmbientPods(engine, app, ctx, {
    schools: schools.schools,
    species,
    forms,
    getSpeciesById: getSpecies,
    getFormById: getForm,
    countScale: fishQ.ambientScale ?? 1,
  });
  ambient.setMode(app.mode || 'off');
  // NB: no scene lights are added here. Depth legibility comes from the fish
  // skin's own form-fill / rim / specular terms (see material.js) so the Lead's
  // atmosphere, exposure and fog remain the single source of scene light.

  let visible = true;
  let bubbleTimer = 1.2;
  let enabled = true;

  const onMode = (mode) => {
    if (mode !== 'dive') fighters.hideAll();
  };
  app.bus.on('mode', onMode);

  // Adaptive quality: show a subset of each pod rather than rebuilding geometry.
  const offQuality = engine.onQuality?.((tier, preset) => {
    const q = preset?.fish || fishQ;
    schools.setDensity(q.schoolScale ?? 1);
    ambient.setDensity(q.ambientScale ?? 1);
  });

  function update(dt, info = {}) {
    const mode = info.mode ?? app.mode;
    const underwater = info.underwater ?? engine.camera.position.y < 0.02;
    const depth = info.depth ?? app.cameraDepth;
    const time = app.time;

    _camPos.copy(engine.camera.position);

    if (!enabled || !visible) {
      schools.setVisible(false);
      surface.group.visible = false;
      ambient.hide();
      return;
    }

    const fishInfo = { mode, underwater, depth };
    schools.update(dt, fishInfo);
    surface.update(dt, fishInfo);
    ambient.update(dt, fishInfo);
    fighters.updateMaterials(time, depth);
    fighters.update(dt);

    // rare bubble trails from the nearest school — sells the fish as breathing
    if (mode === 'dive' && underwater && depth > 3) {
      bubbleTimer -= dt;
      if (bubbleTimer <= 0) {
        bubbleTimer = 0.65 + Math.random() * 0.9;
        let best = null;
        let bestD = 1e9;
        for (const school of schools.schools) {
          if (!school.mesh.visible) continue;
          for (const pod of school.pods) {
            if (pod.vis < 0.35) continue;
            const d = pod.center.distanceToSquared(_camPos);
            if (d < bestD) { bestD = d; best = pod; }
          }
        }
        if (best && bestD < 40 * 40 && ctx.ambience?.bubbleBurst) {
          _bubblePos.set(
            best.center.x + (Math.random() - 0.5) * 3,
            best.center.y + (Math.random() - 0.5) * 2,
            best.center.z + (Math.random() - 0.5) * 3,
          );
          ctx.ambience.bubbleBurst(_bubblePos, 1 + Math.floor(Math.random() * 2));
        }
      }
    }

    if (mode !== 'dive') {
      // keep the fighter materials ticking, but stop burning draw calls on schools
      surface.group.visible = false;
    }
  }

  function setVisible(v) {
    visible = !!v;
    enabled = !!v;
    schools.setVisible(!!v);
    surface.group.visible = false;
    ambient.setVisible(!!v);
  }

  // ── round-2 API: standalone hero fish + ambient surface pods ──────────────
  function setAmbientMode(mode) {
    ambient.setMode(mode);
    return mode;
  }

  /**
   * Standalone, high-detail fish for the bag turntable / QTE fight / studio.
   * The returned group is NOT added to any scene; nose points +Z; root scale is
   * the fork length in metres. Unknown ids return null.
   */
  function makeFishPreview(speciesId, opts) {
    return createFishPreview(speciesId, opts);
  }

  function spawnFighter(speciesId) {
    return fighters.spawnFighter(speciesId);
  }

  function releaseFighter(fighter) {
    if (!fighter) return;
    if (typeof fighter.release === 'function') fighter.release();
    else if (fighter.object) fighter.object.visible = false;
  }

  function getSpeciesForLure(lureType) {
    const pool = species.filter((s) => s.fighter && s.lureTypes.includes(lureType));
    return pool.length ? pool[0] : null;
  }

  function debugInfo() {
    return {
      schools: schools.podCount,
      visibleFish: schools.visibleFish + surface.visibleCount,
      drawCalls: engine.renderer.info.render.calls,
      triangles: engine.renderer.info.render.triangles,
      species: species.length,
      surfaceActive: surface.visibleCount,
      surface: surface.debugInfo(),
      ambient: ambient.debugInfo(),
      fighters: fighters.activeCount,
      depth: +app.cameraDepth.toFixed(1),
      density: { schools: schools.density, ambient: ambient.density, tier: engine.quality },
    };
  }

  return {
    ready: true,
    species,
    update,
    setVisible,
    spawnFighter,
    releaseFighter,
    getSpeciesById: (id) => getSpecies(id),
    getSpeciesForLure,
    debugInfo,
    // ── round-2 contract ────────────────────────────────────────────────────
    createFishPreview: makeFishPreview,
    setAmbientMode,
    resolveSpeciesId,
    estimateWeightKg,
    // extras for teammates
    get forms() { return forms; },
    get schools() { return schools.schools; },
    get ambientPods() { return ambient; },
    hideAllFighters: fighters.hideAll,
    setQuality(presetOrScale) {
      const q = typeof presetOrScale === 'number'
        ? { schoolScale: presetOrScale, ambientScale: presetOrScale }
        : (presetOrScale?.fish || {});
      return {
        schools: schools.setDensity(q.schoolScale ?? 1),
        ambient: ambient.setDensity(q.ambientScale ?? 1),
      };
    },
    dispose() {
      try { offQuality?.(); } catch (err) { /* noop */ }
      schools.dispose();
      surface.dispose();
      ambient.dispose();
      fighters.dispose();
      app.bus.off('mode', onMode);
    },
  };
}
