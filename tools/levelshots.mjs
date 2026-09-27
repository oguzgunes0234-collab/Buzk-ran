import { chromium } from 'playwright-core';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
mkdirSync('out', { recursive: true });
const exe = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('ERR_CERT')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + path.resolve('dist/test.html'));
await page.waitForFunction(() => !document.getElementById('scrStart').hidden, null, { timeout: 30000 });
await page.screenshot({ path: 'out/v4-start.png' });
const only = process.argv.slice(2).map(Number);
for (let id = 1; id <= 10; id++) {
  if (only.length && !only.includes(id)) continue;
  const r = await page.evaluate((id) => {
    const k = window.__buzkiran; k.startLevel(id); document.getElementById('hintText').hidden = true;
    const hud = document.getElementById('hud').getBoundingClientRect();
    const bar = document.getElementById('ammoBar').getBoundingClientRect();
    return { m: k.measure(), hudBottom: hud.bottom, barTop: innerHeight - (bar.height) };
  }, id);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `out/v4-l${id}.png` });
  const worst = r.m.reduce((a, x) => (x.visible < a.visible ? x : a), { visible: 2 });
  const off = r.m.filter((x) => x.sy < r.hudBottom || x.sy > r.barTop || x.sx < 0 || x.sx > 390);
  console.log(`B${id}: hedef ${r.m.length}, en dusuk gorunurluk %${Math.round(worst.visible * 100)} (${worst.kind}), boyutlar ${r.m.map((x) => x.kind[0] + Math.round(x.px)).join(' ')}, arayuz altinda/ekran disi ${off.length}`);
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
