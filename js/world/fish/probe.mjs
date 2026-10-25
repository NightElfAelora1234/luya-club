// Probe the real camera pose at dive progress points (fish teammate tool).
import { openScene, closeScene } from '../../../tools/capture.mjs';
import { evalJs, sleep } from '../../../tools/cdp.mjs';

const { cdp, page, errors } = await openScene('http://127.0.0.1:4321/');
const ps = (process.env.PROBE || '0.05,0.14,0.19,0.22,0.24,0.26,0.28,0.3,0.32,0.36,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85,0.9,0.95,1').split(',').map(Number);
for (const p of ps) {
  await evalJs(cdp, `__APP.jumpTo(${p})`);
  await sleep(120);
  const s = await evalJs(cdp, `(() => {
    const c = __APP.engine.camera;
    const d = c.getWorldDirection(new c.position.constructor());
    return JSON.stringify({ p: ${p}, pos:[+c.position.x.toFixed(1),+c.position.y.toFixed(1),+c.position.z.toFixed(1)], dir:[+d.x.toFixed(2),+d.y.toFixed(2),+d.z.toFixed(2)] });
  })()`);
  console.log(s);
}
console.log('errors', errors.length);
await closeScene({ cdp, page });
