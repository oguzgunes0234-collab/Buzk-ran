extends SceneTree
# Parity check: runs the same one-shot grid as the web prototype (2-degree steps,
# every ammo type of the level) and compares the outcomes.
# Usage: godot --headless -s res://testler/web_karsilastir.gd -- <web_grid.json> [level ids...]
func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var web: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	var ids := []
	for i in range(1, args.size()):
		ids.append(int(args[i]))
	for lv in Levels.all():
		if not ids.is_empty() and not ids.has(lv.id):
			continue
		for t in web[str(lv.id)]:
			var cells: Array = web[str(lv.id)][t]
			var same_win := 0
			var same_all := 0
			var gw := 0
			var ww := 0
			for c in cells:
				var sim := Sim.new(lv)
				sim.run_shot(int(c[0]), int(c[1]), t)
				var g := [1 if sim.phase == "won" else 0, lv.cages.size() - sim.cages_left(), lv.totems.size() - sim.totems_left(), sim.nests_broken()]
				sim.free_all()
				gw += g[0]
				ww += int(c[2])
				if g[0] == int(c[2]):
					same_win += 1
				if g[0] == int(c[2]) and g[1] == int(c[3]) and g[2] == int(c[4]) and g[3] == int(c[5]):
					same_all += 1
			print("B%d %-6s atis %d | kazanma ayni %d (%.0f%%) | tum sonuc ayni %d (%.0f%%) | kazanan web %d godot %d" % [lv.id, t, cells.size(), same_win, 100.0 * same_win / cells.size(), same_all, 100.0 * same_all / cells.size(), ww, gw])
	quit()
