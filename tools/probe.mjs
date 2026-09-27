import { initPhysics, Sim, PARAMS } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
await initPhysics();
for (const lv of LEVELS) {
  for (const mode of ['3d', '25d']) {
    const t0 = performance.now();
    const sim = new Sim(lv, mode);
    const t1 = performance.now();
    // check structure moved during settle? compare ready vs initial poses
    const cagesOk = sim.cagesLeft() === lv.cages.length;
    // a straight shot at the first cage-ish
    let steps = 0; const t2 = performance.now();
    if (mode === '3d') sim.runShot(0, 200); else sim.runShot(250, 70);
    const t3 = performance.now();
    console.log(lv.id, mode, 'dyn', sim.dynamicCount(), 'cagesIntact', cagesOk, 'build+settle ms', (t1-t0).toFixed(1), 'shot steps', sim.step - 60, 'ms', (t3-t2).toFixed(1), 'ms/step', ((t3-t2)/(sim.step-60)).toFixed(3), 'phase', sim.phase, 'cagesLeft', sim.cagesLeft());
    sim.free();
  }
}
