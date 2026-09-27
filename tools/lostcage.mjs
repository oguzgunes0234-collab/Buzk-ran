// Checks the reported bug: can a cage end a shot unbroken but off the platform
// (i.e. lost, unreachable)? Scans every first shot in the bot grid.
import { initPhysics, Sim, INPUT, arenaOf } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
await initPhysics();
const GRID = { '3d': [20, 20], '25d': [20, 6] };
for (const lv of LEVELS) {
  const ar = arenaOf(lv);
  for (const mode of ['3d', '25d']) {
    const lim = INPUT[mode];
    let shots = 0, fell = 0, lost = 0;
    for (let a = lim.a.min; a <= lim.a.max; a += GRID[mode][0]) for (let b = lim.b.min; b <= lim.b.max; b += GRID[mode][1]) {
      const sim = new Sim(lv, mode, { fx: false });
      sim.fire(a, b);
      while (sim.tick()) { for (const f of sim.pendingFx) if (f.type === 'break' && f.fell) fell++; sim.pendingFx.length = 0; }
      for (const f of sim.pendingFx) if (f.type === 'break' && f.fell) fell++;
      for (const c of sim.cages) {
        if (c.broken || !c.alive) continue;
        const t = c.body.translation();
        if (Math.abs(t.x) > ar.xHalf || t.z > ar.zMax || t.z < ar.zMin || t.y < -0.1) lost++;
      }
      shots++;
      sim.free();
    }
    console.log('B' + lv.id, mode.padEnd(3), 'atis', shots, '| kenardan dusup kirilan kafes', fell, '| kirilmadan platform disinda kalan kafes', lost);
  }
}
