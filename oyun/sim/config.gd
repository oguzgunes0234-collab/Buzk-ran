class_name SimConfig
## Constants shared by the game, the test bot and the determinism self-test.
## Values follow the web prototype (prototip-web/src/sim.js) unless noted.

const DT := 1.0 / 60.0
const GRAVITY := -9.81
const PRE_SETTLE_STEPS := 60
const MAX_FLIGHT_STEPS := 480
const SETTLE_FRAMES := 20
const CAGE_SIZE := 0.8
const LAUNCHER := Vector3(0.0, 1.0, -9.0)
const KILL_Y := -4.0
const FALL_Y := -0.6
const TOTEM := Vector3(0.5, 1.3, 0.5)
const NEST := Vector3(0.8, 0.35, 0.8)

const CAGE_DENSITY := 1.2
const CAGE_BREAK_FORCE := 90.0
const NEST_BREAK_FORCE := 60.0
const FX_IMPACT_FORCE := 25.0
const BALL_TOUCH_FORCE := 0.5

# The Godot Rapier plugin combines friction with "min" and restitution with a
# clamped sum, the web prototype used averages. Restitution values are halved
# (a/2 + b/2 = average) and the ball and ice frictions are raised so that the
# common pairs (ball-wood, ice-ground) get the web values.
const GROUND := {"friction": 1.0, "bounce": 0.0}
const MATERIALS := {
	"wood": {"density": 1.0, "friction": 1.0, "bounce": 0.025},
	"stone": {"density": 3.2, "friction": 1.0, "bounce": 0.01},
	"ice": {"density": 0.9, "friction": 0.85, "bounce": 0.025, "break_force": 55.0},
}
const CAGE_MAT := {"friction": 1.0, "bounce": 0.025}
const TOTEM_MATS := {
	"wood": {"density": 0.7, "friction": 1.0, "bounce": 0.025},
	"stone": {"density": 70.0, "friction": 1.0, "bounce": 0.025},
}
const NEST_MAT := {"density": 1.0, "friction": 1.0, "bounce": 0.01}
const BALL_FRICTION := 0.75

const AMMO := {
	"normal": {"name": "Gülle", "radius": 0.3, "density": 9.0, "speed_k": 1.0, "bounce": 0.075},
	"heavy": {"name": "Ağır", "radius": 0.38, "density": 20.0, "speed_k": 0.85, "bounce": 0.025},
	"ember": {"name": "Köz", "radius": 0.3, "density": 6.0, "speed_k": 1.0, "bounce": 0.05},
}
const AMMO_ORDER := ["normal", "heavy", "ember"]
const BLAST := {"radius": 2.2, "core": 1.1, "impulse": 7.0}

# Integer shot input in tenths of a degree; also the bot's scan bounds.
const YAW_MIN := -150
const YAW_MAX := 150
const PITCH_MIN := 50
const PITCH_MAX := 700


static func level_bounds(level: Dictionary) -> Dictionary:
	var r := {"z_min": INF, "z_max": -INF, "y_max": 0.0, "x_abs": 0.0}
	var add := func(x: float, z: float, w: float, d: float, top: float) -> void:
		r.z_min = minf(r.z_min, z - d / 2.0)
		r.z_max = maxf(r.z_max, z + d / 2.0)
		r.y_max = maxf(r.y_max, top)
		r.x_abs = maxf(r.x_abs, absf(x) + w / 2.0)
	for s in level.get("statics", []):
		add.call(s.x, s.z, s.w, s.d, s.y + s.h / 2.0)
	for b in level.get("blocks", []):
		add.call(b.x, b.z, b.w, b.d, b.y + b.h / 2.0)
	for c in level.get("cages", []):
		add.call(c.x, c.z, CAGE_SIZE, CAGE_SIZE, c.y + CAGE_SIZE / 2.0)
	for t in level.get("totems", []):
		add.call(t.x, t.z, TOTEM.x, TOTEM.z, t.y + TOTEM.y / 2.0)
	for n in level.get("nests", []):
		add.call(n.x, n.z, NEST.x, NEST.z, n.y + NEST.y / 2.0)
	return r


## The playable ice platform; anything pushed past its edges falls into the valley.
static func arena_of(level: Dictionary) -> Dictionary:
	var b := level_bounds(level)
	return {"x_half": maxf(3.2, b.x_abs + 1.6), "z_min": LAUNCHER.z - 2.5, "z_max": b.z_max + 1.6}


static func ammo_counts(level: Dictionary) -> Dictionary:
	var c := {}
	for t in AMMO_ORDER:
		c[t] = 0
	for t in level.ammo:
		c[t] += 1
	return c


## Launch velocity from integer yaw (a) and pitch (b). Positive yaw goes to the
## player's right on screen (the camera looks along +z, right is -x).
static func launch_velocity(level: Dictionary, a: int, b: int, type: String) -> Vector3:
	assert(a >= YAW_MIN and a <= YAW_MAX and b >= PITCH_MIN and b <= PITCH_MAX)
	var s: float = level.speed * AMMO[type].speed_k
	var cp := DetMath.cos_tenth(b)
	return Vector3(-DetMath.sin_tenth(a) * cp * s, DetMath.sin_tenth(b) * s, DetMath.cos_tenth(a) * cp * s)


## Free-flight path (velocity first, then position) for the aiming preview only.
static func preview_path(level: Dictionary, a: int, b: int, steps: int, type: String) -> PackedVector3Array:
	var v := launch_velocity(level, a, b, type)
	var pts := PackedVector3Array()
	var px := 0.0
	var py := LAUNCHER.y
	var pz := LAUNCHER.z
	var vx := v.x
	var vy := v.y
	var vz := v.z
	for i in steps:
		vy += GRAVITY * DT
		px += vx * DT
		py += vy * DT
		pz += vz * DT
		pts.append(Vector3(px, py, pz))
	return pts
