"""
GOD WARS: ASGARD ROYALE — BLENDER 3.6 COLOSSAL ASGARD GOD STATUES & ARCHWAY GENERATOR
Sculpts 6 monumental Asgardian statues & architectural arches as beveled PBR .glb assets:
  - statue_odin.glb (Colossal Odin Allfather with Gungnir Spear & Crown)
  - statue_thor.glb (Colossal Thor raising Mjölnir to the heavens)
  - statue_valkyrie.glb (Colossal Winged Valkyrie Guardian with sweeping wings)
  - statue_heimdall.glb (Colossal Heimdall Watchman with Hofund Greatsword)
  - statue_hela.glb (Colossal Hela Goddess of Death with Obsidian Crown)
  - prop_asgard_archway.glb (Ornate Golden Asgardian Highway Triumphal Arch)
"""

import bpy
import math
import os

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "models")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr(name, color, metallic=0.88, roughness=0.22, emission=None, emit_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission and emit_strength > 0:
        bsdf.inputs["Emission"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    return mat


def add_bevel(obj, w=0.08, segs=2):
    mod = obj.modifiers.new("Bevel", 'BEVEL')
    mod.width = w
    mod.segments = segs
    mod.limit_method = 'ANGLE'
    for p in obj.data.polygons:
        p.use_smooth = True


def add_box(name, size, loc, rot=(0, 0, 0), mat=None, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        add_bevel(obj, bevel, 2)
    if mat:
        obj.data.materials.append(mat)
    return obj


def add_cyl(name, r, h, loc, rot=(0, 0, 0), verts=16, mat=None, bevel=0.05):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    if bevel > 0:
        add_bevel(obj, bevel, 2)
    if mat:
        obj.data.materials.append(mat)
    return obj


def add_cone(name, r1, r2, h, loc, rot=(0, 0, 0), verts=12, mat=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    for p in obj.data.polygons:
        p.use_smooth = True
    if mat:
        obj.data.materials.append(mat)
    return obj


def add_torus(name, maj, minr, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=maj, minor_radius=minr, major_segments=32, minor_segments=12, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    for p in obj.data.polygons:
        p.use_smooth = True
    if mat:
        obj.data.materials.append(mat)
    return obj


def export_glb(filename):
    path = os.path.join(OUTPUT_DIR, filename)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True)
    print(f"[BLENDER-STATUE] Exported: {filename}")


def build_statue_base(mat_stone, mat_gold, mat_glow, height_scale=1.0):
    # Stepped Monumental Pedestal + Humanoid Colossal Figure (16-22m tall!)
    s = height_scale
    add_box("pedestal_1", (6.8 * s, 6.8 * s, 1.4 * s), (0, 0, 0.7 * s), mat=mat_stone, bevel=0.12)
    add_box("pedestal_2", (5.4 * s, 5.4 * s, 1.6 * s), (0, 0, 2.2 * s), mat=mat_gold, bevel=0.10)
    # Armored Legs & Robe
    for side in (-1, 1):
        add_box(f"leg_{side}", (1.15 * s, 1.25 * s, 4.4 * s), (side * 0.95 * s, 0, 5.2 * s), mat=mat_stone, bevel=0.12)
    add_cone("robe", 2.4 * s, 1.5 * s, 4.6 * s, (0, 0, 5.2 * s), verts=8, mat=mat_gold)
    # Broad Colossal Torso & Pauldrons
    add_box("torso", (3.6 * s, 2.1 * s, 4.2 * s), (0, 0, 9.4 * s), mat=mat_gold, bevel=0.18)
    add_box("chest_core", (1.2 * s, 2.3 * s, 1.4 * s), (0, -0.1 * s, 9.8 * s), mat=mat_glow, bevel=0.08)
    for side in (-1, 1):
        add_box(f"pauldron_{side}", (1.8 * s, 2.2 * s, 1.3 * s), (side * 2.5 * s, 0, 11.1 * s), (0, side * 0.25, 0), mat=mat_gold, bevel=0.12)
    # Head & Helmet
    add_box("head", (1.65 * s, 1.65 * s, 1.9 * s), (0, 0, 12.6 * s), mat=mat_stone, bevel=0.18)
    add_box("helm", (1.9 * s, 1.9 * s, 1.1 * s), (0, 0, 13.3 * s), mat=mat_gold, bevel=0.12)
    # Flowing Cape
    add_box("cape", (3.8 * s, 0.45 * s, 7.6 * s), (0, 1.35 * s, 7.4 * s), (-0.12, 0, 0), mat=mat_stone, bevel=0.06)


def build_all_statues():
    # 1. COLOSSAL STATUE OF ODIN (Valhalla Citadel)
    clear_scene()
    stone = make_pbr("odin_marble", (0.86, 0.88, 0.92), 0.2, 0.35)
    gold = make_pbr("odin_gold", (0.98, 0.75, 0.14), 0.94, 0.16)
    glow = make_pbr("odin_glow", (0.99, 0.90, 0.35), 0.1, 0.1, (0.99, 0.90, 0.35), 4.0)
    build_statue_base(stone, gold, glow, 1.15)
    # Raised Right Arm holding Colossal Gungnir Spear + Sun Halo
    add_box("arm_r", (1.1, 1.1, 4.4), (3.1, -0.6, 13.5), (0.3, -0.2, 0), mat=gold, bevel=0.1)
    add_box("arm_l", (1.1, 1.1, 3.8), (-2.9, -0.4, 10.2), (0.4, 0.1, 0), mat=stone, bevel=0.1)
    add_cyl("gungnir_shaft", 0.24, 18.5, (3.6, -1.2, 11.5), verts=10, mat=gold)
    add_cone("gungnir_tip", 0.72, 0.04, 3.4, (3.6, -1.2, 22.0), verts=4, mat=glow)
    add_torus("allfather_halo", 4.4, 0.25, (0, 1.2, 14.5), (math.pi / 2, 0, 0), glow)
    export_glb("statue_odin.glb")

    # 2. COLOSSAL STATUE OF THOR (Mjölnir Dwarven Forge)
    clear_scene()
    iron = make_pbr("thor_iron", (0.24, 0.28, 0.35), 0.85, 0.28)
    gold = make_pbr("thor_gold", (0.96, 0.65, 0.08), 0.92, 0.18)
    blue = make_pbr("thor_bolt", (0.22, 0.78, 0.98), 0.1, 0.1, (0.22, 0.78, 0.98), 4.5)
    build_statue_base(iron, gold, blue, 1.0)
    # Winged Helmet + Sky-Raised Arm with Giant Mjölnir Hammer!
    for s in (-1, 1):
        add_box(f"wing_{s}", (0.28, 1.4, 1.9), (s * 1.15, 0, 13.8), (-0.35, 0, 0), mat=gold, bevel=0.05)
    add_box("arm_raise", (1.0, 1.0, 4.2), (2.7, -0.5, 13.4), (0.2, -0.15, 0), mat=iron, bevel=0.1)
    add_cyl("mjolnir_handle", 0.28, 3.6, (2.9, -0.8, 16.5), mat=gold)
    add_box("mjolnir_head", (2.4, 3.6, 2.1), (2.9, -0.8, 18.4), mat=blue, bevel=0.16)
    export_glb("statue_thor.glb")

    # 3. COLOSSAL WINGED VALKYRIE STATUE (Valkyrie Sky Docks)
    clear_scene()
    gold = make_pbr("valk_gold", (0.98, 0.76, 0.16), 0.94, 0.15)
    marble = make_pbr("valk_marble", (0.92, 0.94, 0.98), 0.2, 0.3)
    orange = make_pbr("valk_glow", (0.98, 0.45, 0.09), 0.15, 0.1, (0.98, 0.45, 0.09), 3.8)
    build_statue_base(marble, gold, orange, 1.05)
    # Massive Sweeping 14m Valkyrie Wings!
    for s in (-1, 1):
        for f in range(5):
            add_box(
                f"wing_{s}_{f}",
                (6.2 - f * 0.8, 0.38, 1.05),
                (s * (4.4 - f * 0.35), 1.4, 13.2 - f * 1.15),
                (0, -s * (0.42 - f * 0.09), 0),
                mat=gold if f % 2 == 0 else orange,
                bevel=0.06
            )
    export_glb("statue_valkyrie.glb")

    # 4. COLOSSAL HEIMDALL GUARDIAN STATUE (Bifrost Observatory)
    clear_scene()
    bronze = make_pbr("hm_bronze", (0.85, 0.58, 0.14), 0.92, 0.2)
    steel = make_pbr("hm_steel", (0.16, 0.22, 0.32), 0.85, 0.24)
    cyan = make_pbr("hm_cyan", (0.22, 0.78, 0.98), 0.1, 0.08, (0.22, 0.78, 0.98), 4.2)
    build_statue_base(steel, bronze, cyan, 1.05)
    # Horns + Giant Hofund Greatsword planted in front!
    for s in (-1, 1):
        add_cone(f"horn_{s}", 0.38, 0.04, 2.8, (s * 0.85, -0.3, 14.8), (0.2, s * 0.3, 0), mat=bronze)
    add_box("sword_blade", (0.85, 0.24, 11.5), (0, -2.0, 6.5), mat=cyan, bevel=0.04)
    add_box("sword_guard", (3.6, 0.55, 0.65), (0, -2.0, 11.5), mat=bronze, bevel=0.06)
    export_glb("statue_heimdall.glb")

    # 5. COLOSSAL HELA OBSIDIAN STATUE (Helheim Fortress)
    clear_scene()
    obs = make_pbr("hela_obs", (0.06, 0.08, 0.14), 0.9, 0.18)
    necro = make_pbr("hela_necro", (0.08, 0.76, 0.65), 0.15, 0.1, (0.08, 0.76, 0.65), 4.2)
    build_statue_base(obs, obs, necro, 1.0)
    # Giant 6-Pronged Antler Crown of Death
    for idx in (-3, -2, -1, 1, 2, 3):
        add_cone(f"antler_{idx}", 0.24, 0.02, 4.2, (idx * 0.52, 0, 14.8), (0, idx * 0.32, 0), mat=obs)
    add_torus("necro_halo", 3.6, 0.2, (0, 1.2, 13.5), (math.pi / 2, 0, 0), necro)
    export_glb("statue_hela.glb")

    # 6. ORNATE GOLDEN ASGARDIAN HIGHWAY TRIUMPHAL ARCHWAY
    clear_scene()
    gold = make_pbr("arch_gold", (0.96, 0.68, 0.10), 0.92, 0.18)
    marble = make_pbr("arch_marble", (0.88, 0.90, 0.94), 0.18, 0.3)
    glow = make_pbr("arch_glow", (0.22, 0.78, 0.98), 0.1, 0.1, (0.22, 0.78, 0.98), 3.5)
    for s in (-1, 1):
        add_box(f"pillar_{s}", (1.8, 1.8, 9.2), (s * 5.2, 0, 4.6), mat=marble, bevel=0.1)
        add_box(f"trim_{s}", (2.1, 2.1, 1.2), (s * 5.2, 0, 0.6), mat=gold, bevel=0.08)
        add_box(f"cap_{s}", (2.2, 2.2, 1.0), (s * 5.2, 0, 9.2), mat=gold, bevel=0.08)
        add_box(f"lantern_{s}", (0.45, 0.45, 1.2), (s * 4.1, 0, 5.2), mat=glow, bevel=0.04)
    add_box("arch_beam", (12.8, 2.0, 1.6), (0, 0, 10.2), mat=gold, bevel=0.12)
    add_cone("crest", 1.8, 0.1, 2.6, (0, 0, 12.2), verts=4, mat=glow)
    export_glb("prop_asgard_archway.glb")


if __name__ == "__main__":
    build_all_statues()
    print("[BLENDER-STATUE] ALL 6 COLOSSAL ASGARD STATUES & ARCHWAY GENERATED!")
