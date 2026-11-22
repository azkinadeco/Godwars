import bpy
import os
import math

OUT_DIR = "/Users/apple/Documents/CODING/God Wars/assets/models"
os.makedirs(OUT_DIR, exist_ok=True)

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def make_mat(name, color, metallic=0.8, roughness=0.25, emissive=None, em_strength=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emissive and "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*emissive, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = em_strength
    return mat

def export_glb(filename):
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB')
    print("EXPORTED:", path)

# 1. FIRST-PERSON ARMORED GOD GAUNTLET ARMS (viewmodel_god_arms.glb)
clear_scene()
mat_gold = make_mat("AsgardGold", (0.96, 0.65, 0.14), 0.92, 0.18)
mat_dark = make_mat("AsgardDark", (0.10, 0.14, 0.22), 0.78, 0.32)
mat_cyan = make_mat("BifrostCyan", (0.22, 0.74, 0.97), 0.4, 0.15, (0.22, 0.74, 0.97), 2.2)

for side in (-1, 1):
    # Forearm bracer
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.055, depth=0.34, location=(side * 0.14, 0.16, -0.09), rotation=(math.radians(72), 0, side * math.radians(-14)))
    bracer = bpy.context.active_object
    bracer.data.materials.append(mat_dark)

    # Golden gauntlet cuff
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.062, depth=0.12, location=(side * 0.12, 0.04, -0.05), rotation=(math.radians(72), 0, side * math.radians(-14)))
    cuff = bpy.context.active_object
    cuff.data.materials.append(mat_gold)

    # Glowing rune strip on gauntlet
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.12, 0.04, -0.01))
    rune = bpy.context.active_object
    rune.scale = (0.018, 0.09, 0.018)
    rune.data.materials.append(mat_cyan)

    # Armored glove fist
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.052, location=(side * 0.09, -0.06, -0.02))
    glove = bpy.context.active_object
    glove.data.materials.append(mat_gold)

export_glb("viewmodel_god_arms.glb")

# 2. 3D APEX SHIELD BATTERY (item_shield_battery.glb)
clear_scene()
mat_gold = make_mat("BatGold", (0.96, 0.65, 0.14), 0.9, 0.2)
mat_dark = make_mat("BatDark", (0.08, 0.12, 0.20), 0.85, 0.25)
mat_cyan = make_mat("BatCore", (0.15, 0.75, 0.98), 0.2, 0.1, (0.15, 0.75, 0.98), 3.0)

bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.08, depth=0.32, location=(0, 0, 0))
core = bpy.context.active_object
core.data.materials.append(mat_cyan)

for z_off in (-0.13, 0.13):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.095, depth=0.06, location=(0, 0, z_off))
    cap = bpy.context.active_object
    cap.data.materials.append(mat_dark)

bpy.ops.mesh.primitive_torus_add(major_radius=0.055, minor_radius=0.012, location=(0, 0, 0.19))
ring = bpy.context.active_object
ring.data.materials.append(mat_gold)

export_glb("item_shield_battery.glb")

# 3. 3D ASGARD MEDKIT INJECTOR (item_medkit.glb)
clear_scene()
mat_em = make_mat("MedEmerald", (0.06, 0.72, 0.50), 0.3, 0.15, (0.06, 0.72, 0.50), 2.5)
mat_dark = make_mat("MedCase", (0.10, 0.15, 0.22), 0.8, 0.25)
mat_gold = make_mat("MedGold", (0.96, 0.75, 0.18), 0.9, 0.2)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
box = bpy.context.active_object
box.scale = (0.14, 0.09, 0.18)
box.data.materials.append(mat_dark)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.05, 0))
cross1 = bpy.context.active_object
cross1.scale = (0.08, 0.015, 0.025)
cross1.data.materials.append(mat_em)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.05, 0))
cross2 = bpy.context.active_object
cross2.scale = (0.025, 0.015, 0.08)
cross2.data.materials.append(mat_em)

export_glb("item_medkit.glb")
