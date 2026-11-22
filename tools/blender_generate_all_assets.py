"""
GOD WARS: ASGARD ROYALE — BLENDER 3.6 EXTENDED MAP, ORDNANCE & PROP ASSET GENERATOR
Generates 12 additional sculpted PBR .glb assets using Blender 3.6 bpy & bmesh:
  - 3 Divine Bombs (bomb_solar.glb, bomb_flash.glb, bomb_arc.glb)
  - 1 Evo Shield Pickup (loot_evoshield.glb)
  - 8 Asgard Map Landmarks & Interactive Props:
    prop_jumppad.glb, prop_respawn_beacon.glb, prop_survey_beacon.glb,
    prop_odin_statue.glb, prop_bifrost_gate.glb, prop_yggdrasil_tree.glb,
    prop_asgard_tree.glb, prop_forge_anvil.glb
"""

import bpy
import math
import os

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "models")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr(name, color, metallic=0.82, roughness=0.24, emission=None, emit_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission and emit_strength > 0:
        bsdf.inputs["Emission"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        mat.blend_method = 'BLEND'
        bsdf.inputs["Alpha"].default_value = alpha
    return mat


def smooth_bevel(obj, width=0.02, segments=2):
    mod = obj.modifiers.new("Bevel", 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    for p in obj.data.polygons:
        p.use_smooth = True


def add_box(name, size, loc, rot=(0, 0, 0), mat=None, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        smooth_bevel(obj, bevel, 2)
    if mat:
        obj.data.materials.append(mat)
    return obj


def add_cyl(name, r, h, loc, rot=(0, 0, 0), verts=16, mat=None, bevel=0.015):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    if bevel > 0:
        smooth_bevel(obj, bevel, 2)
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


def add_ico(name, r, subdiv, loc, mat=None):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=subdiv, location=loc)
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
    print(f"[BLENDER-ASSETS] Exported: {filename}")


def build_divine_bombs():
    # 1. Ragnarok Solar Bomb
    clear_scene()
    gold = make_pbr("solar_gold", (0.98, 0.72, 0.12), 0.94, 0.16)
    magma = make_pbr("solar_magma", (0.98, 0.42, 0.06), 0.2, 0.1, (0.98, 0.42, 0.06), 4.2)
    add_ico("core", 0.22, 2, (0, 0, 0), magma)
    add_torus("ring1", 0.25, 0.032, (0, 0, 0), (0, 0, 0), gold)
    add_torus("ring2", 0.25, 0.032, (0, 0, 0), (math.pi / 2, 0, 0), gold)
    add_torus("ring3", 0.25, 0.032, (0, 0, 0), (0, math.pi / 2, 0), gold)
    export_glb("bomb_solar.glb")

    # 2. Apollo Celestial Flashbang
    clear_scene()
    gold = make_pbr("flash_gold", (0.98, 0.80, 0.18), 0.95, 0.15)
    light = make_pbr("flash_core", (1.0, 0.97, 0.65), 0.1, 0.05, (1.0, 0.97, 0.65), 4.8)
    add_cyl("body", 0.13, 0.34, (0, 0, 0), verts=8, mat=light, bevel=0.01)
    add_cyl("cap_top", 0.15, 0.07, (0, 0, 0.18), verts=8, mat=gold, bevel=0.01)
    add_cyl("cap_bot", 0.15, 0.07, (0, 0, -0.18), verts=8, mat=gold, bevel=0.01)
    add_torus("pin_ring", 0.07, 0.012, (0.14, 0, 0.22), (math.pi / 2, 0, 0), gold)
    export_glb("bomb_flash.glb")

    # 3. Yggdrasil Arc Star
    clear_scene()
    cyan = make_pbr("arc_cyan", (0.22, 0.78, 0.98), 0.2, 0.08, (0.22, 0.78, 0.98), 4.5)
    steel = make_pbr("arc_steel", (0.14, 0.18, 0.28), 0.9, 0.2)
    add_ico("hub", 0.10, 1, (0, 0, 0), cyan)
    for i in range(4):
        a = i * math.pi / 2
        add_cone(f"blade_{i}", 0.065, 0.004, 0.28, (math.cos(a) * 0.18, math.sin(a) * 0.18, 0), (0, math.pi / 2, a), verts=4, mat=steel if i % 2 == 0 else cyan)
    export_glb("bomb_arc.glb")


def build_loot_and_interactive_props():
    # 4. Evo Shield Armor Core Pickup
    clear_scene()
    cyan = make_pbr("evo_cyan", (0.22, 0.74, 0.97), 0.3, 0.12, (0.22, 0.74, 0.97), 2.8)
    gold = make_pbr("evo_gold", (0.98, 0.75, 0.14), 0.92, 0.18)
    add_box("chest", (0.52, 0.22, 0.62), (0, 0, 0.35), mat=cyan, bevel=0.04)
    for s in (-1, 1):
        add_box(f"shldr_{s}", (0.22, 0.26, 0.18), (s * 0.34, 0, 0.56), (0, s * 0.25, 0), mat=gold, bevel=0.02)
    export_glb("loot_evoshield.glb")

    # 5. Bifrost Jump Pad
    clear_scene()
    gold = make_pbr("jp_gold", (0.96, 0.65, 0.08), 0.92, 0.18)
    dark = make_pbr("jp_dark", (0.12, 0.16, 0.24), 0.82, 0.28)
    cyan = make_pbr("jp_cyan", (0.22, 0.78, 0.98), 0.1, 0.08, (0.22, 0.78, 0.98), 4.0)
    add_cyl("outer_base", 2.65, 0.32, (0, 0, 0.16), verts=8, mat=dark, bevel=0.04)
    add_cyl("gold_rim", 2.35, 0.38, (0, 0, 0.19), verts=8, mat=gold, bevel=0.04)
    add_cyl("repulsor_core", 1.75, 0.42, (0, 0, 0.21), verts=16, mat=cyan, bevel=0.02)
    add_torus("hover_ring", 2.05, 0.11, (0, 0, 0.48), mat=cyan)
    export_glb("prop_jumppad.glb")

    # 6. Valhalla Green Respawn Beacon
    clear_scene()
    dark = make_pbr("rb_dark", (0.11, 0.15, 0.23), 0.82, 0.26)
    gold = make_pbr("rb_gold", (0.96, 0.68, 0.10), 0.92, 0.18)
    emerald = make_pbr("rb_green", (0.06, 0.78, 0.48), 0.15, 0.1, (0.06, 0.78, 0.48), 4.2)
    add_cyl("pedestal", 1.55, 1.0, (0, 0, 0.5), verts=8, mat=dark, bevel=0.05)
    add_box("spire_body", (0.78, 0.78, 2.8), (0, 0, 2.0), mat=gold, bevel=0.05)
    add_ico("soul_crystal", 0.55, 1, (0, 0, 3.85), emerald)
    add_torus("halo", 0.95, 0.07, (0, 0, 3.85), mat=emerald)
    export_glb("prop_respawn_beacon.glb")

    # 7. Heimdall Rooftop Survey Beacon
    clear_scene()
    gold = make_pbr("sb_gold", (0.96, 0.68, 0.10), 0.92, 0.18)
    cyan = make_pbr("sb_cyan", (0.22, 0.74, 0.97), 0.2, 0.1, (0.22, 0.74, 0.97), 3.2)
    add_cyl("tripod_stem", 0.24, 1.65, (0, 0, 0.82), verts=8, mat=gold, bevel=0.02)
    add_cone("dish", 0.85, 0.12, 0.45, (0, 0, 1.95), (math.pi / 3, 0, 0), verts=16, mat=cyan)
    add_torus("dish_rim", 0.85, 0.05, (0, 0, 1.95), (math.pi / 3, 0, 0), gold)
    export_glb("prop_survey_beacon.glb")


def build_asgard_landmarks():
    # 8. Valhalla Central Odin Monument Obelisk
    clear_scene()
    gold = make_pbr("od_gold", (0.98, 0.74, 0.12), 0.94, 0.16)
    marble = make_pbr("od_marble", (0.92, 0.94, 0.97), 0.15, 0.25)
    glow = make_pbr("od_glow", (0.99, 0.88, 0.28), 0.1, 0.1, (0.99, 0.88, 0.28), 3.8)
    add_box("base_plinth", (3.6, 3.6, 1.2), (0, 0, 0.6), mat=marble, bevel=0.08)
    add_cone("obelisk", 1.5, 0.45, 9.2, (0, 0, 5.8), verts=4, mat=gold)
    add_torus("crown1", 2.8, 0.22, (0, 0, 8.6), (math.pi / 4, 0, 0), glow)
    add_torus("crown2", 2.8, 0.22, (0, 0, 8.6), (-math.pi / 4, 0, 0), gold)
    add_ico("allfather_orb", 0.85, 2, (0, 0, 11.2), glow)
    export_glb("prop_odin_statue.glb")

    # 9. Bifrost Observatory Giant Stargate Portal
    clear_scene()
    gold = make_pbr("bg_gold", (0.96, 0.68, 0.10), 0.94, 0.16)
    cyan = make_pbr("bg_cyan", (0.22, 0.78, 0.98), 0.1, 0.08, (0.22, 0.78, 0.98), 3.5)
    add_torus("outer_ring", 10.0, 0.85, (0, 0, 11.0), (math.pi / 2, 0, 0), gold)
    add_torus("inner_ring", 9.0, 0.35, (0, 0, 11.0), (math.pi / 2, 0, 0), cyan)
    for i in range(8):
        a = (i / 8.0) * math.pi * 2
        add_box(f"chevron_{i}", (1.5, 1.4, 2.2), (math.cos(a) * 10.4, 0, 11.0 + math.sin(a) * 10.4), (0, a, 0), mat=gold, bevel=0.1)
    add_box("gate_pedestal", (16.0, 4.2, 2.2), (0, 0, 1.1), mat=gold, bevel=0.12)
    export_glb("prop_bifrost_gate.glb")

    # 10. Sculpted Yggdrasil World Tree
    clear_scene()
    bark = make_pbr("yg_bark", (0.36, 0.20, 0.08), 0.1, 0.82)
    leaf = make_pbr("yg_leaf", (0.06, 0.72, 0.45), 0.15, 0.35, (0.06, 0.72, 0.45), 0.9)
    gold_leaf = make_pbr("yg_gold", (0.96, 0.72, 0.12), 0.7, 0.25, (0.96, 0.72, 0.12), 0.8)
    add_cone("trunk", 8.0, 3.8, 34.0, (0, 0, 17.0), verts=12, mat=bark)
    for i in range(6):
        a = (i / 6.0) * math.pi * 2
        add_cone(f"root_{i}", 2.6, 0.8, 12.0, (math.cos(a) * 7.2, math.sin(a) * 7.2, 3.2), (math.sin(a) * 0.9, -math.cos(a) * 0.9, 0), verts=8, mat=bark)
    canopies = [
        (0, 0, 34, 17, leaf), (-11, 8, 29, 12, leaf), (12, -7, 30, 13, gold_leaf),
        (7, 11, 28, 11, leaf), (-9, -10, 29, 12, gold_leaf)
    ]
    for idx, (cx, cy, cz, r, m) in enumerate(canopies):
        add_ico(f"canopy_{idx}", r, 2, (cx, cy, cz), m)
    export_glb("prop_yggdrasil_tree.glb")

    # 11. Sculpted Asgardian Golden Pine Tree
    clear_scene()
    bark = make_pbr("tr_bark", (0.35, 0.20, 0.09), 0.1, 0.85)
    foliage = make_pbr("tr_foliage", (0.08, 0.65, 0.42), 0.12, 0.48)
    gold_tip = make_pbr("tr_gold", (0.95, 0.68, 0.10), 0.65, 0.3)
    add_cone("trunk", 0.68, 0.32, 4.4, (0, 0, 2.2), verts=8, mat=bark)
    add_cone("tier1", 2.9, 0.4, 3.8, (0, 0, 4.6), verts=9, mat=foliage)
    add_cone("tier2", 2.2, 0.3, 3.4, (0, 0, 6.8), verts=9, mat=foliage)
    add_cone("tier3", 1.4, 0.05, 2.8, (0, 0, 8.8), verts=9, mat=gold_tip)
    export_glb("prop_asgard_tree.glb")

    # 12. Mjölnir Dwarven Star-Metal Forge Anvil
    clear_scene()
    iron = make_pbr("an_iron", (0.16, 0.19, 0.25), 0.88, 0.28)
    lava = make_pbr("an_lava", (0.98, 0.45, 0.09), 0.2, 0.1, (0.98, 0.45, 0.09), 4.0)
    add_box("anvil_base", (5.2, 3.2, 1.4), (0, 0, 0.7), mat=iron, bevel=0.08)
    add_box("anvil_waist", (3.6, 2.2, 1.4), (0, 0, 2.0), mat=iron, bevel=0.08)
    add_box("anvil_top", (6.8, 3.0, 1.5), (0, 0, 3.3), mat=iron, bevel=0.1)
    add_box("star_ingot", (2.2, 1.1, 0.45), (0, 0, 4.25), mat=lava, bevel=0.06)
    export_glb("prop_forge_anvil.glb")


if __name__ == "__main__":
    build_divine_bombs()
    build_loot_and_interactive_props()
    build_asgard_landmarks()
    print("[BLENDER-ASSETS] ALL 12 EXTENDED MAP, BOMB & PROP GLBS EXPORTED!")
