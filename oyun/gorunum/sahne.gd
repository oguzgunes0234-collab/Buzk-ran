class_name Sahne
extends Node3D
## Rendering only. Nothing here feeds back into the simulation, so visual
## randomness (particles, shake, idle animation) is allowed.
## Look: "ice toy diorama" - rounded toy-like blocks, cold ice blues against a
## warm ember orange, snowy mountains behind.

const COL_HORIZON := Color("dcecf4")
const COL_WOOD := [Color("c98c52"), Color("bb7f47"), Color("d69b60")]
const COL_STONE := Color("8a9ab0")
const COL_ICE := Color("9fe3f5")
const COL_EMBER := Color("ff7a3d")
const COL_INK := Color("1b2a41")
const PREVIEW_MAX := 48
const POOL := 240

var camera: Camera3D
var base_cam_pos := Vector3.ZERO
var cam_target := Vector3.ZERO
var shake := 0.0
var time := 0.0

var level: Dictionary
var sim: Sim
var arena: Dictionary
var meshes := {} # body id -> Node3D
var target_maps := {"cages": [], "totems": [], "nests": []}

var _island: Node3D
var _level_root: Node3D
var _barrel_pivot: Node3D
var _muzzle_glow: StandardMaterial3D
var _loaded := {} # ammo type -> Node3D in the barrel
var _loaded_type := ""
var _preview_dots: MultiMeshInstance3D
var _preview_shadows: MultiMeshInstance3D
var _impact_marker: Node3D
var _blast_ring: MeshInstance3D
var _pools := {} # shape -> {mmi, data, next}
var _critters: Array = []
var _flashes: Array = []
var _chicks: Array = [] # chick nodes inside cages (idle animation)

var _edge_mesh: ArrayMesh
var _mats := {}


func _ready() -> void:
	_build_materials()
	_build_world()


# --- materials ------------------------------------------------------------------

func _build_materials() -> void:
	_edge_mesh = _make_edge_mesh()
	_mats.wood = []
	for i in COL_WOOD.size():
		_mats.wood.append(Malzemeler.wood(COL_WOOD[i], i * 1.37))
	_mats.pedestal = Malzemeler.stone(COL_STONE)
	_mats.stone_block = Malzemeler.stone(Color("6b7686"))
	_mats.ice_block = Malzemeler.ice(Color("7fcfe8"), 0.66, 0.3, 1)
	_mats.cage = Malzemeler.ice(Color("8ad8ef"), 0.3, 0.22, 2)
	_mats.cage_xray = Malzemeler.unshaded(Color(0.184, 0.561, 0.682, 0.45), true)
	_mats.totem_xray = Malzemeler.unshaded(Color(0.478, 0.333, 0.784, 0.45), true)
	_mats.nest_xray = Malzemeler.unshaded(Color(0.788, 0.541, 0.227, 0.5), true)
	_mats.egg_broken = Malzemeler.lambert(Color("ffd23f"))


## The 12 edges of a unit box, as a line mesh (x-ray outlines of hidden targets).
func _make_edge_mesh() -> ArrayMesh:
	var v := PackedVector3Array()
	var c := [Vector3(-.5, -.5, -.5), Vector3(.5, -.5, -.5), Vector3(.5, -.5, .5), Vector3(-.5, -.5, .5),
		Vector3(-.5, .5, -.5), Vector3(.5, .5, -.5), Vector3(.5, .5, .5), Vector3(-.5, .5, .5)]
	for pair in [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]:
		v.append(c[pair[0]])
		v.append(c[pair[1]])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_LINES, arr)
	return m


func _mi(mesh: Mesh, mat: Material, scale := Vector3.ONE, pos := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.scale = scale
	mi.position = pos
	return mi


# --- static world -----------------------------------------------------------------

func _build_world() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color("5e9fcc")
	sky_mat.sky_horizon_color = Color("d9eaf3")
	sky_mat.sky_curve = 0.12
	sky_mat.ground_horizon_color = Color("d9eaf3")
	sky_mat.ground_bottom_color = Color("b9d2e2")
	sky_mat.sun_angle_max = 24.0
	sky_mat.sun_curve = 0.08
	var sky := Sky.new()
	sky.sky_material = sky_mat
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("dbe9f5")
	env.ambient_light_energy = 0.36
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 0.9
	env.tonemap_white = 2.2
	env.glow_enabled = true
	env.glow_intensity = 0.35
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.4
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = Color("cfe3ee")
	env.fog_depth_begin = 45.0
	env.fog_depth_end = 170.0
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.15
	env.adjustment_contrast = 1.06
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var sun := DirectionalLight3D.new()
	sun.light_color = Color("fff1dc")
	sun.light_energy = 0.85
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 40.0
	sun.shadow_bias = 0.03
	sun.shadow_blur = 1.6
	add_child(sun)
	sun.look_at_from_position(Vector3(-8, 14, -6), Vector3(0, 0, 2), Vector3.UP)
	# soft cool fill from the opposite side so shaded faces are not flat
	var fill := DirectionalLight3D.new()
	fill.light_color = Color("bcd8ff")
	fill.light_energy = 0.18
	add_child(fill)
	fill.look_at_from_position(Vector3(10, 6, 20), Vector3(0, 0, 0), Vector3.UP)

	camera = Camera3D.new()
	camera.near = 0.1
	camera.far = 300.0
	add_child(camera)

	add_child(Cevre.new())
	_island = Node3D.new()
	add_child(_island)
	var valley := _mi(_plane(500, 500), Malzemeler.snow(0.0), Vector3.ONE, Vector3(0, -14, 0))
	add_child(valley)

	# the cannon
	var c := Karakterler.cannon()
	var launcher: Node3D = c[0]
	launcher.position = SimConfig.LAUNCHER
	_barrel_pivot = c[1]
	_muzzle_glow = c[2]
	add_child(launcher)

	_level_root = Node3D.new()
	add_child(_level_root)

	# aiming preview: dots up to the first predicted contact, their ground shadows,
	# a ring at the contact point and, for the ember, the blast radius
	_preview_dots = _multimesh(Sekiller.sphere(1.0, 10, 8), Malzemeler.unshaded(COL_EMBER), PREVIEW_MAX, false)
	var disc := Sekiller.cylinder(1.0, 0.002, 16)
	var shadow_mat := Malzemeler.unshaded(Color(COL_INK.r, COL_INK.g, COL_INK.b, 0.22))
	shadow_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	_preview_shadows = _multimesh(disc, shadow_mat, PREVIEW_MAX, false)
	_impact_marker = Node3D.new()
	var ring_mat := Malzemeler.unshaded(Color(COL_EMBER.r, COL_EMBER.g, COL_EMBER.b, 0.95), true)
	var ring := TorusMesh.new()
	ring.inner_radius = 0.2
	ring.outer_radius = 0.32
	ring.rings = 32
	ring.ring_segments = 6
	_impact_marker.add_child(_mi(ring, ring_mat, Vector3(1, 0.08, 1)))
	_impact_marker.add_child(_mi(Sekiller.cylinder(0.07, 0.004, 16), ring_mat))
	_impact_marker.visible = false
	add_child(_impact_marker)
	var blast := TorusMesh.new()
	blast.inner_radius = 0.96
	blast.outer_radius = 1.0
	blast.rings = 64
	blast.ring_segments = 4
	_blast_ring = _mi(blast, Malzemeler.unshaded(Color(1.0, 0.231, 0.122, 0.8), true), Vector3(1, 0.05, 1))
	_blast_ring.visible = false
	add_child(_blast_ring)
	# the ball waiting in the launcher while aiming (one node per ammo type)
	for t in SimConfig.AMMO_ORDER:
		var n := Karakterler.ammo_node(t, SimConfig.AMMO[t].radius)
		n.position = SimConfig.LAUNCHER
		n.visible = false
		add_child(n)
		_loaded[t] = n

	# particle pools: chunks (splinters, sparks), shards (ice), puffs (snow, smoke)
	_pools.chunk = _make_pool(BoxMesh.new(), false)
	_pools.shard = _make_pool(Sekiller.cone(0.5, 1.0, 3), false)
	_pools.puff = _make_pool(Sekiller.sphere(0.5, 10, 6), true)


func _plane(w: float, d: float) -> PlaneMesh:
	var p := PlaneMesh.new()
	p.size = Vector2(w, d)
	return p


func _multimesh(mesh: Mesh, mat: Material, count: int, colors: bool) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = colors
	mm.mesh = mesh
	mm.instance_count = count
	mm.visible_instance_count = 0
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mmi.extra_cull_margin = 16384.0
	add_child(mmi)
	return mmi


func _make_pool(mesh: Mesh, soft: bool) -> Dictionary:
	var mat: Material
	if soft:
		mat = Malzemeler.puff()
	else:
		var lm := Malzemeler.lambert(Color.WHITE, 0.5, 0.6)
		lm.vertex_color_use_as_albedo = true
		mat = lm
	var mmi := _multimesh(mesh, mat, POOL, true)
	var data: Array = []
	for i in POOL:
		data.append({"life": 0.0, "max": 1.0, "p": Vector3.ZERO, "v": Vector3.ZERO, "r": Vector3.ZERO, "rv": Vector3.ZERO, "s": 0.1, "c": Color.WHITE, "grow": 0.0})
	return {"mmi": mmi, "data": data, "next": 0, "soft": soft}


# --- level ------------------------------------------------------------------------------

func clear_level() -> void:
	for id in meshes:
		meshes[id].queue_free()
	meshes.clear()
	_chicks.clear()
	for c in _critters:
		c.obj.queue_free()
	_critters.clear()
	for f in _flashes:
		f.mesh.queue_free()
	_flashes.clear()
	for k in _pools:
		for d in _pools[k].data:
			d.life = 0.0
		_pools[k].mmi.multimesh.visible_instance_count = 0


func _build_island() -> void:
	for c in _island.get_children():
		c.queue_free()
	arena = SimConfig.arena_of(level)
	var w: float = arena.x_half * 2.0
	var d: float = arena.z_max - arena.z_min
	var zc: float = (arena.z_min + arena.z_max) / 2.0
	_island.add_child(_mi(_plane(w, d), Malzemeler.snow(), Vector3.ONE, Vector3(0, 0, zc)))
	var cliff := _mi(Sekiller.rounded_box(Vector3(w, 5.0, d), 0.25), Malzemeler.cliff(), Vector3.ONE, Vector3(0, -2.52, zc))
	_island.add_child(cliff)
	# icy lip along the edge so the drop is easy to read
	var lip := Malzemeler.ice(Color("bfeaf7"), 0.75, 0.3)
	for side in [-1.0, 1.0]:
		_island.add_child(_mi(Sekiller.rounded_box(Vector3(0.16, 0.08, d), 0.035), lip, Vector3.ONE, Vector3(side * (w / 2.0 - 0.08), 0.02, zc)))
	_island.add_child(_mi(Sekiller.rounded_box(Vector3(w, 0.08, 0.16), 0.035), lip, Vector3.ONE, Vector3(0, 0.02, arena.z_max - 0.08)))


func load_level(p_level: Dictionary, p_sim: Sim) -> void:
	clear_level()
	level = p_level
	sim = p_sim
	target_maps = {
		"cages": sim.cages.map(func(e): return e.id),
		"totems": sim.totems.map(func(e): return e.id),
		"nests": sim.nests.map(func(e): return e.id),
	}
	_build_island()
	sync(null, sim.poses(), 1.0)
	frame_level()
	set_aim(Vector3.ZERO, PackedVector3Array(), 0.0)


func frame_level() -> void:
	var b := SimConfig.level_bounds(level)
	var vp := get_viewport().get_visible_rect().size
	var aspect := vp.x / maxf(1.0, vp.y)
	# behind and above the launcher, slightly telephoto so the structure reads larger
	camera.fov = 44.0 if aspect < 0.62 else 36.0
	var depth: float = b.z_max - SimConfig.LAUNCHER.z
	base_cam_pos = Vector3(0, 7.4 + b.y_max * 0.45 + depth * 0.08, SimConfig.LAUNCHER.z - 7.0)
	cam_target = Vector3(0, 0.4 + b.y_max * 0.2, SimConfig.LAUNCHER.z + 7.0 + depth * 0.06)
	camera.look_at_from_position(base_cam_pos, cam_target, Vector3.UP)


func _ensure_mesh(e: Dictionary) -> Node3D:
	if meshes.has(e.id):
		return meshes[e.id]
	var obj := Node3D.new()
	var kind: String = e.kind
	if kind == "ground":
		obj.visible = false
	elif kind == "ball":
		obj.add_child(Karakterler.ammo_node(e.get("ammo", "normal"), SimConfig.AMMO[e.get("ammo", "normal")].radius))
	elif kind == "totem":
		var r := Karakterler.totem(SimConfig.TOTEM, e.get("mat", "wood") == "stone")
		obj.add_child(r[0])
		obj.add_child(_mi(_edge_mesh, _mats.totem_xray, SimConfig.TOTEM))
		obj.set_meta("eyes", r[1])
	elif kind == "nest":
		var r := Karakterler.nest(SimConfig.NEST)
		obj.add_child(r[0])
		obj.add_child(_mi(_edge_mesh, _mats.nest_xray, SimConfig.NEST))
		obj.set_meta("eggs", r[1])
	elif kind == "cage":
		var s := SimConfig.CAGE_SIZE
		var chick := Karakterler.chick()
		chick.position = Vector3(0, -0.1, 0)
		obj.add_child(chick)
		_chicks.append(chick)
		var shell := _mi(Sekiller.rounded_box(Vector3(s, s, s), 0.08), _mats.cage)
		shell.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		obj.add_child(shell)
		obj.add_child(_mi(_edge_mesh, _mats.cage_xray, Vector3(s, s, s)))
		obj.set_meta("critter", chick)
	else:
		var stat: bool = kind == "static"
		var ice: bool = kind == "ice"
		var stone: bool = e.get("mat", "") == "stone"
		var mat: Material = _mats.pedestal if stat else _mats.ice_block if ice else _mats.stone_block if stone else _mats.wood[e.id % 3]
		var rad := 0.1 if stat else 0.07
		var mi := _mi(Sekiller.rounded_box(e.size, rad), mat)
		if ice:
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		obj.add_child(mi)
	obj.set_meta("kind", kind)
	_level_root.add_child(obj)
	meshes[e.id] = obj
	return obj


func remove_body(id: int) -> Node3D:
	var m: Node3D = meshes.get(id)
	if m != null:
		meshes.erase(id)
		_level_root.remove_child(m)
		if m.has_meta("critter"):
			_chicks.erase(m.get_meta("critter"))
	return m


## prev/curr are arrays from Sim.poses(); alpha in [0, 1] interpolates.
func sync(prev, curr: Array, alpha: float) -> void:
	var prev_map := {}
	if prev != null:
		for p in prev:
			prev_map[p.e.id] = p.xf
	var seen := {}
	for p in curr:
		var obj := _ensure_mesh(p.e)
		seen[p.e.id] = true
		var xf: Transform3D = p.xf
		if alpha < 1.0 and prev_map.has(p.e.id):
			xf = (prev_map[p.e.id] as Transform3D).interpolate_with(xf, alpha)
		obj.transform = xf
	for id in meshes.keys():
		if not seen.has(id):
			var m := remove_body(id)
			if m != null:
				m.queue_free()


# --- aiming -----------------------------------------------------------------------------

func set_loaded(v: bool, type := "") -> void:
	if type != "":
		_loaded_type = type
	for t in _loaded:
		_loaded[t].visible = v and t == _loaded_type
	_muzzle_glow.emission_energy_multiplier = 1.4 if v and _loaded_type == "ember" else 0.0


func _ray(from: Vector3, to: Vector3, exclude: Array) -> Dictionary:
	var st := PhysicsServer3D.space_get_direct_state(sim.space)
	var q := PhysicsRayQueryParameters3D.create(from, to)
	var ex: Array[RID] = []
	for r in exclude:
		ex.append(r)
	q.exclude = ex
	return st.intersect_ray(q)


func _ground_rid() -> Array:
	return [sim.bodies[0].rid] if not sim.bodies.is_empty() else []


## First contact of the free-flight path with any solid, or the platform.
func predict_impact(path: PackedVector3Array) -> Dictionary:
	var a := SimConfig.LAUNCHER
	var excl := _ground_rid()
	var r: float = SimConfig.AMMO.normal.radius
	for i in path.size():
		var b := path[i]
		var dir := b - a
		var length := dir.length()
		if length > 1e-6:
			var hit := _ray(a, a + dir / length * (length + r), excl)
			if not hit.is_empty():
				return {"cut": i, "point": hit.position, "normal": hit.normal}
		var on_platform: bool = absf(b.x) <= arena.x_half and b.z >= arena.z_min and b.z <= arena.z_max
		if b.y <= r and on_platform:
			return {"cut": i, "point": Vector3(b.x, 0.01, b.z), "normal": Vector3.UP}
		if b.y < -3.0:
			return {}
		a = b
	return {}


## vel = Vector3.ZERO hides the preview.
func set_aim(vel: Vector3, path: PackedVector3Array, blast_radius: float) -> void:
	if vel == Vector3.ZERO:
		_preview_dots.multimesh.visible_instance_count = 0
		_preview_shadows.multimesh.visible_instance_count = 0
		_impact_marker.visible = false
		_blast_ring.visible = false
		return
	_barrel_pivot.basis = Basis.looking_at(vel.normalized(), Vector3.UP)
	var impact := predict_impact(path)
	var end: int = impact.cut if not impact.is_empty() else path.size() - 1
	var n := 0
	var s := 0.075
	var i := 2
	while i < end and n < PREVIEW_MAX:
		var pt := path[i]
		_preview_dots.multimesh.set_instance_transform(n, Transform3D(Basis().scaled(Vector3(s, s, s)), pt))
		_preview_shadows.multimesh.set_instance_transform(n, Transform3D(Basis().scaled(Vector3(s * 1.1, 1, s * 1.1)), Vector3(pt.x, 0.012, pt.z)))
		n += 1
		i += 3
	_preview_dots.multimesh.visible_instance_count = n
	_preview_shadows.multimesh.visible_instance_count = n
	if not impact.is_empty():
		var nrm: Vector3 = impact.normal
		_impact_marker.position = impact.point + nrm * 0.02
		_impact_marker.basis = _basis_up(nrm)
		_impact_marker.visible = true
		if blast_radius > 0.0:
			_blast_ring.position = impact.point + Vector3(0, 0.03, 0)
			_blast_ring.scale = Vector3(blast_radius, 0.05, blast_radius)
			_blast_ring.visible = true
		else:
			_blast_ring.visible = false
	else:
		_impact_marker.visible = false
		_blast_ring.visible = false


## A basis whose local +y points along n.
func _basis_up(n: Vector3) -> Basis:
	var side := Vector3.RIGHT if absf(n.dot(Vector3.RIGHT)) < 0.9 else Vector3.FORWARD
	var x := side.cross(n).normalized()
	var z := x.cross(n).normalized()
	return Basis(x, n, z)


# --- effects ------------------------------------------------------------------------------

## shape: "chunk" (splinters, sparks), "shard" (ice), "puff" (snow, smoke; grows and fades)
func spawn(pos: Vector3, count: int, color: Color, speed: float, size: float, up := 1.0, shape := "chunk", life := 1.0) -> void:
	var pool: Dictionary = _pools[shape]
	for i in count:
		var k: int = pool.next
		pool.next = (k + 1) % POOL
		var d: Dictionary = pool.data[k]
		d.max = life * (0.7 + randf() * 0.7)
		d.life = d.max
		d.p = pos + Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5) * 0.4
		d.v = Vector3((randf() - 0.5) * speed, randf() * speed * up, (randf() - 0.5) * speed)
		d.r = Vector3(randf() * 6.0, randf() * 6.0, randf() * 6.0)
		d.rv = Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5) * 14.0
		d.s = size * (0.6 + randf() * 0.8)
		d.c = color
		d.grow = 1.0 if shape == "puff" else 0.0
	pool.mmi.multimesh.visible_instance_count = POOL


func on_break(ev: Dictionary) -> void:
	var idx: int = ev.cage
	var m := remove_body(target_maps.cages[idx] if idx < target_maps.cages.size() else -1)
	spawn(ev.pos, 26, Color("bfeefa"), 6.5, 0.16, 1.2, "shard")
	spawn(ev.pos, 12, Color.WHITE, 4.0, 0.08, 1.4, "chunk")
	spawn(ev.pos, 6, Color(1, 1, 1, 0.8), 1.5, 0.5, 0.6, "puff", 0.8)
	shake = maxf(shake, 0.12)
	if m != null:
		var critter: Node3D = m.get_meta("critter")
		var world := m.transform * critter.position
		m.remove_child(critter)
		critter.position = world
		critter.rotation = Vector3(0, PI, 0)
		add_child(critter)
		_critters.append({"obj": critter, "t": 0.0, "from": world})
		m.queue_free()


func on_impact(ev: Dictionary) -> void:
	var f := minf(1.0, ev.force / 400.0)
	if ev.ground:
		spawn(ev.pos + Vector3(0, -0.2, 0), 3 + roundi(f * 4.0), Color(1, 1, 1, 0.75), 1.6, 0.35, 0.5, "puff", 0.7)
	else:
		spawn(ev.pos, 2 + roundi(f * 6.0), COL_WOOD[1], 3.0 + f * 3.0, 0.07, 1.0, "chunk")
	shake = maxf(shake, 0.02 + f * 0.05)


func on_shatter(ev: Dictionary) -> void:
	var m := remove_body(ev.id)
	if m != null:
		m.queue_free()
	spawn(ev.pos, 24, Color("d8f6ff"), 5.0, 0.15, 1.0, "shard")
	spawn(ev.pos, 4, Color(1, 1, 1, 0.7), 1.2, 0.45, 0.5, "puff", 0.7)
	shake = maxf(shake, 0.06)


func on_explode(ev: Dictionary) -> void:
	spawn(ev.pos, 36, Color("ff7a1f"), 9.0, 0.1, 1.2, "chunk", 0.8)
	spawn(ev.pos, 22, Color("ffd23f"), 7.0, 0.07, 1.4, "chunk", 0.7)
	spawn(ev.pos, 10, Color(0.35, 0.35, 0.4, 0.7), 2.2, 0.8, 0.9, "puff", 1.4)
	var mat := Malzemeler.unshaded(Color(1.0, 0.627, 0.251, 0.55))
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	var flash := _mi(Sekiller.sphere(1.0, 20, 14), mat, Vector3.ONE * 0.3, ev.pos)
	add_child(flash)
	_flashes.append({"mesh": flash, "mat": mat, "t": 0.0, "R": ev.radius})
	shake = maxf(shake, 0.2)


func on_totem(ev: Dictionary) -> void:
	var idx: int = ev.totem
	var m: Node3D = meshes.get(target_maps.totems[idx] if idx < target_maps.totems.size() else -1)
	if m != null and m.has_meta("eyes"):
		var eyes: StandardMaterial3D = m.get_meta("eyes")
		eyes.albedo_color = Color("2a2140")
		eyes.emission_energy_multiplier = 0.0
	spawn(ev.pos, 18, Color("b18cff"), 4.0, 0.12, 1.3, "shard")


func on_nest(ev: Dictionary) -> void:
	var idx: int = ev.nest
	var m: Node3D = meshes.get(target_maps.nests[idx] if idx < target_maps.nests.size() else -1)
	if m != null and m.has_meta("eggs"):
		for egg in (m.get_meta("eggs") as Node3D).get_children():
			egg.material_override = _mats.egg_broken
			egg.scale = Vector3(1.2, 0.5, 1.2)
	spawn(ev.pos, 18, Color("ffd23f"), 3.0, 0.09, 1.2, "chunk")
	shake = maxf(shake, 0.08)


## Readability of every target (cages, totems, nests) from the current camera:
## share of 27 sample points not hidden by other solids, and the smaller side of
## the target's screen rectangle in UI units.
func measure_targets() -> Array:
	var out: Array = []
	var excl := _ground_rid()
	for c in sim.cages:
		if c.alive:
			excl.append(c.rid)
	var cam_pos := camera.global_position
	for e in sim.bodies:
		if not e.alive or not (e.kind == "cage" or e.kind == "totem" or e.kind == "nest"):
			continue
		var xf: Transform3D = PhysicsServer3D.body_get_state(e.rid, PhysicsServer3D.BODY_STATE_TRANSFORM)
		var c := xf.origin
		var size: Vector3 = e.size
		var ex := excl.duplicate()
		if not ex.has(e.rid):
			ex.append(e.rid)
		var vis := 0
		var tot := 0
		for i in range(-1, 2):
			for j in range(-1, 2):
				for k in range(-1, 2):
					var pt := c + Vector3(i * size.x * 0.42, j * size.y * 0.42, k * size.z * 0.42)
					tot += 1
					var hit := _ray(cam_pos, pt, ex)
					if hit.is_empty() or cam_pos.distance_to(hit.position) > cam_pos.distance_to(pt) - 0.05:
						vis += 1
		var x0 := INF
		var x1 := -INF
		var y0 := INF
		var y1 := -INF
		for i in [-1, 1]:
			for j in [-1, 1]:
				for k in [-1, 1]:
					var sp := camera.unproject_position(c + Vector3(i * size.x / 2.0, j * size.y / 2.0, k * size.z / 2.0))
					x0 = minf(x0, sp.x)
					x1 = maxf(x1, sp.x)
					y0 = minf(y0, sp.y)
					y1 = maxf(y1, sp.y)
		out.append({"id": e.id, "kind": e.kind, "visible": float(vis) / tot, "px": minf(x1 - x0, y1 - y0), "sx": (x0 + x1) / 2.0, "sy": (y0 + y1) / 2.0})
	return out


func _update_pool(pool: Dictionary, dt: float) -> void:
	var mm: MultiMesh = pool.mmi.multimesh
	var any := false
	for i in POOL:
		var d: Dictionary = pool.data[i]
		if d.life <= 0.0:
			continue
		any = true
		d.life -= dt
		var v: Vector3 = d.v
		var p: Vector3 = d.p
		var col: Color = d.c
		var s: float = d.s
		if pool.soft:
			# puffs drift up a little, grow and fade
			v *= pow(0.2, dt)
			v.y += 0.6 * dt
			var u: float = 1.0 - maxf(0.0, d.life) / d.max
			s = d.s * (0.6 + u * 1.2)
			col.a = d.c.a * (1.0 - u)
		else:
			v.y -= 9.8 * dt
			s = d.s * minf(1.0, d.life * 2.5) if d.life > 0.0 else 0.0
		p += v * dt
		if p.y < 0.05 and not pool.soft:
			p.y = 0.05
			v *= 0.4
			v.y = absf(v.y) * 0.3
		d.v = v
		d.p = p
		d.r = d.r + d.rv * dt
		if d.life <= 0.0:
			s = 0.0
		mm.set_instance_transform(i, Transform3D(Basis.from_euler(d.r).scaled(Vector3(s, s, s)), p))
		mm.set_instance_color(i, col)
	if not any and mm.visible_instance_count != 0:
		mm.visible_instance_count = 0


func _process(dt: float) -> void:
	time += dt
	for k in _pools:
		_update_pool(_pools[k], dt)
	for i in range(_flashes.size() - 1, -1, -1):
		var f: Dictionary = _flashes[i]
		f.t += dt
		var u := minf(1.0, f.t / 0.35)
		f.mesh.scale = Vector3.ONE * (0.3 + u * f.R)
		var col: Color = f.mat.albedo_color
		col.a = 0.55 * (1.0 - u)
		f.mat.albedo_color = col
		if u >= 1.0:
			f.mesh.queue_free()
			_flashes.remove_at(i)
	# chicks waiting in their cages: gentle bob and a blink every few seconds
	for chick in _chicks:
		if not is_instance_valid(chick):
			continue
		var ph: float = chick.get_meta("phase")
		chick.position.y = -0.1 + sin(time * 2.6 + ph) * 0.012
		var eyes: Node3D = chick.get_meta("eyes")
		var blink := fmod(time + ph, 3.4) < 0.12
		eyes.scale = Vector3(1, 0.12 if blink else 1.0, 1)
	# rescued chicks hop and float away
	for i in range(_critters.size() - 1, -1, -1):
		var c: Dictionary = _critters[i]
		c.t += dt
		var t: float = c.t
		var from: Vector3 = c.from
		var obj: Node3D = c.obj
		if t < 0.55:
			obj.position = Vector3(from.x, from.y + sin(t / 0.55 * PI) * 1.1, from.z)
			obj.rotation = Vector3(0, PI + t * 12.0, 0)
		else:
			var u := t - 0.55
			obj.position = Vector3(from.x, from.y + u * u * 9.0 + u * 2.0, from.z)
			obj.rotation = Vector3(0, PI + sin(u * 10.0) * 0.4, 0)
			obj.scale = Vector3.ONE * maxf(0.01, 1.0 - u * 0.5)
		if t > 2.4:
			obj.queue_free()
			_critters.remove_at(i)
	# the ember in the barrel flickers
	var ember: Node3D = _loaded.get("ember")
	if ember != null and ember.visible and ember.has_meta("glow"):
		(ember.get_meta("glow") as StandardMaterial3D).emission_energy_multiplier = 1.1 + sin(time * 9.0) * 0.35
	# camera shake (visual only): small damped oscillation, no per-frame jitter
	var pos := base_cam_pos
	if shake > 0.002:
		pos.y += sin(time * 34.0) * shake
		pos.x += sin(time * 27.0 + 1.3) * shake * 0.6
		shake *= pow(0.004, dt)
	camera.look_at_from_position(pos, cam_target, Vector3.UP)
