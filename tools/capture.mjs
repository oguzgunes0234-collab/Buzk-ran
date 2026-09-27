// Renders short gameplay clips frame by frame (fixed 1/30 s per frame) so the
// video is smooth even though the headless browser renders slowly.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { REFERENCE } from '../src/reference.js';
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FF = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto('file://' + path.resolve('dist/test.html'));
await page.waitForFunction(() => !document.getElementById('scrStart').hidden, null, { timeout: 30000 });
const clips = [
  { level: 8, mode: '3d' }, { level: 8, mode: '25d' },
  { level: 5, mode: '3d' }, { level: 5, mode: '25d' },
];
for (const clip of clips) {
  const c = REFERENCE.cases.find((x) => x.level === clip.level && x.mode === clip.mode && x.name.endsWith('kazanan'));
  const shot = c.shots[0];
  await page.evaluate(([l, m]) => { const b = window.__buzkiran; b.setManualClock(true); b.startLevel(l, m); }, [clip.level, clip.mode]);
  const name = 'clip-b' + clip.level + '-' + clip.mode;
  const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', '30', '-i', 'pipe:0', '-c:v', 'libvpx', '-b:v', '3M', '-auto-alt-ref', '0', 'out/' + name + '.webm']);
  const closed = new Promise((r) => ff.on('close', r));
  ff.stderr.on('data', (d) => process.stderr.write('ffmpeg: ' + d));
  const frame = async (tag) => {
    const buf = await page.screenshot({ type: 'jpeg', quality: 88 });
    ff.stdin.write(buf);
    if (tag) writeFileSync('out/' + name + '-' + tag + '.png', await page.screenshot({ type: 'png' }));
  };
  const start = clip.mode === '3d' ? { a: 0, b: 200 } : { a: 150, b: 40 };
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    await page.evaluate(([a, b]) => { window.__buzkiran.previewAim(a, b); window.__buzkiran.advance(1 / 30); },
      [Math.round(start.a + (shot.a - start.a) * t), Math.round(start.b + (shot.b - start.b) * t)]);
    await frame(i === 24 ? 'aim' : null);
  }
  await page.evaluate(([a, b]) => { const k = window.__buzkiran; k.clearDrag(); k.fire(a, b); }, [shot.a, shot.b]);
  for (let i = 0; i < 120; i++) {
    await page.evaluate(() => window.__buzkiran.advance(1 / 30));
    await frame(i === 34 ? 'impact' : i === 60 ? 'after' : null);
  }
  ff.stdin.end();
  await closed;
  console.log('wrote', name);
}
await browser.close();
