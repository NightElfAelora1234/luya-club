// 路亚俱乐部 · 鱼护 (fish bag)
//
// Session-persistent creel + an isolated 480² studio turntable. The turntable
// gets its own WebGL renderer so the main composer never has to know about it,
// and the canvas is only attached to the DOM while the bag panel is open.
// Kept fish are stored for the whole page session (module scope), so leaving
// fishing for the rod shop and coming back keeps your bag.

import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';
import { createPreviewFactory } from './fish-preview.js';

const session = [];
let seq = 0;

export function addToBag(entry) {
  if (!entry) return null;
  seq += 1;
  const item = {
    key: `bag-${seq}`,
    species: entry.species || null,
    lengthCm: Number(entry.lengthCm) || 0,
    weightKg: Number(entry.weightKg) || 0,
    lure: entry.lure || null,
    leader: entry.leader || null,
    wear: Number(entry.wear) || 0,
    when: Date.now(),
  };
  session.push(item);
  return item;
}

export function bagItems() { return session; }
/** Remove one kept fish permanently (live bait / discard). */
export function takeBagItem(index) {
  const i = Number(index) | 0;
  if (i < 0 || i >= session.length) return null;
  const [item] = session.splice(i, 1);
  return item || null;
}
export function bagCount() { return session.length; }
export function clearBag() { session.length = 0; seq = 0; }
export function bagTotalKg() {
  return session.reduce((sum, it) => sum + (it.weightKg || 0), 0);
}

// ---------------------------------------------------------------------------
// Turntable
// ---------------------------------------------------------------------------

const SIZE = 480;

function makePedestalTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 8, 128, 128, 126);
  grd.addColorStop(0, 'rgba(240,232,208,0.30)');
  grd.addColorStop(0.55, 'rgba(200,178,138,0.12)');
  grd.addColorStop(1, 'rgba(200,178,138,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createFishTurntable(ctx = {}) {
  const previews = createPreviewFactory(ctx);
  let renderer = null;
  let scene = null;
  let camera = null;
  let holder = null;
  let pedestal = null;
  let actor = null;
  let item = null;
  let yaw = 0.7;
  let targetYaw = 0.7;
  let dragging = false;
  let idle = 0;
  let open = false;
  let canvas = null;
  let time = 0;
  let lastWarn = 0;

  function ensure() {
    if (renderer) return true;
    try {
      canvas = document.createElement('canvas');
      canvas.className = 'fis-bag-canvas';
      canvas.width = SIZE;
      canvas.height = SIZE;
      renderer = new THREE.WebGLRenderer({
        canvas, antialias: true, alpha: true, powerPreference: 'low-power',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(SIZE, SIZE, false);
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(33, 1, 0.01, 30);
      holder = new THREE.Group();
      scene.add(holder);

      // a soft studio plinth so the fish is not floating in a void
      const pedGeo = new THREE.CircleGeometry(1.0, 48);
      const pedMat = new THREE.MeshBasicMaterial({
        map: makePedestalTexture(), transparent: true, depthWrite: false,
        side: THREE.DoubleSide,
      });
      pedestal = new THREE.Mesh(pedGeo, pedMat);
      pedestal.rotation.x = -Math.PI * 0.5;
      pedestal.position.y = -0.02;
      scene.add(pedestal);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.0022, 6, 80),
        new THREE.MeshBasicMaterial({ color: 0xd9a86c, transparent: true, opacity: 0.5 }),
      );
      ring.rotation.x = Math.PI * 0.5;
      ring.position.y = -0.019;
      scene.add(ring);
      pedestal.userData.ring = ring;
      return true;
    } catch (err) {
      console.warn('[fishing] bag turntable unavailable', err?.message || err);
      renderer = null;
      return false;
    }
  }

  function clearActor() {
    if (!actor) return;
    try { holder.remove(actor.root); } catch (e) { /* noop */ }
    try { actor.dispose(); } catch (e) { /* noop */ }
    actor = null;
  }

  function frameFor(actorIn) {
    // Fit the fish into the square stage: its long axis may be 1.2× the fork
    // length once the caudal fin is included.
    let box = new THREE.Box3();
    try { box.setFromObject(actorIn.root); } catch (e) { /* noop */ }
    const size = box.getSize(new THREE.Vector3());
    const len = Math.max(0.12, size.z || Number(actorIn.lengthCm) / 100 || 0.5);
    const height = Math.max(0.08, size.y || len * 0.3);
    const span = Math.max(len, height * 1.8);
    const d = clamp(span * 1.42, 0.8, 10);
    const eye = clamp(height * 1.05, 0.05, 0.55);
    camera.position.set(d * 0.15, eye * 0.85 + 0.04, d);
    camera.lookAt(0, -0.04, 0);
    pedestal.scale.setScalar(clamp(len * 0.78, 0.3, 3.2));
    if (pedestal.userData.ring) pedestal.userData.ring.scale.setScalar(clamp(len * 0.78, 0.3, 3.2) * 0.92);
    pedestal.position.y = -Math.max(0.03, height * 0.62);
    if (pedestal.userData.ring) pedestal.userData.ring.position.y = pedestal.position.y + 0.001;
    holder.position.y = 0;
  }

  function createActor(entry) {
    clearActor();
    if (!entry?.species) return null;
    actor = previews.create(entry.species, {
      lengthCm: entry.lengthCm,
      weightKg: entry.weightKg,
      detail: 3,
      animate: true,
    });
    try { actor.preview?.setStudioLighting?.(true); } catch (e) { /* noop */ }
    holder.add(actor.root);
    frameFor(actor);
    yaw = 0.95;
    targetYaw = yaw;
    return actor;
  }

  function show(entry) {
    if (!ensure()) return null;
    open = true;
    item = entry || null;
    createActor(entry);
    return api;
  }

  function hide() {
    open = false;
    clearActor();
    item = null;
  }

  function select(entry) {
    if (!open) return null;
    item = entry;
    createActor(entry);
    return api;
  }

  function rotate(dx) {
    if (!open) return;
    targetYaw += dx * 0.011;
    idle = 0;
  }

  function update(dt) {
    if (!open || !renderer) return;
    time += dt;
    if (dragging) idle = 0;
    else idle += dt;
    if (idle > 1.6) targetYaw += dt * 0.16;   // gentle showcase drift
    yaw = damp(yaw, targetYaw, 12, dt);
    if (actor) {
      actor.root.rotation.y = yaw;
      actor.update(dt);
    }
    holder.position.y = Math.sin(time * 0.6) * 0.004;
    try {
      renderer.render(scene, camera);
    } catch (err) {
      if (performance.now() - lastWarn > 4000) {
        lastWarn = performance.now();
        console.warn('[fishing] bag render failed', err?.message || err);
      }
    }
  }

  function prewarm() {
    if (!ensure()) return false;
    // Compile the fish skin + studio lights once so opening the bag never
    // stalls on a shader build.
    const dummy = previews.create(
      ctx?.fish?.species?.[0] || { id: 'scad', nameCn: '蓝圆鲹', nameEn: 'ROUND SCAD', latin: 'Decapterus maruadsi', sizeCm: [18, 34], weightKg: [0.15, 0.8], colors: {} },
      { lengthCm: 30, detail: 3, animate: false },
    );
    try { dummy.preview?.setStudioLighting?.(true); } catch (e) { /* noop */ }
    holder.add(dummy.root);
    try { renderer.compile(scene, camera); } catch (e) { /* noop */ }
    try { renderer.render(scene, camera); } catch (e) { /* noop */ }
    holder.remove(dummy.root);
    try { dummy.dispose(); } catch (e) { /* noop */ }
    return true;
  }

  function setDragging(v) {
    dragging = !!v;
    if (dragging) idle = 0;
  }

  const api = {
    show,
    hide,
    select,
    rotate,
    update,
    prewarm,
    setDragging,
    get canvas() { return renderer ? renderer.domElement : null; },
    get open() { return open; },
    get item() { return item; },
    get actor() { return actor; },
    get size() { return SIZE; },
    dispose() {
      hide();
      if (renderer) { renderer.dispose(); renderer = null; }
      scene = null; camera = null; holder = null; canvas = null;
    },
  };
  return api;
}
