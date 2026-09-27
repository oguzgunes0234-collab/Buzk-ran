// Checks the stone-totem loss hint in B9: normal at the stone totem, heavy
// wasted on the cage row, ember anywhere -> lost, result text shows the hint.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
mkdirSync('out', { recursive: true });
const exe = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push(m.text()); });
await page.goto('file://' + path.resolve('dist/test.html'));
await page.waitForFunction(() => !document.getElementById('scrStart').hidden, null, { timeout: 30000 });
await page.evaluate(() => window.__buzkiran.startLevel(9));
for (const [t, a, b] of [['normal', -90, 430], ['heavy', 50, 210], ['ember', 150, 50]]) {
  await page.waitForFunction(() => window.__buzkiran.state.sim.phase === 'aim', null, { timeout: 60000 });
  await page.evaluate(([t, a, b]) => { const k = window.__buzkiran; k.selectAmmo(t); k.fire(a, b); }, [t, a, b]);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `out/v41-b9-${t}.png` });
}
await page.waitForFunction(() => window.__buzkiran.state.screen === 'scrResult', null, { timeout: 60000 });
const res = await page.evaluate(() => ({ title: document.getElementById('resTitle').textContent, body: document.getElementById('resBody').textContent, shown: !document.getElementById('scrResult').hidden }));
console.log(JSON.stringify(res));
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
