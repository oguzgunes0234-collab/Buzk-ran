import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { initPhysics } from '../src/sim.js';
await initPhysics();
function run(lock, bodyKind) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.numSolverIterations = 8;
  const g = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(3.2, 0.5, 20).setFriction(1.0), g);
  const d = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.402, 0).setLinvel(0, 0, -3);
  if (lock === 'plane') { d.enabledTranslations(false, true, true); d.enabledRotations(true, false, false); }
  const b = world.createRigidBody(d);
  const c = bodyKind === 'cube' ? RAPIER.ColliderDesc.cuboid(0.4, 0.4, 0.4) : RAPIER.ColliderDesc.cuboid(0.7, 0.4, 0.4);
  world.createCollider(c.setDensity(1.2).setFriction(1.0), b);
  const out = [];
  for (let i = 1; i <= 60; i++) { world.step(); if (i % 10 === 0) out.push(b.linvel().z.toFixed(2)); }
  world.free();
  return out.join(' ');
}
console.log('3D kup      vz:', run('none', 'cube'));
console.log('2.5D kup    vz:', run('plane', 'cube'));
console.log('3D genis    vz:', run('none', 'wide'));
console.log('2.5D genis  vz:', run('plane', 'wide'));
