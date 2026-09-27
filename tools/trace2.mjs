import { initPhysics, Sim } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
await initPhysics();
const [id, mode, a, b] = process.argv.slice(2);
const lv = LEVELS[Number(id) - 1];
const sim = new Sim(lv, mode, { fx: true });
const c0 = sim.cages[0];
console.log('cage0 handle', c0.body.handle, 'start', JSON.stringify(c0.body.translation()));
sim.fire(Number(a), Number(b));
const ballEntry = sim.ball;
console.log('ball handle', ballEntry.body.handle);
while (sim.phase === 'flight') {
  sim.tick();
  for (const f of sim.pendingFx) if (f.type !== 'impact') console.log('step', sim.step, JSON.stringify(f));
  sim.pendingFx.length = 0;
  if (sim.step % 20 === 0 && c0.alive) { const t = c0.body.translation(); console.log('step', sim.step, 'cage0 z', t.z.toFixed(2), 'y', t.y.toFixed(2)); }
}
console.log('end phase', sim.phase, 'cage0 alive', c0.alive, 'broken', c0.broken, 'pos', JSON.stringify(c0.body.translation()), 'handle', c0.body.handle);
