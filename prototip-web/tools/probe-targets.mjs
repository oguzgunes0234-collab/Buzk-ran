// Design probe: for one level, per ammo type, how many first shots break each
// target (and how many break the nest). 2-degree grid, single thread.
import path from 'node:path';
import { initPhysics, Sim, INPUT, AMMO_ORDER } from '../src/sim.js';
await initPhysics();
const [file, idArg, step = '20'] = process.argv.slice(2);
const { LEVELS } = await import('file://' + path.resolve(file));
const lv = LEVELS.find((l) => l.id === Number(idArg));
const lim = INPUT['3d'];
const S = Number(step);
for (const t of AMMO_ORDER.filter((x) => lv.ammo.includes(x))) {
  const cage = (lv.cages || []).map(() => 0), totem = (lv.totems || []).map(() => 0);
  let nest = 0, n = 0, cleanBest = null;
  for (let a = lim.a.min; a <= lim.a.max; a += S) for (let b = lim.b.min; b <= lim.b.max; b += S) {
    const sim = new Sim(lv, '3d', { fx: false });
    sim.runShot(a, b, t);
    const nb = sim.nestsBroken() > 0;
    if (nb) nest++;
    else {
      sim.cages.forEach((c, i) => { if (c.broken) cage[i]++; });
      sim.totems.forEach((c, i) => { if (c.down) totem[i]++; });
    }
    n++; sim.free();
  }
  console.log(t.padEnd(6), 'atis', n, '| kafes (yuva saglam):', cage.join(' '), '| totem:', totem.join(' '), '| yuva kirilan:', nest);
}
