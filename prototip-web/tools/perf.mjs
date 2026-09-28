import { chromium } from 'playwright-core';
import path from 'node:path';
import { REFERENCE } from '../src/reference.js';
const exe = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto('file://' + path.resolve('dist/test.html'));
await page.waitForFunction(() => !document.getElementById('scrStart').hidden, null, { timeout: 30000 });
const cdp = await ctx.newCDPSession(page);
const cases = REFERENCE.cases.filter((c) => c.level >= 8);
for (const rate of [1, 4, 6]) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  for (const c of cases) {
    // warm-up once, then measure
    await page.evaluate(([l, s]) => window.__buzkiran.bench(l, s), [c.level, c.shots]);
    const r = await page.evaluate(([l, s]) => window.__buzkiran.bench(l, s), [c.level, c.shots]);
    console.log('CPU x' + rate, c.name.padEnd(24), 'kurulum+yerlesme ms', r.build, '| adim', r.steps, 'ort ms', r.avg, 'p95', r.p95, 'max', r.max);
  }
}
await browser.close();
