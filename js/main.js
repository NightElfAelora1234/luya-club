import { engine, THREE } from './core/engine.js';
import { app } from './core/state.js';
import { WORLD, BEATS } from './core/world.js';
import { damp } from './core/util.js';
import { createSky } from './world/sky.js';
import { createOcean } from './world/ocean.js';
import { createAtmosphere } from './world/atmosphere.js';
import { createCameraRig } from './world/camera.js';
import { createSign } from './world/logo.js';
import { createSeafloor } from './world/seafloor.js';
import { createFishSystem } from './world/fish/index.js';
import { createAmbience } from './world/ambience.js';
import { createTraffic } from './world/traffic.js';
import { createShop } from './world/shop.js';
import { createFishing } from './game/fishing.js';
import { createUI } from './ui/dom.js';
import { createScroll } from './ui/scroll.js';
import { createCampaign } from './ui/campaign.js';

const params = new URLSearchParams(location.search);
const ui = createUI();
const scroll = createScroll();

let sky, ocean, atmosphere, seafloor, sign, fish, ambience, shop, fishing, rig, traffic, campaign;
const ctx = {};
const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const waterHit = new THREE.Vector3();
let hudRetry = 0;

function setBodyMode(mode) {
  document.body.classList.remove('mode-dive', 'mode-shop', 'mode-fishing', 'mode-rebound');
  document.body.classList.add(`mode-${mode}`);
}
setBodyMode('dive');

function enterShop({ quiet = false } = {}) {
  if (app.mode === 'shop') return;
  app.setMode('shop');
  scroll.reset();
  scroll.lock(true);
  ui.rodPrompt(false);
  seafloor?.setHover(false);
  document.body.style.cursor = '';
  const reveal = () => {
    shop?.show();
    rig?.enterShop();
  };
  if (quiet) {
    reveal();
    return;
  }
  // Cover the last cut before the rack appears. The rack used to pop in on the
  // same frame the rebound reached the water; hold a full opaque curtain for a
  // beat, then reveal the pontoon underneath it.
  ui.curtain(1, 300, 720);
  ui.flash(0.35);
  setTimeout(reveal, 160);
}

function enterFishing(rodSpec) {
  if (app.mode === 'fishing') return;
  app.setMode('fishing');
  scroll.lock(true);
  shop?.hide();
  ui.rodPrompt(false);
  document.body.style.cursor = '';
  fishing?.enter(rodSpec || { id: 'default', name: '测试竿' });
  ui.wash(0.35, 700);
}

function exitFishing() {
  if (app.mode !== 'fishing') return;
  fishing?.exit();
  app.setMode('shop');
  scroll.lock(true);
  scroll.reset();
  shop?.show();
  rig?.enterShop();
  ui.wash(0.35, 700);
}

function resetDive() {
  campaign?.reset?.();
  fishing?.exit();
  shop?.hide();
  app.setMode('dive');
  scroll.lock(false);
  scroll.reset();
  rig?.reset();
  rig?.snapProgress(0);
  seafloor?.setHover(false);
  sign?.reset();
  ui.rodPrompt(false);
  app.depth = 0;
  app.cameraDepth = 0;
  document.body.style.cursor = '';
  ui.wash(0.5, 800);
}

function startRebound() {
  if (app.mode !== 'dive') return;
  scroll.lock(true);
  ui.rodPrompt(false);
  seafloor?.setHover(false);
  document.body.style.cursor = '';
  app.setMode('rebound');
  rig.startRebound(() => {
    enterShop();
  });
}

app.actions = {
  enterShop,
  enterFishing,
  exitFishing,
  resetDive,
  returnToSurface: startRebound,
  scrollTop() {
    if (app.mode === 'dive') window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (app.mode === 'shop') ui.toast('已在水面 · 试一支竿，或重新下潜');
    else ui.toast('返回竿阵后可重新下潜');
  },
  openGear() {
    if (app.mode === 'fishing') fishing?.toggleGear?.();
    else if (app.mode === 'shop') ui.toast('点选一支竿，进入试钓');
    else ui.toast('潜到海床，找那支插在沙里的鱼竿');
  },
  openLog() {
    ui.toast('航海日志 · 整理中');
  },
};

app.bus.on('mode', setBodyMode);

app.bus.on('surface:cross', (dir) => {
  ui.wash(dir === 'down' ? 0.72 : 0.95, dir === 'down' ? 520 : 950);
  ui.flash(dir === 'down' ? 0.45 : 0.8);
  app.bus.emit('audio:surface', dir);
});

app.bus.on('sign:splash', () => {
  app.bus.emit('audio:splash');
});

const _rodScreen = { x: 0, y: 0, visible: false };
function updateRodInteraction(dt) {
  if (app.mode !== 'dive' || !seafloor) return;
  const nearFloor = app.progress > 0.945 && app.cameraDepth > 80;
  ui.rodPrompt(nearFloor);
  if (!nearFloor) {
    seafloor.setHover(false);
    document.body.style.cursor = '';
    return;
  }

  let hovered = false;
  if (app.pointer.inside) {
    const ray = engine.pickRay();
    hovered = seafloor.raycast(ray);
    if (!hovered) {
      // forgiving screen-space hotspot around the rod tip
      const tipWorld = seafloor.rod.localToWorld(new engine.camera.position.constructor(0, 2.52, 0.1));
      const s = engine.screenFromWorld(tipWorld);
      const dx = app.pointer.x - s.x;
      const dy = app.pointer.y - s.y;
      hovered = Math.hypot(dx, dy) < 190;
    }
  }
  seafloor.setHover(hovered);
  document.body.style.cursor = hovered ? 'pointer' : '';

  if (hovered && app.pointer.justDown) {
    app.pointer.justDown = false;
    startRebound();
  }
}

const _warmSaved = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 52 };

// Compile/upload every scene the visitor can reach before the loader lifts.
// This is what removes the hitch when the seafloor rod transitions into the
// rod-rack scene (and when the fishing rig is first shown).
async function prewarmScenes() {
  const camera = engine.camera;
  _warmSaved.pos.copy(camera.position);
  _warmSaved.quat.copy(camera.quaternion);
  _warmSaved.fov = camera.fov;
  const rt = new THREE.WebGLRenderTarget(320, 180, { type: THREE.HalfFloatType });
  const warm = () => {
    // Use the real composer pipeline (MSAA + grade + output) so the first
    // visible frame does not compile a missed variant. Loader covers the screen.
    engine.renderer.setRenderTarget(null);
    engine.renderer.compile(engine.scene, camera);
    engine.composer.render();
  };
  // Keep the small target for a direct render of isolated groups (unused after
  // switching to composer warm, but kept for low-cost diagnostics).
  const warmDirect = () => {
    engine.renderer.setRenderTarget(rt);
    engine.renderer.compile(engine.scene, camera);
    engine.renderer.render(engine.scene, camera);
    engine.renderer.setRenderTarget(null);
  };

  // Dive zones: force fish/seafloor/ambience groups visible and render a cheap
  // frame per zone so their shaders and geometry are uploaded now.
  try {
    seafloor.group.visible = true;
    fish.setVisible(true);
    for (const school of fish.schools || []) {
      if (school.mesh) school.mesh.visible = true;
    }
    for (const p of [0.2, 0.62, 1]) {
      rig.snapProgress(p);
      app.cameraDepth = Math.max(0, -camera.position.y);
      seafloor.update(0.016);
      warmDirect();
    }
  } catch (err) {
    console.warn('[lure-club] prewarm dive pass', err);
  }

  // Rod rack. Hide dive-only lights (seafloor spots/points) first: their
  // presence changes every shop material's light-count shader variant.
  try {
    seafloor.group.visible = false;
    // Show the shop-mode surface pods and pump one fish update so their
    // materials are compiled in the same light set as the rack.
    fish.setVisible(true);
    fish.setAmbientMode?.('shop');
    fish.update(0.016, { mode: 'shop', underwater: false, depth: 0 });
    sign.group.visible = false;
    shop.show();
    rig.enterShop();
    // Run the reveal forward so every reflection/puddle/highlight variant has
    // been created and compiled before the visitor sees the rack.
    for (let i = 0; i < 45; i++) shop.update(0.016);
    const callsBefore = engine.renderer.info.render.calls;
    const t0 = performance.now();
    warm();
    const callsAfter = engine.renderer.info.render.calls;
    window.__PREWARM_SHOP = {
      visible: shop.visible,
      callsBefore,
      callsAfter,
      ms: +(performance.now() - t0).toFixed(1),
      camera: camera.position.toArray().map((v) => +v.toFixed(1)),
    };
    shop.hide();
  } catch (err) {
    window.__PREWARM_SHOP = { error: String(err) };
    console.warn('[lure-club] prewarm shop pass', err);
  }

  // Fishing rig + bag models.
  try {
    fish.setVisible(true);
    fish.setAmbientMode?.('fishing');
    fish.update(0.016, { mode: 'fishing', underwater: false, depth: 0 });
    if (fishing.prewarm) {
      await fishing.prewarm();
    } else {
      fishing.enter({ id: 'prewarm', name: 'PREWARM', brand: 'LUYA CLUB' });
      fishing.update(0.016);
      warm();
      fishing.exit();
    }
  } catch (err) {
    console.warn('[lure-club] prewarm fishing pass', err);
  }

  // Restore the surface pose and visibility.
  try { shop.hide(); } catch (err) { /* noop */ }
  try { fishing.exit(); } catch (err) { /* noop */ }
  try { traffic.prewarm?.(); } catch (err) { /* noop */ }
  fish.setVisible(true);
  fish.setAmbientMode?.(app.mode);
  fish.update(0.016, { mode: app.mode, underwater: false, depth: 0 });
  rig.reset();
  rig.snapProgress(0);
  app.progress = 0;
  app.progressTarget = 0;
  app.depth = 0;
  app.cameraDepth = 0;
  camera.position.copy(_warmSaved.pos);
  camera.quaternion.copy(_warmSaved.quat);
  camera.fov = _warmSaved.fov;
  camera.updateProjectionMatrix();
  engine.renderer.setRenderTarget(null);
  rt.dispose();
  seafloor.update(0.016);
  fish.update(0.016, { mode: 'dive', underwater: false, depth: 0 });
}

async function boot() {  try {
    ui.setLoading(0.06, '正在唤醒渲染器 · INITIALISING');
    engine.init();
    ui.setLoading(0.18, '正在校准海面 · CALIBRATING SURFACE');
    await new Promise((r) => requestAnimationFrame(() => r()));
    sky = createSky(engine);
    ui.setLoading(0.34, '正在铺开南海 · BUILDING SWELL');
    await new Promise((r) => requestAnimationFrame(() => r()));
    ocean = createOcean(engine, sky);
    atmosphere = createAtmosphere(engine);
    rig = createCameraRig(engine);
    ui.setLoading(0.52, '正在下沉光线 · REFRACTING LIGHT');
    await new Promise((r) => requestAnimationFrame(() => r()));
    sign = createSign(engine, ocean);
    seafloor = createSeafloor(engine);
    app.actions.enterShopDebug = enterShop;

    ctx.engine = engine;
    ctx.app = app;
    ctx.ui = ui;
    ctx.scroll = scroll;
    ctx.ocean = ocean;
    ctx.sky = sky;
    ctx.atmosphere = atmosphere;
    ctx.rig = rig;
    ctx.sign = sign;
    ctx.seafloor = seafloor;

    campaign = createCampaign(engine, app, ctx);
    ctx.campaign = campaign;

    fish = createFishSystem(engine, app, ctx);
    ambience = createAmbience(engine, app, ctx);
    traffic = createTraffic(engine, app, ctx);
    ctx.fish = fish;
    ctx.ambience = ambience;
    ctx.traffic = traffic;
    const setFishMode = (m) => fish?.setAmbientMode?.(m);
    app.bus.on('mode', setFishMode);
    setFishMode(app.mode);

    ui.setLoading(0.72, '正在召集鱼群 · GATHERING THE SCHOOL');
    await new Promise((r) => requestAnimationFrame(() => r()));
    try {
      shop = createShop(engine, app, ctx);
    } catch (err) {
      console.error('[lure-club] shop init failed', err);
      shop = { show() {}, hide() {}, update() {}, visible: false, initError: String(err) };
    }
    try {
      fishing = createFishing(engine, app, ctx);
    } catch (err) {
      console.error('[lure-club] fishing init failed', err);
      fishing = { active: false, enter() {}, exit() {}, update() {}, toggleGear() {}, initError: String(err) };
    }
    ctx.shop = shop;
    ctx.fishing = fishing;

    ui.setLoading(0.92, '正在预热场景 · PREWARMING');
    try {
      await prewarmScenes();
    } catch (err) {
      console.warn('[lure-club] prewarm skipped', err);
    }

    ui.setLoading(0.99, '正在抛下第一竿 · READY');
    engine.renderer.compile(engine.scene, engine.camera);
    engine.composer.render();
    await new Promise((r) => setTimeout(r, 260));

    ui.setLoading(1);
    ui.hideLoader();
    app.loaded = true;

    // hot surface state
    app.progress = 0;
    app.progressTarget = 0;
    app.depth = 0;
    app.cameraDepth = 0;
    window.scrollTo(0, 0);

    // deep-link / QA entry points
    const mode = params.get('mode');
    if (params.get('p')) {
      const p = Math.max(0, Math.min(1, parseFloat(params.get('p')) || 0));
      scroll.setProgress(p, true);
      rig.snapProgress(p);
      app.depth = Math.max(0, -engine.camera.position.y);
    }
    if (mode === 'shop') {
      enterShop({ quiet: true });
      rig.enterShop();
      rig.update(0.016);
    } else if (mode === 'fishing') {
      enterShop({ quiet: true });
      enterFishing({ id: 'qa', name: '礁牙 68ML' });
    } else if (params.get('nofish') === '1') {
      fish.setVisible?.(false);
    }

    // first real frame
    requestAnimationFrame(loop);

    window.__APP = {
      app, engine, rig, ocean, sky, atmosphere, sign, seafloor, fish, ambience, traffic, shop, fishing, ui, scroll, campaign, WORLD,
      enterShop, enterFishing, exitFishing, resetDive, startRebound, setBodyMode,
      jumpTo(p) {
        campaign?.reset?.();
        app.setMode('dive');
        scroll.lock(false);
        shop?.hide();
        fishing?.exit();
        scroll.setProgress(p, true);
        rig?.snapProgress(p);
        app.depth = Math.max(0, -engine.camera.position.y);
      },
      get ready() { return !!app.loaded; },
    };
    window.__READY = true;
    console.log('[lure-club] ready', { three: engine.renderer.info.render, p: app.progress });
  } catch (err) {
    console.error('[lure-club] boot failed', err);
    ui.setLoading(1, '加载失败 · 请刷新');
  }
}

let last = performance.now();
let fpsSmooth = 60;
let fpsAccum = 0;
let fpsFrames = 0;

function loop(now) {
  requestAnimationFrame(loop);
  if (window.__PAUSE) return;
  try {
    frame(now);
  } catch (err) {
    if (!window.__LOOP_ERROR) {
      window.__LOOP_ERROR = { message: String(err && err.message || err), stack: String(err && err.stack || '') };
      console.error('[lure-club] loop error', err);
    }
  }
}

function frame(now) {
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(Math.max(rawDt, 0.0001), 0.05);
  app.dt = dt;
  app.time += dt;
  app.frame++;

  // fps meter
  fpsAccum += rawDt;
  fpsFrames++;
  if (fpsAccum > 0.5) {
    fpsSmooth = fpsFrames / fpsAccum;
    fpsAccum = 0;
    fpsFrames = 0;
  }
  engine.fps = fpsSmooth;
  engine._adaptiveTimer += dt;
  if (engine._adaptiveTimer > 2.5 && fpsSmooth < 42) {
    engine._adaptiveTimer = 0;
    if (engine._adaptiveStep < 2) {
      engine._adaptiveStep++;
      if (engine._adaptiveStep === 1) {
        engine.dpr = Math.min(engine.dpr, 1.25);
        engine.renderer.setPixelRatio(engine.dpr);
        engine.resize();
      } else {
        engine.quality = app.quality = 'low';
        engine.bloom.enabled = false;
        app.bus.emit('quality:low');
      }
    }
  } else if (engine._adaptiveTimer > 2.5) {
    engine._adaptiveTimer = 0;
  }

  const campaignPaused = campaign?.isPageOpen?.() === true;
  if (!campaignPaused) {
    scroll.update(dt);
    rig.update(dt);

    app.cameraDepth = Math.max(0, -engine.camera.position.y);
    app.depth = damp(app.depth, app.cameraDepth, 9, dt);
  }

  atmosphere.update(app.cameraDepth);
  const underwater = engine.camera.position.y < 0.02;
  sky.update(dt, engine.camera.position, underwater);

  // The sea surface opens a clear-water window under the cursor so the fish
  // that are drawn to it are visible from above (the water is otherwise opaque).
  if (app.mode === 'dive' && app.cameraDepth < 0.3 && app.pointer.inside && app.progress < 0.24) {
    const ray = engine.pickRay();
    if (ray.ray.intersectPlane(waterPlane, waterHit)) ocean.setPointer(waterHit.x, waterHit.z, true);
    else ocean.setPointer(0, 0, false);
  } else {
    ocean.setPointer(0, 0, false);
  }
  ocean.setCalm(app.mode === 'shop' || app.mode === 'fishing' ? 1 : 0, WORLD.shop.center.x, WORLD.shop.center.z);

  ocean.setFog(atmosphere.fogColor, engine.scene.fog.density);
  ocean.update(dt, app.cameraDepth);

  if (app.mode === 'shop') shop.update(dt);
  if (app.mode === 'fishing') fishing.update(dt);

  campaign?.update(dt);
  sign.update(dt);
  seafloor.update(dt);
  fish.update(dt, { mode: app.mode, underwater, depth: app.cameraDepth });
  ambience.update(dt, { underwater, depth: app.cameraDepth });
  traffic.update(dt, { mode: app.mode, underwater, depth: app.cameraDepth });

  if (app.mode === 'shop') shop.update(dt);
  if (app.mode === 'fishing') fishing.update(dt);

  engine.grade.uniforms.uTime.value = app.time;
  engine.grade.uniforms.uUnderwater.value = damp(
    engine.grade.uniforms.uUnderwater.value,
    underwater ? 1 : 0,
    3, dt,
  );

  if (!campaignPaused) updateRodInteraction(dt);
  ui.update();
  engine.render();

  app.pointer.justDown = false;
  app.pointer.justUp = false;
  app.pointer.deltaX = 0;
  app.pointer.deltaY = 0;
}

window.addEventListener('error', (e) => {
  console.error('[lure-club] window error', e.message, e.filename, e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[lure-club] unhandled rejection', e.reason);
});

boot();
