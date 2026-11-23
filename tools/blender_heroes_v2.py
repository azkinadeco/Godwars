"""God Wars hero generator v2 (Blender 3.6, background).

  Blender -b --factory-startup -P tools/blender_heroes_v2.py -- [hero ids...] [--no-export] [--blend]

Builds each playable hero as ONE skinned mesh (<= 6 materials -> <= 6 draw calls):
  * anatomical body: union of lofted limbs / ellipsoid muscles -> voxel remesh -> smooth -> quadriflow,
    heat-weighted to the rig
  * sculpted head (rigid on Head)
  * armour = curved shells ray-cast onto the body surface (conforming plates, solidified + bevelled),
    each rigidly (or blend-) weighted to its bone(s) and joined into the skinned mesh
  * Idle / Run / Slide baked from a small FK/IK pose solver (auto-grounded feet)
Skeleton keeps the legacy joint names (Hips, Chest, Head, UpperArm*, Forearm*, Thigh*, Shin*) and adds
Spine, Neck, Hand*, Foot*.
Blender axes: Z up, hero faces -Y (exported glTF faces +Z), side "L" = -X, "R" = +X (gun hand).
"""
import bpy, bmesh, math, os, sys, random
from math import radians, sin, cos, pi
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

ROOT = "/Users/apple/Documents/CODING/God Wars"
OUT_DIR = os.path.join(ROOT, "assets/models")
ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ONLY = [a for a in ARGV if not a.startswith("-")]
NO_EXPORT = "--no-export" in ARGV
SAVE_BLEND = "--blend" in ARGV


def V(x, y, z):
    return Vector((x, y, z))


X, Y, Z = V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)
FWD = V(0, -1, 0)


def Q(axis, deg):
    return Quaternion(axis, radians(deg))


def lin(h):
    def c(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255))


def lerp(a, b, t):
    return a + (b - a) * t


def smooth01(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ----------------------------------------------------------------------------------------------
# Hero definitions (colours are sRGB hex; fabric colours go through vertex colours)
# ----------------------------------------------------------------------------------------------
HEROES = {
    "thor": dict(
        body=dict(hs=1.0, shw=0.222, chest=1.10, waist=1.05, hip=1.02, arm=1.12, leg=1.08, fem=False, legw=0.100),
        pri=0x2f86d8, acc=0xf0a81e, drk=0x232a36, em=0x9fe8ff, skin=0xd6a587,
        suit=0x1a2233, glove=0x15181f, cloth=0x9b1d22, fur=0x4a3c30, hair=0x96471c,
    ),
    "loki": dict(
        body=dict(hs=1.0, shw=0.196, chest=0.95, waist=0.90, hip=0.95, arm=0.92, leg=0.94, fem=False, legw=0.094),
        pri=0x0f9e6e, acc=0xf2b632, drk=0x17211f, em=0x52ffbe, skin=0xdcae8c,
        suit=0x102019, glove=0x0c1210, cloth=0x1d6a4c, fur=0x0f2a1f, hair=0x15110e,
    ),
    "hades": dict(
        body=dict(hs=1.025, shw=0.235, chest=1.16, waist=1.14, hip=1.08, arm=1.18, leg=1.14, fem=False, legw=0.106),
        pri=0x352a48, acc=0x9d4ff0, drk=0x16121d, em=0xff5424, skin=0xb9c0cc,
        suit=0x130f19, glove=0x0d0a10, cloth=0x2c1838, fur=0x1a1020, hair=0x0d0a10,
    ),
    "zeus": dict(
        body=dict(hs=1.01, shw=0.214, chest=1.05, waist=1.02, hip=1.0, arm=1.04, leg=1.03, fem=False, legw=0.098),
        pri=0xf2c21b, acc=0x2fa8e8, drk=0x252a3a, em=0x8fdcff, skin=0xd9a57f,
        suit=0x1c2133, glove=0x151821, cloth=0xe9e5da, fur=0xe9e5da, hair=0xf1efe9,
    ),
    "hela": dict(
        body=dict(hs=0.985, shw=0.182, chest=0.92, waist=0.84, hip=1.06, arm=0.86, leg=0.96, fem=True, legw=0.092),
        pri=0x10877b, acc=0x2fd16a, drk=0x0f1717, em=0x4dff9a, skin=0xc4b6ae,
        suit=0x0d1515, glove=0x0a0f0f, cloth=0x0d211f, fur=0x0d211f, hair=0x0b0b0d,
    ),
    "valkyrie": dict(
        body=dict(hs=0.99, shw=0.188, chest=0.94, waist=0.86, hip=1.05, arm=0.9, leg=1.0, fem=True, legw=0.094),
        pri=0xf2701a, acc=0xf7d548, drk=0x24202f, em=0xffd27a, skin=0xd9a684,
        suit=0x1f1b2c, glove=0x17141f, cloth=0xece6d6, fur=0xece6d6, hair=0xe3bb62,
    ),
}

# ----------------------------------------------------------------------------------------------
# Scene / material helpers
# ----------------------------------------------------------------------------------------------

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, col, metallic, roughness, emissive=None, em_str=1.0, vcol=False):
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*col, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emissive is not None:
        bsdf.inputs["Emission"].default_value = (*emissive, 1.0)
        bsdf.inputs["Emission Strength"].default_value = em_str
    if vcol:
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    return m


PARTS = []
TRI_LOG = {}


def new_obj(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat is not None:
        ob.data.materials.append(mat)
    return ob


def apply_all(ob):
    if not ob.modifiers:
        return
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)


def set_color(ob, col):
    me = ob.data
    attr = me.color_attributes.get("Col") or me.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
    if isinstance(col, list):
        for i, c in enumerate(col):
            attr.data[i].color = (c[0], c[1], c[2], 1.0)
    elif callable(col):
        for i, v in enumerate(me.vertices):
            c = col(v.co)
            attr.data[i].color = (c[0], c[1], c[2], 1.0)
    else:
        c = (*col, 1.0)
        for d in attr.data:
            d.color = c


def set_weights(ob, weights):
    me = ob.data
    groups = {}

    def g(name):
        if name not in groups:
            groups[name] = ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
        return groups[name]
    if callable(weights):
        for v in me.vertices:
            w = weights(v.co)
            tot = sum(w.values()) or 1.0
            for b, x in w.items():
                if x > 1e-4:
                    g(b).add([v.index], x / tot, 'REPLACE')
    else:
        idx = [v.index for v in me.vertices]
        tot = sum(weights.values())
        for b, x in weights.items():
            g(b).add(idx, x / tot, 'REPLACE')


def finish(ob, weights, color=(1, 1, 1), smooth=48, tag="misc"):
    apply_all(ob)
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    me.use_auto_smooth = True
    me.auto_smooth_angle = radians(smooth)
    set_color(ob, color)
    set_weights(ob, weights)
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    TRI_LOG[tag] = TRI_LOG.get(tag, 0) + tris
    PARTS.append(ob)
    return ob


# ----------------------------------------------------------------------------------------------
# Geometry primitives (raw vert/face lists)
# ----------------------------------------------------------------------------------------------
class Acc:
    def __init__(self):
        self.v, self.f = [], []

    def add(self, verts, faces):
        o = len(self.v)
        self.v.extend(verts)
        self.f.extend([tuple(i + o for i in f) for f in faces])


def frame_for(d, ref=FWD):
    d = d.normalized()
    y = ref - d * ref.dot(d)
    if y.length < 1e-5:
        y = Z - d * Z.dot(d)
    y.normalize()
    x = y.cross(d).normalized()
    return x, y


def ring_pts(c, xd, yd, rx, ry, n, sq=1.0, a0=0.0):
    pts = []
    for k in range(n):
        a = a0 + 2 * pi * k / n
        ca, sa = cos(a), sin(a)
        if sq != 1.0:
            ca = math.copysign(abs(ca) ** sq, ca)
            sa = math.copysign(abs(sa) ** sq, sa)
        pts.append(c + xd * (ca * rx) + yd * (sa * ry))
    return pts


def loft(acc, rings, n, cap0=True, cap1=True):
    """rings: list of point lists (each n points)."""
    verts, faces = [], []
    for r in rings:
        verts.extend(r)
    for i in range(len(rings) - 1):
        for k in range(n):
            a, b = i * n + k, i * n + (k + 1) % n
            faces.append((a, b, b + n, a + n))
    if cap0:
        c = sum(rings[0], Vector()) / n
        verts.append(c)
        ci = len(verts) - 1
        for k in range(n):
            faces.append((ci, (k + 1) % n, k))
    if cap1:
        c = sum(rings[-1], Vector()) / n
        verts.append(c)
        ci = len(verts) - 1
        base = (len(rings) - 1) * n
        for k in range(n):
            faces.append((ci, base + k, base + (k + 1) % n))
    acc.add(verts, faces)


def limb(acc, p0, p1, prof, n=16, ref=FWD):
    """prof: list of (t, rx, ry, fwd_offset)."""
    d = p1 - p0
    xd, yd = frame_for(d, ref)
    rings = []
    for t, rx, ry, fo in prof:
        rings.append(ring_pts(p0 + d * t + yd * fo, xd, yd, rx, ry, n))
    loft(acc, rings, n)


def ellipsoid(acc, c, r, rot=None, seg=16, rings=10):
    rot = rot or Matrix.Identity(3)
    verts, faces = [], []
    verts.append(c + rot @ V(0, 0, -r[2]))
    for i in range(1, rings):
        th = -pi / 2 + pi * i / rings
        for k in range(seg):
            a = 2 * pi * k / seg
            verts.append(c + rot @ V(cos(th) * cos(a) * r[0], cos(th) * sin(a) * r[1], sin(th) * r[2]))
    verts.append(c + rot @ V(0, 0, r[2]))
    top = len(verts) - 1
    for k in range(seg):
        faces.append((0, 1 + (k + 1) % seg, 1 + k))
    for i in range(rings - 2):
        for k in range(seg):
            a = 1 + i * seg + k
            b = 1 + i * seg + (k + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    base = 1 + (rings - 2) * seg
    for k in range(seg):
        faces.append((top, base + k, base + (k + 1) % seg))
    acc.add(verts, faces)


def tube_rings(pts, radii, n, ref, flat=1.0):
    """Parallel-transport frames along a polyline -> rings."""
    rings = []
    t_prev = (pts[1] - pts[0]).normalized()
    x = ref - t_prev * ref.dot(t_prev)
    if x.length < 1e-5:
        x = X - t_prev * X.dot(t_prev)
    x.normalize()
    for i, p in enumerate(pts):
        if i == 0:
            t = t_prev
        elif i == len(pts) - 1:
            t = (pts[i] - pts[i - 1]).normalized()
        else:
            t = (pts[i + 1] - pts[i - 1]).normalized()
        rq = t_prev.rotation_difference(t)
        x = (rq @ x)
        x = (x - t * x.dot(t)).normalized()
        y = t.cross(x).normalized()
        t_prev = t
        r = radii[i]
        rings.append(ring_pts(p, x, y, r, r * flat, n))
    return rings


def rot_from(fwd_axis, up_axis):
    """3x3 with columns (x, y, z) where y = fwd_axis, z ~ up_axis."""
    yv = fwd_axis.normalized()
    zv = (up_axis - yv * up_axis.dot(yv)).normalized()
    xv = yv.cross(zv)
    return Matrix((xv, yv, zv)).transposed()


# ----------------------------------------------------------------------------------------------
# Part builders (objects)
# ----------------------------------------------------------------------------------------------

def grid_faces(rows, cols, closed=False):
    faces = []
    nc = cols if closed else cols - 1
    for i in range(rows - 1):
        for j in range(nc):
            j2 = (j + 1) % cols
            faces.append((i * cols + j, i * cols + j2, (i + 1) * cols + j2, (i + 1) * cols + j))
    return faces


def shell(name, grid, mat, weights, thick=0.012, bevel=None, closed=False, outward=None,
          color=(1, 1, 1), smooth=50, tag="armor", subsurf=0, rim=True, lip=True):
    """Curved plate: outer surface + rounded turned-down lip (no hidden inner skin -> ~half the tris)."""
    if bevel == 0:
        lip = False
    rows, cols = len(grid), len(grid[0])

    def G(i, j):
        if closed:
            j %= cols
        else:
            j = max(0, min(cols - 1, j))
        return grid[max(0, min(rows - 1, i))][j]
    norms = {}
    for i in range(rows):
        for j in range(cols):
            du = G(i, j + 1) - G(i, j - 1)
            dv = G(i + 1, j) - G(i - 1, j)
            n = du.cross(dv)
            if n.length < 1e-9:
                n = Vector((0, 0, 1))
            n.normalize()
            if outward is not None and n.dot(outward(grid[i][j])) < 0:
                n = -n
            norms[i, j] = n
    verts = [p for row in grid for p in row]
    idx = lambda i, j: i * cols + (j % cols)
    faces = []

    def add_face(f, want):
        a, b, c = verts[f[0]], verts[f[1]], verts[f[2]]
        n = (b - a).cross(c - a)
        if len(f) > 3:
            n += (c - a).cross(verts[f[3]] - a)
        faces.append(tuple(reversed(f)) if n.dot(want) < 0 else tuple(f))
    nc = cols if closed else cols - 1
    for i in range(rows - 1):
        for j in range(nc):
            f = (idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j))
            add_face(f, norms[i, j] + norms[i + 1, (j + 1) % cols])
    if lip and thick > 0:
        loops = []
        if closed:
            loops.append(([(0, j) for j in range(cols)], True))
            loops.append(([(rows - 1, j) for j in range(cols)], True))
        else:
            per = [(0, j) for j in range(cols)] + [(i, cols - 1) for i in range(1, rows)] + \
                  [(rows - 1, j) for j in range(cols - 2, -1, -1)] + [(i, 0) for i in range(rows - 2, 0, -1)]
            loops.append((per, True))
        for loop, cyc in loops:
            mids, lows, touts = [], [], []
            for (i, j) in loop:
                p = grid[i][j]
                n = norms[i, j]
                t = Vector()
                if i == 0:
                    t += G(0, j) - G(1, j)
                if i == rows - 1:
                    t += G(rows - 1, j) - G(rows - 2, j)
                if not closed and j == 0:
                    t += G(i, 0) - G(i, 1)
                if not closed and j == cols - 1:
                    t += G(i, cols - 1) - G(i, cols - 2)
                t -= n * t.dot(n)
                t = t.normalized() if t.length > 1e-9 else Vector()
                touts.append(t)
                verts.append(p + t * thick * 0.42 - n * thick * 0.42)
                mids.append(len(verts) - 1)
                verts.append(p + t * thick * 0.25 - n * thick * 1.1)
                lows.append(len(verts) - 1)
            m = len(loop)
            for k in range(m if cyc else m - 1):
                k2 = (k + 1) % m
                a, b = idx(*loop[k]), idx(*loop[k2])
                want = touts[k] + touts[k2]
                add_face((a, b, mids[k2], mids[k]), want)
                add_face((mids[k], mids[k2], lows[k2], lows[k]), want)
    ob = new_obj(name, verts, faces, mat)
    if subsurf:
        sm = ob.modifiers.new("sub", 'SUBSURF')
        sm.levels = subsurf
    return finish(ob, weights, color, smooth, tag)


def solid(name, acc, mat, weights, color=(1, 1, 1), smooth=50, tag="misc", subsurf=0, bevel=0.0):
    ob = new_obj(name, acc.v, acc.f, mat)
    if subsurf:
        s = ob.modifiers.new("sub", 'SUBSURF')
        s.levels = subsurf
    if bevel:
        bv = ob.modifiers.new("bev", 'BEVEL')
        bv.width = bevel
        bv.segments = 2
        bv.limit_method = 'ANGLE'
        bv.angle_limit = radians(40)
    return finish(ob, weights, color, smooth, tag)


def rbox(acc, c, size, rot=None):
    rot = rot or Matrix.Identity(3)
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    vs = [c + rot @ V(sx * hx, sy * hy, sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    fs = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    acc.add(vs, fs)


# ----------------------------------------------------------------------------------------------
# Surface wrapping (armour that conforms to the sculpted body)
# ----------------------------------------------------------------------------------------------
class Wrap:
    def __init__(self, bvh):
        self.bvh = bvh

    def hit(self, o, d, rdef, maxd=0.6):
        h = self.bvh.ray_cast(o, d, maxd)
        if h[0] is None:
            return rdef
        return (h[0] - o).length

    def cyl(self, p0, p1, fn, nu, nv, offset, rdef=0.08, bulge=None, side=None, ref=FWD, closed=False):
        """fn(u, v) -> (t along axis, angle deg from ref toward side)."""
        ax = p1 - p0
        a_n = ax.normalized()
        f = (ref - a_n * ref.dot(a_n)).normalized()
        s = side if side is not None else a_n.cross(f)
        s = (s - a_n * s.dot(a_n) - f * s.dot(f)).normalized()
        grid = []
        ncols = nu if closed else nu + 1
        for i in range(nv + 1):
            v = i / nv
            row = []
            for j in range(ncols):
                u = j / nu
                t, ang = fn(u, v)
                o = p0 + ax * t
                d = f * cos(radians(ang)) + s * sin(radians(ang))
                r = self.hit(o, d, rdef)
                off = offset(u, v) if callable(offset) else offset
                if bulge:
                    off += bulge(u, v)
                row.append(o + d * (r + off))
            grid.append(row)
        return grid

    def sph(self, c, fn, nu, nv, offset, rdef=0.1, bulge=None, fwd=FWD, up=Z, closed=False):
        """fn(u, v) -> (elevation deg, azimuth deg from fwd toward +side)."""
        side = up.cross(fwd).normalized()
        grid = []
        ncols = nu if closed else nu + 1
        for i in range(nv + 1):
            v = i / nv
            row = []
            for j in range(ncols):
                u = j / nu
                el, az = fn(u, v)
                el, az = radians(el), radians(az)
                d = (fwd * cos(az) + side * sin(az)) * cos(el) + up * sin(el)
                r = self.hit(c, d, rdef)
                off = offset(u, v) if callable(offset) else offset
                if bulge:
                    off += bulge(u, v)
                row.append(c + d * (r + off))
            grid.append(row)
        return grid


# ----------------------------------------------------------------------------------------------
# Skeleton
# ----------------------------------------------------------------------------------------------

def make_joints(B):
    s = B["hs"]
    J = {}
    J["hips"] = V(0, 0, 0.985 * s)
    J["spine"] = V(0, 0, 1.105 * s)
    J["chest"] = V(0, 0, 1.265 * s)
    J["neck"] = V(0, 0.014, 1.525 * s)
    J["head"] = V(0, 0.006, 1.628 * s)
    J["headtop"] = V(0, 0.006, 1.87 * s)
    for side, sx in (("L", -1), ("R", 1)):
        sh = V(sx * B["shw"], 0.018, 1.462 * s)
        d1 = V(sx * sin(radians(15)), 0.03, -cos(radians(15))).normalized()
        el = sh + d1 * 0.285 * s
        d2 = V(sx * sin(radians(8)), -sin(radians(17)), -1).normalized()
        wr = el + d2 * 0.25 * s
        d3 = (d2 + V(0, -0.05, 0)).normalized()
        J["sh" + side], J["el" + side], J["wr" + side] = sh, el, wr
        J["hd" + side] = wr + d3 * 0.095 * s
        J["hdir" + side] = d3
        lw = B["legw"]
        J["hip" + side] = V(sx * lw, 0.0, 0.935 * s)
        J["kn" + side] = V(sx * (lw + 0.012), -0.012, 0.515 * s)
        J["an" + side] = V(sx * (lw + 0.02), 0.018, 0.088 * s)
        J["ball" + side] = V(sx * (lw + 0.026), -0.10, 0.03 * s)
        J["toe" + side] = V(sx * (lw + 0.03), -0.17, 0.025 * s)
    return J


BONES = [
    ("Hips", "hips", "spine", None), ("Spine", "spine", "chest", "Hips"), ("Chest", "chest", "neck", "Spine"),
    ("Neck", "neck", "head", "Chest"), ("Head", "head", "headtop", "Neck"),
    ("UpperArmL", "shL", "elL", "Chest"), ("ForearmL", "elL", "wrL", "UpperArmL"), ("HandL", "wrL", "hdL", "ForearmL"),
    ("UpperArmR", "shR", "elR", "Chest"), ("ForearmR", "elR", "wrR", "UpperArmR"), ("HandR", "wrR", "hdR", "ForearmR"),
    ("ThighL", "hipL", "knL", "Hips"), ("ShinL", "knL", "anL", "ThighL"), ("FootL", "anL", "ballL", "ShinL"),
    ("ThighR", "hipR", "knR", "Hips"), ("ShinR", "knR", "anR", "ThighR"), ("FootR", "anR", "ballR", "ShinR"),
]


def build_armature(hid, J):
    ad = bpy.data.armatures.new(f"{hid}_Armature")
    arm = bpy.data.objects.new(f"{hid}_Rig", ad)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = ad.edit_bones
    for name, h, t, par in BONES:
        b = eb.new(name)
        b.head, b.tail = J[h], J[t]
        b.roll = 0.0
        if par:
            b.parent = eb[par]
            b.use_connect = (eb[par].tail - b.head).length < 1e-6
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


# ----------------------------------------------------------------------------------------------
# Body
# ----------------------------------------------------------------------------------------------

def body_acc(B, J):
    s = B["hs"]
    fem = B["fem"]
    acc = Acc()
    cw, ww, hw = B["chest"], B["waist"], B["hip"]
    # (z, half-width, front depth, back depth, y-centre)
    if not fem:
        prof = [(0.86, .118, .074, .080, 0), (0.92, .150, .088, .100, .004), (0.98, .155, .090, .098, 0),
                (1.05, .141, .086, .088, 0), (1.11, .127, .084, .084, 0), (1.18, .136, .090, .088, 0),
                (1.26, .152, .100, .094, -.002), (1.34, .166, .112, .100, -.004), (1.41, .172, .112, .100, -.002),
                (1.47, .160, .094, .092, .004), (1.51, .118, .074, .080, .010), (1.535, .072, .058, .064, .012)]
    else:
        prof = [(0.86, .122, .074, .082, 0), (0.92, .160, .088, .106, .006), (0.98, .162, .088, .100, 0),
                (1.05, .140, .082, .086, 0), (1.11, .118, .078, .080, 0), (1.18, .124, .082, .082, 0),
                (1.26, .140, .090, .088, -.002), (1.34, .150, .098, .092, -.002), (1.41, .154, .098, .092, 0),
                (1.47, .146, .088, .088, .004), (1.51, .110, .070, .076, .010), (1.535, .066, .054, .060, .012)]
    n = 24
    rings = []
    for z, w, df, db, yc in prof:
        m = cw if z >= 1.24 else (ww if z >= 1.03 else hw)
        if 1.18 <= z < 1.24:
            m = (cw + ww) / 2
        pts = []
        for k in range(n):
            a = 2 * pi * k / n
            sa, ca = sin(a), cos(a)
            sa2 = math.copysign(abs(sa) ** 0.85, sa)
            ca2 = math.copysign(abs(ca) ** 0.85, ca)
            dep = (df if ca > 0 else db) * (m * 0.5 + 0.5) * 1.07
            pts.append(V(w * m * sa2, yc - dep * ca2, z * s))
        rings.append(pts)
    loft(acc, rings, n)
    sc = lambda z: z * s
    for sx in (-1, 1):
        sh = J["shL" if sx < 0 else "shR"]
        if not fem:
            ellipsoid(acc, V(sx * .074 * cw, -.082 * cw, sc(1.385)), (.074 * cw, .042 * cw, .056), seg=14, rings=8)
        else:
            ellipsoid(acc, V(sx * .064, -.080, sc(1.365)), (.060, .052, .056), seg=14, rings=8)
        # deltoid, trapezius, lats, glutes
        ellipsoid(acc, sh + V(sx * .014, 0.0, -0.012), (.062 * B["arm"], .068 * B["arm"], .078), seg=14, rings=9)
        limb(acc, V(sx * .035, .022, sc(1.535)), sh + V(-sx * .03, .01, .012), [(0, .034, .03, 0), (1, .03, .028, 0)], n=10)
        ellipsoid(acc, V(sx * .10 * cw, .048, sc(1.33)), (.07 * cw, .055, .12), seg=12, rings=8)
        ellipsoid(acc, V(sx * .07 * hw, .058, sc(0.925)), (.075 * hw, .062 * hw, .08), seg=12, rings=8)
    # neck
    limb(acc, V(0, .016, sc(1.48)), V(0, .006, sc(1.665)), [(0, .056, .058, 0), (0.6, .048, .050, 0), (1, .046, .048, 0)], n=14)
    am, lm = B["arm"] * 1.12, B["leg"] * 1.10
    for side, sx in (("L", -1), ("R", 1)):
        sh, el, wr = J["sh" + side], J["el" + side], J["wr" + side]
        limb(acc, sh, el, [(-0.05, .054 * am, .056 * am, 0), (0.18, .055 * am, .059 * am, -.004), (0.45, .052 * am, .058 * am, -.008),
                           (0.75, .046 * am, .049 * am, -.004), (1.0, .040 * am, .041 * am, 0)])
        ellipsoid(acc, el, (.040 * am, .040 * am, .042 * am), seg=12, rings=8)
        limb(acc, el, wr, [(0.0, .041 * am, .041 * am, 0), (0.2, .047 * am, .045 * am, .002), (0.45, .043 * am, .040 * am, 0),
                           (0.8, .034 * am, .030 * am, 0), (1.0, .030 * am, .025 * am, 0)])
        # hand (mitten + thumb). frame: length = hdir, width = forward, thickness = lateral
        hd = J["hdir" + side]
        fwdp = (FWD - hd * FWD.dot(hd)).normalized()
        lat = hd.cross(fwdp).normalized()
        rot = Matrix((lat, fwdp, hd)).transposed()   # x = lateral(thick), y = width, z = length
        hs_ = am * 0.95 + 0.05
        ellipsoid(acc, wr + hd * 0.048, (.021 * hs_, .043 * hs_, .052), rot, seg=12, rings=8)
        inward = V(-sx, 0, 0)
        ellipsoid(acc, wr + hd * 0.112 + inward * 0.008 - fwdp * 0.004, (.019 * hs_, .040 * hs_, .042), rot, seg=12, rings=8)
        limb(acc, wr + hd * 0.02 + fwdp * 0.03, wr + hd * 0.085 + fwdp * 0.052 + inward * 0.012,
             [(0, .015, .015, 0), (0.6, .013, .012, 0), (1.0, .010, .010, 0)], n=8)
        ellipsoid(acc, wr + hd * 0.088 + fwdp * 0.052 + inward * 0.012, (.010, .010, .012), seg=8, rings=6)
        # legs
        hip, kn, an = J["hip" + side], J["kn" + side], J["an" + side]
        top = hip + V(0, 0, 0.05)
        limb(acc, top, kn, [(0.0, .084 * lm, .088 * lm, 0), (0.12, .090 * lm, .092 * lm, 0), (0.4, .080 * lm, .085 * lm, -.006),
                            (0.75, .064 * lm, .066 * lm, -.006), (1.0, .053 * lm, .055 * lm, -.002)])
        ellipsoid(acc, kn + V(0, -0.006, 0), (.052 * lm, .054 * lm, .056), seg=12, rings=8)
        limb(acc, kn, an, [(0.0, .051 * lm, .054 * lm, 0), (0.22, .055 * lm, .062 * lm, -.012), (0.45, .050 * lm, .053 * lm, -.006),
                           (0.8, .038 * lm, .040 * lm, 0), (1.0, .034 * lm, .036 * lm, 0)])
        toe, ball = J["toe" + side], J["ball" + side]
        ellipsoid(acc, an + V(0, 0.022, -0.04), (.036, .045, .045), seg=12, rings=8)
        ellipsoid(acc, V(an.x + sx * 0.006, (an.y + toe.y) / 2 - 0.01, 0.042), (.040, .105, .034), seg=12, rings=8)
    return acc


def voxelize(ob, voxel, smooth_iter=6, smooth_fac=0.5, faces=None):
    r = ob.modifiers.new("rm", 'REMESH')
    r.mode = 'VOXEL'
    r.voxel_size = voxel
    r.adaptivity = 0.0
    sm = ob.modifiers.new("sm", 'SMOOTH')
    sm.factor = smooth_fac
    sm.iterations = smooth_iter
    apply_all(ob)
    hi = ob.data.copy()
    if faces:
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        ok = False
        try:
            res = bpy.ops.object.quadriflow_remesh(target_faces=faces, use_mesh_symmetry=False, use_preserve_sharp=False,
                                                   use_preserve_boundary=False, seed=3)
            ok = 'FINISHED' in res and len(ob.data.polygons) > faces * 0.5
        except Exception as e:
            print("quadriflow failed", e)
        if not ok:
            print("quadriflow fallback -> decimate")
            ob.data = hi.copy()
            d = ob.modifiers.new("dec", 'DECIMATE')
            d.ratio = min(1.0, faces * 2.0 / max(1, len(ob.data.polygons)))
            apply_all(ob)
    return hi


def build_body(hid, B, J, H, arm, mats):
    acc = body_acc(B, J)
    ob = new_obj(f"{hid}_body", acc.v, acc.f, mats["fab"])
    hi = voxelize(ob, 0.0065, smooth_iter=6, smooth_fac=0.55, faces=2420)
    bvh_ob = bpy.data.objects.new("bvhbody", hi)
    bvh = BVHTree.FromPolygons([v.co.copy() for v in hi.vertices], [tuple(p.vertices) for p in hi.polygons])
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    suit, glove = lin(H["suit"]), lin(H["glove"])
    wrL, wrR = J["wrL"], J["wrR"]

    def col(co):
        for w, side in ((wrL, "L"), (wrR, "R")):
            if (co - w).dot(J["hdir" + side]) > -0.025 and (co - w).length < 0.25:
                return glove
        if co.z < 0.16:
            return glove
        return suit
    set_color(ob, col)
    TRI_LOG["body"] = sum(len(p.vertices) - 2 for p in me.polygons)
    # heat weights
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    bpy.ops.object.select_all(action='DESELECT')
    if len(ob.vertex_groups) < 10:
        print("WARNING heat weights incomplete for", hid, len(ob.vertex_groups))
    return ob, bvh


def build_head(hid, B, J, H, mats):
    s = B["hs"]
    fem = B["fem"]
    acc = Acc()
    hb = J["head"]
    k = (0.95 if fem else 1.0) * 1.06

    def P(x, y, z):
        return hb + V(x * k, y * k, z * k)
    ellipsoid(acc, P(0, .010, .130), (.088, .103, .100), seg=20, rings=14)            # cranium
    ellipsoid(acc, P(0, -.028, .075), (.072, .076, .086), seg=18, rings=12)            # face mass
    jaw = .056 if fem else .064
    ellipsoid(acc, P(0, -.046, .028), (jaw, .054, .044), seg=16, rings=10)              # jaw
    ellipsoid(acc, P(0, -.086, .010), (.026 if fem else .031, .022, .022), seg=12, rings=8)  # chin
    for sx in (-1, 1):
        ellipsoid(acc, P(sx * .051, -.072, .084), (.025, .022, .019), seg=10, rings=8)  # cheekbones
        ellipsoid(acc, P(sx * .089, .006, .094), (.012, .021, .029), seg=10, rings=8)   # ears
    limb(acc, P(-.047, -.090, .135), P(.047, -.090, .135), [(0, .012, .011, 0), (0.5, .015, .013, .006), (1, .012, .011, 0)], n=10, ref=Z)
    limb(acc, P(0, -.098, .128), P(0, -.117, .088), [(0, .010, .010, 0), (0.7, .014, .013, 0), (1.0, .012, .010, 0)], n=10)
    ellipsoid(acc, P(0, -.098, .046), (.024, .012, .009), seg=10, rings=6)              # lips
    limb(acc, P(0, .012, -.05), P(0, .006, .05), [(0, .047, .049, 0), (1, .047, .049, 0)], n=12)  # neck stub
    ob = new_obj(f"{hid}_head", acc.v, acc.f, mats["skn"])
    hi = voxelize(ob, 0.0032, smooth_iter=4, smooth_fac=0.5, faces=630)
    bvh = BVHTree.FromPolygons([v.co.copy() for v in hi.vertices], [tuple(p.vertices) for p in hi.polygons])
    finish(ob, {"Head": 1.0}, (1, 1, 1), smooth=180, tag="head")
    center = P(0, 0.0, .112)
    # glowing eyes
    eacc = Acc()
    for sx in (-1, 1):
        o = P(sx * .032, 0, .106)
        h = bvh.ray_cast(o, FWD, 0.3)
        p = (h[0] if h[0] else o + FWD * 0.09) + FWD * 0.003
        rot = rot_from(V(sx * 0.35, -1, 0), Z)
        ellipsoid(eacc, p + V(0, -0.001, 0), (.016, .007, .0075), rot, seg=10, rings=6)
    solid(f"{hid}_eyes", eacc, mats["em"], {"Head": 1.0}, tag="head")
    if hid in ("hela", "zeus", "valkyrie", "thor"):
        # shadowed brow / war-paint band so the eyes read at distance
        hwr = Wrap(bvh)
        g = hwr.sph(center, lambda u, v: (lerp(-7, 10, v), (2 * u - 1) * 62), 10, 2, 0.0015,
                    bulge=lambda u, v: 0.0012 * sin(v * pi))
        shell(f"{hid}_eyeband", g, mats["drk"], {"Head": 1.0}, thick=0.0, bevel=0, outward=lambda p: p - center, tag="head")
    return bvh, center, P


# ----------------------------------------------------------------------------------------------
# Armour kit
# ----------------------------------------------------------------------------------------------

def build_kit(hid, B, J, H, mats, bw, hw, hc, HP):
    s = B["hs"]
    fem = B["fem"]
    pri, acc_m, drk, em, fab, skn = mats["pri"], mats["acc"], mats["drk"], mats["em"], mats["fab"], mats["skn"]
    cloth, fur, hair = lin(H["cloth"]), lin(H["fur"]), lin(H["hair"])
    suitc = lin(H["suit"])
    ax0, ax1 = V(0, 0.004, 0.86 * s), V(0, 0.004, 1.56 * s)
    L = ax1.z - ax0.z
    tz = lambda z: (z * s - ax0.z) / L
    out_axis = lambda c: V(c.x, c.y - 0.004, 0)

    def ab(u):  # -1..1
        return 2 * u - 1

    heavy = hid in ("hades", "thor")
    # ---------------- chest plate ----------------
    if hid == "zeus":
        # long coat body (fabric) under a gold cuirass
        g = bw.cyl(ax0, ax1, lambda u, v: (lerp(tz(1.0), tz(1.505), v), lerp(28, 332, u) + 0 * v), 22, 6, 0.010)
        shell("coat_torso", g, fab, lambda c: {"Chest": smooth01((c.z - 1.12 * s) / 0.12), "Spine": 1 - smooth01((c.z - 1.12 * s) / 0.12) + 0.001},
              thick=0.008, outward=out_axis, color=cloth, tag="cloth")
    def chest_fn(u, v):
        a = ab(u)
        hwid = lerp(58, 82 if not fem else 74, v ** 0.7)
        tb = tz(1.215 if not fem else 1.235) + (tz(1.25) - tz(1.215)) * abs(a) ** 2.0
        tt = tz(1.435) + (tz(1.505) - tz(1.435)) * abs(a) ** 1.1
        return lerp(tb, tt, v), a * hwid
    ridge = lambda u, v: 0.007 * max(0, 1 - abs(ab(u)) * 3.0) ** 2 + 0.004 * (1 - abs(ab(u)))
    choff = 0.024 if hid != "zeus" else 0.03
    if heavy:
        choff = 0.03
    g = bw.cyl(ax0, ax1, chest_fn, 14, 7, choff, bulge=ridge)
    shell("chest", g, pri, {"Chest": 1.0}, thick=0.016, outward=out_axis, tag="armor")
    def trim_fn(u, v):
        t, a = chest_fn(u, 1.0)
        return t - (1 - v) * 0.045, a * 0.97
    if hid in ("thor", "hades", "zeus", "valkyrie"):
        g = bw.cyl(ax0, ax1, trim_fn, 14, 1, choff + 0.004, bulge=ridge)
        shell("chest_trim", g, acc_m, {"Chest": 1.0}, thick=0.008, outward=out_axis, tag="armor")
    # emissive core lines on the chest
    if hid in ("thor", "zeus"):
        # lightning zig-zag
        zz = [(0.0, 0), (0.25, 7), (0.45, -5), (0.7, 6), (1.0, 0)]
        def bolt(u, v):
            # v along bolt, u across
            k = min(int(v * 4), 3)
            t0, a0 = zz[k]
            t1, a1 = zz[k + 1]
            f = (v - t0) / (t1 - t0)
            ang = lerp(a0, a1, f) + ab(u) * 2.2
            return lerp(tz(1.25), tz(1.43), v), ang
        g = bw.cyl(ax0, ax1, bolt, 1, 16, choff + 0.0025, bulge=lambda u, v: 0.011)
        shell("chest_em", g, em, {"Chest": 1.0}, thick=0.004, bevel=0, outward=out_axis, tag="em")
    else:
        for sx in (-1, 1):
            g = bw.cyl(ax0, ax1, lambda u, v, sx=sx: (lerp(tz(1.30), tz(1.44), v), sx * (lerp(12, 34, v) + ab(u) * 2.0)), 1, 6,
                       choff + 0.0025, bulge=lambda u, v: 0.004)
            shell(f"chest_em{sx}", g, em, {"Chest": 1.0}, thick=0.004, bevel=0, outward=out_axis, tag="em")
    # back plate
    g = bw.cyl(ax0, ax1, lambda u, v: (lerp(tz(1.22), tz(1.49), v), 180 + ab(u) * lerp(52, 66, v)), 10, 6, 0.020)
    shell("back", g, pri if hid != "thor" else drk, {"Chest": 1.0}, thick=0.014, outward=out_axis, tag="armor")
    # abdominal lames (front)
    nb = 3 if not fem else 2
    for i in range(nb):
        z0 = 1.08 + i * 0.055
        wts = [{"Hips": 0.4, "Spine": 0.6}, {"Spine": 1.0}, {"Spine": 0.5, "Chest": 0.5}][i if not fem else i + 1]
        g = bw.cyl(ax0, ax1, lambda u, v, z0=z0, i=i: (lerp(tz(z0), tz(z0 + 0.062), v), ab(u) * (46 - i * 2)), 8, 2, 0.016 + 0.003 * i,
                   bulge=lambda u, v: 0.004 * (1 - abs(ab(u))))
        shell(f"abs{i}", g, drk if hid not in ("zeus",) else pri, wts, thick=0.010, outward=out_axis, tag="armor")
    # belt (closed ring) + buckle
    g = bw.cyl(ax0, ax1, lambda u, v: (lerp(tz(0.955), tz(1.03), v), u * 360), 20, 2, 0.012, closed=True)
    shell("belt", g, drk, {"Hips": 1.0}, thick=0.016, closed=True, outward=out_axis, tag="armor")
    bk = Acc()
    hb = bw.bvh.ray_cast(V(0, 0, 0.99 * s), FWD, 0.5)[0] or V(0, -0.1, 0.99 * s)
    rbox(bk, hb + V(0, -0.022, 0), (0.075, 0.018, 0.058))
    solid("buckle", bk, acc_m, {"Hips": 1.0}, bevel=0.006, tag="armor")
    gm = Acc()
    ellipsoid(gm, hb + V(0, -0.033, 0), (0.016, 0.006, 0.016), seg=10, rings=6)
    solid("buckle_gem", gm, em, {"Hips": 1.0}, tag="em")
    # belt pouches (tactical layering)
    po = Acc()
    for az, w_, h_ in ((118, 0.07, 0.075), (-118, 0.07, 0.075), (160, 0.06, 0.06), (-62, 0.05, 0.065)):
        d = V(sin(radians(az)), -cos(radians(az)), 0)
        hp = bw.bvh.ray_cast(V(0, 0, 0.99 * s), d, 0.5)[0] or d * 0.16
        rot = rot_from(d, Z)
        rbox(po, hp + d * 0.03 + V(0, 0, -0.012), (w_, 0.04, h_), rot)
    solid("pouches", po, drk, {"Hips": 1.0}, bevel=0.008, tag="armor")
    if hid in ("loki", "valkyrie", "hela", "zeus"):
        ho = Acc()
        kR, hR = J["knR"], J["hipR"]
        hp = bw.bvh.ray_cast(lerp(hR, kR, 0.35), V(1, 0, 0), 0.4)[0] or lerp(hR, kR, 0.35) + V(0.08, 0, 0)
        rbox(ho, hp + V(0.022, 0, 0), (0.035, 0.085, 0.14), rot_from(V(0, -1, 0), (kR - hR).normalized() * -1))
        solid("holster", ho, drk, {"ThighR": 1.0}, bevel=0.009, tag="armor")
    # collar / gorget
    if hid not in ("thor",):
        g = bw.cyl(ax0, ax1, lambda u, v: (lerp(tz(1.47), tz(1.545), v), u * 360), 18, 2, lambda u, v: 0.010 + 0.006 * v, closed=True)
        shell("collar", g, drk if hid != "hela" else pri, lambda c: {"Chest": 0.7, "Neck": 0.3}, thick=0.012, closed=True,
              outward=out_axis, tag="armor")

    # ---------------- shoulders ----------------
    for side, sx in (("L", -1), ("R", 1)):
        sh = J["sh" + side]
        c = sh + V(sx * 0.0, 0.0, -0.01)
        big = (hid == "thor" and sx < 0) or hid == "hades"
        small = hid in ("loki", "hela", "valkyrie") or (hid == "thor" and sx > 0)
        lames = [(26, 86, 92, 0.034), (-2, 34, 94, 0.046), (-30, 4, 86, 0.054)]
        if small:
            lames = [(18, 86, 84, 0.026), (-14, 24, 86, 0.036)]
        if big:
            lames = [(30, 88, 100, 0.048), (2, 40, 102, 0.062), (-24, 10, 96, 0.072), (-48, -16, 86, 0.078)]
        if hid == "loki" and sx > 0:
            lames = []  # asymmetric: single pauldron on the off-hand shoulder
        for li, (e0, e1, half, off) in enumerate(lames):
            def fn(u, v, e0=e0, e1=e1, half=half):
                a = ab(u)
                return lerp(e0 - 6 * (1 - abs(a)) ** 2 * (li > 0), e1, v), 90 * sx + sx * a * half * (1 - 0.25 * v)
            g = bw.sph(c, fn, 9, 3, off, bulge=lambda u, v: 0.010 * (1 - abs(ab(u))) ** 2 + 0.008 * v)
            w = {"UpperArm" + side: 0.55, "Chest": 0.45} if li == 0 else {"UpperArm" + side: 0.85, "Chest": 0.15}
            shell(f"paul{side}{li}", g, pri if li % 2 == 0 else acc_m, w, thick=0.012, outward=lambda p, c=c: p - c, tag="armor")
        # emissive trim on the top lame
        e0, e1, half, off = lames[0] if lames else (0, 0, 0, 0)
        g = bw.sph(c, lambda u, v, e0=e0, half=half: (e0 + 4 + 3 * v, 90 * sx + sx * ab(u) * half * 0.9), 9, 1, off + 0.0025,
                   bulge=lambda u, v: 0.010 * (1 - abs(ab(u))) ** 2 + 0.008 * (4 / 65))
        if lames:
          shell(f"paul_em{side}", g, em, {"UpperArm" + side: 0.55, "Chest": 0.45}, thick=0.004, bevel=0, outward=lambda p, c=c: p - c, tag="em")
        if hid == "thor" and sx < 0:
            # hammer-head motif block mounted on the big pauldron
            hm = Acc()
            top = c + V(sx * 0.03, 0.0, 0.11)
            rot = rot_from(V(0, 1, 0), V(sx * -0.45, 0, 1))
            rbox(hm, top, (0.115, 0.17, 0.075), rot)
            rbox(hm, top + rot @ V(0, 0, 0.045), (0.06, 0.05, 0.03), rot)
            solid("hammer", hm, acc_m, {"UpperArmL": 0.6, "Chest": 0.4}, bevel=0.012, tag="armor")
            hd_ = Acc()
            hp0 = top + rot @ V(0, 0, -0.01)
            loft(hd_, tube_rings([hp0 + rot @ V(0, 0, 0.0) + V(sx * 0.05, 0, -0.01), hp0 + V(sx * 0.10, 0.0, -0.05), hp0 + V(sx * 0.15, 0.0, -0.09)],
                                [0.016, 0.016, 0.02], 8, Y), 8)
            solid("hammer_handle", hd_, drk, {"UpperArmL": 0.8, "Chest": 0.2}, tag="armor")
            ha = Acc()
            rbox(ha, top + rot @ V(0, -0.0855, 0), (0.07, 0.006, 0.04), rot)
            rbox(ha, top + rot @ V(0, 0.0855, 0), (0.07, 0.006, 0.04), rot)
            solid("hammer_em", ha, em, {"UpperArmL": 0.6, "Chest": 0.4}, tag="em")
        if hid == "hades":
            sp = Acc()
            for k, (az, el, ln) in enumerate([(-30, 60, 0.11), (10, 70, 0.14), (50, 55, 0.10)]):
                d = (FWD * cos(radians(az)) * cos(radians(el)) + V(sx, 0, 0) * 0 + V(0, 0, 1) * sin(radians(el)))
                d = (V(sx * cos(radians(el)), 0, sin(radians(el))) * 0.8 + V(0, sin(radians(az)) * 0.4, 0)).normalized()
                base = c + d * 0.105
                pts = [base, base + d * ln * 0.5, base + d * ln]
                loft(sp, tube_rings(pts, [0.022, 0.012, 0.001], 8, Z), 8, cap0=True, cap1=False)
            solid("paul_spikes" + side, sp, acc_m, {"UpperArm" + side: 0.5, "Chest": 0.5}, tag="armor")

        # ---------------- arms ----------------
        el, wr = J["el" + side], J["wr" + side]
        sidev = V(sx, 0, 0)
        # bracer (outer/back of forearm)
        g = bw.cyl(el, wr, lambda u, v: (lerp(0.30, 0.97, v), 90 + ab(u) * 105 * (1 - 0.1 * v)), 10, 4, 0.010,
                   side=sidev, ref=FWD, bulge=lambda u, v: 0.003)
        shell(f"bracer{side}", g, pri, {"Forearm" + side: 1.0}, thick=0.010, outward=lambda p, el=el, wr=wr: (p - el) - (wr - el).normalized() * (p - el).dot((wr - el).normalized()), tag="armor")
        g = bw.cyl(el, wr, lambda u, v: (lerp(0.52, 0.80, v), 90 + ab(u) * 4), 1, 4, 0.0125, side=sidev, bulge=lambda u, v: 0.003)
        shell(f"bracer_em{side}", g, em, {"Forearm" + side: 1.0}, thick=0.003, bevel=0,
              outward=lambda p, el=el, wr=wr: (p - el) - (wr - el).normalized() * (p - el).dot((wr - el).normalized()), tag="em")
        # cuff ring at wrist
        g = bw.cyl(el, wr, lambda u, v: (lerp(0.86, 1.0, v), u * 360), 12, 1, 0.006, side=sidev, closed=True)
        shell(f"cuff{side}", g, acc_m, {"Forearm" + side: 1.0}, thick=0.008, closed=True,
              outward=lambda p, el=el, wr=wr: (p - el) - (wr - el).normalized() * (p - el).dot((wr - el).normalized()), tag="armor")
        # upper-arm band
        if hid in ("thor", "zeus", "hades", "valkyrie"):
            sh_ = J["sh" + side]
            g = bw.cyl(sh_, el, lambda u, v: (lerp(0.58, 0.72, v), u * 360), 12, 1, 0.006, side=sidev, closed=True)
            shell(f"armband{side}", g, acc_m, {"UpperArm" + side: 1.0}, thick=0.008, closed=True,
                  outward=lambda p, a=sh_, b=el: (p - a) - (b - a).normalized() * (p - a).dot((b - a).normalized()), tag="armor")
        # knuckle plate
        hd = J["hdir" + side]
        fwdp = (FWD - hd * FWD.dot(hd)).normalized()
        kn = Acc()
        rot = Matrix((V(sx, 0, 0), fwdp, hd)).transposed()
        rot = rot_from(hd, V(sx, 0, 0))
        rbox(kn, wr + hd * 0.06 + V(sx * 0.024, 0, 0), (0.07, 0.07, 0.012), rot_from(fwdp, V(sx, 0, 0)))
        solid(f"knuckle{side}", kn, drk, {"Hand" + side: 1.0}, bevel=0.005, tag="armor")

        # ---------------- legs ----------------
        hip, knj, an = J["hip" + side], J["kn" + side], J["an" + side]
        top = hip + V(0, 0, 0.05)
        legout = lambda p, a=top, b=knj: (p - a) - (b - a).normalized() * (p - a).dot((b - a).normalized())
        shinout = lambda p, a=knj, b=an: (p - a) - (b - a).normalized() * (p - a).dot((b - a).normalized())
        # thigh plate (front-outer)
        if hid != "zeus" or True:
            g = bw.cyl(top, knj, lambda u, v: (lerp(0.22, 0.70, v), 22 + ab(u) * lerp(48, 58, v)), 8, 5, 0.012, side=sidev,
                       bulge=lambda u, v: 0.004 * (1 - abs(ab(u))))
            shell(f"thigh{side}", g, pri, {"Thigh" + side: 1.0}, thick=0.011, outward=legout, tag="armor")
            g = bw.cyl(top, knj, lambda u, v: (lerp(0.30, 0.62, v), 22 + 30 + ab(u) * 1.6), 1, 4, 0.0135, side=sidev,
                       bulge=lambda u, v: 0.004)
            shell(f"thigh_em{side}", g, em, {"Thigh" + side: 1.0}, thick=0.003, bevel=0, outward=legout, tag="em")
        # tasset (hip plate hanging from belt, outer side)
        if hid in ("thor", "hades", "valkyrie", "hela", "loki"):
            nt = 2 if hid in ("hades", "valkyrie") else 1
            for i in range(nt):
                g = bw.cyl(top, knj, lambda u, v, i=i: (lerp(-0.12 + i * 0.16, 0.16 + i * 0.16, v), 80 + ab(u) * 52),
                           8, 3, 0.022 + 0.008 * i, side=sidev, bulge=lambda u, v: 0.005 * (1 - abs(ab(u))))
                shell(f"tasset{side}{i}", g, acc_m if i == 0 else pri, {"Thigh" + side: 0.55, "Hips": 0.45}, thick=0.010,
                      outward=legout, tag="armor")
        # knee pad
        kc = knj + V(0, -0.0, 0)
        g = bw.sph(kc, lambda u, v: (lerp(-38, 42, v), ab(u) * lerp(56, 46, v)), 8, 5, 0.012,
                   bulge=lambda u, v: 0.006 * (1 - abs(ab(u))) ** 2)
        shell(f"knee{side}", g, acc_m, {"Shin" + side: 0.85, "Thigh" + side: 0.15}, thick=0.012, outward=lambda p, c=kc: p - c, tag="armor")
        # greave
        g = bw.cyl(knj, an, lambda u, v: (lerp(0.14, 0.80, v), ab(u) * lerp(62, 74, v)), 8, 5, 0.011, side=sidev,
                   bulge=lambda u, v: 0.007 * max(0, 1 - abs(ab(u)) * 2.5))
        shell(f"greave{side}", g, pri, {"Shin" + side: 1.0}, thick=0.011, outward=shinout, tag="armor")
        # boot: shaft ring + foot shell
        g = bw.cyl(knj, an, lambda u, v: (lerp(0.74, 1.04, v), u * 360), 14, 3, 0.008, side=sidev, closed=True)
        shell(f"bootshaft{side}", g, drk, lambda c, an=an: {"Shin" + side: smooth01((c.z - an.z + 0.02) / 0.08), "Foot" + side: 1 - smooth01((c.z - an.z + 0.02) / 0.08) + 0.001},
              thick=0.010, closed=True, outward=shinout, tag="boots")
        fa = Acc()
        heel_y, toe_y = an.y + 0.072, J["toe" + side].y - 0.012
        rings = []
        nfr = 11
        for i in range(nfr):
            t = i / (nfr - 1)
            yy = lerp(heel_y, toe_y, t)
            topz = lerp(0.135, 0.058, smooth01((t - 0.15) / 0.75)) * (1 if t < 0.92 else 0.92)
            w = lerp(0.044, 0.050, min(1, t * 1.6)) * (1 - 0.35 * max(0, (t - 0.82) / 0.18))
            if t < 0.08:
                w *= 0.85
            hz = topz / 2
            xc = an.x + sx * 0.008 * t
            pts = []
            for k2 in range(16):
                a = 2 * pi * k2 / 16
                ca, sa = cos(a), sin(a)
                ca = math.copysign(abs(ca) ** 0.55, ca)
                sa = math.copysign(abs(sa) ** (0.45 if sa < 0 else 0.9), sa)
                pts.append(V(xc + w * ca, yy, max(0.0, hz + hz * sa * 1.04)))
            rings.append(pts)
        loft(fa, rings, 16)
        solid(f"boot{side}", fa, drk, {"Foot" + side: 1.0}, tag="boots")
        # toe cap + heel plate
        tc = Acc()
        rot = rot_from(V(0, -1, -0.35), Z)
        ellipsoid(tc, V(an.x + sx * 0.008, toe_y + 0.045, 0.046), (0.047, 0.05, 0.024), rot_from(V(0, -1, 0.5), Z), seg=12, rings=6)
        solid(f"toecap{side}", tc, pri, {"Foot" + side: 1.0}, tag="boots")

    # ---------------- head gear / hero signature ----------------
    hero_specific(hid, B, J, H, mats, bw, hw, hc, HP)


def tube_part(name, pts, radii, mat, weights, n=8, ref=Z, flat=1.0, color=(1, 1, 1), tag="crest", cap1=False, subsurf=0):
    a = Acc()
    loft(a, tube_rings(pts, radii, n, ref, flat), n, cap0=True, cap1=cap1)
    return solid(name, a, mat, weights, color=color, tag=tag, subsurf=subsurf)


def bezier(p0, p1, p2, p3, n):
    out = []
    for i in range(n):
        t = i / (n - 1)
        a = (1 - t)
        out.append(p0 * a ** 3 + p1 * 3 * a * a * t + p2 * 3 * a * t * t + p3 * t ** 3)
    return out


def helmet(hw, hc, name, mat, lo, hi_open, open_fn, nu=20, nv=9, off=0.010, thick=0.012, weights=None, nape=None):
    """Spherical helmet from elevation lo..88. open_fn(el) = half-angle of face opening (deg) at elevation el.
    nape: lower elevation reached at the back of the head (neck guard)."""
    def fn(u, v):
        el = lerp(lo, 88, v)
        o = open_fn(el)
        az = lerp(o, 360 - o, u)
        if nape is not None:
            k = max(0.0, cos(radians(az - 180))) ** 1.5
            el = lerp(lerp(lo, nape, k), 88, v)
            o = open_fn(el)
            az = lerp(o, 360 - o, u)
        return el, az
    g = hw.sph(hc, fn, nu, nv, off)
    return shell(name, g, mat, weights or {"Head": 1.0}, thick=thick, outward=lambda p: p - hc, tag="helm")


def cape(bw, J, B, name, color, mats, az0, az1, z_top, z_bot, flare, nu=12, nv=10, tatter=0.0, gap=0.03, roll=True):
    s = B["hs"]
    cols = []
    grid = []
    prev = None
    for i in range(nv + 1):
        v = i / nv
        z = lerp(z_top, z_bot, v) * s
        row = []
        for j in range(nu + 1):
            u = j / nu
            az = radians(lerp(az0, az1, u))
            d = V(sin(az), -cos(az), 0)
            zz = z
            if tatter and i == nv:
                zz += tatter * (0.5 + 0.5 * cos(u * pi * 9)) * s
            o = V(0, 0.004, zz)
            r = None
            if zz > 0.98 * s:
                h = bw.bvh.ray_cast(o, d, 0.6)
                if h[0] is not None:
                    r = (h[0] - o).length + gap
            if r is None:
                r = prev[j] if prev else 0.15
            if prev:
                r = max(r, prev[j] - 0.004)
            fl = flare * v ** 1.6
            fold = 0.010 * sin(u * pi * 7) * v
            rr = min(r + fl + fold, 0.40)
            row.append(o + d * rr)
            if len(cols) <= j:
                cols.append(rr)
            else:
                cols[j] = rr
        prev = [p for p in cols]
        grid.append(row)
    if roll:
        # roll the top edge over the shoulders/neck
        top = [o * 1.0 for o in grid[0]]
        rolled = []
        for p in top:
            q = V(p.x * 0.84, (p.y - 0.004) * 0.78 + 0.004, p.z + 0.035 * s)
            rolled.append(q)
        grid.insert(0, rolled)
    zc = J["chest"].z

    def w(c):
        t = smooth01((zc + 0.08 - c.z) / 0.35)
        t2 = smooth01((J["spine"].z - c.z) / 0.3)
        return {"Chest": 1 - t + 0.001, "Spine": t * (1 - t2), "Hips": t * t2}
    return shell(name, grid, mats["fab"], w, thick=0.008, bevel=0.0, outward=lambda p: V(p.x, p.y, 0), color=color, tag="cloth")


def hero_specific(hid, B, J, H, mats, bw, hw, hc, HP):
    s = B["hs"]
    pri, acc_m, drk, em, fab, skn = mats["pri"], mats["acc"], mats["drk"], mats["em"], mats["fab"], mats["skn"]
    cloth, fur, hair = lin(H["cloth"]), lin(H["fur"]), lin(H["hair"])
    up_h = Z
    HB = {"Head": 1.0}
    if hid == "thor":
        # open-face half helm with cheek guards, crest fin, beard, fur-collar cape
        helmet(hw, hc, "helm", pri, 8, 88, lambda el: 42 if el < 18 else (lerp(42, 3, smooth01((el - 18) / 16))), nv=8, nape=-42)
        for sx in (-1, 1):
            g = hw.sph(hc, lambda u, v, sx=sx: (lerp(-38, 14, v), sx * lerp(46, 98, u)), 5, 4, 0.010)
            shell(f"cheek{sx}", g, acc_m, HB, thick=0.010, outward=lambda p: p - hc, tag="helm")
        g = hw.sph(hc, lambda u, v: (lerp(10, 92, v), lerp(-6, 6, u)), 2, 8, 0.02, bulge=lambda u, v: 0.022 * sin(v * pi) ** 0.6)
        shell("crest", g, acc_m, HB, thick=0.016, outward=lambda p: p - hc, tag="helm")
        # small swept wings on the helm sides
        for sx in (-1, 1):
            base = hc + V(sx * 0.098, 0.01, 0.05)
            for k in range(3):
                pts = bezier(base + V(0, 0.0, -0.012 * k), base + V(sx * 0.03, 0.04, 0.03 - 0.02 * k),
                             base + V(sx * 0.05, 0.10, 0.07 - 0.03 * k), base + V(sx * 0.06, 0.16 - 0.02 * k, 0.12 - 0.05 * k), 5)
                tube_part(f"hwing{sx}{k}", pts, [0.018, 0.017, 0.014, 0.009, 0.002], acc_m, HB, n=6, ref=V(sx, 0, 0), flat=0.28)
        # beard
        g = hw.sph(hc, lambda u, v: (lerp(-86, -24, v), ab2(u) * lerp(50, 96, v)), 10, 5,
                   lambda u, v: 0.006 + 0.048 * (1 - v) ** 1.4 * (1 - abs(ab2(u)) ** 2), bulge=lambda u, v: 0.004 * sin(u * pi * 9))
        shell("beard", g, fab, HB, thick=0.012, outward=lambda p: p - hc, color=hair, tag="hair", bevel=0.004)
        g = hw.sph(hc, lambda u, v: (lerp(-16, -10, v), ab2(u) * 34), 6, 1, 0.006)
        shell("stache", g, fab, HB, thick=0.008, outward=lambda p: p - hc, color=hair, tag="hair")
        cape(bw, J, B, "cape", cloth, mats, 112, 248, 1.49, 0.46, 0.075, nu=12, nv=9, tatter=0.03)
        fur_collar(J, B, mats, fur, 0.195, 0.135, 0.05, lumps=0.022, z=1.5)
    elif hid == "loki":
        helmet(hw, hc, "helm", pri, -40, 88, lambda el: (34 if el < 4 else lerp(34, 18, smooth01((el - 4) / 10)) if el < 24 else lerp(18, 3, smooth01((el - 24) / 8))) if el > -14 else 34 + (-14 - el) * 0.8, nv=9)
        # lower face mask
        g = hw.sph(hc, lambda u, v: (lerp(-62, -12, v), ab2(u) * 96), 10, 4, 0.006)
        shell("mask", g, drk, HB, thick=0.008, outward=lambda p: p - hc, tag="helm")
        g = hw.sph(hc, lambda u, v: (lerp(-30, -27, v), ab2(u) * 60), 8, 1, 0.0075)
        shell("mask_em", g, em, HB, thick=0.003, bevel=0, outward=lambda p: p - hc, tag="em")
        # long swept horns
        for sx in (-1, 1):
            b0 = hc + V(sx * 0.07, -0.05, 0.07)
            pts = bezier(b0, b0 + V(sx * 0.07, 0.02, 0.10), b0 + V(sx * 0.10, 0.14, 0.17), b0 + V(sx * 0.06, 0.25, 0.30), 10)
            tube_part(f"horn{sx}", pts, [0.026 - 0.0026 * i for i in range(9)] + [0.001], acc_m, HB, n=8, ref=V(0, -1, 0), flat=0.75)
        # scarf: thick wrap around the neck + trailing tails
        fur_collar(J, B, mats, cloth, 0.105, 0.095, 0.036, lumps=0.006, z=1.52, name="scarf", seg=16, tube_seg=8, spiky=False)
        for k, (xo, ln) in enumerate([(0.05, 0.55), (0.10, 0.42)]):
            p0 = V(-xo, 0.10, 1.50 * s)
            pts = bezier(p0, p0 + V(-0.02, 0.06, -0.12), p0 + V(-0.05, 0.09, -0.3), p0 + V(-0.03 - 0.05 * k, 0.13, -ln), 8)
            tube_part(f"scarftail{k}", pts, [0.045, 0.048, 0.05, 0.05, 0.05, 0.048, 0.044, 0.035], fab,
                      lambda c: {"Chest": 1.0 - smooth01((1.38 * s - c.z) / 0.25) * 0.6, "Spine": smooth01((1.38 * s - c.z) / 0.25) * 0.6},
                      n=6, ref=V(0, 1, 0), flat=0.18, color=cloth, tag="cloth")
        # short tattered coat tails at the back
        cape(bw, J, B, "coattail", lin(0x0d1a14), mats, 140, 220, 1.06, 0.62, 0.10, nu=8, nv=5, tatter=0.05, gap=0.02, roll=False)
    elif hid == "hades":
        helmet(hw, hc, "helm", pri, -62, 88, lambda el: 2.5, nu=22, nv=10, off=0.016, thick=0.016)
        # T-visor (ember glow)
        g = hw.sph(hc, lambda u, v: (lerp(-2, 6, v), ab2(u) * 52), 8, 1, 0.018)
        shell("visor", g, em, HB, thick=0.004, bevel=0, outward=lambda p: p - hc, tag="em")
        g = hw.sph(hc, lambda u, v: (lerp(-44, -2, v), ab2(u) * 4), 1, 4, 0.018)
        shell("visor2", g, em, HB, thick=0.004, bevel=0, outward=lambda p: p - hc, tag="em")
        g = hw.sph(hc, lambda u, v: (lerp(8, 70, v), ab2(u) * 9), 2, 6, 0.018, bulge=lambda u, v: 0.012 * sin(v * pi))
        shell("helmridge", g, acc_m, HB, thick=0.012, outward=lambda p: p - hc, tag="helm")
        # crown of spikes
        cr = Acc()
        for k in range(9):
            az = radians(-80 + k * 20)
            d = V(sin(az), -cos(az), 0)
            base = hc + d * 0.085 + V(0, 0, 0.075)
            ln = 0.15 - abs(k - 4) * 0.018
            tip = base + (d * 0.25 + V(0, 0, 1)).normalized() * ln
            loft(cr, tube_rings([base, (base + tip) / 2, tip], [0.016, 0.010, 0.0008], 6, d), 6, cap0=True, cap1=False)
        solid("crown", cr, acc_m, HB, tag="crest")
        g = hw.sph(hc, lambda u, v: (lerp(34, 44, v), lerp(-95, 95, u)), 14, 1, 0.02)
        shell("crownband", g, drk, HB, thick=0.012, outward=lambda p: p - hc, tag="helm")
        # ember cracks on the chest + tattered cloak + loin cloth
        cape(bw, J, B, "cloak", cloth, mats, 112, 248, 1.50, 0.30, 0.18, nu=12, nv=9, tatter=0.06)
        g = bw.cyl(V(0, 0.004, 0.86 * s), V(0, 0.004, 1.56 * s), lambda u, v: (lerp((0.98 - 0.86) / 0.7, -0.45, v) if True else 0, ab2(u) * lerp(30, 36, v)), 6, 5,
                   lambda u, v: 0.024 + 0.08 * v ** 1.5, rdef=0.1)
        shell("loin", g, fab, {"Hips": 1.0}, thick=0.006, bevel=0, outward=lambda p: V(p.x, p.y, 0), color=cloth, tag="cloth")
        # back reactor
        rc = Acc()
        bp = bw.bvh.ray_cast(V(0, 0, 1.34 * s), V(0, 1, 0), 0.5)[0] or V(0, 0.12, 1.34 * s)
        rbox(rc, bp + V(0, 0.045, 0), (0.16, 0.06, 0.2))
        solid("reactor", rc, drk, {"Chest": 1.0}, bevel=0.015, tag="pack")
        rg = Acc()
        for zo in (-0.05, 0.0, 0.05):
            rbox(rg, bp + V(0, 0.077, zo), (0.11, 0.006, 0.014))
        solid("reactor_em", rg, em, {"Chest": 1.0}, tag="em")
    elif hid == "zeus":
        # white hair + full beard + circlet + halo
        g = hw.sph(hc, lambda u, v: (lerp(-20, 88, v), lerp(30, 330, u)), 12, 6, lambda u, v: 0.008 + 0.012 * (1 - v),
                   bulge=lambda u, v: 0.005 * sin(u * pi * 14))
        shell("hair", g, fab, HB, thick=0.014, outward=lambda p: p - hc, color=hair, tag="hair")
        g = hw.sph(hc, lambda u, v: (lerp(10, 88, v), lerp(-34, 34, u)), 6, 4, 0.008)
        shell("hairfront", g, fab, HB, thick=0.012, outward=lambda p: p - hc, color=hair, tag="hair")
        g = hw.sph(hc, lambda u, v: (lerp(-88, -12, v), ab2(u) * lerp(50, 98, v)), 10, 6,
                   lambda u, v: 0.004 + 0.045 * (1 - v) ** 1.5 * (1 - abs(ab2(u)) ** 2), bulge=lambda u, v: 0.004 * sin(u * pi * 10))
        shell("beard", g, fab, HB, thick=0.014, outward=lambda p: p - hc, color=hair, tag="hair")
        g = hw.sph(hc, lambda u, v: (lerp(-17, -11, v), ab2(u) * 38), 6, 1, 0.007)
        shell("stache", g, fab, HB, thick=0.008, outward=lambda p: p - hc, color=hair, tag="hair")
        g = hw.sph(hc, lambda u, v: (lerp(20, 30, v), u * 360), 22, 1, 0.022, closed=True)
        shell("circlet", g, pri, HB, thick=0.012, closed=True, outward=lambda p: p - hc, tag="helm")
        cr = Acc()
        for k in range(5):
            az = radians(-36 + k * 18)
            d = V(sin(az), -cos(az), 0)
            base = hc + d * 0.1 + V(0, 0, 0.05)
            ln = 0.10 - abs(k - 2) * 0.022
            tip = base + (d * 0.25 + V(0, 0, 1)).normalized() * ln
            loft(cr, tube_rings([base, (base + tip) / 2, tip], [0.012, 0.008, 0.0008], 5, d), 5, cap0=True, cap1=False)
        solid("rays", cr, pri, HB, tag="crest")
        hl = Acc()
        hcn = hc + V(0, 0.16, 0.05)
        halo_ring(hl, hcn, 0.21, 0.0085, 32, 6)
        solid("halo", hl, em, HB, tag="em")
        # long coat skirt: back + sides, open front; sides partially follow the thighs
        coat_skirt(bw, J, B, mats, cloth, lin(H["em"]))
        # trim strips down the coat front edges
    elif hid == "hela":
        # face + swept spiked headdress, hair, high collar, long cloak
        g = hw.sph(hc, lambda u, v: (lerp(-30, 88, v), lerp(40, 320, u)), 14, 6, 0.008)
        shell("hair", g, fab, HB, thick=0.012, outward=lambda p: p - hc, color=hair, tag="hair")
        g = hw.sph(hc, lambda u, v: (lerp(16, 34, v), lerp(-120, 120, u)), 14, 2, 0.014)
        shell("diadem", g, pri, HB, thick=0.012, outward=lambda p: p - hc, tag="helm")
        g = hw.sph(hc, lambda u, v: (lerp(22, 25, v), lerp(-60, 60, u)), 10, 1, 0.0155)
        shell("diadem_em", g, em, HB, thick=0.003, bevel=0, outward=lambda p: p - hc, tag="em")
        cr = Acc()
        for k in range(7):
            a = (k - 3) / 3.0
            base = hc + V(a * 0.075, -0.06 + abs(a) * 0.04, 0.085 - abs(a) * 0.02)
            ln = 0.36 - abs(a) * 0.16
            d = V(a * 0.55, 0.55, 1.0).normalized()
            pts = bezier(base, base + d * ln * 0.35, base + d * ln * 0.7 + V(0, 0.04, 0), base + d * ln + V(0, 0.09, 0), 7)
            loft(cr, tube_rings(pts, [0.018, 0.016, 0.013, 0.010, 0.007, 0.004, 0.0005], 6, V(0, -1, 0), flat=0.55), 6, cap0=True, cap1=False)
        solid("headdress", cr, drk, HB, tag="crest")
        g = bw.cyl(V(0, 0.004, 0.86 * s), V(0, 0.004, 1.56 * s), lambda u, v: (lerp(0.86, 1.06, v), lerp(80, 280, u)), 12, 3,
                   lambda u, v: 0.012 + 0.07 * v ** 1.3)
        shell("highcollar", g, pri, lambda c: {"Chest": 0.75, "Neck": 0.25}, thick=0.008, outward=lambda p: V(p.x, p.y, 0), tag="armor")
        cape(bw, J, B, "cloak", cloth, mats, 112, 248, 1.48, 0.16, 0.14, nu=12, nv=10, tatter=0.07)
        # front waist drape
        g = bw.cyl(V(0, 0.004, 0.86 * s), V(0, 0.004, 1.56 * s), lambda u, v: (lerp(0.15, -0.50, v), ab2(u) * 26), 4, 5,
                   lambda u, v: 0.02 + 0.05 * v ** 1.4)
        shell("drape", g, fab, {"Hips": 1.0}, thick=0.006, bevel=0, outward=lambda p: V(p.x, p.y, 0), color=cloth, tag="cloth")
    elif hid == "valkyrie":
        helmet(hw, hc, "helm", pri, -4, 88, lambda el: 40 if el < 16 else lerp(40, 3, smooth01((el - 16) / 14)), nv=8, nape=-30)
        g = hw.sph(hc, lambda u, v: (lerp(-6, 30, v), lerp(-5, 5, u)), 1, 4, 0.016)
        shell("noseguard", g, acc_m, HB, thick=0.010, outward=lambda p: p - hc, tag="helm")
        g = hw.sph(hc, lambda u, v: (lerp(14, 18, v), lerp(46, 314, u)), 16, 1, 0.0125)
        shell("helm_em", g, em, HB, thick=0.003, bevel=0, outward=lambda p: p - hc, tag="em")
        # helm wings (3 feathers per side)
        for sx in (-1, 1):
            base = hc + V(sx * 0.095, 0.02, 0.04)
            for k in range(3):
                ln = 0.20 - k * 0.04
                pts = bezier(base + V(0, 0.01 * k, -0.02 * k), base + V(sx * 0.04, 0.03 + 0.02 * k, 0.03 - 0.015 * k),
                             base + V(sx * 0.07, 0.08 + 0.03 * k, 0.09 - 0.03 * k), base + V(sx * 0.085, ln * 0.8 + 0.05 * k, ln - 0.06 * k), 6)
                tube_part(f"hwing{sx}{k}", pts, [0.022, 0.024, 0.022, 0.018, 0.010, 0.001], acc_m, HB, n=6, ref=V(sx, 0, 0), flat=0.22)
        # braid
        p0 = hc + V(0, 0.10, -0.03)
        pts = bezier(p0, p0 + V(0, 0.04, -0.06), p0 + V(0.0, 0.07, -0.16), p0 + V(0.01, 0.06, -0.30), 9)
        tube_part("braid", pts, [0.03, 0.032, 0.03, 0.028, 0.026, 0.024, 0.02, 0.016, 0.01], fab,
                  lambda c: {"Head": smooth01((c.z - 1.5 * s) / 0.12), "Chest": 1 - smooth01((c.z - 1.5 * s) / 0.12) + 0.001},
                  n=7, color=hair, tag="hair", subsurf=0)
        # wing back-pack
        wing_pack(bw, J, B, mats)
        # short battle skirt (fabric) under tassets
        g = bw.cyl(V(0, 0.004, 0.86 * s), V(0, 0.004, 1.56 * s), lambda u, v: (lerp(0.15, -0.20, v), lerp(-150, 150, u)), 16, 3,
                   lambda u, v: 0.016 + 0.05 * v ** 1.4)
        shell("skirt", g, fab, lambda c: skirt_w(c, J), thick=0.006, bevel=0, outward=lambda p: V(p.x, p.y, 0), color=cloth, tag="cloth")


def ab2(u):
    return 2 * u - 1


def skirt_w(c, J):
    zc = J["hips"].z
    t = smooth01((zc - 0.03 - c.z) / 0.28)
    k = 0.5 * t * smooth01((-c.y + 0.02) / 0.08)
    side = "ThighL" if c.x < 0 else "ThighR"
    return {"Hips": 1 - k, side: k}


def halo_ring(acc, c, R, r, n, m):
    rings = []
    for k in range(n):
        a = 2 * pi * k / n
        dirv = V(cos(a), 0, sin(a))
        rings.append(ring_pts(c + dirv * R, dirv, Y, r, r * 0.7, m))
    verts = [p for rr in rings for p in rr]
    faces = []
    for k in range(n):
        k2 = (k + 1) % n
        for j in range(m):
            j2 = (j + 1) % m
            faces.append((k * m + j, k * m + j2, k2 * m + j2, k2 * m + j))
    acc.add(verts, faces)
    # spokes / lightning points
    for k in range(8):
        a = 2 * pi * k / 8 + pi / 8
        dirv = V(cos(a), 0, sin(a))
        p0 = c + dirv * (R + 0.005)
        pts = [p0, p0 + dirv * 0.03, p0 + dirv * 0.055]
        loft(acc, tube_rings(pts, [0.009, 0.006, 0.0005], 4, Y), 4, cap0=True, cap1=False)


def fur_collar(J, B, mats, color, rx, ry, tube, lumps=0.014, z=1.49, name="fur", seg=40, tube_seg=8, spiky=True):
    """Mantle of fur: a drooping torus whose radius is modulated into pointed tufts; tuft tips get lighter vertex colour."""
    s = B["hs"]
    acc = Acc()
    n, m = seg, tube_seg
    verts, faces, cols = [], [], []
    c0 = V(0, 0.03, z * s)
    tip = tuple(min(1.0, c * 1.9 + 0.03) for c in color)
    for k in range(n):
        a = 2 * pi * k / n
        dirv = V(sin(a), -cos(a), 0)
        cen = c0 + V(sin(a) * rx, -cos(a) * ry, 0) + V(0, 0, 0.012 * cos(a) - 0.028 * sin(a) ** 2)
        for j in range(m):
            b = 2 * pi * j / m
            if spiky:
                tuft = abs(sin(a * (n / 4) + (j % 2) * 0.9)) ** 3
                down = max(0.0, -sin(b)) * 0.6 + max(0.0, cos(b)) * 0.8
                bump = tuft * down * 1.6 + 0.25 * sin(a * 7 + j)
            else:
                tuft = 0.0
                down = 0.0
                bump = 0.6 * sin(a * 11) + 0.4 * sin(a * 23 + 1.7)
            rr = tube * (1 + (lumps / tube) * bump)
            verts.append(cen + dirv * cos(b) * rr * 1.15 + Z * sin(b) * rr * 0.85)
            f = min(1.0, max(0.0, tuft * down))
            cols.append(tuple(lerp(c1, c2, f * 0.8) for c1, c2 in zip(color, tip)))
    for k in range(n):
        k2 = (k + 1) % n
        for j in range(m):
            j2 = (j + 1) % m
            faces.append((k * m + j, k * m + j2, k2 * m + j2, k2 * m + j))
    acc.add(verts, faces)
    return solid(name, acc, mats["fab"], lambda c: {"Chest": 0.85, "Neck": 0.15}, color=cols, tag="cloth", subsurf=0, smooth=70)


def coat_skirt(bw, J, B, mats, color, emc):
    s = B["hs"]
    zc = J["hips"].z
    for (a0, a1, nm) in ((36, 150, "R"), (150, 210, "B"), (210, 324, "L")):
        nu = 6 if nm != "B" else 3
        g = []
        nv = 7
        prev = None
        for i in range(nv + 1):
            v = i / nv
            z = lerp(1.05, 0.40, v) * s
            row = []
            for j in range(nu + 1):
                u = j / nu
                az = radians(lerp(a0, a1, u))
                d = V(sin(az), -cos(az), 0)
                o = V(0, 0.004, z)
                r = None
                if z > 0.9 * s:
                    h = bw.bvh.ray_cast(o, d, 0.6)
                    if h[0] is not None:
                        r = (h[0] - o).length + 0.016
                if r is None:
                    r = prev[j]
                fl = 0.15 * v ** 1.5
                row.append(o + d * (r + fl))
                if prev is None or len(prev) <= j:
                    pass
            prev = [((p - V(0, 0.004, p.z)).length - 0.15 * v ** 1.5) for p in row]
            g.append(row)
        shell("coat" + nm, g, mats["fab"], lambda c: skirt_w(c, J), thick=0.008, bevel=0, outward=lambda p: V(p.x, p.y, 0),
              color=color, tag="cloth")
        # lightning trim along the hem
        hem = [g[-2], g[-1]]
        hem = [[p + V(p.x, p.y - 0.004, 0).normalized() * 0.003 for p in row] for row in hem]
        hem[0] = [lerp(a, b, 0.75) for a, b in zip(hem[0], hem[1])]
        shell("coat_em" + nm, hem, mats["em"], lambda c: skirt_w(c, J), thick=0.003, bevel=0, outward=lambda p: V(p.x, p.y, 0), tag="em")


def wing_pack(bw, J, B, mats):
    s = B["hs"]
    bp = bw.bvh.ray_cast(V(0, 0, 1.33 * s), V(0, 1, 0), 0.5)[0] or V(0, 0.11, 1.33 * s)
    pk = Acc()
    rbox(pk, bp + V(0, 0.05, 0.0), (0.17, 0.07, 0.22))
    solid("pack", pk, mats["pri"], {"Chest": 1.0}, bevel=0.018, tag="pack")
    pe = Acc()
    ellipsoid(pe, bp + V(0, 0.087, 0.02), (0.035, 0.008, 0.035), seg=12, rings=6)
    solid("pack_em", pe, mats["em"], {"Chest": 1.0}, tag="em")
    wa = Acc()
    we = Acc()
    for sx in (-1, 1):
        root = bp + V(sx * 0.07, 0.07, 0.07)
        # folded mechanical wing: 5 blade feathers fanning down-out
        for k in range(5):
            ang = radians(-8 + k * 22)
            d = V(sx * cos(radians(30 + k * 12)), 0.45, 0.55 - k * 0.32).normalized()
            ln = 0.50 - k * 0.06
            p0 = root + V(0, 0.01 * k, -0.02 * k)
            pts = bezier(p0, p0 + d * ln * 0.3 + V(0, 0.02, 0.03), p0 + d * ln * 0.7 + V(0, 0.04, 0.0), p0 + d * ln + V(0, 0.05, -0.05), 6)
            loft(wa, tube_rings(pts, [0.035, 0.055, 0.06, 0.052, 0.032, 0.002], 6, V(0, 1, 0), flat=0.16), 6, cap0=True, cap1=False)
            pts2 = [p + V(0, 0.006, -0.032) for p in pts[1:5]]
            loft(we, tube_rings(pts2, [0.006, 0.006, 0.005, 0.003], 4, V(0, 1, 0), flat=0.5), 4, cap0=True, cap1=False)
    solid("wings", wa, mats["acc"], {"Chest": 1.0}, tag="pack")
    solid("wings_em", we, mats["em"], {"Chest": 1.0}, tag="em")


# ----------------------------------------------------------------------------------------------
# Animation: FK/IK pose solver -> quaternion keys
# ----------------------------------------------------------------------------------------------
class Poser:
    def __init__(self, arm, J):
        self.arm = arm
        self.J = J
        bones = arm.data.bones
        self.REST = {b.name: b.matrix_local.copy() for b in bones}
        self.PAR = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.LEN = {b.name: b.length for b in bones}
        self.ORDER = [b[0] for b in BONES]
        self.prevq = {}
        for pb in arm.pose.bones:
            pb.rotation_mode = 'QUATERNION'

    def rest_dir(self, b):
        return (self.REST[b].to_3x3() @ Y).normalized()

    def solve(self, D, hip_off):
        posed, eff = {}, {}
        for b in self.ORDER:
            p = self.PAR[b]
            R = self.REST[b]
            if p is None:
                head = R.translation + hip_off
            else:
                head = posed[p] @ (self.REST[p].inverted() @ R.translation)
            q = D.get(b, eff.get(p, Quaternion()))
            eff[b] = q
            posed[b] = Matrix.Translation(head) @ (q.to_matrix() @ R.to_3x3()).to_4x4()
        return posed

    def two_bone(self, S, T, a, b, pole):
        d = T - S
        dl = min(d.length, (a + b) * 0.999)
        dn = d.normalized()
        ca = (a * a + dl * dl - b * b) / (2 * a * dl)
        ca = max(-1, min(1, ca))
        sa = math.sqrt(1 - ca * ca)
        pn = (pole - dn * pole.dot(dn)).normalized()
        E = S + dn * (a * ca) + pn * (a * sa)
        W = S + dn * dl
        return E, W

    def chain_ik(self, D, posed, b1, b2, T, pole, parentQ):
        p = self.PAR[b1]
        S = posed[p] @ (self.REST[p].inverted() @ self.REST[b1].translation)
        E, W = self.two_bone(S, T, self.LEN[b1], self.LEN[b2], pole)
        q1 = (parentQ @ self.rest_dir(b1)).rotation_difference(E - S) @ parentQ
        q2 = (q1 @ self.rest_dir(b2)).rotation_difference(W - E) @ q1
        D[b1], D[b2] = q1, q2
        return q1, q2

    def aim(self, q_parent, b, target_dir):
        return (q_parent @ self.rest_dir(b)).rotation_difference(target_dir) @ q_parent

    def ground(self, D, hip_off, extra=0.0, knees=False):
        posed = self.solve(D, hip_off)
        zs = []
        for side in ("L", "R"):
            F = "Foot" + side
            an, toe = self.J["an" + side], self.J["toe" + side]
            for p in (an + V(0, 0.07, -0.088 * self.J["hips"].z / 0.985), V(toe.x, toe.y, 0.0), V(an.x, (an.y + toe.y) / 2, 0.0)):
                zs.append((posed[F] @ (self.REST[F].inverted() @ p)).z)
            if knees:
                S = "Shin" + side
                kn = self.J["kn" + side] + V(0, -0.06, 0)
                zs.append((posed[S] @ (self.REST[S].inverted() @ kn)).z)
                zs.append((posed[S] @ (self.REST[S].inverted() @ (self.J["an" + side] + V(0, -0.05, 0.0)))).z)
        m = min(zs)
        return hip_off + V(0, 0, -m + extra)

    def key(self, frame, D, hip_off):
        posed = self.solve(D, hip_off)
        for b in self.ORDER:
            p = self.PAR[b]
            if p:
                basis = (self.REST[p].inverted() @ self.REST[b]).inverted() @ posed[p].inverted() @ posed[b]
            else:
                basis = self.REST[b].inverted() @ posed[b]
            pb = self.arm.pose.bones[b]
            q = basis.to_quaternion()
            if b in self.prevq and q.dot(self.prevq[b]) < 0:
                q.negate()
            self.prevq[b] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=frame)
            if p is None:
                pb.location = basis.translation
                pb.keyframe_insert("location", frame=frame)

    def action(self, name, frames, pose_fn):
        self.prevq = {}
        act = bpy.data.actions.new(name=name)
        self.arm.animation_data_create()
        self.arm.animation_data.action = act
        for f in frames:
            D, hip = pose_fn(f)
            self.key(f, D, hip)
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
        tr = self.arm.animation_data.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, frames[0], act)
        st.name = name
        self.arm.animation_data.action = None


def build_anims(arm, J, hid):
    P = Poser(arm, J)
    sxs = {"L": -1, "R": 1}
    gun_wrist = V(0.33, -0.27, 1.06 * J["hips"].z / 0.985)
    gun_hand_dir = V(0.08, -0.85, -0.5).normalized()
    heavy = 1.0 if hid not in ("hades",) else 0.8

    def gun_arm(D, posed, chestQ, bob=V(0, 0, 0)):
        P.chain_ik(D, posed, "UpperArmR", "ForearmR", gun_wrist + bob, V(0.7, 0.5, -0.5), chestQ)
        D["HandR"] = P.aim(D["ForearmR"], "HandR", gun_hand_dir)

    # ---------------- Idle (2 s breathing loop, weapon ready) ----------------
    def idle(f):
        ph = 2 * pi * (f - 1) / 48.0
        br = sin(ph)
        D = {}
        hips = Q(Z, -6) @ Q(Y, 1.2 * sin(ph * 0.5 + 0.3)) @ Q(X, 2)
        D["Hips"] = hips
        D["Spine"] = hips @ Q(X, 1.0 + 0.9 * br) @ Q(Z, 3)
        D["Chest"] = D["Spine"] @ Q(X, 0.8 + 1.1 * br) @ Q(Z, 4)
        D["Neck"] = D["Chest"] @ Q(X, -2 - 0.8 * br) @ Q(Z, 2 + 3 * sin(ph * 0.5))
        D["Head"] = D["Neck"] @ Q(X, -2 - 0.6 * br) @ Q(Z, 2 + 4 * sin(ph * 0.5)) @ Q(Y, 1.5 * sin(ph * 0.5))
        hip_off = V(0, 0, -0.035 - 0.004 * (1 - cos(ph)))
        posed = P.solve(D, hip_off)
        for side in ("L", "R"):
            sx = sxs[side]
            an = J["an" + side]
            T = V(an.x + sx * 0.035, an.y + (-0.07 if side == "L" else 0.06), an.z)
            pole = V(sx * 0.25, -1, 0)
            P.chain_ik(D, posed, "Thigh" + side, "Shin" + side, T, pole, hips)
            D["Foot" + side] = Q(Z, sx * 9 + (-6))
        posed = P.solve(D, hip_off)
        ch = D["Chest"]
        D["UpperArmL"] = ch @ Q(X, -10 - 1.5 * br) @ Q(Y, 6)
        D["ForearmL"] = D["UpperArmL"] @ Q(X, -28)
        D["HandL"] = D["ForearmL"] @ Q(X, -8) @ Q(Z, -10)
        gun_arm(D, posed, ch, V(0, 0, 0.004 * br))
        return D, hip_off

    P.action("Idle", list(range(1, 50, 2)), idle)

    # ---------------- Run (sprint cycle, 18 frames) ----------------
    N = 18.0

    def knee_curve(ph):
        ph = ph % (2 * pi)
        stance = 18 + 14 * max(0.0, sin(ph * (pi / 2.5))) if ph < 2.5 else 0
        swing = 0.0
        if ph >= 2.2:
            swing = 105 * sin((ph - 2.2) / (2 * pi - 2.2) * pi) ** 1.2
        return max(stance, 14 + swing) if ph >= 2.2 else stance

    def foot_curve(ph):
        ph = ph % (2 * pi)
        return 30 * math.exp(-((ph - 2.35) ** 2) / 0.25) - 10 * math.exp(-((ph - 0.1) ** 2) / 0.4) + 6

    def run(f):
        ph = 2 * pi * (f - 1) / N
        c = cos(ph)
        D = {}
        hips = Q(Z, 9 * c) @ Q(X, 9) @ Q(Y, 2.5 * sin(ph))
        D["Hips"] = hips
        D["Spine"] = hips @ Q(Z, -8 * c) @ Q(X, 5)
        D["Chest"] = D["Spine"] @ Q(Z, -9 * c) @ Q(X, 5) @ Q(Y, -2 * sin(ph))
        D["Neck"] = D["Chest"] @ Q(Z, 5 * c) @ Q(X, -7)
        D["Head"] = D["Neck"] @ Q(Z, 3 * c) @ Q(X, -8)
        for side, off in (("L", 0.0), ("R", pi)):
            p2 = ph + off
            th = 10 + 40 * cos(p2)
            D["Thigh" + side] = hips @ Q(X, -th)
            D["Shin" + side] = D["Thigh" + side] @ Q(X, knee_curve(p2))
            D["Foot" + side] = D["Shin" + side] @ Q(X, foot_curve(p2))
        # left arm swings against the left leg; right arm carries the gun
        ch = D["Chest"]
        D["UpperArmL"] = ch @ Q(X, 40 * c - 4) @ Q(Y, 8)
        D["ForearmL"] = D["UpperArmL"] @ Q(X, -(58 + 26 * max(0.0, -c)))
        D["HandL"] = D["ForearmL"] @ Q(X, -10)
        hip_off = P.ground(D, V(0, 0, 0), extra=0.025 * max(0.0, sin(2 * ph - 1.0)))
        posed = P.solve(D, hip_off)
        gun_arm(D, posed, ch, V(0, 0, hip_off.z * 0.6 - 0.01))
        return D, hip_off

    P.action("Run", list(range(1, int(N) + 2)), run)

    # ---------------- Slide (low knee slide, subtle loop) ----------------
    def slide(f):
        ph = 2 * pi * (f - 1) / 24.0
        D = {}
        hips = Q(X, -16) @ Q(Z, -10)
        D["Hips"] = hips
        D["Spine"] = hips @ Q(X, -6 + 1.5 * sin(ph))
        D["Chest"] = D["Spine"] @ Q(X, -4) @ Q(Z, 12)
        D["Neck"] = D["Chest"] @ Q(X, 12)
        D["Head"] = D["Neck"] @ Q(X, 10) @ Q(Z, -8)
        D["ThighL"] = hips @ Q(X, -78) @ Q(Y, 6)
        D["ShinL"] = D["ThighL"] @ Q(X, 18)
        D["FootL"] = D["ShinL"] @ Q(X, -18)
        D["ThighR"] = hips @ Q(X, -18) @ Q(Y, -14)
        D["ShinR"] = D["ThighR"] @ Q(X, 112)
        D["FootR"] = D["ShinR"] @ Q(X, 35)
        ch = D["Chest"]
        D["UpperArmL"] = ch @ Q(Y, 52) @ Q(X, -22 + 2 * sin(ph))
        D["ForearmL"] = D["UpperArmL"] @ Q(X, -30)
        D["HandL"] = D["ForearmL"] @ Q(X, -5)
        hip_off = P.ground(D, V(0, 0, 0), knees=True)
        posed = P.solve(D, hip_off)
        P.chain_ik(D, posed, "UpperArmR", "ForearmR", V(0.30, -0.36, hip_off.z + J["hips"].z + 0.28), V(0.7, 0.5, -0.5), ch)
        D["HandR"] = P.aim(D["ForearmR"], "HandR", gun_hand_dir)
        return D, hip_off

    P.action("Slide", list(range(1, 26, 2)), slide)
    bpy.context.scene.frame_set(1)


# ----------------------------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------------------------

def build_hero(hid, H):
    clear_scene()
    PARTS.clear()
    TRI_LOG.clear()
    bpy.context.scene.render.fps = 24
    B = H["body"]
    J = make_joints(B)
    mats = {
        "skn": make_mat(f"{hid}_skin", lin(H["skin"]), 0.0, 0.55),
        "fab": make_mat(f"{hid}_fabric", (1, 1, 1), 0.0, 0.78, vcol=True),
        "pri": make_mat(f"{hid}_armor", lin(H["pri"]), 0.55, 0.32),
        "acc": make_mat(f"{hid}_metal", lin(H["acc"]), 0.85, 0.24),
        "drk": make_mat(f"{hid}_dark", lin(H["drk"]), 0.45, 0.42),
        "em": make_mat(f"{hid}_glow", lin(H["em"]), 0.0, 0.3, emissive=lin(H["em"]), em_str=2.0),
    }
    arm = build_armature(hid, J)
    body, bvh_body = build_body(hid, B, J, H, arm, mats)
    bvh_head, hc, HP = build_head(hid, B, J, H, mats)
    build_kit(hid, B, J, H, mats, Wrap(bvh_body), Wrap(bvh_head), hc, HP)
    # join everything into the skinned body
    bpy.ops.object.select_all(action='DESELECT')
    for ob in PARTS:
        ob.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = f"{hid}_hero"
    me = body.data
    me.color_attributes.active_color = me.color_attributes["Col"]
    try:
        me.color_attributes.render_color_index = me.color_attributes.find("Col")
    except Exception:
        pass
    # limit to 4 influences & normalise
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    print(f"[{hid}] tris={tris} mats={len(me.materials)} parts: " + ", ".join(f"{k}={v}" for k, v in TRI_LOG.items()))
    build_anims(arm, J, hid)
    if SAVE_BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=f"/tmp/gw/heroes_preview/{hid}.blend")
    if not NO_EXPORT:
        out = os.path.join(OUT_DIR, f"hero_{hid}.glb")
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_nla_strips=True,
                                  export_colors=True, export_skins=True, export_force_sampling=True, export_apply=False)
        print("EXPORTED", out)
    return tris


if __name__ == "__main__":
    for hid, H in HEROES.items():
        if ONLY and hid not in ONLY:
            continue
        build_hero(hid, H)
