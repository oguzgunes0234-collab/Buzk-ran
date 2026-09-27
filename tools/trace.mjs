import { initPhysics, Sim } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
await initPhysics();
const [id, mode, a, b] = process.argv.slice(2);
const lv = LEVELS[Number(id) - 1];
const sim = new Sim(lv, mode, { fx: true });
sim.fire(Number(a), Number(b));
let lastPrint = -1;
while (sim.phase === 'flight') {
  sim.tick();
  const rows = [];
  for (const e of sim.bodies) {
    if (!e.alive || e.fixed) continue;
    const v = e.body.linvel(), t = e.body.translation();
    const sp = Math.hypot(v.x, v.y, v.z);
    rows.push({ k: e.kind[0] + e.id, z: t.z.toFixed(2), y: t.y.toFixed(2), v: sp.toFixed(1) });
  }
  const fast = rows.filter((r) => r.k[0] !== 'b' && Number(r.v) > 6);
  const impacts = sim.pendingFx.filter((f) => f.type === 'impact' && f.force > 800).map((f) => f.kinds.join('-') + ':' + f.force.toFixed(0));
  if (fast.length || impacts.length) console.log('step', sim.step, 'fast', JSON.stringify(fast), 'bigForce', impacts.join(','));
  sim.pendingFx.length = 0;
  if (sim.step > 600) break;
}
const ball = sim.bodies.find((e) => e.kind === 'ball');
for (const c of sim.cages) if (c.alive) { const t = c.body.translation(); console.log('cage', c.cageIndex, 'final z', t.z.toFixed(2), 'y', t.y.toFixed(2)); }
