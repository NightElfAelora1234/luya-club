// Fish + ambience acceptance probe (owned by fish teammate).
import fs from 'node:fs';
import { openScene, canvasShot, pageShot, closeScene } from '../../../tools/capture.mjs';
import { evalJs, mouse, sleep } from '../../../tools/cdp.mjs';

const { cdp, page, errors } = await openScene('http://127.0.0.1:4321/');

async function info(label) {
  const s = await evalJs(cdp, `JSON.stringify({
    depth: +__APP.app.cameraDepth.toFixed(1),
    calls: __APP.engine.renderer.info.render.calls,
    tris: __APP.engine.renderer.info.render.triangles,
    fish: __APP.fish.debugInfo(),
    amb: __APP.ambience.debugInfo(),
    mode: __APP.app.mode,
    y: +__APP.engine.camera.position.y.toFixed(1),
    ambGroup: (() => { const g = __APP.engine.scene.getObjectByName('ambience'); return g ? g.visible : null; })(),
    ambKids: (() => { const g = __APP.engine.scene.getObjectByName('ambience'); return g ? g.children.filter(c => c.visible).map(c => c.type + ':' + c.name) : []; })(),
    fishGroup: (() => { const g = __APP.engine.scene.getObjectByName('fish-schools'); return g ? g.visible : null; })(),
    surfMesh: (() => { const m = __APP.engine.scene.getObjectByName('surface-attracted-mahi'); return m ? m.visible : null; })(),
  })`);
  console.log(label, s);
}

async function fps(label) {
  const r = await evalJs(cdp, `(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    return (n / ((performance.now() - t0) / 1000)).toFixed(1);
  })()`);
  console.log('fps', label, r);
}

for (const p of [0.2, 0.5, 0.9, 1]) {
  await evalJs(cdp, `__APP.jumpTo(${p})`);
  await sleep(1500);
  const file = `./shots/fish-v4-p${String(p).replace('.', '_')}.png`;
  await canvasShot(cdp, file);
  // a second capture if the first came back suspiciously small (compositor glitch)
  if (fs.statSync(file).size < 900000) {
    await sleep(500);
    await canvasShot(cdp, file);
  }
  await info('p' + p);
  if (p === 0.2 || p === 0.5) await fps('p' + p);
}

// surface pointer encounter proof
await evalJs(cdp, `__APP.jumpTo(0.19)`);
await sleep(600);
await mouse(cdp, 'mouseMoved', 780, 320, { buttons: 0 });
await sleep(2600);
await canvasShot(cdp, './shots/fish-v4-pointer.png');
console.log('pointer', await evalJs(cdp, `JSON.stringify({inside:__APP.app.pointer.inside, ndc:[+__APP.app.pointer.ndc.x.toFixed(2),+__APP.app.pointer.ndc.y.toFixed(2)], surface:__APP.fish.debugInfo().surfaceActive})`));

// shop + fishing above-water particle check
await evalJs(cdp, `__APP.enterShop()`);
await sleep(1600);
await pageShot(cdp, './shots/fish-v4-shop.png');
await canvasShot(cdp, './shots/fish-v4-shop-canvas.png');
await info('shop');
await evalJs(cdp, `__APP.enterFishing({id:'qa',name:'礁牙 68ML'})`);
await sleep(1400);
await pageShot(cdp, './shots/fish-v4-fishing.png');
await info('fishing');

// catch-fighter presentation
console.log('fighter', await evalJs(cdp, `(() => {
  __APP.jumpTo(0.2);
  const f = __APP.fish.spawnFighter('red-snapper');
  if (!f) return 'null';
  f.showInFrontOfCamera();
  return JSON.stringify({ id: f.species.id, len: f.lengthCm, kg: f.weightKg, visible: f.object.visible });
})()`));
await sleep(900);
await canvasShot(cdp, './shots/fish-v4-fighter.png');

console.log('errors', errors.length, errors.slice(0, 8));
await closeScene({ cdp, page });
