// Test bot: measures whether a level has a solution inside the scanned input
// grid and how wide the winning input region is. It says nothing about
// whether a human finds the solution, understands it, or enjoys it.
//
// Usage: node tools/bot.mjs [levelId ...] [--modes=3d,25d] [--out=file.json]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const GRID = {
  '3d': { aStep: 10, bStep: 10 },   // 1.0 deg yaw, 1.0 deg pitch
  '25d': { aStep: 10, bStep: 3 },   // 1.0 deg angle, 3 % power
};
const FOLLOWUP_GRID = {
  '3d': { aStep: 20, bStep: 20 },   // coarser grid for 2nd/3rd shots
  '25d': { aStep: 20, bStep: 6 },
};
const BEAM = 4;

async function simulateCell(level, mode, prefix, a, b) {
  const { Sim } = await import('../src/sim.js');
  const sim = new Sim(level, mode);
  for (const s of prefix) sim.runShot(s.a, s.b);
  let res;
  if (sim.phase !== 'aim') {
    res = { won: sim.phase === 'won', broken: level.cages.length - sim.cagesLeft() };
  } else {
    sim.runShot(a, b);
    res = { won: sim.cagesLeft() === 0, broken: level.cages.length - sim.cagesLeft(), steps: sim.step };
  }
  sim.free();
  return res;
}

if (!isMainThread) {
  const { initPhysics, PARAMS } = await import('../src/sim.js');
  await initPhysics();
  parentPort.on('message', async (job) => {
    if (job.params) Object.assign(PARAMS, job.params);
    const out = [];
    for (const cell of job.cells) {
      const r = await simulateCell(job.level, job.mode, job.prefix, cell[0], cell[1]);
      out.push([cell[0], cell[1], r.won ? 1 : 0, r.broken]);
    }
    parentPort.postMessage(out);
  });
} else {
  const { INPUT } = await import('../src/sim.js');
  const { LEVELS } = await import('../src/levels.js');
  const args = process.argv.slice(2);
  const ids = args.filter((x) => /^\d+$/.test(x)).map(Number);
  const modesArg = args.find((x) => x.startsWith('--modes='));
  const outArg = args.find((x) => x.startsWith('--out='));
  const modes = modesArg ? modesArg.slice(8).split(',') : ['3d', '25d'];
  const paramOverrides = {};
  for (const x of args.filter((x) => x.startsWith('--param='))) { const [k, v] = x.slice(8).split('='); paramOverrides[k] = Number(v); }
  const { PARAMS } = await import('../src/sim.js');
  Object.assign(PARAMS, paramOverrides);
  const levels = ids.length ? LEVELS.filter((l) => ids.includes(l.id)) : LEVELS;

  const nWorkers = Math.max(1, os.cpus().length);
  const workers = Array.from({ length: nWorkers }, () => new Worker(new URL(import.meta.url)));
  const runJob = (w, job) => new Promise((res) => { w.once('message', res); w.postMessage(job); });

  async function scan(level, mode, prefix, grid) {
    const lim = INPUT[mode];
    const cells = [];
    for (let a = lim.a.min; a <= lim.a.max; a += grid.aStep)
      for (let b = lim.b.min; b <= lim.b.max; b += grid.bStep) cells.push([a, b]);
    const chunks = Array.from({ length: nWorkers }, () => []);
    cells.forEach((c, i) => chunks[i % nWorkers].push(c));
    const parts = await Promise.all(chunks.map((ch, i) => runJob(workers[i], { level, mode, prefix, cells: ch, params: paramOverrides })));
    return parts.flat();
  }

  function analyse(results, mode, grid) {
    const lim = INPUT[mode];
    const key = (a, b) => a + ',' + b;
    const map = new Map(results.map((r) => [key(r[0], r[1]), r]));
    const wins = results.filter((r) => r[2]);
    // largest 4-connected winning region
    const seen = new Set();
    let best = [];
    for (const w of wins) {
      const k = key(w[0], w[1]);
      if (seen.has(k)) continue;
      const comp = [];
      const stack = [w];
      seen.add(k);
      while (stack.length) {
        const c = stack.pop();
        comp.push(c);
        for (const [da, db] of [[grid.aStep, 0], [-grid.aStep, 0], [0, grid.bStep], [0, -grid.bStep]]) {
          const n = map.get(key(c[0] + da, c[1] + db));
          if (n && n[2] && !seen.has(key(n[0], n[1]))) { seen.add(key(n[0], n[1])); stack.push(n); }
        }
      }
      if (comp.length > best.length) best = comp;
    }
    // robustness: winning cells whose 4 neighbours also win
    let robust = 0;
    const robustSet = new Set();
    for (const w of wins) {
      let ok = true;
      for (const [da, db] of [[grid.aStep, 0], [-grid.aStep, 0], [0, grid.bStep], [0, -grid.bStep]]) {
        const n = map.get(key(w[0] + da, w[1] + db));
        if (!n || !n[2]) { ok = false; break; }
      }
      if (ok) { robust++; robustSet.add(key(w[0], w[1])); }
    }
    // a representative winning input: robust cell of the largest region closest to its centre
    let sample = null;
    if (best.length) {
      const ca = best.reduce((s, c) => s + c[0], 0) / best.length;
      const cb = best.reduce((s, c) => s + c[1], 0) / best.length;
      const pool = best.filter((c) => robustSet.has(key(c[0], c[1])));
      const cand = pool.length ? pool : best;
      cand.sort((x, y) => ((x[0] - ca) / grid.aStep) ** 2 + ((x[1] - cb) / grid.bStep) ** 2 - (((y[0] - ca) / grid.aStep) ** 2 + ((y[1] - cb) / grid.bStep) ** 2));
      sample = { a: cand[0][0], b: cand[0][1], robust: robustSet.has(key(cand[0][0], cand[0][1])) };
    }
    const ext = best.length
      ? { aMin: Math.min(...best.map((c) => c[0])), aMax: Math.max(...best.map((c) => c[0])), bMin: Math.min(...best.map((c) => c[1])), bMax: Math.max(...best.map((c) => c[1])) }
      : null;
    const maxBroken = Math.max(0, ...results.map((r) => r[3]));
    return {
      cells: results.length,
      winCells: wins.length,
      winRatio: results.length ? wins.length / results.length : 0,
      largestRegionCells: best.length,
      largestRegionExtent: ext,
      robustWinCells: robust,
      sample,
      maxCagesBrokenOneShot: maxBroken,
      bounds: { a: [lim.a.min, lim.a.max], b: [lim.b.min, lim.b.max], aUnit: lim.a.unit, bUnit: lim.b.unit },
      step: { a: grid.aStep, b: grid.bStep },
    };
  }

  const report = { generated: new Date().toISOString(), params: { ...PARAMS }, method: {
    note: 'Oran yalnizca taranan sinirlar ve adim buyuklugu icindeki atislari kapsar. Oyuncunun cozumu bulacagini veya bolumun eglenceli oldugunu gostermez. Adimlar arasinda kalan dar cozumler bulunamayabilir.',
    grid: GRID, followupGrid: FOLLOWUP_GRID, beam: BEAM,
  }, levels: [] };

  for (const level of levels) {
    for (const mode of modes) {
      const t0 = Date.now();
      const first = await scan(level, mode, [], GRID[mode]);
      const a1 = analyse(first, mode, GRID[mode]);
      const entry = { level: level.id, name: level.name, mode, shots: level.shots, oneShot: a1, multiShot: null };
      if ((a1.winCells === 0 || level.cages.length > 1) && level.shots > 1) {
        // beam search: keep the best partial results and scan the next shot
        let beam = first.filter((r) => r[3] > 0).sort((x, y) => y[3] - x[3]).slice(0, BEAM).map((r) => [{ a: r[0], b: r[1] }]);
        let found = null;
        for (let shot = 2; shot <= level.shots && beam.length && !found; shot++) {
          const next = [];
          for (const prefix of beam) {
            const res = await scan(level, mode, prefix, FOLLOWUP_GRID[mode]);
            const an = analyse(res, mode, FOLLOWUP_GRID[mode]);
            if (an.winCells > 0) { found = { shotsNeeded: shot, prefix, followup: an }; break; }
            res.filter((r) => r[3] > 0).sort((x, y) => y[3] - x[3]).slice(0, 2).forEach((r) => next.push([...prefix, { a: r[0], b: r[1] }]));
          }
          beam = next.slice(0, BEAM);
        }
        entry.multiShot = found || { shotsNeeded: null, note: 'Bu arama yontemi ve cozunurlukte cozum bulunamadi.' };
      }
      entry.seconds = (Date.now() - t0) / 1000;
      report.levels.push(entry);
      const o = entry.oneShot;
      console.log(`L${level.id} ${mode.padEnd(3)} tek-atis kazanma ${(o.winRatio * 100).toFixed(1)}% (${o.winCells}/${o.cells}), en genis bolge ${o.largestRegionCells} hucre, saglam ${o.robustWinCells}, max kafes ${o.maxCagesBrokenOneShot}/${level.cages.length}` + (entry.multiShot ? ` | cok-atis: ${entry.multiShot.shotsNeeded ?? 'yok'}` : '') + ` (${entry.seconds}s)`);
    }
  }
  if (outArg) writeFileSync(outArg.slice(6), JSON.stringify(report, null, 2));
  await Promise.all(workers.map((w) => w.terminate()));
}
