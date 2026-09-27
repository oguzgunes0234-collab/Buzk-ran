// Deterministic simulation core, shared by the game client, the test bot and
// the determinism self-test. No rendering, no timing, no randomness here.
//
// Determinism rules followed in this file:
//  - fixed time step (DT), physics never depends on frame rate
//  - bodies/colliders are always created in the same order (level array order)
//  - shot input is an ammo type plus a pair of integers; direction uses
//    detmath (no Math.sin/cos); only + - * / and Math.sqrt feed the physics
//  - between shots the world is frozen, so how long a player waits does not matter
//  - breaks, explosions and goal checks are processed in fixed body order
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { sinTenth, cosTenth, fnv1a32, hex32 } from './detmath.js';

export const DT = 1 / 60;
export const GRAVITY = -9.81;
export const SOLVER_ITERATIONS = 8;
export const PRE_SETTLE_STEPS = 60;
export const MAX_FLIGHT_STEPS = 480; // 8 s after a shot
export const SETTLE_FRAMES = 20;
export const CAGE_SIZE = 0.8;
export const BALL_RADIUS = 0.3;
export const LAUNCHER = { y: 1.0, z: -9 };
export const KILL_Y = -4;
export const FALL_Y = -0.6; // below the platform top: fell off the edge

export const TOTEM = { w: 0.5, h: 1.3, d: 0.5 };
export const NEST = { w: 0.8, h: 0.35, d: 0.8 };

// Tunable physical parameters (kept here so the bot and the client agree).
export const PARAMS = {
  cageDensity: 1.2,
  cageFriction: 1.0,
  groundFriction: 1.0,
  cageBreakForce: 90, // N, total contact force needed to shatter a cage
  nestBreakForce: 60, // N, a hit this hard cracks the eggs
  fxImpactForce: 25,  // N, only used for sound/particles, never affects physics
};

export const MATERIALS = {
  wood: { density: 1.0, friction: 1.0, restitution: 0.05 },
  stone: { density: 3.2, friction: 1.0, restitution: 0.02 },
  ice: { density: 0.9, friction: 0.7, restitution: 0.05, breakForce: 55 }, // brittle
};

export const AMMO = {
  normal: { name: 'Gülle', radius: 0.3, density: 9, speedK: 1.0, restitution: 0.15 },
  heavy: { name: 'Ağır', radius: 0.38, density: 20, speedK: 0.85, restitution: 0.05 },
  ember: { name: 'Köz', radius: 0.3, density: 6, speedK: 1.0, restitution: 0.1, blast: { radius: 2.2, core: 1.1, impulse: 7.0 } },
};
export const AMMO_ORDER = ['normal', 'heavy', 'ember'];

// Input ranges (integers). Reported by the bot as scan bounds.
export const INPUT = {
  '3d': {
    a: { name: 'yon', unit: '0.1 derece', min: -150, max: 150 },   // yaw
    b: { name: 'yukseklik', unit: '0.1 derece', min: 50, max: 700 }, // pitch
  },
  '25d': {
    a: { name: 'aci', unit: '0.1 derece', min: 0, max: 800 },       // launch angle
    b: { name: 'guc', unit: '%', min: 25, max: 100 },               // power
  },
};

// Extent of a level's layout.
export function levelBounds(level) {
  let zMin = Infinity, zMax = -Infinity, yMax = 0, xAbs = 0;
  const add = (x, z, w, d, top) => {
    zMin = Math.min(zMin, z - d / 2); zMax = Math.max(zMax, z + d / 2);
    yMax = Math.max(yMax, top); xAbs = Math.max(xAbs, Math.abs(x) + w / 2);
  };
  for (const s of level.statics || []) add(s.x || 0, s.z, s.w, s.d, s.y + s.h / 2);
  for (const b of level.blocks || []) add(b.x || 0, b.z, b.w, b.d, b.y + b.h / 2);
  for (const c of level.cages || []) add(c.x || 0, c.z, CAGE_SIZE, CAGE_SIZE, c.y + CAGE_SIZE / 2);
  for (const t of level.totems || []) add(t.x || 0, t.z, TOTEM.w, TOTEM.d, t.y + TOTEM.h / 2);
  for (const n of level.nests || []) add(n.x || 0, n.z, NEST.w, NEST.d, n.y + NEST.h / 2);
  return { zMin, zMax, yMax, xAbs };
}

// The playable ice platform. Anything pushed past its edges falls into the valley.
export function arenaOf(level) {
  const b = levelBounds(level);
  return { xHalf: Math.max(3.2, b.xAbs + 1.6), zMin: LAUNCHER.z - 2.5, zMax: b.zMax + 1.6 };
}

export function ammoCounts(level) {
  const c = {};
  for (const t of AMMO_ORDER) c[t] = 0;
  for (const t of level.ammo) c[t]++;
  return c;
}

let rapierReady = null;
export function initPhysics() {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

export function launchVelocity(level, mode, a, b, type = 'normal') {
  const lim = INPUT[mode];
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error('input must be integers');
  if (a < lim.a.min || a > lim.a.max || b < lim.b.min || b > lim.b.max) throw new Error('input out of range');
  const k = AMMO[type].speedK;
  if (mode === '3d') {
    const s = level.speed * k;
    const cp = cosTenth(b);
    // positive yaw = to the player's right on screen (camera looks along +z, right is -x)
    return { x: -sinTenth(a) * cp * s, y: sinTenth(b) * s, z: cosTenth(a) * cp * s };
  }
  const s = level.speed * k * (0.35 + (0.80 * (b - lim.b.min)) / (lim.b.max - lim.b.min));
  return { x: 0, y: sinTenth(a) * s, z: cosTenth(a) * s };
}

// Same integration scheme as the physics engine for a free body
// (velocity first, then position), used for the aiming preview only.
export function previewPath(level, mode, a, b, steps, type = 'normal') {
  const v = launchVelocity(level, mode, a, b, type);
  const pts = [];
  let px = 0, py = LAUNCHER.y, pz = LAUNCHER.z;
  let vx = v.x, vy = v.y, vz = v.z;
  for (let i = 0; i < steps; i++) {
    vy += GRAVITY * DT;
    px += vx * DT; py += vy * DT; pz += vz * DT;
    pts.push([px, py, pz]);
  }
  return pts;
}

// "up" component of a body's local y axis, from its quaternion (basic ops only)
function upY(q) { return 1 - 2 * (q.x * q.x + q.z * q.z); }

export class Sim {
  constructor(level, mode, opts = {}) {
    if (mode !== '3d' && mode !== '25d') throw new Error('mode');
    this.level = level;
    this.mode = mode;
    this.fx = !!opts.fx;
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = DT;
    this.world.numSolverIterations = SOLVER_ITERATIONS;
    this.events = new RAPIER.EventQueue(true);
    this.step = 0;
    this.ammo = ammoCounts(level);
    this.shots = [];
    this.phase = 'setup';
    this.bodies = []; // ordered list of entries
    this.cages = [];
    this.totems = [];
    this.nests = [];
    this.ball = null;
    this.colliderInfo = new Map(); // collider handle -> body entry
    this.calm = 0;
    this.flightSteps = 0;
    this.pendingFx = [];
    this.breakEnabled = false;
    this.failReason = null;
    this._build();
    this.initialHash = this.hash();
    // let the structure settle, breaking disabled, then freeze for aiming
    for (let i = 0; i < PRE_SETTLE_STEPS; i++) this._stepPhysics();
    this.pendingFx.length = 0;
    for (const t of this.totems) t.y0 = t.body.translation().y;
    for (const n of this.nests) n.y0 = n.body.translation().y;
    this.breakEnabled = true;
    this.readyHash = this.hash();
    this.phase = 'aim';
  }

  get shotsLeft() {
    let n = 0;
    for (const t of AMMO_ORDER) n += this.ammo[t];
    return n;
  }

  _entry(kind, body, col, size, extra = {}) {
    const e = { id: this.bodies.length, kind, body, size, alive: true, ...extra };
    this.bodies.push(e);
    this.colliderInfo.set(col.handle, e);
    return e;
  }

  _addStatic(b, kind = 'static') {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(b.x || 0, b.y, b.z));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setFriction(PARAMS.groundFriction), body);
    return this._entry(kind, body, col, [b.w, b.h, b.d], { fixed: true });
  }

  _addBlock(b) {
    const mat = b.mat || 'wood';
    const m = MATERIALS[mat];
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(b.x || 0, b.y, b.z));
    const c = RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setDensity(m.density).setFriction(m.friction).setRestitution(m.restitution);
    if (m.breakForce) {
      c.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
      c.setContactForceEventThreshold(this.fx ? Math.min(PARAMS.fxImpactForce, m.breakForce) : m.breakForce);
    } else if (this.fx) {
      c.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
      c.setContactForceEventThreshold(PARAMS.fxImpactForce);
    }
    const col = this.world.createCollider(c, body);
    return this._entry(mat === 'ice' ? 'ice' : 'block', body, col, [b.w, b.h, b.d], { mat, broken: false });
  }

  _addCage(cg, index) {
    const s = CAGE_SIZE;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(cg.x || 0, cg.y, cg.z));
    const c = RAPIER.ColliderDesc.cuboid(s / 2, s / 2, s / 2)
      .setDensity(PARAMS.cageDensity).setFriction(PARAMS.cageFriction).setRestitution(0.05)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(PARAMS.cageBreakForce);
    const col = this.world.createCollider(c, body);
    const e = this._entry('cage', body, col, [s, s, s], { cageIndex: index, broken: false });
    this.cages.push(e);
  }

  _addTotem(t, index) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(t.x || 0, t.y, t.z));
    const c = RAPIER.ColliderDesc.cuboid(TOTEM.w / 2, TOTEM.h / 2, TOTEM.d / 2).setDensity(0.7).setFriction(1.0).setRestitution(0.05);
    if (this.fx) { c.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS); c.setContactForceEventThreshold(PARAMS.fxImpactForce); }
    const col = this.world.createCollider(c, body);
    const e = this._entry('totem', body, col, [TOTEM.w, TOTEM.h, TOTEM.d], { totemIndex: index, down: false, y0: t.y });
    this.totems.push(e);
  }

  _addNest(n, index) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(n.x || 0, n.y, n.z));
    const c = RAPIER.ColliderDesc.cuboid(NEST.w / 2, NEST.h / 2, NEST.d / 2).setDensity(1.0).setFriction(1.0).setRestitution(0.02)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(PARAMS.nestBreakForce);
    const col = this.world.createCollider(c, body);
    const e = this._entry('nest', body, col, [NEST.w, NEST.h, NEST.d], { nestIndex: index, broken: false, y0: n.y });
    this.nests.push(e);
  }

  _build() {
    // ground: the ice platform, top at y = 0, with edges the player can see
    const ar = arenaOf(this.level);
    this._addStatic({ y: -0.5, z: (ar.zMin + ar.zMax) / 2, w: ar.xHalf * 2, h: 1, d: ar.zMax - ar.zMin }, 'ground');
    for (const s of this.level.statics || []) this._addStatic(s);
    for (const b of this.level.blocks || []) this._addBlock(b);
    (this.level.cages || []).forEach((c, i) => this._addCage(c, i));
    (this.level.totems || []).forEach((t, i) => this._addTotem(t, i));
    (this.level.nests || []).forEach((n, i) => this._addNest(n, i));
  }

  fire(a, b, type = 'normal') {
    if (this.phase !== 'aim' || !AMMO[type] || this.ammo[type] <= 0) return false;
    const am = AMMO[type];
    const v = launchVelocity(this.level, this.mode, a, b, type);
    const d = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, LAUNCHER.y, LAUNCHER.z).setCcdEnabled(true);
    d.setLinvel(v.x, v.y, v.z);
    const body = this.world.createRigidBody(d);
    const c = RAPIER.ColliderDesc.ball(am.radius).setDensity(am.density).setFriction(0.5).setRestitution(am.restitution);
    // the ball always reports contacts: after its first touch it gets rolling
    // resistance (damping); an ember ball bursts on its first touch instead
    c.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    c.setContactForceEventThreshold(0.5);
    const col = this.world.createCollider(c, body);
    const r2 = am.radius * 2;
    this.ball = this._entry('ball', body, col, [r2, r2, r2], { touched: false, ammo: type });
    this.shots.push({ step: this.step, t: type, a, b });
    this.ammo[type]--;
    this.phase = 'flight';
    this.calm = 0;
    this.flightSteps = 0;
    this.won = false;
    this.pendingFx.push({ type: 'fire', step: this.step, ammo: type });
    return true;
  }

  _removeEntry(e) {
    if (!e.alive) return;
    e.alive = false;
    this.world.removeRigidBody(e.body);
  }

  _explode(ball, breakCages, breakIce) {
    const bl = AMMO.ember.blast;
    const c = ball.body.translation();
    const R2 = bl.radius * bl.radius;
    const core2 = bl.core * bl.core;
    for (const e of this.bodies) {
      if (!e.alive || e.fixed || e === ball) continue;
      const t = e.body.translation();
      const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R2) continue;
      if (d2 < core2) {
        if (e.kind === 'cage') breakCages.push(e.cageIndex);
        else if (e.kind === 'ice') breakIce.push(e.id);
        else if (e.kind === 'nest') this._breakNest(e, 'patlama');
      }
      const d = Math.sqrt(d2);
      const k = bl.impulse * (1 - d / bl.radius);
      let nx = 0, ny = 1, nz = 0;
      if (d > 1e-4) { nx = dx / d; ny = dy / d + 0.35; nz = dz / d; }
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (e.alive) e.body.applyImpulse({ x: (nx / nl) * k, y: (ny / nl) * k, z: (nz / nl) * k }, true);
    }
    this.pendingFx.push({ type: 'explode', step: this.step, pos: [c.x, c.y, c.z], radius: bl.radius });
    this._removeEntry(ball);
    if (this.ball === ball) this.ball = null;
  }

  _breakNest(n, why) {
    if (n.broken || !this.breakEnabled) return;
    n.broken = true;
    if (!this.failReason) this.failReason = 'yuva';
    const t = n.body.translation();
    this.pendingFx.push({ type: 'nest', step: this.step, nest: n.nestIndex, why, pos: [t.x, t.y, t.z] });
  }

  _stepPhysics() {
    this.world.step(this.events);
    this.step++;
    const breakCages = [];
    const breakIce = [];
    let touchedBall = null;
    this.events.drainContactForceEvents((ev) => {
      const e1 = this.colliderInfo.get(ev.collider1());
      const e2 = this.colliderInfo.get(ev.collider2());
      const f = ev.totalForceMagnitude();
      for (const e of [e1, e2]) {
        if (!e) continue;
        if (e.kind === 'ball' && !e.touched) { e.touched = true; touchedBall = e; }
        if (!this.breakEnabled) continue;
        if (e.kind === 'cage' && !e.broken && f >= PARAMS.cageBreakForce) breakCages.push(e.cageIndex);
        else if (e.kind === 'ice' && !e.broken && f >= MATERIALS.ice.breakForce) breakIce.push(e.id);
        else if (e.kind === 'nest' && !e.broken && f >= PARAMS.nestBreakForce) this._breakNest(e, 'darbe');
      }
      if (this.fx && f >= PARAMS.fxImpactForce) {
        const src = e1 && !e1.fixed ? e1 : e2;
        if (src && src.alive) {
          const t = src.body.translation();
          this.pendingFx.push({ type: 'impact', step: this.step, force: f, pos: [t.x, t.y, t.z], kinds: [e1 && e1.kind, e2 && e2.kind] });
        }
      }
    });
    if (touchedBall && touchedBall.alive) {
      if (touchedBall.ammo === 'ember') this._explode(touchedBall, breakCages, breakIce);
      else { touchedBall.body.setLinearDamping(0.8); touchedBall.body.setAngularDamping(3.0); }
    }
    if (breakCages.length) {
      breakCages.sort((x, y) => x - y);
      for (const idx of breakCages) {
        const cg = this.cages[idx];
        if (cg.broken || !cg.alive) continue;
        cg.broken = true;
        const t = cg.body.translation();
        this.pendingFx.push({ type: 'break', step: this.step, cage: idx, pos: [t.x, t.y, t.z] });
        this._removeEntry(cg);
      }
    }
    if (breakIce.length) {
      breakIce.sort((x, y) => x - y);
      for (const id of breakIce) {
        const e = this.bodies[id];
        if (e.broken || !e.alive) continue;
        e.broken = true;
        const t = e.body.translation();
        this.pendingFx.push({ type: 'shatter', step: this.step, id, pos: [t.x, t.y, t.z], size: e.size });
        this._removeEntry(e);
      }
    }
    if (this.breakEnabled) {
      for (const cg of this.cages) {
        if (!cg.alive || cg.broken) continue;
        const t = cg.body.translation();
        if (t.y < FALL_Y) {
          cg.broken = true;
          this.pendingFx.push({ type: 'break', step: this.step, cage: cg.cageIndex, fell: true, pos: [t.x, t.y, t.z] });
          this._removeEntry(cg);
        }
      }
      for (const tm of this.totems) {
        if (tm.down || !tm.alive) continue;
        const t = tm.body.translation();
        if (upY(tm.body.rotation()) < 0.5 || t.y < tm.y0 - 0.5 || t.y < FALL_Y) {
          tm.down = true;
          this.pendingFx.push({ type: 'totem', step: this.step, totem: tm.totemIndex, pos: [t.x, t.y, t.z] });
        }
      }
      for (const n of this.nests) {
        if (n.broken || !n.alive) continue;
        const t = n.body.translation();
        if (t.y < n.y0 - 0.6 || upY(n.body.rotation()) < 0.3) this._breakNest(n, 'dustu');
      }
    }
    // remove anything that fell out of the world (in list order)
    for (const e of this.bodies) {
      if (e.alive && !e.fixed && e.body.translation().y < KILL_Y) {
        if (e.kind === 'cage') e.broken = true;
        if (e.kind === 'totem') e.down = true;
        if (e.kind === 'nest') this._breakNest(e, 'dustu');
        if (e === this.ball) this.ball = null;
        this._removeEntry(e);
      }
    }
  }

  cagesLeft() { let n = 0; for (const c of this.cages) if (!c.broken) n++; return n; }
  totemsLeft() { let n = 0; for (const t of this.totems) if (!t.down) n++; return n; }
  nestsBroken() { let n = 0; for (const x of this.nests) if (x.broken) n++; return n; }
  goalsDone() { return this.cagesLeft() === 0 && this.totemsLeft() === 0; }

  isCalm() {
    for (const e of this.bodies) {
      if (!e.alive || e.fixed) continue;
      const v = e.body.linvel();
      const w = e.body.angvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z > 0.0064) return false;
      if (w.x * w.x + w.y * w.y + w.z * w.z > 0.0225) return false;
    }
    return true;
  }

  // Advance one fixed step. Returns true while the simulation is running.
  tick() {
    if (this.phase !== 'flight') return false;
    this._stepPhysics();
    this.flightSteps++;
    const decided = this.goalsDone() || this.nestsBroken() > 0;
    if (decided) this.won = this.goalsDone() && this.nestsBroken() === 0;
    this.calm = this.isCalm() ? this.calm + 1 : 0;
    if (this.calm >= SETTLE_FRAMES || this.flightSteps >= MAX_FLIGHT_STEPS || (decided && this.flightSteps >= 150)) {
      if (this.ball) { this._removeEntry(this.ball); this.ball = null; }
      if (this.nestsBroken() > 0) this.phase = 'lost';
      else if (this.goalsDone()) this.phase = 'won';
      else if (this.shotsLeft > 0) this.phase = 'aim';
      else { this.phase = 'lost'; this.failReason = 'atis'; }
      this.pendingFx.push({ type: 'settled', step: this.step, phase: this.phase });
    }
    return this.phase === 'flight';
  }

  runShot(a, b, type = 'normal') {
    if (!this.fire(a, b, type)) return false;
    while (this.tick()) { /* fixed steps, no wall clock */ }
    return true;
  }

  // Hash of the full dynamic state. Float32 bits of every body's pose in the
  // fixed body order, plus step count, goal flags and remaining ammo.
  hash() {
    const words = [];
    const f = new Float32Array(1);
    const u = new Uint32Array(f.buffer);
    const push = (x) => { f[0] = x; words.push(u[0]); };
    words.push(this.step >>> 0);
    for (const e of this.bodies) {
      words.push(e.alive ? 1 : 0);
      if (!e.alive) continue;
      const t = e.body.translation();
      const r = e.body.rotation();
      push(t.x); push(t.y); push(t.z);
      push(r.x); push(r.y); push(r.z); push(r.w);
    }
    for (const c of this.cages) words.push(c.broken ? 1 : 0);
    for (const t of this.totems) words.push(t.down ? 1 : 0);
    for (const n of this.nests) words.push(n.broken ? 1 : 0);
    for (const k of AMMO_ORDER) words.push(this.ammo[k]);
    return hex32(fnv1a32(words));
  }

  poses() {
    const out = [];
    for (const e of this.bodies) {
      if (!e.alive) continue;
      const t = e.body.translation();
      const r = e.body.rotation();
      out.push({ id: e.id, kind: e.kind, mat: e.mat, ammo: e.ammo, size: e.size, cageIndex: e.cageIndex, down: e.down, broken: e.broken, p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w] });
    }
    return out;
  }

  dynamicCount() {
    let n = 0;
    for (const e of this.bodies) if (e.alive && !e.fixed) n++;
    return n;
  }

  free() {
    this.world.free();
    this.events.free();
  }
}

// Replay a recorded numeric shot list ({t, a, b}) and collect checkpoint hashes.
// Used both on desktop (reference) and on the phone (self-test).
export function replay(level, mode, shots, checkpointEvery = 30) {
  const sim = new Sim(level, mode);
  const out = { initial: sim.initialHash, ready: sim.readyHash, checkpoints: [], shotSteps: [], finalStep: 0, final: '', phase: '' };
  for (const s of shots) {
    if (sim.phase !== 'aim') break;
    out.shotSteps.push(sim.step);
    sim.fire(s.a, s.b, s.t || 'normal');
    while (sim.tick()) {
      if (sim.step % checkpointEvery === 0) out.checkpoints.push([sim.step, sim.hash()]);
    }
  }
  out.finalStep = sim.step;
  out.final = sim.hash();
  out.phase = sim.phase;
  out.cagesLeft = sim.cagesLeft();
  sim.free();
  return out;
}
