class_name Levels
## The 10 levels of the web prototype v4.1, designed for the camera behind the
## launcher: structures spread across the width. x > 0 is on the LEFT of the
## screen (the camera looks along +z).

const GAP := 0.002 # tiny gap so stacked bodies do not start interpenetrating


static func _box(x: float, z: float, yb: float, w: float, h: float, d: float, mat := "wood") -> Dictionary:
	return {"x": x, "y": yb + h / 2.0 + GAP, "z": z, "w": w, "h": h, "d": d, "mat": mat}


static func _pillar(x: float, z: float, yb: float, h := 1.8, s := 0.55, mat := "wood") -> Dictionary:
	return _box(x, z, yb, s, h, s, mat)


static func _plank_x(x: float, z: float, yb: float, length := 2.0, t := 0.3, dep := 0.8, mat := "wood") -> Dictionary:
	return _box(x, z, yb, length, t, dep, mat)


static func _ped(x: float, z: float, h: float, w := 1.2, d := 1.2) -> Dictionary:
	return {"x": x, "y": h / 2.0, "z": z, "w": w, "h": h, "d": d}


static func _cage(x: float, z: float, yb: float) -> Dictionary:
	return {"x": x, "y": yb + SimConfig.CAGE_SIZE / 2.0 + GAP, "z": z}


static func _totem(x: float, z: float, yb: float, mat := "wood") -> Dictionary:
	return {"x": x, "y": yb + SimConfig.TOTEM.y / 2.0 + GAP, "z": z, "mat": mat}


static func _nest(x: float, z: float, yb: float) -> Dictionary:
	return {"x": x, "y": yb + SimConfig.NEST.y / 2.0 + GAP, "z": z}


## Three cages side by side on one pedestal, optionally behind a low ice wall.
static func _cage_row(x: float, z: float, sp: float, wall: bool) -> Dictionary:
	return {
		"statics": [_ped(x, z, 0.6, 2.0 * sp + 1.0, 1.2)],
		"blocks": [_box(x, z - 0.9, 0.0, 2.0 * sp + 1.0, 0.9, 0.3, "ice")] if wall else [],
		"cages": [_cage(x + sp, z, 0.6), _cage(x, z, 0.6), _cage(x - sp, z, 0.6)],
	}


static func _level(id: int, name: String, hint: String, teaches: String, ammo: Array, parts: Dictionary) -> Dictionary:
	var lv := {"id": id, "name": name, "hint": hint, "teaches": teaches, "speed": 14.0, "ammo": ammo,
		"statics": [], "blocks": [], "cages": [], "totems": [], "nests": []}
	lv.merge(parts, true)
	return lv


static func all() -> Array:
	var row9 := _cage_row(-1.8, 6.0, 0.95, false)
	var row10 := _cage_row(-1.8, 6.2, 0.95, true)
	return [
		_level(1, "İlk atış", "Halkayı kafese getir ve bırak.", "nişan", ["normal", "normal", "normal"], {
			"statics": [_ped(0, 4, 1.0)],
			"cages": [_cage(0, 4, 1.0)],
		}),
		_level(2, "Devrilen kule", "Kuleyi devir; düşen kafes kırılır.", "devirme", ["normal", "normal"], {
			"blocks": [_pillar(0, 4.5, 0, 2.0, 0.65)],
			"cages": [_cage(0, 4.5, 2.0)],
		}),
		_level(3, "Sağ ve sol", "Sağa-sola sürükleyerek yönü değiştir.", "yön", ["normal", "normal", "normal"], {
			"statics": [_ped(1.8, 4, 0.8), _ped(-1.8, 5.5, 1.3)],
			"cages": [_cage(1.8, 4, 0.8), _cage(-1.8, 5.5, 1.3)],
		}),
		_level(4, "Kırılgan buz", "Açık mavi buz bloklar sert bir darbeyle kırılır.", "kırılgan buz", ["normal", "normal", "normal"], {
			"statics": [_ped(0, 5.2, 0.9)],
			"blocks": [_box(0, 3.6, 0, 1.8, 0.8, 0.35, "ice"), _box(0, 3.6, 0.8, 1.8, 0.8, 0.35, "ice")],
			"cages": [_cage(0, 5.2, 0.9)],
		}),
		_level(5, "Ağır gülle", "Taş blok ağırdır. Ağır gülleyi seç ve taşı it.", "ağır gülle, taş", ["heavy", "normal"], {
			"statics": [_ped(0, 5.2, 0.8)],
			"blocks": [_box(0, 3.8, 0, 1.4, 1.3, 1.0, "stone")],
			"cages": [_cage(0, 5.2, 0.8)],
		}),
		_level(6, "Köz", "Köz ilk değdiği yerde patlar; halka patlama alanını gösterir.", "patlama", ["ember", "normal", "normal"], {
			"statics": [_ped(0, 6, 0.6, 3.2, 1.2)],
			"blocks": [_box(0, 5.1, 0, 3.2, 0.9, 0.3, "ice")],
			"cages": [_cage(1.0, 6, 0.6), _cage(0, 6, 0.6), _cage(-1.0, 6, 0.6)],
		}),
		_level(7, "Totemler", "Mor buz totemlerini devir.", "devirme hedefi", ["normal", "normal", "normal"], {
			"statics": [_ped(1.4, 5, 0.5), _ped(-1.4, 6, 0.5)],
			"totems": [_totem(1.4, 5, 0.5), _totem(-1.4, 6, 0.5)],
		}),
		_level(8, "Yuvayı koru", "Yumurtalı yuvaya zarar verme. Köz yakında patlarsa yuva da kırılır.", "koruma hedefi", ["normal", "normal", "ember"], {
			"statics": [_ped(0, 6.2, 1.3)],
			"cages": [_cage(0, 6.2, 1.3)],
			"nests": [_nest(0, 4.2, 0)],
		}),
		_level(9, "Karışık", "Gri taş totemi yalnız Ağır gülle devirir. Kafes sırasına en iyisi Köz.", "taş totem, birleşim", ["normal", "heavy", "ember"], {
			"statics": [_ped(2.0, 4.8, 0.5, 1.6, 1.6)] + row9.statics,
			"blocks": row9.blocks,
			"cages": row9.cages,
			"totems": [_totem(2.0, 4.8, 0.5, "stone")],
		}),
		_level(10, "Büyük kale", "Taş totem Ağır ister. Yuvanın yakınında Ağır ve Köz tehlikeli.", "birleşim", ["normal", "normal", "heavy", "ember"], {
			"statics": [_ped(0, 4.4, 0.5, 1.4, 1.4)] + row10.statics,
			"blocks": [_pillar(2.6, 5.6, 0, 1.8), _pillar(1.8, 5.6, 0, 1.8), _plank_x(2.2, 5.6, 1.8, 1.4, 0.3, 0.8)] + row10.blocks,
			"cages": [_cage(2.2, 5.6, 2.1)] + row10.cages,
			"totems": [_totem(0, 4.4, 0.5, "stone")],
			"nests": [_nest(2.2, 3.9, 0)],
		}),
	]


static func by_id(id: int) -> Dictionary:
	for lv in all():
		if lv.id == id:
			return lv
	return {}
