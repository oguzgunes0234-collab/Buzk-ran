extends SceneTree
## Captures a few frames during a shot (effects check).
## Usage: xvfb-run godot --rendering-driver opengl3 --resolution 390x844 -s res://testler/ekran_hareket.gd -- <out_dir> <level> <type> <a> <b>
func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	var out: String = args[0]
	var game: Node = load("res://oyun.tscn").instantiate()
	root.add_child(game)
	for i in 5:
		await process_frame
	game.start_level(int(args[1]))
	for i in 5:
		await physics_frame
	game.hint_visible = false
	game.update_hud()
	game.select_ammo(args[2])
	game.aim = {"a": int(args[3]), "b": int(args[4])}
	game.set_aim_preview()
	for i in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_viewport().get_texture().get_image().save_png("%s/hareket-l%s-0.png" % [out, args[1]])
	game.fire(int(args[3]), int(args[4]))
	var shots := 0
	for f in 400:
		await physics_frame
		if game.sim.step % 12 == 0 and shots < 12:
			await RenderingServer.frame_post_draw
			root.get_viewport().get_texture().get_image().save_png("%s/hareket-l%s-%02d.png" % [out, args[1], game.sim.step])
			shots += 1
		if game.sim.phase != "flight":
			break
	quit()
