// Rendering only. Nothing here feeds back into the simulation, so visual
// randomness (particles, shake) is allowed and uses Math.random.
import * as THREE from 'three';
import { LAUNCHER, CAGE_SIZE, BALL_RADIUS, AMMO, TOTEM, NEST, levelBounds, arenaOf } from './sim.js';

const COLORS = {
  horizon: 0xd7ebf3,
  snow: 0xeef5f9,
  grid: 0xb9d3e0,
  wood: 0xc9925a,
  stone: 0x7d8ea3,
  ice: 0x9fe3f5,
  ember: 0xff7a3d,
  ink: 0x1b2a41,
};

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#eef5f9';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120,160,185,0.28)';
  g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 51.2) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  g.strokeStyle = 'rgba(90,130,160,0.45)';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40); // one tile = 5 m, fine lines every 1 m
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeCritter() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshLambertMaterial({ color: 0x22314a }));
  body.scale.set(1, 1.25, 0.95);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  belly.position.set(0, -0.03, -0.09);
  belly.scale.set(1, 1.2, 0.6);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8), new THREE.MeshLambertMaterial({ color: COLORS.ember }));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.1, -0.22);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x0b1320 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeM);
  const e2 = e1.clone();
  e1.position.set(0.07, 0.17, -0.18);
  e2.position.set(-0.07, 0.17, -0.18);
  g.add(body, belly, beak, e1, e2);
  return g;
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(COLORS.horizon, 34, 95);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.baseCamPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();

    const hemi = new THREE.HemisphereLight(0xe6f4ff, 0xb8c7d4, 1.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
    sun.position.set(-8, 14, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 50;
    sun.shadow.bias = -0.0006;
    sun.target.position.set(0, 0, 2);
    this.scene.add(sun, sun.target);

    // ice platform (rebuilt per level) above a distant snowy valley
    this.gridTex = gridTexture();
    this.island = new THREE.Group();
    this.scene.add(this.island);
    const valley = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0xdcebf3 }));
    valley.rotation.x = -Math.PI / 2;
    valley.position.y = -14;
    this.scene.add(valley);

    // launcher
    this.launcher = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 20), new THREE.MeshLambertMaterial({ color: COLORS.stone }));
    base.position.y = -0.75;
    base.castShadow = true;
    this.barrelPivot = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.3, 16), new THREE.MeshLambertMaterial({ color: 0x2c3a52 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.35;
    barrel.castShadow = true;
    this.barrelPivot.add(barrel);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.3), new THREE.MeshLambertMaterial({ color: COLORS.stone }));
    post.position.y = -0.35;
    this.launcher.add(base, post, this.barrelPivot);
    this.launcher.position.set(0, LAUNCHER.y, LAUNCHER.z);
    this.scene.add(this.launcher);

    // shared geometry/materials
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.edgeGeo = new THREE.EdgesGeometry(this.boxGeo);
    this.woodMats = [0xc9925a, 0xbf8750, 0xd29d66].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    this.stoneMat = new THREE.MeshLambertMaterial({ color: COLORS.stone });
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x5b4029, transparent: true, opacity: 0.55 });
    this.stoneEdgeMat = new THREE.LineBasicMaterial({ color: 0x4b5a6e, transparent: true, opacity: 0.6 });
    this.cageMat = new THREE.MeshPhongMaterial({ color: COLORS.ice, transparent: true, opacity: 0.5, shininess: 90, specular: 0xffffff, depthWrite: false });
    this.cageEdgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    // faint outline drawn on top of everything, so a hidden cage is still located (both camera modes)
    this.cageXrayMat = new THREE.LineBasicMaterial({ color: 0x2f8fae, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false });
    this.ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 20, 14);
    this.ballMat = new THREE.MeshLambertMaterial({ color: COLORS.ember, emissive: 0xff4a10, emissiveIntensity: 0.55 });
    // v4 materials
    this.stoneBlockMat = new THREE.MeshLambertMaterial({ color: 0x6b7686 });
    this.stoneBlockEdge = new THREE.LineBasicMaterial({ color: 0x3a4452, transparent: true, opacity: 0.7 });
    this.iceBlockMat = new THREE.MeshPhongMaterial({ color: 0xc6f0fb, transparent: true, opacity: 0.72, shininess: 110, specular: 0xffffff });
    this.iceBlockEdge = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    this.totemMat = new THREE.MeshLambertMaterial({ color: 0x5b3f8c });
    this.totemCapMat = new THREE.MeshLambertMaterial({ color: 0x8a6cc4 });
    this.totemXray = new THREE.LineBasicMaterial({ color: 0x7a55c8, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false });
    this.nestMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
    this.eggMat = new THREE.MeshLambertMaterial({ color: 0xfaf6ea });
    this.nestXray = new THREE.LineBasicMaterial({ color: 0xc98a3a, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false });
    this.ammoLook = {
      normal: { geo: this.ballGeo, mat: this.ballMat },
      heavy: { geo: new THREE.SphereGeometry(AMMO.heavy.radius, 20, 14), mat: new THREE.MeshLambertMaterial({ color: 0x3d4654 }) },
      ember: { geo: new THREE.SphereGeometry(AMMO.ember.radius, 20, 14), mat: new THREE.MeshLambertMaterial({ color: 0xff3b1f, emissive: 0xff2a00, emissiveIntensity: 1.0 }) },
    };
    this.flashes = [];

    // aiming preview: dots up to the first predicted contact + a ring at that point
    const N = 48;
    this.previewDots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: COLORS.ember }), N);
    this.previewShadows = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0x1b2a41, transparent: true, opacity: 0.22, depthWrite: false }), N);
    this.previewDots.frustumCulled = false;
    this.previewShadows.frustumCulled = false;
    this.previewDots.visible = this.previewShadows.visible = false;
    this.scene.add(this.previewDots, this.previewShadows);
    this.impactMarker = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.ember, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 32), ringMat);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), ringMat);
    ring.renderOrder = dot.renderOrder = 11;
    this.impactMarker.add(ring, dot);
    this.impactMarker.visible = false;
    this.scene.add(this.impactMarker);
    this.blastRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0xff3b1f, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }));
    this.blastRing.rotation.x = -Math.PI / 2;
    this.blastRing.renderOrder = 11;
    this.blastRing.visible = false;
    this.scene.add(this.blastRing);
    // the ball waiting in the launcher while aiming
    this.loadedBall = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 20, 14), new THREE.MeshLambertMaterial({ color: COLORS.ember, emissive: 0xff4a10, emissiveIntensity: 0.55 }));
    this.loadedBall.position.set(0, LAUNCHER.y, LAUNCHER.z);
    this.loadedBall.visible = false;
    this.scene.add(this.loadedBall);

    // particles
    this.pMax = 360;
    this.particles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.pMax);
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles.frustumCulled = false;
    this.pData = [];
    for (let i = 0; i < this.pMax; i++) {
      this.pData.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), rv: new THREE.Vector3(), s: 0.1 });
      this.particles.setColorAt(i, new THREE.Color(1, 1, 1));
    }
    this.pNext = 0;
    this.scene.add(this.particles);
    this._tmpM = new THREE.Matrix4();
    this._tmpQ = new THREE.Quaternion();
    this._tmpV = new THREE.Vector3();
    this._tmpS = new THREE.Vector3();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.pMax; i++) this.particles.setMatrixAt(i, this._zero);

    this.meshes = new Map();
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    this.critters = [];
    this.shake = 0;
    this.time = 0;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewW = w;
    this.viewH = h;
    if (this.level) this.frame(this.level, this.mode);
  }

  clearLevel() {
    for (const m of this.meshes.values()) this.levelGroup.remove(m);
    this.meshes.clear();
    for (const c of this.critters) this.scene.remove(c.obj);
    this.critters = [];
    for (const f of this.flashes) this.scene.remove(f.mesh);
    this.flashes = [];
    for (let i = 0; i < this.pMax; i++) { this.pData[i].life = 0; this.particles.setMatrixAt(i, this._zero); }
    this.particles.instanceMatrix.needsUpdate = true;
  }

  buildIsland(level) {
    while (this.island.children.length) this.island.remove(this.island.children[0]);
    const ar = arenaOf(level);
    this.arena = ar;
    const w = ar.xHalf * 2, d = ar.zMax - ar.zMin, zc = (ar.zMin + ar.zMax) / 2;
    const tex = this.gridTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(w / 5, d / 5);
    tex.offset.set(0, 0);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tex }));
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, 0, zc);
    top.receiveShadow = true;
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(w, 5, d), new THREE.MeshLambertMaterial({ color: 0x9fc4d8 }));
    cliff.position.set(0, -2.505, zc);
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.02, d)), new THREE.LineBasicMaterial({ color: 0x2f8fae }));
    rim.position.set(0, 0.012, zc);
    this.island.add(top, cliff, rim);
  }

  loadLevel(level, mode, poses) {
    this.clearLevel();
    this.level = level;
    this.mode = mode;
    this.buildIsland(level);
    for (const b of poses) this._ensureMesh(b);
    this.frame(level, mode);
    this.setAim(null);
  }

  _ensureMesh(b) {
    if (this.meshes.has(b.id)) return this.meshes.get(b.id);
    let obj;
    if (b.kind === 'ground') {
      obj = new THREE.Group();
      obj.visible = false;
    } else if (b.kind === 'ball') {
      const look = this.ammoLook[b.ammo || 'normal'];
      obj = new THREE.Mesh(look.geo, look.mat);
      obj.castShadow = true;
    } else if (b.kind === 'totem') {
      obj = new THREE.Group();
      const body = new THREE.Mesh(this.boxGeo, this.totemMat);
      body.scale.set(TOTEM.w, TOTEM.h, TOTEM.d);
      body.castShadow = true;
      const cap = new THREE.Mesh(this.boxGeo, this.totemCapMat);
      cap.scale.set(TOTEM.w * 1.25, 0.16, TOTEM.d * 1.25);
      cap.position.y = TOTEM.h / 2 - 0.02;
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7ff0ff });
      const e1 = new THREE.Mesh(this.boxGeo, eyeMat), e2 = new THREE.Mesh(this.boxGeo, eyeMat);
      e1.scale.set(0.1, 0.07, 0.02); e2.scale.copy(e1.scale);
      e1.position.set(0.1, 0.35, -TOTEM.d / 2 - 0.011); e2.position.set(-0.1, 0.35, -TOTEM.d / 2 - 0.011);
      const xray = new THREE.LineSegments(this.edgeGeo, this.totemXray);
      xray.scale.set(TOTEM.w, TOTEM.h, TOTEM.d);
      xray.renderOrder = 10;
      obj.add(body, cap, e1, e2, xray);
      obj.userData.solid = body;
      obj.userData.eyes = eyeMat;
      obj.userData.size = [TOTEM.w, TOTEM.h, TOTEM.d];
    } else if (b.kind === 'nest') {
      obj = new THREE.Group();
      const base = new THREE.Mesh(this.boxGeo, this.nestMat);
      base.scale.set(NEST.w * 0.9, NEST.h * 0.5, NEST.d * 0.9);
      base.position.y = -NEST.h * 0.25;
      base.castShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(NEST.w * 0.4, 0.09, 8, 20), this.nestMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.02;
      const eggs = new THREE.Group();
      for (const [ex, ez] of [[0.12, 0.05], [-0.12, 0.06], [0, -0.12]]) {
        const egg = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), this.eggMat);
        egg.scale.set(1, 1.3, 1);
        egg.position.set(ex, 0.08, ez);
        eggs.add(egg);
      }
      const xray = new THREE.LineSegments(this.edgeGeo, this.nestXray);
      xray.scale.set(NEST.w, NEST.h, NEST.d);
      xray.renderOrder = 10;
      obj.add(base, rim, eggs, xray);
      obj.userData.solid = base;
      obj.userData.eggs = eggs;
      obj.userData.size = [NEST.w, NEST.h, NEST.d];
    } else if (b.kind === 'cage') {
      obj = new THREE.Group();
      const critter = makeCritter();
      critter.position.y = -0.08;
      obj.add(critter);
      const shell = new THREE.Mesh(this.boxGeo, this.cageMat);
      shell.scale.setScalar(CAGE_SIZE);
      shell.renderOrder = 2;
      const edges = new THREE.LineSegments(this.edgeGeo, this.cageEdgeMat);
      edges.scale.setScalar(CAGE_SIZE);
      const xray = new THREE.LineSegments(this.edgeGeo, this.cageXrayMat);
      xray.scale.setScalar(CAGE_SIZE);
      xray.renderOrder = 10;
      obj.add(shell, edges, xray);
      obj.userData.critter = critter;
      obj.userData.shell = shell;
      obj.userData.size = [CAGE_SIZE, CAGE_SIZE, CAGE_SIZE];
      shell.castShadow = true;
    } else {
      obj = new THREE.Group();
      const stat = b.kind === 'static';
      const ice = b.kind === 'ice';
      const stone = b.mat === 'stone';
      const mat = stat ? this.stoneMat : ice ? this.iceBlockMat : stone ? this.stoneBlockMat : this.woodMats[b.id % 3];
      const mesh = new THREE.Mesh(this.boxGeo, mat);
      mesh.scale.set(b.size[0], b.size[1], b.size[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const edges = new THREE.LineSegments(this.edgeGeo, stat ? this.stoneEdgeMat : ice ? this.iceBlockEdge : stone ? this.stoneBlockEdge : this.edgeMat);
      edges.scale.copy(mesh.scale);
      if (ice) mesh.renderOrder = 1;
      obj.add(mesh, edges);
      obj.userData.solid = mesh;
    }
    obj.userData.kind = b.kind;
    obj.position.set(b.p[0], b.p[1], b.p[2]);
    obj.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    this.levelGroup.add(obj);
    this.meshes.set(b.id, obj);
    return obj;
  }

  removeBody(id) {
    const m = this.meshes.get(id);
    if (m) { this.levelGroup.remove(m); this.meshes.delete(id); }
    return m;
  }

  // prev/curr are arrays from Sim.poses(); alpha in [0,1] interpolates.
  sync(prev, curr, alpha) {
    const prevMap = this._prevMap || new Map();
    prevMap.clear();
    if (prev) for (const b of prev) prevMap.set(b.id, b);
    this._prevMap = prevMap;
    const seen = new Set();
    for (const b of curr) {
      const obj = this._ensureMesh(b);
      seen.add(b.id);
      const a = prevMap.get(b.id);
      if (a && alpha < 1) {
        obj.position.set(a.p[0] + (b.p[0] - a.p[0]) * alpha, a.p[1] + (b.p[1] - a.p[1]) * alpha, a.p[2] + (b.p[2] - a.p[2]) * alpha);
        this._tmpQ.set(a.q[0], a.q[1], a.q[2], a.q[3]);
        obj.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
        obj.quaternion.slerp(this._tmpQ, 1 - alpha);
      } else {
        obj.position.set(b.p[0], b.p[1], b.p[2]);
        obj.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
      }
    }
    for (const id of [...this.meshes.keys()]) if (!seen.has(id)) this.removeBody(id);
  }

  frame(level, mode) {
    const { zMin, zMax, yMax } = levelBounds(level);
    const aspect = this.camera.aspect;
    const cam = this.camera;
    if (mode === '3d') {
      // behind and above the launcher, slightly telephoto so the structure reads larger
      cam.fov = aspect < 0.62 ? 44 : 36;
      const zMid = (zMin + zMax) / 2;
      const depth = zMax - LAUNCHER.z;
      this.baseCamPos.set(0, 7.4 + yMax * 0.45 + depth * 0.08, LAUNCHER.z - 7.0);
      // aim the view so the launcher (and the loaded ball) sits ~15 deg above the bottom edge
      this.camTarget.set(0, 0.4 + yMax * 0.2, LAUNCHER.z + 7.0 + depth * 0.06);
      this.scene.fog.near = 34; this.scene.fog.far = 95;
    } else {
      // side view: the whole launcher-to-structure span must fit the screen width
      cam.fov = 28;
      const left = LAUNCHER.z - 0.9;
      const right = zMax + 2.1; // platform edge (zMax + 1.6) stays visible
      const halfW = (right - left) / 2;
      const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const D = halfW / (t * aspect);
      const halfH = D * t;
      const elev = THREE.MathUtils.degToRad(9);
      const yc = Math.max(yMax * 0.55, 0.5 * halfH - 0.6); // ground in the lower part of the screen
      this.baseCamPos.set(-D * Math.cos(elev), yc + D * Math.sin(elev), (left + right) / 2);
      this.camTarget.set(0, yc, (left + right) / 2);
      this.scene.fog.near = D + 25; this.scene.fog.far = D + 120; // no wash-out at long camera distance
    }
    cam.updateProjectionMatrix();
    cam.position.copy(this.baseCamPos);
    cam.lookAt(this.camTarget);
    this.previewScale = mode === '3d' ? 1 : Math.max(2.4, (zMax - LAUNCHER.z) / 6); // keep dots ~4 px wide at side-view distance
    this.loadedBall.scale.setScalar(1);
  }

  setLoaded(v, type) {
    this.loadedBall.visible = v;
    if (type && this.ammoLook[type]) {
      this.loadedBall.geometry = this.ammoLook[type].geo;
      this.loadedBall.material = this.ammoLook[type].mat;
    }
  }

  // First contact of the free-flight path with any solid in the scene or the ground.
  // Returns the path cut at that point plus the contact point and surface normal.
  predictImpact(path) {
    const ray = this._ray || (this._ray = new THREE.Raycaster());
    const solids = [];
    for (const m of this.meshes.values()) {
      if (!m.visible) continue;
      if (m.userData.solid) solids.push(m.userData.solid);
      else if (m.userData.shell) solids.push(m.userData.shell);
    }
    this.levelGroup.updateMatrixWorld(true);
    const a = new THREE.Vector3(0, LAUNCHER.y, LAUNCHER.z);
    const b = new THREE.Vector3();
    const dir = new THREE.Vector3();
    for (let i = 0; i < path.length; i++) {
      b.set(path[i][0], path[i][1], path[i][2]);
      dir.subVectors(b, a);
      const len = dir.length();
      if (len > 1e-6) {
        ray.set(a, dir.divideScalar(len));
        ray.far = len + BALL_RADIUS;
        const hit = ray.intersectObjects(solids, false)[0];
        if (hit) {
          const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
          return { cut: i, point: hit.point.clone(), normal: n };
        }
      }
      const ar = this.arena;
      const onPlatform = ar && Math.abs(b.x) <= ar.xHalf && b.z >= ar.zMin && b.z <= ar.zMax;
      if (b.y <= BALL_RADIUS && onPlatform) return { cut: i, point: new THREE.Vector3(b.x, 0.01, b.z), normal: new THREE.Vector3(0, 1, 0) };
      if (b.y < -3) return null; // flies past the edge into the valley
      a.copy(b);
    }
    return null;
  }

  setAim(vel, path, blastRadius = 0) {
    if (!vel) {
      this.previewDots.visible = this.previewShadows.visible = false;
      this.impactMarker.visible = false;
      this.blastRing.visible = false;
      return;
    }
    // barrel direction
    const len = Math.hypot(vel.x, vel.y, vel.z);
    this._tmpV.set(vel.x / len, vel.y / len, vel.z / len);
    this.barrelPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._tmpV);
    const impact = this.predictImpact(path);
    const end = impact ? impact.cut : path.length - 1;
    const every = 3;
    const max = this.previewDots.instanceMatrix.count;
    const s = 0.075 * this.previewScale;
    let n = 0;
    for (let i = every - 1; i < end && n < max; i += every, n++) {
      const pt = path[i];
      this._tmpM.makeScale(s, s, s).setPosition(pt[0], pt[1], pt[2]);
      this.previewDots.setMatrixAt(n, this._tmpM);
      // ground shadow dot (3D only): depth cue under the arc
      const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      m.scale(this._tmpS.set(s * 1.1, s * 1.1, 1)).setPosition(pt[0], 0.012, pt[2]);
      this.previewShadows.setMatrixAt(n, m);
    }
    this.previewDots.count = n;
    this.previewShadows.count = n;
    this.previewDots.instanceMatrix.needsUpdate = true;
    this.previewShadows.instanceMatrix.needsUpdate = true;
    this.previewDots.visible = true;
    this.previewShadows.visible = this.mode === '3d';
    if (impact) {
      const k = this.mode === '3d' ? 1 : this.previewScale * 0.7;
      this.impactMarker.position.copy(impact.point).addScaledVector(impact.normal, 0.02);
      this.impactMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), impact.normal);
      this.impactMarker.scale.setScalar(k);
      this.impactMarker.visible = true;
      if (blastRadius > 0) {
        this.blastRing.position.set(impact.point.x, impact.point.y + 0.03, impact.point.z);
        this.blastRing.scale.setScalar(blastRadius);
        this.blastRing.visible = true;
      } else this.blastRing.visible = false;
    } else { this.impactMarker.visible = false; this.blastRing.visible = false; }
  }

  spawn(pos, count, color, speed, size, up = 1) {
    const col = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const k = this.pNext;
      this.pNext = (this.pNext + 1) % this.pMax;
      const d = this.pData[k];
      d.life = 0.7 + Math.random() * 0.7;
      d.p.set(pos[0] + (Math.random() - 0.5) * 0.4, pos[1] + (Math.random() - 0.5) * 0.4, pos[2] + (Math.random() - 0.5) * 0.4);
      d.v.set((Math.random() - 0.5) * speed, Math.random() * speed * up, (Math.random() - 0.5) * speed);
      if (this.mode === '25d') d.v.x *= 0.5;
      d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.rv.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      d.s = size * (0.6 + Math.random() * 0.8);
      this.particles.setColorAt(k, col);
    }
    this.particles.instanceColor.needsUpdate = true;
  }

  onBreak(ev) {
    const m = this.removeBody(this.cageBodyIdFor(ev.cage));
    this.spawn(ev.pos, 34, 0xbfeefa, 6.5, 0.14, 1.2);
    this.spawn(ev.pos, 14, 0xffffff, 4, 0.1, 1.4);
    this.shake = Math.max(this.shake, 0.12);
    if (m) {
      const critter = m.userData.critter;
      const world = new THREE.Vector3();
      critter.getWorldPosition(world);
      m.remove(critter);
      critter.position.copy(world);
      critter.rotation.set(0, Math.PI, 0);
      this.scene.add(critter);
      this.critters.push({ obj: critter, t: 0, from: world.clone() });
    }
  }

  onImpact(ev) {
    const f = Math.min(1, ev.force / 400);
    const k = ev.kinds || [];
    if ((k.includes('static') || k.includes('ground')) && k.includes('ball')) this.spawn(ev.pos, 5, 0xffffff, 2.5, 0.12);
    else this.spawn(ev.pos, 2 + Math.round(f * 6), COLORS.wood, 3 + f * 3, 0.08);
    this.shake = Math.max(this.shake, 0.02 + f * 0.05);
  }

  setTargetMaps(maps) { this.targetMaps = maps; }
  cageBodyIdFor(idx) { return this.targetMaps ? this.targetMaps.cages[idx] : -1; }

  onShatter(ev) {
    this.removeBody(ev.id);
    this.spawn(ev.pos, 26, 0xd8f6ff, 5, 0.13, 1.0);
    this.shake = Math.max(this.shake, 0.06);
  }

  onExplode(ev) {
    this.spawn(ev.pos, 48, 0xff7a1f, 9, 0.16, 1.2);
    this.spawn(ev.pos, 24, 0xffd23f, 7, 0.12, 1.4);
    this.spawn(ev.pos, 16, 0xffffff, 5, 0.1, 1.2);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.55, depthWrite: false }));
    flash.position.set(ev.pos[0], ev.pos[1], ev.pos[2]);
    this.scene.add(flash);
    this.flashes.push({ mesh: flash, t: 0, R: ev.radius });
    this.shake = Math.max(this.shake, 0.2);
  }

  onTotem(ev) {
    const id = this.targetMaps ? this.targetMaps.totems[ev.totem] : -1;
    const m = this.meshes.get(id);
    if (m && m.userData.eyes) m.userData.eyes.color.set(0x2a2140);
    this.spawn(ev.pos, 22, 0xb18cff, 4, 0.1, 1.3);
  }

  onNest(ev) {
    const id = this.targetMaps ? this.targetMaps.nests[ev.nest] : -1;
    const m = this.meshes.get(id);
    if (m && m.userData.eggs) for (const egg of m.userData.eggs.children) { egg.material = new THREE.MeshLambertMaterial({ color: 0xffd23f }); egg.scale.set(1.2, 0.5, 1.2); }
    this.spawn(ev.pos, 18, 0xffd23f, 3, 0.09, 1.2);
    this.shake = Math.max(this.shake, 0.08);
  }

  // Objective readability metrics for the current camera and screen size,
  // for every target (cages, totems, nests).
  measureTargets() {
    const out = [];
    const ray = new THREE.Raycaster();
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    for (const [id, m] of this.meshes) {
      const kind = m.userData.kind;
      if (kind !== 'cage' && kind !== 'totem' && kind !== 'nest') continue;
      const occluders = [];
      for (const o of this.meshes.values()) if (o !== m && o.userData.solid && o.visible) occluders.push(o.userData.solid);
      const size = m.userData.size;
      const c = m.position;
      let vis = 0, tot = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const pt = new THREE.Vector3(c.x + i * size[0] * 0.42, c.y + j * size[1] * 0.42, c.z + k * size[2] * 0.42);
        const dir = pt.clone().sub(this.camera.position);
        const dist = dir.length();
        ray.set(this.camera.position, dir.normalize());
        ray.far = dist;
        const hits = ray.intersectObjects(occluders, false);
        tot++;
        if (!hits.length || hits[0].distance > dist - 0.05) vis++;
      }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) for (let k = -1; k <= 1; k += 2) {
        const p = new THREE.Vector3(c.x + i * size[0] / 2, c.y + j * size[1] / 2, c.z + k * size[2] / 2).project(this.camera);
        const sx = (p.x * 0.5 + 0.5) * this.viewW;
        const sy = (-p.y * 0.5 + 0.5) * this.viewH;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      out.push({ id, kind, visible: vis / tot, px: Math.min(x1 - x0, y1 - y0), sx: (x0 + x1) / 2, sy: (y0 + y1) / 2 });
    }
    return out;
  }

  render(dt) {
    this.time += dt;
    // particles
    let any = false;
    for (let i = 0; i < this.pMax; i++) {
      const d = this.pData[i];
      if (d.life <= 0) continue;
      any = true;
      d.life -= dt;
      d.v.y -= 9.8 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < 0.05) { d.p.y = 0.05; d.v.multiplyScalar(0.4); d.v.y = Math.abs(d.v.y) * 0.3; }
      d.r.x += d.rv.x * dt; d.r.y += d.rv.y * dt; d.r.z += d.rv.z * dt;
      const s = d.life > 0 ? d.s * Math.min(1, d.life * 2.5) : 0;
      this._tmpQ.setFromEuler(d.r);
      this._tmpM.compose(d.p, this._tmpQ, this._tmpS.set(s, s, s));
      this.particles.setMatrixAt(i, d.life > 0 ? this._tmpM : this._zero);
    }
    if (any) this.particles.instanceMatrix.needsUpdate = true;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const u = Math.min(1, f.t / 0.35);
      f.mesh.scale.setScalar(0.3 + u * f.R);
      f.mesh.material.opacity = 0.55 * (1 - u);
      if (u >= 1) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); this.flashes.splice(i, 1); }
    }
    this.ammoLook.ember.mat.emissiveIntensity = 0.8 + Math.sin(this.time * 9) * 0.3;
    // rescued critters hop and float away
    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      c.t += dt;
      const t = c.t;
      if (t < 0.55) {
        c.obj.position.set(c.from.x, c.from.y + Math.sin((t / 0.55) * Math.PI) * 1.1, c.from.z);
        c.obj.rotation.y = Math.PI + t * 12;
      } else {
        const u = t - 0.55;
        c.obj.position.set(c.from.x, c.from.y + u * u * 9 + u * 2, c.from.z);
        c.obj.rotation.y = Math.PI + Math.sin(u * 10) * 0.4;
        c.obj.scale.setScalar(Math.max(0.01, 1 - u * 0.5));
      }
      if (t > 2.4) { this.scene.remove(c.obj); this.critters.splice(i, 1); }
    }
    // camera shake (visual only): small damped oscillation, no per-frame random jitter
    this.camera.position.copy(this.baseCamPos);
    if (this.shake > 0.002) {
      const s = this.shake;
      const t = this.time;
      this.camera.position.y += Math.sin(t * 34) * s;
      if (this.mode === '3d') this.camera.position.x += Math.sin(t * 27 + 1.3) * s * 0.6;
      else this.camera.position.z += Math.sin(t * 27 + 1.3) * s * 0.6;
      this.shake *= Math.pow(0.004, dt);
    }
    this.camera.lookAt(this.camTarget);
    this.renderer.render(this.scene, this.camera);
  }
}
