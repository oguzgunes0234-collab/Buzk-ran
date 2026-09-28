extends Node
## Game controller: level flow, touch aiming, fixed-step simulation, effects
## and screens. Mirrors prototip-web/src/main.js without the web-only
## evaluation form.

const HINT := "Basılı tutup sürükle: sağ-sol yön, yukarı-aşağı yükseklik. Bırakınca atar."
const PREVIEW_STEPS := 220 # the path is cut at the first predicted contact
const DRAG_K := 0.8 # tenths of a degree per UI unit
const SAVE_PATH := "user://ilerleme.cfg"

var sahne: Sahne
var ses: Ses
var ui: Arayuz

var sim: Sim
var level: Dictionary
var tour = null # {order: [ids], idx}
var aim := {"a": 0, "b": 200}
var ammo_sel := "normal"
var drag = null
var play := {}
var log_rows: Array = []
var prev_poses = null
var curr_poses: Array = []
var completed := {}
var hint_visible := true
var result_pending := false


func _ready() -> void:
	sahne = Sahne.new()
	add_child(sahne)
	ses = Ses.new()
	add_child(ses)
	ui = Arayuz.new()
	add_child(ui)
	ui.play_pressed.connect(_on_play)
	ui.levels_pressed.connect(_open_levels)
	ui.level_chosen.connect(func(id): tour = null; start_level(id))
	ui.retry_pressed.connect(func(): start_level(level.id, true))
	ui.menu_pressed.connect(func(): if ui.current_screen == "": ui.show_screen("menu"))
	ui.resume_pressed.connect(func(): ui.show_screen(""))
	ui.home_pressed.connect(_go_home)
	ui.next_pressed.connect(_on_next)
	ui.skip_pressed.connect(_on_skip)
	ui.ammo_chosen.connect(select_ammo)
	ui.selftest_pressed.connect(_on_selftest)
	_load_progress()
	# a level behind the start screen
	_load_sim(Levels.by_id(10))
	ui.show_screen("baslangic")


# --- flow -------------------------------------------------------------------------------------

func _load_sim(lv: Dictionary) -> void:
	if sim != null:
		sim.free_all()
	level = lv
	sim = Sim.new(level, true)
	curr_poses = sim.poses()
	prev_poses = null
	sahne.load_level(level, sim)


func _first_ammo() -> String:
	if sim.ammo.normal > 0:
		return "normal"
	for t in SimConfig.AMMO_ORDER:
		if sim.ammo[t] > 0:
			return t
	return "normal"


func start_level(id: int, is_retry := false) -> void:
	result_pending = false
	_load_sim(Levels.by_id(id))
	drag = null
	ui.set_drag(false)
	if not is_retry:
		aim = {"a": 0, "b": 200}
	ammo_sel = _first_ammo()
	if is_retry and not play.is_empty() and play.level == id:
		play.attempts += 1
	else:
		var m := sahne.measure_targets()
		var vmin := 1.0
		var pmin := 0.0
		if not m.is_empty():
			vmin = m.map(func(x): return x.visible).min()
			pmin = m.map(func(x): return x.px).min()
		play = {"level": id, "attempts": 1, "t0": Time.get_ticks_msec(), "shots": 0, "ammo_used": {}, "visible_min": vmin, "px_min": pmin}
	hint_visible = true
	ui.show_screen("")
	update_hud()
	set_aim_preview()


func _goal_chips() -> Array:
	var out: Array = []
	var nc: int = level.cages.size()
	var nt: int = level.totems.size()
	if nc > 0:
		out.append(["Kafes %d/%d" % [nc - sim.cages_left(), nc], "cage"])
	if nt > 0:
		out.append(["Totem %d/%d" % [nt - sim.totems_left(), nt], "totem"])
	if level.nests.size() > 0:
		var bad := sim.nests_broken() > 0
		out.append(["Yuva " + ("kırıldı" if bad else "güvende"), "nest_bad" if bad else "nest"])
	return out


func update_hud() -> void:
	var tour_text := "Tur %d/%d" % [tour.idx + 1, tour.order.size()] if tour != null else "Serbest oyun"
	ui.set_level_title(tour_text, "%d · %s" % [level.id, level.name])
	ui.set_goals(_goal_chips())
	ui.set_hint(level.hint + " " + HINT, hint_visible)
	_render_ammo()


func _render_ammo() -> void:
	var items: Array = []
	for t in SimConfig.AMMO_ORDER:
		if not level.ammo.has(t):
			continue
		items.append({"type": t, "name": SimConfig.AMMO[t].name, "count": sim.ammo[t], "selected": ammo_sel == t,
			"enabled": sim.ammo[t] > 0 and sim.phase == "aim"})
	ui.set_ammo(items)


func select_ammo(t: String) -> void:
	if sim == null or sim.phase != "aim" or sim.ammo[t] <= 0:
		return
	ammo_sel = t
	_render_ammo()
	set_aim_preview()


func _deg(x: int) -> String:
	return ("%.1f" % (x / 10.0)).replace(".", ",")


func set_aim_preview() -> void:
	var aiming := sim != null and sim.phase == "aim" and sim.shots_left() > 0 and ui.current_screen == ""
	sahne.set_loaded(aiming, ammo_sel)
	if not aiming:
		sahne.set_aim(Vector3.ZERO, PackedVector3Array(), 0.0)
		ui.set_aim_text("")
		return
	var v := SimConfig.launch_velocity(level, aim.a, aim.b, ammo_sel)
	var blast: float = SimConfig.BLAST.radius if ammo_sel == "ember" else 0.0
	sahne.set_aim(v, SimConfig.preview_path(level, aim.a, aim.b, PREVIEW_STEPS, ammo_sel), blast)
	ui.set_aim_text("%s · Yön %s° · Yükseklik %s°" % [SimConfig.AMMO[ammo_sel].name, _deg(aim.a), _deg(aim.b)])


func fire(a: int, b: int, t := "") -> void:
	var type := t if t != "" else ammo_sel
	if not sim.fire(a, b, type):
		return
	play.shots += 1
	play.ammo_used[type] = play.ammo_used.get(type, 0) + 1
	if sim.ammo[ammo_sel] <= 0:
		ammo_sel = _first_ammo()
	sahne.set_aim(Vector3.ZERO, PackedVector3Array(), 0.0)
	ui.set_aim_text("")
	update_hud()


# --- touch aiming -------------------------------------------------------------------------------

func _unhandled_input(event: InputEvent) -> void:
	if ui.current_screen != "" or sim == null or sim.phase != "aim":
		return
	if event is InputEventScreenTouch:
		if event.pressed and drag == null:
			hint_visible = false
			ui.set_hint("", false)
			drag = {"index": event.index, "p0": event.position, "p": event.position, "t0": Time.get_ticks_msec(), "far": false, "start": aim.duplicate()}
			ui.set_drag(true, event.position, event.position)
		elif not event.pressed and drag != null and event.index == drag.index:
			var d: Dictionary = drag
			drag = null
			ui.set_drag(false)
			var dist: float = (d.p - d.p0).length()
			var cancelled: bool = d.far and dist < 14.0
			var too_short: bool = Time.get_ticks_msec() - d.t0 < 120 and dist < 8.0
			if cancelled:
				aim = d.start
			if not cancelled and not too_short:
				fire(aim.a, aim.b)
			else:
				set_aim_preview()
	elif event is InputEventScreenDrag and drag != null and event.index == drag.index:
		drag.p = event.position
		var dv: Vector2 = drag.p - drag.p0
		if dv.length() > 30.0:
			drag.far = true
		aim = {
			"a": clampi(roundi(drag.start.a + dv.x * DRAG_K), SimConfig.YAW_MIN, SimConfig.YAW_MAX),
			"b": clampi(roundi(drag.start.b - dv.y * DRAG_K), SimConfig.PITCH_MIN, SimConfig.PITCH_MAX),
		}
		ui.set_drag(true, drag.p0, drag.p)
		set_aim_preview()


# --- simulation loop ----------------------------------------------------------------------------

func _physics_process(_delta: float) -> void:
	if sim == null or sim.phase != "flight":
		return
	prev_poses = curr_poses
	sim.tick()
	curr_poses = sim.poses()
	_handle_fx()


func _process(_delta: float) -> void:
	if sim == null:
		return
	var alpha := Engine.get_physics_interpolation_fraction() if sim.phase == "flight" else 1.0
	sahne.sync(prev_poses, curr_poses, alpha)


func _handle_fx() -> void:
	for ev in sim.pending_fx:
		match ev.type:
			"fire":
				ses.fire(ev.ammo)
				Ses.vibrate(12, 0.4)
				sahne.shake = maxf(sahne.shake, 0.03)
				sahne.set_loaded(false)
			"impact":
				sahne.on_impact(ev)
				ses.impact(ev.force, ev.ground)
			"break":
				sahne.on_break(ev)
				ses.shatter()
				ses.rescue()
				Ses.vibrate(35, 0.7)
				update_hud()
			"shatter":
				sahne.on_shatter(ev)
				ses.shatter(0.6)
			"explode":
				sahne.on_explode(ev)
				ses.explode()
				Ses.vibrate(45, 1.0)
			"totem":
				sahne.on_totem(ev)
				ses.totem()
				Ses.vibrate(25, 0.6)
				update_hud()
			"nest":
				sahne.on_nest(ev)
				ses.crack()
				Ses.vibrate(60, 0.9)
				update_hud()
			"settled":
				update_hud()
				if ev.phase == "won" or ev.phase == "lost":
					result_pending = true
					var lv_id: int = level.id
					get_tree().create_timer(0.5 if ev.phase == "won" else 0.35).timeout.connect(func():
						if result_pending and sim != null and level.id == lv_id:
							_show_result(ev.phase))
				else:
					set_aim_preview()
	sim.pending_fx.clear()


# --- results and tour -----------------------------------------------------------------------------

func _remaining_text() -> String:
	var parts: Array = []
	if sim.cages_left() > 0:
		parts.append("%d kafes" % sim.cages_left())
	if sim.totems_left() > 0:
		parts.append("%d totem" % sim.totems_left())
	return ", ".join(parts)


func _record(result: String) -> void:
	log_rows.append({"level": play.level, "result": result, "attempts": play.attempts, "shots": play.shots,
		"seconds": (Time.get_ticks_msec() - play.t0) / 1000.0, "fail": sim.fail_reason})


func _show_result(phase: String) -> void:
	result_pending = false
	var won := phase == "won"
	if won:
		ses.win()
		Ses.vibrate(40, 0.8)
		_record("kazandı")
		completed[level.id] = true
		_save_progress()
	else:
		ses.lose()
	var nest_fail := not won and sim.fail_reason == "yuva"
	ui.res_title.text = "Başardın!" if won else ("Yuva kırıldı" if nest_fail else "Atış hakkı bitti")
	if won:
		ui.res_body.text = "%s · %d. denemede, toplam %d atış" % [level.name, play.attempts, play.shots]
	elif nest_fail:
		ui.res_body.text = "Yumurtalı yuvaya zarar geldi. Aynı düzeni tekrar deneyebilirsin."
	else:
		var stone_left := false
		for t in sim.totems:
			if t.mat == "stone" and not t.down:
				stone_left = true
		ui.res_body.text = _remaining_text() + " kaldı. Aynı düzeni tekrar deneyebilirsin." + (" İpucu: gri taş totemi yalnız Ağır gülle devirir." if stone_left else "")
	if tour != null:
		ui.res_next.text = "Sıradaki (%d/%d)" % [tour.idx + 2, tour.order.size()] if tour.idx + 1 < tour.order.size() else "Turu bitir"
	else:
		ui.res_next.text = "Bölümler"
	ui.res_next.visible = won
	ui.res_retry.visible = not won
	ui.res_skip.visible = not won and tour != null
	ui.res_levels.visible = not won and tour == null
	ui.show_screen("sonuc")


func _on_play() -> void:
	# continue the tour from the first level not yet completed
	var order: Array = Levels.all().map(func(l): return l.id)
	var idx := 0
	while idx < order.size() and completed.has(order[idx]):
		idx += 1
	if idx >= order.size():
		idx = 0 # everything done: play the tour again from the start
	tour = {"order": order, "idx": idx}
	start_level(order[idx])


func _on_next() -> void:
	if tour == null:
		_open_levels()
		return
	tour.idx += 1
	if tour.idx >= tour.order.size():
		_show_tour_end()
	else:
		start_level(tour.order[tour.idx])


func _on_skip() -> void:
	_record("geçildi")
	_on_next()


func _show_tour_end() -> void:
	var won := log_rows.filter(func(r): return r.result == "kazandı")
	var first := won.filter(func(r): return r.attempts == 1)
	var shots := 0
	for r in won:
		shots += r.shots
	ui.end_body.text = "%d bölüm kazandın, %d tanesini ilk denemede. Kazanılan bölümlerde ortalama %s atış." % [
		won.size(), first.size(), ("%.1f" % (float(shots) / maxf(1, won.size()))).replace(".", ",")]
	tour = null
	ui.show_screen("tur_sonu")


func _open_levels() -> void:
	var items: Array = []
	for lv in Levels.all():
		items.append({"id": lv.id, "name": lv.name, "done": completed.has(lv.id)})
	ui.fill_levels(items)
	ui.show_screen("bolumler")
	set_aim_preview()


func _go_home() -> void:
	tour = null
	result_pending = false
	_load_sim(Levels.by_id(10))
	ui.show_screen("baslangic")
	set_aim_preview()


# --- determinism self-test --------------------------------------------------------------------------

var _testing := false


func _on_selftest() -> void:
	if ui.current_screen != "test":
		ui.show_screen("test")
		ui.test_body.text = "Aynı atış kayıtlarını bu telefonda oynatıp sonuçları bilgisayardaki referansla karşılaştırır. Birkaç saniye sürer."
		ui.test_run.visible = true
		return
	if _testing:
		return
	_testing = true
	ui.test_run.visible = false
	var cases: Array = Referans.DATA.cases
	var ok := 0
	var lines: Array = []
	for i in cases.size():
		var c: Dictionary = cases[i]
		ui.test_body.text = "Çalışıyor: %d/%d · %s" % [i + 1, cases.size(), c.name]
		await get_tree().process_frame
		await get_tree().process_frame
		var r := Sim.replay(Levels.by_id(int(c.level)), c.shots, int(Referans.DATA.meta.every))
		var same: bool = r.initial == c.expect.initial and r.ready == c.expect.ready and r.final == c.expect.final \
			and int(r.final_step) == int(c.expect.final_step) and _same_checkpoints(r.checkpoints, c.expect.checkpoints)
		if same:
			ok += 1
		else:
			lines.append("✗ %s (beklenen %s, bulunan %s)" % [c.name, c.expect.final, r.final])
	var head := "%d/%d eşleşti." % [ok, cases.size()]
	var verdict := "Bu telefonda sonuçlar bilgisayardakiyle bire bir aynı." if ok == cases.size() else "Bazı sonuçlar farklı. Bu ekranın görüntüsünü bana gönder."
	ui.test_body.text = head + " " + verdict + ("\n" + "\n".join(lines) if not lines.is_empty() else "") + "\nReferans: " + str(Referans.DATA.meta.recorded_on)
	_testing = false


func _same_checkpoints(a: Array, b: Array) -> bool:
	if a.size() != b.size():
		return false
	for i in a.size():
		if int(a[i][0]) != int(b[i][0]) or str(a[i][1]) != str(b[i][1]):
			return false
	return true


# --- progress ------------------------------------------------------------------------------------------

func _load_progress() -> void:
	var cf := ConfigFile.new()
	if cf.load(SAVE_PATH) == OK:
		for id in cf.get_value("ilerleme", "tamamlanan", []):
			completed[int(id)] = true


func _save_progress() -> void:
	var cf := ConfigFile.new()
	cf.set_value("ilerleme", "tamamlanan", completed.keys())
	cf.save(SAVE_PATH)


# --- test hooks (used by testler/*.gd, never by the player) ------------------------------------------

func test_state() -> Dictionary:
	return {"screen": ui.current_screen, "phase": sim.phase if sim != null else "", "level": level.get("id", 0)}
