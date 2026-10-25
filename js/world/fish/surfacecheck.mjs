// Surface pointer encounter proof + god-ray check on the main page.
import fs from 'node:fs';
import { openScene, canvasShot, closeScene } from '../../../tools/capture.mjs';
import { evalJs, mouse, sleep } from '../../../tools/cdp.mjs';

const { cdp, page, errors } = await openScene('http://127.0.0.1:4321/');

async function dbg(label) {
  const s = await evalJs(cdp, `JSON.stringify({
    p: +__APP.app.progress.toFixed(3),
    y: +__APP.engine.camera.position.y.toFixed(2),
    surfaceGroup: (() => { const g = __APP.engine.scene.getObjectByName('surface-attracted-mahi'); return g ? { type: g.type, visible: g.visible, children: g.children.length } : null; })(),
    fish: __APP.fish.debugInfo(),
    amb: __APP.ambience.debugInfo(),
  })`);
  console.log(label, s);
}

// --- p=0, hover over the sea (Lead's repro) ---
await evalJs(cdp, `__APP.jumpTo(0)`);
await sleep(500);
await mouse(cdp, 'mouseMoved', 800, 580, { buttons: 0 });
await sleep(3600);
await canvasShot(cdp, './shots/fish-surface.png');
await dbg('p0');
const s0 = await evalJs(cdp, `JSON.stringify(__APP.fish.debugInfo().surface)`);
console.log('surface p0', s0);

// --- underwater surface beat ---
await evalJs(cdp, `__APP.jumpTo(0.19)`);
await sleep(500);
await mouse(cdp, 'mouseMoved', 780, 300, { buttons: 0 });
await sleep(2400);
await canvasShot(cdp, './shots/fish-surface-underwater.png');
await dbg('p19');

// --- god rays on the main page ---
await evalJs(cdp, `__APP.jumpTo(0.2)`);
await sleep(1400);
await canvasShot(cdp, './shots/fish-godrays.png');
await dbg('p20');

// --- deep / floor sanity after latest material ---
for (const p of [0.5, 0.9, 1]) {
  await evalJs(cdp, `__APP.jumpTo(${p})`);
  await sleep(1200);
  const f = `./shots/fish-v6-p${String(p).replace('.', '_')}.png`;
  await canvasShot(cdp, f);
  if (fs.statSync(f).size < 900000) { await sleep(400); await canvasShot(cdp, f); }
  await dbg('p' + p);
}
console.log('errors', errors.length, errors.slice(0, 8));
await closeScene({ cdp, page });
