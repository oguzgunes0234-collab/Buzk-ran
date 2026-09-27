// End-to-end browser check: plays the whole evaluation tour through the real
// UI flow (numeric shots injected via test hooks), runs the in-page
// consistency self-test in Chromium, and collects readability metrics.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { REFERENCE } from '../src/reference.js';
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('ERR_CERT_AUTHORITY_INVALID')) errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + path.resolve('dist/test.html'));
await page.waitForFunction(() => !document.getElementById('scrStart').hidden, null, { timeout: 30000 });

// 1) in-page self-test (Chromium / V8) against Node reference
const st = await page.evaluate(() => window.__buzkiran.runSelfTest());
console.log('self-test in Chromium:', st.passed + '/' + st.total, st.results.filter((r) => !r.ok).map((r) => r.name + ': ' + r.mismatch).join('; '));

// 2) play the tour through the UI
await page.click('#btnTour');
const winShots = (lv, mode) => REFERENCE.cases.find((c) => c.level === lv && c.mode === mode && c.name.endsWith('kazanan')).shots;
let lostOnce = false;
for (let i = 0; i < 16; i++) {
  const it = await page.evaluate(() => { const t = window.__buzkiran.state.tour; return t.order[t.idx]; });
  // exercise the lose -> retry path once (level 2 has 2 shots)
  if (!lostOnce && it.level === 2) {
    const miss = it.mode === '3d' ? { a: -150, b: 700 } : { a: 800, b: 25 };
    for (let k = 0; k < 2; k++) {
      await page.waitForFunction(() => window.__buzkiran.state.sim.phase === 'aim');
      await page.evaluate(([a, b]) => window.__buzkiran.fire(a, b), [miss.a, miss.b]);
    }
    await page.waitForFunction(() => window.__buzkiran.state.screen === 'scrResult', null, { timeout: 60000 });
    const title = await page.textContent('#resTitle');
    if (i === 2 || i === 3) await page.screenshot({ path: 'out/10-lost.png' });
    await page.click('#resRetry');
    lostOnce = title.includes('bitti');
  }
  for (const s of winShots(it.level, it.mode)) {
    await page.waitForFunction(() => window.__buzkiran.state.sim.phase === 'aim', null, { timeout: 60000 });
    await page.evaluate(([a, b]) => window.__buzkiran.fire(a, b), [s.a, s.b]);
  }
  await page.waitForFunction(() => window.__buzkiran.state.screen === 'scrResult', null, { timeout: 60000 });
  if (i === 15) await page.screenshot({ path: 'out/11-won.png' });
  await page.click('#resNext');
}
await page.waitForFunction(() => !document.getElementById('scrRate').hidden);
await page.waitForFunction(() => document.getElementById('selftestStatus').textContent.includes('/18'), null, { timeout: 60000 });
// give a couple of example ratings to check the form wiring (not real answers)
await page.click('#r-okunabilirlik-3d-3');
await page.click('#r-okunabilirlik-25d-4');
await page.screenshot({ path: 'out/12-rate.png', fullPage: true });
const summary = await page.inputValue('#summaryText');
const log = await page.evaluate(() => window.__buzkiran.state.log);
writeFileSync('out/e2e-summary.txt', summary);
writeFileSync('out/e2e-log.json', JSON.stringify(log, null, 2));
console.log('lost->retry path exercised:', lostOnce);
console.log(summary);
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors');
await browser.close();
