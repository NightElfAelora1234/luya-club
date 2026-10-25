import * as THREE from 'three';
import { SUN_DIR } from '../core/world.js';
import { mulberry32 } from '../core/util.js';

// A tileable water normal map beats a handful of sine waves for close-range
// ripples: it gives irregular, non-repeating capillary detail under the sun.
function makeWaterNormalTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rand = mulberry32(4177);
  const hashTable = new Float32Array(4096);
  for (let i = 0; i < hashTable.length; i++) hashTable[i] = rand();

  const hash = (ix, iy, period) => {
    const x = ((ix % period) + period) % period;
    const y = ((iy % period) + period) % period;
    return hashTable[(x * 97 + y * 193 + period * 31) & 4095];
  };
  const pnoise = (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, period), b = hash(xi + 1, yi, period);
    const cc = hash(xi, yi + 1, period), d = hash(xi + 1, yi + 1, period);
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  };

  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let height = 0, amp = 0.55, period = 4;
      for (let o = 0; o < 4; o++) {
        height += amp * pnoise(u * period, v * period, period);
        period *= 2; amp *= 0.5;
      }
      // two cross ripples keep the noise from reading like cotton
      height += 0.14 * Math.sin(Math.PI * 2 * (u * 7 + Math.sin(v * Math.PI * 4) * 0.28));
      height += 0.09 * Math.sin(Math.PI * 2 * (v * 12 + Math.sin(u * Math.PI * 6) * 0.18));
      h[y * size + x] = height;
    }
  }
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3.4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 3.4;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const OCEAN_VERT = /* glsl */`
  uniform float uTime;
  uniform float uSteepness;
  uniform float uCalm;
  uniform vec2 uCalmCenter;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vHeight;
  varying float vCrest;
  varying float vDist;
  varying vec2 vXZ;

  void gerstner(vec2 p, float dist, vec2 dir, float wl, float amp,
                inout vec3 disp, inout vec3 tang, inout vec3 bino) {
    float k = 6.2831853 / wl;
    float c = sqrt(9.81 / k);
    float fade = 1.0 - smoothstep(wl * 9.0, wl * 34.0, dist);
    float gust = 0.72 + 0.28 * sin(dot(p, vec2(0.013, 0.021)) + 1.7) * sin(dot(p, vec2(-0.017, 0.009)) + 3.1);
    float calm = 1.0 - smoothstep(4.0, 20.0, distance(p, uCalmCenter));
    float a = max(amp * fade * gust * (1.0 - 0.88 * calm * uCalm), 1e-5);
    float f = k * dot(dir, p) - c * k * uTime + wl * 0.37;
    // bend the crests so the swell never reads as parallel corduroy
    f += sin(dot(p, vec2(0.011, 0.017)) + wl * 0.21) * 0.9;
    float sf = sin(f);
    float cf = cos(f);
    float q = uSteepness / (13.0 * k * a);
    disp.x += q * a * dir.x * cf;
    disp.z += q * a * dir.y * cf;
    disp.y += a * sf;
    float qk = q * k * a;
    tang += vec3(-qk * dir.x * dir.x * sf, dir.x * k * a * cf, -qk * dir.x * dir.y * sf);
    bino += vec3(-qk * dir.x * dir.y * sf, dir.y * k * a * cf, -qk * dir.y * dir.y * sf);
  }

  void main() {
    vec2 p = position.xz;
    float dist = length(p);
    vec3 disp = vec3(0.0);
    vec3 tang = vec3(1.0, 0.0, 0.0);
    vec3 bino = vec3(0.0, 0.0, 1.0);

    gerstner(p, dist, normalize(vec2(0.86, 0.51)), 137.0, 0.98, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(0.18, 0.98)), 210.0, 0.45, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(-0.55, 0.83)), 71.0, 0.50, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(0.97, -0.24)), 36.0, 0.34, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(-0.28, -0.96)), 18.0, 0.17, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(0.62, 0.78)), 9.2, 0.08, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(-0.92, 0.39)), 4.6, 0.03, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(0.15, -0.99)), 2.4, 0.015, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(-0.77, -0.64)), 96.0, 0.30, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(0.45, 0.89)), 55.0, 0.24, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(-0.97, -0.15)), 29.0, 0.14, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(0.28, 0.96)), 15.0, 0.07, disp, tang, bino);
    gerstner(p, dist, normalize(vec2(0.88, -0.47)), 7.5, 0.035, disp, tang, bino);

    vec3 world = vec3(p.x + disp.x, disp.y, p.y + disp.z);
    vWorld = world;
    vNormalW = normalize(cross(bino, tang));
    vHeight = disp.y;
    vCrest = disp.y / 3.2;
    vDist = dist;
    vXZ = p;

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const OCEAN_FRAG = /* glsl */`
  precision highp float;
  uniform samplerCube uSkyCube;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uTime;
  uniform float uCameraDepth;
  uniform float uUnderwater;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyHaze;
  uniform vec3 uSkySunColor;
  uniform sampler2D uNormalMap;
  uniform vec2 uPointerPos;
  uniform float uPointerStrength;
  uniform float uDetail;
  uniform vec4 uRipples[6];
  uniform float uRippleCount;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vHeight;
  varying float vCrest;
  varying float vDist;
  varying vec2 vXZ;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm3(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(11.7, 5.3); a *= 0.5; }
    return v;
  }

  // Analytic sky, matched to the dome shader. Sampling it directly (instead of
  // a cube map) keeps the reflected sun in the correct azimuth and avoids
  // mirrored highlights across the horizon.
  vec3 skyColor(vec3 d) {
    vec3 sd = normalize(uSunDir);
    float up = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uSkyHorizon, uSkyZenith, pow(up, 0.58));
    col = mix(col, uSkyHaze, pow(1.0 - up, 16.0) * 0.72);
    float az = max(dot(normalize(d.xz + 1e-5), normalize(sd.xz + 1e-5)), 0.0);
    col += uSkySunColor * pow(az, 3.2) * pow(1.0 - up, 4.0) * 0.20;
    float ca = max(dot(d, sd), 0.0);
    col += uSkySunColor * smoothstep(0.99972, 0.99994, ca) * 0.05;
    col += uSkySunColor * pow(ca, 900.0) * 0.04;
    col += uSkySunColor * pow(ca, 26.0) * 0.02;
#ifndef OCEAN_LOW
    if (d.y > 0.015) {
      float t = 1500.0 / max(d.y, 0.012);
      vec2 cp = d.xz * t * 0.000235 + vec2(uTime * 0.0045, uTime * 0.0016);
      float n = fbm3(cp * 1.2);
      float cov = smoothstep(0.52, 0.78, n);
      float sunAmt = pow(max(dot(d, sd), 0.0), 5.0);
      vec3 cloud = mix(vec3(0.06, 0.075, 0.10), uSkySunColor * 0.9 + vec3(0.16, 0.16, 0.17), 0.22 + 0.78 * sunAmt);
      col = mix(col, cloud, cov * 0.55 * smoothstep(0.01, 0.1, d.y));
    }
#endif
    return min(col, vec3(7.0));
  }

  vec3 detailNormal(vec2 p, float dist) {
    float far = 1.0 - smoothstep(30.0, 260.0, dist);
    float near = 1.0 - smoothstep(8.0, 55.0, dist);
    vec3 n1 = texture2D(uNormalMap, p * 0.028 + vec2(uTime * 0.0045, -uTime * 0.0032)).xyz * 2.0 - 1.0;
#ifndef OCEAN_LOW
    vec3 n2 = texture2D(uNormalMap, p * 0.085 + vec2(-uTime * 0.009, uTime * 0.006)).xyz * 2.0 - 1.0;
    vec3 n3 = texture2D(uNormalMap, p * 0.27 + vec2(uTime * 0.016, -uTime * 0.011)).xyz * 2.0 - 1.0;
    vec2 g = n1.xy * 1.55 + n2.xy * 1.0 * far + n3.xy * 0.6 * near;
#else
    vec2 g = n1.xy * 1.55;
#endif
    g *= uDetail;
    return normalize(vec3(g.x, 1.0, g.y));
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 baseN = normalize(vNormalW);
    vec3 N = detailNormal(vXZ, vDist);
    // blend the low-frequency surface normal with the detail normal
    N = normalize(vec3(baseN.x + N.x * 0.7, baseN.y, baseN.z + N.z * 0.7));

    // ripple rings (logo splash, fish, gear)
    float rippleFoam = 0.0;
    vec3 rippleN = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      if (float(i) >= uRippleCount) break;
      vec4 rp = uRipples[i];
      float age = uTime - rp.z;
      if (age < 0.0 || age > 7.0) continue;
      vec2 delta = vXZ - rp.xy;
      float d = length(delta);
      float radius = age * 2.6 + 0.2;
      float width = 0.35 + age * 0.22;
      float ring = exp(-pow((d - radius) / width, 2.0));
      float decay = exp(-age * 0.8) * smoothstep(0.0, 0.12, age);
      float amp = rp.w * ring * decay;
      rippleN.xz += normalize(delta + 1e-5) * amp * 0.10;
      rippleFoam += amp * 0.14;
    }
    N = normalize(N + rippleN);

    float NdV = max(dot(N, V), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
    vec3 L = normalize(uSunDir);
    vec3 H = normalize(L + V);

    // ---------- under-side of the surface: Snell's window / TIR ----------
    if (uUnderwater > 0.5) {
      vec3 I = normalize(vWorld - cameraPosition);       // up toward surface
      vec3 Ndown = normalize(-baseN);                    // toward water
      float cosI = clamp(dot(I, -Ndown), 0.0, 1.0);
      float sin2 = 1.0 - cosI * cosI;
      sin2 += (N.x + N.z) * 0.018;
      float window = 1.0 - smoothstep(0.535, 0.567, sin2);

      vec3 refr = refract(I, Ndown, 1.333);
      if (length(refr) < 0.001) refr = reflect(I, Ndown);
      vec3 sky = skyColor(normalize(refr));

      float depthK = smoothstep(0.0, 55.0, uCameraDepth);
      vec3 tirCol = mix(uDeep * 1.2, uShallow * 0.24, 0.18);
      tirCol += vec3(0.01, 0.05, 0.06) * pow(1.0 - cosI, 3.0);
      float shimmer = fbm3(vXZ * 0.9 + uTime * 0.25);
      vec3 windowCol = sky * vec3(0.42, 0.6, 0.66) * (0.6 + 0.18 * shimmer);
      windowCol += uSunColor * pow(max(dot(normalize(refr), L), 0.0), 240.0) * 0.25;
      vec3 col = mix(tirCol, windowCol, window);

      // faint caustic-like streaks near the window edge
      float edge = window * (1.0 - window);
      col += vec3(0.14, 0.34, 0.36) * edge * 0.22 * (0.4 + 0.6 * shimmer);

      // dim with depth and apply the water fog
      col *= mix(1.0, 0.34, depthK);
      float fog = 1.0 - exp(-vDist * uFogDensity);
      col = mix(col, uFogColor, fog * 0.92);
      gl_FragColor = vec4(col, 1.0);
      return;
    }

    // ---------- seen from above ----------
    vec3 refl = reflect(-V, N);
    refl.y = max(refl.y, 0.012);
    vec3 sky = skyColor(refl) * vec3(0.82, 0.92, 0.97);
    sky = mix(sky, uShallow * 0.6, 0.09);

    float crest = smoothstep(-0.15, 0.95, vHeight);
    vec3 body = mix(uDeep, uShallow, 0.3 + crest * 0.34 + fres * 0.2);
    // back-lit crest translucency, the thing that sells a real sea
    float sss = pow(max(dot(V, -L), 0.0), 3.0) * smoothstep(0.05, 0.95, vHeight);
    body += vec3(0.04, 0.28, 0.24) * sss * 0.7;
    // upwelling from below
    body += uShallow * 0.14 * smoothstep(0.3, 1.0, crest);

    vec3 col = mix(body, sky, fres * 0.9);
    col = mix(col, uShallow * 0.35, 0.05);

    // sun specular + broken glitter
    float spec = pow(max(dot(N, H), 0.0), 760.0);
    float glintMask = smoothstep(0.7, 0.95, fbm3(vXZ * 2.8 + vec2(uTime * 0.6, -uTime * 0.4)));
    float glint = spec * (1.0 + glintMask * 4.0);
    col += uSunColor * glint * 0.05;
    col += uSunColor * pow(max(dot(N, H), 0.0), 220.0) * 0.09;
    col += uSunColor * pow(max(dot(N, H), 0.0), 42.0) * 0.02 * glintMask;
    col += uSunColor * pow(max(dot(N, H), 0.0), 70.0) * 0.012;

    // whitecaps: only the steepest crests, broken by noise
    float n1 = fbm3(vXZ * 0.16 + vec2(uTime * 0.02, 0.0));
#ifndef OCEAN_LOW
    float n2 = fbm3(vXZ * 0.47 - vec2(0.0, uTime * 0.035));
    float foamNoise = n1 * 0.62 + n2 * 0.48;
#else
    float foamNoise = n1 * 0.62 + 0.24;
#endif
    float crestMask = smoothstep(0.56, 1.0, vCrest);
    float foam = smoothstep(0.61, 0.84, foamNoise + crestMask * 0.45) * crestMask;
    foam *= 0.65;
    vec3 foamCol = uFoam * (0.6 + 0.5 * max(dot(N, L), 0.0));
    col = mix(col, foamCol, foam);
    // expanding splash foam ring
    col = mix(col, uFoam, clamp(rippleFoam, 0.0, 0.5) * 0.5);

    // "the sea opens under the cursor": a soft window of clear water so the
    // surface fish (which live just below y=0) can be seen from above.
    float pwin = 0.0;
    if (uPointerStrength > 0.001) {
      float pd = distance(vXZ, uPointerPos);
      pwin = smoothstep(5.4, 1.1, pd) * uPointerStrength;
      float edge = exp(-pow((pd - 4.7) / 0.5, 2.0)) * uPointerStrength;
      col = mix(col, body * 1.35 + uShallow * 0.22, pwin * 0.32);
      col = mix(col, uFoam, edge * 0.1);
    }

    // atmospheric / water fog toward the horizon
    float fog = 1.0 - exp(-vDist * uFogDensity);
    col = mix(col, uFogColor, fog);

    gl_FragColor = vec4(col, mix(1.0, 0.28, pwin));
  }
`;

function buildPolarGrid(radius = 6200, rings = 252, segments = 288) {
  const positions = [];
  const indices = [];
  positions.push(0, 0, 0);
  const expK = Math.exp(7.2);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    const r = radius * (Math.exp(7.2 * t) - 1) / (expK - 1);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const ringStart = (i) => 1 + (i - 1) * segments;
  // first ring fan
  for (let j = 0; j < segments; j++) {
    const a = 0;
    const b = 1 + j;
    const c = 1 + ((j + 1) % segments);
    indices.push(a, c, b);
  }
  for (let i = 1; i < rings; i++) {
    const r0 = ringStart(i);
    const r1 = ringStart(i + 1);
    for (let j = 0; j < segments; j++) {
      const j2 = (j + 1) % segments;
      const a = r0 + j, b = r0 + j2, c = r1 + j, d = r1 + j2;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export function createOcean(engine, sky) {
  const preset = engine.qualityPreset || { ocean: { rings: 252, segments: 288, normalSize: 512, shaderDetail: 1, textureAniso: 8, ripples: 6 } };
  const oceanQ = preset.ocean || {};
  const lowDetail = (oceanQ.shaderDetail ?? 1) < 1;
  let rippleLimit = Math.max(1, Math.min(6, oceanQ.ripples ?? 6));
  const uniforms = {
    uSkyCube: { value: sky.cube },
    uSunDir: { value: SUN_DIR.clone() },
    uSunColor: { value: new THREE.Color(1.0, 0.55, 0.3).multiplyScalar(2.3) },
    uSkyZenith: { value: new THREE.Color(0.010, 0.038, 0.09) },
    uSkyHorizon: { value: new THREE.Color(0.21, 0.20, 0.21) },
    uSkyHaze: { value: new THREE.Color(0.46, 0.245, 0.135) },
    uSkySunColor: { value: new THREE.Color(1.0, 0.58, 0.3) },
    uNormalMap: { value: makeWaterNormalTexture(oceanQ.normalSize || 512) },
    uPointerPos: { value: new THREE.Vector2(0, 0) },
    uPointerStrength: { value: 0 },
    uDetail: { value: lowDetail ? 0.72 : 1.0 },
    uDeep: { value: new THREE.Color(0x06222c) },
    uShallow: { value: new THREE.Color(0x0c4d55) },
    uFoam: { value: new THREE.Color(0xc4d6d3) },
    uFogColor: { value: new THREE.Color(0x8b8f8c) },
    uFogDensity: { value: 0.00034 },
    uTime: { value: 0 },
    uSteepness: { value: 0.82 },
    uCalm: { value: 0 },
    uCalmCenter: { value: new THREE.Vector2(0, -2.5) },
    uCameraDepth: { value: 0 },
    uUnderwater: { value: 0 },
    uRipples: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0)) },
    uRippleCount: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: OCEAN_VERT,
    fragmentShader: OCEAN_FRAG,
    defines: lowDetail ? { OCEAN_LOW: '' } : {},
    side: THREE.DoubleSide,
    fog: false,
    transparent: true,
    depthWrite: true,
    toneMapped: false,
  });
  if (uniforms.uNormalMap.value && 'anisotropy' in uniforms.uNormalMap.value) {
    uniforms.uNormalMap.value.anisotropy = oceanQ.textureAniso || 8;
  }

  const mesh = new THREE.Mesh(buildPolarGrid(6200, oceanQ.rings || 252, oceanQ.segments || 288), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'ocean';
  engine.scene.add(mesh);

  const ripples = [];
  let time = 0;
  let pointerTarget = 0;
  let pointerX = 0, pointerZ = 0;
  let pointerStrength = 0;

  return {
    mesh,
    material,
    uniforms,
    setPointer(x, z, active) {
      if (active) { pointerX = x; pointerZ = z; pointerTarget = 1; }
      else pointerTarget = 0;
    },
    setCalm(amount, cx = 0, cz = -2.5) {
      uniforms.uCalm.value = amount;
      uniforms.uCalmCenter.value.set(cx, cz);
    },
    addRipple(x, z, strength = 1) {
      ripples.push({ x, z, born: time, strength });
      while (ripples.length > rippleLimit) ripples.shift();
      const arr = uniforms.uRipples.value;
      uniforms.uRippleCount.value = Math.min(ripples.length, 6);
      for (let i = 0; i < 6; i++) {
        const r = ripples[i];
        if (r) arr[i].set(r.x, r.z, r.born, r.strength);
        else arr[i].set(0, 0, -99, 0);
      }
    },
    /** Adaptive hook: geometry stays as built, shader/ripple cost can drop. */
    setQuality(nextPreset) {
      const q = nextPreset?.ocean || nextPreset || {};
      if (typeof q === 'object') {
        rippleLimit = Math.max(1, Math.min(6, q.ripples ?? rippleLimit));
        uniforms.uDetail.value = (q.shaderDetail ?? 1) < 1 ? 0.72 : 1.0;
      }
      while (ripples.length > rippleLimit) ripples.shift();
      return { rippleLimit, detail: uniforms.uDetail.value };
    },
    setFog(color, density) {
      uniforms.uFogColor.value.copy(color);
      uniforms.uFogDensity.value = density;
    },
    update(dt, cameraDepth = 0) {
      time += dt;
      pointerStrength += (pointerTarget - pointerStrength) * Math.min(1, dt * 5.5);
      uniforms.uTime.value = time;
      uniforms.uCameraDepth.value = cameraDepth;
      uniforms.uUnderwater.value = cameraDepth > 0.02 ? 1 : 0;
      uniforms.uPointerPos.value.set(pointerX, pointerZ);
      uniforms.uPointerStrength.value = cameraDepth > 0.3 ? 0 : pointerStrength;
      uniforms.uRippleCount.value = Math.min(ripples.length, 6);
      // prune dead ripples
      while (ripples.length && time - ripples[0].born > 7) ripples.shift();
      while (ripples.length > rippleLimit) ripples.shift();
    },
    get time() { return time; },
  };
}
