extends SceneTree
# Checks manual stepping of a custom physics space with the Rapier server.
func _init() -> void:
	var ps := PhysicsServer3D
	var space := ps.space_create()
	ps.space_set_active(space, false)
	ps.area_set_param(space, PhysicsServer3D.AREA_PARAM_GRAVITY, 9.81)
	ps.area_set_param(space, PhysicsServer3D.AREA_PARAM_GRAVITY_VECTOR, Vector3(0, -1, 0))
	var ground := ps.body_create()
	ps.body_set_mode(ground, PhysicsServer3D.BODY_MODE_STATIC)
	var gs := ps.box_shape_create()
	ps.shape_set_data(gs, Vector3(5, 0.5, 5))
	ps.body_add_shape(ground, gs)
	ps.body_set_state(ground, PhysicsServer3D.BODY_STATE_TRANSFORM, Transform3D(Basis(), Vector3(0, -0.5, 0)))
	ps.body_set_space(ground, space)
	var box := ps.body_create()
	ps.body_set_mode(box, PhysicsServer3D.BODY_MODE_RIGID)
	var bs := ps.box_shape_create()
	ps.shape_set_data(bs, Vector3(0.4, 0.4, 0.4))
	ps.body_add_shape(box, bs)
	ps.body_set_param(box, PhysicsServer3D.BODY_PARAM_MASS, 0.614)
	ps.body_set_state(box, PhysicsServer3D.BODY_STATE_TRANSFORM, Transform3D(Basis(), Vector3(0, 3, 0)))
	ps.body_set_space(box, space)
	for i in 120:
		RapierPhysicsServer3D.space_step(space, 1.0 / 60.0)
		RapierPhysicsServer3D.space_flush_queries(space)
		if i % 20 == 19:
			var t: Transform3D = ps.body_get_state(box, PhysicsServer3D.BODY_STATE_TRANSFORM)
			var imp: Vector3 = RapierPhysicsServer3D.body_get_total_contact_impulse(box)
			print("adim ", i + 1, " y=", snappedf(t.origin.y, 0.0001), " itki=", snappedf(imp.length(), 0.0001))
	ps.free_rid(box); ps.free_rid(ground); ps.free_rid(bs); ps.free_rid(gs); ps.free_rid(space)
	quit()
