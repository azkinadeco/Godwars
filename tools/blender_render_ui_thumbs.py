"""Render lobby UI thumbnails (weapons, bombs, hero portraits) from the game GLBs with Eevee.
  Blender -b --factory-startup -P tools/blender_render_ui_thumbs.py -- [weapons|bombs|heroes|all]
Writes transparent WEBP files to assets/ui/.
"""
import bpy, sys, os, math
from mathutils import Vector

ROOT = "/Users/apple/Documents/CODING/God Wars"
OUT = os.path.join(ROOT, "assets/ui")
os.makedirs(OUT, exist_ok=True)
ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["all"]
WHAT = ARGV[0]

WEAPONS = {"p90": (0.22, 0.74, 0.97), "kriss": (0.96, 0.25, 0.37), "m4a1": (0.98, 0.75, 0.14),
           "uzi": (0.18, 0.83, 0.75), "ak47": (0.98, 0.45, 0.09), "magnum": (0.75, 0.52, 0.99)}
BOMBS = {"solar": (0.98, 0.45, 0.09), "flash": (1.0, 0.94, 0.54), "arc": (0.22, 0.74, 0.97)}
HEROES = {"thor": (0.22, 0.74, 0.97), "loki": (0.06, 0.73, 0.5), "hades": (0.66, 0.33, 0.97),
          "zeus": (0.98, 0.8, 0.08), "hela": (0.08, 0.72, 0.65), "valkyrie": (0.98, 0.45, 0.09)}


def reset(res_x, res_y):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.eevee.use_gtao = True
    sc.eevee.gtao_distance = 0.3
    sc.eevee.use_soft_shadows = True
    sc.eevee.shadow_cube_size = '1024'
    sc.eevee.use_bloom = True
    sc.eevee.bloom_intensity = 0.02
    sc.eevee.taa_render_samples = 48
    sc.view_settings.view_transform = 'Filmic'
    sc.view_settings.look = 'Medium High Contrast'
    sc.render.film_transparent = True
    sc.render.resolution_x = res_x
    sc.render.resolution_y = res_y
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.quality = 86
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.32, 0.34, 0.4, 1)
    bg.inputs[1].default_value = 0.55
    return sc


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def bbox(objs):
    bpy.context.view_layer.update()
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            v = o.matrix_world @ Vector(c)
            mn = Vector((min(mn.x, v.x), min(mn.y, v.y), min(mn.z, v.z)))
            mx = Vector((max(mx.x, v.x), max(mx.y, v.y), max(mx.z, v.z)))
    return mn, mx


def light(sc, kind, loc, target, energy, color=(1, 1, 1), size=1.0):
    ld = bpy.data.lights.new(kind + str(len(bpy.data.lights)), kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.size = size
    lo = bpy.data.objects.new(ld.name, ld)
    lo.location = loc
    sc.collection.objects.link(lo)
    d = Vector(target) - Vector(loc)
    lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return lo


def camera(sc, loc, target, ortho=None, lens=50):
    cd = bpy.data.cameras.new("cam")
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho
    else:
        cd.lens = lens
    co = bpy.data.objects.new("cam", cd)
    co.location = loc
    sc.collection.objects.link(co)
    d = Vector(target) - Vector(loc)
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = co
    return co


def pose_idle(objs):
    for o in objs:
        if o.type == 'ARMATURE' and o.animation_data:
            acts = [a for a in bpy.data.actions if a.name.lower().startswith('idle')]
            if acts:
                for t in list(o.animation_data.nla_tracks):
                    o.animation_data.nla_tracks.remove(t)
                o.animation_data.action = acts[0]
    bpy.context.scene.frame_set(1)


def render(sc, name):
    sc.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print("WROTE", name)


def do_weapons():
    for wid, col in WEAPONS.items():
        sc = reset(480, 240)
        objs = import_glb(os.path.join(ROOT, f"assets/models/weapon_{wid}.glb"))
        mn, mx = bbox(objs)
        c = (mn + mx) / 2
        size = mx - mn
        # barrel runs along Blender Y (three -Z); view from +X so it points right
        span = max(size.y, size.z * 2.0) * 1.12
        camera(sc, (c.x + 10, c.y, c.z + 0.6), (c.x, c.y, c.z), ortho=span)
        light(sc, 'AREA', (c.x + 3, c.y - 1.5, c.z + 3), c, 600, (1, 0.95, 0.88), 3)
        light(sc, 'AREA', (c.x + 3, c.y + 2, c.z - 1), c, 220, (0.85, 0.9, 1.0), 3)
        light(sc, 'AREA', (c.x - 2, c.y + 2.5, c.z + 1.5), c, 420, col, 2)
        light(sc, 'AREA', (c.x - 2, c.y - 2.5, c.z - 0.5), c, 160, (0.6, 0.75, 1.0), 2)
        render(sc, f"wep_{wid}.webp")


def do_bombs():
    for bid, col in BOMBS.items():
        sc = reset(256, 256)
        objs = import_glb(os.path.join(ROOT, f"assets/models/bomb_{bid}.glb"))
        mn, mx = bbox(objs)
        c = (mn + mx) / 2
        size = max((mx - mn).x, (mx - mn).y, (mx - mn).z)
        camera(sc, (c.x + size * 2.2, c.y - size * 2.2, c.z + size * 1.5), c, ortho=size * 1.45)
        light(sc, 'AREA', (c.x + size * 3, c.y - size * 3, c.z + size * 4), c, 60 * size * size + 30, (1, 0.95, 0.9), size * 3)
        light(sc, 'AREA', (c.x - size * 3, c.y + size * 2, c.z + size * 1), c, 120 * size * size + 60, col, size * 3)
        render(sc, f"bomb_{bid}.webp")


def do_heroes():
    for hid, col in HEROES.items():
        sc = reset(256, 320)
        objs = import_glb(os.path.join(ROOT, f"assets/models/hero_{hid}.glb"))
        pose_idle(objs)
        mn, mx = bbox(objs)
        h = mx.z - mn.z
        cx = (mn.x + mx.x) / 2
        head = Vector((cx, (mn.y + mx.y) / 2, mn.z + h * 0.84))
        # hero faces three +Z == Blender -Y
        camera(sc, (head.x + 0.35, head.y - 3.2, head.z + 0.05), (head.x, head.y, head.z - 0.12), lens=110)
        light(sc, 'AREA', (head.x + 1.6, head.y - 2.2, head.z + 1.4), head, 140, (1, 0.93, 0.85), 1.6)
        light(sc, 'AREA', (head.x - 1.8, head.y + 1.4, head.z + 0.8), head, 320, col, 1.2)
        light(sc, 'AREA', (head.x + 1.8, head.y + 1.6, head.z + 0.4), head, 180, (0.55, 0.7, 1.0), 1.2)
        light(sc, 'AREA', (head.x - 1.4, head.y - 2.0, head.z - 0.6), head, 40, (0.7, 0.8, 1.0), 2)
        render(sc, f"hero_{hid}.webp")


if WHAT in ("weapons", "all"):
    do_weapons()
if WHAT in ("bombs", "all"):
    do_bombs()
if WHAT in ("heroes", "all"):
    do_heroes()
