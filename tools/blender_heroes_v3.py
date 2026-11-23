"""God Wars hero generator v3 (Blender 3.6, background).

  Blender -b --factory-startup -P tools/blender_heroes_v3.py -- [hero ids...] [--no-export] [--blend]

v3 over v2 (tools/blender_heroes_v2.py):
  * parametric sculpted heads: smooth-union skull/face/jaw/chin + brow ridge, eye sockets with lidded
    eyeballs (sclera/iris/pupil), nose bridge + alae, lips, cheekbones, ears; female variants;
    modelled brows, hair volumes, beards and per-hero helmets / headdresses
  * hands with 4 separated fingers + thumb (gun grip on the right, relaxed on the left)
  * per-hero lower body + arm kits instead of a shared segmented kit; suits are fabric/leather zones on
    the sculpted body (per-face material) with armour layered on top
  * grounded palettes: dark neutrals + one hero colour + small metal accents; all materials (except
    glow) read vertex colour, so 6 materials carry many tones
Skeleton / clip names / origin / facing / height identical to v2.
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
# Hero definitions. Palette = sRGB hex. Zones = which palette slot the sculpted body shows per region.
# ----------------------------------------------------------------------------------------------
HEROES = {
    "thor": dict(
        body=dict(hs=1.0, shw=0.222, chest=1.10, waist=1.05, hip=1.02, arm=1.12, leg=1.08, fem=False, legw=0.100),
        pal=dict(suit=0x2a2d33, legs=0x2e2925, leather=0x3d2b1f, plate=0x2f5079, steel=0x5f6672, gold=0xb98c3e,
                 cloth=0x6b1c1f, fur=0x55432f, hair=0x8f4a24, skin=0xcf9d7e, glow=0x9ad6ff, lips=0xa86a5a,
                 iris=0x3f6f9e, brow=0x6f3519, wrap=0x4a3a2c),
        face=dict(jaw=1.14, chin=1.12, brow=1.2, cheek=1.0, nose=1.08, lips=0.85, gaunt=0.0, bw=0.0045),
        zones=dict(torso="suit", upper_arm="skin", forearm="leather", thigh="legs", shin="legs", neck="skin"),
        glove="leather", fingers="skin",
    ),
    "loki": dict(
        body=dict(hs=1.0, shw=0.196, chest=0.95, waist=0.90, hip=0.95, arm=0.92, leg=0.94, fem=False, legw=0.094),
        pal=dict(suit=0x1b2a23, legs=0x211c19, leather=0x241e1a, plate=0x235a44, steel=0x2b302d, gold=0xc4a052,
                 cloth=0x183126, fur=0x183126, hair=0x141112, skin=0xd8b096, glow=0x6cffc8, lips=0xa8786c,
                 iris=0x3f8a5c, brow=0x161214, wrap=0x46524a),
        face=dict(jaw=0.92, chin=0.95, brow=0.9, cheek=1.25, nose=1.0, lips=0.8, gaunt=0.35, bw=0.0032, smirk=1.0),
        zones=dict(torso="suit", upper_arm="suit", forearm="leather", thigh="legs", shin="legs", neck="skin"),
        glove="leather", fingers="leather",
    ),
    "hades": dict(
        body=dict(hs=1.025, shw=0.235, chest=1.16, waist=1.14, hip=1.08, arm=1.18, leg=1.14, fem=False, legw=0.106),
        pal=dict(suit=0x18161c, legs=0x1b181e, leather=0x1f1a1e, plate=0x3c2c52, steel=0x2c2b33, gold=0x9a7746,
                 cloth=0x22172a, fur=0x22172a, hair=0x0f0d11, skin=0x9fa6b2, glow=0xff6a26, lips=0x6c6470,
                 iris=0xff6a26, brow=0x121014, wrap=0x2a2430),
        face=dict(jaw=1.08, chin=1.05, brow=1.35, cheek=1.2, nose=1.12, lips=0.7, gaunt=1.0, bw=0.005),
        zones=dict(torso="suit", upper_arm="suit", forearm="suit", thigh="legs", shin="legs", neck="skin"),
        glove="steel", fingers="steel", glow_eyes=True,
    ),
    "zeus": dict(
        body=dict(hs=1.01, shw=0.214, chest=1.05, waist=1.02, hip=1.0, arm=1.04, leg=1.03, fem=False, legw=0.098),
        pal=dict(suit=0x222839, legs=0x222839, leather=0x4a3526, plate=0xb08a42, steel=0x37405a, gold=0xd8b560,
                 cloth=0xcfc7b4, fur=0xcfc7b4, hair=0xe8e4dc, skin=0xcf9c7c, glow=0xa6dcff, lips=0xa06e60,
                 iris=0x7fb8e6, brow=0xd8d4cc, wrap=0x4a3526),
        face=dict(jaw=1.05, chin=1.0, brow=1.25, cheek=0.95, nose=1.12, lips=0.8, gaunt=0.2, bw=0.006),
        zones=dict(torso="suit", upper_arm="cloth", forearm="skin", thigh="legs", shin="skin", neck="skin"),
        glove="skin", fingers="skin", glow_iris=True,
    ),
    "hela": dict(
        body=dict(hs=0.985, shw=0.182, chest=0.92, waist=0.84, hip=1.06, arm=0.86, leg=0.96, fem=True, legw=0.092),
        pal=dict(suit=0x141918, legs=0x161515, leather=0x171516, plate=0x1d4a40, steel=0x1e2523, gold=0xa3aca8,
                 cloth=0x101c1a, fur=0x101c1a, hair=0x0e0d10, skin=0xd4c8c2, glow=0x55ffa4, lips=0x3e2a30,
                 iris=0x3fbf7a, brow=0x141216, wrap=0x2a302e, liner=0x0c1210),
        face=dict(jaw=0.86, chin=0.9, brow=0.7, cheek=1.25, nose=0.82, lips=1.1, gaunt=0.25, bw=0.0026),
        zones=dict(torso="suit", upper_arm="suit", forearm="leather", thigh="legs", shin="legs", neck="skin"),
        glove="leather", fingers="leather",
    ),
    "valkyrie": dict(
        body=dict(hs=0.99, shw=0.188, chest=0.94, waist=0.86, hip=1.05, arm=0.9, leg=1.0, fem=True, legw=0.094),
        pal=dict(suit=0x2a2730, legs=0x2a2730, leather=0x553826, plate=0xa4532a, steel=0x9298a3, gold=0xc89c46,
                 cloth=0x4a3d36, fur=0xd9d2c4, hair=0xd8b36c, skin=0xd6a585, glow=0xffc878, lips=0xb0705f,
                 iris=0x4f86b8, brow=0xa07a40, wrap=0x6b5038, liner=0x5a3d2a),
        face=dict(jaw=0.9, chin=0.92, brow=0.75, cheek=1.1, nose=0.86, lips=1.05, gaunt=0.0, bw=0.0028),
        zones=dict(torso="suit", upper_arm="suit", forearm="leather", thigh="legs", shin="leather", neck="skin"),
        glove="leather", fingers="leather",
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
SLOTS = {}


def res(mat, color):
    """A part's material may be given as a palette slot name -> (material, vertex colour)."""
    if isinstance(mat, str):
        m, c = SLOTS[mat]
        return m, (c if color is None else color)
    return mat, ((1, 1, 1) if color is None else color)


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
          color=None, smooth=50, tag="armor", subsurf=0, rim=True, lip=True):
    """Curved plate: outer surface + rounded turned-down lip (no hidden inner skin -> ~half the tris)."""
    mat, color = res(mat, color)
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


def solid(name, acc, mat, weights, color=None, smooth=50, tag="misc", subsurf=0, bevel=0.0):
    mat, color = res(mat, color)
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



def seg_dist(p, a, b):
    ab_ = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab_) / max(1e-9, ab_.length_squared)))
    return (p - (a + ab_ * t)).length, t


def body_zone(co, J, Z_):
    """Classify a body point -> zone name (torso / neck / upper_arm / forearm / thigh / shin / foot)."""
    if co.z < 0.15:
        return "foot"
    best, bz = 9.0, "torso"
    if co.z > J["neck"].z - 0.03 and abs(co.x) < 0.075:
        return "neck"
    for side in ("L", "R"):
        for a, b, z, r in (("sh", "el", "upper_arm", 0.058), ("el", "wr", "forearm", 0.045),
                           ("hip", "kn", "thigh", 0.085), ("kn", "an", "shin", 0.055)):
            pa = J[a + side] + (V(0, 0, 0.05) if a == "hip" else Vector())
            d, t = seg_dist(co, pa, J[b + side])
            if a == "sh" and t < 0.12:
                continue
            if a == "hip" and t < 0.06:
                continue
            if d - r < best:
                best, bz = d - r, z
    # torso: anything within the trunk
    dt, _ = seg_dist(co, J["hips"] + V(0, 0, -0.06), J["neck"])
    if dt - 0.14 < best and co.z > J["hips"].z - 0.04:
        return "torso"
    return bz


def build_body(hid, B, J, H, arm, mats):
    acc = body_acc(B, J)
    ob = new_obj(f"{hid}_body", acc.v, acc.f, mats["fab"])
    hi = voxelize(ob, 0.0065, smooth_iter=6, smooth_fac=0.55, faces=2250)
    bvh = BVHTree.FromPolygons([v.co.copy() for v in hi.vertices], [tuple(p.vertices) for p in hi.polygons])
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    zones = dict(H["zones"])
    zones["foot"] = "leather"
    # per-face material + per-vertex colour by zone
    mat_index = {}
    for sl in set(zones.values()):
        m, _ = SLOTS[sl]
        if m.name not in [x.name for x in me.materials]:
            me.materials.append(m)
        mat_index[sl] = [x.name for x in me.materials].index(m.name)
    vz = [zones[body_zone(v.co, J, None)] for v in me.vertices]
    for p in me.polygons:
        cnt = {}
        for i in p.vertices:
            cnt[vz[i]] = cnt.get(vz[i], 0) + 1
        p.material_index = mat_index[max(cnt, key=cnt.get)]
    set_color(ob, [SLOTS[z][1] for z in vz])
    TRI_LOG["body"] = sum(len(p.vertices) - 2 for p in me.polygons)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    bpy.ops.object.select_all(action='DESELECT')
    if len(ob.vertex_groups) < 10:
        print("WARNING heat weights incomplete for", hid, len(ob.vertex_groups))
    return ob, bvh


# ----------------------------------------------------------------------------------------------
# Hands: palm + 4 separated fingers + thumb (rigid on Hand bone)
# ----------------------------------------------------------------------------------------------

def rot_about(v, axis, deg):
    return Quaternion(axis.normalized(), radians(deg)) @ v


def build_hand(hid, B, J, side, palm_slot, tip_slot, grip, plate_slot=None):
    sx = -1 if side == "L" else 1
    wr = J["wr" + side]
    hd = J["hdir" + side]
    fw = (FWD - hd * FWD.dot(hd)).normalized()            # width axis: index finger toward the front
    nin = V(-sx, 0, 0)
    nin = (nin - hd * nin.dot(hd) - fw * nin.dot(fw)).normalized()   # palm normal (medial)
    k = (B["arm"] * 0.5 + 0.5) * (0.93 if B["fem"] else 1.0)
    W = {"Hand" + side: 1.0}
    # palm: rounded-rect loft along hd
    pa = Acc()
    rings = []
    prof = [(-0.018, 0.024, 0.017), (0.0, 0.030, 0.019), (0.03, 0.038, 0.019), (0.062, 0.042, 0.017),
            (0.086, 0.041, 0.014), (0.098, 0.036, 0.011)]
    n = 12
    for t, wv, th in prof:
        c = wr + hd * (t * k) + nin * 0.002
        pts = []
        for i in range(n):
            a = 2 * pi * i / n
            ca, sa = cos(a), sin(a)
            ca2 = math.copysign(abs(ca) ** 0.6, ca)
            sa2 = math.copysign(abs(sa) ** 0.75, sa)
            # thumb-side (front) slightly thicker palm pad
            thv = th * k * (1.0 + 0.15 * max(0, ca) + (0.12 * max(0, sa) if t < 0.05 else 0))
            pts.append(c + fw * (wv * k * ca2) + nin * (thv * sa2))
        rings.append(pts)
    loft(pa, rings, n)
    solid(f"palm{side}", pa, palm_slot, W, tag="hands")
    # fingers
    if grip == "gun":
        curls = {0: (22, 28, 12), 1: (78, 88, 50), 2: (82, 88, 50), 3: (84, 86, 48)}
        thumb_curl = (20, 30)
    else:
        curls = {0: (18, 26, 16), 1: (26, 34, 20), 2: (30, 38, 22), 3: (34, 40, 24)}
        thumb_curl = (10, 18)
    fdat = [(0.029, (0.040, 0.025, 0.020), 0.0096, -4), (0.0095, (0.045, 0.028, 0.021), 0.0100, 0),
            (-0.0105, (0.042, 0.026, 0.020), 0.0094, 3), (-0.029, (0.033, 0.021, 0.018), 0.0082, 8)]
    axis = hd.cross(nin)
    tips = Acc()
    base_acc = Acc()
    for fi, (wo, lens, rad, spread) in enumerate(fdat):
        kl = 1.0 if fi != 1 else 1.0
        base = wr + hd * (0.088 * k + (0.004 if fi in (1, 2) else 0)) + fw * (wo * k) + nin * 0.001
        d = rot_about(hd, nin, -spread * (1 if True else 1))
        d = (d - nin * d.dot(nin)).normalized()
        ax = d.cross(nin)
        pts, rads = [base - d * 0.006], [rad * k * 1.02]
        p = base
        cur = d
        for j, ln in enumerate(lens):
            cur = rot_about(cur, ax, curls[fi][j])
            seg_len = ln * k * kl
            mid = p + cur * seg_len * 0.5
            p = p + cur * seg_len
            r = rad * k * (1.0 - 0.1 * j)
            pts += [mid, p]
            rads += [r * 0.94, r * 0.92]
        # rounded tip
        pts[-1] = pts[-1] - cur * rad * k * 0.4
        pts.append(pts[-1] + cur * rad * k * 0.55)
        rads[-1] = rads[-1] * 0.95
        rads.append(rad * k * 0.45)
        # split: proximal phalanx on palm slot, the rest on tip slot (fingerless gloves)
        rings = tube_rings(pts, rads, 7, nin)
        if tip_slot == palm_slot:
            loft(base_acc, rings, 7, cap0=True, cap1=True)
        else:
            loft(base_acc, rings[:3], 7, cap0=True, cap1=False)
            loft(tips, rings[2:], 7, cap0=False, cap1=True)
    # thumb: from the heel of the palm, pointing forward/down, curling toward the palm
    tb = wr + hd * (0.022 * k) + fw * (0.030 * k) + nin * (0.010 * k)
    td = (hd * 0.55 + fw * 0.62 + nin * 0.55).normalized()
    tax = td.cross(nin)
    pts, rads = [tb], [0.0135 * k]
    p = tb
    cur = td
    for j, ln in enumerate((0.036, 0.030, 0.024)):
        cur = rot_about(cur, tax, thumb_curl[min(j, 1)])
        p = p + cur * ln * k
        pts.append(p)
        rads.append((0.0125 - 0.0015 * j) * k)
    pts.append(p + cur * 0.006 * k)
    rads.append(0.005 * k)
    rings = tube_rings(pts, rads, 7, nin)
    if tip_slot == palm_slot:
        loft(base_acc, rings, 7, cap0=True, cap1=True)
    else:
        loft(base_acc, rings[:3], 7, cap0=True, cap1=False)
        loft(tips, rings[2:], 7, cap0=False, cap1=True)
    solid(f"fingers{side}", base_acc, palm_slot, W, tag="hands", smooth=70)
    if tips.v:
        solid(f"fingertips{side}", tips, tip_slot, W, tag="hands", smooth=70)
    if plate_slot:
        # back-of-hand plate (outer side) + knuckle guard
        pl = Acc()
        o = -nin
        for t, wv, th, ln in ((0.045, 0.036, 0.020, 0.05), (0.088, 0.040, 0.016, 0.022)):
            rbox(pl, wr + hd * (t * k) + o * (0.019 * k), (0.008, wv * 2 * k, ln * k), Matrix((o, fw, hd)).transposed())
        solid(f"handplate{side}", pl, plate_slot, W, bevel=0.004, tag="hands")


# ----------------------------------------------------------------------------------------------
# Head: parametric sculpt (radial smooth-union of skull/face/jaw/chin + facial feature displacement)
# ----------------------------------------------------------------------------------------------

def ray_ell(d, o, R):
    """Far intersection distance of the ray t*d (t>0) with ellipsoid (centre o, radii R); 0 if missed."""
    a = (d[0] / R[0]) ** 2 + (d[1] / R[1]) ** 2 + (d[2] / R[2]) ** 2
    b = d[0] * o[0] / R[0] ** 2 + d[1] * o[1] / R[1] ** 2 + d[2] * o[2] / R[2] ** 2
    cc = (o[0] / R[0]) ** 2 + (o[1] / R[1]) ** 2 + (o[2] / R[2]) ** 2
    disc = b * b - a * (cc - 1)
    if disc < 0:
        return 0.0
    return max(0.0, (b + math.sqrt(disc)) / a)


def smax(a, b, k):
    h = max(k - abs(a - b), 0.0) / k
    return max(a, b) + h * h * k * 0.25


def G2(x, z, cx, cz, sx, sz):
    return math.exp(-((x - cx) / sx) ** 2 - ((z - cz) / sz) ** 2)


class HeadInfo:
    pass


def head_shapes(fem, F):
    jaw, chin = F["jaw"], F["chin"]
    if not fem:
        return [((0, -0.010, 0.030), (0.080, 0.101, 0.097)),
                ((0, 0.014, -0.022), (0.067, 0.083, 0.072)),
                ((0, 0.018, -0.068), (0.057 * jaw, 0.072, 0.052)),
                ((0, 0.071, -0.098), (0.024 * chin, 0.021, 0.022))]
    return [((0, -0.010, 0.030), (0.077, 0.098, 0.095)),
            ((0, 0.012, -0.022), (0.063, 0.080, 0.068)),
            ((0, 0.016, -0.064), (0.052 * jaw, 0.068, 0.048)),
            ((0, 0.066, -0.092), (0.019 * chin, 0.018, 0.019))]


def build_head(hid, B, J, H, mats):
    fem = B["fem"]
    F = H["face"]
    pal = H["pal"]
    hb = J["head"]
    k = 0.95 if fem else 1.0
    c = hb + V(0, -0.004, 0.122 * k)
    shapes = head_shapes(fem, F)
    smirk = F.get("smirk", 0.0)
    nose, brow, cheek, lips, gaunt = F["nose"], F["brow"], F["cheek"], F["lips"], F["gaunt"]

    def mouth_z(x):
        z = -0.0625 + (0.0015 if fem else 0.0)
        z += 0.0035 * smirk * smooth01(x / 0.022)
        return z + 0.0018 * (abs(x) / 0.021) ** 2 * (0.0 if smirk else 1.0) * -1.0

    def disp(x, f, z):
        """Feature displacement (m, along the radial direction) at base-surface point (x, f, z)."""
        g = smooth01((f - 0.02) / 0.045)
        if g <= 0:
            return 0.0
        ax = abs(x)
        dd = 0.0
        # brow ridge + glabella
        dd += 0.0062 * brow * G2(ax, z, 0.034, 0.025, 0.026, 0.0085)
        dd += 0.0022 * brow * G2(x, z, 0.0, 0.020, 0.011, 0.010)
        # eye sockets (wide, shallow almond)
        dd -= 0.0125 * G2(ax, z, 0.034, 0.002, 0.0205, 0.0098)
        dd -= 0.003 * G2(ax, z, 0.040, -0.012, 0.02, 0.008)            # under-eye
        # nose: bridge -> tip, alae
        if -0.06 < z < 0.03:
            t = smooth01((0.014 - z) / 0.052)
            hgt = nose * (0.003 + 0.0185 * t ** 1.35)
            if z < -0.036:
                hgt *= math.exp(-((z + 0.036) / 0.0075) ** 2)
            wdt = (0.0062 + 0.0068 * t) * (0.86 if fem else 1.0)
            dd += hgt * math.exp(-(x / wdt) ** 2)
        dd += 0.0058 * nose * G2(ax, z, 0.0135, -0.040, 0.0068, 0.0062)
        # cheekbones / cheek hollows / temples
        dd += 0.0060 * cheek * G2(ax, z, 0.050, -0.012, 0.019, 0.011)
        dd -= 0.0048 * gaunt * G2(ax, z, 0.044, -0.050, 0.014, 0.016)
        dd -= 0.0025 * G2(ax, z, 0.068, 0.032, 0.012, 0.02)
        # mouth
        mz = mouth_z(x)
        w_m = math.exp(-(x / 0.0215) ** 4)
        dd += 0.0042 * lips * w_m * math.exp(-((z - (mz + 0.0058)) / 0.0048) ** 2)
        dd += 0.0052 * lips * w_m * math.exp(-((z - (mz - 0.0075)) / 0.0055) ** 2)
        dd -= 0.0034 * w_m * math.exp(-((z - mz) / 0.0019) ** 2)
        dd -= 0.0018 * G2(x, z, 0, mz + 0.0135, 0.004, 0.005) * 0           # philtrum (off)
        dd -= 0.0020 * G2(ax, z, 0.023, mz, 0.0045, 0.0045)                # mouth corners
        dd -= 0.0022 * G2(x, z, 0, mz - 0.019, 0.016, 0.005)              # mentolabial groove
        # chin
        dd += 0.0045 * F["chin"] * G2(x, z, 0, -0.097, 0.015, 0.012)
        return dd * g

    def to_w(x, f, z):
        return c + V(x, -f, z) * k

    # direction sampling dense in the face
    els = [-86 + 4 * i for i in range(5)] + [-66 + 1.45 * i for i in range(73)] + [40 + 4.8 * i for i in range(11)]
    azs = [-180 + 6 * i for i in range(18)] + [-72 + 1.6 * i for i in range(90)] + [72 + 6 * i for i in range(18)]
    verts = []
    for el in els:
        ce, se = cos(radians(el)), sin(radians(el))
        for az in azs:
            d = (sin(radians(az)) * ce, cos(radians(az)) * ce, se)
            r = 0.0
            for o, R in shapes:
                t = ray_ell(d, o, R)
                r = t if r == 0.0 else smax(r, t, 0.02)
            px, pf, pz = d[0] * r, d[1] * r, d[2] * r
            r += disp(px, pf, pz)
            verts.append(to_w(d[0] * r, d[1] * r, d[2] * r))
    na = len(azs)
    faces = []
    for i in range(len(els) - 1):
        for j in range(na):
            j2 = (j + 1) % na
            faces.append((i * na + j, i * na + j2, (i + 1) * na + j2, (i + 1) * na + j))
    # caps
    bot = sum(verts[:na], Vector()) / na
    top = sum(verts[-na:], Vector()) / na
    verts += [bot, top]
    bi, ti = len(verts) - 2, len(verts) - 1
    base = (len(els) - 1) * na
    for j in range(na):
        faces.append((bi, (j + 1) % na, j))
        faces.append((ti, base + j, base + (j + 1) % na))
    bvh = BVHTree.FromPolygons(verts, faces)
    ob = new_obj(f"{hid}_head", verts, faces, mats["skn"])
    dec = ob.modifiers.new("dec", 'DECIMATE')
    dec.ratio = 2300.0 / (len(faces) * 2)
    apply_all(ob)

    # ---- eyes ----
    E = []
    for sx in (-1, 1):
        tgt = to_w(sx * 0.034, 0.10, 0.002)
        dvec = (tgt - c).normalized()
        h = bvh.ray_cast(c, dvec, 0.3)
        s = h[0] if h[0] else tgt
        fwd_e = V(sx * sin(radians(9)), -cos(radians(9)), -sin(radians(2))).normalized()
        up_e = (Z - fwd_e * Z.dot(fwd_e)).normalized()
        lat = up_e.cross(fwd_e)
        rot = Matrix((lat, up_e, fwd_e)).transposed()
        rad = (0.0158 * k, 0.0118 * k, 0.0118 * k)
        e = s - fwd_e * 0.0072 * k
        E.append((e, rot, rad, fwd_e))
    HI = HeadInfo()
    HI.c, HI.k, HI.to_w, HI.bvh, HI.eyes, HI.mouth_z = c, k, to_w, bvh, E, mouth_z
    skin = lin(pal["skin"])
    lipc = lin(pal["lips"])
    liner = lin(pal.get("liner", 0x1a1412))
    brc = lin(pal["brow"])

    def head_col(co):
        q = co - c
        x, f, z = q.x / k, -q.y / k, q.z / k
        col = skin
        g = smooth01((f - 0.03) / 0.04)
        # lips
        mz = mouth_z(x)
        lm = g * math.exp(-(x / 0.021) ** 4) * math.exp(-((z - mz) / 0.0105) ** 2)
        col = tuple(lerp(a, b, min(1.0, lm * 1.3)) for a, b in zip(col, lipc))
        ml = g * math.exp(-(x / 0.02) ** 4) * math.exp(-((z - mz) / 0.0022) ** 2)
        col = tuple(a * (1 - 0.55 * ml) for a in col)
        # nostrils
        nm = g * G2(abs(x), z, 0.009, -0.044, 0.0045, 0.0035)
        col = tuple(a * (1 - 0.6 * nm) for a in col)
        # eye make-up / lash line: near the upper half of each eyeball
        for (e, rot, rad, fe) in E:
            ql = rot.inverted() @ (co - e)
            nr = math.sqrt((ql.x / rad[0]) ** 2 + (ql.y / rad[1]) ** 2 + (ql.z / rad[2]) ** 2)
            if ql.z > -0.004:
                up = smooth01((ql.y / rad[1] + 0.35) / 0.5)
                ln = math.exp(-((nr - 1.0) / 0.22) ** 2) * up
                if fem:
                    ln = max(ln, 0.55 * math.exp(-((nr - 1.35) / 0.35) ** 2) * smooth01(ql.y / rad[1] + 0.1))
                col = tuple(lerp(a, b, min(1.0, ln)) for a, b in zip(col, liner))
        # Hades: soot around the sockets
        if hid == "hades":
            so = g * G2(abs(x), z, 0.036, 0.004, 0.026, 0.016)
            col = tuple(a * (1 - 0.55 * so) for a in col)
        # cheeks blush (warm)
        if fem:
            bl = g * G2(abs(x), z, 0.048, -0.028, 0.016, 0.012)
            col = (col[0] * (1 + 0.12 * bl), col[1] * (1 - 0.04 * bl), col[2] * (1 - 0.04 * bl))
        return col
    finish(ob, {"Head": 1.0}, head_col, smooth=180, tag="head")

    # ---- ears + neck stub (skin) ----
    ea = Acc()
    for sx in (-1, 1):
        p = to_w(sx * 0.078, -0.004, -0.006)
        rot = rot_from(V(sx * 0.42, -1, 0.0), V(0, 0.3, 1))
        ellipsoid(ea, p, (0.0095 * k, 0.019 * k, 0.029 * k), rot, seg=10, rings=7)
        ellipsoid(ea, p + V(sx * 0.004, 0.006, 0.0), (0.006 * k, 0.012 * k, 0.018 * k), rot, seg=8, rings=5)
    limb(ea, hb + V(0, 0.012, -0.05), hb + V(0, 0.010, 0.06), [(0, .047, .049, 0), (1, .045, .047, 0)], n=12)
    solid(f"{hid}_ears", ea, "skin", {"Head": 1.0}, tag="head")

    # ---- eyeballs ----
    glow_eyes = H.get("glow_eyes", False)
    iris = lin(pal["iris"])
    sclera = lin(0xd9d3cc)
    pupil = (0.01, 0.01, 0.012)
    limbal = tuple(a * 0.45 for a in iris)
    for i, (e, rot, rad, fe) in enumerate(E):
        ac = Acc()
        ellipsoid(ac, e, rad, rot, seg=12, rings=12)

        def ecol(co, e=e, rot=rot, rad=rad):
            ql = rot.inverted() @ (co - e)
            if ql.z <= 0:
                return sclera
            nr = math.sqrt((ql.x / rad[0]) ** 2 + (ql.y / rad[1]) ** 2)
            if nr < 0.12:
                return pupil
            if nr < 0.4:
                return iris
            if nr < 0.62:
                return limbal
            return sclera
        if glow_eyes:
            solid(f"eye{i}", ac, mats["em"], {"Head": 1.0}, tag="head")
        else:
            solid(f"eye{i}", ac, mats["skn"], {"Head": 1.0}, color=ecol, tag="head")
        if H.get("glow_iris"):
            ga = Acc()
            ellipsoid(ga, e + fe * rad[2] * 0.93, (0.0052 * k, 0.0052 * k, 0.0014), rot, seg=8, rings=4)
            solid(f"iris{i}", ga, mats["em"], {"Head": 1.0}, tag="em")

    # ---- eyebrows ----
    hw = Wrap(bvh)
    bwid = F["bw"]
    for sx in (-1, 1):
        pts, rads = [], []
        for i in range(7):
            t = i / 6
            x = sx * lerp(0.011, 0.056, t)
            if hid == "hades":
                z = 0.019 + 0.010 * t - 0.004 * t * t
            elif hid == "loki":
                z = 0.022 + 0.011 * sin(pi * min(1, t * 1.15) * 0.85) - 0.002 * t
            elif fem:
                z = 0.025 + 0.008 * sin(pi * t * 0.85)
            else:
                z = 0.022 + 0.005 * sin(pi * t * 0.9) + 0.002 * t
            o = to_w(x * 0.9, 0.0, z * 0.9)
            tgt = to_w(x, 0.1, z)
            dv = (tgt - c).normalized()
            hh = bvh.ray_cast(c, dv, 0.3)
            p = (hh[0] if hh[0] else tgt) + dv * 0.0012
            pts.append(p)
            rads.append(bwid * k * (1.0 - 0.6 * t ** 1.5) if i < 6 else 0.0008)
        tube_part(f"brow{sx}", pts, rads, "hair", {"Head": 1.0}, n=6, ref=Z, flat=0.42, color=brc, tag="hair")
    return HI


# ----------------------------------------------------------------------------------------------
# Hair / beard helpers (shells wrapped onto the head)
# ----------------------------------------------------------------------------------------------

def table(x, pts):
    """Piecewise-linear lookup; pts = [(x, y), ...] ascending."""
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1:
            return lerp(y0, y1, smooth01((x - x0) / (x1 - x0)))
    return pts[-1][1]


def hair_cap(name, HI, line, off, nu=30, nv=7, slot="hair", grooves=11, gdepth=0.0035, top=89.0, color=None):
    hw = Wrap(HI.bvh)
    hc = HI.c

    def fn(u, v):
        az = lerp(-180, 180, u)
        return lerp(line(abs(az)), top, v ** 0.8), az

    def offf(u, v):
        az = lerp(-180, 180, u)
        return off(abs(az), v)

    def bul(u, v):
        return gdepth * (0.5 + 0.5 * cos(2 * pi * grooves * u)) * (1 - 0.7 * v)
    g = hw.sph(hc, fn, nu, nv, offf, bulge=bul, closed=True)
    return shell(name, g, slot, {"Head": 1.0}, thick=0.008, closed=True, outward=lambda p: p - hc, tag="hair",
                 color=color)


def hair_sheet(name, HI, bw, J, az0, az1, el_top, z_bot, off, flare=0.03, nu=8, nv=6, slot="hair", tatter=0.0,
               gap=0.02, grooves=0, gdepth=0.004, inset=0.0):
    """Long hair falling from the back of the head over the neck/back, kept clear of the body."""
    hc = HI.c
    hw = Wrap(HI.bvh)
    top = hw.sph(hc, lambda u, v: (el_top, lerp(az0, az1, u)), nu, 1, off)[0]
    grid = []
    for i in range(nv + 1):
        v = i / nv
        row = []
        for j, p0 in enumerate(top):
            u = j / nu
            dh = V(p0.x - hc.x, p0.y - hc.y, 0)
            rh = dh.length
            dh.normalize()
            zt = p0.z
            z = lerp(zt, z_bot, v)
            if tatter and i == nv:
                z += tatter * (0.5 + 0.5 * cos(u * pi * 7))
            o = V(0, 0.004, z)
            hh = bw.bvh.ray_cast(o, dh, 0.5)
            need = ((hh[0] - o).length + gap) if hh[0] is not None else 0.0
            r = max(lerp(rh, need, smooth01(v * 2.2)), need) + flare * v ** 1.3 - inset * sin(pi * v)
            r += gdepth * (0.5 + 0.5 * cos(2 * pi * grooves * u)) if grooves else 0.0
            ctr = V(hc.x, hc.y, z) if v > 0 else V(hc.x, hc.y, zt)
            row.append(ctr + dh * r if v > 0 else p0)
        grid.append(row)
    hz = J["head"].z

    def w(cpt):
        t = smooth01((cpt.z - (hz - 0.04)) / 0.08)
        return {"Head": t + 0.001, "Neck": (1 - t) * 0.3, "Chest": (1 - t) * 0.7}
    return shell(name, grid, slot, w, thick=0.008, outward=lambda p: V(p.x - hc.x, p.y - hc.y, 0), tag="hair")


def beard(name, HI, top_fn, az_half, off, nu=12, nv=6, slot="hair", grooves=7, gdepth=0.003):
    hw = Wrap(HI.bvh)
    hc = HI.c

    def fn(u, v):
        az = lerp(-az_half, az_half, u)
        return lerp(-84, top_fn(abs(az)), v), az

    def offf(u, v):
        return off(abs(lerp(-az_half, az_half, u)), v)
    g = hw.sph(hc, fn, nu, nv, offf, bulge=lambda u, v: gdepth * (0.5 + 0.5 * cos(2 * pi * grooves * u)) * (1 - v))
    return shell(name, g, slot, {"Head": 1.0}, thick=0.008, outward=lambda p: p - hc, tag="hair")


def face_curve(HI, pts_local, off=0.002):
    """Project local face points (x, z) onto the head surface (ray from the head centre)."""
    out = []
    for (x, z) in pts_local:
        tgt = HI.to_w(x, 0.1, z)
        dv = (tgt - HI.c).normalized()
        hh = HI.bvh.ray_cast(HI.c, dv, 0.3)
        out.append((hh[0] if hh[0] else tgt) + dv * off)
    return out


def moustache(name, HI, droop=0.012, width=0.03, r=0.0055, slot="hair"):
    mz = HI.mouth_z(0)
    loc = [(-width, mz - droop), (-width * 0.75, mz + 0.002), (-width * 0.38, mz + 0.008), (0, mz + 0.0095),
           (width * 0.38, mz + 0.008), (width * 0.75, mz + 0.002), (width, mz - droop)]
    pts = face_curve(HI, loc, off=0.003)
    rads = [r * 0.3, r * 0.8, r, r * 0.9, r, r * 0.8, r * 0.3]
    return tube_part(name, pts, rads, slot, {"Head": 1.0}, n=6, ref=Z, flat=0.6, tag="hair")
def tube_part(name, pts, radii, mat, weights, n=8, ref=Z, flat=1.0, color=None, tag="crest", cap1=False, subsurf=0):
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



# ----------------------------------------------------------------------------------------------
# Kit: shared pieces
# ----------------------------------------------------------------------------------------------
class Kit:
    def __init__(self, hid, B, J, H, mats, bw, HI):
        self.hid, self.B, self.J, self.H, self.mats, self.bw, self.HI = hid, B, J, H, mats, bw, HI
        self.s = s = B["hs"]
        self.fem = B["fem"]
        self.ax0, self.ax1 = V(0, 0.004, 0.86 * s), V(0, 0.004, 1.56 * s)
        self.L = self.ax1.z - self.ax0.z

    def tz(self, z):
        return (z * self.s - self.ax0.z) / self.L

    def out_axis(self, c):
        return V(c.x, c.y - 0.004, 0)

    def torso(self, name, fn, nu, nv, off, slot, weights, bulge=None, thick=0.012, closed=False, tag="armor", lip=True):
        g = self.bw.cyl(self.ax0, self.ax1, fn, nu, nv, off, bulge=bulge, closed=closed)
        return shell(name, g, slot, weights, thick=thick, closed=closed, outward=self.out_axis, tag=tag, lip=lip)

    def limb(self, name, a, b, fn, nu, nv, off, slot, weights, sx, bulge=None, thick=0.010, closed=False, tag="armor",
             lip=True):
        g = self.bw.cyl(a, b, fn, nu, nv, off, side=V(sx, 0, 0), bulge=bulge, closed=closed)
        n = (b - a).normalized()
        return shell(name, g, slot, weights, thick=thick, closed=closed, tag=tag, lip=lip,
                     outward=lambda p, a=a, n=n: (p - a) - n * (p - a).dot(n))

    def seg(self, side, part):
        J = self.J
        if part == "upper":
            return J["sh" + side], J["el" + side]
        if part == "fore":
            return J["el" + side], J["wr" + side]
        if part == "thigh":
            return J["hip" + side] + V(0, 0, 0.05), J["kn" + side]
        return J["kn" + side], J["an" + side]


def ab(u):
    return 2 * u - 1


def chest_plate(K, name, slot, zb=1.215, zt=1.435, zt_side=1.505, h0=58, h1=82, off=0.024, ridge=0.007, nu=14, nv=7,
                vdip=0.0, vneck=0.0, weights=None, thick=0.016):
    tz = K.tz

    def fn(u, v):
        a = ab(u)
        hwid = lerp(h0, h1, v ** 0.7)
        tb = tz(zb) + (tz(zb + 0.035) - tz(zb)) * abs(a) ** 2.0 - vdip * (1 - abs(a)) ** 2
        tt = tz(zt) + (tz(zt_side) - tz(zt)) * abs(a) ** 1.1 - vneck * (1 - abs(a)) ** 1.5
        return lerp(tb, tt, v), a * hwid
    bul = lambda u, v: ridge * max(0, 1 - abs(ab(u)) * 3.0) ** 2 + 0.004 * (1 - abs(ab(u)))
    K.torso(name, fn, nu, nv, off, slot, weights or {"Chest": 1.0}, bulge=bul, thick=thick)
    return fn, bul


def edge_trim(K, name, slot, fn, which, off, bul=None, width=0.03, nu=14, weights=None, thick=0.008):
    """Thin band following the top (which=1) or bottom (which=0) edge of a torso plate fn."""
    def tfn(u, v):
        t, a = fn(u, which)
        return t + (-1 if which else 1) * (1 - v) * width * (1 if which else 0) + (v * width if not which else 0) * 0, a * 0.985
    def tfn2(u, v):
        t, a = fn(u, which)
        dt = width / K.L
        return (t - dt * (1 - v)) if which else (t + dt * v), a * 0.985
    g = K.bw.cyl(K.ax0, K.ax1, tfn2, nu, 1, off + 0.004, bulge=bul)
    shell(name, g, slot, weights or {"Chest": 1.0}, thick=thick, outward=K.out_axis, tag="armor")


def belt(K, z0, z1, slot="leather", off=0.012, buckle="gold", gem=False, buckle_size=(0.075, 0.018, 0.058), round_=False):
    s = K.s
    K.torso("belt", lambda u, v: (lerp(K.tz(z0), K.tz(z1), v), u * 360), 22, 2, off, slot, {"Hips": 1.0},
            thick=0.016, closed=True)
    zc = (z0 + z1) / 2
    hb = K.bw.bvh.ray_cast(V(0, 0, zc * s), FWD, 0.5)[0] or V(0, -0.1, zc * s)
    bk = Acc()
    if round_:
        ellipsoid(bk, hb + V(0, -0.02, 0), (buckle_size[0] / 2, 0.012, buckle_size[2] / 2), rot_from(V(0, 0, 1), V(0, 1, 0)),
                  seg=16, rings=6)
        solid("buckle", bk, buckle, {"Hips": 1.0}, tag="armor")
    else:
        rbox(bk, hb + V(0, -0.022, 0), buckle_size)
        solid("buckle", bk, buckle, {"Hips": 1.0}, bevel=0.006, tag="armor")
    if gem:
        gm = Acc()
        ellipsoid(gm, hb + V(0, -0.034, 0), (0.012, 0.005, 0.012), seg=10, rings=6)
        solid("buckle_gem", gm, "glow", {"Hips": 1.0}, tag="em")
    return hb


def pouches(K, specs, slot="leather"):
    s = K.s
    po = Acc()
    for az, w_, h_ in specs:
        d = V(sin(radians(az)), -cos(radians(az)), 0)
        hp = K.bw.bvh.ray_cast(V(0, 0, 0.99 * s), d, 0.5)[0] or d * 0.16
        rbox(po, hp + d * 0.03 + V(0, 0, -0.012), (w_, 0.04, h_), rot_from(d, Z))
    solid("pouches", po, slot, {"Hips": 1.0}, bevel=0.008, tag="armor")


def pauldron(K, side, lames, slots, trim=None, spikes=None, spike_slot="gold", c_off=V(0, 0, -0.01)):
    sx = -1 if side == "L" else 1
    c = K.J["sh" + side] + c_off
    for li, (e0, e1, half, off) in enumerate(lames):
        def fn(u, v, e0=e0, e1=e1, half=half, li=li):
            a = ab(u)
            return lerp(e0 - 6 * (1 - abs(a)) ** 2 * (li > 0), e1, v), 90 * sx + sx * a * half * (1 - 0.25 * v)
        g = K.bw.sph(c, fn, 9, 3, off, bulge=lambda u, v: 0.010 * (1 - abs(ab(u))) ** 2 + 0.008 * v)
        w = {"UpperArm" + side: 0.55, "Chest": 0.45} if li == 0 else {"UpperArm" + side: 0.85, "Chest": 0.15}
        shell(f"paul{side}{li}", g, slots[li % len(slots)], w, thick=0.012, outward=lambda p, c=c: p - c, tag="armor")
    if trim and lames:
        e0, e1, half, off = lames[-1]
        g = K.bw.sph(c, lambda u, v: (e0 - 6 * (1 - abs(ab(u))) ** 2 * (len(lames) > 1) + 1 + 5 * v, 90 * sx + sx * ab(u) * half * 0.98),
                     9, 1, off + 0.004, bulge=lambda u, v: 0.010 * (1 - abs(ab(u))) ** 2)
        shell(f"paul_trim{side}", g, trim, {"UpperArm" + side: 0.85, "Chest": 0.15}, thick=0.008,
              outward=lambda p, c=c: p - c, tag="armor")
    if spikes:
        sp = Acc()
        for (az, el, ln, r) in spikes:
            d = (V(sx * cos(radians(el)), 0, sin(radians(el))) * 0.8 + V(0, sin(radians(az)) * 0.4, 0)).normalized()
            base = c + d * 0.10
            loft(sp, tube_rings([base, base + d * ln * 0.5, base + d * ln], [r, r * 0.55, 0.0008], 7, Z), 7, cap0=True, cap1=False)
        solid("paul_spikes" + side, sp, spike_slot, {"UpperArm" + side: 0.5, "Chest": 0.5}, tag="armor")


def boot(K, side, slot="leather", style="std", shaft_t=0.72, cap_slot=None, shaft_off=0.008, flare=0.0):
    J = K.J
    sx = -1 if side == "L" else 1
    kn, an = J["kn" + side], J["an" + side]
    toe = J["toe" + side]
    if shaft_t is not None:
        def fn(u, v):
            return lerp(shaft_t, 1.04, v), u * 360
        K.limb(f"bootshaft{side}", kn, an, fn, 14, 4, lambda u, v: shaft_off + flare * (1 - v) ** 2, slot,
               lambda c, an=an: {"Shin" + side: smooth01((c.z - an.z + 0.02) / 0.08), "Foot" + side: 1 - smooth01((c.z - an.z + 0.02) / 0.08) + 0.001},
               sx, thick=0.010, closed=True, tag="boots")
    fa = Acc()
    heel_y, toe_y = an.y + 0.072, toe.y - 0.012
    if style == "pointed":
        toe_y -= 0.03
    rings = []
    nfr = 12
    for i in range(nfr):
        t = i / (nfr - 1)
        yy = lerp(heel_y, toe_y, t)
        topz = lerp(0.135, 0.058, smooth01((t - 0.15) / 0.75)) * (1 if t < 0.92 else 0.92)
        w = lerp(0.044, 0.050, min(1, t * 1.6)) * (1 - 0.35 * max(0, (t - 0.82) / 0.18))
        zb = 0.0
        if style == "heavy":
            w *= 1.12
            topz *= 1.08
        if style == "pointed":
            w *= (1 - 0.55 * smooth01((t - 0.7) / 0.3))
            topz *= (1 - 0.35 * smooth01((t - 0.75) / 0.25))
            zb = 0.016 * smooth01((t - 0.85) / 0.15)
        if style == "heel":
            w *= (1 - 0.45 * smooth01((t - 0.72) / 0.28)) * 0.94
            zb = 0.0
        if style == "sandal":
            topz *= 0.85
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
            pts.append(V(xc + w * ca, yy, max(0.0, hz + hz * sa * 1.04) * (1 - zb / max(topz, 1e-3)) + zb))
        rings.append(pts)
    loft(fa, rings, 16)
    if style == "heel":
        rbox(fa, V(an.x, heel_y - 0.022, 0.03), (0.04, 0.034, 0.06))
    solid(f"boot{side}", fa, slot, {"Foot" + side: 1.0}, tag="boots")
    if cap_slot:
        tc = Acc()
        ellipsoid(tc, V(an.x + sx * 0.008, toe_y + 0.045, 0.046), (0.047, 0.05, 0.024), rot_from(V(0, -1, 0.5), Z), seg=12, rings=6)
        solid(f"toecap{side}", tc, cap_slot, {"Foot" + side: 1.0}, tag="boots")


def knee_cop(K, side, slot, off=0.014, size=1.0, spike=None):
    J = K.J
    kc = J["kn" + side]
    g = K.bw.sph(kc, lambda u, v: (lerp(-36 * size, 40 * size, v), ab(u) * lerp(58, 46, v) * size), 8, 5, off,
                 bulge=lambda u, v: 0.008 * (1 - abs(ab(u))) ** 2 * sin(pi * v))
    shell(f"knee{side}", g, slot, {"Shin" + side: 0.8, "Thigh" + side: 0.2}, thick=0.012, outward=lambda p, c=kc: p - c, tag="armor")
    if spike:
        h = K.bw.bvh.ray_cast(kc, FWD, 0.3)[0] or kc + FWD * 0.06
        base = h + FWD * (off + 0.005)
        tube_part(f"kneespike{side}", [base, base + V(0, -0.03, 0.01), base + V(0, -0.055, 0.03)], [0.014, 0.008, 0.001],
                  spike, {"Shin" + side: 0.8, "Thigh" + side: 0.2}, n=7, tag="armor")


def wrap_bands(K, side, slot, part, t0, t1, n_b, width=0.03, tilt=0.022, off=0.007, cross=False):
    a, b = K.seg(side, part)
    sx = -1 if side == "L" else 1
    L = (b - a).length
    bone = {"upper": "UpperArm", "fore": "Forearm", "thigh": "Thigh", "shin": "Shin"}[part] + side
    for i in range(n_b):
        tc = lerp(t0, t1, i / max(1, n_b - 1))
        sg = -1 if (cross and i % 2) else 1
        fn = lambda u, v, tc=tc, sg=sg: (tc + (v - 0.5) * width / L + sg * tilt / L * sin(2 * pi * u), u * 360)
        K.limb(f"wrap{part}{side}{i}", a, b, fn, 14, 1, off + 0.0015 * (i % 2), slot, {bone: 1.0}, sx, thick=0.005,
               closed=True, tag="cloth")


def fur_ring(K, name, a, b, t, R, tube, color, weights, n=22, m=6, lumps=0.6):
    acc = Acc()
    axn = (b - a).normalized()
    c0 = a + (b - a) * t
    xd, yd = frame_for(axn, FWD)
    verts, cols, faces = [], [], []
    tip = tuple(min(1.0, cc * 1.8 + 0.02) for cc in color)
    for i in range(n):
        th = 2 * pi * i / n
        rd = xd * cos(th) + yd * sin(th)
        for j in range(m):
            ph = 2 * pi * j / m
            tuft = abs(sin(th * n / 4 + (j % 2) * 0.9)) ** 3
            down = max(0.0, -sin(ph))
            rr = tube * (1 + lumps * (tuft * down * 1.4 + 0.2 * sin(th * 5 + j)))
            verts.append(c0 + rd * (R + cos(ph) * rr * 1.1) + axn * (-sin(ph) * rr * 1.2))
            f = min(1.0, tuft * down)
            cols.append(tuple(lerp(c1, c2, f * 0.7) for c1, c2 in zip(color, tip)))
    for i in range(n):
        i2 = (i + 1) % n
        for j in range(m):
            j2 = (j + 1) % m
            faces.append((i * m + j, i * m + j2, i2 * m + j2, i2 * m + j))
    acc.add(verts, faces)
    return solid(name, acc, "fur", weights, color=cols, tag="cloth", smooth=70)


def fur_mantle(K, color, rx, ry, tube, lumps=0.022, z=1.5):
    """Mantle of fur draped around the shoulders (drooping torus, tufts)."""
    s = K.s
    acc = Acc()
    n, m = 36, 8
    verts, faces, cols = [], [], []
    c0 = V(0, 0.03, z * s)
    tip = tuple(min(1.0, c * 1.8 + 0.03) for c in color)
    for k in range(n):
        a = 2 * pi * k / n
        dirv = V(sin(a), -cos(a), 0)
        cen = c0 + V(sin(a) * rx, -cos(a) * ry, 0) + V(0, 0, 0.012 * cos(a) - 0.028 * sin(a) ** 2)
        for j in range(m):
            b = 2 * pi * j / m
            tuft = abs(sin(a * (n / 4) + (j % 2) * 0.9)) ** 3
            down = max(0.0, -sin(b)) * 0.6 + max(0.0, cos(b)) * 0.8
            bump = tuft * down * 1.6 + 0.25 * sin(a * 7 + j)
            rr = tube * (1 + (lumps / tube) * bump)
            verts.append(cen + dirv * cos(b) * rr * 1.15 + Z * sin(b) * rr * 0.85)
            f = min(1.0, max(0.0, tuft * down))
            cols.append(tuple(lerp(c1, c2, f * 0.7) for c1, c2 in zip(color, tip)))
    for k in range(n):
        k2 = (k + 1) % n
        for j in range(m):
            j2 = (j + 1) % m
            faces.append((k * m + j, k * m + j2, k2 * m + j2, k2 * m + j))
    acc.add(verts, faces)
    return solid("fur", acc, "fur", lambda c: {"Chest": 0.85, "Neck": 0.15}, color=cols, tag="cloth", smooth=70)


def cape_w(c, J):
    zc = J["chest"].z
    t = smooth01((zc + 0.08 - c.z) / 0.35)
    t2 = smooth01((J["spine"].z - c.z) / 0.3)
    return {"Chest": 1 - t + 0.001, "Spine": t * (1 - t2), "Hips": t * t2}


def skirt_w2(c, J, kmax=0.55, z_start=None):
    zc = J["hips"].z if z_start is None else z_start
    t = smooth01((zc - 0.03 - c.z) / 0.30)
    k = kmax * t
    lr = max(-1.0, min(1.0, c.x / 0.07))
    wl, wr = k * (0.5 - 0.5 * lr), k * (0.5 + 0.5 * lr)
    return {"Hips": 1 - k + 0.001, "ThighL": wl, "ThighR": wr}


def hang(K, name, slot, az0, az1, z_top, z_bot, flare, weights, nu=10, nv=8, tatter=0.0, gap=0.02, roll=False, fold=0.010,
         folds=7, color=None, zray=0.98, thick=0.008, hem_slot=None, hem_w=0.03, split=None):
    """Cloth surface hanging around the body (capes, coat tails, skirts)."""
    s = K.s
    bw = K.bw
    grid = []
    prev = None
    for i in range(nv + 1):
        v = i / nv
        z = lerp(z_top, z_bot, v) * s
        row = []
        cur = []
        for j in range(nu + 1):
            u = j / nu
            az = radians(lerp(az0, az1, u))
            d = V(sin(az), -cos(az), 0)
            zz = z
            if tatter and i == nv:
                zz += tatter * (0.5 + 0.5 * cos(u * pi * 9)) * s
            o = V(0, 0.004, zz)
            r = None
            if zz > zray * s:
                h = bw.bvh.ray_cast(o, d, 0.6)
                if h[0] is not None:
                    r = (h[0] - o).length + gap
            if r is None:
                r = prev[j] if prev else 0.15
            if prev:
                r = max(r, prev[j] - 0.004)
            cur.append(r)
            fl = flare * v ** 1.6
            fo = fold * sin(u * pi * folds) * v
            rr = min(r + fl + fo, 0.45)
            row.append(o + d * rr)
        prev = cur
        grid.append(row)
    if roll:
        top = grid[0]
        grid.insert(0, [V(p.x * 0.84, (p.y - 0.004) * 0.78 + 0.004, p.z + 0.035 * s) for p in top])
    sh = shell(name, grid, slot, weights, thick=thick, bevel=0.0, outward=lambda p: V(p.x, p.y, 0), color=color, tag="cloth")
    if hem_slot:
        rows = len(grid)
        hz = hem_w
        hem = [[lerp(a, b, 1.0) for a, b in zip(grid[-2], grid[-1])], grid[-1]]
        # band along the bottom edge (slightly outside)
        top_row = []
        for a_, b_ in zip(grid[-2], grid[-1]):
            dd = (a_ - b_)
            L = dd.length or 1
            top_row.append(b_ + dd * min(1.0, hz / L))
        hem = [[p + V(p.x, p.y - 0.004, 0).normalized() * 0.003 for p in top_row],
               [p + V(p.x, p.y - 0.004, 0).normalized() * 0.003 for p in grid[-1]]]
        shell(name + "_hem", hem, hem_slot, weights, thick=0.004, bevel=0, outward=lambda p: V(p.x, p.y, 0), tag="cloth")
    return grid


def bracer(K, side, slot, t0=0.28, t1=0.96, half=150, off=0.010, plate=None, plate_half=48, cuff=None, closed=False):
    a, b = K.seg(side, "fore")
    sx = -1 if side == "L" else 1
    W = {"Forearm" + side: 1.0}
    if closed:
        K.limb(f"bracer{side}", a, b, lambda u, v: (lerp(t0, t1, v), u * 360), 14, 3, lambda u, v: off + 0.003 * v, slot, W, sx,
               closed=True)
    else:
        K.limb(f"bracer{side}", a, b, lambda u, v: (lerp(t0, t1, v), 90 + ab(u) * half), 12, 3, lambda u, v: off + 0.003 * v,
               slot, W, sx, bulge=lambda u, v: 0.003)
    if plate:
        K.limb(f"bracerplate{side}", a, b, lambda u, v: (lerp(t0 + 0.07, t1 - 0.08, v), 90 + ab(u) * plate_half), 6, 3,
               lambda u, v: off + 0.009, plate, W, sx, bulge=lambda u, v: 0.006 * (1 - abs(ab(u))) ** 2)
    if cuff:
        K.limb(f"cuff{side}", a, b, lambda u, v: (lerp(t1 - 0.06, t1 + 0.02, v), u * 360), 14, 1, off + 0.006, cuff, W, sx,
               closed=True, thick=0.008)


def arm_ring(K, side, slot, t=0.62, w=0.12, off=0.006, part="upper"):
    a, b = K.seg(side, part)
    sx = -1 if side == "L" else 1
    bone = ("UpperArm" if part == "upper" else "Forearm") + side
    K.limb(f"armring{part}{side}", a, b, lambda u, v: (lerp(t, t + w, v), u * 360), 14, 1, off, slot, {bone: 1.0}, sx,
           closed=True, thick=0.008)


def greave(K, side, slot, t0=0.10, t1=0.84, h0=78, h1=66, off=0.020, ridge=0.008, weights=None):
    a, b = K.seg(side, "shin")
    sx = -1 if side == "L" else 1
    K.limb(f"greave{side}", a, b, lambda u, v: (lerp(t0, t1, v), ab(u) * lerp(h0, h1, v)), 9, 5, off, slot,
           weights or {"Shin" + side: 1.0}, sx, bulge=lambda u, v: ridge * max(0, 1 - abs(ab(u)) * 2.4), thick=0.011)


def thigh_lames(K, side, slots, spans, half=70, off=0.016):
    a, b = K.seg(side, "thigh")
    sx = -1 if side == "L" else 1
    for i, (t0, t1) in enumerate(spans):
        K.limb(f"cuisse{side}{i}", a, b, lambda u, v, t0=t0, t1=t1: (lerp(t0, t1, v), 14 * sx * 0 + 18 + ab(u) * half), 9, 3,
               off + 0.004 * i, slots[i % len(slots)], {"Thigh" + side: 1.0}, sx,
               bulge=lambda u, v: 0.005 * (1 - abs(ab(u))), thick=0.011)


def tasset(K, side, slot, t0=-0.12, t1=0.18, center=80, half=50, off=0.022, name=None):
    a, b = K.seg(side, "thigh")
    sx = -1 if side == "L" else 1
    K.limb(name or f"tasset{side}", a, b, lambda u, v: (lerp(t0, t1, v), center + ab(u) * half), 8, 3, off, slot,
           {"Thigh" + side: 0.55, "Hips": 0.45}, sx, bulge=lambda u, v: 0.005 * (1 - abs(ab(u))), thick=0.010)


def spike_acc(acc, base, d, ln, r, n=7):
    loft(acc, tube_rings([base, base + d * ln * 0.5, base + d * ln], [r, r * 0.55, 0.0008], n, Z if abs(d.z) < 0.9 else X), n,
         cap0=True, cap1=False)


# ----------------------------------------------------------------------------------------------
# Per-hero kits
# ----------------------------------------------------------------------------------------------
HB = {"Head": 1.0}


def sides():
    return (("L", -1), ("R", 1))


def kit_thor(K):
    J, s, HI = K.J, K.s, K.HI
    hc = HI.c
    # torso: cobalt breastplate over a leather tunic; fur mantle + crimson cape
    fn, bul = chest_plate(K, "chest", "plate", zb=1.215, h0=60, h1=84, off=0.03)
    edge_trim(K, "chest_trim", "gold", fn, 1, 0.03, bul, width=0.028)
    K.torso("tunic", lambda u, v: (lerp(K.tz(1.0), K.tz(1.235), v), ab(u) * 112), 16, 4, 0.012, "leather",
            lambda c: {"Spine": 1.0 - smooth01((1.0 * s - c.z) / 0.1) * 0.5, "Hips": smooth01((1.0 * s - c.z) / 0.1) * 0.5},
            thick=0.010)
    # emblem: small glowing bolt
    zz = [(0.0, 0), (0.3, 5), (0.5, -4), (0.75, 4), (1.0, 0)]

    def bolt(u, v):
        kk = min(int(v * 4), 3)
        t0, a0 = zz[kk]
        t1, a1 = zz[kk + 1]
        f = (v - t0) / (t1 - t0)
        return lerp(K.tz(1.30), K.tz(1.40), v), lerp(a0, a1, f) + ab(u) * 1.6
    g = K.bw.cyl(K.ax0, K.ax1, bolt, 1, 12, 0.0325, bulge=lambda u, v: 0.011)
    shell("chest_em", g, "glow", {"Chest": 1.0}, thick=0.003, bevel=0, outward=K.out_axis, tag="em")
    belt(K, 0.945, 1.035, "leather", off=0.014, buckle="gold", round_=True, buckle_size=(0.085, 0.02, 0.085))
    pouches(K, [(150, 0.07, 0.07), (-150, 0.07, 0.07)])
    fur_mantle(K, lin(K.H["pal"]["fur"]), 0.198, 0.138, 0.052, lumps=0.022, z=1.5)
    hang(K, "cape", "cloth", 112, 248, 1.49, 0.36, 0.09, lambda c: cape_w(c, J), nu=12, nv=10, tatter=0.025, roll=True, gap=0.03)
    for side, sx in sides():
        # shoulders: big steel pauldron left, leather right
        if sx < 0:
            pauldron(K, side, [(30, 88, 100, 0.050), (2, 40, 102, 0.064), (-24, 10, 96, 0.074)], ["steel"], trim="gold")
        else:
            pauldron(K, side, [(18, 86, 84, 0.030), (-14, 24, 86, 0.040)], ["leather"], trim="steel")
        arm_ring(K, side, "gold", t=0.55, w=0.09)
        bracer(K, side, "leather", t0=0.26, t1=0.97, half=165, off=0.009, plate="steel", plate_half=45, cuff="gold")
        # legs: heavy steel greaves + knee cops over fur-topped boots
        a, b = K.seg(side, "shin")
        boot(K, side, "leather", style="heavy", shaft_t=0.40, cap_slot="steel", shaft_off=0.012)
        fur_ring(K, f"bootfur{side}", a, b, 0.42, 0.058 * K.B["leg"], 0.022, lin(K.H["pal"]["fur"]), {"Shin" + side: 1.0})
        greave(K, side, "steel", t0=0.08, t1=0.86, h0=84, h1=70, off=0.032, ridge=0.010)
        K.limb(f"greavetrim{side}", a, b, lambda u, v: (lerp(0.08, 0.13, v), ab(u) * 84), 9, 1, 0.036, "gold",
               {"Shin" + side: 1.0}, sx, thick=0.008)
        knee_cop(K, side, "steel", off=0.02, size=1.05)
        # hanging leather strips + a steel tasset at each hip
        tasset(K, side, "steel", t0=-0.14, t1=0.17, center=78, half=40, off=0.026)
        for i, c0 in enumerate((30, 50)):
            hang(K, f"strip{side}{i}", "leather", sx * (c0 - 9), sx * (c0 + 9), 0.96, 0.70, 0.02,
                 lambda c: skirt_w2(c, J, 0.7), nu=2, nv=3, fold=0.0, gap=0.016)
    hang(K, "loinflap", "leather", -16, 16, 0.95, 0.68, 0.02, lambda c: skirt_w2(c, J, 0.6), nu=3, nv=4, fold=0.0, gap=0.018)
    # ---- head: auburn hair + beard, winged steel cap
    hairline = lambda az: table(az, [(0, 36), (40, 32), (62, 22), (82, 16), (102, 10), (130, -30), (180, -44)])
    hair_cap("hair", HI, hairline, lambda az, v: 0.008 + 0.010 * smooth01((az - 30) / 100) + 0.006 * v, nu=30, nv=6, grooves=12)
    hair_sheet("hairback", HI, K.bw, J, 112, 248, -28, 1.44, 0.012, flare=0.03, nu=10, nv=5, grooves=6, tatter=0.03)
    beard("beard", HI, lambda az: table(az, [(0, -44), (16, -40), (28, -26), (50, -8), (70, 2), (88, 6)]), 92,
          lambda az, v: 0.004 + 0.040 * (1 - v) ** 1.3 * (1 - smooth01((az - 30) / 60) * 0.75), nu=14, nv=6, grooves=8)
    moustache("stache", HI, droop=0.016, width=0.026, r=0.0065)
    # beard braid
    chin = face_curve(HI, [(0, -0.115)], off=0.03)[0]
    pts = bezier(chin, chin + V(0, -0.012, -0.03), chin + V(0, -0.008, -0.06), chin + V(0, 0.0, -0.085), 6)
    tube_part("beardbraid", pts, [0.016, 0.014, 0.012, 0.010, 0.008, 0.004], "hair", HB, n=7, tag="hair")
    rg = Acc()
    for t in (0.35, 0.75):
        p = pts[int(t * 5)]
        ellipsoid(rg, p, (0.0125, 0.0125, 0.006), seg=10, rings=4)
    solid("beardrings", rg, "gold", HB, tag="hair")
    helmet(Wrap(HI.bvh), hc, "helm", "steel", 24, 88, lambda el: 0, nu=22, nv=6, off=0.026, nape=6)
    g = Wrap(HI.bvh).sph(hc, lambda u, v: (lerp(22, 30, v), lerp(-120, 120, u)), 18, 1, 0.031)
    shell("helmband", g, "gold", HB, thick=0.008, outward=lambda p: p - hc, tag="helm")
    g = Wrap(HI.bvh).sph(hc, lambda u, v: (lerp(28, 92, v), lerp(-5, 5, u)), 2, 7, 0.03, bulge=lambda u, v: 0.016 * sin(v * pi) ** 0.6)
    shell("crest", g, "gold", HB, thick=0.012, outward=lambda p: p - hc, tag="helm")
    for sx in (-1, 1):
        base = hc + V(sx * 0.095, 0.015, 0.06)
        for kk in range(3):
            pts = bezier(base + V(0, 0.0, -0.014 * kk), base + V(sx * 0.03, 0.04, 0.03 - 0.02 * kk),
                         base + V(sx * 0.05, 0.10, 0.075 - 0.03 * kk), base + V(sx * 0.055, 0.17 - 0.025 * kk, 0.13 - 0.05 * kk), 6)
            tube_part(f"hwing{sx}{kk}", pts, [0.020, 0.022, 0.020, 0.015, 0.008, 0.001], "steel", HB, n=6, ref=V(sx, 0, 0),
                      flat=0.25, tag="helm")


def kit_loki(K):
    J, s, HI = K.J, K.s, K.HI
    hc = HI.c
    # long open coat (torso + tails), emerald chest guard with gold edging
    K.torso("coat", lambda u, v: (lerp(K.tz(0.97), K.tz(1.50), v), lerp(26, 334, u)), 22, 7, 0.012, "cloth",
            lambda c: {"Chest": smooth01((c.z - 1.12 * s) / 0.12), "Spine": 1 - smooth01((c.z - 1.12 * s) / 0.12) + 0.001},
            thick=0.008, tag="cloth")
    for sx in (-1, 1):
        fnp = lambda u, v, sx=sx: (lerp(K.tz(1.25) + 0.05 * (1 - u if sx > 0 else u) * 0, K.tz(1.45), v),
                                   sx * lerp(6, 46, u) * lerp(1.0, 1.08, v))
        K.torso(f"chestguard{sx}", fnp, 6, 5, 0.026, "plate", {"Chest": 1.0}, bulge=lambda u, v: 0.004 * sin(pi * u), thick=0.012)
        g = K.bw.cyl(K.ax0, K.ax1, lambda u, v, sx=sx: (lerp(K.tz(1.25), K.tz(1.45), u), sx * lerp(5, 9, v)), 5, 1, 0.031)
        shell(f"guardtrim{sx}", g, "gold", {"Chest": 1.0}, thick=0.006, outward=K.out_axis, tag="armor")
    # high coat collar behind the neck
    K.torso("coatcollar", lambda u, v: (lerp(K.tz(1.47), K.tz(1.62), v), lerp(70, 290, u)), 14, 3,
            lambda u, v: 0.016 + 0.045 * v ** 1.3, "cloth", lambda c: {"Chest": 0.8, "Neck": 0.2}, thick=0.008, tag="cloth")
    belt(K, 0.955, 1.02, "leather", off=0.016, buckle="gold", gem=True, buckle_size=(0.06, 0.016, 0.05))
    for k, (a0, a1) in enumerate(((128, 176), (184, 232))):
        hang(K, f"coattail{k}", "cloth", a0, a1, 1.0, 0.50, 0.08, lambda c: skirt_w2(c, J, 0.45), nu=5, nv=6, tatter=0.04,
             gap=0.026, folds=3)
    for side, sx in sides():
        hang(K, f"coatside{side}", "cloth", sx * 34, sx * 124, 1.0, 0.56, 0.07, lambda c: skirt_w2(c, J, 0.6), nu=7, nv=6,
             gap=0.026, folds=4, fold=0.008)
    for side, sx in sides():
        if sx < 0:
            pauldron(K, side, [(16, 86, 86, 0.030), (-14, 22, 88, 0.040)], ["plate"], trim="gold")
        bracer(K, side, "gold", t0=0.40, t1=0.86, half=46, off=0.010)
        arm_ring(K, side, "leather", t=0.30, w=0.06, part="fore")
        # legs: slim leather + cloth shin wraps + soft pointed boots
        boot(K, side, "leather", style="pointed", shaft_t=0.80)
        wrap_bands(K, side, "wrap", "shin", 0.30, 0.90, 6, width=0.028, tilt=0.020, off=0.007, cross=True)
    # thigh holster strap (right)
    a, b = K.seg("R", "thigh")
    K.limb("holster_strap", a, b, lambda u, v: (lerp(0.40, 0.46, v), u * 360), 14, 1, 0.006, "leather", {"ThighR": 1.0}, 1,
           closed=True, thick=0.006)
    ho = Acc()
    hp = K.bw.bvh.ray_cast(lerp(a, b, 0.4), V(1, 0, 0), 0.4)[0] or lerp(a, b, 0.4) + V(0.08, 0, 0)
    rbox(ho, hp + V(0.02, 0, 0), (0.032, 0.08, 0.13), rot_from(V(0, -1, 0), (a - b).normalized()))
    solid("holster", ho, "leather", {"ThighR": 1.0}, bevel=0.009, tag="armor")
    # ---- head: slicked black hair, long back hair, gold horned headpiece
    hairline = lambda az: table(az, [(0, 34), (14, 40), (34, 33), (60, 22), (84, 14), (104, 8), (130, -30), (180, -40)])
    hair_cap("hair", HI, hairline, lambda az, v: 0.006 + 0.006 * smooth01((az - 40) / 100) + 0.004 * v, nu=30, nv=6, grooves=14,
             gdepth=0.003)
    hair_sheet("hairback", HI, K.bw, J, 100, 260, -22, 1.43, 0.010, flare=0.035, nu=12, nv=5, grooves=7, tatter=0.04)
    hw = Wrap(HI.bvh)
    g = hw.sph(hc, lambda u, v: (lerp(30, 44, v) - 4 * abs(ab(u)), lerp(-78, 78, u)), 16, 2, 0.018)
    shell("headband", g, "gold", HB, thick=0.010, outward=lambda p: p - hc, tag="helm")
    for sx in (-1, 1):
        g = hw.sph(hc, lambda u, v, sx=sx: (lerp(-6, 36, v), sx * lerp(70, 104, u)), 4, 4, 0.016)
        shell(f"cheekplate{sx}", g, "gold", HB, thick=0.010, outward=lambda p: p - hc, tag="helm")
        b0 = hc + V(sx * 0.036, -0.075, 0.068)
        pts = bezier(b0, b0 + V(sx * 0.03, 0.0, 0.10), b0 + V(sx * 0.07, 0.10, 0.20), b0 + V(sx * 0.05, 0.23, 0.31), 11)
        tube_part(f"horn{sx}", pts, [0.020 - 0.0019 * i for i in range(10)] + [0.0008], "gold", HB, n=8, ref=V(0, -1, 0),
                  flat=0.7, tag="crest")
    g = hw.sph(hc, lambda u, v: (lerp(36, 39, v), lerp(-14, 14, u)), 3, 1, 0.0285)
    shell("headgem", g, "glow", HB, thick=0.003, bevel=0, outward=lambda p: p - hc, tag="em")


def kit_hades(K):
    J, s, HI = K.J, K.s, K.HI
    hc = HI.c
    fn, bul = chest_plate(K, "chest", "plate", zb=1.215, h0=62, h1=86, off=0.034, ridge=0.009)
    edge_trim(K, "chest_trim", "gold", fn, 1, 0.034, bul, width=0.024)
    K.torso("abplate", lambda u, v: (lerp(K.tz(1.03), K.tz(1.24), v), ab(u) * lerp(60, 66, v)), 10, 4, 0.022, "steel",
            {"Spine": 1.0}, bulge=lambda u, v: 0.005 * (1 - abs(ab(u))), thick=0.012)
    K.torso("back", lambda u, v: (lerp(K.tz(1.20), K.tz(1.49), v), 180 + ab(u) * lerp(56, 70, v)), 10, 5, 0.024, "steel",
            {"Chest": 1.0}, thick=0.014)
    K.torso("gorget", lambda u, v: (lerp(K.tz(1.46), K.tz(1.55), v), u * 360), 18, 2, lambda u, v: 0.014 + 0.008 * v, "steel",
            lambda c: {"Chest": 0.7, "Neck": 0.3}, thick=0.012, closed=True)
    # ember seams on the cuirass
    for sx in (-1, 1):
        g = K.bw.cyl(K.ax0, K.ax1, lambda u, v, sx=sx: (lerp(K.tz(1.27), K.tz(1.40), v), sx * (lerp(16, 30, v) + ab(u) * 1.4)), 1, 5,
                     0.0365, bulge=lambda u, v: 0.004)
        shell(f"chest_em{sx}", g, "glow", {"Chest": 1.0}, thick=0.003, bevel=0, outward=K.out_axis, tag="em")
    belt(K, 0.95, 1.035, "leather", off=0.016, buckle="gold", gem=True)
    hang(K, "cloak", "cloth", 108, 252, 1.50, 0.26, 0.17, lambda c: cape_w(c, J), nu=12, nv=10, tatter=0.07, roll=True, gap=0.035)
    hang(K, "loin", "cloth", -24, 24, 0.97, 0.52, 0.03, lambda c: skirt_w2(c, J, 0.65), nu=4, nv=5, tatter=0.04, fold=0.0, gap=0.02)
    for side, sx in sides():
        pauldron(K, side, [(30, 88, 102, 0.052), (4, 42, 104, 0.066), (-22, 12, 98, 0.076), (-46, -14, 88, 0.082)], ["steel"],
                 trim="gold", spikes=[(-30, 60, 0.11, 0.02), (10, 70, 0.14, 0.022), (50, 55, 0.10, 0.018)])
        a, b = K.seg(side, "upper")
        K.limb(f"rerebrace{side}", a, b, lambda u, v: (lerp(0.40, 0.86, v), 90 + ab(u) * 150), 12, 3, 0.012, "steel",
               {"UpperArm" + side: 1.0}, sx)
        # couter (elbow cop) with spike
        el = J["el" + side]
        g = K.bw.sph(el, lambda u, v: (lerp(-50, 50, v), 180 + ab(u) * 70), 7, 5, 0.014,
                     fwd=FWD, bulge=lambda u, v: 0.008 * (1 - abs(ab(u))) ** 2 * sin(pi * v))
        shell(f"couter{side}", g, "steel", {"Forearm" + side: 0.6, "UpperArm" + side: 0.4}, thick=0.012,
              outward=lambda p, c=el: p - c, tag="armor")
        bracer(K, side, "steel", t0=0.16, t1=0.97, off=0.011, closed=True, cuff="gold")
        # legs: plated cuisses, spiked knee cops, closed greaves, sabatons
        thigh_lames(K, side, ["steel"], [(0.12, 0.38), (0.34, 0.58), (0.54, 0.80)], half=74, off=0.016)
        knee_cop(K, side, "steel", off=0.02, size=1.15, spike="gold")
        sa, sb = K.seg(side, "shin")
        K.limb(f"greave{side}", sa, sb, lambda u, v: (lerp(0.10, 0.90, v), ab(u) * 156), 14, 5, 0.022, "steel",
               {"Shin" + side: 1.0}, sx, bulge=lambda u, v: 0.008 * max(0, 1 - abs(ab(u)) * 4), thick=0.012)
        K.limb(f"greavetrim{side}", sa, sb, lambda u, v: (lerp(0.10, 0.15, v), ab(u) * 156), 14, 1, 0.026, "gold",
               {"Shin" + side: 1.0}, sx, thick=0.008)
        boot(K, side, "steel", style="heavy", shaft_t=None, cap_slot="steel")
        an, toe = J["an" + side], J["toe" + side]
        for i in range(3):
            yy = lerp(an.y - 0.01, toe.y + 0.03, i / 2.5)
            g = []
            for r_ in range(3):
                row = []
                for c_ in range(7):
                    a_ = radians(lerp(-80, 80, c_ / 6))
                    yv = yy - r_ * 0.018
                    zt = lerp(0.13, 0.07, (an.y - yv) / max(0.01, an.y - toe.y)) + 0.012
                    row.append(V(an.x + sx * 0.006 + sin(a_) * 0.058, yv, zt * cos(a_) ** 0.6 + 0.012))
                g.append(row)
            shell(f"sabaton{side}{i}", g, "steel", {"Foot" + side: 1.0}, thick=0.010, outward=lambda p, x=an.x: V(p.x - x, 0, 1),
                  tag="boots")
        tasset(K, side, "steel", t0=-0.14, t1=0.16, center=78, half=52, off=0.028, name=f"tasset{side}0")
        tasset(K, side, "plate", t0=0.04, t1=0.30, center=80, half=48, off=0.036, name=f"tasset{side}1")
    # ---- head: slicked hair, goatee, open-faced crown helm
    hairline = lambda az: table(az, [(0, 38), (30, 34), (60, 22), (90, 12), (130, -30), (180, -40)])
    hair_cap("hair", HI, hairline, lambda az, v: 0.005 + 0.003 * v, nu=26, nv=5, grooves=12, gdepth=0.002)
    beard("goatee", HI, lambda az: table(az, [(0, -46), (14, -42), (26, -40)]), 28,
          lambda az, v: 0.003 + 0.022 * (1 - v) ** 1.2 * (1 - smooth01(az / 28)), nu=6, nv=5, grooves=4)
    moustache("stache", HI, droop=0.018, width=0.024, r=0.0038)
    helmet(Wrap(HI.bvh), hc, "helm", "steel", -52, 88,
           lambda el: (62 if el < 22 else lerp(62, 0, smooth01((el - 22) / 12))) if el > -40 else 62 + (-40 - el) * 1.5,
           nu=24, nv=10, off=0.018, thick=0.016, nape=-58)
    hw = Wrap(HI.bvh)
    g = hw.sph(hc, lambda u, v: (lerp(22, 30, v), lerp(-64, 64, u)), 12, 1, 0.022)
    shell("helmbrow", g, "plate", HB, thick=0.010, outward=lambda p: p - hc, tag="helm")
    cr = Acc()
    for kk in range(9):
        az = radians(-80 + kk * 20)
        d = V(sin(az), -cos(az), 0)
        base = hc + d * 0.088 + V(0, 0, 0.09)
        ln = 0.13 - abs(kk - 4) * 0.016
        spike_acc(cr, base, (d * 0.3 + V(0, 0, 1)).normalized(), ln, 0.014, n=6)
    solid("crown", cr, "gold", HB, tag="crest")


def kit_zeus(K):
    J, s, HI = K.J, K.s, K.HI
    hc = HI.c
    K.torso("coat_torso", lambda u, v: (lerp(K.tz(0.98), K.tz(1.505), v), lerp(28, 332, u)), 22, 7, 0.010, "cloth",
            lambda c: {"Chest": smooth01((c.z - 1.12 * s) / 0.12), "Spine": 1 - smooth01((c.z - 1.12 * s) / 0.12) + 0.001},
            thick=0.008, tag="cloth")
    fn, bul = chest_plate(K, "chest", "plate", zb=1.20, h0=60, h1=84, off=0.03)
    edge_trim(K, "chest_trim", "gold", fn, 1, 0.03, bul, width=0.024)
    zz = [(0.0, 0), (0.3, 5), (0.5, -4), (0.75, 4), (1.0, 0)]

    def bolt(u, v):
        kk = min(int(v * 4), 3)
        t0, a0 = zz[kk]
        t1, a1 = zz[kk + 1]
        f = (v - t0) / (t1 - t0)
        return lerp(K.tz(1.29), K.tz(1.40), v), lerp(a0, a1, f) + ab(u) * 1.6
    g = K.bw.cyl(K.ax0, K.ax1, bolt, 1, 12, 0.0325, bulge=lambda u, v: 0.011)
    shell("chest_em", g, "glow", {"Chest": 1.0}, thick=0.003, bevel=0, outward=K.out_axis, tag="em")
    belt(K, 0.95, 1.03, "gold", off=0.016, buckle="plate", buckle_size=(0.07, 0.018, 0.06))
    # long coat skirt: open front, gold hem
    for (a0, a1, nm, nu) in ((34, 150, "R", 6), (150, 210, "B", 3), (210, 326, "L", 6)):
        hang(K, "coat" + nm, "cloth", a0, a1, 1.05, 0.40, 0.15, lambda c: skirt_w2(c, J, 0.55), nu=nu, nv=7, gap=0.016,
             fold=0.008, folds=4, hem_slot="gold", hem_w=0.03)
    for side, sx in sides():
        pauldron(K, side, [(24, 86, 92, 0.034), (-4, 32, 94, 0.046)], ["plate", "steel"], trim="gold")
        bracer(K, side, "gold", t0=0.42, t1=0.95, off=0.009, closed=True)
        arm_ring(K, side, "gold", t=0.50, w=0.06)
        greave(K, side, "plate", t0=0.10, t1=0.80, h0=78, h1=66, off=0.018, ridge=0.008)
        knee_cop(K, side, "plate", off=0.014, size=0.85)
        boot(K, side, "leather", style="sandal", shaft_t=0.86, shaft_off=0.006)
        wrap_bands(K, side, "leather", "shin", 0.52, 0.80, 4, width=0.016, tilt=0.03, off=0.010, cross=True)
    # ---- head: long white hair + full beard, gold circlet, small halo
    hairline = lambda az: table(az, [(0, 40), (30, 36), (58, 24), (84, 16), (104, 10), (130, -30), (180, -46)])
    hair_cap("hair", HI, hairline, lambda az, v: 0.010 + 0.012 * smooth01((az - 40) / 90) + 0.006 * v, nu=30, nv=6, grooves=12,
             gdepth=0.005)
    hair_sheet("hairback", HI, K.bw, J, 98, 262, -18, 1.40, 0.016, flare=0.045, nu=12, nv=6, grooves=8, gdepth=0.006, tatter=0.04)
    beard("beard", HI, lambda az: table(az, [(0, -44), (16, -40), (28, -26), (50, -6), (72, 4), (92, 10)]), 96,
          lambda az, v: 0.006 + 0.055 * (1 - v) ** 1.25 * (1 - smooth01((az - 25) / 70) * 0.7), nu=14, nv=7, grooves=9,
          gdepth=0.005)
    moustache("stache", HI, droop=0.02, width=0.03, r=0.0075)
    # beard point hanging over the chest
    chin = face_curve(HI, [(0, -0.112)], off=0.04)[0]
    pts = bezier(chin, chin + V(0, -0.01, -0.04), chin + V(0, -0.006, -0.08), chin + V(0, 0.01, -0.11), 6)
    tube_part("beardtip", pts, [0.034, 0.03, 0.024, 0.017, 0.010, 0.002], "hair", HB, n=8, flat=0.6, ref=V(1, 0, 0), tag="hair")
    hw = Wrap(HI.bvh)
    g = hw.sph(hc, lambda u, v: (lerp(26, 33, v), u * 360), 24, 1, 0.026, closed=True)
    shell("circlet", g, "gold", HB, thick=0.010, closed=True, outward=lambda p: p - hc, tag="helm")
    cr = Acc()
    for kk in range(5):
        az = radians(-32 + kk * 16)
        d = V(sin(az), -cos(az), 0)
        base = hc + d * 0.094 + V(0, 0, 0.06)
        spike_acc(cr, base, (d * 0.25 + V(0, 0, 1)).normalized(), 0.07 - abs(kk - 2) * 0.016, 0.010, n=5)
    solid("rays", cr, "gold", HB, tag="crest")
    hl = Acc()
    halo_ring(hl, hc + V(0, 0.15, 0.06), 0.17, 0.006, 32, 5)
    solid("halo", hl, "glow", HB, tag="em")


def kit_hela(K):
    J, s, HI = K.J, K.s, K.HI
    hc = HI.c
    # armoured V bodice
    fn, bul = chest_plate(K, "bodice", "plate", zb=1.10, zt=1.40, zt_side=1.48, h0=58, h1=76, off=0.022, ridge=0.006,
                          vdip=0.10, vneck=0.07, nu=14, nv=8,
                          weights=None)
    edge_trim(K, "bodice_trim", "gold", fn, 1, 0.022, bul, width=0.016)
    edge_trim(K, "bodice_trim2", "gold", fn, 0, 0.022, bul, width=0.016, weights={"Spine": 1.0})
    K.torso("highcollar", lambda u, v: (lerp(K.tz(1.44), K.tz(1.66), v), lerp(64, 296, u)), 14, 3,
            lambda u, v: 0.014 + 0.075 * v ** 1.3, "plate", lambda c: {"Chest": 0.75, "Neck": 0.25}, thick=0.008)
    belt(K, 0.965, 1.015, "gold", off=0.014, buckle="plate", gem=True, buckle_size=(0.05, 0.014, 0.05))
    hang(K, "cloak", "cloth", 110, 250, 1.48, 0.28, 0.13, lambda c: cape_w(c, J), nu=12, nv=10, tatter=0.05, roll=True, gap=0.03)
    # long slit skirt (side + back panels) with silver edges; hip lames on top
    for (a0, a1, nm) in ((46, 150, "R"), (150, 210, "B"), (210, 314, "L")):
        hang(K, "skirt" + nm, "cloth", a0, a1, 1.0, 0.14, 0.13, lambda c: skirt_w2(c, J, 0.72), nu=6 if nm != "B" else 3, nv=8,
             gap=0.014, fold=0.006, folds=4, hem_slot="gold", hem_w=0.025)
    for i, (z0, z1, off) in enumerate(((0.985, 0.88, 0.03), (0.92, 0.81, 0.042))):
        hang(K, f"hiplame{i}", "plate", 42 + 8 * i, 318 - 8 * i, z0, z1, 0.02, lambda c: skirt_w2(c, J, 0.35), nu=12, nv=2,
             gap=off, fold=0.0, thick=0.010)
    for side, sx in sides():
        pauldron(K, side, [(16, 86, 80, 0.026), (-12, 22, 82, 0.036)], ["steel"], trim="gold",
                 spikes=[(20, 72, 0.12, 0.012)], spike_slot="gold")
        bracer(K, side, "gold", t0=0.48, t1=0.92, half=60, off=0.009)
        a, b = K.seg(side, "fore")
        sp = Acc()
        for t in (0.58, 0.78):
            base = lerp(a, b, t)
            hh = K.bw.bvh.ray_cast(base, V(sx, 0, 0), 0.2)[0] or base + V(sx * 0.04, 0, 0)
            spike_acc(sp, hh + V(sx * 0.008, 0, 0), (V(sx, 0, 0) + (a - b).normalized() * 0.6).normalized(), 0.05, 0.008, n=5)
        solid(f"bracerspikes{side}", sp, "gold", {"Forearm" + side: 1.0}, tag="armor")
        boot(K, side, "leather", style="heel", shaft_t=0.06, shaft_off=0.008)
        greave(K, side, "steel", t0=0.06, t1=0.80, h0=48, h1=40, off=0.016, ridge=0.008)
    # ---- head: slicked black hair, long back hair, antler headdress
    hairline = lambda az: table(az, [(0, 34), (12, 41), (32, 34), (60, 22), (84, 14), (104, 8), (130, -30), (180, -40)])
    hair_cap("hair", HI, hairline, lambda az, v: 0.005 + 0.004 * smooth01((az - 40) / 100) + 0.003 * v, nu=30, nv=6, grooves=14,
             gdepth=0.0025)
    hair_sheet("hairback", HI, K.bw, J, 108, 252, -14, 1.30, 0.008, flare=0.04, nu=10, nv=6, grooves=6, tatter=0.05)
    hw = Wrap(HI.bvh)
    g = hw.sph(hc, lambda u, v: (lerp(32, 48, v) - 6 * abs(ab(u)) ** 2, lerp(-100, 100, u)), 16, 2, 0.014)
    shell("diadem", g, "steel", HB, thick=0.010, outward=lambda p: p - hc, tag="helm")
    g = hw.sph(hc, lambda u, v: (lerp(38, 41, v) - 6 * abs(ab(u)) ** 2, lerp(-40, 40, u)), 8, 1, 0.0185)
    shell("diadem_em", g, "glow", HB, thick=0.003, bevel=0, outward=lambda p: p - hc, tag="em")
    cr = Acc()
    for kk in range(9):
        a = (kk - 4) / 4.0
        base = hc + V(a * 0.07, -0.072 + abs(a) ** 1.5 * 0.05, 0.072 - abs(a) * 0.012)
        ln = 0.40 - abs(a) * 0.17
        d = V(a * 0.6, 0.62, 1.0).normalized()
        pts = bezier(base, base + d * ln * 0.35, base + d * ln * 0.7 + V(0, 0.05, 0), base + d * ln + V(0, 0.12, -0.02), 7)
        loft(cr, tube_rings(pts, [0.016, 0.015, 0.012, 0.009, 0.006, 0.003, 0.0005], 6, V(0, -1, 0), flat=0.45), 6, cap0=True,
             cap1=False)
    solid("headdress", cr, "steel", HB, tag="crest")


def kit_valkyrie(K):
    J, s, HI = K.J, K.s, K.HI
    hc = HI.c
    fn, bul = chest_plate(K, "chest", "plate", zb=1.235, h0=58, h1=76, off=0.024)
    edge_trim(K, "chest_trim", "gold", fn, 1, 0.024, bul, width=0.022)
    K.torso("corset", lambda u, v: (lerp(K.tz(1.03), K.tz(1.25), v), ab(u) * 120), 16, 4, 0.012, "leather", {"Spine": 1.0},
            thick=0.010)
    belt(K, 0.955, 1.03, "leather", off=0.016, buckle="gold", buckle_size=(0.06, 0.016, 0.055))
    # battle skirt (fabric) + leather pteruges with copper front/back plates
    hang(K, "skirt", "cloth", -165, 165, 0.99, 0.70, 0.07, lambda c: skirt_w2(c, J, 0.6), nu=18, nv=4, gap=0.014, fold=0.007,
         folds=18)
    for i in range(10):
        c0 = -150 + i * 33.3
        if abs(c0) < 20:
            continue
        hang(K, f"pteryx{i}", "leather", c0 - 9, c0 + 9, 0.975, 0.74, 0.06, lambda c: skirt_w2(c, J, 0.62), nu=2, nv=3, gap=0.03,
             fold=0.0, hem_slot="gold", hem_w=0.02)
    hang(K, "skirtfront", "plate", -16, 16, 0.97, 0.76, 0.03, lambda c: skirt_w2(c, J, 0.55), nu=3, nv=3, gap=0.03, fold=0.0,
         thick=0.010, hem_slot="gold", hem_w=0.018)
    wing_pack(K)
    for side, sx in sides():
        pauldron(K, side, [(18, 86, 86, 0.028), (-12, 26, 88, 0.038)], ["steel"], trim="gold")
        bracer(K, side, "leather", t0=0.30, t1=0.96, half=160, off=0.009, plate="plate", plate_half=40, cuff="gold")
        # high boots over the knee
        boot(K, side, "leather", style="std", shaft_t=-0.02, shaft_off=0.010, flare=0.004)
        a, b = K.seg(side, "thigh")
        K.limb(f"bootcuff{side}", a, b, lambda u, v: (lerp(0.74, 1.0, v), u * 360), 14, 2, lambda u, v: 0.012 - 0.002 * v,
               "leather", {"Thigh" + side: 1.0}, sx, closed=True, thick=0.010, tag="boots")
        knee_cop(K, side, "steel", off=0.024, size=0.9)
        greave(K, side, "plate", t0=0.12, t1=0.72, h0=54, h1=44, off=0.022, ridge=0.006)
    # ---- head: blonde hair + braids, winged steel helm (open face)
    hairline = lambda az: table(az, [(0, 36), (30, 32), (60, 20), (84, 12), (104, 6), (130, -30), (180, -40)])
    hair_cap("hair", HI, hairline, lambda az, v: 0.007 + 0.008 * smooth01((az - 40) / 100) + 0.004 * v, nu=28, nv=6, grooves=12)
    helmet(Wrap(HI.bvh), hc, "helm", "steel", 22, 88, lambda el: 0, nu=22, nv=6, off=0.024, nape=0)
    hw = Wrap(HI.bvh)
    g = hw.sph(hc, lambda u, v: (lerp(20, 27, v), lerp(-110, 110, u)), 16, 1, 0.029)
    shell("helmband", g, "gold", HB, thick=0.008, outward=lambda p: p - hc, tag="helm")
    for sx in (-1, 1):
        g = hw.sph(hc, lambda u, v, sx=sx: (lerp(-34, 24, v), sx * lerp(72, 108, u)), 4, 5, 0.020)
        shell(f"cheek{sx}", g, "steel", HB, thick=0.010, outward=lambda p: p - hc, tag="helm")
        base = hc + V(sx * 0.098, 0.02, 0.05)
        for kk in range(3):
            ln = 0.20 - kk * 0.04
            pts = bezier(base + V(0, 0.01 * kk, -0.02 * kk), base + V(sx * 0.04, 0.03 + 0.02 * kk, 0.03 - 0.015 * kk),
                         base + V(sx * 0.07, 0.08 + 0.03 * kk, 0.09 - 0.03 * kk), base + V(sx * 0.085, ln * 0.8 + 0.05 * kk, ln - 0.06 * kk), 6)
            tube_part(f"hwing{sx}{kk}", pts, [0.022, 0.024, 0.022, 0.018, 0.010, 0.001], "feather", HB, n=6, ref=V(sx, 0, 0),
                      flat=0.22, tag="helm")
    # braids: one down the back + two framing the face
    for k_, (x0, yb, zb, ln) in enumerate(((0.0, 0.10, -0.03, 0.30), (-0.072, 0.0, -0.06, 0.20), (0.072, 0.0, -0.06, 0.20))):
        p0 = hc + V(x0, yb, zb)
        if k_ == 0:
            pts = bezier(p0, p0 + V(0, 0.04, -0.06), p0 + V(0.0, 0.07, -0.16), p0 + V(0.01, 0.06, -ln), 9)
        else:
            pts = bezier(p0, p0 + V(x0 * 0.2, -0.01, -0.05), p0 + V(x0 * 0.35, -0.03, -0.12), p0 + V(x0 * 0.4, -0.045, -ln), 8)
        rads = [0.022 - 0.0014 * i for i in range(len(pts) - 1)] + [0.006]
        tube_part(f"braid{k_}", pts, rads, "hair",
                  lambda c: {"Head": smooth01((c.z - 1.5 * s) / 0.12), "Chest": 1 - smooth01((c.z - 1.5 * s) / 0.12) + 0.001},
                  n=7, tag="hair")


def wing_pack(K):
    s = K.s
    bw = K.bw
    bp = bw.bvh.ray_cast(V(0, 0, 1.33 * s), V(0, 1, 0), 0.5)[0] or V(0, 0.11, 1.33 * s)
    pk = Acc()
    rbox(pk, bp + V(0, 0.045, 0.0), (0.15, 0.06, 0.2))
    solid("pack", pk, "steel", {"Chest": 1.0}, bevel=0.016, tag="pack")
    wa = Acc()
    we = Acc()
    for sx in (-1, 1):
        root = bp + V(sx * 0.06, 0.07, 0.07)
        for k in range(5):
            d = V(sx * cos(radians(30 + k * 12)), 0.45, 0.55 - k * 0.32).normalized()
            ln = 0.48 - k * 0.06
            p0 = root + V(0, 0.01 * k, -0.02 * k)
            pts = bezier(p0, p0 + d * ln * 0.3 + V(0, 0.02, 0.03), p0 + d * ln * 0.7 + V(0, 0.04, 0.0), p0 + d * ln + V(0, 0.05, -0.05), 6)
            loft(wa, tube_rings(pts, [0.03, 0.05, 0.055, 0.048, 0.03, 0.002], 6, V(0, 1, 0), flat=0.16), 6, cap0=True, cap1=False)
            if k in (0, 2):
                pts2 = [p + V(0, 0.006, -0.03) for p in pts[1:5]]
                loft(we, tube_rings(pts2, [0.004, 0.004, 0.0035, 0.002], 4, V(0, 1, 0), flat=0.5), 4, cap0=True, cap1=False)
    solid("wings", wa, "feather", {"Chest": 1.0}, tag="pack")
    solid("wings_em", we, "glow", {"Chest": 1.0}, tag="em")


KITS = dict(thor=kit_thor, loki=kit_loki, hades=kit_hades, zeus=kit_zeus, hela=kit_hela, valkyrie=kit_valkyrie)
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

def make_mats(hid, H):
    pal = H["pal"]
    mats = {
        "skn": make_mat(f"{hid}_skin", (1, 1, 1), 0.0, 0.52, vcol=True),
        "fab": make_mat(f"{hid}_fabric", (1, 1, 1), 0.0, 0.86, vcol=True),
        "lth": make_mat(f"{hid}_leather", (1, 1, 1), 0.05, 0.5, vcol=True),
        "pri": make_mat(f"{hid}_armor", (1, 1, 1), 0.62, 0.34, vcol=True),
        "acc": make_mat(f"{hid}_metal", (1, 1, 1), 0.95, 0.26, vcol=True),
        "em": make_mat(f"{hid}_glow", tuple(c * 0.4 for c in lin(pal["glow"])), 0.0, 0.3, emissive=lin(pal["glow"]), em_str=1.6),
    }
    L = lambda key: lin(pal[key])
    SLOTS.clear()
    SLOTS.update({
        "skin": (mats["skn"], L("skin")),
        "suit": (mats["fab"], L("suit")), "legs": (mats["fab"], L("legs")), "cloth": (mats["fab"], L("cloth")),
        "fur": (mats["fab"], L("fur")), "hair": (mats["fab"], L("hair")), "wrap": (mats["fab"], L("wrap")),
        "leather": (mats["lth"], L("leather")),
        "plate": (mats["pri"], L("plate")), "steel": (mats["pri"], L("steel")),
        "feather": (mats["pri"], lin(pal.get("feather", 0xc4c8cf))),
        "gold": (mats["acc"], L("gold")),
        "glow": (mats["em"], (1, 1, 1)),
    })
    return mats


def build_hero(hid, H):
    clear_scene()
    PARTS.clear()
    TRI_LOG.clear()
    bpy.context.scene.render.fps = 24
    B = H["body"]
    J = make_joints(B)
    mats = make_mats(hid, H)
    arm = build_armature(hid, J)
    body, bvh_body = build_body(hid, B, J, H, arm, mats)
    HI = build_head(hid, B, J, H, mats)
    for side in ("L", "R"):
        build_hand(hid, B, J, side, H["glove"], H["fingers"], "gun" if side == "R" else "relaxed",
                   plate_slot="steel" if hid == "hades" else None)
    K = Kit(hid, B, J, H, mats, Wrap(bvh_body), HI)
    KITS[hid](K)
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
    # drop unused material slots
    used = set(p.material_index for p in me.polygons)
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.material_slot_remove_unused()
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
