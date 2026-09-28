extends SceneTree
## Draws the placeholder app icon (res://simge.png, 1024x1024, no transparency
## as the App Store requires): sky, an ice cage with a chick, an ember ball.
func _init() -> void:
	var n := 1024
	var img := Image.create(n, n, false, Image.FORMAT_RGB8)
	var top := Color("8fc6e0")
	var low := Color("e3f1f7")
	for y in n:
		var col := top.lerp(low, float(y) / n)
		for x in n:
			img.set_pixel(x, y, col)
	var cage := Rect2(232, 250, 560, 560)
	for y in n:
		for x in n:
			var p := Vector2(x, y)
			var c := img.get_pixel(x, y)
			# rounded ice cube
			var d := _rounded(p, cage, 70.0)
			if d <= 0.0:
				c = c.lerp(Color("9fe3f5"), 0.55)
				if d > -18.0:
					c = c.lerp(Color.WHITE, 0.85)
			# chick: dark body, white belly, eyes, beak
			if _ellipse(p, Vector2(512, 560), Vector2(150, 185)):
				c = Color("22314a")
			if _ellipse(p, Vector2(512, 610), Vector2(105, 125)):
				c = Color.WHITE
			if _ellipse(p, Vector2(462, 480), Vector2(22, 22)) or _ellipse(p, Vector2(562, 480), Vector2(22, 22)):
				c = Color("f4f9fc")
			if _ellipse(p, Vector2(466, 486), Vector2(11, 11)) or _ellipse(p, Vector2(558, 486), Vector2(11, 11)):
				c = Color("0b1320")
			if _ellipse(p, Vector2(512, 530), Vector2(34, 22)):
				c = Color("ff7a3d")
			# ember ball
			var e := p.distance_to(Vector2(800, 820))
			if e < 150.0:
				c = c.lerp(Color("ffb14a"), clampf((150.0 - e) / 60.0, 0.0, 0.5))
			if e < 110.0:
				c = Color("ffd23f").lerp(Color("ff3b1f"), clampf(p.distance_to(Vector2(770, 790)) / 130.0, 0.0, 1.0))
			img.set_pixel(x, y, c)
	img.save_png("res://simge.png")
	print("simge.png yazildi")
	quit()


func _rounded(p: Vector2, r: Rect2, rad: float) -> float:
	var c := r.get_center()
	var h := r.size / 2.0 - Vector2(rad, rad)
	var q := (p - c).abs() - h
	return Vector2(maxf(q.x, 0.0), maxf(q.y, 0.0)).length() + minf(maxf(q.x, q.y), 0.0) - rad


func _ellipse(p: Vector2, c: Vector2, r: Vector2) -> bool:
	var d := (p - c) / r
	return d.x * d.x + d.y * d.y <= 1.0
