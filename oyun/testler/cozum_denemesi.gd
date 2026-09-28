extends SceneTree
# Smoke test: plays each level's web-bot solution in the Godot sim and prints the result,
# then checks run-to-run determinism on one level.
const SOL := {
	1: [["normal", 0, 230]], 2: [["normal", 0, 210]], 3: [["normal", -110, 210], ["normal", 70, 290]],
	4: [["normal", 0, 250]], 5: [["heavy", 0, 460]], 6: [["ember", 0, 240]],
	7: [["normal", -80, 230], ["normal", 50, 250]], 8: [["ember", 0, 270]],
	9: [["ember", 50, 210], ["heavy", -90, 430]],
	10: [["ember", 40, 670], ["normal", -110, 250], ["heavy", -10, 370]],
}
func _init() -> void:
	var t0 := Time.get_ticks_msec()
	for lv in Levels.all():
		var sim := Sim.new(lv)
		for s in SOL[lv.id]:
			sim.run_shot(s[1], s[2], s[0])
		print("B%d %-14s faz=%s kafes=%d totem=%d yuva=%d adim=%d hash=%s" % [lv.id, lv.name, sim.phase, sim.cages_left(), sim.totems_left(), sim.nests_broken(), sim.step, sim.hash_state()])
		sim.free_all()
	var a := Sim.replay(Levels.by_id(10), [{"t": "ember", "a": 40, "b": 670}, {"t": "normal", "a": -110, "b": 250}])
	var b := Sim.replay(Levels.by_id(10), [{"t": "ember", "a": 40, "b": 670}, {"t": "normal", "a": -110, "b": 250}])
	print("tekrar ayni mi: ", a.final == b.final and a.checkpoints == b.checkpoints, " ", a.final, " ", b.final)
	print("sure ms: ", Time.get_ticks_msec() - t0)
	quit()
