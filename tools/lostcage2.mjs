import { initPhysics, Sim, INPUT, arenaOf, CAGE_SIZE } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
await initPhysics();
const GRID = { '3d': [20, 20], '25d': [20, 6] };
for (const id of [2, 3, 8]) {
  const lv = LEVELS[id - 1];
  const ar = arenaOf(lv);
  const mode = '25d';
  const lim = INPUT[mode];
  const samples = [];
  for (let a = lim.a.min; a <= lim.a.max; a += GRID[mode][0]) for (let b = lim.b.min; b <= lim.b.max; b += GRID[mode][1]) {
    const sim = new Sim(lv, mode, { fx: false });
    sim.runShot(a, b);
    for (const c of sim.cages) {
      if (c.broken || !c.alive) continue;
      const t = c.body.translation();
      if (Math.abs(t.x) > ar.xHalf || t.z > ar.zMax || t.z < ar.zMin || t.y < -0.1) samples.push({ a, b, y: +t.y.toFixed(2), zOverEdge: +(t.z - ar.zMax).toFixed(2), phase: sim.phase });
    }
    sim.free();
  }
  console.log('B' + id, 'edge z', ar.zMax.toFixed(2), JSON.stringify(samples.slice(0, 6)), 'count', samples.length, 'max overhang', Math.max(...samples.map((s) => s.zOverEdge)));
}
