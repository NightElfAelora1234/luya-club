// 路亚俱乐部 · QTE — directional mouse sweeps + Space confirm (round 4)
//
// Each round alternates a big LEFT / RIGHT prompt. The player sweeps the mouse
// in that direction to fill a gauge; when it is full a Space glyph pulses and
// one Space press lands the hit. There is no precise timing window — the action
// is invented to be forgiving and readable.
//
//   round  : sweep the mouse ←/→ until the gauge is full, then Space
//   break  : short between-round beat (fish surge); a power lock can happen,
//            it auto-releases and swipes/Space shorten it
//   miss   : timeout only; an early Space is a harmless "not ready" flash
//
// Pure logic: no DOM, no three.js. The fishing sim reacts through callbacks
// and owns the fish/line/camera presentation.

import { clamp } from '../core/util.js';

const BASE_ROUNDS = 8;
const HIT_GAIN = 0.125;
const MISS_LOSS = 0.08;
const MAX_ROUNDS = 20;
const FILL_PER_PX = 1 / 500;     // ~500 px of correct-direction movement = full
const ROUND_TIMEOUT = 7.0;       // very forgiving; sweeps normally fill in ~1 s
const BREAK_BEAT = 0.45;         // between-round beat before the next arrow

export function createQTE() {
  const state = {
    phase: 'idle',              // idle | round | resolve | break | done
    round: 0,
    rounds: BASE_ROUNDS,
    baseRounds: BASE_ROUNDS,
    hitGain: HIT_GAIN,
    progress: 0,
    hits: 0,
    misses: 0,
    results: [],                // 'hit' | 'miss' per finished round
    dir: 1,                     // +1 = sweep right, -1 = sweep left
    sweep: 0,                   // 0..1 gauge fill
    ready: false,               // gauge full → Space will land the hit
    t: 0,
    dur: ROUND_TIMEOUT,
    timeoutMs: ROUND_TIMEOUT * 1000,
    timeLeft: ROUND_TIMEOUT,
    result: null,
    resolveT: 0,
    resolveDur: 0.42,
    hitStop: 0,
    hitStopDur: 0.08,
    chain: 0,
    verdict: '',
    verdictKind: '',
    notReady: 0,                // >0 → UI flashes “press when the bar is full”
    fillPulse: 0,               // visual pulse while the gauge is filling
    breakT: 0,
    breakDur: BREAK_BEAT,
    locked: false,
    lockT: 0,
    lockDur: 0,
    lockPower: 0.5,
    runs: 0,
    done: false,
    // legacy fields kept so older QA hooks keep reading sensible numbers
    windowMs: ROUND_TIMEOUT * 1000,
    windowOpen: false,
    ringFrac: 1,
    windowScale: 1,
    hitBonus: 0,
  };

  let cbs = {};

  function emit(name, ...args) {
    try { cbs[name]?.(...args); } catch (err) { console.warn('[qte]', name, err?.message || err); }
  }

  function reset() {
    state.phase = 'idle';
    state.round = 0;
    state.rounds = BASE_ROUNDS;
    state.baseRounds = BASE_ROUNDS;
    state.hitGain = HIT_GAIN;
    state.progress = 0;
    state.hits = 0;
    state.misses = 0;
    state.results.length = 0;
    state.dir = 1;
    state.sweep = 0;
    state.ready = false;
    state.t = 0;
    state.dur = ROUND_TIMEOUT;
    state.timeoutMs = ROUND_TIMEOUT * 1000;
    state.timeLeft = ROUND_TIMEOUT;
    state.result = null;
    state.resolveT = 0;
    state.resolveDur = 0.42;
    state.hitStop = 0;
    state.chain = 0;
    state.verdict = '';
    state.verdictKind = '';
    state.notReady = 0;
    state.fillPulse = 0;
    state.breakT = 0;
    state.breakDur = BREAK_BEAT;
    state.locked = false;
    state.lockT = 0;
    state.lockDur = 0;
    state.lockPower = 0.5;
    state.runs = 0;
    state.done = false;
    state.windowMs = ROUND_TIMEOUT * 1000;
    state.windowOpen = false;
    state.ringFrac = 1;
    state.windowScale = 1;
    state.hitBonus = 0;
  }

  function beginRound() {
    if (state.round >= MAX_ROUNDS) { finish(); return; }
    state.round += 1;
    state.rounds = Math.max(state.baseRounds || BASE_ROUNDS, state.round);
    // directions alternate so the player naturally swings the rod side to side
    state.dir = state.round % 2 === 1 ? 1 : -1;
    state.sweep = 0;
    state.ready = false;
    state.t = 0;
    state.timeLeft = state.dur;
    // later rounds get slightly less patience, but stay generous
    state.dur = Math.max(5.0, ROUND_TIMEOUT - (state.round - 1) * 0.35);
    state.timeoutMs = state.dur * 1000;
    state.result = null;
    state.resolveT = 0;
    state.notReady = 0;
    state.locked = false;
    state.lockT = 0;
    state.phase = 'round';
    state.windowOpen = false;
    state.ringFrac = 1;
    emit('onRound', state.round, state);
  }

  function beginBreak() {
    state.phase = 'break';
    state.breakT = 0;
    state.breakDur = BREAK_BEAT;
    state.runs += 1;
    state.ready = false;
    state.windowOpen = false;
    state.ringFrac = 0;
    emit('onBreak', state);
  }

  function pickHitVerdict() {
    if (state.hits === 1) return '刺中！';
    if (state.progress >= 0.999) return '收线！';
    if (state.chain >= 3) return '漂亮！';
    return '中！';
  }

  function pickMissVerdict() {
    return ['跑了！', '脱钩了…', '别急！'][state.misses % 3];
  }

  function resolve(kind, why) {
    if (state.phase !== 'round') return;
    state.result = kind;
    state.phase = 'resolve';
    state.resolveT = 0;
    state.resolveDur = kind === 'hit' ? 0.42 : 0.5;
    state.results.push(kind);
    if (kind === 'hit') {
      state.hits += 1;
      state.chain += 1;
      state.progress = Math.min(1, state.progress + (state.hitGain || HIT_GAIN) + (state.hitBonus || 0));
      state.hitStop = state.hitStopDur;
      state.verdict = pickHitVerdict();
      state.verdictKind = 'hit';
      emit('onHit', state, why || 'hit');
    } else {
      state.misses += 1;
      state.chain = 0;
      state.progress = Math.max(0.02, state.progress - MISS_LOSS);
      state.verdict = pickMissVerdict();
      state.verdictKind = 'miss';
      emit('onMiss', state, why || 'timeout');
    }
  }

  function finish() {
    state.phase = 'done';
    state.done = true;
    state.sweep = 1;
    state.ready = false;
    state.windowOpen = false;
    emit('onDone', state);
  }

  function update(dt) {
    if (state.phase === 'idle' || state.phase === 'done') return;
    if (state.hitStop > 0) {
      state.hitStop = Math.max(0, state.hitStop - dt);
      return;
    }
    state.notReady = Math.max(0, state.notReady - dt);
    state.fillPulse = Math.max(0, state.fillPulse - dt * 3);
    if (state.phase === 'round') {
      state.t += dt;
      state.timeLeft = Math.max(0, state.dur - state.t);
      if (state.t >= state.dur) resolve('miss', 'timeout');
    } else if (state.phase === 'resolve') {
      state.resolveT += dt;
      if (state.resolveT >= state.resolveDur) {
        if (state.progress >= 1 - 1e-6) finish();
        else beginBreak();
      }
    } else if (state.phase === 'break') {
      state.breakT += dt;
      if (state.locked) {
        state.lockT += dt;
        // HARD auto-release even if an event handler stalls the break
        if (state.lockT >= state.lockDur || state.breakT > state.lockDur + 1.0) {
          state.locked = false;
          state.lockT = 0;
          emit('onUnlock', state);
        }
      }
      if (state.breakT >= state.breakDur && !state.locked) beginRound();
    }
  }

  /** Mouse movement in pixels: only the prompted direction fills the gauge. */
  function sweepInput(dx) {
    if (!dx) return state.sweep;
    if (state.phase === 'break') {
      if (state.locked && dx * state.dir > 0) {
        // sweeping against the fish helps break the lock early
        state.lockT = Math.max(0, state.lockT - Math.abs(dx) * 0.0009);
        state.fillPulse = Math.max(state.fillPulse, 0.5);
        if (state.lockT <= 0.02) {
          state.locked = false;
          state.lockT = 0;
          emit('onUnlock', state);
        }
      }
      return state.sweep;
    }
    if (state.phase !== 'round') return state.sweep;
    const fill = Math.max(0, dx * state.dir);
    if (fill > 0) {
      state.sweep = clamp(state.sweep + fill * FILL_PER_PX, 0, 1);
      state.fillPulse = 1;
      if (state.sweep >= 1 - 1e-6 && !state.ready) {
        state.ready = true;
        state.windowOpen = true;
        state.ringFrac = 0;
        emit('onReady', state);
      }
    }
    return state.sweep;
  }

  /** Space / tap: lands the hit only when the gauge is full. */
  function confirm() {
    if (state.phase === 'break') {
      if (state.locked) {
        state.lockT = Math.max(0, state.lockT - 0.35);
        state.fillPulse = 1;
        if (state.lockT <= 0.02) {
          state.locked = false;
          state.lockT = 0;
          emit('onUnlock', state);
        }
        return 'lock-hit';
      }
      return null;
    }
    if (state.phase !== 'round') return null;
    if (state.ready) {
      resolve('hit', 'space');
      return 'hit';
    }
    // pressing early is harmless: a small "not ready" flash, no miss
    state.notReady = 0.55;
    emit('onNotReady', state);
    return 'not-ready';
  }

  /** Start a power lock during the break: sweeps/Space shorten it, it auto-releases. */
  function startLock(duration = 1.6, power = 0.6) {
    if (state.phase !== 'break') return false;
    state.locked = true;
    state.lockT = 0;
    state.lockDur = clamp(Number(duration) || 1.2, 0.9, 1.8);
    state.lockPower = clamp(Number(power) || 0.6, 0, 1);
    state.breakDur = Math.max(state.breakDur, 0.5);
    emit('onLock', state);
    return true;
  }

  return {
    state,
    setHandlers(next) { cbs = next || {}; },
    start(options = {}) {
      reset();
      const planned = clamp(Number(options.rounds) || BASE_ROUNDS, 6, 12);
      state.baseRounds = planned;
      state.rounds = planned;
      state.hitGain = 1 / planned;
      emit('onStart', state);
      beginRound();
      return state;
    },
    stop() { reset(); },
    update,
    sweepInput,
    confirm,
    startLock,
    /** legacy hook: fishing v3 called this after a run; now breaks are internal */
    nextRound() {
      if (state.phase === 'break' && !state.locked && state.breakT >= state.breakDur) beginRound();
      return state.phase;
    },
    setPerformance({ windowScale = 1, hitBonus = 0 } = {}) {
      state.windowScale = clamp(Number(windowScale) || 1, 0.8, 1.15);
      state.hitBonus = clamp(Number(hitBonus) || 0, 0, 0.05);
      return state;
    },
    forceHit() {
      if (state.phase !== 'round') return false;
      state.sweep = 1;
      state.ready = true;
      resolve('hit', 'debug');
      return true;
    },
    forceMiss() {
      if (state.phase !== 'round') return false;
      resolve('miss', 'debug');
      return true;
    },
    forceReady() {
      if (state.phase !== 'round') return false;
      state.sweep = 1;
      state.ready = true;
      state.windowOpen = true;
      state.ringFrac = 0;
      emit('onReady', state);
      return true;
    },
    get active() { return state.phase === 'round' || state.phase === 'resolve' || state.phase === 'break'; },
    get progress() { return state.progress; },
    get round() { return state.round; },
    get baseRounds() { return state.baseRounds; },
    get phase() { return state.phase; },
    get windowOpen() { return state.ready; },
    get windowRemaining() { return state.phase === 'round' ? Math.max(0, state.dur - state.t) : 0; },
    get windowBefore() { return 0; },
    get ringFrac() { return 1 - state.sweep; },
  };
}
