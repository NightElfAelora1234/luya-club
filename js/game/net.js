// 路亚俱乐部 · 3D 抄网 (landing net)
//
// A first-person view-model: a long-handled landing net that slides up from the
// bottom-right, follows the mouse, and scoops the tired fish at the pontoon.
// It lives in camera space so it can never be occluded by the ocean mist; the
// hoop itself is kept world-horizontal (its quaternion cancels the camera) so
// it reads as a real net held over the water.

import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';

const DEG = Math.PI / 180;
const R = 0.38;             // hoop radius (m)
const NET_DEPTH = 2.55;     // camera-space distance of the hoop
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export function createLandingNet(engine, camera) {
  const root = new THREE.Group();
  root.name = 'landingNet';
  root.visible = false;
  camera.add(root);
  if (!camera.parent) engine.scene.add(camera);

  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xc9a064, metalness: 1.0, roughness: 0.34,
    emissive: 0x2a1c0c, emissiveIntensity: 0.5,
  });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.014, 10, 52), rimMat);
  rim.rotation.x = Math.PI * 0.5;
  root.add(rim);

  // thin inner brace + cross-spokes so the hoop reads at a glance
  const braceMat = new THREE.MeshStandardMaterial({ color: 0x6b563a, roughness: 0.6, metalness: 0.5 });
  const brace = new THREE.Mesh(new THREE.TorusGeometry(R * 0.94, 0.004, 6, 44), braceMat);
  brace.rotation.x = Math.PI * 0.5;
  root.add(brace);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, R * 1.92, 5), braceMat);
    spoke.rotation.z = Math.PI * 0.5;
    spoke.rotation.y = (i / 3) * Math.PI;
    spoke.position.y = 0.012;
    root.add(spoke);
  }

  // net bag: two crossed wireframe cones read as a knotted mesh
  const bagGeo = new THREE.CylinderGeometry(R * 0.97, R * 0.17, 0.6, 24, 5, true);
  const bagMatA = new THREE.MeshBasicMaterial({
    color: 0xe9e2cf, wireframe: true, transparent: true, opacity: 0.22,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const bagMatB = bagMatA.clone();
  bagMatB.opacity = 0.12;
  const bagA = new THREE.Mesh(bagGeo, bagMatA);
  bagA.position.y = -0.30;
  root.add(bagA);
  const bagB = new THREE.Mesh(bagGeo, bagMatB);
  bagB.position.y = -0.30;
  bagB.rotation.y = Math.PI / 24;
  bagB.scale.set(0.985, 1.02, 0.985);
  root.add(bagB);

  // long handle: from the near rim toward the angler's hand (down/right/back)
  const handleLen = 2.35;
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x22282a, roughness: 0.42, metalness: 0.55 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: 0.92, metalness: 0.05 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9a86c, roughness: 0.3, metalness: 1.0 });

  const p0 = new THREE.Vector3(0, 0.03, R * 0.94);
  const dir = new THREE.Vector3(0.46, -0.74, 0.49).normalize();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.026, handleLen, 10), handleMat);
  const mid = p0.clone().addScaledVector(dir, handleLen * 0.5);
  handle.position.copy(mid);
  handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone());
  root.add(handle);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.46, 12), gripMat);
  const gripCenter = p0.clone().addScaledVector(dir, handleLen * 0.82);
  grip.position.copy(gripCenter);
  grip.quaternion.copy(handle.quaternion);
  root.add(grip);

  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.05, 12), brassMat);
  butt.position.copy(p0).addScaledVector(dir, handleLen * 0.99);
  butt.quaternion.copy(handle.quaternion);
  root.add(butt);

  // a tiny collar where the handle meets the hoop
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.09, 10), brassMat);
  collar.position.copy(p0).addScaledVector(dir, 0.09);
  collar.quaternion.copy(handle.quaternion);
  root.add(collar);

  root.traverse((o) => { o.frustumCulled = false; });

  const localHoop = new THREE.Vector3(0, 0, 0);
  const hoopWorld = new THREE.Vector3();
  const place = { x: 0, y: -0.25, targetX: 0, targetY: -0.25 };
  let visible = false;
  let lift = 0;
  let highlight = 0;
  let roll = 0;
  let hintX = 0;

  function setVisible(v) {
    visible = !!v;
    root.visible = visible;
    if (!v) { lift = 0; place.x = 0; place.y = -0.25; place.targetX = 0; place.targetY = -0.25; }
  }

  function show() {
    setVisible(true);
    // slide in from the right: start further right and lower
    place.x = 1.4;
    place.y = -0.9;
    place.targetX = 0;
    place.targetY = -0.2;
  }

  // u,v in [0,1] screen space; lift 0..1 raises the net for the scoop.
  function update(dt, opts = {}) {
    if (!visible) return;
    const u = clamp(opts.u ?? 0.5, 0.04, 0.96);
    const v = clamp(opts.v ?? 0.55, 0.22, 0.94);
    const fov = (camera.fov || 52) * DEG;
    const aspect = camera.aspect || 1.78;
    const h = 2 * NET_DEPTH * Math.tan(fov * 0.5);
    const w = h * aspect;
    const tx = (u - 0.5) * w;
    const ty = -(v - 0.5) * h;

    const lambda = opts.lambda ?? 20;
    place.x = damp(place.x, tx, lambda, dt);
    place.y = damp(place.y, ty, lambda, dt);
    const targetLift = clamp(opts.lift ?? 0);
    lift = damp(lift, targetLift, targetLift > lift ? 9 : 5, dt);
    hintX = damp(hintX, opts.hintX ?? 0, 5, dt);

    // camera-space position; keep the hoop world-horizontal by cancelling the
    // camera rotation (root is a child of the camera).
    root.position.set(place.x + hintX, place.y + lift * 1.15, -NET_DEPTH + lift * 0.35);
    root.quaternion.copy(camera.quaternion).invert();
    // slight roll while lifting, and a gentle bob at rest
    roll = damp(roll, lift * 0.42, 6, dt);
    root.rotateZ(roll);

    const wantHighlight = opts.highlight ? 1 : 0;
    highlight = damp(highlight, wantHighlight, 10, dt);
    rimMat.emissive.setHex(highlight > 0.5 ? 0x4a3a12 : 0x2a1c0c);
    rimMat.emissiveIntensity = 0.45 + highlight * 1.4;
    rimMat.color.setRGB(0.79 + highlight * 0.15, 0.63 + highlight * 0.2, 0.39);
    bagMatA.opacity = 0.22 + highlight * 0.1;

    root.updateWorldMatrix(true, false);
    hoopWorld.copy(localHoop).applyMatrix4(root.matrixWorld);
  }

  function hoopWorldPos(out = _v) {
    out.copy(hoopWorld);
    return out;
  }

  return {
    root,
    update,
    setVisible,
    show,
    hide() { setVisible(false); },
    hoopWorldPos,
    get visible() { return visible; },
    get lift() { return lift; },
    get radiusPx() {
      // apparent radius on screen, for the guide ring / overlap check
      const fov = (camera.fov || 52) * DEG;
      const h = window.innerHeight;
      return (R / NET_DEPTH) * (h * 0.5 / Math.tan(fov * 0.5));
    },
    get accent() { return rimMat; },
    dispose() {
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      root.removeFromParent();
    },
  };
}
