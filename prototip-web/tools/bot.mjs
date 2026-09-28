// Test bot (v4, 3D camera): measures whether a level has a solution inside
// the scanned input grid (per ammo type) and how wide the winning input
// region is. It says nothing about whether a human finds the solution,
// understands it, or enjoys it.
//
// Usage: node tools/bot.mjs [levelId ...] [--out=file.json] [--need] [--coarse] [--levels=path]
//   --need    for each special ammo type (heavy, ember) replace it with normal
//             and search again: if no solution is found, that type is needed
//             (only within this search method; "not found" is not a proof)
//   --coarse  2-degree first-shot grid (for quick design probes)
//   --levels  load LEVELS from another module (design probes)
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const MODE = '3d';
const COARSE = process.argv.includes('--coarse');
const GRID = COARSE ? { aStep: 20, bStep: 20 } : { aStep: 10, bStep: 10 }; // yaw, pitch in 0.1 deg
const FOLLOWUP = { aStep: 20, bStep: 20 };  // coarser grid for later shots
const BEAM = 4;

async function simulateCell(level, prefix, a, b, t) {
  const { Sim } = await import('../src/sim.js');
  const sim = new Sim(level, MODE);
  for (const s of prefix) sim.runShot(s.a, s.b, s.t);
  if (sim.phase === 'aim') sim.runShot(a, b, t);
  const won = sim.phase === 'won';
  const failed = sim.nestsBroken() > 0;
  const progress = (level.cages || []).length - sim.cagesLeft() + (level.totems || []).length - sim.totemsLeft();
  sim.free();
  return [a, b, won ? 1 : 0, progress, failed ? 1 : 0];
}

if (!isMainThread) {
  const { initPhysics } = await import('../src/sim.js');
  await initPhysics();
  parentPort.on('message', async (job) => {
    const out = [];
    for (const [a, b] of job.cells) out.push(await simulateCell(job.level, job.prefix, a, b, job.t));
    parentPort.postMessage(out);
  });
} else {
  const { INPUT, AMMO_ORDER, PARAMS, MATERIALS, AMMO } = await import('../src/sim.js');
  const args = process.argv.slice(2);
  const lvArg = args.find((x) => x.startsWith('--levels='));
  const { LEVELS } = await import(lvArg ? new URL('file://' + (await import('node:path')).resolve(lvArg.slice(9))) : '../src/levels.js');
  const NEED = args.includes('--need');
  const ids = args.filter((x) => /^\d+$/.test(x)).map(Number);
  const outArg = args.find((x) => x.startsWith('--out='));
  const levels = ids.length ? LEVELS.filter((l) => ids.includes(l.id)) : LEVELS;
  const nW = Math.max(1, os.cpus().length);
  const workers = Array.from({ length: nW }, () => new Worker(new URL(import.meta.url)));
  const runJob = (w, job) => new Promise((res) => { w.once('message', res); w.postMessage(job); });
  const lim = INPUT[MODE];

  async function scan(level, prefix, grid, t) {
    const cells = [];
    for (let a = lim.a.min; a <= lim.a.max; a += grid.aStep) for (let b = lim.b.min; b <= lim.b.max; b += grid.bStep) cells.push([a, b]);
    const chunks = Array.from({ length: nW }, () => []);
    cells.forEach((c, i) => chunks[i % nW].push(c));
    return (await Promise.all(chunks.map((ch, i) => runJob(workers[i], { level, prefix, cells: ch, t })))).flat();
  }

  function analyse(results, grid) {
    const key = (a, b) => a + ',' + b;
    const map = new Map(results.map((r) => [key(r[0], r[1]), r]));
    const wins = results.filter((r) => r[2]);
    const N4 = [[grid.aStep, 0], [-grid.aStep, 0], [0, grid.bStep], [0, -grid.bStep]];
    const seen = new Set();
    let best = [];
    for (const w of wins) {
      if (seen.has(key(w[0], w[1]))) continue;
      const comp = [], stack = [w];
      seen.add(key(w[0], w[1]));
      while (stack.length) {
        const c = stack.pop();
        comp.push(c);
        for (const [da, db] of N4) {
          const n = map.get(key(c[0] + da, c[1] + db));
          if (n && n[2] && !seen.has(key(n[0], n[1]))) { seen.add(key(n[0], n[1])); stack.push(n); }
        }
      }
      if (comp.length > best.length) best = comp;
    }
    const robustSet = new Set();
    for (const w of wins) if (N4.every(([da, db]) => { const n = map.get(key(w[0] + da, w[1] + db)); return n && n[2]; })) robustSet.add(key(w[0], w[1]));
    let sample = null;
    if (best.length) {
      const ca = best.reduce((s, c) => s + c[0], 0) / best.length, cb = best.reduce((s, c) => s + c[1], 0) / best.length;
      const pool = best.filter((c) => robustSet.has(key(c[0], c[1])));
      const cand = (pool.length ? pool : best).slice().sort((x, y) => ((x[0] - ca) / grid.aStep) ** 2 + ((x[1] - cb) / grid.bStep) ** 2 - (((y[0] - ca) / grid.aStep) ** 2 + ((y[1] - cb) / grid.bStep) ** 2));
      sample = { a: cand[0][0], b: cand[0][1], robust: robustSet.has(key(cand[0][0], cand[0][1])) };
    }
    return {
      cells: results.length, winCells: wins.length, winRatio: results.length ? wins.length / results.length : 0,
      largestRegionCells: best.length, robustWinCells: robustSet.size, sample,
      nestBrokenCells: results.filter((r) => r[4]).length,
      maxProgress: Math.max(0, ...results.map((r) => r[3])),
    };
  }

  const report = {
    generated: new Date().toISOString(), mode: MODE, params: { ...PARAMS }, materials: MATERIALS, ammo: AMMO,
    method: {
      note: 'Oran yalnizca taranan sinirlar ve adim buyuklugu icindeki atislari kapsar. Oyuncunun cozumu bulacagini veya bolumun eglenceli oldugunu gostermez. Adimlar arasinda kalan dar cozumler bulunamayabilir.',
      bounds: { yaw: [lim.a.min / 10, lim.a.max / 10], pitch: [lim.b.min / 10, lim.b.max / 10] }, grid: GRID, followup: FOLLOWUP, beam: BEAM,
      need: NEED ? 'Ozel mermi normal Gulle ile degistirilip ayni arama tekrarlandi. "Gerekli" = bu aramada o mermi olmadan cozum bulunamadi; imkansizlik kaniti degildir.' : undefined,
    },
    levels: [],
  };

  async function solve(level) {
    const counts = {};
    for (const t of level.ammo) counts[t] = (counts[t] || 0) + 1;
    const types = AMMO_ORDER.filter((t) => counts[t]);
    const first = {};
    const byType = {};
    for (const t of types) { first[t] = await scan(level, [], GRID, t); byType[t] = analyse(first[t], GRID); }
    const entry = { level: level.id, name: level.name, ammo: level.ammo, oneShot: byType, solution: null };
    const oneShotType = types.slice().sort((x, y) => byType[y].winCells - byType[x].winCells).find((t) => byType[t].winCells > 0);
    if (oneShotType) {
      entry.solution = { shots: 1, sequence: [{ t: oneShotType, a: byType[oneShotType].sample.a, b: byType[oneShotType].sample.b }], robust: byType[oneShotType].sample.robust };
    } else {
      // beam search over shot sequences and ammo choices
      let beam = [];
      for (const t of types) first[t].filter((r) => r[3] > 0 && !r[4]).forEach((r) => beam.push({ seq: [{ t, a: r[0], b: r[1] }], p: r[3] }));
      beam.sort((x, y) => y.p - x.p);
      beam = beam.slice(0, BEAM);
      for (let shot = 2; shot <= level.ammo.length && beam.length && !entry.solution; shot++) {
        const next = [];
        for (const cand of beam) {
          const left = { ...counts };
          for (const s of cand.seq) left[s.t]--;
          for (const t of types.filter((x) => left[x] > 0)) {
            const res = await scan(level, cand.seq, FOLLOWUP, t);
            const an = analyse(res, FOLLOWUP);
            if (an.winCells > 0) { entry.solution = { shots: shot, sequence: [...cand.seq, { t, a: an.sample.a, b: an.sample.b }], robust: an.sample.robust, lastShotWinRatio: an.winRatio }; break; }
            res.filter((r) => r[3] > cand.p && !r[4]).sort((x, y) => y[3] - x[3]).slice(0, 2).forEach((r) => next.push({ seq: [...cand.seq, { t, a: r[0], b: r[1] }], p: r[3] }));
          }
          if (entry.solution) break;
        }
        beam = next.sort((x, y) => y.p - x.p).slice(0, BEAM);
      }
      if (!entry.solution) entry.solution = { shots: null, note: 'Bu arama yontemi ve cozunurlukte cozum bulunamadi.' };
    }
    return { entry, types, byType };
  }

  for (const level of levels) {
    const t0 = Date.now();
    const { entry, types, byType } = await solve(level);
    if (NEED) {
      entry.need = {};
      for (const t of types.filter((x) => x !== 'normal')) {
        const alt = { ...level, ammo: level.ammo.map((x) => (x === t ? 'normal' : x)) };
        const r = await solve(alt);
        entry.need[t] = { needed: r.entry.solution.shots == null, withoutIt: r.entry.solution };
      }
    }
    entry.seconds = (Date.now() - t0) / 1000;
    report.levels.push(entry);
    const parts = types.map((t) => `${t} %${(byType[t].winRatio * 100).toFixed(1)} (bolge ${byType[t].largestRegionCells}, saglam ${byType[t].robustWinCells}${byType[t].nestBrokenCells ? ', yuva kirilan ' + byType[t].nestBrokenCells : ''})`);
    const need = entry.need ? ' || gerekli mi: ' + Object.entries(entry.need).map(([t, n]) => `${t} ${n.needed ? 'EVET' : 'hayir (' + JSON.stringify(n.withoutIt.sequence) + ')'}`).join(', ') : '';
    console.log(`B${level.id} ${level.name.padEnd(14)} ${parts.join(' | ')} || cozum: ${entry.solution.shots ?? 'YOK'} atis ${entry.solution.sequence ? JSON.stringify(entry.solution.sequence) : ''}${need} (${entry.seconds}s)`);
  }
  if (outArg) writeFileSync(outArg.slice(6), JSON.stringify(report, null, 2));
  await Promise.all(workers.map((w) => w.terminate()));
}
