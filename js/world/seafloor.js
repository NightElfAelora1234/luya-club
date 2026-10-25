import * as THREE from 'three';
import { app } from '../core/state.js';
import { WORLD, CAMERA_KEYS } from '../core/world.js';
import { clamp, mulberry32 } from '../core/util.js';
function floorHeight(x, z) {
  return WORLD.floorY
    + 0.9 * Math.sin(x * 0.11) * Math.cos(z * 0.09)
    + 0.45 * Math.sin(x * 0.27 + z * 0.19)
    + 0.22 * Math.sin(x * 0.61 - z * 0.43);
}

function makeRadialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255, 236, 200, .95)');
  g.addColorStop(0.35, 'rgba(255, 214, 150, .35)');
  g.addColorStop(1, 'rgba(255, 200, 120, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSandNormalTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const ripple = Math.sin((v * 9.0 + Math.sin(u * 7.0) * 0.75) * Math.PI * 2) * 0.5 + 0.5;
      const fine = Math.sin(u * 84.0 + v * 37.0) * 0.12 + Math.sin(u * 41.0 - v * 67.0) * 0.08;
      h[y * S + x] = ripple * 0.65 + fine;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const xl = (x - 1 + S) % S, xr = (x + 1) % S;
      const yu = (y - 1 + S) % S, yd = (y + 1) % S;
      const dx = (h[y * S + xr] - h[y * S + xl]) * 2.6;
      const dy = (h[yd * S + x] - h[yu * S + x]) * 2.6;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(26, 26);
  tex.anisotropy = 8;
  return tex;
}

function buildRod() {
  const rod = new THREE.Group();
  rod.name = 'seabed-rod';

  const carbon = new THREE.MeshStandardMaterial({ color: 0x1b2224, roughness: 0.32, metalness: 0.55 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa7a8, roughness: 0.28, metalness: 0.92 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a367, roughness: 0.35, metalness: 0.85 });
  const eva = new THREE.MeshStandardMaterial({ color: 0x14191a, roughness: 0.92, metalness: 0.02 });

  const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.028, 2.5, 10, 1), carbon);
  blank.position.y = 1.25;
  rod.add(blank);

  // handle + reel seat
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.026, 0.36, 12), eva);
  grip.position.y = 0.20;
  rod.add(grip);
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.05, 12), metal);
  butt.position.y = 0.02;
  rod.add(butt);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 12), metal);
  seat.position.y = 0.46;
  rod.add(seat);

  // spinning reel
  const reel = new THREE.Group();
  reel.position.set(0, 0.50, 0.055);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.055, 18), metal);
  body.rotation.z = Math.PI / 2;
  body.rotation.x = Math.PI / 2;
  reel.add(body);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.13, 0.035), metal);
  stem.position.set(0, 0.06, -0.02);
  reel.add(stem);
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.062, 0.075, 20), gold);
  spool.rotation.x = Math.PI / 2;
  spool.position.set(0, 0.115, 0.01);
  reel.add(spool);
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.006, 8, 18, Math.PI * 1.1), metal);
  bail.rotation.y = Math.PI / 2;
  bail.position.set(0, 0.115, 0.045);
  reel.add(bail);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.04, 10), eva);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(0.08, 0.05, -0.02);
  reel.add(knob);
  rod.add(reel);

  // guides
  for (const [h, rad] of [[0.82, 0.026], [1.18, 0.022], [1.55, 0.018], [1.9, 0.014], [2.24, 0.011], [2.46, 0.009]]) {
    const guide = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.0028, 6, 14), metal);
    guide.rotation.x = Math.PI / 2;
    guide.position.set(0, h, 0.026);
    rod.add(guide);
  }

  // tip light + haze
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xffe2b4, emissive: 0xffbe78, emissiveIntensity: 5.0, roughness: 0.3 }),
  );
  tip.position.set(0, 2.52, 0.01);
  rod.add(tip);
  const tipLight = new THREE.PointLight(0xffc98f, 5.5, 11, 2.0);
  tipLight.position.set(0, 2.45, 0.15);
  rod.add(tipLight);
  const glowTex = makeRadialTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffcf9a, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(1.8, 1.8, 1);
  glow.position.set(0, 2.5, 0.1);
  rod.add(glow);

  // line vanishing upward
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 2.52, 0),
    new THREE.Vector3(0.2, 5.5, -0.6),
    new THREE.Vector3(0.1, 11, -1.6),
    new THREE.Vector3(0.4, 22, -3.2),
  ]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xbfe8e0, transparent: true, opacity: 0.22 }));
  line.visible = false;
  rod.add(line);

  // sand glow + ring
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 48),
    new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffcf9a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.03;
  rod.add(halo);

  // generous invisible hit volume for clicking
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.85, 2.8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hit.position.y = 1.25;
  hit.userData.isRodHit = true;
  rod.add(hit);

  rod.userData.tip = tip;
  rod.userData.glow = glow;
  rod.userData.tipLight = tipLight;
  rod.userData.hit = hit;
  rod.userData.line = line;
  return rod;
}

export function createSeafloor(engine) {
  const group = new THREE.Group();
  group.name = 'seafloor';
  const rand = mulberry32(20260418);

  // ---------- sand ----------
  const SIZE = 460;
  const SEG = 150;
  const floorGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  floorGeo.rotateX(-Math.PI / 2);
  const pos = floorGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, floorHeight(x, z));
  }
  floorGeo.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = 0.5 + 0.5 * Math.sin(x * 0.7 + z * 0.4) * Math.sin(z * 0.53 - x * 0.2);
    const ripple = 0.82 + 0.18 * Math.sin(x * 1.9 + Math.sin(z * 0.8) * 1.2);
    const c = new THREE.Color(0x4a463c).multiplyScalar(0.72 + n * 0.35 + ripple * 0.1);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  floorGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0.02,
    vertexColors: true,
    normalMap: makeSandNormalTexture(),
    normalScale: new THREE.Vector2(0.9, 0.9),
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, 0, 0);
  floor.receiveShadow = false;
  group.add(floor);

  // ---------- scattered rocks ----------
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x1a2021, roughness: 0.94, metalness: 0.03, flatShading: true });
  const ROCKS = 48;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const keepClear = [
    new THREE.Vector3(...CAMERA_KEYS[CAMERA_KEYS.length - 1].pos),
    new THREE.Vector3(...CAMERA_KEYS[CAMERA_KEYS.length - 2].pos),
    new THREE.Vector3(...CAMERA_KEYS[CAMERA_KEYS.length - 3].pos),
    new THREE.Vector3(WORLD.rodPos.x, WORLD.floorY + 1, WORLD.rodPos.z),
  ];
  const isClear = (x, z) => {
    if (Math.hypot(x - WORLD.rodPos.x, z - WORLD.rodPos.z) < 10) return false;
    for (const c of keepClear) if (Math.hypot(x - c.x, z - c.z) < 9) return false;
    return true;
  };
  let rockCount = 0;
  for (let i = 0; i < ROCKS; i++) {
    const x = (rand() - 0.5) * 130;
    const z = (rand() - 0.5) * 120 - 10;
    if (!isClear(x, z)) continue;
    const sc = 0.4 + rand() * 2.6;
    p.set(x, floorHeight(x, z) + sc * 0.32, z);
    q.setFromEuler(new THREE.Euler(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI));
    s.set(sc * (0.8 + rand() * 0.9), sc * (0.5 + rand() * 0.5), sc * (0.8 + rand() * 0.9));
    m4.compose(p, q, s);
    rocks.setMatrixAt(rockCount++, m4);
  }
  rocks.count = rockCount;
  rocks.instanceMatrix.needsUpdate = true;
  rocks.name = 'seafloor-rocks';
  group.add(rocks);

  // ---------- sparse sea fans ----------
  const coralMat = new THREE.MeshStandardMaterial({ color: 0x5a3f4b, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide });
  const fanGroup = new THREE.Group();
  for (let f = 0; f < 7; f++) {
    const bx = (rand() - 0.5) * 60 + 10;
    const bz = (rand() - 0.5) * 60 - 10;
    if (!isClear(bx, bz)) continue;
    const baseY = floorHeight(bx, bz);
    const fan = new THREE.Group();
    fan.position.set(bx, baseY, bz);
    const branches = 5 + Math.floor(rand() * 4);
    for (let b = 0; b < branches; b++) {
      const angle = (b / branches) * Math.PI - Math.PI / 2;
      const height = 0.8 + rand() * 0.9;
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        pts.push(new THREE.Vector3(
          Math.sin(angle) * t * 0.9 + Math.sin(t * 6 + b) * 0.06,
          t * height,
          Math.cos(angle) * t * 0.4,
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.018, 4, false), coralMat);
      fan.add(tube);
    }
    fanGroup.add(fan);
  }
  fanGroup.name = 'seafloor-corals';
  group.add(fanGroup);

  // cool submersible fill so the sand and rod read in the abyss
  const fill = new THREE.PointLight(0x5f9fb8, 26, 34, 2.0);
  fill.position.set(0.5, -89.2, -1.5);
  group.add(fill);
  const rim = new THREE.PointLight(0x2c6b82, 14, 22, 2.0);
  rim.position.set(-4.5, -93.0, -5.0);
  group.add(rim);
  const key = new THREE.SpotLight(0x86bdd4, 85, 32, 0.62, 0.9, 1.6);
  key.position.set(0.4, -87.2, -1.2);
  key.target.position.set(0.4, -95.2, -6.4);
  group.add(key, key.target);

  // ---------- the rod ----------
  const rod = buildRod();
  const rodY = floorHeight(WORLD.rodPos.x, WORLD.rodPos.z);
  rod.position.set(WORLD.rodPos.x, rodY + 0.02, WORLD.rodPos.z);
  rod.rotation.z = -0.10;
  rod.rotation.x = 0.06;
  rod.rotation.y = 0.25;
  rod.scale.setScalar(1.18);
  group.add(rod);

  engine.scene.add(group);

  let hover = 0;
  let hoverTarget = 0;
  const raycasterRoots = [rod.userData.hit, rod];

  return {
    group,
    floor,
    rod,
    rodHit: rod.userData.hit,
    raycast(raycaster) {
      const hits = raycaster.intersectObjects([rod.userData.hit], true);
      return hits.length > 0;
    },
    setHover(v) { hoverTarget = v ? 1 : 0; },
    update(dt) {
      // cull the abyss when we are nowhere near it
      group.visible = app.cameraDepth > 24;
      if (!group.visible) return;
      hover += (hoverTarget - hover) * Math.min(1, dt * 8);
      const tip = rod.userData.tip;
      const glow = rod.userData.glow;
      const light = rod.userData.tipLight;
      const pulse = 0.75 + Math.sin(app.time * 1.6) * 0.12 + hover * 0.45;
      tip.material.emissiveIntensity = 3.2 + hover * 4.0;
      glow.material.opacity = 0.2 * pulse + hover * 0.2;
      light.intensity = 2.4 + pulse * 1.0 + hover * 2.0;
      glow.scale.setScalar(1.7 + Math.sin(app.time * 1.1) * 0.12 + hover * 0.45);
      rod.userData.line.visible = false;
    },
  };
}
