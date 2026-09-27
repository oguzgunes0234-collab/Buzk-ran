// Design probe: how hard is a stone totem to tip with each ammo type?
import { initPhysics, Sim, INPUT, TOTEM_MATS } from '../src/sim.js';
await initPhysics();
const lim = INPUT['3d'];
const PW = Number(process.argv[4] || 1.2);
const mk = (ped) => ({ id: 99, name: 'probe', speed: 14, ammo: ['normal', 'heavy', 'ember'],
  statics: ped > 0 ? [{ x: 0, y: ped / 2, z: 5, w: PW, h: ped, d: PW }] : [],
  totems: [{ x: 0, y: ped + 0.65 + 0.002, z: 5, mat: 'stone' }] });
for (const dens of (process.argv[2] || '3,6,9,12').split(',').map(Number)) {
  TOTEM_MATS.stone.density = dens;
  for (const ped of (process.argv[3] || '0.5').split(',').map(Number)) {
    const lv = mk(ped);
    const res = {};
    for (const t of ['normal', 'heavy', 'ember']) {
      let win = 0, n = 0;
      for (let a = lim.a.min; a <= lim.a.max; a += 20) for (let b = lim.b.min; b <= lim.b.max; b += 20) {
        const sim = new Sim(lv, '3d', { fx: false });
        sim.runShot(a, b, t);
        if (sim.totemsLeft() === 0) win++;
        n++; sim.free();
      }
      res[t] = (100 * win / n).toFixed(1) + '% (' + win + ')';
    }
    console.log('yogunluk', dens, 'kaide', ped, JSON.stringify(res));
  }
}
