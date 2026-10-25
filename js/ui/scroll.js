import { app } from '../core/state.js';
import { clamp, damp } from '../core/util.js';

export function createScroll() {
  let max = 1;
  let lastScroll = -1;

  function measure() {
    max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  function onScroll() {
    if (app.mode !== 'dive') return;
    lastScroll = window.scrollY;
    app.progressTarget = clamp(window.scrollY / max);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('wheel', (e) => {
    if (app.mode !== 'dive') e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    if (app.mode !== 'dive') e.preventDefault();
  }, { passive: false });

  // Space / arrows must not scroll the page while fishing or in the shop.
  window.addEventListener('keydown', (e) => {
    if (app.mode === 'dive') return;
    if (['Space', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.code)) {
      e.preventDefault();
    }
  }, { passive: false });

  measure();

  return {
    get max() { return max; },
    update(dt) {
      if (app.mode !== 'dive') return;
      if (window.scrollY !== lastScroll) {
        lastScroll = window.scrollY;
        app.progressTarget = clamp(window.scrollY / max);
      }
      const step = Math.min(dt, 0.05);
      const prev = app.progress;
      let next = damp(prev, app.progressTarget, 2.6, step);
      // Hard cinematic speed limit: a flick of the wheel must not teleport the
      // camera through 30 metres of water in a few frames.
      const maxDown = 0.16 * step;
      const maxUp = 0.55 * step;
      const delta = next - prev;
      next = prev + clamp(delta, -maxUp, maxDown);
      app.progress = clamp(next);
      if (Math.abs(app.progress - app.progressTarget) < 0.00035) app.progress = app.progressTarget;
    },
    setProgress(p, immediate = false) {
      measure();
      const k = clamp(p);
      window.scrollTo(0, k * max);
      app.progressTarget = k;
      if (immediate) app.progress = k;
      lastScroll = window.scrollY;
    },
    reset() {
      window.scrollTo(0, 0);
      app.progress = 0;
      app.progressTarget = 0;
      lastScroll = 0;
      measure();
    },
    lock(locked) {
      document.body.classList.toggle('locked', locked);
    },
  };
}
