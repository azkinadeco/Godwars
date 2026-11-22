"""
GOD WARS: ASGARD ROYALE — BLENDER 3.6 HEADLESS 3D ASSET GENERATOR
Generates 17 high-detail beveled PBR .glb models (6 Heroes, 6 Divine Firearms, 5 Asgard Props)
using Blender's bpy, bmesh, Bevel modifiers, and Principled BSDF Metallic/Roughness/Emission materials.
Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender_generate_assets.py
"""

import bpy
import bmesh
import math
import os

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "models")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr_mat(name, base_color, metallic=0.8, roughness=0.25, emission_color=None, emission_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")

    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness

    if emission_color and emission_strength > 0:
        if "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*emission_color, 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength

    if alpha < 1.0:
        mat.blend_method = 'BLEND'
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha

    return mat


def add_bevel(obj, width=0.012, segments=2):
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    for poly in obj.data.polygons:
        poly.use_smooth = True


def add_box(name, size, loc, rot=(0, 0, 0), mat=None, bevel=0.01):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        add_bevel(obj, width=bevel, segments=2)
    if mat:
        obj.data.materials.append(mat)
    return obj


def add_cyl(name, radius, depth, loc, rot=(0, 0, 0), vertices=16, mat=None, bevel=0.006):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    if bevel > 0:
        add_bevel(obj, width=bevel, segments=2)
    if mat:
        obj.data.materials.append(mat)
    return obj


def add_cone(name, r1, r2, depth, loc, rot=(0, 0, 0), vertices=12, mat=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if mat:
        obj.data.materials.append(mat)
    return obj


def add_torus(name, major_r, minor_r, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_r, minor_radius=minor_r, major_segments=28, minor_segments=12, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if mat:
        obj.data.materials.append(mat)
    return obj


def export_glb(filename):
    filepath = os.path.join(OUTPUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        export_apply=True,
        export_yup=True
    )
    print(f"[BLENDER] Exported: {filepath}")


# =============================================================================
# 1. GENERATE 6 DIVINE WEAPONS (P90, KRISS, M4A1, UZI, AK47, MAGNUM)
# Note: In Blender (+X right, +Z up, -Y forward -> exported as glTF +Y up, -Z forward)
# =============================================================================
def build_weapons():
    weapons_cfg = {
        "p90": {
            "glow": (0.22, 0.74, 0.97),
            "metal": (0.10, 0.14, 0.20),
            "gold": (0.98, 0.75, 0.14)
        },
        "kriss": {
            "glow": (0.96, 0.25, 0.37),
            "metal": (0.09, 0.11, 0.16),
            "gold": (0.95, 0.70, 0.12)
        },
        "m4a1": {
            "glow": (0.98, 0.75, 0.14),
            "metal": (0.85, 0.88, 0.92),
            "gold": (0.96, 0.65, 0.08)
        },
        "uzi": {
            "glow": (0.18, 0.83, 0.75),
            "metal": (0.14, 0.18, 0.24),
            "gold": (0.98, 0.78, 0.15)
        },
        "ak47": {
            "glow": (0.98, 0.45, 0.09),
            "metal": (0.08, 0.09, 0.12),
            "gold": (0.85, 0.45, 0.06)
        },
        "magnum": {
            "glow": (0.91, 0.47, 0.98),
            "metal": (0.82, 0.85, 0.90),
            "gold": (0.98, 0.75, 0.14)
        }
    }

    for wid, cfg in weapons_cfg.items():
        clear_scene()
        mat_dark = make_pbr_mat(f"{wid}_metal", cfg["metal"], metallic=0.88, roughness=0.22)
        mat_gold = make_pbr_mat(f"{wid}_gold", cfg["gold"], metallic=0.95, roughness=0.16)
        mat_silver = make_pbr_mat(f"{wid}_silver", (0.88, 0.91, 0.95), metallic=0.92, roughness=0.18)
        mat_glow = make_pbr_mat(f"{wid}_glow", cfg["glow"], metallic=0.2, roughness=0.1, emission_color=cfg["glow"], emission_strength=3.5)
        mat_glass = make_pbr_mat(f"{wid}_glass", cfg["glow"], metallic=0.1, roughness=0.08, emission_color=cfg["glow"], emission_strength=2.2, alpha=0.82)

        if wid == "p90":
            # Bullpup P90 body + thumbhole + glowing Bifrost crystal top magazine
            add_box("receiver", (0.078, 0.50, 0.12), (0, 0, 0), mat=mat_dark, bevel=0.014)
            add_box("stock_rear", (0.082, 0.16, 0.15), (0, -0.22, -0.015), mat=mat_dark, bevel=0.015)
            add_box("front_grip", (0.054, 0.075, 0.11), (0, 0.14, -0.09), rot=(0.25, 0, 0), mat=mat_gold, bevel=0.01)
            add_box("pistol_grip", (0.054, 0.065, 0.12), (0, -0.05, -0.09), rot=(0.2, 0, 0), mat=mat_dark, bevel=0.01)
            add_box("trigger_guard", (0.045, 0.18, 0.025), (0, 0.04, -0.135), mat=mat_gold, bevel=0.005)
            # Translucent Bifrost 50-rd top magazine
            add_box("top_mag", (0.068, 0.34, 0.038), (0, 0.02, 0.08), mat=mat_glass, bevel=0.008)
            # Heimdall Golden Wing Side Plates
            for s in (-1, 1):
                add_box(f"wing_{s}", (0.014, 0.28, 0.048), (s * 0.045, 0.06, 0.02), rot=(0, s * 0.25, 0), mat=mat_gold, bevel=0.004)
                add_box(f"rune_{s}", (0.016, 0.24, 0.016), (s * 0.046, 0.04, 0.0), mat=mat_glow, bevel=0.002)
            add_cyl("barrel", 0.015, 0.18, (0, 0.31, 0.015), rot=(math.pi / 2, 0, 0), mat=mat_silver)
            add_cyl("muzzle", 0.022, 0.055, (0, 0.39, 0.015), rot=(math.pi / 2, 0, 0), vertices=8, mat=mat_gold)

        elif wid == "kriss":
            # Fenrir Kriss Vector Super-V SMG
            add_box("upper", (0.074, 0.45, 0.088), (0, 0, 0.03), mat=mat_dark, bevel=0.012)
            add_box("super_v_block", (0.08, 0.14, 0.16), (0, 0.11, -0.06), mat=mat_dark, bevel=0.012)
            add_box("angled_mag", (0.046, 0.056, 0.24), (0, 0.13, -0.17), rot=(-0.24, 0, 0), mat=mat_glow, bevel=0.006)
            add_box("grip", (0.052, 0.06, 0.13), (0, -0.11, -0.07), rot=(0.22, 0, 0), mat=mat_dark, bevel=0.008)
            add_box("stock_strut", (0.042, 0.20, 0.035), (0, -0.28, 0.03), mat=mat_gold, bevel=0.006)
            add_box("stock_butt", (0.05, 0.03, 0.13), (0, -0.38, 0.0), mat=mat_dark, bevel=0.006)
            # Sculpted Fenrir Wolf Fangs flanking barrel
            for s in (-1, 1):
                add_cone(f"fang_{s}", 0.024, 0.002, 0.16, (s * 0.038, 0.28, 0.01), rot=(-math.pi / 2, 0, 0), vertices=6, mat=mat_glow)
                add_box(f"trim_{s}", (0.012, 0.32, 0.025), (s * 0.042, 0.04, 0.03), mat=mat_gold, bevel=0.003)
            add_cyl("suppressor", 0.025, 0.22, (0, 0.30, 0.03), rot=(math.pi / 2, 0, 0), vertices=12, mat=mat_gold)

        elif wid == "m4a1":
            # Valhalla M4A1 Odin Carbine
            add_box("receiver", (0.076, 0.34, 0.108), (0, 0, 0), mat=mat_dark, bevel=0.012)
            add_box("handguard", (0.068, 0.28, 0.086), (0, 0.29, 0.01), mat=mat_gold, bevel=0.012)
            add_cyl("barrel", 0.015, 0.28, (0, 0.49, 0.015), rot=(math.pi / 2, 0, 0), mat=mat_silver)
            add_cyl("muzzle_crown", 0.023, 0.07, (0, 0.62, 0.015), rot=(math.pi / 2, 0, 0), vertices=8, mat=mat_gold)
            add_box("stanag_mag", (0.048, 0.075, 0.21), (0, 0.06, -0.14), rot=(-0.18, 0, 0), mat=mat_gold, bevel=0.008)
            add_box("pistol_grip", (0.05, 0.06, 0.13), (0, -0.11, -0.11), rot=(0.26, 0, 0), mat=mat_dark, bevel=0.008)
            add_box("stock_tube", (0.056, 0.24, 0.105), (0, -0.26, -0.01), mat=mat_dark, bevel=0.01)
            for s in (-1, 1):
                add_box(f"valk_wing_{s}", (0.016, 0.36, 0.032), (s * 0.043, 0.15, 0.025), rot=(0, s * 0.2, 0), mat=mat_glow, bevel=0.004)

        elif wid == "uzi":
            # Hermes Uzi Winged Micro-SMG
            add_box("receiver", (0.072, 0.34, 0.098), (0, 0.03, 0.03), mat=mat_gold, bevel=0.012)
            add_box("grip_well", (0.058, 0.072, 0.16), (0, -0.01, -0.08), mat=mat_dark, bevel=0.008)
            add_box("ext_mag", (0.044, 0.054, 0.25), (0, -0.01, -0.18), mat=mat_glow, bevel=0.006)
            add_cyl("barrel", 0.018, 0.16, (0, 0.25, 0.03), rot=(math.pi / 2, 0, 0), mat=mat_silver)
            for s in (-1, 1):
                for f in range(3):
                    add_box(f"feather_{s}_{f}", (0.012, 0.18 - f * 0.03, 0.028), (s * (0.044 + f * 0.006), 0.04 - f * 0.02, 0.055 - f * 0.018), rot=(0.15, s * 0.35, 0), mat=mat_glow if f % 2 == 0 else mat_gold, bevel=0.003)

        elif wid == "ak47":
            # Surtr AK-47 Muspelheim Volcanic Rifle
            add_box("receiver", (0.078, 0.37, 0.104), (0, 0, 0), mat=mat_dark, bevel=0.012)
            add_box("lava_handguard", (0.072, 0.24, 0.082), (0, 0.29, 0.005), mat=mat_glow, bevel=0.01)
            add_cyl("barrel", 0.016, 0.32, (0, 0.51, 0.0), rot=(math.pi / 2, 0, 0), mat=mat_dark)
            add_cyl("gas_tube", 0.012, 0.22, (0, 0.45, 0.042), rot=(math.pi / 2, 0, 0), mat=mat_gold)
            add_cone("bayonet_horn", 0.02, 0.002, 0.12, (0, 0.62, -0.025), rot=(-math.pi / 2, 0, 0), vertices=6, mat=mat_glow)
            add_box("banana_mag", (0.05, 0.08, 0.25), (0, 0.09, -0.15), rot=(-0.38, 0, 0), mat=mat_glow, bevel=0.008)
            add_box("grip", (0.05, 0.06, 0.13), (0, -0.11, -0.10), rot=(0.25, 0, 0), mat=mat_dark, bevel=0.008)
            add_box("stock", (0.06, 0.24, 0.11), (0, -0.27, -0.03), rot=(0.14, 0, 0), mat=mat_dark, bevel=0.01)

        elif wid == "magnum":
            # Gungnir Magnum .50 Allfather Handcannon
            add_box("frame", (0.06, 0.22, 0.09), (0, 0.02, 0.01), mat=mat_gold, bevel=0.01)
            add_cyl("rune_cylinder", 0.048, 0.096, (0, 0.03, 0.02), rot=(math.pi / 2, 0, 0), vertices=12, mat=mat_glow)
            add_box("heavy_barrel", (0.052, 0.28, 0.086), (0, 0.24, 0.025), mat=mat_silver, bevel=0.009)
            add_cone("gungnir_spear", 0.03, 0.002, 0.11, (0, 0.40, -0.015), rot=(-math.pi / 2, 0, 0), vertices=4, mat=mat_gold)
            add_box("grip", (0.052, 0.065, 0.14), (0, -0.08, -0.09), rot=(0.34, 0, 0), mat=mat_dark, bevel=0.009)

        # Common Holographic Rune Optic Sight on top rail
        add_box("optic_base", (0.054, 0.09, 0.018), (0, -0.01, 0.095), mat=mat_gold, bevel=0.003)
        add_torus("optic_ring", 0.035, 0.0045, (0, -0.01, 0.132), rot=(math.pi / 2, 0, 0), mat=mat_gold)
        add_cyl("reticle_dot", 0.006, 0.006, (0, -0.01, 0.132), rot=(math.pi / 2, 0, 0), vertices=8, mat=mat_glow, bevel=0)

        export_glb(f"weapon_{wid}.glb")


# =============================================================================
# 2. GENERATE 6 MYTHOLOGICAL HEROES (LOKI, THOR, HADES, ZEUS, HELA, VALKYRIE)
# =============================================================================
def build_heroes():
    heroes_cfg = {
        "loki":     {"primary": (0.06, 0.72, 0.50), "accent": (0.98, 0.75, 0.14), "skin": (0.94, 0.76, 0.52)},
        "thor":     {"primary": (0.22, 0.74, 0.97), "accent": (0.96, 0.62, 0.04), "skin": (0.94, 0.76, 0.52)},
        "hades":    {"primary": (0.66, 0.33, 0.97), "accent": (0.94, 0.27, 0.27), "skin": (0.78, 0.82, 0.88)},
        "zeus":     {"primary": (0.98, 0.80, 0.08), "accent": (0.22, 0.74, 0.97), "skin": (0.95, 0.78, 0.56)},
        "hela":     {"primary": (0.08, 0.72, 0.65), "accent": (0.06, 0.09, 0.16), "skin": (0.88, 0.92, 0.90)},
        "valkyrie": {"primary": (0.98, 0.45, 0.09), "accent": (0.99, 0.88, 0.28), "skin": (0.92, 0.72, 0.50)}
    }

    for hid, cfg in heroes_cfg.items():
        clear_scene()
        mat_armor = make_pbr_mat(f"{hid}_armor", cfg["primary"], metallic=0.82, roughness=0.22)
        mat_accent = make_pbr_mat(f"{hid}_accent", cfg["accent"], metallic=0.94, roughness=0.15)
        mat_dark = make_pbr_mat(f"{hid}_dark", (0.08, 0.11, 0.17), metallic=0.7, roughness=0.38)
        mat_skin = make_pbr_mat(f"{hid}_skin", cfg["skin"], metallic=0.05, roughness=0.55)
        mat_glow = make_pbr_mat(f"{hid}_glow", cfg["primary"], metallic=0.1, roughness=0.1, emission_color=cfg["primary"], emission_strength=3.8)

        # Boots, Greaves & Legs
        for s in (-1, 1):
            add_box(f"leg_{s}", (0.23, 0.23, 0.84), (s * 0.18, 0, 0.42), mat=mat_dark, bevel=0.025)
            add_box(f"greave_{s}", (0.25, 0.26, 0.36), (s * 0.18, -0.02, 0.26), mat=mat_accent, bevel=0.02)
            add_box(f"knee_{s}", (0.26, 0.27, 0.16), (s * 0.18, -0.02, 0.50), mat=mat_armor, bevel=0.02)

        # Pelvis Belt & Sculpted Torso Chestplate
        add_box("belt", (0.62, 0.36, 0.16), (0, 0, 0.86), mat=mat_accent, bevel=0.02)
        add_box("torso", (0.66, 0.37, 0.78), (0, 0, 1.26), mat=mat_armor, bevel=0.04)
        add_box("chest_trim", (0.50, 0.40, 0.44), (0, -0.02, 1.32), mat=mat_dark, bevel=0.03)
        add_cyl("divine_core", 0.11, 0.08, (0, -0.20, 1.34), rot=(math.pi / 2, 0, 0), vertices=8, mat=mat_glow)

        # Layered Shoulder Pauldrons & Articulated Arms
        for s in (-1, 1):
            add_box(f"pauldron_upper_{s}", (0.34, 0.42, 0.24), (s * 0.46, 0, 1.56), rot=(0, s * 0.25, 0), mat=mat_accent, bevel=0.03)
            add_box(f"pauldron_trim_{s}", (0.36, 0.38, 0.10), (s * 0.48, 0, 1.46), rot=(0, s * 0.20, 0), mat=mat_glow, bevel=0.015)
            add_box(f"arm_{s}", (0.21, 0.21, 0.70), (s * 0.46, -0.08 if s == 1 else 0, 1.15), rot=(0.45 if s == 1 else 0.08, 0, 0), mat=mat_dark, bevel=0.025)
            add_box(f"gauntlet_{s}", (0.23, 0.23, 0.28), (s * 0.46, -0.15 if s == 1 else 0, 0.96), rot=(0.45 if s == 1 else 0.08, 0, 0), mat=mat_accent, bevel=0.02)

        # Head, Glowing God Eyes & Crown/Helmet
        add_box("head", (0.36, 0.36, 0.40), (0, 0, 1.88), mat=mat_skin, bevel=0.05)
        for s in (-1, 1):
            add_box(f"eye_{s}", (0.08, 0.04, 0.038), (s * 0.09, -0.18, 1.91), mat=mat_glow, bevel=0.004)
        add_box("helmet_crown", (0.41, 0.41, 0.22), (0, 0.01, 2.02), mat=mat_accent, bevel=0.03)

        # Hero-Specific Signature Sculpted Headgear, Cape, Wings & Heirloom
        if hid == "loki":
            for s in (-1, 1):
                add_cone(f"loki_horn_{s}", 0.065, 0.004, 0.56, (s * 0.16, -0.10, 2.30), rot=(0.32, s * 0.28, 0), vertices=10, mat=mat_accent)
            add_box("cloak", (0.64, 0.05, 1.22), (0, 0.22, 1.04), rot=(-0.12, 0, 0), mat=mat_armor, bevel=0.01)

        elif hid == "thor":
            for s in (-1, 1):
                add_box(f"helm_wing_{s}", (0.05, 0.26, 0.34), (s * 0.23, -0.02, 2.08), rot=(-0.35, 0, 0), mat=mat_accent, bevel=0.01)
            mat_cape = make_pbr_mat("thor_cape", (0.86, 0.14, 0.14), metallic=0.1, roughness=0.65)
            add_box("crimson_cape", (0.68, 0.05, 1.28), (0, 0.22, 1.02), rot=(-0.14, 0, 0), mat=mat_cape, bevel=0.01)
            # Mjölnir Hammer in Right Hand
            add_cyl("mjolnir_handle", 0.025, 0.34, (0.46, -0.34, 1.05), mat=mat_accent)
            add_box("mjolnir_head", (0.18, 0.28, 0.16), (0.46, -0.34, 1.22), mat=mat_glow, bevel=0.02)

        elif hid == "hades":
            for s in (-1, 1):
                add_cone(f"bident_spike_{s}", 0.06, 0.004, 0.48, (s * 0.14, 0, 2.28), vertices=8, mat=mat_glow)
            add_torus("soul_halo", 0.48, 0.032, (0, 0.22, 1.48), rot=(math.pi / 2, 0, 0), mat=mat_glow)

        elif hid == "zeus":
            for a in range(-2, 3):
                add_cone(f"sun_ray_{a}", 0.042, 0.003, 0.36, (a * 0.09, -0.04, 2.24), rot=(0, a * 0.22, 0), vertices=6, mat=mat_accent)
            add_torus("thunder_halo", 0.54, 0.036, (0, 0.21, 1.52), rot=(math.pi / 2, 0, 0), mat=mat_accent)

        elif hid == "hela":
            for idx in (-2, -1, 1, 2):
                add_cone(f"death_antler_{idx}", 0.048, 0.003, 0.62, (idx * 0.12, 0, 2.30), rot=(0, idx * 0.36, 0), vertices=8, mat=mat_dark)
            add_torus("necro_ring", 0.44, 0.028, (0, 0.20, 1.45), rot=(math.pi / 2, 0, 0), mat=mat_glow)

        elif hid == "valkyrie":
            for s in (-1, 1):
                for f in range(4):
                    add_box(
                        f"vtol_wing_{s}_{f}",
                        (0.68 - f * 0.11, 0.045, 0.11),
                        (s * (0.56 - f * 0.04), 0.22, 1.56 - f * 0.16),
                        rot=(0, -s * (0.32 - f * 0.11), 0),
                        mat=mat_accent if f % 2 == 0 else mat_glow,
                        bevel=0.01
                    )

        export_glb(f"hero_{hid}.glb")


# =============================================================================
# 3. GENERATE 5 SIGNATURE ASGARD PROPS & VEHICLES
# =============================================================================
def build_props():
    # 1. Golden Viking Bifrost Dropship
    clear_scene()
    mat_gold = make_pbr_mat("ship_gold", (0.96, 0.62, 0.04), metallic=0.92, roughness=0.18)
    mat_hull = make_pbr_mat("ship_hull", (0.12, 0.16, 0.23), metallic=0.80, roughness=0.28)
    mat_glow = make_pbr_mat("ship_glow", (0.22, 0.74, 0.97), metallic=0.1, roughness=0.1, emission_color=(0.22, 0.74, 0.97), emission_strength=4.0)

    add_box("hull_main", (6.2, 17.5, 2.6), (0, 0, 0), mat=mat_hull, bevel=0.35)
    add_cone("dragon_prow", 2.6, 0.2, 6.2, (0, -11.5, 1.2), rot=(math.pi / 2, 0, 0), vertices=8, mat=mat_gold)
    add_box("solar_wings", (16.5, 4.2, 0.35), (0, 0, 1.4), mat=mat_gold, bevel=0.08)
    for s in (-1, 1):
        add_cyl(f"engine_{s}", 1.25, 4.8, (s * 5.2, 7.2, 0.5), rot=(math.pi / 2, 0, 0), vertices=14, mat=mat_glow)
    export_glb("prop_dropship.glb")

    # 2. Odin Triangular Care Package Pod
    clear_scene()
    mat_gold = make_pbr_mat("pkg_gold", (0.96, 0.62, 0.04), metallic=0.92, roughness=0.18)
    mat_hull = make_pbr_mat("pkg_hull", (0.12, 0.16, 0.23), metallic=0.80, roughness=0.28)
    mat_red = make_pbr_mat("pkg_red", (0.96, 0.25, 0.37), metallic=0.3, roughness=0.2, emission_color=(0.96, 0.25, 0.37), emission_strength=3.0)
    add_cyl("pod_body", 1.35, 2.8, (0, 0, 1.4), vertices=3, mat=mat_hull, bevel=0.06)
    add_cone("pod_cap", 1.38, 0.1, 1.1, (0, 0, 3.35), vertices=3, mat=mat_gold)
    add_torus("pod_ring", 1.15, 0.08, (0, 0, 1.4), mat=mat_red)
    export_glb("prop_carepackage.glb")

    # 3. Apex Divine Supply Bin
    clear_scene()
    mat_gold = make_pbr_mat("bin_gold", (0.96, 0.62, 0.04), metallic=0.92, roughness=0.18)
    mat_hull = make_pbr_mat("bin_hull", (0.12, 0.16, 0.23), metallic=0.82, roughness=0.26)
    mat_cyan = make_pbr_mat("bin_cyan", (0.22, 0.74, 0.97), metallic=0.2, roughness=0.1, emission_color=(0.22, 0.74, 0.97), emission_strength=3.5)
    add_box("bin_base", (2.6, 1.4, 1.05), (0, 0, 0.52), mat=mat_hull, bevel=0.08)
    add_box("bin_lid", (2.66, 1.46, 0.35), (0, 0, 1.18), mat=mat_gold, bevel=0.07)
    add_box("bin_glow_strip", (2.25, 1.50, 0.12), (0, 0, 0.85), mat=mat_cyan, bevel=0.02)
    export_glb("prop_supplybin.glb")

    # 4. Dwarven Replicator Crafting Terminal
    clear_scene()
    mat_gold = make_pbr_mat("rep_gold", (0.96, 0.62, 0.04), metallic=0.92, roughness=0.18)
    mat_hull = make_pbr_mat("rep_hull", (0.10, 0.14, 0.22), metallic=0.85, roughness=0.24)
    mat_teal = make_pbr_mat("rep_teal", (0.18, 0.83, 0.75), metallic=0.1, roughness=0.1, emission_color=(0.18, 0.83, 0.75), emission_strength=3.8)
    add_cyl("rep_base", 1.65, 1.2, (0, 0, 0.6), vertices=6, mat=mat_hull, bevel=0.06)
    add_cyl("rep_pillar", 0.78, 2.8, (0, 0, 2.0), vertices=6, mat=mat_gold, bevel=0.05)
    add_torus("rep_ring", 1.15, 0.08, (0, 0, 1.35), mat=mat_teal)
    export_glb("prop_replicator.glb")


if __name__ == "__main__":
    build_weapons()
    build_heroes()
    build_props()
    print("[BLENDER] ALL 14 GLB ASSETS GENERATED SUCCESSFULLY!")
