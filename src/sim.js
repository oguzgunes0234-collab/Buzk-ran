// Deterministic simulation core, shared by the game client, the test bot and
// the determinism self-test. No rendering, no timing, no randomness here.
//
// Determinism rules followed in this file:
//  - fixed time step (DT), physics never depends on frame rate
//  - bodies/colliders are always created in the same order (level array order)
//  - shot input is a pair of integers; direction uses detmath (no Math.sin/cos)
//  - between shots the world is frozen, so how long a player waits does not matter
//  - broken cages are removed in index order after each step
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
export const CAGE_FALL_Y = -0.6; // a cage below the platform top has fallen off the edge and shatters

// Tunable physical parameters (kept here so the bot and the client agree).
export const PARAMS = {
  woodDensity: 1.0,
  ballDensity: 9.0,
  cageDensity: 1.2,
  woodFriction: 1.0,
  woodRestitution: 0.05,
  ballRestitution: 0.15,
  groundFriction: 1.0,
  cageBreakForce: 90, // N, total contact force needed to shatter a cage
  fxImpactForce: 25,  // N, only used for sound/particles, never affects physics
};

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

// Horizontal extent of a level's structure (side profile).
export function levelBounds(level) {
  let zMin = Infinity, zMax = -Infinity, yMax = 0;
  const add = (z, d, top) => { zMin = Math.min(zMin, z - d / 2); zMax = Math.max(zMax, z + d / 2); yMax = Math.max(yMax, top); };
  for (const s of level.statics || []) add(s.z, s.d, s.y + s.h / 2);
  for (const b of level.blocks) add(b.z, b.d, b.y + b.h / 2);
  for (const c of level.cages) add(c.z, CAGE_SIZE, c.y + CAGE_SIZE / 2);
  return { zMin, zMax, yMax };
}

// The playable ice platform. Anything pushed past its edges falls into the valley.
export function arenaOf(level) {
  const b = levelBounds(level);
  return { xHalf: 3.2, zMin: LAUNCHER.z - 2.5, zMax: b.zMax + 1.6 };
}

let rapierReady = null;
export function initPhysics() {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

export function launchVelocity(level, mode, a, b) {
  const lim = INPUT[mode];
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error('input must be integers');
  if (a < lim.a.min || a > lim.a.max || b < lim.b.min || b > lim.b.max) throw new Error('input out of range');
  if (mode === '3d') {
    const s = level.speed;
    const cp = cosTenth(b);
    // positive yaw = to the player's right on screen (camera looks along +z, right is -x)
    return { x: -sinTenth(a) * cp * s, y: sinTenth(b) * s, z: cosTenth(a) * cp * s };
  }
  // 2.5D: power maps linearly to speed range
  const s = level.speed * (0.35 + (0.80 * (b - lim.b.min)) / (lim.b.max - lim.b.min));
  return { x: 0, y: sinTenth(a) * s, z: cosTenth(a) * s };
}

// Same integration scheme as the physics engine for a free body
// (velocity first, then position), used for the aiming preview only.
export function previewPath(level, mode, a, b, steps) {
  const v = launchVelocity(level, mode, a, b);
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
    this.shotsLeft = level.shots;
    this.shots = [];
    this.phase = 'setup';
    this.bodies = []; // ordered list: {id, kind, body, size, alive}
    this.cages = [];
    this.ball = null;
    this.colliderInfo = new Map(); // collider handle -> body entry
    this.calm = 0;
    this.flightSteps = 0;
    this.pendingFx = [];
    this.breakEnabled = false;
    this._build();
    this.initialHash = this.hash();
    // let the structure settle, breaking disabled, then freeze for aiming
    for (let i = 0; i < PRE_SETTLE_STEPS; i++) this._stepPhysics();
    this.pendingFx.length = 0;
    this.breakEnabled = true;
    this.readyHash = this.hash();
    this.phase = 'aim';
  }

  // Both camera modes use the same full 3D physics. In 2.5D every shot is in
  // the x = 0 plane (no yaw), so symmetric extruded layouts stay in that plane.
  // Axis locks are deliberately NOT used: with this engine build, bodies with
  // locked axes received no ground friction and slid indefinitely.
  _lock(desc) {
    return desc;
  }

  _addStatic(b, kind = 'static') {
    const d = RAPIER.RigidBodyDesc.fixed().setTranslation(0, b.y, b.z);
    const body = this.world.createRigidBody(d);
    const c = RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setFriction(PARAMS.groundFriction);
    const col = this.world.createCollider(c, body);
    const entry = { id: this.bodies.length, kind, fixed: true, body, size: [b.w, b.h, b.d], alive: true };
    this.bodies.push(entry);
    this.colliderInfo.set(col.handle, entry);
  }

  _addBlock(b) {
    const d = this._lock(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, b.y, b.z));
    const body = this.world.createRigidBody(d);
    const c = RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2)
      .setDensity(PARAMS.woodDensity)
      .setFriction(PARAMS.woodFriction)
      .setRestitution(PARAMS.woodRestitution);
    if (this.fx) {
      c.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
      c.setContactForceEventThreshold(PARAMS.fxImpactForce);
    }
    const col = this.world.createCollider(c, body);
    const entry = { id: this.bodies.length, kind: 'block', body, size: [b.w, b.h, b.d], alive: true };
    this.bodies.push(entry);
    this.colliderInfo.set(col.handle, entry);
  }

  _addCage(cg, index) {
    const s = CAGE_SIZE;
    const d = this._lock(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, cg.y, cg.z));
    const body = this.world.createRigidBody(d);
    const c = RAPIER.ColliderDesc.cuboid(s / 2, s / 2, s / 2)
      .setDensity(PARAMS.cageDensity)
      .setFriction(PARAMS.woodFriction)
      .setRestitution(0.05)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(PARAMS.cageBreakForce);
    const col = this.world.createCollider(c, body);
    const entry = { id: this.bodies.length, kind: 'cage', body, size: [s, s, s], alive: true, cageIndex: index, broken: false };
    this.bodies.push(entry);
    this.cages.push(entry);
    this.colliderInfo.set(col.handle, entry);
  }

  _build() {
    // ground: the ice platform, top at y = 0, with edges the player can see
    const ar = arenaOf(this.level);
    this._addStatic({ y: -0.5, z: (ar.zMin + ar.zMax) / 2, w: ar.xHalf * 2, h: 1, d: ar.zMax - ar.zMin }, 'ground');
    for (const s of this.level.statics || []) this._addStatic(s);
    for (const b of this.level.blocks) this._addBlock(b);
    this.level.cages.forEach((c, i) => this._addCage(c, i));
  }

  fire(a, b) {
    if (this.phase !== 'aim' || this.shotsLeft <= 0) return false;
    const v = launchVelocity(this.level, this.mode, a, b);
    const d = this._lock(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, LAUNCHER.y, LAUNCHER.z).setCcdEnabled(true));
    d.setLinvel(v.x, v.y, v.z);
    const body = this.world.createRigidBody(d);
    const c = RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setDensity(PARAMS.ballDensity)
      .setFriction(0.5)
      .setRestitution(PARAMS.ballRestitution);
    // the ball always reports contacts: after its first touch it gets rolling
    // resistance (damping) so it comes to rest instead of rolling forever
    c.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    c.setContactForceEventThreshold(0.5);
    const col = this.world.createCollider(c, body);
    const entry = { id: this.bodies.length, kind: 'ball', touched: false, body, size: [BALL_RADIUS * 2, BALL_RADIUS * 2, BALL_RADIUS * 2], alive: true };
    this.bodies.push(entry);
    this.colliderInfo.set(col.handle, entry);
    this.ball = entry;
    this.shots.push({ step: this.step, a, b });
    this.shotsLeft--;
    this.phase = 'flight';
    this.calm = 0;
    this.flightSteps = 0;
    this.pendingFx.push({ type: 'fire', step: this.step });
    return true;
  }

  _removeEntry(e) {
    if (!e.alive) return;
    e.alive = false;
    this.world.removeRigidBody(e.body);
  }

  _stepPhysics() {
    this.world.step(this.events);
    this.step++;
    const toBreak = [];
    let touchedBall = null;
    this.events.drainContactForceEvents((ev) => {
      const e1 = this.colliderInfo.get(ev.collider1());
      const e2 = this.colliderInfo.get(ev.collider2());
      const f = ev.totalForceMagnitude();
      for (const e of [e1, e2]) {
        if (e && e.kind === 'ball' && !e.touched) { e.touched = true; touchedBall = e; }
        if (e && e.kind === 'cage' && !e.broken && f >= PARAMS.cageBreakForce && this.breakEnabled) toBreak.push(e.cageIndex);
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
      touchedBall.body.setLinearDamping(0.8);
      touchedBall.body.setAngularDamping(3.0);
    }
    if (toBreak.length) {
      toBreak.sort((x, y) => x - y);
      for (const idx of toBreak) {
        const cg = this.cages[idx];
        if (cg.broken) continue;
        cg.broken = true;
        const t = cg.body.translation();
        const r = cg.body.rotation();
        this.pendingFx.push({ type: 'break', step: this.step, cage: idx, pos: [t.x, t.y, t.z], rot: [r.x, r.y, r.z, r.w] });
        this._removeEntry(cg);
      }
    }
    if (this.breakEnabled) {
      for (const cg of this.cages) {
        if (!cg.alive || cg.broken) continue;
        const t = cg.body.translation();
        if (t.y < CAGE_FALL_Y) {
          cg.broken = true;
          const r = cg.body.rotation();
          this.pendingFx.push({ type: 'break', step: this.step, cage: cg.cageIndex, fell: true, pos: [t.x, t.y, t.z], rot: [r.x, r.y, r.z, r.w] });
          this._removeEntry(cg);
        }
      }
    }
    // remove anything that fell out of the world (in list order)
    for (const e of this.bodies) {
      if (e.alive && !e.fixed && e.body.translation().y < KILL_Y) {
        if (e.kind === 'cage' && !e.broken) e.broken = true; // falling off the world also shatters it
        this._removeEntry(e);
      }
    }
  }

  cagesLeft() {
    let n = 0;
    for (const c of this.cages) if (!c.broken) n++;
    return n;
  }

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
    if (this.cagesLeft() === 0) {
      // keep simulating a short while for visuals; outcome is already decided
      this.won = true;
    }
    this.calm = this.isCalm() ? this.calm + 1 : 0;
    if (this.calm >= SETTLE_FRAMES || this.flightSteps >= MAX_FLIGHT_STEPS || (this.won && this.flightSteps >= 150)) {
      if (this.ball) { this._removeEntry(this.ball); this.ball = null; }
      if (this.cagesLeft() === 0) this.phase = 'won';
      else if (this.shotsLeft > 0) this.phase = 'aim';
      else this.phase = 'lost';
      this.pendingFx.push({ type: 'settled', step: this.step, phase: this.phase });
    }
    return this.phase === 'flight';
  }

  runShot(a, b) {
    if (!this.fire(a, b)) return false;
    while (this.tick()) { /* fixed steps, no wall clock */ }
    return true;
  }

  // Hash of the full dynamic state. Float32 bits of every body's pose in the
  // fixed body order, plus step count and cage flags.
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
    return hex32(fnv1a32(words));
  }

  poses() {
    const out = [];
    for (const e of this.bodies) {
      if (!e.alive) continue;
      const t = e.body.translation();
      const r = e.body.rotation();
      out.push({ id: e.id, kind: e.kind, size: e.size, cageIndex: e.cageIndex, p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w] });
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

// Replay a recorded numeric shot list and collect checkpoint hashes.
// Used both on desktop (reference) and on the phone (self-test).
export function replay(level, mode, shots, checkpointEvery = 30) {
  const sim = new Sim(level, mode);
  const out = { initial: sim.initialHash, ready: sim.readyHash, checkpoints: [], shotSteps: [], finalStep: 0, final: '', phase: '' };
  for (const s of shots) {
    if (sim.phase !== 'aim') break;
    out.shotSteps.push(sim.step);
    sim.fire(s.a, s.b);
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
