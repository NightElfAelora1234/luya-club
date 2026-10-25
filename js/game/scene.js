// Physical set for the fishing mode: the pontoon deck under the angler, water
// splash particles, the visible hooked fish (fish-v2 preview model), surface
// life cues and the bite marker. Everything is procedural, no assets.
//
// Round 2: the old abstract fight marker is replaced by a real fish model that
// thrashes/jumps at the surface while the QTE runs. The marker is kept for the
// bite beat only.

import * as THREE from 'three';
import { clamp, makeCanvas, canvasTexture, mulberry32 } from '../core/util.js';
import { createPreviewFactory, buildFallbackFish } from './fish-preview.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

// ---------------------------------------------------------------------------
// Deck textures
// ---------------------------------------------------------------------------

function teakTexture() {
  const w = 512, h = 512;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const plank = 64;
  for (let x = 0; x < w; x += plank) {
    const lum = 78 + ((x / plank) % 3) * 7 - ((x / plank) % 2) * 5;
    g.fillStyle = `rgb(${lum + 16},${lum + 8},${lum - 4})`;
    g.fillRect(x, 0, plank, h);
    g.fillStyle = 'rgba(8,10,10,0.55)';
    g.fillRect(x, 0, 2, h);
    for (let i = 0; i < 46; i++) {
      const gx = x + 4 + Math.random() * (plank - 8);
      const y0 = Math.random() * h;
      const len = 20 + Math.random() * 110;
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '20,16,12' : '200,178,142'},${0.03 + Math.random() * 0.06})`;
      g.lineWidth = 0.7 + Math.random();
      g.beginPath();
      g.moveTo(gx, y0);
      g.bezierCurveTo(gx + 3, y0 + len * 0.3, gx - 3, y0 + len * 0.7, gx + 2, y0 + len);
      g.stroke();
    }
  }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(225,232,226,${Math.random() * 0.045})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const grd = g.createRadialGradient(x, y, 2, x, y, 50 + Math.random() * 80);
    grd.addColorStop(0, 'rgba(10,16,16,0.14)');
    grd.addColorStop(1, 'rgba(10,16,16,0)');
    g.fillStyle = grd;
    g.fillRect(x - 130, y - 130, 260, 260);
  }
  const tex = canvasTexture(c, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.6, 3.2);
  tex.anisotropy = 4;
  return tex;
}

function buildDeck() {
  const group = new THREE.Group();
  group.name = 'fishingDeck';

  const tex = teakTexture();
  const deckMat = new THREE.MeshStandardMaterial({
    map: tex, color: 0x7d7466, roughness: 0.84, metalness: 0.02,
    envMapIntensity: 0.35, bumpMap: tex, bumpScale: 0.008,
  });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.15, 8.6), deckMat);
  deck.position.set(0.25, 0.545, 0.8);
  deck.receiveShadow = true;
  group.add(deck);

  const seamMat = new THREE.MeshStandardMaterial({ color: 0x302a22, roughness: 0.95, metalness: 0.0 });
  for (const x of [-1.72, -1.14, -0.56, 0.03, 0.62, 1.21, 1.8]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.004, 8.58), seamMat);
    seam.position.set(x, 0.622, 0.8);
    group.add(seam);
  }

  const lipMat = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.55, metalness: 0.15 });
  const lip = new THREE.Mesh(new THREE.BoxGeometry(3.94, 0.075, 0.22), lipMat);
  lip.position.set(0.25, 0.585, -3.36);
  group.add(lip);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.018, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xc79b5f, roughness: 0.28, metalness: 0.95 }));
  trim.position.set(0.25, 0.632, -3.47);
  group.add(trim);

  const floatMat = new THREE.MeshStandardMaterial({ color: 0x1c2426, roughness: 0.42, metalness: 0.25 });
  for (const x of [-1.35, 0.25, 1.85]) {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 7.2, 12), floatMat);
    fl.rotation.x = Math.PI * 0.5;
    fl.position.set(x, 0.16, 0.6);
    group.add(fl);
  }

  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a064, metalness: 1.0, roughness: 0.32 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1a2223, metalness: 0.8, roughness: 0.4 });
  for (const z of [-2.9, 0.2, 3.3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.5, 8), darkMetal);
    post.position.set(-1.62, 0.87, z);
    group.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), brass);
    cap.position.set(-1.62, 1.12, z);
    group.add(cap);
  }
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x5a5145, roughness: 0.95, metalness: 0.0 });
  const ropeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.62, 1.06, -2.9),
    new THREE.Vector3(-1.62, 0.99, 0.2),
    new THREE.Vector3(-1.62, 1.06, 3.3),
  ]);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 20, 0.008, 5, false), ropeMat);
  group.add(rope);

  const cleatBase = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.05), brass);
  cleatBase.position.set(-1.18, 0.66, -2.7);
  group.add(cleatBase);
  for (const dx of [-0.06, 0.06]) {
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.06, 7), brass);
    horn.position.set(-1.18 + dx, 0.7, -2.7);
    group.add(horn);
  }

  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 6, 20), ropeMat);
  coil.rotation.x = Math.PI * 0.5;
  coil.position.set(-1.32, 0.645, -1.7);
  group.add(coil);

  const bucketMat = new THREE.MeshStandardMaterial({ color: 0x39423f, roughness: 0.72, metalness: 0.25 });
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.34, 14, 1, true), bucketMat);
  bucket.position.set(2.02, 0.795, -0.9);
  group.add(bucket);
  const bucketBottom = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), bucketMat);
  bucketBottom.rotation.x = Math.PI * 0.5;
  bucketBottom.position.set(2.02, 0.625, -0.9);
  group.add(bucketBottom);

  group.traverse((o) => { o.frustumCulled = true; });
  return group;
}

// ---------------------------------------------------------------------------
// Splash particles
// ---------------------------------------------------------------------------

const SPLASH_VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha * 0.78;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * (640.0 / max(0.15, -mv.z)), 1.2, 40.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const SPLASH_FRAG = /* glsl */`
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = dot(p, p);
    if (d > 0.25) discard;
    float a = smoothstep(0.25, 0.02, d) * vAlpha;
    gl_FragColor = vec4(vec3(0.86, 0.94, 0.94), a);
  }
`;

function buildSplashes(max = 300) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  for (let i = 0; i < max; i++) { pos[i * 3 + 1] = -999; alpha[i] = 0; size[i] = 3; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setDrawRange(0, max);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SPLASH_VERT,
    fragmentShader: SPLASH_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  return {
    points, pos, size, alpha, geo, max,
    particles: Array.from({ length: max }, () => ({
      life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, drag: 0.9, size: 3,
    })),
    cursor: 0,
  };
}

// ---------------------------------------------------------------------------

export function createFishingScene(engine, app, ctx) {
  const root = new THREE.Group();
  root.name = 'fishingSet';
  root.visible = false;
  engine.scene.add(root);

  const deck = buildDeck();
  root.add(deck);

  const splashes = buildSplashes();
  root.add(splashes.points);

  // Bite marker: a ring on the water so the strike moment is findable.
  const markerMat = new THREE.MeshBasicMaterial({
    color: 0xbfe7dc, transparent: true, opacity: 0.24, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const markerGroup = new THREE.Group();
  const fightMarker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.95, 40), markerMat);
  const fightMarkerWide = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 44), markerMat.clone());
  fightMarkerWide.material.opacity = 0.1;
  for (const ring of [fightMarker, fightMarkerWide]) {
    ring.rotation.x = -Math.PI * 0.5;
    ring.position.y = 0.03;
    ring.frustumCulled = false;
    markerGroup.add(ring);
  }
  markerGroup.visible = false;
  markerGroup.renderOrder = 4;
  root.add(markerGroup);
  let markerActive = false;
  let markerIntensity = 1;

  // Fight beacon: a billboarded low-luminance glow + a surface ring at the
  // EXACT hooked-fish position. At 80–120 m the fish model is only a few
  // pixels on screen, so this is the track cue that lets the player see where
  // the fish is being pulled from; it fades away as the fish comes close.
  const beaconGlowTex = (() => {
    const c = makeCanvas(128, 128);
    const g = c.getContext('2d');
    // soft low-luminance halo
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(196,232,216,0.20)');
    grd.addColorStop(0.55, 'rgba(120,188,164,0.10)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    // crisp ring so the mark stays readable at 80–120 m
    g.strokeStyle = 'rgba(214,242,230,0.92)';
    g.lineWidth = 5;
    g.beginPath(); g.arc(64, 64, 45, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(130,204,178,0.5)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(64, 64, 53, 0, Math.PI * 2); g.stroke();
    // centre pin
    g.fillStyle = 'rgba(228,248,240,0.95)';
    g.beginPath(); g.arc(64, 64, 4.5, 0, Math.PI * 2); g.fill();
    return canvasTexture(c);
  })();
  const beaconPlumeTex = (() => {
    const c = makeCanvas(32, 128);
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 128, 0, 0);
    grd.addColorStop(0, 'rgba(190,230,212,0.0)');
    grd.addColorStop(0.18, 'rgba(204,238,222,0.55)');
    grd.addColorStop(0.55, 'rgba(176,222,202,0.28)');
    grd.addColorStop(1, 'rgba(140,196,174,0.0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(10, 128); g.quadraticCurveTo(4, 52, 16, 0);
    g.quadraticCurveTo(26, 58, 22, 128);
    g.closePath(); g.fill();
    return canvasTexture(c);
  })();
  const beaconGroup = new THREE.Group();
  beaconGroup.name = 'fightBeacon';
  beaconGroup.visible = false;
  beaconGroup.renderOrder = 5;
  root.add(beaconGroup);
  const beaconSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: beaconGlowTex, color: 0xd6eee4, transparent: true, opacity: 0,
    // the marker must never be swallowed by a wave crest at 100 m
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
  }));
  beaconSprite.position.y = 0.35;
  beaconSprite.frustumCulled = false;
  beaconSprite.renderOrder = 6;
  beaconGroup.add(beaconSprite);
  const beaconPlume = new THREE.Sprite(new THREE.SpriteMaterial({
    map: beaconPlumeTex, color: 0xd2ece0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
  }));
  beaconPlume.frustumCulled = false;
  beaconPlume.renderOrder = 6;
  beaconGroup.add(beaconPlume);
  const beaconRingMat = new THREE.MeshBasicMaterial({
    color: 0xbfe7dc, transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
  });
  const beaconRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 36), beaconRingMat);
  beaconRing.rotation.x = -Math.PI * 0.5;
  beaconRing.position.y = 0.03;
  beaconRing.frustumCulled = false;
  beaconRing.renderOrder = 6;
  beaconGroup.add(beaconRing);
  let beaconActive = false;
  let beaconIntensity = 0;
  let beaconScale = 1;

  // The hooked fish — a real fish-v2 preview model, owned here.
  const previews = createPreviewFactory(ctx);
  const fishRoot = new THREE.Group();
  fishRoot.name = 'fightFish';
  fishRoot.visible = false;
  root.add(fishRoot);
  let fishActor = null;
  let fishSpecies = null;
  let fishLengthCm = 60;
  let fishWeightKg = 2;
  let fishLeap = 0;
  let fishLeapDur = 0.8;
  let fishLeapPeak = 1.0;
  let fishLeapActive = false;
  let fishThrash = 0;

  // Water contact: a soft shadow + foam ring grounds the fish on the surface
  // instead of letting it hover over the ocean.
  const contactGroup = new THREE.Group();
  contactGroup.name = 'fishContact';
  contactGroup.visible = false;
  root.add(contactGroup);
  const contactShadowMat = new THREE.MeshBasicMaterial({
    color: 0x02110f, transparent: true, opacity: 0.34, depthWrite: false,
    side: THREE.DoubleSide,
  });
  const contactShadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 28), contactShadowMat);
  contactShadow.rotation.x = -Math.PI * 0.5;
  contactShadow.position.y = 0.012;
  contactShadow.renderOrder = 2;
  contactGroup.add(contactShadow);
  const contactFoamMat = new THREE.MeshBasicMaterial({
    color: 0xcfeee6, transparent: true, opacity: 0.2, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const contactFoam = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.72, 40), contactFoamMat);
  contactFoam.rotation.x = -Math.PI * 0.5;
  contactFoam.position.y = 0.02;
  contactFoam.renderOrder = 2;
  contactGroup.add(contactFoam);
  let contactStrength = 1;

  // cheap ambient jumper (no per-catch allocations during a fight)
  const ambientRoot = new THREE.Group();
  ambientRoot.visible = false;
  root.add(ambientRoot);
  let ambientFish = null;
  let ambientT = -1;
  let ambientDur = 1.1;
  let ambientFrom = new THREE.Vector3();
  let ambientPeak = 1.2;
  let ambientDone = null;

  const rng = mulberry32(0x51a7);
  let wakeClock = 0;
  let time = 0;
  let ambientTimer = 7.5;
  let ambientBigTimer = 19;

  function spawnSplash(pos, strength = 1, count = null) {
    const n = count ?? Math.round(8 + 18 * clamp(strength));
    for (let i = 0; i < n; i++) {
      const idx = splashes.cursor;
      splashes.cursor = (splashes.cursor + 1) % splashes.max;
      const p = splashes.particles[idx];
      const ang = rng() * Math.PI * 2;
      const rad = (0.08 + rng() * 0.5) * (0.4 + strength);
      const k = idx * 3;
      splashes.pos[k] = pos.x + Math.cos(ang) * rad;
      splashes.pos[k + 1] = Math.max(0.02, pos.y + 0.02 + rng() * 0.1);
      splashes.pos[k + 2] = pos.z + Math.sin(ang) * rad;
      const burst = 1.0 + strength * 2.0;
      p.vx = Math.cos(ang) * burst * (0.5 + rng());
      p.vz = Math.sin(ang) * burst * (0.5 + rng());
      p.vy = 1.15 + rng() * (1.5 + strength * 1.9);
      p.maxLife = 0.4 + rng() * 0.7;
      p.life = p.maxLife;
      p.drag = 0.4 + rng() * 0.5;
      p.size = 0.016 + rng() * 0.055 * (0.5 + strength);
      splashes.size[idx] = p.size;
      splashes.alpha[idx] = 1;
    }
    try { ctx.ocean?.addRipple?.(pos.x, pos.z, 0.7 + strength * 0.8); } catch (e) { /* stub */ }
    try { ctx.ambience?.splash?.(pos, strength); } catch (e) { /* stub */ }
    return n;
  }

  function spawnRipple(pos, strength = 0.4) {
    try { ctx.ocean?.addRipple?.(pos.x, pos.z, strength); } catch (e) { /* stub */ }
  }

  function updateSplashes(dt) {
    const { pos, size, alpha, particles, max } = splashes;
    for (let i = 0; i < max; i++) {
      const p = particles[i];
      if (p.life <= 0) { alpha[i] = 0; continue; }
      p.life -= dt;
      if (p.life <= 0) { alpha[i] = 0; pos[i * 3 + 1] = -999; continue; }
      const k = i * 3;
      p.vy -= 9.8 * dt;
      const drag = 1 - p.drag * dt;
      p.vx *= drag; p.vz *= drag;
      pos[k] += p.vx * dt;
      pos[k + 1] += p.vy * dt;
      pos[k + 2] += p.vz * dt;
      if (pos[k + 1] < 0.005) {
        pos[k + 1] = 0.005;
        p.vy *= -0.12;
        p.vx *= 0.7; p.vz *= 0.7;
        p.life = Math.min(p.life, 0.16);
      }
      alpha[i] = clamp(p.life / Math.min(0.35, p.maxLife)) * 0.9;
    }
    splashes.geo.attributes.position.needsUpdate = true;
    splashes.geo.attributes.aAlpha.needsUpdate = true;
    splashes.geo.attributes.aSize.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // hooked fish — one cached preview per fight species, never disposed on
  // release. The first hook-up of a fight must create zero programs/geometries.
  // -------------------------------------------------------------------------

  const fishPool = new Map();          // species key -> { actor, species, key }
  const warmFishGroup = new THREE.Group();
  warmFishGroup.name = 'fishWarmPass';
  warmFishGroup.visible = false;
  root.add(warmFishGroup);
  let fishEntry = null;

  function fishKey(species) {
    return String(species?.sourceId || species?.id || species?.nameEn || species?.nameCn || 'fish');
  }

  function lengthFor(species) {
    const size = Array.isArray(species?.sizeCm) ? species.sizeCm : [40, 70];
    return Math.round(size[0] + (size[1] - size[0]) * 0.55);
  }

  function getPooledFish(species, opts = {}) {
    const key = fishKey(species);
    const lengthCm = Number(opts.lengthCm) || lengthFor(species);
    let entry = fishPool.get(key);
    if (!entry) {
      const actor = previews.create(species, {
        lengthCm,
        weightKg: opts.weightKg,
        detail: opts.detail ?? 2,
        animate: true,
      });
      // The ocean surface writes depth; keep the fish drawn after it so a fish
      // wallowing at the surface is never clipped by the water plane.
      actor.root.traverse((o) => {
        o.renderOrder = 3;
        o.frustumCulled = false;
        o.layers.enable(2); // inset fish-cam layer
      });
      entry = { key, species, actor, lengthCm, weightKg: Number(opts.weightKg) || 2 };
      fishPool.set(key, entry);
    } else if (Math.abs(lengthCm - entry.lengthCm) > 0.05) {
      // reuse: only the scale changes, no new geometry/shader
      try { entry.actor.setLengthCm(lengthCm); } catch (e) { /* noop */ }
      entry.lengthCm = lengthCm;
    }
    return entry;
  }

  function setFightFish(species, opts = {}) {
    fishSpecies = species || null;
    const entry = getPooledFish(species, opts);
    if (fishEntry !== entry) {
      if (fishEntry?.actor?.root.parent === fishRoot) fishRoot.remove(fishEntry.actor.root);
      fishEntry = entry;
      fishActor = entry.actor;
      fishRoot.add(fishActor.root);
      fishActor.root.visible = true;
    } else {
      fishActor = entry.actor;
    }
    fishLengthCm = entry.lengthCm;
    fishWeightKg = entry.weightKg;
    fishRoot.visible = true;
    fishThrash = 0;
    fishLeapActive = false;
    fishLeap = 0;
    return fishActor;
  }

  function releaseFightFish() {
    // keep the actor cached; just detach and hide it
    if (fishEntry?.actor?.root.parent === fishRoot) {
      fishRoot.remove(fishEntry.actor.root);
      fishEntry.actor.root.visible = false;
    }
    fishEntry = null;
    fishActor = null;
    fishRoot.visible = false;
    fishRoot.scale.setScalar(1);
    contactGroup.visible = false;
    beaconGroup.visible = false;
    beaconActive = false;
    fishLeapActive = false;
    fishLeap = 0;
  }

  /** Build every species preview (no render). Used by fishing.prewarm(). */
  function prewarmFishPool(speciesList = []) {
    const built = [];
    for (const species of speciesList) {
      if (!species) continue;
      built.push(getPooledFish(species, { detail: 2 }));
    }
    return built.length;
  }

  /**
   * Show every pooled fish in one row in front of the current camera so a
   * single real render uploads all geometries + compiles all skins.
   * Returns the number of fish staged.
   */
  function stageWarmFish(spacing = 1.6, depth = 7.5) {
    if (!fishPool.size) return 0;
    let i = 0;
    const n = fishPool.size;
    for (const entry of fishPool.values()) {
      const actor = entry.actor;
      if (actor.root.parent !== warmFishGroup) warmFishGroup.add(actor.root);
      actor.root.visible = true;
      const x = (i - (n - 1) * 0.5) * spacing;
      actor.root.position.set(x, 0.3, -depth);
      actor.root.rotation.set(0, 0, 0);
      try { actor.update(0); } catch (e) { /* noop */ }
      i += 1;
    }
    warmFishGroup.visible = true;
    // warm the surface-contact decals too: they are invisible until the first
    // real fight, so their geometry/program upload must happen here
    contactGroup.visible = true;
    contactGroup.position.set(0, 0, -depth + 1);
    contactShadowMat.opacity = 0.3;
    contactFoamMat.opacity = 0.15;
    contactShadow.scale.set(1.2, 0.7, 1);
    contactFoam.scale.set(1.2, 0.7, 1);
    // the bite marker and the ambient jumper are two more first-draws that
    // would otherwise land in the middle of a real hook-up
    markerGroup.position.set(2.6, 0, -depth + 2);
    markerGroup.visible = true;
    markerActive = true;
    markerIntensity = 1;
    if (!ambientFish) {
      ambientFish = buildFallbackFish(AMBIENT_SPECIES);
      ambientRoot.add(ambientFish);
    }
    ambientFish.visible = true;
    ambientFish.position.set(-2.8, 0.4, -depth + 1);
    ambientFish.scale.setScalar(0.5);
    ambientRoot.visible = true;
    // the fight beacon is a first-draw too; compile its sprite/ring here
    beaconGroup.position.set(1.4, 0, -depth + 2.6);
    beaconGroup.visible = true;
    beaconSprite.scale.set(2.4, 2.4, 1);
    beaconSprite.material.opacity = 0.42;
    beaconPlume.scale.set(0.7, 2.4, 1);
    beaconPlume.position.y = 1.0;
    beaconPlume.material.opacity = 0.3;
    beaconRing.scale.setScalar(1.2);
    beaconRingMat.opacity = 0.16;
    beaconActive = true;
    beaconIntensity = 0.6;
    beaconScale = 1.2;
    return n;
  }

  function clearWarmFish() {
    for (const entry of fishPool.values()) {
      const actor = entry.actor;
      if (actor.root.parent === warmFishGroup) warmFishGroup.remove(actor.root);
      actor.root.visible = false;
      actor.root.position.set(0, 0, 0);
    }
    warmFishGroup.visible = false;
    contactGroup.visible = false;
    markerGroup.visible = false;
    markerActive = false;
    ambientRoot.visible = false;
    if (ambientFish) ambientFish.visible = false;
    beaconGroup.visible = false;
    beaconActive = false;
  }

  function disposeFishPool() {
    for (const entry of fishPool.values()) {
      try { entry.actor.dispose(); } catch (e) { /* noop */ }
    }
    fishPool.clear();
    fishEntry = null;
    fishActor = null;
  }

  function updateFightFish(dt, pose = {}) {
    if (!fishActor) return;
    const leap = pose.leap ?? 0;
    fishRoot.position.set(pose.x ?? 0, pose.y ?? 0, pose.z ?? 0);
    fishRoot.rotation.set(
      pose.pitch ?? 0,
      pose.yaw ?? 0,
      pose.roll ?? 0,
    );
    fishActor.root.position.y = leap;
    fishActor.root.rotation.z = Math.sin(pose.thrashPhase ?? 0) * 0.12;
    fishActor.root.rotation.x = pose.tilt ?? 0;
    // readability scale: at long range the real fish is a few pixels, so the
    // visual model grows a little (position is untouched) and eases back to 1×
    fishRoot.scale.setScalar(clamp(pose.scale ?? 1, 1, 2.3));
    fishActor.update(dt);

    // surface contact shadow + foam ring
    contactStrength = pose.contact ?? 1;
    const leapFade = clamp(1 - leap * 1.5, 0, 1);
    const fade = clamp(contactStrength, 0, 1) * (0.2 + 0.8 * leapFade);
    contactGroup.visible = fade > 0.02;
    if (contactGroup.visible) {
      contactGroup.position.set(pose.x ?? 0, 0, pose.z ?? 0);
      const s = clamp(fishLengthCm / 100, 0.22, 2.4) * Math.min(pose.scale ?? 1, 4);
      contactShadow.scale.set(s * 1.15, s * 0.62, 1);
      contactFoam.scale.set(s * 1.25, s * 0.68, 1);
      contactShadowMat.opacity = 0.24 * fade;
      contactFoamMat.opacity = (0.12 + 0.12 * fade) * fade;
    }
  }

  function triggerLeap(peak = 1.0, dur = 0.75) {
    fishLeapActive = true;
    fishLeap = 0;
    fishLeapPeak = peak;
    fishLeapDur = dur;
  }

  function leapOffset() {
    if (!fishLeapActive) return 0;
    const t = fishLeap / fishLeapDur;
    if (t >= 1) { fishLeapActive = false; return 0; }
    return Math.sin(Math.PI * t) * fishLeapPeak;
  }

  // -------------------------------------------------------------------------
  // ambient life: small surface splashes / jumps near (not at) the pontoon
  // -------------------------------------------------------------------------

  function spawnAmbientCue(big) {
    const cam = engine.camera.position;
    const ang = (rng() - 0.5) * 1.5;
    const dist = big ? 15 + rng() * 14 : 8 + rng() * 13;
    const x = cam.x + Math.sin(ang) * dist;
    const z = cam.z - Math.cos(ang) * dist;
    _v.set(x, 0.02, z);
    spawnSplash(_v, big ? 1.05 : 0.5, big ? 30 : 14);
    spawnRipple(_v, big ? 0.7 : 0.35);
    if (big || rng() < 0.35) jumpAmbient(_v, big ? 0.9 : 0.45);
  }

  const AMBIENT_SPECIES = {
    id: 'scad', nameCn: '蓝圆鲹',
    colors: { back: 0x2a5368, side: 0x9fb5b8, belly: 0xe9ece2, fin: 0xa8b7b4, accent: 0xd9c48c },
  };

  function jumpAmbient(pos, strength) {
    // one reusable ambient fish: the fight must never allocate geometry
    if (!ambientFish) {
      ambientFish = buildFallbackFish(AMBIENT_SPECIES);
      ambientRoot.add(ambientFish);
      ambientRoot.visible = false;
    }
    ambientFish.visible = true;
    ambientFish.scale.setScalar(0.32 + rng() * 0.2);
    ambientRoot.visible = true;
    ambientFrom.copy(pos);
    ambientT = 0;
    ambientDur = 0.7 + rng() * 0.35;
    ambientPeak = 0.45 + strength * 0.75;
    ambientDone = null;
  }

  function updateAmbientJump(dt) {
    if (ambientT < 0 || !ambientFish) return;
    ambientT += dt;
    const t = ambientT / ambientDur;
    if (t >= 1) {
      spawnSplash(ambientFrom, 0.55, 14);
      ambientT = -1;
      ambientRoot.visible = false;
      if (ambientFish) ambientFish.visible = false;
      return;
    }
    const h = Math.sin(t * Math.PI) * ambientPeak;
    ambientFish.position.set(
      ambientFrom.x + Math.sin(t * Math.PI) * 0.22,
      h,
      ambientFrom.z,
    );
    ambientFish.rotation.set(0.3 + Math.sin(t * Math.PI * 2) * 0.4, Math.sin(t * Math.PI) * 0.6, -Math.cos(t * Math.PI) * 0.8);
  }

  function updateAmbient(dt, info = {}) {
    if (!info.active) { ambientTimer = Math.max(ambientTimer, 3.5); return; }
    ambientTimer -= dt;
    ambientBigTimer -= dt;
    if (ambientBigTimer <= 0) {
      ambientBigTimer = 18 + rng() * 16;
      spawnAmbientCue(true);
    } else if (ambientTimer <= 0) {
      ambientTimer = 5.5 + rng() * 7.5;
      spawnAmbientCue(false);
    }
  }

  // -------------------------------------------------------------------------
  // scene API
  // -------------------------------------------------------------------------

  const scene = {
    root,
    previews,
    get visible() { return root.visible; },
    setVisible(v) {
      root.visible = !!v;
      if (!v) {
        ambientRoot.visible = false; ambientT = -1;
        markerActive = false; markerGroup.visible = false;
        fishRoot.visible = false;
        contactGroup.visible = false;
      } else if (fishActor) {
        fishRoot.visible = true;
        contactGroup.visible = true;
      }
    },
    setFightMarker(pos, active, intensity = 1) {
      markerActive = !!active;
      markerIntensity = intensity;
      if (pos && markerActive) markerGroup.position.set(pos.x, 0, pos.z);
      markerGroup.visible = markerActive;
    },
    /** Low-luminance glow + surface ring at the hooked fish (scale in metres). */
    setFightBeacon(pos, active, intensity = 1, scale = 1) {
      beaconActive = !!active;
      beaconIntensity = intensity;
      beaconScale = scale;
      if (pos && beaconActive) beaconGroup.position.set(pos.x, 0, pos.z);
      beaconGroup.visible = beaconActive;
      if (!beaconActive) return;
      beaconSprite.scale.set(scale * 1.9, scale * 1.9, 1);
      beaconSprite.material.opacity = 0.32 + intensity * 0.28;
      beaconPlume.scale.set(scale * 0.55, scale * 2.0, 1);
      beaconPlume.position.y = scale * 0.85;
      beaconPlume.material.opacity = 0.22 + intensity * 0.2;
      beaconRing.scale.setScalar(Math.max(0.16, scale * 0.9));
      beaconRingMat.opacity = 0.10 + intensity * 0.16;
    },
    setFightFish,
    releaseFightFish,
    updateFightFish,
    triggerLeap,
    prewarmFishPool,
    stageWarmFish,
    clearWarmFish,
    get fishPoolSize() { return fishPool.size; },
    get fightFishActive() { return !!fishActor; },
    get fishSource() { return fishActor?.source || null; },
    get fishLeapY() { return leapOffset(); },
    get beaconActive() { return beaconActive; },
    get beaconScale() { return beaconScale; },

    update(dt) {
      time += dt;
      if (fishLeapActive) {
        fishLeap += dt;
        if (fishLeap >= fishLeapDur) fishLeapActive = false;
      }
      updateSplashes(dt);
      updateAmbientJump(dt);
      if (markerActive) {
        const pulse = 1 + Math.sin(time * 4.2) * 0.12;
        const scale = (0.85 + markerIntensity * 0.5) * pulse;
        fightMarker.scale.set(scale, scale, 1);
        fightMarkerWide.scale.set(scale * (1 + Math.sin(time * 2.3) * 0.06), scale, 1);
        markerMat.opacity = 0.2 + markerIntensity * 0.14 + Math.sin(time * 6.1) * 0.05;
        fightMarkerWide.material.opacity = 0.08 + Math.sin(time * 3.4) * 0.03;
      }
      if (beaconActive) {
        const pulse = 0.82 + Math.sin(time * 3.7) * 0.18;
        const s = beaconScale * (1 + Math.sin(time * 2.9) * 0.06);
        beaconSprite.scale.set(s * 1.9 * pulse, s * 1.9 * pulse, 1);
        beaconSprite.material.opacity = (0.32 + beaconIntensity * 0.28) * pulse;
        beaconPlume.scale.set(s * 0.55, s * 2.0, 1);
        beaconPlume.position.y = s * 0.85;
        beaconPlume.material.opacity = (0.22 + beaconIntensity * 0.2) * pulse;
        beaconRing.scale.setScalar(Math.max(0.2, s * 0.9));
        beaconRing.rotation.z += dt * 0.35;
        beaconRingMat.opacity = 0.10 + beaconIntensity * 0.16;
      }
      deck.position.y = Math.sin(time * 0.5) * 0.012;
      deck.rotation.z = Math.sin(time * 0.37) * 0.0015;
    },
    updateAmbient,
    splash(pos, strength = 1) { spawnSplash(pos, strength); },
    ripple(pos, strength = 0.4) { spawnRipple(pos, strength); },
    wake(pos, strength = 0.35, minInterval = 0.42) {
      if (time - wakeClock < minInterval) return;
      wakeClock = time;
      spawnRipple(pos, strength);
    },
    jump: jumpAmbient,
    get time() { return time; },
    dispose() {
      releaseFightFish();
      clearWarmFish();
      disposeFishPool();
      if (ambientFish) { ambientRoot.remove(ambientFish); disposeObject(ambientFish); ambientFish = null; }
      root.visible = false;
    },
  };
  return scene;
}

function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}
