// boot debug (fish teammate)
import { attach, evalJs, sleep, closePage } from '../../../tools/cdp.mjs';
const { cdp, page } = await attach('about:blank');
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
const errs = [];
cdp.on('Runtime.exceptionThrown', (p) => errs.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') errs.push(p.entry.text); });
cdp.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error' || p.type === 'warning') errs.push(p.type + ': ' + p.args.map((a) => a.value || a.description || '').join(' '));
});
await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4321/' });
await sleep(7000);
console.log('READY', await evalJs(cdp, 'window.__READY === true').catch((e) => 'err ' + e.message));
console.log('errors:\n' + errs.join('\n---\n'));
await closePage(page.id);
cdp.close();
setTimeout(() => process.exit(0), 200);
