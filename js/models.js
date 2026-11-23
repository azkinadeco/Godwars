/**
 * GOD WARS: ASGARD ROYALE (APEX LEGENDS EDITION - 10-BATCH FULL UPGRADE)
 * High-Detail Procedural 3D Models & PBR Rune Canvas Textures:
 * - 6 Mythological Heroes with 3D Knockdown Shield domes & Heirloom Melee Weapons
 * - 6 Divine Custom Firearms (P90, Kriss, M4A1, Uzi, AK47, Magnum) with Rune Damascus Texture,
 *   Ammo Digital Counter, Holographic Reticle, Shell Ejection Port & Mythic Gold Glow
 * - Odin Care Package Drop Pod (Apex Triangular Pod + Sky Beacon)
 * - Golden Viking Bifrost Dropship
 */

window.ModelFactory = {
  _texCache: {},
  _glbCache: {},
  _glbLoading: {},
  _loader: null,

  initGLBPreload() {
    if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return;
    if (!this._loader) this._loader = new THREE.GLTFLoader();
    // On-demand progressive loading: prevents 34 simultaneous HTTP requests & RAM spikes on iPhone Safari!
  },

  _loadSingleGLB(assetName) {
    if (!this._loader) this.initGLBPreload();
    if (!this._loader || this._glbCache[assetName] || this._glbLoading[assetName]) return;
    this._glbLoading[assetName] = [];
    this._loader.load(
      `assets/models/${assetName}.glb?v=20261123c`,
      (gltf) => {
        this._glbCache[assetName] = { scene: gltf.scene, animations: gltf.animations || [] };
        const callbacks = this._glbLoading[assetName] || [];
        delete this._glbLoading[assetName];
        callbacks.forEach(cb => cb(this._glbCache[assetName]));
      },
      undefined,
      () => {
        delete this._glbLoading[assetName];
      }
    );
  },

  attachBlenderGLB(assetName, targetGroup, onLoadedTransform = null, fallbackToHide = null) {
    if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return false;
    this.initGLBPreload();
    if (!this._glbCache[assetName] && !this._glbLoading[assetName]) {
      this._loadSingleGLB(assetName);
    }

    const applyClone = (cached) => {
      const clonedScene = cached.scene.clone(true);
      if (onLoadedTransform) onLoadedTransform(clonedScene);
      if (fallbackToHide) {
        // Flag them so per-frame visibility toggles (holster, etc.) never resurrect the placeholder.
        const hide = m => { if (m) { m.visible = false; m.userData.gwReplacedByGLB = true; } };
        if (Array.isArray(fallbackToHide)) fallbackToHide.forEach(hide);
        else hide(fallbackToHide);
      }
      targetGroup.add(clonedScene);

      // P0-1 FIXED: Attach real THREE.AnimationMixer for Skeletal-Rigged Blender GLB Heroes!
      if (cached.animations && cached.animations.length > 0 && typeof THREE.AnimationMixer === 'function') {
        const mixer = new THREE.AnimationMixer(clonedScene);
        const actions = {};
        cached.animations.forEach(clip => {
          actions[clip.name] = mixer.clipAction(clip);
        });
        targetGroup.userData.mixer = mixer;
        targetGroup.userData.actions = actions;
        targetGroup.userData.currentAnim = null;
        targetGroup.userData.playAnim = (animName) => {
          const next = actions[animName] || actions.Idle || Object.values(actions)[0];
          if (!next || targetGroup.userData.currentAnim === next) return;
          if (targetGroup.userData.currentAnim) {
            targetGroup.userData.currentAnim.fadeOut(0.16);
          }
          next.reset().fadeIn(0.16).play();
          targetGroup.userData.currentAnim = next;
        };
        targetGroup.userData.playAnim('Idle');
      }
    };

    if (this._glbCache[assetName]) {
      applyClone(this._glbCache[assetName]);
      return true;
    }
    if (this._glbLoading[assetName]) {
      this._glbLoading[assetName].push(applyClone);
      return false;
    }
    return false;
  },

  getRuneTexture(hexColor = '#fbbf24', bgHex = '#111827') {
    const key = `${hexColor}_${bgHex}`;
    if (this._texCache[key]) return this._texCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, 256, 256);

    // Metallic brushed Damascus lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    for (let y = 0; y < 256; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y + (y % 16 === 0 ? 4 : -4));
      ctx.stroke();
    }

    // Glowing Norse / Olympian Runic Circuitry
    ctx.strokeStyle = hexColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = hexColor;
    ctx.shadowBlur = 8;

    // Border geometric lines
    ctx.strokeRect(12, 12, 232, 232);

    // Runic glyphs
    const runes = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᛏ', 'ᛉ', '⚡', '✦'];
    ctx.fillStyle = hexColor;
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 6; i++) {
      ctx.fillText(runes[i], 36 + i * 36, 64);
      ctx.fillText(runes[i + 6], 36 + i * 36, 198);
    }

    // Center diamond circuit
    ctx.beginPath();
    ctx.moveTo(20, 128);
    ctx.lineTo(95, 128);
    ctx.lineTo(128, 96);
    ctx.lineTo(161, 128);
    ctx.lineTo(236, 128);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this._texCache[key] = tex;
    return tex;
  },

  // =========================================================================
  // EUPHORIA-INSPIRED 4-CHANNEL FBM DETAIL TEXTURE & PAINTED PBR SURFACES
  // Generated in memory at load time (zero network downloads, high-res detail!)
  // =========================================================================
  getDetailTexture() {
    if (this._texCache._euphoriaDetail) return this._texCache._euphoriaDetail;
    const S = 128;
    const data = new Uint8Array(S * S * 4);
    const hash = (x, y, seed) => {
      const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.12) * 43758.5453;
      return n - Math.floor(n);
    };
    const smoothNoise = (x, y, per, seed) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const fx = x - xi, fy = y - yi;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const m = (n) => ((n % per) + per) % per;
      const a = hash(m(xi), m(yi), seed), b = hash(m(xi + 1), m(yi), seed);
      const c = hash(m(xi), m(yi + 1), seed), d = hash(m(xi + 1), m(yi + 1), seed);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x, y, base, oct, seed) => {
      let val = 0, amp = 0.5, freq = base / S, tot = 0;
      for (let o = 0; o < oct; o++) {
        val += smoothNoise(x * freq, y * freq, base << o, seed + o * 17) * amp;
        tot += amp;
        amp *= 0.5;
        freq *= 2;
      }
      return val / tot;
    };
    const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const g = fbm(x, y, 16, 3, 11);
        const s = fbm(x, y, 8, 3, 23);
        const r = fbm(x, y, 8, 4, 37);
        const w = fbm(x, y, 12, 3, 53);
        data[i]     = clampByte((g - 0.5) * 2.2 + 0.52); // R: grass micro-grain
        data[i + 1] = clampByte((s - 0.5) * 2.1 + 0.50); // G: cloud & soil FBM
        data[i + 2] = clampByte((r - 0.5) * 2.3 + 0.52); // B: rock & cliff strata
        data[i + 3] = clampByte((w - 0.5) * 2.0 + 0.50); // A: marble & water ripple
      }
    }
    const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    // Mipmaps are essential: without them the bump derivatives alias at distance and blow surfaces out to white.
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this._texCache._euphoriaDetail = tex;
    return tex;
  },

  getSurfaceTexture(type = 'marble_wall', repeatX = 4, repeatY = 4) {
    const key = `surf_${type}_${repeatX}_${repeatY}`;
    if (this._texCache[key]) return this._texCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Shared helpers for the procedural PBR-ish surfaces (seeded so every session looks identical).
    let seed = type.length * 7919 + 17;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const speckle = (count, alpha, light) => {
      for (let i = 0; i < count; i++) {
        const v = light ? 255 : 0;
        ctx.fillStyle = `rgba(${v},${v},${v},${(rnd() * alpha).toFixed(3)})`;
        const sz = 1 + rnd() * 2.2;
        ctx.fillRect(rnd() * canvas.width, rnd() * canvas.height, sz, sz);
      }
    };
    const grime = (alpha) => {
      for (let i = 0; i < 18; i++) {
        const x = rnd() * canvas.width, y = rnd() * canvas.height, r = 30 + rnd() * 90;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(60,50,38,${alpha})`); g.addColorStop(1, 'rgba(60,50,38,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    };
    const crack = (n) => {
      ctx.strokeStyle = 'rgba(40,34,28,0.45)'; ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        let x = rnd() * canvas.width, y = rnd() * canvas.height;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 26; y += (rnd() - 0.5) * 26; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    };

    if (['marble_wall', 'marble_floor', 'asgard_stone', 'metal_panel', 'basalt', 'rock'].includes(type)) {
      canvas.width = 512; canvas.height = 512;
    }

    if (type === 'marble_wall') {
      // Weathered limestone ashlar: staggered courses, per-block tone, recessed mortar, rain streaks.
      ctx.fillStyle = '#5d564c'; // mortar
      ctx.fillRect(0, 0, 512, 512);
      const rows = 8, rh = 512 / rows;
      for (let r = 0; r < rows; r++) {
        const cols = 3 + (r % 2);
        const bw = 512 / cols;
        const off = (r % 2) * bw * 0.5;
        for (let c = -1; c <= cols; c++) {
          const x = c * bw + off, y = r * rh;
          const t = 0.82 + rnd() * 0.18;
          const base = [222 * t, 210 * t, 188 * t].map(v => v | 0);
          ctx.fillStyle = `rgb(${base})`;
          ctx.fillRect(x + 3, y + 3, bw - 6, rh - 6);
          // top bevel highlight + bottom AO inside each block
          ctx.fillStyle = 'rgba(255,250,235,0.22)'; ctx.fillRect(x + 3, y + 3, bw - 6, 3);
          ctx.fillStyle = 'rgba(40,32,24,0.22)'; ctx.fillRect(x + 3, y + rh - 7, bw - 6, 4);
        }
      }
      grime(0.16);
      // vertical rain streaks
      for (let i = 0; i < 40; i++) {
        const x = rnd() * 512, len = 40 + rnd() * 160, y = rnd() * 300;
        const g = ctx.createLinearGradient(x, y, x, y + len);
        g.addColorStop(0, 'rgba(70,60,48,0.18)'); g.addColorStop(1, 'rgba(70,60,48,0)');
        ctx.fillStyle = g; ctx.fillRect(x, y, 2 + rnd() * 4, len);
      }
      crack(10);
      speckle(5000, 0.12, false);
      speckle(2500, 0.10, true);
      // single gilded frieze band (kept from the original Asgard look, subtler)
      ctx.fillStyle = 'rgba(196,150,60,0.85)';
      ctx.fillRect(0, 0, 512, 7);
    } else if (type === 'marble_floor') {
      // Large worn paving flags with irregular tones, dark grout, dirt in the joints and scuffs.
      ctx.fillStyle = '#4a443b';
      ctx.fillRect(0, 0, 512, 512);
      const n = 4, sz = 512 / n;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const t = 0.78 + rnd() * 0.22;
          const warm = rnd() * 14;
          ctx.fillStyle = `rgb(${(200 * t + warm) | 0},${(192 * t + warm * 0.6) | 0},${(176 * t) | 0})`;
          ctx.fillRect(c * sz + 3, r * sz + 3, sz - 6, sz - 6);
          // edge darkening toward the grout
          const g = ctx.createLinearGradient(c * sz, r * sz, c * sz, r * sz + sz);
          g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(30,24,18,0.18)');
          ctx.fillStyle = g; ctx.fillRect(c * sz + 3, r * sz + 3, sz - 6, sz - 6);
        }
      }
      grime(0.22);
      crack(14);
      speckle(7000, 0.14, false);
      speckle(3000, 0.08, true);
    } else if (type === 'asgard_stone') {
      // Rough quarried cliff stone: irregular blocks, cool-grey with moss creeping in the joints.
      ctx.fillStyle = '#3a3a36';
      ctx.fillRect(0, 0, 512, 512);
      for (let r = 0; r < 10; r++) {
        let x = -rnd() * 40;
        const h = 51;
        while (x < 512) {
          const w = 50 + rnd() * 70;
          const t = 0.7 + rnd() * 0.3;
          ctx.fillStyle = `rgb(${(150 * t) | 0},${(146 * t) | 0},${(136 * t) | 0})`;
          ctx.beginPath();
          ctx.moveTo(x + 3 + rnd() * 4, r * h + 3 + rnd() * 3);
          ctx.lineTo(x + w - 3 - rnd() * 4, r * h + 2 + rnd() * 3);
          ctx.lineTo(x + w - 2 - rnd() * 4, r * h + h - 3 - rnd() * 3);
          ctx.lineTo(x + 2 + rnd() * 4, r * h + h - 2 - rnd() * 3);
          ctx.closePath(); ctx.fill();
          x += w;
        }
      }
      for (let i = 0; i < 30; i++) {
        const x = rnd() * 512, y = rnd() * 512, rr = 10 + rnd() * 34;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, 'rgba(78,104,52,0.45)'); g.addColorStop(1, 'rgba(78,104,52,0)');
        ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      crack(16);
      speckle(8000, 0.18, false);
      speckle(4000, 0.10, true);
    } else if (type === 'metal_panel') {
      // Painted industrial plating: riveted panels, seams, chipped edges, oil grime. Matte, not a mirror.
      ctx.fillStyle = '#2a2d31';
      ctx.fillRect(0, 0, 512, 512);
      const pw = 128, ph = 256;
      for (let y = 0; y < 512; y += ph) for (let x = 0; x < 512; x += pw) {
        const t = 0.85 + rnd() * 0.15;
        ctx.fillStyle = `rgb(${(170 * t) | 0},${(174 * t) | 0},${(178 * t) | 0})`;
        ctx.fillRect(x + 2, y + 2, pw - 4, ph - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x + 2, y + 2, pw - 4, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 2, y + ph - 5, pw - 4, 3);
        ctx.fillStyle = 'rgba(30,30,32,0.75)';
        for (const [rx, ry] of [[8, 8], [pw - 12, 8], [8, ph - 12], [pw - 12, ph - 12], [8, ph / 2], [pw - 12, ph / 2]]) {
          ctx.beginPath(); ctx.arc(x + rx + 2, y + ry + 2, 2.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      // hazard stripe band, like a working foundry
      ctx.save(); ctx.beginPath(); ctx.rect(0, 470, 512, 34); ctx.clip();
      for (let i = -2; i < 20; i++) { ctx.fillStyle = i % 2 ? '#c9a227' : '#24262a'; ctx.beginPath(); ctx.moveTo(i * 32, 504); ctx.lineTo(i * 32 + 32, 470); ctx.lineTo(i * 32 + 64, 470); ctx.lineTo(i * 32 + 32, 504); ctx.fill(); }
      ctx.restore();
      grime(0.22);
      speckle(6000, 0.16, false);
      speckle(2500, 0.12, true);
    } else if (type === 'basalt') {
      // Dark volcanic basalt blocks with faint teal mineral veins (Helheim / obsidian surfaces).
      ctx.fillStyle = '#121416';
      ctx.fillRect(0, 0, 512, 512);
      for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
        const t = 0.75 + rnd() * 0.25;
        ctx.fillStyle = `rgb(${(78 * t) | 0},${(80 * t) | 0},${(86 * t) | 0})`;
        const off = (r % 2) * 64;
        ctx.fillRect(c * 128 + off - 64 + 3, r * 85 + 3, 122, 79);
        ctx.fillRect(c * 128 + off + 64 + 3, r * 85 + 3, 122, 79);
      }
      ctx.strokeStyle = 'rgba(45,212,191,0.28)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 9; i++) { let x = rnd() * 512, y = rnd() * 512; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 50; y += rnd() * 30; ctx.lineTo(x, y); } ctx.stroke(); }
      speckle(9000, 0.22, false);
      speckle(3000, 0.10, true);
    } else if (type === 'rock') {
      // Natural cliff rock: layered strata + noise blotches, no bricks (boulders used to look tiled).
      const g0 = ctx.createLinearGradient(0, 0, 0, 512);
      g0.addColorStop(0, '#8f8a80'); g0.addColorStop(1, '#77736b');
      ctx.fillStyle = g0; ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 22; i++) {
        const y = rnd() * 512, h = 6 + rnd() * 26, t = rnd();
        ctx.fillStyle = t > 0.5 ? `rgba(60,56,50,${0.10 + rnd() * 0.15})` : `rgba(200,192,176,${0.08 + rnd() * 0.12})`;
        ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 6 + (rnd() - 0.5) * 4);
        ctx.lineTo(512, y + h); ctx.lineTo(0, y + h); ctx.fill();
      }
      for (let i = 0; i < 60; i++) {
        const x = rnd() * 512, y = rnd() * 512, rr = 8 + rnd() * 40;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        const dark = rnd() > 0.45;
        g.addColorStop(0, dark ? 'rgba(45,42,38,0.30)' : 'rgba(215,208,192,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      for (let i = 0; i < 18; i++) {
        const x = rnd() * 512, y = rnd() * 512, rr = 10 + rnd() * 26;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, 'rgba(84,110,56,0.35)'); g.addColorStop(1, 'rgba(84,110,56,0)');
        ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      crack(22);
      speckle(10000, 0.18, false);
      speckle(5000, 0.12, true);
    } else if (type === 'lush_grass') {
      // Euphoria-Style Sunlit Emerald-Olive Fantasy Meadow Texture
      // Neutral light-olive mottled meadow; hue comes from terrain vertex paint (multiplied).
      // Seeded random (no modulo lattice) so tiling reads as natural turf, not diagonal stripes.
      let seed = 1337;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      ctx.fillStyle = '#b4c08a';
      ctx.fillRect(0, 0, 256, 256);
      const blot = (x, y, r, col, a) => {
        for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0));
          ctx.fillStyle = g; ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      };
      for (let i = 0; i < 26; i++) blot(rnd() * 256, rnd() * 256, 30 + rnd() * 60, i % 3 === 0 ? 'rgba(214,206,140,A)' : i % 3 === 1 ? 'rgba(120,150,90,A)' : 'rgba(160,175,110,A)', 0.55);
      const blades = ['rgba(90,120,60,0.55)', 'rgba(140,165,95,0.5)', 'rgba(205,215,150,0.45)', 'rgba(70,95,50,0.5)'];
      ctx.lineCap = 'round';
      for (let i = 0; i < 2600; i++) {
        const x = rnd() * 256, y = rnd() * 256, len = 2 + rnd() * 5, ang = -Math.PI / 2 + (rnd() - 0.5) * 1.2;
        ctx.strokeStyle = blades[(rnd() * blades.length) | 0];
        ctx.lineWidth = 0.8 + rnd() * 0.9;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
      }
    } else if (type === 'wood_gold') {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#92400e';
      for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y + 3, 256, 26);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 120, 256, 14);
    } else if (type === 'molten_lava') {
      ctx.fillStyle = '#450a0a';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 7;
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 28);
        ctx.lineTo(128, i * 28 + 18);
        ctx.lineTo(256, i * 28 - 6);
        ctx.stroke();
      }
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(24, 24, 208, 208);
    }

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 8; // keeps floors/roads crisp at grazing angles instead of smearing to grey
    this._texCache[key] = tex;
    return tex;
  },

  // P0-2: Euphoria-Style Painted Alpha-Cutout Grass Blades & Leaf Cluster Textures (NO pyramid cones!)
  getFoliageTexture(type = 'grass_blades') {
    const key = `foliage_${type}`;
    if (this._texCache[key]) return this._texCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);

    if (type === 'grass_blades') {
      const greens = ['#15803d', '#16a34a', '#22c55e', '#4ade80', '#84cc16'];
      for (let i = 0; i < 24; i++) {
        const bx = 18 + (i / 23) * 220;
        const lean = ((i % 5) - 2) * 18;
        const h = 140 + (i % 4) * 28;
        ctx.fillStyle = greens[i % greens.length];
        ctx.beginPath();
        ctx.moveTo(bx - 7, 256);
        ctx.quadraticCurveTo(bx + lean * 0.5, 256 - h * 0.55, bx + lean, 256 - h);
        ctx.quadraticCurveTo(bx + lean * 0.5 + 8, 256 - h * 0.55, bx + 7, 256);
        ctx.closePath();
        ctx.fill();
      }
      // Subtle golden flower tips on 3 blades
      ctx.fillStyle = '#fde047';
      [62, 134, 198].forEach((fx, idx) => {
        ctx.beginPath();
        ctx.arc(fx, 86 + idx * 14, 7, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (type === 'leaf_cluster') {
      const leafCols = ['#15803d', '#16a34a', '#22c55e', '#4ade80', '#eab308'];
      for (let i = 0; i < 42; i++) {
        const a = (i * 2.39996);
        const r = Math.sqrt(i / 42) * 96;
        const lx = 128 + Math.cos(a) * r;
        const ly = 128 + Math.sin(a) * r;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(a);
        ctx.fillStyle = leafCols[i % (i % 7 === 0 ? 5 : 4)];
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    this._texCache[key] = tex;
    return tex;
  },

  createHeirloomMeleeMesh(heroId = 'thor') {
    const group = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.92, roughness: 0.18 });
    const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 });
    const h = window.GODWARS_DATA.HEROES[heroId] || window.GODWARS_DATA.HEROES.thor;
    const glowMat = new THREE.MeshBasicMaterial({ color: h.hexColor });

    if (heroId === 'thor') {
      // Mjölnir Hammer
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.34, 8), goldMat);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.26), silverMat);
      head.position.set(0, 0.18, 0);
      const runeCore = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.27), glowMat);
      runeCore.position.set(0, 0.18, 0);
      group.add(handle, head, runeCore);
    } else if (heroId === 'loki') {
      // Twin Frost Dagger
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.16, 8), goldMat);
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 4), glowMat);
      blade.position.set(0, 0.22, 0);
      group.add(handle, blade);
    } else if (heroId === 'hades') {
      // Stygian Bident
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 8), goldMat);
      const prongL = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.22, 5), glowMat);
      prongL.position.set(-0.045, 0.28, 0);
      const prongR = prongL.clone();
      prongR.position.x = 0.045;
      group.add(shaft, prongL, prongR);
    } else if (heroId === 'zeus') {
      // Olympian Master Thunderbolt
      const bolt1 = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.36, 5), glowMat);
      bolt1.position.y = 0.16;
      const bolt2 = bolt1.clone();
      bolt2.rotation.x = Math.PI;
      bolt2.position.y = -0.16;
      group.add(bolt1, bolt2);
    } else if (heroId === 'hela') {
      // Obsidian Necroblade
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.48, 0.08), glowMat);
      blade.position.y = 0.15;
      group.add(blade);
    } else {
      // Valkyrie Dragonfang Spear
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.48, 8), goldMat);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.24, 6), glowMat);
      tip.position.y = 0.32;
      group.add(shaft, tip);
    }
    return group;
  },

  createWeaponModel(weaponId, heroId = 'thor', isFirstPerson = true, isMythicGold = false) {
    const group = new THREE.Group();
    const wData = window.GODWARS_DATA.WEAPONS[weaponId] || window.GODWARS_DATA.WEAPONS.m4a1;
    const hData = window.GODWARS_DATA.HEROES[heroId] || window.GODWARS_DATA.HEROES.thor;

    const runeTex = this.getRuneTexture(isMythicGold ? '#fde047' : wData.color, '#161f30');
    const darkMetal = new THREE.MeshStandardMaterial({
      color: isMythicGold ? 0xf59e0b : 0x1e2430,
      map: runeTex,
      metalness: 0.88,
      roughness: 0.22
    });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.94, roughness: 0.16 });
    const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.18 });
    const glowMat = new THREE.MeshBasicMaterial({ color: isMythicGold ? 0xfde047 : wData.hexColor });

    if (weaponId === 'p90') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.14, 0.52), darkMetal);
      group.add(body);

      const frontGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.08), goldMat);
      frontGrip.position.set(0, -0.09, -0.14);
      const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.07), darkMetal);
      rearGrip.position.set(0, -0.09, 0.06);
      group.add(frontGrip, rearGrip);

      const topMagMat = new THREE.MeshStandardMaterial({
        color: isMythicGold ? 0xfde047 : 0x38bdf8,
        emissive: isMythicGold ? 0xd97706 : 0x0284c7,
        emissiveIntensity: 0.95,
        transparent: true,
        opacity: 0.9
      });
      const topMag = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.04, 0.34), topMagMat);
      topMag.position.set(0, 0.088, -0.02);
      group.add(topMag);
      group.userData.magMesh = topMag;

      const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.052, 0.28), goldMat);
      wingL.position.set(-0.047, 0.02, -0.06);
      const wingR = wingL.clone();
      wingR.position.x = 0.047;
      group.add(wingL, wingR);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.19, 12), silverMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.32);
      group.add(barrel);

    } else if (weaponId === 'kriss') {
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.092, 0.46), darkMetal);
      upper.position.set(0, 0.03, 0);
      const superV = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.15, 0.14), darkMetal);
      superV.position.set(0, -0.06, -0.12);
      group.add(upper, superV);

      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.24, 0.056), glowMat);
      mag.position.set(0, -0.17, -0.13);
      mag.rotation.x = 0.22;
      group.add(mag);
      group.userData.magMesh = mag;

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.13, 0.06), darkMetal);
      grip.position.set(0, -0.07, 0.11);
      grip.rotation.x = -0.2;
      group.add(grip);

      const fangL = new THREE.Mesh(new THREE.ConeGeometry(0.023, 0.15, 6), glowMat);
      fangL.rotation.x = -Math.PI / 2;
      fangL.position.set(-0.036, 0.01, -0.27);
      const fangR = fangL.clone();
      fangR.position.x = 0.036;
      group.add(fangL, fangR);

      const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 12), goldMat);
      suppressor.rotation.x = Math.PI / 2;
      suppressor.position.set(0, 0.03, -0.31);
      group.add(suppressor);

    } else if (weaponId === 'm4a1') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.11, 0.36), darkMetal);
      const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.086, 0.28), goldMat);
      handguard.position.set(0, 0.01, -0.3);
      group.add(receiver, handguard);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.28, 12), silverMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.015, -0.49);
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.07, 8), goldMat);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(0, 0.015, -0.62);
      group.add(barrel, muzzle);

      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.21, 0.075), goldMat);
      mag.position.set(0, -0.14, -0.05);
      mag.rotation.x = 0.16;
      group.add(mag);
      group.userData.magMesh = mag;

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), darkMetal);
      grip.position.set(0, -0.11, 0.11);
      grip.rotation.x = -0.25;
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.22), darkMetal);
      stock.position.set(0, -0.01, 0.26);
      const runeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.083, 0.022, 0.42), glowMat);
      runeStrip.position.set(0, 0.025, -0.12);
      group.add(grip, stock, runeStrip);

    } else if (weaponId === 'uzi') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.1, 0.34), goldMat);
      body.position.set(0, 0.03, -0.04);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.16, 0.07), darkMetal);
      grip.position.set(0, -0.08, 0.01);
      group.add(body, grip);

      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.24, 0.054), glowMat);
      mag.position.set(0, -0.17, 0.01);
      group.add(mag);
      group.userData.magMesh = mag;

      const wingGeo = new THREE.BoxGeometry(0.014, 0.062, 0.22);
      const wingL = new THREE.Mesh(wingGeo, glowMat);
      wingL.position.set(-0.046, 0.05, -0.05);
      wingL.rotation.z = 0.35;
      const wingR = wingL.clone();
      wingR.position.x = 0.046;
      wingR.rotation.z = -0.35;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 10), silverMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.03, -0.26);
      group.add(wingL, wingR, barrel);

    } else if (weaponId === 'ak47') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.105, 0.38), darkMetal);
      const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.08, 0.24), glowMat);
      handguard.position.set(0, 0.005, -0.29);
      group.add(receiver, handguard);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.32, 10), darkMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.0, -0.52);
      const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), goldMat);
      gasTube.rotation.x = Math.PI / 2;
      gasTube.position.set(0, 0.04, -0.46);
      group.add(barrel, gasTube);

      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.08), glowMat);
      mag.position.set(0, -0.15, -0.08);
      mag.rotation.x = 0.36;
      group.add(mag);
      group.userData.magMesh = mag;

      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.24), darkMetal);
      stock.position.set(0, -0.03, 0.27);
      stock.rotation.x = -0.12;
      group.add(stock);

    } else if (weaponId === 'magnum') {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.09, 0.22), goldMat);
      frame.position.set(0, 0.01, -0.02);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.095, 8), glowMat);
      cyl.rotation.x = Math.PI / 2;
      cyl.position.set(0, 0.02, -0.03);
      group.add(frame, cyl);
      group.userData.magMesh = cyl;
      group.userData.isRevolver = true;

      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.085, 0.28), silverMat);
      barrel.position.set(0, 0.025, -0.24);
      const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 4), goldMat);
      spearTip.rotation.x = -Math.PI / 2;
      spearTip.position.set(0, -0.02, -0.39);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.14, 0.065), darkMetal);
      grip.position.set(0, -0.09, 0.08);
      grip.rotation.x = -0.32;
      group.add(barrel, spearTip, grip);
    }

    // Divine Holographic Rune Reflex Sight
    const sightGroup = new THREE.Group();
    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.018, 0.09), goldMat);
    sightBase.position.set(0, 0.095, 0.01);
    const sightFrame = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.0045, 8, 22), goldMat);
    sightFrame.position.set(0, 0.132, 0.01);
    const reticleDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0055, 8, 8),
      new THREE.MeshBasicMaterial({ color: isMythicGold ? 0xfde047 : wData.hexColor })
    );
    reticleDot.position.set(0, 0.132, 0.01);
    sightGroup.add(sightBase, sightFrame, reticleDot);
    group.add(sightGroup);

    // P0-1 FIXED: Collect fallback gun body meshes so Blender GLB cleanly replaces them (ZERO double-mesh Z-fighting!)
    const weaponFallbackMeshes = [...group.children];
    this.attachBlenderGLB(`weapon_${weaponId}`, group, (glbScene) => {
      glbScene.scale.set(1.02, 1.02, 1.02);
      glbScene.traverse((c) => {
        if (!c.isMesh) return;
        c.castShadow = true; c.receiveShadow = true;
        // Gunmetal pass: the pale chrome read lavender under the sky env. Shared cached mats -> tune once.
        const m = c.material;
        if (m && !m.userData.gwGunmetal && m.color) {
          m.userData.gwGunmetal = true;
          const n = (m.name || '').toLowerCase();
          if (n.includes('metal')) { m.color.setHex(0x2c3038); m.roughness = 0.42; m.metalness = 0.75; }
          else if (n.includes('silver')) { m.color.setHex(0x6b717a); m.roughness = 0.3; m.metalness = 0.85; }
        }
      });
    }, weaponFallbackMeshes);

    // First-person God Gauntlet / Hands + 3D Shield Battery Heal Prop + Heirloom Melee Mesh
    if (isFirstPerson) {
      const armMat = new THREE.MeshStandardMaterial({ color: hData.hexColor, metalness: 0.78, roughness: 0.22 });
      const cuffMat = new THREE.MeshStandardMaterial({ color: hData.hexAccent, metalness: 0.92, roughness: 0.18 });
      const gloveMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.65, roughness: 0.35 });

      const rightArmGroup = new THREE.Group();
      const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.052, 0.28, 12), armMat);
      rightForearm.rotation.x = Math.PI * 0.42;
      rightForearm.position.set(0.05, -0.13, 0.22);
      const rightCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.056, 0.07, 12), cuffMat);
      rightCuff.rotation.x = Math.PI * 0.42;
      rightCuff.position.set(0.04, -0.11, 0.12);
      const rightFist = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 10), gloveMat);
      rightFist.position.set(0.02, -0.09, 0.06);
      rightArmGroup.add(rightForearm, rightCuff, rightFist);
      group.add(rightArmGroup);

      const leftArmGroup = new THREE.Group();
      const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.30, 12), armMat);
      leftForearm.rotation.x = Math.PI * 0.44;
      leftForearm.rotation.z = -0.22;
      leftForearm.position.set(-0.09, -0.12, 0.04);
      const leftCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.054, 0.07, 12), cuffMat);
      leftCuff.rotation.x = Math.PI * 0.44;
      leftCuff.rotation.z = -0.22;
      leftCuff.position.set(-0.06, -0.10, -0.08);
      const leftFist = new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 10), gloveMat);
      leftFist.position.set(-0.04, -0.08, -0.15);
      leftArmGroup.add(leftForearm, leftCuff, leftFist);
      group.add(leftArmGroup);

      // NOTE: the 'viewmodel_god_arms' GLB rendered as a box-on-a-pole dead centre of the screen,
      // blocking the crosshair. The procedural gauntlets above read correctly, so the GLB is not attached.

      // P1-1: 3D First-Person Shield Battery / Medkit Healing Prop (visible while healing!)
      const healGroup = new THREE.Group();
      const batCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.22, 14),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      const batCapTop = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.04, 14), cuffMat);
      batCapTop.position.y = 0.11;
      const batCapBot = batCapTop.clone();
      batCapBot.position.y = -0.11;
      const batRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.078, 0.008, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0xfde047 })
      );
      batRing.rotation.x = Math.PI / 2;
      healGroup.add(batCore, batCapTop, batCapBot, batRing);
      this.attachBlenderGLB('item_shield_battery', healGroup, (glbBat) => {
        glbBat.scale.set(0.65, 0.65, 0.65);
      });
      healGroup.position.set(-0.22, -0.05, -0.28);
      healGroup.visible = false;
      group.add(healGroup);

      group.userData.leftArmGroup = leftArmGroup;
      group.userData.rightArmGroup = rightArmGroup;
      group.userData.healMesh = healGroup;
      group.userData.healCore = batCore;
      group.userData.healRing = batRing;

      // Muzzle Flash mesh
      const flashMat = new THREE.MeshBasicMaterial({
        color: isMythicGold ? 0xfde047 : wData.hexColor,
        transparent: true,
        opacity: 0.0
      });
      const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), flashMat);
      flash.position.set(0, 0.02, weaponId === 'm4a1' || weaponId === 'ak47' ? -0.68 : -0.44);
      group.add(flash);
      group.userData.muzzleFlash = flash;

      // Attached Heirloom Melee Weapon for Quick Melee [V]
      const meleeMesh = this.createHeirloomMeleeMesh(heroId);
      meleeMesh.position.set(-0.18, -0.06, -0.25);
      meleeMesh.visible = false;
      group.add(meleeMesh);
      group.userData.meleeMesh = meleeMesh;
    }

    return group;
  },

  createHeroModel(heroId = 'thor') {
    const h = window.GODWARS_DATA.HEROES[heroId] || window.GODWARS_DATA.HEROES.thor;
    const root = new THREE.Group();

    const runeTex = this.getRuneTexture(h.color, '#111827');
    const armorMat = new THREE.MeshStandardMaterial({
      color: h.hexColor,
      map: runeTex,
      metalness: 0.8,
      roughness: 0.24
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: h.hexAccent,
      metalness: 0.92,
      roughness: 0.16
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.65,
      roughness: 0.4
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: heroId === 'hades' ? 0xcbd5e1 : 0xf1c27d,
      roughness: 0.5
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: h.hexColor });

    // Legs & Knee Guards
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), darkMat);
    leftLeg.position.set(-0.18, 0.425, 0);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.18;
    const kneeL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.27), accentMat);
    kneeL.position.set(-0.18, 0.48, 0.02);
    const kneeR = kneeL.clone();
    kneeR.position.x = 0.18;
    root.add(leftLeg, rightLeg, kneeL, kneeR);

    // Torso & Glowing Divine Core
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.82, 0.36), armorMat);
    torso.position.set(0, 1.24, 0);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glowMat);
    core.position.set(0, 1.32, 0.19);
    root.add(torso, core);

    // Pauldrons & Arms
    const pauldronL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.42), accentMat);
    pauldronL.position.set(-0.46, 1.54, 0);
    pauldronL.rotation.z = 0.25;
    const pauldronR = pauldronL.clone();
    pauldronR.position.x = 0.46;
    pauldronR.rotation.z = -0.25;

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), darkMat);
    leftArm.position.set(-0.46, 1.15, 0);
    const rightArm = leftArm.clone();
    rightArm.position.x = 0.46;
    rightArm.position.z = 0.15;
    rightArm.rotation.x = -0.6;
    root.add(pauldronL, pauldronR, leftArm, rightArm);

    // Head & Glowing Eyes
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.88, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), skinMat);
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.04), glowMat);
    eyeL.position.set(-0.09, 0.04, 0.19);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.09;
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.42), accentMat);
    helm.position.set(0, 0.14, -0.01);
    headGroup.add(head, eyeL, eyeR, helm);

    if (heroId === 'loki') {
      const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.52, 8), accentMat);
      hornL.position.set(-0.16, 0.42, 0.08);
      hornL.rotation.z = 0.28;
      hornL.rotation.x = -0.25;
      const hornR = hornL.clone();
      hornR.position.x = 0.16;
      hornR.rotation.z = -0.28;
      headGroup.add(hornL, hornR);
    } else if (heroId === 'thor') {
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.24), accentMat);
      wingL.position.set(-0.23, 0.18, 0);
      wingL.rotation.x = 0.35;
      const wingR = wingL.clone();
      wingR.position.x = 0.23;
      headGroup.add(wingL, wingR);

      const capeMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6, side: THREE.DoubleSide });
      const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 1.25), capeMat);
      cape.position.set(0, 1.05, -0.22);
      cape.rotation.x = 0.12;
      root.add(cape);
    } else if (heroId === 'hades') {
      for (let i = -1; i <= 1; i += 2) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.44, 6), glowMat);
        spike.position.set(i * 0.14, 0.4, 0);
        headGroup.add(spike);
      }
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 20), glowMat);
      halo.position.set(0, 1.45, -0.22);
      root.add(halo);
    } else if (heroId === 'zeus') {
      for (let a = -2; a <= 2; a++) {
        const ray = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.32, 5), accentMat);
        ray.position.set(a * 0.09, 0.36, 0.04);
        ray.rotation.z = -a * 0.22;
        headGroup.add(ray);
      }
      const thunderRing = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.035, 8, 24), accentMat);
      thunderRing.position.set(0, 1.5, -0.2);
      root.add(thunderRing);
    } else if (heroId === 'hela') {
      const blackHornMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.9, roughness: 0.15 });
      [-2, -1, 1, 2].forEach(idx => {
        const antler = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.56, 6), blackHornMat);
        antler.position.set(idx * 0.12, 0.42, 0);
        antler.rotation.z = -idx * 0.35;
        headGroup.add(antler);
      });
    } else if (heroId === 'valkyrie') {
      for (let side of [-1, 1]) {
        const wingGroup = new THREE.Group();
        wingGroup.position.set(side * 0.25, 1.42, -0.22);
        for (let f = 0; f < 4; f++) {
          const feather = new THREE.Mesh(
            new THREE.BoxGeometry(0.65 - f * 0.1, 0.11, 0.04),
            f % 2 === 0 ? accentMat : glowMat
          );
          feather.position.set(side * (0.35 - f * 0.04), 0.15 - f * 0.16, 0);
          feather.rotation.z = side * (0.32 - f * 0.12);
          wingGroup.add(feather);
        }
        root.add(wingGroup);
      }
    }

    root.add(headGroup);

    // 3D Apex Knockdown Shield Frontal Dome (Visible when contender is knocked down / DBNO!)
    const kdShieldMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide
    });
    const kdShield = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 16, 12, -Math.PI * 0.42, Math.PI * 0.84, 0.2, Math.PI * 0.55),
      kdShieldMat
    );
    kdShield.rotation.y = Math.PI / 2;
    kdShield.position.set(0, 0.55, 0.25);
    kdShield.visible = false;
    root.add(kdShield);

    root.userData = {
      headGroup,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      torso,
      core,
      kdShield
    };

    const defaultWep = h.defaultWeapons ? h.defaultWeapons[0] : 'm4a1';
    const gun = this.createWeaponModel(defaultWep, heroId, false);
    gun.scale.set(1.15, 1.15, 1.15);
    gun.position.set(0.46, 1.12, 0.38);
    root.add(gun);

    // Grounded Contact Shadow Disc under Hero feet (makes 3D characters look anchored on floors!)
    const shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false })
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.03;
    root.add(shadowDisc);

    // P0-1 FIXED: Hide fallback blocky hero meshes when Blender GLB loads (ZERO double-mesh Z-fighting!) + Enable Shadows!
    const heroFallbackMeshes = root.children.filter(ch => ch !== kdShield && ch !== shadowDisc && ch !== gun);
    heroFallbackMeshes.forEach(m => {
      m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    });
    this.attachBlenderGLB(`hero_${heroId}`, root, (glbScene) => {
      glbScene.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    }, heroFallbackMeshes);

    return root;
  },

  createCarePackageModel() {
    // Apex Legends Triangular Odin Drop Pod + Sky Beacon Beam
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.92, roughness: 0.18 });
    const redGlow = new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.45 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.45, 2.8, 3), hullMat);
    body.position.y = 1.4;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.1, 3), goldMat);
    cap.position.y = 3.35;
    group.add(body, cap);

    // 3 Glowing Loot Doors
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.1, 0.12), goldMat);
      strip.position.set(Math.sin(a) * 0.95, 1.4, Math.cos(a) * 0.95);
      strip.rotation.y = a;
      group.add(strip);
    }

    const podFallbacks = [...group.children];
    this.attachBlenderGLB('prop_carepackage', group, (glb) => {
      glb.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    }, podFallbacks);

    // Sky-Piercing Beacon Beam
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 120, 12, 1, true), redGlow);
    beam.position.y = 60;
    group.add(beam);
    group.userData.beam = beam;

    return group;
  },

  createDropshipModel() {
    const ship = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.75, roughness: 0.35 });
    const bifrostMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.8, 18), hullMat);
    const prow = new THREE.Mesh(new THREE.ConeGeometry(2.8, 6, 6), goldMat);
    prow.rotation.x = Math.PI / 2;
    prow.position.set(0, 1.2, 11.5);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(16, 0.35, 4.2), goldMat);
    wings.position.set(0, 1.4, 0);

    const engineL = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 4.5, 12), bifrostMat);
    engineL.rotation.x = Math.PI / 2;
    engineL.position.set(-5.2, 0.5, -7.5);
    const engineR = engineL.clone();
    engineR.position.x = 5.2;

    ship.add(hull, prow, wings, engineL, engineR);
    const shipFallbacks = [...ship.children];
    this.attachBlenderGLB('prop_dropship', ship, null, shipFallbacks);
    return ship;
  }
};
