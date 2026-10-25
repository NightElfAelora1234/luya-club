// fish teammate test harness (owned file). Node only, never loaded by the page.
// Jump to dive progress points, canvas-capture, dump draw calls / fish debug.
//   node js/world/fish/test.mjs
// env: FISH_URL, FISH_TAG, FISH_POINTS, FISH_WAIT, FISH_ACTION
import { openScene, canvasShot, closeScene } from '../../../tools/capture.mjs';
import { evalJs, sleep } from '../../../tools/cdp.mjs';

const url = process.env.FISH_URL || 'http://127.0.0.1:4321/';
const tag = process.env.FISH_TAG || 'fish';
const points = (process.env.FISH_POINTS || '0.2,0.32,0.5,0.72,0.9,1').split(',').map(Number);
const wait = Number(process.env.FISH_WAIT || 1000);

const { cdp, page, errors } = await openScene(url);
for (const p of points) {
  await evalJs(cdp, `__APP.jumpTo(${p})`);
  await sleep(wait);
  await canvasShot(cdp, `./shots/${tag}-p${String(p).replace('.', '_')}.png`);
  const info = await evalJs(cdp, `JSON.stringify({
    y: +__APP.engine.camera.position.y.toFixed(1),
    calls: __APP.engine.renderer.info.render.calls,
    tris: __APP.engine.renderer.info.render.triangles,
    fish: __APP.fish?.debugInfo?.() || null,
    amb: __APP.ambience?.debugInfo?.() || null,
  })`);
  console.log('p', p, info);
}
if (process.env.FISH_ACTION) {
  const code = Buffer.from(process.env.FISH_ACTION, 'base64').toString('utf8');
  console.log('action =>', await evalJs(cdp, code));
  await sleep(wait);
  await canvasShot(cdp, `./shots/${tag}-action.png`);
}
console.log('errors', errors.length, errors.slice(0, 6));
await closeScene({ cdp, page });
