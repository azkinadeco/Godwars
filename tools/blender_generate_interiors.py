"""
GOD WARS — INTERIOR FURNITURE KIT generator (Blender 3.6, headless)
====================================================================
Military / sci-fi-Norse industrial furniture for the enclosed compound buildings.

  int_table        int_workbench    int_lockers      int_shelf
  int_sofa         int_desk         int_bunk         int_rug
  int_ceiling_light int_wall_screen int_ammo_stack

Same conventions as tools/blender_generate_props.py (whose Kit class + preview stage are
reused verbatim): metres, front faces Blender -Y (-> glTF +Z), origin = footprint centre
on the floor (lowest point y = 0), back of wall-standing props at +Y (-> glTF -Z).
Materials are named kit_int_<prop>_<role>; emissive roles contain "glow".

Usage:
  Blender -b --factory-startup -P tools/blender_generate_interiors.py [-- names... --no-render]
Preview: /tmp/gw/interiors_preview/<name>.png and sheet.png
"""

import bpy
import math
import os
import sys
import random

HERE = os.path.dirname(os.path.abspath(__file__))
_src = open(os.path.join(HERE, 'blender_generate_props.py')).read()
_src = _src[:_src.rindex('\nmain()')]           # library only: Kit, helpers, preview stage
NS = {'__name__': 'gw_props_lib', '__file__': os.path.join(HERE, 'blender_generate_props.py')}
exec(compile(_src, 'blender_generate_props.py', 'exec'), NS)
Kit, V, setup_stage, render_prop = NS['Kit'], NS['V'], NS['setup_stage'], NS['render_prop']
NS['PREVIEW_DIR'] = PREVIEW_DIR = '/tmp/gw/interiors_preview'
OUT_DIR = NS['OUT_DIR']
ARGV = NS['ARGV']
DO_RENDER = '--no-render' not in ARGV
TAU = math.pi * 2


# One shared palette for the whole interior kit: every prop's roles resolve to these exact
# factors, so three.js materials with identical values merge into the same StaticBatcher bucket
# (batching keys on material values, not names) -> ~18 interior batches per 64 m cell instead of ~60.
SHARED = {
    'paint_steel': ((0.075, 0.085, 0.08), 0.15, 0.55),
    'paint_olive': ((0.12, 0.13, 0.07), 0.1, 0.55),
    'paint_teal':  ((0.06, 0.12, 0.13), 0.15, 0.55),
    'paint_rust':  ((0.16, 0.12, 0.06), 0.15, 0.55),
    'metal':       ((0.30, 0.31, 0.32), 0.82, 0.4),
    'dark_metal':  ((0.035, 0.037, 0.042), 0.6, 0.5),
    'trim_metal':  ((0.52, 0.36, 0.14), 0.9, 0.34),     # weathered bronze Norse trim
    'wood':        ((0.12, 0.07, 0.038), 0.0, 0.72),
    'cloth_red':   ((0.15, 0.045, 0.033), 0.0, 0.85),   # oxblood leather / rug field
    'cloth_dark':  ((0.045, 0.047, 0.052), 0.0, 0.9),
    'cloth_olive': ((0.16, 0.17, 0.12), 0.0, 0.9),
    'cloth_pale':  ((0.45, 0.43, 0.38), 0.0, 0.9),
    'card':        ((0.34, 0.24, 0.13), 0.0, 0.85),
    'mark':        ((0.55, 0.42, 0.12), 0.0, 0.75),     # stencils, name plates, rug pattern
    'glow_cyan':   ((0.3, 0.85, 1.0), 0.0, 0.3, (0.3, 0.85, 1.0)),
    'glow_amber':  ((1.0, 0.5, 0.12), 0.0, 0.3, (1.0, 0.5, 0.12)),
    'glow_white':  ((1.0, 0.92, 0.8), 0.0, 0.3, (1.0, 0.9, 0.74)),
    'glow_screen': ((0.04, 0.3, 0.4), 0.0, 0.3, (0.04, 0.34, 0.46)),
}


def use(k, **roles):
    """use(k, paint='paint_olive', glow='glow_cyan'): bind prop roles to shared palette entries."""
    for role, key in roles.items():
        spec = SHARED[key]
        k.mat(role, spec[0], spec[1], spec[2], emit=spec[3] if len(spec) > 3 else None)


def palette(k, body='paint_steel'):
    use(k, paint=body, metal='metal', dark_metal='dark_metal', trim_metal='trim_metal')


def legs4(k, w, d, h, t=0.05, mat='dark_metal', inset=0.06):
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box((sx * (w / 2 - inset), sy * (d / 2 - inset), h / 2), (t, t, h), mat, bev=0.006, seg=1)


# ============================================================================ props
def table():
    k = Kit('int_table')
    palette(k)
    use(k, wood='wood', glow='glow_cyan')
    W, D, H = 1.8, 0.86, 0.77
    # top: wood slab inside a bronze edge band
    k.box((0, 0, H - 0.025), (W - 0.04, D - 0.04, 0.05), 'wood', bev=0.008, seg=1)
    for sy in (-1, 1):
        k.box((0, sy * (D / 2 - 0.012), H - 0.03), (W, 0.03, 0.06), 'trim_metal', bev=0.006, seg=1)
    for sx in (-1, 1):
        k.box((sx * (W / 2 - 0.012), 0, H - 0.03), (0.03, D - 0.05, 0.06), 'trim_metal', bev=0.006, seg=1)
    # trestle frame: two A-ends + stretcher
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.18)
        k.box((x, 0, 0.03), (0.08, D - 0.1, 0.06), 'dark_metal', bev=0.008, seg=1)
        k.box((x, 0, H - 0.08), (0.07, D - 0.16, 0.05), 'dark_metal', bev=0)
        k.beam((x, -D / 2 + 0.1, 0.05), (x, -0.03, H - 0.09), 0.06, 0.06, 'dark_metal')
        k.beam((x, D / 2 - 0.1, 0.05), (x, 0.03, H - 0.09), 0.06, 0.06, 'dark_metal')
    k.box((0, 0, 0.32), (W - 0.36, 0.06, 0.06), 'dark_metal', bev=0.006, seg=1)
    # benches either side
    for sy in (-1, 1):
        y = sy * 0.7
        k.box((0, y, 0.44), (W - 0.15, 0.3, 0.045), 'wood', bev=0.008, seg=1)
        for sx in (-1, 1):
            k.box((sx * (W / 2 - 0.25), y, 0.21), (0.05, 0.22, 0.42), 'dark_metal', bev=0)
        k.box((0, y, 0.08), (W - 0.5, 0.04, 0.04), 'dark_metal', bev=0)
    # clutter: mugs, data-pad, ration tin
    for x, y in ((-0.55, -0.15), (0.32, 0.2)):
        k.cyl((x, y, H + 0.05), 0.04, 0.1, 'metal', n=8, bev=0)
    k.box((0.0, -0.12, H + 0.008), (0.26, 0.18, 0.016), 'dark_metal', bev=0, rot=(0, 0, 0.3))
    k.box((0.0, -0.12, H + 0.017), (0.22, 0.14, 0.004), 'glow', bev=0, rot=(0, 0, 0.3))
    k.box((0.62, 0.05, H + 0.05), (0.22, 0.14, 0.1), 'paint', bev=0.008, seg=1)
    return k


def workbench():
    k = Kit('int_workbench')
    palette(k, 'paint_olive')
    use(k, wood='wood', glow='glow_amber')
    W, D, H = 2.0, 0.76, 0.92
    k.box((0, 0, H - 0.03), (W, D, 0.06), 'wood', bev=0.01, seg=1)
    k.box((0, -D / 2 + 0.01, H - 0.035), (W + 0.01, 0.025, 0.07), 'trim_metal', bev=0.004, seg=1)
    # frame + lower shelf
    legs4(k, W, D, H - 0.06, 0.07, 'paint', 0.06)
    k.box((-0.25, 0, 0.18), (W - 0.62, D - 0.1, 0.03), 'dark_metal', bev=0)
    for sy in (-1, 1):
        k.box((-0.2, sy * (D / 2 - 0.06), 0.14), (W - 0.2, 0.04, 0.05), 'paint', bev=0)
    # drawer pedestal (right)
    px = W / 2 - 0.3
    k.box((px, 0, (H - 0.06) / 2), (0.5, D - 0.06, H - 0.06), 'paint', bev=0.012, seg=1)
    for i in range(3):
        z = 0.16 + i * 0.26
        k.box((px, -D / 2 + 0.02, z), (0.44, 0.02, 0.22), 'paint', bev=0.006, seg=1)
        k.box((px, -D / 2 + 0.002, z + 0.06), (0.2, 0.025, 0.025), 'metal', bev=0)
    # back riser (stays under the window sill)
    k.box((0, D / 2 - 0.02, H + 0.07), (W, 0.04, 0.14), 'paint', bev=0.006, seg=1)
    # vise
    vx = -W / 2 + 0.3
    k.box((vx, -0.18, H + 0.06), (0.2, 0.16, 0.12), 'dark_metal', bev=0.01, seg=1)
    k.box((vx, -0.3, H + 0.08), (0.18, 0.06, 0.12), 'dark_metal', bev=0.008, seg=1)
    k.cyl((vx, -0.42, H + 0.08), 0.012, 0.2, 'metal', axis='Y', n=6, bev=0)
    k.cyl((vx, -0.52, H + 0.08), 0.01, 0.16, 'metal', axis='X', n=6, bev=0)
    # toolbox
    k.box((0.25, 0.12, H + 0.1), (0.5, 0.24, 0.2), 'trim_metal', bev=0.012, seg=1)
    k.box((0.25, 0.12, H + 0.2), (0.52, 0.26, 0.012), 'dark_metal', bev=0)
    k.tube([(0.1, 0.12, H + 0.2), (0.12, 0.12, H + 0.27), (0.38, 0.12, H + 0.27), (0.4, 0.12, H + 0.2)], 0.012, 'metal', n=6)
    # hammer + wrench + glowing rune-forge chisel
    k.cyl((-0.3, -0.12, H + 0.018), 0.015, 0.34, 'wood', axis='X', n=6, bev=0, rot=(0, 0, 0.4))
    k.box((-0.15, -0.06, H + 0.025), (0.05, 0.12, 0.05), 'metal', bev=0.004, seg=1, rot=(0, 0, 0.4))
    k.box((-0.55, 0.05, H + 0.006), (0.26, 0.035, 0.012), 'metal', bev=0, rot=(0, 0, -0.3))
    k.cyl((0.0, -0.22, H + 0.015), 0.01, 0.22, 'glow', axis='X', n=6, bev=0, rot=(0, 0, 0.15))
    # parts bin on lower shelf
    k.box((-0.5, 0, 0.3), (0.45, 0.4, 0.22), 'paint', bev=0.01, seg=1)
    return k


def lockers():
    k = Kit('int_lockers')
    palette(k, 'paint_teal')
    use(k, label_paint='mark')
    N, CW, D, H = 3, 0.42, 0.5, 2.0
    W = N * CW
    k.box((0, 0, 0.05), (W - 0.02, D - 0.04, 0.1), 'dark_metal', bev=0.008, seg=1)    # plinth
    k.box((0, 0.02, 0.1 + (H - 0.16) / 2), (W, D - 0.04, H - 0.16), 'paint', bev=0.012, seg=1)
    k.box((0, 0, H - 0.03), (W + 0.03, D + 0.01, 0.06), 'trim_metal', bev=0.008, seg=1)   # bronze cap
    yf = -D / 2 + 0.01
    for i in range(N):
        x = -W / 2 + CW * (i + 0.5)
        k.box((x, yf, 1.0), (CW - 0.035, 0.025, 1.76), 'paint', bev=0.008, seg=1)          # door
        for j in range(4):                                                                   # vents
            k.box((x, yf - 0.014, 1.66 + j * 0.05), (CW - 0.14, 0.006, 0.018), 'dark_metal', bev=0)
            k.box((x, yf - 0.014, 0.3 + j * 0.05), (CW - 0.14, 0.006, 0.018), 'dark_metal', bev=0)
        k.box((x + CW / 2 - 0.07, yf - 0.02, 1.05), (0.03, 0.03, 0.16), 'metal', bev=0)     # handle
        k.box((x, yf - 0.016, 1.45), (0.14, 0.006, 0.05), 'label_paint', bev=0)             # name plate
    # bronze rune band across the doors
    k.box((0, yf - 0.018, 1.24), (W - 0.04, 0.006, 0.03), 'trim_metal', bev=0)
    # helmet + duffel on top
    k.lathe([(0, 0), (0.13, 0.0), (0.14, 0.06), (0.12, 0.13), (0.07, 0.18), (0, 0.19)], 'paint', n=10, c=(-0.3, 0.0, H))
    k.cyl((0.25, 0.02, H + 0.11), 0.11, 0.48, 'dark_metal', axis='X', n=10, bev=0.01, seg=1)
    return k


def shelf():
    k = Kit('int_shelf')
    palette(k, 'paint_rust')
    use(k, card='card', case_paint='paint_olive', glow='glow_cyan')
    W, D, H = 1.3, 0.5, 2.0
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box((sx * (W / 2 - 0.025), sy * (D / 2 - 0.025), H / 2), (0.05, 0.05, H), 'dark_metal', bev=0.005, seg=1)
    levels = (0.12, 0.66, 1.2, 1.74)
    for z in levels:
        k.box((0, 0, z), (W - 0.02, D - 0.02, 0.03), 'metal', bev=0)
        k.box((0, -D / 2 + 0.01, z - 0.02), (W, 0.025, 0.07), 'paint', bev=0.004, seg=1)
    k.beam((-W / 2 + 0.03, D / 2 - 0.02, 0.15), (W / 2 - 0.03, D / 2 - 0.02, 1.7), 0.025, 0.012, 'dark_metal')
    rng = random.Random(7)
    for li, z in enumerate(levels):
        x = -W / 2 + 0.06
        while True:
            kind = rng.choice(('card', 'card', 'case', 'can'))
            if kind == 'card':
                w, d, h = rng.uniform(0.25, 0.38), rng.uniform(0.28, 0.4), rng.uniform(0.18, 0.34)
            elif kind == 'case':
                w, d, h = 0.42, 0.34, 0.16
            else:
                w, d, h = 0.16, 0.16, 0.26
            if x + w > W / 2 - 0.05:
                break
            if li == 3:
                h = min(h, 0.22)
            cx = x + w / 2
            if kind == 'card':
                k.box((cx, 0.02, z + 0.015 + h / 2), (w, d, h), 'card', bev=0.006, seg=1, rot=(0, 0, rng.uniform(-0.08, 0.08)))
                k.box((cx, 0.02 - d / 2 - 0.001, z + 0.015 + h * 0.6), (w * 0.9, 0.002, 0.03), 'case_paint', bev=0)
            elif kind == 'case':
                k.box((cx, 0.02, z + 0.015 + h / 2), (w, d, h), 'case_paint', bev=0.012, seg=1)
                k.box((cx, 0.02 - d / 2 - 0.004, z + 0.015 + h * 0.6), (0.06, 0.01, 0.04), 'metal', bev=0)
                if rng.random() < 0.5:
                    k.box((cx + 0.12, 0.02 - d / 2 - 0.004, z + 0.015 + h * 0.35), (0.05, 0.006, 0.02), 'glow', bev=0)
            else:
                k.cyl((cx, 0.0, z + 0.015 + h / 2), 0.07, h, 'trim_metal', n=10, bev=0.006, seg=1)
            x += w + rng.uniform(0.02, 0.06)
    return k


def sofa():
    k = Kit('int_sofa')
    palette(k)
    use(k, cloth='cloth_red', dark_cloth='cloth_dark')
    W, D, H = 2.0, 0.86, 0.82
    # steel sled base + bronze kick strip
    k.box((0, 0.02, 0.12), (W - 0.12, D - 0.12, 0.12), 'dark_metal', bev=0.01, seg=1)
    k.box((0, -D / 2 + 0.07, 0.1), (W - 0.1, 0.02, 0.05), 'trim_metal', bev=0)
    for sx in (-1, 1):
        k.box((sx * (W / 2 - 0.15), -D / 2 + 0.12, 0.03), (0.08, 0.08, 0.06), 'metal', bev=0)
        k.box((sx * (W / 2 - 0.15), D / 2 - 0.12, 0.03), (0.08, 0.08, 0.06), 'metal', bev=0)
    # seat cushions
    for sx in (-1, 1):
        k.box((sx * 0.43, -0.06, 0.3), (0.84, 0.62, 0.2), 'cloth', bev=0.06, seg=3)
    # back cushions + frame
    k.box((0, D / 2 - 0.09, 0.5), (W - 0.2, 0.16, 0.62), 'dark_cloth', bev=0.03, seg=2)
    for sx in (-1, 1):
        k.box((sx * 0.43, D / 2 - 0.22, 0.6), (0.82, 0.16, 0.38), 'cloth', bev=0.06, seg=3, rot=(-0.18, 0, 0))
    # armrests: padded block + steel cap plate
    for sx in (-1, 1):
        x = sx * (W / 2 - 0.08)
        k.box((x, 0.02, 0.38), (0.16, D - 0.08, 0.5), 'dark_cloth', bev=0.03, seg=2)
        k.box((x, 0.02, 0.64), (0.18, D - 0.06, 0.03), 'trim_metal', bev=0.008, seg=1)
    # throw pillow
    k.box((0.6, 0.12, 0.52), (0.36, 0.12, 0.3), 'dark_cloth', bev=0.05, seg=2, rot=(-0.3, 0, 0.25))
    return k


def desk():
    k = Kit('int_desk')
    palette(k)
    use(k, cloth='cloth_dark', screen_glow='glow_screen', glow='glow_amber')
    W, D, H = 1.6, 0.74, 0.76
    yb = 0.1        # desk sits toward the wall; chair in front
    k.box((0, yb, H - 0.025), (W, D, 0.05), 'paint', bev=0.01, seg=1)
    k.box((0, yb - D / 2 + 0.008, H - 0.03), (W + 0.01, 0.02, 0.06), 'trim_metal', bev=0)
    # pedestal (left) + leg panel (right) + modesty panel
    k.box((-W / 2 + 0.24, yb, (H - 0.05) / 2), (0.44, D - 0.06, H - 0.05), 'paint', bev=0.01, seg=1)
    for i in range(3):
        k.box((-W / 2 + 0.24, yb - D / 2 + 0.02, 0.14 + i * 0.22), (0.4, 0.02, 0.19), 'dark_metal', bev=0)
        k.box((-W / 2 + 0.24, yb - D / 2 + 0.005, 0.2 + i * 0.22), (0.16, 0.02, 0.02), 'metal', bev=0)
    k.box((W / 2 - 0.04, yb, (H - 0.05) / 2), (0.05, D - 0.08, H - 0.05), 'paint', bev=0.006, seg=1)
    k.box((0.2, yb + D / 2 - 0.05, 0.42), (W - 0.6, 0.02, 0.5), 'dark_metal', bev=0)
    # twin monitors on a bar stand
    z0 = H
    k.box((0.05, yb + 0.2, z0 + 0.012), (0.24, 0.16, 0.024), 'dark_metal', bev=0.006, seg=1)
    k.box((0.05, yb + 0.24, z0 + 0.2), (0.05, 0.04, 0.38), 'dark_metal', bev=0)
    for sx, yaw in ((-1, -0.22), (1, 0.22)):
        cx = 0.05 + sx * 0.3
        c, s = math.cos(yaw), math.sin(yaw)
        k.box((cx, yb + 0.2 + sx * 0.03, z0 + 0.38), (0.58, 0.04, 0.36), 'dark_metal', bev=0.01, seg=1, rot=(0, 0, yaw))
        # screen face (slightly proud of the bezel, front = -Y)
        fx, fy = cx, yb + 0.2 + sx * 0.03
        k.box((fx + s * 0.021, fy - c * 0.021, z0 + 0.39), (0.53, 0.004, 0.31), 'screen_glow', bev=0, rot=(0, 0, yaw))
    # keyboard + puck + status LED
    k.box((0.05, yb - 0.15, z0 + 0.012), (0.46, 0.15, 0.022), 'dark_metal', bev=0.005, seg=1)
    k.box((0.05, yb - 0.15, z0 + 0.024), (0.42, 0.11, 0.004), 'metal', bev=0)
    k.box((-0.45, yb + 0.05, z0 + 0.06), (0.16, 0.24, 0.12), 'dark_metal', bev=0.01, seg=1)
    k.box((-0.45, yb - 0.072, z0 + 0.08), (0.08, 0.004, 0.012), 'glow', bev=0)
    # swivel chair, pulled out in front
    cy = yb - 0.62
    for i in range(5):
        a = TAU * i / 5 + 0.3
        k.beam((0, cy, 0.05), (math.cos(a) * 0.28, cy + math.sin(a) * 0.28, 0.035), 0.04, 0.03, 'dark_metal')
        k.cyl((math.cos(a) * 0.28, cy + math.sin(a) * 0.28, 0.02), 0.022, 0.04, 'dark_metal', axis='X', n=6, bev=0)
    k.cyl((0, cy, 0.25), 0.025, 0.36, 'metal', n=8, bev=0)
    k.box((0, cy, 0.46), (0.48, 0.46, 0.08), 'cloth', bev=0.03, seg=2)
    k.box((0, cy - 0.23, 0.78), (0.44, 0.07, 0.5), 'cloth', bev=0.03, seg=2, rot=(0.12, 0, 0))
    k.box((0, cy - 0.2, 0.52), (0.06, 0.04, 0.16), 'dark_metal', bev=0)
    return k


def bunk():
    k = Kit('int_bunk')
    palette(k, 'paint_olive')
    use(k, cloth='cloth_olive', pale_cloth='cloth_pale')
    L, D, H = 2.0, 0.92, 1.76
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box((sx * (L / 2 - 0.03), sy * (D / 2 - 0.03), H / 2), (0.055, 0.055, H), 'paint', bev=0.008, seg=1)
            k.box((sx * (L / 2 - 0.03), sy * (D / 2 - 0.03), H + 0.015), (0.07, 0.07, 0.03), 'trim_metal', bev=0.006, seg=1)
    for z in (0.32, 1.22):
        for sy in (-1, 1):
            k.box((0, sy * (D / 2 - 0.03), z), (L - 0.06, 0.04, 0.08), 'paint', bev=0.005, seg=1)
        for sx in (-1, 1):
            k.box((sx * (L / 2 - 0.03), 0, z), (0.04, D - 0.06, 0.08), 'paint', bev=0.005, seg=1)
        k.box((0, 0, z + 0.03), (L - 0.1, D - 0.1, 0.02), 'dark_metal', bev=0)
        # mattress + blanket + pillow
        k.box((0, 0, z + 0.1), (L - 0.12, D - 0.12, 0.13), 'pale_cloth', bev=0.04, seg=2)
        k.box((-0.18, 0, z + 0.115), (L - 0.5, D - 0.08, 0.13), 'cloth', bev=0.04, seg=2)
        k.box((L / 2 - 0.28, 0, z + 0.2), (0.34, D - 0.32, 0.1), 'pale_cloth', bev=0.04, seg=2)
    # head/foot guard bars on top bunk, ladder at the foot end (front side)
    for sx in (-1, 1):
        k.box((sx * (L / 2 - 0.03), 0, 1.5), (0.04, D - 0.06, 0.04), 'paint', bev=0)
    k.box((0.1, -D / 2 + 0.03, 1.48), (L - 0.6, 0.04, 0.04), 'paint', bev=0)
    lx = -L / 2 + 0.25
    for dx in (-0.17, 0.17):
        k.box((lx + dx, -D / 2 - 0.02, 0.75), (0.04, 0.035, 1.5), 'metal', bev=0)
    for z in (0.5, 0.8, 1.1):
        k.cyl((lx, -D / 2 - 0.02, z), 0.016, 0.34, 'metal', axis='X', n=6, bev=0)
    # footlocker under the bunk
    k.box((0.2, 0.02, 0.13), (0.8, 0.5, 0.24), 'dark_metal', bev=0.012, seg=1)
    k.box((0.2, -0.235, 0.17), (0.12, 0.02, 0.06), 'trim_metal', bev=0)
    return k


def rug():
    k = Kit('int_rug')
    use(k, cloth='cloth_red', dark_cloth='cloth_dark', pattern_cloth='mark')
    W, D, T = 2.8, 1.8, 0.012
    k.box((0, 0, T / 2), (W, D, T), 'dark_cloth', bev=0.004, seg=1)
    k.box((0, 0, T + 0.001), (W - 0.24, D - 0.24, 0.002), 'cloth', bev=0)
    zz = T + 0.003
    for inset in (0.16, 0.3):
        for sy in (-1, 1):
            k.box((0, sy * (D / 2 - inset), zz), (W - 2 * inset, 0.035, 0.002), 'pattern_cloth', bev=0)
        for sx in (-1, 1):
            k.box((sx * (W / 2 - inset), 0, zz), (0.035, D - 2 * inset, 0.002), 'pattern_cloth', bev=0)
    # central knotwork diamond + rune ticks
    pts = [(0, -0.45), (0.7, 0), (0, 0.45), (-0.7, 0), (0, -0.45)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        k.beam((x0, y0, zz), (x1, y1, zz), 0.05, 0.002, 'pattern_cloth')
    for i in range(8):
        x = -W / 2 + 0.55 + i * (W - 1.1) / 7
        k.box((x, 0, zz), (0.03, 0.18, 0.002), 'pattern_cloth', bev=0, rot=(0, 0, 0.5 if i % 2 else -0.5))
    return k


def ceiling_light():
    k = Kit('int_ceiling_light')
    use(k, metal='metal', trim_metal='trim_metal', glow='glow_white')
    W, D, H = 1.5, 0.46, 0.13
    k.box((0, 0, H / 2 + 0.02), (W, D, H - 0.02), 'metal', bev=0.015, seg=1)
    k.box((0, 0, 0.01), (W - 0.12, D - 0.12, 0.02), 'glow', bev=0)
    for sx in (-1, 1):
        k.box((sx * (W / 2 + 0.01), 0, H / 2 + 0.02), (0.03, D + 0.02, H - 0.01), 'trim_metal', bev=0.005, seg=1)
    for x in (-0.25, 0.25):
        k.box((x, 0, 0.008), (0.03, D - 0.1, 0.018), 'metal', bev=0)    # diffuser ribs
    return k


def wall_screen():
    k = Kit('int_wall_screen')
    use(k, dark_metal='dark_metal', trim_metal='trim_metal', screen_glow='cloth_dark', glow='glow_cyan', alert_glow='glow_amber')
    W, D, H = 1.9, 0.07, 1.1
    yb = 0.0
    k.box((0, yb, H / 2), (W, D, H), 'dark_metal', bev=0.012, seg=1)
    k.box((0, yb - D / 2 - 0.001, H / 2 + 0.02), (W - 0.12, 0.004, H - 0.2), 'screen_glow', bev=0)
    yf = yb - D / 2 - 0.004
    # island coastline + grid of the realm (glow lines)
    rng = random.Random(3)
    ring = []
    for i in range(14):
        a = TAU * i / 14
        r = 0.36 + rng.uniform(-0.06, 0.06)
        ring.append((math.cos(a) * r * 1.9, math.sin(a) * r + H / 2 + 0.02))
    ring.append(ring[0])
    for (x0, z0), (x1, z1) in zip(ring, ring[1:]):
        k.beam((x0, yf, z0), (x1, yf, z1), 0.012, 0.003, 'glow')
    for x in (-0.6, -0.3, 0, 0.3, 0.6):
        k.box((x, yf + 0.001, H / 2 + 0.02), (0.004, 0.003, H - 0.26), 'screen_glow', bev=0)
    for (mx, mz) in ((-0.35, 0.68), (0.42, 0.42), (0.1, 0.6)):
        k.box((mx, yf - 0.002, mz), (0.05, 0.003, 0.05), 'alert_glow', bev=0, rot=(0, 0.785, 0))
    # side status bars + header strip
    for i in range(5):
        k.box((W / 2 - 0.16, yf, 0.25 + i * 0.1), (0.1 - i * 0.012, 0.003, 0.04), 'glow' if i < 3 else 'alert_glow', bev=0)
    k.box((-0.4, yf, H - 0.16), (0.8, 0.003, 0.03), 'glow', bev=0)
    # bronze Norse corner brackets
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (W / 2 - 0.02), H / 2 + sz * (H / 2 - 0.02)
            k.box((x - sx * 0.1, yb - D / 2 - 0.006, z), (0.22, 0.012, 0.04), 'trim_metal', bev=0)
            k.box((x, yb - D / 2 - 0.006, z - sz * 0.1), (0.04, 0.012, 0.22), 'trim_metal', bev=0)
    return k


def ammo_stack():
    k = Kit('int_ammo_stack')
    palette(k, 'paint_olive')
    use(k, mark_paint='mark')

    def case(c, w, d, h, yaw=0.0):
        cx, cy, cz = c
        ca, sa = math.cos(yaw), math.sin(yaw)
        k.box((cx, cy, cz + h / 2), (w, d, h), 'paint', bev=0.012, seg=1, rot=(0, 0, yaw))
        k.box((cx, cy, cz + h - 0.04), (w + 0.012, d + 0.012, 0.025), 'dark_metal', bev=0, rot=(0, 0, yaw))
        # front stencil band + latch (front = -Y in local frame)
        fx, fy = cx + sa * (d / 2 + 0.003), cy - ca * (d / 2 + 0.003)
        k.box((fx, fy, cz + h * 0.42), (w * 0.55, 0.004, 0.035), 'mark_paint', bev=0, rot=(0, 0, yaw))
        k.box((fx, fy, cz + h - 0.07), (0.06, 0.012, 0.05), 'metal', bev=0, rot=(0, 0, yaw))
        for s in (-1, 1):
            hx, hy = cx + ca * s * (w / 2 + 0.01), cy + sa * s * (w / 2 + 0.01)
            k.box((hx, hy, cz + h * 0.6), (0.02, 0.1, 0.03), 'metal', bev=0, rot=(0, 0, yaw))

    case((-0.25, 0, 0), 0.48, 0.6, 0.32)
    case((0.25, 0, 0), 0.48, 0.6, 0.32)
    case((0, 0.03, 0.32), 0.9, 0.42, 0.28, 0.05)
    case((0.08, -0.02, 0.6), 0.5, 0.32, 0.24, -0.25)
    return k


BUILDERS = {
    'table': table, 'workbench': workbench, 'lockers': lockers, 'shelf': shelf, 'sofa': sofa,
    'desk': desk, 'bunk': bunk, 'rug': rug, 'ceiling_light': ceiling_light,
    'wall_screen': wall_screen, 'ammo_stack': ammo_stack,
}
ONLY = [a for a in ARGV if a in BUILDERS] or list(BUILDERS)


def make_sheet(names):
    import numpy as np
    tw, th, cols = 400, 300, 4
    rows = (len(names) + cols - 1) // cols
    H = rows * th
    sheet = np.zeros((H, 1600, 4), dtype=np.float32)
    sheet[..., 3] = 1
    for i, n in enumerate(names):
        p = os.path.join(PREVIEW_DIR, f'int_{n}.png')
        if not os.path.exists(p):
            continue
        im = bpy.data.images.load(p)
        w, h = im.size
        a = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        a = a.reshape(h, w, 4)
        a = a[:h // 2 * 2, :w // 2 * 2].reshape(h // 2, 2, w // 2, 2, 4).mean(axis=(1, 3))
        r, cc = divmod(i, cols)
        y0 = H - (r + 1) * th
        sheet[y0:y0 + th, cc * tw:(cc + 1) * tw] = a[:th, :tw]
        bpy.data.images.remove(im)
    out = bpy.data.images.new('sheet', 1600, H, alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(PREVIEW_DIR, 'sheet.png')
    out.file_format = 'PNG'
    out.save()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam = None
    if DO_RENDER:
        cam, _ = setup_stage()
    report = []
    for name in ONLY:
        kit = BUILDERS[name]()
        tris, mn, mx = kit.finalize()
        for o in bpy.context.scene.objects:
            o.select_set(o in kit.objs)
        bpy.context.view_layer.objects.active = kit.objs[0]
        path = os.path.join(OUT_DIR, f'int_{name}.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                                  use_selection=True, export_normals=True, export_tangents=False,
                                  export_cameras=False, export_lights=False)
        line = (f'[INTERIORS] int_{name}: {tris} tris, mats {len(kit.objs)}, '
                f'x[{mn.x:.2f},{mx.x:.2f}] z[{-mx.y:.2f},{-mn.y:.2f}] h {mx.z:.2f}')
        report.append(line)
        print(line)
        if DO_RENDER:
            render_prop(kit, cam, mn, mx)
        for o in kit.objs:
            bpy.data.objects.remove(o, do_unlink=True)
    if DO_RENDER:
        make_sheet(list(BUILDERS))
    print('\n'.join(report))


main()
