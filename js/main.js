/**
 * GOD WARS: ASGARD ROYALE — COMPLETE APEX LEGENDS ENGINE (LOBBY TO ENDGAME)
 * - Full-Screen 3D Trio Squad Lobby Stage (Your Hero + 2 Allied Squadmates on 3D Valhalla Pedestals)
 * - Game Modes: Trios Squad Royale (3v3 Squads with 2 AI Allied Teammates), Solos Royale (16P FFA), Firing Range
 * - 3rd-Person Skydive Camera with Glowing Bifrost Dive Trails -> Seamless 1st-Person FPS Combat Camera
 * - 4-Slot Weapon Attachment System (Barrel, Extended Mag, Optic Sight, Divine Hop-Up) + Fire Mode Toggle [B]
 * - Gold Auto-Loader Mag Holstered Reload + Digital Threat Optic Highlight
 * - Squadmate Live Status HUD, 3D Projected Ally Nameplates, Teammate Revives & First-Person Knockdown Shield
 * - Center-Screen Cast Progress Bar for Shield Cells/Batteries/Medkits/Phoenix Kits & Interactive Backpack [I]
 */

// Pointer lock throws (or returns a rejecting promise) on touch devices, iframes and file://.
// Never let that abort the click handler that is starting a match.
window.gwSafePointerLock = function (el) {
  if (!el || !el.requestPointerLock) return;
  try {
    const r = el.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (e) { /* unsupported here; mouse-look falls back to drag */ }
};

class GodWarsGame {
  constructor() {
    this.selectedHeroId = 'thor';
    this.selectedLoadout = ['m4a1', 'p90'];
    this.selectedGrenadeId = 'solar_bomb';
    this.selectedHealId = 'shield_battery';
    this.gameMode = 'trios'; // 'trios' | 'solos' | 'firing_range'
    this.forceMobileUI = this.detectMobile();
    this.qualityPreset = this.forceMobileUI ? 'mobile' : 'balanced';
    this.fov = parseInt(localStorage.getItem('godwars_fov') || '84', 10);
    this.selectedWeaponSkin = localStorage.getItem('godwars_skin') || 'divine_default';
    this.rangeSettings = { movingDummies: true, combatDummies: false };
    this.activePerkOffer = null;
    this.lookSensitivity = 1.0;
    this.mobileAutoFire = false;
    this.mobileAimAssist = true;
    this.mobileAutoLoot = true;
    this.visualSoundRadar = true;
    this.mobileGyroEnabled = false;
    this.mobileHaptics = true;
    this.autoSprintLocked = false;
    this.portraitDismissed = false;
    this.lobbyOrbitYaw = 0;
    this.lobbyDragActive = false;
    this.lobbyDragLastX = 0;
    this.thirdPersonMode = false;
    this.comboHits = 0;
    this.comboDmg = 0;
    this.comboTimer = 0;
    this.slowMoTimer = 0;
    this.fovKick = 0;
    this.camShake = 0;
    this.multiKillCount = 0;
    this.lastKillTimestamp = 0;
    this.prevPlayerYaw = 0;
    this.prevPlayerPitch = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.gyroLastBeta = null;
    this.gyroLastGamma = null;
    this.touchScale = parseFloat(localStorage.getItem('godwars_touch_scale') || '1.0');

    this.matchActive = false;
    this.isFiringRange = false;
    this.matchTime = 0;
    this.carePackageTimer = 30;
    this.bots = [];
    this.allies = [];
    this.killLeader = null;
    this.activePing = null;
    this.lastHitTarget = null;
    this.lastHitTime = 0;
    this.spectateIndex = 0;
    this.isSpectating = false;

    this.keys = {};
    this.mouseDown = false;
    this.rightMouseDown = false;

    this.touchMove = { active: false, id: null, startX: 0, startY: 0, dx: 0, dy: 0 };
    this.touchLook = { active: false, id: null, lastX: 0, lastY: 0 };
    this.touchFiring = false;

    this.loadCareerStats();
    this.initGameRenderer();
    this.initLobby3DStage();
    this.initLobbyUI();
    this.initInputHandlers();
    this.initMobileCompatibilitySystem();
    this.initLobbyMusicAutoUnlock();

    this.lastTime = performance.now();
    this.fpsFrames = 0;
    this.fpsTimer = 0;
    requestAnimationFrame((t) => this.loop(t));
  }

  initLobbyMusicAutoUnlock() {
    window.SFX.initLobbyMusic();
    window.SFX.playLobbyMusic();

    const unlock = () => {
      window.SFX.init();
      if (!this.matchActive && window.SFX.musicEnabled) {
        window.SFX.playLobbyMusic();
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && window.innerWidth <= 1024);
  }

  // =========================================================================
  // PERSISTENT CAREER STATS & ASGARD PREDATOR RANK
  // =========================================================================
  loadCareerStats() {
    try {
      const raw = localStorage.getItem('godwars_career_v2');
      this.career = raw ? JSON.parse(raw) : { matches: 0, wins: 0, kills: 0, maxDmg: 0, rp: 160 };
    } catch (e) {
      this.career = { matches: 0, wins: 0, kills: 0, maxDmg: 0, rp: 160 };
    }
    this.updateCareerLobbyUI();
  }

  saveCareerStats(isWin, kills, dmg) {
    if (this.isFiringRange) return;
    this.career.matches++;
    if (isWin) this.career.wins++;
    this.career.kills += kills;
    if (dmg > this.career.maxDmg) this.career.maxDmg = Math.round(dmg);
    this.career.rp += (isWin ? 130 : 18) + kills * 24 + Math.floor(dmg / 45);
    try {
      localStorage.setItem('godwars_career_v2', JSON.stringify(this.career));
    } catch (e) {}
    this.updateCareerLobbyUI();
  }

  getRankInfo(rp) {
    if (rp >= 1500) return { name: 'ASGARD PREDATOR', icon: '👑', color: '#f43f5e' };
    if (rp >= 950)  return { name: 'VALHALLA MASTER', icon: '💎', color: '#a855f7' };
    if (rp >= 550)  return { name: 'BIFROST DIAMOND', icon: '💠', color: '#38bdf8' };
    if (rp >= 280)  return { name: 'OLYMPIAN GOLD',   icon: '🏆', color: '#fbbf24' };
    return { name: 'EINHERJAR SILVER', icon: '⚔️', color: '#94a3b8' };
  }

  updateCareerLobbyUI() {
    const rank = this.getRankInfo(this.career.rp);
    const elRank = document.getElementById('career-rank-badge');
    if (elRank) {
      elRank.innerHTML = `${rank.icon} <span style="color:${rank.color}">${rank.name}</span> <b>${this.career.rp} RP</b> • 🏆 ${this.career.wins} WINS • ☠️ ${this.career.kills} KILLS`;
    }
  }

  // =========================================================================
  // FULL-SCREEN 3D APEX LEGENDS TRIO SQUAD LOBBY STAGE
  // =========================================================================
  initLobby3DStage() {
    this.lobbyScene = new THREE.Scene();
    this.lobbyScene.background = new THREE.Color(0x070d1f);
    this.lobbyScene.fog = new THREE.FogExp2(0x070d1f, 0.035);
    if (this.pmremEnvTexture) {
      this.lobbyScene.environment = this.pmremEnvTexture;
    }

    this.lobbyCamera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
    this.lobbyCamera.position.set(0, 1.55, 5.4);
    this.lobbyCamera.lookAt(0, 1.15, 0);

    const hemi = new THREE.HemisphereLight(0xfef08a, 0x0f172a, 1.05);
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.45);
    keyLight.position.set(4, 8, 6);
    const rimLight = new THREE.PointLight(0x38bdf8, 1.4, 18);
    rimLight.position.set(0, 3.5, -3.5);
    this.lobbyScene.add(hemi, keyLight, rimLight);
    hemi.intensity = 0.55; keyLight.intensity = 0.9;

    // --- Showcase stage pass: per-pedestal spotlights w/ soft shadows, light shafts, back colonnade, dust motes
    const stageFx = new THREE.Group();
    [[-2.6, 0.82, 0x7dd3fc], [0, 1.0, 0xfff1c9], [2.6, 0.82, 0xfdba74]].forEach(([sx, k, col]) => {
      const spot = new THREE.SpotLight(col, 2.4 * k, 14, 0.42, 0.55, 1.4);
      spot.position.set(sx * 0.9, 7.2, 2.6);
      spot.target.position.set(sx, 0.4, 0);
      spot.castShadow = true;
      spot.shadow.mapSize.set(512, 512);
      spot.shadow.bias = -0.0008;
      stageFx.add(spot, spot.target);
      // visible additive light shaft
      const shaft = new THREE.Mesh(
        new THREE.ConeGeometry(1.35, 7.2, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      shaft.position.set(sx * 0.95, 3.6, 1.3);
      shaft.lookAt(sx, 7.2 + 3.6, 2.6 + 1.3);
      shaft.rotateX(Math.PI / 2);
      stageFx.add(shaft);
    });
    // colonnade backdrop
    const colMat = new THREE.MeshStandardMaterial({ color: 0x2b3446, roughness: 0.7, metalness: 0.2 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.45, metalness: 0.6 });
    for (let i = -4; i <= 4; i++) {
      if (Math.abs(i) < 2) continue;
      const x = i * 1.55, z = -5.2 - Math.abs(i) * 0.35;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.33, 6.5, 16), colMat);
      col.position.set(x, 3.25, z);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 0.85), capMat);
      cap.position.set(x, 6.55, z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 0.85), capMat);
      base.position.set(x, 0.15, z);
      stageFx.add(col, cap, base);
    }
    // dust motes
    const moteGeo = new THREE.BufferGeometry();
    const moteN = 260, motePos = new Float32Array(moteN * 3);
    for (let i = 0; i < moteN; i++) { motePos[i * 3] = (Math.random() - 0.5) * 10; motePos[i * 3 + 1] = Math.random() * 6; motePos[i * 3 + 2] = (Math.random() - 0.5) * 6; }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    this.lobbyMotes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xffe7a3, size: 0.035, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    stageFx.add(this.lobbyMotes);
    this.lobbyScene.add(stageFx);

    // Reflective Golden Valhalla Stage Floor
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 0.2, 48),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.2 })
    );
    floor.position.y = -0.1;
    this.lobbyScene.add(floor);

    // 3 Trio Squad Pedestals (Center Player, Left Squadmate 1, Right Squadmate 2)
    const pedMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.92, roughness: 0.18 });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    this.lobbyPedestals = [];
    [
      [0, 0, 0, 1.05],
      [-1.95, 0, -0.85, 0.88],
      [1.95, 0, -0.85, 0.88]
    ].forEach(([px, py, pz, scale]) => {
      const pedGroup = new THREE.Group();
      pedGroup.position.set(px, py, pz);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.95 * scale, 1.15 * scale, 0.16, 32), pedMat);
      cyl.position.y = 0.08;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.02 * scale, 0.03, 8, 32), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.16;
      pedGroup.add(cyl, ring);
      this.lobbyScene.add(pedGroup);

      const charMount = new THREE.Group();
      charMount.position.set(px, 0.16, pz);
      this.lobbyScene.add(charMount);
      this.lobbyPedestals.push({ pedGroup, charMount, ring });
    });

    // Background Glowing Bifrost Stargate Ring behind the Trio Squad
    this.lobbyStargate = new THREE.Mesh(
      new THREE.TorusGeometry(3.6, 0.14, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    this.lobbyStargate.position.set(0, 2.2, -3.2);
    this.lobbyScene.add(this.lobbyStargate);

    const innerGate = new THREE.Mesh(
      new THREE.CircleGeometry(3.45, 36),
      new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.22 })
    );
    innerGate.position.set(0, 2.2, -3.25);
    this.lobbyScene.add(innerGate);

    this.updateLobby3DSquad();
  }

  getSquadAllyHeroes() {
    const allKeys = Object.keys(window.GODWARS_DATA.HEROES).filter(k => k !== this.selectedHeroId);
    return [allKeys[0] || 'loki', allKeys[4] || 'valkyrie'];
  }

  updateLobby3DSquad(inspectWeaponId = null) {
    if (!this.lobbyPedestals) return;

    // Clear existing pedestal mounts
    this.lobbyPedestals.forEach(p => {
      while (p.charMount.children.length > 0) {
        p.charMount.remove(p.charMount.children[0]);
      }
    });

    if (inspectWeaponId) {
      // Weapon 3D Showcase on Center Pedestal
      const wep = window.ModelFactory.createWeaponModel(inspectWeaponId, this.selectedHeroId, false, true);
      wep.scale.set(3.6, 3.6, 3.6);
      wep.position.set(0, 1.25, 0);
      this.lobbyPedestals[0].charMount.add(wep);
      this.lobbyPedestals[1].pedGroup.visible = false;
      this.lobbyPedestals[2].pedGroup.visible = false;
      return;
    }

    // Center Pedestal: Player Selected Hero
    const centerHero = window.ModelFactory.createHeroModel(this.selectedHeroId);
    this.lobbyPedestals[0].charMount.add(centerHero);

    // Side Pedestals: 2 Allied Squadmates (visible in Trios mode)
    const showSquad = this.gameMode === 'trios';
    const [ally1Id, ally2Id] = this.getSquadAllyHeroes();
    [ally1Id, ally2Id].forEach((aId, idx) => {
      const ped = this.lobbyPedestals[idx + 1];
      ped.pedGroup.visible = showSquad;
      ped.charMount.visible = showSquad;
      if (showSquad) {
        const allyMesh = window.ModelFactory.createHeroModel(aId);
        allyMesh.scale.set(0.92, 0.92, 0.92);
        allyMesh.rotation.y = idx === 0 ? 0.28 : -0.28;
        ped.charMount.add(allyMesh);
      }
    });

    // Update 2D Squad Nameplates in Lobby PLAY screen
    const hCenter = window.GODWARS_DATA.HEROES[this.selectedHeroId];
    const hAlly1 = window.GODWARS_DATA.HEROES[ally1Id];
    const hAlly2 = window.GODWARS_DATA.HEROES[ally2Id];
    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setTxt('stage-player-name', `${hCenter.classIcon} YOU • ${hCenter.name}`);
    setTxt('stage-player-role', `${hCenter.title} (${hCenter.role})`);
    setTxt('stage-ally1-name', showSquad ? `${hAlly1.classIcon} ALLY • ${hAlly1.name}` : 'SOLO MODE');
    setTxt('stage-ally2-name', showSquad ? `${hAlly2.classIcon} ALLY • ${hAlly2.name}` : 'SOLO MODE');
    const a1Box = document.getElementById('stage-tag-ally1');
    const a2Box = document.getElementById('stage-tag-ally2');
    if (a1Box) a1Box.classList.toggle('hidden', !showSquad);
    if (a2Box) a2Box.classList.toggle('hidden', !showSquad);
  }

  // =========================================================================
  // APEX LEGENDS LOBBY UI & NAVIGATION
  // =========================================================================
  initLobbyUI() {
    // Populate Quick Hero Bar on PLAY Tab + Full Hero Roster on LEGENDS Tab
    const renderHeroCards = (containerId, isCompact = false) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = '';
      Object.values(window.GODWARS_DATA.HEROES).forEach(h => {
        const btn = document.createElement('button');
        btn.className = `hero-card ${isCompact ? 'compact' : ''} ${h.id === this.selectedHeroId ? 'active' : ''}`;
        btn.dataset.hid = h.id;
        btn.style.setProperty('--hero-color', h.color);
        btn.innerHTML = isCompact
          ? `<span class="hc-icon">${h.classIcon}</span><span class="hc-name">${h.name}</span>`
          : `<div class="hero-card-role">${h.classIcon} ${h.role}</div>
             <div class="hero-card-name">${h.name}</div>
             <div class="hero-card-title">${h.title}</div>`;
        btn.addEventListener('click', () => {
          window.SFX.playHitmarker(false, true, false);
          this.selectHero(h.id);
        });
        el.appendChild(btn);
      });
    };

    renderHeroCards('play-quick-heroes', true);
    renderHeroCards('hero-roster', false);

    // Mode Selector Buttons (Trios / Solos / Firing Range)
    document.querySelectorAll('.mode-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.gameMode = btn.dataset.mode;
        const onlineFields = document.getElementById('online-arena-fields');
        if (onlineFields) onlineFields.classList.toggle('hidden', this.gameMode !== 'online');
        const nameEl = document.getElementById('online-name');
        if (nameEl && !nameEl.value) { try { nameEl.value = localStorage.getItem('godwars_online_name') || ''; } catch (e) {} }
        window.SFX.playReload();
        this.updateLobby3DSquad();
      });
    });

    // Populate Armory Weapon Selector Cards
    const weaponGridEl = document.getElementById('armory-weapon-grid');
    if (weaponGridEl) {
      weaponGridEl.innerHTML = '';
      Object.values(window.GODWARS_DATA.WEAPONS).forEach(w => {
        const item = document.createElement('div');
        item.className = `armory-card ${this.selectedLoadout.includes(w.id) ? 'equipped' : ''}`;
        item.dataset.wid = w.id;
        item.style.setProperty('--wep-color', w.color);
        item.innerHTML = `
          <div class="armory-base-tag">BASE: ${w.baseName} • ${w.ammoType}</div>
          <div class="armory-divine-name">${w.divineName}</div>
          <div class="armory-stats">
            <span>DMG <b>${w.damage}</b></span>
            <span>HEAD <b>${Math.round(w.damage * w.headshotMult)}</b></span>
            <span>RPM <b>${w.rpm}</b></span>
            <span>MAG <b>${w.magSize}</b></span>
          </div>
          <div class="armory-desc">${w.desc}</div>
          <div class="armory-actions">
            <button class="btn-slot1" data-slot="0" data-wid="${w.id}">SLOT 1</button>
            <button class="btn-slot2" data-slot="1" data-wid="${w.id}">SLOT 2</button>
            <button class="btn-preview-wep" data-wid="${w.id}">3D STAGE VIEW</button>
          </div>
        `;
        weaponGridEl.appendChild(item);
      });

      weaponGridEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const wid = btn.dataset.wid;
        if (btn.dataset.slot !== undefined) {
          const slotIdx = parseInt(btn.dataset.slot, 10);
          const otherIdx = slotIdx === 0 ? 1 : 0;
          if (this.selectedLoadout[otherIdx] === wid) {
            this.selectedLoadout[otherIdx] = this.selectedLoadout[slotIdx];
          }
          this.selectedLoadout[slotIdx] = wid;
          this.updateLoadoutBadges();
          this.updateLobby3DSquad(wid);
          window.SFX.playReload();
        } else if (btn.classList.contains('btn-preview-wep')) {
          this.updateLobby3DSquad(wid);
          window.SFX.playHitmarker(false, true, false);
        }
      });
    }

    const bombGridEl = document.getElementById('armory-bomb-grid');
    if (bombGridEl) {
      bombGridEl.innerHTML = '';
      Object.values(window.GODWARS_DATA.GRENADES).forEach(g => {
        const bCard = document.createElement('div');
        bCard.className = 'bomb-card';
        bCard.style.setProperty('--bomb-color', g.color);
        bCard.innerHTML = `
          <div class="bomb-icon">${g.icon}</div>
          <div class="bomb-info">
            <div class="bomb-type">${g.baseType}</div>
            <div class="bomb-name">${g.name}</div>
            <div class="bomb-desc">${g.desc}</div>
          </div>
        `;
        bombGridEl.appendChild(bCard);
      });
    }

    // Lobby Top Navigation Tabs
    document.querySelectorAll('.lobby-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lobby-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.lobby-tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.dataset.target;
        const panel = document.getElementById(targetId);
        if (panel) panel.classList.add('active');
        if (targetId === 'tab-play' || targetId === 'tab-legends') {
          this.updateLobby3DSquad(null);
        }
      });
    });

    // Main READY / DEPLOY Buttons -> Opens Apex Legend Select Screen first!
    const startBtn = document.getElementById('btn-start-match');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        window.SFX.init();
        window.SFX.playAbility('ultimate');
        if (this.gameMode === 'online' && window.NET) {
          const nameEl = document.getElementById('online-name');
          const roomEl = document.getElementById('online-room');
          const name = (nameEl && nameEl.value.trim()) || `GOD${Math.floor(Math.random() * 900 + 100)}`;
          try { localStorage.setItem('godwars_online_name', name); } catch (e) {}
          window.NET.startArena(name, (roomEl && roomEl.value.trim()) || 'ASGARD');
        } else if (this.gameMode === 'firing_range') {
          this.startBattleRoyaleMatch(true, true);
        } else {
          this.openLegendSelectSequence();
        }
      });
    }

    const lockInBtn = document.getElementById('btn-legend-lockin');
    if (lockInBtn) {
      lockInBtn.addEventListener('click', () => {
        this.confirmLegendSelectAndLaunch();
      });
    }

    // Lobby Music Mute/Unmute & Volume Controls (ZHU - Villain)
    const musicBtn = document.getElementById('btn-lobby-music');
    if (musicBtn) {
      musicBtn.addEventListener('click', () => {
        window.SFX.init();
        const isOn = window.SFX.toggleLobbyMusic();
        musicBtn.textContent = isOn ? '🎵 ZHU - VILLAIN' : '🔇 BGM MUTED';
        musicBtn.classList.toggle('muted', !isOn);
      });
    }

    const musicVol = document.getElementById('slider-music-volume');
    if (musicVol) {
      musicVol.addEventListener('input', (e) => {
        window.SFX.setLobbyMusicVolume(parseFloat(e.target.value));
      });
    }

    // Apex 4-Quadrant Radial Heal Wheel Buttons
    document.querySelectorAll('.radial-heal-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hid = btn.dataset.heal;
        this.selectedHealId = hid;
        document.getElementById('heal-wheel-modal').classList.add('hidden');
        if (!this.forceMobileUI) {
          const canvas = document.getElementById('game-canvas');
          window.gwSafePointerLock(canvas);
        }
        this.startHealing();
      });
    });

    // Death Box Quick Armor Swap & Loot All Buttons
    const btnArmorSwap = document.getElementById('btn-db-armor-swap');
    const btnLootAll = document.getElementById('btn-db-loot-all');
    const btnCloseDb = document.getElementById('btn-db-close');
    if (btnArmorSwap) {
      btnArmorSwap.addEventListener('click', () => {
        if (!this.activeDeathBox || !this.player) return;
        const loot = this.activeDeathBox.loot;
        if (loot.shieldTier > this.player.shieldTier) {
          this.player.shieldTier = loot.shieldTier;
          this.player.maxShield = window.GODWARS_DATA.EVO_TIERS[loot.shieldTier].maxShield;
        }
        this.player.shield = this.player.maxShield;
        window.SFX.playArmorSwap();
        this.closeDeathBoxModal();
        this.showBanner(`⚡ INSTANT ARMOR SWAP COMPLETE (100% LV${this.player.shieldTier} SHIELD)!`, '#38bdf8');
      });
    }
    if (btnLootAll) {
      btnLootAll.addEventListener('click', () => {
        if (!this.activeDeathBox) return;
        this.applyLootPackage(this.activeDeathBox.loot, `DEATH BOX (${this.activeDeathBox.victimName})`);
        this.activeDeathBox.opened = true;
        this.closeDeathBoxModal();
      });
    }
    if (btnCloseDb) {
      btnCloseDb.addEventListener('click', () => this.closeDeathBoxModal());
    }

    const quickDropBtn = document.getElementById('btn-instant-drop');
    if (quickDropBtn) {
      quickDropBtn.addEventListener('click', () => {
        window.SFX.init();
        window.SFX.playAbility('tactical');
        this.startBattleRoyaleMatch(true, this.gameMode === 'firing_range');
      });
    }

    const touchToggle = document.getElementById('toggle-mobile-hud');
    if (touchToggle) {
      touchToggle.checked = this.forceMobileUI;
      touchToggle.addEventListener('change', (e) => {
        this.forceMobileUI = e.target.checked;
        document.body.classList.toggle('mobile-mode', this.forceMobileUI);
        this.syncMobileHUDVisibility();
      });
    }

    const autoFireToggle = document.getElementById('toggle-auto-fire');
    if (autoFireToggle) {
      autoFireToggle.checked = this.mobileAutoFire;
      autoFireToggle.addEventListener('change', (e) => {
        this.mobileAutoFire = e.target.checked;
      });
    }

    // BATCH 6, 7, 8, 9: Mobile Aim Assist, Gyroscope, Haptics & Touch Scale
    const aimAssistToggle = document.getElementById('toggle-aim-assist');
    if (aimAssistToggle) {
      aimAssistToggle.checked = this.mobileAimAssist;
      aimAssistToggle.addEventListener('change', (e) => {
        this.mobileAimAssist = e.target.checked;
      });
    }

    const autoLootToggle = document.getElementById('toggle-auto-loot');
    if (autoLootToggle) {
      autoLootToggle.checked = this.mobileAutoLoot;
      autoLootToggle.addEventListener('change', (e) => {
        this.mobileAutoLoot = e.target.checked;
      });
    }

    const soundRadarToggle = document.getElementById('toggle-sound-radar');
    if (soundRadarToggle) {
      soundRadarToggle.checked = this.visualSoundRadar;
      soundRadarToggle.addEventListener('change', (e) => {
        this.visualSoundRadar = e.target.checked;
        const r = document.getElementById('visual-sound-radar');
        if (r && !this.visualSoundRadar) r.innerHTML = '';
      });
    }

    // BATCH 1: In-Match Quick Settings Gear Drawer, 1st/3rd Person Camera Toggle (🎥) & Tactical Utility Tray (⋯)
    const camToggleBtn = document.getElementById('btn-hud-cam-toggle');
    if (camToggleBtn) {
      camToggleBtn.addEventListener('click', () => this.toggleThirdPersonCamera());
    }
    const tacTrayBtn = document.getElementById('btn-hud-tac-tray');
    const tacTray = document.getElementById('mobile-tac-tray');
    if (tacTrayBtn && tacTray) {
      tacTrayBtn.addEventListener('click', () => {
        tacTray.classList.toggle('hidden');
        this.vibrate(10);
      });
    }
    const qsGearBtn = document.getElementById('btn-hud-quick-settings');
    if (qsGearBtn) qsGearBtn.addEventListener('click', () => this.toggleQuickSettings());
    const qsCloseBtn = document.getElementById('btn-qs-close');
    if (qsCloseBtn) qsCloseBtn.addEventListener('click', () => this.toggleQuickSettings());
    const qsFsBtn = document.getElementById('btn-qs-fullscreen');
    if (qsFsBtn) qsFsBtn.addEventListener('click', () => this.requestMobileFullscreenLandscape());
    const qsLobbyBtn = document.getElementById('btn-qs-lobby');
    if (qsLobbyBtn) qsLobbyBtn.addEventListener('click', () => {
      document.getElementById('quick-settings-modal').classList.add('hidden');
      this.returnToLobby();
    });

    const bindQs = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    bindQs('qs-sensitivity', 'input', (e) => { this.lookSensitivity = parseFloat(e.target.value); });
    bindQs('qs-touch-scale', 'input', (e) => {
      this.touchScale = parseFloat(e.target.value);
      document.documentElement.style.setProperty('--touch-scale', String(this.touchScale));
      try { localStorage.setItem('godwars_touch_scale', String(this.touchScale)); } catch (err) {}
    });
    bindQs('qs-aim-assist', 'change', (e) => { this.mobileAimAssist = e.target.checked; });
    bindQs('qs-auto-fire', 'change', (e) => { this.mobileAutoFire = e.target.checked; });
    bindQs('qs-auto-loot', 'change', (e) => { this.mobileAutoLoot = e.target.checked; });
    bindQs('qs-sound-radar', 'change', (e) => {
      this.visualSoundRadar = e.target.checked;
      const r = document.getElementById('visual-sound-radar');
      if (r && !this.visualSoundRadar) r.innerHTML = '';
    });
    bindQs('qs-gyro', 'change', (e) => { this.mobileGyroEnabled = e.target.checked; });

    // P1-1 FIXED: Interactive 3D Lobby Hero Drag-to-Rotate ONLY on empty stage/canvas (never hijacks scroll/sliders!)
    const lobbyCanvas = document.getElementById('game-canvas');
    if (lobbyCanvas) {
      const canOrbit = (target) => !this.matchActive && target && (target.id === 'game-canvas' || target.id === 'tab-play');
      const startOrbit = (x, target) => { if (canOrbit(target)) { this.lobbyDragActive = true; this.lobbyDragLastX = x; } };
      const moveOrbit = (x) => {
        if (!this.matchActive && this.lobbyDragActive) {
          this.lobbyOrbitYaw += (x - this.lobbyDragLastX) * 0.012;
          this.lobbyDragLastX = x;
        }
      };
      const endOrbit = () => { this.lobbyDragActive = false; };
      window.addEventListener('mousedown', (e) => startOrbit(e.clientX, e.target));
      window.addEventListener('mousemove', (e) => moveOrbit(e.clientX));
      window.addEventListener('mouseup', endOrbit);
      window.addEventListener('touchstart', (e) => { if (e.touches.length === 1) startOrbit(e.touches[0].clientX, e.target); }, { passive: true });
      window.addEventListener('touchmove', (e) => { if (e.touches.length === 1) moveOrbit(e.touches[0].clientX); }, { passive: true });
      window.addEventListener('touchend', endOrbit);
    }

    const gyroToggle = document.getElementById('toggle-gyro-aim');
    if (gyroToggle) {
      gyroToggle.checked = this.mobileGyroEnabled;
      gyroToggle.addEventListener('change', async (e) => {
        if (e.target.checked && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          try {
            const perm = await DeviceOrientationEvent.requestPermission();
            this.mobileGyroEnabled = (perm === 'granted');
            e.target.checked = this.mobileGyroEnabled;
          } catch (err) {
            this.mobileGyroEnabled = false;
            e.target.checked = false;
          }
        } else {
          this.mobileGyroEnabled = e.target.checked;
        }
        this.gyroLastBeta = null;
        this.gyroLastGamma = null;
      });
    }

    const hapticsToggle = document.getElementById('toggle-haptics');
    if (hapticsToggle) {
      hapticsToggle.checked = this.mobileHaptics;
      hapticsToggle.addEventListener('change', (e) => {
        this.mobileHaptics = e.target.checked;
        if (this.mobileHaptics) this.vibrate(25);
      });
    }

    const touchScaleSlider = document.getElementById('slider-touch-scale');
    const touchScaleLabel = document.getElementById('touch-scale-label');
    if (touchScaleSlider) {
      touchScaleSlider.value = this.touchScale;
      if (touchScaleLabel) touchScaleLabel.textContent = `${Math.round(this.touchScale * 100)}%`;
      document.documentElement.style.setProperty('--touch-scale', String(this.touchScale));
      touchScaleSlider.addEventListener('input', (e) => {
        this.touchScale = parseFloat(e.target.value);
        if (touchScaleLabel) touchScaleLabel.textContent = `${Math.round(this.touchScale * 100)}%`;
        document.documentElement.style.setProperty('--touch-scale', String(this.touchScale));
        try { localStorage.setItem('godwars_touch_scale', String(this.touchScale)); } catch (err) {}
      });
    }

    const sensSlider = document.getElementById('slider-sensitivity');
    if (sensSlider) {
      sensSlider.addEventListener('input', (e) => {
        this.lookSensitivity = parseFloat(e.target.value);
      });
    }

    // BATCH 10: Apex FOV Slider & Armory Weapon Skin Selector
    const fovSlider = document.getElementById('slider-fov');
    const fovLabel = document.getElementById('fov-value-label');
    if (fovSlider) {
      fovSlider.value = this.fov;
      if (fovLabel) fovLabel.textContent = `${this.fov}°`;
      fovSlider.addEventListener('input', (e) => {
        this.fov = parseInt(e.target.value, 10);
        if (fovLabel) fovLabel.textContent = `${this.fov}°`;
        if (this.camera) {
          this.camera.fov = this.fov;
          this.camera.updateProjectionMatrix();
        }
        try { localStorage.setItem('godwars_fov', String(this.fov)); } catch (err) {}
      });
    }

    const skinRow = document.getElementById('armory-skin-row');
    if (skinRow && window.GODWARS_DATA.WEAPON_SKINS) {
      skinRow.innerHTML = Object.values(window.GODWARS_DATA.WEAPON_SKINS).map(sk => `
        <button class="skin-chip-btn ${sk.id === this.selectedWeaponSkin ? 'active' : ''}" data-skin="${sk.id}" style="--skin-c:${sk.color}">
          ✨ ${sk.name}
        </button>
      `).join('');
      skinRow.querySelectorAll('.skin-chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.selectedWeaponSkin = btn.dataset.skin;
          try { localStorage.setItem('godwars_skin', this.selectedWeaponSkin); } catch (err) {}
          skinRow.querySelectorAll('.skin-chip-btn').forEach(b => b.classList.toggle('active', b === btn));
          window.SFX.playReload();
          this.updateLobby3DSquad(null);
        });
      });
    }

    // BATCH 1: Ping Wheel Buttons
    document.querySelectorAll('.radial-ping-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pType = btn.dataset.ping;
        document.getElementById('ping-wheel-modal').classList.add('hidden');
        if (!this.forceMobileUI) {
          const canvas = document.getElementById('game-canvas');
          window.gwSafePointerLock(canvas);
        }
        this.triggerApexPing(pType);
      });
    });

    // BATCH 5: Divine Ordnance Wheel Buttons
    document.querySelectorAll('.radial-ord-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedGrenadeId = btn.dataset.ord;
        document.getElementById('ordnance-wheel-modal').classList.add('hidden');
        if (!this.forceMobileUI) {
          const canvas = document.getElementById('game-canvas');
          window.gwSafePointerLock(canvas);
        }
        const gData = window.GODWARS_DATA.GRENADES[this.selectedGrenadeId];
        if (gData) this.showBanner(`EQUIPPED ORDNANCE: ${gData.name}`, gData.color);
        window.SFX.playReload();
      });
    });

    // BATCH 7: Firing Range Live Control Buttons
    const btnRangeStrafe = document.getElementById('btn-range-strafe');
    const btnRangeCombat = document.getElementById('btn-range-combat');
    const btnRangeReset = document.getElementById('btn-range-reset');
    if (btnRangeStrafe) {
      btnRangeStrafe.addEventListener('click', () => {
        this.rangeSettings.movingDummies = !this.rangeSettings.movingDummies;
        btnRangeStrafe.classList.toggle('active', this.rangeSettings.movingDummies);
        btnRangeStrafe.textContent = `🏃 STRAFE: ${this.rangeSettings.movingDummies ? 'ON' : 'OFF'}`;
      });
    }
    if (btnRangeCombat) {
      btnRangeCombat.addEventListener('click', () => {
        this.rangeSettings.combatDummies = !this.rangeSettings.combatDummies;
        btnRangeCombat.classList.toggle('active', this.rangeSettings.combatDummies);
        btnRangeCombat.textContent = `🔥 COMBAT: ${this.rangeSettings.combatDummies ? 'ON' : 'OFF'}`;
      });
    }
    if (btnRangeReset) {
      btnRangeReset.addEventListener('click', () => {
        this.bots.forEach(b => {
          b.alive = true;
          b.knocked = false;
          b.hp = b.maxHp;
          b.shield = b.maxShield;
          if (b.mesh) b.mesh.visible = true;
        });
        if (this.player) {
          this.player.shotsFired = 0;
          this.player.shotsHit = 0;
          this.player.headshotsLanded = 0;
        }
        window.SFX.playEvoUpgrade();
        this.showBanner('🎯 FIRING RANGE DUMMIES & SHIELDS RESET!', '#10b981');
      });
    }

    const qualitySelect = document.getElementById('select-quality');
    if (qualitySelect) {
      qualitySelect.value = this.qualityPreset;
      qualitySelect.addEventListener('change', (e) => {
        this.qualityPreset = e.target.value;
        this.applyQualityPreset();
      });
    }

    const fullscreenBtn = document.getElementById('btn-fullscreen');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    }

    this.selectHero(this.selectedHeroId);
  }

  selectHero(heroId) {
    this.selectedHeroId = heroId;
    const h = window.GODWARS_DATA.HEROES[heroId];
    if (!h) return;

    this.selectedLoadout = [...h.defaultWeapons];

    document.querySelectorAll('.hero-card').forEach(el => {
      el.classList.toggle('active', el.dataset.hid === heroId);
    });

    const setTxt = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    setTxt('info-hero-name', `${h.classIcon} ${h.name}`);
    setTxt('info-hero-title', `${h.title} • ${h.role}`);
    setTxt('info-hero-quote', h.quote);
    setTxt('info-hero-lore', h.lore);
    setTxt('info-passive-name', `${h.passiveName} • Melee: ${h.meleeName}`);
    setTxt('info-passive-desc', h.passiveDesc);
    setTxt('info-tactical-name', `${h.tacticalName} (${h.tacticalCooldown}s CD)`);
    setTxt('info-tactical-desc', h.tacticalDesc);
    setTxt('info-ult-name', `${h.ultimateName} • Finisher: ${h.finisherName}`);
    setTxt('info-ult-desc', h.ultimateDesc);

    // Also update compact Play tab ability preview
    setTxt('play-passive-pill', `PASSIVE: ${h.passiveName}`);
    setTxt('play-tactical-pill', `Q: ${h.tacticalName}`);
    setTxt('play-ult-pill', `Z: ${h.ultimateName}`);

    const badge = document.getElementById('info-hero-pantheon');
    if (badge) {
      badge.textContent = h.pantheon;
      badge.style.borderColor = h.color;
      badge.style.color = h.color;
    }

    this.updateLoadoutBadges();
    this.updateLobby3DSquad(null);
  }

  updateLoadoutBadges() {
    const w1 = window.GODWARS_DATA.WEAPONS[this.selectedLoadout[0]];
    const w2 = window.GODWARS_DATA.WEAPONS[this.selectedLoadout[1]];
    const el1 = document.getElementById('lobby-slot1-name');
    const el2 = document.getElementById('lobby-slot2-name');
    if (el1 && w1) el1.textContent = `1: ${w1.divineName}`;
    if (el2 && w2) el2.textContent = `2: ${w2.divineName}`;

    document.querySelectorAll('.armory-card').forEach(c => {
      c.classList.toggle('equipped', this.selectedLoadout.includes(c.dataset.wid));
    });
  }

  initGameRenderer() {
    const canvas = document.getElementById('game-canvas');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, window.innerWidth / window.innerHeight, 0.08, 650);
    this.camera.rotation.order = 'YXZ';

    this.viewmodelHolder = new THREE.Group();
    this.camera.add(this.viewmodelHolder);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.detectMobile(),
      powerPreference: 'high-performance'
    });
    // Euphoria Adventure High-Resolution Color Grading: ACES Filmic Tone Mapping + sRGB Output!
    if (THREE.ACESFilmicToneMapping !== undefined) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.9;
    }
    if (THREE.sRGBEncoding !== undefined) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }
    // P0-3 FIXED: Enable Real-Time Crisp Sun Shadows (Follow-Player 1024x1024 PCFSoftShadowMap!)
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.initPMREMEnvironment();
    this.applyQualityPreset();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      if (this.lobbyCamera) {
        this.lobbyCamera.aspect = window.innerWidth / window.innerHeight;
        this.lobbyCamera.updateProjectionMatrix();
      }
      this.applyQualityPreset();
    });
  }

  applyQualityPreset() {
    if (!this.renderer) return;
    let dpr = window.devicePixelRatio || 1;
    if (this.qualityPreset === 'mobile') dpr = Math.min(dpr, 1.15);
    else if (this.qualityPreset === 'balanced') dpr = Math.min(dpr, 1.65);
    else dpr = Math.min(dpr, 2.25);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // =========================================================================
  // P0-2 FIXED: PROCEDURAL PMREM HDRI ENVIRONMENT MAP (TRUE GLEAMING AAA PBR!)
  // Gives metallic gold, steel weapons, hero armor & marble realistic sky reflections!
  // =========================================================================
  initPMREMEnvironment() {
    if (!this.renderer || typeof THREE.PMREMGenerator !== 'function') return;
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x8b98aa); // muted daylight sky, not saturated navy

      // Warm Golden Sun Panel + Cool Azure Sky Panel + Emerald Ground Bounce
      const sunPanel = new THREE.Mesh(
        new THREE.PlaneGeometry(32, 32),
        new THREE.MeshBasicMaterial({ color: 0xfff3c4, side: THREE.DoubleSide })
      );
      sunPanel.position.set(18, 22, 16);
      sunPanel.lookAt(0, 0, 0);
      envScene.add(sunPanel);

      const skyPanel = new THREE.Mesh(
        new THREE.PlaneGeometry(45, 45),
        new THREE.MeshBasicMaterial({ color: 0xa9bfd8, side: THREE.DoubleSide })
      );
      skyPanel.position.set(-20, 26, -15);
      skyPanel.lookAt(0, 0, 0);
      envScene.add(skyPanel);

      const rimPanel = new THREE.Mesh(
        new THREE.PlaneGeometry(28, 16),
        new THREE.MeshBasicMaterial({ color: 0xd8b77a, side: THREE.DoubleSide })
      );
      rimPanel.position.set(0, 8, -24);
      rimPanel.lookAt(0, 0, 0);
      envScene.add(rimPanel);

      const groundBounce = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 50),
        new THREE.MeshBasicMaterial({ color: 0x5a4f3e, side: THREE.DoubleSide })
      );
      groundBounce.position.set(0, -16, 0);
      groundBounce.rotation.x = -Math.PI / 2;
      envScene.add(groundBounce);

      // Keep the env map as a reflection source, not a second sun: dim every panel so
      // diffuse IBL doesn't double the ambient term and wash the world out.
      envScene.traverse(o => { if (o.isMesh && o.material.color) o.material.color.multiplyScalar(0.42); });
      envScene.background.multiplyScalar(0.5);
      const rt = pmrem.fromScene(envScene, 0.04);
      this.pmremEnvTexture = rt.texture;
      this.scene.environment = this.pmremEnvTexture;
      if (this.lobbyScene) this.lobbyScene.environment = this.pmremEnvTexture;
      pmrem.dispose();
    } catch (e) {}
  }

  // =========================================================================
  // 10-BATCH MOBILE PHONE COMPATIBILITY SYSTEM (ORIENTATION, GYRO, HAPTICS, AIM ASSIST)
  // =========================================================================
  initMobileCompatibilitySystem() {
    document.body.classList.toggle('mobile-mode', this.forceMobileUI);
    document.documentElement.style.setProperty('--touch-scale', String(this.touchScale));

    // Mandatory Landscape Guidance for iPhone 16 Plus & Mobile Phones
    const checkOrientation = () => {
      const rotOverlay = document.getElementById('rotate-landscape-overlay');
      if (!rotOverlay) return;
      const isPortrait = window.innerHeight > window.innerWidth;
      if (this.forceMobileUI && isPortrait) {
        rotOverlay.classList.remove('hidden');
      } else {
        rotOverlay.classList.add('hidden');
        // Smoothly hide iOS Safari address bar when rotated to landscape
        if (this.forceMobileUI) window.scrollTo(0, 1);
      }
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 180));

    const btnForceLand = document.getElementById('btn-force-landscape');
    if (btnForceLand) {
      btnForceLand.addEventListener('click', () => {
        this.requestMobileFullscreenLandscape();
        window.scrollTo(0, 1);
        checkOrientation();
      });
    }

    // Batch 7: Mobile Gyroscope Aim Listener
    window.addEventListener('deviceorientation', (e) => {
      if (!this.mobileGyroEnabled || !this.matchActive || !this.player || !this.player.alive) return;
      if (e.beta === null || e.gamma === null) return;
      if (this.gyroLastBeta === null) {
        this.gyroLastBeta = e.beta;
        this.gyroLastGamma = e.gamma;
        return;
      }
      const dBeta = e.beta - this.gyroLastBeta;
      const dGamma = e.gamma - this.gyroLastGamma;
      this.gyroLastBeta = e.beta;
      this.gyroLastGamma = e.gamma;

      // In landscape, beta controls yaw and gamma controls pitch
      const isLandscape = window.innerWidth >= window.innerHeight;
      const gSens = 0.011 * this.lookSensitivity * (this.player.isADS ? 0.65 : 1.0);
      if (isLandscape) {
        if (Math.abs(dBeta) < 12) this.player.yaw -= dBeta * gSens;
        if (Math.abs(dGamma) < 12) this.player.pitch = Math.max(-1.42, Math.min(1.42, this.player.pitch + dGamma * gSens));
      } else {
        if (Math.abs(dGamma) < 12) this.player.yaw -= dGamma * gSens;
        if (Math.abs(dBeta) < 12) this.player.pitch = Math.max(-1.42, Math.min(1.42, this.player.pitch + dBeta * gSens));
      }
    });
  }

  requestMobileFullscreenLandscape() {
    const elem = document.documentElement;
    const fsReq = elem.requestFullscreen || elem.webkitRequestFullscreen;
    if (fsReq) {
      try {
        const p = fsReq.call(elem);
        if (p && p.then) {
          p.then(() => {
            if (screen.orientation && screen.orientation.lock) {
              screen.orientation.lock('landscape').catch(() => {});
            }
          }).catch(() => {});
        }
      } catch (e) {}
    } else if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  }

  vibrate(ms = 12) {
    if (!this.mobileHaptics || !this.forceMobileUI) return;
    if (navigator && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(ms); } catch (e) {}
    }
  }

  toggleQuickSettings() {
    const modal = document.getElementById('quick-settings-modal');
    if (!modal) return;
    const opening = modal.classList.contains('hidden');
    if (opening) {
      if (document.exitPointerLock) document.exitPointerLock();
      const setVal = (id, v, isCheck = false) => { const el = document.getElementById(id); if (el) { if (isCheck) el.checked = v; else el.value = v; } };
      setVal('qs-sensitivity', this.lookSensitivity);
      setVal('qs-touch-scale', this.touchScale);
      setVal('qs-aim-assist', this.mobileAimAssist, true);
      setVal('qs-auto-fire', this.mobileAutoFire, true);
      setVal('qs-auto-loot', this.mobileAutoLoot, true);
      setVal('qs-sound-radar', this.visualSoundRadar, true);
      setVal('qs-gyro', this.mobileGyroEnabled, true);
      modal.classList.remove('hidden');
    } else {
      modal.classList.add('hidden');
      if (!this.forceMobileUI) {
        const canvas = document.getElementById('game-canvas');
        window.gwSafePointerLock(canvas);
      }
    }
  }

  // BATCH 2 & 5: Apex Mobile Smart Auto-Loot Pickup & Auto-Open Doors on Approach
  updateMobileAutoLootAndDoors() {
    if (!this.mobileAutoLoot || !this.player || !this.player.alive || this.player.knocked || this.player.skydiving) return;
    const p = this.player;

    // Auto-open nearby closed doors on approach
    if (this.world && this.world.doors) {
      for (const door of this.world.doors) {
        if (!door.open && !door.destroyed) {
          const dist = Math.hypot(p.position.x - door.x, p.position.z - door.z);
          if (dist < 2.35 && Math.abs(p.position.y - door.y) < 2.2) {
            this.toggleDoor(door);
          }
        }
      }
    }

    // Auto-pickup nearby ground loot (Ammo, Heals, Better Evo Shield, Attachments)
    if (this.world && this.world.groundLoot) {
      for (const gl of this.world.groundLoot) {
        if (gl.picked) continue;
        const dist = Math.hypot(p.position.x - gl.x, p.position.z - gl.z);
        if (dist < 2.3 && Math.abs(p.position.y - gl.y) < 1.8) {
          gl.picked = true;
          if (gl.mesh) gl.mesh.visible = false;
          const loot = gl.loot;
          if (loot.shieldTier > p.shieldTier) {
            p.shieldTier = loot.shieldTier;
            p.maxShield = window.GODWARS_DATA.EVO_TIERS[loot.shieldTier].maxShield;
            p.shield = p.maxShield;
            window.SFX.playArmorSwap();
            this.showBanner(`⚡ AUTO-EQUIPPED LV${loot.shieldTier} RUNE ARMOR!`, window.GODWARS_DATA.EVO_TIERS[loot.shieldTier].color);
          } else {
            p.heals.shield_cell += 2;
            p.heals.shield_battery += 1;
            const activeWep = p.weapons[p.activeSlot];
            if (activeWep) activeWep.reserve += activeWep.maxMag;
            window.SFX.playReload();
            this.showBanner('📦 AUTO-LOOT: AMMO & SHIELD CELLS PICKED UP', '#38bdf8');
          }
          this.vibrate(14);
          break;
        }
      }
    }
  }

  // BATCH 3: Apex Mobile 360° Visual Sound Radar (Footsteps, Gunfire & Grenades)
  updateVisualSoundRadar() {
    const radar = document.getElementById('visual-sound-radar');
    if (!radar || !this.player || !this.player.alive) return;
    if (!this.visualSoundRadar) {
      if (radar.innerHTML !== '') radar.innerHTML = '';
      return;
    }

    const p = this.player;
    const arcs = [];

    for (const bot of this.bots) {
      if (!bot.alive || bot.inDropship || bot.isAlly) continue;
      const dx = bot.position.x - p.position.x;
      const dz = bot.position.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      const isShooting = bot.fireTimer > 0 && bot.fireTimer < 0.25;
      if (dist < 26 || (isShooting && dist < 68)) {
        const angleToBot = Math.atan2(dx, -dz);
        const relAngle = angleToBot + p.yaw;
        arcs.push({
          angle: relAngle,
          color: isShooting ? '#f43f5e' : '#f97316',
          icon: isShooting ? '🔫' : '👣'
        });
      }
    }

    if (this.combat && this.combat.grenades) {
      for (const g of this.combat.grenades) {
        const dx = g.mesh.position.x - p.position.x;
        const dz = g.mesh.position.z - p.position.z;
        if (Math.hypot(dx, dz) < 16) {
          const relAngle = Math.atan2(dx, -dz) + p.yaw;
          arcs.push({ angle: relAngle, color: '#fde047', icon: '💥' });
        }
      }
    }

    radar.innerHTML = arcs.slice(0, 5).map(a => `
      <div class="radar-arc" style="--arc-color:${a.color};transform:rotate(${a.angle}rad)">
        <span class="radar-arc-icon">${a.icon}</span>
      </div>
    `).join('');
  }

  // BATCH 6: Smart Context Heal Suggestion for Mobile
  updateSmartHealSuggestion() {
    const p = this.player;
    if (!p || !p.alive || p.healingTimer > 0) return;
    const shieldMissing = p.maxShield - p.shield;
    const hpMissing = p.maxHp - p.hp;
    let bestHeal = this.selectedHealId;

    if (shieldMissing >= 50 && hpMissing >= 40 && p.heals.phoenix_kit > 0) bestHeal = 'phoenix_kit';
    else if (shieldMissing >= 45 && p.heals.shield_battery > 0) bestHeal = 'shield_battery';
    else if (shieldMissing > 0 && p.heals.shield_cell > 0) bestHeal = 'shield_cell';
    else if (hpMissing >= 25 && p.heals.medkit > 0) bestHeal = 'medkit';

    if (bestHeal && (p.heals[bestHeal] || 0) > 0) {
      this.selectedHealId = bestHeal;
    }
    const healBtn = document.getElementById('btn-touch-heal');
    if (healBtn) {
      const needsHeal = (shieldMissing >= 25 || hpMissing >= 30) && (p.heals[this.selectedHealId] || 0) > 0;
      healBtn.classList.toggle('smart-glow', needsHeal);
    }
  }

  // Batch 6: Apex Mobile Magnetic Aim Assist (gently tracks enemy torso when aiming/firing on HP)
  applyMobileAimAssist(dt) {
    if (!this.forceMobileUI || !this.mobileAimAssist || !this.player || !this.player.alive || this.player.skydiving) return;
    const p = this.player;
    const camPos = this.camera.position;
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

    let bestTarget = null;
    let bestDot = p.isADS ? 0.982 : 0.968;
    for (const bot of this.bots) {
      if (!bot.alive || bot.inDropship || bot.isAlly) continue;
      const aimPt = new THREE.Vector3(bot.position.x, bot.position.y + 1.32, bot.position.z);
      const dist = camPos.distanceTo(aimPt);
      if (dist > 85) continue;
      const toBot = aimPt.sub(camPos).normalize();
      const dot = lookDir.dot(toBot);
      if (dot > bestDot) {
        bestDot = dot;
        bestTarget = { dir: toBot };
      }
    }

    if (bestTarget && (this.touchFiring || p.isADS || this.touchLook.active)) {
      const desiredYaw = Math.atan2(-bestTarget.dir.x, -bestTarget.dir.z);
      const desiredPitch = Math.asin(Math.max(-0.98, Math.min(0.98, bestTarget.dir.y)));
      let yawDiff = desiredYaw - p.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      const pull = Math.min(1, dt * (this.touchFiring ? 7.5 : 4.2));
      p.yaw += yawDiff * pull;
      p.pitch += (desiredPitch - p.pitch) * pull;
    }
  }

  // =========================================================================
  // APEX PRE-MATCH LEGEND SELECT SEQUENCE + HEAL WHEEL + DEATH BOX ARMOR SWAP
  // =========================================================================
  openLegendSelectSequence() {
    const modal = document.getElementById('legend-select-overlay');
    const roster = document.getElementById('legend-select-grid');
    if (!modal || !roster) {
      this.startBattleRoyaleMatch(false, false);
      return;
    }

    roster.innerHTML = '';
    Object.values(window.GODWARS_DATA.HEROES).forEach(h => {
      const tile = document.createElement('button');
      tile.className = `ls-hero-tile ${h.id === this.selectedHeroId ? 'active' : ''}`;
      tile.style.setProperty('--hero-color', h.color);
      tile.innerHTML = `<div class="ls-icon">${h.classIcon}</div><div class="ls-name">${h.name}</div><div class="ls-role">${h.role.split('/')[0]}</div>`;
      tile.addEventListener('click', () => {
        window.SFX.playHitmarker(true, true, false);
        this.selectHero(h.id);
        roster.querySelectorAll('.ls-hero-tile').forEach(t => t.classList.remove('active'));
        tile.classList.add('active');
        this.updateLegendSelectBanner();
      });
      roster.appendChild(tile);
    });

    this.updateLegendSelectBanner();
    modal.classList.remove('hidden');

    let countdown = 6;
    const timerEl = document.getElementById('ls-timer-count');
    if (timerEl) timerEl.textContent = `${countdown}s`;
    clearInterval(this.lsInterval);
    this.lsInterval = setInterval(() => {
      countdown--;
      if (timerEl) timerEl.textContent = `${countdown}s`;
      if (countdown <= 0) {
        this.confirmLegendSelectAndLaunch();
      }
    }, 1000);
  }

  updateLegendSelectBanner() {
    const h = window.GODWARS_DATA.HEROES[this.selectedHeroId];
    const [a1, a2] = this.getSquadAllyHeroes();
    const elQuote = document.getElementById('ls-hero-quote');
    const elSquad = document.getElementById('ls-squad-picks');
    if (elQuote) elQuote.textContent = `${h.name}: ${h.quote}`;
    if (elSquad) {
      elSquad.innerHTML = this.gameMode === 'trios'
        ? `<span>PICK 1: <b>YOU (${h.name})</b></span><span>PICK 2: <b>ALLY (${a1.toUpperCase()})</b></span><span>PICK 3: <b>ALLY (${a2.toUpperCase()})</b></span>`
        : `<span>SOLO CONTENDER: <b>YOU (${h.name})</b> • 16 PLAYERS FFA</span>`;
    }
  }

  confirmLegendSelectAndLaunch() {
    clearInterval(this.lsInterval);
    const modal = document.getElementById('legend-select-overlay');
    if (modal) modal.classList.add('hidden');
    this.startBattleRoyaleMatch(false, false);
  }

  toggleHealWheel() {
    const modal = document.getElementById('heal-wheel-modal');
    if (!modal || !this.player) return;
    const opening = modal.classList.contains('hidden');
    if (opening) {
      if (document.exitPointerLock) document.exitPointerLock();
      Object.keys(window.GODWARS_DATA.HEAL_ITEMS).forEach(hid => {
        const el = document.getElementById(`wheel-cnt-${hid}`);
        if (el) el.textContent = `x${this.player.heals[hid] || 0}`;
      });
      modal.classList.remove('hidden');
    } else {
      modal.classList.add('hidden');
      if (!this.forceMobileUI) {
        const canvas = document.getElementById('game-canvas');
        window.gwSafePointerLock(canvas);
      }
    }
  }

  openDeathBoxModal(bin) {
    this.activeDeathBox = bin;
    const modal = document.getElementById('deathbox-modal');
    if (!modal) {
      this.applyLootPackage(bin.loot, `DEATH BOX (${bin.victimName})`);
      return;
    }
    if (document.exitPointerLock) document.exitPointerLock();
    const wData = window.GODWARS_DATA.WEAPONS[bin.loot.weaponId];
    const tInfo = window.GODWARS_DATA.EVO_TIERS[bin.loot.shieldTier] || window.GODWARS_DATA.EVO_TIERS[2];
    const titleEl = document.getElementById('db-victim-title');
    const detailsEl = document.getElementById('db-loot-details');
    if (titleEl) titleEl.textContent = `☠️ ${bin.victimName}’S DEATH BOX`;
    if (detailsEl) {
      detailsEl.innerHTML = `
        <div class="db-pill" style="border-color:${tInfo.color};color:${tInfo.color}">🛡️ ${tInfo.name} (${tInfo.maxShield} FRESH SHIELD)</div>
        <div class="db-pill" style="border-color:${wData.color};color:${wData.color}">🔫 ${wData.divineName} (LV${bin.loot.attachmentTier || 2} ATTACHMENTS)</div>
        <div class="db-pill" style="border-color:#38bdf8;color:#38bdf8">⚡ 2x Shield Battery • ➕ 1x Medkit • 💥 2x God Bombs</div>
      `;
    }
    modal.classList.remove('hidden');
  }

  closeDeathBoxModal() {
    this.activeDeathBox = null;
    const modal = document.getElementById('deathbox-modal');
    if (modal) modal.classList.add('hidden');
    if (!this.forceMobileUI) {
      const canvas = document.getElementById('game-canvas');
      window.gwSafePointerLock(canvas);
    }
  }

  // =========================================================================
  // START 16-PLAYER ASGARD BATTLE ROYALE (TRIOS / SOLOS / FIRING RANGE)
  // =========================================================================
  startBattleRoyaleMatch(instantGroundDrop = false, isFiringRange = false) {
    // Any non-arena start tears the online session down (NET.startArena sets isOnline first).
    if (!this.isOnline && window.NET && window.NET.connected) window.NET.leave();
    const loadOverlay = document.getElementById('asgard-loading-overlay');
    const loadFill = document.getElementById('loading-bar-fill');
    if (loadOverlay) {
      loadOverlay.classList.remove('hidden');
      if (loadFill) loadFill.style.width = '75%';
    }
    window.SFX.fadeOutLobbyMusic(1100);
    this.isFiringRange = isFiringRange;
    this.isSpectating = false;
    this.killLeader = null;
    this.activePing = null;
    this.lastHitTarget = null;
    this.carePackageTimer = window.GODWARS_DATA.MATCH_CONFIG.carePackageInterval;

    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    this.scene.add(this.camera);

    this.world = new window.AsgardWorld(this.scene);
    this.world.build();
    if (window.StaticBatcher) {
      try { window.StaticBatcher.batch(this.scene, this.world); } catch (e) { console.warn('StaticBatcher failed', e); }
      const batchWorld = this.world;
      window.StaticBatcher.batchWhenGLBReady(this.scene, this.world,
        () => this.world === batchWorld,
        () => [this.bots, this.allies, this.player, this.combat, this.dropship, this.camera, this.fpKnockShield, this.muzzleLight, this.activePing, this.viewmodelHolder]);
    }
    this.combat = new window.CombatManager(this);

    const hData = window.GODWARS_DATA.HEROES[this.selectedHeroId];
    const startTier = isFiringRange ? 4 : 2;
    const tierInfo = window.GODWARS_DATA.EVO_TIERS[startTier];
    const startAttLevel = isFiringRange ? 3 : 1;

    this.player = {
      isPlayer: true,
      teamId: 0,
      name: `YOU (${hData.name})`,
      heroId: this.selectedHeroId,
      alive: true,
      knocked: false,
      knockedHp: 85,
      knockdownShieldHp: 120,
      reviveProgress: 0,
      usedSelfRevive: false,
      inDropship: !instantGroundDrop && !isFiringRange,
      skydiving: false,
      ziplining: false,
      activeZipline: null,
      ziplineT: 0,
      ziplineDir: 1,
      finisherTimer: 0,
      inspectTimer: 0,
      meleeTimer: 0,
      revivingAllyTimer: 0,
      revivingTarget: null,
      holsteredReloadTimer: 0,
      maxHp: hData.maxHp,
      hp: hData.maxHp,
      shieldTier: startTier,
      maxShield: tierInfo.maxShield,
      shield: tierInfo.maxShield,
      kills: 0,
      damageDealt: isFiringRange ? 500 : 0,
      position: new THREE.Vector3(instantGroundDrop ? 22 : 0, instantGroundDrop || isFiringRange ? 3.5 : 118, instantGroundDrop ? 42 : isFiringRange ? 26 : -175),
      velocity: new THREE.Vector3(),
      yaw: instantGroundDrop ? Math.atan2(22, 42) : 0,
      pitch: 0,
      onGround: false,
      isSprinting: false,
      isSliding: false,
      slideTimer: 0,
      slideCooldown: 0,
      isADS: false,
      jetpackFuel: 100,
      thunderCharge: 0,
      tacticalCooldown: 0,
      ultCharge: isFiringRange ? 100 : 35,
      ultBuffTimer: 0,
      cloakTimer: 0,
      slowTimer: 0,
      flashBlindTimer: 0,
      ampedWallBonus: false,
      heals: {
        shield_cell: 6,
        shield_battery: 3,
        medkit: 2,
        phoenix_kit: 1
      },
      healTimer: 0,
      healDuration: 0,
      healingType: null,
      grenadeCounts: {
        solar_bomb: 3,
        apollo_flash: 2,
        yggdrasil_arc: 2
      },
      activeSlot: 0,
      weapons: this.selectedLoadout.map(wid => {
        const w = window.GODWARS_DATA.WEAPONS[wid];
        const magMult = window.GODWARS_DATA.ATTACHMENTS.mag.tiers[startAttLevel].capMult;
        const maxMag = Math.round(w.magSize * magMult);
        return {
          id: wid,
          data: w,
          mag: maxMag,
          maxMag,
          reserve: w.reserveAmmo,
          fireModeIndex: 0,
          burstRemaining: 0,
          isMythicGold: isFiringRange,
          attachments: {
            barrel: startAttLevel,
            mag: startAttLevel,
            optic: startAttLevel,
            hopup: startAttLevel
          },
          reloading: false,
          reloadTimer: 0
        };
      }),
      fireCooldown: 0
    };

    // 3rd-Person Hero Mesh for Skydiving & Knocked Down Camera!
    this.player.thirdPersonMesh = window.ModelFactory.createHeroModel(this.selectedHeroId);
    const trailGeo = new THREE.CylinderGeometry(0.1, 0.55, 8.5, 8);
    const trailMat = new THREE.MeshBasicMaterial({ color: hData.hexColor, transparent: true, opacity: 0.72 });
    const diveTrail = new THREE.Mesh(trailGeo, trailMat);
    diveTrail.position.set(0, 4.4, 0);
    this.player.thirdPersonMesh.add(diveTrail);
    this.player.diveTrail = diveTrail;
    this.player.thirdPersonMesh.visible = false;
    this.scene.add(this.player.thirdPersonMesh);

    // First-Person Knockdown Shield Frontal Mesh attached to Camera
    this.fpKnockShield = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.5),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
    );
    this.fpKnockShield.position.set(0, -0.1, -0.75);
    this.fpKnockShield.visible = false;
    this.camera.add(this.fpKnockShield);

    // Build Bifrost Dropship
    this.dropship = window.ModelFactory.createDropshipModel();
    this.dropship.position.set(-140, window.GODWARS_DATA.MATCH_CONFIG.dropshipHeight, -155);
    this.dropshipDir = new THREE.Vector3(140, 0, 155).normalize();
    this.dropship.rotation.y = Math.atan2(this.dropshipDir.x, this.dropshipDir.z);
    this.scene.add(this.dropship);

    // Spawn AI Contenders & Allied Trio Squadmates
    this.bots = [];
    this.allies = [];
    const heroKeys = Object.keys(window.GODWARS_DATA.HEROES);
    const weaponKeys = Object.keys(window.GODWARS_DATA.WEAPONS);
    const botNames = window.GODWARS_DATA.BOT_NAMES;
    const [ally1Hero, ally2Hero] = this.getSquadAllyHeroes();

    if (isFiringRange) {
      const dummyCoords = [[-10, 8], [0, 8], [10, 8], [-14, -6], [0, -8], [14, -6]];
      dummyCoords.forEach(([dx, dz], i) => {
        const bHero = heroKeys[i % heroKeys.length];
        const bWep = weaponKeys[i % weaponKeys.length];
        const dummy = new window.AIContender(i, `DUMMY_${bHero.toUpperCase()}`, bHero, bWep, this, true, i + 1, false);
        dummy.dropTarget.set(dx, 0, dz);
        dummy.position.set(dx, this.world.getGroundHeight(dx, dz, 0), dz);
        dummy.mesh.position.copy(dummy.position);
        dummy.mesh.visible = true;
        this.bots.push(dummy);
      });
    } else {
      const isTrios = this.gameMode === 'trios';
      for (let i = 0; i < 15; i++) {
        const isAlly = isTrios && (i === 0 || i === 1);
        const teamId = isAlly ? 0 : isTrios ? (Math.floor((i - 2) / 3) + 1) : (i + 1);
        const bHero = isAlly ? (i === 0 ? ally1Hero : ally2Hero) : heroKeys[i % heroKeys.length];
        const bWep = weaponKeys[i % weaponKeys.length];
        const bName = isAlly ? `ALLY_${bHero.toUpperCase()}` : botNames[i];

        const bot = new window.AIContender(i, bName, bHero, bWep, this, false, teamId, isAlly);
        if (instantGroundDrop) {
          bot.inDropship = false;
          bot.skydiving = false;
          if (isAlly) {
            bot.position.set(this.player.position.x + (i === 0 ? -5 : 5), 0, this.player.position.z + 4);
          } else {
            bot.position.set(bot.dropTarget.x, this.world.getGroundHeight(bot.dropTarget.x, bot.dropTarget.z, 0), bot.dropTarget.z);
          }
          bot.mesh.position.copy(bot.position);
          bot.mesh.visible = true;
        }
        this.bots.push(bot);
        if (isAlly) this.allies.push(bot);
      }
    }

    this.ringPhaseIndex = 0;
    this.ringState = 'waiting';
    this.ringTimer = window.GODWARS_DATA.MATCH_CONFIG.ringPhases[0].waitTime;
    this.ringRadius = window.GODWARS_DATA.MATCH_CONFIG.islandRadius;
    this.ringStartRadius = this.ringRadius;
    this.ringTargetRadius = window.GODWARS_DATA.MATCH_CONFIG.ringPhases[0].targetRadius;
    this.ringCenter = { x: (Math.random() - 0.5) * 35, z: (Math.random() - 0.5) * 35 };
    this.ringDamagePerSec = window.GODWARS_DATA.MATCH_CONFIG.ringPhases[0].damagePerSec;

    this.equipViewmodelWeapon();

    // Initialize Batch 2/3/4/6/7 Match State
    this.player.perks = {};
    this.player.shotsFired = 0;
    this.player.shotsHit = 0;
    this.player.headshotsLanded = 0;
    this.player.skydiveEmoteTimer = 0;
    this.player.recoilShotIndex = 0;
    this.player.recoilAccumPitch = 0;
    this.player.camRoll = 0;
    this.player.landingDip = 0;
    this.firstBloodTriggered = false;
    this.activePerkOffer = null;
    const perkBar = document.getElementById('hud-perk-upgrade-bar');
    if (perkBar) perkBar.classList.add('hidden');
    const rangePanel = document.getElementById('hud-range-controls');
    if (rangePanel) rangePanel.classList.toggle('hidden', !isFiringRange);

    // BATCH 4: Real-Time Dynamic Muzzle Flash PointLight attached to Camera
    if (!this.muzzleLight) {
      this.muzzleLight = new THREE.PointLight(0xfbbf24, 0, 14);
      this.muzzleLight.position.set(0.25, -0.1, -1.2);
      this.camera.add(this.muzzleLight);
    }

    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('hud-screen').classList.remove('hidden');
    document.getElementById('match-end-modal').classList.add('hidden');
    document.getElementById('spectate-bar').classList.add('hidden');
    document.getElementById('inventory-modal').classList.add('hidden');
    document.getElementById('kill-feed').innerHTML = '';

    this.syncMobileHUDVisibility();
    document.body.classList.toggle('mobile-mode', this.forceMobileUI);
    if (loadOverlay) setTimeout(() => loadOverlay.classList.add('hidden'), 280);
    this.matchActive = true;
    this.matchTime = 0;

    if (this.forceMobileUI) {
      this.requestMobileFullscreenLandscape();
    } else {
      const canvas = document.getElementById('game-canvas');
      window.gwSafePointerLock(canvas);
    }

    if (!isFiringRange && !instantGroundDrop) {
      this.triggerChampionIntroOverlay();
    } else if (isFiringRange) {
      this.showBanner('FIRING RANGE ACTIVE • TEST ALL WEAPONS, ATTACHMENTS, ZIPLINES & HERO SKILLS', '#10b981');
      window.SFX.announce('Welcome to the Asgard Firing Range.');
    } else {
      this.showBanner(`WELCOME TO ASGARD ROYALE (${this.gameMode.toUpperCase()})`, '#fbbf24');
    }
  }

  triggerChampionIntroOverlay() {
    const overlay = document.getElementById('champion-intro-overlay');
    if (!overlay) return;
    const hData = window.GODWARS_DATA.HEROES[this.selectedHeroId];
    const champNameEl = document.getElementById('intro-champ-name');
    const champSubEl = document.getElementById('intro-champ-sub');
    if (champNameEl) champNameEl.textContent = `${hData.classIcon} YOU (${hData.name}) & SQUAD`;
    if (champSubEl) champSubEl.textContent = `MODE: ${this.gameMode.toUpperCase()} ROYALE • 16 CONTENDERS • ASGARD ISLAND`;

    overlay.classList.remove('hidden');
    window.SFX.announce('This is your Champion Squad. Prepare for Bifrost launch.');
    setTimeout(() => {
      overlay.classList.add('hidden');
    }, 2800);
  }

  equipViewmodelWeapon() {
    while (this.viewmodelHolder.children.length > 0) {
      this.viewmodelHolder.remove(this.viewmodelHolder.children[0]);
    }
    const currentWep = this.player.weapons[this.player.activeSlot];
    this.player.weaponId = currentWep.id;
    this.activeViewmodel = window.ModelFactory.createWeaponModel(
      currentWep.id,
      this.player.heroId,
      true,
      currentWep.isMythicGold
    );
    this.applyWeaponSkinToMesh(this.activeViewmodel);
    this.activeViewmodel.position.set(0.24, -0.22, -0.45);
    this.viewmodelHolder.add(this.activeViewmodel);
  }

  syncMobileHUDVisibility() {
    const mobileControls = document.getElementById('mobile-touch-controls');
    if (mobileControls) {
      mobileControls.classList.toggle('hidden', !this.forceMobileUI);
    }
  }

  // =========================================================================
  // DESKTOP & MOBILE MULTI-TOUCH INPUT HANDLERS
  // =========================================================================
  initInputHandlers() {
    const canvas = document.getElementById('game-canvas');

    canvas.addEventListener('click', () => {
      window.SFX.init();
      const invOpen = !document.getElementById('inventory-modal').classList.contains('hidden');
      const mapOpen = !document.getElementById('fullmap-modal').classList.contains('hidden');
      if (this.matchActive && !this.forceMobileUI && !invOpen && !mapOpen && document.pointerLockElement !== canvas) {
        window.gwSafePointerLock(canvas);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.matchActive || document.pointerLockElement !== canvas || !this.player) return;
      const sens = 0.0021 * this.lookSensitivity * (this.player.isADS ? 0.56 : 1.0);
      this.player.yaw -= e.movementX * sens;
      this.player.pitch = Math.max(-1.42, Math.min(1.42, this.player.pitch - e.movementY * sens));
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.matchActive || this.forceMobileUI) return;
      if (e.button === 0) {
        this.mouseDown = true;
        if (this.player && this.player.inDropship) this.launchFromDropship();
      } else if (e.button === 1) {
        e.preventDefault();
        this.triggerApexPing();
      } else if (e.button === 2) {
        this.rightMouseDown = true;
        if (this.player) this.player.isADS = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) {
        this.rightMouseDown = false;
        if (this.player) this.player.isADS = false;
      }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('wheel', () => {
      if (!this.matchActive || !this.player || !this.player.alive) return;
      this.swapWeapon();
    });

    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // typing a name/room must not fire game binds
      const code = e.code;
      this.keys[code] = true;
      if (!this.matchActive || !this.player || !this.player.alive) return;

      if (code === 'Space') {
        if (this.player.inDropship) this.launchFromDropship();
        else if (this.player.skydiving) this.triggerSkydiveEmote();
        else if (this.player.ziplining) this.detachFromZipline(true);
        else this.triggerJump();
      } else if (code === 'KeyE') {
        if (this.player.inDropship) this.launchFromDropship();
        else this.handleContextInteract();
      } else if (code === 'KeyF') {
        this.triggerApexPing();
      } else if (code === 'KeyT') {
        this.togglePingWheel();
      } else if (code === 'KeyY') {
        this.dropHoloSpray();
      } else if (code === 'KeyP') {
        this.toggleThirdPersonCamera();
      } else if (code === 'Digit7') {
        this.selectLegendPerk(0);
      } else if (code === 'Digit8') {
        this.selectLegendPerk(1);
      } else if (code === 'KeyV') {
        this.triggerQuickMelee();
      } else if (code === 'KeyN') {
        this.triggerWeaponInspect();
      } else if (code === 'KeyB') {
        this.toggleFireMode();
      } else if (code === 'KeyI' || code === 'Tab') {
        e.preventDefault();
        this.toggleInventoryModal();
      } else if (code === 'KeyC' || code === 'ControlLeft') {
        this.triggerSlideOrCrouch();
      } else if (code === 'KeyR') {
        this.startReload();
      } else if (code === 'Digit1') {
        this.player.holstered = false;
        this.selectWeaponSlot(0);
      } else if (code === 'Digit2') {
        this.player.holstered = false;
        this.selectWeaponSlot(1);
      } else if (code === 'Digit3') {
        this.toggleHolsterWeapon();
      } else if (code === 'KeyQ') {
        this.useTacticalAbility();
      } else if (code === 'KeyZ') {
        this.useUltimateAbility();
      } else if (code === 'KeyG') {
        this.throwEquippedGrenade();
      } else if (code === 'KeyX') {
        this.toggleOrdnanceWheel();
      } else if (code === 'KeyH') {
        this.startHealing();
      } else if (code === 'Digit4') {
        this.toggleHealWheel();
      } else if (code === 'KeyM') {
        e.preventDefault();
        this.toggleFullMap();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.initMobileTouchControls();
  }

  initMobileTouchControls() {
    const joyZone = document.getElementById('touch-joystick-zone');
    const joyBase = document.getElementById('joystick-base');
    const joyKnob = document.getElementById('joystick-knob');
    const lookZone = document.getElementById('touch-look-zone');

    if (joyZone) {
      const sprintLockEl = document.getElementById('joystick-sprint-lock');
      joyZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        window.SFX.init();
        const t = e.changedTouches[0];
        this.touchMove.active = true;
        this.touchMove.id = t.identifier;
        this.autoSprintLocked = false;
        if (sprintLockEl) sprintLockEl.classList.add('hidden');

        // BATCH 5: Floating Dynamic Joystick teleports right under left thumb!
        const zoneRect = joyZone.getBoundingClientRect();
        const localX = Math.max(54, Math.min(zoneRect.width - 54, t.clientX - zoneRect.left));
        const localY = Math.max(54, Math.min(zoneRect.height - 54, t.clientY - zoneRect.top));
        if (joyBase) {
          joyBase.style.left = `${localX}px`;
          joyBase.style.top = `${localY}px`;
          joyBase.style.bottom = 'auto';
          joyBase.style.transform = 'translate(-50%, -50%)';
        }
        this.touchMove.startX = zoneRect.left + localX;
        this.touchMove.startY = zoneRect.top + localY;
        this.updateJoystick(t.clientX, t.clientY, joyKnob);
      }, { passive: false });

      joyZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === this.touchMove.id) {
            this.updateJoystick(t.clientX, t.clientY, joyKnob);
            if (this.touchMove.dy < -0.92 && Math.abs(this.touchMove.dx) < 0.38) {
              this.autoSprintLocked = true;
              if (sprintLockEl) sprintLockEl.classList.remove('hidden');
            } else if (this.touchMove.dy > -0.45) {
              this.autoSprintLocked = false;
              if (sprintLockEl) sprintLockEl.classList.add('hidden');
            }
          }
        }
      }, { passive: false });

      const endJoy = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === this.touchMove.id) {
            this.touchMove.active = false;
            this.touchMove.dx = 0;
            this.touchMove.dy = 0;
            if (joyKnob) joyKnob.style.transform = `translate(-50%, -50%)`;
          }
        }
      };
      joyZone.addEventListener('touchend', endJoy);
      joyZone.addEventListener('touchcancel', endJoy);
    }

    if (lookZone) {
      lookZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        window.SFX.init();
        const t = e.changedTouches[0];
        this.touchLook.active = true;
        this.touchLook.id = t.identifier;
        this.touchLook.lastX = t.clientX;
        this.touchLook.lastY = t.clientY;
      }, { passive: false });

      lookZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!this.player) return;
        for (const t of e.changedTouches) {
          if (t.identifier === this.touchLook.id) {
            const dx = t.clientX - this.touchLook.lastX;
            const dy = t.clientY - this.touchLook.lastY;
            this.touchLook.lastX = t.clientX;
            this.touchLook.lastY = t.clientY;

            const onTargetSlow = (this.mobileAimAssist && this.isCrosshairOnEnemy()) ? 0.62 : 1.0;
            const sens = 0.0044 * this.lookSensitivity * (this.player.isADS ? 0.6 : 1.0) * onTargetSlow;
            this.player.yaw -= dx * sens;
            this.player.pitch = Math.max(-1.42, Math.min(1.42, this.player.pitch - dy * sens));
          }
        }
      }, { passive: false });

      const endLook = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === this.touchLook.id) {
            this.touchLook.active = false;
          }
        }
      };
      lookZone.addEventListener('touchend', endLook);
      lookZone.addEventListener('touchcancel', endLook);
    }

    const bindHoldBtn = (id, onDown, onUp, onLongPress = null) => {
      const el = document.getElementById(id);
      if (!el) return;
      let lpTimer = null;
      let lpFired = false;
      let btnTouchId = null;
      let lastX = 0, lastY = 0;
      const triggerRipple = () => {
        el.classList.add('ripple-active');
        setTimeout(() => el.classList.remove('ripple-active'), 180);
      };
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        window.SFX.init();
        triggerRipple();
        const t = e.changedTouches[0];
        btnTouchId = t.identifier;
        lastX = t.clientX;
        lastY = t.clientY;
        lpFired = false;
        if (onLongPress) {
          lpTimer = setTimeout(() => {
            lpFired = true;
            this.vibrate(22);
            onLongPress();
          }, 360);
        } else {
          onDown();
        }
      }, { passive: false });
      // P1-1 FIXED: Allow dragging right thumb on ADS/JUMP/SLIDE/SKILL/ULT to smoothly rotate camera!
      el.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!this.player) return;
        for (const t of e.changedTouches) {
          if (t.identifier === btnTouchId) {
            const dx = t.clientX - lastX;
            const dy = t.clientY - lastY;
            lastX = t.clientX;
            lastY = t.clientY;
            if (Math.abs(dx) + Math.abs(dy) > 3 && lpTimer) {
              clearTimeout(lpTimer);
              lpTimer = null;
            }
            const onTargetSlow = (this.mobileAimAssist && this.isCrosshairOnEnemy()) ? 0.62 : 1.0;
            const sens = 0.0042 * this.lookSensitivity * (this.player.isADS ? 0.6 : 1.0) * onTargetSlow;
            this.player.yaw -= dx * sens;
            this.player.pitch = Math.max(-1.42, Math.min(1.42, this.player.pitch - dy * sens));
          }
        }
      }, { passive: false });
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        btnTouchId = null;
        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
        if (onLongPress && !lpFired) onDown();
        if (onUp) onUp();
      }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); triggerRipple(); onDown(); });
      el.addEventListener('mouseup', (e) => { e.preventDefault(); if (onUp) onUp(); });
    };

    ['btn-touch-fire', 'btn-touch-fire-left'].forEach(btnId => {
      const fireEl = document.getElementById(btnId);
      if (!fireEl) return;
      let fireTouchId = null;
      let lastX = 0, lastY = 0;

      fireEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        window.SFX.init();
        const t = e.changedTouches[0];
        fireTouchId = t.identifier;
        lastX = t.clientX;
        lastY = t.clientY;
        this.touchFiring = true;
        if (this.player && this.player.inDropship) this.launchFromDropship();
      }, { passive: false });

      fireEl.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!this.player) return;
        for (const t of e.changedTouches) {
          if (t.identifier === fireTouchId) {
            const dx = t.clientX - lastX;
            const dy = t.clientY - lastY;
            lastX = t.clientX;
            lastY = t.clientY;
            const sens = 0.004 * this.lookSensitivity * (this.player.isADS ? 0.6 : 1.0);
            this.player.yaw -= dx * sens;
            this.player.pitch = Math.max(-1.42, Math.min(1.42, this.player.pitch - dy * sens));
          }
        }
      }, { passive: false });

      const stopFire = (e) => {
        e.preventDefault();
        this.touchFiring = false;
        fireTouchId = null;
      };
      fireEl.addEventListener('touchend', stopFire, { passive: false });
      fireEl.addEventListener('touchcancel', stopFire, { passive: false });
    });

    bindHoldBtn('btn-touch-ads', () => {
      if (this.player) this.player.isADS = !this.player.isADS;
    });

    bindHoldBtn('btn-touch-jump', () => {
      if (!this.player) return;
      this.keys['Space'] = true;
      if (this.player.inDropship) this.launchFromDropship();
      else if (this.player.ziplining) this.detachFromZipline(true);
      else this.triggerJump();
    }, () => {
      this.keys['Space'] = false;
    });

    bindHoldBtn('btn-touch-slide', () => this.triggerSlideOrCrouch());
    bindHoldBtn('btn-touch-reload', () => this.startReload());
    bindHoldBtn('btn-touch-tactical', () => this.useTacticalAbility());
    bindHoldBtn('btn-touch-ult', () => this.useUltimateAbility());
    bindHoldBtn('btn-touch-grenade', () => this.throwEquippedGrenade(), null, () => this.toggleOrdnanceWheel());
    bindHoldBtn('btn-touch-heal', () => this.startHealing(), null, () => this.toggleHealWheel());
    bindHoldBtn('btn-touch-ping', () => this.triggerApexPing(), null, () => this.togglePingWheel());
    bindHoldBtn('btn-touch-melee', () => this.triggerQuickMelee());
    bindHoldBtn('btn-touch-inspect', () => this.triggerWeaponInspect());
    bindHoldBtn('btn-touch-holster', () => this.toggleHolsterWeapon());
    bindHoldBtn('btn-touch-emote', () => this.dropHoloSpray());
    bindHoldBtn('btn-touch-bag', () => this.toggleInventoryModal());
    bindHoldBtn('btn-touch-loot', () => this.handleContextInteract());
    bindHoldBtn('btn-dropship-launch', () => this.launchFromDropship());

    const wSlot1 = document.getElementById('hud-weapon-slot-0');
    const wSlot2 = document.getElementById('hud-weapon-slot-1');
    if (wSlot1) wSlot1.addEventListener('click', () => this.selectWeaponSlot(0));
    if (wSlot2) wSlot2.addEventListener('click', () => this.selectWeaponSlot(1));
    if (wSlot1) wSlot1.addEventListener('touchstart', (e) => { e.preventDefault(); this.selectWeaponSlot(0); });
    if (wSlot2) wSlot2.addEventListener('touchstart', (e) => { e.preventDefault(); this.selectWeaponSlot(1); });

    const hudTac = document.getElementById('hud-tactical-box');
    const hudUlt = document.getElementById('hud-ult-box');
    const hudHeal = document.getElementById('hud-heal-box');
    const hudBomb = document.getElementById('hud-bomb-box');
    const hudBag = document.getElementById('hud-bag-box');
    if (hudTac) hudTac.addEventListener('click', () => this.useTacticalAbility());
    if (hudUlt) hudUlt.addEventListener('click', () => this.useUltimateAbility());
    if (hudHeal) hudHeal.addEventListener('click', () => this.toggleHealWheel());
    if (hudBomb) hudBomb.addEventListener('click', () => this.toggleOrdnanceWheel());
    if (hudBag) hudBag.addEventListener('click', () => this.toggleInventoryModal());

    const minimapWrap = document.getElementById('minimap-container');
    if (minimapWrap) {
      minimapWrap.addEventListener('click', () => this.toggleFullMap());
    }

    const btnReplay = document.getElementById('btn-play-again');
    const btnLobby = document.getElementById('btn-back-lobby');
    const btnSpec = document.getElementById('btn-spectate-match');
    const btnSpecNext = document.getElementById('btn-spectate-next');
    const btnSpecExit = document.getElementById('btn-spectate-exit');

    if (btnReplay) btnReplay.addEventListener('click', () => this.startBattleRoyaleMatch(false, this.isFiringRange));
    if (btnLobby) btnLobby.addEventListener('click', () => this.returnToLobby());
    if (btnSpec) btnSpec.addEventListener('click', () => this.enterSpectatorMode());
    if (btnSpecNext) btnSpecNext.addEventListener('click', () => { this.spectateIndex++; });
    if (btnSpecExit) btnSpecExit.addEventListener('click', () => this.returnToLobby());
  }

  updateJoystick(clientX, clientY, knobEl) {
    const maxRadius = 52;
    let dx = clientX - this.touchMove.startX;
    let dy = clientY - this.touchMove.startY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    this.touchMove.dx = dx / maxRadius;
    this.touchMove.dy = dy / maxRadius;
    if (knobEl) {
      knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  }

  // =========================================================================
  // APEX PING SYSTEM [F / MIDDLE-CLICK / T PING WHEEL / MOBILE PING]
  // =========================================================================
  togglePingWheel() {
    const modal = document.getElementById('ping-wheel-modal');
    if (!modal || !this.player) return;
    const opening = modal.classList.contains('hidden');
    if (opening) {
      if (document.exitPointerLock) document.exitPointerLock();
      modal.classList.remove('hidden');
    } else {
      modal.classList.add('hidden');
      if (!this.forceMobileUI) {
        const canvas = document.getElementById('game-canvas');
        window.gwSafePointerLock(canvas);
      }
    }
  }

  toggleOrdnanceWheel() {
    const modal = document.getElementById('ordnance-wheel-modal');
    if (!modal || !this.player) return;
    const opening = modal.classList.contains('hidden');
    if (opening) {
      if (document.exitPointerLock) document.exitPointerLock();
      modal.classList.remove('hidden');
    } else {
      modal.classList.add('hidden');
      if (!this.forceMobileUI) {
        const canvas = document.getElementById('game-canvas');
        window.gwSafePointerLock(canvas);
      }
    }
  }

  applyWeaponSkinToMesh(mesh) {
    if (!mesh || !window.GODWARS_DATA.WEAPON_SKINS) return;
    const skin = window.GODWARS_DATA.WEAPON_SKINS[this.selectedWeaponSkin];
    if (!skin || !skin.hex) return;
    mesh.traverse((child) => {
      if (child.isMesh && child.material && child.material.color) {
        child.material = child.material.clone();
        child.material.color.lerp(new THREE.Color(skin.hex), 0.55);
        if (child.material.emissive && skin.emissive) {
          child.material.emissive = new THREE.Color(skin.emissive);
          child.material.emissiveIntensity = Math.max(0.28, child.material.emissiveIntensity || 0);
        }
      }
    });
  }

  // BATCH 2: Apex Legend Upgrade Perk Offer & Selection
  offerLegendPerkUpgrade(evoLevel) {
    if (!this.player || !window.GODWARS_DATA.LEGEND_PERKS) return;
    const heroPerks = window.GODWARS_DATA.LEGEND_PERKS[this.player.heroId];
    if (!heroPerks || !heroPerks[evoLevel]) return;
    const choices = heroPerks[evoLevel];
    this.activePerkOffer = { evoLevel, choices };

    const bar = document.getElementById('hud-perk-upgrade-bar');
    const row = document.getElementById('perk-choices-row');
    if (!bar || !row) return;
    row.innerHTML = choices.map((pk, idx) => `
      <button class="perk-choice-btn" data-pk-idx="${idx}">
        <div class="pk-key">[${idx === 0 ? '7' : '8'} / TAP] LV${evoLevel} UPGRADE</div>
        <div class="pk-name">⚡ ${pk.name}</div>
        <div class="pk-desc">${pk.desc}</div>
      </button>
    `).join('');
    row.querySelectorAll('.perk-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => this.selectLegendPerk(parseInt(btn.dataset.pkIdx, 10)));
    });
    bar.classList.remove('hidden');
    window.SFX.playPerkUnlock();
  }

  selectLegendPerk(choiceIndex) {
    if (!this.activePerkOffer || !this.player) return;
    const pk = this.activePerkOffer.choices[choiceIndex];
    if (!pk) return;
    this.player.perks = Object.assign(this.player.perks || {}, pk.effect);
    this.activePerkOffer = null;
    const bar = document.getElementById('hud-perk-upgrade-bar');
    if (bar) bar.classList.add('hidden');
    window.SFX.playPerkUnlock();
    this.showBanner(`⚡ LEGEND PERK ACTIVATED: ${pk.name} (${pk.desc})`, '#38bdf8');
  }

  // BATCH 8: Drop 3D Floating Asgard God Holo-Spray + Hero Quip
  dropHoloSpray() {
    const p = this.player;
    if (!p || !p.alive || p.inDropship || p.skydiving) return;
    const hs = (window.GODWARS_DATA.HOLO_SPRAYS && window.GODWARS_DATA.HOLO_SPRAYS[p.heroId]) || {
      icon: '⚡', text: 'ASGARD CHAMPION', color: '#fbbf24', quip: '"Bow before the Gods!"'
    };
    const forward = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const spawnPos = p.position.clone().addScaledVector(forward, 2.4);
    const groundY = this.world.getGroundHeight(spawnPos.x, spawnPos.z, p.position.y);

    const group = new THREE.Group();
    const colorHex = new THREE.Color(hs.color).getHex();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.95, 0.1, 16),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.72 })
    );
    group.add(disc);
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })
    );
    crystal.position.y = 1.0;
    group.add(crystal);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: colorHex })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.95;
    group.add(ring);

    group.position.set(spawnPos.x, groundY + 0.12, spawnPos.z);
    this.scene.add(group);
    this.combat.vfxList.push({ type: 'holospray', mesh: group, baseY: groundY + 0.12, age: 0, maxAge: 28.0 });

    window.SFX.playHoloSpray();
    this.showBanner(`${hs.icon} HOLO-SPRAY: ${hs.text} — ${hs.quip}`, hs.color);
  }

  // BATCH 6: Mid-Air Skydive Emote Spin!
  triggerSkydiveEmote() {
    if (!this.player || !this.player.skydiving) return;
    this.player.skydiveEmoteTimer = 1.8;
    window.SFX.playHoloSpray();
    this.showBanner('🪽 SKYDIVE EMOTE ACTIVE!', '#fde047');
  }

  triggerApexPing(overrideType = null) {
    if (!this.player || !this.player.alive) return;
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const ray = new THREE.Ray(origin, dir);

    let bestDist = 240;
    let pingPos = origin.clone().addScaledVector(dir, 60);
    const ptCfg = window.GODWARS_DATA.PING_TYPES || {};
    let pingType = overrideType || 'go';
    let pingLabel = (ptCfg[pingType] && `${ptCfg[pingType].icon} ${ptCfg[pingType].label}`) || '📍 MOVING HERE';
    let pingColor = (ptCfg[pingType] && ptCfg[pingType].color) || '#38bdf8';

    if (dir.y < -0.01) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < bestDist) {
        bestDist = t;
        pingPos = origin.clone().addScaledVector(dir, t);
      }
    }

    for (const c of this.world.colliders) {
      if (c.isDoor && !c.active) continue;
      const pt = new THREE.Vector3();
      if (ray.intersectBox(new THREE.Box3(new THREE.Vector3(c.minX, c.minY, c.minZ), new THREE.Vector3(c.maxX, c.maxY, c.maxZ)), pt)) {
        const d = origin.distanceTo(pt);
        if (d < bestDist) {
          bestDist = d;
          pingPos.copy(pt);
        }
      }
    }

    if (!overrideType) {
      for (const bin of this.world.supplyBins) {
        const bPos = new THREE.Vector3(bin.x, 0.8, bin.z);
        const pt = new THREE.Vector3();
        if (ray.intersectSphere(new THREE.Sphere(bPos, 2.2), pt)) {
          const d = origin.distanceTo(pt);
          if (d < bestDist + 2) {
            bestDist = d;
            pingPos.copy(bPos);
            pingType = 'loot';
            const wName = window.GODWARS_DATA.WEAPONS[bin.loot.weaponId].divineName;
            pingLabel = bin.isCarePackage ? `★ MYTHIC CARE PACKAGE HERE!` : `📦 SUPPLY BIN: ${wName}`;
            pingColor = '#fbbf24';
          }
        }
      }

      for (const bot of this.bots) {
        if (!bot.alive || bot.inDropship || bot.isAlly) continue;
        const bMin = new THREE.Vector3(bot.position.x - 0.8, bot.position.y, bot.position.z - 0.8);
        const bMax = new THREE.Vector3(bot.position.x + 0.8, bot.position.y + 2.3, bot.position.z + 0.8);
        const pt = new THREE.Vector3();
        if (ray.intersectBox(new THREE.Box3(bMin, bMax), pt)) {
          const d = origin.distanceTo(pt);
          if (d < bestDist + 3) {
            bestDist = d;
            pingPos.copy(bot.position).add(new THREE.Vector3(0, 1.4, 0));
            pingType = 'enemy';
            pingLabel = `⚠️ HOSTILE SPOTTED: ${bot.name} (${bot.heroId.toUpperCase()})`;
            pingColor = '#f43f5e';
          }
        }
      }
    }

    window.SFX.playPing(pingType);
    this.activePing = {
      position: pingPos,
      type: pingType,
      label: pingLabel,
      color: pingColor,
      ttl: 7.5
    };

    // BATCH 1: Allied Squadmate Voice Callout Reply!
    const livingAlly = this.allies && this.allies.find(a => a.alive);
    if (livingAlly) {
      const calloutEl = document.getElementById('hud-ally-callout');
      const reply = (ptCfg[pingType] && ptCfg[pingType].allyReply) || 'Copy that, moving to your ping!';
      if (calloutEl) {
        calloutEl.textContent = `🎙️ ${livingAlly.name}: "${reply}"`;
        calloutEl.style.borderColor = pingColor;
        calloutEl.classList.remove('hidden');
        clearTimeout(this.allyCalloutTimeout);
        this.allyCalloutTimeout = setTimeout(() => calloutEl.classList.add('hidden'), 2800);
      }
    }
  }

  // =========================================================================
  // CONTEXT INTERACT [E] (REVIVE ALLY / SELF-REVIVE / FINISHER / ZIPLINE / DOOR / LOOT)
  // =========================================================================
  handleContextInteract() {
    const p = this.player;
    if (!p || !p.alive) return;

    // 1. Self-Revive if Player is Knocked Down with Gold/Red Evo Shield!
    if (p.knocked) {
      if (p.shieldTier >= 4 && !p.usedSelfRevive) {
        p.usedSelfRevive = true;
        this.combat.completeRevive(p, p);
        this.showBanner('ALLFATHER GUARDIAN ANGEL RESURRECTION COMPLETE!', '#fbbf24');
      }
      return;
    }

    // 2. Detach if currently riding Zipline
    if (p.ziplining) {
      this.detachFromZipline(true);
      return;
    }

    // 3. Revive Knocked Allied Squadmate!
    if (this.nearestKnockedAlly) {
      this.combat.completeRevive(p, this.nearestKnockedAlly);
      return;
    }

    // 4. Execute Mythic Finisher on nearby Knocked Down enemy!
    if (this.nearestKnockedBot) {
      this.executeMythicFinisher(this.nearestKnockedBot);
      return;
    }

    // 5. Ride Valhalla Jump Tower (Redeploy Balloon)
    if (this.nearJumpTower) {
      window.SFX.playJumpPad();
      p.position.set(this.world.jumpTower.x, this.world.jumpTower.topY, this.world.jumpTower.z);
      p.skydiving = true;
      this.showBanner('VALHALLA JUMP TOWER: AERIAL SKYDIVE REDEPLOY!', '#f43f5e');
      return;
    }

    // 6. Ride Bifrost Zipline
    if (this.nearestZipline) {
      this.attachToZipline(this.nearestZipline);
      return;
    }

    // 7. Open / Close Interactive Apex Building Door
    if (this.nearestDoor) {
      this.world.toggleDoor(this.nearestDoor, false);
      this.showBanner(this.nearestDoor.open ? 'DOOR OPENED' : 'DOOR CLOSED', '#38bdf8');
      return;
    }

    // 8. Pick up 3D Ground Loot inside Buildings
    if (this.nearestGroundLoot) {
      this.pickupGroundLoot(this.nearestGroundLoot);
      return;
    }

    // 9. Craft at Dwarven Replicator Terminal
    if (this.nearestReplicator) {
      this.useReplicator(this.nearestReplicator);
      return;
    }

    // 10. Scan Map at Rooftop Recon Survey Beacon
    if (this.nearestBeacon) {
      this.useSurveyBeacon(this.nearestBeacon);
      return;
    }

    // 10b. Respawn Fallen Squadmate at Green Respawn Beacon!
    if (this.nearestRespawnBeacon) {
      this.useRespawnBeacon(this.nearestRespawnBeacon);
      return;
    }

    // 11. Open Divine Supply Bin / Care Package / Death Box
    if (this.nearestBin) {
      this.interactWithLootBin();
    }
  }

  useRespawnBeacon(beacon) {
    const fallenAllies = this.allies.filter(a => !a.alive);
    if (fallenAllies.length === 0) {
      this.showBanner('ALL SQUADMATES ARE STILL ALIVE!', '#10b981');
      return;
    }
    beacon.used = true;
    if (beacon.beam) beacon.beam.visible = false;
    window.SFX.playAbility('ultimate');
    window.SFX.announce('Dropship inbound. Squadmate respawned.');

    fallenAllies.forEach((ally, idx) => {
      ally.alive = true;
      ally.knocked = false;
      ally.hp = ally.maxHp;
      ally.shield = ally.maxShield;
      ally.inDropship = false;
      ally.skydiving = true;
      ally.position.set(beacon.x + (idx - 0.5) * 6, 65, beacon.z);
      ally.dropTarget.set(beacon.x + (idx - 0.5) * 6, 0, beacon.z);
      if (ally.mesh) {
        ally.mesh.visible = true;
        ally.mesh.scale.y = 1.0;
        if (ally.mesh.userData.kdShield) ally.mesh.userData.kdShield.visible = false;
      }
      if (ally.diveTrail) ally.diveTrail.visible = true;
    });

    this.showBanner(`⚡ BIFROST DROPSHIP RESPAWNED ${fallenAllies.length} SQUADMATE(S)!`, '#10b981');
  }

  pickupGroundLoot(item) {
    if (!item || item.pickedUp) return;
    item.pickedUp = true;
    item.mesh.visible = false;
    this.applyLootPackage(item.loot, 'GROUND LOOT');
  }

  useReplicator(rep) {
    const p = this.player;
    if (!p) return;
    window.SFX.playEvoUpgrade();
    p.damageDealt += 150;
    const tiers = window.GODWARS_DATA.EVO_TIERS;
    for (let tLvl = 5; tLvl >= 2; tLvl--) {
      const prevThreshold = tiers[tLvl - 1] ? tiers[tLvl - 1].nextThreshold : 9999;
      if (p.damageDealt >= prevThreshold && p.shieldTier < tLvl) {
        p.shieldTier = tLvl;
        p.maxShield = tiers[tLvl].maxShield;
        break;
      }
    }
    p.shield = p.maxShield;
    p.heals.shield_battery += 2;
    const curWep = p.weapons[p.activeSlot];
    curWep.isMythicGold = true;
    curWep.attachments = { barrel: 4, mag: 4, optic: 4, hopup: 4 };
    this.recalcWeaponAttachmentStats(curWep);
    curWep.mag = curWep.maxMag;
    curWep.reserve += curWep.maxMag * 3;
    this.equipViewmodelWeapon();
    this.showBanner(`REPLICATOR CRAFTED: ★ MYTHIC LV4 ATTACHMENTS ON ${curWep.data.divineName} + ${tiers[p.shieldTier].name}!`, '#2dd4bf');
  }

  useSurveyBeacon(beacon) {
    const p = this.player;
    if (!p) return;
    window.SFX.playPing('enemy');
    p.beaconScanTimer = 15.0;
    this.showBanner(`📡 ${beacon.name.toUpperCase()}: ALL HOSTILES SCANNED ON MAP (15s)!`, '#38bdf8');
    window.SFX.announce('Survey beacon activated. All hostiles scanned.');
  }

  recalcWeaponAttachmentStats(wepObj) {
    const magTier = window.GODWARS_DATA.ATTACHMENTS.mag.tiers[wepObj.attachments.mag || 0];
    wepObj.maxMag = Math.round(wepObj.data.magSize * magTier.capMult);
    if (wepObj.mag > wepObj.maxMag) wepObj.mag = wepObj.maxMag;
  }

  toggleFireMode() {
    if (!this.player || !this.player.alive) return;
    const wep = this.player.weapons[this.player.activeSlot];
    const modes = wep.data.modes || ['AUTO'];
    wep.fireModeIndex = ((wep.fireModeIndex || 0) + 1) % modes.length;
    const newMode = modes[wep.fireModeIndex];
    window.SFX.playReload();
    this.showBanner(`FIRE MODE: ${newMode}`, wep.data.color);
  }

  toggleInventoryModal() {
    const modal = document.getElementById('inventory-modal');
    if (!modal || !this.player) return;
    const isOpening = modal.classList.contains('hidden');
    if (isOpening) {
      if (document.exitPointerLock) document.exitPointerLock();
      this.renderInventoryModal();
      modal.classList.remove('hidden');
    } else {
      modal.classList.add('hidden');
      if (!this.forceMobileUI) {
        const canvas = document.getElementById('game-canvas');
        window.gwSafePointerLock(canvas);
      }
    }
  }

  renderInventoryModal() {
    const p = this.player;
    const container = document.getElementById('inventory-content');
    if (!container || !p) return;

    const attCfg = window.GODWARS_DATA.ATTACHMENTS;
    let html = `<div class="inv-weapons-row">`;
    p.weapons.forEach((w, idx) => {
      const mode = (w.data.modes || ['AUTO'])[w.fireModeIndex || 0];
      html += `
        <div class="inv-wep-box" style="border-color:${w.isMythicGold ? '#fde047' : w.data.color}">
          <div class="inv-wep-header">
            <span>SLOT ${idx + 1} • ${w.data.baseName} (${mode})</span>
            <b>${w.mag} / ${w.reserve}</b>
          </div>
          <div class="inv-wep-title">${w.isMythicGold ? '★ MYTHIC ' : ''}${w.data.divineName}</div>
          <div class="inv-att-grid">
            ${['barrel', 'mag', 'optic', 'hopup'].map(cat => {
              const lvl = w.attachments[cat] || 0;
              const tInfo = attCfg[cat].tiers[lvl];
              return `<div class="inv-att-chip" style="border-color:${tInfo.color};color:${tInfo.color}">
                <span>${cat.toUpperCase()}</span>
                <b>${tInfo.name}</b>
              </div>`;
            }).join('')}
          </div>
        </div>
      `;
    });
    html += `</div>`;

    html += `<div class="inv-items-row">`;
    Object.values(window.GODWARS_DATA.HEAL_ITEMS).forEach(h => {
      const cnt = p.heals[h.id] || 0;
      html += `
        <button class="inv-item-btn" data-heal="${h.id}" style="border-color:${h.color}">
          <div style="font-size:20px">${h.icon}</div>
          <div><b>${h.shortName}</b><br/><span>x${cnt} (Tap to Use)</span></div>
        </button>
      `;
    });
    Object.values(window.GODWARS_DATA.GRENADES).forEach(g => {
      const cnt = p.grenadeCounts[g.id] || 0;
      html += `
        <button class="inv-item-btn" data-bomb="${g.id}" style="border-color:${g.color}">
          <div style="font-size:20px">${g.icon}</div>
          <div><b>${g.shortName}</b><br/><span>x${cnt} (Tap to Equip)</span></div>
        </button>
      `;
    });
    html += `</div>`;

    container.innerHTML = html;
    container.querySelectorAll('.inv-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.heal) {
          this.selectedHealId = btn.dataset.heal;
          this.toggleInventoryModal();
          this.startHealing();
        } else if (btn.dataset.bomb) {
          this.selectedGrenadeId = btn.dataset.bomb;
          this.toggleInventoryModal();
          this.showBanner(`EQUIPPED: ${window.GODWARS_DATA.GRENADES[this.selectedGrenadeId].name}`, '#fbbf24');
        }
      });
    });
  }

  attachToZipline(zipInfo) {
    const p = this.player;
    window.SFX.playZiplineAttach();
    p.ziplining = true;
    p.activeZipline = zipInfo.zip;
    p.ziplineT = zipInfo.t;
    p.ziplineDir = zipInfo.dir;
    p.isSliding = false;
    this.showBanner(`RIDING BIFROST ZIPLINE (${zipInfo.zip.name}) • [SPACE] TO SUPER-JUMP`, '#fde047');
  }

  detachFromZipline(superJump = true) {
    const p = this.player;
    if (!p || !p.ziplining) return;
    p.ziplining = false;
    p.activeZipline = null;
    if (superJump) {
      p.velocity.y = 12.8;
      p.onGround = false;
      window.SFX.playJumpPad();
    }
  }

  executeMythicFinisher(victimBot) {
    const p = this.player;
    if (!p || !victimBot || !victimBot.alive) return;

    const hData = window.GODWARS_DATA.HEROES[p.heroId];
    p.finisherTimer = 1.65;
    window.SFX.playAbility('ultimate');
    this.showBanner(`EXECUTING MYTHIC FINISHER: ${hData.finisherName.toUpperCase()}...`, '#fbbf24');

    this.combat.spawnLightningBolt(
      victimBot.position.clone().add(new THREE.Vector3(0, 18, 0)),
      victimBot.position.clone(),
      hData.hexColor,
      1.1
    );
    this.combat.spawnExplosionVFX(victimBot.position.clone().add(new THREE.Vector3(0, 1, 0)), 5.5, hData.hexColor, 1.2);

    setTimeout(() => {
      if (!this.matchActive || !p.alive) return;
      p.shield = p.maxShield;
      window.SFX.playEvoUpgrade();
      this.combat.handleElimination(p, victimBot, `FINISHER: ${hData.finisherName}`);
      this.showBanner('FINISHER COMPLETE: 100% RUNE ARMOR RESTORED!', '#38bdf8');
    }, 1450);
  }

  triggerQuickMelee() {
    const p = this.player;
    if (!p || !p.alive || p.inDropship || p.meleeTimer > 0) return;
    p.meleeTimer = 0.52;
    const eyePos = this.camera.position.clone();
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.combat.performMelee(p, eyePos, lookDir);
  }

  triggerWeaponInspect() {
    const p = this.player;
    if (!p || !p.alive || p.inDropship) return;
    p.inspectTimer = 2.4;
    const wep = p.weapons[p.activeSlot];
    this.showBanner(`INSPECTING: ${wep.data.divineName} (BASE: ${wep.data.baseName})`, wep.data.color);
  }

  launchFromDropship() {
    if (!this.player || !this.player.inDropship) return;
    this.player.inDropship = false;
    this.player.skydiving = true;
    this.player.position.copy(this.dropship.position);
    this.player.position.y -= 2.5;
    window.SFX.playJumpPad();
    this.showBanner('3RD-PERSON SKYDIVE ACTIVE • AIM TOWARD YOUR TARGET POI!', '#fbbf24');
  }

  toggleHolsterWeapon() {
    if (!this.player || !this.player.alive) return;
    this.player.holstered = !this.player.holstered;
    if (this.player.holstered) {
      this.player.isADS = false;
      this.showBanner('WEAPON HOLSTERED (+15% UNARMED SPRINT SPEED • HEIRLOOM OUT)', '#38bdf8');
    } else {
      window.SFX.playReload();
    }
  }

  triggerJump() {
    const p = this.player;
    if (!p || !p.alive || p.knocked) return;
    const forwardVec = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));

    if (p.onGround) {
      p.velocity.y = 10.4;
      p.onGround = false;
      // Apex Slide-Jump Momentum Burst!
      if (p.isSliding) {
        p.momentumBoost = 15.2;
        p.momentumDir = forwardVec.clone();
        p.isSliding = false;
      }
    } else if (p.wallContactNormal && p.wallJumpCd <= 0) {
      // Apex Wall-Bounce (Wall-Jump off any wall in mid-air!)
      p.velocity.y = 11.4;
      p.momentumBoost = 13.5;
      p.momentumDir = p.wallContactNormal.clone().addScaledVector(forwardVec, 0.5).normalize();
      p.wallJumpCd = 0.55;
      window.SFX.playWallBounce();
      this.showBanner('⚡ WALL-BOUNCE!', '#38bdf8');
    } else if (p.heroId === 'valkyrie' && p.jetpackFuel > 10) {
      p.velocity.y = 8.5;
    }
  }

  triggerSlideOrCrouch() {
    if (!this.player || !this.player.alive || !this.player.onGround || this.player.knocked) return;
    if (this.player.slideCooldown <= 0 && !this.player.isSliding) {
      this.player.isSliding = true;
      this.player.slideTimer = 0.88;
      this.player.slideCooldown = 1.05;

      // Euphoria-Inspired PERFECT SLIDE DODGE when sliding under active enemy gunfire!
      const underFire = this.bots.some(b => b.alive && !b.isAlly && b.currentEnemy === this.player && b.fireTimer < 0.32 && b.position.distanceTo(this.player.position) < 42);
      if (underFire) {
        this.slowMoTimer = 0.38;
        this.fovKick = 11;
        this.player.shield = Math.min(this.player.maxShield, this.player.shield + 18);
        this.player.ultCharge = Math.min(100, (this.player.ultCharge || 0) + 12);
        this.combat.spawnExplosionVFX(this.player.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 3.8, 0x38bdf8, 0.38);
        window.SFX.playArmorSwap();
        this.vibrate(22);
        this.showBanner('⚡ PERFECT SLIDE DODGE! (+18 SHIELD • +12% ULT)', '#38bdf8');
      }
    } else {
      this.player.isSliding = false;
    }
  }

  swapWeapon() {
    this.selectWeaponSlot(this.player.activeSlot === 0 ? 1 : 0);
  }

  selectWeaponSlot(slotIdx) {
    if (!this.player) return;
    // BATCH 7: Tapping already-active weapon card on HP toggles Fire Mode (AUTO / BURST / SINGLE)!
    if (this.player.activeSlot === slotIdx) {
      this.toggleFireMode();
      return;
    }
    this.player.activeSlot = slotIdx;
    this.player.isADS = false;
    this.player.inspectTimer = 0;
    this.player.holsteredReloadTimer = 0;
    this.equipViewmodelWeapon();
    window.SFX.playReload();
  }

  startReload() {
    if (!this.player || !this.player.alive) return;
    const wep = this.player.weapons[this.player.activeSlot];
    const maxMag = wep.maxMag || wep.data.magSize;
    if (wep.reloading || wep.mag >= maxMag || wep.reserve <= 0) return;
    wep.reloading = true;
    const magReloadMult = window.GODWARS_DATA.ATTACHMENTS.mag.tiers[wep.attachments.mag || 0].reloadMult;
    let mult = (this.player.heroId === 'zeus' ? 0.8 : 1.0) * magReloadMult;
    if (wep.isMythicGold) mult *= 0.85;
    wep.reloadTimer = wep.data.reloadTime * mult;
    window.SFX.playReload();
  }

  useTacticalAbility() {
    if (!this.player || !this.player.alive || this.player.inDropship || this.player.knocked) return;
    if (this.player.tacticalCooldown > 0) return;

    const hData = window.GODWARS_DATA.HEROES[this.player.heroId];
    const cdMult = (this.player.perks && this.player.perks.tacCdMult) || 1.0;
    this.player.tacticalCooldown = (this.isFiringRange && !this.isOnline ? 2.5 : hData.tacticalCooldown) * cdMult;
    this.fovKick = 6;

    const eyePos = this.camera.position.clone();
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.combat.triggerHeroTactical(this.player, eyePos, lookDir);
  }

  useUltimateAbility() {
    if (!this.player || !this.player.alive || this.player.inDropship || this.player.knocked) return;
    if (this.player.ultCharge < 100) {
      this.showBanner(`ULTIMATE CHARGING (${Math.floor(this.player.ultCharge)}%)`, '#94a3b8');
      return;
    }
    this.player.ultCharge = this.isFiringRange ? 100 : 0;

    // Euphoria-Inspired Ultimate Burst Cut-In Banner + Cinematic Micro Slow-Mo & FOV Kick!
    const hData = window.GODWARS_DATA.HEROES[this.player.heroId];
    this.slowMoTimer = 0.42;
    this.fovKick = 14;
    this.vibrate(40);
    const cutinEl = document.getElementById('hud-burst-cutin');
    if (cutinEl && hData) {
      const ic = document.getElementById('cutin-hero-icon');
      const nm = document.getElementById('cutin-hero-name');
      const sk = document.getElementById('cutin-skill-name');
      if (ic) ic.textContent = hData.classIcon;
      if (nm) nm.textContent = `${hData.name} • ${hData.title.toUpperCase()}`;
      if (sk) sk.textContent = hData.ultimateName.toUpperCase();
      cutinEl.style.setProperty('--cutin-c', hData.color);
      cutinEl.classList.remove('hidden');
      clearTimeout(this._cutinTimer);
      this._cutinTimer = setTimeout(() => cutinEl.classList.add('hidden'), 1350);
    }

    const eyePos = this.camera.position.clone();
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.combat.triggerHeroUltimate(this.player, eyePos, lookDir);
  }

  // =========================================================================
  // EUPHORIA-INSPIRED 1ST/3RD-PERSON ACTION CAMERA TOGGLE & LIVE COMBO RANK
  // =========================================================================
  toggleThirdPersonCamera() {
    this.thirdPersonMode = !this.thirdPersonMode;
    const btn = document.getElementById('btn-hud-cam-toggle');
    if (btn) btn.textContent = this.thirdPersonMode ? '🎥 1ST' : '🎥 3RD';
    this.vibrate(14);
    this.showBanner(
      this.thirdPersonMode ? '🎥 3RD-PERSON ACTION CAMERA ACTIVE' : '🎥 1ST-PERSON FPS CAMERA ACTIVE',
      '#38bdf8'
    );
  }

  // BATCH 9: Apex Multi-Kill Streak Announcer + Micro Camera Shake!
  registerMultiKillStreak() {
    const now = performance.now();
    if (now - (this.lastKillTimestamp || 0) <= 8500) {
      this.multiKillCount = (this.multiKillCount || 1) + 1;
    } else {
      this.multiKillCount = 1;
    }
    this.lastKillTimestamp = now;
    this.camShake = Math.max(this.camShake || 0, 0.22);
    if (this.multiKillCount === 2) {
      this.showBanner('🔥 DOUBLE KILL! UNSTOPPABLE!', '#f97316');
      window.SFX.announce('Double kill.');
    } else if (this.multiKillCount === 3) {
      this.showBanner('⚡ TRIPLE KILL! GOD OF WAR!', '#fbbf24');
      window.SFX.announce('Triple kill.');
    } else if (this.multiKillCount >= 4) {
      this.showBanner(`👑 ${this.multiKillCount}X ASGARD RAMPAGE! GODLIKE!`, '#f43f5e');
      window.SFX.announce('Godlike rampage.');
    }
  }

  getComboStyleRank(hits) {
    if (hits >= 32) return 'SSS';
    if (hits >= 22) return 'SS';
    if (hits >= 14) return 'S';
    if (hits >= 8)  return 'A';
    if (hits >= 4)  return 'B';
    return 'C';
  }

  registerComboHit(dmg, isHeadshot = false, shieldBroken = false) {
    this.comboHits = (this.comboHits || 0) + (isHeadshot ? 2 : 1);
    this.comboDmg = (this.comboDmg || 0) + dmg;
    this.comboTimer = 3.6;
    if (shieldBroken || isHeadshot) {
      this.fovKick = Math.max(this.fovKick || 0, 5.5);
    }

    const meter = document.getElementById('hud-combo-meter');
    const rankBadge = document.getElementById('combo-rank-badge');
    const cntEl = document.getElementById('combo-hit-count');
    const dmgEl = document.getElementById('combo-total-dmg');
    if (meter && rankBadge && cntEl && dmgEl) {
      meter.classList.remove('hidden');
      meter.classList.add('pop');
      clearTimeout(this._comboPopTimer);
      this._comboPopTimer = setTimeout(() => meter.classList.remove('pop'), 110);

      const rank = this.getComboStyleRank(this.comboHits);
      rankBadge.textContent = rank;
      rankBadge.className = `combo-rank r-${rank.toLowerCase()}`;
      cntEl.textContent = String(this.comboHits);
      dmgEl.textContent = `${Math.round(this.comboDmg)} DMG`;
    }
  }

  updateComboMeter(realDt) {
    if (this.fovKick > 0) {
      this.fovKick = Math.max(0, this.fovKick - realDt * 22);
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= realDt;
      const fill = document.getElementById('combo-timer-fill');
      if (fill) fill.style.width = `${Math.max(0, (this.comboTimer / 3.6) * 100)}%`;
      if (this.comboTimer <= 0) {
        this.comboHits = 0;
        this.comboDmg = 0;
        const meter = document.getElementById('hud-combo-meter');
        if (meter) meter.classList.add('hidden');
      }
    }
  }

  throwEquippedGrenade() {
    if (!this.player || !this.player.alive || this.player.inDropship || this.player.knocked) return;
    const count = this.player.grenadeCounts[this.selectedGrenadeId] || 0;
    if (count <= 0) {
      this.cycleGrenadeType();
      const nextCount = this.player.grenadeCounts[this.selectedGrenadeId] || 0;
      if (nextCount <= 0) {
        this.showBanner('NO DIVINE BOMBS LEFT • LOOT SUPPLY BINS!', '#f43f5e');
        return;
      }
    }
    if (!this.isFiringRange) {
      this.player.grenadeCounts[this.selectedGrenadeId]--;
    }
    const eyePos = this.camera.position.clone();
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.combat.throwGrenade(this.player, eyePos, lookDir, this.selectedGrenadeId);
    window.SFX.playAbility('tactical');
  }

  cycleGrenadeType() {
    const keys = Object.keys(window.GODWARS_DATA.GRENADES);
    const idx = keys.indexOf(this.selectedGrenadeId);
    this.selectedGrenadeId = keys[(idx + 1) % keys.length];
    const g = window.GODWARS_DATA.GRENADES[this.selectedGrenadeId];
    this.showBanner(`EQUIPPED ORDNANCE: ${g.name.toUpperCase()}`, g.color);
  }

  cycleHealType() {
    const keys = Object.keys(window.GODWARS_DATA.HEAL_ITEMS);
    const idx = keys.indexOf(this.selectedHealId);
    this.selectedHealId = keys[(idx + 1) % keys.length];
    const h = window.GODWARS_DATA.HEAL_ITEMS[this.selectedHealId];
    this.showBanner(`SELECTED HEAL ITEM: ${h.name.toUpperCase()} [PRESS H]`, h.color);
  }

  startHealing() {
    const p = this.player;
    if (!p || !p.alive || p.healTimer > 0 || p.knocked) return;

    let itemKey = this.selectedHealId;
    if ((p.heals[itemKey] || 0) <= 0) {
      itemKey = Object.keys(p.heals).find(k => p.heals[k] > 0) || 'shield_cell';
    }
    if (p.shield < p.maxShield && p.hp >= p.maxHp && (itemKey === 'medkit')) {
      itemKey = p.heals.shield_battery > 0 ? 'shield_battery' : 'shield_cell';
    } else if (p.hp < p.maxHp && p.shield >= p.maxShield && (itemKey === 'shield_cell' || itemKey === 'shield_battery')) {
      itemKey = p.heals.medkit > 0 ? 'medkit' : 'phoenix_kit';
    }

    const hItem = window.GODWARS_DATA.HEAL_ITEMS[itemKey];
    if (!hItem || (p.heals[itemKey] || 0) <= 0) {
      this.showBanner('NO HEALING ITEMS LEFT • OPEN SUPPLY BINS!', '#f43f5e');
      return;
    }

    this.selectedHealId = itemKey;
    p.healingType = itemKey;
    p.healTimer = hItem.castTime;
    p.healDuration = hItem.castTime;
  }

  interactWithLootBin() {
    if (!this.player || !this.player.alive || !this.nearestBin) return;
    const bin = this.nearestBin;

    if (bin.isDeathBox) {
      this.openDeathBoxModal(bin);
      return;
    }

    if (!bin.opened) {
      bin.opened = true;
      if (!bin.isDeathBox && !bin.isCarePackage && bin.lid) {
        bin.lid.position.y = 1.65;
        bin.lid.position.z = -0.55;
        bin.lid.rotation.x = -1.1;
      }
    }

    this.applyLootPackage(bin.loot, bin.isCarePackage ? 'CARE PACKAGE' : 'SUPPLY BIN');
  }

  applyLootPackage(loot, sourceLabel = 'LOOTED') {
    const wData = window.GODWARS_DATA.WEAPONS[loot.weaponId];
    const isMythic = Boolean(loot.isMythicGold);
    const attTier = isMythic ? 4 : Math.min(4, loot.attachmentTier || loot.shieldTier || 2);

    if (loot.shieldTier > this.player.shieldTier) {
      this.player.shieldTier = loot.shieldTier;
      const tInfo = window.GODWARS_DATA.EVO_TIERS[loot.shieldTier];
      this.player.maxShield = tInfo.maxShield;
      window.SFX.playEvoUpgrade();
    }
    this.player.shield = this.player.maxShield;
    this.player.heals.shield_battery += (loot.shieldBattery || 2);
    this.player.heals.shield_cell += 3;
    this.player.heals.medkit += (loot.medkit || 1);
    if (loot.phoenixKit) this.player.heals.phoenix_kit += loot.phoenixKit;
    this.player.grenadeCounts[loot.grenadeId] = (this.player.grenadeCounts[loot.grenadeId] || 0) + 2;

    const hasWepIdx = this.player.weapons.findIndex(w => w.id === loot.weaponId);
    if (hasWepIdx >= 0) {
      const wep = this.player.weapons[hasWepIdx];
      ['barrel', 'mag', 'optic', 'hopup'].forEach(cat => {
        wep.attachments[cat] = Math.max(wep.attachments[cat] || 1, attTier);
      });
      this.recalcWeaponAttachmentStats(wep);
      wep.reserve += wep.maxMag * 3;
      wep.mag = wep.maxMag;
      if (isMythic) wep.isMythicGold = true;
      this.equipViewmodelWeapon();
    } else {
      const newWep = {
        id: loot.weaponId,
        data: wData,
        mag: wData.magSize,
        maxMag: wData.magSize,
        reserve: wData.reserveAmmo,
        fireModeIndex: 0,
        burstRemaining: 0,
        isMythicGold: isMythic,
        attachments: { barrel: attTier, mag: attTier, optic: attTier, hopup: attTier },
        reloading: false,
        reloadTimer: 0
      };
      this.recalcWeaponAttachmentStats(newWep);
      newWep.mag = newWep.maxMag;
      this.player.weapons[this.player.activeSlot] = newWep;
      this.equipViewmodelWeapon();
    }

    window.SFX.playReload();
    const tierName = window.GODWARS_DATA.EVO_TIERS[this.player.shieldTier].name;
    this.showBanner(
      `${sourceLabel}: ${isMythic ? '★ MYTHIC GOLD ' : ''}${wData.divineName} (LV${attTier} ATTACHMENTS) + ${tierName}`,
      isMythic ? '#fde047' : wData.color
    );
  }

  updateKillLeader(candidate) {
    if (!candidate || candidate.kills < 2) return;
    if (!this.killLeader || candidate.kills > this.killLeader.kills) {
      const isNew = this.killLeader !== candidate;
      this.killLeader = candidate;
      const hData = window.GODWARS_DATA.HEROES[candidate.heroId] || window.GODWARS_DATA.HEROES.thor;
      this.world.updateChampionBanners(candidate.name, hData.name, candidate.kills);

      if (isNew) {
        this.showBanner(`👑 NEW KILL LEADER: ${candidate.name} (${candidate.kills} KILLS)`, '#fbbf24');
        if (candidate.isPlayer) {
          window.SFX.announce('Attention. You are the new Kill Leader.');
        }
      }
    }
  }

  toggleFullMap() {
    const modal = document.getElementById('fullmap-modal');
    if (modal) modal.classList.toggle('hidden');
  }

  toggleFullscreen() {
    const elem = document.documentElement;
    if (!document.fullscreenElement) {
      if (elem.requestFullscreen) elem.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }
  }

  returnToLobby() {
    if (this.isOnline && window.NET) { window.NET.leave(); }
    this.isOnline = false;
    this.matchActive = false;
    this.isSpectating = false;
    if (document.exitPointerLock) document.exitPointerLock();
    document.getElementById('hud-screen').classList.add('hidden');
    document.getElementById('match-end-modal').classList.add('hidden');
    document.getElementById('spectate-bar').classList.add('hidden');
    document.getElementById('inventory-modal').classList.add('hidden');
    document.getElementById('heal-wheel-modal').classList.add('hidden');
    document.getElementById('deathbox-modal').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
    this.updateLobby3DSquad(null);
    window.SFX.playLobbyMusic();
  }

  // =========================================================================
  // MAIN GAME LOOP (60 FPS)
  // =========================================================================
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const realDt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    let dt = realDt;
    if (this.slowMoTimer > 0) {
      this.slowMoTimer = Math.max(0, this.slowMoTimer - realDt);
      dt = realDt * 0.42;
    }
    this.updateComboMeter(realDt);

    this.fpsFrames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      const fps = Math.round(this.fpsFrames / this.fpsTimer);
      const fpsEl = document.getElementById('hud-fps');
      if (fpsEl) fpsEl.textContent = `${fps} FPS`;
      // BATCH 9: Dynamic Mobile Resolution Guard for consistent 60 FPS in heavy firefights
      if (this.forceMobileUI && this.matchActive && fps < 32 && this.renderer && this.renderer.getPixelRatio() > 0.85) {
        this.renderer.setPixelRatio(0.85);
      }
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }

    // Render Full-Screen 3D Trio Squad Lobby Stage + Music Beat Visualizer when in Lobby!
    if (!this.matchActive) {
      const vizBars = document.querySelectorAll('#lobby-music-viz span');
      if (vizBars.length > 0) {
        const spec = window.SFX.getMusicSpectrum();
        vizBars.forEach((bar, i) => {
          const val = spec ? (spec[i * 2 + 1] / 255) : (window.SFX.musicEnabled ? (0.25 + Math.abs(Math.sin(now * 0.005 + i)) * 0.5) : 0.1);
          bar.style.height = `${Math.max(15, Math.round(val * 100))}%`;
        });
      }
      if (this.lobbyScene && this.lobbyCamera) {
        if (this.lobbyStargate) this.lobbyStargate.rotation.z += dt * 0.45;
        if (this.lobbyPedestals) {
          this.lobbyPedestals.forEach((ped, idx) => {
            if (idx === 0) ped.charMount.rotation.y = this.lobbyOrbitYaw + Math.sin(now * 0.0008) * 0.25;
            ped.charMount.children.forEach(ch => {
              if (ch.userData && ch.userData.mixer) ch.userData.mixer.update(dt);
            });
          });
        }
        if (this.lobbyMotes) { this.lobbyMotes.rotation.y += 0.0009; this.lobbyMotes.position.y = Math.sin(performance.now() * 0.0003) * 0.15; }
        // heroes/GLBs attach asynchronously: refresh shadow flags about once a second
        this._lobbyShadowTick = (this._lobbyShadowTick || 0) + 1;
        if (this._lobbyShadowTick % 60 === 1) this.lobbyScene.traverse(o => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
        this.renderer.render(this.lobbyScene, this.lobbyCamera);
      }
      return;
    }

    this.matchTime += dt;
    this.updateDropship(dt);

    if (!this.isFiringRange) {
      this.carePackageTimer -= dt;
      if (this.carePackageTimer <= 0 && this.world.carePackages.length < 4) {
        this.carePackageTimer = window.GODWARS_DATA.MATCH_CONFIG.carePackageInterval;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * (this.ringRadius * 0.65);
        const cx = this.ringCenter.x + Math.cos(a) * r;
        const cz = this.ringCenter.z + Math.sin(a) * r;
        this.world.spawnCarePackage(cx, cz);
        this.showBanner('📦 ODIN CARE PACKAGE INCOMING (MYTHIC LV5 RED RUNE & GOLD WEAPON)!', '#f43f5e');
        window.SFX.announce('Care package incoming.');
      }
    }

    if (this.isSpectating) {
      this.updateSpectatorCamera(dt);
    } else {
      this.updatePlayer(dt);
    }

    this.bots.forEach(bot => bot.update(dt, this.matchTime));
    this.combat.update(dt);
    if (!this.isFiringRange) {
      this.updateStormRing(dt);
    } else {
      this.world.updateRingVisual(0, 0, this.world.islandRadius, this.matchTime, dt);
    }
    // P0-3: Follow Player with Tight Directional Sun Shadow Camera for Crisp Shadows Everywhere!
    if (this.world && this.world.sunLight && this.player) {
      const pp = this.player.position;
      this.world.sunLight.position.set(pp.x + 55, pp.y + 92, pp.z + 48);
      this.world.sunLight.target.position.set(pp.x, pp.y, pp.z);
      this.world.sunLight.target.updateMatrixWorld();
    }
    this.updateHUD(dt);
    this.drawMinimap();

    this.renderer.render(this.scene, this.camera);
  }

  updateSpectatorCamera(dt) {
    const aliveBots = this.bots.filter(b => b.alive);
    if (aliveBots.length === 0) return;
    const target = aliveBots[this.spectateIndex % aliveBots.length];
    const camPos = target.position.clone().add(new THREE.Vector3(0, 3.6, 6.5));
    this.camera.position.lerp(camPos, Math.min(1, dt * 8));
    this.camera.lookAt(target.position.clone().add(new THREE.Vector3(0, 1.4, 0)));
    this.viewmodelHolder.visible = false;

    const specNameEl = document.getElementById('spectate-target-name');
    if (specNameEl) {
      specNameEl.textContent = `SPECTATING: ${target.name} (${target.heroId.toUpperCase()}) • ${target.kills} KILLS`;
    }
  }

  updateDropship(dt) {
    if (!this.dropship) return;
    const speed = window.GODWARS_DATA.MATCH_CONFIG.dropshipSpeed;
    this.dropship.position.addScaledVector(this.dropshipDir, speed * dt);

    if (this.player && this.player.inDropship) {
      this.player.position.copy(this.dropship.position);
      this.camera.position.set(
        this.dropship.position.x - this.dropshipDir.x * 22,
        this.dropship.position.y + 12,
        this.dropship.position.z - this.dropshipDir.z * 22
      );
      this.camera.rotation.set(this.player.pitch - 0.35, this.player.yaw, 0, 'YXZ');
      this.viewmodelHolder.visible = false;

      if (Math.hypot(this.dropship.position.x, this.dropship.position.z) > 195 && this.matchTime > 4) {
        this.launchFromDropship();
      }
    } else if (!this.isSpectating) {
      this.viewmodelHolder.visible = !!(this.player && this.player.alive && !this.player.skydiving && !this.player.knocked);
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    if (!p || !p.alive || p.inDropship) return;

    if (p.tacticalCooldown > 0) p.tacticalCooldown = Math.max(0, p.tacticalCooldown - dt);
    if (p.slideCooldown > 0) p.slideCooldown = Math.max(0, p.slideCooldown - dt);
    if (p.ultBuffTimer > 0) p.ultBuffTimer = Math.max(0, p.ultBuffTimer - dt);
    if (p.cloakTimer > 0) p.cloakTimer = Math.max(0, p.cloakTimer - dt);
    if (p.slowTimer > 0) p.slowTimer = Math.max(0, p.slowTimer - dt);
    if (p.flashBlindTimer > 0) p.flashBlindTimer = Math.max(0, p.flashBlindTimer - dt);
    if (p.finisherTimer > 0) p.finisherTimer = Math.max(0, p.finisherTimer - dt);
    if (p.inspectTimer > 0) p.inspectTimer = Math.max(0, p.inspectTimer - dt);
    if (p.meleeTimer > 0) p.meleeTimer = Math.max(0, p.meleeTimer - dt);

    p.ultCharge = Math.min(100, p.ultCharge + dt * (this.isFiringRange && !this.isOnline ? 15 : 1.6));

    // Lv4 Gold Extended Mag Automatic Holstered Weapon Reload!
    const holsteredIdx = p.activeSlot === 0 ? 1 : 0;
    const holsteredWep = p.weapons[holsteredIdx];
    if (holsteredWep && holsteredWep.attachments.mag >= 4 && holsteredWep.mag < holsteredWep.maxMag && holsteredWep.reserve > 0) {
      p.holsteredReloadTimer += dt;
      if (p.holsteredReloadTimer >= 3.5) {
        p.holsteredReloadTimer = 0;
        const need = holsteredWep.maxMag - holsteredWep.mag;
        const take = Math.min(need, holsteredWep.reserve);
        holsteredWep.mag += take;
        holsteredWep.reserve -= take;
        window.SFX.playReload();
        this.showBanner(`GOLD MAG AUTO-RELOADED: ${holsteredWep.data.divineName}`, '#fbbf24');
      }
    }

    // Complete 4-Tier Apex Healing Cast
    if (p.healTimer > 0) {
      p.healTimer -= dt;
      if (p.healTimer <= 0) {
        const hItem = window.GODWARS_DATA.HEAL_ITEMS[p.healingType];
        if (hItem && (p.heals[p.healingType] > 0 || this.isFiringRange)) {
          if (!this.isFiringRange || this.isOnline) p.heals[p.healingType]--;
          if (hItem.shieldRestore > 0) {
            p.shield = Math.min(p.maxShield, p.shield + hItem.shieldRestore);
          }
          if (hItem.hpRestore > 0) {
            p.hp = Math.min(p.maxHp, p.hp + hItem.hpRestore);
          }
          window.SFX.playEvoUpgrade();
          this.showBanner(`${hItem.name.toUpperCase()} COMPLETE!`, hItem.color);
        }
        p.healingType = null;
      }
    }

    let moveForward = 0;
    let moveRight = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveForward += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveForward -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveRight += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveRight -= 1;

    if (this.touchMove.active) {
      moveRight += this.touchMove.dx;
      moveForward -= this.touchMove.dy;
    } else if (this.autoSprintLocked) {
      moveForward = 1;
    }

    // BATCH 6: Apex Mobile Magnetic Aim Assist
    this.applyMobileAimAssist(dt);

    const inputLen = Math.hypot(moveForward, moveRight);
    if (inputLen > 1) {
      moveForward /= inputLen;
      moveRight /= inputLen;
    }

    const forwardVec = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const rightVec = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const wishDir = new THREE.Vector3()
      .addScaledVector(forwardVec, moveForward)
      .addScaledVector(rightVec, moveRight);

    // 1. Bifrost Zipline Riding Physics
    if (p.ziplining && p.activeZipline) {
      const z = p.activeZipline;
      const totalLen = z.start.distanceTo(z.end);
      const zipSpeed = 24 / Math.max(1, totalLen);
      p.ziplineT += p.ziplineDir * zipSpeed * dt;

      if (p.ziplineT >= 1 || p.ziplineT <= 0) {
        this.detachFromZipline(true);
      } else {
        p.position.lerpVectors(z.start, z.end, p.ziplineT);
        p.position.y -= 1.65;
      }
    } else if (p.skydiving) {
      // 2. 3rd-Person Skydive Gliding Mode with Glowing Dive Trail, Telemetry & Skydive Emote!
      const lookDir = new THREE.Vector3(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)).normalize();
      const diveSpeed = 35 + Math.max(0, -lookDir.y) * 14;
      p.position.x += lookDir.x * diveSpeed * dt;
      p.position.z += lookDir.z * diveSpeed * dt;
      p.position.y -= (21 + Math.max(0, -lookDir.y) * 10) * dt;

      if (p.thirdPersonMesh) {
        p.thirdPersonMesh.visible = true;
        p.thirdPersonMesh.position.copy(p.position);
        if (p.skydiveEmoteTimer > 0) {
          p.skydiveEmoteTimer -= dt;
          p.thirdPersonMesh.rotation.set(0.75 + p.skydiveEmoteTimer * 5.2, p.yaw + Math.PI + p.skydiveEmoteTimer * 7.5, p.skydiveEmoteTimer * 4.0);
        } else {
          p.thirdPersonMesh.rotation.set(0.75, p.yaw + Math.PI, 0);
        }
      }

      // BATCH 6: Live Skydive Altimeter & Airspeed HUD
      const skyHud = document.getElementById('hud-skydive-telemetry');
      if (skyHud) {
        skyHud.classList.remove('hidden');
        const altEl = document.getElementById('sky-alt-val');
        const spdEl = document.getElementById('sky-spd-val');
        if (altEl) altEl.textContent = `${Math.max(0, Math.round(p.position.y))}m`;
        if (spdEl) spdEl.textContent = `${Math.round(diveSpeed * 3.8)} km/h`;
      }

      const groundY = this.world.getGroundHeight(p.position.x, p.position.z, p.position.y);
      if (p.position.y <= groundY) {
        p.position.y = groundY;
        p.skydiving = false;
        p.onGround = true;
        p.velocity.set(0, 0, 0);
        if (p.thirdPersonMesh) p.thirdPersonMesh.visible = false;
        if (skyHud) skyHud.classList.add('hidden');
        window.SFX.playReload();
      }
    } else if (p.finisherTimer <= 0) {
      if (p.thirdPersonMesh) p.thirdPersonMesh.visible = false;
      const skyHud = document.getElementById('hud-skydive-telemetry');
      if (skyHud && !skyHud.classList.contains('hidden')) skyHud.classList.add('hidden');

      // 3. Ground / Air / Slide / Valkyrie Jetpack Movement + Batch 2 Perk Modifiers
      const hData = window.GODWARS_DATA.HEROES[p.heroId];
      p.isSprinting = !p.knocked && (this.keys['ShiftLeft'] || this.touchMove.dy < -0.75 || this.autoSprintLocked) && moveForward > 0.3 && !p.isADS;

      const perkSpeed = 1 + ((p.perks && p.perks.speedBonus) || 0);
      let speed = (p.knocked ? 2.2 : 7.8) * (hData.speedMult || 1.0) * perkSpeed;
      if (p.isSprinting) speed *= 1.38;
      if (p.isADS) speed *= 0.72;
      if (p.cloakTimer > 0) speed *= 1.3;
      if (p.slowTimer > 0) speed *= 0.6;

      if (p.isSliding) {
        p.slideTimer -= dt;
        const perkSlide = 1 + ((p.perks && p.perks.slideBoostBonus) || 0);
        const slideMult = (p.heroId === 'loki' ? 1.78 : 1.58) * perkSlide;
        speed = 8.2 * slideMult;
        if (p.slideTimer <= 0) p.isSliding = false;
      }

      if (p.heroId === 'thor' && (p.isSprinting || p.isSliding)) {
        p.thunderCharge = Math.min(100, p.thunderCharge + 35 * dt);
      }

      if (p.wallJumpCd && p.wallJumpCd > 0) p.wallJumpCd = Math.max(0, p.wallJumpCd - dt);
      if (p.momentumBoost && p.momentumBoost > 0) {
        p.position.x += p.momentumDir.x * p.momentumBoost * dt;
        p.position.z += p.momentumDir.z * p.momentumBoost * dt;
        p.momentumBoost = Math.max(0, p.momentumBoost - (p.onGround ? 26 : 9) * dt);
      }

      if (p.holstered) speed *= 1.16;

      p.position.x += wishDir.x * speed * dt;
      p.position.z += wishDir.z * speed * dt;

      if (p.heroId === 'valkyrie' && !p.onGround && this.keys['Space'] && p.jetpackFuel > 0) {
        p.velocity.y = Math.min(9.5, p.velocity.y + 38 * dt);
        p.jetpackFuel = Math.max(0, p.jetpackFuel - 34 * dt);
      } else if (p.onGround) {
        p.jetpackFuel = Math.min(100, p.jetpackFuel + 28 * dt);
      }

      p.velocity.y -= 25 * dt;
      p.position.y += p.velocity.y * dt;

      const preX = p.position.x;
      const preZ = p.position.z;
      const col = this.world.resolveHorizontalCollision(p.position.x, p.position.z, p.position.y, 0.48);
      const pushX = col.x - preX;
      const pushZ = col.z - preZ;
      if (Math.hypot(pushX, pushZ) > 0.004) {
        p.wallContactNormal = new THREE.Vector3(pushX, 0, pushZ).normalize();
      } else {
        p.wallContactNormal = null;
      }
      p.position.x = col.x;
      p.position.z = col.z;

      // Apex Ledge Mantle / Wall-Climb + Super-Glide Physics
      if (!p.onGround && moveForward > 0.25 && (this.keys['Space'] || p.velocity.y > -6)) {
        const ledgeY = this.world.findClimbableLedge(p.position.x, p.position.y, p.position.z, forwardVec);
        if (ledgeY !== null && p.position.y < ledgeY) {
          p.position.y = Math.min(ledgeY, p.position.y + 11.5 * dt);
          p.velocity.y = Math.max(0, p.velocity.y);
          if (Math.abs(p.position.y - ledgeY) < 0.35) {
            p.position.y = ledgeY;
            p.position.x += forwardVec.x * 0.55;
            p.position.z += forwardVec.z * 0.55;
            p.onGround = true;
            // Apex Super-Glide burst if holding Crouch/Slide at top of mantle!
            if (this.keys['KeyC'] || this.keys['ShiftLeft']) {
              p.momentumBoost = 16.0;
              p.momentumDir = forwardVec.clone();
            }
          }
        }
      }

      const groundY = this.world.getGroundHeight(p.position.x, p.position.z, p.position.y);
      if (p.position.y <= groundY) {
        if (!p.onGround && p.velocity.y < -5.5) {
          p.landingDip = Math.min(0.18, Math.abs(p.velocity.y) * 0.011);
        }
        if (p.isSliding && groundY < (p.prevGroundY || 0) - 0.01) {
          p.slideTimer = Math.min(1.1, p.slideTimer + dt * 0.8);
        }
        p.prevGroundY = groundY;
        p.position.y = groundY;
        p.velocity.y = 0;
        p.onGround = true;
      } else {
        p.onGround = false;
      }
      if (p.landingDip > 0) {
        p.landingDip = Math.max(0, p.landingDip - dt * 0.85);
      }

      for (const pad of this.world.jumpPads) {
        if (Math.hypot(p.position.x - pad.x, p.position.z - pad.z) < pad.radius && p.position.y < 1.5) {
          p.velocity.y = 21.5;
          p.onGround = false;
          window.SFX.playJumpPad();
          this.showBanner('BIFROST JUMP PAD LAUNCH!', '#38bdf8');
        }
      }
    }

    // First-Person Knockdown Shield Visibility when Player is Knocked & Holding ADS!
    if (this.fpKnockShield) {
      const showKd = p.knocked && p.isADS && p.knockdownShieldHp > 0;
      this.fpKnockShield.visible = showKd;
      if (showKd) {
        const tierInfo = window.GODWARS_DATA.EVO_TIERS[p.shieldTier] || window.GODWARS_DATA.EVO_TIERS[2];
        this.fpKnockShield.material.color.setHex(tierInfo.hex);
      }
    }

    const speedLinesEl = document.getElementById('speed-lines-overlay');
    if (speedLinesEl) {
      const highSpeed = p.skydiving || p.isSliding || p.ziplining || Math.abs(p.velocity.y) > 13;
      speedLinesEl.classList.toggle('active', highSpeed);
    }

    // Camera Positioning: 3rd-Person Skydive / 3rd-Person Over-The-Shoulder Action Mode / 1st-Person FPS!
    if (p.skydiving) {
      if (p.diveTrail) p.diveTrail.visible = true;
      const camBack = new THREE.Vector3(Math.sin(p.yaw) * 6.2, 3.2, Math.cos(p.yaw) * 6.2);
      this.camera.position.copy(p.position).add(camBack);
      this.camera.rotation.set(p.pitch - 0.18, p.yaw, 0, 'YXZ');
      this.viewmodelHolder.visible = false;
    } else if (this.thirdPersonMode && !p.knocked) {
      // Euphoria-Inspired 3rd-Person Over-The-Shoulder Action Camera!
      if (p.thirdPersonMesh) {
        p.thirdPersonMesh.visible = true;
        if (p.diveTrail) p.diveTrail.visible = false;
        p.thirdPersonMesh.position.copy(p.position);
        p.thirdPersonMesh.rotation.set(p.isSliding ? -0.48 : 0, p.yaw + Math.PI, 0);
        p.thirdPersonMesh.scale.y = p.isSliding ? 0.72 : 1.0;

        // Animate Rigged 3rd-Person Hero via Skeletal AnimationMixer (Idle / Run / Slide)!
        const ud = p.thirdPersonMesh.userData;
        if (ud && ud.mixer) {
          ud.mixer.update(dt);
          if (ud.playAnim) {
            if (p.isSliding) ud.playAnim('Slide');
            else if (inputLen > 0.1 && p.onGround) ud.playAnim('Run');
            else ud.playAnim('Idle');
          }
        } else if (ud && ud.leftLeg && ud.rightLeg) {
          const swing = (inputLen > 0.1 && p.onGround && !p.isSliding) ? Math.sin(this.matchTime * 14) * 0.68 : 0;
          ud.leftLeg.rotation.x = swing;
          ud.rightLeg.rotation.x = -swing;
          if (ud.leftArm) ud.leftArm.rotation.x = -swing * 0.6;
        }
      }
      const shoulderDist = p.isADS ? 2.15 : 3.35;
      const headPivot = new THREE.Vector3(p.position.x, p.position.y + (p.isSliding ? 1.2 : 1.75), p.position.z);
      const rightOff = new THREE.Vector3(Math.cos(p.yaw) * 0.68, 0, -Math.sin(p.yaw) * 0.68);
      const backOff = new THREE.Vector3(Math.sin(p.yaw) * shoulderDist, (p.isSliding ? 0.15 : 0.32) - p.pitch * 1.1, Math.cos(p.yaw) * shoulderDist);
      const desiredCam = headPivot.clone().add(rightOff).add(backOff);

      // P1-1 FIXED: 3rd-Person Camera Wall-Collision Raycast so camera NEVER clips behind walls!
      const camDir = desiredCam.clone().sub(headPivot);
      let camDist = camDir.length();
      if (camDist > 0.1) {
        camDir.normalize();
        const camRay = new THREE.Ray(headPivot, camDir);
        const hitPt = new THREE.Vector3();
        for (const c of this.world.colliders) {
          if (c.isDoor && !c.active) continue;
          if (camRay.intersectBox(new THREE.Box3(new THREE.Vector3(c.minX, c.minY, c.minZ), new THREE.Vector3(c.maxX, c.maxY, c.maxZ)), hitPt)) {
            const d = headPivot.distanceTo(hitPt);
            if (d < camDist) camDist = Math.max(0.55, d - 0.35);
          }
        }
        desiredCam.copy(headPivot).addScaledVector(camDir, camDist);
      }
      this.camera.position.copy(desiredCam);
      const targetRoll = p.isSliding ? -0.08 : 0;
      p.camRoll = (p.camRoll || 0) + (targetRoll - (p.camRoll || 0)) * Math.min(1, dt * 14);
      this.camera.rotation.set(p.pitch * 0.85, p.yaw, p.camRoll, 'YXZ');
      this.viewmodelHolder.visible = false;
    } else {
      if (p.thirdPersonMesh) p.thirdPersonMesh.visible = false;
      const eyeHeight = (p.knocked ? 0.65 : p.isSliding ? 0.92 : 1.68) - (p.landingDip || 0);
      const targetRoll = p.isSliding ? -0.115 : (p.wallJumpCd > 0.3 ? 0.095 : 0);
      p.camRoll = (p.camRoll || 0) + (targetRoll - (p.camRoll || 0)) * Math.min(1, dt * 14);
      // BATCH 9: Dynamic Micro Camera Shake on Explosions/Kills/Hits
      let shakeX = 0, shakeY = 0;
      if (this.camShake > 0.002) {
        shakeX = (Math.random() - 0.5) * this.camShake * 0.25;
        shakeY = (Math.random() - 0.5) * this.camShake * 0.25;
        this.camShake = Math.max(0, this.camShake - dt * 1.4);
      }
      this.camera.position.set(p.position.x + shakeX, p.position.y + eyeHeight + shakeY, p.position.z);
      this.camera.rotation.set(p.pitch, p.yaw, p.camRoll, 'YXZ');
      this.viewmodelHolder.visible = !p.knocked;

      // BATCH 7: Glowing Slide Friction Sparks behind boots when Apex Sliding!
      if (p.isSliding && Math.random() < 0.35 && this.combat) {
        this.combat.spawnImpactSparks(p.position.clone().add(new THREE.Vector3(0, 0.15, 0)), 0x38bdf8, 1);
      }
    }

    // Apply Optic Attachment Zoom Multiplier + Euphoria Style FOV Kick!
    const wep = p.weapons[p.activeSlot];
    const opticTier = window.GODWARS_DATA.ATTACHMENTS.optic.tiers[wep.attachments.optic || 0];
    const adsTargetFov = (wep.data.adsFov || 55) * opticTier.zoomMult;
    const baseTargetFov = p.isADS && !p.knocked ? adsTargetFov : (p.isSprinting || p.isSliding || p.ziplining || p.skydiving ? this.fov + 10 : this.fov);
    const targetFov = baseTargetFov + (this.fovKick || 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();

    // Update First-Person Weapon Viewmodel + BATCH 7 Apex Weapon Look-Lag / Inertia Sway!
    if (this.activeViewmodel && !p.skydiving) {
      const dYaw = p.yaw - (this.prevPlayerYaw || p.yaw);
      const dPitch = p.pitch - (this.prevPlayerPitch || p.pitch);
      this.prevPlayerYaw = p.yaw;
      this.prevPlayerPitch = p.pitch;
      const swayClamp = (v) => Math.max(-0.045, Math.min(0.045, v));
      this.swayX += (swayClamp(-dYaw * 0.45) - this.swayX) * Math.min(1, dt * 12);
      this.swayY += (swayClamp(-dPitch * 0.45) - this.swayY) * Math.min(1, dt * 12);

      const targetX = (p.isADS ? 0.0 : p.inspectTimer > 0 ? 0.06 : 0.19) + this.swayX * (p.isADS ? 0.25 : 1.0);
      const targetY = (p.isADS ? -0.132 : p.inspectTimer > 0 ? -0.14 : -0.235) + this.swayY * (p.isADS ? 0.25 : 1.0);
      const targetZ = p.isADS ? -0.32 : p.meleeTimer > 0 ? -0.24 : -0.58; // pushed out so the stock no longer clips the lens and both hands read
      const bob = (inputLen > 0.1 && p.onGround && !p.isADS) ? Math.sin(this.matchTime * 11) * 0.012 : 0;

      this.activeViewmodel.position.x += (targetX - this.activeViewmodel.position.x) * Math.min(1, dt * 16);
      this.activeViewmodel.position.y += (targetY + bob - this.activeViewmodel.position.y) * Math.min(1, dt * 16);
      this.activeViewmodel.position.z += (targetZ - this.activeViewmodel.position.z) * Math.min(1, dt * 16);

      const flash = this.activeViewmodel.userData.muzzleFlash;
      if (flash && flash.material.opacity > 0) {
        flash.material.opacity = Math.max(0, flash.material.opacity - dt * 18);
        flash.rotation.z += dt * 25;
      }

      if (this.activeViewmodel.userData.meleeMesh) {
        const showHeirloom = !!(p.meleeTimer > 0 || p.holstered);
        this.activeViewmodel.userData.meleeMesh.visible = showHeirloom;
        if (p.meleeTimer > 0) {
          this.activeViewmodel.userData.meleeMesh.rotation.x = -Math.sin(p.meleeTimer * Math.PI * 2) * 1.1;
        } else if (p.holstered) {
          this.activeViewmodel.userData.meleeMesh.rotation.y += dt * 4.5;
          this.activeViewmodel.userData.meleeMesh.position.set(0.0, -0.02, -0.25);
        }
      }
      // Hide gun body meshes when holstered so only spinning Heirloom shows!
      this.activeViewmodel.children.forEach(ch => {
        if (ch !== this.activeViewmodel.userData.meleeMesh && ch !== this.activeViewmodel.userData.healMesh && !ch.userData.gwReplacedByGLB) {
          ch.visible = !p.holstered;
        }
      });

      // P1-1: 3D Shield Battery / Medkit First-Person Healing Prop Animation
      const healMesh = this.activeViewmodel.userData.healMesh;
      if (healMesh) {
        const isHealing = p.healTimer > 0;
        healMesh.visible = isHealing;
        if (isHealing) {
          const isMed = p.healingType === 'medkit';
          if (this.activeViewmodel.userData.healCore) {
            this.activeViewmodel.userData.healCore.material.color.setHex(isMed ? 0x10b981 : p.healingType === 'phoenix_kit' ? 0xa855f7 : 0x38bdf8);
          }
          if (this.activeViewmodel.userData.healRing) {
            this.activeViewmodel.userData.healRing.rotation.z += dt * 9.5;
          }
          healMesh.position.y = -0.04 + Math.sin(this.matchTime * 10) * 0.015;
          healMesh.rotation.y += dt * 3.2;
        }
      }

      // P1-1: 3-Phase Apex Reload Animation (Phase 1: Tilt & Drop Mag -> Phase 2: Insert Fresh Mag -> Phase 3: Bolt Cock)
      const magMesh = this.activeViewmodel.userData.magMesh;
      if (wep.reloading) {
        const totalRld = wep.data.reloadTime || 2.0;
        const prog = 1 - Math.max(0, Math.min(1, wep.reloadTimer / totalRld));
        if (prog < 0.38) {
          // Phase 1: Tilt gun & pull magazine out
          this.activeViewmodel.rotation.x = -0.28;
          this.activeViewmodel.rotation.z = 0.42;
          this.activeViewmodel.rotation.y = 0.15;
          if (magMesh && !this.activeViewmodel.userData.isRevolver) magMesh.position.y = -0.18 - prog * 0.35;
        } else if (prog < 0.76) {
          // Phase 2: Slam fresh magazine up into receiver
          const p2 = (prog - 0.38) / 0.38;
          this.activeViewmodel.rotation.x = -0.36 + Math.sin(p2 * Math.PI) * 0.18;
          this.activeViewmodel.rotation.z = 0.38;
          this.activeViewmodel.rotation.y = 0.10;
          if (magMesh && !this.activeViewmodel.userData.isRevolver) magMesh.position.y = -0.30 + p2 * 0.24;
        } else {
          // Phase 3: Charging handle / bolt snap forward
          const p3 = (prog - 0.76) / 0.24;
          this.activeViewmodel.rotation.x = -0.15 * (1 - p3);
          this.activeViewmodel.rotation.z = -0.22 * Math.sin(p3 * Math.PI);
          this.activeViewmodel.rotation.y = 0;
          if (magMesh && !this.activeViewmodel.userData.isRevolver) magMesh.position.y = -0.06;
        }
      } else if (p.healTimer > 0) {
        this.activeViewmodel.rotation.x = -0.25;
        this.activeViewmodel.rotation.z = -0.22;
        this.activeViewmodel.rotation.y = 0.20;
      } else if (p.inspectTimer > 0) {
        this.activeViewmodel.rotation.y = Math.sin(p.inspectTimer * 2.6) * 0.85;
        this.activeViewmodel.rotation.z = Math.cos(p.inspectTimer * 2.6) * 0.35;
        this.activeViewmodel.rotation.x = 0.15;
      } else if (p.isSprinting && !p.isADS) {
        this.activeViewmodel.rotation.y = 0.42;
        this.activeViewmodel.rotation.x = 0.18;
        this.activeViewmodel.rotation.z = -0.15;
      } else {
        this.activeViewmodel.rotation.x += (0 - this.activeViewmodel.rotation.x) * Math.min(1, dt * 15);
        this.activeViewmodel.rotation.y += ((p.isADS ? 0 : 0.07) - this.activeViewmodel.rotation.y) * Math.min(1, dt * 15); // slight inward cant at hip shows the support hand
        this.activeViewmodel.rotation.z += (0 - this.activeViewmodel.rotation.z) * Math.min(1, dt * 15);
      }
    }

    if (wep.reloading) {
      wep.reloadTimer -= dt;
      if (wep.reloadTimer <= 0) {
        wep.reloading = false;
        const maxMag = wep.maxMag || wep.data.magSize;
        const needed = maxMag - wep.mag;
        const take = Math.min(needed, wep.reserve);
        wep.mag += take;
        if (!this.isFiringRange || this.isOnline) wep.reserve -= take;
      }
    }

    // Weapon Firing (with Attachment Multipliers, Fire Mode & Dynamic Muzzle Flash PointLight)
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    if (this.muzzleLight && this.muzzleLight.intensity > 0) {
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 38);
    }

    let wantsToFire = (this.mouseDown || this.touchFiring) && !p.knocked && !p.skydiving && p.finisherTimer <= 0;
    if (wantsToFire && p.holstered) {
      p.holstered = false;
    }
    if (!wantsToFire && this.mobileAutoFire && !p.knocked && !p.skydiving && this.isCrosshairOnEnemy()) {
      wantsToFire = true;
    }

    if (wantsToFire && !wep.reloading && p.fireCooldown <= 0) {
      if (wep.mag > 0) {
        p.inspectTimer = 0;
        if (this.muzzleLight) {
          this.muzzleLight.color.setHex(wep.isMythicGold ? 0xfde047 : wep.data.hexColor);
          this.muzzleLight.intensity = 4.2;
        }
        this.vibrate(8);
        const helaUltActive = p.heroId === 'hela' && p.ultBuffTimer > 0;
        if (!helaUltActive) {
          wep.mag--;
        }

        const barrelTier = window.GODWARS_DATA.ATTACHMENTS.barrel.tiers[wep.attachments.barrel || 0];
        const hopupTier = window.GODWARS_DATA.ATTACHMENTS.hopup.tiers[wep.attachments.hopup || 0];
        const mode = (wep.data.modes || ['AUTO'])[wep.fireModeIndex || 0];

        const fireInterval = (60 / (wep.data.rpm * hopupTier.rpmMult)) * (helaUltActive ? 0.75 : 1.0);
        p.fireCooldown = fireInterval;

        if (mode === 'SINGLE' && !this.mobileAutoFire) {
          this.mouseDown = false;
          this.touchFiring = false;
        }

        window.SFX.playGunshot(wep.id, 0, wep.isMythicGold);
        if (this.activeViewmodel) {
          this.activeViewmodel.position.z += 0.042;
          if (this.activeViewmodel.userData.muzzleFlash) {
            this.activeViewmodel.userData.muzzleFlash.material.opacity = 0.95;
          }
          if (this.activeViewmodel.userData.isRevolver && this.activeViewmodel.userData.magMesh) {
            this.activeViewmodel.userData.magMesh.rotation.z += Math.PI / 3;
          }
        }

        const shellOrigin = this.camera.position.clone()
          .addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion), 0.45)
          .addScaledVector(rightVec, 0.22);
        this.combat.spawnShellCasing(shellOrigin, rightVec);

        let spread = (p.isADS ? wep.data.adsSpread : wep.data.spread) * barrelTier.spreadMult;
        if (wep.isMythicGold) spread *= 0.65;

        const shootDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        shootDir.x += (Math.random() - 0.5) * spread;
        shootDir.y += (Math.random() - 0.5) * spread;
        shootDir.z += (Math.random() - 0.5) * spread;
        shootDir.normalize();

        this.combat.fireWeapon(p, this.camera.position.clone(), shootDir, wep.data, wep.isMythicGold, hopupTier.dmgMult);

        // P1-2: Learnable Weapon Recoil Pattern + Camera Kick Recovery
        const recMult = (p.isADS ? 0.65 : 1.0) * barrelTier.recoilMult * (wep.isMythicGold ? 0.65 : 1.0);
        const pat = wep.data.recoilPattern;
        let dPitch = wep.data.recoilPitch * recMult;
        let dYaw = (Math.random() - 0.5) * wep.data.recoilYaw * recMult;
        if (pat && pat.length > 0) {
          const step = pat[(p.recoilShotIndex || 0) % pat.length];
          dPitch = step[0] * recMult;
          dYaw = step[1] * recMult;
          p.recoilShotIndex = (p.recoilShotIndex || 0) + 1;
        }
        p.pitch = Math.min(1.42, p.pitch + dPitch);
        p.yaw += dYaw;
        p.recoilAccumPitch = Math.min(0.18, (p.recoilAccumPitch || 0) + dPitch * 0.45);

        if (wep.mag === 0 && wep.reserve > 0) {
          this.startReload();
        }
      } else if (wep.reserve > 0) {
        this.startReload();
      }
    } else if (!wantsToFire) {
      p.recoilShotIndex = 0;
      if (p.recoilAccumPitch > 0.001) {
        const recover = Math.min(p.recoilAccumPitch, dt * 0.28);
        p.pitch = Math.max(-1.42, p.pitch - recover);
        p.recoilAccumPitch -= recover;
      }
    }

    if (p.beaconScanTimer && p.beaconScanTimer > 0) {
      p.beaconScanTimer = Math.max(0, p.beaconScanTimer - dt);
    }

    // Proximity Scan: Knocked Ally for Revive, Knocked Enemy for Finisher, Zipline, Jump Tower, Door, Ground Loot, Replicator, Beacon, Bin
    this.nearestKnockedAlly = null;
    for (const ally of this.allies) {
      if (ally.alive && ally.knocked && ally.position.distanceTo(p.position) < 3.6) {
        this.nearestKnockedAlly = ally;
        break;
      }
    }

    this.nearestKnockedBot = null;
    for (const bot of this.bots) {
      if (bot.alive && bot.knocked && !bot.isAlly && bot.position.distanceTo(p.position) < 3.6) {
        this.nearestKnockedBot = bot;
        break;
      }
    }

    this.nearJumpTower = false;
    if (this.world.jumpTower && Math.hypot(p.position.x - this.world.jumpTower.x, p.position.z - this.world.jumpTower.z) < 4.2) {
      this.nearJumpTower = true;
    }

    this.nearestZipline = null;
    if (!p.ziplining) {
      for (const z of this.world.ziplines) {
        const dStart = Math.hypot(p.position.x - z.start.x, p.position.z - z.start.z);
        const dEnd = Math.hypot(p.position.x - z.end.x, p.position.z - z.end.z);
        if (dStart < 4.5) {
          this.nearestZipline = { zip: z, t: 0.04, dir: 1 };
          break;
        } else if (dEnd < 4.5) {
          this.nearestZipline = { zip: z, t: 0.96, dir: -1 };
          break;
        }
      }
    }

    this.nearestDoor = null;
    let bestDoorDist = 3.2;
    for (const door of (this.world.doors || [])) {
      if (door.broken) continue;
      const d = Math.hypot(p.position.x - door.closedX, p.position.z - door.closedZ);
      if (d < bestDoorDist && Math.abs(p.position.y - door.y) < 2.5) {
        bestDoorDist = d;
        this.nearestDoor = door;
      }
    }

    this.nearestGroundLoot = null;
    let bestGroundDist = 3.0;
    for (const gl of (this.world.groundLoot || [])) {
      if (gl.pickedUp) continue;
      const d = Math.hypot(p.position.x - gl.x, p.position.z - gl.z);
      if (d < bestGroundDist && Math.abs(p.position.y - gl.y) < 2.2) {
        bestGroundDist = d;
        this.nearestGroundLoot = gl;
      }
    }

    this.nearestReplicator = null;
    for (const rep of (this.world.replicators || [])) {
      if (Math.hypot(p.position.x - rep.x, p.position.z - rep.z) < 3.8) {
        this.nearestReplicator = rep;
        break;
      }
    }

    this.nearestBeacon = null;
    for (const b of (this.world.surveyBeacons || [])) {
      if (Math.hypot(p.position.x - b.x, p.position.z - b.z) < 3.6 && Math.abs(p.position.y - b.y) < 2.5) {
        this.nearestBeacon = b;
        break;
      }
    }

    this.nearestRespawnBeacon = null;
    for (const rb of (this.world.respawnBeacons || [])) {
      if (!rb.used && Math.hypot(p.position.x - rb.x, p.position.z - rb.z) < 4.0) {
        this.nearestRespawnBeacon = rb;
        break;
      }
    }

    this.nearestBin = null;
    let bestBinDist = 4.2;
    for (const bin of this.world.supplyBins) {
      const d = Math.hypot(p.position.x - bin.x, p.position.z - bin.z);
      if (d < bestBinDist) {
        bestBinDist = d;
        this.nearestBin = bin;
      }
    }
  }

  isCrosshairOnEnemy() {
    if (!this.player || !this.player.alive) return false;
    const origin = this.camera.position;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const ray = new THREE.Ray(origin, dir);
    const pt = new THREE.Vector3();

    for (const bot of this.bots) {
      if (!bot.alive || bot.inDropship || bot.isAlly) continue;
      const bMin = new THREE.Vector3(bot.position.x - 0.55, bot.position.y, bot.position.z - 0.55);
      const bMax = new THREE.Vector3(bot.position.x + 0.55, bot.position.y + 2.15, bot.position.z + 0.55);
      if (ray.intersectBox(new THREE.Box3(bMin, bMax), pt)) {
        if (origin.distanceTo(pt) < 75) return true;
      }
    }
    return false;
  }

  // =========================================================================
  // RAGNAROK SHRINKING STORM RING
  // =========================================================================
  updateStormRing(dt) {
    const phases = window.GODWARS_DATA.MATCH_CONFIG.ringPhases;
    const currentPhase = phases[Math.min(this.ringPhaseIndex, phases.length - 1)];
    this.ringDamagePerSec = currentPhase.damagePerSec;

    this.ringTimer -= dt;
    if (this.ringState === 'waiting') {
      if (this.ringTimer <= 0) {
        this.ringState = 'shrinking';
        this.ringTimer = currentPhase.shrinkTime;
        this.ringStartRadius = this.ringRadius;
        this.ringTargetRadius = currentPhase.targetRadius;
        this.showBanner(`WARNING: RAGNAROK RING ROUND ${currentPhase.round} CLOSING!`, '#f43f5e');
        window.SFX.announce(`Ring round ${currentPhase.round} closing.`);
      }
    } else if (this.ringState === 'shrinking') {
      const progress = 1 - Math.max(0, this.ringTimer) / currentPhase.shrinkTime;
      this.ringRadius = this.ringStartRadius + (this.ringTargetRadius - this.ringStartRadius) * progress;

      if (this.ringTimer <= 0) {
        this.ringPhaseIndex = Math.min(phases.length - 1, this.ringPhaseIndex + 1);
        const nextP = phases[this.ringPhaseIndex];
        this.ringState = 'waiting';
        this.ringTimer = nextP.waitTime;
      }
    }

    this.world.updateRingVisual(this.ringCenter.x, this.ringCenter.z, this.ringRadius, this.matchTime, dt);

    if (this.player && this.player.alive && !this.player.inDropship) {
      const dist = Math.hypot(
        this.player.position.x - this.ringCenter.x,
        this.player.position.z - this.ringCenter.z
      );
      const outOfRing = dist > this.ringRadius;
      const ringVignette = document.getElementById('storm-vignette');
      if (ringVignette) ringVignette.classList.toggle('active', outOfRing);

      if (outOfRing) {
        this.playerRingAccum = (this.playerRingAccum || 0) + this.ringDamagePerSec * dt;
        if (this.playerRingAccum >= 2) {
          const dmg = Math.floor(this.playerRingAccum);
          this.playerRingAccum -= dmg;
          this.combat.applyDamage(null, this.player, dmg, 'Ragnarok Storm Ring');
        }
      }
    }
  }

  // =========================================================================
  // APEX LEGENDS HUD, SQUADMATE BARS, CAST PROGRESS RING & WEAPON ATTACHMENTS
  // =========================================================================
  updateHUD(dt = 0.016) {
    const p = this.player;
    if (!p) return;

    const aliveBots = this.bots.filter(b => b.alive).length;
    const totalAlive = this.isFiringRange ? 6 : aliveBots + (p.alive ? 1 : 0);

    // Count Remaining Living Squads (exact Apex Legends top-right "SQUADS LEFT" counter!)
    const livingTeams = new Set();
    if (p.alive) livingTeams.add(p.teamId);
    this.bots.forEach(b => { if (b.alive) livingTeams.add(b.teamId); });

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('hud-squads-count', this.isFiringRange ? '1' : `${livingTeams.size}`);
    setTxt('hud-alive-count', this.isOnline && window.NET ? `${window.NET.remotes.size + 1} ONLINE` : this.isFiringRange ? 'TRAINING' : `${totalAlive}/16`);
    setTxt('hud-kills-count', p.kills);
    setTxt('hud-damage-count', Math.round(p.damageDealt));

    const klEl = document.getElementById('hud-kill-leader');
    if (klEl) {
      klEl.textContent = this.killLeader ? `👑 ${this.killLeader.name} (${this.killLeader.kills})` : `👑 NONE`;
    }

    const mins = Math.floor(Math.max(0, this.ringTimer) / 60);
    const secs = Math.floor(Math.max(0, this.ringTimer) % 60).toString().padStart(2, '0');
    setTxt(
      'hud-ring-timer',
      this.isFiringRange
        ? (this.isOnline && window.NET ? `🌐 ARENA ${window.NET.room} • K ${this.player.kills || 0}` : '🎯 FIRING RANGE • UNLIMITED PRACTICE')
        : `RING ${this.ringPhaseIndex + 1} ${this.ringState === 'shrinking' ? 'CLOSING' : ''} ${mins}:${secs}`
    );

    // 360° Top Compass Ribbon
    const deg = ((Math.round((-p.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardinal = dirs[Math.round(deg / 45) % 8];
    const compassTrack = document.getElementById('compass-ribbon-track');
    if (compassTrack) {
      const prevDeg = ((deg - 30 + 360) % 360);
      const nextDeg = ((deg + 30) % 360);
      compassTrack.innerHTML = `<span>${prevDeg}°</span><span>•</span><b>${cardinal} ${deg}°</b><span>•</span><span>${nextDeg}°</span>`;
    }

    const dropBtn = document.getElementById('btn-dropship-launch');
    if (dropBtn) dropBtn.classList.toggle('hidden', !p.inDropship);

    // Center-Screen Healing Cast Progress Overlay
    const castBox = document.getElementById('hud-cast-box');
    if (castBox) {
      if (p.healTimer > 0 && p.healingType) {
        const hItem = window.GODWARS_DATA.HEAL_ITEMS[p.healingType];
        castBox.classList.remove('hidden');
        const pct = Math.min(100, Math.max(0, ((p.healDuration - p.healTimer) / p.healDuration) * 100));
        setTxt('cast-box-title', `USING ${hItem.name.toUpperCase()}`);
        setTxt('cast-box-timer', `${p.healTimer.toFixed(1)}s`);
        const fill = document.getElementById('cast-box-fill');
        if (fill) {
          fill.style.width = `${pct}%`;
          fill.style.background = hItem.color;
        }
      } else {
        castBox.classList.add('hidden');
      }
    }

    // Update Bottom-Left Allied Squadmates Live Status Bars + 3D Projected Ally Nameplates!
    const squadHudEl = document.getElementById('hud-squadmates-list');
    const allyTagsLayer = document.getElementById('ally-nameplates-layer');
    // P1-3 FIXED: Zero 60fps innerHTML Thrashing! Squadmate HUD throttled to 10Hz & 3D Nameplates reuse cached DOM nodes!
    if (squadHudEl) {
      if (this.allies.length === 0) {
        if (squadHudEl.innerHTML !== '') squadHudEl.innerHTML = '';
        if (allyTagsLayer && allyTagsLayer.innerHTML !== '') allyTagsLayer.innerHTML = '';
      } else {
        const nowSquadMs = performance.now();
        if (!this._lastSquadDomTick || nowSquadMs - this._lastSquadDomTick >= 100) {
          this._lastSquadDomTick = nowSquadMs;
          squadHudEl.innerHTML = this.allies.map(a => {
            const sPct = a.alive ? (a.shield / a.maxShield) * 100 : 0;
            const hPct = a.alive ? ((a.knocked ? a.knockedHp : a.hp) / a.maxHp) * 100 : 0;
            const status = !a.alive ? '☠️ ELIMINATED' : a.knocked ? '⚠️ KNOCKED' : a.currentEnemy ? '⚔️ FIGHTING' : '🛡️ SQUAD';
            return `
              <div class="ally-hud-row ${a.knocked ? 'knocked' : ''}">
                <div class="ally-row-top"><span>${a.name}</span><b>${status}</b></div>
                <div class="ally-mini-track"><div style="width:${sPct}%;background:#38bdf8;height:100%"></div></div>
                <div class="ally-mini-track"><div style="width:${hPct}%;background:${a.knocked ? '#f59e0b' : '#10b981'};height:100%"></div></div>
              </div>
            `;
          }).join('');
        }

        // Reuse persistent DOM nodes for 3D Floating Teammate Nameplates (0 createElement/innerHTML per frame!)
        if (allyTagsLayer) {
          this.allies.forEach(a => {
            if (!a._domTag || a._domTag.parentNode !== allyTagsLayer) {
              const tag = document.createElement('div');
              tag.className = 'ally-3d-tag';
              allyTagsLayer.appendChild(tag);
              a._domTag = tag;
            }
            if (!a.alive || a.inDropship) {
              a._domTag.style.display = 'none';
              return;
            }
            const headPos = a.position.clone().add(new THREE.Vector3(0, 2.45, 0));
            const proj = headPos.project(this.camera);
            if (proj.z <= 1) {
              const sx = Math.round((proj.x * 0.5 + 0.5) * window.innerWidth);
              const sy = Math.round((-proj.y * 0.5 + 0.5) * window.innerHeight);
              const dist = Math.round(p.position.distanceTo(a.position));
              a._domTag.style.display = 'block';
              a._domTag.className = `ally-3d-tag ${a.knocked ? 'knocked' : ''}`;
              a._domTag.style.left = `${sx}px`;
              a._domTag.style.top = `${sy}px`;
              a._domTag.textContent = `${a.knocked ? '⚠️ REVIVE ' : '🛡️ '}${a.name} (${dist}m)`;
            } else {
              a._domTag.style.display = 'none';
            }
          });
        }
      }
    }

    // P2-2: Low-HP Crimson Heartbeat Vignette
    const lowHpEl = document.getElementById('low-hp-vignette');
    if (lowHpEl) {
      lowHpEl.classList.toggle('active', p.alive && (p.hp < 38 || p.knocked));
    }

    // Player Segmented 25-HP Evo Shield Cells & Health Card
    const hData = window.GODWARS_DATA.HEROES[p.heroId];
    const tierInfo = window.GODWARS_DATA.EVO_TIERS[p.shieldTier] || window.GODWARS_DATA.EVO_TIERS[2];
    setTxt('hud-hero-name', `${hData.classIcon} ${hData.name}`);
    setTxt('hud-hp-text', p.knocked ? `BLEEDOUT ${Math.ceil(p.knockedHp)}` : `${Math.ceil(p.hp)}/${p.maxHp}`);
    setTxt('hud-shield-text', `${Math.ceil(p.shield)}/${p.maxShield}`);
    setTxt('hud-shield-tier', tierInfo.name);
    const tierEl = document.getElementById('hud-shield-tier');
    if (tierEl) tierEl.style.color = tierInfo.color;

    const cellsContainer = document.getElementById('hud-shield-cells');
    if (cellsContainer) {
      const totalCells = tierInfo.cells;
      if (cellsContainer.children.length !== totalCells) {
        cellsContainer.innerHTML = '';
        for (let i = 0; i < totalCells; i++) {
          const cell = document.createElement('div');
          cell.className = 'shield-cell-segment';
          cell.innerHTML = '<div class="shield-cell-fill"></div>';
          cellsContainer.appendChild(cell);
        }
      }
      for (let i = 0; i < totalCells; i++) {
        const cellFill = cellsContainer.children[i].querySelector('.shield-cell-fill');
        const cellAmount = Math.max(0, Math.min(25, p.shield - i * 25));
        cellFill.style.width = `${(cellAmount / 25) * 100}%`;
        cellFill.style.background = tierInfo.color;
        cellFill.style.boxShadow = cellAmount > 0 ? `0 0 8px ${tierInfo.color}` : 'none';
      }
    }

    if (tierInfo.nextThreshold) {
      const rem = Math.max(0, Math.ceil(tierInfo.nextThreshold - p.damageDealt));
      setTxt('hud-next-evo', `NEXT RUNE: ${rem} DMG`);
    } else {
      setTxt('hud-next-evo', `★ MAX MYTHIC RUNE ★`);
    }

    const hpFill = document.getElementById('hud-hp-fill');
    if (hpFill) {
      const pct = p.knocked ? (p.knockedHp / 85) * 100 : (p.hp / p.maxHp) * 100;
      hpFill.style.width = `${pct}%`;
      hpFill.style.background = p.knocked ? '#f59e0b' : 'linear-gradient(90deg, #10b981, #34d399)';
    }

    // Tactical (Q) & Ultimate (Z)
    setTxt('hud-tactical-name', hData.tacticalName);
    setTxt('hud-tactical-cd', p.tacticalCooldown > 0 ? `${p.tacticalCooldown.toFixed(1)}s` : 'READY [Q]');
    const tacBox = document.getElementById('hud-tactical-box');
    if (tacBox) tacBox.classList.toggle('ready', p.tacticalCooldown <= 0);

    setTxt('hud-ult-name', hData.ultimateName);
    setTxt('hud-ult-pct', p.ultCharge >= 100 ? 'READY [Z]' : `${Math.floor(p.ultCharge)}%`);
    const ultBox = document.getElementById('hud-ult-box');
    if (ultBox) ultBox.classList.toggle('ready', p.ultCharge >= 100);

    const curHeal = window.GODWARS_DATA.HEAL_ITEMS[this.selectedHealId];
    setTxt('hud-heal-title', curHeal.shortName);
    setTxt('hud-heal-count', p.healTimer > 0 ? `${p.healTimer.toFixed(1)}s...` : `${curHeal.icon} x${p.heals[this.selectedHealId] || 0} [H]`);

    const gData = window.GODWARS_DATA.GRENADES[this.selectedGrenadeId];
    const gCount = p.grenadeCounts[this.selectedGrenadeId] || 0;
    setTxt('hud-bomb-name', gData.shortName);
    setTxt('hud-bomb-count', `${gData.icon} x${gCount} [G]`);

    // Dual Weapon Slots + 4 Colored Attachment Slot Pips + Fire Mode Badge
    const attCfg = window.GODWARS_DATA.ATTACHMENTS;
    p.weapons.forEach((w, idx) => {
      const slotEl = document.getElementById(`hud-weapon-slot-${idx}`);
      if (!slotEl) return;
      slotEl.classList.toggle('active', idx === p.activeSlot);
      slotEl.style.setProperty('--slot-color', w.isMythicGold ? '#fde047' : w.data.color);
      const mode = (w.data.modes || ['AUTO'])[w.fireModeIndex || 0];
      setTxt(`hud-wep-name-${idx}`, `${w.isMythicGold ? '★ MYTHIC ' : ''}${w.data.divineName}`);
      setTxt(`hud-wep-base-${idx}`, `${w.data.baseName} • [${mode}]`);
      setTxt(`hud-wep-ammo-${idx}`, w.reloading ? 'RELOADING...' : `${w.mag} / ${w.reserve}`);

      const pipsEl = document.getElementById(`hud-wep-atts-${idx}`);
      if (pipsEl) {
        pipsEl.innerHTML = ['barrel', 'mag', 'optic', 'hopup'].map(cat => {
          const c = attCfg[cat].tiers[w.attachments[cat] || 0].color;
          return `<span class="att-pip" style="background:${c}" title="${cat.toUpperCase()}"></span>`;
        }).join('');
      }
    });

    const activeWep = p.weapons[p.activeSlot];
    setTxt('crosshair-ammo', activeWep.reloading ? 'RLD' : `${activeWep.mag}`);
    const chAmmoEl = document.getElementById('crosshair-ammo');
    if (chAmmoEl) {
      const lowAmmo = !activeWep.reloading && activeWep.mag <= Math.ceil((activeWep.maxMag || 30) * 0.25);
      chAmmoEl.classList.toggle('low-ammo-pulse', lowAmmo);
    }

    // P0-3 FIXED: Throttle Visual Sound Radar & Heavy Mobile Checks to 10 Hz (100ms) instead of 60fps DOM thrashing!
    const nowMs = performance.now();
    if (!this._lastMobileHudTick || nowMs - this._lastMobileHudTick >= 100) {
      this._lastMobileHudTick = nowMs;
      this.updateMobileAutoLootAndDoors();
      this.updateVisualSoundRadar();
      this.updateSmartHealSuggestion();
    }

    // BATCH 7: Live Firing Range Accuracy & Headshot Stat Update
    if (this.isFiringRange) {
      const acc = p.shotsFired > 0 ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;
      setTxt('range-accuracy-stat', `ACC: ${acc}% • HS: ${p.headshotsLanded || 0} • DMG: ${Math.round(p.damageDealt)}`);
    }

    // Crosshair Reload Progress Bar
    const rldWrap = document.getElementById('crosshair-reload-bar');
    const rldFill = document.getElementById('crosshair-reload-fill');
    if (rldWrap && rldFill) {
      if (activeWep.reloading) {
        rldWrap.classList.remove('hidden');
        const totalRld = activeWep.data.reloadTime || 2.0;
        const pct = Math.min(100, Math.max(0, (1 - activeWep.reloadTimer / totalRld) * 100));
        rldFill.style.width = `${pct}%`;
      } else {
        rldWrap.classList.add('hidden');
      }
    }

    // Dynamic Velocity & Recoil Crosshair Bloom (Apex Legends Feel!)
    const chWrap = document.getElementById('crosshair-wrapper');
    if (chWrap) {
      let chSize = 36;
      if (p.isADS) chSize = 20;
      else if (!p.onGround) chSize = 54;
      else if (p.isSprinting) chSize = 48;
      else if (p.isSliding) chSize = 30;
      if (p.fireCooldown > 0) chSize += 10;
      chWrap.style.width = `${chSize}px`;
      chWrap.style.height = `${chSize}px`;
    }

    const adsOverlay = document.getElementById('ads-optic-overlay');
    if (adsOverlay) {
      adsOverlay.classList.toggle('active', p.isADS && !p.knocked);
      adsOverlay.style.setProperty('--optic-color', activeWep.isMythicGold ? '#fde047' : activeWep.data.color);
      const opticLabelEl = document.getElementById('ads-optic-label');
      if (opticLabelEl) {
        opticLabelEl.textContent = attCfg.optic.tiers[activeWep.attachments.optic || 0].label;
      }
    }

    // Context Interact Prompt
    const lootPrompt = document.getElementById('hud-loot-prompt');
    const mobileLootBtn = document.getElementById('btn-touch-loot');
    let promptHtml = '';
    let mobileBtnText = '';

    if (p.knocked) {
      if (p.shieldTier >= 4 && !p.usedSelfRevive) {
        promptHtml = `<b style="color:#fbbf24">[E / TAP] GOLD RUNE GUARDIAN ANGEL: SELF-REVIVE • HOLD [ADS] FOR SHIELD!</b>`;
        mobileBtnText = `⚡ SELF-REVIVE`;
      } else {
        promptHtml = `<b style="color:#38bdf8">KNOCKED DOWN • HOLD [RIGHT-CLICK / ADS] FOR KNOCKDOWN SHIELD!</b>`;
      }
    } else if (this.nearestKnockedAlly) {
      promptHtml = `<b style="color:#10b981">[E / TAP] REVIVE SQUADMATE ${this.nearestKnockedAlly.name}!</b>`;
      mobileBtnText = `➕ REVIVE ALLY`;
    } else if (this.nearestKnockedBot) {
      promptHtml = `<b style="color:#f43f5e">[E / TAP] EXECUTE MYTHIC FINISHER ON ${this.nearestKnockedBot.name} (REFILLS 100% SHIELD)</b>`;
      mobileBtnText = `💀 EXECUTE FINISHER`;
    } else if (this.nearJumpTower) {
      promptHtml = `<b style="color:#f43f5e">[E / TAP] RIDE VALHALLA JUMP TOWER (AERIAL SKYDIVE REDEPLOY)</b>`;
      mobileBtnText = `🎈 JUMP TOWER`;
    } else if (this.nearestZipline) {
      promptHtml = `<b style="color:#fde047">[E / TAP] RIDE BIFROST ZIPLINE (${this.nearestZipline.zip.name})</b>`;
      mobileBtnText = `⚡ RIDE ZIPLINE`;
    } else if (this.nearestDoor) {
      promptHtml = `<b style="color:#38bdf8">[E / TAP] ${this.nearestDoor.open ? 'CLOSE' : 'OPEN'} DOOR • [V] MELEE KICK TO SMASH</b>`;
      mobileBtnText = `🚪 ${this.nearestDoor.open ? 'CLOSE' : 'OPEN'} DOOR`;
    } else if (this.nearestGroundLoot) {
      const glWep = window.GODWARS_DATA.WEAPONS[this.nearestGroundLoot.loot.weaponId];
      promptHtml = `<b>[E / TAP] PICK UP:</b> <span style="color:${glWep.color}">${glWep.divineName}</span> + LV${this.nearestGroundLoot.loot.shieldTier} RUNE ARMOR`;
      mobileBtnText = `🔫 EQUIP ${glWep.baseName}`;
    } else if (this.nearestReplicator) {
      promptHtml = `<b style="color:#2dd4bf">[E / TAP] ${this.nearestReplicator.name.toUpperCase()}: CRAFT ★ MYTHIC LV4 ATTACHMENTS & RUNE</b>`;
      mobileBtnText = `🛠️ CRAFT MYTHIC`;
    } else if (this.nearestBeacon) {
      promptHtml = `<b style="color:#38bdf8">[E / TAP] ${this.nearestBeacon.name.toUpperCase()}: SCAN ALL HOSTILES ON MAP</b>`;
      mobileBtnText = `📡 SCAN MAP`;
    } else if (this.nearestRespawnBeacon) {
      promptHtml = `<b style="color:#10b981">[E / TAP] ${this.nearestRespawnBeacon.name.toUpperCase()}: RESPAWN FALLEN SQUADMATES</b>`;
      mobileBtnText = `🟢 RESPAWN ALLY`;
    } else if (this.nearestBin) {
      const binWep = window.GODWARS_DATA.WEAPONS[this.nearestBin.loot.weaponId];
      const title = this.nearestBin.isCarePackage
        ? '★ ODIN MYTHIC CARE PACKAGE'
        : this.nearestBin.isDeathBox
          ? `DEATH BOX (${this.nearestBin.victimName})`
          : 'DIVINE SUPPLY BIN';
      promptHtml = `<b>[E / TAP]</b> ${title}: <span style="color:${binWep.color}">${binWep.divineName}</span> + LV${this.nearestBin.loot.shieldTier} RUNE`;
      mobileBtnText = `📦 OPEN / LOOT`;
    }

    if (promptHtml) {
      if (lootPrompt) {
        lootPrompt.classList.remove('hidden');
        lootPrompt.innerHTML = promptHtml;
      }
      if (mobileLootBtn && mobileBtnText) {
        mobileLootBtn.classList.remove('hidden');
        mobileLootBtn.textContent = mobileBtnText;
      }
    } else {
      if (lootPrompt) lootPrompt.classList.add('hidden');
      if (mobileLootBtn) mobileLootBtn.classList.add('hidden');
    }

    // 3D-to-2D Projected Apex Ping Diamond Marker
    const pingMarkerEl = document.getElementById('apex-ping-marker');
    if (this.activePing && pingMarkerEl) {
      this.activePing.ttl -= dt;
      if (this.activePing.ttl <= 0) {
        this.activePing = null;
        pingMarkerEl.classList.add('hidden');
      } else {
        const proj = this.activePing.position.clone().project(this.camera);
        if (proj.z > 1) {
          pingMarkerEl.classList.add('hidden');
        } else {
          pingMarkerEl.classList.remove('hidden');
          const sx = (proj.x * 0.5 + 0.5) * window.innerWidth;
          const sy = (-proj.y * 0.5 + 0.5) * window.innerHeight;
          const distM = Math.round(p.position.distanceTo(this.activePing.position));
          pingMarkerEl.style.left = `${sx}px`;
          pingMarkerEl.style.top = `${sy}px`;
          pingMarkerEl.style.borderColor = this.activePing.color;
          pingMarkerEl.style.color = this.activePing.color;
          pingMarkerEl.innerHTML = `<div class="ping-diamond"></div><div class="ping-label">${this.activePing.label} (${distM}m)</div>`;
        }
      }
    } else if (pingMarkerEl) {
      pingMarkerEl.classList.add('hidden');
    }

    // Projected Enemy Overhead Evo Shield & HP Bar
    const enemyBarEl = document.getElementById('enemy-overhead-bar');
    if (enemyBarEl) {
      if (this.lastHitTarget && this.lastHitTarget.alive && (this.matchTime - this.lastHitTime < 3.5)) {
        const t = this.lastHitTarget;
        const headWorld = t.position.clone().add(new THREE.Vector3(0, 2.35, 0));
        const proj = headWorld.project(this.camera);
        if (proj.z <= 1) {
          enemyBarEl.classList.remove('hidden');
          const sx = (proj.x * 0.5 + 0.5) * window.innerWidth;
          const sy = (-proj.y * 0.5 + 0.5) * window.innerHeight;
          enemyBarEl.style.left = `${sx}px`;
          enemyBarEl.style.top = `${sy}px`;
          const tTier = window.GODWARS_DATA.EVO_TIERS[t.shieldTier] || window.GODWARS_DATA.EVO_TIERS[2];
          const sPct = (t.shield / t.maxShield) * 100;
          const hPct = ((t.knocked ? t.knockedHp : t.hp) / t.maxHp) * 100;
          enemyBarEl.innerHTML = `
            <div class="eo-name">${t.name} ${t.knocked ? '[KNOCKED]' : ''}</div>
            <div class="eo-track"><div class="eo-fill" style="width:${sPct}%;background:${tTier.color}"></div></div>
            <div class="eo-track"><div class="eo-fill" style="width:${hPct}%;background:#10b981"></div></div>
          `;
        } else {
          enemyBarEl.classList.add('hidden');
        }
      } else {
        enemyBarEl.classList.add('hidden');
      }
    }
  }

  drawMinimap() {
    const canvases = [
      document.getElementById('minimap-canvas'),
      document.getElementById('fullmap-canvas')
    ];

    canvases.forEach((canvas, idx) => {
      if (!canvas) return;
      if (idx === 1 && document.getElementById('fullmap-modal').classList.contains('hidden')) return;

      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const scale = (w * 0.44) / this.world.islandRadius;

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#0b1526';
      ctx.beginPath();
      ctx.arc(cx, cy, this.world.islandRadius * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#d97706';
      ctx.stroke();

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
      ctx.lineWidth = idx === 1 ? 5 : 3;
      window.GODWARS_DATA.POIS.forEach(poi => {
        if (poi.id === 'valhalla') return;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + poi.x * scale, cy + poi.z * scale);
        ctx.stroke();
      });

      ctx.fillStyle = 'rgba(226, 232, 240, 0.24)';
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
      ctx.lineWidth = 1;
      (this.world.walkableSurfaces || []).forEach(s => {
        const bw = (s.maxX - s.minX) * scale;
        const bd = (s.maxZ - s.minZ) * scale;
        if (bw < 3) return;
        const bx = cx + s.minX * scale;
        const bz = cy + s.minZ * scale;
        ctx.fillRect(bx, bz, bw, bd);
        ctx.strokeRect(bx, bz, bw, bd);
      });

      (this.world.replicators || []).forEach(rep => {
        ctx.fillStyle = '#2dd4bf';
        ctx.fillRect(cx + rep.x * scale - 3, cy + rep.z * scale - 3, 6, 6);
      });

      ctx.strokeStyle = 'rgba(253, 224, 71, 0.45)';
      ctx.lineWidth = 1.4;
      this.world.ziplines.forEach(z => {
        ctx.beginPath();
        ctx.moveTo(cx + z.start.x * scale, cy + z.start.z * scale);
        ctx.lineTo(cx + z.end.x * scale, cy + z.end.z * scale);
        ctx.stroke();
      });

      window.GODWARS_DATA.POIS.forEach(poi => {
        const px = cx + poi.x * scale;
        const py = cy + poi.z * scale;
        ctx.fillStyle = poi.color + '33';
        ctx.beginPath();
        ctx.arc(px, py, poi.radius * scale * 0.65, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.font = idx === 1 ? 'bold 11px sans-serif' : 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(poi.name.split(' ')[0], px, py + 3);
      });

      this.world.carePackages.forEach(pkg => {
        if (pkg.opened) return;
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(cx + pkg.x * scale, cy + pkg.z * scale, idx === 1 ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fde047';
        ctx.stroke();
      });

      if (this.activePing) {
        ctx.fillStyle = this.activePing.color;
        ctx.beginPath();
        ctx.arc(cx + this.activePing.position.x * scale, cy + this.activePing.position.z * scale, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Next Safe Zone White Circle (Exact Apex Legends Ring Preview!)
      if (!this.isFiringRange) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(
          cx + this.ringCenter.x * scale,
          cy + this.ringCenter.z * scale,
          Math.max(2, this.ringTargetRadius * scale),
          0,
          Math.PI * 2
        );
        ctx.stroke();

        // Dotted Rotation Guide Line from Player to Next Safe Zone Center (if outside next ring!)
        if (this.player) {
          const distToNext = Math.hypot(
            this.player.position.x - this.ringCenter.x,
            this.player.position.z - this.ringCenter.z
          );
          if (distToNext > this.ringTargetRadius) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx + this.player.position.x * scale, cy + this.player.position.z * scale);
            ctx.lineTo(cx + this.ringCenter.x * scale, cy + this.ringCenter.z * scale);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // Draw Current Ragnarok Red Storm Ring
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(
        cx + this.ringCenter.x * scale,
        cy + this.ringCenter.z * scale,
        Math.max(2, this.ringRadius * scale),
        0,
        Math.PI * 2
      );
      ctx.stroke();

      // Draw Allied Squadmates (Green/Cyan Dots) & Detected Enemies (Red Dots)
      const p = this.player;
      const scanActive = p && (
        (p.heroId === 'valkyrie' && p.ultBuffTimer > 0) ||
        (p.beaconScanTimer && p.beaconScanTimer > 0) ||
        p.heroId === 'loki' ||
        this.isFiringRange
      );

      this.bots.forEach(b => {
        if (!b.alive || b.inDropship) return;
        if (b.isAlly) {
          ctx.fillStyle = b.knocked ? '#fbbf24' : '#10b981';
          ctx.beginPath();
          ctx.arc(cx + b.position.x * scale, cy + b.position.z * scale, idx === 1 ? 5 : 3.5, 0, Math.PI * 2);
          ctx.fill();
          return;
        }
        const distToPlayer = p ? p.position.distanceTo(b.position) : 999;
        if (scanActive || distToPlayer < 48 || b.fireTimer > 0.05) {
          ctx.fillStyle = b.knocked ? '#fbbf24' : '#ef4444';
          ctx.beginPath();
          ctx.arc(cx + b.position.x * scale, cy + b.position.z * scale, idx === 1 ? 4.5 : 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      if (p) {
        const px = cx + p.position.x * scale;
        const py = cy + p.position.z * scale;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-p.yaw);
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(5, 6);
        ctx.lineTo(0, 3);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    });
  }

  spawnFloatingDamageNumber(worldPos, amount, isHeadshot, hitShield, shieldBroken, shieldTier = 2, targetEntity = null) {
    if (targetEntity) {
      // Apex Legends Stacking Damage Counter (accumulates burst damage on the same target within 1.1s!)
      if (this.lastHitTarget === targetEntity && (this.matchTime - this.lastHitTime) < 1.15) {
        this.stackedDamage = (this.stackedDamage || 0) + amount;
      } else {
        this.stackedDamage = amount;
      }
      this.lastHitTarget = targetEntity;
      this.lastHitTime = this.matchTime;
    } else {
      this.stackedDamage = amount;
    }

    const container = document.getElementById('damage-numbers-layer');
    if (!container) return;

    const proj = worldPos.clone().project(this.camera);
    if (proj.z > 1) return;

    const x = (proj.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 18;
    const y = (-proj.y * 0.5 + 0.5) * window.innerHeight - 24;

    // Remove previous stacking element for clean Apex live-incrementing number!
    if (this._activeStackEl && this._activeStackEl.parentNode) {
      this._activeStackEl.remove();
    }

    const el = document.createElement('div');
    el.className = `dmg-float ${isHeadshot ? 'headshot' : ''}`;
    const shieldColors = { 1: '#f8fafc', 2: '#38bdf8', 3: '#c084fc', 4: '#fbbf24', 5: '#f43f5e' };
    const color = isHeadshot
      ? '#fde047'
      : hitShield
        ? (shieldColors[shieldTier] || '#38bdf8')
        : '#fb7185';

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.innerHTML = `${isHeadshot ? '✦ ' : ''}${this.stackedDamage}${shieldBroken ? ' 🛡️💥' : ''}`;
    container.appendChild(el);
    this._activeStackEl = el;

    const hm = document.getElementById('crosshair-hitmarker');
    if (hm) {
      hm.style.borderColor = color;
      hm.classList.add('active');
      clearTimeout(this.hmTimeout);
      this.hmTimeout = setTimeout(() => hm.classList.remove('active'), 110);
    }

    setTimeout(() => el.remove(), 750);
  }

  triggerDamageIndicator(attackerPos) {
    const ind = document.getElementById('damage-direction-indicator');
    if (!ind || !this.player) return;

    const dx = attackerPos.x - this.player.position.x;
    const dz = attackerPos.z - this.player.position.z;
    const angleToAttacker = Math.atan2(dx, -dz);
    const relAngle = angleToAttacker + this.player.yaw;

    ind.style.transform = `translate(-50%, -50%) rotate(${relAngle}rad)`;
    ind.classList.add('active');
    clearTimeout(this.dmgIndTimeout);
    this.dmgIndTimeout = setTimeout(() => ind.classList.remove('active'), 650);
  }

  triggerFlashbangOverlay(intensity = 1) {
    const flashEl = document.getElementById('flashbang-overlay');
    if (!flashEl) return;
    flashEl.style.opacity = Math.min(0.95, intensity);
    setTimeout(() => {
      flashEl.style.opacity = '0';
    }, 1800 * intensity);
  }

  triggerShieldBreakFlash() {
    const el = document.getElementById('shield-break-flash');
    if (!el) return;
    el.classList.add('active');
    this.vibrate(28);
    clearTimeout(this._sbFlashTimer);
    this._sbFlashTimer = setTimeout(() => el.classList.remove('active'), 420);
  }

  showBanner(text, color = '#fbbf24') {
    const banner = document.getElementById('hud-event-banner');
    if (!banner) return;
    banner.textContent = text;
    banner.style.borderColor = color;
    banner.style.color = color;
    banner.classList.add('visible');
    clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => banner.classList.remove('visible'), 3200);
  }

  showEliminationPopup(victimName, victimHeroId, totalKills) {
    const pop = document.getElementById('hud-elimination-popup');
    if (!pop) return;
    pop.innerHTML = `☠️ ELIMINATED <b>${victimName}</b> <span class="kill-badge">${totalKills} KILLS</span>`;
    pop.classList.add('visible');
    clearTimeout(this.elimTimeout);
    this.elimTimeout = setTimeout(() => pop.classList.remove('visible'), 2600);
  }

  addKillFeed(killer, victim, weaponName) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const item = document.createElement('div');
    item.className = 'kill-feed-item';
    item.innerHTML = `<span class="kf-killer">${killer}</span> <span class="kf-weapon">[${weaponName}]</span> <span class="kf-victim">${victim}</span>`;
    feed.prepend(item);
    while (feed.children.length > 5) {
      feed.removeChild(feed.lastChild);
    }
    setTimeout(() => item.remove(), 6000);
  }

  checkMatchState() {
    if (this.isOnline) return; // arena is endless free-for-all with respawns
    if (!this.matchActive || this.isFiringRange) return;
    const aliveEnemies = this.bots.filter(b => b.alive && !b.isAlly).length;

    if (!this.player.alive && !this.isSpectating) {
      const rank = aliveEnemies + 1;
      this.endMatch(false, rank);
    } else if (aliveEnemies === 0 && this.player.alive) {
      this.endMatch(true, 1);
    } else if (this.isSpectating && aliveEnemies <= 1) {
      this.isSpectating = false;
      this.endMatch(false, 2);
    }
  }

  enterSpectatorMode() {
    const aliveBots = this.bots.filter(b => b.alive);
    if (aliveBots.length === 0) return;
    document.getElementById('match-end-modal').classList.add('hidden');
    document.getElementById('spectate-bar').classList.remove('hidden');
    this.isSpectating = true;
    this.matchActive = true;
  }

  endMatch(isChampion, placement) {
    this.matchActive = false;
    if (document.exitPointerLock) document.exitPointerLock();

    this.saveCareerStats(isChampion, this.player.kills, this.player.damageDealt);

    const modal = document.getElementById('match-end-modal');
    const title = document.getElementById('match-end-title');
    const subtitle = document.getElementById('match-end-subtitle');
    const stats = document.getElementById('match-end-stats');
    const specBtn = document.getElementById('btn-spectate-match');

    if (modal && title && subtitle && stats) {
      modal.classList.remove('hidden');
      if (isChampion) {
        title.textContent = 'CHAMPION OF ASGARD';
        title.style.color = '#fbbf24';
        subtitle.textContent = 'YOUR SQUAD CONQUERED THE GOD WARS BATTLE ROYALE (#1 / 16)';
        window.SFX.playAbility('ultimate');
        window.SFX.announce('You are the Champion of Asgard.');
        if (specBtn) specBtn.classList.add('hidden');
      } else {
        title.textContent = 'SQUAD ELIMINATED';
        title.style.color = '#f43f5e';
        subtitle.textContent = `PLACEMENT: #${placement} OF 16 CONTENDERS`;
        if (specBtn) specBtn.classList.toggle('hidden', this.bots.filter(b => b.alive).length === 0);
      }

      const hData = window.GODWARS_DATA.HEROES[this.player.heroId];
      const rankInfo = this.getRankInfo(this.career.rp);
      const acc = this.player.shotsFired > 0 ? Math.round((this.player.shotsHit / this.player.shotsFired) * 100) : 0;

      // BATCH 3: Apex Death Recap Card
      const recapEl = document.getElementById('match-death-recap');
      if (recapEl) {
        if (!isChampion && this.player.lastDamageSource) {
          const src = this.player.lastDamageSource;
          recapEl.classList.remove('hidden');
          recapEl.innerHTML = `<b>☠️ DEATH RECAP:</b> Eliminated by <span style="color:#fde047">${src.attackerName}</span> using <b>${src.weaponName}</b> (Final Hit: ${src.amount} DMG) • Accuracy: ${acc}% • Headshots: ${this.player.headshotsLanded || 0}`;
        } else {
          recapEl.classList.add('hidden');
        }
      }

      stats.innerHTML = `
        <div class="end-stat-box"><span>HERO</span><b>${hData.name}</b></div>
        <div class="end-stat-box"><span>PLACEMENT</span><b>#${placement} / 16</b></div>
        <div class="end-stat-box"><span>ELIMINATIONS</span><b>${this.player.kills}</b></div>
        <div class="end-stat-box"><span>DAMAGE DEALT</span><b>${Math.round(this.player.damageDealt)}</b></div>
        <div class="end-stat-box"><span>ACCURACY / HS</span><b>${acc}% (${this.player.headshotsLanded || 0} HS)</b></div>
        <div class="end-stat-box"><span>CAREER RANK</span><b style="color:${rankInfo.color}">${rankInfo.name}</b></div>
      `;

      // BATCH 3: Animated Match XP & Account Level Progress Bar
      const xpBox = document.getElementById('match-xp-progress');
      if (xpBox) {
        const survivalXp = Math.round(this.matchTime * 4);
        const killXp = this.player.kills * 150;
        const dmgXp = Math.round(this.player.damageDealt * 0.6);
        const winXp = isChampion ? 600 : 120;
        const totalXpGain = survivalXp + killXp + dmgXp + winXp;
        this.career.xp = (this.career.xp || 0) + totalXpGain;
        const acctLevel = Math.floor(this.career.xp / 1000) + 1;
        const levelPct = Math.round(((this.career.xp % 1000) / 1000) * 100);
        try { localStorage.setItem('godwars_career_v2', JSON.stringify(this.career)); } catch (e) {}
        xpBox.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:900;">
            <span style="color:#fbbf24">ASGARD PASS LV.${acctLevel}</span>
            <span style="color:#38bdf8">+${totalXpGain} MATCH XP (Surv: ${survivalXp} • Kills: ${killXp} • Dmg: ${dmgXp})</span>
          </div>
          <div class="xp-bar-track"><div class="xp-bar-fill" style="width:${levelPct}%"></div></div>
        `;
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.GAME = new GodWarsGame();
});
