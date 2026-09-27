import { initPhysics, Sim, DT, INPUT, AMMO, AMMO_ORDER, launchVelocity, previewPath } from './sim.js';
import { LEVELS } from './levels.js';
import { View } from './render.js';
import { Sfx, vibrate } from './audio.js';
import { runSelfTest } from './selftest.js';

const $ = (id) => document.getElementById(id);
const MODE = '3d';
const HINT = 'Basılı tutup sürükle: sağ-sol yön, yukarı-aşağı yükseklik. Bırakınca atar.';
const PREVIEW_STEPS = 220; // path is cut at the first predicted contact
const CRITERIA = [
  ['okunabilirlik', 'Okunabilirlik', 'Sahnede ne olduğunu bir bakışta anladım'],
  ['nisan', 'Nişan hissi', 'Atışımı kontrol ettiğimi hissettim'],
  ['yikim', 'Yıkım tatmini', 'Yıkım, kırılma ve patlama tatmin ediciydi'],
  ['mermi', 'Mermi seçimi', 'Mermi seçimi atış planımı değiştirdi'],
  ['hedef', 'Hedef çeşitliliği', 'Devirme ve koruma hedefleri bölümleri farklılaştırdı'],
  ['kural', 'Anlaşılırlık', 'Yeni kurallar kafamı karıştırmadı'],
  ['neden', 'Kaybın nedeni', 'Kaybettiğimde nedenini anladım (şans gibi gelmedi)'],
  ['birdaha', 'Bir tane daha', 'Bir bölüm daha oynamak istedim'],
];

const state = {
  screen: 'loading',
  tour: null, // {order:[levelId], idx}
  sim: null,
  level: null,
  prevPoses: null,
  currPoses: null,
  acc: 0,
  aim: { a: 0, b: 200 },
  ammoSel: 'normal',
  drag: null,
  play: null,
  log: [],
  frames: [],
  ratings: {},
  selftest: null,
  manualClock: false,
  resultTimer: 0,
};

let view, sfx;

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  state.screen = id;
  const playing = id === 'scrPlay';
  $('hud').hidden = !playing;
  $('ammoBar').hidden = !playing;
}

function buildTour() {
  return { order: LEVELS.map((l) => l.id), idx: 0 };
}

function firstAmmo(sim) {
  if (sim.ammo.normal > 0) return 'normal';
  return AMMO_ORDER.find((t) => sim.ammo[t] > 0) || 'normal';
}

function startLevel(levelId, isRetry = false) {
  if (state.sim) state.sim.free();
  const level = LEVELS.find((l) => l.id === levelId);
  state.level = level;
  state.sim = new Sim(level, MODE, { fx: true });
  state.currPoses = state.sim.poses();
  state.prevPoses = null;
  state.acc = 0;
  state.drag = null;
  drawDrag();
  if (!isRetry) state.aim = { a: 0, b: 200 };
  state.ammoSel = firstAmmo(state.sim);
  view.setTargetMaps({
    cages: state.sim.cages.map((c) => c.id),
    totems: state.sim.totems.map((t) => t.id),
    nests: state.sim.nests.map((n) => n.id),
  });
  view.loadLevel(level, MODE, state.currPoses);
  if (isRetry && state.play) {
    state.play.attempts++;
  } else {
    state.play = { level: levelId, attempts: 1, t0: performance.now(), shots: 0, ammoUsed: {}, tour: !!state.tour, measure: null };
    const m = view.measureTargets();
    state.play.measure = { visibleMin: m.length ? Math.min(...m.map((x) => x.visible)) : 1, pxMin: m.length ? Math.min(...m.map((x) => x.px)) : 0 };
  }
  show('scrPlay');
  $('hintText').hidden = false;
  updateHud();
  setAimPreview();
}

function goalChips() {
  const s = state.sim, lv = state.level, out = [];
  const nc = (lv.cages || []).length, nt = (lv.totems || []).length, nn = (lv.nests || []).length;
  if (nc) out.push('<span class="chip cage">Kafes ' + (nc - s.cagesLeft()) + '/' + nc + '</span>');
  if (nt) out.push('<span class="chip totem">Totem ' + (nt - s.totemsLeft()) + '/' + nt + '</span>');
  if (nn) out.push('<span class="chip nest' + (s.nestsBroken() ? ' bad' : '') + '">Yuva ' + (s.nestsBroken() ? 'kırıldı' : 'güvende') + '</span>');
  return out.join('');
}

function updateHud() {
  const s = state.sim;
  const lv = state.level;
  $('lvlName').textContent = lv.id + ' · ' + lv.name;
  $('goals').innerHTML = goalChips();
  $('hintText').textContent = lv.hint + ' ' + HINT;
  $('tourBar').textContent = state.tour ? 'Tur ' + (state.tour.idx + 1) + '/' + state.tour.order.length : 'Serbest oyun';
  renderAmmoBar();
}

function renderAmmoBar() {
  const s = state.sim;
  const bar = $('ammoBar');
  bar.innerHTML = '';
  for (const t of AMMO_ORDER) {
    if (!state.level.ammo.includes(t)) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'ammo-' + t;
    b.className = 'ammo ' + t + (state.ammoSel === t ? ' on' : '');
    b.disabled = s.ammo[t] <= 0 || s.phase !== 'aim';
    b.setAttribute('aria-pressed', state.ammoSel === t ? 'true' : 'false');
    b.innerHTML = '<i></i><span>' + AMMO[t].name + '</span><b>×' + s.ammo[t] + '</b>';
    b.addEventListener('click', () => selectAmmo(t));
    bar.appendChild(b);
  }
}

function selectAmmo(t) {
  if (!state.sim || state.sim.phase !== 'aim' || state.sim.ammo[t] <= 0) return;
  state.ammoSel = t;
  renderAmmoBar();
  setAimPreview();
}

function aimReadout(a, b) {
  return AMMO[state.ammoSel].name + ' · Yön ' + (a / 10).toFixed(1).replace('.', ',') + '° · Yükseklik ' + (b / 10).toFixed(1).replace('.', ',') + '°';
}

function setAimPreview() {
  const s = state.sim;
  const aiming = !!(s && s.phase === 'aim' && s.shotsLeft > 0);
  view.setLoaded(aiming, state.ammoSel);
  if (!aiming) { view.setAim(null); $('aimReadout').textContent = ''; return; }
  const { a, b } = state.aim;
  const v = launchVelocity(state.level, MODE, a, b, state.ammoSel);
  const blast = AMMO[state.ammoSel].blast;
  view.setAim(v, previewPath(state.level, MODE, a, b, PREVIEW_STEPS, state.ammoSel), blast ? blast.radius : 0);
  $('aimReadout').textContent = aimReadout(a, b);
}

// ---------- input ----------
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function onDown(e) {
  if (state.screen !== 'scrPlay' || !state.sim || state.sim.phase !== 'aim') return;
  sfx.unlock();
  e.preventDefault();
  $('hintText').hidden = true;
  view.canvas.setPointerCapture(e.pointerId);
  state.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), far: false, start: { ...state.aim } };
  drawDrag();
}

function onMove(e) {
  const d = state.drag;
  if (!d || d.id !== e.pointerId) return;
  d.x = e.clientX; d.y = e.clientY;
  const dx = d.x - d.x0, dy = d.y - d.y0;
  if (Math.hypot(dx, dy) > 30) d.far = true;
  const lim = INPUT[MODE];
  const k = 0.8; // tenths of a degree per CSS pixel
  state.aim = { a: clamp(Math.round(d.start.a + dx * k), lim.a.min, lim.a.max), b: clamp(Math.round(d.start.b - dy * k), lim.b.min, lim.b.max) };
  setAimPreview();
  drawDrag();
}

function onUp(e) {
  const d = state.drag;
  if (!d || d.id !== e.pointerId) return;
  state.drag = null;
  drawDrag();
  const dist = Math.hypot(d.x - d.x0, d.y - d.y0);
  const cancelled = d.far && dist < 14;
  const tooShort = performance.now() - d.t0 < 120 && dist < 8;
  if (cancelled) state.aim = d.start;
  if (!cancelled && !tooShort) fire(state.aim.a, state.aim.b);
  else setAimPreview();
}

function drawDrag() {
  const svg = $('dragLayer');
  const d = state.drag;
  if (!d || d.x0 === undefined) { svg.innerHTML = ''; return; }
  const col = 'rgba(27,42,65,0.55)';
  svg.innerHTML = '<circle cx="' + d.x0 + '" cy="' + d.y0 + '" r="14" fill="none" stroke="' + col + '" stroke-width="3"/>' +
    '<line x1="' + d.x0 + '" y1="' + d.y0 + '" x2="' + d.x + '" y2="' + d.y + '" stroke="' + col + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8"/>' +
    '<circle cx="' + d.x + '" cy="' + d.y + '" r="9" fill="' + col + '"/>';
}

function fire(a, b, t) {
  const type = t || state.ammoSel;
  if (!state.sim.fire(a, b, type)) return;
  state.play.shots++;
  state.play.ammoUsed[type] = (state.play.ammoUsed[type] || 0) + 1;
  if (state.sim.ammo[state.ammoSel] <= 0) state.ammoSel = firstAmmo(state.sim);
  state.prevPoses = state.currPoses;
  state.currPoses = state.sim.poses();
  view.setAim(null);
  $('aimReadout').textContent = '';
  updateHud();
}

// ---------- effects ----------
function handleFx() {
  const s = state.sim;
  for (const ev of s.pendingFx) {
    if (ev.type === 'fire') { sfx.fire(ev.ammo); vibrate(12); view.shake = Math.max(view.shake, 0.03); view.setLoaded(false); }
    else if (ev.type === 'impact') { view.onImpact(ev); sfx.impact(ev.force, ev.kinds.includes('static') || ev.kinds.includes('ground')); }
    else if (ev.type === 'break') { view.onBreak(ev); sfx.shatter(); sfx.rescue(); vibrate(35); updateHud(); }
    else if (ev.type === 'shatter') { view.onShatter(ev); sfx.shatter(0.6); }
    else if (ev.type === 'explode') { view.onExplode(ev); sfx.explode(); vibrate(45); }
    else if (ev.type === 'totem') { view.onTotem(ev); sfx.totem(); vibrate(25); updateHud(); }
    else if (ev.type === 'nest') { view.onNest(ev); sfx.crack(); vibrate([30, 30, 60]); updateHud(); }
    else if (ev.type === 'settled') {
      updateHud();
      if (ev.phase === 'won' || ev.phase === 'lost') {
        clearTimeout(state.resultTimer);
        state.resultTimer = setTimeout(() => showResult(ev.phase), ev.phase === 'won' ? 500 : 350);
      } else setAimPreview();
    }
  }
  s.pendingFx.length = 0;
}

function recordPlay(result) {
  const p = state.play;
  state.log.push({
    level: p.level, result, attempts: p.attempts, shots: p.shots, ammoUsed: { ...p.ammoUsed },
    seconds: Math.round((performance.now() - p.t0) / 100) / 10, tour: p.tour,
    visibleMin: p.measure.visibleMin, pxMin: p.measure.pxMin, failReason: state.sim.failReason,
  });
}

function remainingText() {
  const s = state.sim, parts = [];
  if (s.cagesLeft()) parts.push(s.cagesLeft() + ' kafes');
  if (s.totemsLeft()) parts.push(s.totemsLeft() + ' totem');
  return parts.join(', ');
}

function showResult(phase) {
  const won = phase === 'won';
  const s = state.sim;
  if (won) { sfx.win(); vibrate([20, 40, 20]); recordPlay('kazandı'); } else sfx.lose();
  const lv = state.level;
  const nestFail = !won && s.failReason === 'yuva';
  $('resTitle').textContent = won ? 'Başardın!' : nestFail ? 'Yuva kırıldı' : 'Atış hakkı bitti';
  $('resBody').textContent = won
    ? lv.name + ' · ' + state.play.attempts + '. denemede, toplam ' + state.play.shots + ' atış'
    : nestFail ? 'Yumurtalı yuvaya zarar geldi. Aynı düzeni tekrar deneyebilirsin.'
      : remainingText() + ' kaldı. Aynı düzeni tekrar deneyebilirsin.';
  const tour = state.tour;
  $('resRetry').hidden = won;
  $('resNext').textContent = tour ? (tour.idx + 1 < tour.order.length ? 'Sıradaki (' + (tour.idx + 2) + '/' + tour.order.length + ')' : 'Değerlendirmeye geç') : 'Bölümler';
  $('resNext').hidden = !won;
  $('resSkip').hidden = won || !tour;
  $('resLevels').hidden = !!tour || !won;
  $('resReplay').hidden = !won || !!tour;
  show('scrResult');
  $('hud').hidden = false;
}

function advanceTour() {
  const t = state.tour;
  t.idx++;
  if (t.idx >= t.order.length) { openRating(); return; }
  startLevel(t.order[t.idx]);
}

// ---------- summary & rating ----------
function pct(x) { return '%' + Math.round(x * 100); }

function stats() {
  const rows = state.log;
  const f = state.frames;
  let fps = null, low = null;
  if (f.length > 30) {
    const total = f.reduce((a, b) => a + b, 0);
    fps = Math.round((f.length / total) * 1000);
    const sorted = [...f].sort((a, b) => b - a);
    low = Math.round(1000 / sorted[Math.max(0, Math.floor(f.length * 0.01))]);
  }
  const avg = (k) => (rows.length ? rows.reduce((a, r) => a + r[k], 0) / rows.length : 0);
  return {
    plays: rows.length,
    wonFirst: rows.filter((r) => r.result === 'kazandı' && r.attempts === 1).length,
    skipped: rows.filter((r) => r.result === 'geçildi').length,
    attempts: avg('attempts'), shots: avg('shots'), fps, low,
    vis: avg('visibleMin'), visWorst: rows.length ? Math.min(...rows.map((r) => r.visibleMin)) : 0, px: avg('pxMin'),
  };
}

function summaryText() {
  const lines = [];
  lines.push('BUZKIRAN PROTOTİP ÖZETİ v4 (3D arkadan)');
  lines.push('Cihaz: ' + navigator.userAgent.replace(/\s+/g, ' ').slice(0, 140));
  lines.push('Ekran: ' + window.innerWidth + 'x' + window.innerHeight + ' CSS px, cihaz oranı ' + (window.devicePixelRatio || 1) + ', çizim oranı ' + view.dpr);
  const st = state.selftest;
  lines.push('Tutarlılık testi: ' + (st ? st.passed + '/' + st.total + ' eşleşti' + (st.passed < st.total ? ' — ilk fark: ' + st.results.find((r) => !r.ok).name + ' (' + st.results.find((r) => !r.ok).mismatch + ')' : '') : 'çalıştırılmadı'));
  const s = stats();
  lines.push('Genel: oynanan ' + s.plays + ', ilk denemede kazanılan ' + s.wonFirst + ', geçilen ' + s.skipped +
    ', ort. deneme ' + s.attempts.toFixed(1) + ', ort. toplam atış (tüm denemeler) ' + s.shots.toFixed(1) +
    ', fps ' + (s.fps ?? '-') + ' (%1 en düşük ' + (s.low ?? '-') + ')' +
    ', hedef görünürlüğü ort. ' + pct(s.vis) + ' (en kötü ' + pct(s.visWorst) + '), hedef boyutu ort. ' + Math.round(s.px) + ' px');
  lines.push('Puanlar (1-5):');
  for (const [k, name] of CRITERIA) lines.push('  ' + name + ': ' + (state.ratings[k] ?? '-'));
  lines.push('Bölüm ayrıntısı:');
  for (const r of state.log) {
    const used = Object.entries(r.ammoUsed).map(([t, n]) => AMMO[t].name + ' ' + n).join(', ') || '-';
    lines.push('  B' + r.level + ': ' + r.result + (r.failReason && r.result !== 'kazandı' ? ' (' + r.failReason + ')' : '') + ', ' + r.attempts + ' deneme, ' + r.shots + ' toplam atış [' + used + '], ' + r.seconds + ' sn, görünürlük ' + pct(r.visibleMin) + ', ' + Math.round(r.pxMin) + ' px');
  }
  return lines.join('\n');
}

function renderRatingForm() {
  const box = $('rateForm');
  box.innerHTML = '';
  for (const [k, name, desc] of CRITERIA) {
    const row = document.createElement('div');
    row.className = 'rate-row';
    row.innerHTML = '<div class="rate-label"><strong>' + name + '</strong><span>' + desc + '</span></div>';
    const g = document.createElement('div');
    g.className = 'rate-scale single';
    g.setAttribute('role', 'radiogroup');
    g.setAttribute('aria-label', name);
    for (let v = 1; v <= 5; v++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'r-' + k + '-' + v;
      b.textContent = v;
      b.className = state.ratings[k] === v ? 'on' : '';
      b.setAttribute('aria-pressed', state.ratings[k] === v ? 'true' : 'false');
      b.addEventListener('click', () => { state.ratings[k] = v; renderRatingForm(); refreshSummary(); });
      g.appendChild(b);
    }
    row.appendChild(g);
    box.appendChild(row);
  }
}

function refreshSummary() { $('summaryText').value = summaryText(); }

function openRating() {
  if (state.sim && state.sim.phase === 'flight') return;
  show('scrRate');
  renderRatingForm();
  refreshSummary();
  if (!state.selftest) {
    $('selftestStatus').textContent = 'Tutarlılık testi çalışıyor…';
    runSelfTest((i, n) => { $('selftestStatus').textContent = 'Tutarlılık testi çalışıyor… ' + i + '/' + n; }).then((r) => {
      state.selftest = r;
      $('selftestStatus').textContent = r.passed === r.total
        ? 'Tutarlılık testi: ' + r.passed + '/' + r.total + ' kayıt masaüstü sonucuyla birebir eşleşti.'
        : 'Tutarlılık testi: ' + r.passed + '/' + r.total + ' eşleşti. Fark ayrıntısı özet metninde.';
      refreshSummary();
    });
  }
}

// ---------- level list ----------
function renderLevels() {
  const box = $('levelGrid');
  box.innerHTML = '';
  for (const lv of LEVELS) {
    const row = document.createElement('div');
    row.className = 'lvl-row';
    const done = state.log.some((r) => r.level === lv.id && r.result === 'kazandı');
    row.innerHTML = '<span class="lvl-no">' + lv.id + '</span><span class="lvl-name">' + lv.name + '<small>' + lv.teaches + '</small></span>';
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'lv-' + lv.id;
    b.className = 'btn small' + (done ? ' done' : '');
    b.textContent = done ? 'Tekrar' : 'Oyna';
    b.addEventListener('click', () => { sfx.unlock(); state.tour = null; startLevel(lv.id); });
    row.appendChild(b);
    box.appendChild(row);
  }
}

// ---------- main loop ----------
let last = performance.now();
function step(dtReal) {
  const s = state.sim;
  if (state.screen === 'scrPlay' && s && !document.hidden) state.frames.push(dtReal * 1000);
  if (state.frames.length > 40000) state.frames.splice(0, 10000);
  if (s && s.phase === 'flight') {
    // real-time pacing only: no freeze frames or slow motion
    state.acc += Math.min(dtReal, 0.1);
    let n = 0;
    while (state.acc >= DT && s.phase === 'flight' && n < 5) {
      state.prevPoses = state.currPoses;
      s.tick();
      state.currPoses = s.poses();
      handleFx();
      state.acc -= DT;
      n++;
    }
    if (s.phase !== 'flight') { state.acc = 0; handleFx(); }
  }
  if (s) view.sync(state.prevPoses, state.currPoses, s.phase === 'flight' ? state.acc / DT : 1);
  view.render(dtReal);
}

function loop(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!state.manualClock) step(dt);
  requestAnimationFrame(loop);
}

function bindUi() {
  const c = view.canvas;
  c.addEventListener('pointerdown', onDown);
  c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', onUp);
  window.addEventListener('resize', () => view.resize());
  $('btnTour').addEventListener('click', () => { sfx.unlock(); state.tour = buildTour(); startLevel(state.tour.order[0]); });
  $('btnFree').addEventListener('click', () => { sfx.unlock(); renderLevels(); show('scrLevels'); });
  $('btnLevelsBack').addEventListener('click', () => show('scrStart'));
  $('btnRestart').addEventListener('click', () => { if (state.sim && state.sim.phase !== 'flight') startLevel(state.level.id, true); });
  $('btnMenu').addEventListener('click', () => { if (state.sim && state.sim.phase === 'flight') return; show('scrMenu'); });
  $('btnMute').addEventListener('click', () => { sfx.muted = !sfx.muted; $('btnMute').textContent = sfx.muted ? 'Ses kapalı' : 'Ses açık'; $('btnMute').setAttribute('aria-pressed', sfx.muted ? 'true' : 'false'); });
  $('menuResume').addEventListener('click', () => { show('scrPlay'); setAimPreview(); });
  $('menuLevels').addEventListener('click', () => { state.tour = null; renderLevels(); show('scrLevels'); });
  $('menuRate').addEventListener('click', () => openRating());
  $('menuStart').addEventListener('click', () => show('scrStart'));
  $('resRetry').addEventListener('click', () => startLevel(state.level.id, true));
  $('resReplay').addEventListener('click', () => startLevel(state.level.id));
  $('resNext').addEventListener('click', () => { if (state.tour) advanceTour(); else { renderLevels(); show('scrLevels'); } });
  $('resSkip').addEventListener('click', () => { recordPlay('geçildi'); advanceTour(); });
  $('resLevels').addEventListener('click', () => { renderLevels(); show('scrLevels'); });
  $('rateBack').addEventListener('click', () => show(state.sim ? 'scrMenu' : 'scrStart'));
  $('btnCopy').addEventListener('click', () => {
    const t = $('summaryText');
    const done = () => { $('btnCopy').textContent = 'Kopyalandı'; setTimeout(() => { $('btnCopy').textContent = 'Özeti kopyala'; }, 1600); };
    try {
      navigator.clipboard.writeText(t.value).then(done, () => { t.select(); $('btnCopy').textContent = 'Metni seçtim, kopyala'; });
    } catch (e) { t.select(); }
  });
}

async function boot() {
  try {
    view = new View($('view'));
  } catch (e) {
    $('errText').textContent = 'Bu tarayıcı 3D çizimi (WebGL) başlatamadı: ' + e.message;
    show('scrError');
    return;
  }
  sfx = new Sfx();
  bindUi();
  requestAnimationFrame(loop);
  try {
    await initPhysics();
  } catch (e) {
    $('errText').textContent = 'Fizik motoru (WebAssembly) yüklenemedi: ' + e.message;
    show('scrError');
    return;
  }
  // idle backdrop: the last level behind the start screen
  const lv = LEVELS[LEVELS.length - 1];
  const backdrop = new Sim(lv, MODE);
  view.setTargetMaps({ cages: backdrop.cages.map((c) => c.id), totems: backdrop.totems.map((t) => t.id), nests: backdrop.nests.map((n) => n.id) });
  view.loadLevel(lv, MODE, backdrop.poses());
  backdrop.free();
  show('scrStart');
}

// Test hooks used by the automated browser checks (not needed for play).
window.__buzkiran = {
  state,
  get view() { return view; },
  startLevel,
  startTour() { state.tour = buildTour(); startLevel(state.tour.order[0]); },
  fire,
  selectAmmo,
  // show an aim for screenshots/videos (numeric input, same as a player's drag result)
  previewAim(a, b, t) { state.aim = { a, b }; if (t) state.ammoSel = t; renderAmmoBar(); setAimPreview(); },
  clearDrag() { state.drag = null; drawDrag(); },
  advanceTour,
  openRating,
  setManualClock(v) { state.manualClock = v; },
  advance(dt, n = 1) { for (let i = 0; i < n; i++) step(dt); },
  measure: () => view.measureTargets(),
  summaryText,
  runSelfTest,
  // physics-only timing: fixed steps, no rendering
  bench(levelId, shots) {
    const level = LEVELS.find((l) => l.id === levelId);
    const t0 = performance.now();
    const sim = new Sim(level, MODE, { fx: true });
    const build = performance.now() - t0;
    const times = [];
    for (const sh of shots) {
      sim.fire(sh.a, sh.b, sh.t);
      while (sim.phase === 'flight') { const a = performance.now(); sim.tick(); sim.poses(); sim.pendingFx.length = 0; times.push(performance.now() - a); }
    }
    sim.free();
    times.sort((x, y) => x - y);
    const avg = times.reduce((x, y) => x + y, 0) / times.length;
    return { build: +build.toFixed(1), steps: times.length, avg: +avg.toFixed(3), p95: +times[Math.floor(times.length * 0.95)].toFixed(3), max: +times[times.length - 1].toFixed(3) };
  },
};

boot();
