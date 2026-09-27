import { chromium } from 'playwright-core';
import path from 'node:path';
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('ERR_CERT')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + path.resolve('dist/test.html'));
await page.waitForFunction(() => !document.getElementById('scrStart').hidden, null, { timeout: 30000 });
await page.screenshot({ path: 'out/v2-00-start.png' });
for (const [l, m, a, b, tag] of [[6, '3d', 0, 210, 'l6-3d'], [6, '25d', 160, 85, 'l6-25d'], [2, '25d', 310, 67, 'l2-25d'], [8, '3d', 0, 290, 'l8-3d']]) {
  await page.evaluate(([l, m, a, b]) => { const k = window.__buzkiran; k.startLevel(l, m); k.previewAim(a, b); document.getElementById('hintText').hidden = true; }, [l, m, a, b]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'out/v2-' + tag + '.png' });
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
