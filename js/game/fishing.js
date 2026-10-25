// 路亚俱乐部 · Lure fishing simulation — round 4
//
// Controls are strictly: mouse button/movement, mouse wheel, Space.
//   rigged    : hold Space to charge 10–120 m, release to cast
//   retrieving: wheel up = reel in, wheel down = feed (hard 6 m/s cap / spool 120 m)
//   bite      : Space only = hook-set (mouse flick/click do not strike)
//   fighting  : auto-reel; sweep the mouse ←/→ and press Space when the gauge
//               is full (forgiving sweep QTE), net at 2.5–4 m, catch → bag
//
// Visuals live in js/game/scene.js (pontoon, splashes, fight fish),
// js/game/net.js (landing net), js/game/bag.js (creel + turntable) and
// js/game/rod.js (first-person rod). The HUD lives in js/ui/fishing.js.

import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';
import {
  LURE_BY_ID, LEADERS, LEADER_BY_ID,
  rodProfile,
} from '../data/lures.js';
import {
  buildSpeciesPool, fightStyleFor, pickSpecies, rollSizeWeight, styleIdFor,
} from './species.js';
import { createRodRig } from './rod.js';
import { createFishingScene } from './scene.js';
import { createLandingNet } from './net.js';
import { createFightCam } from './fight-cam.js';
import { createQTE } from './qte.js';
import {
  createFishTurntable, addToBag, bagItems, bagCount, bagTotalKg, takeBagItem,
} from './bag.js';
import { createFishingUI } from '../ui/fishing.js';
import { isProtectedSpecies, advisoryFor, guideFor } from '../data/fish-guide.js';
import { createFishingAudio } from '../audio/fishing-audio.js';

const DEG = Math.PI / 180;
const ELEVATION = 20 * DEG;
const GRAVITY = 9.8;

// The angler stands on the pontoon, looking out across the sunset sea.
const BASE_POS = new THREE.Vector3(0.15, 2.06, 2.9);
const BASE_YAW = 0.105;
const BASE_PITCH = -0.035;
const PLAYER_X = BASE_POS.x;
const PLAYER_Z = BASE_POS.z;

// Round-4 line game:
const SPOOL_MAX = 200;          // metres of line on the reel (round 6)
const CAST_MIN = 10;            // shortest cast
const CAST_MAX = 120;           // longest cast (== spool)
const CHARGE_TIME = 2.0;        // seconds from tap to full charge
const WHEEL_MAX_RATE = 5.5;     // m/s hard cap for wheel reel/feed
const WHEEL_EVENT_CLAMP = 1.1;  // m per wheel event (no free-spin teleport)
const WHEEL_PENDING_MAX = 4;    // queued metres
const FIGHT_MIN_LINE = 6.2;     // world line floor (net/scene still works)
const SHORE_DIST = 6.5;         // displayed distance that means “shore” → netting
const SHORE_LINE = 6.5;         // lineOut fallback for the same shore trigger
const NET_PRESENT_DIST = 8.45;  // fixed water spot beyond the pontoon nose
const NET_PRESENT_YAW = 0.08;   // fixed outward bearing for the net presentation
const NET_CAM_DIST = 3.9;       // camera→fish distance that starts netting
const DECK_EDGE_Z = -3.47;      // pontoon nose
const AUTO_REEL_MAX = 6.5;      // m/s auto-reel while the fish is far away

// Legacy debug fields keep sensible numbers for older QA hooks.
const S_GREEN_LOW = 0.30;
const S_GREEN_HIGH_MAX = 0.80;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _lineEnd = new THREE.Vector3();
const _fishPos = new THREE.Vector3();
const _fishPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, thrashPhase: 0, tilt: 0, leap: 0, contact: 1 };
const _screen = new THREE.Vector2();
const _screen2 = new THREE.Vector2();

function fmt(n, d = 1) { return Number(n).toFixed(d); }

export function createFishing(engine, appState, ctx) {
  const app = appState;
  const camera = engine.camera;
  const sceneSet = createFishingScene(engine, app, ctx);
  const fightCam = createFightCam(engine);
  const rig = createRodRig(engine, camera);
  const net = createLandingNet(engine, camera);
  const turntable = createFishTurntable(ctx);
  const ui = createFishingUI();
  const audio = createFishingAudio(app);
  const el = document.getElementById('fishing');
  const qte = createQTE();

  // ---- persistent equipment state --------------------------------------
  const leaderWear = {};
  for (const l of LEADERS) leaderWear[l.id] = 0;
  let lure = LURE_BY_ID.minnow;
  let leader = LEADER_BY_ID.fc16;
  let wear = 0;                 // legacy debug field only (no durability any more)
  let rodSpec = {};
  let profile = rodProfile(rodSpec);

  // ---- runtime state ----------------------------------------------------
  const S = {
    RIGGED: 'rigged',
    CASTING: 'casting',
    RETRIEVING: 'retrieving',
    BITE: 'bite',
    FIGHTING: 'fighting',
    NETTING: 'netting',
    LANDED: 'landed',
    ESCAPING: 'escaping',
  };
  let state = S.RIGGED;
  let active = false;
  let enabled = false;
  let time = 0;
  let stateTime = 0;
  let gearOpen = false;
  let bagOpen = false;
  let bagSelected = 0;
  let prewarmed = false;

  let sweep = 0;
  let sweepTarget = 0;
  let strikeEnv = 0;
  let snapEnv = 0;
  let autoReel = false;         // click toggle while retrieving
  let virtualReel = false;      // touch/mouse hold buttons
  let virtualFeed = false;
  let pointerOnUI = false;
  let pointerDownAt = 0;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDrag = 0;
  let moveDX = 0;
  let moveDY = 0;
  let lastMoveX = 0;
  let lastMoveY = 0;
  let twitchEnergy = 0;

  // cast charge (Space hold)
  let charging = false;
  let charge = 0;              // 0..1
  let chargeT = 0;
  let castCharge = CAST_MIN;

  // wheel reel/feed (rate-limited)
  let wheelPending = 0;        // metres queued by wheel events (+ feed / − reel)
  let wheelEventDelta = 0;     // last event delta for audio/visuals
  let reelVisual = 0;          // 0..1 reel-hand spin visual
  let wheelSpin = 0;           // accumulated reel-hand rotation

  let castClock = 0;
  let castReleased = false;
  let castDelay = 0;
  let recastLock = 0;
  const castOrigin = new THREE.Vector3();
  const castVel = new THREE.Vector3();
  let castYaw = 0;
  let castDist = 18;
  let castTarget = 18;

  const lureWorld = new THREE.Vector3();
  let lineOut = 0;
  let lureDepth = 0;
  let speed = 0;
  let waterTime = 0;
  let bitePressure = 0;
  let bitesNear = 0;
  let bitesFar = 0;
  let lastBiteLineOut = 0;
  let lastBiteFactor = 1;
  let shoreNet = false;
  let shoreTrigger = '';
  let biteCooldown = 0;
  let biteT = 0;
  let biteWindow = 3.0;
  let biteSpecies = null;
  let biteQuality = 0;
  let hintTimer = 0;
  let spoolMax = SPOOL_MAX;

  const pool = { list: [], source: 'fallback' };
  let poolVersion = '';
  let poolCheck = 0;

  // fight / QTE
  let fight = null;
  let fightTime = 0;
  let fightYaw = 0;
  let fightThrash = 0;
  let fightSurge = 0;
  let leapPrev = 0;
  let fightSplashTimer = 0;
  let lastQtePhase = 'idle';
  let hitFlashT = 0;
  let missFlashT = 0;
  let camKick = 0;
  let camDolly = 0;          // 0 = standing at the rod, 1 = leaning over the edge
  let dollyTarget = 0;
  let fishWorldPos = new THREE.Vector3();
  let fightStyle = null;
  let hookLineOut = 0;        // line-out at the strike (the actual hook distance)
  let qteDone = false;        // QTE finished → finishing the pull-in before netting
  let autoReelFight = true;
  let fishDist = 0;           // camera→fish distance
  let fightHold = false;      // QA: freeze the auto-reel without changing the HUD
  let runSweep = 0;           // rod/camera pull offset during a surge
  let runDir = 1;
  let lungePos = 0;           // spring: negative = lurching toward the angler
  let lungeVel = 0;
  let missStreak = 0;
  let lockUsed = false;       // one power-lock per fight, no soft-lock
  let lockStartLine = 0;
  let postLockRun = 0;
  let jumpLock = 0;
  let jumpSpike = 0;
  let fightClock = 0;
  let rodReelRate = 0;
  let nextSizeOverride = null;
  let lineRunActive = false;
  let lineRunT = 0;
  let lineRunDur = 0;
  let lineRunRate = 0;
  let lineRunPeeled = 0;
  let lineRunCount = 0;

  // escape
  let escapeT = 0;
  let escapeDur = 1.75;
  let escapeStartDist = 0;
  let escapeSplashed = false;
  let escaped = 0;
  let escapeReason = '';
  let spoolBreakT = 0;

  const _audioState = { reeling: false, runActive: false, locked: false };
  const _fightInfo = {
    seq: 0, lineOut: 0, fishDist: 0, camDist: 0, spoolLeft: SPOOL_MAX,
    autoReel: true, locked: false, dir: 1, sweep: 0, ready: false,
    timeLeft: 0, phase: 'idle', progress: 0, charge: 0, charging: false,
    castDistance: CAST_MIN, message: '',
  };

  // netting
  let nettingT = 0;
  let netOverlap = false;
  let netScoopT = -1;
  let netRunT = 0;
  let netReminder = 0;
  let netScoopDone = false;

  // catch
  let catchInfo = null;
  let catchTimer = 0;
  let catchCardShown = false;
  let activeFighter = null;
  let fighterIsShared = false;

  // stats
  let catches = 0;
  let kept = 0;
  let misses = 0;
  let breaks = 0;
  let slacks = 0;
  let lastEvent = '';
  let lastEventKind = 'info';
  let messageTimer = 0;

  let offKey = null;
  let offKeyUp = null;
  let offSpace = null;
  let offPointerDown = null;
  let offPointerUp = null;
  let offPointerMove = null;
  let offWheel = null;
  let offHide = null;
  let offVis = null;

  // legacy HUD/debug fields (leader durability removed in round 4)
  let safeHigh = 0.68;
  let dragNorm = 0.42;
  let dragKg = 2.4;
  let shake = 0;

  // -----------------------------------------------------------------------
  // helpers
  // -----------------------------------------------------------------------
  function setState(next) {
    state = next;
    stateTime = 0;
  }

  function spoolLeft() {
    return Math.max(0, spoolMax - lineOut);
  }

  function hushAudio() {
    // transient only: the HUD sound preference is sticky and never auto-off
    try { audio.hush(); } catch (e) { /* noop */ }
  }

  function clampLine(v, min = 0.9) {
    return clamp(Number(v) || 0, min, spoolMax);
  }

  function message(text, kind = 'info', seconds = 2.6) {
    lastEvent = text;
    lastEventKind = kind;
    messageTimer = seconds;
    ui.note(text, kind, seconds);
  }

  function setAmbientMode(mode) {
    try { ctx?.fish?.setAmbientMode?.(mode); } catch (e) { /* noop */ }
  }

  // Hide the ambient surface pods while the hooked fish owns the stage. The
  // fish system reads app.mode for its pods, so toggling setAmbientMode alone
  // cannot blank them during the fight.
  function setSurfaceLifeVisible(v) {
    try { ctx?.fish?.setVisible?.(!!v); } catch (e) { /* noop */ }
    if (v) setAmbientMode('fishing');
  }

  function depthScore() {
    const [lo, hi] = lure.band;
    if (lureDepth >= lo - 0.15 && lureDepth <= hi + 0.15) return 1;
    const d = lureDepth < lo ? lo - lureDepth : lureDepth - hi;
    return clamp(1 - d / (lo < 0.45 ? 0.9 : 2.6));
  }

  function actionScore(sp = speed) {
    const [lo, hi] = lure.speed;
    if (sp >= lo && sp <= hi) return 1;
    const d = sp < lo ? lo - sp : sp - hi;
    return clamp(1 - d / 0.95);
  }

  function biteDistanceFactor(distance = lineOut) {
    // near casts are much less attractive; far casts are the productive water.
    return clamp(0.15 + Math.max(0, Number(distance) - 10) * 0.0095, 0.15, 1.0);
  }

  function biteQualityNow() {
    const d = depthScore();
    const a = actionScore();
    let q = d * (0.35 + 0.65 * a);
    if (lure.twitch && twitchEnergy > 0.18) q = Math.max(q, q * 0.5 + 0.55 * d);
    return q;
  }

  function expectedCatchDistance() {
    return clamp(profile.castDistanceFor(lure) * 0.94, CAST_MIN, spoolMax);
  }

  function clampBandDepth(d) {
    return Math.max(0, Math.min(24, d));
  }

  function actionLabel() {
    if (state === S.RETRIEVING) {
      const [lo, hi] = lure.speed;
      if (waterTime < 2.6 && lureDepth < lure.band[0] - 0.05) return '拟饵下潜中 · 滚轮收线';
      if (speed > hi + 0.35) return '收线偏快 · 滚轮轻收';
      if (speed > 0.05 && speed < lo - 0.15) return '收线偏慢 · 滚轮向上';
      if (lureDepth < lure.band[0] - 0.25) return `水层偏浅 · 沉到 ${lure.band[0].toFixed(1)}–${lure.band[1].toFixed(1)} M`;
      if (lureDepth > lure.band[1] + 0.35) return '水层偏深 · 滚轮收线抬升';
      return `${lure.nameCn} · ${lure.hint}`;
    }
    if (state === S.RIGGED) return charge > 0 ? `蓄力 ${Math.round(charge * 100)}% · 松开抛竿` : '按住空格蓄力 · 拖拽摆竿';
    if (state === S.CASTING) return '出手 · 等拟饵落水';
    if (state === S.BITE) return '空格刺鱼';
    if (state === S.FIGHTING) {
      if (qte.phase === 'done') return '收线中 · 把鱼拉到脚边';
      if (qte.state.locked) return '它太有力了 · 继续抽竿';
      if (qte.state.ready) return '空格 · 刺鱼';
      return qte.state.dir > 0 ? '向右抽竿 →' : '← 向左抽竿';
    }
    if (state === S.NETTING) return '把抄网拖到鱼上';
    if (state === S.ESCAPING) return '鱼脱钩游走了 · 收线重抛';
    return '';
  }

  function promptData() {
    switch (state) {
      case S.RIGGED:
        return {
          cn: charge > 0 ? `蓄力 ${Math.round(charge * 100)}%` : '按住空格蓄力 · 松开抛竿',
          en: charge > 0 ? `${Math.round(castCharge)} M` : 'CHARGE & CAST',
          sub: '鼠标拖拽摆竿 · 空格刺鱼',
          bite: false,
        };
      case S.CASTING:
        return { cn: '出手', en: 'CASTING', sub: '拟饵飞行中', bite: false };
      case S.RETRIEVING:
        return {
          cn: actionLabel(),
          en: 'RETRIEVE',
          sub: `${lure.nameCn} · 滚轮 收线 / 放线 · 线杯 ${Math.round(spoolLeft())} M`,
          bite: false,
        };
      case S.BITE:
        return { cn: '咬口！空格刺鱼', en: 'BITE — SPACE', sub: '空格刺鱼 · 3 秒窗口', bite: true };
      case S.FIGHTING:
        return { cn: '', en: 'FIGHT · QTE', sub: '', bite: false };
      case S.NETTING:
        return { cn: '', en: 'NET · 抄鱼', sub: '', bite: false };
      case S.LANDED:
        return { cn: '上鱼了 · 举竿', en: 'LANDED', sub: '保持这个瞬间', bite: false };
      case S.ESCAPING:
        return { cn: '鱼脱钩游走了', en: 'FISH GONE', sub: '收线 · 再抛一竿', bite: false };
      default:
        return { cn: '', en: '', sub: '', bite: false };
    }
  }

  // -----------------------------------------------------------------------
  // species pool
  // -----------------------------------------------------------------------
  function refreshPool(force = false) {
    poolCheck += 1;
    if (!force && poolCheck % 300 !== 0) return;
    const shared = ctx?.fish?.species?.length || 0;
    const version = `${shared}:${ctx?.fish?.ready ? 1 : 0}`;
    if (!force && version === poolVersion && pool.list.length) return;
    poolVersion = version;
    const built = buildSpeciesPool(ctx?.fish);
    pool.list = built.list;
    pool.source = built.source;
  }

  function refreshEquipmentVisuals() {
    rig.setLure(lure);
    rig.setLeader(leader, 0);
    ui.setEquipment({
      lureId: lure.id,
      leaderId: leader.id,
      rodSpec: profile,
    });
  }

  // -----------------------------------------------------------------------
  // camera
  // -----------------------------------------------------------------------
  let camShakeYaw = 0;
  let camShakePitch = 0;
  let camShakeRoll = 0;
  let camZ = BASE_POS.z;
  let camY = BASE_POS.y;
  let camPitchS = BASE_PITCH;
  let camYawS = BASE_YAW;

  function fishScreenPoint(out = _screen) {
    const p = fishWorldPos;
    return engine.screenFromWorld(_v.set(p.x, 0.16, p.z), out);
  }

  function aimAtFish() {
    const dx = fishWorldPos.x - BASE_POS.x;
    const dz = fishWorldPos.z - camZ;
    const horiz = Math.max(0.3, Math.hypot(dx, dz));
    return {
      yaw: Math.atan2(-dx, -dz),
      pitch: Math.atan2(fishWorldPos.y - camY, horiz),
      horiz,
    };
  }

  function updateCamera(dt) {
    const t = time;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const portraitish = aspect < 0.9;
    let targetFov = portraitish ? 58 : 52;
    if (state === S.FIGHTING) {
      // far fish → longer lens (keeps it readable); as it nears, back to normal
      const d = Math.max(4, fishDist || lineOut);
      const zoom = clamp(1 - (d - 8) / 70, 0, 1);
      targetFov = portraitish
        ? 28 + 34 * zoom
        : 24 + 30 * zoom;
    }
    if (state === S.NETTING || state === S.LANDED) targetFov = portraitish ? 62 : 56;
    if (state === S.ESCAPING) targetFov = portraitish ? 46 : 40;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = damp(camera.fov, targetFov, state === S.FIGHTING ? 4.2 : 2.2, dt);
      camera.updateProjectionMatrix();
    }

    // where the angler stands: 0 at the rod, 1 leaning over the water
    const fighting = state === S.FIGHTING || state === S.NETTING || state === S.LANDED || state === S.ESCAPING;
    if (state === S.NETTING) dollyTarget = 1;
    else if (state === S.LANDED) dollyTarget = 1;
    else if (state === S.FIGHTING) {
      // only bring the deck into frame once the fish is close enough to matter
      dollyTarget = clamp((26 - lineOut) / 17, 0, 1);
    } else if (state === S.ESCAPING) dollyTarget = 1;
    else dollyTarget = 0;
    camDolly = damp(camDolly, dollyTarget, 2.4, dt);
    const targetZ = BASE_POS.z + (DECK_EDGE_Z + 1.32 - BASE_POS.z) * camDolly;
    const targetY = BASE_POS.y + 0.10 * camDolly;
    camZ = damp(camZ, targetZ, 2.4, dt);
    camY = damp(camY, targetY, 2.6, dt);

    const bobX = Math.sin(t * 0.31) * 0.011 + Math.sin(t * 0.73) * 0.004;
    const bobY = Math.sin(t * 0.55) * 0.013 + Math.sin(t * 1.07) * 0.003;
    let yaw = BASE_YAW + sweep * 0.18;
    let pitch = BASE_PITCH;
    let roll = Math.sin(t * 0.27) * 0.0045 + sweep * 0.02;

    // strike kick + cast weight shift
    pitch += strikeEnv * 0.085;
    if (state === S.CASTING) {
      const ph = clamp(castClock / 0.95);
      pitch += Math.sin(ph * Math.PI) * 0.012;
    }
    if (state === S.RETRIEVING || state === S.BITE) {
      // castYaw is a world bearing (atan2(dx,-dz)); camera.rotation.y uses the
      // opposite sign, hence the negation.
      yaw += clamp((-castYaw - BASE_YAW) * 0.34, -0.2, 0.22);
    }

    if (fighting) {
      const aim = aimAtFish();
      const blend = state === S.FIGHTING || state === S.ESCAPING ? 0.62 : 0.86;
      yaw = BASE_YAW + clamp((aim.yaw - BASE_YAW) * blend, -0.7, 0.7);
      let aimPitch;
      if (state === S.FIGHTING) {
        // keep the fish framed; as it comes closer look further down so the
        // pontoon nose and deck enter the shot naturally
        const near = clamp((26 - lineOut) / 20, 0, 1);
        aimPitch = clamp(aim.pitch * (0.72 + 0.28 * near), -0.66, 0.04);
      } else if (state === S.ESCAPING) {
        aimPitch = clamp(aim.pitch * 0.8, -0.7, 0.02);
      } else {
        aimPitch = clamp(aim.pitch * 0.74, -0.5, -0.12);
      }
      pitch = aimPitch;
      // a surge physically pulls the angler: yaw drags, a little roll on top
      if (state === S.FIGHTING) {
        yaw += runSweep * 0.075;
        roll += runSweep * 0.16;
      }
      // impact recoil
      const kick = camKick;
      pitch += kick * 0.05;
      yaw += kick * 0.012 * Math.sin(t * 22);
      roll += kick * 0.012;
      camShakeYaw = Math.sin(t * 41.3) * (0.0018 + kick * 0.004);
      camShakePitch = Math.sin(t * 53.7 + 1.2) * (0.0016 + kick * 0.003);
      camShakeRoll = Math.sin(t * 31.1 + 0.5) * (0.002 + kick * 0.004);
      if (state === S.FIGHTING && qte.phase === 'break') {
        camShakeYaw += Math.sin(t * 27.4) * 0.0024 * (0.4 + Math.abs(runSweep));
      }
      yaw += camShakeYaw;
      pitch += camShakePitch;
      roll += camShakeRoll;
    } else if (state === S.LANDED) {
      camShakeYaw = Math.sin(t * 37) * 0.002;
      yaw += camShakeYaw;
    }

    camKick = Math.max(0, camKick - dt * 5.2);
    camYawS = yaw;
    camPitchS = pitch;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, roll);
    camera.position.set(
      BASE_POS.x + bobX + camShakeYaw * 0.6 + (state === S.FIGHTING ? runSweep * 0.05 : 0),
      camY + bobY,
      camZ - camKick * 0.12,
    );
    camera.updateMatrixWorld(true);
    app.cameraDepth = Math.max(0, -camera.position.y);
  }

  // -----------------------------------------------------------------------
  // input — mouse left / move, wheel, Space only (Esc = hidden fallback)
  // -----------------------------------------------------------------------
  function bindInput() {
    offKey = (e) => {
      if (!active) return;
      if (e.code === 'Space') {
        // keep Space from scrolling the page; it is our charge / QTE key
        e.preventDefault();
        if (e.repeat) return;
        onSpaceDown();
        return;
      }
      if (e.code === 'Escape') {
        // accessibility fallback only; never advertised
        if (bagOpen) { closeBag(); return; }
        if (gearOpen) { toggleGear(false); return; }
        if (catchCardShown) return;
        app.actions?.exitFishing?.();
      }
    };
    offKeyUp = (e) => {
      if (!active || e.code !== 'Space') return;
      e.preventDefault();
      onSpaceUp();
    };
    offPointerDown = (e) => {
      pointerOnUI = !!e.target?.closest?.('.fis-click');
      pointerDownAt = performance.now();
      pointerDownX = e.clientX || 0;
      pointerDownY = e.clientY || 0;
      pointerDrag = 0;
      lastMoveX = e.clientX || 0;
      lastMoveY = e.clientY || 0;
      if (!pointerOnUI) ui.blurFocus?.();
    };
    offPointerMove = (e) => {
      if (!active) return;
      const dx = (e.clientX || 0) - lastMoveX;
      const dy = (e.clientY || 0) - lastMoveY;
      lastMoveX = e.clientX || 0;
      lastMoveY = e.clientY || 0;
      if (!pointerOnUI) { moveDX += dx; moveDY += dy; }
    };
    offPointerUp = (e) => {
      if (!active) return;
      const now = performance.now();
      const isClick = !pointerOnUI && (now - pointerDownAt) < 320
        && Math.abs((e.clientX || 0) - pointerDownX) < 9
        && Math.abs((e.clientY || 0) - pointerDownY) < 9;
      if (!pointerOnUI && !gearOpen && !bagOpen && !catchCardShown && state === S.NETTING) {
        attemptScoop('release', e.clientX, e.clientY);
      } else if (isClick) {
        handleClick();
      }
      pointerOnUI = false;
      pointerDrag = 0;
    };
    offWheel = (e) => {
      if (!active || gearOpen || bagOpen || catchCardShown) return;
      if (e.target?.closest?.('.fis-gear, .fis-bag')) return;
      // scroll never drives the game; wheel is our reel/feed control
      e.preventDefault();
      if (state !== S.RETRIEVING) return;
      const raw = Number(e.deltaY) || 0;
      if (Math.abs(raw) < 0.001) return;
      // wheel up (deltaY < 0) = reel in, down = feed; per-event clamp so a
      // free-spinning wheel cannot teleport the line
      const step = clamp(Math.abs(raw), 1, 240) / 120 * WHEEL_EVENT_CLAMP;
      wheelPending = clamp(wheelPending + (raw > 0 ? step : -step), -WHEEL_PENDING_MAX, WHEEL_PENDING_MAX);
      wheelEventDelta = raw;
    };
    window.addEventListener('keydown', offKey, { passive: false });
    window.addEventListener('keyup', offKeyUp, { passive: false });
    window.addEventListener('pointerdown', offPointerDown, true);
    window.addEventListener('pointermove', offPointerMove, true);
    window.addEventListener('pointerup', offPointerUp, true);
    window.addEventListener('wheel', offWheel, { passive: false });
    offHide = () => { try { audio.panic(); } catch (e) { /* noop */ } };
    offVis = () => {
      try {
        if (document.visibilityState === 'hidden') audio.panic();
        else audio.restore();
      } catch (e) { /* noop */ }
    };
    window.addEventListener('pagehide', offHide);
    document.addEventListener('visibilitychange', offVis);
  }

  function unbindInput() {
    if (offKey) window.removeEventListener('keydown', offKey);
    if (offKeyUp) window.removeEventListener('keyup', offKeyUp);
    offKey = offKeyUp = null;
    if (offPointerDown) window.removeEventListener('pointerdown', offPointerDown, true);
    if (offPointerMove) window.removeEventListener('pointermove', offPointerMove, true);
    if (offPointerUp) window.removeEventListener('pointerup', offPointerUp, true);
    if (offWheel) window.removeEventListener('wheel', offWheel);
    if (offHide) window.removeEventListener('pagehide', offHide);
    if (offVis) document.removeEventListener('visibilitychange', offVis);
    offPointerDown = offPointerMove = offPointerUp = offWheel = null;
    offHide = offVis = null;
    moveDX = moveDY = 0;
    wheelPending = 0;
  }

  function onSpaceDown() {
    if (!active) return;
    if (bagOpen || gearOpen) return;
    if (state === S.RIGGED) { startCharge(); return; }
    if (state === S.RETRIEVING) {
      if (recastLock <= 0) {
        recallLure();
        recallToCharge = true;
        startCharge();
      }
      return;
    }
    if (state === S.BITE) { tryStrike('space'); return; }
    if (state === S.FIGHTING) {
      if (lineRunActive) {
        message('鱼在拉线 · 不要操作', 'warn', 1400);
        return;
      }
      confirmQTE();
      return;
    }
    // Space is QTE-only; netting requires a left click inside the guide circle.
  }

  function onSpaceUp() {
    if (!charging) return;
    // a stale charge must never hijack a QTE/landing beat
    if (state !== S.RIGGED) {
      charging = false;
      charge = 0;
      chargeT = 0;
      audio.chargeEnd();
      return;
    }
    releaseCast();
  }

  function handleClick() {
    if (gearOpen || bagOpen || catchCardShown) return;
    if (state === S.BITE) {
      message('空格刺鱼 · 鼠标不再刺鱼', 'info', 1500);
      return;
    }
    if (state === S.RETRIEVING) {
      autoReel = !autoReel;
      message(autoReel ? '自动收线 · 再点停止' : '停止收线', 'info', 1.2);
    }
  }

  function tryStrike(source) {
    if (state !== S.BITE) return;
    if (biteT > biteWindow) return;
    beginFight();
  }

  // wheel/hold state — used by the HUD and audio
  function isReeling() {
    if (!active || gearOpen || bagOpen) return false;
    if (state !== S.RETRIEVING) return false;
    return wheelPending < -0.01 || virtualReel || autoReel;
  }

  function isFeeding() {
    if (!active || gearOpen || bagOpen) return false;
    if (state !== S.RETRIEVING) return false;
    return wheelPending > 0.01 || virtualFeed;
  }

  function updatePointerControl(dt) {
    const p = app.pointer;
    const dx = moveDX;
    const dy = moveDY;
    moveDX = 0;
    moveDY = 0;
    if (pointerOnUI || gearOpen || bagOpen) {
      sweepTarget = damp(sweepTarget, 0, 4.2, dt);
      sweep = damp(sweep, sweepTarget, 11, dt);
      return;
    }
    // QTE horizontal sweeps read raw pointer movement (with or without click)
    if (state === S.FIGHTING && !lineRunActive && dx !== 0) qte.sweepInput(dx);
    if (p.down) {
      sweepTarget = clamp(sweepTarget - dx * 0.0036, -0.62, 0.62);
      pointerDrag += Math.abs(dx);
      twitchEnergy = Math.min(1, twitchEnergy + Math.abs(dx) * 0.004 + Math.abs(dy) * 0.0015);
    } else {
      sweepTarget = damp(sweepTarget, 0, 4.2, dt);
    }
    sweep = damp(sweep, sweepTarget, 11, dt);
    twitchEnergy = Math.max(0, twitchEnergy - dt * 1.35);
  }

  // -----------------------------------------------------------------------
  // cast charge (hold Space 0 → 2 s, release to cast 10–120 m)
  // -----------------------------------------------------------------------
  let recallToCharge = false;

  function startCharge() {
    if (state !== S.RIGGED || gearOpen || bagOpen) return false;
    if (recallToCharge) recallToCharge = false;
    charging = true;
    charge = 0;
    chargeT = 0;
    castCharge = CAST_MIN;
    sceneSet.setFightMarker(null, false);
    refreshPool();
    autoReel = false;
    wheelPending = 0;
    audio.chargeStart();
    // a previous cast's "落水 62 m" toast must not contradict this charge meter
    messageTimer = 0;
    lastEvent = '';
    ui.note('', 'info', 0);
    return true;
  }

  function updateCharge(dt) {
    if (!charging) return;
    chargeT = Math.min(CHARGE_TIME, chargeT + dt);
    charge = clamp(chargeT / CHARGE_TIME, 0, 1);
    castCharge = clamp(CAST_MIN + (CAST_MAX - CAST_MIN) * charge, CAST_MIN, spoolMax);
    audio.chargeUpdate(charge);
  }

  function releaseCast() {
    if (!charging) return;
    if (state !== S.RIGGED) {
      charging = false;
      charge = 0;
      chargeT = 0;
      audio.chargeEnd();
      return;
    }
    charging = false;
    audio.chargeEnd();
    const lureOver = lure.weightG > (profile.lureMaxG ?? 21);
    const castFactor = (profile.castFactor ?? 1) * (lureOver ? 0.82 : 1);
    const dist = clamp(
      castCharge * castFactor,
      CAST_MIN,
      Math.min(CAST_MAX, profile.maxCastM ?? CAST_MAX, spoolMax),
    );
    sceneSet.setFightMarker(null, false);
    setState(S.CASTING);
    castClock = 0;
    castReleased = false;
    castTarget = dist;
    castDist = dist;
    speed = 0;
    lineOut = 0;
    lureDepth = 0;
    bitePressure = 0;
    biteCooldown = 0;
    wheelPending = 0;
    ui.promptFlash('');
    audio.cast();
  }

  // -----------------------------------------------------------------------
  // casting / retrieving
  // -----------------------------------------------------------------------
  function releaseLure() {
    rig.tipWorld(castOrigin);
    const dist = clamp(castTarget, CAST_MIN, spoolMax);
    const elev = ELEVATION;
    const h = Math.max(0.6, castOrigin.y);
    let v = Math.sqrt((GRAVITY * dist) / Math.sin(2 * elev));
    for (let i = 0; i < 3; i++) {
      const vy = v * Math.sin(elev);
      const vx = v * Math.cos(elev);
      const flight = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * h)) / GRAVITY;
      const range = vx * flight;
      v *= Math.sqrt(dist / Math.max(4, range));
    }
    const yaw = BASE_YAW + sweep * 0.3;
    _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
    castVel.set(
      _fwd.x * v * Math.cos(elev),
      v * Math.sin(elev),
      _fwd.z * v * Math.cos(elev),
    );
    lureWorld.copy(castOrigin);
    castReleased = true;
    castDist = dist;
  }

  function updateCasting(dt) {
    castClock += dt;
    if (!castReleased) {
      if (castClock >= 0.36) releaseLure();
      return;
    }
    castVel.y -= GRAVITY * dt;
    lureWorld.addScaledVector(castVel, dt);
    if (lureWorld.y <= 0.02) {
      lureWorld.y = 0.02;
      splashAt(lureWorld, clamp(0.55 + Math.abs(castVel.y) * 0.04, 0.5, 1.7), 22);
      const dx = lureWorld.x - PLAYER_X;
      const dz = lureWorld.z - PLAYER_Z;
      lineOut = clampLine(Math.max(2.2, Math.hypot(dx, dz)), 2.2);
      castYaw = Math.atan2(dx, -dz);
      lureDepth = 0;
      waterTime = 0;
      bitePressure = 0;
      biteCooldown = 0;
      setState(S.RETRIEVING);
      audio.splash(0.8);
      ui.promptFlash('splash');
      message(`落水 ${fmt(lineOut, 1)} M · 开始收线`, 'info', 2200);
      if (lure.speed[0] <= 0.05) message('', 'info', 0.1);
    }
    if (castClock > 4.2) {
      const dx = lureWorld.x - PLAYER_X;
      const dz = lureWorld.z - PLAYER_Z;
      lineOut = clampLine(Math.max(3, Math.hypot(dx, dz)), 2.2);
      castYaw = Math.atan2(dx, -dz);
      setState(S.RETRIEVING);
    }
  }

  function splashAt(pos, strength = 1, count = null, quiet = false) {
    _v.set(pos.x, 0.02, pos.z);
    sceneSet.splash(_v, strength, count);
    if (!quiet) sceneSet.ripple(_v, 0.3 + strength * 0.4);
  }

  function recallLure() {
    if (state === S.FIGHTING || state === S.BITE || state === S.NETTING) return;
    sceneSet.setFightMarker(null, false);
    lineOut = 0;
    lureDepth = 0;
    speed = 0;
    autoReel = false;
    wheelPending = 0;
    bitePressure = 0;
    setState(S.RIGGED);
    ui.promptFlash('');
  }

  function updateRetrieving(dt) {
    waterTime += dt;
    biteCooldown = Math.max(0, biteCooldown - dt);
    const reeling = isReeling();
    const feeding = isFeeding();
    // wheel input is applied at a hard rate cap, never as an instant jump
    const wheelStep = clamp(wheelPending, -WHEEL_MAX_RATE * dt, WHEEL_MAX_RATE * dt);
    wheelPending -= wheelStep;
    lineOut += wheelStep;
    // touch hold buttons use the same cap; click auto-reel is slow and capped
    if (virtualReel) lineOut -= Math.min(WHEEL_MAX_RATE, 3.4) * dt;
    if (virtualFeed) lineOut += Math.min(WHEEL_MAX_RATE, 3.4) * dt;
    if (autoReel) lineOut -= Math.min(WHEEL_MAX_RATE, 2.2) * dt;
    lineOut -= 0.045 * dt;
    lineOut = clamp(lineOut, 0.9, spoolMax);
    speed = Math.abs(wheelStep) / Math.max(1e-4, dt);
    reelVisual = damp(reelVisual, Math.min(1, speed / WHEEL_MAX_RATE), 8, dt);
    wheelSpin += speed * dt * 2.2;

    const lift = lure.lift * (speed / 2.2);
    lureDepth += (lure.sink - lift) * dt;
    if (lureDepth < 0) lureDepth = 0;
    if (!reeling && !feeding) lureDepth += lure.sink * dt * 0.25;
    lureDepth = clampBandDepth(lureDepth);

    lureWorld.set(
      PLAYER_X + Math.sin(castYaw) * lineOut,
      -lureDepth,
      PLAYER_Z - Math.cos(castYaw) * lineOut,
    );

    const surfaceLure = lure.band[1] <= 0.5;
    if (surfaceLure || lureDepth < 0.35) {
      _v.set(lureWorld.x, 0.02, lureWorld.z);
      sceneSet.wake(_v, 0.28 + speed * 0.1, 0.5);
    }

    if (lineOut <= 1.15) {
      recallLure();
      message('已收回脚下 · 再抛一竿', 'info', 2000);
      return;
    }

    if (biteCooldown <= 0) {
      const q = biteQualityNow();
      bitePressure += dt * (0.055 + q * 0.62) * biteDistanceFactor(lineOut);
      hintTimer += dt;
      if (q < 0.28 && hintTimer > 5.5) {
        hintTimer = 0;
        message(actionLabel(), 'warn', 2800);
      }
      const forceAt = waterTime > 16 ? true : false;
      if (bitePressure > 1.05 || (forceAt && bitePressure > 0.35)) {
        triggerBite();
      }
    }
  }

  function triggerBite(speciesOverride = null) {
    const species = speciesOverride || pickSpecies(pool.list, lure, lureDepth);
    if (!species) return false;
    biteSpecies = species;
    biteQuality = clamp(biteQualityNow() * 0.6 + 0.4, 0.2, 1);
    // round 7: a ~3 s, readable strike window (species speed 2.8–3.4 s)
    biteWindow = 2.8 + clamp(species.fight.speed, 0, 1) * 0.6;
    biteT = 0;
    autoReel = false;
    wheelPending = 0;
    lastBiteLineOut = lineOut;
    lastBiteFactor = biteDistanceFactor(lineOut);
    if (lineOut < 20) bitesNear += 1;
    else if (lineOut > 70) bitesFar += 1;
    setState(S.BITE);
    splashAt(lureWorld, 0.9 + species.fight.power * 0.5, 26);
    sceneSet.setFightMarker(_v.set(lureWorld.x, 0.03, lureWorld.z), true, 0.8);
    audio.splash(1);
    // readable audio cue: the QTE-ready two-tone is a good “bite” chime
    audio.qteReady();
    strikeEnv = 0;
    ui.promptFlash('bite');
    message(`咬口 · ${species.nameCn} · 空格刺鱼`, 'bite', 2000);
    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* noop */ } }
    return true;
  }

  function updateBite(dt) {
    biteT += dt;
    lineOut = clampLine(lineOut + dt * (0.18 + (biteSpecies?.fight?.speed || 0.4) * 0.35), 2.2);
    lureWorld.set(
      PLAYER_X + Math.sin(castYaw) * lineOut,
      -Math.min(lureDepth, 0.4),
      PLAYER_Z - Math.cos(castYaw) * lineOut,
    );
    if (Math.random() < dt * 5) {
      _v.set(lureWorld.x, 0.02, lureWorld.z);
      sceneSet.ripple(_v, 0.18);
    }
    if (biteT >= biteWindow) {
      misses += 1;
      biteCooldown = 2.4;
      bitePressure = 0;
      setState(S.RETRIEVING);
      biteSpecies = null;
      sceneSet.setFightMarker(null, false);
      message('咬口已过 · 空格要更快', 'warn', 2800);
      audio.miss();
      splashAt(lureWorld, 0.5, 14);
    }
  }

  // -----------------------------------------------------------------------
  // fight — auto-reel + directional sweep QTE (round 4)
  // -----------------------------------------------------------------------
  function autoReelRate() {
    // fast while the fish is far so the pull-in stays readable, slow up close
    return clamp(1.6 + Math.max(0, lineOut - 8) * 0.18, 1.6, AUTO_REEL_MAX) * (fight?.autoScale ?? 1);
  }

  function computeGear() {
    if (!fight) return null;
    const leaderKg = Number(leader?.strengthKg) || 7.3;
    const rodSafe = Number(profile?.safeKg) || 9;
    fight.gearCapacity = Math.min(rodSafe, leaderKg * 4);
    fight.gearRisk = fight.size.weightKg > fight.gearCapacity;
    // only clearly oversized fish can cut the line during a strong run
    fight.gearCutAt = fight.size.weightKg > fight.gearCapacity * 1.65 ? 0.9 : 0;
    return fight;
  }

  function startLineRun() {
    if (!fight || lineRunActive) return false;
    lineRunActive = true;
    lineRunT = 0;
    lineRunCount += 1;
    const rp = clamp(Number(fight.runPower) || 0.7, 0.3, 1);
    lineRunDur = 1.9 + rp * 1.4;
    lineRunRate = (2.6 + rp * 2.5) * (1.12 - (Number(profile?.fightControl) || 0.98) * 0.08);
    lineRunPeeled = 0;
    fightThrash = 1;
    fightSurge = 1;
    shake = Math.max(shake, 0.35 + rp * 0.3);
    camKick = Math.max(camKick, 0.28 + rp * 0.2);
    splashAt(fishWorldPos, 1.0 + rp * 0.5, 18);
    audio.run();
    ui.showVerdict('鱼在拉线 · 不要操作', 'run');
    message('鱼在拉线 · 不要操作', 'warn', 2300);
    return true;
  }

  function startFishRun(st) {
    const power = fight?.power ?? 0.5;
    runDir = st?.dir > 0 ? 1 : -1;
    camKick = Math.max(camKick, 0.28 + power * 0.25);
    fightThrash = 1;
    fightSurge = 1;
    shake = Math.max(shake, 0.35 + power * 0.35);
    if (Math.random() < 0.35 + power * 0.2) {
      sceneSet.triggerLeap(0.6 + Math.random() * 0.35, 0.5 + Math.random() * 0.15);
    }
    splashAt(fishWorldPos, 0.9 + power * 0.45, 16);
    audio.run();
    // round 8: strong pelagics get bounded, input-locking line runs.
    // Give the run priority over the optional short lock so a big pelagic
    // always shows at least one clear run.
    const wantsLineRun = fight?.lineRunner && !lineRunActive && !qte.state.locked
      && lineRunCount < 2 && qte.round >= 2 && qte.round % 3 === 2 && lineOut > 11;
    if (wantsLineRun) {
      startLineRun();
      return;
    }
    // one short power-lock per fight, auto-releases, never a soft-lock
    if (!lockUsed && power >= 0.45 && Math.random() < 0.10 + power * 0.3) {
      lockUsed = true;
      lockStartLine = lineOut;
      qte.startLock(0.9 + power * 0.6, power);
    }
  }

  qte.setHandlers({
    onRound(round, st) {
      fightThrash = Math.max(fightThrash, 0.45);
      ui.setQteRound(round, st);
      audio.qteRound?.();
    },
    onReady() {
      audio.qteReady?.();
    },
    onNotReady() {
      audio.qteNotReady?.();
    },
    onHit(st) {
      hitFlashT = 0.7;
      missFlashT = 0;
      camKick = 0.85;
      strikeEnv = 1;
      snapEnv = 1;
      fightThrash = 1;
      fightSurge = 0.25;
      shake = 0.7;
      missStreak = 0;
      // visible lurch toward the angler on every landed sweep
      lungeVel -= 4.6;
      splashAt(fishWorldPos, 1.35 + (fight?.power || 0.5) * 0.4, 26);
      if (Math.random() < 0.35) sceneSet.triggerLeap(0.6 + Math.random() * 0.4, 0.5);
      audio.hit();
      ui.impact('hit', st);
      if (navigator.vibrate) { try { navigator.vibrate([20, 26, 34]); } catch (e) { /* noop */ } }
    },
    onMiss(st, why) {
      hitFlashT = 0;
      missFlashT = 0.75;
      fightSurge = 1;
      fightThrash = 0.7;
      camKick = Math.max(camKick, 0.45);
      missStreak += 1;
      // the fish runs: +12–20 m, clamped by the 120 m spool
      const run = 12 + Math.random() * 8;
      const before = lineOut;
      lineOut = clamp(lineOut + run, FIGHT_MIN_LINE, spoolMax);
      lungeVel += 1.2;
      splashAt(fishWorldPos, 1.2, 20);
      audio.miss();
      ui.impact('miss', st, why);
      message(`鱼向外冲了 ${Math.round(lineOut - before)} M · 线杯 ${Math.round(spoolLeft())} M`, 'warn', 2200);
      if (lineOut >= spoolMax - 0.05) {
        spoolBreakT = 0.55;
        message('线杯见底 · 线被拉断了', 'danger', 2600);
        audio.spoolBreak?.();
      }
      // round 6: only an empty spool loses the fish; misses are recoverable
      if (navigator.vibrate) { try { navigator.vibrate(20); } catch (e) { /* noop */ } }
    },
    onBreak(st) {
      if (state === S.FIGHTING) startFishRun(st);
    },
    onLock() {
      audio.lock();
      ui.showVerdict('顶住！', 'lock');
    },
    onUnlock() {
      audio.unlock();
      ui.showVerdict('它慢下来了', 'unlock');
      // exactly one short head-shake after the hold, never a second lock/run
      if (!postLockRun) postLockRun = 1;
      fightSurge = 0.6;
    },
    onDone() {
      if (state !== S.FIGHTING) return;
      qteDone = true;
      message('最后一冲 · 收线到脚边', 'catch', 1600);
    },
  });

  function beginFight() {
    const species = biteSpecies;
    if (!species) return;
    fightStyle = fightStyleFor(species);
    const size = nextSizeOverride || rollSizeWeight(species);
    nextSizeOverride = null;
    const wKg = Number(size.weightKg) || 1;
    let plannedRounds = 6;
    if (wKg > 28) plannedRounds = 12;
    else if (wKg > 12) plannedRounds = 10;
    else if (wKg > 4) plannedRounds = 8;
    if (species.fight.stamina > 0.9 && plannedRounds < 12) plannedRounds += 1;
    if (Number(size.lengthCm) > 120 && plannedRounds < 12) plannedRounds += 1;
    plannedRounds = clamp(plannedRounds, 6, 12);
    fight = {
      species, style: fightStyle, styleId: styleIdFor(species),
      power: clamp(species.fight.power, 0.1, 1),
      speed: clamp(species.fight.speed, 0.1, 1),
      stamina: clamp(species.fight.stamina, 0.1, 1),
      size,
      plannedRounds,
      // big/strong fish come in a little slower, but always finish
      autoScale: clamp(1.05 - wKg * 0.003, 0.72, 1),
      lineRuns: 0,
      lineRunner: !!species.lineRunner,
      runPower: clamp(Number(species.runPower) || species.fight.power || 0.6, 0.3, 1),
    };
    computeGear();
    fightTime = 0;
    fightYaw = castYaw;
    hookLineOut = clamp(lineOut, 4, spoolMax);
    lineOut = hookLineOut;
    fightThrash = 0.5;
    fightSurge = 0;
    leapPrev = 0;
    fightSplashTimer = 0;
    strikeEnv = 1;
    snapEnv = 1;
    camKick = 0.7;
    shake = 0.5;
    autoReel = false;
    autoReelFight = true;
    fightHold = false;
    charging = false;
    charge = 0;
    chargeT = 0;
    fightCam.setActive(true);
    qteDone = false;
    missStreak = 0;
    shoreNet = false;
    shoreTrigger = '';
    lockUsed = false;
    lockStartLine = 0;
    postLockRun = 0;
    lungePos = 0;
    lungeVel = 0;
    runSweep = 0;
    runDir = 1;
    spoolBreakT = 0;
    hitFlashT = 0;
    missFlashT = 0;
    setState(S.FIGHTING);
    setAmbientMode('off');
    setSurfaceLifeVisible(false);
    sceneSet.setFightMarker(null, false);
    sceneSet.setFightFish(species, { lengthCm: size.lengthCm, weightKg: size.weightKg, detail: 2 });
    // seed the fish at the ACTUAL hook-up position (never a fixed 10.6 m)
    fishWorldPos.set(
      PLAYER_X + Math.sin(fightYaw) * lineOut,
      -0.02,
      PLAYER_Z - Math.cos(fightYaw) * lineOut,
    );
    fishDist = Math.hypot(fishWorldPos.x - camera.position.x, fishWorldPos.z - camera.position.z);
    qte.start({ rounds: plannedRounds });
    lineRunActive = false;
    lineRunCount = 0;
    lineRunT = 0;
    lineRunPeeled = 0;
    syncFightInfo();
    updateFightFishPose(0);
    syncFightInfo();
    splashAt(fishWorldPos, 1.4, 24);
    audio.hook();
    message(`中鱼 · ${species.nameCn} · ${Math.round(hookLineOut)} M`, 'catch', 2200);
  }

  function confirmQTE() {
    if (state !== S.FIGHTING) return null;
    if (lineRunActive) return null;
    return qte.confirm();
  }

  function updateFightFishPose(dt) {
    const poseDist = clamp(lineOut + lungePos, FIGHT_MIN_LINE, spoolMax);
    const runMul = qte.phase === 'break' ? Math.min(1, qte.state.breakT / 0.22) : 0;
    const bearing = fightYaw
      + Math.sin(fightTime * 0.5) * 0.02
      + runSweep * 0.08;
    const px = PLAYER_X + Math.sin(bearing) * poseDist;
    const pz = PLAYER_Z - Math.cos(bearing) * poseDist;
    const wallow = Math.sin(fightTime * 2.15) * 0.02;
    const surgeDive = qte.phase === 'break' ? -0.06 * runMul : 0;
    // display scale: the real fish is a few pixels at 100 m, so the visual
    // model grows with distance (position is untouched) and is normal up close
    const displayScale = clamp(1 + Math.max(0, fishDist - 9) * 0.068, 1, 7.5);
    const lift = Math.min(0.36, Math.max(0, displayScale - 1) * 0.14);
    // lift the body clear of the wave crests so the visual fish is readable
    // at 30–120 m (the contact foam still grounds it on the surface)
    const baseY = 0.16 + wallow + fightSurge * 0.03 + surgeDive + lift;
    fishWorldPos.set(px, baseY, pz);
    fishDist = Math.hypot(px - camera.position.x, pz - camera.position.z);

    _fishPose.x = px;
    _fishPose.y = baseY;
    _fishPose.z = pz;
    _fishPose.yaw = Math.PI * 0.5 + Math.sin(fightTime * 0.62) * 0.35 + runDir * 0.3 * runMul;
    _fishPose.roll = Math.sin(fightTime * 3.1) * 0.18
      + fightThrash * Math.sin(fightTime * 9.2) * 0.14 - 0.04;
    _fishPose.pitch = Math.sin(fightTime * 2.2) * 0.05;
    _fishPose.thrashPhase = fightTime * (qte.state.locked ? 7 : 4.2);
    _fishPose.tilt = 0;
    _fishPose.leap = sceneSet.fishLeapY;
    _fishPose.contact = 1;
    // long-range readability: grow the visual model (position is exact) and
    // glow the water at the fish so a 116 m hook is still trackable
    _fishPose.scale = displayScale;
    sceneSet.updateFightFish(dt, _fishPose);
    const beaconOn = fishDist > 9;
    sceneSet.setFightBeacon(
      fishWorldPos, beaconOn,
      clamp((fishDist - 8) / 60, 0, 0.9),
      clamp(fishDist * 0.024, 0.35, 2.4),
    );
    if (state === S.FIGHTING && !fightHold) {
      fightCam.setActive(true);
      const realLen = (fight?.size?.lengthCm || 50) / 100;
      fightCam.render(fishWorldPos, realLen * displayScale, camera.position, dt);
    }
  }

  function updateFighting(dt, frozen = false) {
    if (!frozen) {
      fightTime += dt;
      const power = fight?.power ?? 0.5;

      // round 8: fish run — all player input is ignored while it peels line.
      if (lineRunActive) {
        lineRunT += dt;
        const step = lineRunRate * dt;
        lineOut = clamp(lineOut + step, FIGHT_MIN_LINE, spoolMax);
        lineRunPeeled += step;
        fightSurge = 1;
        fightThrash = Math.max(0.55, fightThrash - dt * 1.2);
        shake = Math.max(shake, 0.22);
        lungeVel += 0.5;
        updateFightFishPose(dt);
        fightSplashTimer -= dt;
        if (fightSplashTimer <= 0) {
          fightSplashTimer = 0.24;
          sceneSet.splash(_v2.set(fishWorldPos.x, 0.02, fishWorldPos.z), 0.9, 12);
        }
        if (fight?.gearCutAt && lineRunT >= fight.gearCutAt) {
          lineRunActive = false;
          escapeFish('gear');
          return;
        }
        if (lineOut >= spoolMax - 0.05) {
          lineRunActive = false;
          escapeFish('spool');
          return;
        }
        if (lineRunT >= lineRunDur) {
          lineRunActive = false;
          ui.showVerdict('顶住了 · 继续', 'unlock');
          message('顶住了 · 继续收线', 'catch', 1700);
        }
        return;
      }

      // auto-reel: continuous pull-in; the fish surges during a break
      if (autoReelFight && !fightHold) {
        if (!qteDone) {
          let rate = autoReelRate();
          if (qte.phase === 'break') rate *= 0.2;
          if (qte.state.locked) {
            // the lock is a short pressure hold: never peel line outward,
            // keep a minimal inward reel so the fish cannot drift away
            rate = Math.max(0.8, rate * 0.35);
            lineOut = Math.min(lineOut, lockStartLine + 1.0);
          }
          lineOut = clamp(lineOut - rate * dt, FIGHT_MIN_LINE, spoolMax);
        } else {
          // QTE is done — finish the visible pull-in before the net appears
          const finishRate = clamp(3 + (lineOut - 8) * 0.65, 3, 14);
          lineOut = clamp(lineOut - finishRate * dt, FIGHT_MIN_LINE, spoolMax);
        }
      }

      // lunge spring (also used by hits); a lock cannot push the model away
      lungeVel += (-lungePos * 34 - lungeVel * 7.2) * dt;
      lungePos = clamp(lungePos + lungeVel * dt, -10, qte.state.locked ? 0.4 : 4);

      // rod/camera pull during a surge
      runSweep = damp(runSweep, qte.phase === 'break' ? qte.state.dir * 0.6 : 0, 6, dt);

      updateFightFishPose(dt);

      // surface life
      fightSplashTimer -= dt;
      if (fightSplashTimer <= 0) {
        const surf = _v2.set(fishWorldPos.x, 0.02, fishWorldPos.z);
        if (fightThrash > 0.5 || qte.phase === 'break') {
          fightSplashTimer = 0.28;
          sceneSet.splash(surf, 0.7 + fightThrash * 0.4, 12);
          if (Math.random() < 0.3) audio.thrash();
        } else {
          fightSplashTimer = 0.7 + Math.random() * 0.4;
          sceneSet.wake(surf, 0.3 + power * 0.25, 0.55);
        }
      }
      const leapNow = sceneSet.fishLeapY;
      if (leapPrev > 0.05 && leapNow <= 0.0001) {
        splashAt(fishWorldPos, 1.0, 18);
        audio.splash(0.8);
        shake = Math.max(shake, 0.4);
      }
      leapPrev = leapNow;

      fightThrash = Math.max(0, fightThrash - dt * 2.1);
      fightSurge = Math.max(0, fightSurge - dt * 1.8);
      shake = Math.max(0, shake - dt * 2.2);

      // far fish: a low ring marker keeps it locatable
      sceneSet.setFightMarker(
        fishDist > 26 ? _v.set(fishWorldPos.x, 0.03, fishWorldPos.z) : null,
        fishDist > 26, 0.45,
      );

      // spool exhausted during a run → the line goes with the fish
      if (spoolBreakT > 0) {
        spoolBreakT -= dt;
        if (spoolBreakT <= 0) { escapeFish('spool'); return; }
      }

      // round 7: if the fish reaches the shore before the QTE rounds finish,
      // skip the remaining rounds and start netting immediately.
      if (fishDist <= SHORE_DIST || lineOut <= SHORE_LINE) {
        if (state !== S.FIGHTING) return;
        shoreNet = true;
        shoreTrigger = fishDist <= SHORE_DIST ? 'fishDist' : 'lineOut';
        qte.state.progress = 1;
        qte.stop();
        qteDone = true;
        beginNetting(true);
        return;
      }

      // pull-in complete → bring the net in at 2.5–4 m from the angler
      if (!qteDone) {
        // keep waiting for the QTE to finish
      } else if (fishDist <= NET_CAM_DIST || lineOut <= FIGHT_MIN_LINE + 0.15) {
        beginNetting(false);
        return;
      }
    }
    qte.update(dt);
    if (lastQtePhase !== qte.phase) lastQtePhase = qte.phase;
  }

  // -----------------------------------------------------------------------
  // escape — four misses / the spool runs dry
  // -----------------------------------------------------------------------
  function escapeFish(reason) {
    if (state !== S.FIGHTING) return false;
    lineRunActive = false;
    hushAudio();
    qte.stop();
    qteDone = false;
    escaped += 1;
    escapeReason = reason;
    escapeT = 0;
    escapeSplashed = false;
    escapeStartDist = Math.max(FIGHT_MIN_LINE, lineOut);
    setState(S.ESCAPING);
    fightCam.setActive(false);
    sceneSet.setFightMarker(null, false);
    sceneSet.setFightBeacon(null, false);
    audio.escape();
    ui.flashEvent('slack');
    ui.showVerdict(
      reason === 'spool' ? '线断了…' : reason === 'gear' ? '切线了…' : '跑了！',
      'escape',
    );
    message(
      reason === 'spool' ? '线杯见底 · 线被拉断了'
        : reason === 'gear' ? '线组太细 / 竿太软 · 切线了'
        : reason === 'misses' ? '连续脱钩 · 鱼游走了'
        : '鱼脱钩游走了',
      'danger', 3200,
    );
    splashAt(fishWorldPos, 1.4, 22);
    return true;
  }

  function updateEscaping(dt) {
    escapeT += dt;
    fightTime += dt;
    const k = clamp(escapeT / escapeDur);
    const e = 1 - Math.pow(1 - k, 2.2);
    const dist = escapeStartDist + 10 * e;
    const bearing = fightYaw + 0.5 * Math.min(1, k / 0.45);
    const px = PLAYER_X + Math.sin(bearing) * dist;
    const pz = PLAYER_Z - Math.cos(bearing) * dist;
    const y = -0.05 - 1.15 * Math.max(0, (k - 0.32) / 0.68);
    fishWorldPos.set(px, y, pz);
    fishDist = Math.hypot(px - camera.position.x, pz - camera.position.z);
    lineOut = clamp(dist, 0, spoolMax);

    _fishPose.x = px;
    _fishPose.y = y;
    _fishPose.z = pz;
    _fishPose.yaw = Math.PI * 0.5 + 2.5 * Math.min(1, k / 0.5);
    _fishPose.roll = 0.22 + Math.sin(escapeT * 9) * 0.08;
    _fishPose.pitch = -0.2 * Math.max(0, (k - 0.3) / 0.7);
    _fishPose.thrashPhase = fightTime * 3.2;
    _fishPose.leap = 0;
    _fishPose.contact = 1 - e;
    sceneSet.updateFightFish(dt, _fishPose);

    if (!escapeSplashed && escapeT > 0.1) {
      escapeSplashed = true;
      sceneSet.splash(_v2.set(px, 0.02, pz), 1.2, 20);
      audio.splash(0.9);
    }
    if (k >= 1) finishEscape();
  }

  function finishEscape() {
    try { audio.holdAmbient(false); audio.restoreSoon(700); } catch (e) { /* noop */ }
    sceneSet.releaseFightFish();
    sceneSet.setFightMarker(null, false);
    sceneSet.setFightBeacon(null, false);
    net.setVisible(false);
    setAmbientMode('fishing');
    setState(S.RIGGED);
    setSurfaceLifeVisible(true);
    lineOut = 0;
    lureDepth = 0;
    speed = 0;
    autoReel = false;
    wheelPending = 0;
    qteDone = false;
    fishDist = 0;
    charging = false;
    message('鱼脱钩游走了 · 稳住再抛一竿', 'warn', 3000);
    ui.note('鱼脱钩游走了 · 再抛一竿', 'danger', 3000);
  }

  // -----------------------------------------------------------------------
  // netting
  // -----------------------------------------------------------------------
  function beginNetting(shore = false) {
    if (state === S.NETTING) return;
    lineRunActive = false;
    fightCam.setActive(false);
    // transient hush: keep the HUD switch ON; the bed resumes after the net
    // beat begins because an ON preference must stay audible.
    try {
      audio.hush();
      audio.holdAmbient(true);
      setTimeout(() => {
        if (!active) return;
        try { audio.holdAmbient(false); audio.restore(); } catch (e) { /* noop */ }
      }, 650);
    } catch (err) { /* noop */ }
    sceneSet.triggerLeap(0.55, 0.45);
    splashAt(fishWorldPos, 1.5, 26);
    sceneSet.setFightBeacon(null, false);
    setState(S.NETTING);
    setAmbientMode('off');
    // Presentation fix: both shore-triggered and QTE-ended netting put the fish
    // at a repeatable spot in open water beyond the pontoon nose (8.2–8.7 m
    // from PLAYER, fixed outward bearing). The trigger stays at 6.5 m.
    fightYaw = NET_PRESENT_YAW;
    lineOut = clamp(NET_PRESENT_DIST, NET_PRESENT_DIST - 0.2, NET_PRESENT_DIST + 0.2);
    qteDone = false;
    lungePos = 0;
    lungeVel = 0;
    spoolBreakT = 0;
    audio.net();
    nettingT = 0;
    netScoopT = -1;
    netScoopDone = false;
    netRunT = 0;
    netOverlap = false;
    netReminder = 0;
    strikeEnv = 1;
    snapEnv = 0.8;
    camKick = 0.5;
    message(shore ? '鱼靠岸了 · 起抄网' : '鱼到脚边了 · 拖抄网过去', 'catch', 3000);
    net.show();
    ui.promptFlash('net');
    fightSurge = 0;
    fightThrash = 0.4;
  }

  function updateNetting(dt) {
    nettingT += dt;
    fightTime += dt;
    fightThrash = Math.max(0, fightThrash - dt * 1.5);
    shake = Math.max(0, shake - dt * 2.0);

    const bearing = fightYaw + Math.sin(fightTime * 0.5) * 0.02;
    const dist = clamp(lineOut, FIGHT_MIN_LINE, spoolMax);
    const px = PLAYER_X + Math.sin(bearing) * dist;
    const pz = PLAYER_Z - Math.cos(bearing) * dist;
    const baseY = 0.13 + Math.sin(fightTime * 2.4) * 0.018;
    fishWorldPos.set(px, baseY, pz);
    fishDist = Math.hypot(px - camera.position.x, pz - camera.position.z);

    _fishPose.x = px;
    _fishPose.y = baseY;
    _fishPose.z = pz;
    _fishPose.yaw = Math.PI * 0.5 + Math.sin(fightTime * 0.5) * 0.22;
    _fishPose.roll = 0.22 + Math.sin(fightTime * 1.7) * 0.08;
    _fishPose.pitch = 0.02;
    _fishPose.thrashPhase = fightTime * 1.8;
    _fishPose.leap = 0;
    _fishPose.contact = 1;
    sceneSet.updateFightFish(dt, _fishPose);

    // dorsal wake + occasional surface splash
    if (Math.floor(fightTime * 2) !== Math.floor((fightTime - dt) * 2)) {
      sceneSet.wake(_v2.set(px, 0.02, pz), 0.5 + (fight?.power || 0.5) * 0.3, 0.01);
    }

    const p = app.pointer;
    const fishPx = fishScreenPoint(_screen);
    const fishVisible = fishPx.x > -60 && fishPx.x < window.innerWidth + 60
      && fishPx.y > -60 && fishPx.y < window.innerHeight + 60;
    // the scoop is forgiving: any pointer near the fish is already "on" it
    const pointerX = p.u * window.innerWidth;
    const pointerY = p.v * window.innerHeight;
    const pointerGap = Math.hypot(fishPx.x - pointerX, fishPx.y - pointerY);
    const guideR = Math.max(96, net.radiusPx * 1.02);
    const nearFish = pointerGap <= guideR;

    const scooping = netScoopT >= 0;
    let overlap = nearFish;
    if (!scooping) {
      net.update(dt, {
        u: p.u, v: p.v,
        lift: nearFish ? 0.12 : 0,
        highlight: nearFish,
      });
      const hoop = net.hoopWorldPos(_v2);
      engine.screenFromWorld(hoop, _screen2);
      const hoopGap = Math.hypot(fishPx.x - _screen2.x, fishPx.y - _screen2.y);
      overlap = overlap || hoopGap < net.radiusPx * 1.15;
    }

    // scoop animation: snap the hoop onto the fish, dip, then lift it out
    if (scooping) {
      netScoopT += dt;
      const t = clamp(netScoopT / 1.05);
      const lift = t < 0.18 ? -t / 0.18 * 0.12 : Math.pow((t - 0.18) / 0.82, 0.8) * 1.35;
      const fishU = clamp(fishPx.x / Math.max(1, window.innerWidth), 0.04, 0.96);
      const fishV = clamp(fishPx.y / Math.max(1, window.innerHeight), 0.22, 0.94);
      net.update(dt, { u: fishU, v: fishV, lift, highlight: 1, lambda: 26 });
      const hoop = net.hoopWorldPos(_v2);
      const k = clamp((t - 0.1) / 0.7);
      fishWorldPos.lerp(hoop, clamp(k * 0.35, 0, 1));
      fishWorldPos.y = damp(fishWorldPos.y, hoop.y + 0.2, 8, dt);
      _fishPose.x = fishWorldPos.x;
      _fishPose.y = fishWorldPos.y;
      _fishPose.z = fishWorldPos.z;
      _fishPose.roll = 0.4 + t * 0.8;
      _fishPose.leap = 0;
      _fishPose.contact = 1 - k;
      _fishPose.thrashPhase = fightTime * 6;
      sceneSet.updateFightFish(dt, _fishPose);
      if (t > 0.02 && !netScoopDone) {
        splashAt(fishWorldPos, 1.7, 32);
        netScoopDone = true;
      }
      if (t >= 1 || netScoopT > 2.2) {
        finishScoop();
        return;
      }
      overlap = true;
    }

    netOverlap = overlap || scooping;
    fightSplashTimer -= dt;
    if (fightSplashTimer <= 0 && !scooping) {
      fightSplashTimer = 1.6 + Math.random() * 1.6;
      sceneSet.ripple(_v2.set(px, 0.02, pz), 0.4);
    }

    if (!scooping) {
      netReminder += dt;
      if (netReminder > 3.0) {
        netReminder = 0;
        message(nearFish ? '点击虚线圈内 · 抄鱼' : '把鼠标移到鱼上 · 点击虚线圈内', 'info', 2200);
      }
    }
  }

  function attemptScoop(source, x, y) {
    if (state !== S.NETTING || netScoopT >= 0) return false;
    const fishPx = fishScreenPoint(_screen);
    const px = Number.isFinite(x) ? x : app.pointer.u * window.innerWidth;
    const py = Number.isFinite(y) ? y : app.pointer.v * window.innerHeight;
    const guideR = Math.max(96, net.radiusPx * 1.02);
    const inside = Math.hypot(px - fishPx.x, py - fishPx.y) <= guideR;
    if (!inside && source !== 'debug') {
      message('点击虚线圈内 · 抄鱼', 'warn', 1400);
      return false;
    }
    netScoopT = 0;
    netScoopDone = false;
    netRunT = 0;
    netReminder = 0;
    audio.scoop();
    strikeEnv = 1;
    snapEnv = 0.9;
    camKick = 0.7;
    message('抄住了！', 'catch', 1600);
    return true;
  }

  function finishScoop() {
    // fish is in the net: hide the world fish, keep the net up for the beat
    netScoopT = 2;
    try {
      sceneSet.releaseFightFish();
      net.setVisible(false);
      landFish();
    } catch (err) {
      console.warn('[fishing] scoop finish failed', err?.message || err);
      try { landFish(); } catch (e2) { /* noop */ }
    }
  }

  // -----------------------------------------------------------------------
  // catch
  // -----------------------------------------------------------------------
  function landFish() {
    if (!fight) {
      // defensive: if the fight record vanished, still produce a catch card
      if (!catchInfo) return;
    }
    const species = fight?.species || catchInfo?.species;
    if (!species) return;
    const size = fight?.size || catchInfo || rollSizeWeight(species);
    catches += 1;
    setState(S.LANDED);
    catchTimer = 0;
    catchCardShown = false;
    catchInfo = {
      species,
      conservation: species.conservation || guideFor(species.id) || null,
      lengthCm: size.lengthCm,
      weightKg: size.weightKg,
      lure,
      leader,
      fightTime,
      style: fight?.style || fightStyle,
    };
    splashAt(fishWorldPos, 1.4, 24);
    audio.catchSting();
    shake = 1;
    camKick = 0.9;
    message(`上鱼 · ${species.nameCn}`, 'catch', 2600);
    ui.flashEvent('catch');

    // Register the catch with the shared fish system for ecology bookkeeping.
    activeFighter = null;
    fighterIsShared = false;
    try {
      const fighter = ctx?.fish?.spawnFighter?.(species.sourceId || species.id) || null;
      if (fighter) {
        activeFighter = fighter;
        fighterIsShared = true;
        try { fighter.hide?.(); } catch (e) { /* noop */ }
      }
    } catch (err) {
      activeFighter = null;
      fighterIsShared = false;
    }
    fight = null;
  }

  function updateLanded(dt) {
    catchTimer += dt;
    if (!catchCardShown && catchTimer > 1.35) {
      catchCardShown = true;
      try { audio.holdAmbient(false); audio.restore(); } catch (e) { /* noop */ }
      ui.showCatch(catchInfo, catches, kept, bagCount());
    }
    shake = Math.max(0, shake - dt * 1.6);
    net.update(dt, {
      u: app.pointer.u, v: app.pointer.v, lift: 0, highlight: false,
    });
  }

  function finishCatch(decision) {
    if (!catchInfo) return;
    hushAudio();
    const info = catchInfo;
    if (decision === 'keep' && isProtectedSpecies(info.species)) {
      message('保护物种 · 必须放流', 'warn', 2600);
      decision = 'release';
    }
    if (decision === 'keep') {
      kept += 1;
      addToBag({
        species: info.species,
        lengthCm: info.lengthCm,
        weightKg: info.weightKg,
        lure: info.lure,
        leader: info.leader,
      });
      message(`收入鱼护 · 鱼护 ${bagCount()} 尾`, 'catch', 3200);
    }
    if (fighterIsShared && activeFighter) {
      try { activeFighter.hide?.(); } catch (e) { /* noop */ }
      try { ctx?.fish?.releaseFighter?.(activeFighter); } catch (e) { /* noop */ }
    }
    activeFighter = null;
    fighterIsShared = false;
    sceneSet.releaseFightFish();
    ui.hideCatch();
    catchInfo = null;
    catchCardShown = false;
    lineOut = 0;
    lureDepth = 0;
    autoReel = false;
    wheelPending = 0;
    setState(S.RIGGED);
    setAmbientMode('fishing');
    setSurfaceLifeVisible(true);
    net.setVisible(false);
    refreshEquipmentVisuals();
    try { audio.holdAmbient(false); audio.restoreSoon(800); } catch (e) { /* noop */ }
    if (decision !== 'keep') message('已放流', 'info', 2400);
    else message(`已入护 · 鱼护 ${bagCount()} 尾`, 'info', 2800);
  }

  // -----------------------------------------------------------------------
  // bag
  // -----------------------------------------------------------------------
  function openBag() {
    if (bagOpen) return true;
    if (gearOpen) toggleGear(false);
    if (state === S.FIGHTING || state === S.NETTING || catchCardShown) {
      message('先把这条鱼处理完', 'warn', 1800);
      return false;
    }
    const items = bagItems();
    bagOpen = true;
    autoReel = false;
    bagSelected = items.length ? clamp(bagSelected, 0, items.length - 1) : 0;
    if (items.length) {
      turntable.show(items[bagSelected]);
      ui.setBagOpen(true, {
        items: items.map(describeBagItem),
        selected: bagSelected,
        totalKg: bagTotalKg(),
        canvas: turntable.canvas,
        size: turntable.size,
      });
    } else {
      ui.setBagOpen(true, { items: [], selected: 0, totalKg: 0, canvas: null, size: 480 });
    }
    ui.blurFocus?.();
    return true;
  }

  function closeBag() {
    if (!bagOpen) return false;
    hushAudio();
    try { audio.holdAmbient(false); audio.restoreSoon(450); } catch (e) { /* noop */ }
    bagOpen = false;
    turntable.hide();
    turntable.setDragging(false);
    ui.setBagOpen(false, null);
    return true;
  }

  function describeBagItem(item) {
    return {
      nameCn: item.species?.nameCn || '未命名',
      nameEn: item.species?.nameEn || '',
      latin: item.species?.latin || '',
      lengthCm: item.lengthCm,
      weightKg: item.weightKg,
      accent: item.species?.colors?.accent ?? 0xd9a86c,
      side: item.species?.colors?.side ?? 0x8fa3a1,
      species: item.species,
      mustRelease: isProtectedSpecies(item.species),
      advisory: advisoryFor(item.species),
    };
  }

  function selectBag(index) {
    const items = bagItems();
    if (!items.length) return;
    bagSelected = clamp(index | 0, 0, items.length - 1);
    turntable.select(items[bagSelected]);
    ui.setBagSelection(bagSelected, describeBagItem(items[bagSelected]));
  }

  function rotateBag(dx) {
    turntable.rotate(dx);
  }

  // -----------------------------------------------------------------------
  // equipment
  // -----------------------------------------------------------------------
  function swapLure(id) {
    if (state === S.FIGHTING || state === S.BITE || state === S.CASTING || state === S.NETTING) {
      message('遛鱼中无法换拟饵', 'warn', 1800);
      return false;
    }
    const next = LURE_BY_ID[id];
    if (!next || next.id === lure.id) return false;
    if (state === S.RETRIEVING) recallLure();
    lure = next;
    lureDepth = 0;
    bitePressure = 0;
    refreshEquipmentVisuals();
    message(`换上 ${lure.nameCn} · ${lure.lengthCm} CM / ${lure.weightG} G`, 'info', 2200);
    ui.pulseGearRow('lure', id);
    return true;
  }

  function swapLeader(id) {
    if (state === S.FIGHTING || state === S.BITE || state === S.NETTING) {
      message('遛鱼中无法换前导', 'warn', 1800);
      return false;
    }
    const next = LEADER_BY_ID[id];
    if (!next) return false;
    leader = next;
    refreshEquipmentVisuals();
    message(`换上 ${leader.nameCn} 碳氟前导 · ${leader.strengthKg.toFixed(1)} KG`, 'info', 2200);
    ui.pulseGearRow('leader', id);
    return true;
  }

  // Leader durability is gone in round 4; kept as a debug-compatible no-op.
  function renewLeader(id = leader.id) {
    return true;
  }

  function toggleGear(next = null) {
    const want = next === null ? !gearOpen : !!next;
    if (!want) {
      hushAudio();
      try { audio.holdAmbient(false); audio.restoreSoon(450); } catch (e) { /* noop */ }
    }
    if (want && bagOpen) closeBag();
    if (want && (state === S.FIGHTING || state === S.BITE || state === S.NETTING)) {
      message('遛鱼中无法打开装备', 'warn', 1600);
      return;
    }
    if (want && catchCardShown) return;
    gearOpen = want;
    ui.setGearOpen(want, { lureId: lure.id, leaderId: leader.id });
    autoReel = false;
    wheelPending = 0;
  }

  // -----------------------------------------------------------------------
  // entry / exit
  // -----------------------------------------------------------------------
  function resetRun() {
    shoreNet = false;
    shoreTrigger = '';
    sceneSet.setFightMarker(null, false);
    sceneSet.releaseFightFish();
    fightCam.setActive(false);
    net.setVisible(false);
    qte.stop();
    setState(S.RIGGED);
    lineOut = 0;
    lureDepth = 0;
    speed = 0;
    autoReel = false;
    wheelPending = 0;
    wheelSpin = 0;
    reelVisual = 0;
    charging = false;
    charge = 0;
    chargeT = 0;
    castCharge = CAST_MIN;
    bitePressure = 0;
    biteCooldown = 0;
    waterTime = 0;
    fight = null;
    fightTime = 0;
    castClock = 0;
    castReleased = false;
    castDelay = 0;
    recastLock = 0;
    sweep = 0;
    sweepTarget = 0;
    strikeEnv = 0;
    snapEnv = 0;
    camKick = 0;
    shake = 0;
    camDolly = 0;
    dollyTarget = 0;
    camZ = BASE_POS.z;
    camY = BASE_POS.y;
    dragNorm = 0.42;
    catchInfo = null;
    catchCardShown = false;
    activeFighter = null;
    fighterIsShared = false;
    nettingT = 0;
    netScoopT = -1;
    netRunT = 0;
    netOverlap = false;
    qteDone = false;
    hookLineOut = 0;
    fishDist = 0;
    fightHold = false;
    fightCam.setActive(false);
    lungePos = 0;
    lungeVel = 0;
    runSweep = 0;
    spoolBreakT = 0;
  }

  function bindUIHooks() {
    ui.hooks = {
      onExit() { closeBag(); if (gearOpen) toggleGear(false); app.actions?.exitFishing?.(); },
      onCastHold(down) {
        if (down) startCharge();
        else releaseCast();
      },
      // touch tap fallback: a short, deliberate cast (still 10–25 m)
      onCastTap() {
        if (state === S.RIGGED) {
          startCharge();
          chargeT = 0.32;
          charge = 0.16;
          castCharge = clamp(CAST_MIN + (CAST_MAX - CAST_MIN) * charge, CAST_MIN, spoolMax);
          releaseCast();
        } else if (state === S.BITE) {
          tryStrike('button');
        }
      },
      onReel(down) { virtualReel = !!down; },
      onFeed(down) { virtualFeed = !!down; },
      onOpenGear() { toggleGear(true); },
      onCloseGear() { toggleGear(false); },
      onSwapLure(id) { swapLure(id); },
      onSwapLeader(id) { swapLeader(id); },
      onRenewLeader(id) { renewLeader(id || leader.id); },
      onCatch(decision) { finishCatch(decision); },
      onQteConfirm() { confirmQTE(); },
      onToggleSound() {
        const on = audio.setEnabled(!audio.enabled);
        if (on) { try { audio.resume(); } catch (e) { /* noop */ } }
        ui.setSound?.(on);
        return on;
      },
      onNetScoop() { attemptScoop('button'); },
      onOpenBag() { openBag(); },
      onCloseBag() { closeBag(); },
      onBagSelect(index) { selectBag(index); },
      onBagDrag(dx, active) { turntable.setDragging(active); rotateBag(dx); },
    };
  }

  function enter(rodSpecIn) {
    if (active) return;
    active = true;
    enabled = true;
    rodSpec = rodSpecIn || {};
    profile = rodProfile(rodSpec);
    refreshPool(true);
    resetRun();
    rig.setRod(profile);
    refreshEquipmentVisuals();
    rig.setVisible(true);
    sceneSet.setVisible(true);
    net.setVisible(false);
    updateCamera(0.016);
    camera.fov = 52;
    camera.updateProjectionMatrix();

    bindUIHooks();
    ui.mount({
      rodSpec: profile,
      lure,
      leader,
      catches,
      bagCount: bagCount(),
      poolSource: pool.source,
      poolSize: pool.list.length,
    });
    refreshEquipmentVisuals();
    try { ui.mountFishCam?.(fightCam.canvas); } catch (err) { /* noop */ }
    bindInput();
    ui.note('南海 · 水面 · 东风 3 级', 'info', 3000);
    ui.setTouchVisible(
      app.isMobile
      || window.matchMedia('(pointer: coarse)').matches
      || window.innerWidth <= 900,
    );
    // first-frame rod pose so there is no pop
    rig.update(0.016, rodRenderState(0.016));
    setAmbientMode('fishing');
    audio.enter();
    // compile the fishing-only materials once, behind the loader
    if (!prewarmPromise) {
      prewarm({ dom: false }).catch((err) => console.warn('[fishing] prewarm failed', err?.message || err));
    }
  }

  function exit() {
    if (!active) return;
    active = false;
    enabled = false;
    rodReelRate = 0;
    unbindInput();
    closeBag();
    if (gearOpen) { gearOpen = false; ui.setGearOpen(false, null); }
    if (catchCardShown) { ui.hideCatch(); catchCardShown = false; }
    if (fighterIsShared && activeFighter) {
      try { activeFighter.hide?.(); } catch (e) { /* noop */ }
      try { ctx?.fish?.releaseFighter?.(activeFighter); } catch (e) { /* noop */ }
    }
    activeFighter = null;
    fighterIsShared = false;
    sceneSet.releaseFightFish();
    net.setVisible(false);
    qte.stop();
    ui.unmount();
    rig.setVisible(false);
    sceneSet.setVisible(false);
    camera.fov = 52;
    camera.updateProjectionMatrix();
    // restore the surface life; main owns the ambient mode from here
    try { ctx?.fish?.setVisible?.(true); } catch (e) { /* noop */ }
    setAmbientMode('shop');
    audio.exit();
    if (el) { el.classList.remove('active'); el.setAttribute('aria-hidden', 'true'); }
  }

  // -----------------------------------------------------------------------
  // render-state assembly
  // -----------------------------------------------------------------------
  function rodRenderState(dt) {
    const fighting = state === S.FIGHTING;
    const netting = state === S.NETTING;
    const land = state === S.LANDED;
    const escaping = state === S.ESCAPING;
    let bend = 0;
    let pitch = 0;
    let rodSweep = sweep;
    if (fighting) {
      // dynamic load: heavier during runs/lock, sharper on a hit
      bend = clamp(
        0.30 + qte.progress * 0.24 + snapEnv * 0.3
        + (qte.phase === 'break' ? 0.22 : 0)
        + (qte.state.locked ? 0.18 : 0)
        + Math.abs(runSweep) * 0.12,
        0, 1.3,
      );
      pitch = -0.05 + Math.sin(time * 2.2) * 0.006;
      rodSweep = sweep + runSweep * 0.7;
    } else if (netting) {
      // the rod is lowered / held aside while netting — keep it out of the way
      bend = clamp(0.12 + snapEnv * 0.2, 0, 0.5);
      pitch = -0.14;
    } else if (escaping) {
      // slack line: the rod springs back
      bend = 0.02;
      pitch = 0.03;
    } else if (state === S.BITE || state === S.CASTING) {
      bend = clamp(0.16 + (shake || 0) * 0.6, 0, 0.55);
      pitch = -0.02 + Math.sin(time * 30) * 0.008 * clamp(shake, 0, 1);
    } else if (state === S.RETRIEVING) {
      bend = clamp(speed * 0.035 + Math.sin(time * 1.3) * 0.004, 0, 0.14);
      pitch = -0.01;
    } else if (land) {
      bend = 0;
      pitch = 0.06;
    }
    const castPhase = state === S.CASTING ? clamp(castClock / 0.95) : -1;
    let lineSag = 0.2;
    if (fighting) lineSag = qte.phase === 'break' ? 0.16 : 0.24;
    else if (state === S.RETRIEVING) lineSag = 0.55 + Math.sin(time * 0.9) * 0.06;
    if (state === S.BITE) lineSag = 0.22;
    if (netting || land) lineSag = 0.7;
    if (escaping) lineSag = 1.15;

    let lureWorldForRig = null;
    let lureVisible = true;
    if (state === S.CASTING || state === S.RETRIEVING) {
      if (state === S.CASTING && !castReleased) {
        lureWorldForRig = null;
        lureVisible = true;
      } else {
        lureWorldForRig = _lineEnd.set(lureWorld.x, 0.055, lureWorld.z);
        lureVisible = lure.band[1] <= 0.5 || lureDepth <= 0.28;
      }
    } else if (fighting) {
      lureWorldForRig = _lineEnd.set(fishWorldPos.x, 0.05, fishWorldPos.z);
      lureVisible = false;
    } else if (netting) {
      lureWorldForRig = _lineEnd.set(fishWorldPos.x, 0.05, fishWorldPos.z);
      lureVisible = false;
    } else if (state === S.BITE) {
      lureWorldForRig = _lineEnd.set(lureWorld.x, 0.055, lureWorld.z);
      lureVisible = true;
    } else if (land || escaping) {
      lureVisible = false;
    }
    rodReelRate = state === S.RETRIEVING ? clamp(speed / WHEEL_MAX_RATE, 0, 1)
      : state === S.FIGHTING ? (autoReelFight ? 0.4 : 0) : 0;
    return {
      sweep: rodSweep,
      pitch,
      bend,
      lineVisible: !land && !netting && !escaping,
      reeling: (() => {
        // only spin the rotor while line is actually moving
        if (state === S.RETRIEVING) return clamp(speed / WHEEL_MAX_RATE, 0, 1);
        if (state === S.FIGHTING) return autoReelFight ? 0.4 : 0;
        return 0;
      })(),
      bailOpen: state === S.CASTING && !castReleased,
      castPhase,
      strike: strikeEnv,
      lureWorld: lureWorldForRig,
      lureVisible,
      lineSag,
      fov: camera.fov,
      aspect: camera.aspect,
      height: window.innerHeight,
    };
  }

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------
  function update(dt) {
    if (!active) return;
    time += dt;
    stateTime += dt;
    messageTimer = Math.max(0, messageTimer - dt);
    strikeEnv = Math.max(0, strikeEnv - dt * 2.6);
    snapEnv = Math.max(0, snapEnv - dt * 3.2);
    recastLock = Math.max(0, recastLock - dt);
    hitFlashT = Math.max(0, hitFlashT - dt);
    missFlashT = Math.max(0, missFlashT - dt);
    updateCharge(dt);
    refreshPool(false);

    if (bagOpen) {
      // the world freezes politely behind the creel
      updatePointerControl(dt);
      updateCamera(dt);
      turntable.update(dt);
      rig.update(dt, rodRenderState(dt));
      updateHud();
      return;
    }

    updatePointerControl(dt);
    let worldFrozen = false;

    switch (state) {
      case S.RIGGED:
        speed = 0;
        break;
      case S.CASTING:
        updateCasting(dt);
        break;
      case S.RETRIEVING:
        updateRetrieving(dt);
        break;
      case S.BITE:
        updateBite(dt);
        break;
      case S.FIGHTING:
        worldFrozen = qte.state.hitStop > 0;
        updateFighting(dt, worldFrozen);
        break;
      case S.NETTING:
        updateNetting(dt);
        break;
      case S.LANDED:
        updateLanded(dt);
        break;
      case S.ESCAPING:
        updateEscaping(dt);
        break;
      default:
        break;
    }

    sceneSet.update(worldFrozen ? 0 : dt);
    sceneSet.updateAmbient(worldFrozen ? 0 : dt, {
      active: state === S.RIGGED || state === S.RETRIEVING || state === S.CASTING,
    });
    updateCamera(dt);
    rig.update(dt, rodRenderState(dt));
    _audioState.reeling = isReeling();
    _audioState.runActive = state === S.FIGHTING && qte.phase === 'break';
    _audioState.locked = qte.state.locked;
    audio.update(dt, _audioState);
    fightClock += dt;
    if (fightClock >= 0.06) {
      fightClock = 0;
      syncFightInfo();
    }
    updateHud();
  }

  /** Publish the fight/line values to the HUD at ~16 Hz (and once on hook-up). */
  function syncFightInfo() {
    _fightInfo.seq += 1;
    _fightInfo.lineOut = lineOut;
    _fightInfo.fishDist = fishDist;
    _fightInfo.camDist = fishDist;
    _fightInfo.spoolLeft = spoolLeft();
    _fightInfo.autoReel = autoReelFight;
    _fightInfo.locked = qte.state.locked;
    _fightInfo.dir = qte.state.dir;
    _fightInfo.sweep = qte.state.sweep;
    _fightInfo.ready = qte.state.ready;
    _fightInfo.timeLeft = qte.state.timeLeft;
    _fightInfo.phase = qte.phase;
    _fightInfo.progress = qte.progress;
    _fightInfo.gearRisk = !!fight?.gearRisk;
    _fightInfo.gearCapacity = fight?.gearCapacity ?? 0;
    _fightInfo.lineRun = lineRunActive;
    _fightInfo.charge = charge;
    _fightInfo.charging = charging;
    _fightInfo.castDistance = castCharge;
    return _fightInfo;
  }

  function updateHud() {
    const bite = state === S.BITE;
    const p = promptData();
    const q = qte.state;
    const qteActive = state === S.FIGHTING;
    const netting = state === S.NETTING;
    let netInfo = null;
    if (netting || state === S.LANDED) {
      const fishPx = fishScreenPoint(_screen);
      netInfo = {
        active: netting,
        scooping: netScoopT >= 0,
        overlap: netOverlap,
        guideRadius: Math.max(96, net.radiusPx * 1.02),
        fishX: fishPx.x,
        fishY: fishPx.y,
        fishVisible: fishPx.x > -80 && fishPx.x < window.innerWidth + 80
          && fishPx.y > -80 && fishPx.y < window.innerHeight + 80,
        lift: net.lift,
      };
    }
    ui.update({
      state,
      promptCn: p.cn,
      promptEn: p.en,
      promptSub: p.sub,
      bite,
      biteProgress: bite ? clamp(biteT / biteWindow) : 0,
      biteRemain: bite ? Math.max(0, biteWindow - biteT) : 0,
      biteWindow,
      bitesNear,
      bitesFar,
      biteFactor: lastBiteFactor,
      // legacy fields kept for older HUD/debug readers
      tension: 0,
      safeLow: S_GREEN_LOW,
      safeHigh,
      breakAt: 0,
      stamina: state === S.FIGHTING ? clamp(q.progress, 0, 1) : 0,
      lineOut,
      spoolMax,
      spoolLeft: spoolLeft(),
      depth: lureDepth,
      speed,
      charge,
      charging,
      castCharge,
      reel: isReeling(),
      feed: isFeeding(),
      dragKg,
      dragNorm,
      wear: 0,
      lure,
      leader,
      rodSpec: profile,
      catches,
      kept,
      misses,
      breaks,
      slacks,
      fightTime,
      autoReel,
      autoReelFight,
      species: state === S.FIGHTING ? fight?.species : null,
      modeLabel: modeLabel(),
      message: messageTimer > 0 ? lastEvent : '',
      messageKind: lastEventKind,
      actionHint: actionLabel(),
      poolSource: pool.source,
      castDistance: castCharge,
      qte: {
        active: qteActive,
        phase: q.phase,
        round: q.round,
        rounds: q.rounds,
        progress: q.progress,
        hits: q.hits,
        misses: q.misses,
        results: q.results,
        dir: q.dir,
        sweep: q.sweep,
        ready: q.ready,
        locked: q.locked,
        lockT: q.lockT,
        lockDur: q.lockDur,
        timeLeft: q.timeLeft,
        timeoutMs: q.timeoutMs,
        notReady: q.notReady,
        hitStop: q.hitStop > 0,
        verdict: q.verdict,
        verdictKind: q.verdictKind,
        // legacy
        windowMs: q.timeoutMs,
        windowOpen: q.ready,
        ringFrac: 1 - q.sweep,
        bandOuter: 1,
        bandInner: 0,
        windowScale: q.windowScale,
        fishDist,
        lineOut,
        spoolLeft: spoolLeft(),
        autoReel: autoReelFight,
        qteDone,
      },
      fight: _fightInfo,
      net: netInfo,
      fishScreen: state === S.FIGHTING || netting
        ? { x: fishScreenPoint(_screen).x, y: fishScreenPoint(_screen).y, visible: true }
        : null,
      bagCount: bagCount(),
      bagOpen,
      bagSelected,
      keptKg: bagTotalKg(),
      impact: { hit: hitFlashT > 0, miss: missFlashT > 0 },
      soundOn: audio.enabled,
      shoreNet,
      shoreTrigger,
      gearRisk: !!fight?.gearRisk,
      lineRun: lineRunActive ? {
        active: true,
        t: lineRunT,
        remain: Math.max(0, lineRunDur - lineRunT),
        rate: lineRunRate,
        peeled: lineRunPeeled,
      } : null,
      dolly: camDolly,
    });
  }

  function modeLabel() {
    switch (state) {
      case S.RIGGED: return 'STANDBY';
      case S.CASTING: return 'CAST';
      case S.RETRIEVING: return 'RETRIEVE';
      case S.BITE: return 'BITE';
      case S.FIGHTING: return 'QTE';
      case S.NETTING: return 'NET';
      case S.LANDED: return 'LANDED';
      case S.ESCAPING: return 'GONE';
      default: return '';
    }
  }

  // -----------------------------------------------------------------------
  // prewarm — pool every fight-fish species, upload geometry with a real
  // render pass, and paint the QTE / catch / bag panels once. Runs behind the
  // loader (main awaits it), so it may touch the camera and visibility.
  // -----------------------------------------------------------------------
  let prewarmPromise = null;
  const prewarmStats = { geometriesBefore: 0, geometriesAfter: 0, programsBefore: 0, programsAfter: 0, staged: 0, ms: 0 };

  function nextFrame() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame !== 'function') { setTimeout(resolve, 16); return; }
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function prewarm(opts = {}) {
    if (prewarmPromise) return prewarmPromise;
    prewarmed = true;
    const wantDom = opts.dom !== false && !ui.mounted;
    prewarmPromise = (async () => {
      const tPrewarm = performance.now();
      prewarmStats.geometriesBefore = engine.renderer.info.memory.geometries;
      prewarmStats.programsBefore = engine.renderer.info.programs.length;
      // 1. pool/build every species preview (scripts compiled, geometry allocated)
      refreshPool(true);
      const speciesList = pool.list.slice();
      sceneSet.prewarmFishPool(speciesList);

      // 2. DOM prewarm: show each panel once so its first paint happens now
      let domMounted = false;
      try {
        if (wantDom) {
          ui.mount({
            rodSpec: profile,
            lure,
            leader,
            catches,
            bagCount: bagCount(),
            poolSource: pool.source,
            poolSize: pool.list.length,
          });
          domMounted = true;
        }
        if (ui.prewarmShow) ui.prewarmShow();
      } catch (err) {
        console.warn('[fishing] prewarm dom failed', err?.message || err);
      }
      if (ui.prewarmShow) await nextFrame();

      // 3. real render pass with the fishing camera: upload every fish
      //    geometry + skin, the net, the deck and the splash shader.
      const saved = {
        px: camera.position.x, py: camera.position.y, pz: camera.position.z,
        qx: camera.quaternion.x, qy: camera.quaternion.y, qz: camera.quaternion.z, qw: camera.quaternion.w,
        fov: camera.fov,
      };
      const sceneWasVisible = sceneSet.root.visible;
      const rigWasVisible = rig.visible;
      const netWasVisible = net.visible;
      try {
        sceneSet.root.visible = true;
        rig.setVisible(true);
        net.setVisible(true);
        camera.position.copy(BASE_POS);
        camera.rotation.order = 'YXZ';
        camera.rotation.set(BASE_PITCH, BASE_YAW, 0);
        camera.fov = 52;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        prewarmStats.staged = sceneSet.stageWarmFish(1.5, 8);
        // compile the inset fish-cam in its own context against the staged fish
        try { fightCam.prewarm(_v.set(0, 0.4, -8)); } catch (err) {
          console.warn('[fishing] fish-cam prewarm failed', err?.message || err);
        }
        try { engine.renderer.compile(engine.scene, camera); } catch (e) { /* noop */ }
        // two passes: the first allocates programs, the second guarantees every
        // geometry buffer has been drawn at least once
        try { engine.composer.render(); } catch (e) { /* noop */ }
        try { engine.composer.render(); } catch (e) { /* noop */ }
      } catch (err) {
        console.warn('[fishing] prewarm render failed', err?.message || err);
      } finally {
        sceneSet.clearWarmFish();
        net.setVisible(netWasVisible);
        rig.setVisible(rigWasVisible);
        sceneSet.root.visible = sceneWasVisible;
        camera.position.set(saved.px, saved.py, saved.pz);
        camera.quaternion.set(saved.qx, saved.qy, saved.qz, saved.qw);
        camera.fov = saved.fov;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
      }

      // 4. hide the prewarmed DOM again
      try {
        if (ui.prewarmHide) ui.prewarmHide();
      } catch (e) { /* noop */ }
      if (domMounted) {
        try { ui.unmount(); } catch (e) { /* noop */ }
      }

      // 5. bag turntable: renderer + one fish shader compile
      try { turntable.prewarm(); } catch (err) {
        console.warn('[fishing] bag prewarm failed', err?.message || err);
      }
      prewarmStats.geometriesAfter = engine.renderer.info.memory.geometries;
      prewarmStats.programsAfter = engine.renderer.info.programs.length;
      prewarmStats.ms = +(performance.now() - tPrewarm).toFixed(1);
      return true;
    })();
    return prewarmPromise;
  }

  // -----------------------------------------------------------------------
  // debug surface
  // -----------------------------------------------------------------------
  const debugApi = {
    forceBite(speciesId) {
      if (!active) return false;
      if (bagOpen) closeBag();
      if (state === S.RIGGED) {
        lineOut = Math.max(12, expectedCatchDistance() * 0.8);
        castYaw = 0;
        lureDepth = (lure.band[0] + lure.band[1]) * 0.5;
        setState(S.RETRIEVING);
      }
      if (state === S.FIGHTING || state === S.NETTING || state === S.LANDED) return false;
      if (state !== S.RETRIEVING && state !== S.BITE) return false;
      let species = null;
      if (speciesId) {
        species = pool.list.find((s) => s.id === speciesId || s.sourceId === speciesId) || null;
      }
      if (!species) species = pickSpecies(pool.list, lure, lureDepth);
      if (!species) return false;
      if (state === S.RETRIEVING) {
        biteCooldown = 0;
        return triggerBite(species);
      }
      biteSpecies = species;
      return true;
    },
    strike() { if (state === S.BITE) { tryStrike('debug'); } return state === S.FIGHTING; },
    extendBite(seconds = 5) {
      if (state !== S.BITE) return false;
      biteWindow += Math.max(0, Number(seconds) || 0);
      return true;
    },
    qteHit() {
      if (state !== S.FIGHTING || lineRunActive) return false;
      return qte.forceHit();
    },
    qteMiss() {
      if (state !== S.FIGHTING || lineRunActive) return false;
      return qte.forceMiss();
    },
    qteState() {
      return {
        phase: qte.phase, round: qte.round, progress: qte.progress,
        dir: qte.state.dir, sweep: qte.state.sweep, ready: qte.state.ready,
        locked: qte.state.locked, lockT: qte.state.lockT, lockDur: qte.state.lockDur,
        timeLeft: qte.state.timeLeft, timeoutMs: qte.state.timeoutMs,
        fishDist, lineOut, spoolLeft: spoolLeft(), hookLineOut,
        netOverlap,
        // legacy aliases
        window: qte.state.timeoutMs, windowOpen: qte.state.ready,
        pullDir: qte.state.dir, control: 0,
      };
    },
    /** Legacy alias: true when the sweep gauge is full. */
    qteTimed() {
      return state === S.FIGHTING && qte.state.ready;
    },
    /** Legacy no-op (the tug-of-war control model was removed in round 4). */
    setControl() { return 0; },
    /** QA: freeze the current arrow to check the lock/auto-release path. */
    forceLineRun() {
      if (state !== S.FIGHTING || lineRunActive) return false;
      return startLineRun();
    },
    setNextSize(size) {
      nextSizeOverride = size ? {
        lengthCm: Number(size.lengthCm) || 60,
        weightKg: Number(size.weightKg) || 2,
      } : null;
      return nextSizeOverride;
    },
    setLineOut(m) {
      lineOut = clamp(Number(m) || 0, FIGHT_MIN_LINE, spoolMax);
      return lineOut;
    },
    setFightWeight(kg) {
      if (!fight) return false;
      fight.size.weightKg = Math.max(0.2, Number(kg) || 0.2);
      computeGear();
      return true;
    },
    setRod(spec) {
      rodSpec = spec || {};
      profile = rodProfile(rodSpec);
      try { rig.setRod(profile); } catch (e) { /* noop */ }
      try { refreshEquipmentVisuals(); } catch (e) { /* noop */ }
      if (fight) computeGear();
      return { id: profile.id, power: profile.power, safeKg: profile.safeKg, maxCastM: profile.maxCastM };
    },
    forceLock(seconds = 1.6) {
      if (state !== S.FIGHTING) return false;
      if (qte.phase !== 'break') return false;
      const ok = qte.startLock(seconds, fight?.power || 0.6);
      if (ok) { audio.lock(); ui.showVerdict('顶住！', 'lock'); }
      return ok;
    },
    /** QA: shortcut the escape animation. */
    escape(reason = 'debug') {
      if (state === S.FIGHTING) return escapeFish(reason);
      return false;
    },
    runDir() { return qte.state.dir; },
    locked() { return qte.state.locked; },
    fishPool() {
      return { size: sceneSet.fishPoolSize, source: sceneSet.fishSource };
    },
    setTension() { return 0; },
    setStamina(v) {
      if (state === S.FIGHTING) {
        const next = clamp(Number(v) || 0, 0, 1);
        qte.state.progress = next;
        return next;
      }
      return 0;
    },
    setLineOut(v) { lineOut = clampLine(Number(v) || 0, 0.9); return lineOut; },
    setDrag(v) { dragNorm = clamp(Number(v) || 0, 0.08, 1); return dragNorm; },
    // ---- round-4 input hooks for QA -------------------------------------
    chargeStart() { return startCharge(); },
    chargeRelease() { releaseCast(); return castTarget; },
    setCharge(v) {
      if (!charging) return 0;
      charge = clamp(Number(v) || 0, 0, 1);
      chargeT = charge * CHARGE_TIME;
      castCharge = clamp(CAST_MIN + (CAST_MAX - CAST_MIN) * charge, CAST_MIN, spoolMax);
      return castCharge;
    },
    wheel(delta = 0) {
      if (state !== S.RETRIEVING) return wheelPending;
      wheelPending = clamp(wheelPending + (Number(delta) || 0), -WHEEL_PENDING_MAX, WHEEL_PENDING_MAX);
      return wheelPending;
    },
    sweep(px = 0) {
      if (state === S.FIGHTING && !lineRunActive) qte.sweepInput(Number(px) || 0);
      return { dir: qte.state.dir, sweep: qte.state.sweep, ready: qte.state.ready };
    },
    confirmQte() { return confirmQTE(); },
    spoolInfo() {
      return { max: spoolMax, out: lineOut, left: spoolLeft(), hookLineOut, fishDist };
    },
    setAutoReel(on) { autoReelFight = on !== false; return autoReelFight; },
    holdFightDistance(on) { fightHold = on !== false; return fightHold; },
    fishCam() {
      return {
        available: fightCam.available, active: fightCam.active,
        prewarmed: fightCam.prewarmed, rendered: fightCam.hasRendered(),
      };
    },
    land() {
      if (state === S.FIGHTING) {
        qte.state.progress = 1;
        beginNetting();
        return true;
      }
      if (state === S.NETTING) {
        netOverlap = true;
        netScoopT = 0;
        netScoopDone = false;
        return true;
      }
      return false;
    },
    biteFactor(distance) { return biteDistanceFactor(Number(distance) || 0); },
    scoop() {
      const p = fishScreenPoint(_screen);
      return attemptScoop('debug', p.x, p.y);
    },
    netTo(u, v) {
      if (state !== S.NETTING) return false;
      app.pointer.u = clamp(Number(u) || 0.5);
      app.pointer.v = clamp(Number(v) || 0.5);
      app.pointer.ndc.set(app.pointer.u * 2 - 1, -(app.pointer.v * 2 - 1));
      return true;
    },
    finishCatch(decision = 'release') { if (catchCardShown) { finishCatch(decision); return true; } return false; },
    lose() {
      // no hard fail in round 2 — kept for debug-API compatibility
      return false;
    },
    swapLure(id) { return swapLure(id); },
    swapLeader(id) { return swapLeader(id); },
    renewLeader(id) { return renewLeader(id); },
    chargeStart() { startCharge(); return { charging, charge }; },
    cast() {
      // complete cast for QA: never leave charging=true behind
      if (state === S.RETRIEVING) recallLure();
      if (state !== S.RIGGED) return state;
      startCharge();
      chargeT = 0.42;
      charge = chargeT / CHARGE_TIME;
      castCharge = clamp(CAST_MIN + (CAST_MAX - CAST_MIN) * charge, CAST_MIN, spoolMax);
      releaseCast();
      return state;
    },
    recall() { recallLure(); return state; },
    bagOpen() { return openBag(); },
    bagClose() { return closeBag(); },
    bagSelect(i) { selectBag(i); return bagSelected; },
    bagRotate(dx) { rotateBag(Number(dx) || 0); return true; },
    poolInfo() {
      refreshPool(true);
      return {
        source: pool.source,
        count: pool.list.length,
        ids: pool.list.map((s) => s.id),
        sourceIds: pool.list.map((s) => s.sourceId),
        fighters: pool.list.map((s) => ({ id: s.id, sourceId: s.sourceId, nameCn: s.nameCn })),
        sharedCount: ctx?.fish?.species?.length || 0,
        sharedReady: !!ctx?.fish?.ready,
      };
    },
    gear(open = null) {
      if (open === null) { toggleGear(); return gearOpen; }
      toggleGear(open);
      return gearOpen;
    },
    equipment() {
      return {
        lure: lure.id,
        leader: leader.id,
        // durability removed in round 4
        wear: 0,
        leaderWear: { fc12: 0, fc16: 0, fc20: 0, fc30: 0 },
        breakAt: 0,
        safeHigh,
      };
    },
  };

  const api = {
    get active() { return active; },
    get state() { return state; },
    get debug() {
      const fishPx = fishScreenPoint(_screen);
      return {
        active,
        state,
        time,
        stateTime,
        mode: app.mode,
        gearOpen,
        bagOpen,
        bagSelected,
        bagCount: bagCount(),
        lureId: lure.id,
        lureDepth,
        leaderId: leader.id,
        leaderLb: leader.lb,
        // durability removed in round 4 (legacy debug fields stay at 0)
        leaderWear: 0,
        leaderWears: { fc12: 0, fc16: 0, fc20: 0, fc30: 0 },
        breakAt: 0,
        safeHigh,
        safeLow: S_GREEN_LOW,
        lineOut,
        spoolMax,
        spoolLeft: spoolLeft(),
        hookLineOut,
        charge,
        charging,
        chargeT,
        castCharge,
        wheelPending,
        reelVisual,
        speed,
        castYaw,
        fightYaw,
        reeling: isReeling(),
        feeding: isFeeding(),
        autoReel,
        autoReelFight,
        qteDone,
        fishDist,
        lunge: lungePos,
        bite: state === S.BITE,
        biteT,
        biteWindow,
        bitePressure,
        biteFactor: lastBiteFactor,
        bitesNear,
        bitesFar,
        shoreNet,
        shoreTrigger,
        lineRun: lineRunActive,
        lineRunT,
        lineRunDur,
        lineRunPeeled,
        gearCapacity: fight?.gearCapacity ?? 0,
        gearRisk: !!fight?.gearRisk,
        gearCutAt: fight?.gearCutAt ?? 0,
        plannedRounds: fight?.plannedRounds ?? 0,
        rodSafeKg: profile?.safeKg,
        rodPower: profile?.power,
        leaderKg: leader?.strengthKg,
        rodReel: { rate: rodReelRate, angle: rig.reelAngle ?? 0 },
        biteSpecies: biteSpecies?.id || null,
        fighting: state === S.FIGHTING,
        netting: state === S.NETTING,
        netOverlap,
        netScoopT,
        tension: 0,
        fishStamina: qte.progress,
        dragNorm,
        dragKg,
        fightTime,
        // legacy run/control fields (the round-3 tug-of-war is gone)
        runActive: state === S.FIGHTING && qte.phase === 'break',
        runDir: qte.state.dir,
        runT: qte.state.breakT,
        runDur: qte.state.breakDur,
        control: 0,
        tensionKg: 0,
        tensionLb: 0,
        locked: qte.state.locked,
        lockT: qte.state.lockT,
        lockDur: qte.state.lockDur,
        windowScale: qte.state.windowScale,
        hitBonus: qte.state.hitBonus,
        escaped,
        missStreak,
        lowControlT: 0,
        escapeReason: escapeReason || null,
        fishPoolSize: sceneSet.fishPoolSize,
        prewarm: { ...prewarmStats },
        species: fight?.species?.id || catchInfo?.species?.id || null,
        fightStyle: fight?.styleId || null,
        catchCardShown,
        catchInfo: catchInfo ? {
          species: catchInfo.species.id,
          lengthCm: catchInfo.lengthCm,
          weightKg: catchInfo.weightKg,
          lure: catchInfo.lure.id,
          leader: catchInfo.leader.id,
          mustRelease: !!catchInfo.species?.conservation?.mustRelease,
        } : null,
        catches, kept, misses, breaks, slacks,
        poolSource: pool.source,
        poolCount: pool.list.length,
        sharedFishCount: ctx?.fish?.species?.length || 0,
        sharedFishReady: !!ctx?.fish?.ready,
        pointerOnUI,
        sweep,
        sweepTarget,
        fishVisible: sceneSet.fightFishActive,
        fishScale: _fishPose.scale || 1,
        beaconActive: sceneSet.beaconActive,
        fightCam: {
          available: fightCam.available, active: fightCam.active,
          prewarmed: fightCam.prewarmed, rendered: fightCam.hasRendered(),
        },
        beaconScale: sceneSet.beaconScale,
        fishSource: sceneSet.fishSource,
        fishScreen: { x: fishPx.x, y: fishPx.y },
        fishWorld: { x: fishWorldPos.x, y: fishWorldPos.y, z: fishWorldPos.z },
        camera: {
          x: camera.position.x, y: camera.position.y, z: camera.position.z,
          yaw: camera.rotation.y, pitch: camera.rotation.x, fov: camera.fov,
        },
        qte: {
          phase: qte.phase,
          round: qte.round,
          rounds: qte.state.rounds,
          baseRounds: qte.state.baseRounds,
          hitGain: qte.state.hitGain,
          progress: qte.progress,
          dir: qte.state.dir,
          sweep: qte.state.sweep,
          ready: qte.state.ready,
          locked: qte.state.locked,
          lockT: qte.state.lockT,
          lockDur: qte.state.lockDur,
          timeLeft: qte.state.timeLeft,
          timeoutMs: qte.state.timeoutMs,
          notReady: qte.state.notReady,
          netOverlap,
          hits: qte.state.hits,
          misses: qte.state.misses,
          fishDist,
          lineOut,
          spoolLeft: spoolLeft(),
          autoReel: autoReelFight,
          qteDone,
          escaping: state === S.ESCAPING,
          // legacy aliases
          window: qte.state.timeoutMs,
          windowOpen: qte.state.ready,
          windowRemaining: qte.windowRemaining,
          ringFrac: 1 - qte.state.sweep,
          bandOuter: 1,
          bandInner: 0,
          pullDir: qte.state.dir,
          control: 0,
          tensionKg: 0,
          tensionLb: 0,
        },
        fight: { ..._fightInfo },
        shock: { hitStop: qte.state.hitStop > 0, spoolBreakT },
        fps: engine.fps,
      };
    },
    debugApi,
    enter,
    exit,
    update,
    prewarm,
    toggleGear,
    openBag,
    closeBag,
    get ui() { return ui; },
    get qte() { return qte; },
    get audio() { return audio; },
    get bag() { return { items: bagItems(), count: bagCount(), turntable }; },
    get net() { return net; },
    get scene() { return sceneSet; },
  };

  return api;
}
