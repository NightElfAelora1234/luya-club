// Inset "fish-cam": a small second view of the SAME hooked-fish model,
// rendered with a dedicated near camera. The main sunset view can hide a fish
// at 30–120 m behind waves; this inset always shows the model being pulled in.
//
// The inset camera renders only a dedicated layer (2) that the fight-fish meshes
// are also on, so the water/sky/deck stay out. Lights on the same layer are
// added to the scene and are invisible to the main camera (layer 0).
//
// Performance (round 6): high/medium keep the dedicated WebGL context for the
// crispest inset. LOW reuses the main renderer into a small render target and
// blits it into a 2D canvas — this removes a whole second WebGL context from
// cold boot and lets the fight-fish shaders warm inside the main context, which
// is what used to cause both the ~8–10 s load and the first-hook stall.

import * as THREE from 'three';

export const FIGHT_CAM_LAYER = 2;
const _clearColor = new THREE.Color();
let _imageData = null;
let _imageKey = '';

export function createFightCam(engine) {
  const scene = engine.scene;
  const q = engine.qualityPreset?.fishCam || { width: 256, height: 170, dpr: 1.25, antialias: true, maxFps: 0, prewarmMeshes: 99, prewarm: true };
  const shared = engine.quality === 'low' || q.sharedContext === true;
  const canvas = document.createElement('canvas');
  canvas.className = 'fis-fishcam-canvas';
  const W = Math.max(96, Math.round(q.width || 256));
  const H = Math.max(64, Math.round(q.height || 170));
  canvas.width = W;
  canvas.height = H;

  let renderer = null;
  let ctx2d = null;
  let rt = null;
  let pixelBuf = null;

  if (shared) {
    // No second WebGL context on low: main renderer -> small RT -> 2D canvas.
    try {
      ctx2d = canvas.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, q.dpr || 1);
      const rw = Math.max(96, Math.round(W * dpr));
      const rh = Math.max(64, Math.round(H * dpr));
      rt = new THREE.WebGLRenderTarget(rw, rh, {
        type: THREE.UnsignedByteType,
        depthBuffer: true,
        samples: 0,
        colorSpace: THREE.SRGBColorSpace,
      });
      pixelBuf = new Uint8Array(rw * rh * 4);
      canvas.width = rw;
      canvas.height = rh;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    } catch (err) {
      console.warn('[fishing] fish-cam shared path unavailable', err?.message || err);
      ctx2d = null;
      rt = null;
    }
  } else {
    try {
      renderer = new THREE.WebGLRenderer({
        canvas, alpha: true, antialias: !!q.antialias, powerPreference: 'low-power',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr || 1.25));
      renderer.setSize(W, H, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
    } catch (err) {
      console.warn('[fishing] fish-cam unavailable', err?.message || err);
      renderer = null;
    }
  }

  const cam = new THREE.PerspectiveCamera(34, W / H, 0.03, 600);
  cam.layers.set(FIGHT_CAM_LAYER);
  cam.position.set(0, 1, 4);

  const key = new THREE.DirectionalLight(0xffe6c8, 2.6);
  key.position.set(2.2, 3.4, 1.6);
  key.layers.set(FIGHT_CAM_LAYER);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 1.7);
  rim.position.set(-2.2, 1.4, -2.2);
  rim.layers.set(FIGHT_CAM_LAYER);
  const amb = new THREE.AmbientLight(0xcfe6ff, 0.85);
  amb.layers.set(FIGHT_CAM_LAYER);
  scene.add(key, rim, amb);

  const _look = new THREE.Vector3();
  const _flipRow = null;
  let active = false;
  let prewarmed = false;
  let lastRender = 0;
  let lastRenderAt = 0;
  const minFrameMs = q.maxFps > 0 ? 1000 / q.maxFps : 0;

  function withCleanScene(fn) {
    const prevBg = scene.background;
    const prevFog = scene.fog;
    scene.background = null;
    scene.fog = null;
    try { fn(); } finally {
      scene.background = prevBg;
      scene.fog = prevFog;
    }
  }

  /** Render once into the inset. Shared path blits the main-renderer RT. */
  function renderOnce() {
    if (shared) {
      if (!rt || !ctx2d) return false;
      const r = engine.renderer;
      const prevTarget = r.getRenderTarget();
      const prevAlpha = r.getClearAlpha();
      r.getClearColor(_clearColor);
      const prevAutoClear = r.autoClear;
      try {
        r.setRenderTarget(rt);
        r.setClearColor(0x000000, 0);
        r.autoClear = true;
        r.clear(true, true, true);
        withCleanScene(() => r.render(scene, cam));
        r.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, pixelBuf);
        const row = rt.width * 4;
        const key = `${rt.width}x${rt.height}`;
        if (!_imageData || _imageKey !== key) {
          _imageData = new ImageData(rt.width, rt.height);
          _imageKey = key;
        }
        for (let y = 0; y < rt.height; y++) {
          _imageData.data.set(pixelBuf.subarray((rt.height - 1 - y) * row, (rt.height - y) * row), y * row);
        }
        ctx2d.putImageData(_imageData, 0, 0);
        return true;
      } catch (err) {
        console.warn('[fishing] fish-cam shared render failed', err?.message || err);
        return false;
      } finally {
        r.setRenderTarget(prevTarget);
        r.setClearColor(_clearColor, prevAlpha);
        r.autoClear = prevAutoClear;
      }
    }
    if (!renderer) return false;
    withCleanScene(() => renderer.render(scene, cam));
    return true;
  }

  function prewarm(fishPos) {
    if (!renderer && !(shared && rt)) return false;
    const p = fishPos || new THREE.Vector3(0, 0.4, -7.5);
    cam.position.set(p.x + 1.9, p.y + 1.15, p.z + 4.4);
    cam.lookAt(p.x, p.y, p.z);
    // On the shared low-tier path the RT render compiles into the main
    // renderer's program cache; prewarming every staged fighter there is cheap
    // and removes the first-hook shader compile. The dedicated high/medium
    // context still limits itself to a few meshes to keep boot short.
    const limit = shared ? 99 : (q.prewarmMeshes || 99);
    const hidden = [];
    if (limit < 90) {
      let seen = 0;
      scene.traverse((o) => {
        if (!o.isMesh || !o.layers || !o.layers.test(cam.layers)) return;
        if (o.visible === false) return;
        seen++;
        if (seen > limit) { hidden.push(o); o.visible = false; }
      });
    }
    try {
      prewarmed = renderOnce();
    } finally {
      for (const o of hidden) o.visible = true;
    }
    return prewarmed;
  }

  function resize(w, h) {
    const cw = Math.max(64, Math.round(w));
    const ch = Math.max(48, Math.round(h));
    cam.aspect = cw / ch;
    cam.updateProjectionMatrix();
    if (renderer) {
      renderer.setSize(cw, ch, false);
    } else if (rt) {
      const dpr = Math.min(window.devicePixelRatio || 1, q.dpr || 1);
      rt.setSize(Math.round(cw * dpr), Math.round(ch * dpr));
      canvas.width = rt.width;
      canvas.height = rt.height;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      pixelBuf = new Uint8Array(rt.width * rt.height * 4);
    }
  }

  /**
   * Render a close view of the fish at fishPos. visualLen is the displayed
   * model length in metres (real length × readability scale), so the inset
   * automatically keeps the same apparent size at 4 m or 116 m.
   */
  function render(fishPos, visualLen, mainCamPos, dt) {
    if (!active || (!renderer && !(shared && rt)) || !fishPos) return;
    // Low tiers render the inset at ~20 fps; the main view still runs at full rate.
    const now = performance.now();
    if (minFrameMs > 0 && now - lastRenderAt < minFrameMs) return;
    lastRenderAt = now;
    const len = Math.max(0.22, Number(visualLen) || 0.5);
    const dx = fishPos.x - mainCamPos.x;
    const dz = fishPos.z - mainCamPos.z;
    const h = Math.hypot(dx, dz) || 1;
    const fx = dx / h;
    const fz = dz / h;
    const dist = Math.max(1.25, len * 1.55 + 0.65);
    const side = len * 0.32 + 0.12;
    _look.set(fishPos.x, fishPos.y + 0.03, fishPos.z);
    cam.position.set(
      fishPos.x - fx * dist + fz * side,
      fishPos.y + Math.max(0.24, len * 0.38),
      fishPos.z - fz * dist - fx * side,
    );
    cam.lookAt(_look);
    const ok = renderOnce();
    lastRender = ok ? 1 : lastRender;
    return ok ? { dist } : undefined;
  }

  return {
    canvas,
    get renderer() { return renderer; },
    get sharedContext() { return shared; },
    get renderTarget() { return rt; },
    camera: cam,
    prewarm,
    resize,
    render,
    setActive(v) { active = !!v; },
    get active() { return active; },
    get available() { return shared ? !!rt : !!renderer; },
    get prewarmed() { return prewarmed; },
    get quality() { return { width: W, height: H, dpr: q.dpr, antialias: !!q.antialias, maxFps: q.maxFps, prewarmMeshes: q.prewarmMeshes, shared }; },
    hasRendered() { return lastRender > 0; },
    dispose() {
      scene.remove(key, rim, amb);
      try { renderer?.dispose(); } catch (e) { /* noop */ }
      try { rt?.dispose(); } catch (e) { /* noop */ }
    },
  };
}
