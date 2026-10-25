// Surface encounter — the mouse touches the sea and 2–3 mahi glide over.
// Projects app.pointer.ndc onto the water plane y = -0.6 every frame, then drives
// small state-machine fish (approach → swirl → leave). Never above y = 0.
// The InstancedMesh is wrapped in a Group named 'surface-attracted-mahi' so QA
// can inspect it like the rest of the scene. Owner: fish.
import * as THREE from 'three';
import { clamp, damp, mulberry32, smoothstep } from '../../core/util.js';

const WATER_Y = -0.6;
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _prevQuat = new THREE.Quaternion();

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function createSurfaceFish(engine, app, ctx, options) {
  const { species, form, geometry, material } = options;
  const COUNT = 3;
  const rand = mulberry32(0x9e3779b9);

  const group = new THREE.Group();
  group.name = 'surface-attracted-mahi';
  group.visible = false;
  engine.scene.add(group);

  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  mesh.name = 'surface-attracted-mahi-mesh';
  mesh.frustumCulled = false;
  // draw the fish before the transparent ocean surface so the sea's clear-water
  // window (which writes depth at renderOrder -10) can blend over them
  mesh.renderOrder = -20;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);

  const agents = [];
  const length = 1.18; // metres — big enough to read at 8–12 m
  for (let i = 0; i < COUNT; i++) {
    agents.push({
      state: 'idle',       // idle | approach | swirl | leave
      t: 0,
      delay: i * 0.16,
      pos: new THREE.Vector3(0, 0.18, 4),
      prev: new THREE.Vector3(0, 0.18, 4),
      quat: new THREE.Quaternion(),
      angle: rand() * Math.PI * 2,
      dir: i % 2 === 0 ? 1 : -1,
      radius: 1.3 + i * 0.5,
      seed: rand() * Math.PI * 2,
      swirlDepth: 0.25 + rand() * 0.55,
      visible: false,
      fade: 0,
      hover: 0,
      size: 0.94 + rand() * 0.12,
      broke: false,
    });
  }

  let pointerValid = false;
  let lastNdcX = 0;
  let lastNdcY = 0;
  let moveAccum = 1;
  let stillTime = 0;
  let triggerCooldown = 0;
  let hasTarget = false;
  let lastTrigger = -99;
  let rippleTimer = 0;
  let bubbleTimer = 0;
  let emitted = 0;
  let visibleCount = 0;
  let targetDist = 0;

  function projectPointer() {
    pointerValid = false;
    const p = app.pointer;
    if (!p.inside) return false;
    const ray = engine.pickRay();
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    if (Math.abs(d.y) < 0.0008) return false;
    const t = (WATER_Y - o.y) / d.y;
    if (t < 0.6 || t > 62) return false;
    _target.copy(o).addScaledVector(d, t);
    const dx = _target.x - o.x;
    const dz = _target.z - o.z;
    const horiz = Math.hypot(dx, dz);
    if (horiz > 55) return false;
    targetDist = t;
    hasTarget = true;
    pointerValid = true;
    return true;
  }

  function trigger() {
    if (!hasTarget || app.time - lastTrigger < 1.2) return false;
    lastTrigger = app.time;
    let any = false;
    for (const a of agents) {
      if (a.state !== 'idle') continue;
      // start close to the pointer's water point so the encounter reads at once
      const ang = rand() * Math.PI * 2;
      const r = 1.8 + rand() * 1.6;
      a.pos.set(
        _target.x + Math.cos(ang) * r,
        0.12 + rand() * 0.18,
        _target.z + Math.sin(ang) * r,
      );
      a.prev.copy(a.pos);
      a.state = 'approach';
      a.t = 0;
      a.delay = rand() * 0.22;
      a.angle = ang;
      a.dir = rand() > 0.5 ? 1 : -1;
      a.radius = 1.1 + rand() * 0.9;
      a.swirlDepth = 0.2 + rand() * 0.55;
      a.visible = true;
      a.fade = 0;
      a.broke = false;
      any = true;
    }
    return any;
  }

  function update(dt, info) {
    const time = app.time;
    const depth = info.depth || 0;
    // surface encounters belong to the top 10 m only — never drag them into the deep
    if (info.mode !== 'dive' || depth >= 10.5) {
      for (const a of agents) {
        a.state = 'idle';
        a.visible = false;
        a.fade = 0;
      }
      visibleCount = 0;
      group.visible = false;
      pointerValid = false;
      moveAccum = 0;
      stillTime = 0;
      return;
    }
    const active = true;
    const ndc = app.pointer.ndc;
    const moved = Math.hypot(ndc.x - lastNdcX, ndc.y - lastNdcY);
    moveAccum += moved;
    lastNdcX = ndc.x;
    lastNdcY = ndc.y;

    triggerCooldown = Math.max(0, triggerCooldown - dt);
    if (active) {
      projectPointer();
      stillTime = pointerValid ? stillTime + dt : 0;
      // a hover alone is enough — the sea reacts after a short beat
      const busy = agents.some((a) => a.state !== 'idle');
      const wants = moveAccum > 0.04 || stillTime > 0.75;
      if (wants && !busy && triggerCooldown <= 0 && pointerValid) {
        const triggered = trigger();
        if (triggered) {
          triggerCooldown = 0.9;
          moveAccum = 0;
          stillTime = 0;
        }
      }
      if (moveAccum > 0.25) {
        moveAccum = 0;
        for (const a of agents) {
          if (a.state === 'swirl') { a.state = 'approach'; a.t = 0; a.delay = 0; }
        }
      }
    } else {
      for (const a of agents) {
        if (a.state !== 'idle') { a.state = 'leave'; a.t = 0; }
      }
    }

    let anyVisible = false;
    visibleCount = 0;
    for (let ai = 0; ai < agents.length; ai++) {
      const a = agents[ai];
      if (a.state === 'idle') {
        a.fade = Math.max(0, a.fade - dt * 3);
        a.visible = a.fade > 0.02;
        _scale.setScalar(0);
        _m4.compose(a.pos, a.quat, _scale);
        mesh.setMatrixAt(ai, _m4);
        continue;
      }
      a.t += dt;
      if (a.delay > 0) {
        a.delay -= dt;
        _scale.setScalar(0);
        _m4.compose(a.pos, a.quat, _scale);
        mesh.setMatrixAt(ai, _m4);
        continue;
      }

      if (a.state === 'approach') {
        const tx = _target.x + Math.cos(a.angle + a.t * 1.2) * 0.45;
        const tz = _target.z + Math.sin(a.angle + a.t * 1.2) * 0.45;
        const ty = 0.18 + Math.sin(a.t * 1.6 + a.seed) * 0.07;
        _desired.set(tx, ty, tz);
        a.pos.lerp(_desired, 1 - Math.exp(-4.2 * dt));
        if (a.pos.distanceTo(_desired) < 0.7 || a.t > 3.4) {
          a.state = 'swirl';
          a.t = 0;
          a.angle = Math.atan2(a.pos.z - _target.z, a.pos.x - _target.x);
          // first surfacing: a hard ring + a little foam/bubbles
          if (ctx.ocean) {
            ctx.ocean.addRipple(a.pos.x, a.pos.z, 0.95);
            ctx.ocean.addRipple(a.pos.x + 0.5, a.pos.z - 0.35, 0.45);
          }
          if (ctx.ambience?.bubbleBurst) ctx.ambience.bubbleBurst(a.pos, 5);
        }
      } else if (a.state === 'swirl') {
        a.angle += dt * a.dir * (1.15 + a.seed * 0.12);
        const r = a.radius + Math.sin(a.t * 1.4 + a.seed) * 0.2;
        const tx = _target.x + Math.cos(a.angle) * r;
        const tz = _target.z + Math.sin(a.angle) * r;
        const ty = 0.2 + Math.sin(a.angle * 1.7 + a.seed) * 0.1;
        _desired.set(tx, ty, tz);
        a.pos.lerp(_desired, 1 - Math.exp(-4.6 * dt));
        if (a.t > 2.8 + a.seed * 0.6) {
          a.state = 'leave';
          a.t = 0;
          a.angle = Math.atan2(a.pos.z - _target.z, a.pos.x - _target.x);
        }
      } else if (a.state === 'leave') {
        const out = a.angle;
        _desired.set(
          _target.x + Math.cos(out) * 16,
          -0.15,
          _target.z + Math.sin(out) * 16,
        );
        a.pos.lerp(_desired, 1 - Math.exp(-1.8 * dt));
        if (a.t > 1.5) {
          a.state = 'idle';
          a.visible = false;
          a.fade = 0;
          triggerCooldown = Math.max(triggerCooldown, 1.2);
        }
      }

      // body rides at the surface, back and dorsal fin breaking the water
      a.pos.y = Math.max(Math.min(a.pos.y, 0.42), -0.9);
      if (!a.broke && a.pos.y > 0.03 && a.state !== 'leave') {
        a.broke = true;
        if (ctx.ocean) ctx.ocean.addRipple(a.pos.x, a.pos.z, 1.15);
        if (ctx.ambience?.bubbleBurst) ctx.ambience.bubbleBurst(a.pos, 4);
      }

      _vel.copy(a.pos).sub(a.prev);
      const speed = _vel.length();
      if (speed > 1e-4) {
        _vel.multiplyScalar(1 / speed);
        const yaw = Math.atan2(_vel.x, _vel.z);
        const pitch = -Math.asin(clamp(_vel.y, -1, 1)) * 0.62;
        const roll = -a.dir * 0.34 + Math.sin(time * 3.1 + a.seed) * 0.08;
        _euler.set(pitch, yaw, roll, 'YXZ');
        _q.setFromEuler(_euler);
        a.quat.slerp(_q, 1 - Math.exp(-7 * dt));
      }
      a.prev.copy(a.pos);
      a.fade = Math.min(1, a.fade + dt * 3.2);
      a.visible = true;
      const swim = 1 + Math.sin(time * 4.2 + a.seed) * 0.02;
      _scale.setScalar(length * a.size * swim * smoothstep(0, 0.55, a.fade));
      _m4.compose(a.pos, a.quat, _scale);
      mesh.setMatrixAt(ai, _m4);
      anyVisible = true;
      visibleCount++;
    }

    group.visible = anyVisible;
    if (anyVisible) mesh.instanceMatrix.needsUpdate = true;

    // wake on the water surface + a few bubbles while the fish are over the pointer
    if (anyVisible) {
      rippleTimer -= dt;
      bubbleTimer -= dt;
      if (rippleTimer <= 0) {
        rippleTimer = 0.34;
        if (ctx.ocean) {
          for (const a of agents) {
            if (a.state === 'swirl' || a.state === 'approach') {
              ctx.ocean.addRipple(a.pos.x, a.pos.z, a.state === 'swirl' ? 0.22 : 0.12);
            }
          }
        }
      }
      if (bubbleTimer <= 0) {
        bubbleTimer = 0.55;
        if (ctx.ambience?.bubbleBurst) {
          for (const a of agents) {
            if (a.state === 'swirl' && emitted < 2) {
              emitted++;
              ctx.ambience.bubbleBurst(a.pos, 2);
            }
          }
          emitted = 0;
        }
      }
    }
  }

  function dispose() {
    engine.scene.remove(group);
    // geometry + material are shared with the mahi school
  }

  return {
    group,
    mesh,
    update,
    dispose,
    get activeCount() { return visibleCount; },
    get visibleCount() { return visibleCount; },
    get targetDistance() { return targetDist; },
    debugInfo() {
      return {
        visible: visibleCount,
        pointerValid,
        hasTarget,
        targetDistance: +targetDist.toFixed(1),
        target: hasTarget ? [+_target.x.toFixed(1), +_target.y.toFixed(1), +_target.z.toFixed(1)] : null,
        agents: agents.map((a) => ({
          state: a.state,
          y: +a.pos.y.toFixed(2),
          pos: [+a.pos.x.toFixed(1), +a.pos.y.toFixed(1), +a.pos.z.toFixed(1)],
          delay: +a.delay.toFixed(2),
        })),
      };
    },
  };
}
