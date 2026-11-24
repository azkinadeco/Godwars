/**
 * GOD WARS — LOBBY v4
 * Extends GodWarsGame (main.js) before it is constructed on DOMContentLoaded:
 *  - moodier 3D stage (dark dusk, colored backlight, glossy floor, ground fog, embers) + lobby grade
 *  - Loadout tab with rendered weapon / bomb thumbnails (assets/ui, tools/blender_render_ui_thumbs.py),
 *    stat bars and explicit Slot 1 / Slot 2 assignment
 *  - Map tab with the baked top-down island (tools/bake_lobby_map.js), POI pins + info card + Quick Drop zone
 *  - Legends tab with portrait cards and ability icons
 *  - Graphics quality Auto / Low / Medium / High / Ultra that really changes the renderer, render scale, FPS cap
 */
(function () {
  if (typeof GodWarsGame === 'undefined') return;
  const P = GodWarsGame.prototype;
  const DATA = () => window.GODWARS_DATA;
  const UI = 'assets/ui/';
  const ic = (id, cls = 'lv4-ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (id) => document.getElementById(id);
  const imgErr = 'onerror="this.style.visibility=\'hidden\'"';

  // =======================================================================
  // GRAPHICS QUALITY
  // =======================================================================
  const GFX_KEY = 'godwars_gfx_v4';
  const QUALITY = {
    low:    { label: 'Low',    dpr: 0.75, shadows: 0,    post: false, fog: 0.62, density: 'low',  fx: 'low',  aa: false,
      desc: 'Fastest. No shadows or bloom, 0.75x pixels, shorter view distance, fewer trees, props and particles.' },
    medium: { label: 'Medium', dpr: 1.0,  shadows: 1024, post: false, fog: 0.82, density: 'low',  fx: 'full', aa: true,
      desc: 'Balanced for phones. Soft shadows, 1x pixels, standard view distance, lighter foliage.' },
    high:   { label: 'High',   dpr: 1.5,  shadows: 2048, post: true,  fog: 1.0,  density: 'full', fx: 'full', aa: true,
      desc: 'HDR bloom and color grade, sharp shadows, full foliage and props. Fine on recent phones.' },
    ultra:  { label: 'Ultra',  dpr: 2.0,  shadows: 4096, post: true,  fog: 1.2,  density: 'full', fx: 'full', aa: true,
      desc: 'Everything maxed: up to 2x pixels, 4K shadow map, longest view distance. Desktop GPUs.' }
  };
  const loadGfx = () => {
    let g = {};
    try { g = JSON.parse(localStorage.getItem(GFX_KEY) || '{}') || {}; } catch (e) { g = {}; }
    const q = ['auto', 'low', 'medium', 'high', 'ultra'].includes(g.quality) ? g.quality : 'auto';
    return { quality: q, scale: Math.min(1, Math.max(0.5, parseFloat(g.scale) || 1)), fps: [0, 30, 60].includes(g.fps) ? g.fps : 0 };
  };
  const saveGfx = (g) => { try { localStorage.setItem(GFX_KEY, JSON.stringify(g)); } catch (e) {} };

  // Foliage / prop density: world.js picks its lighter layouts with matchMedia('(pointer: coarse)').
  // During AsgardWorld.build() we answer that query from the quality preset instead of the device.
  if (window.matchMedia) {
    const realMM = window.matchMedia.bind(window);
    window.matchMedia = function (q) {
      if (window.__gwCoarseOverride !== undefined && /pointer\s*:\s*coarse/.test(q)) {
        return { matches: !!window.__gwCoarseOverride, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } };
      }
      return realMM(q);
    };
  }
  const hookWorld = () => {
    if (!window.AsgardWorld || window.AsgardWorld.prototype.__lv4) return;
    const ob = window.AsgardWorld.prototype.build;
    window.AsgardWorld.prototype.__lv4 = true;
    window.AsgardWorld.prototype.build = function () {
      const g = window.GAME;
      window.__gwCoarseOverride = g && g.resolveQuality ? QUALITY[g.resolveQuality()].density === 'low' : undefined;
      try { return ob.apply(this, arguments); } finally { window.__gwCoarseOverride = undefined; }
    };
  };
  hookWorld();

  P.resolveQuality = function () {
    if (!this.gfx) this.gfx = loadGfx();
    const q = this.gfx.quality;
    if (q !== 'auto') return q;
    return this.detectMobile() ? 'medium' : 'high';
  };

  P.wantAntialias = function () {
    const q = this.resolveQuality();
    const aa = QUALITY[q].aa && !(q === 'medium' && this.detectMobile());
    this._lv4BootAA = aa;
    return aa;
  };

  P._lv4DirtyMaterials = function () {
    const mark = (root) => root && root.traverse(o => {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; });
    });
    mark(this.scene); mark(this.lobbyScene);
  };

  const fogBase = new WeakMap();
  P.applyQualityPreset = function () {
    if (!this.renderer) return;
    if (!this.gfx) this.gfx = loadGfx();
    const q = this.resolveQuality();
    const Q = QUALITY[q];
    this.qualityPreset = q; // combat.js treats 'low' (or a phone) as low-spec particles
    const mobile = this.detectMobile();
    const dev = window.devicePixelRatio || 1;
    const dpr = Math.max(0.5, Math.min(dev, Q.dpr) * (this.gfx.scale || 1));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    let dirty = false;

    const shadowsOn = Q.shadows > 0;
    if (this.renderer.shadowMap.enabled !== shadowsOn) { this.renderer.shadowMap.enabled = shadowsOn; dirty = true; }
    const setSM = (light, size) => {
      if (!light || !light.shadow || light.shadow.mapSize.x === size) return;
      light.shadow.mapSize.set(size, size);
      if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
    };
    if (shadowsOn) {
      if (this.world && this.world.sunLight) setSM(this.world.sunLight, Math.min(Q.shadows, mobile ? 2048 : 4096));
      if (this.lobbyScene) this.lobbyScene.traverse(o => { if (o.isSpotLight && o.castShadow) setSM(o, q === 'medium' ? 512 : 1024); });
    }

    const fog = this.scene && this.scene.fog;
    if (fog && fog.isFog) {
      if (!fogBase.has(fog)) fogBase.set(fog, { near: fog.near, far: fog.far });
      const b = fogBase.get(fog);
      fog.near = b.near * Q.fog; fog.far = b.far * Q.fog;
    }

    if (this.post) {
      const want = Q.post && !this.disablePostFX;
      if (this.post.enabled !== (want && this.post.supported)) { this.post.setEnabled(want); dirty = true; }
    }
    if (dirty) this._lv4DirtyMaterials();
    this._lv4Quality = { q, dpr, shadows: shadowsOn ? Q.shadows : 0, post: !!(this.post && this.post.enabled) };
    if (this.lv4UpdateQualityUI) this.lv4UpdateQualityUI();
  };

  // =======================================================================
  // FRAME CAP + PER-FRAME LOBBY FX
  // =======================================================================
  const oLoop = P.loop;
  P.loop = function (now) {
    const cap = this.gfx && this.gfx.fps;
    if (cap > 0 && this._lv4Last && now - this._lv4Last < 1000 / cap - 1.5) {
      requestAnimationFrame((t) => this.loop(t));
      return;
    }
    this._lv4Last = now;
    if (!this.matchActive && this.lv4Fx) { try { this.updateLobbyFx(now); } catch (e) {} }
    return oLoop.call(this, now);
  };

  // =======================================================================
  // LOBBY STAGE MOOD
  // =======================================================================
  const softTex = (() => {
    let t = null;
    return () => {
      if (t) return t;
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      t = new THREE.CanvasTexture(c);
      return t;
    };
  })();
  const additive = (color, opacity) => new THREE.MeshBasicMaterial({ map: softTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

  const oStage = P.initLobby3DStage;
  P.initLobby3DStage = function () {
    oStage.apply(this, arguments);
    try { this.enhanceLobbyStage(); } catch (e) { console.warn('lobby v4 stage', e); }
  };

  P.enhanceLobbyStage = function () {
    const S = this.lobbyScene;
    if (!S) return;
    S.background = new THREE.Color(0x04060c);
    S.fog = new THREE.Fog(0x080b16, 9, 46);
    S.traverse(o => {
      const u = o.material && o.material.uniforms;
      if (u && u.top && u.hor && u.mid) { u.top.value.set(0x020309); u.mid.value.set(0x0b1022); u.hor.value.set(0x3b2140); }
      if (o.isMesh && o.geometry && o.geometry.type === 'ShapeGeometry') o.material.color.multiplyScalar(0.32);
      if (o.isHemisphereLight) { o.intensity = 0.16; o.color.set(0x8fa6d8); }
      if (o.isDirectionalLight) {
        if (o.position.z > 0) { o.intensity = 0.85; }
        else if (o.position.x < 0) { o.color.set(0x48b8ff); o.intensity = 3.2; o.position.set(-5, 1.3, -6); }
        else { o.color.set(0xff6a3a); o.intensity = 2.6; o.position.set(5, 1.1, -6); }
      }
      if (o.isSpotLight) { o.penumbra = 0.8; }
      if (o.isMesh && o.geometry && o.geometry.type === 'CylinderGeometry') {
        const gp = o.geometry.parameters;
        if (gp.radialSegments === 6 && gp.height === 0.16 && !o.material.userData.lv4) { o.material.color.set(0x3d3b38); o.material.roughness = 0.78; o.material.metalness = 0; o.material.envMapIntensity = 0.25; o.material.userData.lv4 = 1; }
        if (gp.radialSegments === 6 && gp.height === 0.04 && !gp.openEnded) {
          // bronze band's solid caps covered the dais top and mirrored the bright env map -> open tube
          o.geometry = new THREE.CylinderGeometry(gp.radiusTop, gp.radiusBottom, 0.04, 6, 1, true);
          o.material.envMapIntensity = 0.55;
        }
        if (gp.radialSegments === 20 && gp.radiusTop === 0.42 && !o.material.userData.lv4) { o.material.color.set(0x55524e); o.material.envMapIntensity = 0.3; o.material.userData.lv4 = 1; }
      }
      if (o.isMesh && o.geometry && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === 9) {
        o.material.color.set(0x2a2b30); o.material.roughness = 0.3; o.material.metalness = 0.35; o.material.envMapIntensity = 0.22;
        o.material.needsUpdate = true;
      }
    });

    const fx = new THREE.Group();
    // colored backlight wash behind the squad + rim point light on the hero
    this.lv4BackGlow = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), additive(0x38bdf8, 0.2));
    this.lv4BackGlow.position.set(0, 2.2, -2.6);
    this.lv4BackLight = new THREE.PointLight(0x38bdf8, 2.4, 7, 2);
    this.lv4BackLight.position.set(0, 2.3, -1.3);
    fx.add(this.lv4BackGlow, this.lv4BackLight);
    // light pools under each pedestal
    this.lv4Pools = [];
    [[0, 0, 4.2, 0xfff0d0, 0.22], [-1.95, -0.85, 3.4, 0x7dd3fc, 0.2], [1.95, -0.85, 3.4, 0xffb07a, 0.2]].forEach(([x, z, s, c, op]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), additive(c, op));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z);
      fx.add(m); this.lv4Pools.push(m);
    });
    // drifting ground fog
    this.lv4FogCards = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.2), additive(i % 2 ? 0x5a6fa8 : 0x3d4a78, 0.12));
      m.position.set(-8 + i * 2.7, 0.45 + (i % 3) * 0.18, -2.6 + (i % 2) * 1.6);
      m.userData.phase = i * 1.7;
      fx.add(m); this.lv4FogCards.push(m);
    }
    // rising embers
    const N = 140, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), spd = new Float32Array(N);
    const cA = new THREE.Color(0xffa860), cB = new THREE.Color(0x7dd3fc);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 11; pos[i * 3 + 1] = Math.random() * 5.5; pos[i * 3 + 2] = -3.5 + Math.random() * 4.5;
      const c = Math.random() < 0.7 ? cA : cB; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      spd[i] = 0.12 + Math.random() * 0.35;
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    eg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.lv4Embers = new THREE.Points(eg, new THREE.PointsMaterial({ size: 0.05, map: softTex(), vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lv4Embers.userData.spd = spd;
    fx.add(this.lv4Embers);
    if (this.lobbyMotes) this.lobbyMotes.material.opacity = 0.35;
    S.add(fx);
    this.lv4Fx = fx;
    this.lv4SetStageColor && this.lv4SetStageColor();
  };

  P.lv4SetStageColor = function () {
    const h = DATA().HEROES[this.selectedHeroId];
    if (!h || !this.lv4BackGlow) return;
    const c = new THREE.Color(h.hexColor);
    this.lv4BackGlow.material.color.copy(c).multiplyScalar(0.9);
    this.lv4BackLight.color.copy(c);
    if (this.lv4Pools && this.lv4Pools[0]) this.lv4Pools[0].material.color.set(0xfff0d0).lerp(c, 0.35);
  };

  P.updateLobbyFx = function (now) {
    const t = now * 0.001;
    const dt = Math.min(0.05, this._lv4FxT ? t - this._lv4FxT : 0.016);
    this._lv4FxT = t;
    if (this.lv4Embers) {
      const a = this.lv4Embers.geometry.attributes.position, spd = this.lv4Embers.userData.spd;
      for (let i = 0; i < spd.length; i++) {
        let y = a.getY(i) + spd[i] * dt;
        let x = a.getX(i) + Math.sin(t * 0.7 + i) * 0.002;
        if (y > 5.6) { y = 0.1; x = (Math.random() - 0.5) * 11; }
        a.setXY(i, x, y);
      }
      a.needsUpdate = true;
    }
    if (this.lv4FogCards) this.lv4FogCards.forEach((m) => {
      m.position.x += Math.sin(t * 0.15 + m.userData.phase) * 0.004;
      m.material.opacity = 0.09 + Math.sin(t * 0.4 + m.userData.phase) * 0.03;
      if (this.lobbyCamera) m.quaternion.copy(this.lobbyCamera.quaternion);
    });
    if (this.lv4BackGlow) this.lv4BackGlow.material.opacity = 0.17 + Math.sin(t * 0.8) * 0.03;
  };

  // lobby colour grade (post FX on) / exposure (post FX off); match values are restored at match start
  P.applyLobbyGrade = function () {
    const p = this.post && this.post.params;
    if (!p) return;
    if (!this._lv4MatchGrade) this._lv4MatchGrade = { threshold: p.threshold, vignette: p.vignette, contrast: p.contrast, sat: p.sat };
    p.exposure = 0.6; p.bloom = 0.75; p.threshold = 0.85; p.vignette = 0.6; p.contrast = 1.12; p.sat = 1.14;
    if (!this.post.enabled && this.renderer) this.renderer.toneMappingExposure = 0.8;
  };
  P._lv4RestoreMatchGrade = function () {
    const p = this.post && this.post.params;
    if (p && this._lv4MatchGrade) Object.assign(p, this._lv4MatchGrade);
    if (this.renderer) this.renderer.toneMappingExposure = 0.86;
  };

  // =======================================================================
  // MATCH START: quality + Quick Drop landing zone
  // =======================================================================
  const oStart = P.startBattleRoyaleMatch;
  P.startBattleRoyaleMatch = function (instantGroundDrop = false, isFiringRange = false) {
    hookWorld();
    this._lv4RestoreMatchGrade();
    this.applyQualityPreset();
    const r = oStart.apply(this, arguments);
    try {
      this.applyQualityPreset();
      if (instantGroundDrop && !isFiringRange) this.lv4ApplyDropZone();
    } catch (e) { console.warn('lobby v4 match start', e); }
    return r;
  };

  P.lv4ApplyDropZone = function () {
    const id = this.lv4DropZone;
    const poi = id && DATA().POIS.find(p => p.id === id);
    if (!poi || poi.id === 'valhalla' || !this.player || !this.world) return;
    const len = Math.hypot(poi.x, poi.z) || 1;
    const x = poi.x - (poi.x / len) * poi.radius * 1.1;
    const z = poi.z - (poi.z / len) * poi.radius * 1.1;
    const gy = this.world.getGroundHeight ? this.world.getGroundHeight(x, z, 0) : 0;
    const dx = this.player.position.x, dz = this.player.position.z;
    this.player.position.set(x, gy + 3.5, z);
    this.player.yaw = Math.atan2(x - poi.x, z - poi.z);
    (this.bots || []).forEach(b => {
      if (!b.isAlly || !b.position) return;
      b.position.x += x - dx; b.position.z += z - dz;
      b.position.y = this.world.getGroundHeight ? this.world.getGroundHeight(b.position.x, b.position.z, 0) : b.position.y;
      if (b.mesh) b.mesh.position.copy(b.position);
    });
  };

  // =======================================================================
  // TOP BAR: level / rank badge
  // =======================================================================
  P.updateCareerLobbyUI = function () {
    const el = $('career-rank-badge');
    if (!el || !this.career) return;
    const rank = this.getRankInfo(this.career.rp);
    const xp = this.career.xp || 0;
    const lvl = Math.floor(xp / 1000) + 1;
    const pct = Math.round((xp % 1000) / 10);
    el.innerHTML = `<span class="lv4-lvl" style="--p:${pct}"><b>${lvl}</b></span>
      <span class="lv4-rank-txt"><small>LEVEL ${lvl} · ${this.career.wins || 0} WINS</small><span style="color:${rank.color}">${esc(rank.name)}</span></span>
      <span class="lv4-rp">${ic('rank')}<b>${this.career.rp}</b>RP</span>`;
  };

  // =======================================================================
  // LOBBY UI
  // =======================================================================
  const oInitUI = P.initLobbyUI;
  P.initLobbyUI = function () {
    oInitUI.apply(this, arguments);
    try { this.lobbyV4Init(); } catch (e) { console.warn('lobby v4 ui', e); }
  };

  const shortRole = (h) => String(h.role || '').split('/')[0].trim();
  const MODE_DESC = {
    trios: 'Squads of 3 · 16 contenders · last squad standing',
    solos: 'Every god for themself · 16 contenders',
    firing_range: 'Practice range · test weapons and abilities',
    online: 'Play live with friends in a shared room'
  };

  P.lobbyV4Init = function () {
    this.lv4DropZone = (() => { try { return localStorage.getItem('godwars_dropzone') || 'valhalla'; } catch (e) { return 'valhalla'; } })();
    this.lv4Map = { sel: this.lv4DropZone };
    const savedBomb = (() => { try { return localStorage.getItem('godwars_bomb'); } catch (e) { return null; } })();
    if (savedBomb && DATA().GRENADES[savedBomb]) this.selectedGrenadeId = savedBomb;

    // --- music pill keeps the SVG icon after the original handler rewrites its text
    const musicBtn = $('btn-lobby-music');
    const paintMusic = () => {
      const on = !!(window.SFX && window.SFX.musicEnabled);
      if (musicBtn) { musicBtn.innerHTML = `${ic(on ? 'music' : 'mute')}<span class="lv4-music-name">${on ? 'ZHU - VILLAIN' : 'MUTED'}</span>`; musicBtn.classList.toggle('muted', !on); }
      const cb = $('lv4-music-on'); if (cb) cb.checked = on;
    };
    if (musicBtn) musicBtn.addEventListener('click', paintMusic);
    paintMusic();

    // --- mode description
    const modeDesc = $('lv4-mode-desc');
    if (modeDesc) modeDesc.textContent = MODE_DESC[this.gameMode] || '';
    document.querySelectorAll('.mode-pill-btn').forEach(b => b.addEventListener('click', () => { if (modeDesc) modeDesc.textContent = MODE_DESC[b.dataset.mode] || ''; }));

    // --- hero cards with portraits (PLAY quick bar + LEGENDS roster); click handlers stay on the buttons
    document.querySelectorAll('#play-quick-heroes .hero-card').forEach(btn => {
      const h = DATA().HEROES[btn.dataset.hid]; if (!h) return;
      btn.innerHTML = `<img src="${UI}hero_${h.id}.webp" alt="" ${imgErr}/><span class="hc-name">${esc(h.name)}</span>`;
      btn.title = `${h.name} · ${shortRole(h)}`;
    });
    document.querySelectorAll('#hero-roster .hero-card').forEach(btn => {
      const h = DATA().HEROES[btn.dataset.hid]; if (!h) return;
      btn.innerHTML = `<img class="lv4-hc-img" src="${UI}hero_${h.id}.webp" alt="" ${imgErr}/>
        <span class="lv4-hc-meta"><b>${esc(h.name)}</b><small>${esc(shortRole(h))}</small></span>`;
    });

    this.lv4BuildLoadout();
    this.lv4BuildMap();
    this.lv4BuildSettings();
    this.lv4RefreshHero();

    // stage: go back to heroes when leaving the loadout weapon preview
    document.querySelectorAll('.lobby-tab-btn').forEach(btn => btn.addEventListener('click', () => {
      document.body.dataset.lobbyTab = btn.dataset.target;
      if (btn.dataset.target !== 'tab-armory') this.updateLobby3DSquad(null);
    }));
    document.body.dataset.lobbyTab = 'tab-play';
  };

  // ------------------------------------------------------------- LEGENDS
  const oSelectHero = P.selectHero;
  P.selectHero = function (heroId) {
    oSelectHero.apply(this, arguments);
    try { this.lv4RefreshHero(); } catch (e) { console.warn('lobby v4 hero', e); }
  };

  P.lv4RefreshHero = function () {
    const h = DATA().HEROES[this.selectedHeroId];
    if (!h) return;
    const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
    set('info-hero-name', esc(h.name));
    set('info-hero-title', `${esc(h.title)} <span>· ${esc(h.role)}</span>`);
    set('info-tactical-name', `${esc(h.tacticalName)} <em>${h.tacticalCooldown}s</em>`);
    set('info-ult-name', `${esc(h.ultimateName)} <em>${h.ultimateChargeTime ? h.ultimateChargeTime + 's' : ''}</em>`);
    set('info-passive-name', `${esc(h.passiveName)} <em>${esc(h.meleeName)}</em>`);
    const portrait = $('lv4-legend-portrait');
    if (portrait) { portrait.src = `${UI}hero_${h.id}.webp`; portrait.style.setProperty('--c', h.color); }
    const legRight = document.querySelector('.legends-right-col');
    if (legRight) legRight.style.setProperty('--hero-color', h.color);
    const W = DATA().WEAPONS;
    set('lv4-hero-stats', `
      <span>${ic('heart')}<b>${h.maxHp}</b> HP</span>
      <span>${ic('speed')}<b>${Math.round((h.speedMult || 1) * 100)}%</b> speed</span>
      <span>${ic('gun')}${(h.defaultWeapons || []).map(w => esc(W[w] ? W[w].baseName : w)).join(' + ')}</span>`);
    set('play-passive-pill', `${ic('passive')}${esc(h.passiveName)}`);
    set('play-tactical-pill', `${ic('tactical')}<kbd>Q</kbd>${esc(h.tacticalName)}`);
    set('play-ult-pill', `${ic('ultimate')}<kbd>Z</kbd>${esc(h.ultimateName)}`);
    this.lv4SetStageColor();
    this.lv4RenderKit && this.lv4RenderKit();
    this.lv4PaintWeaponCards && this.lv4PaintWeaponCards();
  };

  // ------------------------------------------------------------- LOADOUT
  const wClass = (w) => /Handcannon|Pistol/i.test(w.category) ? 'PISTOL' : /SMG|Submachine/i.test(w.category) ? 'SMG' : /Rifle/i.test(w.category) ? 'RIFLE' : 'WEAPON';
  const ammoShort = (w) => String(w.ammoType || '').split(' ')[0];
  const bombImg = { solar_bomb: 'bomb_solar', apollo_flash: 'bomb_flash', yggdrasil_arc: 'bomb_arc' };
  const bar = (label, v, max, shown) => `<div class="lv4-stat"><span>${label}</span><i><b style="width:${Math.max(6, Math.min(100, Math.round(v / max * 100)))}%"></b></i><em>${shown}</em></div>`;

  P.lv4BuildLoadout = function () {
    const grid = $('armory-weapon-grid');
    const W = DATA().WEAPONS;
    if (grid) {
      grid.innerHTML = Object.values(W).map(w => `
        <div class="lv4-wcard" data-wid="${w.id}" style="--c:${w.color}">
          <div class="lv4-wimg"><img src="${UI}wep_${w.id}.webp" alt="" ${imgErr}/><span class="lv4-wslot"></span></div>
          <div class="lv4-wname">${esc(w.divineName)}</div>
          <div class="lv4-wmeta"><span class="lv4-chip">${wClass(w)}</span><span>${esc(w.baseName)} · ${esc(ammoShort(w))}</span></div>
          <div class="lv4-stats">
            ${bar('DMG', w.damage, 50, w.damage)}
            ${bar('RATE', w.rpm, 1100, w.rpm)}
            ${bar('RANGE', w.range, 230, w.range + 'm')}
            ${bar('MAG', w.magSize, 50, w.magSize)}
          </div>
          <div class="lv4-wbtns">
            <button data-slot="0" data-wid="${w.id}">SLOT 1</button>
            <button data-slot="1" data-wid="${w.id}">SLOT 2</button>
          </div>
        </div>`).join('');
      // the original delegated listener (main.js) assigns the slot; this one repaints afterwards
      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-slot]');
        if (!btn) return;
        this.lv4PaintWeaponCards(); this.lv4RenderKit();
        const card = btn.closest('.lv4-wcard'); if (card) { card.classList.remove('lv4-pop'); void card.offsetWidth; card.classList.add('lv4-pop'); }
      });
    }

    const bombs = $('armory-bomb-grid');
    if (bombs) {
      const G = DATA().GRENADES;
      bombs.innerHTML = Object.values(G).map(g => `
        <button class="lv4-bcard" data-bid="${g.id}" style="--c:${g.color}">
          <span class="lv4-bimg"><img src="${UI}${bombImg[g.id] || 'bomb_solar'}.webp" alt="" ${imgErr}/></span>
          <span class="lv4-bbody">
            <span class="lv4-wname">${esc(g.shortName || g.name)}</span>
            <span class="lv4-wmeta"><span class="lv4-chip">${esc(g.baseType)}</span></span>
            <span class="lv4-bdesc">${esc(g.desc)}</span>
            <span class="lv4-stats">${bar('DMG', g.damage, 100, g.damage)}${bar('RADIUS', g.radius, 16, g.radius + 'm')}${bar('FUSE', 3 - g.fuseTime, 2, g.fuseTime + 's')}</span>
          </span>
          <span class="lv4-bsel">${ic('check')}EQUIPPED</span>
        </button>`).join('');
      bombs.addEventListener('click', (e) => {
        const b = e.target.closest('.lv4-bcard'); if (!b) return;
        this.selectedGrenadeId = b.dataset.bid;
        try { localStorage.setItem('godwars_bomb', this.selectedGrenadeId); } catch (err) {}
        if (window.SFX) window.SFX.playReload();
        this.lv4PaintBombs(); this.lv4RenderKit();
      });
    }

    const skins = $('armory-skin-row');
    if (skins && DATA().WEAPON_SKINS) {
      const wid = () => this.selectedLoadout[0] || 'm4a1';
      const paintSkins = () => {
        skins.innerHTML = Object.values(DATA().WEAPON_SKINS).map(sk => `
          <button class="lv4-skin ${sk.id === this.selectedWeaponSkin ? 'active' : ''}" data-skin="${sk.id}" style="--c:${sk.color}">
            <span class="lv4-skin-img"><img src="${UI}wep_${wid()}.webp" alt="" ${imgErr}/>${sk.emissive ? `<i style="-webkit-mask-image:url(${UI}wep_${wid()}.webp);mask-image:url(${UI}wep_${wid()}.webp)"></i>` : ''}</span>
            <span class="lv4-skin-name"><span class="lv4-swatch"></span>${esc(sk.name)}</span>
          </button>`).join('');
      };
      paintSkins();
      this.lv4PaintSkins = paintSkins;
      skins.addEventListener('click', (e) => {
        const b = e.target.closest('.lv4-skin'); if (!b) return;
        this.selectedWeaponSkin = b.dataset.skin;
        try { localStorage.setItem('godwars_skin', this.selectedWeaponSkin); } catch (err) {}
        if (window.SFX) window.SFX.playReload();
        paintSkins(); this.lv4RenderKit();
      });
    }

    const seg = $('lv4-armory-seg');
    if (seg) seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-sub]'); if (!b) return;
      this.lv4ArmorySub(b.dataset.sub);
    });
    this.lv4PaintWeaponCards(); this.lv4PaintBombs(); this.lv4RenderKit();
  };

  P.lv4ArmorySub = function (sub) {
    document.querySelectorAll('#lv4-armory-seg button').forEach(x => x.classList.toggle('active', x.dataset.sub === sub));
    document.querySelectorAll('#tab-armory .lv4-subpanel').forEach(x => x.classList.toggle('active', x.dataset.sub === sub));
    if (sub === 'skins' && this.lv4PaintSkins) this.lv4PaintSkins();
  };

  P.lv4PaintWeaponCards = function () {
    document.querySelectorAll('#armory-weapon-grid .lv4-wcard').forEach(c => {
      const i = this.selectedLoadout.indexOf(c.dataset.wid);
      c.classList.toggle('eq', i >= 0);
      const s = c.querySelector('.lv4-wslot'); if (s) s.textContent = i >= 0 ? `SLOT ${i + 1}` : '';
      c.querySelectorAll('.lv4-wbtns button').forEach(b => b.classList.toggle('on', parseInt(b.dataset.slot, 10) === i));
    });
  };
  P.lv4PaintBombs = function () {
    document.querySelectorAll('#armory-bomb-grid .lv4-bcard').forEach(b => b.classList.toggle('active', b.dataset.bid === this.selectedGrenadeId));
  };

  P.lv4RenderKit = function () {
    const kit = $('lv4-kit');
    if (!kit) return;
    const W = DATA().WEAPONS, G = DATA().GRENADES;
    const skin = (DATA().WEAPON_SKINS || {})[this.selectedWeaponSkin];
    const slot = (i) => {
      const w = W[this.selectedLoadout[i]]; if (!w) return '';
      return `<button class="lv4-kslot" data-go="weapons" style="--c:${w.color}">
        <span class="lv4-klabel">SLOT ${i + 1}</span>
        <img src="${UI}wep_${w.id}.webp" alt="" ${imgErr}/>
        <span class="lv4-kname">${esc(w.divineName)}</span>
        <span class="lv4-kmeta">${wClass(w)} · ${esc(w.baseName)}</span></button>`;
    };
    const g = G[this.selectedGrenadeId] || G.solar_bomb;
    kit.innerHTML = `<div class="lv4-kit-title">YOUR KIT</div>
      ${slot(0)}${slot(1)}
      <button class="lv4-kslot lv4-kbomb" data-go="bombs" style="--c:${g.color}">
        <span class="lv4-klabel">BOMB</span>
        <img src="${UI}${bombImg[g.id] || 'bomb_solar'}.webp" alt="" ${imgErr}/>
        <span class="lv4-kname">${esc(g.shortName || g.name)}</span>
        <span class="lv4-kmeta">${esc(g.baseType)}</span></button>
      <button class="lv4-kskin" data-go="skins" style="--c:${skin ? skin.color : '#fbbf24'}"><span class="lv4-swatch"></span><span>FINISH · ${esc(skin ? skin.name : 'DEFAULT')}</span>${ic('chev')}</button>
      <div class="lv4-kit-note">Changing legend resets weapons to that legend's default kit.</div>`;
    kit.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => this.lv4ArmorySub(b.dataset.go)));
  };

  // ------------------------------------------------------------- MAP
  const MAP_HALF = 240 * 1.18; // world units from centre to the edge of assets/ui/map_island.webp
  const POI_SHORT = { valhalla: 'VALHALLA', bifrost: 'BIFROST', forge: 'FORGE', yggdrasil: 'YGGDRASIL', helheim: 'HELHEIM', skydocks: 'SKY DOCKS' };
  const POI_FEAT = {
    valhalla: ['Replicator', 'Survey beacon', '2-story palaces', 'Ziplines x5'],
    bifrost: ['Survey beacon', 'Bridge', 'Observatory'],
    forge: ['Replicator', 'Skybridge', 'Lava canal'],
    yggdrasil: ['Zipline', 'Treehouse deck', 'Shrines'],
    helheim: ['Obsidian keep', 'Crypt bunkers'],
    skydocks: ['Replicator', 'Hangars', 'Helipad']
  };
  const tierLevel = (t) => /MYTHIC/.test(t) ? 4 : /MID/.test(t) ? 2 : /HIGH/.test(t) ? 3 : 1;
  const tierColor = (t) => ({ 4: '#f43f5e', 3: '#a855f7', 2: '#38bdf8', 1: '#94a3b8' }[tierLevel(t)]);
  const compass = (x, z) => {
    if (Math.hypot(x, z) < 30) return 'Center';
    const a = (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360;
    return ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'][Math.round(a / 45) % 8];
  };
  const mapPct = (v) => (50 + v / MAP_HALF * 50).toFixed(2);

  P.lv4BuildMap = function () {
    const pins = $('lv4-map-pins'), lines = $('lv4-map-lines');
    const D = DATA();
    if (lines && D.ZIPLINES) {
      lines.innerHTML = D.ZIPLINES.map(z => `<line x1="${mapPct(z.start[0])}" y1="${mapPct(z.start[2])}" x2="${mapPct(z.end[0])}" y2="${mapPct(z.end[2])}"/>`).join('')
        + `<circle cx="50" cy="50" r="${(240 / MAP_HALF * 50).toFixed(2)}" class="lv4-edge"/>`;
    }
    if (pins) {
      pins.innerHTML = D.POIS.map(p => `
        <button class="lv4-pin" data-poi="${p.id}" style="left:${mapPct(p.x)}%;top:${mapPct(p.z)}%;--c:${p.color};--t:${tierColor(p.tier)}">
          <i class="lv4-pin-ring" style="width:${(p.radius / MAP_HALF * 100).toFixed(2)}cqw;height:${(p.radius / MAP_HALF * 100).toFixed(2)}cqw"></i>
          <i class="lv4-pin-dot"></i><span class="lv4-pin-label">${POI_SHORT[p.id] || p.name}</span>
          <span class="lv4-pin-drop">${ic('pin')}</span>
        </button>`).join('');
      pins.addEventListener('click', (e) => { const b = e.target.closest('.lv4-pin'); if (b) { this.lv4Map.sel = b.dataset.poi; this.lv4PaintMap(); if (window.SFX) window.SFX.playHitmarker(false, true, false); } });
      pins.addEventListener('mouseover', (e) => { const b = e.target.closest('.lv4-pin'); if (b && this.lv4Map.hover !== b.dataset.poi) { this.lv4Map.hover = b.dataset.poi; this.lv4PaintMap(); } });
      pins.addEventListener('mouseleave', () => { this.lv4Map.hover = null; this.lv4PaintMap(); });
    }
    const info = $('lv4-poi-info');
    if (info) info.addEventListener('click', (e) => {
      const set = e.target.closest('[data-drop]');
      if (set) {
        this.lv4DropZone = set.dataset.drop;
        try { localStorage.setItem('godwars_dropzone', this.lv4DropZone); } catch (err) {}
        if (window.SFX) window.SFX.playReload();
        this.lv4PaintMap();
        return;
      }
      const row = e.target.closest('[data-poi]');
      if (row) { this.lv4Map.sel = row.dataset.poi; this.lv4PaintMap(); }
    });
    this.lv4PaintMap();
  };

  P.lv4PaintMap = function () {
    const D = DATA();
    const id = this.lv4Map.hover || this.lv4Map.sel;
    const p = D.POIS.find(x => x.id === id) || D.POIS[0];
    document.querySelectorAll('#lv4-map-pins .lv4-pin').forEach(b => {
      b.classList.toggle('sel', b.dataset.poi === p.id);
      b.classList.toggle('drop', b.dataset.poi === this.lv4DropZone);
    });
    const info = $('lv4-poi-info');
    if (!info) return;
    const lvl = tierLevel(p.tier);
    const isDrop = this.lv4DropZone === p.id;
    const dz = D.POIS.find(x => x.id === this.lv4DropZone);
    info.style.setProperty('--c', p.color);
    info.innerHTML = `
      <div class="lv4-poi-top"><span class="lv4-tier" style="--t:${tierColor(p.tier)}">${esc(p.tier)}</span><span class="lv4-poi-dir">${ic('pin')}${compass(p.x, p.z)}</span></div>
      <h3>${esc(p.name)}</h3>
      <div class="lv4-loot"><span>LOOT</span>${[1, 2, 3, 4].map(i => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</div>
      <p>${esc(p.desc)}</p>
      <div class="lv4-feats">${(POI_FEAT[p.id] || []).map(f => `<span>${esc(f)}</span>`).join('')}</div>
      <button class="lv4-drop-btn ${isDrop ? 'set' : ''}" data-drop="${p.id}">${ic(isDrop ? 'check' : 'pin')}${isDrop ? 'QUICK DROP ZONE' : 'SET AS QUICK DROP ZONE'}</button>
      <div class="lv4-drop-note">Quick Drop lands your squad at <b>${esc(dz ? (POI_SHORT[dz.id] || dz.name) : 'VALHALLA')}</b>. In a full match you jump from the dropship.</div>
      <div class="lv4-poi-list">${D.POIS.map(x => `<button data-poi="${x.id}" class="${x.id === p.id ? 'sel' : ''}" style="--c:${x.color}"><i></i>${POI_SHORT[x.id] || x.name}<em style="color:${tierColor(x.tier)}">${'▮'.repeat(tierLevel(x.tier))}</em></button>`).join('')}</div>
      <div class="lv4-map-key"><span><i class="z"></i>Zipline</span><span><i style="background:#f43f5e"></i>Mythic</span><span><i style="background:#a855f7"></i>High</span><span><i style="background:#38bdf8"></i>Mid</span></div>`;
  };

  // ------------------------------------------------------------- SETTINGS
  P.lv4BuildSettings = function () {
    if (!this.gfx) this.gfx = loadGfx();
    const nav = $('lv4-set-nav');
    if (nav) nav.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-sec]'); if (!b) return;
      nav.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      document.querySelectorAll('#tab-settings .lv4-set-sec').forEach(s => s.classList.toggle('active', s.dataset.sec === b.dataset.sec));
    });

    const setQuality = (q) => {
      this.gfx.quality = q; saveGfx(this.gfx);
      this.applyQualityPreset();
    };
    // replace the select node to drop main.js's legacy 'mobile/balanced/ultra' listener
    let sel = $('select-quality');
    if (sel) { const fresh = sel.cloneNode(true); sel.replaceWith(fresh); sel = fresh; sel.addEventListener('change', () => setQuality(sel.value)); }
    const qs = $('qs-quality');
    if (qs) qs.addEventListener('change', () => setQuality(qs.value));
    const seg = $('lv4-q-seg');
    if (seg) seg.addEventListener('click', (e) => { const b = e.target.closest('button[data-q]'); if (b) setQuality(b.dataset.q); });

    const scale = $('lv4-render-scale'), scaleLbl = $('lv4-scale-label');
    if (scale) {
      scale.value = this.gfx.scale;
      scale.addEventListener('input', () => {
        this.gfx.scale = parseFloat(scale.value) || 1; saveGfx(this.gfx);
        if (scaleLbl) scaleLbl.textContent = `${Math.round(this.gfx.scale * 100)}%`;
        this.applyQualityPreset();
      });
    }
    const fps = $('lv4-fps-seg');
    if (fps) fps.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-fps]'); if (!b) return;
      this.gfx.fps = parseInt(b.dataset.fps, 10) || 0; saveGfx(this.gfx);
      this.lv4UpdateQualityUI();
    });

    // audio
    const musicOn = $('lv4-music-on');
    if (musicOn) musicOn.addEventListener('change', () => {
      if (!!(window.SFX && window.SFX.musicEnabled) !== musicOn.checked) { const b = $('btn-lobby-music'); if (b) b.click(); }
    });
    const mv = $('lv4-music-vol'), topVol = $('slider-music-volume');
    if (mv && topVol) {
      mv.value = topVol.value;
      mv.addEventListener('input', () => { topVol.value = mv.value; topVol.dispatchEvent(new Event('input')); });
      topVol.addEventListener('input', () => { mv.value = topVol.value; });
    }
    const sv = $('lv4-sfx-vol');
    if (sv && window.SFX) {
      if (this._lv4BaseVol === undefined) this._lv4BaseVol = window.SFX.masterVolume;
      let v = 1; try { v = parseFloat(localStorage.getItem('godwars_sfx_vol')); } catch (e) {}
      if (!isFinite(v)) v = 1;
      sv.value = v; window.SFX.masterVolume = this._lv4BaseVol * v;
      sv.addEventListener('input', () => {
        const x = parseFloat(sv.value); window.SFX.masterVolume = this._lv4BaseVol * x;
        try { localStorage.setItem('godwars_sfx_vol', String(x)); } catch (e) {}
      });
    }
    const vo = $('lv4-voice-on');
    if (vo && window.SFX) {
      let on = true; try { on = localStorage.getItem('godwars_voice') !== '0'; } catch (e) {}
      vo.checked = on; window.SFX.voiceEnabled = on;
      vo.addEventListener('change', () => { window.SFX.voiceEnabled = vo.checked; try { localStorage.setItem('godwars_voice', vo.checked ? '1' : '0'); } catch (e) {} });
    }
    this.lv4UpdateQualityUI();
  };

  P.lv4UpdateQualityUI = function () {
    if (!this.gfx) return;
    const q = this.resolveQuality(), Q = QUALITY[q], cur = this._lv4Quality || {};
    const sel = $('select-quality'); if (sel) sel.value = this.gfx.quality;
    const qs = $('qs-quality'); if (qs) qs.value = this.gfx.quality;
    document.querySelectorAll('#lv4-q-seg button').forEach(b => b.classList.toggle('active', b.dataset.q === this.gfx.quality));
    document.querySelectorAll('#lv4-fps-seg button').forEach(b => b.classList.toggle('active', parseInt(b.dataset.fps, 10) === (this.gfx.fps || 0)));
    const scaleLbl = $('lv4-scale-label'); if (scaleLbl) scaleLbl.textContent = `${Math.round((this.gfx.scale || 1) * 100)}%`;
    const desc = $('lv4-q-desc');
    if (desc) desc.textContent = (this.gfx.quality === 'auto' ? `Auto picked ${Q.label} for this device. ` : '') + Q.desc;
    const ro = $('lv4-q-readout');
    if (ro) {
      const aaNow = this._lv4BootAA, aaWant = QUALITY[q].aa && !(q === 'medium' && this.detectMobile());
      const item = (k, v, on = true) => `<span class="${on ? '' : 'off'}"><small>${k}</small>${v}</span>`;
      ro.innerHTML = item('PIXELS', `${(cur.dpr || 1).toFixed(2)}x`)
        + item('SHADOWS', cur.shadows ? `${cur.shadows}` : 'OFF', !!cur.shadows)
        + item('BLOOM / HDR', cur.post ? 'ON' : 'OFF', !!cur.post)
        + item('VIEW', `${Math.round(Q.fog * 100)}%`)
        + item('FOLIAGE', Q.density === 'low' ? 'LIGHT' : 'FULL')
        + item('EFFECTS', (Q.fx === 'low' || this.forceMobileUI) ? 'LIGHT' : 'FULL')
        + (aaNow !== undefined && aaNow !== aaWant ? `<span class="lv4-note">Anti-aliasing change applies after reload</span>` : '')
        + (this.matchActive ? '' : `<span class="lv4-note">Foliage applies from the next match</span>`);
    }
  };

  const oQS = P.toggleQuickSettings;
  P.toggleQuickSettings = function () {
    const r = oQS.apply(this, arguments);
    const qs = $('qs-quality'); if (qs && this.gfx) qs.value = this.gfx.quality;
    return r;
  };

  // ------------------------------------------------------------- LEGEND SELECT OVERLAY
  const oLS = P.openLegendSelectSequence;
  P.openLegendSelectSequence = function () {
    const r = oLS.apply(this, arguments);
    try {
      const roster = $('legend-select-grid');
      const keys = Object.keys(DATA().HEROES);
      if (roster) roster.querySelectorAll('.ls-hero-tile').forEach((t, i) => {
        const h = DATA().HEROES[keys[i]]; if (!h) return;
        t.innerHTML = `<img src="${UI}hero_${h.id}.webp" alt="" ${imgErr}/><div class="ls-name">${esc(h.name)}</div><div class="ls-role">${esc(shortRole(h))}</div>`;
      });
      const btn = $('btn-legend-lockin'); if (btn) btn.textContent = 'LOCK IN';
    } catch (e) {}
    return r;
  };
})();
