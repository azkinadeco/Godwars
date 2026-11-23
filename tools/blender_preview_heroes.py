"""Render hero GLB previews (Eevee).
  Blender -b --factory-startup -P tools/blender_preview_heroes.py -- lineup|close:<id>|face:<id>|lobby:<id>|run:<id>|side:<id>|back:<id>|full:<id> [anim] [frame] [outfile]
"""
import bpy, sys, os, math
from mathutils import Vector

ROOT = "/Users/apple/Documents/CODING/God Wars"
OUT = "/tmp/gw/heroes_preview"
os.makedirs(OUT, exist_ok=True)
ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["lineup"]
MODE = ARGV[0]
ANIM = ARGV[1] if len(ARGV) > 1 else "Idle"
FRAME = int(ARGV[2]) if len(ARGV) > 2 else 1
OUTFILE = ARGV[3] if len(ARGV) > 3 else None
IDS = ["thor", "loki", "hades", "zeus", "hela", "valkyrie"]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.eevee.use_gtao = True
sc.eevee.use_soft_shadows = True
sc.eevee.shadow_cube_size = '2048'
sc.eevee.shadow_cascade_size = '2048'
sc.eevee.use_bloom = True
sc.eevee.bloom_intensity = 0.03
sc.view_settings.view_transform = 'Filmic'
sc.view_settings.look = 'Medium High Contrast'
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.16, 0.17, 0.2, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.6


def load(hid, x, anim, frame):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, f"assets/models/hero_{hid}.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    for r in roots:
        r.location.x += x
    for o in new:
        if o.type == 'ARMATURE':
            o.animation_data_create()
            act = None
            for a in bpy.data.actions:
                if a.name.split("_")[0] == anim or a.name.startswith(anim):
                    if hid in a.name or act is None:
                        act = a
            cand = [a for a in bpy.data.actions if a.name.startswith(anim) and a not in USED]
            if cand:
                act = cand[0]
                USED.add(act)
            for t in list(o.animation_data.nla_tracks):
                o.animation_data.nla_tracks.remove(t)
            o.animation_data.action = act
    return new


USED = set()


def add_light(kind, loc, energy, size=1.0, rot=None, color=(1, 1, 1)):
    ld = bpy.data.lights.new(kind, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.size = size
    lo = bpy.data.objects.new(kind, ld)
    lo.location = loc
    sc.collection.objects.link(lo)
    tgt = Vector((loc[0] * 0, 0, 1.0))
    d = tgt - Vector(loc)
    lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return lo


def camera(loc, target, lens=50):
    cd = bpy.data.cameras.new("cam")
    cd.lens = lens
    co = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(co)
    co.location = loc
    d = Vector(target) - Vector(loc)
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = co
    return co


bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
floor = bpy.context.active_object
fm = bpy.data.materials.new("floor")
fm.use_nodes = True
fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.09, 0.095, 0.11, 1)
fm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.6
floor.data.materials.append(fm)

if MODE == "lineup":
    sp = 1.05
    for i, hid in enumerate(IDS):
        load(hid, (i - 2.5) * sp, ANIM, FRAME)
    sc.frame_set(FRAME)
    add_light('AREA', (3.5, -5, 5), 1100, 5)
    add_light('AREA', (-5, -3, 3), 500, 4, color=(0.8, 0.88, 1))
    add_light('AREA', (0, 5, 4), 900, 6, color=(1, 0.92, 0.85))
    camera((2.2, -8.2, 1.55), (0.15, 0, 0.98), lens=48)
    sc.render.resolution_x, sc.render.resolution_y = 1400, 700
else:
    kind, hid = MODE.split(":")
    load(hid, 0, ANIM, FRAME)
    sc.frame_set(FRAME)
    add_light('AREA', (2.5, -3.5, 3.5), 450, 3)
    add_light('AREA', (-3, -2, 2.5), 220, 3, color=(0.8, 0.88, 1))
    add_light('AREA', (0, 3.5, 3), 600, 4, color=(1, 0.92, 0.85))
    if kind == "close":
        camera((0.9, -2.6, 1.6), (0, 0, 1.45), lens=60)
        sc.render.resolution_x, sc.render.resolution_y = 900, 900
    elif kind == "face":
        camera((0.28, -1.15, 1.76), (0, 0, 1.72), lens=70)
        sc.render.resolution_x, sc.render.resolution_y = 700, 700
    elif kind == "lobby":
        camera((0.0, -4.0, 1.3), (0, 0, 1.05), lens=50)
        sc.render.resolution_x, sc.render.resolution_y = 700, 900
    elif kind == "run":
        camera((2.6, -2.6, 1.2), (0, 0, 0.9), lens=45)
        sc.render.resolution_x, sc.render.resolution_y = 900, 900
    elif kind == "side":
        camera((3.6, 0, 1.0), (0, 0, 0.95), lens=45)
        sc.render.resolution_x, sc.render.resolution_y = 800, 900
    elif kind == "back":
        camera((-1.2, 3.4, 1.4), (0, 0, 1.0), lens=45)
        sc.render.resolution_x, sc.render.resolution_y = 800, 900
    elif kind == "full":
        camera((1.3, -3.6, 1.2), (0, 0, 0.95), lens=45)
        sc.render.resolution_x, sc.render.resolution_y = 800, 900
sc.render.film_transparent = False
sc.eevee.taa_render_samples = 32
name = OUTFILE or (("lineup" if MODE == "lineup" else MODE.replace(":", "_")) + ".png")
sc.render.filepath = os.path.join(OUT, name)
bpy.ops.render.render(write_still=True)
print("RENDERED", sc.render.filepath)
