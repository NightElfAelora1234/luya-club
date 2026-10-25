// Quality tiers / presets for 路亚俱乐部.
//
// One place owns the performance policy so every subsystem (engine, ocean, fish,
// ambience, traffic, fish-cam, bag) reads the same numbers. The tier is resolved
// once, before the first frame:
//   ?quality=low|medium|high   explicit override (locks auto adaptation)
//   auto detection             weak GPU / low memory / few cores -> low
//
// The adaptive controller in engine.js uses hysteresis and never exceeds the
// detected/overridden tier ceiling, so a fast machine cannot be pushed above
// `high` and a 1050 cannot bounce between presets every half-second.

export const QUALITY_TIERS = ['low', 'medium', 'high'];

const COMMON = {
  tier: 'high',
  label: 'HIGH',
};

export const QUALITY_PRESETS = {
  high: {
    ...COMMON,
    tier: 'high',
    label: 'HIGH',
    dprCap: 1.5,
    maxPixels: 5_000_000,          // ~4.66M at 1080p × 1.5²
    antialias: false,
    msaa: 4,
    preserveDrawingBuffer: true,
    shadows: true,
    shadowSize: 2048,
    grade: { grain: 0.028, aberration: 0.55, vignette: 0.34 },
    ocean: { rings: 252, segments: 288, normalSize: 512, shaderDetail: 1, textureAniso: 8, ripples: 6 },
    fish: { schoolScale: 1, ambientScale: 1, previewDetail: 3, schoolDetail: 1 },
    particles: 1,
    traffic: 1,
    fishCam: { width: 256, height: 170, dpr: 1.25, antialias: true, maxFps: 0, prewarmMeshes: 99, prewarm: true },
    bag: { size: 480, dpr: 1.5, antialias: true, prewarm: true },
    prewarm: { shopSteps: 45, trafficCompile: true, diveZones: [0.2, 0.62, 1] },
  },
  medium: {
    ...COMMON,
    tier: 'medium',
    label: 'MEDIUM',
    dprCap: 1.25,
    maxPixels: 3_400_000,
    antialias: false,
    msaa: 2,
    preserveDrawingBuffer: true,
    shadows: true,
    shadowSize: 1024,
    grade: { grain: 0.024, aberration: 0.35, vignette: 0.32 },
    ocean: { rings: 168, segments: 192, normalSize: 384, shaderDetail: 1, textureAniso: 4, ripples: 5 },
    fish: { schoolScale: 0.8, ambientScale: 0.8, previewDetail: 3, schoolDetail: 1 },
    particles: 0.7,
    traffic: 0.75,
    fishCam: { width: 208, height: 140, dpr: 1.0, antialias: true, maxFps: 24, prewarmMeshes: 4, prewarm: true },
    bag: { size: 384, dpr: 1.25, antialias: true, prewarm: true },
    prewarm: { shopSteps: 24, trafficCompile: false, diveZones: [0.2, 0.62, 1] },
  },
  low: {
    ...COMMON,
    tier: 'low',
    label: 'LOW',
    dprCap: 1.0,
    maxPixels: 2_200_000,          // 1080p at dpr 1.0 = 2.07M
    antialias: false,
    msaa: 0,
    preserveDrawingBuffer: false,
    shadows: false,
    shadowSize: 512,
    grade: { grain: 0.016, aberration: 0.18, vignette: 0.30 },
    ocean: { rings: 96, segments: 128, normalSize: 256, shaderDetail: 0, textureAniso: 2, ripples: 3 },
    fish: { schoolScale: 0.55, ambientScale: 0.6, previewDetail: 2, schoolDetail: 1 },
    particles: 0.45,
    traffic: 0.35,
    fishCam: { width: 160, height: 106, dpr: 1.0, antialias: false, maxFps: 20, prewarmMeshes: 2, prewarm: true, sharedContext: true },
    bag: { size: 320, dpr: 1.0, antialias: false, prewarm: false },
    prewarm: { shopSteps: 12, trafficCompile: false, diveZones: [0.2, 0.62, 1] },
  },
};

export function presetFor(tier) {
  return QUALITY_PRESETS[tier] || QUALITY_PRESETS.high;
}

const LOW_GPU = /(swiftshader|llvmpipe|software|basic render|microsoft basic|gtx\s*1050|gtx\s*1030|gt\s*1030|gt\s*730|gt\s*720|920m|940m|mx150|mx250|mx350|mx450|intel.*(hd|uhd|iris|graphics)|uhd graphics|hd graphics|radeon.*(vega\s*(3|8|11)|r7|r5)|mali|adreno|powervr|apple a\d)/i;
const MID_GPU = /(gtx\s*1050\s*ti|gtx\s*1060|gtx\s*1650|gtx\s*1660\s*max|gtx\s*970|gtx\s*980|mx550|rtx\s*2050|rx\s*5[5-7]0|rx\s*6400|radeon.*vega\s*56|apple m1|arc\s*a3)/i;

function readGpu(renderer) {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : '';
    return { gpu: String(gpu || ''), vendor: String(vendor || '') };
  } catch (err) {
    return { gpu: '', vendor: '' };
  }
}

/**
 * Probe the GPU string with a throwaway WebGL2 context *before* the real
 * renderer is created, so the boot tier can decide renderer options like
 * preserveDrawingBuffer. The context is released immediately.
 */
export function probeGpuInfo() {
  if (typeof document === 'undefined') return '';
  let canvas = null;
  let gl = null;
  try {
    canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' })
      || canvas.getContext('webgl', { antialias: false });
    if (!gl) return '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
  } catch (err) {
    return '';
  } finally {
    try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (err) { /* noop */ }
  }
}

/**
 * Resolve the boot tier. `?quality=` wins; otherwise inspect the GPU string,
 * then memory/cores as a secondary signal. Returns
 * { tier, source:'url'|'auto', locked, autoTier, reason, gpu, deviceMemory, cores }.
 */
export function resolveQuality({ renderer = null, gpu: gpuIn = null, search = (typeof location !== 'undefined' ? location.search : '') } = {}) {
  const probed = gpuIn != null ? { gpu: String(gpuIn || ''), vendor: '' } : readGpu(renderer);
  const { gpu, vendor } = probed;
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const deviceMemory = Number(nav.deviceMemory) || 0;
  const cores = Number(nav.hardwareConcurrency) || 0;
  const info = { gpu, vendor, deviceMemory, cores, reason: [], autoTier: 'high', source: 'auto', locked: false };

  let params = null;
  try { params = new URLSearchParams(search); } catch (err) { params = null; }
  const raw = params ? String(params.get('quality') || '').toLowerCase() : '';
  const alias = { 0: 'low', 1: 'medium', 2: 'high', low: 'low', medium: 'medium', med: 'medium', high: 'high', ultra: 'high', auto: '' };
  const override = alias[raw] ?? '';
  if (raw && !(raw in alias)) info.reason.push(`unknown ?quality=${raw} ignored`);
  if (override) {
    return {
      ...info, tier: override, autoTier: override, source: 'url', locked: true,
      reason: [`URL override ?quality=${override}`, ...info.reason],
    };
  }

  let tier = 'high';
  if (LOW_GPU.test(gpu)) {
    tier = 'low';
    info.reason.push(`GPU "${gpu}" matched low-end list`);
  } else if (MID_GPU.test(gpu)) {
    tier = 'medium';
    info.reason.push(`GPU "${gpu}" matched mid list`);
  } else if (deviceMemory && deviceMemory <= 4) {
    tier = 'low';
    info.reason.push(`navigator.deviceMemory=${deviceMemory} <= 4`);
  } else if (cores && cores <= 4) {
    tier = 'medium';
    info.reason.push(`hardwareConcurrency=${cores} <= 4`);
  } else {
    info.reason.push(`GPU "${gpu || 'unknown'}" not on weak list`);
  }
  info.tier = tier;
  info.autoTier = tier;
  info.locked = false;
  return info;
}

/** Effective cap for the pixel-count budget at a given viewport. */
export function effectiveDpr(preset, width, height) {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const device = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const budget = Math.sqrt((preset?.maxPixels || 5e6) / (w * h));
  return Math.max(0.5, Math.min(device, preset?.dprCap || 1, budget));
}

export function describeQuality(engine) {
  const p = engine?.qualityPreset || presetFor(engine?.quality);
  const geo = engine?.renderer?.info?.render;
  return {
    tier: engine?.quality || p.tier,
    source: engine?.qualityInfo?.source || 'unknown',
    locked: !!engine?.qualityInfo?.locked,
    autoTier: engine?.qualityInfo?.autoTier || p.tier,
    reason: engine?.qualityInfo?.reason || [],
    gpu: engine?.qualityInfo?.gpu || '',
    dpr: engine?.dpr ?? null,
    pixelRatio: engine?.renderer?.getPixelRatio?.() ?? null,
    drawingBuffer: engine?.renderer ? [engine.renderer.domElement.width, engine.renderer.domElement.height] : null,
    viewport: typeof window !== 'undefined' ? [window.innerWidth, window.innerHeight] : null,
    shadows: engine?.renderer?.shadowMap?.enabled ?? null,
    shadowSize: p.shadows ? p.shadowSize : 0,
    msaa: p.msaa,
    premultipliedAlpha: engine?.renderer?.getContextAttributes?.()?.preserveDrawingBuffer ?? null,
    calls: geo?.calls ?? null,
    triangles: geo?.triangles ?? null,
    preset: {
      dprCap: p.dprCap, maxPixels: p.maxPixels,
      ocean: p.ocean, fish: p.fish, particles: p.particles, traffic: p.traffic,
      fishCam: p.fishCam, prewarm: p.prewarm,
    },
  };
}
