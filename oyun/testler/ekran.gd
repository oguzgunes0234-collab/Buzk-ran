extends SceneTree
## Renders the given levels while aiming and saves screenshots (for tuning looks).
## Usage: xvfb-run godot --rendering-driver opengl3 --resolution 390x844 -s res://testler/ekran.gd -- <out_dir> [ids]
func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	var out: String = args[0]
	var game: Node = load("res://oyun.tscn").instantiate()
	root.add_child(game)
	for i in 5:
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_viewport().get_texture().get_image().save_png(out + "/ekran-baslangic.png")
	for k in range(1, args.size()):
		game.start_level(int(args[k]))
		for i in 5:
			await process_frame
		await RenderingServer.frame_post_draw
		root.get_viewport().get_texture().get_image().save_png("%s/ekran-l%s.png" % [out, args[k]])
		print("B%s cizim cagrisi %d, ucgen %d, nesne %d" % [args[k], Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME), Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME), Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)])
	quit()
