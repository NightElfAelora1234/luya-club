import { Vector2 } from 'three';

class Bus {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (...args) => { off(); fn(...args); });
    return off;
  }
  off(name, fn) { this.map.get(name)?.delete(fn); }
  emit(name, ...args) { this.map.get(name)?.forEach((fn) => { try { fn(...args); } catch (e) { console.error('[bus]', name, e); } }); }
}

export const app = {
  mode: 'dive',           // dive | rebound | shop | fishing
  time: 0,
  dt: 0,
  frame: 0,
  loaded: false,
  progress: 0,            // smoothed 0..1 dive progress
  progressTarget: 0,
  depth: 0,               // positive metres below sea level, smoothed
  cameraDepth: 0,
  quality: 'high',
  isMobile: false,
  reducedMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  pointer: {
    x: 0, y: 0,
    u: 0.5, v: 0.5,
    ndc: new Vector2(0, 0),
    down: false,
    justDown: false,
    justUp: false,
    deltaX: 0, deltaY: 0,
    world: null,
    inside: false,
  },
  keys: new Set(),
  bus: new Bus(),
  actions: {},            // filled by main.js
  flags: {
    signDropped: false,
    surfaceCrossed: false,
    rodPrompted: false,
    reboundDone: false,
  },
  depthZones: [],
};

app.setMode = function setMode(mode) {
  if (this.mode === mode) return;
  const prev = this.mode;
  this.mode = mode;
  this.bus.emit('mode', mode, prev);
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  app.keys.add(e.code);
  app.bus.emit('key:down', e.code, e);
}, { passive: true });
window.addEventListener('keyup', (e) => {
  app.keys.delete(e.code);
  app.bus.emit('key:up', e.code, e);
}, { passive: true });
window.addEventListener('blur', () => app.keys.clear());
