"""
GOD WARS — stylized tree generator (Blender 3.6, run headless):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender_generate_trees.py

Outputs (meters, Z-up -> glTF Y-up):
  assets/models/prop_yggdrasil_tree.glb   ~42 m world-tree landmark
  assets/models/prop_asgard_tree.glb      ~9 m meadow tree

Trunk + branches: recursive skeleton -> Skin modifier (tapered radii) -> Subsurf.
Canopy: displaced icosphere clusters on branch tips, flat shaded, 3 leaf tones.
Everything is joined per material so each tree costs only 3-4 draw calls.
"""
import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, noise

OUT = "/Users/apple/Documents/CODING/God Wars/assets/models"


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, col, rough=0.85, metal=0.0, emit=None, emit_str=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = emit_str
    return m


def grow_skeleton(rng, base, direction, length, radius, depth, max_depth, verts, edges, radii, tips, parent_idx):
    """Recursive branch skeleton. Appends to verts/edges; records leaf tips."""
    segs = 3 if depth == 0 else 2
    prev = parent_idx
    pos = base.copy()
    d = direction.normalized()
    for s in range(segs):
        bend = Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(-0.05, 0.12)))
        d = (d + bend * (0.6 if depth else 0.25)).normalized()
        pos = pos + d * (length / segs)
        t = (s + 1) / segs
        r = radius * (1 - 0.45 * t)
        verts.append(pos.copy()); radii.append(r)
        idx = len(verts) - 1
        edges.append((prev, idx)); prev = idx
    if depth >= max_depth:
        tips.append((pos.copy(), radius))
        return
    n_children = rng.randint(2, 3) if depth else rng.randint(4, 5)
    for c in range(n_children):
        ang = (c / n_children) * math.tau + rng.uniform(-0.4, 0.4)
        spread = rng.uniform(0.55, 0.95) if depth == 0 else rng.uniform(0.4, 0.8)
        cd = Vector((math.cos(ang) * spread, math.sin(ang) * spread, 1.0 - spread * 0.35))
        grow_skeleton(rng, pos, cd, length * rng.uniform(0.58, 0.72), radius * 0.52, depth + 1, max_depth, verts, edges, radii, tips, prev)


def build_tree(name, height, trunk_r, canopy_r, depth, leaf_mats, bark_mat, seed, glow_mat=None, roots=5):
    rng = random.Random(seed)
    verts, edges, radii, tips = [Vector((0, 0, -0.4))], [], [trunk_r * 1.25], []
    # roots flaring outward from the base (sit slightly below ground so they never float)
    for i in range(roots):
        a = i / roots * math.tau + rng.uniform(-0.2, 0.2)
        p1 = Vector((math.cos(a) * trunk_r * 1.6, math.sin(a) * trunk_r * 1.6, 0.15 * height / 40))
        p2 = Vector((math.cos(a) * trunk_r * 3.2, math.sin(a) * trunk_r * 3.2, -0.6))
        verts += [p1, p2]; radii += [trunk_r * 0.55, trunk_r * 0.25]
        edges += [(0, len(verts) - 2), (len(verts) - 2, len(verts) - 1)]
    grow_skeleton(rng, Vector((0, 0, -0.4)), Vector((0, 0, 1)), height * 0.46, trunk_r, 0, depth, verts, edges, radii, tips, 0)

    me = bpy.data.meshes.new(name + "_bark")
    me.from_pydata([tuple(v) for v in verts], edges, [])
    trunk = bpy.data.objects.new(name + "_bark", me)
    bpy.context.collection.objects.link(trunk)
    bpy.context.view_layer.objects.active = trunk
    trunk.select_set(True)
    sk = trunk.modifiers.new("Skin", 'SKIN')
    for i, r in enumerate(radii):
        sv = me.skin_vertices[0].data[i]
        sv.radius = (r, r)
        sv.use_root = (i == 0)
    sub = trunk.modifiers.new("Sub", 'SUBSURF'); sub.levels = 1
    bpy.ops.object.modifier_apply(modifier="Skin")
    bpy.ops.object.modifier_apply(modifier="Sub")
    # bark ridges: displace along normals with noise
    bm = bmesh.new(); bm.from_mesh(trunk.data); bm.normal_update()
    for v in bm.verts:
        n = noise.noise(Vector((v.co.x * 1.7, v.co.y * 1.7, v.co.z * 0.35)) * (40.0 / height))
        v.co += v.normal * n * trunk_r * 0.12
    bm.to_mesh(trunk.data); bm.free()
    bpy.ops.object.shade_smooth()
    trunk.data.materials.append(bark_mat)
    trunk.select_set(False)

    # canopy clusters
    leaf_objs = {i: [] for i in range(len(leaf_mats))}
    glow_objs = []
    for (tip, r) in tips:
        for k in range(rng.randint(1, 2)):
            size = canopy_r * rng.uniform(0.26, 0.42)
            off = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.2, 0.8))) * size * 0.6
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size, location=tip + off)
            o = bpy.context.active_object
            o.scale = (1.0, 1.0, rng.uniform(0.62, 0.8))
            bpy.ops.object.transform_apply(scale=True)
            bm = bmesh.new(); bm.from_mesh(o.data); bm.normal_update()
            for v in bm.verts:
                w = noise.noise((v.co + tip) * (1.6 / size))
                v.co += v.normal * w * size * 0.28
            bm.to_mesh(o.data); bm.free()
            bpy.ops.object.shade_flat()
            leaf_objs[rng.randrange(len(leaf_mats))].append(o)
            o.select_set(False)
        if glow_mat and rng.random() < 0.35:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=canopy_r * 0.05, location=tip + Vector((0, 0, -canopy_r * 0.12)))
            g = bpy.context.active_object
            bpy.ops.object.shade_flat()
            glow_objs.append(g); g.select_set(False)

    def join(objs, m, nm):
        if not objs:
            return
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        j = bpy.context.active_object
        j.name = nm
        j.data.materials.clear()
        j.data.materials.append(m)
        bpy.ops.object.select_all(action='DESELECT')

    for i, objs in leaf_objs.items():
        join(objs, leaf_mats[i], f"{name}_leaves{i}")
    if glow_mat:
        join(glow_objs, glow_mat, f"{name}_glow")


def export(fn):
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, fn), export_format='GLB', export_apply=True)
    print("EXPORTED", fn)


def main():
    # Yggdrasil — the island landmark
    reset()
    bark = mat("ygg_bark", (0.11, 0.065, 0.04), 0.92)
    leaves = [mat("ygg_leaf_a", (0.05, 0.17, 0.045)), mat("ygg_leaf_b", (0.09, 0.24, 0.05)), mat("ygg_leaf_c", (0.16, 0.30, 0.06))]
    glow = mat("ygg_glow", (0.9, 0.62, 0.15), 0.4, 0.0, (1.0, 0.7, 0.2), 4.0)
    build_tree("ygg", height=42, trunk_r=4.4, canopy_r=22, depth=3, leaf_mats=leaves, bark_mat=bark, seed=7, glow_mat=glow, roots=7)
    export("prop_yggdrasil_tree.glb")

    # Meadow tree
    reset()
    bark = mat("tree_bark", (0.13, 0.08, 0.05), 0.9)
    leaves = [mat("tree_leaf_a", (0.06, 0.19, 0.05)), mat("tree_leaf_b", (0.11, 0.26, 0.06)), mat("tree_leaf_c", (0.22, 0.30, 0.07))]
    build_tree("tree", height=9, trunk_r=0.42, canopy_r=4.2, depth=2, leaf_mats=leaves, bark_mat=bark, seed=21, roots=4)
    export("prop_asgard_tree.glb")


main()
