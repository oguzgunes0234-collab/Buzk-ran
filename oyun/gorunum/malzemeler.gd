class_name Malzemeler
## Shader materials for the toy-like look. All effects are cheap enough for the
## GL Compatibility renderer on phones (no screen-space effects).

const NOISE := """
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }
"""

const WOOD := """
shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;
uniform vec3 base : source_color = vec3(0.79, 0.57, 0.35);
uniform float seed = 0.0;
%s
void fragment() {
	vec2 p = UV + vec2(seed * 3.1, seed * 1.7);
	float warp = fbm(vec2(p.x * 0.6, p.y * 2.0)) * 2.2;
	float grain = 0.5 + 0.5 * sin(p.y * 38.0 + warp * 6.0);
	float fine = vnoise(vec2(p.x * 3.0, p.y * 90.0));
	vec3 c = base * (0.80 + 0.16 * grain + 0.08 * fine);
	float knot = smoothstep(0.78, 0.9, fbm(p * 1.3 + 7.0));
	c = mix(c, base * 0.62, knot * 0.6);
	ALBEDO = c;
	ROUGHNESS = 0.72;
	SPECULAR = 0.35;
}
"""

const STONE := """
shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;
uniform vec3 base : source_color = vec3(0.42, 0.46, 0.53);
%s
void fragment() {
	float n = fbm(UV * 2.6);
	float speck = step(0.93, hash21(floor(UV * 26.0)));
	float crack = smoothstep(0.47, 0.5, abs(fbm(UV * 1.4 + 3.0) - 0.5) * 2.0);
	vec3 c = base * (0.82 + 0.3 * n) - speck * 0.05;
	c *= 1.0 - (1.0 - crack) * 0.18;
	ALBEDO = c;
	ROUGHNESS = 0.88;
	SPECULAR = 0.25;
}
"""

const ICE := """
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_back, diffuse_lambert, specular_schlick_ggx;
uniform vec3 tint : source_color = vec3(0.62, 0.89, 0.96);
uniform float alpha = 0.45;
uniform float frost = 0.25;
%s
void fragment() {
	float fr = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.2);
	float fz = fbm(UV * 5.0);
	vec3 c = mix(tint, vec3(0.97, 0.99, 1.0), clamp(fr * 0.8 + fz * frost, 0.0, 1.0));
	ALBEDO = c;
	ALPHA = clamp(alpha + fr * 0.4 + fz * frost * 0.3, 0.0, 0.94);
	ROUGHNESS = 0.06;
	SPECULAR = 0.9;
	EMISSION = vec3(0.55, 0.85, 1.0) * fr * 0.18;
}
"""

const SNOW := """
shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;
varying vec3 wp;
uniform float grid = 1.0;
%s
float gridline(float x, float w) {
	float d = abs(fract(x - 0.5) - 0.5);
	float fw = max(fwidth(x), 1e-4);
	return 1.0 - smoothstep(w - fw, w + fw, d);
}
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	vec2 q = wp.xz;
	float n = fbm(q * 0.35);
	vec3 c = mix(vec3(0.80, 0.88, 0.94), vec3(0.66, 0.78, 0.88), n * 0.8);
	// faint 1 m grid and stronger 5 m tiles: depth cue for aiming
	float g1 = gridline(q.x, 0.012) + gridline(q.y, 0.012);
	float g5 = gridline(q.x / 5.0, 0.004) + gridline(q.y / 5.0, 0.004);
	c = mix(c, vec3(0.36, 0.54, 0.70), (clamp(g1, 0.0, 1.0) * 0.24 + clamp(g5, 0.0, 1.0) * 0.45) * grid);
	float cell = hash21(floor(q * 24.0));
	float tw = step(0.992, cell) * (0.5 + 0.5 * sin(TIME * 2.5 + cell * 40.0));
	ALBEDO = c;
	EMISSION = vec3(tw) * 0.55;
	ROUGHNESS = 0.8;
	SPECULAR = 0.4;
}
"""

const CLIFF := """
shader_type spatial;
render_mode diffuse_lambert;
varying vec3 wp;
%s
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	float streak = fbm(vec2((wp.x + wp.z) * 1.6, wp.y * 0.25));
	float t = clamp(-wp.y / 5.0, 0.0, 1.0);
	vec3 c = mix(vec3(0.62, 0.80, 0.89), vec3(0.30, 0.50, 0.64), t);
	ALBEDO = c * (0.85 + 0.25 * streak);
}
"""

const MOUNTAIN := """
shader_type spatial;
render_mode diffuse_lambert;
varying vec3 wp;
uniform float snow_line = 4.0;
%s
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	float n = fbm(wp.xz * 0.08 + wp.y * 0.05);
	float s = smoothstep(snow_line - 3.0, snow_line + 3.0, wp.y + n * 6.0);
	vec3 rock = vec3(0.47, 0.56, 0.66);
	ALBEDO = mix(rock, vec3(0.95, 0.97, 1.0), s);
}
"""

const EGG := """
shader_type spatial;
render_mode diffuse_lambert;
uniform vec3 base : source_color = vec3(0.98, 0.96, 0.9);
%s
void fragment() {
	float sp = step(0.86, vnoise(UV * vec2(40.0, 26.0)));
	ALBEDO = mix(base, vec3(0.55, 0.40, 0.28), sp * 0.7);
}
"""

const PUFF := """
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_back;
void fragment() {
	float facing = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	ALBEDO = COLOR.rgb;
	ALPHA = COLOR.a * pow(facing, 1.6);
}
"""

static var _cache := {}


static func _shader(key: String, code: String) -> Shader:
	if _cache.has(key):
		return _cache[key]
	var s := Shader.new()
	s.code = code % NOISE
	_cache[key] = s
	return s


static func wood(c: Color, seed: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _shader("wood", WOOD)
	m.set_shader_parameter("base", c)
	m.set_shader_parameter("seed", seed)
	return m


static func stone(c: Color) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _shader("stone", STONE)
	m.set_shader_parameter("base", c)
	return m


static func ice(tint: Color, alpha: float, frost := 0.25, priority := 0) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _shader("ice", ICE)
	m.set_shader_parameter("tint", tint)
	m.set_shader_parameter("alpha", alpha)
	m.set_shader_parameter("frost", frost)
	m.render_priority = priority
	return m


## Snow; grid = 1 draws the faint 1 m / 5 m lines used as a depth cue on the platform.
static func snow(grid := 1.0) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _shader("snow", SNOW)
	m.set_shader_parameter("grid", grid)
	return m


static func cliff() -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _shader("cliff", CLIFF)
	return m


static func mountain(snow_line: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _shader("mountain", MOUNTAIN)
	m.set_shader_parameter("snow_line", snow_line)
	return m


## Soft round puff for snow and smoke particles (multimesh instance color = tint and opacity).
static func puff() -> ShaderMaterial:
	var m := ShaderMaterial.new()
	var sh := Shader.new()
	sh.code = PUFF
	m.shader = sh
	return m


static func egg() -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _shader("egg", EGG)
	return m


static func lambert(c: Color, rough := 0.9, spec := 0.3) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic_specular = spec
	return m


static func metal(c: Color, rough := 0.35, metallic := 0.6) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metallic
	m.metallic_specular = 0.6
	return m


static func unshaded(c: Color, on_top := false) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = c
	if c.a < 1.0:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if on_top:
		m.no_depth_test = true
		m.render_priority = 10
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m


static func glow(c: Color, energy := 1.0) -> StandardMaterial3D:
	var m := lambert(c)
	m.emission_enabled = true
	m.emission = c
	m.emission_energy_multiplier = energy
	return m
