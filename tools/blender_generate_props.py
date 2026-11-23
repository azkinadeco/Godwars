"""
GOD WARS — ENVIRONMENT PROP KIT generator (Blender 3.6, headless)
==================================================================
Military / industrial + Norse "divine-tech" set dressing for streets and compounds.

  kit_crate_large   kit_crate_small   kit_barrel     kit_barrier
  kit_sandbags      kit_generator     kit_antenna    kit_ac_unit
  kit_spool         kit_lamppost      kit_rune_banner kit_market_stall

Conventions: metres, Blender Z-up built so that the front faces Blender -Y, which the
glTF exporter (export_yup) turns into glTF +Z. Origin = centre of the footprint on the
ground (lowest point is y = 0). Every prop: <= 4 PBR-factor materials named
kit_<prop>_<role> (role contains metal / paint / concrete / wood / cloth / glow),
bevelled hard edges + weighted normals, joined per material.

Usage:
  Blender -b --factory-startup -P tools/blender_generate_props.py [-- names... --no-render]
Preview: /tmp/gw/props_preview/<name>.png and sheet.png (1600x900 contact sheet)
"""

import bpy
import bmesh
import math
import os
import sys
import random
from mathutils import Vector, Matrix, Euler, noise

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = os.path.join(ROOT, 'assets', 'models')
PREVIEW_DIR = '/tmp/gw/props_preview'
DO_RENDER = '--no-render' not in ARGV
TAU = math.pi * 2


def V(*a):
    return Vector(a)


def rotm(rot):
    return Euler(rot).to_matrix().to_4x4()


def bez(p0, p1, p2, p3, n):
    p0, p1, p2, p3 = map(Vector, (p0, p1, p2, p3))
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append(p0 * u ** 3 + p1 * 3 * u * u * t + p2 * 3 * u * t * t + p3 * t ** 3)
    return out


RUNES = {
    'algiz': [((0.5, 0), (0.5, 1)), ((0.5, 0.5), (0.1, 0.95)), ((0.5, 0.5), (0.9, 0.95))],
    'tiwaz': [((0.5, 0), (0.5, 1)), ((0.5, 1), (0.12, 0.62)), ((0.5, 1), (0.88, 0.62))],
    'sowilo': [((0.75, 1), (0.25, 0.62)), ((0.25, 0.62), (0.75, 0.38)), ((0.75, 0.38), (0.25, 0))],
    'ingwaz': [((0.5, 0), (0.1, 0.5)), ((0.1, 0.5), (0.5, 1)), ((0.5, 1), (0.9, 0.5)), ((0.9, 0.5), (0.5, 0))],
}


# ============================================================================ kit builder
class Kit:
    def __init__(self, name):
        self.name = name
        self.objs = []
        self.cutters = []
        self.M = {}

    # ---------------------------------------------------------------- materials
    def mat(self, role, col, metal=0.0, rough=0.6, emit=None, double=False):
        m = bpy.data.materials.new(f'kit_{self.name}_{role}')
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*col, 1)
        b.inputs['Metallic'].default_value = metal
        b.inputs['Roughness'].default_value = rough
        b.inputs['Specular'].default_value = 0.5
        if emit:
            b.inputs['Emission'].default_value = (*emit, 1)
            b.inputs['Emission Strength'].default_value = 1.0
        m.use_backface_culling = not double
        m.diffuse_color = (*col, 1)
        self.M[role] = m
        return m

    # ---------------------------------------------------------------- core
    def _obj(self, bm, mat, bev=0.0, seg=1, ang=30, smooth_ang=40, cutter=False, solid=0.0, name='p'):
        if '--debug' in ARGV:
            f = sys._getframe(1)
            while f.f_code.co_name in ('mesh', 'box', 'cyl', 'beam', 'lathe', 'prism', 'loft', 'tube', 'sheet', 'bag', 'strip', '<lambda>', 'line', 'small_crate', 'coil'):
                f = f.f_back
            name = f'L{f.f_lineno}'
        me = bpy.data.meshes.new(name)
        bm.normal_update()
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
            p.use_smooth = True
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(smooth_ang)
        ob['bev'] = bev
        ob['seg'] = seg
        ob['ang'] = ang
        ob['solid'] = solid
        self.objs.append(ob)
        return ob

    def mesh(self, verts, faces, mat, recalc=True, **kw):
        bm = bmesh.new()
        vs = [bm.verts.new(Vector(v)) for v in verts]
        for f in faces:
            try:
                bm.faces.new([vs[i] for i in f])
            except ValueError:
                pass
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._obj(bm, mat, **kw)

    def box(self, c, s, mat='paint', bev=0.01, seg=2, rot=(0, 0, 0), **kw):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(s), verts=bm.verts)
        bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(c)) @ rotm(rot), verts=bm.verts)
        return self._obj(bm, mat, bev=bev, seg=seg, **kw)

    def cyl(self, c, r, h, mat='metal', axis='Z', n=16, r2=None, bev=0.004, seg=1, rot=None, **kw):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=n, radius1=r,
                              radius2=r if r2 is None else r2, depth=h)
        R = {'Z': (0, 0, 0), 'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0)}[axis]
        M = Matrix.Translation(Vector(c)) @ (rotm(rot) if rot else Matrix()) @ rotm(R)
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
        return self._obj(bm, mat, bev=bev, seg=seg, **kw)

    def beam(self, p0, p1, w, h=None, mat='metal', bev=0.0, seg=1, **kw):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(w, h or w, d.length), verts=bm.verts)
        q = d.to_track_quat('Z', 'Y')
        bmesh.ops.transform(bm, matrix=Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4(), verts=bm.verts)
        return self._obj(bm, mat, bev=bev, seg=seg, **kw)

    def lathe(self, prof, mat='metal', n=16, c=(0, 0, 0), axis='Z', closed=False, a0=0.0, rot=None, **kw):
        """prof: list of (r, z). r==0 at the ends -> pole. closed -> torus-like ring."""
        verts, faces, rings = [], [], []
        for r, z in prof:
            if r < 1e-6 and not closed:
                rings.append([len(verts)])
                verts.append((0, 0, z))
            else:
                ring = []
                for k in range(n):
                    a = a0 + TAU * k / n
                    ring.append(len(verts))
                    verts.append((r * math.cos(a), r * math.sin(a), z))
                rings.append(ring)
        segs = len(rings) if closed else len(rings) - 1
        for i in range(segs):
            A, B = rings[i], rings[(i + 1) % len(rings)]
            if len(A) == 1 and len(B) == 1:
                continue
            for k in range(n):
                k1 = (k + 1) % n
                if len(A) == 1:
                    faces.append([A[0], B[k], B[k1]])
                elif len(B) == 1:
                    faces.append([A[k], B[0], A[k1]])
                else:
                    faces.append([A[k], B[k], B[k1], A[k1]])
        if not closed:
            if len(rings[0]) > 1:
                faces.append(rings[0][::-1])
            if len(rings[-1]) > 1:
                faces.append(rings[-1])
        R = {'Z': (0, 0, 0), 'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), '-Y': (-math.pi / 2, 0, 0)}[axis]
        M = Matrix.Translation(Vector(c)) @ (rotm(rot) if rot else Matrix()) @ rotm(R)
        verts = [M @ Vector(v) for v in verts]
        kw.setdefault('bev', 0.0)
        return self.mesh(verts, faces, mat, **kw)

    def prism(self, pts, a0, a1, mat='paint', axis='X', **kw):
        """2D polygon extruded. axis X: pts=(y,z); Y: pts=(x,z); Z: pts=(x,y)."""
        def P(u, v, w):
            return {'X': (w, u, v), 'Y': (u, w, v), 'Z': (u, v, w)}[axis]
        n = len(pts)
        verts = [P(u, v, a0) for u, v in pts] + [P(u, v, a1) for u, v in pts]
        faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
        faces += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        return self.mesh(verts, faces, mat, **kw)

    def loft(self, secs, mat='paint', cap=True, **kw):
        n = len(secs[0])
        verts, faces = [], []
        for s in secs:
            verts += [tuple(p) for p in s]
        for s in range(len(secs) - 1):
            a, b = s * n, (s + 1) * n
            faces += [[a + i, a + (i + 1) % n, b + (i + 1) % n, b + i] for i in range(n)]
        if cap:
            faces.append(list(range(n)))
            last = (len(secs) - 1) * n
            faces.append(list(range(last + n - 1, last - 1, -1)))
        return self.mesh(verts, faces, mat, **kw)

    def tube(self, pts, r, mat='metal', n=8, cap=True, **kw):
        pts = [Vector(p) for p in pts]
        t0 = (pts[1] - pts[0]).normalized()
        up = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
        nrm = t0.cross(up).normalized()
        verts, faces = [], []
        for i, p in enumerate(pts):
            if i == 0:
                t = (pts[1] - pts[0]).normalized()
            elif i == len(pts) - 1:
                t = (pts[-1] - pts[-2]).normalized()
            else:
                t = ((pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()).normalized()
            nrm = (nrm - t * nrm.dot(t)).normalized()
            b = t.cross(nrm)
            rr = r(i / (len(pts) - 1)) if callable(r) else r
            for k in range(n):
                a = TAU * k / n
                verts.append(p + (nrm * math.cos(a) + b * math.sin(a)) * rr)
        for i in range(len(pts) - 1):
            a, b = i * n, (i + 1) * n
            faces += [[a + k, a + (k + 1) % n, b + (k + 1) % n, b + k] for k in range(n)]
        if cap:
            faces.append(list(range(n))[::-1])
            last = (len(pts) - 1) * n
            faces.append(list(range(last, last + n)))
        kw.setdefault('bev', 0.0)
        return self.mesh(verts, faces, mat, **kw)

    def sheet(self, fn, nu, nv, mat, solid=0.006, **kw):
        verts, faces = [], []
        for j in range(nv + 1):
            for i in range(nu + 1):
                verts.append(tuple(fn(i / nu, j / nv)))
        W = nu + 1
        for j in range(nv):
            for i in range(nu):
                faces.append([j * W + i, j * W + i + 1, (j + 1) * W + i + 1, (j + 1) * W + i])
        kw.setdefault('smooth_ang', 80)
        return self.mesh(verts, faces, mat, recalc=False, solid=solid, **kw)

    def bag(self, c, yaw, L, D, H, mat, seed, nseg=8, tilt=0.0):
        """Soft lumpy sandbag / sack: superellipsoid with pinched ends + noise."""
        ts = [-0.96, -0.82, -0.55, -0.22, 0.12, 0.45, 0.75, 0.93]
        verts, faces = [(-L / 2, 0, 0)], []
        rng = random.Random(seed)
        off = Vector((rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)))
        for t in ts:
            s = (1 - abs(t) ** 5) ** 0.32
            for k in range(nseg):
                a = TAU * (k + 0.5) / nseg
                ca, sa = math.cos(a), math.sin(a)
                y = D / 2 * math.copysign(abs(ca) ** 0.55, ca) * s
                z = H / 2 * math.copysign(abs(sa) ** 0.6, sa) * s
                y *= 1.0 + 0.12 * max(0.0, -z / (H / 2))   # belly sag
                z = max(z, -H * 0.40)                       # flattened under weight
                if z > H * 0.36:
                    z = H * 0.36 + (z - H * 0.36) * 0.4
                p = Vector((L / 2 * t, y, z))
                p += Vector((0, y, z * 0.6)).normalized() * (noise.noise(p * 7.0 + off) * 0.02 + noise.noise(p * 16.0 + off) * 0.007) if (y or z) else Vector()
                verts.append(tuple(p))
        verts.append((L / 2, 0, 0))
        N = len(ts)
        for i in range(N - 1):
            a, b = 1 + i * nseg, 1 + (i + 1) * nseg
            faces += [[a + k, b + k, b + (k + 1) % nseg, a + (k + 1) % nseg] for k in range(nseg)]
        last = len(verts) - 1
        for k in range(nseg):
            faces.append([0, 1 + k, 1 + (k + 1) % nseg][::-1])
            e = 1 + (N - 1) * nseg
            faces.append([last, e + (k + 1) % nseg, e + k][::-1])
        M = Matrix.Translation(Vector(c)) @ rotm((tilt, 0, yaw))
        verts = [M @ Vector(v) for v in verts]
        return self.mesh(verts, faces, mat, smooth_ang=85)

    def cut(self, target, cutter):
        m = target.modifiers.new('cut', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.solver = 'EXACT'
        m.object = cutter

    def strip(self, path, w, mat, lift=0.0, normal=None, **kw):
        """Flat ribbon along a 3D polyline (for glow lines on surfaces)."""
        pts = [Vector(p) for p in path]
        verts, faces = [], []
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            nn = normal(p) if callable(normal) else Vector(normal)
            side = t.cross(nn).normalized()
            q = p + nn * lift
            verts += [q + side * w / 2, q - side * w / 2]
        nn0 = normal(pts[0]) if callable(normal) else Vector(normal)
        fn = (verts[1] - verts[0]).cross(verts[3] - verts[0])
        flip = fn.dot(nn0) < 0
        for i in range(len(pts) - 1):
            f = [2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2]
            faces.append(f[::-1] if flip else f)
        return self.mesh(verts, faces, mat, recalc=False, **kw)

    # ---------------------------------------------------------------- finalize
    def finalize(self):
        for ob in self.objs:
            mods = []
            if ob['bev'] > 0:
                b = ob.modifiers.new('bevel', 'BEVEL')
                b.width = ob['bev']
                b.segments = ob['seg']
                b.limit_method = 'ANGLE'
                b.angle_limit = math.radians(ob['ang'])
                b.use_clamp_overlap = True
                b.miter_outer = 'MITER_ARC'
                b.harden_normals = False
                if len(ob.modifiers) > 1:
                    with bpy.context.temp_override(object=ob, active_object=ob):
                        bpy.ops.object.modifier_move_to_index(modifier='bevel', index=0)
            if ob['solid'] > 0:
                s = ob.modifiers.new('solid', 'SOLIDIFY')
                s.thickness = ob['solid']
                s.offset = 0.0
                s.use_even_offset = True
            wn = ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
            wn.keep_sharp = True
            wn.weight = 50
            for m in list(ob.modifiers):
                with bpy.context.temp_override(object=ob, active_object=ob):
                    bpy.ops.object.modifier_apply(modifier=m.name)
        if '--debug' in ARGV:
            agg = {}
            for ob in self.objs:
                key = ob.name.split('.')[0]
                agg[key] = agg.get(key, 0) + sum(len(p.vertices) - 2 for p in ob.data.polygons)
            print('DBG', self.name, sorted(agg.items(), key=lambda kv: -kv[1])[:30])
        for c in self.cutters:
            bpy.data.objects.remove(c, do_unlink=True)
        self.cutters = []
        groups = {}
        for ob in self.objs:
            if len(ob.data.polygons) == 0:
                continue
            groups.setdefault(ob.data.materials[0].name, []).append(ob)
        joined = []
        for mname, obs in groups.items():
            tgt = obs[0]
            if len(obs) > 1:
                with bpy.context.temp_override(active_object=tgt, object=tgt, selected_objects=obs,
                                               selected_editable_objects=obs):
                    bpy.ops.object.join()
            tgt.name = mname
            tgt.data.name = mname
            joined.append(tgt)
        self.objs = joined
        # ground the prop: lowest point -> z 0
        zmin = min(min((o.matrix_world @ v.co).z for v in o.data.vertices) for o in joined)
        for o in joined:
            o.data.transform(Matrix.Translation((0, 0, -zmin)))
        return self.stats()

    def stats(self):
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in self.objs)
        mn = Vector((1e9,) * 3)
        mx = Vector((-1e9,) * 3)
        for o in self.objs:
            for v in o.data.vertices:
                mn = Vector(map(min, mn, v.co))
                mx = Vector(map(max, mx, v.co))
        return tris, mn, mx


# ============================================================================ PROPS
def crate_large():
    k = Kit('crate_large')
    k.mat('paint', (0.135, 0.15, 0.075), 0.0, 0.62)
    k.mat('metal', (0.30, 0.30, 0.31), 0.8, 0.42)
    k.mat('mark_paint', (0.42, 0.37, 0.25), 0.0, 0.75)
    W, D, H, SK = 1.6, 1.2, 1.2, 0.09   # SK: skid height
    t = 0.085                            # frame beam
    z0 = SK
    # recessed core
    k.box((0, 0, (z0 + H) / 2), (W - 0.05, D - 0.05, H - z0 - 0.02), 'paint', bev=0.008, seg=1)
    # skids
    for y in (-0.38, 0.38):
        k.box((0, y, SK / 2), (W - 0.06, 0.16, SK), 'paint', bev=0.012, seg=1)
    for x in (-0.6, 0.0, 0.6):
        k.box((x, 0, SK / 2 + 0.01), (0.12, D - 0.12, SK - 0.02), 'paint', bev=0.01, seg=1)
    # frame: 4 verticals + bottom ring + top ring + lid seam ring
    hx, hy = W / 2 - t / 2, D / 2 - t / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box((sx * hx, sy * hy, (z0 + H) / 2), (t, t, H - z0), 'paint', bev=0.014, seg=1)
    LID = H - 0.2
    for zc, th in ((z0 + t / 2, t), (H - t / 2, t), (LID + 0.0, 0.07)):
        k.box((0, -hy, zc), (W - 2 * t + 0.002, t * 0.9, th), 'paint', bev=0.01, seg=1)
        k.box((0, hy, zc), (W - 2 * t + 0.002, t * 0.9, th), 'paint', bev=0.01, seg=1)
        k.box((-hx, 0, zc), (t * 0.9, D - 2 * t + 0.002, th), 'paint', bev=0.01, seg=1)
        k.box((hx, 0, zc), (t * 0.9, D - 2 * t + 0.002, th), 'paint', bev=0.01, seg=1)
    # lid seam groove (dark gap strip)
    k.box((0, 0, LID - 0.003), (W - 0.03, D - 0.03, 0.012), 'metal', bev=0.0)
    # top: lid planks raised panel + cross ribs
    k.box((0, 0, H - 0.005), (W - 0.22, D - 0.22, 0.03), 'paint', bev=0.01, seg=1)
    k.box((0, 0, H + 0.008), (0.08, D - 0.2, 0.03), 'paint', bev=0.008, seg=1)
    # vertical mid-ribs on long faces + diagonal-less panel braces on ends
    for sy in (-1, 1):
        k.box((0, sy * (D / 2 - 0.035), (z0 + t + LID - 0.07) / 2), (0.09, 0.07, LID - 0.07 - z0 - t), 'paint', bev=0.01, seg=1)
    for sx in (-1, 1):
        k.box((sx * (W / 2 - 0.035), 0, (z0 + t + LID - 0.07) / 2), (0.07, 0.08, LID - 0.07 - z0 - t), 'paint', bev=0.01, seg=1)
    # corner caps (metal, 8)
    cs = 0.15
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz, zc in ((-1, cs / 2 + z0 - 0.01), (1, H - cs / 2 + 0.012)):
                k.box((sx * (W / 2 - cs / 2 + 0.008), sy * (D / 2 - cs / 2 + 0.008), zc), (cs, cs, cs), 'metal', bev=0.014, seg=1)
    # latches on front & back
    for sy in (-1, 1):
        y = sy * (D / 2 + 0.012)
        for x in (-0.45, 0.45):
            k.box((x, y, LID - 0.07), (0.12, 0.02, 0.1), 'metal', bev=0.0)
            k.box((x, y + sy * 0.012, LID + 0.01), (0.07, 0.022, 0.13), 'metal', bev=0.006, seg=1)
            k.cyl((x, y + sy * 0.016, LID - 0.05), 0.018, 0.08, 'metal', axis='X', n=8, bev=0)
            k.box((x, y, LID + 0.09), (0.09, 0.018, 0.04), 'metal', bev=0)
    # end handles (metal U-bars)
    for sx in (-1, 1):
        x = sx * (W / 2 + 0.005)
        for zc in (H * 0.62,):
            pts = [(x, -0.2, zc), (x + sx * 0.05, -0.17, zc - 0.02), (x + sx * 0.065, -0.1, zc - 0.03),
                   (x + sx * 0.065, 0.1, zc - 0.03), (x + sx * 0.05, 0.17, zc - 0.02), (x, 0.2, zc)]
            k.tube(pts, 0.016, 'metal', n=6)
            for y in (-0.2, 0.2):
                k.box((x, y, zc), (0.02, 0.07, 0.09), 'metal', bev=0.005, seg=1)
    # stencil-like emboss marks (front + top)
    yf = -(D / 2 - 0.01)
    k.box((-0.4, yf - 0.004, 0.62), (0.56, 0.012, 0.035), 'mark_paint', bev=0)
    for i, (x, w, h) in enumerate([(-0.62, 0.05, 0.14), (-0.54, 0.05, 0.14), (-0.44, 0.09, 0.05), (-0.31, 0.05, 0.14), (-0.22, 0.05, 0.1)]):
        k.box((x, yf - 0.004, 0.46 + h / 2), (w, 0.012, h), 'mark_paint', bev=0)
    # chevron on right panel
    k.beam((0.25, yf - 0.006, 0.66), (0.38, yf - 0.006, 0.5), 0.045, 0.012, 'mark_paint')
    k.beam((0.38, yf - 0.006, 0.5), (0.51, yf - 0.006, 0.66), 0.045, 0.012, 'mark_paint')
    k.box((0, 0, H + 0.025), (0.5, 0.06, 0.006), 'mark_paint', bev=0.0)
    return k


def crate_small():
    k = Kit('crate_small')
    k.mat('paint', (0.085, 0.11, 0.095), 0.0, 0.5)
    k.mat('metal', (0.30, 0.30, 0.31), 0.8, 0.4)
    k.mat('mark_paint', (0.5, 0.42, 0.12), 0.0, 0.7)
    W, D, H = 0.9, 0.6, 0.6
    SEAM = 0.46
    k.box((0, 0, 0.0175), (W - 0.1, D - 0.14, 0.035), 'metal', bev=0.006, seg=1)
    for x in (-0.33, 0.33):
        k.box((x, 0, 0.02), (0.08, D - 0.04, 0.04), 'paint', bev=0.01, seg=1)
    k.box((0, 0, 0.035 + (SEAM - 0.035) / 2), (W, D, SEAM - 0.035), 'paint', bev=0.022, seg=2)
    k.box((0, 0, SEAM + 0.01), (W - 0.03, D - 0.03, 0.04), 'metal', bev=0.0)           # seam core
    k.box((0, 0, SEAM + 0.008 + (H - SEAM - 0.008) / 2), (W + 0.012, D + 0.012, H - SEAM - 0.008), 'paint', bev=0.024, seg=2)
    # lid top raised panel
    k.box((0, 0, H + 0.006), (W - 0.16, D - 0.16, 0.02), 'paint', bev=0.008, seg=1)
    # pressed ribs front/back
    for sy in (-1, 1):
        for zc in (0.14, 0.34):
            k.box((0, sy * (D / 2 + 0.006), zc), (W - 0.14, 0.02, 0.03), 'paint', bev=0.009, seg=1)
    # end ribs (vertical) + handles
    for sx in (-1, 1):
        x = sx * (W / 2 + 0.006)
        for y in (-0.17, 0.17):
            k.box((x, y, SEAM / 2 + 0.02), (0.02, 0.035, SEAM - 0.08), 'paint', bev=0.008, seg=1)
        zc = 0.36
        pts = [(x, -0.11, zc), (x + sx * 0.045, -0.09, zc - 0.035), (x + sx * 0.055, 0, zc - 0.05),
               (x + sx * 0.045, 0.09, zc - 0.035), (x, 0.11, zc)]
        k.tube(pts, 0.012, 'metal', n=6)
        for y in (-0.11, 0.11):
            k.box((x, y, zc), (0.016, 0.04, 0.05), 'metal', bev=0.004, seg=1)
    # front latch
    for x in (-0.24, 0.24):
        k.box((x, -D / 2 - 0.012, SEAM - 0.03), (0.07, 0.016, 0.07), 'metal', bev=0.004, seg=1)
        k.box((x, -D / 2 - 0.018, SEAM + 0.04), (0.045, 0.016, 0.09), 'metal', bev=0.004, seg=1)
    # stencil band
    k.box((0, -D / 2 - 0.0125, 0.24), (0.36, 0.004, 0.04), 'mark_paint', bev=0.0)
    k.box((0.3, -D / 2 - 0.0125, 0.24), (0.06, 0.004, 0.09), 'mark_paint', bev=0.0)
    k.box((0, 0, H + 0.017), (W - 0.3, 0.035, 0.004), 'mark_paint', bev=0.0)
    return k


def barrel():
    k = Kit('barrel')
    k.mat('paint', (0.16, 0.045, 0.03), 0.15, 0.48)
    k.mat('band_paint', (0.32, 0.22, 0.03), 0.1, 0.55)
    k.mat('metal', (0.40, 0.40, 0.42), 0.8, 0.38)
    R = 0.285

    def rib(z):
        return [(R, z - 0.022), (R + 0.006, z - 0.013), (R + 0.011, z), (R + 0.006, z + 0.013), (R, z + 0.022)]
    prof = [(0, 0.028), (0.262, 0.028), (0.27, 0.012), (0.282, 0.0), (0.296, 0.004), (0.302, 0.02),
            (0.298, 0.036), (R, 0.05)]
    prof += rib(0.3) + rib(0.6)
    prof += [(R, 0.85), (0.298, 0.864), (0.302, 0.88), (0.296, 0.896), (0.282, 0.9), (0.27, 0.888), (0.262, 0.872), (0, 0.872)]
    k.lathe(prof, 'paint', n=28, smooth_ang=50)
    # painted band between ribs
    k.lathe([(R + 0.0015, 0.66), (R + 0.0015, 0.76)], 'band_paint', n=28, smooth_ang=50)
    # closing ring at top
    k.lathe([(0.3, 0.858), (0.309, 0.862), (0.311, 0.88), (0.309, 0.897), (0.3, 0.9), (0.296, 0.88)], 'metal', n=28, closed=True, smooth_ang=50)
    k.box((0.31, 0, 0.879), (0.03, 0.05, 0.038), 'metal', bev=0.005, seg=1)
    k.cyl((0.326, 0, 0.879), 0.008, 0.08, 'metal', axis='Y', n=6, bev=0)
    # bung caps
    for a, r in ((0.6, 0.032), (0.6 + math.pi * 0.85, 0.022)):
        x, y = 0.19 * math.cos(a), 0.19 * math.sin(a)
        k.lathe([(0, 0.892), (r, 0.892), (r, 0.874), (r + 0.01, 0.874), (r + 0.01, 0.872)], 'metal', n=8, c=(x, y, 0), smooth_ang=30)
        k.box((x, y, 0.895), (r * 1.2, 0.008, 0.008), 'metal', bev=0, rot=(0, 0, a))
    return k


def barrier():
    k = Kit('barrier')
    k.mat('concrete', (0.33, 0.32, 0.30), 0.0, 0.93)
    k.mat('metal', (0.22, 0.2, 0.18), 0.75, 0.6)
    k.mat('paint', (0.42, 0.30, 0.04), 0.0, 0.7)
    L, H = 2.0, 0.8
    half = [(0.3, 0.0), (0.3, 0.075), (0.175, 0.31), (0.085, 0.8)]
    prof = half + [(-y, z) for y, z in reversed(half)]
    prof = [(y, z) for y, z in prof]

    def sec(x, s, dz=0.0):
        return [(x, y * s, min(z, H - dz) if z > 0 else 0) for y, z in prof]
    secs = [sec(-L / 2, 0.86, 0.03), sec(-L / 2 + 0.035, 1.0), sec(L / 2 - 0.035, 1.0), sec(L / 2, 0.86, 0.03)]
    body = k.loft(secs, 'concrete', bev=0.018, seg=2, ang=20)
    # lifting / drain slots through the base
    for x in (-0.55, 0.55):
        c = k.box((x, 0, 0.035), (0.3, 0.9, 0.07), cutter=True)
        k.cut(body, c)
    # chips on edges
    rng = random.Random(7)
    for i in range(9):
        x = rng.uniform(-0.9, 0.9)
        side = rng.choice((-1, 1))
        if i < 5:
            p = (x, side * 0.085, 0.8)
        else:
            p = (x, side * 0.3, 0.075)
        c = k.box(p, (rng.uniform(0.06, 0.14), 0.05, 0.05), rot=(rng.uniform(0, 1), rng.uniform(0, 1), rng.uniform(-0.3, 0.3)), cutter=True)
        k.cut(body, c)
    # lifting loops (rebar)
    for x in (-0.55, 0.55):
        pts = [(x - 0.07, 0, 0.77), (x - 0.065, 0, 0.83), (x - 0.03, 0, 0.865), (x + 0.03, 0, 0.865), (x + 0.065, 0, 0.83), (x + 0.07, 0, 0.77)]
        k.tube(pts, 0.011, 'metal', n=6)
    # end connector plates
    for sx in (-1, 1):
        k.box((sx * (L / 2 + 0.004), 0, 0.55), (0.012, 0.13, 0.16), 'metal', bev=0.004, seg=1)
        k.cyl((sx * (L / 2 + 0.012), 0, 0.55), 0.025, 0.02, 'metal', axis='X', n=8, bev=0.003)
    # reflective hazard markers (both sides)
    for sy in (-1, 1):
        for x in (-0.82, 0.82):
            nrm = Vector((0, sy * (0.31 - 0.175), 0.8 - 0.31)).normalized()
            p = Vector((x, sy * 0.13, 0.555)) + nrm * 0.003
            k.box(p, (0.16, 0.006, 0.07), 'paint', bev=0.0, rot=(-sy * math.atan2(0.09, 0.49), 0, 0))
    return k


def sandbags():
    k = Kit('sandbags')
    k.mat('cloth', (0.29, 0.24, 0.15), 0.0, 0.95)
    k.mat('dark_cloth', (0.15, 0.15, 0.085), 0.0, 0.95)
    rng = random.Random(11)
    R = 3.0
    L, D, H = 0.6, 0.38, 0.25
    layers = [(-1.5, 4), (-1.0, 3), (-1.5, 4), (-1.0, 3)]
    pitch = 0.215
    seed = 0
    for li, (start, n) in enumerate(layers):
        for i in range(n):
            s = (start + i) * 0.53 + rng.uniform(-0.03, 0.03)
            th = s / R
            x = R * math.sin(th)
            y = -R * math.cos(th) + R + li * 0.035
            z = H * 0.4 + li * pitch + rng.uniform(-0.01, 0.01)
            m = 'cloth' if rng.random() < 0.6 else 'dark_cloth'
            k.bag((x, y, z), th + rng.uniform(-0.08, 0.08), L * rng.uniform(0.95, 1.05), D, H, m, seed,
                  tilt=rng.uniform(-0.05, 0.05))
            seed += 1
    # recentre footprint
    for o in k.objs:
        pass
    ys = []
    for o in k.objs:
        ys += [v.co.y for v in o.data.vertices]
    cy = (min(ys) + max(ys)) / 2
    for o in k.objs:
        o.data.transform(Matrix.Translation((0, -cy, 0)))
    return k


def generator():
    k = Kit('generator')
    k.mat('paint', (0.23, 0.15, 0.04), 0.0, 0.5)
    k.mat('metal', (0.34, 0.34, 0.35), 0.8, 0.42)
    k.mat('dark_metal', (0.05, 0.05, 0.055), 0.6, 0.5)
    k.mat('glow', (0.1, 0.9, 0.35), 0.0, 0.4, emit=(0.15, 1.0, 0.4))
    L, D = 1.8, 1.0
    # skid C-channels
    c = [(-0.05, 0), (0.05, 0), (0.05, 0.012), (-0.035, 0.012), (-0.035, 0.088), (0.05, 0.088), (0.05, 0.1), (-0.05, 0.1)]
    for sy in (-1, 1):
        pts = [(sy * 0.44 + yy * sy, z) for yy, z in c]
        if sy < 0:
            pts = pts[::-1]
        k.prism(pts, -L / 2, L / 2, 'dark_metal', axis='X', bev=0)
    for x in (-0.7, 0, 0.7):
        k.box((x, 0, 0.05), (0.08, 0.84, 0.08), 'dark_metal', bev=0)
    # forklift pockets
    for x in (-0.45, 0.45):
        k.box((x, 0, 0.065), (0.26, 0.96, 0.07), 'dark_metal', bev=0)
    # housing
    X0, X1, Y, Z0, Z1 = -0.82, 0.82, 0.45, 0.13, 1.2
    k.box((0, 0, 0.115), (1.66, 0.92, 0.03), 'dark_metal', bev=0.006, seg=1)
    k.box((0, 0, (Z0 + Z1) / 2), (X1 - X0, 2 * Y, Z1 - Z0), 'paint', bev=0.03, seg=3)
    k.box((0, 0, Z1 + 0.025), (X1 - X0 + 0.04, 2 * Y + 0.04, 0.05), 'paint', bev=0.018, seg=2)
    # door panels (front & back), louvres
    for sy in (-1, 1):
        yf = sy * (Y + 0.006)
        for xa, xb in ((-0.74, -0.05), (0.03, 0.74)):
            k.box(((xa + xb) / 2, yf, 0.66), (xb - xa, 0.012, 0.92), 'paint', bev=0.008, seg=1)
            # hinges
            for zc in (0.32, 1.0):
                k.cyl((xa + 0.02, yf + sy * 0.01, zc), 0.014, 0.08, 'metal', n=6, bev=0)
            # handle
            k.box((xb - 0.06, yf + sy * 0.018, 0.68), (0.03, 0.02, 0.14), 'metal', bev=0)
        # louvre bank on left door
        lx0, lx1, lz0, lz1 = -0.66, -0.13, 0.32, 0.98
        yl = yf + sy * 0.008
        k.box(((lx0 + lx1) / 2, yl - sy * 0.003, (lz0 + lz1) / 2), (lx1 - lx0, 0.008, lz1 - lz0), 'dark_metal', bev=0.0)
        for (a, b, ca, cb) in (((lx0 + lx1) / 2, lz0, lx1 - lx0 + 0.04, 0.025), ((lx0 + lx1) / 2, lz1, lx1 - lx0 + 0.04, 0.025)):
            k.box((a, yl + sy * 0.006, b), (ca, 0.022, cb), 'paint', bev=0)
        for xx in (lx0 - 0.0, lx1 + 0.0):
            k.box((xx, yl + sy * 0.006, (lz0 + lz1) / 2), (0.025, 0.022, lz1 - lz0 + 0.02), 'paint', bev=0)
        for i in range(7):
            zc = lz0 + 0.055 + i * (lz1 - lz0 - 0.11) / 6
            k.box(((lx0 + lx1) / 2, yl + sy * 0.008, zc), (lx1 - lx0 - 0.02, 0.012, 0.07), 'paint', bev=0,
                  rot=(sy * math.radians(40), 0, 0))
    # radiator grille on +X end
    xe = X1 + 0.006
    k.box((xe, 0, 0.66), (0.012, 0.78, 0.86), 'dark_metal', bev=0.004, seg=1)
    for i in range(11):
        zc = 0.27 + i * 0.078
        k.box((xe + 0.01, 0, zc), (0.012, 0.76, 0.05), 'paint', bev=0, rot=(0, math.radians(-35), 0))
    for yy in (-0.39, 0.39):
        k.box((xe + 0.012, yy, 0.66), (0.025, 0.03, 0.88), 'paint', bev=0)
    # control panel (-X end)
    xp = X0 - 0.012
    k.box((xp, 0, 0.78), (0.03, 0.56, 0.42), 'dark_metal', bev=0.008, seg=1)
    k.box((xp - 0.05, 0, 1.0), (0.11, 0.6, 0.02), 'paint', bev=0.006, seg=1)   # rain hood
    for yy in (-0.15, 0.0):
        k.cyl((xp - 0.018, yy, 0.86), 0.05, 0.012, 'metal', axis='X', n=12, bev=0)
        k.cyl((xp - 0.024, yy, 0.86), 0.04, 0.004, 'dark_metal', axis='X', n=12, bev=0)
        k.box((xp - 0.028, yy + 0.012, 0.87), (0.003, 0.03, 0.005), 'glow', bev=0, rot=(0.6, 0, 0))
    k.cyl((xp - 0.02, 0.17, 0.86), 0.028, 0.02, 'metal', axis='X', n=10, bev=0)
    k.cyl((xp - 0.032, 0.17, 0.86), 0.018, 0.012, 'glow', axis='X', n=10, bev=0)
    for i, yy in enumerate((-0.16, -0.08, 0.0, 0.08)):
        k.box((xp - 0.02, yy, 0.68), (0.02, 0.03, 0.05), 'metal', bev=0)
        k.box((xp - 0.035, yy, 0.69 + (0.01 if i % 2 else -0.005)), (0.025, 0.008, 0.02), 'metal', bev=0, rot=(0, 0.5, 0))
    k.cyl((xp - 0.02, 0.17, 0.67), 0.035, 0.03, 'metal', axis='X', n=10, bev=0)
    k.cyl((xp - 0.04, 0.17, 0.67), 0.024, 0.02, 'glow', axis='X', n=10, bev=0)
    # exhaust: muffler + pipe + rain cap
    my = 0.22
    for x in (0.38, 0.66):
        k.box((x, my, Z1 + 0.09), (0.04, 0.2, 0.08), 'dark_metal', bev=0.005, seg=1)
    k.cyl((0.52, my, Z1 + 0.17), 0.1, 0.42, 'dark_metal', axis='X', n=16, bev=0.012, seg=1)
    pts = [Vector((0.72, my, Z1 + 0.17)), Vector((0.78, my, Z1 + 0.17))] + \
        bez((0.78, my, Z1 + 0.17), (0.84, my, Z1 + 0.17), (0.84, my, Z1 + 0.2), (0.84, my, Z1 + 0.28), 4)[1:] + \
        [Vector((0.84, my, Z1 + 0.62))]
    k.tube(pts, 0.04, 'metal', n=10)
    k.cyl((0.84, my, Z1 + 0.6), 0.046, 0.05, 'metal', n=10, bev=0)
    k.cyl((0.84, my + 0.02, Z1 + 0.655), 0.05, 0.008, 'dark_metal', n=10, bev=0, rot=(0.6, 0, 0))
    # fuel cap, lifting eye
    k.cyl((-0.55, -0.25, Z1 + 0.07), 0.06, 0.04, 'metal', n=10, bev=0)
    k.cyl((-0.55, -0.25, Z1 + 0.1), 0.04, 0.03, 'dark_metal', n=10, bev=0)
    k.box((-0.05, 0, Z1 + 0.06), (0.16, 0.09, 0.02), 'metal', bev=0.004, seg=1)
    k.lathe([(0.04, -0.012), (0.055, -0.012), (0.055, 0.012), (0.04, 0.012)], 'metal', n=12, closed=True,
            c=(-0.05, 0, Z1 + 0.12), axis='X', smooth_ang=50)
    return k


def antenna():
    k = Kit('antenna')
    k.mat('metal', (0.45, 0.46, 0.47), 0.8, 0.45)
    k.mat('paint', (0.36, 0.37, 0.37), 0.0, 0.55)
    k.mat('concrete', (0.34, 0.33, 0.31), 0.0, 0.93)
    k.mat('glow', (1.0, 0.05, 0.03), 0.0, 0.4, emit=(1.0, 0.04, 0.02))
    k.box((0, 0, 0.11), (0.5, 0.5, 0.22), 'concrete', bev=0.02, seg=2)
    k.box((0, 0, 0.23), (0.42, 0.42, 0.02), 'metal', bev=0.004, seg=1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.cyl((sx * 0.17, sy * 0.17, 0.25), 0.014, 0.025, 'metal', n=6, bev=0.002)
    RC = 0.2
    legs = [Vector((RC * math.cos(a), RC * math.sin(a), 0)) for a in (math.pi / 2 + TAU / 3 * i for i in range(3))]
    ZB, ZT = 0.24, 5.85
    for p in legs:
        k.cyl((p.x, p.y, (ZB + ZT) / 2), 0.03, ZT - ZB, 'metal', n=8, bev=0)
        k.box((p.x, p.y, ZB + 0.04), (0.07, 0.07, 0.08), 'metal', bev=0.005, seg=1)
    bays = 13
    bh = (ZT - ZB - 0.1) / bays
    for b in range(bays + 1):
        z = ZB + 0.05 + b * bh
        for i in range(3):
            a, c = legs[i], legs[(i + 1) % 3]
            a3, c3 = Vector((a.x, a.y, z)), Vector((c.x, c.y, z))
            k.beam(a3, c3, 0.016, 0.016, 'metal')
            if b < bays:
                lo, hi = (a3, Vector((c.x, c.y, z + bh))) if (b + i) % 2 == 0 else (c3, Vector((a.x, a.y, z + bh)))
                k.beam(lo, hi, 0.014, 0.014, 'metal')
    # top platform + beacon
    k.lathe([(0, ZT), (0.26, ZT), (0.26, ZT + 0.03), (0, ZT + 0.03)], 'metal', n=3, a0=math.pi / 2, smooth_ang=30)
    k.cyl((0, 0, ZT + 0.06), 0.05, 0.06, 'metal', n=12, bev=0.004)
    k.lathe([(0, ZT + 0.09), (0.045, ZT + 0.09), (0.05, ZT + 0.14), (0.04, ZT + 0.2), (0, ZT + 0.215)], 'glow', n=12)
    k.cyl((0, 0, ZT + 0.225), 0.03, 0.02, 'metal', n=12, bev=0.003)
    for i in range(4):
        a = TAU * i / 4 + 0.4
        k.beam((0.06 * math.cos(a), 0.06 * math.sin(a), ZT + 0.09), (0.06 * math.cos(a), 0.06 * math.sin(a), ZT + 0.22), 0.007, 0.007, 'metal')
    # whips
    for a, hgt in ((0.9, 0.9), (0.9 + math.pi, 0.65)):
        x, y = 0.2 * math.cos(a), 0.2 * math.sin(a)
        k.cyl((x, y, ZT + 0.06), 0.018, 0.08, 'metal', n=6, bev=0.002)
        k.cyl((x, y, ZT + 0.1 + hgt / 2), 0.008, hgt, 'metal', n=4, r2=0.003, bev=0)
    # sector panel antennas
    for i, p in enumerate(legs):
        out = Vector((p.x, p.y, 0)).normalized()
        cpos = p + out * 0.08
        yaw = math.atan2(out.y, out.x) + math.pi / 2
        k.box((cpos.x, cpos.y, 5.2), (0.2, 0.07, 0.75), 'paint', bev=0.02, seg=2, rot=(0, 0, yaw))
        for z in (4.95, 5.45):
            k.beam(p + Vector((0, 0, z)), cpos + Vector((0, 0, z)) - out * 0.03, 0.03, 0.03, 'metal')
    # dish (faces front -Y)
    dz = 4.1
    dc = Vector((0, -0.46, dz))
    rd = 0.42
    prof = [(0, -0.07)]
    for i in range(1, 6):
        r = rd * i / 5
        prof.append((r, -0.07 + 0.3 * (r / rd) ** 2 * 0.25))
    prof += [(rd + 0.015, 0.012), (rd + 0.015, 0.0), (rd * 0.8, -0.06), (rd * 0.4, -0.1), (0, -0.11)]
    prof = [(r, -z) for r, z in prof]   # concave towards local -Z → after axis -Y concave front
    k.lathe(prof, 'paint', n=20, c=dc, axis='Y', smooth_ang=60, rot=(math.radians(-6), 0, 0))
    k.cyl(dc + Vector((0, 0.16, 0)), 0.06, 0.14, 'metal', axis='Y', n=10, bev=0.006)
    k.beam(dc + Vector((0, 0.2, 0)), Vector((0, -legs[0].y * 0 - 0.1, dz)) + Vector((0, 0.08, 0)), 0.05, 0.05, 'metal', bev=0.004)
    # feed arm & horn
    feed = dc + Vector((0, -0.36, -0.03))
    for i in range(3):
        a = math.pi / 2 + TAU * i / 3
        k.beam(dc + Vector((rd * 0.95 * math.cos(a), -0.06, rd * 0.95 * math.sin(a))), feed, 0.012, 0.012, 'metal')
    k.cyl(feed, 0.035, 0.09, 'metal', axis='Y', n=8, bev=0.004)
    # equipment cabinet on mast
    cy0 = -0.2
    k.box((0, cy0 - 0.12, 1.15), (0.36, 0.2, 0.5), 'paint', bev=0.015, seg=2)
    k.box((0, cy0 - 0.225, 1.15), (0.3, 0.015, 0.42), 'paint', bev=0.004, seg=1)
    k.box((0.12, cy0 - 0.235, 1.15), (0.02, 0.015, 0.08), 'metal', bev=0.003, seg=1)
    k.cyl((-0.1, cy0 - 0.235, 1.32), 0.012, 0.01, 'glow', axis='Y', n=8, bev=0)
    k.box((0, cy0 - 0.12, 1.42), (0.4, 0.24, 0.025), 'paint', bev=0.006, seg=1)
    # cable tray up the front leg
    k.box((0.04, legs[1].y * 0 + 0.0, 0), (0.001, 0.001, 0.001), 'metal', bev=0)
    k.beam((0.035, 0.2, 1.4), (0.035, 0.2, 5.0), 0.03, 0.012, 'paint')
    return k


def ac_unit():
    k = Kit('ac_unit')
    k.mat('paint', (0.33, 0.33, 0.31), 0.1, 0.5)
    k.mat('metal', (0.08, 0.085, 0.09), 0.7, 0.45)
    k.mat('copper_metal', (0.55, 0.3, 0.17), 1.0, 0.35)
    k.mat('insul_paint', (0.03, 0.03, 0.03), 0.0, 0.85)
    W, D = 1.4, 1.0
    Z0, Z1 = 0.1, 0.93
    for y in (-0.38, 0.38):
        k.box((0, y, 0.05), (W - 0.04, 0.1, 0.1), 'metal', bev=0.008, seg=1)
    k.box((0, 0, (Z0 + Z1) / 2), (W, D, Z1 - Z0), 'paint', bev=0.025, seg=2)
    k.box((0, 0, Z1 + 0.025), (W + 0.03, D + 0.03, 0.05), 'paint', bev=0.016, seg=2)
    # corner posts
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box((sx * (W / 2 - 0.03), sy * (D / 2 - 0.03), (Z0 + Z1) / 2), (0.075, 0.075, Z1 - Z0), 'paint', bev=0.012, seg=1)
    # fan shroud on top
    fc = Vector((0.2, 0.0, Z1 + 0.05))
    k.lathe([(0.34, 0.0), (0.385, 0.0), (0.385, 0.06), (0.37, 0.085), (0.34, 0.085)], 'paint', n=24, closed=True, c=fc, smooth_ang=40)
    k.cyl(fc + Vector((0, 0, 0.004)), 0.342, 0.006, 'metal', n=24, bev=0)
    k.cyl(fc + Vector((0, 0, 0.03)), 0.06, 0.05, 'metal', n=12, bev=0.008)
    for i in range(5):
        a = TAU * i / 5
        mid = fc + Vector((0.19 * math.cos(a), 0.19 * math.sin(a), 0.032))
        k.box(mid, (0.24, 0.1, 0.006), 'metal', bev=0, rot=(0.45, 0, 0)).data.transform(Matrix())
        ob = k.objs[-1]
        ob.data.transform(Matrix.Translation(mid) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation(-mid))
    for r in (0.13, 0.25):
        k.lathe([(r - 0.006, 0.07), (r + 0.006, 0.07), (r + 0.006, 0.08), (r - 0.006, 0.08)], 'metal', n=20, closed=True, c=fc, smooth_ang=50)
    for i in range(6):
        a = TAU * i / 6
        k.beam(fc + Vector((0.05 * math.cos(a), 0.05 * math.sin(a), 0.078)), fc + Vector((0.36 * math.cos(a), 0.36 * math.sin(a), 0.078)), 0.01, 0.01, 'metal')
    k.cyl(fc + Vector((0, 0, 0.078)), 0.05, 0.012, 'metal', n=12, bev=0.003)
    # condenser coil grilles (back + +X end)
    def coil(axis, sign):
        if axis == 'Y':
            yy = sign * (D / 2 + 0.004)
            k.box((0.0, yy, 0.52), (W - 0.2, 0.01, 0.66), 'metal', bev=0)
            for i in range(11):
                k.box((0.0, yy + sign * 0.008, 0.23 + i * 0.058), (W - 0.24, 0.012, 0.018), 'paint', bev=0)
        else:
            xx = sign * (W / 2 + 0.004)
            k.box((xx, 0, 0.52), (0.01, D - 0.2, 0.66), 'metal', bev=0)
            for i in range(11):
                k.box((xx + sign * 0.008, 0, 0.23 + i * 0.058), (0.012, D - 0.24, 0.018), 'paint', bev=0)
    coil('Y', 1)
    coil('X', 1)
    # front service panel + screws + label
    yf = -(D / 2 + 0.006)
    k.box((-0.2, yf, 0.52), (0.7, 0.012, 0.62), 'paint', bev=0.008, seg=1)
    for x in (-0.52, 0.12):
        for z in (0.25, 0.79):
            k.cyl((x, yf - 0.007, z), 0.011, 0.006, 'metal', axis='Y', n=6, bev=0)
    k.box((0.38, yf - 0.002, 0.75), (0.16, 0.006, 0.1), 'metal', bev=0.002, seg=1)
    # disconnect box on -X side
    xs = -(W / 2 + 0.06)
    k.box((xs, -0.18, 0.62), (0.1, 0.22, 0.28), 'paint', bev=0.012, seg=1)
    k.box((xs - 0.055, -0.18, 0.66), (0.02, 0.05, 0.08), 'metal', bev=0.003, seg=1)
    k.tube([(xs, -0.18, 0.48), (xs, -0.18, 0.3), (xs + 0.0, -0.18, 0.12)] + bez((xs, -0.18, 0.12), (xs, -0.18, 0.02), (xs - 0.05, -0.18, 0.015), (xs - 0.2, -0.18, 0.015), 3)[1:], 0.014, 'insul_paint', n=6)
    # refrigerant line set from -X side, down to roof and away
    for y, r, m in ((0.1, 0.03, 'insul_paint'), (0.2, 0.013, 'copper_metal')):
        x0 = -(W / 2)
        pts = [Vector((x0 + 0.02, y, 0.35)), Vector((x0 - 0.08, y, 0.35))] + \
            bez((x0 - 0.08, y, 0.35), (x0 - 0.18, y, 0.35), (x0 - 0.18, y, 0.3), (x0 - 0.18, y, 0.2), 4)[1:] + \
            bez((x0 - 0.18, y, 0.2), (x0 - 0.18, y, 0.04), (x0 - 0.22, y, r), (x0 - 0.35, y, r), 4)[1:] + \
            [Vector((x0 - 0.7, y, r))]
        k.tube(pts, r, m, n=8 if r > 0.02 else 6)
        k.box((x0 + 0.005, y, 0.35), (0.02, r * 3, r * 3), 'metal', bev=0.003, seg=1)
    k.box((-(W / 2) - 0.55, 0.15, 0.025), (0.08, 0.22, 0.05), 'metal', bev=0.006, seg=1)
    return k


def spool():
    k = Kit('spool')
    k.mat('wood', (0.17, 0.095, 0.045), 0.0, 0.8)
    k.mat('metal', (0.3, 0.3, 0.31), 0.8, 0.45)
    k.mat('cable_paint', (0.025, 0.025, 0.028), 0.0, 0.55)
    R, Wd, T = 0.6, 0.86, 0.06
    zc = R
    # flanges made of vertical planks clipped to the disc
    planks = [(-0.6, -0.36), (-0.355, -0.12), (-0.115, 0.115), (0.12, 0.355), (0.36, 0.6)]
    for sx in (-1, 1):
        xa, xb = sx * (Wd / 2), sx * (Wd / 2 + T)
        for (u0, u1) in planks:
            pts = []
            a0, a1 = math.acos(max(-1, min(1, u1 / R))), math.acos(max(-1, min(1, u0 / R)))
            # top arc from u1 to u0, bottom arc from u0 to u1 (polygon in (y,z) = (u, v))
            n = 3
            for i in range(n + 1):
                a = a0 + (a1 - a0) * i / n
                pts.append((R * math.cos(a), zc + R * math.sin(a)))
            for i in range(n + 1):
                a = -a1 + (a1 - a0) * i / n
                pts.append((R * math.cos(a), zc + R * math.sin(a)))
            # dedupe near points
            clean = []
            for p in pts:
                if not clean or (abs(p[0] - clean[-1][0]) + abs(p[1] - clean[-1][1])) > 1e-4:
                    clean.append(p)
            if abs(clean[0][0] - clean[-1][0]) + abs(clean[0][1] - clean[-1][1]) < 1e-4:
                clean.pop()
            # shrink a hair for plank gaps
            cu = (u0 + u1) / 2
            clean = [(cu + (u - cu) * 0.985, zc + (v - zc) * 0.995) for u, v in clean]
            k.prism(clean, min(xa, xb), max(xa, xb), 'wood', axis='X', bev=0.008, seg=1, ang=30)
        # cross battens on the outside
        xo = sx * (Wd / 2 + T + 0.015)
        for zz in (zc - 0.3, zc + 0.3):
            half = math.sqrt(R * R - 0.3 * 0.3) - 0.05
            k.box((xo, 0, zz), (0.03, 2 * half, 0.1), 'wood', bev=0.008, seg=1)
        # hub plate + bolts
        k.cyl((sx * (Wd / 2 + T + 0.004), 0, zc), 0.13, 0.012, 'metal', axis='X', n=12, bev=0)
        k.cyl((sx * (Wd / 2 + T + 0.012), 0, zc), 0.06, 0.008, 'cable_paint', axis='X', n=12, bev=0)
        for i in range(6):
            a = TAU * i / 6
            y, z = 0.095 * math.cos(a), zc + 0.095 * math.sin(a)
            k.cyl((sx * (Wd / 2 + T + 0.014), y, z), 0.012, 0.012, 'metal', axis='X', n=6, bev=0)
        for zz in (zc - 0.3, zc + 0.3):
            for yy in (-0.35, 0.35):
                k.cyl((sx * (Wd / 2 + T + 0.032), yy, zz), 0.012, 0.008, 'metal', axis='X', n=6, bev=0)
    # wound cable: rippled lathe along X
    prof = [(0.2, -Wd / 2)]
    N = 16
    for i in range(N + 1):
        x = -Wd / 2 + 0.01 + (Wd - 0.02) * i / N
        prof.append((0.43 + (0.012 if i % 2 else 0.0), x))
    prof.append((0.2, Wd / 2))
    k.lathe(prof, 'cable_paint', n=16, c=(0, 0, zc), axis='X', smooth_ang=70)
    # loose cable end
    a = math.radians(70)
    p0 = Vector((0.25, 0.43 * math.cos(a) * -1, zc + 0.43 * math.sin(a)))
    pts = bez(p0, p0 + Vector((0.05, -0.25, 0.05)), Vector((0.25, -0.78, 0.4)), Vector((0.18, -0.85, 0.0)), 8)
    pts = [p if p.z > 0.025 else Vector((p.x, p.y, 0.025)) for p in pts]
    pts.append(pts[-1] + Vector((-0.25, -0.15, 0)))
    k.tube(pts, 0.022, 'cable_paint', n=8)
    return k


def lamppost():
    k = Kit('lamppost')
    k.mat('metal', (0.07, 0.075, 0.08), 0.8, 0.45)
    k.mat('bronze_metal', (0.5, 0.32, 0.14), 1.0, 0.33)
    k.mat('concrete', (0.33, 0.32, 0.3), 0.0, 0.92)
    k.mat('glow', (1.0, 0.78, 0.5), 0.0, 0.3, emit=(1.0, 0.72, 0.42))
    a8 = math.pi / 8
    k.lathe([(0, 0), (0.33, 0), (0.33, 0.3), (0.29, 0.36), (0.23, 0.38), (0, 0.38)], 'concrete', n=8, a0=a8, smooth_ang=30, bev=0.012, seg=1)
    k.lathe([(0, 0.38), (0.19, 0.38), (0.19, 0.44), (0.16, 0.47), (0.16, 0.62), (0.125, 0.66), (0.105, 0.78), (0, 0.78)], 'metal', n=8, a0=a8, smooth_ang=30)
    k.lathe([(0.17, 0.5), (0.185, 0.5), (0.185, 0.58), (0.17, 0.58)], 'bronze_metal', n=8, a0=a8, closed=True, smooth_ang=30, bev=0.004, seg=1)
    # bolt heads on the base
    for i in range(4):
        a = TAU * i / 4 + a8 * 2
        k.cyl((0.175 * math.cos(a), 0.175 * math.sin(a), 0.4), 0.018, 0.025, 'bronze_metal', n=6, bev=0)
    # tapered pole (12 sides)
    k.lathe([(0, 0.76), (0.088, 0.76), (0.064, 4.66), (0, 4.66)], 'metal', n=12, smooth_ang=40)
    # bronze bands with notched teeth (knot-ring styling)
    for zc in (1.05, 2.6, 4.45):
        r = 0.088 - (0.024 * (zc - 0.76) / 3.9)
        k.lathe([(r - 0.002, zc - 0.05), (r + 0.016, zc - 0.04), (r + 0.016, zc + 0.04), (r - 0.002, zc + 0.05)], 'bronze_metal', n=12, closed=True, smooth_ang=30)
        for i in range(6):
            a = TAU * i / 6 + math.pi / 12
            k.box(((r + 0.018) * math.cos(a), (r + 0.018) * math.sin(a), zc), (0.012, 0.03, 0.03), 'bronze_metal', bev=0, rot=(math.pi / 4, 0, a))
    # rune glow slit on the front face of the pole
    for z0, z1 in ((1.2, 2.45),):
        r0 = 0.088 - 0.024 * (z0 - 0.76) / 3.9
        r1 = 0.088 - 0.024 * (z1 - 0.76) / 3.9
        k.beam((0, -r0 - 0.001, z0), (0, -r1 - 0.001, z1), 0.014, 0.006, 'glow')
        for zz in (1.45, 1.85, 2.2):
            rr = 0.088 - 0.024 * (zz - 0.76) / 3.9
            k.beam((-0.03, -rr + 0.004, zz - 0.04), (0.0, -rr - 0.001, zz), 0.008, 0.006, 'glow')
            k.beam((0.03, -rr + 0.004, zz - 0.04), (0.0, -rr - 0.001, zz), 0.008, 0.006, 'glow')
    # top cap + finial
    k.lathe([(0, 4.64), (0.09, 4.64), (0.09, 4.7), (0.05, 4.76), (0.03, 4.9), (0.012, 5.02), (0, 5.06)], 'bronze_metal', n=8, smooth_ang=35)
    # arm toward front (-Y)
    arm = bez((0, -0.05, 4.5), (0, -0.4, 4.6), (0, -0.75, 4.78), (0, -1.05, 4.78), 8)
    k.tube(arm, lambda t: 0.042 - 0.012 * t, 'metal', n=8)
    strut = bez((0, -0.07, 3.95), (0, -0.2, 4.15), (0, -0.4, 4.45), (0, -0.62, 4.68), 6)
    k.tube(strut, 0.018, 'bronze_metal', n=6)
    k.lathe([(0.075, 3.9), (0.09, 3.9), (0.09, 4.0), (0.075, 4.0)], 'bronze_metal', n=12, closed=True, smooth_ang=30)
    # lamp head (hexagonal hood)
    hc = Vector((0, -1.1, 4.62))
    k.lathe([(0, 0.2), (0.05, 0.2), (0.07, 0.17), (0.25, 0.04), (0.28, 0.0), (0.28, -0.03), (0.24, -0.035), (0.22, 0.0), (0, 0.02)],
            'metal', n=6, c=hc, smooth_ang=30, bev=0.004, seg=1)
    k.lathe([(0.27, -0.035), (0.29, -0.035), (0.29, 0.005), (0.27, 0.005)], 'bronze_metal', n=6, closed=True, c=hc, smooth_ang=30)
    k.lathe([(0, -0.02), (0.22, -0.02), (0.2, 0.0), (0, 0.0)], 'glow', n=6, c=hc, smooth_ang=30)
    k.cyl(hc + Vector((0, 0, 0.22)), 0.035, 0.05, 'bronze_metal', n=8, bev=0.004)
    return k


def rune_banner():
    k = Kit('rune_banner')
    k.mat('cloth', (0.17, 0.028, 0.022), 0.0, 0.9, double=True)
    k.mat('metal', (0.06, 0.06, 0.065), 0.8, 0.5)
    k.mat('bronze_metal', (0.5, 0.32, 0.14), 1.0, 0.33)
    k.mat('glow', (0.35, 0.8, 1.0), 0.0, 0.3, emit=(0.3, 0.78, 1.0))
    TOP = 3.5
    BW, BH = 0.8, 3.0
    # base: iron disc + three bronze-capped feet
    k.lathe([(0, 0), (0.28, 0), (0.28, 0.03), (0.2, 0.07), (0.07, 0.09), (0, 0.09)], 'metal', n=12, smooth_ang=35, bev=0.004, seg=1)
    for i in range(3):
        a = TAU * i / 3 + math.pi / 6
        k.box((0.24 * math.cos(a), 0.24 * math.sin(a), 0.025), (0.12, 0.07, 0.05), 'bronze_metal', bev=0.008, seg=1, rot=(0, 0, a))
    k.lathe([(0.05, 0.08), (0.065, 0.1), (0.065, 0.22), (0.045, 0.25)], 'bronze_metal', n=12, smooth_ang=35)
    k.cyl((0, 0, 1.9), 0.032, 3.6, 'metal', n=10, bev=0)
    for zz in (1.0, 2.2):
        k.lathe([(0.03, zz - 0.04), (0.045, zz - 0.03), (0.045, zz + 0.03), (0.03, zz + 0.04)], 'bronze_metal', n=10, closed=True, smooth_ang=30)
    k.lathe([(0, 3.68), (0.045, 3.68), (0.05, 3.72), (0.02, 3.8), (0.03, 3.86), (0.0, 3.98)], 'bronze_metal', n=8, smooth_ang=30)
    # crossbar
    zc = TOP + 0.03
    k.cyl((0, -0.07, zc), 0.022, BW + 0.16, 'metal', axis='X', n=8, bev=0)
    k.beam((0, 0, zc), (0, -0.07, zc), 0.04, 0.05, 'metal')
    for sx in (-1, 1):
        k.lathe([(0, 0), (0.035, 0.0), (0.035, 0.03), (0.02, 0.06), (0, 0.075)], 'bronze_metal', n=8, c=(sx * (BW / 2 + 0.08), -0.07, zc), axis='X', rot=(0, 0 if sx > 0 else math.pi, 0), smooth_ang=30)

    def S(u, v):
        """u in [-BW/2, BW/2], v metres down from the top."""
        w = (v / BH)
        y = -0.07 + 0.035 * math.sin(2.1 * v + 3.2 * u) * w + 0.018 * math.sin(4.5 * u + 1.0) * w ** 0.5
        x = u * (1 - 0.04 * w)
        return Vector((x, y, TOP - v))

    def vmax(u):
        return BH - 0.22 * (1 - abs(u) / (BW / 2))

    def F(i, j):
        u = -BW / 2 + BW * i
        return S(u, 0.02 + (vmax(u) - 0.02) * j)
    k.sheet(F, 8, 30, 'cloth', solid=0.008)
    # sleeve wrapping the crossbar
    k.cyl((0, -0.07, zc), 0.03, BW, 'cloth', axis='X', n=10, bev=0)

    def nrm(p):
        return Vector((0, -1, 0))

    def line(pts_uv, w=0.022):
        path = []
        for (u0, v0), (u1, v1) in zip(pts_uv[:-1], pts_uv[1:]):
            n = max(1, int(math.hypot(u1 - u0, v1 - v0) / 0.06))
            for i in range(n):
                t = i / n
                path.append(S(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t))
        path.append(S(*pts_uv[-1]))
        k.strip(path, w, 'glow', lift=0.008, normal=nrm, smooth_ang=80)
    # emblem: ring + algiz/tiwaz bind-rune + side ticks
    ec, er = 1.05, 0.26
    ring = [(er * math.sin(TAU * i / 28), ec + er * math.cos(TAU * i / 28)) for i in range(29)]
    line(ring, 0.02)
    sz = 0.36
    for (a, b) in RUNES['algiz'] + RUNES['tiwaz'][1:]:
        line([((a[0] - 0.5) * sz * 0.8, ec + (0.5 - a[1]) * sz), ((b[0] - 0.5) * sz * 0.8, ec + (0.5 - b[1]) * sz)], 0.026)
    for vv in (1.55, 1.62):
        line([(-0.2, vv), (0.2, vv)], 0.014)
    line([(0, 1.7), (0, 2.45)], 0.014)
    for vv in (1.9, 2.1, 2.3):
        line([(-0.06, vv + 0.05), (0, vv), (0.06, vv + 0.05)], 0.012)
    # border lines
    for su in (-1, 1):
        line([(su * 0.33, 0.12), (su * 0.33, vmax(su * 0.33) - 0.1)], 0.01)
    line([(-0.33, 0.12), (0.33, 0.12)], 0.01)
    return k


def market_stall():
    k = Kit('market_stall')
    k.mat('wood', (0.19, 0.115, 0.06), 0.0, 0.8)
    k.mat('cloth', (0.36, 0.17, 0.05), 0.0, 0.92, double=True)
    k.mat('pale_cloth', (0.46, 0.41, 0.31), 0.0, 0.92, double=True)
    k.mat('metal', (0.18, 0.18, 0.19), 0.8, 0.5)
    rng = random.Random(5)
    PX, PYF, PYB = 1.42, -0.85, 0.9
    HF, HB = 2.2, 2.5
    for x in (-PX, PX):
        k.box((x, PYF, HF / 2), (0.1, 0.1, HF), 'wood', bev=0.012, seg=1)
        k.box((x, PYB, HB / 2), (0.1, 0.1, HB), 'wood', bev=0.012, seg=1)
        # foot pads
        for y in (PYF, PYB):
            k.box((x, y, 0.02), (0.16, 0.16, 0.04), 'metal', bev=0.006, seg=1)
    # beams
    k.box((0, PYF, HF - 0.05), (2 * PX + 0.16, 0.08, 0.1), 'wood', bev=0.01, seg=1)
    k.box((0, PYB, HB - 0.05), (2 * PX + 0.16, 0.08, 0.1), 'wood', bev=0.01, seg=1)
    YF, YB = -1.22, 1.0

    def zroof(y):
        return (HF + 0.02) + (HB + 0.02 - HF - 0.02) * (y - PYF) / (PYB - PYF)
    for x in (-PX, 0.0, PX):
        k.beam((x, PYF - 0.08, zroof(PYF - 0.08) - 0.04), (x, PYB + 0.04, zroof(PYB + 0.04) - 0.04), 0.06, 0.08, 'wood', bev=0.008)
    # side rails & back rail
    for x in (-PX, PX):
        k.box((x, (PYF + PYB) / 2, 0.95), (0.06, PYB - PYF, 0.07), 'wood', bev=0.008, seg=1)
    k.box((0, PYB, 0.95), (2 * PX, 0.06, 0.07), 'wood', bev=0.008, seg=1)
    # counter: front planks, top, shelf
    CY = -0.78
    n = 10
    pw = (2 * PX - 0.1) / n
    for i in range(n):
        x = -PX + 0.05 + pw * (i + 0.5)
        h = 0.98 + rng.uniform(-0.015, 0.0)
        k.box((x, CY - 0.07, h / 2 + 0.02), (pw - 0.012, 0.028, h - 0.04), 'wood', bev=0.006, seg=1, rot=(rng.uniform(-0.01, 0.01), 0, 0))
    for z in (0.2, 0.8):
        k.box((0, CY - 0.045, z), (2 * PX - 0.1, 0.03, 0.08), 'wood', bev=0.006, seg=1)
    for i, y in enumerate((-0.95, -0.76, -0.57)):
        k.box((0, y, 1.0), (2 * PX + 0.12, 0.185, 0.045), 'wood', bev=0.007, seg=1, rot=(0, rng.uniform(-0.004, 0.004), 0))
    k.box((0, -0.5, 0.35), (2 * PX - 0.1, 0.5, 0.03), 'wood', bev=0.006, seg=1)
    # back table
    k.box((0, 0.65, 0.8), (2 * PX - 0.1, 0.45, 0.04), 'wood', bev=0.007, seg=1)
    for x in (-1.0, 1.0):
        k.box((x, 0.65, 0.4), (0.06, 0.4, 0.78), 'wood', bev=0.006, seg=1)
    # metal brackets at joints
    for x in (-PX, PX):
        for (y, z) in ((PYF, HF - 0.16), (PYB, HB - 0.16), (PYF, 1.0), (PYB, 0.95)):
            k.box((x, y, z), (0.115, 0.115, 0.05), 'metal', bev=0)
    # boxes on counter + sacks
    def small_crate(c, s, yaw):
        k.box(c, s, 'wood', bev=0.01, seg=1, rot=(0, 0, yaw))
        for dz in (-s[2] * 0.3, s[2] * 0.3):
            k.box((c[0], c[1], c[2] + dz), (s[0] + 0.012, s[1] + 0.012, 0.03), 'wood', bev=0, rot=(0, 0, yaw))
    small_crate((-0.95, -0.74, 1.13), (0.45, 0.32, 0.22), 0.08)
    small_crate((-0.4, -0.78, 1.11), (0.38, 0.28, 0.18), -0.12)
    small_crate((0.92, -0.76, 1.13), (0.42, 0.3, 0.22), 0.05)
    small_crate((0.92, -0.74, 1.34), (0.36, 0.26, 0.18), -0.15)
    small_crate((-1.75 + 0.05, -0.2, 0.17), (0.5, 0.36, 0.34), 0.3)
    small_crate((-1.72, -0.2, 0.5), (0.4, 0.3, 0.3), 0.15)
    k.bag((0.25, -0.75, 1.12), 0.3, 0.42, 0.3, 0.22, 'pale_cloth', 3)
    k.bag((0.5, 0.65, 0.92), -0.2, 0.5, 0.32, 0.24, 'pale_cloth', 4)
    k.bag((-0.4, 0.62, 0.92), 0.1, 0.45, 0.3, 0.22, 'cloth', 5)

    # awning: striped sagging canvas
    XA = PX + 0.22
    NS = 12

    def awn(x, y):
        z = zroof(y) + 0.012
        # canvas rests on the front/back beams and rafters; sags in between
        if PYF <= y <= PYB:
            w = math.sin(math.pi * (y - PYF) / (PYB - PYF))
        elif y < PYF:
            w = 0.0
            z -= 0.05 * ((PYF - y) / (PYF - YF)) ** 1.5
        else:
            w = 0.0
            z -= 0.03 * ((y - PYB) / (YB - PYB)) ** 1.5
        if abs(x) <= PX:
            f = (abs(x) % PX) / PX
            z -= 0.075 * math.sin(math.pi * f) * w
        else:
            z -= 0.1 * ((abs(x) - PX) / (XA - PX)) ** 1.5
        z -= 0.03 * w
        z += 0.008 * math.sin(7 * x + 3 * y)
        return Vector((x, y, z))
    sw = 2 * XA / NS
    for s in range(NS):
        x0 = -XA + s * sw
        m = 'cloth' if s % 2 == 0 else 'pale_cloth'
        k.sheet(lambda u, v, x0=x0: awn(x0 + sw * u, YF + (YB - YF) * v), 2, 7, m, solid=0.008)

        # valance with scalloped hem
        def val(u, v, x0=x0):
            x = x0 + sw * u
            top = awn(x, YF)
            drop = 0.17 + 0.07 * math.sin(math.pi * u)
            return Vector((x, YF - 0.005 - 0.015 * v, top.z - drop * v))
        k.sheet(val, 2, 1, m, solid=0.008)
    # tie ropes from awning corners to posts
    for x in (-XA + 0.03, XA - 0.03):
        a = awn(x, YF + 0.02)
        k.tube([a, Vector((math.copysign(PX + 0.05, x), PYF, HF - 0.3))], 0.007, 'pale_cloth', n=4)
    return k


BUILDERS = {
    'crate_large': crate_large, 'crate_small': crate_small, 'barrel': barrel, 'barrier': barrier,
    'sandbags': sandbags, 'generator': generator, 'antenna': antenna, 'ac_unit': ac_unit,
    'spool': spool, 'lamppost': lamppost, 'rune_banner': rune_banner, 'market_stall': market_stall,
}
ONLY = [a for a in ARGV if a in BUILDERS] or list(BUILDERS)


# ============================================================================ preview
def setup_stage():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 800, 600
    sc.render.resolution_percentage = 100
    ee = sc.eevee
    ee.taa_render_samples = 48
    ee.use_gtao = True
    ee.gtao_distance = 0.6
    ee.use_ssr = True
    ee.use_bloom = True
    ee.bloom_intensity = 0.03
    ee.use_soft_shadows = True
    ee.shadow_cascade_size = '4096'
    ee.shadow_cube_size = '1024'
    sc.view_settings.view_transform = 'Filmic'
    sc.view_settings.look = 'Medium High Contrast'
    sc.view_settings.exposure = -0.5
    w = bpy.data.worlds.new('sky')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'HOSEK_WILKIE'
    sky.sun_direction = Vector((-0.4, -0.6, 0.7)).normalized()
    sky.turbidity = 3.0
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.25
    sd = bpy.data.lights.new('sun', 'SUN')
    sd.energy = 4.0
    sd.angle = math.radians(2.5)
    sd.color = (1.0, 0.95, 0.88)
    sun = bpy.data.objects.new('sun', sd)
    sun.rotation_euler = (math.radians(48), 0, math.radians(-35))
    sc.collection.objects.link(sun)
    # ground
    bpy.ops.mesh.primitive_plane_add(size=200)
    g = bpy.context.active_object
    g.name = 'ground'
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gb = gm.node_tree.nodes['Principled BSDF']
    gb.inputs['Base Color'].default_value = (0.16, 0.15, 0.14, 1)
    gb.inputs['Roughness'].default_value = 0.95
    g.data.materials.append(gm)
    cd = bpy.data.cameras.new('cam')
    cd.lens = 50
    cam = bpy.data.objects.new('cam', cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam, g


def render_prop(kit, cam, mn, mx):
    c = (mn + mx) / 2
    R = (mx - mn).length / 2
    d = Vector((-0.85, -1.25, 0.62)).normalized()
    fov_v = 2 * math.atan(18 / 50 * 0.75)
    dist = R / math.sin(fov_v / 2) * 0.92
    cam.location = c + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = os.path.join(PREVIEW_DIR, f'{kit.name}.png')
    bpy.ops.render.render(write_still=True)


def make_sheet(names):
    import numpy as np
    tw, th, cols = 400, 300, 4
    rows = (len(names) + cols - 1) // cols
    sheet = np.zeros((900, 1600, 4), dtype=np.float32)
    sheet[..., 3] = 1
    for i, n in enumerate(names):
        p = os.path.join(PREVIEW_DIR, f'{n}.png')
        if not os.path.exists(p):
            continue
        im = bpy.data.images.load(p)
        w, h = im.size
        a = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        a = a.reshape(h, w, 4)
        a = a[:h // 2 * 2, :w // 2 * 2].reshape(h // 2, 2, w // 2, 2, 4).mean(axis=(1, 3))
        r, cc = divmod(i, cols)
        y0 = 900 - (r + 1) * th
        sheet[y0:y0 + th, cc * tw:(cc + 1) * tw] = a[:th, :tw]
        bpy.data.images.remove(im)
    out = bpy.data.images.new('sheet', 1600, 900, alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(PREVIEW_DIR, 'sheet.png')
    out.file_format = 'PNG'
    out.save()


# ============================================================================ main
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam = ground = None
    if DO_RENDER:
        cam, ground = setup_stage()
    report = []
    for name in ONLY:
        kit = BUILDERS[name]()
        tris, mn, mx = kit.finalize()
        for o in bpy.context.scene.objects:
            o.select_set(o in kit.objs)
        bpy.context.view_layer.objects.active = kit.objs[0]
        path = os.path.join(OUT_DIR, f'kit_{name}.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                                  use_selection=True, export_normals=True, export_tangents=False,
                                  export_cameras=False, export_lights=False)
        # glTF: x = x, y(up) = z, z(front) = -y
        line = (f'[PROPS] kit_{name}: {tris} tris, mats {len(kit.objs)}, '
                f'x[{mn.x:.2f},{mx.x:.2f}] z[{-mx.y:.2f},{-mn.y:.2f}] h {mx.z:.2f}')
        report.append(line)
        print(line)
        if DO_RENDER:
            render_prop(kit, cam, mn, mx)
        for o in kit.objs:
            bpy.data.objects.remove(o, do_unlink=True)
    if DO_RENDER:
        make_sheet([n for n in BUILDERS])
    print('\n'.join(report))


main()
