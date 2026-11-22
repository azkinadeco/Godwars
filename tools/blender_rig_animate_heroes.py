import bpy
import os
import math
from mathutils import Vector, Euler

OUT_DIR = "/Users/apple/Documents/CODING/God Wars/assets/models"
os.makedirs(OUT_DIR, exist_ok=True)

HERO_PALETTES = {
    "loki":     {"primary": (0.06, 0.72, 0.50), "accent": (0.98, 0.75, 0.14), "dark": (0.06, 0.11, 0.14), "crest": "horns"},
    "thor":     {"primary": (0.14, 0.55, 0.92), "accent": (0.98, 0.78, 0.20), "dark": (0.11, 0.14, 0.22), "crest": "wings"},
    "hades":    {"primary": (0.58, 0.20, 0.92), "accent": (0.22, 0.85, 0.96), "dark": (0.08, 0.06, 0.14), "crest": "crown"},
    "zeus":     {"primary": (0.96, 0.80, 0.15), "accent": (0.95, 0.98, 1.00), "dark": (0.14, 0.16, 0.24), "crest": "halo"},
    "hela":     {"primary": (0.08, 0.72, 0.65), "accent": (0.15, 0.18, 0.22), "dark": (0.05, 0.09, 0.10), "crest": "antlers"},
    "valkyrie": {"primary": (0.96, 0.45, 0.09), "accent": (0.99, 0.88, 0.28), "dark": (0.14, 0.10, 0.18), "crest": "jetwings"},
}

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def make_mat(name, col, metallic=0.82, roughness=0.22, emissive=None, em_str=1.5):
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*col, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emissive and "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*emissive, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = em_str
    return m

def attach_to_bone(obj, arm_obj, bone_name):
    obj.parent = arm_obj
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name
    # Reset parent inverse so local coords are relative to bone tail/head cleanly
    obj.matrix_parent_inverse = arm_obj.matrix_world.inverted() @ (arm_obj.matrix_world @ arm_obj.pose.bones[bone_name].matrix).inverted()

def add_part(arm_obj, bone_name, prim, loc, scale, mat, rot=(0, 0, 0)):
    if prim == 'cube':
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    elif prim == 'cyl':
        bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.5, depth=1.0, location=loc, rotation=rot)
    elif prim == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.5, location=loc, rotation=rot)
    elif prim == 'cone':
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.5, depth=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if prim == 'cube':
        bev = obj.modifiers.new("Bevel", 'BEVEL')
        bev.width = 0.018
        bev.segments = 2
        bpy.ops.object.modifier_apply(modifier="Bevel")
    obj.data.materials.append(mat)
    attach_to_bone(obj, arm_obj, bone_name)
    return obj

def build_rigged_hero(hero_id, cfg):
    clear_scene()
    mat_pri = make_mat(f"{hero_id}_pri", cfg["primary"], 0.82, 0.22)
    mat_acc = make_mat(f"{hero_id}_acc", cfg["accent"], 0.92, 0.16)
    mat_drk = make_mat(f"{hero_id}_drk", cfg["dark"], 0.65, 0.36)
    mat_em  = make_mat(f"{hero_id}_em",  cfg["primary"], 0.2, 0.12, cfg["primary"], 3.0)
    mat_skn = make_mat(f"{hero_id}_skn", (0.88, 0.72, 0.58) if hero_id != "hades" else (0.72, 0.78, 0.86), 0.05, 0.48)

    # 1. Build Humanoid Armature (Z-up in Blender -> exported Y-up in glTF!)
    arm_data = bpy.data.armatures.new(f"{hero_id}_Armature")
    arm_obj = bpy.data.objects.new(f"{hero_id}_Rig", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')

    eb = arm_data.edit_bones
    def mk_bone(name, head, tail, parent=None):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent:
            b.parent = eb[parent]
        return b

    mk_bone("Hips",      (0, 0, 0.95),     (0, 0, 1.12))
    mk_bone("Chest",     (0, 0, 1.12),     (0, 0, 1.56), "Hips")
    mk_bone("Head",      (0, 0, 1.58),     (0, 0, 1.92), "Chest")

    mk_bone("UpperArmL", (-0.34, 0, 1.48), (-0.38, 0, 1.18), "Chest")
    mk_bone("ForearmL",  (-0.38, 0, 1.18), (-0.38, -0.18, 0.96), "UpperArmL")

    mk_bone("UpperArmR", (0.34, 0, 1.48),  (0.38, 0, 1.18), "Chest")
    mk_bone("ForearmR",  (0.38, 0, 1.18),  (0.38, -0.22, 1.00), "UpperArmR")

    mk_bone("ThighL",    (-0.16, 0, 0.94), (-0.17, 0, 0.50), "Hips")
    mk_bone("ShinL",     (-0.17, 0, 0.50), (-0.17, 0, 0.05), "ThighL")

    mk_bone("ThighR",    (0.16, 0, 0.94),  (0.17, 0, 0.50), "Hips")
    mk_bone("ShinR",     (0.17, 0, 0.50),  (0.17, 0, 0.05), "ThighR")

    bpy.ops.object.mode_set(mode='OBJECT')

    # 2. Sculpted Armor Meshes Attached to Bones
    add_part(arm_obj, "Hips", "cube", (0, 0, 0.98), (0.44, 0.26, 0.20), mat_drk)
    add_part(arm_obj, "Hips", "cube", (0, -0.13, 0.98), (0.14, 0.06, 0.12), mat_acc)

    # Chest Armor, Glowing Core & Cape
    add_part(arm_obj, "Chest", "cube", (0, 0, 1.34), (0.56, 0.30, 0.44), mat_pri)
    add_part(arm_obj, "Chest", "sphere", (0, -0.16, 1.38), (0.15, 0.08, 0.15), mat_em)
    add_part(arm_obj, "Chest", "cube", (0, 0.19, 1.12), (0.48, 0.04, 0.72), mat_pri, rot=(math.radians(10), 0, 0))
    # Pauldrons
    add_part(arm_obj, "Chest", "sphere", (-0.36, 0, 1.50), (0.28, 0.28, 0.22), mat_acc)
    add_part(arm_obj, "Chest", "sphere", (0.36, 0, 1.50),  (0.28, 0.28, 0.22), mat_acc)

    # Head, Visor & Unique God Crest
    add_part(arm_obj, "Head", "sphere", (0, 0, 1.74), (0.27, 0.28, 0.31), mat_skn)
    add_part(arm_obj, "Head", "cube",   (0, -0.13, 1.76), (0.18, 0.05, 0.06), mat_em)
    add_part(arm_obj, "Head", "sphere", (0, 0.02, 1.80), (0.30, 0.31, 0.22), mat_acc)
    if cfg["crest"] == "horns":
        add_part(arm_obj, "Head", "cone", (-0.14, -0.06, 2.02), (0.07, 0.07, 0.36), mat_acc, rot=(math.radians(-20), math.radians(-25), 0))
        add_part(arm_obj, "Head", "cone", (0.14, -0.06, 2.02),  (0.07, 0.07, 0.36), mat_acc, rot=(math.radians(-20), math.radians(25), 0))
    elif cfg["crest"] in ("wings", "jetwings"):
        add_part(arm_obj, "Chest", "cube", (-0.42, 0.22, 1.48), (0.58, 0.05, 0.24), mat_acc, rot=(0, math.radians(22), math.radians(15)))
        add_part(arm_obj, "Chest", "cube", (0.42, 0.22, 1.48),  (0.58, 0.05, 0.24), mat_acc, rot=(0, math.radians(-22), math.radians(-15)))
    elif cfg["crest"] == "antlers":
        for sx in (-1, 1):
            add_part(arm_obj, "Head", "cone", (sx * 0.20, 0, 2.04), (0.06, 0.06, 0.42), mat_em, rot=(0, sx * math.radians(35), 0))
    else:
        add_part(arm_obj, "Head", "cyl", (0, 0, 1.94), (0.34, 0.34, 0.06), mat_em)

    # Arms & Gauntlets
    add_part(arm_obj, "UpperArmL", "cyl", (-0.36, 0, 1.32), (0.15, 0.15, 0.30), mat_drk)
    add_part(arm_obj, "ForearmL",  "cyl", (-0.38, -0.08, 1.07), (0.14, 0.14, 0.28), mat_acc, rot=(math.radians(35), 0, 0))
    add_part(arm_obj, "UpperArmR", "cyl", (0.36, 0, 1.32),  (0.15, 0.15, 0.30), mat_drk)
    add_part(arm_obj, "ForearmR",  "cyl", (0.38, -0.10, 1.08), (0.14, 0.14, 0.28), mat_acc, rot=(math.radians(42), 0, 0))

    # Legs, Knee Guards & Armored Boots
    add_part(arm_obj, "ThighL", "cyl",  (-0.16, 0, 0.72), (0.18, 0.18, 0.44), mat_drk)
    add_part(arm_obj, "ShinL",  "cyl",  (-0.17, 0, 0.28), (0.16, 0.16, 0.44), mat_pri)
    add_part(arm_obj, "ShinL",  "cube", (-0.17, -0.09, 0.48), (0.16, 0.08, 0.14), mat_acc)
    add_part(arm_obj, "ShinL",  "cube", (-0.17, -0.05, 0.06), (0.18, 0.26, 0.12), mat_acc)

    add_part(arm_obj, "ThighR", "cyl",  (0.16, 0, 0.72),  (0.18, 0.18, 0.44), mat_drk)
    add_part(arm_obj, "ShinR",  "cyl",  (0.17, 0, 0.28),  (0.16, 0.16, 0.44), mat_pri)
    add_part(arm_obj, "ShinR",  "cube", (0.17, -0.09, 0.48), (0.16, 0.08, 0.14), mat_acc)
    add_part(arm_obj, "ShinR",  "cube", (0.17, -0.05, 0.06), (0.18, 0.26, 0.12), mat_acc)

    # 3. Bake 3 Real Skeletal glTF Animations (Idle, Run, Slide) into NLA Tracks!
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = 'XYZ'

    def key_pose(frame, poses, hip_z=0.0):
        bpy.context.scene.frame_set(frame)
        for pb in arm_obj.pose.bones:
            pb.rotation_euler = Euler((0, 0, 0), 'XYZ')
            pb.location = Vector((0, 0, 0))
        arm_obj.pose.bones["Hips"].location = Vector((0, 0, hip_z))
        arm_obj.pose.bones["Hips"].keyframe_insert("location", frame=frame)
        for bname, rot in poses.items():
            pb = arm_obj.pose.bones[bname]
            pb.rotation_euler = Euler((math.radians(rot[0]), math.radians(rot[1]), math.radians(rot[2])), 'XYZ')
            pb.keyframe_insert("rotation_euler", frame=frame)
        for pb in arm_obj.pose.bones:
            if pb.name not in poses:
                pb.keyframe_insert("rotation_euler", frame=frame)

    def build_action(name, keyframes):
        act = bpy.data.actions.new(name=name)
        arm_obj.animation_data_create()
        arm_obj.animation_data.action = act
        for frame, poses, hz in keyframes:
            key_pose(frame, poses, hz)
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, act)
        strip.name = name

    # Action 1: Idle (Breathing & combat readiness)
    build_action("Idle", [
        (1,  {"Chest": (2, 0, 0), "UpperArmL": (12, 0, 8), "UpperArmR": (22, 0, -8)}, 0.0),
        (15, {"Chest": (-3, 0, 0), "UpperArmL": (16, 0, 10), "UpperArmR": (26, 0, -10), "Head": (0, 0, 6)}, 0.03),
        (30, {"Chest": (2, 0, 0), "UpperArmL": (12, 0, 8), "UpperArmR": (22, 0, -8)}, 0.0),
    ])

    # Action 2: Run (Athletic Apex Sprint Stride!)
    build_action("Run", [
        (1,  {"Chest": (14, 0, 6),  "ThighL": (42, 0, 0),  "ShinL": (-28, 0, 0), "ThighR": (-38, 0, 0), "ShinR": (-42, 0, 0), "UpperArmL": (-36, 0, 0), "UpperArmR": (34, 0, 0)}, 0.04),
        (10, {"Chest": (14, 0, -6), "ThighL": (-38, 0, 0), "ShinL": (-42, 0, 0), "ThighR": (42, 0, 0),  "ShinR": (-28, 0, 0), "UpperArmL": (34, 0, 0),  "UpperArmR": (-36, 0, 0)}, 0.04),
        (20, {"Chest": (14, 0, 6),  "ThighL": (42, 0, 0),  "ShinL": (-28, 0, 0), "ThighR": (-38, 0, 0), "ShinR": (-42, 0, 0), "UpperArmL": (-36, 0, 0), "UpperArmR": (34, 0, 0)}, 0.04),
    ])

    # Action 3: Slide (Low Apex Legends Knee-Slide Pose!)
    build_action("Slide", [
        (1,  {"Chest": (-24, 0, 0), "ThighL": (65, 0, 0), "ShinL": (-18, 0, 0), "ThighR": (25, 0, 0), "ShinR": (-88, 0, 0), "UpperArmL": (25, 0, 18), "UpperArmR": (35, 0, -12)}, -0.44),
        (15, {"Chest": (-24, 0, 0), "ThighL": (65, 0, 0), "ShinL": (-18, 0, 0), "ThighR": (25, 0, 0), "ShinR": (-88, 0, 0), "UpperArmL": (25, 0, 18), "UpperArmR": (35, 0, -12)}, -0.44),
    ])

    arm_obj.animation_data.action = None
    bpy.ops.object.mode_set(mode='OBJECT')

    out_path = os.path.join(OUT_DIR, f"hero_{hero_id}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        export_animations=True,
        export_nla_strips=True
    )
    print(f"EXPORTED RIGGED & ANIMATED HERO: {out_path}")

for hid, cfg in HERO_PALETTES.items():
    build_rigged_hero(hid, cfg)
