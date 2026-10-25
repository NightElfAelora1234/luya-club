// One-off visual diagnostic (fish teammate).
import { openScene, canvasShot, closeScene } from '../../../tools/capture.mjs';
import { evalJs, sleep } from '../../../tools/cdp.mjs';

const { cdp, page, errors } = await openScene('http://127.0.0.1:4321/');
async function shot(name, p, prep) {
  await evalJs(cdp, `__APP.jumpTo(${p})`);
  if (prep) await evalJs(cdp, prep);
  await sleep(1200);
  await canvasShot(cdp, `./shots/diag-${name}.png`);
}
await shot('p02-nofish', 0.2, `(() => { __APP.fish.setVisible(false); return 1; })()`);
await shot('p02-noamb', 0.2, `(() => { const s = __APP.engine.scene; s.getObjectByName('ambience').visible = false; __APP.fish.setVisible(true); return 1; })()`);
await shot('p02-all', 0.2, `(() => { const s = __APP.engine.scene; s.getObjectByName('ambience').visible = true; return 1; })()`);
await shot('p06-all', 0.6, null);
await shot('p09-all', 0.9, null);
await shot('p10-all', 1.0, null);
console.log('errors', errors);
await closeScene({ cdp, page });
