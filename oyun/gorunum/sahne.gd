class_name Sahne
extends Node3D
## Rendering only. Nothing here feeds back into the simulation, so visual
## randomness (particles, shake) is allowed.

const COL_HORIZON := Color("d7ebf3")
const COL_WOOD := [Color("c9925a"), Color("bf8750"), Color("d29d66")]
const COL_STONE := Color("7d8ea3")
const COL_ICE := Color("9fe3f5")
const COL_EMBER := Color("ff7a3d")
const COL_INK := Color("1b2a41")
const PREVIEW_MAX := 48
const PARTICLE_MAX := 360

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
var _loaded_ball: MeshInstance3D
var _preview_dots: MultiMeshInstance3D
var _preview_shadows: MultiMeshInstance3D
var _impact_marker: Node3D
var _blast_ring: MeshInstance3D
var _particles: MultiMeshInstance3D
var _p_data: Array = []
var _p_next := 0
var _critters: Array = []
var _flashes: Array = []

var _box_mesh := BoxMesh.new()
var _edge_mesh: ArrayMesh
var _mats := {}
var _ammo_look := {}


func _ready() -> void:
	_build_materials()
	_build_world()


# --- materials ------------------------------------------------------------------

func _lambert(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 1.0
	m.metallic_specular = 0.2
	return m


func _unshaded(c: Color, on_top := false) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = c
	if c.a < 1.0:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if on_top:
		m.no_depth_test = true
		m.render_priority = 10
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m


func _glass(c: Color, alpha: float) -> StandardMaterial3D:
	var m := _lambert(Color(c.r, c.g, c.b, alpha))
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.roughness = 0.15
	m.metallic_specular = 0.9
	return m


func _build_materials() -> void:
	_edge_mesh = _make_edge_mesh()
	_mats.wood = COL_WOOD.map(func(c): return _lambert(c))
	_mats.stone_static = _lambert(COL_STONE)
	_mats.edge_wood = _unshaded(Color(0.357, 0.251, 0.161, 0.55))
	_mats.edge_stone = _unshaded(Color(0.294, 0.353, 0.431, 0.6))
	_mats.cage = _glass(COL_ICE, 0.5)
	_mats.cage.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	_mats.cage.render_priority = 2
	_mats.cage_edge = _unshaded(Color(1, 1, 1, 0.9))
	_mats.cage_xray = _unshaded(Color(0.184, 0.561, 0.682, 0.45), true)
	_mats.stone_block = _lambert(Color("6b7686"))
	_mats.stone_block_edge = _unshaded(Color(0.227, 0.267, 0.322, 0.7))
	_mats.ice_block = _glass(Color("c6f0fb"), 0.72)
	_mats.ice_block.render_priority = 1
	_mats.ice_block_edge = _unshaded(Color(1, 1, 1, 0.95))
	_mats.totem = _lambert(Color("5b3f8c"))
	_mats.totem_cap = _lambert(Color("8a6cc4"))
	_mats.stone_totem = _lambert(Color("5d6673"))
	_mats.stone_totem_cap = _lambert(Color("8b95a3"))
	_mats.stone_totem_band = _lambert(Color("3a4452"))
	_mats.totem_xray = _unshaded(Color(0.478, 0.333, 0.784, 0.45), true)
	_mats.nest = _lambert(Color("8a5a2b"))
	_mats.egg = _lambert(Color("faf6ea"))
	_mats.egg_broken = _lambert(Color("ffd23f"))
	_mats.nest_xray = _unshaded(Color(0.788, 0.541, 0.227, 0.5), true)
	var normal := _lambert(COL_EMBER)
	normal.emission_enabled = true
	normal.emission = Color("ff4a10")
	normal.emission_energy_multiplier = 0.55
	var heavy := _lambert(Color("3d4654"))
	var ember := _lambert(Color("ff3b1f"))
	ember.emission_enabled = true
	ember.emission = Color("ff2a00")
	ember.emission_energy_multiplier = 1.0
	_ammo_look = {
		"normal": {"mesh": _sphere(SimConfig.AMMO.normal.radius), "mat": normal},
		"heavy": {"mesh": _sphere(SimConfig.AMMO.heavy.radius), "mat": heavy},
		"ember": {"mesh": _sphere(SimConfig.AMMO.ember.radius), "mat": ember},
	}


func _sphere(r: float, seg := 20, rings := 14) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	s.radial_segments = seg
	s.rings = rings
	return s


## The 12 edges of a unit box, as a line mesh.
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


func _grid_texture() -> ImageTexture:
	var img := Image.create(256, 256, true, Image.FORMAT_RGBA8)
	img.fill(Color("eef5f9"))
	var fine := Color(0.471, 0.627, 0.725, 0.28)
	var bold := Color(0.353, 0.51, 0.627, 0.45)
	for i in 5:
		var p := int(i * 51.2)
		for k in 256:
			for w in 2:
				_blend(img, clampi(p + w, 0, 255), k, fine)
				_blend(img, k, clampi(p + w, 0, 255), fine)
	for k in 256:
		for w in 3:
			_blend(img, w, k, bold)
			_blend(img, 255 - w, k, bold)
			_blend(img, k, w, bold)
			_blend(img, k, 255 - w, bold)
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


func _blend(img: Image, x: int, y: int, c: Color) -> void:
	img.set_pixel(x, y, img.get_pixel(x, y).blend(c))


# --- static world -----------------------------------------------------------------

func _build_world() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color("bcdcec")
	sky_mat.sky_horizon_color = Color("e3f1f7")
	sky_mat.ground_horizon_color = Color("e3f1f7")
	sky_mat.ground_bottom_color = Color("dcebf3")
	sky_mat.sun_angle_max = 0.0
	var sky := Sky.new()
	sky.sky_material = sky_mat
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("e6f0f8")
	env.ambient_light_energy = 0.42
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = COL_HORIZON
	env.fog_depth_begin = 34.0
	env.fog_depth_end = 95.0
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var sun := DirectionalLight3D.new()
	sun.light_color = Color("fff4e6")
	sun.light_energy = 0.78
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 40.0
	sun.shadow_bias = 0.03
	add_child(sun)
	sun.look_at_from_position(Vector3(-8, 14, -6), Vector3(0, 0, 2), Vector3.UP)

	camera = Camera3D.new()
	camera.near = 0.1
	camera.far = 200.0
	add_child(camera)

	_island = Node3D.new()
	add_child(_island)
	var valley := _mi(_plane(400, 400), _lambert(Color("dcebf3")), Vector3.ONE, Vector3(0, -14, 0))
	add_child(valley)

	# launcher
	var launcher := Node3D.new()
	launcher.position = SimConfig.LAUNCHER
	var base_mesh := CylinderMesh.new()
	base_mesh.top_radius = 0.55
	base_mesh.bottom_radius = 0.7
	base_mesh.height = 0.5
	launcher.add_child(_mi(base_mesh, _mats.stone_static, Vector3.ONE, Vector3(0, -0.75, 0)))
	launcher.add_child(_mi(_box_mesh, _mats.stone_static, Vector3(0.3, 0.55, 0.3), Vector3(0, -0.35, 0)))
	_barrel_pivot = Node3D.new()
	var barrel_mesh := CylinderMesh.new()
	barrel_mesh.top_radius = 0.2
	barrel_mesh.bottom_radius = 0.26
	barrel_mesh.height = 1.3
	var barrel := _mi(barrel_mesh, _lambert(Color("2c3a52")), Vector3.ONE, Vector3(0, 0, -0.35))
	barrel.rotation = Vector3(-PI / 2.0, 0, 0) # cylinder along -z (the pivot's forward)
	_barrel_pivot.add_child(barrel)
	launcher.add_child(_barrel_pivot)
	add_child(launcher)

	_level_root = Node3D.new()
	add_child(_level_root)

	# aiming preview: dots up to the first predicted contact, their ground shadows,
	# a ring at the contact point and, for the ember, the blast radius
	_preview_dots = _multimesh(_sphere(1.0, 10, 8), _unshaded(COL_EMBER), PREVIEW_MAX, false)
	var disc := CylinderMesh.new()
	disc.top_radius = 1.0
	disc.bottom_radius = 1.0
	disc.height = 0.002
	disc.radial_segments = 16
	var shadow_mat := _unshaded(Color(COL_INK.r, COL_INK.g, COL_INK.b, 0.22))
	shadow_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	_preview_shadows = _multimesh(disc, shadow_mat, PREVIEW_MAX, false)
	_impact_marker = Node3D.new()
	var ring_mat := _unshaded(Color(COL_EMBER.r, COL_EMBER.g, COL_EMBER.b, 0.95), true)
	var ring := TorusMesh.new()
	ring.inner_radius = 0.2
	ring.outer_radius = 0.32
	ring.rings = 32
	ring.ring_segments = 6
	_impact_marker.add_child(_mi(ring, ring_mat, Vector3(1, 0.08, 1)))
	var dot := CylinderMesh.new()
	dot.top_radius = 0.07
	dot.bottom_radius = 0.07
	dot.height = 0.004
	_impact_marker.add_child(_mi(dot, ring_mat))
	_impact_marker.visible = false
	add_child(_impact_marker)
	var blast := TorusMesh.new()
	blast.inner_radius = 0.96
	blast.outer_radius = 1.0
	blast.rings = 64
	blast.ring_segments = 4
	_blast_ring = _mi(blast, _unshaded(Color(1.0, 0.231, 0.122, 0.8), true), Vector3(1, 0.05, 1))
	_blast_ring.visible = false
	add_child(_blast_ring)
	# the ball waiting in the launcher while aiming
	_loaded_ball = _mi(_ammo_look.normal.mesh, _ammo_look.normal.mat, Vector3.ONE, SimConfig.LAUNCHER)
	_loaded_ball.visible = false
	add_child(_loaded_ball)

	# particles
	var pmat := _lambert(Color.WHITE)
	pmat.vertex_color_use_as_albedo = true
	_particles = _multimesh(_box_mesh, pmat, PARTICLE_MAX, true)
	_particles.multimesh.visible_instance_count = -1
	for i in PARTICLE_MAX:
		_p_data.append({"life": 0.0, "p": Vector3.ZERO, "v": Vector3.ZERO, "r": Vector3.ZERO, "rv": Vector3.ZERO, "s": 0.1})
		_particles.multimesh.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ZERO), Vector3.ZERO))


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


# --- level ------------------------------------------------------------------------------

func clear_level() -> void:
	for id in meshes:
		meshes[id].queue_free()
	meshes.clear()
	for c in _critters:
		c.obj.queue_free()
	_critters.clear()
	for f in _flashes:
		f.mesh.queue_free()
	_flashes.clear()
	for d in _p_data:
		d.life = 0.0
	_particles.multimesh.visible_instance_count = 0


func _build_island() -> void:
	for c in _island.get_children():
		c.queue_free()
	arena = SimConfig.arena_of(level)
	var w: float = arena.x_half * 2.0
	var d: float = arena.z_max - arena.z_min
	var zc: float = (arena.z_min + arena.z_max) / 2.0
	var top_mat := _lambert(Color.WHITE)
	top_mat.albedo_texture = _grid_texture()
	top_mat.uv1_scale = Vector3(w / 5.0, d / 5.0, 1)
	top_mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	var top := _mi(_plane(w, d), top_mat, Vector3.ONE, Vector3(0, 0, zc))
	_island.add_child(top)
	_island.add_child(_mi(_box_mesh, _lambert(Color("9fc4d8")), Vector3(w, 5, d), Vector3(0, -2.505, zc)))
	var rim := _mi(_edge_mesh, _unshaded(Color("2f8fae")), Vector3(w, 0.02, d), Vector3(0, 0.012, zc))
	_island.add_child(rim)


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
		var look: Dictionary = _ammo_look[e.get("ammo", "normal")]
		var mi := _mi(look.mesh, look.mat)
		obj.add_child(mi)
	elif kind == "totem":
		var stone: bool = e.get("mat", "wood") == "stone"
		var t := SimConfig.TOTEM
		obj.add_child(_mi(_box_mesh, _mats.stone_totem if stone else _mats.totem, t))
		obj.add_child(_mi(_box_mesh, _mats.stone_totem_cap if stone else _mats.totem_cap, Vector3(t.x * 1.25, 0.16, t.z * 1.25), Vector3(0, t.y / 2.0 - 0.02, 0)))
		var eye_mat := _unshaded(Color("7ff0ff"))
		obj.add_child(_mi(_box_mesh, eye_mat, Vector3(0.1, 0.07, 0.02), Vector3(0.1, 0.35, -t.z / 2.0 - 0.011)))
		obj.add_child(_mi(_box_mesh, eye_mat, Vector3(0.1, 0.07, 0.02), Vector3(-0.1, 0.35, -t.z / 2.0 - 0.011)))
		obj.add_child(_mi(_edge_mesh, _mats.totem_xray, t))
		if stone:
			# darker bands so the stone totem reads as heavy even at a small size
			for y in [-0.3, 0.1]:
				obj.add_child(_mi(_box_mesh, _mats.stone_totem_band, Vector3(t.x + 0.02, 0.06, t.z + 0.02), Vector3(0, y, 0)))
		obj.set_meta("eyes", eye_mat)
	elif kind == "nest":
		var n := SimConfig.NEST
		obj.add_child(_mi(_box_mesh, _mats.nest, Vector3(n.x * 0.9, n.y * 0.5, n.z * 0.9), Vector3(0, -n.y * 0.25, 0)))
		var rim := TorusMesh.new()
		rim.inner_radius = n.x * 0.4 - 0.09
		rim.outer_radius = n.x * 0.4 + 0.09
		obj.add_child(_mi(rim, _mats.nest, Vector3.ONE, Vector3(0, 0.02, 0)))
		var eggs := Node3D.new()
		for p in [Vector2(0.12, 0.05), Vector2(-0.12, 0.06), Vector2(0, -0.12)]:
			eggs.add_child(_mi(_sphere(0.1, 12, 10), _mats.egg, Vector3(1, 1.3, 1), Vector3(p.x, 0.08, p.y)))
		obj.add_child(eggs)
		obj.add_child(_mi(_edge_mesh, _mats.nest_xray, n))
		obj.set_meta("eggs", eggs)
	elif kind == "cage":
		var s := SimConfig.CAGE_SIZE
		var critter := _make_critter()
		critter.position = Vector3(0, -0.08, 0)
		obj.add_child(critter)
		var shell := _mi(_box_mesh, _mats.cage, Vector3(s, s, s))
		shell.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		obj.add_child(shell)
		obj.add_child(_mi(_edge_mesh, _mats.cage_edge, Vector3(s, s, s)))
		obj.add_child(_mi(_edge_mesh, _mats.cage_xray, Vector3(s, s, s)))
		obj.set_meta("critter", critter)
	else:
		var stat: bool = kind == "static"
		var ice: bool = kind == "ice"
		var stone: bool = e.get("mat", "") == "stone"
		var mat: Material = _mats.stone_static if stat else _mats.ice_block if ice else _mats.stone_block if stone else _mats.wood[e.id % 3]
		var edge: Material = _mats.edge_stone if stat else _mats.ice_block_edge if ice else _mats.stone_block_edge if stone else _mats.edge_wood
		obj.add_child(_mi(_box_mesh, mat, e.size))
		obj.add_child(_mi(_edge_mesh, edge, e.size))
	obj.set_meta("kind", kind)
	_level_root.add_child(obj)
	meshes[e.id] = obj
	return obj


func _make_critter() -> Node3D:
	var g := Node3D.new()
	g.add_child(_mi(_sphere(0.22, 16, 12), _lambert(Color("22314a")), Vector3(1, 1.25, 0.95)))
	g.add_child(_mi(_sphere(0.17, 14, 10), _lambert(Color.WHITE), Vector3(1, 1.2, 0.6), Vector3(0, -0.03, -0.09)))
	var beak_mesh := CylinderMesh.new()
	beak_mesh.top_radius = 0.0
	beak_mesh.bottom_radius = 0.05
	beak_mesh.height = 0.1
	var beak := _mi(beak_mesh, _lambert(COL_EMBER), Vector3.ONE, Vector3(0, 0.1, -0.22))
	beak.rotation = Vector3(-PI / 2.0, 0, 0)
	g.add_child(beak)
	var eye_mat := _unshaded(Color("0b1320"))
	g.add_child(_mi(_sphere(0.028, 8, 6), eye_mat, Vector3.ONE, Vector3(0.07, 0.17, -0.18)))
	g.add_child(_mi(_sphere(0.028, 8, 6), eye_mat, Vector3.ONE, Vector3(-0.07, 0.17, -0.18)))
	return g


func remove_body(id: int) -> Node3D:
	var m: Node3D = meshes.get(id)
	if m != null:
		meshes.erase(id)
		_level_root.remove_child(m)
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
	_loaded_ball.visible = v
	if type != "" and _ammo_look.has(type):
		_loaded_ball.mesh = _ammo_look[type].mesh
		_loaded_ball.material_override = _ammo_look[type].mat


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

func spawn(pos: Vector3, count: int, color: Color, speed: float, size: float, up := 1.0) -> void:
	for i in count:
		var k := _p_next
		_p_next = (_p_next + 1) % PARTICLE_MAX
		var d: Dictionary = _p_data[k]
		d.life = 0.7 + randf() * 0.7
		d.p = pos + Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5) * 0.4
		d.v = Vector3((randf() - 0.5) * speed, randf() * speed * up, (randf() - 0.5) * speed)
		d.r = Vector3(randf() * 6.0, randf() * 6.0, randf() * 6.0)
		d.rv = Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5) * 14.0
		d.s = size * (0.6 + randf() * 0.8)
		_particles.multimesh.set_instance_color(k, color)
	_particles.multimesh.visible_instance_count = PARTICLE_MAX


func on_break(ev: Dictionary) -> void:
	var idx: int = ev.cage
	var m := remove_body(target_maps.cages[idx] if idx < target_maps.cages.size() else -1)
	spawn(ev.pos, 34, Color("bfeefa"), 6.5, 0.14, 1.2)
	spawn(ev.pos, 14, Color.WHITE, 4.0, 0.1, 1.4)
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
	if ev.ground and ev.kind == "ball":
		spawn(ev.pos, 5, Color.WHITE, 2.5, 0.12)
	else:
		spawn(ev.pos, 2 + roundi(f * 6.0), COL_WOOD[0], 3.0 + f * 3.0, 0.08)
	shake = maxf(shake, 0.02 + f * 0.05)


func on_shatter(ev: Dictionary) -> void:
	var m := remove_body(ev.id)
	if m != null:
		m.queue_free()
	spawn(ev.pos, 26, Color("d8f6ff"), 5.0, 0.13, 1.0)
	shake = maxf(shake, 0.06)


func on_explode(ev: Dictionary) -> void:
	spawn(ev.pos, 48, Color("ff7a1f"), 9.0, 0.16, 1.2)
	spawn(ev.pos, 24, Color("ffd23f"), 7.0, 0.12, 1.4)
	spawn(ev.pos, 16, Color.WHITE, 5.0, 0.1, 1.2)
	var mat := _unshaded(Color(1.0, 0.627, 0.251, 0.55))
	var flash := _mi(_sphere(1.0, 20, 14), mat, Vector3.ONE * 0.3, ev.pos)
	add_child(flash)
	_flashes.append({"mesh": flash, "mat": mat, "t": 0.0, "R": ev.radius})
	shake = maxf(shake, 0.2)


func on_totem(ev: Dictionary) -> void:
	var idx: int = ev.totem
	var m: Node3D = meshes.get(target_maps.totems[idx] if idx < target_maps.totems.size() else -1)
	if m != null and m.has_meta("eyes"):
		(m.get_meta("eyes") as StandardMaterial3D).albedo_color = Color("2a2140")
	spawn(ev.pos, 22, Color("b18cff"), 4.0, 0.1, 1.3)


func on_nest(ev: Dictionary) -> void:
	var idx: int = ev.nest
	var m: Node3D = meshes.get(target_maps.nests[idx] if idx < target_maps.nests.size() else -1)
	if m != null and m.has_meta("eggs"):
		for egg in (m.get_meta("eggs") as Node3D).get_children():
			egg.material_override = _mats.egg_broken
			egg.scale = Vector3(1.2, 0.5, 1.2)
	spawn(ev.pos, 18, Color("ffd23f"), 3.0, 0.09, 1.2)
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


func _process(dt: float) -> void:
	time += dt
	# particles
	var any := false
	var mm := _particles.multimesh
	for i in PARTICLE_MAX:
		var d: Dictionary = _p_data[i]
		if d.life <= 0.0:
			continue
		any = true
		d.life -= dt
		var v: Vector3 = d.v
		var p: Vector3 = d.p
		v.y -= 9.8 * dt
		p += v * dt
		if p.y < 0.05:
			p.y = 0.05
			v *= 0.4
			v.y = absf(v.y) * 0.3
		d.v = v
		d.p = p
		d.r = d.r + d.rv * dt
		var s: float = d.s * minf(1.0, d.life * 2.5) if d.life > 0.0 else 0.0
		mm.set_instance_transform(i, Transform3D(Basis.from_euler(d.r).scaled(Vector3(s, s, s)), p))
	if not any and mm.visible_instance_count != 0:
		mm.visible_instance_count = 0
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
	(_ammo_look.ember.mat as StandardMaterial3D).emission_energy_multiplier = 0.8 + sin(time * 9.0) * 0.3
	# rescued critters hop and float away
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
			c.obj.queue_free()
			_critters.remove_at(i)
	# camera shake (visual only): small damped oscillation, no per-frame jitter
	var pos := base_cam_pos
	if shake > 0.002:
		pos.y += sin(time * 34.0) * shake
		pos.x += sin(time * 27.0 + 1.3) * shake * 0.6
		shake *= pow(0.004, dt)
	camera.look_at_from_position(pos, cam_target, Vector3.UP)
