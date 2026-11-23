"""SUPERSEDED by tools/blender_heroes_v2.py (sculpted bodies, 1 mesh per hero).
Running this would overwrite the v2 hero GLBs, so it refuses unless called with `-- --force`."""
import sys
if '--force' not in sys.argv:
    print("blender_rig_animate_heroes.py is superseded by blender_heroes_v2.py; pass -- --force to run anyway")
    sys.exit(0)
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
    # Bone-parenting in Blender is relative to the bone TAIL. The old hand-rolled parent inverse
    # used the bone HEAD, so every part was shoved along its bone ("exploded" heroes in-game).
    # Keep the authored world transform instead and let Blender solve the local matrix.
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = arm_obj
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name
    obj.matrix_parent_inverse.identity()
    bpy.context.view_layer.update()
    obj.matrix_world = world
    bpy.context.view_layer.update()

def add_part(arm_obj, bone_name, prim, loc, scale, mat, rot=(0, 0, 0), taper=1.0):
    # 'taper' < 1 narrows the top of cylinders/cubes (anatomical limbs, V-shaped torso).
    if prim == 'cube':
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    elif prim == 'cyl':
        bpy.ops.mesh.primitive_cone_add(vertices=18, radius1=0.5, radius2=0.5 * taper, depth=1.0, location=loc, rotation=rot)
    elif prim == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.5, location=loc, rotation=rot)
    elif prim == 'cone':
        bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=0.5, depth=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    if prim == 'cube' and taper != 1.0:
        # narrow the bottom face (waist) relative to the top (shoulders)
        for v in obj.data.vertices:
            if v.co.z < 0:
                v.co.x *= taper
                v.co.y *= (0.5 + taper * 0.5)
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if prim in ('cube', 'cyl'):
        # Generous multi-segment bevel = rounded armour plates instead of toy blocks
        bev = obj.modifiers.new("Bevel", 'BEVEL')
        bev.width = 0.035 if prim == 'cube' else 0.02
        bev.segments = 3
        bev.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier="Bevel")
    bpy.ops.object.shade_smooth()
    obj.data.use_auto_smooth = True
    obj.data.auto_smooth_angle = math.radians(40)
    obj.data.materials.append(mat)
    attach_to_bone(obj, arm_obj, bone_name)
    return obj


def build_skinned_body(arm_obj, mat_suit, mat_skin):
    """One continuous organic body mesh (Skin modifier + Subdivision), heat-weighted to the rig,
    so shoulders/elbows/knees bend as a single surface instead of floating primitives."""
    J = {  # joint -> (position, radius_x, radius_y)
        "pelvis": ((0, 0, 0.96), 0.17, 0.12), "waist": ((0, 0, 1.12), 0.15, 0.11),
        "chest": ((0, 0, 1.36), 0.21, 0.13), "neck": ((0, 0, 1.56), 0.065, 0.065),
        "shL": ((-0.24, 0, 1.47), 0.075, 0.075), "elL": ((-0.38, 0, 1.18), 0.055, 0.055), "wrL": ((-0.38, -0.18, 0.97), 0.045, 0.04),
        "shR": ((0.24, 0, 1.47), 0.075, 0.075), "elR": ((0.38, 0, 1.18), 0.055, 0.055), "wrR": ((0.38, -0.22, 1.00), 0.045, 0.04),
        "hipL": ((-0.12, 0, 0.92), 0.095, 0.095), "knL": ((-0.17, 0, 0.50), 0.07, 0.07), "anL": ((-0.17, 0, 0.09), 0.055, 0.055), "toL": ((-0.17, -0.15, 0.04), 0.05, 0.04),
        "hipR": ((0.12, 0, 0.92), 0.095, 0.095), "knR": ((0.17, 0, 0.50), 0.07, 0.07), "anR": ((0.17, 0, 0.09), 0.055, 0.055), "toR": ((0.17, -0.15, 0.04), 0.05, 0.04),
        "fistL": ((-0.38, -0.25, 0.93), 0.05, 0.05), "fistR": ((0.38, -0.29, 0.96), 0.05, 0.05),
    }
    names = list(J.keys())
    edges = [("pelvis", "waist"), ("waist", "chest"), ("chest", "neck"),
             ("chest", "shL"), ("shL", "elL"), ("elL", "wrL"), ("wrL", "fistL"),
             ("chest", "shR"), ("shR", "elR"), ("elR", "wrR"), ("wrR", "fistR"),
             ("pelvis", "hipL"), ("hipL", "knL"), ("knL", "anL"), ("anL", "toL"),
             ("pelvis", "hipR"), ("hipR", "knR"), ("knR", "anR"), ("anR", "toR")]
    mesh = bpy.data.meshes.new("BodyMesh")
    mesh.from_pydata([J[n][0] for n in names], [(names.index(a), names.index(b)) for a, b in edges], [])
    body = bpy.data.objects.new("Body", mesh)
    bpy.context.collection.objects.link(body)
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    skin = body.modifiers.new("Skin", 'SKIN')
    skin.use_smooth_shade = True
    for i, n in enumerate(names):
        sv = mesh.skin_vertices[0].data[i]
        sv.radius = (J[n][1], J[n][2])
        sv.use_root = (n == "pelvis")
    sub = body.modifiers.new("Sub", 'SUBSURF')
    sub.levels = 2
    bpy.ops.object.modifier_apply(modifier="Skin")
    bpy.ops.object.modifier_apply(modifier="Sub")
    bpy.ops.object.shade_smooth()
    body.data.materials.append(mat_suit)
    # Heat-weight to the armature (falls back to envelopes if the solver can't converge)
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    try:
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except Exception:
        bpy.ops.object.parent_set(type='ARMATURE_ENVELOPE')
    bpy.ops.object.select_all(action='DESELECT')
    return body

def build_rigged_hero(hero_id, cfg):
    clear_scene()
    mat_pri = make_mat(f"{hero_id}_pri", cfg["primary"], 0.82, 0.22)
    mat_acc = make_mat(f"{hero_id}_acc", cfg["accent"], 0.92, 0.16)
    mat_drk = make_mat(f"{hero_id}_drk", cfg["dark"], 0.65, 0.36)
    mat_em  = make_mat(f"{hero_id}_em",  cfg["primary"], 0.2, 0.12, cfg["primary"], 3.0)
    mat_suit = make_mat(f"{hero_id}_suit", tuple(c * 0.08 + 0.015 for c in cfg["primary"]), 0.1, 0.7)  # linear values: keep dark so armour reads
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
    build_skinned_body(arm_obj, mat_suit, mat_skn)

    # 2. Sculpted Armor Meshes Attached to Bones
    add_part(arm_obj, "Hips", "cube", (0, 0, 0.98), (0.44, 0.26, 0.20), mat_drk)
    add_part(arm_obj, "Hips", "cube", (0, -0.13, 0.98), (0.14, 0.06, 0.12), mat_acc)

    # Chest Armor, Glowing Core & Cape
    add_part(arm_obj, "Chest", "cube", (0, 0, 1.34), (0.58, 0.32, 0.46), mat_pri, taper=0.72)
    # abdominal plate + layered chest plate for silhouette depth
    add_part(arm_obj, "Chest", "cube", (0, -0.15, 1.40), (0.40, 0.05, 0.22), mat_acc)
    add_part(arm_obj, "Hips", "cube", (0, -0.12, 1.02), (0.30, 0.06, 0.16), mat_drk, taper=0.8)
    add_part(arm_obj, "Chest", "sphere", (0, -0.16, 1.38), (0.15, 0.08, 0.15), mat_em)
    add_part(arm_obj, "Chest", "cube", (0, 0.19, 1.12), (0.48, 0.04, 0.72), mat_pri, rot=(math.radians(10), 0, 0))
    # Pauldrons
    add_part(arm_obj, "Chest", "sphere", (-0.36, 0, 1.50), (0.28, 0.28, 0.22), mat_acc)
    add_part(arm_obj, "Chest", "sphere", (0.36, 0, 1.50),  (0.28, 0.28, 0.22), mat_acc)

    # Head, Visor & Unique God Crest
    # Helmeted head: dark shell, wide glowing visor slit, chin guard and ear plates
    add_part(arm_obj, "Head", "sphere", (0, 0, 1.74), (0.27, 0.29, 0.31), mat_drk)
    add_part(arm_obj, "Head", "cube",   (0, -0.125, 1.765), (0.22, 0.06, 0.055), mat_em)
    add_part(arm_obj, "Head", "cube",   (0, -0.10, 1.655), (0.16, 0.08, 0.07), mat_pri, taper=0.7)
    for sx in (-1, 1):
        add_part(arm_obj, "Head", "cyl", (sx * 0.135, 0, 1.73), (0.09, 0.09, 0.04), mat_acc, rot=(0, math.radians(90), 0))
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

    # Neck, belt & shoulder straps (fills the gaps between torso / head / hips)
    add_part(arm_obj, "Chest", "cyl", (0, 0, 1.585), (0.15, 0.15, 0.10), mat_skn)
    add_part(arm_obj, "Hips", "cyl", (0, 0, 1.09), (0.50, 0.32, 0.07), mat_acc)
    add_part(arm_obj, "Chest", "cube", (0, 0, 1.20), (0.48, 0.27, 0.14), mat_drk)

    # Armour shells over the skinned body (bone-parented rigid plates)
    for sx, fa in ((-1, "ForearmL"), (1, "ForearmR")):
        add_part(arm_obj, fa, "cyl", (sx * 0.38, -0.10 if sx < 0 else -0.12, 1.06), (0.13, 0.13, 0.16), mat_acc, rot=(math.radians(38), 0, 0), taper=1.15)
        add_part(arm_obj, "UpperArm" + ("L" if sx < 0 else "R"), "cube", (sx * 0.33, 0, 1.30), (0.07, 0.15, 0.16), mat_pri)
    for sx, th, sh in ((-1, "ThighL", "ShinL"), (1, "ThighR", "ShinR")):
        add_part(arm_obj, th, "cube", (sx * 0.15, -0.085, 0.72), (0.15, 0.05, 0.26), mat_pri, taper=0.8)
        add_part(arm_obj, sh, "cube", (sx * 0.17, -0.075, 0.30), (0.12, 0.05, 0.30), mat_pri, taper=0.85)
        add_part(arm_obj, sh, "sphere", (sx * 0.17, -0.07, 0.50), (0.13, 0.08, 0.11), mat_acc)
        add_part(arm_obj, sh, "cube", (sx * 0.17, -0.06, 0.06), (0.13, 0.28, 0.11), mat_drk)

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
