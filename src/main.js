import { initPhysics, Sim, DT, INPUT, launchVelocity, previewPath } from './sim.js';
import { LEVELS } from './levels.js';
import { View } from './render.js';
import { Sfx, vibrate } from './audio.js';
import { runSelfTest } from './selftest.js';

const $ = (id) => document.getElementById(id);
const MODE_NAME = { '3d': '3D arkadan', '25d': '2,5D yandan' };
const MODE_CONTROL = { '3d': 'yön / yükseklik', '25d': 'açı / güç' };
const HINT = {
  '3d': 'Basılı tutup sürükle: sağ-sol yön, yukarı-aşağı yükseklik. Bırakınca atar.',
  '25d': 'Sapan gibi geri çek: çekme yönü açı, çekme mesafesi güç. Bırakınca atar.',
};
const PREVIEW_STEPS = 200; // path is cut at the first predicted contact (same rule in both modes)
const CRITERIA = [
  ['okunabilirlik', 'Okunabilirlik', 'Sahnede ne olduğunu bir bakışta anladım'],
  ['nisan', 'Nişan hissi', 'Atışımı kontrol ettiğimi hissettim'],
  ['gorunurluk', 'Hedef görünürlüğü', 'Kafesleri rahatça gördüm'],
  ['yikim', 'Yıkım tatmini', 'Yıkım ve kırılma tatmin ediciydi'],
  ['neden', 'Kaybın nedeni', 'Kaybettiğimde nedenini anladım (şans gibi gelmedi)'],
  ['birdaha', 'Bir tane daha', 'Bir bölüm daha oynamak istedim'],
];

const state = {
  screen: 'loading',
  tour: null, // {order:[{level,mode}], idx}
  sim: null,
  level: null,
  mode: '3d',
  prevPoses: null,
  currPoses: null,
  acc: 0,
  aim3d: { a: 0, b: 200 },
  drag: null,
  play: null,
  log: [],
  frames: { '3d': [], '25d': [] },
  ratings: { '3d': {}, '25d': {} },
  selftest: null,
  manualClock: false,
  resultTimer: 0,
};

let view, sfx;

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  state.screen = id;
  $('hud').hidden = id !== null && id !== 'scrPlay';
  $('hint').hidden = $('hud').hidden;
}

function buildTour() {
  const order = [];
  for (const lv of LEVELS) {
    const modes = lv.id % 2 === 1 ? ['3d', '25d'] : ['25d', '3d'];
    for (const m of modes) order.push({ level: lv.id, mode: m });
  }
  return { order, idx: 0 };
}

function startLevel(levelId, mode, isRetry = false) {
  if (state.sim) state.sim.free();
  const level = LEVELS.find((l) => l.id === levelId);
  state.level = level;
  state.mode = mode;
  state.sim = new Sim(level, mode, { fx: true });
  state.currPoses = state.sim.poses();
  state.prevPoses = null;
  state.acc = 0;
  state.drag = null;
  drawDrag();
  if (!isRetry) state.aim3d = { a: 0, b: 200 };
  view.setCageIndexMap(state.sim.cages.map((c) => c.id));
  view.loadLevel(level, mode, state.currPoses);
  if (isRetry && state.play) {
    state.play.attempts++;
  } else {
    const firstInTour = state.tour ? !state.log.some((r) => r.level === levelId && r.tour) : false;
    state.play = { level: levelId, mode, attempts: 1, t0: performance.now(), shots: 0, tour: !!state.tour, firstOfLevel: firstInTour, measure: null };
    const m = view.measureTargets();
    state.play.measure = {
      visibleMin: Math.min(...m.map((x) => x.visible)),
      pxMin: Math.min(...m.map((x) => x.px)),
    };
  }
  show('scrPlay');
  $('hintText').hidden = false;
  updateHud();
  setAimPreview();
}

function updateHud() {
  const s = state.sim;
  const lv = state.level;
  $('lvlName').textContent = lv.id + ' · ' + lv.name;
  $('modeChip').textContent = MODE_NAME[state.mode] + ' — ' + MODE_CONTROL[state.mode];
  $('modeChip').dataset.mode = state.mode;
  const pips = $('shots');
  pips.innerHTML = '';
  for (let i = 0; i < lv.shots; i++) {
    const d = document.createElement('span');
    d.className = 'pip' + (i < s.shotsLeft ? '' : ' used');
    pips.appendChild(d);
  }
  $('cages').textContent = 'Kafes ' + s.cagesLeft() + '/' + lv.cages.length;
  $('hintText').textContent = lv.hint + ' ' + HINT[state.mode];
  $('tourBar').textContent = state.tour ? 'Tur ' + (state.tour.idx + 1) + '/' + state.tour.order.length : 'Serbest oyun';
  $('btnMode').hidden = !!state.tour;
  $('btnMode').textContent = state.mode === '3d' ? '2,5D dene' : '3D dene';
}

function aimReadout(a, b) {
  const lim = INPUT[state.mode];
  if (state.mode === '3d') return 'Yön ' + (a / 10).toFixed(1).replace('.', ',') + '° · Yükseklik ' + (b / 10).toFixed(1).replace('.', ',') + '°';
  return 'Açı ' + (a / 10).toFixed(1).replace('.', ',') + '° · Güç %' + Math.round(((b - lim.b.min) / (lim.b.max - lim.b.min)) * 100);
}

function currentAim() {
  if (state.mode === '3d') return state.aim3d;
  return state.drag && state.drag.aim ? state.drag.aim : null;
}

function setAimPreview() {
  view.setLoaded(!!(state.sim && state.sim.phase === 'aim' && state.sim.shotsLeft > 0));
  const aim = state.sim && state.sim.phase === 'aim' ? currentAim() : null;
  if (!aim) { view.setAim(null); $('aimReadout').textContent = state.mode === '25d' && state.sim && state.sim.phase === 'aim' ? 'Geri çek ve bırak' : ''; return; }
  const v = launchVelocity(state.level, state.mode, aim.a, aim.b);
  view.setAim(v, previewPath(state.level, state.mode, aim.a, aim.b, PREVIEW_STEPS));
  $('aimReadout').textContent = aimReadout(aim.a, aim.b);
}

// ---------- input ----------
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function onDown(e) {
  if (state.screen !== 'scrPlay' || !state.sim || state.sim.phase !== 'aim') return;
  sfx.unlock();
  e.preventDefault();
  $('hintText').hidden = true;
  view.canvas.setPointerCapture(e.pointerId);
  state.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), far: false, start: { ...state.aim3d }, aim: null };
  drawDrag();
}

function onMove(e) {
  const d = state.drag;
  if (!d || d.id !== e.pointerId) return;
  d.x = e.clientX; d.y = e.clientY;
  const dx = d.x - d.x0, dy = d.y - d.y0;
  const dist = Math.hypot(dx, dy);
  if (dist > 30) d.far = true;
  if (state.mode === '3d') {
    const lim = INPUT['3d'];
    const k = 0.8; // tenths of a degree per CSS pixel
    state.aim3d = { a: clamp(Math.round(d.start.a + dx * k), lim.a.min, lim.a.max), b: clamp(Math.round(d.start.b - dy * k), lim.b.min, lim.b.max) };
  } else {
    const lim = INPUT['25d'];
    if (dist < 12) d.aim = null;
    else {
      const ang = (Math.atan2(dy, -dx) * 180) / Math.PI; // pull back-left/down launches right/up
      const maxPull = Math.min(window.innerHeight, window.innerWidth * 1.6) * 0.32;
      const p = clamp(dist / maxPull, 0, 1);
      d.aim = { a: clamp(Math.round(ang * 10), lim.a.min, lim.a.max), b: clamp(Math.round(lim.b.min + p * (lim.b.max - lim.b.min)), lim.b.min, lim.b.max) };
    }
  }
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
  let aim = null;
  if (!cancelled && !tooShort) aim = state.mode === '3d' ? state.aim3d : d.aim;
  if (state.mode === '3d' && cancelled) state.aim3d = d.start;
  if (aim) fire(aim.a, aim.b);
  else setAimPreview();
}

function drawDrag() {
  const svg = $('dragLayer');
  const d = state.drag;
  if (!d) { svg.innerHTML = ''; return; }
  const col = state.mode === '3d' ? 'rgba(27,42,65,0.55)' : 'rgba(255,122,61,0.9)';
  svg.innerHTML = '<circle cx="' + d.x0 + '" cy="' + d.y0 + '" r="14" fill="none" stroke="' + col + '" stroke-width="3"/>' +
    '<line x1="' + d.x0 + '" y1="' + d.y0 + '" x2="' + d.x + '" y2="' + d.y + '" stroke="' + col + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + (state.mode === '3d' ? '2 8' : '0') + '"/>' +
    '<circle cx="' + d.x + '" cy="' + d.y + '" r="9" fill="' + col + '"/>';
}

function fire(a, b) {
  if (!state.sim.fire(a, b)) return;
  state.play.shots++;
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
    if (ev.type === 'fire') { sfx.fire(); vibrate(12); view.shake = Math.max(view.shake, 0.03); view.setLoaded(false); }
    else if (ev.type === 'impact') {
      view.onImpact(ev);
      sfx.impact(ev.force, ev.kinds.includes('static') || ev.kinds.includes('ground'));
    } else if (ev.type === 'break') {
      view.onBreak(ev);
      sfx.shatter();
      sfx.rescue();
      vibrate(35);
      updateHud();
    } else if (ev.type === 'settled') {
      updateHud();
      if (ev.phase === 'won' || ev.phase === 'lost') {
        clearTimeout(state.resultTimer);
        state.resultTimer = setTimeout(() => showResult(ev.phase), ev.phase === 'won' ? 500 : 250);
      } else setAimPreview();
    }
  }
  s.pendingFx.length = 0;
}

function recordPlay(result) {
  const p = state.play;
  state.log.push({
    level: p.level, mode: p.mode, result, attempts: p.attempts, shots: p.shots,
    seconds: Math.round((performance.now() - p.t0) / 100) / 10, tour: p.tour,
    firstOfLevel: p.firstOfLevel, visibleMin: p.measure.visibleMin, pxMin: p.measure.pxMin,
  });
}

function showResult(phase) {
  const won = phase === 'won';
  if (won) { sfx.win(); vibrate([20, 40, 20]); recordPlay('kazandı'); } else sfx.lose();
  const lv = state.level;
  $('resTitle').textContent = won ? 'Kurtarıldı!' : 'Atış hakkı bitti';
  $('resBody').textContent = won
    ? lv.name + ' · ' + MODE_NAME[state.mode] + ' · ' + state.play.attempts + '. denemede, toplam ' + state.play.shots + ' atış'
    : state.sim.cagesLeft() + ' yavru buzda kaldı. Aynı düzeni tekrar deneyebilirsin.';
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
  const it = t.order[t.idx];
  startLevel(it.level, it.mode);
}

// ---------- summary & rating ----------
function pct(x) { return '%' + Math.round(x * 100); }

function modeStats(mode) {
  const rows = state.log.filter((r) => r.mode === mode);
  const f = state.frames[mode];
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
    vis: avg('visibleMin'), visWorst: rows.length ? Math.min(...rows.map((r) => r.visibleMin)) : 0,
    px: avg('pxMin'),
  };
}

function summaryText() {
  const lines = [];
  lines.push('BUZKIRAN PROTOTİP ÖZETİ v3');
  lines.push('Cihaz: ' + navigator.userAgent.replace(/\s+/g, ' ').slice(0, 140));
  lines.push('Ekran: ' + window.innerWidth + 'x' + window.innerHeight + ' CSS px, cihaz oranı ' + (window.devicePixelRatio || 1) + ', çizim oranı ' + view.dpr);
  const st = state.selftest;
  lines.push('Tutarlılık testi: ' + (st ? st.passed + '/' + st.total + ' eşleşti' + (st.passed < st.total ? ' — ilk fark: ' + st.results.find((r) => !r.ok).name + ' (' + st.results.find((r) => !r.ok).mismatch + ')' : '') : 'çalıştırılmadı'));
  for (const m of ['3d', '25d']) {
    const s = modeStats(m);
    lines.push(MODE_NAME[m] + ' (' + MODE_CONTROL[m] + '): oynanan ' + s.plays + ', ilk denemede kazanılan ' + s.wonFirst + ', geçilen ' + s.skipped +
      ', ort. deneme ' + s.attempts.toFixed(1) + ', ort. toplam atış (tüm denemeler) ' + s.shots.toFixed(1) +
      ', fps ' + (s.fps ?? '-') + ' (%1 en düşük ' + (s.low ?? '-') + ')' +
      ', hedef görünürlüğü ort. ' + pct(s.vis) + ' (en kötü ' + pct(s.visWorst) + '), hedef boyutu ort. ' + Math.round(s.px) + ' px');
  }
  lines.push('Puanlar (1-5), 3D / 2,5D:');
  for (const [k, name] of CRITERIA) lines.push('  ' + name + ': ' + (state.ratings['3d'][k] ?? '-') + ' / ' + (state.ratings['25d'][k] ?? '-'));
  lines.push('Bölüm ayrıntısı:');
  for (const r of state.log) {
    lines.push('  B' + r.level + ' ' + (r.mode === '3d' ? '3D ' : '2,5D') + (r.firstOfLevel ? ' (ilk)' : ' (ikinci)') + ': ' + r.result + ', ' + r.attempts + ' deneme, ' + r.shots + ' toplam atış, ' + r.seconds + ' sn, görünürlük ' + pct(r.visibleMin) + ', ' + Math.round(r.pxMin) + ' px');
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
    for (const m of ['3d', '25d']) {
      const g = document.createElement('div');
      g.className = 'rate-scale';
      g.setAttribute('role', 'radiogroup');
      g.setAttribute('aria-label', name + ' ' + MODE_NAME[m]);
      g.innerHTML = '<em>' + (m === '3d' ? '3D' : '2,5D') + '</em>';
      for (let v = 1; v <= 5; v++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'r-' + k + '-' + m + '-' + v;
        b.textContent = v;
        b.className = state.ratings[m][k] === v ? 'on' : '';
        b.setAttribute('aria-pressed', state.ratings[m][k] === v ? 'true' : 'false');
        b.addEventListener('click', () => { state.ratings[m][k] = v; renderRatingForm(); refreshSummary(); });
        g.appendChild(b);
      }
      row.appendChild(g);
    }
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
    const done = (m) => state.log.some((r) => r.level === lv.id && r.mode === m && r.result === 'kazandı');
    row.innerHTML = '<span class="lvl-no">' + lv.id + '</span><span class="lvl-name">' + lv.name + '</span>';
    for (const m of ['3d', '25d']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'lv-' + lv.id + '-' + m;
      b.className = 'btn small' + (done(m) ? ' done' : '');
      b.textContent = m === '3d' ? '3D' : '2,5D';
      b.addEventListener('click', () => { sfx.unlock(); state.tour = null; startLevel(lv.id, m); });
      row.appendChild(b);
    }
    box.appendChild(row);
  }
}

// ---------- main loop ----------
let last = performance.now();
function step(dtReal) {
  const s = state.sim;
  const playing = state.screen === 'scrPlay' && s;
  if (playing && !document.hidden) state.frames[state.mode].push(dtReal * 1000);
  if (state.frames[state.mode].length > 40000) state.frames[state.mode].splice(0, 10000);
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
  $('btnTour').addEventListener('click', () => { sfx.unlock(); state.tour = buildTour(); const it = state.tour.order[0]; startLevel(it.level, it.mode); });
  $('btnFree').addEventListener('click', () => { sfx.unlock(); renderLevels(); show('scrLevels'); });
  $('btnLevelsBack').addEventListener('click', () => show('scrStart'));
  $('btnRestart').addEventListener('click', () => { if (state.sim && state.sim.phase !== 'flight') startLevel(state.level.id, state.mode, true); });
  $('btnMenu').addEventListener('click', () => { if (state.sim && state.sim.phase === 'flight') return; show('scrMenu'); });
  $('btnMute').addEventListener('click', () => { sfx.muted = !sfx.muted; $('btnMute').textContent = sfx.muted ? 'Ses kapalı' : 'Ses açık'; $('btnMute').setAttribute('aria-pressed', sfx.muted ? 'true' : 'false'); });
  $('btnMode').addEventListener('click', () => { if (state.sim && state.sim.phase !== 'flight') startLevel(state.level.id, state.mode === '3d' ? '25d' : '3d'); });
  $('menuResume').addEventListener('click', () => { show('scrPlay'); setAimPreview(); });
  $('menuLevels').addEventListener('click', () => { state.tour = null; renderLevels(); show('scrLevels'); });
  $('menuRate').addEventListener('click', () => openRating());
  $('menuStart').addEventListener('click', () => show('scrStart'));
  $('resRetry').addEventListener('click', () => startLevel(state.level.id, state.mode, true));
  $('resReplay').addEventListener('click', () => startLevel(state.level.id, state.mode));
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
  // idle backdrop: level 8 in 3D behind the start screen
  state.level = LEVELS[7];
  const backdrop = new Sim(LEVELS[7], '3d');
  view.setCageIndexMap(backdrop.cages.map((c) => c.id));
  view.loadLevel(LEVELS[7], '3d', backdrop.poses());
  backdrop.free();
  state.level = null;
  show('scrStart');
}

// Test hooks used by the automated browser checks (not needed for play).
window.__buzkiran = {
  state,
  get view() { return view; },
  startLevel,
  startTour() { state.tour = buildTour(); const it = state.tour.order[0]; startLevel(it.level, it.mode); },
  fire,
  // show an aim for screenshots/videos (numeric input, same as a player's drag result)
  previewAim(a, b) {
    if (state.mode === '3d') state.aim3d = { a, b };
    else {
      const lim = INPUT['25d'];
      const p = (b - lim.b.min) / (lim.b.max - lim.b.min);
      const dist = 12 + p * Math.min(window.innerHeight, window.innerWidth * 1.6) * 0.32;
      const ang = (a / 10) * Math.PI / 180;
      const x0 = window.innerWidth * 0.3, y0 = window.innerHeight * 0.62;
      state.drag = { id: -1, x0, y0, x: x0 - Math.cos(ang) * dist, y: y0 + Math.sin(ang) * dist, aim: { a, b }, far: false };
      drawDrag();
    }
    setAimPreview();
  },
  clearDrag() { state.drag = null; drawDrag(); },
  advanceTour,
  openRating,
  setManualClock(v) { state.manualClock = v; },
  advance(dt, n = 1) { for (let i = 0; i < n; i++) step(dt); },
  measure: () => view.measureTargets(),
  summaryText,
  runSelfTest,
  // physics-only timing: fixed steps, no rendering
  bench(levelId, mode, shots) {
    const level = LEVELS.find((l) => l.id === levelId);
    const t0 = performance.now();
    const sim = new Sim(level, mode, { fx: true });
    const build = performance.now() - t0;
    const times = [];
    for (const sh of shots) {
      sim.fire(sh.a, sh.b);
      while (sim.phase === 'flight') { const a = performance.now(); sim.tick(); sim.poses(); sim.pendingFx.length = 0; times.push(performance.now() - a); }
    }
    sim.free();
    times.sort((x, y) => x - y);
    const avg = times.reduce((x, y) => x + y, 0) / times.length;
    return { build: +build.toFixed(1), steps: times.length, avg: +avg.toFixed(3), p95: +times[Math.floor(times.length * 0.95)].toFixed(3), max: +times[times.length - 1].toFixed(3) };
  },
};

boot();
