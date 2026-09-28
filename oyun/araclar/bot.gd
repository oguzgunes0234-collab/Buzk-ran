extends SceneTree
## Test bot (Godot port of prototip-web/tools/bot.mjs). For every level and ammo
## type it scans a grid of first shots, measures how wide the winning input
## region is, and if no single shot wins, runs a beam search over shot
## sequences. It says nothing about whether a person finds, understands or
## enjoys the solution; narrow solutions between grid steps can be missed.
##
## Usage: godot --headless -s res://araclar/bot.gd -- [--coarse] [--need] [--out=path.json] [level ids]

const FOLLOWUP := {"a": 30, "b": 30} # 3-degree grid for later shots
const BEAM := 3

var grid := {"a": 10, "b": 10}
var need := false


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var ids: Array = []
	var out_path := ""
	for a in args:
		if a == "--coarse":
			grid = {"a": 20, "b": 20}
		elif a == "--need":
			need = true
		elif a.begins_with("--out="):
			out_path = a.substr(6)
		elif a.is_valid_int():
			ids.append(int(a))
	var report := {
		"generated": Time.get_datetime_string_from_system(true),
		"engine": "Godot %s + Rapier3D" % Engine.get_version_info().string,
		"method": {
			"note": "Oran yalnızca taranan sınırlar ve adım büyüklüğü içindeki atışları kapsar. Oyuncunun çözümü bulacağını veya bölümün eğlenceli olduğunu göstermez.",
			"bounds": {"yaw": [SimConfig.YAW_MIN / 10.0, SimConfig.YAW_MAX / 10.0], "pitch": [SimConfig.PITCH_MIN / 10.0, SimConfig.PITCH_MAX / 10.0]},
			"grid": grid, "followup": FOLLOWUP, "beam": BEAM,
		},
		"levels": [],
	}
	for lv in Levels.all():
		if not ids.is_empty() and not ids.has(lv.id):
			continue
		var t0 := Time.get_ticks_msec()
		var r := _solve(lv)
		var entry: Dictionary = r.entry
		if need:
			entry.need = {}
			for t in r.types:
				if t == "normal":
					continue
				var alt: Dictionary = lv.duplicate()
				alt.ammo = lv.ammo.map(func(x): return "normal" if x == t else x)
				var r2 := _solve(alt)
				entry.need[t] = {"needed": r2.entry.solution.shots == null, "without_it": r2.entry.solution}
		entry.seconds = (Time.get_ticks_msec() - t0) / 1000.0
		report.levels.append(entry)
		var parts: Array = []
		for t in r.types:
			var o: Dictionary = r.by_type[t]
			parts.append("%s %%%.1f (bolge %d, saglam %d%s)" % [t, o.win_ratio * 100.0, o.largest_region, o.robust, ", yuva kirilan %d" % o.nest_broken if o.nest_broken > 0 else ""])
		var sol: Dictionary = entry.solution
		var need_txt := ""
		if entry.has("need"):
			var bits: Array = []
			for t in entry.need:
				bits.append("%s %s" % [t, "EVET" if entry.need[t].needed else "hayir"])
			need_txt = " || gerekli mi: " + ", ".join(bits)
		print("B%d %s | %s || cozum: %s atis %s%s (%.1fs)" % [lv.id, lv.name, " | ".join(parts), str(sol.shots) if sol.shots != null else "YOK", JSON.stringify(sol.get("sequence", [])), need_txt, entry.seconds])
	if out_path != "":
		var f := FileAccess.open(out_path, FileAccess.WRITE)
		f.store_string(JSON.stringify(report, "  "))
	quit()


func _types(lv: Dictionary) -> Array:
	return SimConfig.AMMO_ORDER.filter(func(t): return lv.ammo.has(t))


## One cell: [a, b, won, progress, nest_broken]
func _cell(lv: Dictionary, prefix: Array, a: int, b: int, t: String) -> Array:
	var sim := Sim.new(lv)
	for s in prefix:
		sim.run_shot(s.a, s.b, s.t)
	if sim.phase == "aim":
		sim.run_shot(a, b, t)
	var won := 1 if sim.phase == "won" else 0
	var progress: int = lv.cages.size() - sim.cages_left() + lv.totems.size() - sim.totems_left()
	var nest := 1 if sim.nests_broken() > 0 else 0
	sim.free_all()
	return [a, b, won, progress, nest]


func _scan(lv: Dictionary, prefix: Array, g: Dictionary, t: String) -> Array:
	var out: Array = []
	var a := SimConfig.YAW_MIN
	while a <= SimConfig.YAW_MAX:
		var b := SimConfig.PITCH_MIN
		while b <= SimConfig.PITCH_MAX:
			out.append(_cell(lv, prefix, a, b, t))
			b += g.b
		a += g.a
	return out


func _analyse(results: Array, g: Dictionary) -> Dictionary:
	var key := func(a: int, b: int) -> String: return "%d,%d" % [a, b]
	var cells := {}
	for r in results:
		cells[key.call(r[0], r[1])] = r
	var wins := results.filter(func(r): return r[2] == 1)
	var n4 := [[g.a, 0], [-g.a, 0], [0, g.b], [0, -g.b]]
	var seen := {}
	var best: Array = []
	for w in wins:
		var k: String = key.call(w[0], w[1])
		if seen.has(k):
			continue
		var comp: Array = []
		var stack: Array = [w]
		seen[k] = true
		while not stack.is_empty():
			var c: Array = stack.pop_back()
			comp.append(c)
			for d in n4:
				var nk: String = key.call(c[0] + d[0], c[1] + d[1])
				if cells.has(nk) and cells[nk][2] == 1 and not seen.has(nk):
					seen[nk] = true
					stack.append(cells[nk])
		if comp.size() > best.size():
			best = comp
	var robust := {}
	for w in wins:
		var all_win := true
		for d in n4:
			var nk: String = key.call(w[0] + d[0], w[1] + d[1])
			if not (cells.has(nk) and cells[nk][2] == 1):
				all_win = false
		if all_win:
			robust[key.call(w[0], w[1])] = true
	var sample = null
	if not best.is_empty():
		var ca := 0.0
		var cb := 0.0
		for c in best:
			ca += c[0]
			cb += c[1]
		ca /= best.size()
		cb /= best.size()
		var pool := best.filter(func(c): return robust.has(key.call(c[0], c[1])))
		if pool.is_empty():
			pool = best
		pool.sort_custom(func(x, y): return pow((x[0] - ca) / g.a, 2) + pow((x[1] - cb) / g.b, 2) < pow((y[0] - ca) / g.a, 2) + pow((y[1] - cb) / g.b, 2))
		sample = {"a": pool[0][0], "b": pool[0][1], "robust": robust.has(key.call(pool[0][0], pool[0][1]))}
	var max_progress := 0
	var nest_broken := 0
	for r in results:
		max_progress = maxi(max_progress, r[3])
		nest_broken += r[4]
	return {"cells": results.size(), "win_cells": wins.size(), "win_ratio": float(wins.size()) / maxf(1, results.size()),
		"largest_region": best.size(), "robust": robust.size(), "sample": sample, "nest_broken": nest_broken, "max_progress": max_progress}


func _solve(lv: Dictionary) -> Dictionary:
	var counts := SimConfig.ammo_counts(lv)
	var types := _types(lv)
	var first := {}
	var by_type := {}
	for t in types:
		first[t] = _scan(lv, [], grid, t)
		by_type[t] = _analyse(first[t], grid)
	var entry := {"level": lv.id, "name": lv.name, "ammo": lv.ammo, "one_shot": by_type, "solution": null}
	var best_type := ""
	for t in types:
		if by_type[t].win_cells > 0 and (best_type == "" or by_type[t].win_cells > by_type[best_type].win_cells):
			best_type = t
	if best_type != "":
		var s: Dictionary = by_type[best_type].sample
		entry.solution = {"shots": 1, "sequence": [{"t": best_type, "a": s.a, "b": s.b}], "robust": s.robust}
	else:
		var beam: Array = []
		for t in types:
			for r in first[t]:
				if r[3] > 0 and r[4] == 0:
					beam.append({"seq": [{"t": t, "a": r[0], "b": r[1]}], "p": r[3]})
		beam.sort_custom(func(x, y): return x.p > y.p)
		beam = beam.slice(0, BEAM)
		var shot := 2
		while shot <= lv.ammo.size() and not beam.is_empty() and entry.solution == null:
			var next: Array = []
			for cand in beam:
				var left := counts.duplicate()
				for s in cand.seq:
					left[s.t] -= 1
				for t in types:
					if left[t] <= 0:
						continue
					var res := _scan(lv, cand.seq, FOLLOWUP, t)
					var an := _analyse(res, FOLLOWUP)
					if an.win_cells > 0:
						var seq: Array = cand.seq.duplicate()
						seq.append({"t": t, "a": an.sample.a, "b": an.sample.b})
						entry.solution = {"shots": shot, "sequence": seq, "robust": an.sample.robust, "last_shot_win_ratio": an.win_ratio}
						break
					var good := res.filter(func(r): return r[3] > cand.p and r[4] == 0)
					good.sort_custom(func(x, y): return x[3] > y[3])
					for r in good.slice(0, 2):
						var seq2: Array = cand.seq.duplicate()
						seq2.append({"t": t, "a": r[0], "b": r[1]})
						next.append({"seq": seq2, "p": r[3]})
				if entry.solution != null:
					break
			next.sort_custom(func(x, y): return x.p > y.p)
			beam = next.slice(0, BEAM)
			shot += 1
		if entry.solution == null:
			entry.solution = {"shots": null, "note": "Bu arama yöntemi ve çözünürlükte çözüm bulunamadı."}
	return {"entry": entry, "types": types, "by_type": by_type}
