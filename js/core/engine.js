import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { app } from './state.js';
import { SUN_DIR, SUN_COLOR, SUN_INTENSITY } from './world.js';
import { isMobile } from './util.js';
import {
  QUALITY_TIERS, QUALITY_PRESETS, presetFor, resolveQuality,
  effectiveDpr, describeQuality, probeGpuInfo,
} from './quality.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.028 },
    uAberration: { value: 0.55 },
    uRadial: { value: 0.0 },
    uUnderwater: { value: 0.0 },
    uSaturation: { value: 1.04 },
    uContrast: { value: 1.02 },
    uLift: { value: new THREE.Color(0.0, 0.012, 0.02) },
    uWarm: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uRadial, uUnderwater, uSaturation, uContrast, uWarm;
    uniform vec3 uLift;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // subtle radial acceleration blur for surface breaches / fast dives
      vec3 col = vec3(0.0);
      if (uRadial > 0.001) {
        float total = 0.0;
        for (int i = 0; i < 7; i++) {
          float k = float(i) / 6.0;
          float scale = 1.0 - k * uRadial * 0.085 * smoothstep(0.02, 0.3, r2);
          vec2 suv = 0.5 + c * scale;
          float w = 1.0 - k * 0.55;
          col += texture2D(tDiffuse, suv).rgb * w;
          total += w;
        }
        col /= total;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }

      // chromatic aberration grows to the edges
      float ab = uAberration * 0.0024 * smoothstep(0.04, 0.55, r2);
      vec3 shifted;
      shifted.r = texture2D(tDiffuse, uv + c * ab).r;
      shifted.g = col.g;
      shifted.b = texture2D(tDiffuse, uv - c * ab).b;
      col = mix(col, shifted, 0.72);

      // filmic grade: cool shadows, warm highlights
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(1.035, 1.0, 0.955), uWarm * smoothstep(0.25, 1.0, luma));
      col += uLift * (1.0 - smoothstep(0.0, 0.42, luma));
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;

      // underwater gentle teal bias in shadows
      col = mix(col, col * vec3(0.86, 1.0, 1.015), uUnderwater * (1.0 - smoothstep(0.1, 0.7, luma)) * 0.8);

      // vignette
      float vig = smoothstep(0.9, 0.18, length(c) * 1.18);
      col *= mix(1.0, vig, uVignette);

      // grain, animated and luminance-shaped
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 431.0) - 0.5;
      col += g * uGrain * (0.5 + 0.5 * (1.0 - abs(luma - 0.5)));

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

class Engine {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.composer = null;
    this.bloom = null;
    this.grade = null;
    this.sun = null;
    this.hemi = null;
    this.raycaster = new THREE.Raycaster();
    this.size = new THREE.Vector2(1, 1);
    this.dpr = 1;
    this.resizeQueued = false;
    this._fps = 60;
    this.quality = 'high';
    this.qualityPreset = presetFor('high');
    this.qualityInfo = null;
    this.qualityHistory = [];
    this._qualityHandlers = new Set();
    this._adaptiveTimer = 0;
    // Legacy adaptive path in main.js is disabled; engine owns adaptive changes
    // so step-up/down can share one hysteresis controller.
    this._adaptiveStep = 2;
    this._downTime = 0;
    this._upTime = 0;
    this._lastAdapt = 0;
    this._adaptReadyAt = 0;
    this.frames = 0;
  }

  get fps() { return this._fps; }
  set fps(v) {
    const n = Number(v) || 0;
    this._fps = n;
    this._adaptiveUpdate(n);
  }

  init() {
    // Decide the tier BEFORE creating the renderer so low-end can skip the
    // preserveDrawingBuffer copy and MSAA allocation from the first frame.
    let params = null;
    try { params = new URLSearchParams(location.search); } catch (err) { params = null; }
    const hasUrlTier = !!(params && params.get('quality'));
    const probedGpu = hasUrlTier ? '' : probeGpuInfo();
    this.qualityInfo = resolveQuality({ gpu: probedGpu });
    this.quality = this.qualityInfo.tier;
    this.qualityPreset = presetFor(this.quality);
    app.quality = this.quality;
    const preset = this.qualityPreset;
    this.qualityHistory.push({ tier: this.quality, source: this.qualityInfo.source, at: 0 });

    const canvas = document.getElementById('gl');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !!preset.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
      preserveDrawingBuffer: !!preset.preserveDrawingBuffer,
    });
    this.renderer = renderer;
    this.dpr = effectiveDpr(preset, window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(this.dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = !!preset.shadows && !isMobile();
    renderer.shadowMap.type = preset.tier === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.08, 14000);
    this.camera.position.set(0, 3.7, 12);
    this.camera.lookAt(0, 2.6, -60);

    this.hemi = new THREE.HemisphereLight(new THREE.Color(0.42, 0.68, 0.82), new THREE.Color(0.05, 0.1, 0.11), 1.15);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(new THREE.Color(...SUN_COLOR), SUN_INTENSITY);
    this.sun.position.copy(SUN_DIR).multiplyScalar(120);
    this.sun.target.position.set(0, 0, -4);
    this.sun.castShadow = !!preset.shadows && !isMobile();
    this.sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 22;
    this.sun.shadow.camera.bottom = -22;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(new THREE.AmbientLight(new THREE.Color(0.22, 0.32, 0.38), 0.35));

    this._buildComposer();
    this._applyGradePreset(preset);
    this._bindPointer();
    window.addEventListener('resize', () => this._queueResize());
    this.resize();
    try {
      document.body.dataset.quality = this.quality;
      document.documentElement.dataset.quality = this.quality;
    } catch (err) { /* noop */ }
    console.info('[quality]', this.quality.toUpperCase(), `source=${this.qualityInfo.source}`,
      this.qualityInfo.source === 'url' ? `(${this.qualityInfo.reason.join('; ')})` : `gpu="${this.qualityInfo.gpu}"`);
    return this;
  }

  _buildComposer() {
    const preset = this.qualityPreset;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: this.renderer.capabilities.isWebGL2 ? preset.msaa : 0,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: true,
    });
    const composer = new EffectComposer(this.renderer, rt);
    composer.setSize(window.innerWidth, window.innerHeight);

    this.renderPass = new RenderPass(this.scene, this.camera);
    // Bloom is kept available but not used: the HDR sun glints on the water
    // produce enormous halos through UnrealBloomPass at this exposure. All
    // tiers keep the same pass list (render + grade + output): low-end just
    // drops MSAA / DPR, it never loses the editorial grade.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.0, 0.2, 1000);
    this.bloom.enabled = false;
    this.grade = new ShaderPass(GradeShader);
    this.output = new OutputPass();

    composer.addPass(this.renderPass);
    // composer.addPass(this.bloom);
    composer.addPass(this.grade);
    composer.addPass(this.output);
    this.composer = composer;
  }

  _applyGradePreset(preset) {
    if (!this.grade) return;
    const g = preset.grade || {};
    this.grade.uniforms.uGrain.value = g.grain ?? 0.028;
    this.grade.uniforms.uAberration.value = g.aberration ?? 0.55;
    this.grade.uniforms.uVignette.value = g.vignette ?? 0.34;
  }

  /** Runtime tier switch (adaptive controller or QA). */
  applyQuality(tier, source = 'adaptive') {
    const next = QUALITY_PRESETS[tier] ? tier : 'high';
    if (next === this.quality && source === 'adaptive') return false;
    this.quality = next;
    this.qualityPreset = presetFor(next);
    app.quality = next;
    const preset = this.qualityPreset;
    this._lastAdapt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.qualityHistory.push({ tier: next, source, at: +this._lastAdapt.toFixed(0) });
    if (this.qualityHistory.length > 24) this.qualityHistory.shift();

    if (this.renderer) {
      this.dpr = effectiveDpr(preset, window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.shadowMap.enabled = !!preset.shadows && !isMobile();
      this.resize();
    }
    if (this.sun) {
      this.sun.castShadow = !!preset.shadows && !isMobile();
      if (preset.shadows) {
        this.sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
      } else if (this.sun.shadow.map) {
        try { this.sun.shadow.map.dispose(); } catch (err) { /* noop */ }
        this.sun.shadow.map = null;
      }
    }
    this._applyGradePreset(preset);
    try {
      document.body.dataset.quality = next;
      document.documentElement.dataset.quality = next;
    } catch (err) { /* noop */ }
    for (const fn of this._qualityHandlers) {
      try { fn(next, preset, this.qualityInfo); } catch (err) { console.warn('[quality] handler failed', err?.message || err); }
    }
    try {
      app.bus.emit('quality:changed', next, preset);
      if (next === 'low') app.bus.emit('quality:low', preset);
    } catch (err) { /* noop */ }
    return true;
  }

  onQuality(fn) {
    if (typeof fn !== 'function') return () => {};
    this._qualityHandlers.add(fn);
    return () => this._qualityHandlers.delete(fn);
  }

  qualityDebug() {
    return describeQuality(this);
  }

  /**
   * Hysteresis controller. main.js feeds the 0.5 s averaged FPS through the
   * `fps` setter; this never oscillates: downgrade after 3 s below the tier
   * floor, upgrade only after 12 s above 58 fps, and never above the tier the
   * machine was auto-detected (or overridden) at.
   */
  _adaptiveUpdate(fps) {
    if (!this.qualityInfo || this.qualityInfo.locked) return;
    if (!(fps > 0) || typeof performance === 'undefined') return;
    // Never adapt while the loader/prewarm is still running: those frames are
    // intentionally slow and would downgrade a fast machine before first paint.
    if (!app.loaded) { this._downTime = 0; this._upTime = 0; return; }
    const now = performance.now();
    if (!this._adaptReadyAt) this._adaptReadyAt = now + 6000;
    if (now < this._adaptReadyAt) return;
    if (now - this._lastAdapt < 3000) return;
    const tier = this.quality;
    const downBelow = tier === 'high' ? 48 : tier === 'medium' ? 45 : 40;
    const down = fps < downBelow;
    const up = fps > 58;
    this._downTime = down ? this._downTime + 0.5 : 0;
    this._upTime = up ? this._upTime + 0.5 : 0;
    const floorIdx = QUALITY_TIERS.indexOf(this.qualityInfo.autoTier ?? tier);
    if (down && this._downTime >= 3 && tier !== 'low') {
      const idx = QUALITY_TIERS.indexOf(tier);
      const next = QUALITY_TIERS[Math.max(0, idx - 1)];
      if (next !== tier) {
        this._downTime = 0;
        this._upTime = 0;
        this.applyQuality(next, `fps<${downBelow}`);
      }
    } else if (up && this._upTime >= 12 && tier !== 'high') {
      const idx = QUALITY_TIERS.indexOf(tier);
      const next = QUALITY_TIERS[Math.min(floorIdx, idx + 1)];
      if (next !== tier) {
        this._downTime = 0;
        this._upTime = 0;
        this.applyQuality(next, `fps>58`);
      }
    }
  }

  _queueResize() {
    if (this.resizeQueued) return;
    this.resizeQueued = true;
    requestAnimationFrame(() => { this.resizeQueued = false; this.resize(); });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const preset = this.qualityPreset;
    const dpr = effectiveDpr(preset, w, h);
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.renderer.setPixelRatio(dpr);
    }
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.size.set(w, h);
    if (this.onResize) this.onResize(w, h);
  }

  _bindPointer() {
    const onMove = (e) => {
      const p = app.pointer;
      p.x = e.clientX; p.y = e.clientY;
      p.u = e.clientX / window.innerWidth;
      p.v = e.clientY / window.innerHeight;
      p.ndc.set(p.u * 2 - 1, -(p.v * 2 - 1));
      p.inside = true;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', (e) => {
      onMove(e);
      const p = app.pointer;
      p.down = true; p.justDown = true;
      app.bus.emit('pointer:down', e);
    }, { passive: true });
    window.addEventListener('pointerup', (e) => {
      const p = app.pointer;
      p.down = false; p.justUp = true;
      app.bus.emit('pointer:up', e);
    }, { passive: true });
    window.addEventListener('pointerleave', () => { app.pointer.inside = false; });
    window.addEventListener('pointercancel', () => { app.pointer.down = false; });
  }

  /**
   * Kept for API compatibility. The real controller runs on the `fps` setter;
   * this legacy entry point just feeds it the current smoothed value.
   */
  startAdaptive() {
    this._adaptiveUpdate(this.fps);
  }

  render() {
    this.renderer.info.reset();
    this.composer.render();
  }

  setExposure(v) { this.renderer.toneMappingExposure = v; }

  screenFromWorld(v3, out = new THREE.Vector2()) {
    const p = v3.clone().project(this.camera);
    out.set((p.x * 0.5 + 0.5) * window.innerWidth, (-p.y * 0.5 + 0.5) * window.innerHeight);
    return out;
  }

  pickRay(ndc = app.pointer.ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }
}

export const engine = new Engine();
export { THREE };
