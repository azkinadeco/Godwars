"""
GOD WARS — WEAPON GENERATOR v2 (Blender 3.6, headless)
=======================================================
Builds the six hero-shooter weapon GLBs with real hard-surface anatomy:
  weapon_m4a1 (Odin Carbine)   modular carbine
  weapon_ak47 (Surtr Wrath)    heavy battle rifle, curved mag, lava vents
  weapon_p90  (Heimdall PDW)   bullpup PDW
  weapon_kriss(Fenrir Fang)    boxy SMG, raked mag well
  weapon_uzi  (Zephyr Micro)   compact machine pistol, mag-in-grip
  weapon_magnum(Gungnir Cannon) heavy revolver

Conventions (game / glTF space): X right, Y up, muzzle toward -Z, meters.
Blender space is (x, -z, y); export_yup converts back.
Every gun keeps the old grip anchors, muzzle tip and the optic sight line
(reticle at y 0.13, z 0.01) so the JS hands / ADS / muzzle flash still line up.
Materials per gun (<=5): {id}_metal, {id}_polymer, {id}_gold, {id}_glow, {id}_glass.

Usage:
  Blender -b --factory-startup -P tools/blender_generate_weapons_v2.py [-- ids... --no-render --out DIR]
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = os.path.join(ROOT, 'assets', 'models')
if '--out' in ARGV:
    OUT_DIR = ARGV[ARGV.index('--out') + 1]
PREVIEW_DIR = '/tmp/gw/weapons_preview'
DO_RENDER = '--no-render' not in ARGV
ALL_IDS = ['m4a1', 'ak47', 'p90', 'kriss', 'uzi', 'magnum']
ONLY = [a for a in ARGV if a in ALL_IDS] or ALL_IDS

SIGHT_Y = 0.13   # reticle centre (ADS line)
SIGHT_Z = 0.01


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def V(x, y, z):
    return Vector((x, -z, y))


# ----------------------------------------------------------------------------- 2D helpers
def rrect(cx, cy, w, h, r, n=3):
    """Rounded rectangle, CCW, 4*(n+1) points."""
    pts = []
    corners = [(cx + w / 2 - r, cy + h / 2 - r, 0), (cx - w / 2 + r, cy + h / 2 - r, 90),
               (cx - w / 2 + r, cy - h / 2 + r, 180), (cx + w / 2 - r, cy - h / 2 + r, 270)]
    for ox, oy, a0 in corners:
        for i in range(n + 1):
            a = math.radians(a0 + 90.0 * i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def circle(cx, cy, r, n=16, a0=0.0):
    return [(cx + r * math.cos(a0 + 2 * math.pi * i / n), cy + r * math.sin(a0 + 2 * math.pi * i / n)) for i in range(n)]


def fluted(cx, cy, r, n, depth, land=0.45):
    pts = []
    step = 2 * math.pi / n
    for k in range(n):
        a = k * step
        hl = step * land / 2
        pts.append((cx + r * math.cos(a - hl), cy + r * math.sin(a - hl)))
        pts.append((cx + r * math.cos(a + hl), cy + r * math.sin(a + hl)))
        fa = a + step / 2
        fr = r - depth
        pts.append((cx + fr * math.cos(fa - step * 0.18), cy + fr * math.sin(fa - step * 0.18)))
        pts.append((cx + fr * math.cos(fa + step * 0.18), cy + fr * math.sin(fa + step * 0.18)))
    # reorder so they are CCW monotonic: land(a-hl), land(a+hl), flute(fa-.), flute(fa+.)
    return pts


def chaikin(pts, it=1):
    """Corner cutting; points given as (a,b) or (a,b,'s') (sharp, kept)."""
    for _ in range(it):
        out = []
        n = len(pts)
        for i in range(n):
            p = pts[i]
            if len(p) > 2:
                out.append(p)
                continue
            a = pts[i - 1]
            b = pts[(i + 1) % n]
            out.append((0.75 * p[0] + 0.25 * a[0], 0.75 * p[1] + 0.25 * a[1]))
            out.append((0.75 * p[0] + 0.25 * b[0], 0.75 * p[1] + 0.25 * b[1]))
        pts = out
    return [(p[0], p[1]) for p in pts]


def bar_poly(path, t):
    """Thick polyline -> closed polygon (miter joints)."""
    n = len(path)
    segn = []
    for i in range(n - 1):
        dz = path[i + 1][0] - path[i][0]
        dy = path[i + 1][1] - path[i][1]
        L = math.hypot(dz, dy) or 1
        segn.append((-dy / L, dz / L))
    left, right = [], []
    for i in range(n):
        if i == 0:
            nn = segn[0]; s = 1
        elif i == n - 1:
            nn = segn[-1]; s = 1
        else:
            a, b = segn[i - 1], segn[i]
            nn = (a[0] + b[0], a[1] + b[1])
            L = math.hypot(*nn) or 1
            nn = (nn[0] / L, nn[1] / L)
            s = 1.0 / max(0.35, nn[0] * a[0] + nn[1] * a[1])
        left.append((path[i][0] + nn[0] * t / 2 * s, path[i][1] + nn[1] * t / 2 * s))
        right.append((path[i][0] - nn[0] * t / 2 * s, path[i][1] - nn[1] * t / 2 * s))
    return left + right[::-1]


def curve_at(curve, y):
    """curve: list of (z,y) monotonic in y; returns z at y."""
    for i in range(len(curve) - 1):
        (z0, y0), (z1, y1) = curve[i], curve[i + 1]
        if (y0 - y) * (y1 - y) <= 0 and y0 != y1:
            t = (y - y0) / (y1 - y0)
            return z0 + (z1 - z0) * t
    return curve[-1][0]


RUNES = {
    'fehu': [((0.2, 0), (0.2, 1)), ((0.2, 0.62), (0.8, 0.92)), ((0.2, 0.32), (0.8, 0.62))],
    'thurs': [((0.25, 0), (0.25, 1)), ((0.25, 0.78), (0.8, 0.5)), ((0.8, 0.5), (0.25, 0.22))],
    'algiz': [((0.5, 0), (0.5, 1)), ((0.5, 0.5), (0.1, 0.95)), ((0.5, 0.5), (0.9, 0.95))],
    'tiwaz': [((0.5, 0), (0.5, 1)), ((0.5, 1), (0.12, 0.62)), ((0.5, 1), (0.88, 0.62))],
    'kaun': [((0.75, 1), (0.2, 0.5)), ((0.2, 0.5), (0.75, 0))],
    'sowilo': [((0.75, 1), (0.25, 0.62)), ((0.25, 0.62), (0.75, 0.38)), ((0.75, 0.38), (0.25, 0))],
    'naud': [((0.5, 0), (0.5, 1)), ((0.15, 0.7), (0.85, 0.3))],
    'ingwaz': [((0.5, 0), (0.1, 0.5)), ((0.1, 0.5), (0.5, 1)), ((0.5, 1), (0.9, 0.5)), ((0.9, 0.5), (0.5, 0))],
    'gebo': [((0.1, 0), (0.9, 1)), ((0.9, 0), (0.1, 1))],
}


# ----------------------------------------------------------------------------- gun builder
class Gun:
    def __init__(self, gid, glow_hex, poly_rgb):
        self.id = gid
        self.objs = []
        self.cutters = []
        self.empties = []
        g = srgb(glow_hex)
        self.M = {
            'metal': self._mat(f'{gid}_metal', (0.026, 0.030, 0.038), 0.8, 0.38),
            'polymer': self._mat(f'{gid}_polymer', poly_rgb, 0.0, 0.58),
            'gold': self._mat(f'{gid}_gold', (0.95, 0.62, 0.24), 1.0, 0.26),
            'glow': self._mat(f'{gid}_glow', g, 0.0, 0.4, emission=g, strength=1.0),
            'glass': self._mat(f'{gid}_glass', (0.55, 0.75, 0.8), 0.0, 0.05, alpha=0.16),
        }

    @staticmethod
    def _mat(name, col, metal, rough, emission=None, strength=0.0, alpha=1.0):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*col, 1)
        b.inputs['Metallic'].default_value = metal
        b.inputs['Roughness'].default_value = rough
        if emission:
            b.inputs['Emission'].default_value = (*emission, 1)
            b.inputs['Emission Strength'].default_value = strength
        if alpha < 1:
            b.inputs['Alpha'].default_value = alpha
            m.blend_method = 'BLEND'
            m.shadow_method = 'NONE'
        return m

    # -- raw mesh
    def mesh(self, name, verts, faces, mat, bev=0.0012, seg=2, cutter=False, smooth=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata([V(*v) for v in verts], [], faces)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if cutter:
            ob.display_type = 'WIRE'
            ob.hide_render = True
            self.cutters.append(ob)
            return ob
        me.materials.append(self.M[mat])
        for p in me.polygons:
            p.use_smooth = smooth
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(40)
        ob['bev'] = bev
        ob['seg'] = seg
        self.objs.append(ob)
        return ob

    # -- side profile (z,y) extruded along x
    def prof(self, name, pts, x0, x1, mat='metal', **kw):
        n = len(pts)
        verts = [(x0, y, z) for z, y in pts] + [(x1, y, z) for z, y in pts]
        faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
        faces += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        return self.mesh(name, verts, faces, mat, **kw)

    def sym(self, name, pts, half, mat='metal', **kw):
        return self.prof(name, pts, -half, half, mat, **kw)

    # -- loft of cross-sections (x,y) placed at z
    def loft(self, name, secs, mat='metal', cap=True, **kw):
        n = len(secs[0][1])
        verts, faces = [], []
        for z, pts in secs:
            verts += [(x, y, z) for x, y in pts]
        for s in range(len(secs) - 1):
            a, b = s * n, (s + 1) * n
            faces += [[a + i, a + (i + 1) % n, b + (i + 1) % n, b + i] for i in range(n)]
        if cap:
            faces.append(list(range(n)))
            last = (len(secs) - 1) * n
            faces.append(list(range(last + n - 1, last - 1, -1)))
        return self.mesh(name, verts, faces, mat, **kw)

    def xsec(self, name, pts, z0, z1, mat='metal', **kw):
        return self.loft(name, [(z0, pts), (z1, pts)], mat, **kw)

    def cylz(self, name, cx, cy, r, z0, z1, mat='metal', n=12, **kw):
        return self.xsec(name, circle(cx, cy, r, n), z0, z1, mat, **kw)

    def cylx(self, name, cz, cy, r, x0, x1, mat='metal', n=12, **kw):
        if r < 0.008:
            kw['bev'] = 0
            n = min(n, 10)
        return self.prof(name, circle(cz, cy, r, n), x0, x1, mat, **kw)

    def cyly(self, name, cx, cz, r, y0, y1, mat='metal', n=12, **kw):
        if r < 0.008:
            kw['bev'] = 0
        n_ = n
        pts = circle(cx, cz, r, n_)
        verts = [(x, y0, z) for x, z in pts] + [(x, y1, z) for x, z in pts]
        faces = [list(range(n_)), list(range(2 * n_ - 1, n_ - 1, -1))]
        faces += [[i, (i + 1) % n_, n_ + (i + 1) % n_, n_ + i] for i in range(n_)]
        return self.mesh(name, verts, faces, mat, **kw)

    def lathe(self, name, prof_rz, cx, cy, mat='metal', n=16, **kw):
        secs = [(z, circle(cx, cy, r, n)) for r, z in prof_rz]
        return self.loft(name, secs, mat, **kw)

    def box(self, name, c, s, mat='metal', **kw):
        cx, cy, cz = c
        sx, sy, sz = s
        pts = [(cz - sz / 2, cy - sy / 2), (cz + sz / 2, cy - sy / 2), (cz + sz / 2, cy + sy / 2), (cz - sz / 2, cy + sy / 2)]
        return self.prof(name, pts, cx - sx / 2, cx + sx / 2, mat, **kw)

    def tube(self, name, outer0, inner0, z0, z1, mat='metal', outer1=None, inner1=None, **kw):
        outer1 = outer1 or outer0
        inner1 = inner1 or inner0
        n = len(outer0)
        verts = [(x, y, z0) for x, y in outer0] + [(x, y, z0) for x, y in inner0] + \
                [(x, y, z1) for x, y in outer1] + [(x, y, z1) for x, y in inner1]
        o0, i0, o1, i1 = 0, n, 2 * n, 3 * n
        faces = []
        for k in range(n):
            j = (k + 1) % n
            faces += [[o0 + k, o0 + j, i0 + j, i0 + k], [o1 + k, i1 + k, i1 + j, o1 + j],
                      [o0 + k, o1 + k, o1 + j, o0 + j], [i0 + k, i0 + j, i1 + j, i1 + k]]
        return self.mesh(name, verts, faces, mat, **kw)

    def bar(self, name, path, t, x0, x1, mat='metal', **kw):
        kw.setdefault('seg', 1)
        return self.prof(name, bar_poly(path, t), x0, x1, mat, **kw)

    def rune(self, glyph, side, xs, zc, yc, size, mat='glow', t=0.0013, h=0.0007):
        sg = 1 if side < 0 else -1
        for k, ((u0, v0), (u1, v1)) in enumerate(RUNES[glyph]):
            p0 = (zc + (u0 - 0.5) * size * 0.62 * sg, yc + (v0 - 0.5) * size)
            p1 = (zc + (u1 - 0.5) * size * 0.62 * sg, yc + (v1 - 0.5) * size)
            dz, dy = p1[0] - p0[0], p1[1] - p0[1]
            L = math.hypot(dz, dy) or 1
            ex = (dz / L * t * 0.4, dy / L * t * 0.4)
            path = [(p0[0] - ex[0], p0[1] - ex[1]), (p1[0] + ex[0], p1[1] + ex[1])]
            self.bar(f'rune_{glyph}_{k}', path, t, xs, xs + side * h, mat, bev=0)

    def cut(self, target, cutter):
        m = target.modifiers.new('cut', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.solver = 'EXACT'
        m.object = cutter

    def rotx(self, ob, ang, pivot):
        p = V(*pivot)
        ob.data.transform(Matrix.Translation(p) @ Matrix.Rotation(ang, 4, 'X') @ Matrix.Translation(-p))

    def empty(self, name, pos):
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 0.02
        e.location = V(*pos)
        bpy.context.scene.collection.objects.link(e)
        self.empties.append(e)

    # ------------------------------------------------------------------ shared parts
    def rail(self, z0, z1, y0, skip=(-0.036, 0.056), w=0.0105):
        """Picatinny-style rail: dovetail base + cross-slot teeth. Returns rail top y."""
        sec = [(-w + 0.0012, y0), (w - 0.0012, y0), (w - 0.0012, y0 + 0.003), (w + 0.001, y0 + 0.0055),
               (w, y0 + 0.008), (-w, y0 + 0.008), (-w - 0.001, y0 + 0.0055), (-w + 0.0012, y0 + 0.003)]
        self.xsec('rail_base', sec, z0, z1, 'metal', bev=0.0006, seg=1)
        za, zb = min(z0, z1), max(z0, z1)
        z = za + 0.006
        k = 0
        hw = w + 0.001
        while z < zb - 0.004:
            if not (skip[0] < z < skip[1]):
                ya, yb2 = y0 + 0.0078, y0 + 0.0113
                za_, zb_ = z - 0.0026, z + 0.0026
                verts = [(-hw, ya, za_), (hw, ya, za_), (hw, ya, zb_), (-hw, ya, zb_), (-hw, yb2, za_), (hw, yb2, za_), (hw, yb2, zb_), (-hw, yb2, zb_)]
                faces = [[4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]]
                self.mesh(f'rail_tooth{k}', verts, faces, 'metal', bev=0)
                k += 1
            z += 0.0102
        return y0 + 0.0115

    def optic(self, rail_top):
        """Original reflex/holo sight. Reticle centre at (0, SIGHT_Y, SIGHT_Z)."""
        zc = SIGHT_Z
        yb = rail_top - 0.009
        clamp = [(-0.0165, yb), (0.0165, yb), (0.0165, rail_top + 0.004), (0.0135, rail_top + 0.0075),
                 (-0.0135, rail_top + 0.0075), (-0.0165, rail_top + 0.004)]
        self.xsec('optic_clamp', clamp, zc - 0.040, zc + 0.042, 'metal', bev=0.0012)
        # clamp screws + throw lever
        for zz in (zc - 0.022, zc + 0.026):
            self.cylx('optic_screw', zz, rail_top - 0.002, 0.0032, 0.0165, 0.0195, 'gold', n=8, bev=0.0005)
        self.bar('optic_lever', [(zc - 0.030, rail_top - 0.003), (zc + 0.012, rail_top + 0.001)], 0.0045, -0.0165, -0.0205, 'metal', bev=0.0008)
        # riser tower
        yt = SIGHT_Y - 0.027
        ylo = rail_top + 0.006
        if yt - ylo > 0.004:
            riser = self.sym('optic_riser', [(zc - 0.034, ylo), (zc + 0.040, ylo), (zc + 0.032, yt + 0.004), (zc - 0.028, yt + 0.004)], 0.0135, 'metal', bev=0.0015)
            if yt - ylo > 0.018:
                c = self.prof('cut_riser', rrect(zc + 0.003, (ylo + yt) / 2 + 0.002, 0.034, (yt - ylo) - 0.012, 0.004, 2), -0.03, 0.03, cutter=True)
                self.cut(riser, c)
        # hood (frame tube, slightly flared at the front)
        oc = rrect(0, SIGHT_Y + 0.001, 0.068, 0.061, 0.013, 2)
        ic = rrect(0, SIGHT_Y, 0.050, 0.042, 0.008, 2)
        ocf = [(x * 1.05, SIGHT_Y + (y - SIGHT_Y) * 1.06) for x, y in oc]
        icf = [(x * 1.07, SIGHT_Y + (y - SIGHT_Y) * 1.09) for x, y in ic]
        self.tube('optic_hood', ocf, icf, zc - 0.026, zc + 0.020, 'metal', outer1=oc, inner1=ic, bev=0.0016)
        # thin gold lip on the front edge
        lipo = [(x * 1.018, SIGHT_Y + (y - SIGHT_Y) * 1.018) for x, y in ocf]
        lipi = [(x * 0.995, SIGHT_Y + (y - SIGHT_Y) * 0.995) for x, y in ocf]
        self.tube('optic_lip', lipo, lipi, zc - 0.0262, zc - 0.0232, 'gold', bev=0)
        # top ridge + windage turret (right) + battery cap (left)
        self.box('optic_ridge', (0, SIGHT_Y + 0.031, zc + 0.0), (0.020, 0.004, 0.030), 'metal', bev=0.001)
        self.cylx('optic_turret', zc + 0.002, SIGHT_Y - 0.004, 0.0085, 0.033, 0.0375, 'metal', n=10, bev=0.0008)
        self.cylx('optic_batt', zc - 0.004, SIGHT_Y - 0.008, 0.0095, -0.0375, -0.033, 'metal', n=10, bev=0.0008)
        self.cylx('optic_batt_gold', zc - 0.004, SIGHT_Y - 0.008, 0.0045, -0.0382, -0.0374, 'gold', n=10, bev=0)
        self.box('optic_btn1', (0.0145, yt - 0.003, zc + 0.016), (0.003, 0.005, 0.008), 'polymer', bev=0.0006)
        # glass + reticle
        gz = zc - 0.008
        g = [(x * 0.99, SIGHT_Y + (y - SIGHT_Y) * 0.99) for x, y in ic]
        self.mesh('optic_glass', [(x, y, gz) for x, y in g], [list(range(len(g)))], 'glass', bev=0)
        rz = gz + 0.0006
        self.tube('reticle_ring', circle(0, SIGHT_Y, 0.0068, 14), circle(0, SIGHT_Y, 0.0058, 14), rz, rz + 0.0004, 'glow', bev=0)
        self.xsec('reticle_dot', circle(0, SIGHT_Y, 0.0012, 8), rz, rz + 0.0004, 'glow', bev=0)
        for a in (90, 210, 330):
            ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
            p0 = (0.0085 * ca, SIGHT_Y + 0.0085 * sa)
            p1 = (0.0115 * ca, SIGHT_Y + 0.0115 * sa)
            ph = (-sa * 0.0004, ca * 0.0004)
            q = [(p0[0] + ph[0], p0[1] + ph[1]), (p1[0] + ph[0], p1[1] + ph[1]), (p1[0] - ph[0], p1[1] - ph[1]), (p0[0] - ph[0], p0[1] - ph[1])]
            self.xsec('reticle_tick', q, rz, rz + 0.0004, 'glow', bev=0)
        # emitter window glint at the bottom-rear of the hood
        self.box('optic_emitter', (0, SIGHT_Y - 0.0225, zc + 0.012), (0.010, 0.002, 0.004), 'glow', bev=0)
        self.empty('optic_sight', (0, SIGHT_Y, SIGHT_Z))

    def brake(self, name, cy, z0, z1, r, ports=3, square=False, top_ports=0, w=None, h=None):
        """Baffle-style muzzle brake, no booleans (z0 = rear, z1 = tip, z1 < z0)."""
        if square:
            sec = rrect(0, cy, w or 2 * r, h or 2 * r, 0.005, 1)
        else:
            sec = circle(0, cy, r, 8, math.pi / 8)
        n = len(sec)
        sc = lambda pts, k: [(x * k, cy + (y - cy) * k) for x, y in pts]
        L = z0 - z1
        collar = 0.30 * L
        cap = 0.16 * L
        self.loft(name + '_collar', [(z0, sc(sec, 0.9)), (z0 - 0.003, sec), (z0 - collar, sec)], 'metal', bev=0.0009)
        bore = circle(0, cy, r * 0.42, n, math.pi / 8)
        self.tube(name + '_cap', sec, bore, z1 + cap, z1 + 0.002, 'metal', outer1=sc(sec, 0.93), inner1=bore, bev=0.0008)
        self.xsec(name + '_core', sc(sec, 0.6), z0 - collar, z1 + cap, 'metal', bev=0)
        gap = L - collar - cap
        fl = gap / (ports * 2 + 1)
        for k in range(ports):
            zb = z0 - collar - fl * (2 * k + 1)
            self.xsec(name + '_fin', sec, zb, zb - fl, 'metal', bev=0)
        if square:
            hw = (w or 2 * r) / 2
            hh = (h or 2 * r) / 2
            for sy in (-1, 1):
                self.box(name + '_strap', (0, cy + sy * hh * 0.78, (z0 - collar + z1 + cap) / 2), (hw * 1.6, hh * 0.44, gap), 'metal', bev=0)
        self.tube(name + '_ring', sc(sec, 1.03), sc(sec, 0.97), z0 - 0.0055, z0 - 0.0075, 'gold', bev=0)
        self.empty('muzzle_crown', (0, cy, z1))

    def mag_ribs(self, front, back, ys, half, mat='polymer', t=0.004, inset=0.006, proud=0.0012):
        for i, y in enumerate(ys):
            zf = curve_at(front, y) + inset
            zb = curve_at(back, y) - inset
            self.bar(f'magrib{i}', [(zf, y), (zb, y)], t, -half - proud, half + proud, mat, bev=0)

    def anchors(self, r, l):
        self.empty('grip_r', r)
        self.empty('grip_l', l)

    # ------------------------------------------------------------------ finalize
    def finalize(self):
        for ob in self.objs:
            if ob['bev'] > 0:
                b = ob.modifiers.new('bevel', 'BEVEL')
                b.width = ob['bev']
                b.segments = ob['seg']
                b.limit_method = 'ANGLE'
                b.angle_limit = math.radians(32)
                b.use_clamp_overlap = True
                b.miter_outer = 'MITER_ARC'
                with bpy.context.temp_override(object=ob, active_object=ob):
                    bpy.ops.object.modifier_move_to_index(modifier='bevel', index=0)
                if max(ob.dimensions) < 0.2:
                    b.segments = 1
            wn = ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
            wn.keep_sharp = True
            wn.weight = 50
            for m in list(ob.modifiers):
                with bpy.context.temp_override(object=ob, active_object=ob):
                    bpy.ops.object.modifier_apply(modifier=m.name)
            if '--debug' in ARGV:
                t = sum(len(p.vertices) - 2 for p in ob.data.polygons)
                if t > 0:
                    print('  TRIS', ob.name, t)
        for c in self.cutters:
            bpy.data.objects.remove(c, do_unlink=True)
        self.cutters = []
        groups = {}
        for ob in self.objs:
            groups.setdefault(ob.data.materials[0].name, []).append(ob)
        joined = []
        for mname, obs in groups.items():
            tgt = obs[0]
            if len(obs) > 1:
                with bpy.context.temp_override(active_object=tgt, object=tgt, selected_objects=obs, selected_editable_objects=obs):
                    bpy.ops.object.join()
            key = mname.split('_', 1)[1]
            tgt.name = f'{self.id}_{key}'
            tgt.data.name = tgt.name
            joined.append(tgt)
        self.objs = joined
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in joined)
        return tris


# ============================================================================ GUNS
def build_m4a1():
    g = Gun('m4a1', '#fbbf24', (0.020, 0.019, 0.017))
    by = 0.012
    # upper receiver
    up = g.sym('upper', [(-0.152, 0.000), (-0.152, 0.046), (-0.148, 0.050), (0.118, 0.050), (0.133, 0.040), (0.133, 0.004), (0.126, 0.000)], 0.031, bev=0.0018)
    g.cut(up, g.prof('cut_eject', rrect(0.012, 0.022, 0.066, 0.020, 0.003, 2), 0.026, 0.04, cutter=True))
    g.cut(up, g.prof('cut_lpanel', rrect(-0.060, 0.026, 0.12, 0.012, 0.003, 2), -0.04, -0.0285, cutter=True))
    g.box('dust_cover', (0.0315, 0.020, 0.012), (0.002, 0.016, 0.062), 'metal', bev=0.0005)
    g.cylz('fwd_assist', 0.026, 0.030, 0.0075, 0.080, 0.122, n=12, bev=0.001)
    g.cylz('fwd_assist_cap', 0.026, 0.030, 0.0055, 0.074, 0.082, 'gold', n=12, bev=0)
    g.sym('brass_def', [(0.060, 0.008), (0.092, 0.008), (0.088, 0.040), (0.070, 0.040)], 0.0365, bev=0.0012)
    for s in (-1, 1):
        g.box('trim_up', (s * 0.0313, 0.044, -0.015), (0.0012, 0.0016, 0.25), 'gold', bev=0)
    # lower receiver
    lo = g.sym('lower', [(-0.142, -0.001), (0.128, -0.001), (0.140, -0.012), (0.140, -0.028), (0.124, -0.041), (0.066, -0.044),
                          (0.002, -0.044), (-0.012, -0.050), (-0.018, -0.080), (-0.114, -0.080), (-0.123, -0.070), (-0.130, -0.042), (-0.142, -0.026)], 0.0285, bev=0.0018)
    g.sym('magwell_flare', [(-0.020, -0.070), (-0.112, -0.070), (-0.116, -0.084), (-0.016, -0.084)], 0.0305, bev=0.0012)
    g.cut(lo, g.prof('cut_lmag', rrect(-0.066, -0.040, 0.075, 0.022, 0.004, 2), -0.04, -0.0265, cutter=True))
    for zz in (-0.128, 0.120):
        g.cylx('pin', zz, -0.010, 0.0035, -0.0300, 0.0300, n=10, bev=0.0004)
    g.cylx('mag_release', -0.008, -0.028, 0.005, 0.028, 0.0325, n=10, bev=0.0006)
    g.bar('bolt_catch', [(-0.004, -0.010), (-0.010, -0.032)], 0.007, -0.0285, -0.0325, bev=0.0008)
    g.cylx('selector', 0.088, -0.020, 0.0065, -0.0315, -0.0285, n=12, bev=0.0005)
    g.bar('selector_lever', [(0.088, -0.020), (0.070, -0.014)], 0.0045, -0.0335, -0.031, 'gold', bev=0)
    g.rune('algiz', -1, -0.0265, -0.066, -0.040, 0.013, 'gold', h=0.0008)
    # mag
    mf = [(-0.104, -0.060), (-0.108, -0.110), (-0.116, -0.170), (-0.127, -0.226)]
    mb = [(-0.035, -0.060), (-0.038, -0.120), (-0.044, -0.180), (-0.053, -0.230)]
    g.sym('mag', [mf[0]] + mb[:1] + mb[1:] + [mf[3]] + mf[2:0:-1], 0.0215, 'polymer', bev=0.0016)
    g.mag_ribs(mf, mb, [-0.150, -0.162, -0.174, -0.186, -0.198], 0.0215)
    g.sym('mag_floor', [(-0.130, -0.222), (-0.050, -0.226), (-0.048, -0.236), (-0.056, -0.242), (-0.128, -0.240), (-0.134, -0.232)], 0.0235, bev=0.0014)
    g.bar('mag_window', [(-0.052, -0.090), (-0.057, -0.140)], 0.0028, -0.0215, -0.0228, 'glow', bev=0)
    # grip
    gp = chaikin([(0.052, -0.040, 's'), (0.118, -0.040, 's'), (0.131, -0.047), (0.127, -0.062), (0.139, -0.100), (0.150, -0.150), (0.155, -0.172),
                  (0.141, -0.183), (0.108, -0.181), (0.099, -0.168), (0.088, -0.130), (0.090, -0.112), (0.082, -0.097), (0.083, -0.082), (0.072, -0.066), (0.062, -0.055)], 1)
    g.sym('grip', gp, 0.0155, 'polymer', bev=0.0018)
    g.sym('grip_cap', [(0.105, -0.176), (0.142, -0.178), (0.156, -0.172), (0.152, -0.186), (0.140, -0.190), (0.106, -0.188)], 0.0162, bev=0.001)
    g.bar('tguard', [(-0.010, -0.043), (-0.013, -0.068), (-0.003, -0.079), (0.046, -0.079), (0.063, -0.062), (0.070, -0.044)], 0.005, -0.006, 0.006, bev=0.0012)
    g.bar('trigger', [(0.031, -0.043), (0.029, -0.055), (0.023, -0.066), (0.016, -0.071)], 0.0045, -0.0035, 0.0035, 'gold', bev=0.0006)
    # charging handle
    g.sym('ch_stem', [(0.118, 0.041), (0.150, 0.041), (0.150, 0.050), (0.118, 0.050)], 0.0075, bev=0.001)
    g.sym('ch_latch', [(0.137, 0.041), (0.152, 0.041), (0.154, 0.049), (0.140, 0.050)], 0.022, bev=0.0012)
    # rail
    rt = g.rail(-0.432, 0.118, 0.050)
    # handguard
    hsec = [(0.0115, 0.050), (0.027, 0.050), (0.0325, 0.043), (0.0325, -0.008), (0.023, -0.029), (-0.023, -0.029), (-0.0325, -0.008), (-0.0325, 0.043), (-0.027, 0.050), (-0.0115, 0.050)]
    hg = g.loft('handguard', [(-0.150, hsec), (-0.420, hsec), (-0.432, [(x * 0.9, 0.012 + (y - 0.012) * 0.9) for x, y in hsec])], bev=0.0016)
    for k in range(5):
        zz = -0.405 + k * 0.046
        for s in (-1, 1):
            g.cut(hg, g.prof('cut_mlok', rrect(zz, 0.016, 0.030, 0.0085, 0.0042, 2), s * 0.029, s * 0.040, cutter=True))
    for s in (-1, 1):
        g.box('hg_trim', (s * 0.0327, 0.039, -0.287), (0.0012, 0.0016, 0.262), 'gold', bev=0)
    g.tube('hg_cap', [(x * 1.03, 0.009 + (y - 0.009) * 1.03) for x, y in hsec], [(x * 0.98, 0.009 + (y - 0.009) * 0.98) for x, y in hsec], -0.154, -0.157, 'gold', bev=0)
    for i, (gl, zz) in enumerate([('tiwaz', -0.405), ('fehu', -0.392), ('algiz', -0.379)]):
        g.rune(gl, -1, -0.0325, zz, 0.031, 0.009)
    g.sym('handstop', [(-0.372, -0.027), (-0.348, -0.027), (-0.356, -0.042), (-0.368, -0.042)], 0.011, 'polymer', bev=0.0012)
    # barrel + brake
    fl = fluted(0, by, 0.0098, 6, 0.0022)
    g.loft('barrel', [(-0.430, circle(0, by, 0.0105, 12)), (-0.452, circle(0, by, 0.0105, 12))], bev=0)
    g.xsec('barrel_fl', fl, -0.452, -0.587, bev=0)
    g.brake('brake', by, -0.585, -0.655, 0.0155, ports=3, top_ports=0)
    # stock
    g.lathe('buffer', [(0.0135, 0.132), (0.0135, 0.335)], 0, 0.006, n=12, bev=0.001)
    g.lathe('castle_nut', [(0.0172, 0.132), (0.0172, 0.142)], 0, 0.006, 'gold', n=12, bev=0.0006)
    st = g.sym('stock', chaikin([(0.190, 0.027, 's'), (0.335, 0.035), (0.372, 0.037, 's'), (0.378, 0.031), (0.380, -0.080, 's'), (0.366, -0.086),
                                 (0.345, -0.072), (0.300, -0.037), (0.240, -0.019), (0.190, -0.015, 's')], 1), 0.0215, 'polymer', bev=0.002)
    g.cut(st, g.prof('cut_stock', chaikin([(0.312, -0.014, 's'), (0.362, -0.012), (0.362, -0.064), (0.340, -0.058)], 1), -0.05, 0.05, cutter=True))
    g.sym('buttpad', [(0.376, 0.036), (0.391, 0.036), (0.394, -0.086), (0.380, -0.090), (0.376, -0.080)], 0.024, 'metal', bev=0.0016)
    g.sym('cheek', [(0.222, 0.030), (0.330, 0.035), (0.346, 0.042), (0.340, 0.050), (0.232, 0.046), (0.220, 0.040)], 0.0165, bev=0.0016)
    for s in (-1, 1):
        g.bar('stock_glow', [(0.205, 0.004), (0.290, 0.008), (0.335, 0.012)], 0.0024, s * 0.0215, s * 0.0223, 'glow', bev=0)
        g.box('cheek_trim', (s * 0.0167, 0.040, 0.282), (0.0012, 0.0014, 0.10), 'gold', bev=0)
    g.bar('stock_lever', [(0.215, -0.020), (0.262, -0.027)], 0.0045, -0.006, 0.006, bev=0.0008)
    g.optic(rt)
    g.anchors((0, -0.11, 0.11), (0, -0.02, -0.29))
    return g


def build_ak47():
    g = Gun('ak47', '#f97316', (0.050, 0.026, 0.014))
    by = 0.0
    rc = g.sym('receiver', [(-0.175, 0.040), (0.142, 0.040), (0.152, 0.030), (0.152, -0.030), (0.132, -0.041), (0.030, -0.043), (0.012, -0.050),
                            (-0.078, -0.055), (-0.098, -0.050), (-0.112, -0.040), (-0.175, -0.032)], 0.032, bev=0.0018)
    g.cut(rc, g.prof('cut_eject', rrect(0.000, 0.022, 0.085, 0.020, 0.003, 2), 0.027, 0.04, cutter=True))
    g.cut(rc, g.prof('cut_dimple', rrect(-0.075, -0.030, 0.034, 0.012, 0.005, 2), -0.04, -0.0305, cutter=True))
    g.cut(rc, g.prof('cut_lchan', rrect(0.035, 0.004, 0.070, 0.008, 0.0035, 2), -0.04, -0.0305, cutter=True))
    g.box('ak_rlink', (-0.0306, 0.004, 0.035), (0.0012, 0.0025, 0.062), 'glow', bev=0)
    g.sym('side_mount', [(0.075, -0.034), (0.140, -0.034), (0.140, -0.006), (0.085, -0.006)], 0.0335, bev=0.0012)
    for zz, yy in [(-0.160, -0.022), (-0.160, 0.025), (-0.045, -0.046)]:
        g.cylx('rivet', zz, yy, 0.0028, -0.0335, 0.0335, 'gold', n=8, bev=0)
    for s in (-1, 1):
        g.box('trim_rc', (s * 0.0323, -0.036, -0.02), (0.0012, 0.0016, 0.25), 'gold', bev=0)
    # dust cover with rear step
    dsec = [(0.0305, 0.040), (0.0305, 0.051), (0.025, 0.061), (0.012, 0.066), (-0.012, 0.066), (-0.025, 0.061), (-0.0305, 0.051), (-0.0305, 0.040)]
    g.loft('dust_cover', [(-0.135, dsec), (0.140, dsec), (0.156, [(x * 0.9, 0.040 + (y - 0.040) * 0.55) for x, y in dsec])], bev=0.0016)
    g.cylx('cover_latch', 0.156, 0.036, 0.0065, -0.012, 0.012, n=10, bev=0.0008)
    rt = g.rail(-0.130, 0.130, 0.066)
    # charging handle (right) + selector lever (right)
    g.box('ch_arm', (0.041, 0.022, -0.080), (0.020, 0.009, 0.012), bev=0.0012)
    g.cylx('ch_knob', -0.080, 0.022, 0.0075, 0.050, 0.058, n=12, bev=0.0012)
    g.bar('selector', [(0.140, 0.020), (0.060, 0.012), (0.035, -0.004)], 0.008, 0.032, 0.0355, bev=0.0008)
    g.bar('selector_tab', [(0.036, -0.004), (0.032, -0.018)], 0.006, 0.032, 0.039, 'gold', bev=0)
    g.rune('sowilo', -1, -0.032, 0.118, 0.020, 0.014)
    # trigger guard / trigger
    g.bar('tguard', [(0.004, -0.043), (0.002, -0.066), (0.012, -0.076), (0.060, -0.076), (0.076, -0.062), (0.082, -0.042)], 0.0055, -0.0065, 0.0065, bev=0.0012)
    g.bar('trigger', [(0.040, -0.043), (0.038, -0.055), (0.032, -0.066), (0.025, -0.070)], 0.0048, -0.0035, 0.0035, 'gold', bev=0.0006)
    # grip
    gp = chaikin([(0.076, -0.039, 's'), (0.124, -0.039, 's'), (0.128, -0.052), (0.140, -0.100), (0.150, -0.150), (0.154, -0.165), (0.144, -0.176),
                  (0.114, -0.176), (0.106, -0.162), (0.096, -0.128), (0.093, -0.105), (0.088, -0.085), (0.082, -0.060)], 1)
    g.sym('grip', gp, 0.0165, 'polymer', bev=0.0018)
    for k in range(3):
        y = -0.095 - k * 0.022
        z0 = 0.093 + (-(y + 0.09)) * 0.25
        g.bar('grip_rib', [(z0 + 0.004, y), (z0 + 0.040, y)], 0.004, -0.0175, 0.0175, 'polymer', bev=0.0007, seg=1)
    # banana mag
    mb = [(-0.040, -0.045), (-0.047, -0.100), (-0.062, -0.160), (-0.086, -0.215), (-0.104, -0.248)]
    mf = [(-0.113, -0.045), (-0.116, -0.100), (-0.124, -0.150), (-0.137, -0.195), (-0.150, -0.232)]
    g.sym('mag', mb + mf[::-1], 0.0205, 'polymer', bev=0.0018)
    g.mag_ribs(mf, mb, [-0.072, -0.205], 0.0205, t=0.006)
    for s in (-1, 1):
        mid = [((curve_at(mf, y) + curve_at(mb, y)) / 2, y) for y in (-0.085, -0.13, -0.175, -0.215)]
        g.bar('mag_spine', mid, 0.008, s * 0.0205, s * 0.0222, 'polymer', bev=0.0007, seg=1)
    g.bar('mag_window', [((curve_at(mf, -0.09) + curve_at(mb, -0.09)) / 2 + 0.018, -0.09), ((curve_at(mf, -0.16) + curve_at(mb, -0.16)) / 2 + 0.019, -0.16)], 0.0028, -0.0222, -0.0232, 'glow', bev=0)
    g.sym('mag_floor', [(-0.151, -0.228), (-0.102, -0.244), (-0.100, -0.254), (-0.153, -0.240)], 0.0225, bev=0.0012)
    g.bar('mag_catch', [(-0.030, -0.045), (-0.026, -0.064)], 0.006, -0.009, 0.009, bev=0.0008)
    # handguards with lava vents
    lsec = rrect(0, -0.017, 0.064, 0.044, 0.012, 2)
    lsec = [(x, min(y, 0.004)) for x, y in lsec]
    lg = g.loft('lower_hg', [(-0.168, lsec), (-0.395, lsec), (-0.405, [(x * 0.9, -0.017 + (y + 0.017) * 0.85) for x, y in lsec])], 'polymer', bev=0.002)
    for k in range(3):
        zz = -0.355 + k * 0.05
        for s in (-1, 1):
            g.cut(lg, g.prof('cut_vent', rrect(zz, -0.016, 0.034, 0.0085, 0.0042, 3), s * 0.028, s * 0.04, cutter=True))
        g.box('vent_glow', (0, -0.016, zz), (0.058, 0.006, 0.030), 'glow', bev=0)
    usec = rrect(0, 0.030, 0.046, 0.034, 0.014, 3)
    usec = [(x, max(y, 0.016)) for x, y in usec]
    ug = g.loft('upper_hg', [(-0.150, usec), (-0.380, usec), (-0.392, [(x * 0.8, 0.016 + (y - 0.016) * 0.8) for x, y in usec])], 'polymer', bev=0.002)
    for k in range(3):
        zz = -0.335 + k * 0.06
        for s in (-1, 1):
            g.cut(ug, g.cylx('cut_uvent', zz, 0.033, 0.0055, s * 0.016, s * 0.04, n=8, cutter=True))
    g.cylz('gas_tube', 0, 0.033, 0.0095, -0.150, -0.395, n=12, bev=0)
    g.tube('hg_ring', [(x * 1.03, -0.017 + (y + 0.017) * 1.06) for x, y in lsec], [(x * 0.97, -0.017 + (y + 0.017) * 0.95) for x, y in lsec], -0.168, -0.171, 'gold', bev=0)
    # gas block + barrel + brake
    g.xsec('gas_block', rrect(0, 0.016, 0.030, 0.050, 0.008, 2), -0.400, -0.430, bev=0.0014)
    g.cylx('gas_pin', -0.415, 0.033, 0.003, -0.0155, 0.0155, 'gold', n=8, bev=0)
    g.lathe('barrel', [(0.0115, -0.398), (0.0115, -0.440), (0.0105, -0.446), (0.0105, -0.602)], 0, by, n=12, bev=0.0005)
    g.brake('brake', by, -0.598, -0.680, 0.019, ports=3, square=True, w=0.036, h=0.034, top_ports=3)
    # stock
    stp = chaikin([(0.150, 0.036, 's'), (0.205, 0.033), (0.330, 0.022), (0.384, 0.024), (0.392, 0.016, 's'), (0.393, -0.099, 's'), (0.378, -0.105),
                   (0.332, -0.086), (0.232, -0.056), (0.150, -0.036, 's')], 1)
    st = g.sym('stock', stp, 0.0215, 'polymer', bev=0.0022)
    g.cut(st, g.prof('cut_stock', chaikin([(0.215, -0.012, 's'), (0.318, -0.020), (0.342, -0.050), (0.300, -0.064), (0.226, -0.040)], 1), -0.05, 0.05, cutter=True))
    g.sym('buttplate', [(0.388, 0.026), (0.401, 0.026), (0.403, -0.101), (0.392, -0.108), (0.388, -0.098)], 0.0235, bev=0.0015)
    g.sym('stock_tang', [(0.140, 0.034), (0.172, 0.032), (0.172, -0.034), (0.140, -0.034)], 0.024, bev=0.0012)
    for s in (-1, 1):
        g.bar('stock_trim', [(0.18, 0.026), (0.33, 0.014), (0.382, 0.016)], 0.0016, s * 0.0215, s * 0.0222, 'gold', bev=0)
    g.optic(rt)
    g.anchors((0, -0.10, 0.11), (0, -0.03, -0.29))
    return g


def build_p90():
    g = Gun('p90', '#38bdf8', (0.016, 0.020, 0.027))
    by = 0.012
    sh = g.sym('shell', [(-0.338, 0.015), (-0.336, 0.044), (-0.326, 0.060), (-0.302, 0.070), (0.250, 0.070), (0.282, 0.064), (0.300, 0.049), (0.307, 0.015)], 0.031, 'polymer', bev=0.005, seg=3)
    ch = g.sym('chassis', [(-0.334, 0.016), (0.304, 0.016), (0.302, -0.074), (0.288, -0.091), (0.258, -0.093), (0.236, -0.061), (0.208, -0.043), (0.100, -0.043),
                           (-0.020, -0.043), (-0.105, -0.041), (-0.190, -0.031), (-0.312, -0.023), (-0.332, -0.010)], 0.0285, bev=0.003)
    for s in (-1, 1):
        g.cut(sh, g.prof('cut_vent', rrect(-0.270, 0.040, 0.060, 0.010, 0.005, 3), s * 0.027, s * 0.04, cutter=True))
        g.box('vent_glow', (s * 0.027, 0.040, -0.270), (0.003, 0.006, 0.054), 'glow', bev=0)
        g.box('seam_trim', (s * 0.0292, 0.0135, -0.02), (0.0012, 0.0016, 0.60), 'gold', bev=0)
        g.cut(ch, g.prof('cut_side', chaikin([(-0.170, -0.006), (0.000, -0.006), (0.000, -0.030), (-0.150, -0.026)], 1), s * 0.0265, s * 0.04, cutter=True))
    g.rune('algiz', -1, -0.031, 0.150, 0.043, 0.016)
    g.rune('naud', -1, -0.031, 0.170, 0.043, 0.016)
    # charging knob + slot (left)
    g.cut(sh, g.prof('cut_ch', rrect(-0.200, 0.030, 0.090, 0.007, 0.0034, 2), -0.04, -0.027, cutter=True))
    g.cylx('ch_knob', -0.165, 0.030, 0.0055, -0.040, -0.028, n=12, bev=0.001)
    # front grip
    fg = chaikin([(-0.190, -0.028, 's'), (-0.110, -0.028, 's'), (-0.112, -0.060), (-0.117, -0.108), (-0.123, -0.134), (-0.140, -0.146), (-0.165, -0.143),
                  (-0.173, -0.126), (-0.168, -0.092), (-0.177, -0.060)], 1)
    g.sym('front_grip', fg, 0.0235, 'polymer', bev=0.003)
    for k in range(3):
        y = -0.075 - k * 0.022
        g.bar('fg_rib', [(-0.170 + 0.003 + (k * 0.002), y), (-0.116 - 0.003, y)], 0.005, -0.0245, 0.0245, 'metal', bev=0.0008, seg=1)
    # pistol grip + guard + trigger
    pg = chaikin([(0.010, -0.038, 's'), (0.082, -0.038, 's'), (0.080, -0.060), (0.086, -0.100), (0.091, -0.140), (0.081, -0.153), (0.042, -0.156), (0.026, -0.142),
                  (0.020, -0.120), (0.024, -0.105), (0.018, -0.088), (0.020, -0.072), (0.010, -0.055)], 1)
    g.sym('grip', pg, 0.017, 'polymer', bev=0.0025)
    g.bar('tguard', [(-0.080, -0.042), (-0.084, -0.066), (-0.072, -0.078), (0.000, -0.078), (0.015, -0.062), (0.017, -0.046)], 0.0055, -0.0065, 0.0065, bev=0.0012)
    g.bar('trigger', [(-0.030, -0.042), (-0.032, -0.055), (-0.038, -0.066), (-0.045, -0.070)], 0.0048, -0.0035, 0.0035, 'gold', bev=0.0006)
    # mag behind the grip
    mp = [(0.112, -0.040), (0.200, -0.040), (0.199, -0.158), (0.190, -0.170), (0.121, -0.170), (0.112, -0.160)]
    g.sym('mag', mp, 0.0195, 'metal', bev=0.002)
    g.sym('mag_floor', [(0.108, -0.163), (0.204, -0.163), (0.204, -0.176), (0.196, -0.182), (0.116, -0.182), (0.108, -0.175)], 0.0215, 'polymer', bev=0.0015)
    g.mag_ribs([(0.112, 0), (0.112, -0.2)], [(0.200, 0), (0.200, -0.2)], [-0.070, -0.085, -0.100, -0.115, -0.130, -0.145], 0.0195, mat='polymer', t=0.0035, inset=0.008)
    g.box('mag_window', (-0.0202, -0.105, 0.188), (0.0012, 0.08, 0.004), 'glow', bev=0)
    g.box('mag_latch', (0, -0.050, 0.208), (0.016, 0.012, 0.010), bev=0.001)
    # butt pad
    g.sym('buttpad', [(0.302, 0.058), (0.314, 0.052), (0.318, -0.078), (0.302, -0.095), (0.296, -0.080)], 0.031, 'polymer', bev=0.003)
    for k in range(3):
        g.cut(g.objs[-1], g.prof('cut_pad', [(0.306, 0.020 - k * 0.03), (0.330, 0.020 - k * 0.03), (0.330, 0.014 - k * 0.03), (0.306, 0.014 - k * 0.03)], -0.05, 0.05, cutter=True))
    g.cylx('sling', 0.270, -0.070, 0.006, -0.032, 0.032, n=10, bev=0.0008)
    rt = g.rail(-0.235, 0.190, 0.070)
    # front: shroud, barrel, compensator
    g.lathe('shroud', [(0.0175, -0.330), (0.0175, -0.350), (0.0145, -0.356)], 0, by, n=16, bev=0.001)
    g.tube('shroud_ring', circle(0, by, 0.0185, 16), circle(0, by, 0.0165, 16), -0.336, -0.339, 'gold', bev=0)
    g.xsec('barrel_fl', fluted(0, by, 0.0095, 6, 0.002), -0.354, -0.388, bev=0)
    g.brake('brake', by, -0.386, -0.417, 0.0145, ports=2, top_ports=1)
    g.optic(rt)
    g.anchors((0, -0.09, 0.05), (0, -0.09, -0.14))
    return g


def build_kriss():
    g = Gun('kriss', '#f43f5e', (0.024, 0.024, 0.028))
    by = 0.030
    up = g.sym('upper', [(-0.300, 0.000), (-0.300, 0.058), (-0.292, 0.064), (0.150, 0.064), (0.160, 0.055), (0.160, 0.000)], 0.029, bev=0.0018)
    g.cut(up, g.prof('cut_eject', rrect(0.040, 0.032, 0.060, 0.018, 0.003, 2), 0.024, 0.04, cutter=True))
    for k in range(3):
        zz = -0.275 + k * 0.042
        for s in (-1, 1):
            g.cut(up, g.prof('cut_mlok', rrect(zz, 0.032, 0.030, 0.0085, 0.0042, 3), s * 0.026, s * 0.04, cutter=True))
    g.cut(up, g.prof('cut_ch', rrect(-0.090, 0.046, 0.080, 0.007, 0.0034, 2), -0.04, -0.026, cutter=True))
    g.cylx('ch_knob', -0.060, 0.046, 0.0055, -0.040, -0.027, n=12, bev=0.001)
    rt = g.rail(-0.296, 0.150, 0.064)
    hp = [(-0.322, 0.002, 's'), (0.152, 0.002, 's'), (0.154, -0.032), (0.100, -0.041), (0.020, -0.043), (-0.084, -0.043, 's'), (-0.098, -0.110, 's'),
          (-0.172, -0.110, 's'), (-0.166, -0.080), (-0.205, -0.050), (-0.300, -0.042), (-0.322, -0.022)]
    hs = g.sym('housing', chaikin(hp, 1), 0.0305, 'polymer', bev=0.0025)
    for s in (-1, 1):
        g.cut(hs, g.prof('cut_hpanel', chaikin([(-0.290, -0.012, 's'), (-0.200, -0.012), (-0.186, -0.034), (-0.290, -0.032)], 1), s * 0.0285, s * 0.04, cutter=True))
        g.box('seam_trim', (s * 0.0302, 0.004, -0.085), (0.0012, 0.0016, 0.47), 'gold', bev=0)
        g.bar('fang_trim', [(-0.168, -0.106), (-0.163, -0.080), (-0.202, -0.052)], 0.0016, s * 0.0300, s * 0.0310, 'gold', bev=0)
    for k, gl in enumerate(['kaun', 'naud', 'kaun']):
        g.rune(gl, -1, -0.0285, -0.270 + k * 0.022, -0.022, 0.014)
    # angled mag
    mp = [(-0.096, -0.050), (-0.150, -0.050), (-0.199, -0.268), (-0.145, -0.268)]
    g.sym('mag', mp, 0.0165, 'metal', bev=0.0018)
    g.sym('mag_floor', [(-0.200, -0.262), (-0.140, -0.262), (-0.141, -0.276), (-0.148, -0.282), (-0.198, -0.282), (-0.204, -0.272)], 0.0195, 'polymer', bev=0.0014)
    for s in (-1, 1):
        for k in range(2):
            o = 0.012 + k * 0.014
            g.bar('mag_rib', [(-0.150 + o + 0.005, -0.120), (-0.150 + o - 0.024, -0.240)], 0.004, s * 0.0165, s * 0.0178, 'polymer', bev=0.0006, seg=1)
    g.bar('mag_window', [(-0.104, -0.110), (-0.124, -0.200)], 0.0026, -0.0178, -0.0188, 'glow', bev=0)
    g.sym('magwell_lip', [(-0.172, -0.104), (-0.096, -0.104), (-0.098, -0.116), (-0.174, -0.116)], 0.0325, 'metal', bev=0.0012)
    # grip, guard, trigger
    gp = chaikin([(0.075, -0.038, 's'), (0.130, -0.038, 's'), (0.136, -0.048), (0.141, -0.080), (0.151, -0.125), (0.149, -0.140), (0.120, -0.144), (0.108, -0.131),
                  (0.100, -0.105), (0.100, -0.090), (0.092, -0.075), (0.090, -0.060), (0.080, -0.050)], 1)
    g.sym('grip', gp, 0.0155, 'polymer', bev=0.0018)
    g.bar('tguard', [(0.008, -0.042), (0.005, -0.068), (0.016, -0.079), (0.074, -0.079), (0.090, -0.062), (0.094, -0.044)], 0.0055, -0.0065, 0.0065, bev=0.0012)
    g.bar('trigger', [(0.048, -0.042), (0.046, -0.054), (0.040, -0.065), (0.033, -0.069)], 0.0045, -0.0035, 0.0035, 'gold', bev=0.0006)
    g.cylx('selector', 0.110, -0.018, 0.0065, -0.0325, -0.0300, n=12, bev=0.0005)
    g.bar('selector_lever', [(0.110, -0.018), (0.094, -0.010)], 0.0045, -0.0345, -0.0322, 'gold', bev=0)
    # front: shroud, barrel, fang comp
    g.xsec('shroud', rrect(0, by, 0.040, 0.044, 0.010, 3), -0.300, -0.336, bev=0.0016)
    g.lathe('barrel', [(0.0105, -0.334), (0.0105, -0.362)], 0, by, n=16, bev=0)
    g.brake('brake', by, -0.358, -0.410, 0.0165, ports=3, square=True, w=0.030, h=0.032, top_ports=2)
    # folding skeleton stock
    g.sym('stock_hinge', [(0.158, 0.060), (0.192, 0.056), (0.192, -0.006), (0.158, -0.010)], 0.024, bev=0.0016)
    g.cyly('hinge_pin', 0.0, 0.182, 0.0042, -0.012, 0.064, 'gold', n=10, bev=0)
    g.bar('strut_top', [(0.190, 0.044), (0.300, 0.044), (0.372, 0.040)], 0.010, -0.008, 0.008, bev=0.0015)
    g.bar('strut_bot', [(0.190, 0.006), (0.290, -0.015), (0.372, -0.045)], 0.009, -0.007, 0.007, bev=0.0015)
    g.sym('cheek', [(0.240, 0.046), (0.340, 0.044), (0.348, 0.056), (0.246, 0.059)], 0.0135, 'polymer', bev=0.0016)
    g.sym('butt', chaikin([(0.362, 0.052, 's'), (0.393, 0.052), (0.397, 0.000), (0.396, -0.084, 's'), (0.374, -0.080), (0.362, -0.050), (0.366, 0.000)], 1), 0.0215, 'polymer', bev=0.0022)
    for s in (-1, 1):
        g.bar('strut_glow', [(0.205, 0.0405), (0.360, 0.0375)], 0.002, s * 0.008, s * 0.0088, 'glow', bev=0)
    g.optic(rt)
    g.anchors((0, -0.07, 0.11), (0, -0.05, -0.27))
    return g


def build_uzi():
    g = Gun('uzi', '#2dd4bf', (0.020, 0.032, 0.032))
    by = 0.030
    rc = g.sym('receiver', [(-0.206, 0.000), (-0.206, 0.054), (-0.196, 0.064), (0.120, 0.064), (0.136, 0.054), (0.136, 0.000)], 0.031, bev=0.0018)
    for s in (-1, 1):
        g.cut(rc, g.prof('cut_flute', rrect(-0.050, 0.022, 0.20, 0.010, 0.0045, 3), s * 0.0285, s * 0.04, cutter=True))
        g.box('flute_glow', (s * 0.0287, 0.022, -0.050), (0.0012, 0.004, 0.19), 'glow', bev=0)
        g.box('trim_rc', (s * 0.0313, 0.046, -0.04), (0.0012, 0.0016, 0.31), 'gold', bev=0)
    g.cut(rc, g.prof('cut_eject', rrect(0.020, 0.040, 0.050, 0.016, 0.003, 2), 0.026, 0.04, cutter=True))
    g.rune('ingwaz', -1, -0.031, 0.080, 0.036, 0.016)
    g.cut(rc, g.prof('cut_ch', rrect(-0.130, 0.049, 0.075, 0.007, 0.0034, 2), -0.04, -0.028, cutter=True))
    g.cylx('ch_knob', -0.105, 0.049, 0.0055, -0.042, -0.029, n=12, bev=0.001)
    rt = g.rail(-0.195, 0.115, 0.064)
    lw = g.sym('lower', [(-0.198, 0.001), (0.130, 0.001), (0.130, -0.026), (0.104, -0.033), (-0.170, -0.033), (-0.198, -0.020)], 0.0285, 'polymer', bev=0.0022)
    # hand stop / short foregrip
    g.sym('handstop', chaikin([(-0.165, -0.030, 's'), (-0.120, -0.030, 's'), (-0.126, -0.050), (-0.140, -0.064), (-0.156, -0.058)], 1), 0.014, 'polymer', bev=0.002)
    # grip with mag through it
    gp = chaikin([(-0.026, -0.030, 's'), (0.048, -0.030, 's'), (0.050, -0.060), (0.053, -0.110), (0.051, -0.163), (0.041, -0.172), (-0.020, -0.172), (-0.030, -0.163),
                  (-0.031, -0.135), (-0.037, -0.118), (-0.031, -0.100), (-0.037, -0.082), (-0.031, -0.064)], 1)
    g.sym('grip', gp, 0.0195, 'polymer', bev=0.0022)
    g.bar('grip_safety', [(0.051, -0.040), (0.057, -0.080), (0.056, -0.110)], 0.006, -0.010, 0.010, bev=0.001)
    g.sym('mag', [(-0.016, -0.165), (0.040, -0.165), (0.038, -0.292), (-0.018, -0.292)], 0.0145, bev=0.0016)
    for k in range(4):
        y = -0.195 - k * 0.022
        g.bar('mag_rib', [(-0.012, y), (0.034, y)], 0.004, -0.0158, 0.0158, 'metal', bev=0.0006, seg=1)
    g.box('mag_window', (-0.0152, -0.235, 0.030), (0.0012, 0.08, 0.003), 'glow', bev=0)
    g.sym('mag_floor', [(-0.026, -0.288), (0.048, -0.288), (0.046, -0.300), (0.038, -0.305), (-0.020, -0.305), (-0.028, -0.298)], 0.0185, 'polymer', bev=0.0016)
    g.bar('tguard', [(-0.088, -0.032), (-0.092, -0.062), (-0.080, -0.076), (-0.045, -0.076), (-0.030, -0.060)], 0.0055, -0.0065, 0.0065, bev=0.0012)
    g.bar('trigger', [(-0.055, -0.032), (-0.057, -0.045), (-0.063, -0.056), (-0.070, -0.060)], 0.0045, -0.0035, 0.0035, 'gold', bev=0.0006)
    g.cylx('selector', -0.010, -0.016, 0.0065, -0.0305, -0.0285, n=12, bev=0.0005)
    g.bar('selector_lever', [(-0.010, -0.016), (-0.028, -0.010)], 0.0045, -0.0325, -0.0300, 'gold', bev=0)
    # folded side stock arms + hinge + rear cap
    g.sym('rear_cap', [(0.130, 0.060), (0.142, 0.056), (0.142, -0.022), (0.130, -0.028)], 0.030, bev=0.0016)
    for s in (-1, 1):
        g.bar('stock_arm', [(0.140, -0.010), (-0.080, -0.010), (-0.096, -0.020)], 0.008, s * 0.0285, s * 0.0335, bev=0.0012)
        g.cylx('arm_hinge', 0.140, -0.010, 0.0068, s * 0.0285, s * 0.0350, 'gold', n=10, bev=0)
    g.sym('butt_fold', [(-0.110, 0.000), (-0.088, 0.000), (-0.088, -0.030), (-0.110, -0.030)], 0.036, bev=0.002)
    g.bar('sling', [(0.142, 0.010), (0.156, 0.010), (0.156, 0.040), (0.142, 0.040)], 0.004, -0.010, 0.010, bev=0.0008)
    # front: knurled barrel nut, barrel, comp
    g.xsec('barrel_nut', fluted(0, by, 0.021, 12, 0.0016, land=0.55), -0.204, -0.226, bev=0.0006)
    g.tube('nut_ring', circle(0, by, 0.0215, 16), circle(0, by, 0.019, 16), -0.204, -0.207, 'gold', bev=0)
    g.lathe('barrel', [(0.0100, -0.224), (0.0100, -0.302)], 0, by, n=16, bev=0)
    g.brake('brake', by, -0.298, -0.330, 0.0145, ports=2, top_ports=1)
    g.optic(rt)
    g.anchors((0, -0.08, 0.01), (0, -0.16, -0.03))
    return g


def build_magnum():
    g = Gun('magnum', '#e879f9', (0.034, 0.022, 0.040))
    by = 0.030
    cy = 0.012
    fr = g.sym('frame', [(-0.082, 0.062), (-0.082, -0.022), (-0.064, -0.030), (0.040, -0.031), (0.060, -0.040), (0.096, -0.040), (0.094, -0.010), (0.080, 0.040),
                         (0.062, 0.062), (0.040, 0.068), (-0.060, 0.068)], 0.0175, bev=0.0018)
    g.sym('recoil_shield', [(0.022, -0.024), (0.034, -0.024), (0.034, 0.040), (0.022, 0.040)], 0.020, bev=0.0016)
    g.cylx('latch', 0.040, 0.020, 0.0055, -0.024, -0.0175, n=10, bev=0.0008)
    for s in (-1, 1):
        g.box('frame_trim', (s * 0.0178, 0.060, -0.010), (0.0012, 0.0016, 0.13), 'gold', bev=0)
    # fluted cylinder
    cs = fluted(0, cy, 0.034, 6, 0.006, land=0.42)
    sm = [(x * 0.9, cy + (y - cy) * 0.9) for x, y in cs]
    g.loft('cylinder', [(0.021, sm), (0.016, cs), (-0.066, cs), (-0.071, sm)], bev=0.0008)
    g.tube('cyl_ring', [(x * 1.012, cy + (y - cy) * 1.012) for x, y in cs], [(x * 0.97, cy + (y - cy) * 0.97) for x, y in cs], 0.012, 0.009, 'gold', bev=0)
    g.cylz('cyl_axis', 0, cy, 0.006, -0.070, -0.082, n=10, bev=0)
    # barrel with full underlug + vent rib
    bsec = [(0.0175, 0.048), (0.012, 0.056), (-0.012, 0.056), (-0.0175, 0.048), (-0.0175, 0.014), (-0.013, 0.008), (-0.013, -0.006),
            (-0.009, -0.012), (0.009, -0.012), (0.013, -0.006), (0.013, 0.008), (0.0175, 0.014)]
    bl = g.loft('barrel', [(-0.078, bsec), (-0.418, bsec), (-0.426, [(x * 0.92, 0.022 + (y - 0.022) * 0.92) for x, y in bsec])], bev=0.0016)
    for s in (-1, 1):
        g.cut(bl, g.prof('cut_groove', rrect(-0.245, 0.031, 0.240, 0.012, 0.005, 2), s * 0.0158, s * 0.03, cutter=True))
        g.box('groove_glow', (s * 0.0160, 0.031, -0.245), (0.0012, 0.0024, 0.20), 'glow', bev=0)
    for k, gl in enumerate(['gebo', 'naud', 'gebo']):
        g.rune(gl, -1, -0.013, -0.395 + k * 0.012, 0.0005, 0.009, 'gold')
    g.cut(bl, g.cylz('cut_bore', 0, by, 0.0075, -0.44, -0.40, n=12, cutter=True))
    for k in range(3):
        g.cut(bl, g.prof('cut_port', rrect(-0.385 - k * 0.012, 0.058, 0.0055, 0.030, 0.0027, 2), -0.0045, 0.0045, cutter=True))
    rib = g.sym('vent_rib', [(-0.360, 0.055), (-0.085, 0.055), (-0.085, 0.067), (-0.355, 0.067)], 0.0065, bev=0.0008)
    for k in range(7):
        g.cut(rib, g.prof('cut_rib', rrect(-0.330 + k * 0.034, 0.061, 0.022, 0.006, 0.0025, 2), -0.02, 0.02, cutter=True))
    g.sym('front_sight', [(-0.372, 0.055), (-0.356, 0.055), (-0.360, 0.072), (-0.368, 0.072)], 0.003, 'gold', bev=0.0005)
    g.brake('brake', by, -0.424, -0.455, 0.0185, ports=2, square=True, w=0.034, h=0.046, top_ports=0)
    rt = g.rail(-0.060, 0.058, 0.062, skip=(-0.1, 0.1))
    # hammer, guard, trigger
    g.sym('hammer', chaikin([(0.058, 0.040, 's'), (0.068, 0.070), (0.084, 0.080), (0.094, 0.075), (0.080, 0.062), (0.072, 0.040, 's')], 1), 0.006, bev=0.0008)
    g.bar('tguard', [(-0.020, -0.030), (-0.024, -0.054), (-0.010, -0.068), (0.024, -0.068), (0.044, -0.052), (0.050, -0.036)], 0.0055, -0.0065, 0.0065, bev=0.0012)
    g.bar('trigger', [(0.016, -0.030), (0.014, -0.043), (0.008, -0.054), (0.001, -0.058)], 0.005, -0.0035, 0.0035, 'gold', bev=0.0006)
    # wrap-around grip
    gp = chaikin([(0.040, -0.030, 's'), (0.095, -0.036, 's'), (0.100, -0.050), (0.112, -0.090), (0.125, -0.135), (0.128, -0.160), (0.114, -0.170), (0.080, -0.168),
                  (0.070, -0.155), (0.061, -0.124), (0.064, -0.108), (0.054, -0.094), (0.057, -0.078), (0.047, -0.064), (0.043, -0.048)], 1)
    g.sym('grip', gp, 0.0195, 'polymer', bev=0.0025)
    g.sym('grip_cap', [(0.078, -0.162), (0.116, -0.165), (0.130, -0.158), (0.127, -0.172), (0.114, -0.178), (0.080, -0.176)], 0.0205, bev=0.0012)
    for s in (-1, 1):
        g.prof('grip_medal', circle(0.090, -0.100, 0.0085, 12), s * 0.0195, s * 0.0205, 'gold', bev=0.0005)
        g.prof('grip_medal_in', circle(0.090, -0.100, 0.0042, 8), s * 0.0204, s * 0.0209, 'glow', bev=0)
    g.optic(rt)
    g.anchors((0, -0.09, 0.08), (-0.02, -0.12, 0.09))
    return g


BUILDERS = {'m4a1': build_m4a1, 'ak47': build_ak47, 'p90': build_p90, 'kriss': build_kriss, 'uzi': build_uzi, 'magnum': build_magnum}


# ============================================================================ preview
def setup_preview():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 900, 500
    sc.render.resolution_percentage = 100
    ee = sc.eevee
    ee.taa_render_samples = 64
    ee.use_gtao = True
    ee.gtao_distance = 0.05
    ee.use_ssr = True
    ee.use_bloom = True
    ee.bloom_intensity = 0.04
    ee.use_soft_shadows = True
    ee.shadow_cube_size = '2048'
    sc.view_settings.view_transform = 'Filmic'
    sc.view_settings.look = 'Medium High Contrast'
    w = bpy.data.worlds.new('studio')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.03, 0.032, 0.036, 1)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (0.55, 0.57, 0.6, 1)
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -1
    mr.inputs['From Max'].default_value = 1
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.8

    def area(name, loc, energy, size, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = energy
        ld.size = size
        ld.color = color
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        sc.collection.objects.link(ob)
        tr = ob.constraints.new('TRACK_TO')
        tr.target = TARGET
        tr.track_axis = 'TRACK_NEGATIVE_Z'
        tr.up_axis = 'UP_Y'
        return ob

    global TARGET
    TARGET = bpy.data.objects.new('target', None)
    sc.collection.objects.link(TARGET)
    area('key', (-0.9, 0.5, 0.9), 60, 0.8, (1.0, 0.97, 0.92))
    area('fill', (0.9, 0.4, 0.3), 18, 1.2, (0.85, 0.9, 1.0))
    area('rim', (0.2, -1.0, 0.6), 45, 0.6, (0.9, 0.95, 1.0))
    area('top', (0.0, 0.0, 1.2), 25, 1.5)
    cd = bpy.data.cameras.new('cam')
    cd.lens = 70
    cam = bpy.data.objects.new('cam', cd)
    sc.collection.objects.link(cam)
    tr = cam.constraints.new('TRACK_TO')
    tr.target = TARGET
    tr.track_axis = 'TRACK_NEGATIVE_Z'
    tr.up_axis = 'UP_Y'
    sc.camera = cam
    return cam


def render_views(gun, cam):
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for o in gun.objs:
        for v in o.bound_box:
            w = o.matrix_world @ Vector(v)
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
    c = (mn + mx) / 2
    L = max((mx - mn).length, 0.3)
    TARGET.location = c
    views = {'': Vector((-1.0, 0.42, 0.30)), '_r': Vector((1.0, 0.30, 0.22)), '_fp': Vector((-0.35, -1.0, 0.32))}
    for suf, d in views.items():
        d = d.normalized()
        dist = max(L, 0.5) * (1.9 if suf != '_fp' else 1.6)
        cam.location = c + d * dist
        bpy.context.scene.render.filepath = os.path.join(PREVIEW_DIR, f'{gun.id}{suf}.png')
        bpy.ops.render.render(write_still=True)


# ============================================================================ main
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    report = []
    for gid in ONLY:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        gun = BUILDERS[gid]()
        tris = gun.finalize()
        path = os.path.join(OUT_DIR, f'weapon_{gid}.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                                  export_normals=True, export_tangents=False, export_cameras=False, export_lights=False)
        report.append(f'[WEAPONS-V2] {gid}: {tris} tris, {len(gun.objs)} meshes -> {path}')
        print(report[-1])
        if DO_RENDER:
            cam = setup_preview()
            render_views(gun, cam)
    print('\n'.join(report))


main()
