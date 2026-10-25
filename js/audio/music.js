// 90 s South China Sea loop for the fishing scene.
// The track is fully synthesised (assets/audio/south-china-sea-90s.ogg) and
// loops gaplessly; the last two seconds were crossfaded into the head offline.
//
// It follows the existing user sound preference: default silent, starts only
// when the player enables sound, pauses on exit/pagehide, resumes on visibility.

const TRACK_OGG = 'assets/audio/south-china-sea-90s.ogg';
const TRACK_MP3 = 'assets/audio/south-china-sea-90s.mp3';

export function createMusic() {
  let audio = null;
  let wanted = false;
  let active = false;
  let fadeTimer = 0;
  let volume = 0;
  let disposed = false;
  const targetVolume = 0.34;

  function ensure() {
    if (audio || disposed) return audio;
    audio = new Audio();
    const canOgg = audio.canPlayType && audio.canPlayType('audio/ogg; codecs="vorbis"');
    audio.src = canOgg ? TRACK_OGG : TRACK_MP3;
    audio.loop = true;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.volume = 0;
    try { audio.load(); } catch (e) { /* noop */ }
    return audio;
  }

  function clearFade() {
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = 0; }
  }

  function fadeTo(next, ms = 1600, pauseAtZero = false) {
    const a = ensure();
    if (!a) return;
    clearFade();
    const from = a.volume;
    const started = performance.now();
    const step = () => {
      if (!a) return;
      const k = Math.min(1, (performance.now() - started) / Math.max(50, ms));
      const e = k * k * (3 - 2 * k);
      volume = from + (next - from) * e;
      a.volume = Math.max(0, Math.min(1, volume));
      if (k >= 1) {
        clearFade();
        if (pauseAtZero && next <= 0.001) { try { a.pause(); } catch (e) { /* noop */ } }
      }
    };
    fadeTimer = setInterval(step, 34);
    step();
  }

  function play() {
    const a = ensure();
    if (!a || !wanted) return;
    const p = a.play();
    if (p && p.catch) p.catch(() => { /* gesture gate; retry on next toggle */ });
    fadeTo(targetVolume, 2200);
  }

  function pause() {
    if (!audio) return;
    fadeTo(0, 700, true);
  }

  // Browser/OS tab visibility: pause while hidden, restore the user's ON
  // preference when the player comes back. This module owns the HTMLAudio
  // element, so it can do this even while the WebAudio context is suspended.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (audio) { clearFade(); audio.pause(); }
      } else if (wanted && active) {
        play();
      }
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => { if (audio) { clearFade(); audio.pause(); } });
  }

  return {
    get playing() { return !!(audio && !audio.paused); },
    get currentTime() { return audio ? audio.currentTime : 0; },
    get duration() { return audio ? audio.duration : 90; },
    get volume() { return audio ? audio.volume : 0; },

    /** User preference; only the sound button calls this. */
    setEnabled(on) {
      wanted = !!on;
      if (disposed) return wanted;
      if (wanted) play(); else pause();
      return wanted;
    },
    /** Call after entering fishing; does not override an OFF preference. */
    enter() {
      active = true;
      if (wanted) play();
    },
    /** Pause without changing the user preference; resume() restores it. */
    hush() {
      if (!audio) return;
      clearFade();
      fadeTo(0, 500, true);
    },
    resume() {
      if (!audio || !wanted || !active) return;
      try { audio.play().catch(() => {}); } catch (e) { /* noop */ }
      fadeTo(targetVolume, 1200);
    },
    exit() {
      active = false;
      wanted = false;
      pause();
      if (audio) { try { audio.currentTime = 0; } catch (e) { /* noop */ } }
    },
    dispose() {
      disposed = true;
      clearFade();
      if (audio) { try { audio.pause(); audio.src = ''; } catch (e) { /* noop */ } audio = null; }
    },
  };
}
