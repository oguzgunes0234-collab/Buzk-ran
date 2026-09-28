// v4 check of the "lost cage" bug: after any first shot (every ammo type in the
// level, 2-degree grid), no unbroken cage or standing totem may end outside
// the platform where the player can no longer reach it.
import { initPhysics, Sim, INPUT, arenaOf, AMMO_ORDER } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
await initPhysics();
const lim = INPUT['3d'];
let total = 0, totalLost = 0;
for (const lv of LEVELS) {
  const ar = arenaOf(lv);
  const types = AMMO_ORDER.filter((t) => lv.ammo.includes(t));
  let shots = 0, fell = 0, lost = 0, lostTotem = 0;
  for (const type of types) for (let a = lim.a.min; a <= lim.a.max; a += 20) for (let b = lim.b.min; b <= lim.b.max; b += 20) {
    const sim = new Sim(lv, '3d', { fx: false });
    sim.fire(a, b, type);
    const count = () => { for (const f of sim.pendingFx) if (f.type === 'break' && f.fell) fell++; sim.pendingFx.length = 0; };
    while (sim.tick()) count();
    count();
    const off = (t) => Math.abs(t.x) > ar.xHalf || t.z > ar.zMax || t.z < ar.zMin;
    for (const c of sim.cages) if (c.alive && !c.broken && off(c.body.translation())) lost++;
    for (const t of sim.totems) if (t.alive && !t.down && off(t.body.translation())) lostTotem++;
    shots++;
    sim.free();
  }
  total += shots; totalLost += lost + lostTotem;
  console.log('B' + lv.id, 'atis', shots, '| kenardan dusup kirilan kafes', fell, '| kirilmadan disarida kalan kafes', lost, '| ayakta disarida totem', lostTotem);
}
console.log('TOPLAM atis', total, 'kayip hedef', totalLost);
