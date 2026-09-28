// End-to-end browser check (v4): plays the 10-level tour through the real UI
// flow (numeric shots injected via test hooks), exercises the lose/retry and
// nest-failure paths, runs the in-page self-test, collects the summary.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { REFERENCE } from '../src/reference.js';
mkdirSync('out', { recursive: true });
const exe = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('ERR_CERT_AUTHORITY_INVALID')) errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + path.resolve('dist/test.html'));
await page.waitForFunction(() => !document.getElementById('scrStart').hidden, null, { timeout: 30000 });
const st = await page.evaluate(() => window.__buzkiran.runSelfTest());
console.log('self-test in Chromium:', st.passed + '/' + st.total, st.results.filter((r) => !r.ok).map((r) => r.name + ': ' + r.mismatch).join('; '));

const fireSeq = async (shots) => {
  for (const s of shots) {
    await page.waitForFunction(() => window.__buzkiran.state.sim.phase === 'aim', null, { timeout: 60000 });
    await page.evaluate(([a, b, t]) => { const k = window.__buzkiran; k.selectAmmo(t); k.fire(a, b); }, [s.a, s.b, s.t]);
  }
  await page.waitForFunction(() => window.__buzkiran.state.screen === 'scrResult', null, { timeout: 60000 });
  return page.textContent('#resTitle');
};
await page.click('#btnTour');
const paths = [];
for (let i = 0; i < 10; i++) {
  const lv = await page.evaluate(() => { const t = window.__buzkiran.state.tour; return t.order[t.idx]; });
  if (lv === 2) { // lose -> retry
    const title = await fireSeq([{ t: 'normal', a: -150, b: 700 }, { t: 'normal', a: -150, b: 700 }]);
    paths.push('B2 kayıp: ' + title);
    await page.click('#resRetry');
  }
  if (lv === 8) { // nest failure -> retry
    const c = REFERENCE.cases.find((x) => x.name === 'B8 yuva kırılır');
    const title = await fireSeq(c.shots);
    paths.push('B8 yuva: ' + title + ' / ' + (await page.textContent('#resBody')));
    await page.screenshot({ path: 'out/v4-nestfail.png' });
    await page.click('#resRetry');
  }
  const win = REFERENCE.cases.find((x) => x.name === 'B' + lv + ' kazanan');
  const title = await fireSeq(win.shots);
  if (!title.includes('Başardın')) paths.push('B' + lv + ' BEKLENMEYEN SONUÇ: ' + title);
  if (lv === 6) await page.screenshot({ path: 'out/v4-won.png' });
  await page.click('#resNext');
}
await page.waitForFunction(() => !document.getElementById('scrRate').hidden);
await page.waitForFunction(() => document.getElementById('selftestStatus').textContent.includes('/' + 12), null, { timeout: 60000 });
await page.click('#r-okunabilirlik-4');
await page.click('#r-mermi-5');
await page.screenshot({ path: 'out/v4-rate.png', fullPage: true });
const summary = await page.inputValue('#summaryText');
writeFileSync('out/e2e-summary.txt', summary);
console.log(paths.join('\n'));
console.log(summary);
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors');
await browser.close();
