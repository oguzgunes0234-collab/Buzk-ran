extends SceneTree
## End-to-end check with real rendering (run under a virtual display):
## start screen, every level (screenshot + target visibility), the tour with
## the bot's solutions, a lost level, a nest failure, the loss hint and the
## in-app determinism self-test.
## Usage: xvfb-run godot --rendering-driver opengl3 --resolution 390x844 -s res://testler/e2e.gd -- <out_dir>

var game: Node
var out_dir := "user://e2e"
var errors := 0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if not args.is_empty():
		out_dir = args[0]
	DirAccess.make_dir_recursive_absolute(out_dir)
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://ilerleme.cfg"))
	game = load("res://oyun.tscn").instantiate()
	root.add_child(game)
	_run.call_deferred()


func _frames(n: int) -> void:
	for i in n:
		await process_frame


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := root.get_viewport().get_texture().get_image()
	img.save_png("%s/%s.png" % [out_dir, name])


func _wait(cond: Callable, max_frames := 1200) -> bool:
	for i in max_frames:
		if cond.call():
			return true
		await process_frame
	return false


func _check(ok: bool, what: String) -> void:
	print(("OK   " if ok else "HATA ") + what)
	if not ok:
		errors += 1


func _fire_seq(shots: Array) -> void:
	for s in shots:
		await _wait(func(): return game.sim.phase == "aim")
		game.select_ammo(s.t)
		game.aim = {"a": int(s.a), "b": int(s.b)}
		game.set_aim_preview()
		await _frames(2)
		game.fire(int(s.a), int(s.b))
	await _wait(func(): return game.ui.current_screen == "sonuc", 2400)


func _run() -> void:
	await _frames(10)
	await _shot("00-baslangic")
	_check(game.ui.current_screen == "baslangic", "başlangıç ekranı açıldı")

	# every level: screenshot while aiming + visibility of targets
	var vis_rows: Array = []
	for lv in Levels.all():
		game.tour = null
		game.start_level(lv.id)
		await _frames(6)
		await _shot("l%02d" % lv.id)
		var m: Array = game.sahne.measure_targets()
		var worst := 1.0
		var smallest := 1e9
		for t in m:
			worst = minf(worst, t.visible)
			smallest = minf(smallest, t.px)
		vis_rows.append([lv.id, worst, smallest, m.size()])
		print("B%d hedef %d, en düşük görünürlük %%%d, en küçük boyut %d px" % [lv.id, m.size(), roundi(worst * 100.0), roundi(smallest)])

	# tour with the bot's solutions; B2 lost once first, B8 nest failure first
	var cases := {}
	for c in Referans.DATA.cases:
		cases[c.name] = c
	game._on_play()
	_check(game.level.id == 1, "tur 1. bölümden başladı")
	for i in 10:
		await _frames(2)
		var id: int = game.level.id
		if id == 2:
			await _fire_seq([{"t": "normal", "a": -150, "b": 700}, {"t": "normal", "a": -150, "b": 700}])
			_check(game.ui.res_title.text == "Atış hakkı bitti", "B2 kaybetme: " + game.ui.res_title.text)
			await _shot("sonuc-kayip")
			game.ui.retry_pressed.emit()
			await _frames(2)
		if id == 8:
			await _fire_seq(cases["B8 yuva kırılır"].shots)
			_check(game.ui.res_title.text == "Yuva kırıldı", "B8 yuva: " + game.ui.res_title.text)
			await _shot("sonuc-yuva")
			game.ui.retry_pressed.emit()
			await _frames(2)
		if id == 9:
			# loss hint: normal at the stone totem, heavy wasted on the cage row, ember away
			await _fire_seq([{"t": "normal", "a": -90, "b": 440}, {"t": "heavy", "a": 70, "b": 230}, {"t": "ember", "a": 150, "b": 50}])
			_check(game.ui.res_body.text.contains("Ağır gülle"), "B9 taş totem ipucu: " + game.ui.res_body.text)
			game.ui.retry_pressed.emit()
			await _frames(2)
		await _fire_seq(cases["B%d kazanan" % id].shots)
		_check(game.ui.res_title.text == "Başardın!", "B%d kazanıldı (%s)" % [id, game.ui.res_title.text])
		if id == 6:
			await _shot("sonuc-kazanma")
		game.ui.next_pressed.emit()
	await _frames(4)
	_check(game.ui.current_screen == "tur_sonu", "tur sonu ekranı")
	await _shot("tur-sonu")
	print("TUR: " + game.ui.end_body.text)

	# determinism self-test through the UI
	game._go_home()
	await _frames(2)
	game._on_selftest()
	await _frames(2)
	game._on_selftest()
	await _wait(func(): return not game._testing and game.ui.test_body.text.contains("eşleşti"), 6000)
	await _shot("tutarlilik")
	print("TEST: " + game.ui.test_body.text.replace("\n", " | "))
	_check(game.ui.test_body.text.begins_with("12/12"), "tutarlılık testi 12/12")
	print("SONUC: %d hata" % errors)
	quit(1 if errors > 0 else 0)
