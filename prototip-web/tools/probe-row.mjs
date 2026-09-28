// Design probe: a row of 3 cages behind a low ice wall. How many cages does a
// single shot of each ammo type break? (2-degree grid)
import { initPhysics, Sim, INPUT, CAGE_SIZE } from '../src/sim.js';
await initPhysics();
const lim = INPUT['3d'];
const GAP = 0.002;
const wallH = Number(process.argv[3] || 0.9);
const mk = (sp, x = -1.8, z = 6) => ({ id: 98, name: 'row', speed: 14, ammo: ['normal', 'heavy', 'ember'],
  statics: [{ x, y: 0.3, z, w: 2 * sp + 1.0, h: 0.6, d: 1.2 }],
  blocks: wallH > 0 ? [{ x, y: wallH / 2 + GAP, z: z - 0.9, w: 2 * sp + 1.0, h: wallH, d: 0.3, mat: 'ice' }] : [],
  cages: [-1, 0, 1].map((k) => ({ x: x + k * sp, y: 0.6 + CAGE_SIZE / 2 + GAP, z })) });
for (const sp of (process.argv[2] || '0.95,1.05,1.15').split(',').map(Number)) {
  const lv = mk(sp);
  const out = {};
  for (const t of ['normal', 'heavy', 'ember']) {
    const hist = [0, 0, 0, 0];
    for (let a = lim.a.min; a <= lim.a.max; a += 20) for (let b = lim.b.min; b <= lim.b.max; b += 20) {
      const sim = new Sim(lv, '3d', { fx: false });
      sim.runShot(a, b, t);
      hist[3 - sim.cagesLeft()]++;
      sim.free();
    }
    out[t] = '1:' + hist[1] + ' 2:' + hist[2] + ' 3:' + hist[3];
  }
  console.log('aralik', sp, 'duvar', wallH, JSON.stringify(out));
}
