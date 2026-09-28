class_name Cevre
extends Node3D
## Scenery in the valley below the floating ice platform: low snowy hills, pine
## forests and a frozen lake, plus gently falling snow. The gameplay camera looks
## down at the platform, so the valley floor is what shows around it.
## Visual only; fixed seed so every run looks the same.

var _snow: CPUParticles3D


func _ready() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 2026
	_hills(rng)
	_lake()
	_pines(rng)
	_falling_snow()


func _hills(rng: RandomNumberGenerator) -> void:
	var mat := Malzemeler.snow(0.0)
	for i in 14:
		var x := rng.randf_range(-70.0, 70.0)
		var z := rng.randf_range(15.0, 90.0)
		if absf(x) < 10.0:
			x += signf(x + 0.01) * 10.0
		var r := rng.randf_range(8.0, 18.0)
		var mi := MeshInstance3D.new()
		mi.mesh = Sekiller.sphere(1.0, 16, 8)
		mi.material_override = mat
		mi.scale = Vector3(r, r * rng.randf_range(0.25, 0.45), r * rng.randf_range(0.8, 1.2))
		mi.position = Vector3(x, -14.0, z)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)


func _lake() -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = Sekiller.cylinder(1.0, 0.05, 40)
	mi.material_override = Malzemeler.ice(Color("6cc3e0"), 0.85, 0.35)
	mi.scale = Vector3(16, 1, 9)
	mi.position = Vector3(-6, -13.95, 38)
	add_child(mi)


func _pines(rng: RandomNumberGenerator) -> void:
	# one MultiMesh per part keeps it to three draw calls
	var green := Malzemeler.lambert(Color("2f6b58"), 0.9)
	var green2 := Malzemeler.lambert(Color("3f8a6f"), 0.9)
	var trunk := Malzemeler.lambert(Color("6e4a2b"), 0.9)
	var spots: Array = []
	var clusters: Array = []
	for i in 9:
		clusters.append(Vector3(rng.randf_range(-55.0, 55.0), -14.0, rng.randf_range(12.0, 75.0)))
	while spots.size() < 90:
		var c: Vector3 = clusters[rng.randi() % clusters.size()]
		var p := c + Vector3(rng.randfn(0.0, 6.0), 0.0, rng.randfn(0.0, 5.0))
		if absf(p.x) < 15.0 and p.z < 30.0:
			continue # keep the space right under the platform clear
		spots.append([p, rng.randf_range(0.7, 1.5), rng.randf() * TAU])
	var parts := [
		[Sekiller.cone(1.6, 3.0, 7), green, 3.2],
		[Sekiller.cone(1.2, 2.4, 7), green2, 4.8],
		[Sekiller.cylinder(0.3, 1.6, 6), trunk, 0.8],
	]
	for part in parts:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = part[0]
		mm.instance_count = spots.size()
		for i in spots.size():
			var s: float = spots[i][1]
			var b := Basis(Vector3.UP, spots[i][2]).scaled(Vector3(s, s, s))
			mm.set_instance_transform(i, Transform3D(b, spots[i][0] + Vector3(0, part[2] * s, 0)))
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.material_override = part[1]
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mmi)


func _falling_snow() -> void:
	_snow = CPUParticles3D.new()
	_snow.amount = 160
	_snow.lifetime = 7.0
	_snow.preprocess = 7.0
	_snow.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	_snow.emission_box_extents = Vector3(14, 1, 18)
	_snow.position = Vector3(0, 14, 2)
	_snow.direction = Vector3(0.15, -1, 0.05)
	_snow.spread = 12.0
	_snow.gravity = Vector3(0, -0.35, 0)
	_snow.initial_velocity_min = 1.2
	_snow.initial_velocity_max = 2.0
	_snow.scale_amount_min = 0.6
	_snow.scale_amount_max = 1.3
	var q := QuadMesh.new()
	q.size = Vector2(0.07, 0.07)
	var m := Malzemeler.unshaded(Color(1, 1, 1, 0.9))
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	m.albedo_texture = _soft_dot(16)
	q.material = m
	_snow.mesh = q
	_snow.local_coords = false
	add_child(_snow)


## Round snowflake with a soft edge (so flakes near the camera are not squares).
func _soft_dot(n: int) -> ImageTexture:
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	var c := Vector2(n, n) / 2.0
	for y in n:
		for x in n:
			var d := Vector2(x + 0.5, y + 0.5).distance_to(c) / (n / 2.0)
			img.set_pixel(x, y, Color(1, 1, 1, clampf(1.0 - d, 0.0, 1.0) * 1.4))
	return ImageTexture.create_from_image(img)
