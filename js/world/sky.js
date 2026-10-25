import * as THREE from 'three';
import { SUN_DIR } from '../core/world.js';

// Shared GLSL noise, used by the sky dome and the cloud deck.
const NOISE_GLSL = /* glsl */`
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm4(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = m * p + vec2(7.3, 3.9);
      a *= 0.5;
    }
    return v;
  }
  float fbm6(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 6; i++) {
      v += a * vnoise(p);
      p = m * p + vec2(7.3, 3.9);
      a *= 0.5;
    }
    return v;
  }
`;

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform float uTime;
  varying vec3 vDir;

  ${NOISE_GLSL}

  void main() {
    vec3 d = normalize(vDir);
    vec3 sd = normalize(uSunDir);
    float up = clamp(d.y, 0.0, 1.0);

    vec3 col = mix(uHorizon, uZenith, pow(up, 0.58));
    col = mix(col, uHaze, pow(1.0 - up, 16.0) * 0.72);

    // warm haze toward the sun azimuth
    float az = max(dot(normalize(vec2(d.x, d.z)), normalize(vec2(sd.x, sd.z))), 0.0);
    col += uSunColor * pow(az, 3.2) * pow(1.0 - up, 4.0) * 0.20;

    float ca = max(dot(d, sd), 0.0);
    float disc = smoothstep(0.99972, 0.99994, ca);
    col += uSunColor * disc * 38.0;
    col += uSunColor * pow(ca, 900.0) * 2.4;
    col += uSunColor * pow(ca, 26.0) * 0.4;
    col += uSunColor * pow(ca, 6.0) * 0.035 * (1.0 - up * 0.5);

    // ---- cloud deck (ray / plane at altitude) ----
    if (d.y > 0.008) {
      float t = 1500.0 / max(d.y, 0.008);
      vec2 cp = d.xz * t * 0.000235;
      cp += vec2(uTime * 0.0045, uTime * 0.0016);
      vec2 warp = vec2(fbm4(cp * 0.55 + 3.1), fbm4(cp * 0.55 - 8.3));
      float n = fbm6(cp * 1.15 + warp * 0.22);
      float detail = fbm4(cp * 4.6 + warp * 0.4);
      float cover = smoothstep(0.50, 0.74, n * 0.82 + detail * 0.26);

      // fake volumetric shading: sample toward the sun
      vec2 sun2 = normalize(sd.xz + vec2(1e-4));
      float ns = fbm4((cp + sun2 * 0.055) * 1.15 + warp * 0.22);
      float lit = clamp(0.55 + (n - ns) * 5.0, 0.0, 1.0);
      float sunAmt = pow(max(dot(d, sd), 0.0), 5.0);

      vec3 cloudShadow = vec3(0.07, 0.09, 0.12);
      vec3 cloudLit = mix(vec3(0.44, 0.43, 0.44), uSunColor * 1.0, sunAmt * 0.85);
      vec3 cloud = mix(cloudShadow, cloudLit, lit * (0.35 + 0.65 * sunAmt) + 0.18);
      cloud *= 0.7 + detail * 0.5;
      cloud += uSunColor * pow(ca, 24.0) * (1.0 - cover) * 0.35;

      float horizonFade = smoothstep(0.01, 0.12, d.y);
      col = mix(col, cloud, cover * 0.92 * horizonFade);

      // high cirrus
      vec2 hp = d.xz * (1500.0 / max(d.y, 0.05)) * 0.00009;
      float cir = fbm4(hp * vec2(2.8, 0.55) + vec2(uTime * 0.002, 0.0));
      cir = smoothstep(0.52, 0.78, cir) * (1.0 - cover * 0.75);
      col = mix(col, uSunColor * 0.9 + vec3(0.35, 0.4, 0.5), cir * 0.12 * horizonFade);
    }

    // below horizon: dark sea haze (only visible in reflection cube)
    if (d.y < 0.0) {
      float k = smoothstep(0.0, -0.25, d.y);
      col = mix(uHaze, vec3(0.008, 0.025, 0.032), k);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSky(engine) {
  const uniforms = {
    uSunDir: { value: SUN_DIR.clone() },
    uSunColor: { value: new THREE.Color(1.0, 0.58, 0.3) },
    uZenith: { value: new THREE.Color(0.010, 0.038, 0.09) },
    uHorizon: { value: new THREE.Color(0.21, 0.20, 0.21) },
    uHaze: { value: new THREE.Color(0.46, 0.245, 0.135) },
    uTime: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });

  const geometry = new THREE.SphereGeometry(9000, 64, 40);
  const dome = new THREE.Mesh(geometry, material);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.name = 'skyDome';
  engine.scene.add(dome);

  // Capture the sky once into a cube map. The ocean samples it for reflections
  // and PBR materials use the PMREM as their environment.
  const cubeRT = new THREE.WebGLCubeRenderTarget(512, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const cubeScene = new THREE.Scene();
  const cubeDome = new THREE.Mesh(geometry, material);
  cubeDome.frustumCulled = false;
  cubeScene.add(cubeDome);
  const cubeCam = new THREE.CubeCamera(1, 20000, cubeRT);
  cubeCam.position.set(0, 0, 0);

  const pmrem = new THREE.PMREMGenerator(engine.renderer);
  pmrem.compileCubemapShader();
  engine.renderer.setRenderTarget(null);
  cubeCam.update(engine.renderer, cubeScene);
  const envRT = pmrem.fromCubemap(cubeRT.texture);
  engine.scene.environment = envRT.texture;
  pmrem.dispose();

  const state = {
    dome,
    material,
    uniforms,
    cube: cubeRT.texture,
    cubeRT,
    env: envRT.texture,
    visibleAbove: true,
    update(dt, cameraPos, underwater) {
      uniforms.uTime.value += dt;
      dome.position.copy(cameraPos);
      const visible = !underwater;
      dome.visible = visible;
      // Keep the reflection cube static (sun is fixed); good enough for the sea.
    },
    setUnderwater(v) {
      dome.visible = !v;
      this.visibleAbove = !v;
    },
    setQuality(q) {
      // point-filtered cube is cheaper; not switching now
    },
  };

  return state;
}
