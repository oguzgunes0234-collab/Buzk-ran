class_name Arayuz
extends CanvasLayer
## HUD, ammo bar and menu screens, built in code. Emits signals to the game
## controller (oyun.gd); holds no game state of its own.

signal play_pressed
signal levels_pressed
signal level_chosen(id: int)
signal retry_pressed
signal menu_pressed
signal resume_pressed
signal home_pressed
signal next_pressed
signal skip_pressed
signal ammo_chosen(type: String)
signal selftest_pressed

const INK := Color("1b2a41")
const INK_SOFT := Color("4d5f78")
const SNOW := Color("f4f9fc")
const FROST := Color(0.957, 0.976, 0.988, 0.9)
const LINE := Color(0.106, 0.165, 0.255, 0.14)
const ICE_DEEP := Color("2f8fae")
const EMBER := Color("ff7a3d")
const EMBER_DEEP := Color("d9541a")

var theme_main: Theme
var font_body: FontVariation
var font_display: FontVariation

var root: MarginContainer
var screen_layer: Control
var hud: Control
var tour_label: Label
var level_label: Label
var goals_box: HBoxContainer
var hint_panel: PanelContainer
var hint_label: Label
var aim_label: Label
var aim_panel: PanelContainer
var ammo_bar: HBoxContainer
var drag_layer: DragKatman
var screens := {}
var current_screen := ""

# screen widgets filled by the controller
var res_title: Label
var res_body: Label
var res_next: Button
var res_retry: Button
var res_skip: Button
var res_levels: Button
var levels_grid: GridContainer
var end_body: Label
var test_body: Label
var test_run: Button
var start_body: Label


class DragKatman:
	extends Control
	## Draws the drag gesture: start ring, dotted line, finger dot.
	var active := false
	var p0 := Vector2.ZERO
	var p1 := Vector2.ZERO

	func _draw() -> void:
		if not active:
			return
		var col := Color(0.106, 0.165, 0.255, 0.55)
		draw_arc(p0, 14.0, 0.0, TAU, 32, col, 3.0, true)
		var d := p1 - p0
		var n := int(d.length() / 10.0)
		for i in n:
			var a := p0 + d * (float(i) / maxf(1, n))
			draw_circle(a, 2.0, col)
		draw_circle(p1, 9.0, col)


func _ready() -> void:
	_build_theme()
	root = MarginContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = theme_main
	add_child(root)
	drag_layer = DragKatman.new()
	drag_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	drag_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(drag_layer)
	# menu screens cover the whole screen, outside the safe-area margins
	screen_layer = Control.new()
	screen_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	screen_layer.theme = theme_main
	add_child(screen_layer)
	_build_hud()
	_build_screens()
	get_viewport().size_changed.connect(_apply_safe_area)
	_apply_safe_area()


# --- theme --------------------------------------------------------------------------------

func _font(path: String, weight: int) -> FontVariation:
	var f := FontVariation.new()
	f.base_font = load(path)
	var ts := TextServerManager.get_primary_interface()
	f.variation_opentype = {ts.name_to_tag("wght"): weight}
	return f


func _box(bg: Color, radius: int, border := Color(0, 0, 0, 0), bw := 0, pad := Vector4(10, 6, 10, 6)) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(radius)
	s.border_color = border
	s.set_border_width_all(bw)
	s.content_margin_left = pad.x
	s.content_margin_top = pad.y
	s.content_margin_right = pad.z
	s.content_margin_bottom = pad.w
	s.anti_aliasing = true
	return s


func _build_theme() -> void:
	font_body = _font("res://yazitipi/Nunito.ttf", 800)
	font_display = _font("res://yazitipi/Baloo2.ttf", 800)
	var th := Theme.new()
	th.default_font = font_body
	th.default_font_size = 15
	th.set_color("font_color", "Label", INK)
	for st in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		th.set_color(st, "Button", INK)
	th.set_color("font_disabled_color", "Button", Color(INK.r, INK.g, INK.b, 0.45))
	th.set_font_size("font_size", "Button", 16)
	th.set_stylebox("normal", "Button", _box(FROST, 12, LINE, 1, Vector4(16, 10, 16, 10)))
	th.set_stylebox("hover", "Button", _box(Color.WHITE, 12, LINE, 1, Vector4(16, 10, 16, 10)))
	th.set_stylebox("pressed", "Button", _box(Color("e3f1f7"), 12, ICE_DEEP, 2, Vector4(16, 10, 16, 10)))
	th.set_stylebox("disabled", "Button", _box(Color(0.957, 0.976, 0.988, 0.45), 12, LINE, 1, Vector4(16, 10, 16, 10)))
	th.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	th.set_stylebox("panel", "PanelContainer", _box(SNOW, 18, Color(0, 0, 0, 0), 0, Vector4(20, 20, 20, 20)))
	# primary button variation
	th.set_type_variation("BtnAna", "Button")
	th.set_stylebox("normal", "BtnAna", _box(EMBER, 12, EMBER_DEEP, 0, Vector4(16, 12, 16, 12)))
	th.set_stylebox("hover", "BtnAna", _box(Color("ff8a52"), 12, EMBER_DEEP, 0, Vector4(16, 12, 16, 12)))
	th.set_stylebox("pressed", "BtnAna", _box(EMBER_DEEP, 12, EMBER_DEEP, 0, Vector4(16, 12, 16, 12)))
	for st in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		th.set_color(st, "BtnAna", Color.WHITE)
	th.set_type_variation("HudBtn", "Button")
	th.set_font_size("font_size", "HudBtn", 14)
	th.set_stylebox("normal", "HudBtn", _box(FROST, 10, LINE, 1, Vector4(12, 7, 12, 7)))
	th.set_stylebox("pressed", "HudBtn", _box(Color.WHITE, 10, ICE_DEEP, 2, Vector4(12, 7, 12, 7)))
	th.set_stylebox("hover", "HudBtn", _box(Color.WHITE, 10, LINE, 1, Vector4(12, 7, 12, 7)))
	theme_main = th


func _label(text: String, size := 15, color := INK, display := false) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if display:
		l.add_theme_font_override("font", font_display)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _button(text: String, primary := false) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 48)
	if primary:
		b.theme_type_variation = "BtnAna"
	return b


func _circle_tex(size: int, inner: Color, outer: Color) -> ImageTexture:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var c := Vector2(size, size) / 2.0
	for y in size:
		for x in size:
			var p := Vector2(x + 0.5, y + 0.5)
			var d := p.distance_to(c) / (size / 2.0)
			var a := clampf((1.0 - d) * size / 2.0, 0.0, 1.0)
			var g := clampf(p.distance_to(c * Vector2(0.8, 0.7)) / (size * 0.6), 0.0, 1.0)
			var col := inner.lerp(outer, g)
			col.a *= a
			img.set_pixel(x, y, col)
	return ImageTexture.create_from_image(img)


# --- HUD ------------------------------------------------------------------------------------

func _build_hud() -> void:
	hud = Control.new()
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hud)

	var top := VBoxContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_theme_constant_override("separation", 8)
	hud.add_child(top)

	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_child(row)
	var titles := VBoxContainer.new()
	titles.mouse_filter = Control.MOUSE_FILTER_IGNORE
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", -2)
	tour_label = _label("", 12, INK_SOFT)
	tour_label.uppercase = true
	level_label = _label("", 21, INK, true)
	titles.add_child(tour_label)
	titles.add_child(level_label)
	row.add_child(titles)
	var retry := Button.new()
	retry.text = "↻"
	retry.theme_type_variation = "HudBtn"
	retry.custom_minimum_size = Vector2(44, 40)
	retry.pressed.connect(func(): retry_pressed.emit())
	row.add_child(retry)
	var menu := Button.new()
	menu.text = "Menü"
	menu.theme_type_variation = "HudBtn"
	menu.custom_minimum_size = Vector2(0, 40)
	menu.pressed.connect(func(): menu_pressed.emit())
	row.add_child(menu)

	goals_box = HBoxContainer.new()
	goals_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	goals_box.add_theme_constant_override("separation", 6)
	top.add_child(goals_box)

	hint_panel = _chip_panel(Color(0.957, 0.976, 0.988, 0.78), 9)
	hint_label = _label("", 13, INK_SOFT)
	hint_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint_panel.add_child(hint_label)
	top.add_child(hint_panel)

	aim_panel = _chip_panel(Color(0.957, 0.976, 0.988, 0.8), 8)
	aim_panel.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	aim_label = _label("", 14)
	aim_panel.add_child(aim_label)
	top.add_child(aim_panel)

	ammo_bar = HBoxContainer.new()
	ammo_bar.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	ammo_bar.grow_vertical = Control.GROW_DIRECTION_BEGIN
	ammo_bar.alignment = BoxContainer.ALIGNMENT_CENTER
	ammo_bar.add_theme_constant_override("separation", 8)
	ammo_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(ammo_bar)


func _chip_panel(bg: Color, radius: int) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", _box(bg, radius, Color(0, 0, 0, 0), 0, Vector4(10, 4, 10, 4)))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


func set_level_title(tour_text: String, title: String) -> void:
	tour_label.text = tour_text
	level_label.text = title


## chips: Array of [text, kind] with kind in cage/totem/nest/nest_bad
func set_goals(chips: Array) -> void:
	for c in goals_box.get_children():
		c.queue_free()
	var colors := {"cage": Color(0.498, 0.827, 0.918, 0.45), "totem": Color(0.694, 0.549, 1.0, 0.35),
		"nest": Color(0.788, 0.541, 0.227, 0.25), "nest_bad": Color("ffd23f")}
	for c in chips:
		var p := _chip_panel(colors[c[1]], 8)
		p.add_child(_label(c[0], 13))
		goals_box.add_child(p)


func set_hint(text: String, show_hint: bool) -> void:
	hint_label.text = text
	hint_panel.visible = show_hint and text != ""


func set_aim_text(text: String) -> void:
	aim_label.text = text
	aim_panel.visible = text != ""


## items: Array of {type, name, count, selected, enabled}
func set_ammo(items: Array) -> void:
	for c in ammo_bar.get_children():
		c.queue_free()
	for it in items:
		var b := Button.new()
		b.theme_type_variation = "HudBtn"
		b.custom_minimum_size = Vector2(98, 54)
		b.text = "%s\n×%d" % [it.name, it.count]
		b.add_theme_font_size_override("font_size", 14)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.icon = _ammo_icon(it.type)
		b.disabled = not it.enabled
		if it.selected:
			var on := _box(Color.WHITE, 12, EMBER, 2, Vector4(10, 6, 12, 6))
			on.shadow_color = Color(1.0, 0.478, 0.239, 0.25)
			on.shadow_size = 6
			b.add_theme_stylebox_override("normal", on)
			b.add_theme_stylebox_override("hover", on)
			b.add_theme_stylebox_override("pressed", on)
		var t: String = it.type
		b.pressed.connect(func(): ammo_chosen.emit(t))
		ammo_bar.add_child(b)


var _icon_cache := {}


func _ammo_icon(type: String) -> ImageTexture:
	if _icon_cache.has(type):
		return _icon_cache[type]
	var tex: ImageTexture
	match type:
		"heavy":
			tex = _circle_tex(30, Color("566174"), Color("2c3440"))
		"ember":
			tex = _circle_tex(26, Color("ffd23f"), Color("ff3b1f"))
		_:
			tex = _circle_tex(24, Color("ff9a66"), EMBER_DEEP)
	_icon_cache[type] = tex
	return tex


func set_drag(active: bool, p0 := Vector2.ZERO, p1 := Vector2.ZERO) -> void:
	drag_layer.active = active
	drag_layer.p0 = p0
	drag_layer.p1 = p1
	drag_layer.queue_redraw()


# --- screens ---------------------------------------------------------------------------------

func _screen(id: String) -> VBoxContainer:
	var s := Control.new()
	s.set_anchors_preset(Control.PRESET_FULL_RECT)
	s.mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.839, 0.918, 0.953, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	s.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	s.add_child(center)
	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(340, 0)
	center.add_child(card)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	card.add_child(box)
	s.visible = false
	screen_layer.add_child(s)
	screens[id] = s
	return box


func _eyebrow(text: String) -> Label:
	var l := _label(text, 11, ICE_DEEP)
	l.uppercase = true
	return l


func _body(text: String) -> Label:
	var l := _label(text, 14, INK_SOFT)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(300, 0)
	return l


func _build_screens() -> void:
	# start
	var b := _screen("baslangic")
	b.add_child(_eyebrow("Gri kutu prototip · Godot · M1"))
	b.add_child(_label("Buzkıran Vadisi", 40, INK, true))
	start_body = _body("Buza hapsolmuş yavruları kurtar. Basılı tut ve sürükle: sağ-sol yön, yukarı-aşağı yükseklik. Bırakınca atar. Başlangıç noktasına geri dönersen atış iptal olur.")
	b.add_child(start_body)
	var play := _button("Oyna", true)
	play.pressed.connect(func(): play_pressed.emit())
	b.add_child(play)
	var lv := _button("Bölümler")
	lv.pressed.connect(func(): levels_pressed.emit())
	b.add_child(lv)
	var st := _button("Tutarlılık testi")
	st.add_theme_font_size_override("font_size", 13)
	st.custom_minimum_size = Vector2(0, 38)
	st.pressed.connect(func(): selftest_pressed.emit())
	b.add_child(st)

	# levels
	b = _screen("bolumler")
	b.add_child(_eyebrow("Serbest oyun"))
	b.add_child(_label("Bölümler", 28, INK, true))
	levels_grid = GridContainer.new()
	levels_grid.columns = 2
	levels_grid.add_theme_constant_override("h_separation", 8)
	levels_grid.add_theme_constant_override("v_separation", 8)
	b.add_child(levels_grid)
	var back := _button("Geri")
	back.pressed.connect(func(): home_pressed.emit())
	b.add_child(back)

	# pause menu
	b = _screen("menu")
	b.add_child(_label("Menü", 28, INK, true))
	var resume := _button("Devam", true)
	resume.pressed.connect(func(): resume_pressed.emit())
	b.add_child(resume)
	var restart := _button("Baştan başla")
	restart.pressed.connect(func(): retry_pressed.emit())
	b.add_child(restart)
	var to_levels := _button("Bölümler")
	to_levels.pressed.connect(func(): levels_pressed.emit())
	b.add_child(to_levels)
	var home := _button("Ana ekran")
	home.pressed.connect(func(): home_pressed.emit())
	b.add_child(home)

	# result
	b = _screen("sonuc")
	res_title = _label("", 30, INK, true)
	b.add_child(res_title)
	res_body = _body("")
	b.add_child(res_body)
	res_next = _button("Sıradaki", true)
	res_next.pressed.connect(func(): next_pressed.emit())
	b.add_child(res_next)
	res_retry = _button("Tekrar dene", true)
	res_retry.pressed.connect(func(): retry_pressed.emit())
	b.add_child(res_retry)
	res_skip = _button("Geç")
	res_skip.pressed.connect(func(): skip_pressed.emit())
	b.add_child(res_skip)
	res_levels = _button("Bölümler")
	res_levels.pressed.connect(func(): levels_pressed.emit())
	b.add_child(res_levels)

	# end of tour
	b = _screen("tur_sonu")
	b.add_child(_eyebrow("Tur bitti"))
	b.add_child(_label("Tebrikler!", 32, INK, true))
	end_body = _body("")
	b.add_child(end_body)
	var end_home := _button("Ana ekran", true)
	end_home.pressed.connect(func(): home_pressed.emit())
	b.add_child(end_home)

	# determinism self-test
	b = _screen("test")
	b.add_child(_eyebrow("Cihazlar arası tutarlılık"))
	b.add_child(_label("Tutarlılık testi", 26, INK, true))
	test_body = _body("Aynı atış kayıtlarını bu telefonda oynatıp sonuçları bilgisayardaki referansla karşılaştırır.")
	b.add_child(test_body)
	test_run = _button("Testi başlat", true)
	test_run.pressed.connect(func(): selftest_pressed.emit())
	b.add_child(test_run)
	var test_back := _button("Geri")
	test_back.pressed.connect(func(): home_pressed.emit())
	b.add_child(test_back)


## levels: Array of {id, name, done}
func fill_levels(levels: Array) -> void:
	for c in levels_grid.get_children():
		c.queue_free()
	for lv in levels:
		var btn := _button("%d · %s%s" % [lv.id, lv.name, "  ✓" if lv.done else ""])
		btn.custom_minimum_size = Vector2(150, 48)
		btn.add_theme_font_size_override("font_size", 14)
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var id: int = lv.id
		btn.pressed.connect(func(): level_chosen.emit(id))
		levels_grid.add_child(btn)


func show_screen(id: String) -> void:
	current_screen = id
	for k in screens:
		screens[k].visible = k == id
	hud.visible = id == "" or id == "sonuc"


func _apply_safe_area() -> void:
	var win := DisplayServer.window_get_size()
	var safe := DisplayServer.get_display_safe_area()
	var vp := get_viewport().get_visible_rect().size
	var top := 0.0
	var bottom := 0.0
	if win.y > 0 and safe.size.y > 0 and OS.has_feature("mobile"):
		var k := vp.y / float(win.y)
		top = safe.position.y * k
		bottom = maxf(0.0, (win.y - safe.end.y) * k)
	root.add_theme_constant_override("margin_left", 12)
	root.add_theme_constant_override("margin_right", 12)
	root.add_theme_constant_override("margin_top", int(10 + top))
	root.add_theme_constant_override("margin_bottom", int(12 + bottom))
