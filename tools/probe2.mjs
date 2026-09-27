import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { initPhysics, Sim, PARAMS } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
await initPhysics();
// monkeypatch: log all cage-related force events
const orig = Sim.prototype._stepPhysics;
for (const [lvId, mode, a, b] of [[6,'3d',0,200],[4,'3d',0,200],[5,'3d',0,200],[2,'3d',0,200]]) {
  const lv = LEVELS[lvId-1];
  const sim = new Sim(lv, mode);
  sim.fire(a, b);
  let maxByPair = {};
  while (sim.phase === 'flight') {
    sim.world.step(sim.events); sim.step++; sim.flightSteps++;
    sim.events.drainContactForceEvents(ev => {
      const e1 = sim.colliderInfo.get(ev.collider1()), e2 = sim.colliderInfo.get(ev.collider2());
      const k = [e1?.kind, e2?.kind].sort().join('-');
      const f = ev.totalForceMagnitude();
      if (!maxByPair[k] || maxByPair[k][0] < f) maxByPair[k] = [f.toFixed(1), sim.step];
    });
    if (sim.flightSteps > 300) break;
  }
  console.log('L'+lvId, mode, JSON.stringify(maxByPair));
  // ball trajectory check: where is ball at impact
  sim.free();
}
