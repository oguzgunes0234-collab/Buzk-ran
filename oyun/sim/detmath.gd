class_name DetMath
## Deterministic math helpers.
## Only +, -, *, / and sqrt on doubles are used; GDScript runs each operation
## separately, so results are bit-identical on every IEEE-754 platform.
## Engine math (Vector3.length, sin, cos, Basis <-> Quaternion) is compiled C++
## and may use fused multiply-add on some CPUs, so it must never decide
## anything in the simulation.

const PI_D := 3.141592653589793
const TENTH_DEG_TO_RAD := PI_D / 1800.0


static func _sin_rad(x: float) -> float:
	var x2 := x * x
	var r := 1.0 / 355687428096000.0
	r = r * -x2 + 1.0 / 1307674368000.0
	r = r * -x2 + 1.0 / 6227020800.0
	r = r * -x2 + 1.0 / 39916800.0
	r = r * -x2 + 1.0 / 362880.0
	r = r * -x2 + 1.0 / 5040.0
	r = r * -x2 + 1.0 / 120.0
	r = r * -x2 + 1.0 / 6.0
	r = r * -x2 + 1.0
	return r * x


static func _cos_rad(x: float) -> float:
	var x2 := x * x
	var r := 1.0 / 6402373705728000.0
	r = r * -x2 + 1.0 / 20922789888000.0
	r = r * -x2 + 1.0 / 87178291200.0
	r = r * -x2 + 1.0 / 479001600.0
	r = r * -x2 + 1.0 / 3628800.0
	r = r * -x2 + 1.0 / 40320.0
	r = r * -x2 + 1.0 / 720.0
	r = r * -x2 + 1.0 / 24.0
	r = r * -x2 + 1.0 / 2.0
	r = r * -x2 + 1.0
	return r


## Angles are integers in tenths of a degree (452 = 45.2 deg), |t| <= 900.
static func sin_tenth(t: int) -> float:
	assert(t >= -900 and t <= 900)
	return _sin_rad(t * TENTH_DEG_TO_RAD)


static func cos_tenth(t: int) -> float:
	assert(t >= -900 and t <= 900)
	return _cos_rad(t * TENTH_DEG_TO_RAD)


static func len3(x: float, y: float, z: float) -> float:
	return sqrt(x * x + y * y + z * z)


## Bits of a value rounded to 32-bit float.
static func f32_bits(x: float) -> int:
	return PackedFloat32Array([x]).to_byte_array().decode_u32(0)


## FNV-1a over 32-bit words, 32-bit result.
static func fnv1a32(words: PackedInt64Array) -> int:
	var h := 0x811c9dc5
	for w0 in words:
		var w := w0 & 0xffffffff
		for k in 4:
			h = h ^ (w & 0xff)
			h = (h * 0x01000193) & 0xffffffff
			w = w >> 8
	return h


static func hex32(h: int) -> String:
	return "%08x" % (h & 0xffffffff)
