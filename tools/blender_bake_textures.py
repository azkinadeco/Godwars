"""
GOD WARS — seamless PBR surface texture baker (Blender 3.6, Cycles, headless):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender_bake_textures.py

Writes assets/textures/{name}_albedo.jpg and {name}_normal.jpg (1024², tangent-space OpenGL normal).

Seamless tiling: every noise/voronoi is sampled on a 4D torus
  (cos 2πu, sin 2πu, cos 2πv) + W = sin 2πv
so u=0/1 and v=0/1 meet exactly. Grid patterns (tiles, panels, corrugation) use integer counts.
"""
import bpy
import math
import os

OUT = "/Users/apple/Documents/CODING/God Wars/assets/textures"
RES = 1024
os.makedirs(OUT, exist_ok=True)


# ----------------------------------------------------------------------------- node helpers
class G:
    def __init__(self, mat):
        self.nt = mat.node_tree
        self.n = self.nt.nodes
        self.l = self.nt.links
        for nd in list(self.n):
            self.n.remove(nd)
        self.out = self.n.new('ShaderNodeOutputMaterial')
        tc = self.n.new('ShaderNodeTexCoord')
        sep = self.n.new('ShaderNodeSeparateXYZ')
        self.l.new(tc.outputs['UV'], sep.inputs[0])
        self.u = sep.outputs[0]
        self.v = sep.outputs[1]
        # torus coordinates (radius r chosen per call via scale on the noise itself)
        self.cu = self.math('COSINE', self.math('MULTIPLY', self.u, math.tau))
        self.su = self.math('SINE', self.math('MULTIPLY', self.u, math.tau))
        self.cv = self.math('COSINE', self.math('MULTIPLY', self.v, math.tau))
        self.sv = self.math('SINE', self.math('MULTIPLY', self.v, math.tau))

    def link(self, a, b):
        self.l.new(a, b)

    def val(self, x):
        nd = self.n.new('ShaderNodeValue'); nd.outputs[0].default_value = x
        return nd.outputs[0]

    def _in(self, sock, x):
        if isinstance(x, (int, float)):
            sock.default_value = x
        else:
            self.l.new(x, sock)

    def math(self, op, a, b=0.0, c=0.0, clamp=False):
        nd = self.n.new('ShaderNodeMath'); nd.operation = op; nd.use_clamp = clamp
        self._in(nd.inputs[0], a); self._in(nd.inputs[1], b)
        if len(nd.inputs) > 2:
            self._in(nd.inputs[2], c)
        return nd.outputs[0]

    def torus(self, freq_u, freq_v=None, offset=0.0):
        """4D seamless coordinate for frequency (integer-ish repeats across the tile)."""
        fv = freq_v if freq_v is not None else freq_u
        ru, rv = freq_u / math.tau, fv / math.tau
        comb = self.n.new('ShaderNodeCombineXYZ')
        self._in(comb.inputs[0], self.math('ADD', self.math('MULTIPLY', self.cu, ru), offset))
        self._in(comb.inputs[1], self.math('MULTIPLY', self.su, ru))
        self._in(comb.inputs[2], self.math('MULTIPLY', self.cv, rv))
        w = self.math('ADD', self.math('MULTIPLY', self.sv, rv), offset * 0.7)
        return comb.outputs[0], w

    def noise(self, freq, detail=4.0, rough=0.55, distort=0.0, freq_v=None, offset=0.0):
        vec, w = self.torus(freq, freq_v, offset)
        nd = self.n.new('ShaderNodeTexNoise'); nd.noise_dimensions = '4D'
        self.link(vec, nd.inputs['Vector']); self.link(w, nd.inputs['W'])
        nd.inputs['Scale'].default_value = 1.0
        nd.inputs['Detail'].default_value = detail
        nd.inputs['Roughness'].default_value = rough
        nd.inputs['Distortion'].default_value = distort
        return nd.outputs['Fac']

    def voronoi(self, freq, feature='F1', out='Distance', freq_v=None, offset=0.0, rand=1.0):
        vec, w = self.torus(freq, freq_v, offset)
        nd = self.n.new('ShaderNodeTexVoronoi'); nd.voronoi_dimensions = '4D'; nd.feature = feature
        self.link(vec, nd.inputs['Vector']); self.link(w, nd.inputs['W'])
        nd.inputs['Scale'].default_value = 1.0
        nd.inputs['Randomness'].default_value = rand
        return nd.outputs[out]

    def ramp(self, fac, stops):
        """stops: [(pos, (r,g,b))] -> color socket"""
        nd = self.n.new('ShaderNodeValToRGB')
        self.link(fac, nd.inputs['Fac'])
        cr = nd.color_ramp
        while len(cr.elements) > len(stops):
            cr.elements.remove(cr.elements[-1])
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for el, (p, c) in zip(cr.elements, stops):
            el.position = p; el.color = (*c, 1.0)
        return nd.outputs['Color']

    def mix(self, a, b, fac, blend='MIX'):
        nd = self.n.new('ShaderNodeMixRGB'); nd.blend_type = blend
        self._in(nd.inputs['Fac'], fac)
        if isinstance(a, tuple): nd.inputs[1].default_value = (*a, 1)
        else: self.link(a, nd.inputs[1])
        if isinstance(b, tuple): nd.inputs[2].default_value = (*b, 1)
        else: self.link(b, nd.inputs[2])
        return nd.outputs[0]

    def grid(self, coord, count):
        """fract(coord*count) and cell index floor(coord*count)"""
        s = self.math('MULTIPLY', coord, count)
        return self.math('FRACT', s), self.math('FLOOR', s)

    def edge_dist(self, fract):
        """distance to nearest cell edge (0 at edge, 0.5 centre)"""
        return self.math('MINIMUM', fract, self.math('SUBTRACT', 1.0, fract))

    def cell_rand(self, iu, iv, salt=0.0):
        comb = self.n.new('ShaderNodeCombineXYZ')
        self._in(comb.inputs[0], iu); self._in(comb.inputs[1], iv); comb.inputs[2].default_value = salt
        wn = self.n.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'
        self.link(comb.outputs[0], wn.inputs['Vector'])
        return wn.outputs['Value']

    def finish(self, color, height, strength=1.0, distance=0.02):
        bsdf = self.n.new('ShaderNodeBsdfPrincipled')
        emit = self.n.new('ShaderNodeEmission')
        self.link(color, emit.inputs['Color'])
        bump = self.n.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = strength
        bump.inputs['Distance'].default_value = distance
        self.link(height, bump.inputs['Height'])
        self.link(bump.outputs['Normal'], bsdf.inputs['Normal'])
        self.emit, self.bsdf = emit, bsdf

    def use(self, which):
        for lk in list(self.out.inputs['Surface'].links):
            self.l.remove(lk)
        self.link((self.emit if which == 'emit' else self.bsdf).outputs[0], self.out.inputs['Surface'])


# ----------------------------------------------------------------------------- texture recipes
def smooth_edge(g, fract, width):
    """1 inside cell, 0 in the groove of given width"""
    d = g.edge_dist(fract)
    return g.math('MINIMUM', 1.0, g.math('DIVIDE', d, width), clamp=True)


def rec_concrete(g):
    # cast-in-place concrete panels (2x2 per tile) with tie holes, mottling and pores
    fu, iu = g.grid(g.u, 2); fv, iv = g.grid(g.v, 2)
    groove = g.math('MULTIPLY', smooth_edge(g, fu, 0.012), smooth_edge(g, fv, 0.012))
    # tie holes at 1/4,3/4 of each panel
    hu = g.math('ABSOLUTE', g.math('SUBTRACT', g.math('FRACT', g.math('MULTIPLY', fu, 2)), 0.5))
    hv = g.math('ABSOLUTE', g.math('SUBTRACT', g.math('FRACT', g.math('MULTIPLY', fv, 2)), 0.5))
    hole = g.math('GREATER_THAN', g.math('ADD', g.math('MULTIPLY', hu, hu), g.math('MULTIPLY', hv, hv)), 0.0022)
    mott = g.noise(3, 6, 0.6)
    fine = g.noise(40, 3, 0.7)
    pores = g.math('GREATER_THAN', g.voronoi(60, 'F1', 'Distance'), 0.07)
    rnd = g.cell_rand(iu, iv, 1.3)
    tone = g.math('ADD', g.math('MULTIPLY', mott, 0.6), g.math('MULTIPLY', rnd, 0.25))
    col = g.ramp(tone, [(0.25, (0.30, 0.29, 0.275)), (0.55, (0.43, 0.42, 0.40)), (0.8, (0.52, 0.51, 0.485))])
    col = g.mix(col, (0.18, 0.17, 0.16), g.math('MULTIPLY', g.math('SUBTRACT', 1, groove), 0.8))
    col = g.mix(col, (0.2, 0.19, 0.18), g.math('SUBTRACT', 1, pores))
    col = g.mix(col, (0.16, 0.15, 0.14), g.math('SUBTRACT', 1, hole))
    col = g.mix(col, (0.62, 0.61, 0.58), g.math('MULTIPLY', g.math('MAXIMUM', g.math('SUBTRACT', fine, 0.55), 0), 1.2))
    h = g.math('MULTIPLY', groove, g.math('MULTIPLY', hole, pores))
    h = g.math('ADD', h, g.math('MULTIPLY', fine, 0.08))
    g.finish(col, h, 0.9, 0.015)


def rec_stone_tiles(g):
    # large flagstone floor: 3x3 slabs, running-bond offset, bevelled edges, per-slab tone
    fv, iv = g.grid(g.v, 3)
    shift = g.math('MULTIPLY', g.math('MODULO', iv, 2), 0.5 / 3)
    fu, iu = g.grid(g.math('ADD', g.u, shift), 3)
    edge = g.math('MULTIPLY', smooth_edge(g, fu, 0.035), smooth_edge(g, fv, 0.035))
    rnd = g.cell_rand(iu, iv, 4.1)
    n = g.noise(5, 6, 0.6)
    fine = g.noise(32, 4, 0.65)
    tone = g.math('ADD', g.math('MULTIPLY', rnd, 0.45), g.math('MULTIPLY', n, 0.55))
    col = g.ramp(tone, [(0.2, (0.36, 0.33, 0.29)), (0.5, (0.50, 0.46, 0.40)), (0.85, (0.60, 0.56, 0.49))])
    col = g.mix(col, (0.14, 0.13, 0.12), g.math('MULTIPLY', g.math('SUBTRACT', 1, edge), 0.85))
    cracks = g.math('MULTIPLY', g.math('LESS_THAN', g.voronoi(7, 'DISTANCE_TO_EDGE', 'Distance'), 0.0022), g.math('GREATER_THAN', g.noise(4, 2, 0.5, offset=6.0), 0.58))
    col = g.mix(col, (0.2, 0.18, 0.16), g.math('MULTIPLY', cracks, 0.6))
    h = g.math('ADD', g.math('MULTIPLY', edge, 1.0), g.math('MULTIPLY', fine, 0.1))
    h = g.math('SUBTRACT', h, g.math('MULTIPLY', cracks, 0.2))
    g.finish(col, h, 1.0, 0.02)


def rec_metal_panel(g):
    # painted steel cladding: 2 cols x 4 rows panels, seams, rivets, scratches, edge wear
    fu, iu = g.grid(g.u, 2); fv, iv = g.grid(g.v, 4)
    seam = g.math('MULTIPLY', smooth_edge(g, fu, 0.008), smooth_edge(g, fv, 0.016))
    near_edge = g.math('LESS_THAN', g.math('MINIMUM', g.edge_dist(fu), g.math('MULTIPLY', g.edge_dist(fv), 0.5)), 0.022)
    # rivet rows along panel tops
    ru = g.math('FRACT', g.math('MULTIPLY', g.u, 16)); rv = g.math('FRACT', g.math('MULTIPLY', g.v, 4))
    dr = g.math('ADD', g.math('POWER', g.math('SUBTRACT', ru, 0.5), 2), g.math('MULTIPLY', g.math('POWER', g.math('SUBTRACT', rv, 0.06), 2), 16))
    rivet = g.math('LESS_THAN', dr, 0.012)
    scratch = g.math('GREATER_THAN', g.noise(60, 2, 0.5, 0.0, freq_v=4), 0.68)
    rnd = g.cell_rand(iu, iv, 2.2)
    n = g.noise(4, 5, 0.6)
    tone = g.math('ADD', g.math('MULTIPLY', n, 0.5), g.math('MULTIPLY', rnd, 0.3))
    col = g.ramp(tone, [(0.2, (0.16, 0.18, 0.20)), (0.6, (0.23, 0.25, 0.27)), (0.9, (0.28, 0.30, 0.32))])
    wear = g.math('MULTIPLY', near_edge, g.math('GREATER_THAN', g.noise(25, 3, 0.7), 0.6))
    col = g.mix(col, (0.42, 0.43, 0.44), g.math('MAXIMUM', g.math('MULTIPLY', wear, 0.7), g.math('MULTIPLY', scratch, 0.25)))
    col = g.mix(col, (0.07, 0.075, 0.08), g.math('MULTIPLY', g.math('SUBTRACT', 1, seam), 0.9))
    col = g.mix(col, (0.38, 0.39, 0.4), rivet)
    h = g.math('ADD', g.math('MULTIPLY', seam, 0.8), g.math('MULTIPLY', rivet, 0.5))
    g.finish(col, h, 0.8, 0.012)


def rec_rock(g):
    # layered cliff rock: distorted strata + large chunk shading + thin noise fissures + lichen
    chunks = g.voronoi(4, 'F1', 'Distance', rand=0.9)
    strata = g.noise(2, 5, 0.55, 3.0, freq_v=14)
    n = g.noise(6, 8, 0.62, 1.2)
    fine = g.noise(36, 5, 0.7)
    fis = g.math('ABSOLUTE', g.math('SUBTRACT', g.noise(5, 6, 0.6, 2.5, offset=7.0), 0.5))
    fissure = g.math('LESS_THAN', fis, 0.012)
    tone = g.math('ADD', g.math('MULTIPLY', strata, 0.45), g.math('MULTIPLY', n, 0.4))
    tone = g.math('ADD', tone, g.math('MULTIPLY', g.math('SUBTRACT', 0.5, chunks), 0.25))
    col = g.ramp(tone, [(0.2, (0.13, 0.12, 0.11)), (0.45, (0.22, 0.205, 0.19)), (0.7, (0.31, 0.29, 0.265)), (0.9, (0.38, 0.36, 0.33))])
    col = g.mix(col, (0.06, 0.055, 0.05), g.math('MULTIPLY', fissure, 0.85))
    lichen = g.math('GREATER_THAN', g.noise(5, 6, 0.6, offset=3.0), 0.64)
    col = g.mix(col, (0.17, 0.2, 0.1), g.math('MULTIPLY', lichen, g.math('MULTIPLY', fine, 0.9)))
    h = g.math('ADD', g.math('MULTIPLY', g.math('SUBTRACT', 1, chunks), 0.6), g.math('MULTIPLY', n, 0.5))
    h = g.math('ADD', h, g.math('MULTIPLY', strata, 0.3))
    h = g.math('ADD', h, g.math('MULTIPLY', fine, 0.15))
    h = g.math('SUBTRACT', h, g.math('MULTIPLY', fissure, 0.3))
    g.finish(col, h, 1.0, 0.05)


def rec_grass(g):
    # stylized meadow: clumpy tones + blade streaks + clover/dry speckles (terrain multiplies vertex tint)
    clump = g.voronoi(14, 'F1', 'Distance')
    n = g.noise(4, 6, 0.6)
    blades = g.noise(90, 2, 0.5, 0.0, freq_v=30)
    dry = g.math('GREATER_THAN', g.noise(10, 4, 0.6, offset=5.0), 0.62)
    tone = g.math('ADD', g.math('MULTIPLY', n, 0.5), g.math('MULTIPLY', g.math('SUBTRACT', 1, clump), 0.3))
    tone = g.math('ADD', tone, g.math('MULTIPLY', blades, 0.25))
    col = g.ramp(tone, [(0.25, (0.62, 0.66, 0.55)), (0.55, (0.82, 0.86, 0.74)), (0.85, (0.97, 1.0, 0.88))])
    col = g.mix(col, (0.95, 0.88, 0.62), g.math('MULTIPLY', dry, 0.35))
    h = g.math('ADD', g.math('MULTIPLY', blades, 0.6), g.math('MULTIPLY', g.math('SUBTRACT', 1, clump), 0.4))
    g.finish(col, h, 0.7, 0.02)


def rec_roof(g):
    # standing-seam / corrugated metal roofing, weathered paint
    corr = g.math('SINE', g.math('MULTIPLY', g.u, math.tau * 12))
    seamf, _ = g.grid(g.u, 4)
    seam = smooth_edge(g, seamf, 0.01)
    fv, iv = g.grid(g.v, 2)
    lap = smooth_edge(g, fv, 0.01)
    n = g.noise(4, 5, 0.6)
    rust = g.math('GREATER_THAN', g.noise(9, 6, 0.65, 0.5, offset=2.0), 0.6)
    streak = g.noise(30, 3, 0.5, 0.0, freq_v=2)
    tone = g.math('ADD', g.math('MULTIPLY', n, 0.6), g.math('MULTIPLY', streak, 0.4))
    col = g.ramp(tone, [(0.25, (0.13, 0.17, 0.19)), (0.6, (0.19, 0.24, 0.26)), (0.9, (0.25, 0.30, 0.31))])
    col = g.mix(col, (0.33, 0.2, 0.12), g.math('MULTIPLY', rust, 0.6))
    col = g.mix(col, (0.06, 0.07, 0.08), g.math('MULTIPLY', g.math('SUBTRACT', 1, g.math('MULTIPLY', seam, lap)), 0.85))
    h = g.math('ADD', g.math('MULTIPLY', corr, 0.25), g.math('MULTIPLY', g.math('MULTIPLY', seam, lap), 0.6))
    g.finish(col, h, 0.8, 0.02)


def rec_marble(g):
    # pale veined marble ashlar blocks (temple identity for Valhalla)
    fv, iv = g.grid(g.v, 4)
    shift = g.math('MULTIPLY', g.math('MODULO', iv, 2), 0.25)
    fu, iu = g.grid(g.math('ADD', g.u, shift), 2)
    joint = g.math('MULTIPLY', smooth_edge(g, fu, 0.006), smooth_edge(g, fv, 0.012))
    warp = g.noise(3, 6, 0.65, 3.5)
    vein = g.math('ABSOLUTE', g.math('SINE', g.math('ADD', g.math('MULTIPLY', warp, 18), g.math('MULTIPLY', g.u, 6))))
    vein = g.math('POWER', vein, 0.12)
    rnd = g.cell_rand(iu, iv, 7.7)
    n = g.noise(6, 5, 0.6)
    tone = g.math('ADD', g.math('MULTIPLY', n, 0.5), g.math('MULTIPLY', rnd, 0.35))
    col = g.ramp(tone, [(0.2, (0.62, 0.59, 0.54)), (0.55, (0.74, 0.71, 0.66)), (0.9, (0.82, 0.80, 0.75))])
    col = g.mix((0.40, 0.37, 0.34), col, vein)
    col = g.mix(col, (0.28, 0.26, 0.24), g.math('MULTIPLY', g.math('SUBTRACT', 1, joint), 0.85))
    h = g.math('ADD', joint, g.math('MULTIPLY', n, 0.05))
    g.finish(col, h, 0.8, 0.012)


def rec_basalt(g):
    # dark volcanic hex columns with ember-free ash dusting
    cells = g.voronoi(9, 'F1', 'Distance', rand=0.35)
    edge = g.voronoi(9, 'DISTANCE_TO_EDGE', 'Distance', rand=0.35)
    n = g.noise(10, 6, 0.65)
    ash = g.math('GREATER_THAN', g.noise(5, 5, 0.6, offset=9.0), 0.6)
    tone = g.math('ADD', g.math('MULTIPLY', n, 0.6), g.math('MULTIPLY', cells, 0.4))
    col = g.ramp(tone, [(0.2, (0.06, 0.06, 0.065)), (0.55, (0.12, 0.115, 0.12)), (0.9, (0.2, 0.19, 0.19))])
    col = g.mix(col, (0.32, 0.30, 0.29), g.math('MULTIPLY', ash, 0.4))
    col = g.mix(col, (0.03, 0.03, 0.03), g.math('MULTIPLY', g.math('LESS_THAN', edge, 0.025), 0.9))
    h = g.math('ADD', g.math('MULTIPLY', g.math('GREATER_THAN', edge, 0.025), 0.7), g.math('MULTIPLY', n, 0.3))
    g.finish(col, h, 0.9, 0.03)


def rec_dirt(g):
    # packed dirt / gravel path
    pebbles = g.voronoi(30, 'F1', 'Distance')
    n = g.noise(5, 6, 0.6)
    fine = g.noise(50, 3, 0.7)
    tone = g.math('ADD', g.math('MULTIPLY', n, 0.6), g.math('MULTIPLY', fine, 0.4))
    col = g.ramp(tone, [(0.25, (0.22, 0.17, 0.12)), (0.55, (0.33, 0.26, 0.19)), (0.85, (0.43, 0.36, 0.27))])
    peb = g.math('LESS_THAN', pebbles, 0.22)
    col = g.mix(col, (0.45, 0.43, 0.40), g.math('MULTIPLY', peb, g.math('MULTIPLY', g.noise(30, 2, 0.5, offset=4.0), 0.9)))
    h = g.math('ADD', g.math('MULTIPLY', g.math('SUBTRACT', 1, pebbles), 0.5), g.math('MULTIPLY', n, 0.4))
    g.finish(col, h, 0.8, 0.03)


RECIPES = {
    'concrete': rec_concrete, 'stone_tiles': rec_stone_tiles, 'metal_panel': rec_metal_panel,
    'rock': rec_rock, 'grass': rec_grass, 'roof': rec_roof, 'marble': rec_marble,
    'basalt': rec_basalt, 'dirt': rec_dirt,
}


# ----------------------------------------------------------------------------- bake
def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    sc.render.bake.margin = 0
    bpy.ops.mesh.primitive_plane_add(size=2)
    return bpy.context.active_object


def bake(obj, name):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    obj.data.materials.clear(); obj.data.materials.append(mat)
    g = G(mat)
    RECIPES[name](g)
    for kind in ('albedo', 'normal'):
        img = bpy.data.images.new(f"{name}_{kind}", RES, RES, alpha=False, float_buffer=False)
        if kind == 'normal':
            img.colorspace_settings.name = 'Non-Color'
        tex = g.n.new('ShaderNodeTexImage'); tex.image = img
        g.n.active = tex
        g.use('emit' if kind == 'albedo' else 'bsdf')
        sc = bpy.context.scene
        if kind == 'albedo':
            bpy.ops.object.bake(type='EMIT')
        else:
            sc.render.bake.normal_space = 'TANGENT'
            bpy.ops.object.bake(type='NORMAL')
        img.file_format = 'JPEG'
        sc.render.image_settings.quality = 88
        path = os.path.join(OUT, f"{name}_{kind}.jpg")
        img.filepath_raw = path
        img.file_format = 'JPEG'
        img.save()
        print("BAKED", path)
        g.n.remove(tex)


def main():
    import sys
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    obj = setup()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for name in RECIPES:
        if only and name not in only:
            continue
        bake(obj, name)


main()
