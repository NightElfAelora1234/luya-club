import * as THREE from 'three';
import { app } from '../core/state.js';
import { BEATS, WORLD } from '../core/world.js';
import { clamp, damp, easeInQuad, smoothstep } from '../core/util.js';

const SIGN_POS = new THREE.Vector3(0, 5.45, -17);
const IMPACT_POS = new THREE.Vector3(0, 0.06, -17);
// The plaque comes to rest on the sand beside the seabed rod.
const FINAL_POS = new THREE.Vector3(WORLD.rodPos.x + 1.65, WORLD.rodPos.y + 1.0, WORLD.rodPos.z + 1.0);
const _cam = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _follow = new THREE.Vector3();
const _final = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

// Round 6: keep the plaque at the screen edge for every follow key (the raw
// camera-relative side offset alone leaves it centre-left in the mid dive), and
// give the campaign UI a temporary "step aside" offset when a plaque is near.
const EDGE_RIGHT = 0.745;
const EDGE_LEFT = 0.255;
const EDGE_MIN_W = 320;
const AVOID_SIDE = 0.35;
const AVOID_BACK = 0.9;
const AVOID_DOWN = 0.35;

// Camera-relative descent stations. Keep the board on ONE edge for the whole
// descent and vary only its height/scale/roll slowly. Earlier keys flipped side
// and roll every 0.1 progress, which read as the plaque jumping back and forth
// across the lens even though each individual keyframe was smooth.
const FOLLOW_KEYS = [
  { t: 0.00, side: 1.00, ahead: 9.0, up: 1.6, scale: 0.56, roll: 0.10, pitch: 0.02 },
  { t: 0.12, side: 1.00, ahead: 9.0, up: 1.4, scale: 0.54, roll: 0.09, pitch: 0.02 },
  { t: 0.30, side: 1.00, ahead: 9.1, up: 1.1, scale: 0.50, roll: 0.07, pitch: 0.02 },
  { t: 0.50, side: 1.00, ahead: 9.1, up: 0.85, scale: 0.46, roll: 0.05, pitch: 0.02 },
  { t: 0.70, side: 1.00, ahead: 9.0, up: 0.65, scale: 0.42, roll: 0.03, pitch: 0.02 },
  { t: 0.85, side: 1.00, ahead: 9.0, up: 0.55, scale: 0.40, roll: 0.02, pitch: 0.02 },
  { t: 1.00, side: 1.00, ahead: 9.0, up: 0.60, scale: 0.38, roll: 0.02, pitch: 0.02 },
];

function followKeyAt(t) {
  const u = clamp(t, 0, 1);
  for (let i = 0; i < FOLLOW_KEYS.length - 1; i++) {
    const a = FOLLOW_KEYS[i];
    const b = FOLLOW_KEYS[i + 1];
    if (u <= b.t) {
      const k = smoothstep(0, 1, (u - a.t) / Math.max(1e-4, b.t - a.t));
      return {
        side: a.side + (b.side - a.side) * k,
        ahead: a.ahead + (b.ahead - a.ahead) * k,
        up: a.up + (b.up - a.up) * k,
        scale: a.scale + (b.scale - a.scale) * k,
        roll: a.roll + (b.roll - a.roll) * k,
        pitch: a.pitch + (b.pitch - a.pitch) * k,
      };
    }
  }
  return FOLLOW_KEYS[FOLLOW_KEYS.length - 1];
}

function drawTracked(ctx, text, centerX, y, tracking, align = 'center') {
  const chars = [...text];
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + tracking;
  total -= tracking;
  let x = align === 'center' ? centerX - total / 2 : centerX;
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + tracking;
  }
}

function makeSignTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 640;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);

  const x = 24, y = 24, w = c.width - 48, h = c.height - 48, r = 42;
  const rounded = (px, py, pw, ph, pr) => {
    const rr = Math.min(pr, pw / 2, ph / 2);
    ctx.beginPath();
    ctx.moveTo(px + rr, py);
    ctx.arcTo(px + pw, py, px + pw, py + ph, rr);
    ctx.arcTo(px + pw, py + ph, px, py + ph, rr);
    ctx.arcTo(px, py + ph, px, py, rr);
    ctx.arcTo(px, py, px + pw, py, rr);
    ctx.closePath();
  };

  // plate
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#f6f1e3');
  g.addColorStop(0.55, '#eee6d3');
  g.addColorStop(1, '#dfd3ba');
  rounded(x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();

  // brass frame
  rounded(x + 3, y + 3, w - 6, h - 6, r - 2);
  ctx.strokeStyle = '#b0854d';
  ctx.lineWidth = 8;
  ctx.stroke();
  rounded(x + 20, y + 20, w - 40, h - 40, r - 12);
  ctx.strokeStyle = 'rgba(27, 62, 52, .55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // subtle plate grain
  ctx.save();
  rounded(x, y, w, h, r);
  ctx.clip();
  for (let i = 0; i < 1600; i++) {
    const gx = Math.random() * c.width;
    const gy = Math.random() * c.height;
    ctx.fillStyle = `rgba(90, 70, 40, ${Math.random() * 0.022})`;
    ctx.fillRect(gx, gy, 2, 2);
  }
  ctx.restore();

  // rivets
  for (const [rx, ry] of [[x + 42, y + 42], [x + w - 42, y + 42], [x + 42, y + h - 42], [x + w - 42, y + h - 42]]) {
    ctx.beginPath();
    ctx.arc(rx, ry, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#a97e46';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rx - 2, ry - 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 240, 210, .55)';
    ctx.fill();
  }

  ctx.textBaseline = 'middle';

  // top label
  ctx.font = '400 30px "Bahnschrift", "Arial Narrow", sans-serif';
  ctx.fillStyle = 'rgba(27, 62, 52, .72)';
  drawTracked(ctx, 'EST. 2019  ·  OPEN WATER CAMPAIGN  ·  CONCEPT', c.width / 2, 112, 9);

  // main wordmark
  ctx.font = '700 208px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#143a32';
  drawTracked(ctx, '路亚俱乐部', c.width / 2, 330, 26);

  // brass underline with a wave
  ctx.strokeStyle = 'rgba(160, 118, 60, .85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const px = c.width / 2 - 300 + i * 3;
    const py = 442 + Math.sin(i / 200 * Math.PI * 4) * 4;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // english
  ctx.font = '400 46px "Bahnschrift", "Arial Narrow", sans-serif';
  ctx.fillStyle = '#1c463c';
  drawTracked(ctx, 'LUYA CLUB', c.width / 2, 505, 22);

  ctx.font = '400 24px "Bahnschrift", "Arial Narrow", sans-serif';
  ctx.fillStyle = 'rgba(27, 62, 52, .54)';
  drawTracked(ctx, '路亚 · 开放水域 · 概念', c.width / 2, 562, 10);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makeCircleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(235,250,250,.9)');
  g.addColorStop(0.82, 'rgba(185,230,235,.35)');
  g.addColorStop(1, 'rgba(180,225,235,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSign(engine, ocean) {
  const group = new THREE.Group();
  group.name = 'lure-club-sign';

  const tex = makeSignTexture();
  // The plaque is a physical, lit object: no unlit/emissive material and no
  // additive glow, so it sits in the water light instead of glowing through it.
  const material = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.04,
    side: THREE.DoubleSide,
    color: 0xbfc8bd,
    roughness: 0.82,
    metalness: 0.06,
    envMapIntensity: 0.22,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 2.4375), material);
  plane.position.copy(SIGN_POS);
  plane.rotation.y = 0.10;
  plane.rotation.x = -0.03;
  group.add(plane);

  // Legacy glow node retained only as a reference; it is never added to the
  // scene, so the sign has no light source of its own.
  const glowTex = makeCircleTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xffd9a3,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    visible: false,
  }));
  glow.scale.set(11, 4.2, 1);
  glow.position.copy(SIGN_POS).add(new THREE.Vector3(0, 0, -0.05));

  engine.scene.add(group);

  // ---------- splash droplets ----------
  const DROPS = 160;
  const dropGeo = new THREE.BufferGeometry();
  const dropPos = new Float32Array(DROPS * 3);
  const dropVel = new Float32Array(DROPS * 3);
  const dropLife = new Float32Array(DROPS);
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const dropMat = new THREE.PointsMaterial({
    size: 0.13, map: glowTex, transparent: true, opacity: 0.8,
    depthWrite: false, blending: THREE.NormalBlending, color: 0xe9f8f6, sizeAttenuation: true,
  });
  const drops = new THREE.Points(dropGeo, dropMat);
  drops.frustumCulled = false;
  drops.visible = false;
  group.add(drops);
  let dropTimer = 0;

  // ---------- bubbles (while the sign sinks) ----------
  const BUBBLES = 180;
  const bubGeo = new THREE.BufferGeometry();
  const bubPos = new Float32Array(BUBBLES * 3).fill(-9999);
  const bubVel = new Float32Array(BUBBLES * 3);
  const bubLife = new Float32Array(BUBBLES);
  const bubSeed = new Float32Array(BUBBLES);
  bubGeo.setAttribute('position', new THREE.BufferAttribute(bubPos, 3));
  const bubMat = new THREE.PointsMaterial({
    size: 0.13, map: glowTex, transparent: true, opacity: 0.7,
    depthWrite: false, blending: THREE.NormalBlending, color: 0xd9f4f2, sizeAttenuation: true,
  });
  const bubbles = new THREE.Points(bubGeo, bubMat);
  bubbles.frustumCulled = false;
  group.add(bubbles);
  let bubCursor = 0;
  let bubSpawn = 0;

  // ---------- foam rings ----------
  // The surface shader grows its own ripple foam; separate ring meshes read as
  // hard CG circles from below, so the splash relies on the water shader alone.
  const rings = [];

  let hasSplashed = false;
  let sinkTime = 0;
  let lastP = -1;
  let avoid = 0;
  let avoidTarget = 0;
  let avoidDir = 0;
  let textGuardY = 0;
  let textGuardOn = false;
  let textGuardAmt = 0;
  const edgeDebug = { targetX: 0, avoidW: 0, screenX: 0, naturalX: 0, avoidX: 0 };

  function triggerSplash() {
    hasSplashed = true;
    drops.visible = true;
    dropTimer = 0;
    for (let i = 0; i < DROPS; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 5.5;
      dropPos[i * 3] = IMPACT_POS.x + (Math.random() - 0.5) * 1.4;
      dropPos[i * 3 + 1] = 0.05;
      dropPos[i * 3 + 2] = IMPACT_POS.z + (Math.random() - 0.5) * 1.4;
      dropVel[i * 3] = Math.cos(ang) * sp * 0.55;
      dropVel[i * 3 + 1] = 1.5 + Math.random() * 3.8;
      dropVel[i * 3 + 2] = Math.sin(ang) * sp * 0.55;
      dropLife[i] = 0.8 + Math.random() * 0.7;
    }
    dropGeo.attributes.position.needsUpdate = true;
    for (const r of rings) { r.active = true; r.t = -r.delay; r.mesh.visible = false; }
    ocean.addRipple(IMPACT_POS.x, IMPACT_POS.z, 1.35);
    ocean.addRipple(IMPACT_POS.x + 0.7, IMPACT_POS.z + 0.4, 0.7);
    app.bus.emit('sign:splash', IMPACT_POS.clone());
  }

  function resetSign() {
    hasSplashed = false;
    sinkTime = 0;
    avoid = 0;
    avoidTarget = 0;
    avoidDir = 0;
    textGuardAmt = 0;
    textGuardOn = false;
    material.opacity = 1;
    group.visible = true;
    plane.position.copy(SIGN_POS);
    plane.scale.setScalar(1);
    plane.rotation.set(-0.03, 0.10, 0);
    glow.position.copy(SIGN_POS);
    drops.visible = false;
    for (const r of rings) { r.active = false; r.mesh.visible = false; }
    for (let i = 0; i < BUBBLES; i++) { bubPos[i * 3 + 1] = -9999; bubLife[i] = 0; }
    bubGeo.attributes.position.needsUpdate = true;
  }

  function spawnBubble(x, y, z) {
    const i = bubCursor % BUBBLES;
    bubCursor++;
    bubPos[i * 3] = x + (Math.random() - 0.5) * 0.9;
    bubPos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.4;
    bubPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.9;
    bubVel[i * 3] = (Math.random() - 0.5) * 0.25;
    bubVel[i * 3 + 1] = 0.7 + Math.random() * 0.8;
    bubVel[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
    bubLife[i] = 2.5 + Math.random() * 2.5;
    bubSeed[i] = Math.random() * Math.PI * 2;
  }

  return {
    group,
    plane,
    material,
    get visible() { return group.visible; },
    reset: resetSign,
    // ---------- Round-6 campaign API ----------
    setAvoidance(amount = 0, dir = 0) {
      const a = Number(amount);
      avoidTarget = clamp(Number.isFinite(a) ? a : 0, 0, 1);
      if (dir) avoidDir = Math.sign(dir);
    },
    getAvoidance() { return avoid; },
    setTextGuard(y = 0, on = false) {
      const n = Number(y);
      if (Number.isFinite(n)) textGuardY = n;
      textGuardOn = !!on;
    },
    getTextGuard() { return { y: Math.round(textGuardY), on: textGuardOn, amount: +textGuardAmt.toFixed(3) }; },
    getNaturalSide() {
      const t = clamp((app.progress - BEATS.signImpact) / (1 - BEATS.signImpact));
      return followKeyAt(t).side;
    },
    getEdgeTargetX() {
      const vw = Math.max(EDGE_MIN_W, window.innerWidth || 1600);
      const t = clamp((app.progress - BEATS.signImpact) / (1 - BEATS.signImpact));
      const side = followKeyAt(t).side;
      const sideSign = side >= 0 ? 1 : -1;
      const edgeBlend = smoothstep(0.08, 0.42, Math.abs(side));
      return (0.5 + sideSign * 0.25 * edgeBlend) * vw;
    },
    debugInfo() {
      return {
        p: +app.progress.toFixed(4),
        avoid: +avoid.toFixed(3),
        avoidTarget,
        avoidDir,
        textGuard: { y: Math.round(textGuardY), on: textGuardOn, amount: +textGuardAmt.toFixed(3) },
        naturalSide: +this.getNaturalSide().toFixed(3),
        edgeTargetX: +this.getEdgeTargetX().toFixed(1),
        pos: [plane.position.x, plane.position.y, plane.position.z].map((v) => +v.toFixed(2)),
        scale: +plane.scale.x.toFixed(3),
        edge: { ...edgeDebug },
      };
    },
    update(dt) {
      const p = app.progress;
      const active = app.mode === 'dive';
      // The plaque stays with the descent for the whole dive and comes to rest
      // beside the rod, instead of being culled at 30 %.
      group.visible = active;
      if (!active) {
        avoid = 0;
        avoidTarget = 0;
        textGuardAmt = 0;
        return;
      }

      // reset when the visitor scrolls back to the surface
      if (p < BEATS.signRelease - 0.012 && hasSplashed) resetSign();
      if (p < BEATS.signRelease - 0.012 && plane.position.y !== SIGN_POS.y && !hasSplashed) {
        plane.position.copy(SIGN_POS);
        plane.scale.setScalar(1);
        material.opacity = 1;
      }

      if (p < BEATS.signRelease) {
        const t = app.time;
        plane.position.set(
          SIGN_POS.x + Math.sin(t * 0.33) * 0.05,
          SIGN_POS.y + Math.sin(t * 0.62) * 0.14,
          SIGN_POS.z,
        );
        plane.scale.setScalar(1);
        plane.rotation.set(-0.03 + Math.sin(t * 0.5) * 0.008, 0.10 + Math.sin(t * 0.4) * 0.035, Math.sin(t * 0.37) * 0.01);
        material.opacity = 1;
        glow.material.opacity = 0;
        glow.visible = false;
        // gentle shimmer in the emissive brass
      } else if (p < BEATS.signImpact) {
        const t = clamp((p - BEATS.signRelease) / (BEATS.signImpact - BEATS.signRelease));
        const e = easeInQuad(t);
        plane.position.lerpVectors(SIGN_POS, IMPACT_POS, e);
        plane.position.x += Math.sin(t * 9.0) * 0.08 * t;
        plane.rotation.x = -0.03 + e * 0.55;
        plane.rotation.z = e * 0.42;
        plane.rotation.y = 0.10 + e * 0.25;
        plane.scale.setScalar(1);
        material.opacity = 1;
        glow.material.opacity = 0;
        glow.visible = false;
      } else {
        if (!hasSplashed) triggerSplash();

        // After the splash the board follows a smooth SCREEN-space anchor on the
        // right edge. Solving the anchor in screen space (then unprojecting once)
        // means camera pitch/FOV changes cannot make it swing across the lens or
        // pop to a new edge; it drifts with a slow vertical breath instead.
        const t = clamp((p - BEATS.signImpact) / (1 - BEATS.signImpact));
        const key = followKeyAt(t);

        avoid = damp(avoid, avoidTarget, 2.0, dt);
        const fin = smoothstep(0.94, 1, p);
        const avoidW = avoid * (1 - fin);

        engine.camera.updateMatrixWorld();
        const vw = Math.max(320, window.innerWidth || 1600);
        const vh = Math.max(320, window.innerHeight || 900);
        const portraitish = vw < 700;
        // Slight outward nudge when a campaign plaque is near. It never crosses
        // the frame; the left column belongs to the plaques/promo cards.
        // The board eases from just-right-of-centre to the edge over the first
        // third of the dive instead of making one fast centre→edge dash right
        // after the splash.
        const edgeRamp = smoothstep(0.02, 0.38, t);
        let targetX = vw * (portraitish
          ? (0.56 + 0.16 * edgeRamp)
          : (0.56 + 0.24 * edgeRamp));
        targetX += avoidW * vw * 0.018;
        targetX = clamp(targetX, vw * 0.52, vw * 0.86);
        let targetY = vh * (0.46 + 0.035 * t + Math.sin(app.time * 0.26 + t * 1.5) * 0.016);
        targetY += avoidW * vh * 0.035;
        targetY = clamp(targetY, vh * 0.24, vh * 0.8);

        // Blend in SCREEN space from the impact centre to the right-edge
        // anchor. This is the key smoothness fix: a world-space hand-off left
        // the board behind while the camera dived and it appeared to swoop/leap.
        const followMix = smoothstep(0, 0.30, t);
        const anchorX = (vw * 0.5) + (targetX - vw * 0.5) * followMix;
        const anchorY = (vh * 0.5) + (targetY - vh * 0.5) * followMix;

        const ndcX = (anchorX / vw) * 2 - 1;
        const ndcY = -(anchorY / vh) * 2 + 1;
        _probe.set(ndcX, ndcY, 0.5).unproject(engine.camera).sub(engine.camera.position).normalize();
        _follow.copy(engine.camera.position).addScaledVector(_probe, key.ahead);

        // final resting pose by the rod
        _final.copy(FINAL_POS);
        _follow.lerp(_final, fin);
        // keep the plaque out of the sand during the descent (the final pose is
        // already above the floor)
        if (fin < 0.96) _follow.y = Math.max(_follow.y, -94.1);
        // once the splash happens the board must actually be under the water,
        // not skimming the surface while it follows the camera
        if (p < 0.9) _follow.y = Math.min(_follow.y, -0.55);

        edgeDebug.targetX = Math.round(targetX);
        edgeDebug.avoidW = +avoidW.toFixed(3);
        edgeDebug.screenX = Math.round(anchorX);
        edgeDebug.naturalX = Math.round(vw * (portraitish ? 0.72 : 0.80));
        edgeDebug.avoidX = Math.round(targetX);

        // The screen anchor is already smooth; copy directly so the plaque does
        // not lag behind the camera and overshoot when the wheel is spun fast.
        plane.position.copy(_follow);
        // keep the size continuous through the splash and the dive; the board
        // must not pop from 1× to 0.56× when it enters the water.
        const sizeBlend = smoothstep(0, 0.14, t);
        plane.scale.setScalar((1 + (key.scale - 1) * sizeBlend) * (1 - avoidW * 0.05));

        // face the lens with a slow physical sway; the final pose faces the
        // visitor so the plaque can be read next to the rod
        plane.lookAt(engine.camera.position);
        plane.rotateZ(key.roll + Math.sin(app.time * 0.42 + t * 2.7) * 0.04);
        plane.rotateX(key.pitch + Math.sin(app.time * 0.35 + t * 1.9) * 0.03);

        material.opacity = 0.97 - 0.08 * fin;
        // no light of its own: the plaque is lit by the scene only
        glow.material.opacity = 0;
        glow.visible = false;

        // keep a thin bubble trail while the plaque moves through the water
        bubSpawn += dt;
        if (bubSpawn > 0.11 && fin < 0.94) {
          bubSpawn = 0;
          spawnBubble(plane.position.x, plane.position.y + 0.5, plane.position.z);
          if (t < 0.5) spawnBubble(plane.position.x, plane.position.y + 0.9, plane.position.z);
        }
      }

      // legacy glow is intentionally never added to the scene
      if (p < BEATS.signImpact) {
        // no-op: the plaque has no self-light
      }

      // splash droplets integrate independently of scroll
      if (drops.visible) {
        let alive = 0;
        for (let i = 0; i < DROPS; i++) {
          if (dropLife[i] <= 0) continue;
          dropLife[i] -= dt;
          if (dropLife[i] <= 0) { dropPos[i * 3 + 1] = -9999; continue; }
          alive++;
          dropVel[i * 3 + 1] -= 9.8 * dt;
          dropPos[i * 3] += dropVel[i * 3] * dt;
          dropPos[i * 3 + 1] += dropVel[i * 3 + 1] * dt;
          dropPos[i * 3 + 2] += dropVel[i * 3 + 2] * dt;
          if (dropPos[i * 3 + 1] < -0.1 && dropLife[i] > 0.2) dropLife[i] = 0.2;
        }
        dropGeo.attributes.position.needsUpdate = true;
        if (alive === 0) drops.visible = false;
      }

      // bubbles rise
      let bubbleAlive = false;
      for (let i = 0; i < BUBBLES; i++) {
        if (bubLife[i] <= 0) continue;
        bubbleAlive = true;
        bubLife[i] -= dt;
        const y = bubPos[i * 3 + 1];
        bubPos[i * 3 + 1] += bubVel[i * 3 + 1] * dt;
        bubPos[i * 3] += Math.sin(app.time * 1.7 + bubSeed[i]) * 0.06 * dt + bubVel[i * 3] * dt;
        bubPos[i * 3 + 2] += Math.cos(app.time * 1.3 + bubSeed[i]) * 0.06 * dt + bubVel[i * 3 + 2] * dt;
        if (y > 0.1 || bubLife[i] <= 0) bubPos[i * 3 + 1] = -9999;
      }
      if (bubbleAlive) bubGeo.attributes.position.needsUpdate = true;

      // foam rings
      for (const r of rings) {
        if (!r.active) continue;
        r.t += dt;
        if (r.t < 0) { r.mesh.visible = false; continue; }
        const life = 0.32 + r.t * 0.55;
        r.mesh.visible = r.t < 3.2;
        const s = 0.8 + r.t * 3.6;
        r.mesh.scale.set(s, s, s);
        r.mesh.material.opacity = Math.max(0, 0.55 * (1 - r.t / 3.0));
        if (r.t > 3.2) r.active = false;
      }
      lastP = p;
    },
  };
}
