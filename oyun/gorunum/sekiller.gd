class_name Sekiller
## Procedural meshes for the toy-like look: rounded boxes (cached per size),
## a low-poly pine and a ring of distant mountains. Visual only.

static var _cache := {}


## A box with rounded edges and corners. UV is in meters on each face, with
## u running along the box's longest axis on that face (wood grain follows it).
static func rounded_box(size: Vector3, radius := 0.06, seg := 3) -> ArrayMesh:
	var key := "%.3f,%.3f,%.3f,%.3f,%d" % [size.x, size.y, size.z, radius, seg]
	if _cache.has(key):
		return _cache[key]
	var h := size / 2.0
	var r := minf(radius, minf(h.x, minf(h.y, h.z)) * 0.9)
	var coords := []
	for ax in 3:
		var c := PackedFloat32Array()
		var hh: float = h[ax]
		for k in seg + 1:
			c.append(-hh + r * float(k) / seg)
		for k in seg + 1:
			c.append(hh - r + r * float(k) / seg)
		coords.append(c)
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var uvs := PackedVector2Array()
	var idx := PackedInt32Array()
	for n in 3:
		var a := (n + 1) % 3
		var b := (n + 2) % 3
		var long_is_a: bool = size[a] >= size[b]
		for s in [-1.0, 1.0]:
			var base := verts.size()
			var ca: PackedFloat32Array = coords[a]
			var cb: PackedFloat32Array = coords[b]
			for i in ca.size():
				for j in cb.size():
					var p := Vector3.ZERO
					p[n] = s * h[n]
					p[a] = ca[i]
					p[b] = cb[j]
					var inner := Vector3(clampf(p.x, -h.x + r, h.x - r), clampf(p.y, -h.y + r, h.y - r), clampf(p.z, -h.z + r, h.z - r))
					var d := p - inner
					var nrm := d.normalized() if d.length() > 1e-6 else Vector3.ZERO
					if nrm == Vector3.ZERO:
						nrm[n] = s
					verts.append(inner + nrm * r)
					norms.append(nrm)
					uvs.append(Vector2(p[a], p[b]) if long_is_a else Vector2(p[b], p[a]))
			var nb := cb.size()
			for i in ca.size() - 1:
				for j in nb - 1:
					var v00 := base + i * nb + j
					var v10 := base + (i + 1) * nb + j
					var v01 := base + i * nb + j + 1
					var v11 := base + (i + 1) * nb + j + 1
					_tri(idx, verts, norms, v00, v10, v11)
					_tri(idx, verts, norms, v00, v11, v01)
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = norms
	arr[Mesh.ARRAY_TEX_UV] = uvs
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	_cache[key] = m
	return m


## Adds a triangle with Godot's front-face winding (clockwise seen from outside).
static func _tri(idx: PackedInt32Array, v: PackedVector3Array, nr: PackedVector3Array, i0: int, i1: int, i2: int) -> void:
	var n := nr[i0] + nr[i1] + nr[i2]
	var c := (v[i1] - v[i0]).cross(v[i2] - v[i0])
	if c.length_squared() < 1e-14:
		return
	if c.dot(n) > 0.0:
		idx.append_array([i0, i2, i1])
	else:
		idx.append_array([i0, i1, i2])


static func cone(r_bottom: float, height: float, segs := 7, r_top := 0.0) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = r_top
	c.bottom_radius = r_bottom
	c.height = height
	c.radial_segments = segs
	c.rings = 1
	return c


static func sphere(r: float, seg := 18, rings := 12) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	s.radial_segments = seg
	s.rings = rings
	return s


static func cylinder(r: float, height: float, segs := 16) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = r
	c.bottom_radius = r
	c.height = height
	c.radial_segments = segs
	return c
