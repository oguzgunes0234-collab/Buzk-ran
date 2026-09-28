class_name Sim
extends RefCounted
## Deterministic simulation core, shared by the game, the test bot and the
## determinism self-test. No rendering, no timing, no randomness here.
##
## Determinism rules (same as the web prototype):
##  - the physics space is stepped by hand with a fixed step (DT); the game's
##    frame rate never changes the result, and the world is frozen between shots
##  - bodies are always created in the same order (level array order)
##  - a shot is an ammo type plus two integers; direction uses DetMath
##  - breaks, explosions and goal checks run in fixed body order
##  - every decision uses scalar double math in GDScript, never engine vector
##    math (see detmath.gd)


var level: Dictionary
var fx := false
var space: RID
var step := 0
var ammo := {}
var shots: Array = []
var phase := "setup"
var bodies: Array = [] # entries in creation order
var cages: Array = []
var totems: Array = []
var nests: Array = []
var ball = null
var by_rid := {} # RID id -> entry
var calm := 0
var flight_steps := 0
var pending_fx: Array = []
var break_enabled := false
var fail_reason := ""
var won := false
var initial_hash := ""
var ready_hash := ""


func _init(p_level: Dictionary, p_fx := false) -> void:
	level = p_level
	fx = p_fx
	space = PhysicsServer3D.space_create()
	PhysicsServer3D.space_set_active(space, false) # stepped by hand only
	PhysicsServer3D.area_set_param(space, PhysicsServer3D.AREA_PARAM_GRAVITY, -SimConfig.GRAVITY)
	PhysicsServer3D.area_set_param(space, PhysicsServer3D.AREA_PARAM_GRAVITY_VECTOR, Vector3(0, -1, 0))
	ammo = SimConfig.ammo_counts(level)
	_build()
	initial_hash = hash_state()
	# let the structure settle with breaking disabled, then freeze for aiming
	for i in SimConfig.PRE_SETTLE_STEPS:
		_step_physics()
	pending_fx.clear()
	for t in totems:
		t.y0 = _pos(t).y
	for n in nests:
		n.y0 = _pos(n).y
	break_enabled = true
	ready_hash = hash_state()
	phase = "aim"


func shots_left() -> int:
	var n := 0
	for t in SimConfig.AMMO_ORDER:
		n += ammo[t]
	return n


# --- body creation ------------------------------------------------------------

func _entry(kind: String, rid: RID, shape: RID, size: Vector3, extra := {}) -> Dictionary:
	var e := {"id": bodies.size(), "kind": kind, "rid": rid, "shape": shape, "size": size, "alive": true, "fixed": false}
	e.merge(extra, true)
	bodies.append(e)
	by_rid[rid.get_id()] = e
	return e


func _make_box(pos: Vector3, size: Vector3, rigid: bool, mass: float, friction: float, bounce: float, report: bool) -> Array:
	var rid := PhysicsServer3D.body_create()
	PhysicsServer3D.body_set_mode(rid, PhysicsServer3D.BODY_MODE_RIGID if rigid else PhysicsServer3D.BODY_MODE_STATIC)
	var shape := PhysicsServer3D.box_shape_create()
	PhysicsServer3D.shape_set_data(shape, Vector3(size.x / 2.0, size.y / 2.0, size.z / 2.0))
	PhysicsServer3D.body_add_shape(rid, shape)
	PhysicsServer3D.body_set_param(rid, PhysicsServer3D.BODY_PARAM_FRICTION, friction)
	PhysicsServer3D.body_set_param(rid, PhysicsServer3D.BODY_PARAM_BOUNCE, bounce)
	if rigid:
		PhysicsServer3D.body_set_param(rid, PhysicsServer3D.BODY_PARAM_MASS, mass)
	if report:
		PhysicsServer3D.body_set_max_contacts_reported(rid, 16)
	PhysicsServer3D.body_set_state(rid, PhysicsServer3D.BODY_STATE_TRANSFORM, Transform3D(Basis(), pos))
	PhysicsServer3D.body_set_space(rid, space)
	return [rid, shape]


func _add_static(s: Dictionary, kind := "static") -> Dictionary:
	var size := Vector3(s.w, s.h, s.d)
	var r := _make_box(Vector3(s.x, s.y, s.z), size, false, 0.0, SimConfig.GROUND.friction, SimConfig.GROUND.bounce, false)
	return _entry(kind, r[0], r[1], size, {"fixed": true})


func _add_block(b: Dictionary) -> Dictionary:
	var mat: String = b.get("mat", "wood")
	var m: Dictionary = SimConfig.MATERIALS[mat]
	var size := Vector3(b.w, b.h, b.d)
	var mass: float = m.density * b.w * b.h * b.d
	var r := _make_box(Vector3(b.x, b.y, b.z), size, true, mass, m.friction, m.bounce, fx or m.has("break_force"))
	return _entry("ice" if mat == "ice" else "block", r[0], r[1], size, {"mat": mat, "broken": false})


func _add_cage(c: Dictionary, index: int) -> void:
	var s := SimConfig.CAGE_SIZE
	var size := Vector3(s, s, s)
	var r := _make_box(Vector3(c.x, c.y, c.z), size, true, SimConfig.CAGE_DENSITY * s * s * s,
		SimConfig.CAGE_MAT.friction, SimConfig.CAGE_MAT.bounce, true)
	cages.append(_entry("cage", r[0], r[1], size, {"cage_index": index, "broken": false}))


func _add_totem(t: Dictionary, index: int) -> void:
	var mat: String = "stone" if t.get("mat", "wood") == "stone" else "wood"
	var m: Dictionary = SimConfig.TOTEM_MATS[mat]
	var size := SimConfig.TOTEM
	var r := _make_box(Vector3(t.x, t.y, t.z), size, true, m.density * size.x * size.y * size.z, m.friction, m.bounce, fx)
	totems.append(_entry("totem", r[0], r[1], size, {"totem_index": index, "down": false, "y0": t.y, "mat": mat}))


func _add_nest(n: Dictionary, index: int) -> void:
	var size := SimConfig.NEST
	var m := SimConfig.NEST_MAT
	var r := _make_box(Vector3(n.x, n.y, n.z), size, true, m.density * size.x * size.y * size.z, m.friction, m.bounce, true)
	nests.append(_entry("nest", r[0], r[1], size, {"nest_index": index, "broken": false, "y0": n.y}))


func _build() -> void:
	# ground: the ice platform, top at y = 0, with edges the player can see
	var ar := SimConfig.arena_of(level)
	_add_static({"x": 0.0, "y": -0.5, "z": (ar.z_min + ar.z_max) / 2.0, "w": ar.x_half * 2.0, "h": 1.0, "d": ar.z_max - ar.z_min}, "ground")
	for s in level.get("statics", []):
		_add_static(s)
	for b in level.get("blocks", []):
		_add_block(b)
	var i := 0
	for c in level.get("cages", []):
		_add_cage(c, i)
		i += 1
	i = 0
	for t in level.get("totems", []):
		_add_totem(t, i)
		i += 1
	i = 0
	for n in level.get("nests", []):
		_add_nest(n, i)
		i += 1


# --- shots ----------------------------------------------------------------------

func fire(a: int, b: int, type := "normal") -> bool:
	if phase != "aim" or not SimConfig.AMMO.has(type) or ammo[type] <= 0:
		return false
	var am: Dictionary = SimConfig.AMMO[type]
	var v := SimConfig.launch_velocity(level, a, b, type)
	var rid := PhysicsServer3D.body_create()
	PhysicsServer3D.body_set_mode(rid, PhysicsServer3D.BODY_MODE_RIGID)
	var shape := PhysicsServer3D.sphere_shape_create()
	PhysicsServer3D.shape_set_data(shape, am.radius)
	PhysicsServer3D.body_add_shape(rid, shape)
	var r: float = am.radius
	PhysicsServer3D.body_set_param(rid, PhysicsServer3D.BODY_PARAM_MASS, am.density * 4.0 / 3.0 * DetMath.PI_D * r * r * r)
	PhysicsServer3D.body_set_param(rid, PhysicsServer3D.BODY_PARAM_FRICTION, SimConfig.BALL_FRICTION)
	PhysicsServer3D.body_set_param(rid, PhysicsServer3D.BODY_PARAM_BOUNCE, am.bounce)
	PhysicsServer3D.body_set_enable_continuous_collision_detection(rid, true)
	# the ball always reports contacts: after its first touch it gets rolling
	# resistance (damping); an ember ball bursts on its first touch instead
	PhysicsServer3D.body_set_max_contacts_reported(rid, 16)
	PhysicsServer3D.body_set_state(rid, PhysicsServer3D.BODY_STATE_TRANSFORM, Transform3D(Basis(), SimConfig.LAUNCHER))
	PhysicsServer3D.body_set_space(rid, space)
	PhysicsServer3D.body_set_state(rid, PhysicsServer3D.BODY_STATE_LINEAR_VELOCITY, v)
	ball = _entry("ball", rid, shape, Vector3(r * 2.0, r * 2.0, r * 2.0), {"touched": false, "ammo": type})
	shots.append({"step": step, "t": type, "a": a, "b": b})
	ammo[type] -= 1
	phase = "flight"
	calm = 0
	flight_steps = 0
	won = false
	pending_fx.append({"type": "fire", "step": step, "ammo": type})
	return true


func _remove(e: Dictionary) -> void:
	if not e.alive:
		return
	e.alive = false
	by_rid.erase(e.rid.get_id())
	PhysicsServer3D.free_rid(e.rid)
	PhysicsServer3D.free_rid(e.shape)


func _pos(e: Dictionary) -> Vector3:
	var t: Transform3D = PhysicsServer3D.body_get_state(e.rid, PhysicsServer3D.BODY_STATE_TRANSFORM)
	return t.origin


## World y component of the body's local up axis (1 = upright, 0 = on its side).
func _up_y(e: Dictionary) -> float:
	var t: Transform3D = PhysicsServer3D.body_get_state(e.rid, PhysicsServer3D.BODY_STATE_TRANSFORM)
	return t.basis.y.y


## Per contact partner: the sum of normal impulse magnitudes this step, turned
## into a force. Matches Rapier's per-pair "total force magnitude".
func _pair_forces(e: Dictionary) -> Dictionary:
	var out := {}
	var st := PhysicsServer3D.body_get_direct_state(e.rid)
	if st == null:
		return out
	for i in st.get_contact_count():
		var other: RID = st.get_contact_collider(i)
		var imp: Vector3 = st.get_contact_impulse(i)
		var k := other.get_id()
		out[k] = out.get(k, 0.0) + DetMath.len3(imp.x, imp.y, imp.z) / SimConfig.DT
	return out


func _explode(b: Dictionary, break_cages: Array, break_ice: Array) -> void:
	var c := _pos(b)
	var r: float = SimConfig.BLAST.radius
	var core: float = SimConfig.BLAST.core
	for e in bodies:
		if not e.alive or e.fixed or e == b:
			continue
		var t := _pos(e)
		var dx: float = t.x - c.x
		var dy: float = t.y - c.y
		var dz: float = t.z - c.z
		var d2 := dx * dx + dy * dy + dz * dz
		if d2 >= r * r:
			continue
		if d2 < core * core:
			if e.kind == "cage":
				break_cages.append(e.cage_index)
			elif e.kind == "ice":
				break_ice.append(e.id)
			elif e.kind == "nest":
				_break_nest(e, "patlama")
		var d := sqrt(d2)
		var k: float = SimConfig.BLAST.impulse * (1.0 - d / r)
		var nx := 0.0
		var ny := 1.0
		var nz := 0.0
		if d > 1e-4:
			nx = dx / d
			ny = dy / d + 0.35
			nz = dz / d
		var nl := sqrt(nx * nx + ny * ny + nz * nz)
		PhysicsServer3D.body_apply_central_impulse(e.rid, Vector3(nx / nl * k, ny / nl * k, nz / nl * k))
	pending_fx.append({"type": "explode", "step": step, "pos": c, "radius": r})
	_remove(b)
	if ball == b:
		ball = null


func _break_nest(n: Dictionary, why: String) -> void:
	if n.broken or not break_enabled:
		return
	n.broken = true
	if fail_reason == "":
		fail_reason = "yuva"
	pending_fx.append({"type": "nest", "step": step, "nest": n.nest_index, "why": why, "pos": _pos(n)})


func _step_physics() -> void:
	RapierPhysicsServer3D.space_step(space, SimConfig.DT)
	RapierPhysicsServer3D.space_flush_queries(space)
	step += 1
	var break_cages: Array = []
	var break_ice: Array = []
	var touched_ball = null
	for e in bodies:
		if not e.alive or e.fixed:
			continue
		var watch: bool = e.kind == "ball" or e.kind == "cage" or e.kind == "ice" or e.kind == "nest"
		if not watch and not fx:
			continue
		var forces := _pair_forces(e)
		if forces.is_empty():
			continue
		var f_max := 0.0
		for k in forces:
			f_max = maxf(f_max, forces[k])
		if e.kind == "ball":
			if not e.touched and f_max >= SimConfig.BALL_TOUCH_FORCE:
				e.touched = true
				touched_ball = e
			continue
		if break_enabled:
			if e.kind == "cage" and not e.broken and f_max >= SimConfig.CAGE_BREAK_FORCE:
				break_cages.append(e.cage_index)
			elif e.kind == "ice" and not e.broken and f_max >= SimConfig.MATERIALS.ice.break_force:
				break_ice.append(e.id)
			elif e.kind == "nest" and not e.broken and f_max >= SimConfig.NEST_BREAK_FORCE:
				_break_nest(e, "darbe")
		if fx and f_max >= SimConfig.FX_IMPACT_FORCE:
			var ground_hit := false
			for k in forces:
				var o = by_rid.get(k)
				if o != null and o.fixed:
					ground_hit = true
			pending_fx.append({"type": "impact", "step": step, "force": f_max, "pos": _pos(e), "kind": e.kind, "ground": ground_hit})
	if touched_ball != null and touched_ball.alive:
		if touched_ball.ammo == "ember":
			_explode(touched_ball, break_cages, break_ice)
		else:
			PhysicsServer3D.body_set_param(touched_ball.rid, PhysicsServer3D.BODY_PARAM_LINEAR_DAMP, 0.8)
			PhysicsServer3D.body_set_param(touched_ball.rid, PhysicsServer3D.BODY_PARAM_ANGULAR_DAMP, 3.0)
	if not break_cages.is_empty():
		break_cages.sort()
		for idx in break_cages:
			var cg: Dictionary = cages[idx]
			if cg.broken or not cg.alive:
				continue
			cg.broken = true
			pending_fx.append({"type": "break", "step": step, "cage": idx, "pos": _pos(cg)})
			_remove(cg)
	if not break_ice.is_empty():
		break_ice.sort()
		for id in break_ice:
			var e: Dictionary = bodies[id]
			if e.broken or not e.alive:
				continue
			e.broken = true
			pending_fx.append({"type": "shatter", "step": step, "id": id, "pos": _pos(e), "size": e.size})
			_remove(e)
	if break_enabled:
		for cg in cages:
			if not cg.alive or cg.broken:
				continue
			var t := _pos(cg)
			if t.y < SimConfig.FALL_Y:
				cg.broken = true
				pending_fx.append({"type": "break", "step": step, "cage": cg.cage_index, "fell": true, "pos": t})
				_remove(cg)
		for tm in totems:
			if tm.down or not tm.alive:
				continue
			var t := _pos(tm)
			if _up_y(tm) < 0.5 or t.y < tm.y0 - 0.5 or t.y < SimConfig.FALL_Y:
				tm.down = true
				pending_fx.append({"type": "totem", "step": step, "totem": tm.totem_index, "pos": t})
		for n in nests:
			if n.broken or not n.alive:
				continue
			if _pos(n).y < n.y0 - 0.6 or _up_y(n) < 0.3:
				_break_nest(n, "dustu")
	# remove anything that fell out of the world (in list order)
	for e in bodies:
		if e.alive and not e.fixed and _pos(e).y < SimConfig.KILL_Y:
			if e.kind == "cage":
				e.broken = true
			if e.kind == "totem":
				e.down = true
			if e.kind == "nest":
				_break_nest(e, "dustu")
			if e == ball:
				ball = null
			_remove(e)


func cages_left() -> int:
	var n := 0
	for c in cages:
		if not c.broken:
			n += 1
	return n


func totems_left() -> int:
	var n := 0
	for t in totems:
		if not t.down:
			n += 1
	return n


func nests_broken() -> int:
	var n := 0
	for x in nests:
		if x.broken:
			n += 1
	return n


func goals_done() -> bool:
	return cages_left() == 0 and totems_left() == 0


func is_calm() -> bool:
	for e in bodies:
		if not e.alive or e.fixed:
			continue
		var v: Vector3 = PhysicsServer3D.body_get_state(e.rid, PhysicsServer3D.BODY_STATE_LINEAR_VELOCITY)
		var w: Vector3 = PhysicsServer3D.body_get_state(e.rid, PhysicsServer3D.BODY_STATE_ANGULAR_VELOCITY)
		if v.x * v.x + v.y * v.y + v.z * v.z > 0.0064:
			return false
		if w.x * w.x + w.y * w.y + w.z * w.z > 0.0225:
			return false
	return true


## Advance one fixed step. Returns true while the shot is still running.
func tick() -> bool:
	if phase != "flight":
		return false
	_step_physics()
	flight_steps += 1
	var decided := goals_done() or nests_broken() > 0
	if decided:
		won = goals_done() and nests_broken() == 0
	calm = calm + 1 if is_calm() else 0
	if calm >= SimConfig.SETTLE_FRAMES or flight_steps >= SimConfig.MAX_FLIGHT_STEPS or (decided and flight_steps >= 150):
		if ball != null:
			_remove(ball)
			ball = null
		if nests_broken() > 0:
			phase = "lost"
		elif goals_done():
			phase = "won"
		elif shots_left() > 0:
			phase = "aim"
		else:
			phase = "lost"
			fail_reason = "atis"
		pending_fx.append({"type": "settled", "step": step, "phase": phase})
	return phase == "flight"


func run_shot(a: int, b: int, type := "normal") -> bool:
	if not fire(a, b, type):
		return false
	while tick():
		pass
	return true


## Hash of the full state: float32 bits of every body's transform (basis and
## origin exactly as the physics server returns them, no conversions) in fixed
## body order, plus step count, goal flags and remaining ammo.
func hash_state() -> String:
	var words := PackedInt64Array()
	words.append(step)
	for e in bodies:
		words.append(1 if e.alive else 0)
		if not e.alive:
			continue
		var t: Transform3D = PhysicsServer3D.body_get_state(e.rid, PhysicsServer3D.BODY_STATE_TRANSFORM)
		for v in [t.basis.x, t.basis.y, t.basis.z, t.origin]:
			words.append(DetMath.f32_bits(v.x))
			words.append(DetMath.f32_bits(v.y))
			words.append(DetMath.f32_bits(v.z))
	for c in cages:
		words.append(1 if c.broken else 0)
	for t in totems:
		words.append(1 if t.down else 0)
	for n in nests:
		words.append(1 if n.broken else 0)
	for k in SimConfig.AMMO_ORDER:
		words.append(ammo[k])
	return DetMath.hex32(DetMath.fnv1a32(words))


## Current transforms of all living bodies, for drawing.
func poses() -> Array:
	var out: Array = []
	for e in bodies:
		if not e.alive:
			continue
		out.append({"e": e, "xf": PhysicsServer3D.body_get_state(e.rid, PhysicsServer3D.BODY_STATE_TRANSFORM)})
	return out


func free_all() -> void:
	for e in bodies:
		_remove(e)
	PhysicsServer3D.free_rid(space)


## Replay a recorded numeric shot list ({t, a, b}) and collect checkpoint hashes.
## Used both on the desktop (reference) and on the phone (self-test).
static func replay(p_level: Dictionary, p_shots: Array, every := 30) -> Dictionary:
	var sim := Sim.new(p_level)
	var out := {"initial": sim.initial_hash, "ready": sim.ready_hash, "checkpoints": [], "shot_steps": [], "final_step": 0, "final": "", "phase": ""}
	for s in p_shots:
		if sim.phase != "aim":
			break
		out.shot_steps.append(sim.step)
		sim.fire(s.a, s.b, s.t)
		while sim.tick():
			if sim.step % every == 0:
				out.checkpoints.append([sim.step, sim.hash_state()])
	out.final_step = sim.step
	out.final = sim.hash_state()
	out.phase = sim.phase
	out.cages_left = sim.cages_left()
	sim.free_all()
	return out
