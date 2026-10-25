// 路亚俱乐部 · 钓鱼音效 — procedural WebAudio plus the 90 s sea loop.
//
// A quiet sea/wind bed plus short synthesized SFX for the cast, reel, line,
// splash, QTE hits/misses, the fish's power lock, the landing net and the
// catch sting. Everything is gated by the existing sound toggle
// (`body.sound-off` / `app.bus 'audio:toggle'`) and the context is resumed on
// the first user gesture after entering fishing.

import { createMusic } from './music.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function isMuted() {
  return typeof document !== 'undefined'
    && document.body.classList.contains('sound-off');
}

export function createFishingAudio(app = null) {
  const music = createMusic();
  let ac = null;
  let master = null;
  let sfx = null;
  let ambient = null;
  let noise = null;
  let ambientNodes = [];
  let ambientOn = false;
  let muted = isMuted();
  let entered = false;
  // Round 5: fishing audio is OFF until the player explicitly enables it in the
  // HUD. A fresh page never creates an AudioContext (and never loops the bed).
  let enabled = false;
  let suppressAmbient = false;
  let restoreTimer = 0;
  let lastReel = 0;
  let reelOn = false;
  let chargeOsc = null;
  let chargeGain = null;
  let gestureBound = false;
  let offToggle = null;

  function ensure() {
    if (ac) return ac;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = (enabled && !muted) ? 0.85 : 0;
      master.connect(ac.destination);
      sfx = ac.createGain();
      sfx.gain.value = 0.85;
      sfx.connect(master);
      ambient = ac.createGain();
      ambient.gain.value = 0;
      ambient.connect(master);
      noise = makeNoise(ac);
    } catch (err) {
      ac = null;
    }
    return ac;
  }

  function makeNoise(audio) {
    const seconds = 2;
    const len = Math.floor(audio.sampleRate * seconds);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise: softer than white, reads as water
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buf;
  }

  function resume() {
    if (!enabled) return;
    ensure();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  }

  let gestureSeen = false;

  function bindGesture() {
    if (gestureBound || typeof window === 'undefined') return;
    gestureBound = true;
    const on = () => {
      gestureSeen = true;
      if (!entered || !enabled) return;
      ensure();
      resume();
      if (!muted && !suppressAmbient && !ambientOn) startAmbient();
    };
    window.addEventListener('pointerdown', on, { passive: true, once: false });
    window.addEventListener('keydown', on, { passive: true, once: false });
  }

  function setMuted(next) {
    muted = !!next;
    if (master && ac) {
      const target = (muted || !enabled) ? 0 : 0.85;
      try { master.gain.setTargetAtTime(target, ac.currentTime, 0.05); } catch (e) { /* noop */ }
    }
    if (muted) stopAmbient();
  }

  function startAmbient() {
    if (!enabled || muted || suppressAmbient) return;
    if (!ensure() || ambientOn) return;
    ambientOn = true;
    // sea bed: filtered brown noise + very slow lapping LFO
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 70;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    lp.Q.value = 0.6;
    const bed = ac.createGain();
    bed.gain.value = 0.055;
    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.11;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.028;
    lfo.connect(lfoGain);
    lfoGain.connect(bed.gain);
    src.connect(hp);
    hp.connect(lp);
    lp.connect(bed);
    bed.connect(ambient);

    // wind: a second noise voice, band-limited high and slower
    const src2 = ac.createBufferSource();
    src2.buffer = noise;
    src2.loop = true;
    src2.playbackRate.value = 1.37;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 0.5;
    const wind = ac.createGain();
    wind.gain.value = 0.018;
    const lfo2 = ac.createOscillator();
    lfo2.frequency.value = 0.073;
    const lfo2g = ac.createGain();
    lfo2g.gain.value = 0.012;
    lfo2.connect(lfo2g);
    lfo2g.connect(wind.gain);
    src2.connect(bp);
    bp.connect(wind);
    wind.connect(ambient);

    src.start();
    src2.start();
    lfo.start();
    lfo2.start();
    ambientNodes = [src, src2, lfo, lfo2, bed, wind, hp, lp, bp, lfoGain, lfo2g];
    ambient.gain.setTargetAtTime(0.9, ac.currentTime, 1.4);
  }

  function stopAmbient() {
    ambientOn = false;
    if (!ac) { ambientNodes = []; return; }
    const now = ac.currentTime;
    try {
      ambient.gain.cancelScheduledValues(now);
      ambient.gain.setValueAtTime(0, now);
    } catch (e) { /* noop */ }
    const nodes = ambientNodes;
    ambientNodes = [];
    // stop the sources IMMEDIATELY; no fade-out/leftover loop
    for (const n of nodes) {
      try { n.stop?.(0); } catch (e) { /* noop */ }
    }
    for (const n of nodes) {
      try { n.disconnect?.(); } catch (e) { /* noop */ }
    }
  }

  function stopCharge() {
    if (!chargeOsc) return;
    const osc = chargeOsc;
    chargeOsc = null;
    chargeGain = null;
    try { osc.stop(0); } catch (e) { /* noop */ }
    try { osc.disconnect?.(); } catch (e) { /* noop */ }
  }

  /** Stop every source, kill the master gain. disable=true also flips the HUD. */
  function silence(disable = true) {
    if (ac) {
      const now = ac.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(0, now);
        master.gain.value = 0;
      } catch (e) { /* noop */ }
    }
    stopAmbient();
    stopCharge();
    reelOn = false;
    if (disable) enabled = false;
  }

  function setEnabled(on) {
    enabled = !!on;
    // The HUD switch and the global sound icon share body.sound-off. If the
    // player enables sound in the fishing HUD, that class must be cleared too;
    // otherwise the label says ON, the music plays, but every WebAudio SFX is
    // still muted by isMuted()/master gain 0.
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('sound-off', !enabled);
    }
    muted = !enabled;
    if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = 0; }
    if (!enabled) {
      silence(false);
      try { music.setEnabled(false); } catch (e) { /* noop */ }
      return enabled;
    }
    ensure();
    resume();
    restore();
    try { music.enter(); music.setEnabled(true); } catch (e) { /* noop */ }
    return enabled;
  }

  /** Restore output for an enabled preference (after a transient hush). */
  function restore() {
    if (!enabled || muted) return false;
    if (!ensure()) return false;
    resume();
    if (!ac) return false;
    const now = ac.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0.85, now);
      master.gain.value = 0.85;
    } catch (e) { /* noop */ }
    if (!suppressAmbient && !ambientOn) startAmbient();
    try { music.resume(); } catch (e) { /* noop */ }
    return true;
  }

  function restoreSoon(ms = 600) {
    clearTimeout(restoreTimer);
    if (!enabled) return false;
    restoreTimer = setTimeout(() => { restoreTimer = 0; restore(); }, Math.max(0, ms));
    return true;
  }

  function holdAmbient(v) {
    suppressAmbient = !!v;
    if (suppressAmbient) stopAmbient();
    return suppressAmbient;
  }

  function closeContext() {
    silence(true);
    if (ac) {
      try { ac.close(); } catch (e) { /* noop */ }
    }
    ac = null; master = null; sfx = null; ambient = null;
    ambientNodes = [];
    ambientOn = false;
  }

  // -------------------------------------------------------------------------
  // primitives
  // -------------------------------------------------------------------------
  function burst({ dur = 0.28, gain = 0.12, freq = 1200, q = 1.0, type = 'bandpass', sweepTo = 0, attack = 0.004, dest = null } = {}) {
    if (!enabled || muted) return;
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest || sfx);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone({ freq = 600, freqTo = 0, dur = 0.22, gain = 0.12, type = 'sine', attack = 0.006, dest = null } = {}) {
    if (!enabled || muted) return;
    if (!ensure()) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest || sfx);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function schedule(fn, ms) {
    setTimeout(() => { try { fn(); } catch (e) { /* noop */ } }, ms);
  }

  // -------------------------------------------------------------------------
  // public SFX
  // -------------------------------------------------------------------------
  const api = {
    /** Called on fishing enter. The AudioContext is only created on a gesture. */
    enter() {
      entered = true;
      muted = isMuted();
      // default silent: no context, no ambient bed
      enabled = false;
      suppressAmbient = false;
      try { music.exit(); } catch (e) { /* noop */ }
      bindGesture();
      if (!offToggle && app?.bus) {
        offToggle = app.bus.on('audio:toggle', (on) => {
          setMuted(!on);
          if (!on) stopAmbient();
          else if (enabled && !suppressAmbient) startAmbient();
        });
      }
      if (ac) {
        const now = ac.currentTime;
        try { master.gain.setValueAtTime(0, now); } catch (e) { /* noop */ }
      }
      return api;
    },
    exit() {
      entered = false;
      reelOn = false;
      suppressAmbient = true;
      if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = 0; }
      silence(true);
      if (offToggle) { try { offToggle(); } catch (e) { /* noop */ } offToggle = null; }
      try { music.exit(); } catch (e) { /* noop */ }
      if (ac) { try { ac.suspend(); } catch (e) { /* noop */ } }
    },
    /** Transient hush: mutes output but NEVER flips the user preference. */
    hush() { silence(false); return enabled; },
    /** Emergency stop; keeps the preference sticky. */
    panic() {
      silence(false);
      if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = 0; }
      if (ac?.state === 'running') { try { ac.suspend(); } catch (e) { /* noop */ } }
      try { music.hush(); } catch (e) { /* noop */ }
      return enabled;
    },
    restore,
    restoreSoon,
    holdAmbient,
    close() { closeContext(); },
    setEnabled,
    toggle() { return setEnabled(!enabled); },
    get enabled() { return enabled; },
    get ambientOn() { return ambientOn; },
    get ctxState() { return ac ? ac.state : 'none'; },
    get masterGain() { return master ? master.gain.value : 0; },
    debug() {
      return {
        enabled, muted, ambientOn, ctx: ac ? ac.state : 'none',
        master: master ? +master.gain.value.toFixed(3) : 0,
        ambientNodes: ambientNodes.length, charging: !!chargeOsc,
        music: {
          playing: !!music.playing,
          time: +(music.currentTime || 0).toFixed(2),
          duration: +(music.duration || 0).toFixed(2),
          volume: +(music.volume || 0).toFixed(3),
        },
      };
    },
    resume,
    setMuted,
    get muted() { return muted; },
    get ready() { return !!ac; },

    cast() {
      // line leaves the spool: filtered whoosh sweeping down
      burst({ dur: 0.42, gain: 0.09, freq: 2400, sweepTo: 420, q: 0.8, type: 'bandpass' });
      schedule(() => burst({ dur: 0.18, gain: 0.05, freq: 600, sweepTo: 220, q: 0.6, type: 'lowpass' }), 120);
    },
    splash(strength = 1) {
      const s = Math.max(0.2, Math.min(2, strength));
      burst({ dur: 0.34 + s * 0.1, gain: 0.06 + s * 0.05, freq: 1500, sweepTo: 240, q: 0.5, type: 'lowpass' });
      tone({ freq: 120, freqTo: 62, dur: 0.22, gain: 0.05 * s, type: 'sine' });
    },
    hook() {
      // line snapping tight + a heavy splash
      tone({ freq: 220, freqTo: 90, dur: 0.18, gain: 0.09, type: 'triangle' });
      burst({ dur: 0.3, gain: 0.1, freq: 900, sweepTo: 300, q: 0.7, type: 'lowpass' });
      schedule(() => api.splash(1.1), 60);
    },
    reelTick() {
      tone({ freq: 2600, freqTo: 1900, dur: 0.018, gain: 0.018, type: 'square' });
    },
    // ---- round 4: cast charge + sweep QTE cues --------------------------
    chargeStart() {
      if (!enabled || muted || chargeOsc) return;
      if (!ensure()) return;
      const t = ac.currentTime;
      chargeOsc = ac.createOscillator();
      chargeOsc.type = 'triangle';
      chargeOsc.frequency.setValueAtTime(170, t);
      chargeGain = ac.createGain();
      chargeGain.gain.setValueAtTime(0.0001, t);
      chargeGain.gain.exponentialRampToValueAtTime(0.035, t + 0.09);
      chargeOsc.connect(chargeGain);
      chargeGain.connect(sfx);
      chargeOsc.start(t);
    },
    chargeUpdate(ratio) {
      if (!chargeOsc || !ac) return;
      const r = Math.max(0, Math.min(1, Number(ratio) || 0));
      chargeOsc.frequency.setTargetAtTime(170 + 560 * r, ac.currentTime, 0.05);
      if (chargeGain) chargeGain.gain.setTargetAtTime(0.03 + 0.03 * r, ac.currentTime, 0.08);
    },
    chargeEnd() {
      if (!chargeOsc || !ac) return;
      const t = ac.currentTime;
      try { chargeGain.gain.setTargetAtTime(0.0001, t, 0.025); } catch (e) { /* noop */ }
      try { chargeOsc.stop(t + 0.12); } catch (e) { /* noop */ }
      chargeOsc = null;
      chargeGain = null;
      tone({ freq: 380, freqTo: 260, dur: 0.12, gain: 0.04, type: 'triangle' });
    },
    qteRound() {
      tone({ freq: 520, freqTo: 460, dur: 0.09, gain: 0.026, type: 'triangle' });
    },
    qteReady() {
      tone({ freq: 880, freqTo: 1320, dur: 0.16, gain: 0.045, type: 'sine' });
      tone({ freq: 1760, dur: 0.12, gain: 0.014, type: 'sine' });
    },
    qteNotReady() {
      tone({ freq: 220, freqTo: 160, dur: 0.1, gain: 0.028, type: 'triangle' });
    },
    spoolBreak() {
      burst({ dur: 0.5, gain: 0.1, freq: 3200, sweepTo: 400, q: 1.2, type: 'bandpass' });
      tone({ freq: 120, freqTo: 50, dur: 0.5, gain: 0.07, type: 'sine' });
    },
    run() {
      // the fish surges: a long drag whoosh + water shear
      burst({ dur: 0.7, gain: 0.1, freq: 700, sweepTo: 1500, q: 0.9, type: 'bandpass' });
      burst({ dur: 0.5, gain: 0.05, freq: 2400, sweepTo: 900, q: 1.4, type: 'bandpass' });
      tone({ freq: 150, freqTo: 70, dur: 0.4, gain: 0.045, type: 'sine' });
    },
    thrash() {
      burst({ dur: 0.22, gain: 0.055, freq: 1800, sweepTo: 500, q: 0.8, type: 'bandpass' });
      tone({ freq: 95, freqTo: 60, dur: 0.16, gain: 0.04, type: 'sine' });
    },
    hit() {
      tone({ freq: 1400, freqTo: 880, dur: 0.16, gain: 0.075, type: 'triangle' });
      tone({ freq: 140, freqTo: 72, dur: 0.24, gain: 0.075, type: 'sine' });
      burst({ dur: 0.12, gain: 0.06, freq: 3000, sweepTo: 1200, q: 1.2, type: 'bandpass' });
    },
    miss() {
      tone({ freq: 150, freqTo: 86, dur: 0.2, gain: 0.07, type: 'sine' });
      burst({ dur: 0.18, gain: 0.045, freq: 500, sweepTo: 180, q: 0.6, type: 'lowpass' });
    },
    lock() {
      // alarm: two short descending blips
      tone({ freq: 880, freqTo: 620, dur: 0.12, gain: 0.05, type: 'square' });
      schedule(() => tone({ freq: 660, freqTo: 460, dur: 0.16, gain: 0.05, type: 'square' }), 140);
      burst({ dur: 0.3, gain: 0.04, freq: 300, sweepTo: 160, q: 0.5, type: 'lowpass' });
    },
    unlock() {
      tone({ freq: 520, freqTo: 780, dur: 0.14, gain: 0.045, type: 'triangle' });
    },
    net() {
      burst({ dur: 0.26, gain: 0.06, freq: 2800, sweepTo: 900, q: 1.0, type: 'bandpass' });
    },
    scoop() {
      burst({ dur: 0.4, gain: 0.09, freq: 1600, sweepTo: 350, q: 0.6, type: 'lowpass' });
      tone({ freq: 180, freqTo: 95, dur: 0.26, gain: 0.06, type: 'sine' });
      schedule(() => burst({ dur: 0.3, gain: 0.05, freq: 900, sweepTo: 260, q: 0.5, type: 'lowpass' }), 120);
    },
    escape() {
      tone({ freq: 420, freqTo: 120, dur: 0.8, gain: 0.06, type: 'triangle' });
      burst({ dur: 0.7, gain: 0.05, freq: 1200, sweepTo: 300, q: 0.5, type: 'lowpass' });
      schedule(() => api.splash(0.7), 90);
    },
    catchSting() {
      // a small brass-ish bell chord: root, fifth, octave
      const notes = [523.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        schedule(() => {
          tone({ freq: f, dur: 1.1 - i * 0.15, gain: 0.045, type: 'sine' });
          tone({ freq: f * 2.001, dur: 0.5, gain: 0.016, type: 'sine' });
        }, i * 45);
      });
      schedule(() => tone({ freq: 261.6, dur: 1.2, gain: 0.035, type: 'triangle' }), 0);
    },

    /**
     * Per-frame-ish audio state pump (called from fishing.update). Schedules
     * reel clicks while R is held; no allocation in the hot path.
     */
    update(dt, s) {
      if (!ac || !enabled || muted) { reelOn = false; return; }
      const reeling = !!s?.reeling;
      if (reeling && !reelOn) { reelOn = true; lastReel = 0; }
      if (!reeling) { reelOn = false; return; }
      const interval = s.runActive ? 0.045 : 0.085;
      lastReel += dt;
      if (lastReel >= interval) {
        lastReel = 0;
        api.reelTick();
      }
    },
    dispose() {
      api.exit();
      closeContext();
      try { music.dispose(); } catch (e) { /* noop */ }
    },
  };
  return api;
}
