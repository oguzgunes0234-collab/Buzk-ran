// Cross-device consistency self-test.
// Replays recorded NUMERIC shot inputs (not touch gestures) and compares the
// initial state, the step at which each shot fired, checkpoint hashes and the
// final state against reference values recorded on desktop.
import { replay } from './sim.js';
import { LEVELS } from './levels.js';
import { REFERENCE } from './reference.js';

function compare(exp, got) {
  if (exp.initial !== got.initial) return 'başlangıç durumu farklı';
  if (exp.ready !== got.ready) return 'yerleşme sonrası durum farklı';
  if (JSON.stringify(exp.shotSteps) !== JSON.stringify(got.shotSteps)) return 'atış adımları farklı';
  if (exp.checkpoints.length !== got.checkpoints.length) return 'ara durum sayısı farklı';
  for (let i = 0; i < exp.checkpoints.length; i++) {
    if (exp.checkpoints[i][0] !== got.checkpoints[i][0] || exp.checkpoints[i][1] !== got.checkpoints[i][1]) {
      return 'adım ' + exp.checkpoints[i][0] + ' sonrasında ayrıştı';
    }
  }
  if (exp.finalStep !== got.finalStep) return 'toplam adım sayısı farklı';
  if (exp.final !== got.final) return 'son durum farklı';
  return null;
}

export function runSelfTest(onProgress) {
  return new Promise((resolve) => {
    const cases = REFERENCE.cases;
    const results = [];
    let i = 0;
    const next = () => {
      if (i >= cases.length) {
        resolve({ total: cases.length, passed: results.filter((r) => r.ok).length, results, reference: REFERENCE.meta });
        return;
      }
      const c = cases[i++];
      const level = LEVELS.find((l) => l.id === c.level);
      const t0 = performance.now();
      let got, err;
      try { got = replay(level, c.mode, c.shots, REFERENCE.meta.checkpointEvery); } catch (e) { err = String(e); }
      const mismatch = err || compare(c.expect, got);
      results.push({ name: c.name, ok: !mismatch, mismatch, ms: Math.round(performance.now() - t0), steps: got ? got.finalStep : 0 });
      if (onProgress) onProgress(i, cases.length);
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  });
}
