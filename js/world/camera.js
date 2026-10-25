import * as THREE from 'three';
import { app } from '../core/state.js';
import { CAMERA_KEYS, WORLD } from '../core/world.js';
import { clamp, damp, easeInOutCubic, easeInOutQuint, smoothstep } from '../core/util.js';

const posCurve = new THREE.CatmullRomCurve3(
  CAMERA_KEYS.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal', 0.5,
);
const lookCurve = new THREE.CatmullRomCurve3(
  CAMERA_KEYS.map((k) => new THREE.Vector3(...k.look)), false, 'centripetal', 0.5,
);

const SHOP_CENTER = WORLD.shop.center;
const SHOP_R = WORLD.shop.cameraRadius;
const SHOP_H = WORLD.shop.cameraHeight;

const shopPos = new THREE.Vector3();
const shopLook = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _prev = new THREE.Vector3();

export function createCameraRig(engine) {
  const camera = engine.camera;
  let time = 0;
  let lastY = camera.position.y;
  let lastProgress = 0;
  let fov = 52;
  let rebound = null;
  let shopTime = 0;
  let shopBlend = 0;
  let lastCross = -99;

  function progressToCurveU(p) {
    const n = CAMERA_KEYS.length;
    let i = 0;
    while (i < n - 2 && p > CAMERA_KEYS[i + 1].p) i++;
    const a = CAMERA_KEYS[i], b = CAMERA_KEYS[i + 1];
    const k = clamp((p - a.p) / Math.max(1e-6, b.p - a.p));
    return { u: (i + k) / (n - 1), i, k };
  }

  function sampleDive(p, dt = 1 / 60) {
    const { i, k } = progressToCurveU(clamp(p));
    const e = easeInOutCubic(k) * 0.35 + k * 0.65;
    const uu = (i + e) / (CAMERA_KEYS.length - 1);
    posCurve.getPoint(uu, _pos);
    lookCurve.getPoint(uu, _look);
    // handheld life: stronger above water, gentle drift below
    const underwater = _pos.y < 0;
    const amp = underwater ? 0.05 : 0.075;
    _pos.x += Math.sin(time * 0.31) * amp + Math.sin(time * 0.73) * amp * 0.35;
    _pos.y += Math.sin(time * 0.57) * amp * 0.55 + Math.sin(time * 1.13) * amp * 0.18;
    _look.x += Math.sin(time * 0.28 + 1.3) * amp * 1.4;
    _look.y += Math.sin(time * 0.46 + 0.4) * amp * 0.9;
    camera.position.copy(_pos);
    camera.lookAt(_look);
    const targetFov = underwater ? 58 : 52;
    fov = damp(fov, targetFov, 2.2, dt);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.rotation.z += Math.sin(time * 0.22) * 0.006;
  }

  function applyShopPose(t) {
    const angle = WORLD.shop.orbitStart + t * WORLD.shop.orbitSpeed;
    shopPos.set(
      SHOP_CENTER.x + Math.sin(angle) * SHOP_R,
      SHOP_CENTER.y + SHOP_H + Math.sin(t * 0.5) * 0.06,
      SHOP_CENTER.z + Math.cos(angle) * SHOP_R,
    );
    shopLook.set(SHOP_CENTER.x, SHOP_CENTER.y + 1.45, SHOP_CENTER.z);
    camera.position.copy(shopPos);
    camera.lookAt(shopLook);
    camera.fov = damp(camera.fov, 46, 1.6, 1 / 60);
    camera.updateProjectionMatrix();
  }

  const rig = {
    camera,
    get time() { return time; },
    update(dt) {
      time += dt;
      const flatDt = Math.min(dt, 0.05);
      app.cameraDepth = Math.max(0, -camera.position.y);

      if (app.mode === 'fishing') {
        return;
      }

      if (app.mode === 'rebound' && rebound) {
        rebound.t += flatDt;
        const t = clamp(rebound.t / rebound.dur);
        const e = easeInOutQuint(t);
        // push-in hold at the seabed, then a violent ascent
        const push = smoothstep(0, 0.14, t) * (1 - smoothstep(0.14, 0.32, t));
        camera.position.set(
          THREE.MathUtils.lerp(rebound.from.x, rebound.to.x, e),
          THREE.MathUtils.lerp(rebound.from.y, rebound.to.y, e) + Math.sin(t * Math.PI) * 1.4,
          THREE.MathUtils.lerp(rebound.from.z, rebound.to.z, e) + push * 1.7,
        );
        const lookT = easeInOutCubic(smoothstep(0.02, 0.75, t));
        _look.set(
          THREE.MathUtils.lerp(rebound.fromLook.x, rebound.toLook.x, lookT),
          THREE.MathUtils.lerp(rebound.fromLook.y, rebound.toLook.y, lookT),
          THREE.MathUtils.lerp(rebound.fromLook.z, rebound.toLook.z, lookT),
        );
        camera.lookAt(_look);
        const fovTarget = 50 + Math.sin(clamp(t) * Math.PI) * 20 + (1 - t) * 6;
        camera.fov = fovTarget;
        camera.updateProjectionMatrix();
        camera.rotation.z += Math.sin(time * 9.0) * 0.005 * (1 - t);
        engine.grade.uniforms.uRadial.value = Math.sin(t * Math.PI) * 0.9;
        if (lastY < 0 && camera.position.y >= 0) {
          app.bus.emit('surface:cross', 'up');
        }
        lastY = camera.position.y;
        if (t >= 1 && !rebound.done) {
          rebound.done = true;
          engine.grade.uniforms.uRadial.value = 0;
          rebound.onDone?.();
        }
        return;
      }

      if (app.mode === 'shop') {
        shopBlend = damp(shopBlend, 1, 2.0, flatDt);
        shopTime += flatDt;
        applyShopPose(shopTime);
        engine.grade.uniforms.uRadial.value = 0;
        return;
      }

      // dive
      engine.grade.uniforms.uRadial.value = 0;
      const p = app.progress;
      const prevY = lastY;
      sampleDive(p, flatDt);
      lastY = camera.position.y;
      // exact edge detection on the actual camera path; a cooldown keeps the
      // wash/flash from retriggering while the lens skims the waterline.
      if (app.time - lastCross > 0.9) {
        if (prevY >= 0 && lastY < 0) {
          lastCross = app.time;
          app.bus.emit('surface:cross', 'down');
        } else if (prevY < 0 && lastY >= 0) {
          lastCross = app.time;
          app.bus.emit('surface:cross', 'up');
        }
      }
      app.cameraDepth = Math.max(0, -camera.position.y);
      lastProgress = p;
    },
    enterShop() {
      shopTime = 0;
      shopBlend = 0;
      applyShopPose(0);
    },
    startRebound(onDone) {
      const from = camera.position.clone();
      const fromLook = new THREE.Vector3(0.4, -94.95, -6.4);
      const angle = WORLD.shop.orbitStart;
      const to = new THREE.Vector3(
        SHOP_CENTER.x + Math.sin(angle) * SHOP_R,
        SHOP_CENTER.y + SHOP_H,
        SHOP_CENTER.z + Math.cos(angle) * SHOP_R,
      );
      const toLook = new THREE.Vector3(SHOP_CENTER.x, SHOP_CENTER.y + 1.45, SHOP_CENTER.z);
      rebound = { t: 0, dur: 4.15, from, fromLook, to, toLook, onDone, done: false };
      app.setMode('rebound');
      app.bus.emit('rebound:start');
    },
    snapProgress(p) {
      app.progress = p;
      app.progressTarget = p;
      sampleDive(p, 1 / 60);
      lastY = camera.position.y;
      app.cameraDepth = Math.max(0, -camera.position.y);
    },
    shopPoseAtStart() {
      applyShopPose(0);
    },
    reset() {
      fov = 52;
      shopBlend = 0;
      shopTime = 0;
      rebound = null;
      lastY = 3.7;
      lastCross = -99;
      engine.grade.uniforms.uRadial.value = 0;
    },
  };

  function sampleDiveY(p) {
    return sampleCameraPathY(p);
  }

  return rig;
}

const _cp = new THREE.Vector3();
const _cl = new THREE.Vector3();
function sampleCameraPathY(p) {
  const n = CAMERA_KEYS.length;
  let i = 0;
  while (i < n - 2 && p > CAMERA_KEYS[i + 1].p) i++;
  const a = CAMERA_KEYS[i], b = CAMERA_KEYS[i + 1];
  const k = clamp((p - a.p) / Math.max(1e-6, b.p - a.p));
  return a.pos[1] + (b.pos[1] - a.pos[1]) * k;
}
