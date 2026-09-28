class_name Karakterler
## Procedural characters and props: the penguin chick, totems, the nest, the
## cannon and the three ammo looks. Visual only.

const NAVY := Color("22314a")
const EMBER := Color("ff7a3d")
const BEAK := Color("ff9a3d")


## Small parts do not cast shadows (each shadow caster is one more draw call);
## call _caster() on the few big parts that should.
static func _mi(mesh: Mesh, mat: Material, scale := Vector3.ONE, pos := Vector3.ZERO, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.scale = scale
	mi.position = pos
	mi.rotation = rot
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


static func _caster(mi: MeshInstance3D) -> MeshInstance3D:
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	return mi


## Penguin chick, facing -z (the camera). The eyes node gets blinked by Sahne.
static func chick() -> Node3D:
	var g := Node3D.new()
	var body_mat := Malzemeler.lambert(NAVY, 0.7, 0.4)
	var white := Malzemeler.lambert(Color("fbfdff"), 0.8)
	var orange := Malzemeler.lambert(BEAK, 0.6)
	g.add_child(_mi(Sekiller.sphere(0.23), body_mat, Vector3(1.0, 1.12, 0.95)))
	g.add_child(_mi(Sekiller.sphere(0.18), white, Vector3(1.0, 1.08, 0.62), Vector3(0, -0.05, -0.1)))
	# face patch
	g.add_child(_mi(Sekiller.sphere(0.12), white, Vector3(1.25, 0.8, 0.55), Vector3(0, 0.1, -0.14)))
	# tuft
	g.add_child(_mi(Sekiller.cone(0.05, 0.12, 6), body_mat, Vector3.ONE, Vector3(0, 0.29, 0.0), Vector3(0.3, 0, 0)))
	# flippers
	g.add_child(_mi(Sekiller.sphere(0.08, 10, 8), body_mat, Vector3(0.35, 1.0, 0.7), Vector3(0.22, -0.03, 0.0), Vector3(0, 0, 0.45)))
	g.add_child(_mi(Sekiller.sphere(0.08, 10, 8), body_mat, Vector3(0.35, 1.0, 0.7), Vector3(-0.22, -0.03, 0.0), Vector3(0, 0, -0.45)))
	# feet
	g.add_child(_mi(Sekiller.sphere(0.06, 10, 6), orange, Vector3(1.0, 0.35, 1.4), Vector3(0.08, -0.25, -0.07)))
	g.add_child(_mi(Sekiller.sphere(0.06, 10, 6), orange, Vector3(1.0, 0.35, 1.4), Vector3(-0.08, -0.25, -0.07)))
	# beak
	g.add_child(_mi(Sekiller.cone(0.045, 0.09, 8), orange, Vector3.ONE, Vector3(0, 0.07, -0.23), Vector3(-PI / 2.0, 0, 0)))
	# eyes: black with a white highlight, grouped so they can blink
	var eyes := Node3D.new()
	eyes.position = Vector3(0, 0.13, -0.2)
	var black := Malzemeler.unshaded(Color("0b1320"))
	var shine := Malzemeler.unshaded(Color.WHITE)
	for sx in [-1.0, 1.0]:
		eyes.add_child(_mi(Sekiller.sphere(0.034, 10, 8), black, Vector3(1, 1.15, 0.6), Vector3(0.07 * sx, 0, 0)))
		eyes.add_child(_mi(Sekiller.sphere(0.011, 6, 4), shine, Vector3.ONE, Vector3(0.07 * sx + 0.012, 0.014, -0.02)))
	g.add_child(eyes)
	# cheeks
	var pink := Malzemeler.lambert(Color("ffb3c1"), 0.9)
	g.add_child(_mi(Sekiller.sphere(0.03, 8, 6), pink, Vector3(1.2, 0.7, 0.4), Vector3(0.12, 0.06, -0.19)))
	g.add_child(_mi(Sekiller.sphere(0.03, 8, 6), pink, Vector3(1.2, 0.7, 0.4), Vector3(-0.12, 0.06, -0.19)))
	g.set_meta("eyes", eyes)
	g.set_meta("phase", randf() * TAU)
	return g


## Totem 0.5 x 1.3 x 0.5: purple ice (tips easily) or grey stone (heavy).
## Returns [node, eye_material] so the eyes can go dark when it falls.
static func totem(size: Vector3, stone: bool) -> Array:
	var g := Node3D.new()
	var body: Material = Malzemeler.stone(Color("5d6673")) if stone else Malzemeler.ice(Color("7b5cc4"), 0.92, 0.18)
	var cap: Material = Malzemeler.stone(Color("8b95a3")) if stone else Malzemeler.lambert(Color("9a7fe0"), 0.5, 0.6)
	g.add_child(_caster(_mi(Sekiller.rounded_box(size, 0.07), body)))
	g.add_child(_mi(Sekiller.rounded_box(Vector3(size.x * 1.3, 0.18, size.z * 1.3), 0.06), cap, Vector3.ONE, Vector3(0, size.y / 2.0 - 0.03, 0)))
	# horns
	var horn: Material = cap
	g.add_child(_mi(Sekiller.cone(0.06, 0.2, 6), horn, Vector3.ONE, Vector3(0.18, size.y / 2.0 + 0.14, 0), Vector3(0, 0, -0.35)))
	g.add_child(_mi(Sekiller.cone(0.06, 0.2, 6), horn, Vector3.ONE, Vector3(-0.18, size.y / 2.0 + 0.14, 0), Vector3(0, 0, 0.35)))
	var eye_mat := Malzemeler.glow(Color("7ff0ff"), 1.6)
	var front := -size.z / 2.0 - 0.012
	g.add_child(_mi(Sekiller.rounded_box(Vector3(0.12, 0.08, 0.03), 0.012), eye_mat, Vector3.ONE, Vector3(0.1, 0.33, front)))
	g.add_child(_mi(Sekiller.rounded_box(Vector3(0.12, 0.08, 0.03), 0.012), eye_mat, Vector3.ONE, Vector3(-0.1, 0.33, front)))
	var mouth := Malzemeler.lambert(Color("1d1530") if not stone else Color("2a3038"))
	g.add_child(_mi(Sekiller.rounded_box(Vector3(0.22, 0.05, 0.03), 0.012), mouth, Vector3.ONE, Vector3(0, 0.12, front)))
	if stone:
		# darker bands so the stone totem reads as heavy even at a small size
		var band := Malzemeler.lambert(Color("3a4452"))
		for y in [-0.3, -0.1]:
			g.add_child(_mi(Sekiller.rounded_box(Vector3(size.x + 0.03, 0.06, size.z + 0.03), 0.02), band, Vector3.ONE, Vector3(0, y, 0)))
	return [g, eye_mat]


## Nest 0.8 x 0.35 x 0.8 with three speckled eggs. Returns [node, eggs_node].
static func nest(size: Vector3) -> Array:
	var g := Node3D.new()
	var twig := Malzemeler.wood(Color("8a5a2b"), 4.2)
	g.add_child(_caster(_mi(Sekiller.cylinder(size.x * 0.44, size.y * 0.5, 14), twig, Vector3.ONE, Vector3(0, -size.y * 0.25, 0))))
	var rim := TorusMesh.new()
	rim.inner_radius = size.x * 0.4 - 0.1
	rim.outer_radius = size.x * 0.4 + 0.1
	rim.rings = 20
	rim.ring_segments = 8
	g.add_child(_mi(rim, twig, Vector3.ONE, Vector3(0, 0.02, 0)))
	# a few sticks poking out
	var stick := Malzemeler.lambert(Color("6e4520"))
	for i in 6:
		var a := i * TAU / 6.0 + 0.3
		g.add_child(_mi(Sekiller.cylinder(0.015, 0.36, 5), stick, Vector3.ONE, Vector3(cos(a) * 0.33, 0.05, sin(a) * 0.33), Vector3(0.2, -a, PI / 2.0 - 0.25)))
	var eggs := Node3D.new()
	var egg_mat := Malzemeler.egg()
	for p in [Vector2(0.12, 0.05), Vector2(-0.12, 0.06), Vector2(0, -0.12)]:
		eggs.add_child(_mi(Sekiller.sphere(0.1, 14, 10), egg_mat, Vector3(1, 1.3, 1), Vector3(p.x, 0.08, p.y)))
	g.add_child(eggs)
	return [g, eggs]


## Cannon on a wheeled wooden carriage. Returns [node, barrel_pivot, muzzle_glow].
static func cannon() -> Array:
	var g := Node3D.new()
	var wood := Malzemeler.wood(Color("9c6a3c"), 2.0)
	var dark_wood := Malzemeler.wood(Color("6e4a2b"), 5.0)
	var bronze := Malzemeler.metal(Color("3a4658"), 0.3, 0.55)
	var brass := Malzemeler.metal(Color("c9a45a"), 0.25, 0.8)
	g.add_child(_caster(_mi(Sekiller.rounded_box(Vector3(0.95, 0.32, 1.25), 0.06), wood, Vector3.ONE, Vector3(0, -0.62, -0.1))))
	for sx in [-1.0, 1.0]:
		var wheel := _mi(Sekiller.cylinder(0.32, 0.12, 20), dark_wood, Vector3.ONE, Vector3(0.55 * sx, -0.68, -0.1), Vector3(0, 0, PI / 2.0))
		g.add_child(wheel)
		g.add_child(_mi(Sekiller.cylinder(0.08, 0.14, 10), brass, Vector3.ONE, Vector3(0.56 * sx, -0.68, -0.1), Vector3(0, 0, PI / 2.0)))
		g.add_child(_mi(Sekiller.rounded_box(Vector3(0.1, 0.5, 0.5), 0.03), wood, Vector3.ONE, Vector3(0.28 * sx, -0.3, -0.05)))
	var pivot := Node3D.new()
	var barrel := Sekiller.cylinder(0.2, 1.3, 20)
	barrel.bottom_radius = 0.27
	pivot.add_child(_caster(_mi(barrel, bronze, Vector3.ONE, Vector3(0, 0, -0.35), Vector3(-PI / 2.0, 0, 0))))
	for z in [-0.95, -0.55, 0.15]:
		var ring := TorusMesh.new()
		ring.inner_radius = 0.2
		ring.outer_radius = 0.27 + (0.02 if z > 0.0 else 0.0)
		ring.rings = 20
		ring.ring_segments = 6
		pivot.add_child(_mi(ring, brass, Vector3.ONE, Vector3(0, 0, z), Vector3(PI / 2.0, 0, 0)))
	pivot.add_child(_mi(Sekiller.sphere(0.12, 12, 8), bronze, Vector3.ONE, Vector3(0, 0, 0.35)))
	var glow := Malzemeler.glow(EMBER, 0.0)
	pivot.add_child(_mi(Sekiller.cylinder(0.17, 0.02, 16), glow, Vector3.ONE, Vector3(0, 0, -1.0), Vector3(-PI / 2.0, 0, 0)))
	g.add_child(pivot)
	return [g, pivot, glow]


## Ammo looks: iron cannonball, heavy stone ball with a brass band, glowing ember.
static func ammo_node(type: String, r: float) -> Node3D:
	var g := Node3D.new()
	match type:
		"heavy":
			g.add_child(_mi(Sekiller.sphere(r, 20, 14), Malzemeler.stone(Color("6b6f78"))))
			var band := TorusMesh.new()
			band.inner_radius = r * 0.93
			band.outer_radius = r * 1.06
			band.rings = 24
			band.ring_segments = 6
			g.add_child(_mi(band, Malzemeler.metal(Color("c9a45a"), 0.3, 0.8)))
		"ember":
			var core := Malzemeler.glow(Color("ff5a1f"), 1.2)
			g.add_child(_mi(Sekiller.sphere(r, 20, 14), core))
			var halo := Malzemeler.unshaded(Color(1.0, 0.55, 0.15, 0.28))
			halo.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
			g.add_child(_mi(Sekiller.sphere(r * 1.45, 16, 10), halo))
			g.set_meta("glow", core)
		_:
			g.add_child(_mi(Sekiller.sphere(r, 20, 14), Malzemeler.metal(Color("2d3440"), 0.28, 0.7)))
	_caster(g.get_child(0))
	return g
