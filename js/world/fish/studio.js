// Studio turntable for the fish art pass. Boots only the fish builder (no ocean,
// no sky, no main scene) so modelling and the preview API can be iterated and
// photographed independently. Owner: fish-v2.
//   studio.html          -> three-species hero line-up
//   studio.html?one=giant-grouper&yaw=0.5
import * as THREE from 'three';
import { createFishPreview } from './previewFish.js';
import { getSpecies } from '../../data/species.js';

const params = new URLSearchParams(location.search);
const ONE = params.get('one');
const BG = params.get('bg') || 'studio';

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.02, 60);
camera.position.set(0.02, 0.16, 3.35);
camera.lookAt(0.16, 0, -0.05);

// ── studio backdrop: a huge gradient dome (dark teal floor → warm dusk top) ──
{
  const domeGeo = new THREE.SphereGeometry(26, 40, 24);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(BG === 'black' ? 0x05080a : 0x2a2620) },
      uBottom: { value: new THREE.Color(BG === 'black' ? 0x010304 : 0x05161a) },
      uWarm: { value: new THREE.Color(0x4a3524) },
    },
    vertexShader: /* glsl */`
      varying vec3 vP;
      void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uWarm;
      varying vec3 vP;
      void main() {
        float h = clamp(vP.y / 18.0 * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uBottom, uTop, pow(h, 1.25));
        // warm glow behind the fish, slightly camera-left-up
        float glow = exp(-length((vP.xy - vec2(-3.5, 2.4)) / 9.0));
        col += uWarm * glow * 0.55;
        col *= 0.92 + 0.08 * smoothstep(0.0, 1.0, h);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(domeGeo, domeMat));
}

// dark plinth: a soft turntable disc with a radial falloff
{
  const discGeo = new THREE.CircleGeometry(1.55, 96);
  const discMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uIn: { value: 0.16 }, uOut: { value: 0.02 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform float uIn; uniform float uOut; varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float a = smoothstep(1.0, 0.04, r);
        vec3 col = mix(vec3(0.015, 0.045, 0.055), vec3(0.05, 0.09, 0.09), smoothstep(0.9, 0.0, r));
        gl_FragColor = vec4(col, a * 0.9);
      }
    `,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -0.36;
  scene.add(disc);
}

// ── studio lights (the preview groups keep their own rig off) ────────────────
const hemi = new THREE.HemisphereLight(0xbfd8e2, 0x152420, 0.26);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff1d8, 1.1);
key.position.set(-2.2, 2.6, 2.4);
scene.add(key);
const fill = new THREE.DirectionalLight(0x8fc4dd, 0.4);
fill.position.set(2.8, 0.4, 1.4);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffb478, 0.8);
rim.position.set(1.0, 1.8, -2.8);
scene.add(rim);
const bounce = new THREE.DirectionalLight(0x2f6f6a, 0.22);
bounce.position.set(0, -2.5, 1.2);
scene.add(bounce);

const fish = [];
function addFish(id, opts, place) {
  const p = createFishPreview(id, opts);
  if (!p) {
    console.warn('[studio] missing species', id);
    return null;
  }
  p.setStudioLighting(false);
  p.group.position.set(place.x, place.y, place.z);
  p.group.rotation.set(place.pitch || 0, place.yaw || 0, place.roll || 0, 'YXZ');
  scene.add(p.group);
  fish.push({ p, baseYaw: place.yaw || 0, phase: place.phase || 0, spin: place.spin ?? 0, place });
  return p;
}

if (ONE) {
  // single-species turntable for close inspection
  const sp = getSpecies(ONE);
  if (sp) {
    const lenCm = sp.sizeCm[1] * 0.72;
    addFish(ONE, { lengthCm: lenCm, detail: 3 }, {
      x: 0, y: 0, z: 0, yaw: parseFloat(params.get('yaw') || '0.42'),
      pitch: 0.04, roll: 0.03, spin: 0.16,
    });
    camera.position.set(0.0, 0.12, 2.5);
    camera.lookAt(0, 0, 0);
  }
} else {
  // three-species hero line-up: tuna / grouper / lionfish
  addFish('yellowfin-tuna', { lengthCm: 128, detail: 3 }, {
    x: -0.66, y: 0.12, z: 0.2, yaw: -0.62, pitch: 0.03, roll: 0.08, phase: 0.3, spin: 0.1,
  });
  addFish('giant-grouper', { lengthCm: 168, detail: 3 }, {
    x: 0.28, y: -0.1, z: -0.15, yaw: 0.34, pitch: -0.02, roll: -0.04, phase: 1.6, spin: 0.07,
  });
  addFish('lionfish', { lengthCm: 44, detail: 3 }, {
    x: 1.02, y: 0.02, z: 0.42, yaw: -1.05, pitch: 0.06, roll: 0.12, phase: 3.1, spin: 0.14,
  });
}

let elapsed = 0;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  for (const f of fish) {
    f.p.update(dt);
    // slow turntable breathing so seams / fins are readable
    f.p.group.rotation.y = f.baseYaw + Math.sin(elapsed * f.spin + f.phase) * 0.2 + elapsed * 0.02;
    f.p.group.rotation.z = f.place.roll + Math.sin(elapsed * 0.7 + f.phase) * 0.012;
  }
  renderer.render(scene, camera);
}

renderer.render(scene, camera);
window.__STUDIO = {
  scene, camera, renderer, fish,
  render() { renderer.render(scene, camera); return true; },
  capture() {
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  },
  info() {
    return {
      species: fish.map((f) => ({ id: f.p.species.id, len: f.p.lengthCm, wt: f.p.weightKg, tris: f.p.geometry.index.count / 3 })),
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      lights: scene.children.filter((o) => o.isLight).length,
    };
  },
  setPose(i, pose) {
    const f = fish[i];
    if (!f) return null;
    Object.assign(f.place, pose);
    f.baseYaw = pose.yaw ?? f.baseYaw;
    return f.p.species.id;
  },
  // geometry-only inspection: 'normal' | 'wire' | 'off'
  setDebugMaterial(kind) {
    const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x8fffd0, wireframe: true, side: THREE.DoubleSide });
    for (const f of fish) {
      if (!f._orig) f._orig = f.p.mesh.material;
      f.p.mesh.material = kind === 'normal' ? normalMat
        : kind === 'wire' ? wireMat
        : f._orig;
    }
    return kind;
  },
};
window.__READY = true;
requestAnimationFrame(frame);
