/**
 * GOD WARS: ASGARD ROYALE — COMPLETE APEX COMBAT, SQUAD REVIVE & ATTACHMENT ENGINE
 * - Squad Friendly-Fire Protection (Allies on same teamId never damage each other)
 * - Weapon Attachment Stat Modifiers (Barrel, Mag, Optic, Hop-Up)
 * - Knocked Down (DBNO) Directional Knockdown Shield, Squad Revives & Squad Wipe logic
 * - Mythic God Finishers (100% Evo Shield Refill) & 6 Hero Tactical/Ultimate Skills
 */

// =========================================================================
// POOLED COMBAT VFX (zero per-shot allocation; every system is one draw call)
//  - GWParticleBatch : camera-facing / velocity-stretched quads (sparks, flashes, fire, smoke, shards)
//  - GWTracerBatch   : thin screen-space ribbons with a hot core (bullet streaks)
//  - GWDecalBatch    : surface-aligned quads (bullet holes, blast scorch), ring-buffer recycled
// =========================================================================
const GW_FX_TEX = {};
function gwFxAtlas() {
  if (GW_FX_TEX.atlas) return GW_FX_TEX.atlas;
  // 2x2 atlas, 128px tiles. Tile index t -> uv offset (t%2, floor(t/2)) * 0.5 (canvas flipped).
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const atl = c.getContext('2d');
  // Each tile is painted on its own scratch canvas (destination-in masks would wipe the whole atlas).
  let g;
  const tile = (t, fn) => {
    const tc = document.createElement('canvas'); tc.width = tc.height = 128;
    g = tc.getContext('2d'); fn();
    atl.drawImage(tc, (t % 2) * 128, (1 - Math.floor(t / 2)) * 128);
  };
  // 0: soft glow
  tile(0, () => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 60);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  // 1: billowy puff (smoke / dust / fireball lobes)
  tile(1, () => {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 30;
      const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = 22 + rnd() * 18;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const v = 140 + Math.floor(rnd() * 115);
      gr.addColorStop(0, `rgba(${v},${v},${v},0.42)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    // radial mask so the quad edge never shows
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(64, 64, 34, 64, 64, 63);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(0, 0, 128, 128);
  });
  // 2: 4-point star flash with thin diagonal spikes
  tile(2, () => {
    g.globalCompositeOperation = 'lighter';
    const spike = (ang, len, w, a) => {
      g.save(); g.translate(64, 64); g.rotate(ang);
      const gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.closePath(); g.fill();
      g.restore();
    };
    for (let i = 0; i < 4; i++) spike(i * Math.PI / 2, 62, 4.5, 1);
    for (let i = 0; i < 4; i++) spike(Math.PI / 4 + i * Math.PI / 2, 30, 2.5, 0.7);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 22);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  // 3: sharp elongated shard / spark streak (long axis = +v)
  tile(3, () => {
    const gr = g.createLinearGradient(64, 4, 64, 124);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,1)');
    gr.addColorStop(0.65, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    // full-width rhombus: stretched -> thin spark streak, billboarded -> shard
    g.fillStyle = gr; g.beginPath(); g.moveTo(64, 2); g.lineTo(122, 64); g.lineTo(64, 126); g.lineTo(6, 64); g.closePath(); g.fill();
    const core = g.createLinearGradient(40, 0, 88, 0);
    core.addColorStop(0, 'rgba(255,255,255,0)'); core.addColorStop(0.5, 'rgba(255,255,255,0.6)'); core.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalCompositeOperation = 'lighter'; g.fillStyle = core; g.fillRect(40, 20, 48, 88);
  });
  const t = new THREE.CanvasTexture(c);
  GW_FX_TEX.atlas = t;
  return t;
}

function gwDecalAtlas() {
  if (GW_FX_TEX.decal) return GW_FX_TEX.decal;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const atl = c.getContext('2d');
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let g;
  const tile = (t, fn) => {
    const tc = document.createElement('canvas'); tc.width = tc.height = 128;
    g = tc.getContext('2d'); fn();
    atl.drawImage(tc, (t % 2) * 128, (1 - Math.floor(t / 2)) * 128);
  };
  const hole = (variant) => () => {
    // scorched halo
    const halo = g.createRadialGradient(64, 64, 6, 64, 64, 56);
    halo.addColorStop(0, 'rgba(30,24,20,0.85)'); halo.addColorStop(0.35, 'rgba(40,34,28,0.45)'); halo.addColorStop(1, 'rgba(40,34,28,0)');
    g.fillStyle = halo; g.fillRect(0, 0, 128, 128);
    // chipped cracks
    g.strokeStyle = 'rgba(18,14,12,0.7)'; g.lineCap = 'round';
    for (let i = 0; i < 6 + variant * 2; i++) {
      const a = rnd() * Math.PI * 2, l = 16 + rnd() * 26;
      g.lineWidth = 1 + rnd() * 1.6;
      g.beginPath(); g.moveTo(64, 64);
      g.lineTo(64 + Math.cos(a + 0.2) * l * 0.5, 64 + Math.sin(a + 0.2) * l * 0.5);
      g.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); g.stroke();
    }
    // light chipped rim + black core
    g.fillStyle = 'rgba(150,140,125,0.35)'; g.beginPath(); g.arc(64, 64, 15, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(8,6,5,1)'; g.beginPath(); g.arc(64, 64, 10 + variant * 2, 0, Math.PI * 2); g.fill();
  };
  tile(0, hole(0));
  tile(1, hole(1));
  // 2: blast scorch (irregular soot)
  tile(2, () => {
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 34;
      const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = 14 + rnd() * 24;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(14,11,9,0.5)'); gr.addColorStop(1, 'rgba(14,11,9,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 40);
    gr.addColorStop(0, 'rgba(6,5,4,0.85)'); gr.addColorStop(1, 'rgba(6,5,4,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(64, 64, 30, 64, 64, 63);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(0, 0, 128, 128);
  });
  const t = new THREE.CanvasTexture(c);
  GW_FX_TEX.decal = t;
  return t;
}

function gwRingTex() {
  if (GW_FX_TEX.ring) return GW_FX_TEX.ring;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 63);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.62, 'rgba(255,255,255,0)');
  gr.addColorStop(0.86, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.93, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  GW_FX_TEX.ring = new THREE.CanvasTexture(c);
  return GW_FX_TEX.ring;
}

const GW_PARTICLE_VS = `
attribute vec2 corner;
attribute vec3 aVel;
attribute vec4 aParams; // size, rotation, tile, stretch
attribute vec4 aColor;
uniform float uResY;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 mv = viewMatrix * vec4(position, 1.0);
  // never thinner than ~2px so distant sparks don't shimmer away
  float minS = 1.0 * max(0.1, -mv.z) * 2.0 / (projectionMatrix[1][1] * uResY);
  float size = max(aParams.x, minS);
  vec2 off;
  if (aParams.w > 0.0) {
    vec2 d = (viewMatrix * vec4(aVel, 0.0)).xy;
    float L = length(d);
    vec2 dir = L > 1e-4 ? d / L : vec2(0.0, 1.0);
    vec2 perp = vec2(dir.y, -dir.x); // rotation (not reflection) keeps the quad front-facing
    float len = size + L * aParams.w;
    off = perp * corner.x * size + dir * (corner.y * len - len * 0.5);
  } else {
    float cs = cos(aParams.y), sn = sin(aParams.y);
    off = vec2(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs) * size;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  float tx = mod(aParams.z, 2.0), ty = floor(aParams.z * 0.5);
  vUv = (corner * 0.5 + 0.5 + vec2(tx, ty)) * 0.5;
  vColor = aColor;
  vColor.a *= smoothstep(0.25, 1.2, -mv.z); // never smear a huge sprite across the lens
}`;
const GW_PARTICLE_FS = `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * t.rgb, a);
}`;

class GWParticleBatch {
  constructor(scene, max, additive, renderOrder) {
    this.max = max; this.n = 0; this._ring = 0;
    this.P = new Float32Array(max * 3); this.V = new Float32Array(max * 3);
    this.T = new Float32Array(max * 4); // age, life, gravity, drag
    this.S = new Float32Array(max * 4); // size0, size1, rot, rotVel
    this.C = new Float32Array(max * 4); // r, g, b, alpha0
    this.M = new Float32Array(max * 4); // tile, stretch, fadeMode, darken
    const vc = max * 4;
    const geo = new THREE.BufferGeometry();
    const dyn = (n) => { const a = new THREE.BufferAttribute(new Float32Array(vc * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = dyn(3); this.aVel = dyn(3); this.aPar = dyn(4); this.aCol = dyn(4);
    const corner = new Float32Array(vc * 2);
    const idx = new Uint16Array(max * 6);
    const CX = [-1, 1, 1, -1], CY = [-1, -1, 1, 1];
    for (let i = 0; i < max; i++) {
      for (let k = 0; k < 4; k++) { corner[(i * 4 + k) * 2] = CX[k]; corner[(i * 4 + k) * 2 + 1] = CY[k]; }
      const b = i * 4, o = i * 6;
      idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
    }
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aParams', this.aPar);
    geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: gwFxAtlas() }, uResY: { value: 720 } },
      vertexShader: GW_PARTICLE_VS, fragmentShader: GW_PARTICLE_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.userData.gwFX = true;
    scene.add(this.mesh);
  }

  // fadeMode: 0 linear, 1 smoke (soft in / slow out), 2 flash (fast quadratic), 3 fire (darkens with age)
  spawn(x, y, z, vx, vy, vz, life, s0, s1, col, alpha, tile, grav = 0, drag = 0, stretch = 0, fadeMode = 0, delay = 0) {
    let i;
    if (this.n < this.max) i = this.n++;
    else { i = this._ring; this._ring = (this._ring + 1) % this.max; }
    const i3 = i * 3, i4 = i * 4;
    this.P[i3] = x; this.P[i3 + 1] = y; this.P[i3 + 2] = z;
    this.V[i3] = vx; this.V[i3 + 1] = vy; this.V[i3 + 2] = vz;
    this.T[i4] = -delay; this.T[i4 + 1] = life; this.T[i4 + 2] = grav; this.T[i4 + 3] = drag;
    this.S[i4] = s0; this.S[i4 + 1] = s1; this.S[i4 + 2] = Math.random() * 6.283; this.S[i4 + 3] = (Math.random() - 0.5) * 2.2;
    this.C[i4] = col.r; this.C[i4 + 1] = col.g; this.C[i4 + 2] = col.b; this.C[i4 + 3] = alpha;
    this.M[i4] = tile; this.M[i4 + 1] = stretch; this.M[i4 + 2] = fadeMode; this.M[i4 + 3] = 0;
  }

  _kill(i) {
    const last = --this.n;
    if (i === last) return;
    const i3 = i * 3, l3 = last * 3, i4 = i * 4, l4 = last * 4;
    for (let k = 0; k < 3; k++) { this.P[i3 + k] = this.P[l3 + k]; this.V[i3 + k] = this.V[l3 + k]; }
    for (let k = 0; k < 4; k++) {
      this.T[i4 + k] = this.T[l4 + k]; this.S[i4 + k] = this.S[l4 + k];
      this.C[i4 + k] = this.C[l4 + k]; this.M[i4 + k] = this.M[l4 + k];
    }
  }

  update(dt, renderer) {
    if (this.n === 0 && this._drawn === 0) return;
    if (renderer) this.mesh.material.uniforms.uResY.value = renderer.getContext().drawingBufferHeight;
    if (this._ring >= this.n) this._ring = 0;
    const P = this.P, V = this.V, T = this.T, S = this.S, C = this.C, M = this.M;
    const pa = this.aPos.array, va = this.aVel.array, ra = this.aPar.array, ca = this.aCol.array;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3, i4 = i * 4;
      T[i4] += dt;
      const age = T[i4], life = T[i4 + 1];
      if (age >= life) { this._kill(i); i--; continue; }
      let alpha = 0, size = S[i4];
      if (age >= 0) {
        const drag = T[i4 + 3];
        if (drag > 0) { const f = Math.max(0, 1 - drag * dt); V[i3] *= f; V[i3 + 1] *= f; V[i3 + 2] *= f; }
        V[i3 + 1] -= T[i4 + 2] * dt;
        P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
        S[i4 + 2] += S[i4 + 3] * dt;
        const t = age / life, inv = 1 - t;
        size = S[i4] + (S[i4 + 1] - S[i4]) * (1 - inv * inv);
        const mode = M[i4 + 2];
        if (mode === 1) alpha = Math.min(1, t * 7) * Math.pow(inv, 1.3);
        else if (mode === 2) alpha = inv * inv;
        else if (mode === 3) alpha = 1 - t * t;
        else alpha = inv;
        alpha *= C[i4 + 3];
      }
      let r = C[i4], g = C[i4 + 1], b = C[i4 + 2];
      if (M[i4 + 2] === 3 && age > 0) {
        // fire: hot core cools toward deep orange / soot
        const t = age / life, k = 1 - Math.min(1, t * 1.25) * 0.7;
        r *= k; g *= k * k; b *= k * k * k;
      }
      for (let k = 0; k < 4; k++) {
        const v3 = (i * 4 + k) * 3, v4 = (i * 4 + k) * 4;
        pa[v3] = P[i3]; pa[v3 + 1] = P[i3 + 1]; pa[v3 + 2] = P[i3 + 2];
        va[v3] = V[i3]; va[v3 + 1] = V[i3 + 1]; va[v3 + 2] = V[i3 + 2];
        ra[v4] = size; ra[v4 + 1] = S[i4 + 2]; ra[v4 + 2] = M[i4]; ra[v4 + 3] = M[i4 + 1];
        ca[v4] = r; ca[v4 + 1] = g; ca[v4 + 2] = b; ca[v4 + 3] = alpha;
      }
    }
    const nv = this.n * 4;
    [[this.aPos, 3], [this.aVel, 3], [this.aPar, 4], [this.aCol, 4]].forEach(([a, s]) => {
      a.updateRange.offset = 0; a.updateRange.count = nv * s; a.needsUpdate = true;
    });
    this.mesh.geometry.setDrawRange(0, this.n * 6);
    this._drawn = this.n;
  }
}

const GW_TRACER_VS = `
attribute vec3 aA;
attribute vec3 aB;
attribute vec2 corner; // x: 0 tail / 1 head, y: -1 / +1 side
attribute vec4 aColor;
attribute float aWidth; // world width (m)
uniform vec2 uRes;
uniform float uMinPx;
varying float vT;
varying float vS;
varying vec4 vColor;
void main() {
  vec4 a = viewMatrix * vec4(aA, 1.0);
  vec4 b = viewMatrix * vec4(aB, 1.0);
  float zn = -0.12;
  vColor = aColor; vT = corner.x; vS = corner.y;
  if (a.z > zn && b.z > zn) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  if (a.z > zn) a = mix(a, b, (zn - a.z) / (b.z - a.z));
  if (b.z > zn) b = mix(b, a, (zn - b.z) / (a.z - b.z));
  vec4 ca = projectionMatrix * a;
  vec4 cb = projectionMatrix * b;
  vec2 sa = ca.xy / ca.w * uRes * 0.5;
  vec2 sb = cb.xy / cb.w * uRes * 0.5;
  vec2 d = sb - sa;
  float L = length(d);
  vec2 dir = L > 1e-3 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec4 c = corner.x < 0.5 ? ca : cb;
  // perspective width, clamped so a streak passing the lens never turns into a giant slab
  float px = clamp(aWidth * projectionMatrix[1][1] * uRes.y * 0.5 / c.w, uMinPx, uMinPx * 3.0);
  px *= corner.x < 0.5 ? 0.45 : 1.0;
  vColor.a *= smoothstep(0.4, 2.5, c.w);
  vec2 offPx = n * corner.y * px + dir * (corner.x < 0.5 ? -px : px);
  c.xy += offPx / (uRes * 0.5) * c.w;
  gl_Position = c;
}`;
const GW_TRACER_FS = `
varying float vT;
varying float vS;
varying vec4 vColor;
void main() {
  float e = 1.0 - abs(vS);
  float core = smoothstep(0.45, 1.0, e);
  float a = vColor.a * e * e * (0.2 + 0.8 * vT);
  gl_FragColor = vec4(mix(vColor.rgb, vec3(1.0), core * 0.85), a);
}`;

class GWTracerBatch {
  constructor(scene, max) {
    this.max = max; this.n = 0; this._ring = 0;
    this.S = new Float32Array(max * 3); this.D = new Float32Array(max * 3);
    this.K = new Float32Array(max * 5); // len, speed, streak, age, alpha
    this.C = new Float32Array(max * 4); // r,g,b,width
    const vc = max * 4;
    const geo = new THREE.BufferGeometry();
    const dyn = (n) => { const a = new THREE.BufferAttribute(new Float32Array(vc * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aA = dyn(3); this.aB = dyn(3); this.aCol = dyn(4); this.aW = dyn(1);
    const corner = new Float32Array(vc * 2);
    const idx = new Uint16Array(max * 6);
    const CX = [0, 1, 1, 0], CY = [-1, -1, 1, 1];
    for (let i = 0; i < max; i++) {
      for (let k = 0; k < 4; k++) { corner[(i * 4 + k) * 2] = CX[k]; corner[(i * 4 + k) * 2 + 1] = CY[k]; }
      const b = i * 4, o = i * 6;
      idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
    }
    // 'position' only exists so three.js has a vertex count; the shader uses aA/aB.
    geo.setAttribute('position', this.aA);
    geo.setAttribute('aA', this.aA); geo.setAttribute('aB', this.aB);
    geo.setAttribute('aColor', this.aCol); geo.setAttribute('aWidth', this.aW);
    geo.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    this.uniforms = { uRes: { value: new THREE.Vector2(1280, 720) }, uMinPx: { value: 1.6 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: GW_TRACER_VS, fragmentShader: GW_TRACER_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 6;
    this.mesh.userData.gwFX = true;
    scene.add(this.mesh);
  }

  spawn(start, end, col, alpha, width, speed) {
    let dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.3) return;
    dx /= len; dy /= len; dz /= len;
    let i;
    if (this.n < this.max) i = this.n++;
    else { i = this._ring; this._ring = (this._ring + 1) % this.max; }
    const i3 = i * 3, i5 = i * 5, i4 = i * 4;
    this.S[i3] = start.x; this.S[i3 + 1] = start.y; this.S[i3 + 2] = start.z;
    this.D[i3] = dx; this.D[i3 + 1] = dy; this.D[i3 + 2] = dz;
    const streak = Math.min(len, Math.max(2.5, Math.min(12, len * 0.3)));
    // always on screen for at least ~3 frames, even for point-blank shots
    this.K[i5] = len; this.K[i5 + 1] = Math.min(speed, (len + streak) / 0.05); this.K[i5 + 2] = streak;
    this.K[i5 + 3] = 0; this.K[i5 + 4] = alpha;
    this.C[i4] = col.r; this.C[i4 + 1] = col.g; this.C[i4 + 2] = col.b; this.C[i4 + 3] = width;
  }

  update(dt, renderer) {
    if (this.n === 0 && this._drawn === 0) return;
    if (renderer) {
      renderer.getDrawingBufferSize(this.uniforms.uRes.value);
      this.uniforms.uMinPx.value = Math.max(1.2, this.uniforms.uRes.value.y / 720 * 1.5);
    }
    if (this._ring >= this.n) this._ring = 0;
    const A = this.aA.array, B = this.aB.array, CA = this.aCol.array, W = this.aW.array;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3, i5 = i * 5, i4 = i * 4;
      this.K[i5 + 3] += dt;
      const len = this.K[i5], spd = this.K[i5 + 1], streak = this.K[i5 + 2];
      const travel = this.K[i5 + 3] * spd;
      const tail = travel - streak;
      if (tail >= len) {
        // swap-remove
        const l = --this.n;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { this.S[i3 + k] = this.S[l * 3 + k]; this.D[i3 + k] = this.D[l * 3 + k]; }
          for (let k = 0; k < 5; k++) this.K[i5 + k] = this.K[l * 5 + k];
          for (let k = 0; k < 4; k++) this.C[i4 + k] = this.C[l * 4 + k];
        }
        i--; continue;
      }
      const h = Math.min(len, travel), t0 = Math.max(0, tail);
      const fade = this.K[i5 + 4] * (travel > len ? Math.max(0, 1 - (travel - len) / streak) : 1);
      const sx = this.S[i3], sy = this.S[i3 + 1], sz = this.S[i3 + 2];
      const dx = this.D[i3], dy = this.D[i3 + 1], dz = this.D[i3 + 2];
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        A[v * 3] = sx + dx * t0; A[v * 3 + 1] = sy + dy * t0; A[v * 3 + 2] = sz + dz * t0;
        B[v * 3] = sx + dx * h; B[v * 3 + 1] = sy + dy * h; B[v * 3 + 2] = sz + dz * h;
        CA[v * 4] = this.C[i4]; CA[v * 4 + 1] = this.C[i4 + 1]; CA[v * 4 + 2] = this.C[i4 + 2]; CA[v * 4 + 3] = fade;
        W[v] = this.C[i4 + 3];
      }
    }
    const nv = this.n * 4;
    [[this.aA, 3], [this.aB, 3], [this.aCol, 4], [this.aW, 1]].forEach(([a, s]) => {
      a.updateRange.offset = 0; a.updateRange.count = nv * s; a.needsUpdate = true;
    });
    this.mesh.geometry.setDrawRange(0, this.n * 6);
    this._drawn = this.n;
  }
}

const GW_DECAL_VS = `
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
void main() {
  vUv = uv; vA = aAlpha;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
const GW_DECAL_FS = `
uniform sampler2D map;
varying vec2 vUv;
varying float vA;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(t.rgb, a);
}`;

class GWDecalBatch {
  constructor(scene, max) {
    this.max = max; this.cursor = 0; this.used = 0;
    this.age = new Float32Array(max); this.life = new Float32Array(max); this.a0 = new Float32Array(max);
    const vc = max * 4;
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(vc * 3), 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aUv = new THREE.BufferAttribute(new Float32Array(vc * 2), 2); this.aUv.setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(vc), 1); this.aAlpha.setUsage(THREE.DynamicDrawUsage);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) {
      const b = i * 4, o = i * 6;
      idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
    }
    geo.setAttribute('position', this.aPos); geo.setAttribute('uv', this.aUv); geo.setAttribute('aAlpha', this.aAlpha);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: gwDecalAtlas() } },
      vertexShader: GW_DECAL_VS, fragmentShader: GW_DECAL_FS,
      transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 1;
    this.mesh.userData.gwFX = true;
    scene.add(this.mesh);
    this._t = new THREE.Vector3(); this._b = new THREE.Vector3(); this._n = new THREE.Vector3();
  }

  spawn(pos, normal, half, tile, life, alpha = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.used = Math.min(this.max, this.used + 1);
    const n = this._n.copy(normal).normalize();
    const t = this._t;
    if (Math.abs(n.y) < 0.95) t.set(0, 1, 0).cross(n).normalize(); else t.set(1, 0, 0).cross(n).normalize();
    const b = this._b.crossVectors(n, t);
    const ang = Math.random() * 6.283, cs = Math.cos(ang) * half, sn = Math.sin(ang) * half;
    // rotated in-plane axes
    const ux = t.x * cs + b.x * sn, uy = t.y * cs + b.y * sn, uz = t.z * cs + b.z * sn;
    const wx = -t.x * sn + b.x * cs, wy = -t.y * sn + b.y * cs, wz = -t.z * sn + b.z * cs;
    const ox = pos.x + n.x * 0.012, oy = pos.y + n.y * 0.012, oz = pos.z + n.z * 0.012;
    const P = this.aPos.array, U = this.aUv.array, A = this.aAlpha.array;
    const CX = [-1, 1, 1, -1], CY = [-1, -1, 1, 1];
    const tu = (tile % 2) * 0.5, tv = Math.floor(tile / 2) * 0.5;
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      P[v * 3] = ox + ux * CX[k] + wx * CY[k];
      P[v * 3 + 1] = oy + uy * CX[k] + wy * CY[k];
      P[v * 3 + 2] = oz + uz * CX[k] + wz * CY[k];
      U[v * 2] = tu + (CX[k] * 0.5 + 0.5) * 0.5;
      U[v * 2 + 1] = tv + (CY[k] * 0.5 + 0.5) * 0.5;
      A[v] = alpha;
    }
    this.age[i] = 0; this.life[i] = life; this.a0[i] = alpha;
    this.aPos.needsUpdate = true; this.aUv.needsUpdate = true; this.aAlpha.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.used * 6);
  }

  update(dt) {
    if (this.used === 0) return;
    const A = this.aAlpha.array;
    let dirty = false;
    for (let i = 0; i < this.used; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      const rem = this.life[i] - this.age[i];
      if (rem < 2.5) {
        const a = rem <= 0 ? 0 : this.a0[i] * (rem / 2.5);
        if (rem <= 0) this.life[i] = 0;
        for (let k = 0; k < 4; k++) A[i * 4 + k] = a;
        dirty = true;
      }
    }
    if (dirty) this.aAlpha.needsUpdate = true;
  }

  clear() {
    this.aAlpha.array.fill(0); this.aAlpha.needsUpdate = true; this.life.fill(0);
  }
}

const _gwC1 = new THREE.Color(), _gwC2 = new THREE.Color(), _gwC3 = new THREE.Color(), _gwC4 = new THREE.Color();
const _gwV1 = new THREE.Vector3(), _gwV2 = new THREE.Vector3(), _gwV3 = new THREE.Vector3();

class CombatManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.tracers = [];
    this.shells = [];
    this.grenades = [];
    this.vfxList = [];
    this.decoys = [];
    this.activeZones = [];
    this.energyOrbs = [];
    this.projectiles = [];
    this._orbGeo = new THREE.OctahedronGeometry(0.18, 0);
    // a new manager is built per match: free the previous match's pooled GPU buffers
    if (game.combat && game.combat !== this && game.combat.disposeFX) game.combat.disposeFX();
    this._initFX();
  }

  disposeFX() {
    [this.fxAdd, this.fxSoft, this.fxTracers, this.fxDecals].forEach(b => {
      if (!b) return;
      if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
      b.mesh.geometry.dispose(); b.mesh.material.dispose();
    });
    (this.fxRings || []).forEach(r => { if (r.mesh.parent) r.mesh.parent.remove(r.mesh); r.mesh.material.dispose(); });
    if (this.fxLight && this.fxLight.parent) this.fxLight.parent.remove(this.fxLight);
    (this._shellPool || []).forEach(s => { if (s.mesh.parent) s.mesh.parent.remove(s.mesh); });
  }

  // ---- Pooled VFX setup. Phones get roughly half the budget everywhere. ----
  _initFX() {
    const g = this.game;
    const lowSpec = !!(g.forceMobileUI || g.qualityPreset === 'mobile' || g.qualityPreset === 'low');
    this.fxLow = lowSpec;
    this.fxCaps = lowSpec
      ? { add: 160, soft: 96, tracers: 24, decals: 20, rings: 2, shells: 6, light: false }
      : { add: 320, soft: 256, tracers: 48, decals: 40, rings: 4, shells: 14, light: true };
    this.fxQ = lowSpec ? 0.5 : 1; // particle count multiplier
    const c = this.fxCaps;
    this.fxSoft = new GWParticleBatch(this.scene, c.soft, false, 4); // smoke, dust, blood mist, debris chips
    this.fxAdd = new GWParticleBatch(this.scene, c.add, true, 5);    // sparks, flashes, fire, shards
    this.fxTracers = new GWTracerBatch(this.scene, c.tracers);
    this.fxDecals = new GWDecalBatch(this.scene, c.decals);

    // shockwave rings: shared plane geometry, per-ring material (opacity/colour)
    if (!GW_FX_TEX.ringGeo) {
      GW_FX_TEX.ringGeo = new THREE.PlaneGeometry(2, 2);
      GW_FX_TEX.ringGeo.rotateX(-Math.PI / 2);
    }
    this.fxRings = [];
    for (let i = 0; i < c.rings; i++) {
      const m = new THREE.Mesh(GW_FX_TEX.ringGeo, new THREE.MeshBasicMaterial({
        map: gwRingTex(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide
      }));
      m.visible = false; m.renderOrder = 5; m.userData.gwFX = true;
      this.scene.add(m);
      this.fxRings.push({ mesh: m, age: 0, life: 0, r: 1 });
    }
    this._ringCursor = 0;

    // ONE pooled explosion light (desktop only). Added once at match start so no shader
    // recompiles happen mid-fight; intensity 0 while idle.
    this.fxLight = null;
    if (c.light) {
      this.fxLight = new THREE.PointLight(0xffa050, 0, 18, 2);
      this.fxLight.userData.gwFX = true;
      this.scene.add(this.fxLight);
      this._lightAge = 0; this._lightLife = 0; this._lightPeak = 0;
    }

    // pooled shell casings (shared geometry + material)
    if (!GW_FX_TEX.shellGeo) {
      GW_FX_TEX.shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.032, 6);
      GW_FX_TEX.shellMat = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.9, roughness: 0.3 });
    }
    this._shellPool = [];
    for (let i = 0; i < c.shells; i++) {
      const m = new THREE.Mesh(GW_FX_TEX.shellGeo, GW_FX_TEX.shellMat);
      m.visible = false; m.userData.gwFX = true;
      this.scene.add(m);
      this._shellPool.push({ mesh: m, velocity: new THREE.Vector3(), age: 0, maxAge: 0, active: false });
    }
    this._shellCursor = 0;
    this._orbMats = {};
  }

  // Distance cull helper for cosmetic-only effects far from the camera.
  _fxNear(pos, maxDist) {
    const cam = this.game.camera;
    if (!cam) return true;
    return cam.position.distanceToSquared(pos) < maxDist * maxDist;
  }

  _n(count) { return Math.max(1, Math.round(count * this.fxQ)); }

  isEnemy(actorA, actorB) {
    if (!actorA || !actorB) return true;
    if (actorA === actorB) return false;
    if (actorA.teamId !== undefined && actorB.teamId !== undefined) {
      return actorA.teamId !== actorB.teamId;
    }
    return true;
  }

  spawnShellCasing(origin, rightDir) {
    const s = this._shellPool[this._shellCursor];
    if (!s) return;
    this._shellCursor = (this._shellCursor + 1) % this._shellPool.length;
    s.mesh.position.copy(origin);
    s.mesh.visible = true;
    s.velocity.copy(rightDir).multiplyScalar(2.2 + Math.random() * 1.4);
    s.velocity.y += 2.0 + Math.random() * 1.2;
    s.age = 0; s.maxAge = 0.55; s.active = true;
  }

  // Thin, hot, fast bullet streak. thickness > 1 is used by abilities (fatter beams).
  spawnTracer(startPos, endPos, colorHex, thickness = 1, fromPlayer = false) {
    // Hot white-yellow base, lightly tinted by the weapon colour (no neon beams).
    const col = _gwC1.setHex(0xffe6b0).lerp(_gwC2.setHex(colorHex == null ? 0xffc070 : colorHex), thickness > 1 ? 0.6 : 0.28);
    const alpha = fromPlayer ? 0.55 : 0.95;
    const width = 0.022 * (thickness > 1 ? thickness * 1.6 : 1);
    const speed = thickness > 1 ? 160 : (fromPlayer ? 520 : 300);
    this.fxTracers.spawn(startPos, endPos, col, alpha, width, speed);
  }

  // Tiny hot flash + glow at a barrel (third-person / bots). Viewmodel flash lives in models.js.
  spawnMuzzleFlash(pos, dir, colorHex) {
    if (!this._fxNear(pos, 90)) return;
    const col = _gwC1.setHex(0xffd59a).lerp(_gwC2.setHex(colorHex || 0xffc070), 0.3);
    this.fxAdd.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.05, 0.22, 0.3, col, 1, 2, 0, 0, 0, 2);
    this.fxAdd.spawn(pos.x + dir.x * 0.15, pos.y + dir.y * 0.15, pos.z + dir.z * 0.15, dir.x * 4, dir.y * 4, dir.z * 4,
      0.05, 0.05, 0.03, _gwC3.setHex(0xffffff), 0.9, 3, 0, 0, 0.05, 2);
  }

  // Bullet impact on world geometry: spark burst + dust puff + chips + pooled decal.
  // surface: 'ground' | 'stone' | 'metal'
  spawnBulletImpact(pos, normal, surface = 'stone', isGold = false, withDecal = true) {
    if (!this._fxNear(pos, 140)) return;
    const nx = normal.x, ny = normal.y, nz = normal.z;
    const px = pos.x + nx * 0.02, py = pos.y + ny * 0.02, pz = pos.z + nz * 0.02;
    const spark = _gwC1.setHex(isGold ? 0xffe890 : 0xffe0b0);
    const sparkHot = _gwC4.setRGB(1, isGold ? 0.85 : 0.62, isGold ? 0.2 : 0.18);
    // flash: sharp star + warm glow (2-3 frames)
    this.fxAdd.spawn(px, py, pz, 0, 0, 0, 0.06, 0.16, 0.24, _gwC2.setHex(0xfff2d0), 1, 2, 0, 0, 0, 2);
    this.fxAdd.spawn(px, py, pz, 0, 0, 0, 0.09, 0.16, 0.28, _gwC2.setHex(isGold ? 0xffd040 : 0xffa040), 0.7, 0, 0, 0, 0, 2);
    // sparks (fewer on dirt, more on metal)
    const ns = this._n(surface === 'ground' ? 4 : surface === 'metal' ? 10 : 7);
    for (let i = 0; i < ns; i++) {
      const sp = 3 + Math.random() * 5;
      // fan out mostly along the surface (reads as a radial burst on screen), lifted a bit
      let rx = Math.random() - 0.5, ry = Math.random() - 0.5 + 0.25, rz = Math.random() - 0.5;
      const dn = rx * nx + ry * ny + rz * nz;
      rx = (rx - nx * dn) * 2.2 - nx * 0.5; ry = (ry - ny * dn) * 2.2 - ny * 0.5; rz = (rz - nz * dn) * 2.2 - nz * 0.5;
      // alternate blend modes: additive ones glow on dark surfaces, normal-blended (saturated
      // orange) ones stay readable on bright stone where additive would just clip to white
      const hotB = (i & 1) ? this.fxSoft : this.fxAdd;
      hotB.spawn(px, py, pz, (nx + rx) * sp, (ny + ry) * sp, (nz + rz) * sp,
        0.16 + Math.random() * 0.18, 0.018, 0.009, (i & 1) ? sparkHot : spark, 1, 3, 16, 1.5, 0.035, 0);
    }
    // dust puff + debris chips
    if (surface !== 'metal') {
      const dust = _gwC3.setHex(surface === 'ground' ? 0x7d6b52 : 0x8f887c);
      const nd = surface === 'ground' ? 2 : 1;
      for (let i = 0; i < nd; i++) {
        this.fxSoft.spawn(px + nx * 0.06, py + ny * 0.06, pz + nz * 0.06,
          nx * (0.8 + Math.random()) + (Math.random() - 0.5) * 0.4, ny * 0.8 + 0.35, nz * (0.8 + Math.random()) + (Math.random() - 0.5) * 0.4,
          0.55 + Math.random() * 0.35, 0.08, 0.42 + Math.random() * 0.15, dust, surface === 'ground' ? 0.65 : 0.55, 1, -0.2, 2.2, 0, 1);
      }
      const chips = this._n(3);
      const chipCol = _gwC3.setHex(surface === 'ground' ? 0x3d3226 : 0x5a554e);
      for (let i = 0; i < chips; i++) {
        const sp = 2 + Math.random() * 3;
        this.fxSoft.spawn(px, py, pz, (nx + (Math.random() - 0.5) * 1.4) * sp, (ny + Math.random() * 0.8) * sp, (nz + (Math.random() - 0.5) * 1.4) * sp,
          0.35 + Math.random() * 0.2, 0.022, 0.016, chipCol, 0.95, 3, 14, 0.5, 0.0, 0);
      }
    }
    if (withDecal) {
      this.fxDecals.spawn(pos, normal, 0.12 + Math.random() * 0.04, Math.random() < 0.5 ? 0 : 1, this.fxLow ? 7 : 10, 0.95);
      // brief hot ember sitting in the fresh hole
      this.fxAdd.spawn(px, py, pz, 0, 0, 0, 0.3, 0.035, 0.02, _gwC2.setHex(isGold ? 0xffd040 : 0xff8a30), 0.9, 0, 0, 0, 0, 0);
    }
  }

  // Hit on a body. kind: 'shield' (tier colour shards) | 'flesh' (red mist) ; headshot adds a sharp white star.
  spawnBodyHit(pos, dir, kind, tierHex = 0x38bdf8, isHeadshot = false) {
    if (!this._fxNear(pos, 120)) return;
    const bx = -dir.x, by = -dir.y, bz = -dir.z; // back toward shooter
    if (kind === 'shield') {
      const col = _gwC1.setHex(tierHex);
      this.fxAdd.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.07, 0.2, 0.32, _gwC2.copy(col).lerp(_gwC3.setHex(0xffffff), 0.45), 1, 2, 0, 0, 0, 2);
      this.fxAdd.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.12, 0.25, 0.45, col, 0.8, 0, 0, 0, 0, 2);
      const n = this._n(6);
      for (let i = 0; i < n; i++) {
        const sp = 2.5 + Math.random() * 4;
        this.fxAdd.spawn(pos.x, pos.y, pos.z,
          (bx + (Math.random() - 0.5) * 1.8) * sp, (by + (Math.random() - 0.3) * 1.6) * sp, (bz + (Math.random() - 0.5) * 1.8) * sp,
          0.22 + Math.random() * 0.14, 0.014, 0.008, col, 1, 3, 7, 2.5, 0.04, 0);
      }
    } else {
      this.fxAdd.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.05, 0.08, 0.13, _gwC2.setHex(0xffb090), 0.8, 2, 0, 0, 0, 2);
      const mist = _gwC1.setHex(0x9e1a1a);
      this.fxSoft.spawn(pos.x, pos.y, pos.z, bx * 0.6, by * 0.6 + 0.2, bz * 0.6, 0.32, 0.12, 0.42, mist, 0.85, 1, 0, 3, 0, 1);
      const n = this._n(4);
      for (let i = 0; i < n; i++) {
        const sp = 1.5 + Math.random() * 2.5;
        this.fxSoft.spawn(pos.x, pos.y, pos.z,
          (bx + (Math.random() - 0.5) * 1.6) * sp, (by + Math.random() * 0.9) * sp, (bz + (Math.random() - 0.5) * 1.6) * sp,
          0.3 + Math.random() * 0.15, 0.022, 0.012, _gwC3.setHex(0x6e0e0e), 0.95, 0, 12, 0.5, 0, 0);
      }
    }
    if (isHeadshot) {
      this.fxAdd.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.08, 0.2, 0.34, _gwC2.setHex(0xfff3c0), 1, 2, 0, 0, 0, 2);
    }
  }

  // Big burst when a shield cracks: shards in tier colour + a quick camera-facing ring flash.
  spawnShieldBreak(pos, tierHex) {
    if (!this._fxNear(pos, 140)) return;
    const col = _gwC1.setHex(tierHex);
    this.fxAdd.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.16, 0.3, 1.0, col, 0.7, 0, 0, 0, 0, 2);
    this.fxAdd.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.08, 0.3, 0.55, _gwC2.setHex(0xffffff), 0.9, 2, 0, 0, 0, 2);
    const n = this._n(14);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, e = (Math.random() - 0.3) * 1.4, sp = 3 + Math.random() * 5;
      this.fxAdd.spawn(pos.x, pos.y, pos.z, Math.cos(a) * sp, e * sp, Math.sin(a) * sp,
        0.35 + Math.random() * 0.25, 0.018, 0.01, col, 1, 3, 9, 1.8, 0.05, 0);
    }
  }

  // Kept for callers in main.js (e.g. slide dust). Pooled sparks.
  spawnImpactSparks(pos, colorHex = 0xfbbf24, count = 6) {
    const col = _gwC1.setHex(colorHex);
    const n = Math.min(16, this._n(count));
    for (let i = 0; i < n; i++) {
      const sp = 3 + Math.random() * 5;
      this.fxAdd.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * sp * 1.6, (0.4 + Math.random()) * sp, (Math.random() - 0.5) * sp * 1.6,
        0.2 + Math.random() * 0.15, 0.012, 0.007, col, 1, 3, 16, 1.2, 0.03, 0);
    }
  }

  // Legacy entry points (now routed into the pooled system)
  spawnImpactScorch(pos, colorHex, dir = null) {
    const n = dir ? _gwV1.copy(dir).negate() : _gwV1.set(0, 1, 0);
    this.fxDecals.spawn(pos, n, 0.08, 0, this.fxLow ? 7 : 10, 0.92);
  }
  spawnImpactDust(pos, dir = null) {
    const n = dir ? _gwV1.copy(dir).negate() : _gwV1.set(0, 1, 0);
    this.fxSoft.spawn(pos.x, pos.y, pos.z, n.x * 0.8, n.y * 0.8 + 0.3, n.z * 0.8, 0.6, 0.07, 0.4, _gwC1.setHex(0xb3aa9c), 0.45, 1, -0.2, 2.2, 0, 1);
  }

  // Euphoria-Style Homing Divine Energy Orbs (Pop out on Shield Break / Kill and fly into Player!)
  spawnEnergyOrbs(pos, colorHex = 0x38bdf8, count = 3) {
    if (!this._orbMats[colorHex]) {
      this._orbMats[colorHex] = new THREE.MeshBasicMaterial({
        color: colorHex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
      });
    }
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this._orbGeo, this._orbMats[colorHex]);
      m.position.copy(pos).add(new THREE.Vector3(0, 1.1, 0));
      m.scale.setScalar(0.5);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3(Math.cos(a) * 3.6, 5.2 + Math.random() * 2.5, Math.sin(a) * 3.6);
      this.energyOrbs.push({ mesh: m, vel, age: 0 });
    }
  }

  // Explosion: flash + billowing fireball + rising smoke + debris sparks + shockwave ring
  // + ground scorch + one pooled light. All pooled; counts scale with radius but are capped.
  spawnExplosionVFX(pos, radius, colorHex, duration = 0.55) {
    if (!this._fxNear(pos, 260)) return;
    const r = Math.max(1, radius);
    const k = Math.min(3, Math.max(0.5, r / 5));      // visual scale
    const tint = _gwC3.setHex(colorHex == null ? 0xff8a30 : colorHex);
    const px = pos.x, py = pos.y, pz = pos.z;
    // flash
    this.fxAdd.spawn(px, py + 0.3, pz, 0, 0, 0, 0.1, r * 0.35, r * 0.6, _gwC1.setHex(0xfff4dc), 0.9, 0, 0, 0, 0, 2);
    this.fxAdd.spawn(px, py + 0.3, pz, 0, 0, 0, 0.09, r * 0.25, r * 0.45, _gwC1.setHex(0xffffff), 0.7, 2, 0, 0, 0, 2);
    // fireball lobes: normal-blended so they read as solid flame even against a bright sky;
    // fade mode 3 cools them from orange to soot. Additive core on top gives the heat.
    const nf = this._n(Math.round(8 + 3 * k));
    const life = Math.max(0.8, duration / 0.55);
    for (let i = 0; i < nf; i++) {
      const a = Math.random() * 6.283, e = Math.random() * 0.9, sp = r * (0.9 + Math.random() * 1.1);
      const dx = Math.cos(a) * Math.cos(e), dy = Math.sin(e) + 0.3, dz = Math.sin(a) * Math.cos(e);
      const fire = _gwC2.setHex(0xffc04a).lerp(_gwC1.setHex(0xe0521c), Math.random()).lerp(tint, 0.25);
      this.fxSoft.spawn(px + dx * r * 0.08, py + 0.3 + dy * r * 0.08, pz + dz * r * 0.08, dx * sp, dy * sp, dz * sp,
        (0.4 + Math.random() * 0.3) * life, r * 0.1, r * (0.24 + Math.random() * 0.12), fire, 1, 1, -1.2, 5, 0, 3);
    }
    const core = _gwC1.setHex(0xffd27a).lerp(tint, 0.25);
    for (let i = 0; i < this._n(4); i++) {
      const a = Math.random() * 6.283, sp = r * 0.6;
      this.fxAdd.spawn(px, py + 0.4 + r * 0.05, pz, Math.cos(a) * sp, r * 0.25, Math.sin(a) * sp,
        0.22 + Math.random() * 0.1, r * 0.15, r * 0.3, core, 0.85, 1, 0, 4, 0, 2);
    }
    // smoke: rises, spreads, lingers (starts as the fire cools)
    const ns = this._n(Math.round(6 + 2 * k));
    const smoke = _gwC1.setHex(0x57514a);
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * 6.283, sp = r * (0.25 + Math.random() * 0.35);
      this.fxSoft.spawn(px + Math.cos(a) * r * 0.15, py + 0.5 + Math.random() * r * 0.2, pz + Math.sin(a) * r * 0.15,
        Math.cos(a) * sp, 1.0 + Math.random() * 1.2 * k, Math.sin(a) * sp,
        1.8 + Math.random() * 1.0, r * 0.22, r * (0.5 + Math.random() * 0.2), smoke, 0.78, 1, -0.5, 1.4, 0, 1, 0.12 + Math.random() * 0.15);
    }
    // debris sparks
    const nd = this._n(Math.round(8 + 3 * k));
    const hot = _gwC2.setHex(0xffd080);
    for (let i = 0; i < nd; i++) {
      const a = Math.random() * 6.283, e = 0.2 + Math.random() * 1.0, sp = r * (1.8 + Math.random() * 2.4);
      this.fxAdd.spawn(px, py + 0.3, pz, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp,
        0.45 + Math.random() * 0.35, 0.02 * k + 0.012, 0.01, hot, 1, 3, 14, 0.8, 0.025, 0);
    }
    // shockwave ring (pooled)
    if (this.fxRings.length) {
      const ring = this.fxRings[this._ringCursor];
      this._ringCursor = (this._ringCursor + 1) % this.fxRings.length;
      ring.mesh.visible = true;
      ring.mesh.position.set(px, py + 0.12, pz);
      ring.mesh.material.color.copy(_gwC1.setHex(0xffe8c8).lerp(tint, 0.5));
      ring.age = 0; ring.life = Math.min(0.5, 0.28 + 0.05 * k); ring.r = r * 1.05;
      ring.mesh.scale.setScalar(0.1);
      ring.mesh.material.opacity = 0.85;
    }
    // ground scorch if near ground
    const w = this.game.world;
    if (w && w.getGroundHeight) {
      const gy = w.getGroundHeight(px, pz, py + 0.5);
      if (py - gy < 1.6) {
        this.fxDecals.spawn(_gwV1.set(px, gy, pz), _gwV2.set(0, 1, 0), Math.min(3.5, r * 0.42), 2, this.fxLow ? 10 : 16, 0.9);
      }
    }
    // pooled light
    if (this.fxLight) {
      this.fxLight.position.set(px, py + 1.0, pz);
      this.fxLight.color.copy(_gwC1.setHex(0xffa858).lerp(tint, 0.3));
      this.fxLight.distance = Math.min(40, r * 3.2);
      this._lightPeak = 5 + 2 * k; this._lightAge = 0; this._lightLife = 0.32;
      this.fxLight.intensity = this._lightPeak;
    }
  }

  // Euphoria-Style 3-Claw / Crescent Energy Slash Arc on Melee & Abilities!
  spawnSlashArc(origin, lookDir, colorHex = 0xfbbf24) {
    const grp = new THREE.Group();
    const yaw = Math.atan2(lookDir.x, lookDir.z);
    for (let k = -1; k <= 1; k++) {
      const arcMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      if (!GW_FX_TEX.arcGeo) GW_FX_TEX.arcGeo = new THREE.TorusGeometry(1.15, 0.045, 6, 18, Math.PI * 0.75);
      const arcMesh = new THREE.Mesh(GW_FX_TEX.arcGeo, arcMat);
      arcMesh.position.y = k * 0.14;
      arcMesh.rotation.x = Math.PI * 0.5 + k * 0.18;
      grp.add(arcMesh);
    }
    grp.position.copy(origin).addScaledVector(lookDir, 1.35);
    grp.rotation.y = yaw;
    this.scene.add(grp);
    this.vfxList.push({ type: 'slash', mesh: grp, age: 0, maxAge: 0.26 });
  }

  spawnLightningBolt(startPos, endPos, colorHex = 0x38bdf8, duration = 0.35) {
    const segments = 8;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = new THREE.Vector3().lerpVectors(startPos, endPos, t);
      if (i > 0 && i < segments) {
        p.x += (Math.random() - 0.5) * 1.4;
        p.y += (Math.random() - 0.5) * 1.2;
        p.z += (Math.random() - 0.5) * 1.4;
      }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 1 });
    const bolt = new THREE.Line(geo, mat);
    this.scene.add(bolt);
    this.vfxList.push({ type: 'bolt', mesh: bolt, age: 0, maxAge: duration });
  }

  performMelee(actor, origin, lookDir) {
    window.SFX.playMelee();
    const hData = window.GODWARS_DATA.HEROES[actor.heroId] || window.GODWARS_DATA.HEROES.thor;

    // Euphoria-Style 3-Hit Heirloom Melee Lunge Combo (Hit 1 -> Hit 2 -> Heavy AoE God Slam 3!)
    const now = performance.now();
    if (!actor._lastMeleeTime || now - actor._lastMeleeTime > 1350) {
      actor.meleeComboStep = 1;
    } else {
      actor.meleeComboStep = ((actor.meleeComboStep || 1) % 3) + 1;
    }
    actor._lastMeleeTime = now;
    const step = actor.meleeComboStep;

    // Forward Lunge Impulse so melee feels snappy & closes gaps!
    if (actor.isPlayer) {
      actor.momentumBoost = step === 3 ? 13.5 : 9.5;
      actor.momentumDir = new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize();
    }

    this.spawnSlashArc(origin, lookDir, step === 3 ? 0xfde047 : hData.hexColor);
    if (step === 3) {
      const slamPt = actor.position.clone().addScaledVector(new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize(), 2.2);
      this.spawnExplosionVFX(slamPt, 4.8, hData.hexColor, 0.42);
      if (actor.isPlayer) this.game.showBanner(`⚔️ 3-HIT HEIRLOOM FINISHER: ${hData.meleeName.toUpperCase()}!`, '#fde047');
    }
    const endPt = origin.clone().addScaledVector(lookDir, 4.2);
    this.spawnTracer(origin.clone().addScaledVector(lookDir, 0.5), endPt, hData.hexColor, 3);

    // Check if Melee Kicking an Apex Energy Door!
    for (const door of (this.game.world.doors || [])) {
      if (!door.broken && Math.hypot(actor.position.x - door.x, actor.position.z - door.z) < 3.5) {
        this.game.world.toggleDoor(door, true);
        this.spawnExplosionVFX(new THREE.Vector3(door.x, door.y + 1.5, door.z), 2.5, 0x38bdf8, 0.3);
        if (actor.isPlayer) this.game.showBanner('DOOR SMASHED OPEN!', '#38bdf8');
        return;
      }
    }

    const candidates = [...this.game.bots];
    if (this.game.player && this.game.player.alive) candidates.push(this.game.player);

    for (const target of candidates) {
      if (!target.alive || !this.isEnemy(actor, target)) continue;
      const tCenter = target.position.clone().add(new THREE.Vector3(0, 1.0, 0));
      const dist = origin.distanceTo(tCenter);
      const maxRange = actor.meleeComboStep === 3 ? 5.2 : 4.25;
      if (dist <= maxRange) {
        const toTarget = tCenter.clone().sub(origin).normalize();
        if (actor.meleeComboStep === 3 || toTarget.dot(lookDir) > 0.35) {
          let dmg = actor.meleeComboStep === 3 ? 65 : actor.meleeComboStep === 2 ? 44 : 36;
          if (actor.heroId === 'thor' && actor.thunderCharge >= 50) {
            dmg += 18;
            actor.thunderCharge = 0;
            this.spawnLightningBolt(origin, tCenter, 0x38bdf8, 0.4);
          }
          if (target.velocity) {
            target.velocity.x += lookDir.x * 11;
            target.velocity.y += 5.5;
            target.velocity.z += lookDir.z * 11;
          }
          this.applyDamage(actor, target, dmg, hData.meleeName, false, tCenter, true);
          break;
        }
      }
    }
  }

  fireWeapon(shooter, origin, dir, weaponData, isMythicGold = false, hopupMult = 1.0) {
    // Combat dummies pass a weapon id string; normalise so damage/range never go NaN.
    if (typeof weaponData === 'string') weaponData = window.GODWARS_DATA.WEAPONS[weaponData];
    if (!weaponData) weaponData = window.GODWARS_DATA.WEAPONS.m4a1 || Object.values(window.GODWARS_DATA.WEAPONS)[0];
    const range = weaponData.range || 160;
    let bestDist = range;
    let hitTarget = null;
    let isHeadshot = false;
    let hitPoint = origin.clone().addScaledVector(dir, range);
    let hitCollider = null;
    let hitGround = false;

    // Reused scratch objects (this loop runs over every collider for every bullet).
    const ray = this._ray || (this._ray = new THREE.Ray());
    const box = this._box || (this._box = new THREE.Box3());
    const ip = this._ip || (this._ip = new THREE.Vector3());
    ray.set(origin, dir);
    for (const c of this.game.world.colliders) {
      if (c.isDoor && !c.active) continue;
      box.min.set(c.minX, c.minY, c.minZ);
      box.max.set(c.maxX, c.maxY, c.maxZ);
      if (ray.intersectBox(box, ip)) {
        const d = origin.distanceTo(ip);
        if (d < bestDist) {
          bestDist = d;
          hitPoint.copy(ip);
          hitCollider = c;
        }
      }
    }

    if (dir.y < -0.001) {
      const tGround = -origin.y / dir.y;
      if (tGround > 0 && tGround < bestDist) {
        bestDist = tGround;
        hitPoint.copy(origin).addScaledVector(dir, tGround);
        hitCollider = null; hitGround = true;
      }
    }
    // Rolling-hill terrain: coarse march + bisection so bullets (and their impacts) land on hills.
    const world = this.game.world;
    if (world.terrainHeightAt) {
      const step = 2.5, maxT = Math.min(bestDist, 150);
      let prevT = 0;
      for (let t = step; t <= maxT + step * 0.5; t += step) {
        const tt = Math.min(t, maxT);
        const y = origin.y + dir.y * tt;
        if (y > 14) { if (dir.y >= 0) break; prevT = tt; continue; }
        const h = world.terrainHeightAt(origin.x + dir.x * tt, origin.z + dir.z * tt);
        if (h > 0.05 && y < h) {
          let lo = prevT, hi = tt;
          for (let k = 0; k < 5; k++) {
            const m = (lo + hi) * 0.5;
            if (origin.y + dir.y * m < world.terrainHeightAt(origin.x + dir.x * m, origin.z + dir.z * m)) hi = m; else lo = m;
          }
          if (hi < bestDist) {
            bestDist = hi;
            hitPoint.copy(origin).addScaledVector(dir, hi);
            hitCollider = null; hitGround = true;
          }
          break;
        }
        prevT = tt;
        if (tt >= maxT) break;
      }
    }

    // Check intersection with Hovering Apex Cargo Bots (Loot Drones!)
    for (const cb of (this.game.world.cargoBots || [])) {
      if (!cb.alive) continue;
      const pt = new THREE.Vector3();
      if (ray.intersectSphere(new THREE.Sphere(cb.position, 1.85), pt)) {
        const d = origin.distanceTo(pt);
        if (d < bestDist) {
          bestDist = d;
          hitPoint.copy(pt);
          cb.alive = false;
          cb.mesh.visible = false;
          const tier = cb.currentTier; // 2=Blue, 3=Purple, 4=Gold Mythic
          const tierColors = { 2: 0x38bdf8, 3: 0xa855f7, 4: 0xfbbf24 };
          this.spawnExplosionVFX(cb.position.clone(), 5.5, tierColors[tier], 0.55);
          window.SFX.playExplosion(false);
          window.SFX.playEvoUpgrade();
          // Drop Mythic Loot Box directly underneath on the ground!
          const dropY = this.game.world.getGroundHeight(cb.position.x, cb.position.z, cb.position.y);
          const weaponKeys = Object.keys(window.GODWARS_DATA.WEAPONS);
          const randWep = weaponKeys[Math.floor(Math.random() * weaponKeys.length)];
          const boxMesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.85, 0),
            new THREE.MeshBasicMaterial({ color: tierColors[tier] })
          );
          boxMesh.position.set(cb.position.x, dropY + 0.85, cb.position.z);
          this.scene.add(boxMesh);
          this.game.world.supplyBins.push({
            id: 'cargodrop_' + Date.now(),
            x: cb.position.x,
            z: cb.position.z,
            opened: false,
            isCarePackage: tier >= 4,
            mesh: boxMesh,
            lid: boxMesh,
            strip: boxMesh,
            loot: {
              weaponId: randWep,
              isMythicGold: tier >= 4,
              grenadeId: 'solar_bomb',
              shieldTier: tier >= 4 ? 5 : tier,
              attachmentTier: tier,
              shieldBattery: 3,
              phoenixKit: tier >= 4 ? 1 : 0
            }
          });
          if (shooter && shooter.isPlayer) {
            const label = tier >= 4 ? '★ GOLD CARGO BOT DESTROYED! MYTHIC LOOT DROPPED!' : `CARGO BOT DESTROYED! LV${tier} LOOT DROPPED!`;
            this.game.showBanner(label, tier >= 4 ? '#fde047' : '#a855f7');
          }
          this.spawnTracer(origin.clone().addScaledVector(dir, 0.7), hitPoint, tierColors[tier]);
          return;
        }
      }
    }

    const candidates = [...this.game.bots];
    if (this.game.player && this.game.player.alive) {
      candidates.push(this.game.player);
    }

    for (const target of candidates) {
      if (!target.alive || !this.isEnemy(shooter, target)) continue;
      const tPos = target.position;
      const height = target.knocked ? 1.15 : 2.15;
      box.min.set(tPos.x - 0.55, tPos.y, tPos.z - 0.55);
      box.max.set(tPos.x + 0.55, tPos.y + height, tPos.z + 0.55);
      const pt = ip;

      if (ray.intersectBox(box, pt)) {
        const d = origin.distanceTo(pt);
        if (d < bestDist) {
          bestDist = d;
          hitPoint.copy(pt);
          hitTarget = target;
          isHeadshot = !target.knocked && (pt.y - tPos.y) >= 1.52;
        }
      }
    }

    if (shooter && shooter.isPlayer && this.game.isOnline && window.NET) window.NET.reportShot();
    const startTracer = origin.clone().addScaledVector(dir, 0.7);
    startTracer.y -= 0.08;
    const isPlayerShot = !!(shooter && shooter.isPlayer);
    const tracerHex = isMythicGold ? 0xfde047 : weaponData.hexColor;
    if (isPlayerShot && this.game.activeViewmodel && this.game.activeViewmodel.userData.muzzleFlash) {
      // start the streak at the real barrel tip so it visibly leaves the gun
      const mf = this.game.activeViewmodel.userData.muzzleFlash;
      mf.getWorldPosition(_gwV3);
      if (_gwV3.distanceToSquared(origin) < 2.5) startTracer.copy(_gwV3);
    } else if (!isPlayerShot) {
      this.spawnMuzzleFlash(startTracer, dir, tracerHex);
    }
    this.spawnTracer(startTracer, hitPoint, tracerHex, 1, isPlayerShot);
    if (shooter && shooter.isPlayer) {
      shooter.shotsFired = (shooter.shotsFired || 0) + 1;
    }

    if (hitTarget) {
      if (shooter && shooter.isPlayer) {
        shooter.shotsHit = (shooter.shotsHit || 0) + 1;
        if (isHeadshot) shooter.headshotsLanded = (shooter.headshotsLanded || 0) + 1;
      }
      let dmg = weaponData.damage * (isMythicGold ? 1.2 : 1.0) * hopupMult;
      if (shooter.perks && shooter.perks.dmgMult) dmg *= shooter.perks.dmgMult;
      if (isHeadshot) dmg = Math.round(dmg * weaponData.headshotMult);

      if (shooter.heroId === 'zeus' && hitTarget.shield > 0) {
        dmg = Math.round(dmg * 1.15);
      }
      if (shooter.heroId === 'hela' && hitTarget.hp < 60) {
        dmg = Math.round(dmg * 1.15);
      }
      if (shooter.ultBuffTimer && shooter.ultBuffTimer > 0 && shooter.heroId === 'loki') {
        dmg = Math.round(dmg * 1.35);
      }
      if (shooter.ampedWallBonus) {
        dmg = Math.round(dmg * 1.2);
      }
      if (shooter.heroId === 'thor' && shooter.thunderCharge >= 100) {
        shooter.thunderCharge = 0;
        dmg += 14;
        this.spawnLightningBolt(startTracer, hitPoint, 0x38bdf8, 0.35);
      }

      // body hit feedback: shield shards in tier colour, flesh = red mist
      const shielded = hitTarget.knocked ? hitTarget.knockdownShieldHp > 0 && (hitTarget.isPlayer ? hitTarget.isADS : true) : hitTarget.shield > 0;
      const tierHex = (window.GODWARS_DATA.EVO_TIERS[hitTarget.shieldTier] || { hex: 0x38bdf8 }).hex;
      // (skip on the local player: the camera sits inside that body)
      if (hitTarget !== this.game.player) this.spawnBodyHit(hitPoint, dir, shielded ? 'shield' : 'flesh', tierHex, isHeadshot);

      this.applyDamage(
        shooter,
        hitTarget,
        Math.round(dmg),
        isMythicGold ? `MYTHIC ${weaponData.divineName}` : weaponData.divineName,
        isHeadshot,
        hitPoint
      );
    } else if (bestDist < weaponData.range - 1) {
      // World impact: per-surface sparks/dust/chips + pooled bullet-hole decal
      const n = _gwV1;
      let surface = 'stone';
      if (hitCollider) {
        const c = hitCollider, e = 0.02;
        const dists = [hitPoint.x - c.minX, c.maxX - hitPoint.x, hitPoint.y - c.minY, c.maxY - hitPoint.y, hitPoint.z - c.minZ, c.maxZ - hitPoint.z];
        let best = 0;
        for (let k = 1; k < 6; k++) if (Math.abs(dists[k]) < Math.abs(dists[best])) best = k;
        n.set(0, 0, 0);
        if (best === 0) n.x = -1; else if (best === 1) n.x = 1; else if (best === 2) n.y = -1; else if (best === 3) n.y = 1; else if (best === 4) n.z = -1; else n.z = 1;
        if (Math.abs(dists[best]) > e * 10) n.copy(dir).negate(); // inside-box edge case
        if (c.isDoor) surface = 'metal';
      } else if (hitGround) {
        surface = 'ground';
        n.set(0, 1, 0);
      } else {
        n.copy(dir).negate();
      }
      // decals only on static geometry (doors move)
      this.spawnBulletImpact(hitPoint, n, surface, isMythicGold, !(hitCollider && hitCollider.isDoor));
    }
  }


  hasLivingSquadmate(victim) {
    const all = [...this.game.bots];
    if (this.game.player) all.push(this.game.player);
    for (const t of all) {
      if (t !== victim && t.alive && !t.knocked && t.teamId === victim.teamId) {
        return true;
      }
    }
    return false;
  }

  completeRevive(reviver, target) {
    if (!target || !target.alive || !target.knocked) return;
    target.knocked = false;
    target.reviveProgress = 0;
    target.hp = Math.max(45, Math.round(target.maxHp * 0.45));
    if (target.mesh) {
      target.mesh.scale.y = 1.0;
      if (target.mesh.userData.kdShield) {
        target.mesh.userData.kdShield.visible = false;
      }
    }
    window.SFX.playEvoUpgrade();
    if (target.isPlayer || (reviver && reviver.isPlayer)) {
      this.game.showBanner(`REVIVE COMPLETE: ${target.name} BACK IN THE FIGHT!`, '#10b981');
    }
  }

  applyDamage(attacker, victim, amount, sourceName, isHeadshot = false, hitWorldPos = null, bypassKnockShield = false) {
    if (!victim || !victim.alive) return;
    if (attacker && !this.isEnemy(attacker, victim)) return;
    // Online arena: damage to a human is reported to the server; the victim's client applies it.
    // We still run the local path below for hitmarkers / damage numbers, but never kill them locally.
    if (victim.isRemote && window.NET && this.game.isOnline && attacker && attacker.isPlayer) {
      window.NET.reportHit(victim, Math.round(amount), isHeadshot, sourceName);
    }

    let remaining = Math.round(amount);
    let hitShield = false;
    let shieldBroken = false;

    if (victim.knocked) {
      const shieldActive = victim.isPlayer ? victim.isADS : (victim.knockdownShieldHp > 0);
      if (!bypassKnockShield && shieldActive && victim.knockdownShieldHp > 0) {
        hitShield = true;
        if (victim.knockdownShieldHp >= remaining) {
          victim.knockdownShieldHp -= remaining;
          remaining = 0;
        } else {
          remaining -= victim.knockdownShieldHp;
          victim.knockdownShieldHp = 0;
          shieldBroken = true;
          if (victim.mesh && victim.mesh.userData.kdShield) {
            victim.mesh.userData.kdShield.visible = false;
          }
        }
      }
      if (remaining > 0) {
        victim.knockedHp = Math.max(0, (victim.knockedHp || 75) - remaining);
      }
      if (attacker && attacker.isPlayer) {
        window.SFX.playHitmarker(false, hitShield, shieldBroken);
        const worldPt = hitWorldPos || victim.position.clone().add(new THREE.Vector3(0, 0.8, 0));
        this.game.spawnFloatingDamageNumber(worldPt, amount, false, hitShield, shieldBroken, victim.shieldTier, victim);
      }
      if (victim.knockedHp <= 0) {
        this.handleElimination(attacker, victim, sourceName);
      }
      return;
    }

    if (victim.shield > 0) {
      hitShield = true;
      if (victim.shield >= remaining) {
        victim.shield -= remaining;
        remaining = 0;
        if (victim.shield === 0) shieldBroken = true;
      } else {
        remaining -= victim.shield;
        victim.shield = 0;
        shieldBroken = true;
      }
    }

    if (remaining > 0) {
      victim.hp = Math.max(0, victim.hp - remaining);
    }

    if (attacker && attacker !== victim) {
      attacker.damageDealt = (attacker.damageDealt || 0) + amount;
      const ultBonus = 1 + ((attacker.perks && attacker.perks.ultChargeBonus) || 0);
      attacker.ultCharge = Math.min(100, (attacker.ultCharge || 0) + amount * 0.25 * ultBonus);
      victim.lastDamageSource = {
        attackerName: attacker.name || 'ASGARD CONTENDER',
        weaponName: sourceName || 'DIVINE WEAPON',
        amount
      };

      const tiers = window.GODWARS_DATA.EVO_TIERS;
      for (let tLvl = 5; tLvl >= 2; tLvl--) {
        const prevThreshold = tiers[tLvl - 1] ? tiers[tLvl - 1].nextThreshold : 9999;
        if (attacker.damageDealt >= prevThreshold && attacker.shieldTier < tLvl) {
          attacker.shieldTier = tLvl;
          attacker.maxShield = tiers[tLvl].maxShield;
          attacker.shield = Math.min(attacker.maxShield, attacker.shield + 25);
          if (attacker.isPlayer) {
            window.SFX.playEvoUpgrade();
            this.game.showBanner(`RUNE ARMOR UPGRADED: ${tiers[tLvl].name} (${attacker.maxShield})`, tiers[tLvl].color);
            if (tLvl === 2 || tLvl === 3) {
              this.game.offerLegendPerkUpgrade(tLvl);
            }
          }
          break;
        }
      }
    }

    // Enemy 3D Hit-Flinch Stagger & Knockback Impulse (Makes shooting bots feel visceral!)
    if (!victim.isPlayer && victim.alive) {
      victim.hitFlinchTimer = 0.22;
      if (attacker && victim.position) {
        const kb = victim.position.clone().sub(attacker.position).setY(0);
        if (kb.lengthSq() > 0.01) {
          kb.normalize();
          const push = (isHeadshot || shieldBroken) ? 0.45 : 0.16;
          victim.position.x += kb.x * push;
          victim.position.z += kb.z * push;
        }
      }
    }

    if (shieldBroken) {
      const tierHex = (window.GODWARS_DATA.EVO_TIERS[victim.shieldTier] || { hex: 0x38bdf8 }).hex;
      if (victim !== this.game.player) this.spawnShieldBreak(victim.position.clone().add(new THREE.Vector3(0, 1.25, 0)), tierHex);
      if (attacker && attacker.isPlayer) {
        this.spawnEnergyOrbs(victim.position, tierHex, 3);
      }
      if (victim.isPlayer && this.game.triggerShieldBreakFlash) {
        this.game.triggerShieldBreakFlash();
      }
    }

    if (attacker && attacker.isPlayer) {
      if (this.game.registerComboHit) {
        this.game.registerComboHit(amount, isHeadshot, shieldBroken);
      }
      window.SFX.playHitmarker(isHeadshot, hitShield, shieldBroken);
      const worldPt = hitWorldPos || victim.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      this.game.spawnFloatingDamageNumber(worldPt, amount, isHeadshot, hitShield, shieldBroken, victim.shieldTier, victim);
    }

    if (victim.isPlayer && attacker && attacker !== victim) {
      this.game.triggerDamageIndicator(attacker.position);
    }

    if (victim.isRemote) { victim.hp = Math.max(1, victim.hp); return; } // server/victim decides deaths

    if (victim.hp <= 0 && victim.alive) {
      const hasTeammate = this.hasLivingSquadmate(victim);
      const hasSelfRevive = victim.shieldTier >= 4 && !victim.usedSelfRevive;
      const canEnterKnockdown = !victim.isDummy && sourceName !== 'Ragnarok Storm Ring' && (hasTeammate || hasSelfRevive || !victim.isPlayer);

      if (canEnterKnockdown && !victim.knocked) {
        victim.knocked = true;
        victim.knockedHp = 80;
        victim.knockdownShieldHp = victim.shieldTier >= 3 ? 140 : 90;
        victim.bleedoutTimer = 24.0;
        victim.hp = 1;

        if (victim.mesh) {
          victim.mesh.scale.y = 0.58;
          if (victim.mesh.userData.kdShield) {
            const tierInfo = window.GODWARS_DATA.EVO_TIERS[victim.shieldTier] || window.GODWARS_DATA.EVO_TIERS[2];
            victim.mesh.userData.kdShield.material.color.setHex(tierInfo.hex);
            victim.mesh.userData.kdShield.visible = true;
          }
        }

        if (victim.isPlayer) {
          this.game.showBanner(
            hasSelfRevive
              ? 'KNOCKED DOWN! HOLD [ADS] FOR KNOCKDOWN SHIELD • PRESS [E] TO SELF-REVIVE!'
              : 'KNOCKED DOWN! HOLD [ADS] FOR KNOCKDOWN SHIELD WHILE SQUADMATE REVIVES YOU!',
            '#fbbf24'
          );
        } else if (attacker && attacker.isPlayer) {
          window.SFX.playKillSound();
          this.game.showBanner(`KNOCKED DOWN ${victim.name} • PRESS [E] NEARBY FOR FINISHER!`, '#fbbf24');
        }
      } else {
        this.handleElimination(attacker, victim, sourceName);
      }
    }
  }

  handleElimination(killer, victim, weaponName) {
    if (this.game.isOnline) {
      if (victim.isRemote) return;
      if (victim.isPlayer && victim.alive) {
        victim.alive = false;
        victim.knocked = false;
        if (window.NET) window.NET.reportDeath(killer, weaponName);
      }
      return;
    }
    if (victim.isDummy) {
      if (killer && killer.isPlayer) {
        window.SFX.playKillSound();
        killer.kills = (killer.kills || 0) + 1;
        this.game.showEliminationPopup(victim.name, victim.heroId, killer.kills);
      }
      victim.hp = victim.maxHp;
      victim.shield = victim.maxShield;
      victim.knocked = false;
      return;
    }

    victim.alive = false;
    victim.knocked = false;
    if (victim.mesh) victim.mesh.visible = false;

    this.spawnDeathBox(victim);

    // Squad Wipe check: if all living members of victim's team are only knocked down, eliminate them too!
    const all = [...this.game.bots];
    if (this.game.player) all.push(this.game.player);
    const remainingStandingOnTeam = all.filter(t => t.alive && !t.knocked && t.teamId === victim.teamId);
    if (remainingStandingOnTeam.length === 0) {
      const knockedOnTeam = all.filter(t => t.alive && t.knocked && t.teamId === victim.teamId && !(t.shieldTier >= 4 && !t.usedSelfRevive));
      knockedOnTeam.forEach(kt => {
        kt.alive = false;
        kt.knocked = false;
        if (kt.mesh) kt.mesh.visible = false;
        this.spawnDeathBox(kt);
      });

      if (killer && killer.isPlayer && victim.teamId !== killer.teamId && this.game.gameMode === 'trios') {
        killer.damageDealt += 50;
        window.SFX.playSquadWipe();
        this.game.showBanner(`☠️ SQUAD WIPED! (+50 RUNE BONUS)`, '#fbbf24');
      }
    }

    if (killer && killer !== victim) {
      killer.kills = (killer.kills || 0) + 1;

      if (killer.heroId === 'hades') {
        killer.shield = Math.min(killer.maxShield, killer.shield + 45);
        killer.hp = Math.min(killer.maxHp, killer.hp + 30);
        if (killer.isPlayer) this.game.showBanner('SOUL SIPHON: +45 SHIELD / +30 HP', '#a855f7');
      }
      if (killer.perks && killer.perks.shieldOnKill) {
        killer.shield = Math.min(killer.maxShield, killer.shield + killer.perks.shieldOnKill);
        if (killer.isPlayer) this.game.showBanner(`PERK SIPHON: +${killer.perks.shieldOnKill} RUNE ARMOR!`, '#38bdf8');
      }

      if (killer.isPlayer) {
        window.SFX.playKillSound();
        this.spawnEnergyOrbs(victim.position, 0xfde047, 5);
        this.game.showEliminationPopup(victim.name, victim.heroId, killer.kills);
        if (this.game.registerMultiKillStreak) this.game.registerMultiKillStreak();
      }

      this.game.updateKillLeader(killer);
    }

    const killerName = killer ? killer.name : 'RAGNAROK RING';
    if (!this.game.firstBloodTriggered && !this.game.isFiringRange) {
      this.game.firstBloodTriggered = true;
      this.game.showBanner(`🩸 FIRST BLOOD: ${killerName} ELIMINATED ${victim.name}!`, '#f43f5e');
      window.SFX.announce('First blood.');
    }
    this.game.addKillFeed(killerName, victim.name, weaponName);
    this.game.checkMatchState();
  }

  spawnDeathBox(victim) {
    const boxGeo = new THREE.BoxGeometry(1.3, 0.85, 0.9);
    const tierInfo = window.GODWARS_DATA.EVO_TIERS[Math.max(2, victim.shieldTier || 2)];
    const boxMat = new THREE.MeshStandardMaterial({
      color: tierInfo.hex,
      emissive: tierInfo.hex,
      emissiveIntensity: 0.35,
      metalness: 0.85,
      roughness: 0.2
    });
    const mesh = new THREE.Mesh(boxGeo, boxMat);
    mesh.position.set(victim.position.x, victim.position.y + 0.45, victim.position.z);
    this.scene.add(mesh);

    this.game.world.supplyBins.push({
      id: 'deathbox_' + Date.now() + '_' + Math.random(),
      x: victim.position.x,
      z: victim.position.z,
      opened: false,
      isDeathBox: true,
      victimName: victim.name,
      mesh,
      lid: mesh,
      strip: mesh,
      loot: {
        weaponId: victim.weaponId || 'm4a1',
        grenadeId: 'solar_bomb',
        shieldTier: Math.max(2, victim.shieldTier || 2),
        attachmentTier: Math.min(4, Math.max(2, victim.shieldTier || 2)),
        shieldBattery: 2,
        medkit: 1
      }
    });
  }

  throwGrenade(thrower, origin, dir, grenadeId) {
    const gData = window.GODWARS_DATA.GRENADES[grenadeId] || window.GODWARS_DATA.GRENADES.solar_bomb;
    const gGroup = new THREE.Group();
    const fallback = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 1),
      new THREE.MeshBasicMaterial({ color: gData.hexColor })
    );
    gGroup.add(fallback);
    const glbMap = { solar_bomb: 'bomb_solar', apollo_flash: 'bomb_flash', yggdrasil_arc: 'bomb_arc' };
    if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
      window.ModelFactory.attachBlenderGLB(glbMap[grenadeId] || 'bomb_solar', gGroup, null, fallback);
    }
    gGroup.position.copy(origin);
    this.scene.add(gGroup);

    const vel = dir.clone().multiplyScalar(28);
    vel.y += 6.5;

    this.grenades.push({
      thrower,
      data: gData,
      mesh: gGroup,
      velocity: vel,
      fuse: gData.fuseTime,
      stuck: false
    });
  }

  detonateGrenade(g) {
    const pos = g.mesh.position.clone();
    this.scene.remove(g.mesh);

    const isFlash = g.data.id === 'apollo_flash';
    window.SFX.playExplosion(isFlash);
    this.spawnExplosionVFX(pos, g.data.radius, g.data.hexColor, isFlash ? 0.45 : 0.65);

    const targets = [...this.game.bots];
    if (this.game.player && this.game.player.alive) targets.push(this.game.player);

    for (const t of targets) {
      if (!t.alive || (g.thrower && !this.isEnemy(g.thrower, t) && t !== g.thrower)) continue;
      const dist = t.position.distanceTo(pos);
      if (dist <= g.data.radius) {
        const falloff = 1 - (dist / g.data.radius) * 0.65;
        const dmg = Math.round(g.data.damage * falloff);
        if (this.isEnemy(g.thrower, t)) {
          this.applyDamage(g.thrower, t, dmg, g.data.name, false, t.position, true);
        }

        if (isFlash && this.isEnemy(g.thrower, t)) {
          t.flashBlindTimer = 4.2 * falloff;
          if (t.isPlayer) {
            this.game.triggerFlashbangOverlay(falloff);
          }
        } else if (this.isEnemy(g.thrower, t)) {
          const push = t.position.clone().sub(pos).normalize();
          if (t.velocity) {
            t.velocity.x += push.x * 11 * falloff;
            t.velocity.y += 7 * falloff;
            t.velocity.z += push.z * 11 * falloff;
          }
        }
      }
    }
  }

  // =========================================================================
  // 6 HEROES TACTICAL (Q) & ULTIMATE (Z) ABILITIES
  // =========================================================================
  triggerHeroTactical(actor, origin, lookDir) {
    const heroId = actor.heroId;
    window.SFX.playAbility('tactical');

    if (heroId === 'loki') {
      const decoyMesh = window.ModelFactory.createHeroModel('loki');
      decoyMesh.position.copy(actor.position);
      const forwardYaw = Math.atan2(lookDir.x, lookDir.z);
      decoyMesh.rotation.y = forwardYaw;
      this.scene.add(decoyMesh);

      const moveDir = new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize();
      this.decoys.push({
        owner: actor,
        mesh: decoyMesh,
        position: actor.position.clone(),
        dir: moveDir,
        speed: 9.5,
        ttl: 6.0
      });

      actor.cloakTimer = 3.5;
      if (actor.isPlayer) this.game.showBanner('LOKI: PHANTOM DECOY & PHASE CLOAK ACTIVE', '#10b981');

    } else if (heroId === 'thor') {
      const targetPt = origin.clone().addScaledVector(lookDir, 28);
      targetPt.y = Math.max(0.5, targetPt.y);
      this.spawnLightningBolt(origin.clone().addScaledVector(lookDir, 1), targetPt, 0x38bdf8, 0.45);
      this.spawnExplosionVFX(targetPt, 8.5, 0x38bdf8, 0.45);

      const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
      targets.forEach(t => {
        if (t.position.distanceTo(targetPt) <= 11 || t.position.distanceTo(actor.position) <= 12) {
          this.spawnLightningBolt(targetPt, t.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xfbbf24, 0.45);
          this.applyDamage(actor, t, 38, 'Mjölnir Arc Bolt', false, t.position);
          t.slowTimer = 3.0;
        }
      });
      if (actor.isPlayer) this.game.showBanner('THOR: MJÖLNIR ARC BOLT UNLEASHED', '#38bdf8');

    } else if (heroId === 'hades') {
      const waveCenter = origin.clone().addScaledVector(lookDir, 10);
      waveCenter.y = actor.position.y + 1.0;
      this.spawnExplosionVFX(waveCenter, 10, 0xa855f7, 0.5);

      let totalDrain = 0;
      const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
      targets.forEach(t => {
        if (t.position.distanceTo(waveCenter) <= 11.5) {
          this.applyDamage(actor, t, 35, 'Stygian Soul Wave', false, t.position);
          totalDrain += 35;
        }
      });
      const healAmt = Math.max(25, totalDrain);
      actor.hp = Math.min(actor.maxHp, actor.hp + healAmt * 0.5);
      actor.shield = Math.min(actor.maxShield, actor.shield + healAmt * 0.5);
      if (actor.isPlayer) this.game.showBanner(`HADES: STYGIAN DRAIN (+${Math.round(healAmt)} HP/SHIELD)`, '#a855f7');

    } else if (heroId === 'zeus') {
      const wallPos = actor.position.clone().addScaledVector(new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize(), 3.2);
      const wallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 2.6, 0.25),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.42 })
      );
      wallMesh.position.set(wallPos.x, actor.position.y + 1.3, wallPos.z);
      wallMesh.rotation.y = Math.atan2(lookDir.x, lookDir.z);
      this.scene.add(wallMesh);

      actor.ampedWallBonus = true;
      setTimeout(() => { actor.ampedWallBonus = false; }, 10000);
      this.activeZones.push({ type: 'aegis_wall', owner: actor, mesh: wallMesh, ttl: 10.0 });
      if (actor.isPlayer) this.game.showBanner('ZEUS: AEGIS THUNDER WALL DEPLOYED (+20% AMPED SHOTS)', '#facc15');

    } else if (heroId === 'hela') {
      [-0.12, 0, 0.12].forEach(angleOffset => {
        const dir = lookDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset).normalize();
        const endPt = origin.clone().addScaledVector(dir, 36);
        this.spawnTracer(origin, endPt, 0x14b8a6, 3);

        const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
        targets.forEach(t => {
          const toTarget = t.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin);
          const proj = toTarget.dot(dir);
          if (proj > 0 && proj < 36) {
            const perpDist = toTarget.clone().sub(dir.clone().multiplyScalar(proj)).length();
            if (perpDist < 1.85) {
              this.applyDamage(actor, t, 32, 'Hela Necrosword Volley', false, t.position);
            }
          }
        });
      });
      if (actor.isPlayer) this.game.showBanner('HELA: NECROSWORD VOLLEY FIRED', '#14b8a6');

    } else if (heroId === 'valkyrie') {
      const aimCenter = origin.clone().addScaledVector(lookDir, 22);
      aimCenter.y = this.game.world.getGroundHeight(aimCenter.x, aimCenter.z, 0);

      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (!this.game.matchActive) return;
          const impact = aimCenter.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            0.3,
            (Math.random() - 0.5) * 8
          ));
          const skyStart = origin.clone().add(new THREE.Vector3(0, 8, 0));
          this.spawnTracer(skyStart, impact, 0xf97316, 2);
          this.spawnExplosionVFX(impact, 5.5, 0xf97316, 0.4);
          window.SFX.playExplosion(false);

          const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
          targets.forEach(t => {
            if (t.position.distanceTo(impact) <= 6.5) {
              this.applyDamage(actor, t, 22, 'Celestial Spear Swarm', false, t.position);
              t.slowTimer = 2.5;
            }
          });
        }, i * 110);
      }
      if (actor.isPlayer) this.game.showBanner('VALKYRIE: CELESTIAL SPEAR SWARM LAUNCHED', '#f97316');
    }
  }

  triggerHeroUltimate(actor, origin, lookDir) {
    const heroId = actor.heroId;
    window.SFX.playAbility('ultimate');

    if (heroId === 'loki') {
      actor.ultBuffTimer = 10.0;
      actor.cloakTimer = 4.0;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const decoyMesh = window.ModelFactory.createHeroModel('loki');
        decoyMesh.position.copy(actor.position);
        decoyMesh.rotation.y = angle;
        this.scene.add(decoyMesh);
        this.decoys.push({
          owner: actor,
          mesh: decoyMesh,
          position: actor.position.clone(),
          dir,
          speed: 8.8,
          ttl: 8.5
        });
      }
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: RAGNAROK MIRROR REALM (+35% CRIT DMG)', '#10b981');

    } else if (heroId === 'thor') {
      if (actor.velocity) {
        actor.velocity.y = 21;
        actor.velocity.x += lookDir.x * 16;
        actor.velocity.z += lookDir.z * 16;
      }
      setTimeout(() => {
        if (!actor.alive || !this.game.matchActive) return;
        const slamPos = actor.position.clone();
        const skyTop = slamPos.clone().add(new THREE.Vector3(0, 45, 0));
        this.spawnLightningBolt(skyTop, slamPos, 0x38bdf8, 0.7);
        this.spawnExplosionVFX(slamPos, 16, 0x38bdf8, 0.75);
        window.SFX.playExplosion(false);

        const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
        targets.forEach(t => {
          const d = t.position.distanceTo(slamPos);
          if (d <= 16) {
            const dmg = Math.round(90 * (1 - d / 22));
            this.applyDamage(actor, t, dmg, 'Bifrost Sky Slam', false, t.position);
          }
        });
      }, 850);
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: BIFROST SKY SLAM!', '#38bdf8');

    } else if (heroId === 'hades') {
      const domeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(14, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide
        })
      );
      domeMesh.position.copy(actor.position);
      this.scene.add(domeMesh);

      this.activeZones.push({
        type: 'tartarus_dome',
        owner: actor,
        position: actor.position.clone(),
        radius: 14,
        mesh: domeMesh,
        ttl: 11.0,
        tickTimer: 0
      });
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: DOMAIN OF TARTARUS DEPLOYED', '#a855f7');

    } else if (heroId === 'zeus') {
      const targetCenter = origin.clone().addScaledVector(lookDir, 24);
      targetCenter.y = 0;

      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (!this.game.matchActive) return;
          const strikePos = targetCenter.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 16,
            0,
            (Math.random() - 0.5) * 16
          ));
          const skyPos = strikePos.clone().add(new THREE.Vector3(0, 80, 0));
          this.spawnLightningBolt(skyPos, strikePos, 0xfacc15, 0.55);
          this.spawnExplosionVFX(strikePos, 9, 0xfacc15, 0.55);
          window.SFX.playExplosion(false);

          const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
          targets.forEach(t => {
            if (t.position.distanceTo(strikePos) <= 9.5) {
              this.applyDamage(actor, t, 45, 'Wrath of Olympus', false, t.position);
            }
          });
        }, i * 320);
      }
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: WRATH OF OLYMPUS ORBITAL BARRAGE!', '#facc15');

    } else if (heroId === 'hela') {
      actor.ultBuffTimer = 10.0;
      actor.shield = Math.min(actor.maxShield + 50, actor.shield + 75);
      actor.hp = Math.min(actor.maxHp, actor.hp + 40);
      this.spawnExplosionVFX(actor.position, 7, 0x14b8a6, 0.5);
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: EMPRESS OF HELHEIM (INFINITE AMMO & DEATH ARMOR)', '#14b8a6');

    } else if (heroId === 'valkyrie') {
      window.SFX.playJumpPad();
      actor.position.y += 3.0;
      if (actor.velocity) {
        actor.velocity.y = 42;
      }
      actor.skydiving = true;
      actor.ultBuffTimer = 12.0;
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: SKYWARD ASCENSION & VALHALLA AERIAL SCAN!', '#f97316');
    }
  }


  update(dt) {
    // ---- pooled VFX ----
    this.fxTracers.update(dt, this.game.renderer);
    this.fxAdd.update(dt, this.game.renderer);
    this.fxSoft.update(dt, this.game.renderer);
    this.fxDecals.update(dt);
    for (const ring of this.fxRings) {
      if (!ring.mesh.visible) continue;
      ring.age += dt;
      const t = ring.age / ring.life;
      if (t >= 1) { ring.mesh.visible = false; continue; }
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      ring.mesh.scale.setScalar(Math.max(0.1, ring.r * e));
      ring.mesh.material.opacity = 0.85 * (1 - t) * (1 - t);
    }
    if (this.fxLight && this.fxLight.intensity > 0) {
      this._lightAge += dt;
      const t = this._lightAge / this._lightLife;
      this.fxLight.intensity = t >= 1 ? 0 : this._lightPeak * (1 - t) * (1 - t);
    }

    for (const s of this._shellPool) {
      if (!s.active) continue;
      s.age += dt;
      s.velocity.y -= 18 * dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      s.mesh.rotation.x += 14 * dt;
      s.mesh.rotation.z += 11 * dt;
      if (s.age >= s.maxAge) { s.active = false; s.mesh.visible = false; }
    }

    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;

      if (g.stuck && g.stuckTarget && g.stuckTarget.alive) {
        g.mesh.position.set(g.stuckTarget.position.x, g.stuckTarget.position.y + 1.25, g.stuckTarget.position.z);
        g.mesh.rotation.y += 14 * dt;
      } else if (!g.stuck) {
        g.velocity.y -= 22 * dt;
        g.mesh.position.addScaledVector(g.velocity, dt);
        g.mesh.rotation.x += 8 * dt;
        g.mesh.rotation.y += 6 * dt;

        // BATCH 5: Authentic Apex Arc Star Stick Mechanic!
        if (g.data.id === 'yggdrasil_arc') {
          const targets = [...this.game.bots];
          if (this.game.player && this.game.player.alive) targets.push(this.game.player);
          for (const t of targets) {
            if (!t.alive || !this.isEnemy(g.thrower, t)) continue;
            const tCenter = new THREE.Vector3(t.position.x, t.position.y + 1.2, t.position.z);
            if (g.mesh.position.distanceTo(tCenter) <= 1.45) {
              g.stuck = true;
              g.stuckTarget = t;
              window.SFX.playArcStarStick();
              this.applyDamage(g.thrower, t, 30, 'Yggdrasil Arc Rune (STUCK)', false, tCenter);
              if (g.thrower && g.thrower.isPlayer) {
                this.game.showBanner(`⚡ ARC RUNE STUCK ON ${t.name}! (+30)`, '#38bdf8');
              }
              break;
            }
          }
        }

        const groundY = this.game.world.getGroundHeight(g.mesh.position.x, g.mesh.position.z, g.mesh.position.y);
        if (!g.stuck && g.mesh.position.y <= groundY + 0.22) {
          g.mesh.position.y = groundY + 0.22;
          if (g.data.id === 'yggdrasil_arc') {
            g.stuck = true;
          } else {
            g.velocity.y = Math.abs(g.velocity.y) * 0.42;
            g.velocity.x *= 0.65;
            g.velocity.z *= 0.65;
          }
        }
      }

      if (g.fuse <= 0) {
        this.detonateGrenade(g);
        this.grenades.splice(i, 1);
      }
    }

    for (let i = this.vfxList.length - 1; i >= 0; i--) {
      const v = this.vfxList[i];
      v.age += dt;
      const t = v.age / v.maxAge;
      if (v.type === 'bolt') {
        v.mesh.material.opacity = Math.max(0, 1 - t);
        if (v.age >= v.maxAge) {
          this.scene.remove(v.mesh);
          v.mesh.geometry.dispose(); v.mesh.material.dispose();
          this.vfxList.splice(i, 1);
        }
      } else if (v.type === 'holospray') {
        v.mesh.rotation.y += 1.4 * dt;
        v.mesh.position.y = v.baseY + Math.sin(v.age * 3.0) * 0.14;
        if (v.age >= v.maxAge) {
          this.scene.remove(v.mesh);
          this.vfxList.splice(i, 1);
        }
      } else if (v.type === 'slash') {
        v.mesh.scale.setScalar(0.85 + t * 0.65);
        v.mesh.children.forEach(c => { if (c.material) c.material.opacity = Math.max(0, 0.88 * (1 - t)); });
        if (v.age >= v.maxAge) {
          this.scene.remove(v.mesh);
          v.mesh.children.forEach(c => c.material && c.material.dispose());
          this.vfxList.splice(i, 1);
        }
      } else if (v.age >= v.maxAge) {
        if (v.mesh) this.scene.remove(v.mesh);
        this.vfxList.splice(i, 1);
      }
    }

    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.ttl -= dt;
      d.position.addScaledVector(d.dir, d.speed * dt);
      const col = this.game.world.resolveHorizontalCollision(d.position.x, d.position.z, d.position.y, 0.45);
      d.position.x = col.x;
      d.position.z = col.z;
      d.position.y = this.game.world.getGroundHeight(d.position.x, d.position.z, d.position.y);
      d.mesh.position.copy(d.position);

      const t = performance.now() * 0.012;
      if (d.mesh.userData.leftLeg) {
        d.mesh.userData.leftLeg.rotation.x = Math.sin(t) * 0.7;
        d.mesh.userData.rightLeg.rotation.x = -Math.sin(t) * 0.7;
      }

      if (d.ttl <= 0) {
        this.scene.remove(d.mesh);
        this.decoys.splice(i, 1);
      }
    }

    for (let i = this.activeZones.length - 1; i >= 0; i--) {
      const z = this.activeZones[i];
      z.ttl -= dt;
      if (z.type === 'tartarus_dome') {
        z.tickTimer += dt;
        if (z.tickTimer >= 0.5) {
          z.tickTimer = 0;
          if (z.owner && z.owner.alive && z.owner.position.distanceTo(z.position) <= z.radius) {
            z.owner.shield = Math.min(z.owner.maxShield, z.owner.shield + 8);
          }
          const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(z.owner, t));
          targets.forEach(t => {
            if (t.position.distanceTo(z.position) <= z.radius) {
              this.applyDamage(z.owner, t, 7, 'Domain of Tartarus', false, t.position);
            }
          });
        }
      }

      if (z.ttl <= 0) {
        this.scene.remove(z.mesh);
        this.activeZones.splice(i, 1);
      }
    }

    // Update Euphoria-Style Homing Divine Energy Orbs (Pop out, then magnet-fly into Player!)
    const p = this.game.player;
    for (let i = this.energyOrbs.length - 1; i >= 0; i--) {
      const o = this.energyOrbs[i];
      o.age += dt;
      o.mesh.rotation.y += dt * 7;
      o.mesh.rotation.x += dt * 5;
      if (o.age < 0.38 || !p || !p.alive) {
        o.vel.y -= 15 * dt;
        o.mesh.position.addScaledVector(o.vel, dt);
      } else {
        const target = p.position.clone().add(new THREE.Vector3(0, 1.15, 0));
        const toP = target.sub(o.mesh.position);
        const dist = toP.length();
        if (dist < 1.15 || o.age > 4.0) {
          if (dist < 1.15 && p.alive) {
            p.shield = Math.min(p.maxShield, p.shield + 10);
            p.ultCharge = Math.min(100, (p.ultCharge || 0) + 7);
            window.SFX.playArmorSwap();
          }
          this.scene.remove(o.mesh);
          this.energyOrbs.splice(i, 1);
          continue;
        }
        toP.normalize();
        o.mesh.position.addScaledVector(toP, Math.min(dist, (15 + o.age * 22) * dt));
        // shrink as it homes in so it never fills the lens on the way into the player
        o.mesh.scale.setScalar(Math.max(0.12, Math.min(0.5, (dist - 1.0) / 5)));
      }
    }

  }
}

window.CombatManager = CombatManager;
