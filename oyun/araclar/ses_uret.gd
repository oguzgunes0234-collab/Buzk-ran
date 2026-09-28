extends SceneTree
## Generates the placeholder sound effects as WAV files (res://ses/*.wav).
## Same recipes as the web prototype's Web Audio synth (prototip-web/src/audio.js).
## Run: godot --headless -s res://araclar/ses_uret.gd

const RATE := 22050
var rng := RandomNumberGenerator.new()


func _init() -> void:
	rng.seed = 7
	_save("atis", _fire(false))
	_save("atis_agir", _fire(true))
	_save("carpma_zemin", _impact(true, 0.6))
	_save("carpma_hafif", _impact(false, 0.25))
	_save("carpma_sert", _impact(false, 1.0))
	_save("kirilma", _shatter())
	_save("patlama", _explode())
	_save("totem", _totem())
	_save("catlama", _crack())
	_save("kurtarma", _rescue())
	_save("kazanma", _win())
	_save("kaybetme", _lose())
	quit()


func _buf(sec: float) -> PackedFloat32Array:
	var b := PackedFloat32Array()
	b.resize(int(sec * RATE))
	return b


## Exponential envelope: attack to gain in `att` seconds, decay to ~0 at `dur`.
func _env(t: float, dur: float, gain: float, att: float) -> float:
	if t < 0.0 or t > dur:
		return 0.0
	if att > 0.0 and t < att:
		return 0.0001 * pow(gain / 0.0001, t / att)
	var t0 := att
	return gain * pow(0.0008 / gain, (t - t0) / maxf(1e-4, dur - t0))


func _tone(b: PackedFloat32Array, start: float, f0: float, dur: float, wave: String, gain: float, f1 := 0.0) -> void:
	var ph := 0.0
	var n0 := int(start * RATE)
	var n := int((dur + 0.02) * RATE)
	for i in n:
		var k := n0 + i
		if k >= b.size():
			break
		var t := float(i) / RATE
		var f := f0 if f1 <= 0.0 else f0 * pow(f1 / f0, minf(1.0, t / dur))
		ph = fmod(ph + f / RATE, 1.0)
		var s := 0.0
		match wave:
			"sine":
				s = sin(ph * TAU)
			"triangle":
				s = 1.0 - 4.0 * absf(ph - 0.5)
			"square":
				s = 1.0 if ph < 0.5 else -1.0
			"sawtooth":
				s = 2.0 * ph - 1.0
		b[k] += s * _env(t, dur, gain, 0.012)


## Filtered noise burst (RBJ biquad); the cutoff can slide from f0 to f1.
func _noise(b: PackedFloat32Array, start: float, dur: float, kind: String, f0: float, q: float, gain: float, f1 := 0.0) -> void:
	var x1 := 0.0
	var x2 := 0.0
	var y1 := 0.0
	var y2 := 0.0
	var n0 := int(start * RATE)
	var n := int((dur + 0.02) * RATE)
	var c := []
	for i in n:
		var k := n0 + i
		if k >= b.size():
			break
		var t := float(i) / RATE
		if i % 32 == 0:
			var f := f0 if f1 <= 0.0 else f0 * pow(f1 / f0, minf(1.0, t / dur))
			c = _biquad(kind, f, q)
		var x := rng.randf() * 2.0 - 1.0
		var y: float = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2
		x2 = x1
		x1 = x
		y2 = y1
		y1 = y
		b[k] += y * _env(t, dur, gain, 0.0)


func _biquad(kind: String, f: float, q: float) -> Array:
	var w0 := TAU * minf(f, RATE * 0.45) / RATE
	var cw := cos(w0)
	var alpha := sin(w0) / (2.0 * q)
	var b0 := 0.0
	var b1 := 0.0
	var b2 := 0.0
	match kind:
		"lowpass":
			b0 = (1.0 - cw) / 2.0
			b1 = 1.0 - cw
			b2 = (1.0 - cw) / 2.0
		"highpass":
			b0 = (1.0 + cw) / 2.0
			b1 = -(1.0 + cw)
			b2 = (1.0 + cw) / 2.0
		"bandpass":
			b0 = alpha
			b1 = 0.0
			b2 = -alpha
	var a0 := 1.0 + alpha
	return [b0 / a0, b1 / a0, b2 / a0, -2.0 * cw / a0, (1.0 - alpha) / a0]


func _fire(heavy: bool) -> PackedFloat32Array:
	var b := _buf(0.45)
	_tone(b, 0.0, 80.0 if heavy else 110.0, 0.25, "sine", 0.7, 35.0 if heavy else 45.0)
	_noise(b, 0.0, 0.35, "bandpass", 900.0, 0.8, 0.35, 300.0)
	return b


func _impact(ground: bool, k: float) -> PackedFloat32Array:
	var b := _buf(0.3)
	if ground:
		_noise(b, 0.0, 0.18, "lowpass", 500.0, 0.7, 0.18 + k * 0.3)
	else:
		_noise(b, 0.0, 0.12 + k * 0.1, "bandpass", 850.0, 1.4, 0.15 + k * 0.45)
		_tone(b, 0.0, 210.0, 0.09, "triangle", 0.08 + k * 0.15, 120.0)
	return b


func _shatter() -> PackedFloat32Array:
	var b := _buf(0.6)
	_noise(b, 0.0, 0.45, "highpass", 2500.0, 0.7, 0.55)
	for i in 6:
		_tone(b, i * 0.025, 1800.0 + rng.randf() * 2400.0, 0.25, "sine", 0.06)
	return b


func _explode() -> PackedFloat32Array:
	var b := _buf(1.0)
	_noise(b, 0.0, 0.9, "lowpass", 700.0, 0.6, 0.9)
	_tone(b, 0.0, 70.0, 0.6, "sine", 0.8, 30.0)
	_noise(b, 0.03, 0.4, "bandpass", 1800.0, 0.8, 0.25)
	return b


func _totem() -> PackedFloat32Array:
	var b := _buf(0.45)
	for i in 3:
		_tone(b, 0.05 + i * 0.07, [659.0, 523.0, 392.0][i], 0.2, "square", 0.05)
	return b


func _crack() -> PackedFloat32Array:
	var b := _buf(0.6)
	_noise(b, 0.0, 0.2, "bandpass", 1200.0, 2.0, 0.4)
	_tone(b, 0.1, 330.0, 0.28, "sawtooth", 0.07)
	_tone(b, 0.26, 247.0, 0.28, "sawtooth", 0.07)
	return b


func _rescue() -> PackedFloat32Array:
	var b := _buf(0.6)
	for i in 3:
		_tone(b, 0.15 + i * 0.08, [784.0, 988.0, 1175.0][i], 0.22, "triangle", 0.18)
	return b


func _win() -> PackedFloat32Array:
	var b := _buf(0.9)
	for i in 4:
		_tone(b, 0.1 + i * 0.1, [523.0, 659.0, 784.0, 1047.0][i], 0.35, "triangle", 0.2)
	return b


func _lose() -> PackedFloat32Array:
	var b := _buf(0.8)
	for i in 3:
		_tone(b, 0.05 + i * 0.14, [392.0, 330.0, 262.0][i], 0.3, "sine", 0.16)
	return b


func _save(name: String, b: PackedFloat32Array) -> void:
	var data := PackedByteArray()
	data.resize(b.size() * 2)
	for i in b.size():
		data.encode_s16(i * 2, clampi(int(b[i] * 0.55 * 32767.0), -32768, 32767))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = data
	var path := "res://ses/%s.wav" % name
	var err := w.save_to_wav(path)
	print(name, " ", b.size(), " ornek ", "ok" if err == OK else "HATA %d" % err)
