import * as THREE from 'three';
import { app } from '../core/state.js';

// Depth-graded light + water. Everything is expressed as a function of camera
// depth so the dive, the shop and the fishing scene all share one atmosphere.
const KEYS = [
  { d: 0, fog: 0x8b8f8c, density: 0.00034, hemiSky: 0x94bdcf, hemiGround: 0x132a32, hemiI: 1.0,
    sunI: 4.2, sunColor: 0xffc98f, exposure: 0.94, ambient: 0.3, tint: 0x8b8f8c },
  { d: 4, fog: 0x357883, density: 0.012, hemiSky: 0x5aa9b8, hemiGround: 0x0b2830, hemiI: 0.8,
    sunI: 2.2, sunColor: 0xffd0a1, exposure: 1.02, ambient: 0.26, tint: 0x357883 },
  { d: 16, fog: 0x14566a, density: 0.021, hemiSky: 0x2e8499, hemiGround: 0x061e28, hemiI: 0.5,
    sunI: 0.9, sunColor: 0xbfe2e0, exposure: 1.12, ambient: 0.18, tint: 0x14566a },
  { d: 34, fog: 0x073246, density: 0.026, hemiSky: 0x155a70, hemiGround: 0x03141c, hemiI: 0.3,
    sunI: 0.34, sunColor: 0x8fbcc9, exposure: 1.2, ambient: 0.13, tint: 0x073246 },
  { d: 60, fog: 0x031723, density: 0.03, hemiSky: 0x082f40, hemiGround: 0x01080d, hemiI: 0.16,
    sunI: 0.12, sunColor: 0x6a97aa, exposure: 1.26, ambient: 0.08, tint: 0x031723 },
  { d: 84, fog: 0x010a11, density: 0.034, hemiSky: 0x041c27, hemiGround: 0x000304, hemiI: 0.09,
    sunI: 0.05, sunColor: 0x4a7a8e, exposure: 1.32, ambient: 0.05, tint: 0x010a11 },
  { d: 100, fog: 0x01070c, density: 0.036, hemiSky: 0x031319, hemiGround: 0x000203, hemiI: 0.08,
    sunI: 0.04, sunColor: 0x3f6c80, exposure: 1.35, ambient: 0.04, tint: 0x01070c },
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

export function createAtmosphere(engine) {
  const fog = new THREE.FogExp2(0x8b8f8c, 0.00034);
  engine.scene.fog = fog;
  engine.scene.background = new THREE.Color(0x8b8f8c);

  const state = {
    depth: 0,
    current: { ...KEYS[0] },
    sunColor: new THREE.Color(0xffc98f),
    hemiSky: new THREE.Color(0x94bdcf),
    hemiGround: new THREE.Color(0x132a32),
    fogColor: new THREE.Color(0x8b8f8c),
    tint: new THREE.Color(0x8b8f8c),
    aboveWater: true,
    update(cameraDepth) {
      const depth = Math.max(0, cameraDepth);
      this.depth = depth;
      let i = 0;
      while (i < KEYS.length - 2 && depth > KEYS[i + 1].d) i++;
      const a = KEYS[i], b = KEYS[i + 1];
      const t = Math.min(1, Math.max(0, (depth - a.d) / Math.max(0.001, b.d - a.d)));
      const k = t * t * (3 - 2 * t);

      this.fogColor.setHex(a.fog).lerp(tmpA.setHex(b.fog), k);
      this.sunColor.setHex(a.sunColor).lerp(tmpB.setHex(b.sunColor), k);
      this.hemiSky.setHex(a.hemiSky).lerp(tmpA.setHex(b.hemiSky), k);
      this.hemiGround.setHex(a.hemiGround).lerp(tmpB.setHex(b.hemiGround), k);
      this.tint.setHex(a.tint).lerp(tmpA.setHex(b.tint), k);

      fog.color.copy(this.fogColor);
      fog.density = THREE.MathUtils.lerp(a.density, b.density, k);
      engine.scene.background.copy(this.fogColor);
      engine.hemi.color.copy(this.hemiSky);
      engine.hemi.groundColor.copy(this.hemiGround);
      engine.hemi.intensity = THREE.MathUtils.lerp(a.hemiI, b.hemiI, k);
      engine.sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, k);
      engine.sun.color.copy(this.sunColor);
      engine.setExposure(THREE.MathUtils.lerp(a.exposure, b.exposure, k));
      engine.ambient = engine.ambient || 0.35;

      const above = cameraDepth > -0.15;
      if (above !== this.aboveWater) {
        this.aboveWater = above;
        app.bus.emit('atmosphere:surface', above);
      }
      return this;
    },
    get fogColorArray() { return [this.fogColor.r, this.fogColor.g, this.fogColor.b]; },
  };

  return state;
}
