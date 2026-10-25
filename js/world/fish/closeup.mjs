// Close-up species inspection using the fighter presentation path.
import { openScene, canvasShot, closeScene } from '../../../tools/capture.mjs';
import { evalJs, sleep } from '../../../tools/cdp.mjs';

const { cdp, page, errors } = await openScene('http://127.0.0.1:4321/');
await evalJs(cdp, `(() => {
  __APP.jumpTo(0.19);
  __APP.fish.setVisible(false);
  const amb = __APP.engine.scene.getObjectByName('ambience'); if (amb) amb.visible = false;
  return 1;
})()`);
const ids = ['yellowfin-tuna', 'cobia', 'mahi-mahi', 'red-snapper', 'giant-grouper', 'parrotfish', 'lionfish', 'hairtail', 'scad'];
for (const id of ids) {
  const r = await evalJs(cdp, `(() => {
    const f = __APP.fish.spawnFighter('${id}');
    if (!f) return 'null';
    f.showInFrontOfCamera();
    f.followCamera = false;
    __APP.engine.composer.render();
    return JSON.stringify({ id: f.species.id, len: f.lengthCm, w: f.weightKg });
  })()`);
  await sleep(400);
  await canvasShot(cdp, `./shots/diag-close-${id}.png`);
  console.log(r);
  await evalJs(cdp, `(() => { for (const o of __APP.engine.scene.children) { if (o.userData && o.userData.fighter) o.visible = false; } return 1; })()`);
}
console.log('errors', errors);
await closeScene({ cdp, page });
