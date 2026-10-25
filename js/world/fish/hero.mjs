// Hero side-view close-ups for art review (fish teammate).
import { openScene, canvasShot, closeScene } from '../../../tools/capture.mjs';
import { evalJs, sleep } from '../../../tools/cdp.mjs';

const { cdp, page, errors } = await openScene('http://127.0.0.1:4321/js/world/fish/preview.html?p=0.19');

await evalJs(cdp, `(() => {
  __APP.jumpTo(0.19);
  __APP.fish.setVisible(true);
  const s = __APP.engine.scene;
  const schools = s.getObjectByName('fish-schools'); if (schools) schools.visible = false;
  const surf = s.getObjectByName('surface-attracted-mahi'); if (surf) surf.visible = false;
  return 1;
})()`);
await sleep(500);

// Build a three-species hero line-up in front of the camera.
const setup = await evalJs(cdp, `(() => {
  const cam = __APP.engine.camera;
  cam.updateMatrixWorld();
  const dir = cam.getWorldDirection(new cam.position.constructor());
  const right = new cam.position.constructor().setFromMatrixColumn(cam.matrixWorld, 0);
  const up = new cam.position.constructor().setFromMatrixColumn(cam.matrixWorld, 1);
  const yawBase = Math.atan2(-right.x, -right.z) + 0.22;
  const defs = [
    { id: 'yellowfin-tuna', dist: 2.75, lat: -1.45, vert: 0.06, scale: 1.12, pitch: 0.02, roll: 0.09 },
    { id: 'giant-grouper',  dist: 3.35, lat: 0.18, vert: -0.12, scale: 1.65, pitch: -0.02, roll: -0.06 },
    { id: 'lionfish',       dist: 2.25, lat: 1.42, vert: 0.02, scale: 0.5, pitch: 0.06, roll: 0.12 },
  ];
  const out = [];
  for (const d of defs) {
    const f = __APP.fish.spawnFighter(d.id);
    if (!f) continue;
    f.followCamera = false;
    f.visible = true;
    const o = f.object;
    o.visible = true;
    o.position.copy(cam.position).addScaledVector(dir, d.dist).addScaledVector(right, d.lat).addScaledVector(up, d.vert);
    o.rotation.set(d.pitch, yawBase, d.roll, 'YXZ');
    o.scale.setScalar(d.scale);
    out.push({ id: d.id, len: f.lengthCm });
  }
  return JSON.stringify(out);
})()`);
console.log('heroes', setup);
await sleep(1600);
await canvasShot(cdp, './shots/fish-hero-v5.png');

// individual framing shots
const individual = [
  ['yellowfin-tuna', 2.5, 0.0, 0.02, 1.05],
  ['giant-grouper', 3.1, 0.0, -0.02, 1.7],
  ['lionfish', 2.0, 0.0, 0.03, 0.36],
  ['red-snapper', 2.2, 0.0, 0.02, 0.62],
  ['hairtail', 2.8, 0.0, 0.0, 1.1],
];
for (const [id, dist, lat, pitch, scale] of individual) {
  await evalJs(cdp, `(() => {
    const cam = __APP.engine.camera;
    cam.updateMatrixWorld();
    const dir = cam.getWorldDirection(new cam.position.constructor());
    const right = new cam.position.constructor().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new cam.position.constructor().setFromMatrixColumn(cam.matrixWorld, 1);
    for (const o of __APP.engine.scene.children) {
      if (o.userData && o.userData.fighter) o.visible = false;
    }
    const f = __APP.fish.spawnFighter('${id}');
    if (!f) return 'null';
    f.followCamera = false;
    f.visible = true;
    const o = f.object;
    o.visible = true;
    o.position.copy(cam.position).addScaledVector(dir, ${dist}).addScaledVector(right, ${lat}).addScaledVector(up, 0.02);
    o.rotation.set(${pitch}, Math.atan2(-right.x, -right.z) + 0.16, 0.05, 'YXZ');
    o.scale.setScalar(${scale});
    return 'ok';
  })()`);
  await sleep(700);
  await canvasShot(cdp, `./shots/fish-hero-v5-${id}.png`);
}

// grouper from above-left, 35°, to judge the floor silhouette
await evalJs(cdp, `(() => {
  const cam = __APP.engine.camera;
  cam.updateMatrixWorld();
  const dir = cam.getWorldDirection(new cam.position.constructor());
  const right = new cam.position.constructor().setFromMatrixColumn(cam.matrixWorld, 0);
  const up = new cam.position.constructor().setFromMatrixColumn(cam.matrixWorld, 1);
  for (const o of __APP.engine.scene.children) { if (o.userData && o.userData.fighter) o.visible = false; }
  const f = __APP.fish.spawnFighter('giant-grouper');
  f.followCamera = false;
  f.visible = true;
  const o = f.object;
  o.visible = true;
  o.position.copy(cam.position).addScaledVector(dir, 3.0).addScaledVector(right, 0.2).addScaledVector(up, -0.35);
  o.rotation.set(-0.55, Math.atan2(-right.x, -right.z) + 0.5, 0.22, 'YXZ');
  o.scale.setScalar(1.7);
  return 'ok';
})()`);
await sleep(900);
await canvasShot(cdp, './shots/fish-hero-v5-grouper-3q.png');

console.log('errors', errors.length, errors.slice(0, 6));
await closeScene({ cdp, page });
