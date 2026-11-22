/**
 * GOD WARS: ASGARD ROYALE (APEX LEGENDS EDITION - 10-BATCH FULL UPGRADE)
 * Main Engine:
 * - Batch 1: Segmented 25-HP Evo Shield Cells, DMG-to-Evo counter, 360° Top Compass Ribbon
 * - Batch 2: Apex Ping System [F / Middle-Click / Mobile Ping] with 3D-to-2D diamond markers & distance
 * - Batch 3: 6 Bifrost Ziplines & Valhalla Jump Tower riding physics
 * - Batch 4: Odin Care Package Sky Drops (Lv5 Red Mythic Evo + Gold Weapons)
 * - Batch 5: First-Person Weapon Inspect [N], Tactical Sprint Pose, 3D Shell Casings
 * - Batch 6: Pre-Match "CHAMPION SQUAD" Intro Broadcast & Live 3D Arena Kill Leader Banners
 * - Batch 7: Knockdown Shields, Gold Evo Self-Revive & Mythic Finisher Executions (Refills 100% Shield!)
 * - Batch 8: Heirloom Quick Melee [V] & 4-Tier Apex Healing System (Cell, Battery, Medkit, Phoenix Kit)
 * - Batch 9: Firing Range Practice Mode + Projected Enemy Overhead Health/Shield Bars + Kill Leader Announcer
 * - Batch 10: High-Speed Wind Lines, Post-Death Live Spectator Camera, & Persistent Career Rank Stats
 */

class GodWarsGame {
  constructor() {
    this.selectedHeroId = 'thor';
    this.selectedLoadout = ['m4a1', 'p90'];
    this.selectedGrenadeId = 'solar_bomb';
    this.selectedHealId = 'shield_battery';
    this.qualityPreset = 'balanced';
    this.fov = 90;
    this.lookSensitivity = 1.0;
    this.mobileAutoFire = false;
    this.forceMobileUI = this.detectMobile();

    this.matchActive = false;
    this.isFiringRange = false;
    this.matchTime = 0;
    this.carePackageTimer = 28;
    this.bots = [];
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
    this.initLobbyUI();
    this.initLobby3DPreview();
    this.initGameRenderer();
    this.initInputHandlers();

    this.lastTime = performance.now();
    this.fpsFrames = 0;
    this.fpsTimer = 0;
    requestAnimationFrame((t) => this.loop(t));
  }

  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 1) ||
      window.innerWidth <= 960;
  }

  // =========================================================================
  // BATCH 10: PERSISTENT CAREER STATS & ASGARD PREDATOR RANK
  // =========================================================================
  loadCareerStats() {
    try {
      const raw = localStorage.getItem('godwars_career_v2');
      this.career = raw ? JSON.parse(raw) : { matches: 0, wins: 0, kills: 0, maxDmg: 0, rp: 120 };
    } catch (e) {
      this.career = { matches: 0, wins: 0, kills: 0, maxDmg: 0, rp: 120 };
    }
    this.updateCareerLobbyUI();
  }

  saveCareerStats(isWin, kills, dmg) {
    if (this.isFiringRange) return;
    this.career.matches++;
    if (isWin) this.career.wins++;
    this.career.kills += kills;
    if (dmg > this.career.maxDmg) this.career.maxDmg = Math.round(dmg);
    this.career.rp += (isWin ? 125 : 15) + kills * 22 + Math.floor(dmg / 50);
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
      elRank.innerHTML = `${rank.icon} <span style="color:${rank.color}">${rank.name}</span> (${this.career.rp} RP) • 🏆 ${this.career.wins} WINS • ☠️ ${this.career.kills} KILLS`;
    }
  }

  // =========================================================================
  // LOBBY UI & 3D HERO / DIVINE WEAPON SHOWCASE
  // =========================================================================
  initLobbyUI() {
    const heroRosterEl = document.getElementById('hero-roster');
    if (heroRosterEl) {
      heroRosterEl.innerHTML = '';
      Object.values(window.GODWARS_DATA.HEROES).forEach(h => {
        const card = document.createElement('button');
        card.className = `hero-card ${h.id === this.selectedHeroId ? 'active' : ''}`;
        card.style.setProperty('--hero-color', h.color);
        card.innerHTML = `
          <div class="hero-card-role">${h.role}</div>
          <div class="hero-card-name">${h.name}</div>
          <div class="hero-card-title">${h.title}</div>
        `;
        card.addEventListener('click', () => {
          window.SFX.playHitmarker(false, true, false);
          this.selectHero(h.id);
        });
        heroRosterEl.appendChild(card);
      });
    }

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
            <button class="btn-slot1" data-slot="0" data-wid="${w.id}">EQUIP SLOT 1</button>
            <button class="btn-slot2" data-slot="1" data-wid="${w.id}">EQUIP SLOT 2</button>
            <button class="btn-preview-wep" data-wid="${w.id}">3D INSPECT</button>
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
          this.showPreviewWeapon(wid);
          window.SFX.playReload();
        } else if (btn.classList.contains('btn-preview-wep')) {
          this.showPreviewWeapon(wid);
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

    document.querySelectorAll('.lobby-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lobby-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.lobby-tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(btn.dataset.target);
        if (panel) panel.classList.add('active');
        if (btn.dataset.target === 'tab-legends') {
          this.showPreviewHero(this.selectedHeroId);
        }
      });
    });

    const startBtn = document.getElementById('btn-start-match');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        window.SFX.init();
        window.SFX.playAbility('ultimate');
        this.startBattleRoyaleMatch(false, false);
      });
    }

    const quickDropBtn = document.getElementById('btn-instant-drop');
    if (quickDropBtn) {
      quickDropBtn.addEventListener('click', () => {
        window.SFX.init();
        window.SFX.playAbility('tactical');
        this.startBattleRoyaleMatch(true, false);
      });
    }

    const firingRangeBtn = document.getElementById('btn-firing-range');
    if (firingRangeBtn) {
      firingRangeBtn.addEventListener('click', () => {
        window.SFX.init();
        window.SFX.playEvoUpgrade();
        this.startBattleRoyaleMatch(true, true);
      });
    }

    const touchToggle = document.getElementById('toggle-mobile-hud');
    if (touchToggle) {
      touchToggle.checked = this.forceMobileUI;
      touchToggle.addEventListener('change', (e) => {
        this.forceMobileUI = e.target.checked;
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

    const sensSlider = document.getElementById('slider-sensitivity');
    if (sensSlider) {
      sensSlider.addEventListener('input', (e) => {
        this.lookSensitivity = parseFloat(e.target.value);
      });
    }

    const qualitySelect = document.getElementById('select-quality');
    if (qualitySelect) {
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
    this.updateCareerLobbyUI();
  }

  selectHero(heroId) {
    this.selectedHeroId = heroId;
    const h = window.GODWARS_DATA.HEROES[heroId];
    if (!h) return;

    this.selectedLoadout = [...h.defaultWeapons];

    document.querySelectorAll('.hero-card').forEach(el => {
      el.classList.toggle('active', el.querySelector('.hero-card-name').textContent === h.name);
    });

    const setTxt = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    setTxt('info-hero-name', h.name);
    setTxt('info-hero-title', `${h.title} • ${h.role}`);
    setTxt('info-hero-lore', h.lore);
    setTxt('info-passive-name', `${h.passiveName} • Melee: ${h.meleeName}`);
    setTxt('info-passive-desc', h.passiveDesc);
    setTxt('info-tactical-name', `${h.tacticalName} (${h.tacticalCooldown}s CD)`);
    setTxt('info-tactical-desc', h.tacticalDesc);
    setTxt('info-ult-name', `${h.ultimateName} • Finisher: ${h.finisherName}`);
    setTxt('info-ult-desc', h.ultimateDesc);

    const badge = document.getElementById('info-hero-pantheon');
    if (badge) {
      badge.textContent = h.pantheon;
      badge.style.borderColor = h.color;
      badge.style.color = h.color;
    }

    this.updateLoadoutBadges();
    this.showPreviewHero(heroId);
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

  initLobby3DPreview() {
    const canvas = document.getElementById('lobby-preview-canvas');
    if (!canvas) return;

    this.previewScene = new THREE.Scene();
    this.previewCamera = new THREE.PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.1, 50);
    this.previewCamera.position.set(0, 1.5, 4.2);
    this.previewCamera.lookAt(0, 1.15, 0);

    this.previewRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.previewRenderer.setSize(canvas.clientWidth || 480, canvas.clientHeight || 480);
    this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const ambient = new THREE.HemisphereLight(0xfef08a, 0x1e293b, 1.15);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(4, 6, 5);
    this.previewScene.add(ambient, keyLight);

    const pedGeo = new THREE.CylinderGeometry(1.15, 1.35, 0.18, 32);
    const pedMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });
    this.pedestal = new THREE.Mesh(pedGeo, pedMat);
    this.pedestal.position.y = -0.09;
    this.previewScene.add(this.pedestal);

    this.previewRoot = new THREE.Group();
    this.previewScene.add(this.previewRoot);
    this.showPreviewHero(this.selectedHeroId);
  }

  showPreviewHero(heroId) {
    if (!this.previewRoot) return;
    while (this.previewRoot.children.length > 0) {
      this.previewRoot.remove(this.previewRoot.children[0]);
    }
    const model = window.ModelFactory.createHeroModel(heroId);
    this.previewRoot.position.set(0, 0, 0);
    this.previewRoot.scale.set(1, 1, 1);
    this.previewRoot.add(model);
  }

  showPreviewWeapon(weaponId) {
    if (!this.previewRoot) return;
    while (this.previewRoot.children.length > 0) {
      this.previewRoot.remove(this.previewRoot.children[0]);
    }
    const wep = window.ModelFactory.createWeaponModel(weaponId, this.selectedHeroId, false, true);
    wep.scale.set(3.4, 3.4, 3.4);
    wep.position.set(0, 1.15, 0);
    this.previewRoot.add(wep);
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
    this.applyQualityPreset();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.applyQualityPreset();

      const pCanvas = document.getElementById('lobby-preview-canvas');
      if (pCanvas && this.previewRenderer && pCanvas.clientWidth > 0) {
        this.previewCamera.aspect = pCanvas.clientWidth / pCanvas.clientHeight;
        this.previewCamera.updateProjectionMatrix();
        this.previewRenderer.setSize(pCanvas.clientWidth, pCanvas.clientHeight);
      }
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
  // START 16-PLAYER ASGARD BATTLE ROYALE OR FIRING RANGE
  // =========================================================================
  startBattleRoyaleMatch(instantGroundDrop = false, isFiringRange = false) {
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
    this.combat = new window.CombatManager(this);

    const hData = window.GODWARS_DATA.HEROES[this.selectedHeroId];
    const startTier = isFiringRange ? 4 : 2;
    const tierInfo = window.GODWARS_DATA.EVO_TIERS[startTier];

    this.player = {
      isPlayer: true,
      name: `YOU (${hData.name})`,
      heroId: this.selectedHeroId,
      alive: true,
      knocked: false,
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
      maxHp: hData.maxHp,
      hp: hData.maxHp,
      shieldTier: startTier,
      maxShield: tierInfo.maxShield,
      shield: tierInfo.maxShield,
      kills: 0,
      damageDealt: isFiringRange ? 500 : 0,
      position: new THREE.Vector3(0, instantGroundDrop || isFiringRange ? 3.5 : 118, instantGroundDrop || isFiringRange ? 26 : -175),
      velocity: new THREE.Vector3(),
      yaw: 0,
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
      healingType: null,
      grenadeCounts: {
        solar_bomb: 3,
        apollo_flash: 2,
        yggdrasil_arc: 2
      },
      activeSlot: 0,
      weapons: this.selectedLoadout.map(wid => {
        const w = window.GODWARS_DATA.WEAPONS[wid];
        return {
          id: wid,
          data: w,
          mag: w.magSize,
          reserve: w.reserveAmmo,
          isMythicGold: isFiringRange,
          reloading: false,
          reloadTimer: 0
        };
      }),
      fireCooldown: 0
    };

    this.dropship = window.ModelFactory.createDropshipModel();
    this.dropship.position.set(-140, window.GODWARS_DATA.MATCH_CONFIG.dropshipHeight, -155);
    this.dropshipDir = new THREE.Vector3(140, 0, 155).normalize();
    this.dropship.rotation.y = Math.atan2(this.dropshipDir.x, this.dropshipDir.z);
    this.scene.add(this.dropship);

    this.bots = [];
    const heroKeys = Object.keys(window.GODWARS_DATA.HEROES);
    const weaponKeys = Object.keys(window.GODWARS_DATA.WEAPONS);
    const botNames = window.GODWARS_DATA.BOT_NAMES;

    if (isFiringRange) {
      // Spawn 6 Firing Range Combat Dummies around Valhalla Plaza
      const dummyCoords = [[-10, 8], [0, 8], [10, 8], [-14, -6], [0, -8], [14, -6]];
      dummyCoords.forEach(([dx, dz], i) => {
        const bHero = heroKeys[i % heroKeys.length];
        const bWep = weaponKeys[i % weaponKeys.length];
        const dummy = new window.AIContender(i, `DUMMY_${bHero.toUpperCase()}`, bHero, bWep, this, true);
        dummy.dropTarget.set(dx, 0, dz);
        dummy.position.set(dx, this.world.getGroundHeight(dx, dz, 0), dz);
        dummy.mesh.position.copy(dummy.position);
        dummy.mesh.visible = true;
        this.bots.push(dummy);
      });
    } else {
      for (let i = 0; i < 15; i++) {
        const bHero = heroKeys[i % heroKeys.length];
        const bWep = weaponKeys[i % weaponKeys.length];
        const bot = new window.AIContender(i, botNames[i], bHero, bWep, this, false);
        if (instantGroundDrop) {
          bot.inDropship = false;
          bot.skydiving = false;
          bot.position.set(bot.dropTarget.x, this.world.getGroundHeight(bot.dropTarget.x, bot.dropTarget.z, 0), bot.dropTarget.z);
          bot.mesh.position.copy(bot.position);
          bot.mesh.visible = true;
        }
        this.bots.push(bot);
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

    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('hud-screen').classList.remove('hidden');
    document.getElementById('match-end-modal').classList.add('hidden');
    document.getElementById('spectate-bar').classList.add('hidden');
    document.getElementById('kill-feed').innerHTML = '';

    this.syncMobileHUDVisibility();
    this.matchActive = true;
    this.matchTime = 0;

    if (!this.forceMobileUI) {
      const canvas = document.getElementById('game-canvas');
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    }

    // BATCH 6: Trigger Apex Legends Pre-Match "CHAMPION OF ASGARD" Intro Broadcast!
    if (!isFiringRange && !instantGroundDrop) {
      this.triggerChampionIntroOverlay();
    } else if (isFiringRange) {
      this.showBanner('FIRING RANGE ACTIVE • INFINITE DUMMY RESPAWN & FULL ZIPLINE / SKILL TESTING', '#10b981');
      window.SFX.announce('Welcome to the Asgard Firing Range.');
    } else {
      this.showBanner('WELCOME TO ASGARD ROYALE • 16 CONTENDERS ALIVE', '#fbbf24');
      window.SFX.announce('Attention. Sixteen contenders in Asgard.');
    }
  }

  triggerChampionIntroOverlay() {
    const overlay = document.getElementById('champion-intro-overlay');
    if (!overlay) return;
    const hData = window.GODWARS_DATA.HEROES[this.selectedHeroId];
    const champNameEl = document.getElementById('intro-champ-name');
    const champSubEl = document.getElementById('intro-champ-sub');
    if (champNameEl) champNameEl.textContent = `ODIN_Allfather • ${hData.name}`;
    if (champSubEl) champSubEl.textContent = `REIGNING ASGARD CHAMPION • 11 ELIMINATIONS • 2,480 DMG`;

    overlay.classList.remove('hidden');
    window.SFX.announce('This is your Champion. Prepare for Bifrost launch.');
    setTimeout(() => {
      overlay.classList.add('hidden');
    }, 3200);
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
      if (this.matchActive && !this.forceMobileUI && document.pointerLockElement !== canvas) {
        if (canvas.requestPointerLock) canvas.requestPointerLock();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.matchActive || document.pointerLockElement !== canvas || !this.player) return;
      const sens = 0.0021 * this.lookSensitivity * (this.player.isADS ? 0.58 : 1.0);
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
      const code = e.code;
      this.keys[code] = true;
      if (!this.matchActive || !this.player || !this.player.alive) return;

      if (code === 'Space') {
        if (this.player.inDropship) this.launchFromDropship();
        else if (this.player.ziplining) this.detachFromZipline(true);
        else this.triggerJump();
      } else if (code === 'KeyE') {
        if (this.player.inDropship) this.launchFromDropship();
        else this.handleContextInteract();
      } else if (code === 'KeyF') {
        this.triggerApexPing();
      } else if (code === 'KeyV') {
        this.triggerQuickMelee();
      } else if (code === 'KeyN') {
        this.triggerWeaponInspect();
      } else if (code === 'KeyC' || code === 'ControlLeft') {
        this.triggerSlideOrCrouch();
      } else if (code === 'KeyR') {
        this.startReload();
      } else if (code === 'Digit1') {
        this.selectWeaponSlot(0);
      } else if (code === 'Digit2') {
        this.selectWeaponSlot(1);
      } else if (code === 'KeyQ') {
        this.useTacticalAbility();
      } else if (code === 'KeyZ') {
        this.useUltimateAbility();
      } else if (code === 'KeyG') {
        this.throwEquippedGrenade();
      } else if (code === 'KeyX') {
        this.cycleGrenadeType();
      } else if (code === 'KeyH') {
        this.startHealing();
      } else if (code === 'Digit4') {
        this.cycleHealType();
      } else if (code === 'KeyM' || code === 'Tab') {
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
      joyZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        window.SFX.init();
        const t = e.changedTouches[0];
        this.touchMove.active = true;
        this.touchMove.id = t.identifier;
        const rect = joyBase.getBoundingClientRect();
        this.touchMove.startX = rect.left + rect.width / 2;
        this.touchMove.startY = rect.top + rect.height / 2;
        this.updateJoystick(t.clientX, t.clientY, joyKnob);
      }, { passive: false });

      joyZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === this.touchMove.id) {
            this.updateJoystick(t.clientX, t.clientY, joyKnob);
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

            const sens = 0.0044 * this.lookSensitivity * (this.player.isADS ? 0.6 : 1.0);
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

    const bindHoldBtn = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); window.SFX.init(); onDown(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (onUp) onUp(); }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); onDown(); });
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
    bindHoldBtn('btn-touch-grenade', () => this.throwEquippedGrenade());
    bindHoldBtn('btn-touch-heal', () => this.startHealing());
    bindHoldBtn('btn-touch-ping', () => this.triggerApexPing());
    bindHoldBtn('btn-touch-melee', () => this.triggerQuickMelee());
    bindHoldBtn('btn-touch-inspect', () => this.triggerWeaponInspect());
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
    if (hudTac) hudTac.addEventListener('click', () => this.useTacticalAbility());
    if (hudUlt) hudUlt.addEventListener('click', () => this.useUltimateAbility());
    if (hudHeal) hudHeal.addEventListener('click', () => this.cycleHealType());
    if (hudBomb) hudBomb.addEventListener('click', () => this.cycleGrenadeType());

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
  // BATCH 2: APEX LEGENDS PING SYSTEM [F / MIDDLE-CLICK / MOBILE PING]
  // =========================================================================
  triggerApexPing() {
    if (!this.player || !this.player.alive) return;
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const ray = new THREE.Ray(origin, dir);

    let bestDist = 240;
    let pingPos = origin.clone().addScaledVector(dir, 60);
    let pingType = 'location';
    let pingLabel = 'LET’S GO THIS WAY';
    let pingColor = '#f97316';

    // Check ground intersection
    if (dir.y < -0.01) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < bestDist) {
        bestDist = t;
        pingPos = origin.clone().addScaledVector(dir, t);
      }
    }

    // Check map colliders
    for (const c of this.world.colliders) {
      const pt = new THREE.Vector3();
      if (ray.intersectBox(new THREE.Box3(new THREE.Vector3(c.minX, c.minY, c.minZ), new THREE.Vector3(c.maxX, c.maxY, c.maxZ)), pt)) {
        const d = origin.distanceTo(pt);
        if (d < bestDist) {
          bestDist = d;
          pingPos.copy(pt);
        }
      }
    }

    // Check Supply Bins / Care Packages
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
          pingLabel = bin.isCarePackage ? `MYTHIC CARE PACKAGE HERE!` : `SUPPLY BIN: ${wName}`;
          pingColor = '#fbbf24';
        }
      }
    }

    // Check Enemy Contenders
    for (const bot of this.bots) {
      if (!bot.alive || bot.inDropship) continue;
      const bMin = new THREE.Vector3(bot.position.x - 0.8, bot.position.y, bot.position.z - 0.8);
      const bMax = new THREE.Vector3(bot.position.x + 0.8, bot.position.y + 2.3, bot.position.z + 0.8);
      const pt = new THREE.Vector3();
      if (ray.intersectBox(new THREE.Box3(bMin, bMax), pt)) {
        const d = origin.distanceTo(pt);
        if (d < bestDist + 3) {
          bestDist = d;
          pingPos.copy(bot.position).add(new THREE.Vector3(0, 1.4, 0));
          pingType = 'enemy';
          pingLabel = `HOSTILE SPOTTED: ${bot.name} (${bot.heroId.toUpperCase()})`;
          pingColor = '#f43f5e';
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
  }

  // =========================================================================
  // BATCH 3, 7, 8: CONTEXT INTERACT [E] (FINISHER / SELF-REVIVE / ZIPLINE / JUMP TOWER / LOOT BIN)
  // =========================================================================
  handleContextInteract() {
    const p = this.player;
    if (!p || !p.alive) return;

    // 1. Self-Revive if Player is Knocked Down with Gold/Red Evo Shield!
    if (p.knocked) {
      p.knocked = false;
      p.hp = 50;
      p.shield = Math.min(p.maxShield, 50);
      window.SFX.playEvoUpgrade();
      this.showBanner('ALLFATHER RESURRECTION COMPLETE!', '#fbbf24');
      return;
    }

    // 2. Detach if currently riding Zipline
    if (p.ziplining) {
      this.detachFromZipline(true);
      return;
    }

    // 3. Execute Mythic Finisher on nearby Knocked Down enemy!
    if (this.nearestKnockedBot) {
      this.executeMythicFinisher(this.nearestKnockedBot);
      return;
    }

    // 4. Ride Valhalla Jump Tower (Redeploy Balloon)
    if (this.nearJumpTower) {
      window.SFX.playJumpPad();
      p.position.set(this.world.jumpTower.x, this.world.jumpTower.topY, this.world.jumpTower.z);
      p.skydiving = true;
      this.showBanner('VALHALLA JUMP TOWER: AERIAL SKYDIVE REDEPLOY!', '#f43f5e');
      return;
    }

    // 5. Ride Bifrost Zipline
    if (this.nearestZipline) {
      this.attachToZipline(this.nearestZipline);
      return;
    }

    // 6. Open Divine Supply Bin / Care Package / Death Box
    if (this.nearestBin) {
      this.interactWithLootBin();
    }
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

    // Dramatic lightning & explosion VFX on victim
    this.combat.spawnLightningBolt(
      victimBot.position.clone().add(new THREE.Vector3(0, 18, 0)),
      victimBot.position.clone(),
      hData.hexColor,
      1.1
    );
    this.combat.spawnExplosionVFX(victimBot.position.clone().add(new THREE.Vector3(0, 1, 0)), 5.5, hData.hexColor, 1.2);

    setTimeout(() => {
      if (!this.matchActive || !p.alive) return;
      // Apex Legends Finisher Reward: 100% Evo Shield Refill!
      p.shield = p.maxShield;
      window.SFX.playEvoUpgrade();
      this.combat.handleElimination(p, victimBot, `FINISHER: ${hData.finisherName}`);
      this.showBanner('FINISHER COMPLETE: 100% EVO SHIELD RESTORED!', '#38bdf8');
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

  // =========================================================================
  // STANDARD PLAYER ACTIONS
  // =========================================================================
  launchFromDropship() {
    if (!this.player || !this.player.inDropship) return;
    this.player.inDropship = false;
    this.player.skydiving = true;
    this.player.position.copy(this.dropship.position);
    this.player.position.y -= 2.5;
    window.SFX.playJumpPad();
    this.showBanner('SKYDIVING TO ASGARD • AIM TOWARD YOUR TARGET POI!', '#fbbf24');
  }

  triggerJump() {
    if (!this.player || !this.player.alive || this.player.knocked) return;
    if (this.player.onGround) {
      this.player.velocity.y = 10.2;
      this.player.onGround = false;
      this.player.isSliding = false;
    } else if (this.player.heroId === 'valkyrie' && this.player.jetpackFuel > 10) {
      this.player.velocity.y = 8.5;
    }
  }

  triggerSlideOrCrouch() {
    if (!this.player || !this.player.alive || !this.player.onGround || this.player.knocked) return;
    if (this.player.slideCooldown <= 0 && !this.player.isSliding) {
      this.player.isSliding = true;
      this.player.slideTimer = 0.88;
      this.player.slideCooldown = 1.05;
    } else {
      this.player.isSliding = false;
    }
  }

  swapWeapon() {
    this.selectWeaponSlot(this.player.activeSlot === 0 ? 1 : 0);
  }

  selectWeaponSlot(slotIdx) {
    if (!this.player || this.player.activeSlot === slotIdx) return;
    this.player.activeSlot = slotIdx;
    this.player.isADS = false;
    this.player.inspectTimer = 0;
    this.equipViewmodelWeapon();
    window.SFX.playReload();
  }

  startReload() {
    if (!this.player || !this.player.alive) return;
    const wep = this.player.weapons[this.player.activeSlot];
    if (wep.reloading || wep.mag >= wep.data.magSize || wep.reserve <= 0) return;
    wep.reloading = true;
    let mult = this.player.heroId === 'zeus' ? 0.8 : 1.0;
    if (wep.isMythicGold) mult *= 0.82;
    wep.reloadTimer = wep.data.reloadTime * mult;
    window.SFX.playReload();
  }

  useTacticalAbility() {
    if (!this.player || !this.player.alive || this.player.inDropship || this.player.knocked) return;
    if (this.player.tacticalCooldown > 0) return;

    const hData = window.GODWARS_DATA.HEROES[this.player.heroId];
    this.player.tacticalCooldown = this.isFiringRange ? 2.5 : hData.tacticalCooldown;

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
    const eyePos = this.camera.position.clone();
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.combat.triggerHeroUltimate(this.player, eyePos, lookDir);
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

    // Auto-select best heal item if current selection is unneeded or empty
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

    p.healingType = itemKey;
    p.healTimer = hItem.castTime;
    this.showBanner(`USING ${hItem.name.toUpperCase()} (${hItem.castTime}s)...`, hItem.color);
  }

  interactWithLootBin() {
    if (!this.player || !this.player.alive || !this.nearestBin) return;
    const bin = this.nearestBin;

    if (!bin.opened) {
      bin.opened = true;
      if (!bin.isDeathBox && !bin.isCarePackage && bin.lid) {
        bin.lid.position.y = 1.65;
        bin.lid.position.z = -0.55;
        bin.lid.rotation.x = -1.1;
      }
    }

    const loot = bin.loot;
    const wData = window.GODWARS_DATA.WEAPONS[loot.weaponId];
    const isMythic = Boolean(loot.isMythicGold || bin.isCarePackage);

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
      this.player.weapons[hasWepIdx].reserve += wData.magSize * 3;
      this.player.weapons[hasWepIdx].mag = wData.magSize;
      if (isMythic) this.player.weapons[hasWepIdx].isMythicGold = true;
      this.equipViewmodelWeapon();
    } else {
      this.player.weapons[this.player.activeSlot] = {
        id: loot.weaponId,
        data: wData,
        mag: wData.magSize,
        reserve: wData.reserveAmmo,
        isMythicGold: isMythic,
        reloading: false,
        reloadTimer: 0
      };
      this.equipViewmodelWeapon();
    }

    window.SFX.playReload();
    const tierName = window.GODWARS_DATA.EVO_TIERS[this.player.shieldTier].name;
    this.showBanner(
      `LOOTED: ${isMythic ? '★ MYTHIC GOLD ' : ''}${wData.divineName} + ${tierName}`,
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
    this.matchActive = false;
    this.isSpectating = false;
    if (document.exitPointerLock) document.exitPointerLock();
    document.getElementById('hud-screen').classList.add('hidden');
    document.getElementById('match-end-modal').classList.add('hidden');
    document.getElementById('spectate-bar').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
  }

  // =========================================================================
  // MAIN GAME LOOP (60 FPS)
  // =========================================================================
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.fpsFrames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      const fps = Math.round(this.fpsFrames / this.fpsTimer);
      const fpsEl = document.getElementById('hud-fps');
      if (fpsEl) fpsEl.textContent = `${fps} FPS`;
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }

    if (!this.matchActive && this.previewRenderer && this.previewRoot) {
      this.previewRoot.rotation.y += dt * 0.75;
      this.previewRenderer.render(this.previewScene, this.previewCamera);
      return;
    }

    if (!this.matchActive) return;

    this.matchTime += dt;
    this.updateDropship(dt);

    // Periodic Odin Care Package Drop in Battle Royale mode
    if (!this.isFiringRange) {
      this.carePackageTimer -= dt;
      if (this.carePackageTimer <= 0 && this.world.carePackages.length < 4) {
        this.carePackageTimer = window.GODWARS_DATA.MATCH_CONFIG.carePackageInterval;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * (this.ringRadius * 0.65);
        const cx = this.ringCenter.x + Math.cos(a) * r;
        const cz = this.ringCenter.z + Math.sin(a) * r;
        this.world.spawnCarePackage(cx, cz);
        this.showBanner('📦 ODIN CARE PACKAGE INCOMING (MYTHIC LV5 RED EVO & GOLD WEAPON)!', '#f43f5e');
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
      this.viewmodelHolder.visible = this.player && this.player.alive;
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

    p.ultCharge = Math.min(100, p.ultCharge + dt * (this.isFiringRange ? 15 : 1.6));

    // Complete 4-Tier Apex Healing Cast
    if (p.healTimer > 0) {
      p.healTimer -= dt;
      if (p.healTimer <= 0) {
        const hItem = window.GODWARS_DATA.HEAL_ITEMS[p.healingType];
        if (hItem && (p.heals[p.healingType] > 0 || this.isFiringRange)) {
          if (!this.isFiringRange) p.heals[p.healingType]--;
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
    }

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
      // 2. Skydive Gliding Mode
      const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      p.position.x += lookDir.x * 34 * dt;
      p.position.z += lookDir.z * 34 * dt;
      p.position.y -= 23 * dt;

      const groundY = this.world.getGroundHeight(p.position.x, p.position.z, p.position.y);
      if (p.position.y <= groundY) {
        p.position.y = groundY;
        p.skydiving = false;
        p.onGround = true;
        p.velocity.set(0, 0, 0);
        window.SFX.playHitmarker(false, true, false);
      }
    } else if (p.finisherTimer <= 0) {
      // 3. Standard Ground / Air / Slide / Valkyrie Jetpack Movement
      const hData = window.GODWARS_DATA.HEROES[p.heroId];
      p.isSprinting = !p.knocked && (this.keys['ShiftLeft'] || this.touchMove.dy < -0.75) && moveForward > 0.3 && !p.isADS;

      let speed = (p.knocked ? 2.2 : 7.8) * (hData.speedMult || 1.0);
      if (p.isSprinting) speed *= 1.38;
      if (p.isADS) speed *= 0.72;
      if (p.cloakTimer > 0) speed *= 1.3;
      if (p.slowTimer > 0) speed *= 0.6;

      if (p.isSliding) {
        p.slideTimer -= dt;
        const slideMult = p.heroId === 'loki' ? 1.78 : 1.58;
        speed = 8.2 * slideMult;
        if (p.slideTimer <= 0) p.isSliding = false;
      }

      if (p.heroId === 'thor' && (p.isSprinting || p.isSliding)) {
        p.thunderCharge = Math.min(100, p.thunderCharge + 35 * dt);
      }

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

      const col = this.world.resolveHorizontalCollision(p.position.x, p.position.z, p.position.y, 0.48);
      p.position.x = col.x;
      p.position.z = col.z;

      const groundY = this.world.getGroundHeight(p.position.x, p.position.z, p.position.y);
      if (p.position.y <= groundY) {
        p.position.y = groundY;
        p.velocity.y = 0;
        p.onGround = true;
      } else {
        p.onGround = false;
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

    // High-Speed Wind Lines Overlay (when Skydiving, Sliding, Ziplining, or High Air Velocity)
    const speedLinesEl = document.getElementById('speed-lines-overlay');
    if (speedLinesEl) {
      const highSpeed = p.skydiving || p.isSliding || p.ziplining || Math.abs(p.velocity.y) > 13;
      speedLinesEl.classList.toggle('active', highSpeed);
    }

    // First-Person Camera Position & FOV
    const eyeHeight = p.knocked ? 0.65 : p.isSliding ? 0.92 : 1.68;
    this.camera.position.set(p.position.x, p.position.y + eyeHeight, p.position.z);
    this.camera.rotation.set(p.pitch, p.yaw, p.isSliding ? -0.07 : 0, 'YXZ');

    const wep = p.weapons[p.activeSlot];
    const targetFov = p.isADS ? (wep.data.adsFov || 55) : (p.isSprinting || p.isSliding || p.ziplining ? this.fov + 9 : this.fov);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();

    // Update First-Person Weapon Viewmodel (Hipfire vs ADS vs Tactical Sprint vs Inspect vs Quick Melee)
    if (this.activeViewmodel) {
      const targetX = p.isADS ? 0.0 : p.inspectTimer > 0 ? 0.06 : 0.24;
      const targetY = p.isADS ? -0.132 : p.inspectTimer > 0 ? -0.14 : -0.22;
      const targetZ = p.isADS ? -0.32 : p.meleeTimer > 0 ? -0.24 : -0.45;
      const bob = (inputLen > 0.1 && p.onGround && !p.isADS) ? Math.sin(this.matchTime * 11) * 0.012 : 0;

      this.activeViewmodel.position.x += (targetX - this.activeViewmodel.position.x) * Math.min(1, dt * 16);
      this.activeViewmodel.position.y += (targetY + bob - this.activeViewmodel.position.y) * Math.min(1, dt * 16);
      this.activeViewmodel.position.z += (targetZ - this.activeViewmodel.position.z) * Math.min(1, dt * 16);

      const flash = this.activeViewmodel.userData.muzzleFlash;
      if (flash && flash.material.opacity > 0) {
        flash.material.opacity = Math.max(0, flash.material.opacity - dt * 18);
        flash.rotation.z += dt * 25;
      }

      // Show Heirloom Melee Weapon during Quick Melee swing!
      if (this.activeViewmodel.userData.meleeMesh) {
        this.activeViewmodel.userData.meleeMesh.visible = p.meleeTimer > 0;
        if (p.meleeTimer > 0) {
          this.activeViewmodel.userData.meleeMesh.rotation.x = -Math.sin(p.meleeTimer * Math.PI * 2) * 1.1;
        }
      }

      if (wep.reloading) {
        this.activeViewmodel.rotation.x = -0.45;
        this.activeViewmodel.rotation.z = 0.35;
        this.activeViewmodel.rotation.y = 0;
      } else if (p.inspectTimer > 0) {
        // BATCH 5: 3D Weapon Inspect Animation
        this.activeViewmodel.rotation.y = Math.sin(p.inspectTimer * 2.6) * 0.85;
        this.activeViewmodel.rotation.z = Math.cos(p.inspectTimer * 2.6) * 0.35;
        this.activeViewmodel.rotation.x = 0.15;
      } else if (p.isSprinting && !p.isADS) {
        // Tactical Sprint Angled Carry Pose
        this.activeViewmodel.rotation.y = 0.42;
        this.activeViewmodel.rotation.x = 0.18;
        this.activeViewmodel.rotation.z = -0.15;
      } else {
        this.activeViewmodel.rotation.x += (0 - this.activeViewmodel.rotation.x) * Math.min(1, dt * 15);
        this.activeViewmodel.rotation.y += (0 - this.activeViewmodel.rotation.y) * Math.min(1, dt * 15);
        this.activeViewmodel.rotation.z += (0 - this.activeViewmodel.rotation.z) * Math.min(1, dt * 15);
      }
    }

    if (wep.reloading) {
      wep.reloadTimer -= dt;
      if (wep.reloadTimer <= 0) {
        wep.reloading = false;
        const needed = wep.data.magSize - wep.mag;
        const take = Math.min(needed, wep.reserve);
        wep.mag += take;
        if (!this.isFiringRange) wep.reserve -= take;
      }
    }

    // Weapon Firing
    if (p.fireCooldown > 0) p.fireCooldown -= dt;

    let wantsToFire = (this.mouseDown || this.touchFiring) && !p.knocked && p.finisherTimer <= 0;
    if (!wantsToFire && this.mobileAutoFire && !p.knocked && this.isCrosshairOnEnemy()) {
      wantsToFire = true;
    }

    if (wantsToFire && !wep.reloading && p.fireCooldown <= 0) {
      if (wep.mag > 0) {
        p.inspectTimer = 0;
        const helaUltActive = p.heroId === 'hela' && p.ultBuffTimer > 0;
        if (!helaUltActive) {
          wep.mag--;
        }

        const fireInterval = (60 / wep.data.rpm) * (helaUltActive ? 0.75 : 1.0);
        p.fireCooldown = fireInterval;

        if (!wep.data.auto && !this.mobileAutoFire) {
          this.mouseDown = false;
          this.touchFiring = false;
        }

        window.SFX.playGunshot(wep.id, 0, wep.isMythicGold);
        if (this.activeViewmodel) {
          this.activeViewmodel.position.z += 0.045;
          if (this.activeViewmodel.userData.muzzleFlash) {
            this.activeViewmodel.userData.muzzleFlash.material.opacity = 0.95;
          }
          if (this.activeViewmodel.userData.isRevolver && this.activeViewmodel.userData.magMesh) {
            this.activeViewmodel.userData.magMesh.rotation.z += Math.PI / 3;
          }
        }

        // Eject 3D Brass/Rune Shell Casing
        const shellOrigin = this.camera.position.clone()
          .addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion), 0.45)
          .addScaledVector(rightVec, 0.22);
        this.combat.spawnShellCasing(shellOrigin, rightVec);

        let spread = p.isADS ? wep.data.adsSpread : wep.data.spread;
        if (wep.isMythicGold) spread *= 0.65;

        const shootDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        shootDir.x += (Math.random() - 0.5) * spread;
        shootDir.y += (Math.random() - 0.5) * spread;
        shootDir.z += (Math.random() - 0.5) * spread;
        shootDir.normalize();

        this.combat.fireWeapon(p, this.camera.position.clone(), shootDir, wep.data, wep.isMythicGold);

        const recMult = (p.isADS ? 0.65 : 1.0) * (wep.isMythicGold ? 0.65 : 1.0);
        p.pitch = Math.min(1.42, p.pitch + wep.data.recoilPitch * recMult);
        p.yaw += (Math.random() - 0.5) * wep.data.recoilYaw * recMult;

        if (wep.mag === 0 && wep.reserve > 0) {
          this.startReload();
        }
      } else if (wep.reserve > 0) {
        this.startReload();
      }
    }

    // Context Proximity Scanning (Knocked Bot for Finisher, Zipline, Jump Tower, Supply Bin)
    this.nearestKnockedBot = null;
    for (const bot of this.bots) {
      if (bot.alive && bot.knocked && bot.position.distanceTo(p.position) < 3.6) {
        this.nearestKnockedBot = bot;
        break;
      }
    }

    this.nearJumpTower = false;
    if (this.world.jumpTower && Math.hypot(p.position.x - this.world.jumpTower.x, p.position.z - this.world.jumpTower.z) < 4.0) {
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
      if (!bot.alive || bot.inDropship) continue;
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
  // APEX LEGENDS HUD, COMPASS, SEGMENTED EVO CELLS, PINGS & OVERHEAD BARS
  // =========================================================================
  updateHUD(dt = 0.016) {
    const p = this.player;
    if (!p) return;

    const aliveBots = this.bots.filter(b => b.alive).length;
    const totalAlive = this.isFiringRange ? 6 : aliveBots + (p.alive ? 1 : 0);

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('hud-alive-count', this.isFiringRange ? 'TRAINING' : `${totalAlive}/16`);
    setTxt('hud-kills-count', p.kills);
    setTxt('hud-damage-count', Math.round(p.damageDealt));

    // Kill Leader HUD Crown Badge
    const klEl = document.getElementById('hud-kill-leader');
    if (klEl) {
      if (this.killLeader) {
        klEl.textContent = `👑 ${this.killLeader.name} (${this.killLeader.kills})`;
      } else {
        klEl.textContent = `👑 NONE`;
      }
    }

    const mins = Math.floor(Math.max(0, this.ringTimer) / 60);
    const secs = Math.floor(Math.max(0, this.ringTimer) % 60).toString().padStart(2, '0');
    setTxt(
      'hud-ring-timer',
      this.isFiringRange
        ? '🎯 FIRING RANGE • UNLIMITED PRACTICE'
        : `RING ${this.ringPhaseIndex + 1} ${this.ringState === 'shrinking' ? 'CLOSING' : ''} ${mins}:${secs}`
    );

    // BATCH 1: Update 360° Top Compass Ribbon
    const deg = ((Math.round((-p.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardinal = dirs[Math.round(deg / 45) % 8];
    setTxt('compass-heading-deg', `${deg}° ${cardinal}`);
    const compassTrack = document.getElementById('compass-ribbon-track');
    if (compassTrack) {
      const prevDeg = ((deg - 30 + 360) % 360);
      const nextDeg = ((deg + 30) % 360);
      compassTrack.innerHTML = `<span>${prevDeg}°</span><span>•</span><b>${cardinal} ${deg}°</b><span>•</span><span>${nextDeg}°</span>`;
    }

    const dropBtn = document.getElementById('btn-dropship-launch');
    if (dropBtn) dropBtn.classList.toggle('hidden', !p.inDropship);

    // BATCH 1: Authentic Apex Legends Segmented 25-HP Evo Shield Cells & DMG-to-Next-Evo
    const hData = window.GODWARS_DATA.HEROES[p.heroId];
    const tierInfo = window.GODWARS_DATA.EVO_TIERS[p.shieldTier] || window.GODWARS_DATA.EVO_TIERS[2];
    setTxt('hud-hero-name', hData.name);
    setTxt('hud-hp-text', `${Math.ceil(p.hp)}/${p.maxHp}`);
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

    // Next Evo Damage Counter
    if (tierInfo.nextThreshold) {
      const rem = Math.max(0, Math.ceil(tierInfo.nextThreshold - p.damageDealt));
      setTxt('hud-next-evo', `NEXT EVO: ${rem} DMG`);
    } else {
      setTxt('hud-next-evo', `★ MAX MYTHIC EVO ★`);
    }

    const hpFill = document.getElementById('hud-hp-fill');
    if (hpFill) hpFill.style.width = `${(p.hp / p.maxHp) * 100}%`;

    // Tactical (Q) & Ultimate (Z)
    setTxt('hud-tactical-name', hData.tacticalName);
    setTxt('hud-tactical-cd', p.tacticalCooldown > 0 ? `${p.tacticalCooldown.toFixed(1)}s` : 'READY [Q]');
    const tacBox = document.getElementById('hud-tactical-box');
    if (tacBox) tacBox.classList.toggle('ready', p.tacticalCooldown <= 0);

    setTxt('hud-ult-name', hData.ultimateName);
    setTxt('hud-ult-pct', p.ultCharge >= 100 ? 'READY [Z]' : `${Math.floor(p.ultCharge)}%`);
    const ultBox = document.getElementById('hud-ult-box');
    if (ultBox) ultBox.classList.toggle('ready', p.ultCharge >= 100);

    // 4-Tier Apex Healing Slot & Divine Bomb Slot
    const curHeal = window.GODWARS_DATA.HEAL_ITEMS[this.selectedHealId];
    setTxt('hud-heal-title', curHeal.shortName);
    setTxt('hud-heal-count', p.healTimer > 0 ? `${p.healTimer.toFixed(1)}s...` : `${curHeal.icon} x${p.heals[this.selectedHealId] || 0} [H]`);

    const gData = window.GODWARS_DATA.GRENADES[this.selectedGrenadeId];
    const gCount = p.grenadeCounts[this.selectedGrenadeId] || 0;
    setTxt('hud-bomb-name', gData.shortName);
    setTxt('hud-bomb-count', `${gData.icon} x${gCount} [G]`);

    // Dual Weapon Slots
    p.weapons.forEach((w, idx) => {
      const slotEl = document.getElementById(`hud-weapon-slot-${idx}`);
      if (!slotEl) return;
      slotEl.classList.toggle('active', idx === p.activeSlot);
      slotEl.style.setProperty('--slot-color', w.isMythicGold ? '#fde047' : w.data.color);
      setTxt(`hud-wep-name-${idx}`, `${w.isMythicGold ? '★ MYTHIC ' : ''}${w.data.divineName}`);
      setTxt(`hud-wep-base-${idx}`, `${w.data.baseName} • ${w.data.ammoType.split(' ')[0]}`);
      setTxt(`hud-wep-ammo-${idx}`, w.reloading ? 'RELOADING...' : `${w.mag} / ${w.reserve}`);
    });

    const activeWep = p.weapons[p.activeSlot];
    setTxt('crosshair-ammo', activeWep.reloading ? 'RLD' : `${activeWep.mag}`);

    const adsOverlay = document.getElementById('ads-optic-overlay');
    if (adsOverlay) {
      adsOverlay.classList.toggle('active', p.isADS);
      adsOverlay.style.setProperty('--optic-color', activeWep.isMythicGold ? '#fde047' : activeWep.data.color);
    }

    // Context Interact Prompt (Self-Revive / Finisher / Jump Tower / Zipline / Loot Bin)
    const lootPrompt = document.getElementById('hud-loot-prompt');
    const mobileLootBtn = document.getElementById('btn-touch-loot');
    let promptHtml = '';
    let mobileBtnText = '';

    if (p.knocked) {
      promptHtml = `<b style="color:#fbbf24">[E / TAP] GOLD EVO GUARDIAN ANGEL: SELF-REVIVE!</b>`;
      mobileBtnText = `⚡ SELF-REVIVE`;
    } else if (this.nearestKnockedBot) {
      promptHtml = `<b style="color:#f43f5e">[E / TAP] EXECUTE MYTHIC FINISHER ON ${this.nearestKnockedBot.name} (REFILLS 100% SHIELD)</b>`;
      mobileBtnText = `💀 EXECUTE FINISHER`;
    } else if (this.nearJumpTower) {
      promptHtml = `<b style="color:#f43f5e">[E / TAP] RIDE VALHALLA JUMP TOWER (AERIAL SKYDIVE REDEPLOY)</b>`;
      mobileBtnText = `🎈 JUMP TOWER`;
    } else if (this.nearestZipline) {
      promptHtml = `<b style="color:#fde047">[E / TAP] RIDE BIFROST ZIPLINE (${this.nearestZipline.zip.name})</b>`;
      mobileBtnText = `⚡ RIDE ZIPLINE`;
    } else if (this.nearestBin) {
      const binWep = window.GODWARS_DATA.WEAPONS[this.nearestBin.loot.weaponId];
      const title = this.nearestBin.isCarePackage
        ? '★ ODIN MYTHIC CARE PACKAGE'
        : this.nearestBin.isDeathBox
          ? `DEATH BOX (${this.nearestBin.victimName})`
          : 'DIVINE SUPPLY BIN';
      promptHtml = `<b>[E / TAP]</b> ${title}: <span style="color:${binWep.color}">${binWep.divineName}</span> + LV${this.nearestBin.loot.shieldTier} EVO`;
      mobileBtnText = `📦 OPEN / LOOT`;
    }

    if (promptHtml) {
      if (lootPrompt) {
        lootPrompt.classList.remove('hidden');
        lootPrompt.innerHTML = promptHtml;
      }
      if (mobileLootBtn) {
        mobileLootBtn.classList.remove('hidden');
        mobileLootBtn.textContent = mobileBtnText;
      }
    } else {
      if (lootPrompt) lootPrompt.classList.add('hidden');
      if (mobileLootBtn) mobileLootBtn.classList.add('hidden');
    }

    // BATCH 2: Update 3D-to-2D Projected Apex Ping Diamond Marker
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

    // BATCH 9: Update 3D-to-2D Projected Enemy Overhead Evo Shield & HP Bar on active combat target
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

      ctx.fillStyle = '#0b1120';
      ctx.beginPath();
      ctx.arc(cx, cy, this.world.islandRadius * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#d97706';
      ctx.stroke();

      // Draw Bifrost Ziplines on Map
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.35)';
      ctx.lineWidth = 1.2;
      this.world.ziplines.forEach(z => {
        ctx.beginPath();
        ctx.moveTo(cx + z.start.x * scale, cy + z.start.z * scale);
        ctx.lineTo(cx + z.end.x * scale, cy + z.end.z * scale);
        ctx.stroke();
      });

      // Draw 6 POIs
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

      // Draw Odin Care Packages on Map
      this.world.carePackages.forEach(pkg => {
        if (pkg.opened) return;
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(cx + pkg.x * scale, cy + pkg.z * scale, idx === 1 ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fde047';
        ctx.stroke();
      });

      // Draw Active Ping on Map
      if (this.activePing) {
        ctx.fillStyle = this.activePing.color;
        ctx.beginPath();
        ctx.arc(cx + this.activePing.position.x * scale, cy + this.activePing.position.z * scale, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Ragnarok Safe Ring
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

      // Draw Detected Enemies
      const p = this.player;
      const scanActive = p && ((p.heroId === 'valkyrie' && p.ultBuffTimer > 0) || p.heroId === 'loki' || this.isFiringRange);
      this.bots.forEach(b => {
        if (!b.alive || b.inDropship) return;
        const distToPlayer = p ? p.position.distanceTo(b.position) : 999;
        if (scanActive || distToPlayer < 48 || b.fireTimer > 0.05) {
          ctx.fillStyle = b.knocked ? '#fbbf24' : '#ef4444';
          ctx.beginPath();
          ctx.arc(cx + b.position.x * scale, cy + b.position.z * scale, idx === 1 ? 4.5 : 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Draw Player Arrow
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
      this.lastHitTarget = targetEntity;
      this.lastHitTime = this.matchTime;
    }

    const container = document.getElementById('damage-numbers-layer');
    if (!container) return;

    const proj = worldPos.clone().project(this.camera);
    if (proj.z > 1) return;

    const x = (proj.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 34;
    const y = (-proj.y * 0.5 + 0.5) * window.innerHeight - 18 + (Math.random() - 0.5) * 24;

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
    el.innerHTML = `${isHeadshot ? '✦ ' : ''}${amount}${shieldBroken ? ' 🛡️💥' : ''}`;
    container.appendChild(el);

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
    if (!this.matchActive || this.isFiringRange) return;
    const aliveBots = this.bots.filter(b => b.alive).length;

    if (!this.player.alive && !this.isSpectating) {
      const rank = aliveBots + 1;
      this.endMatch(false, rank);
    } else if (aliveBots === 0 && this.player.alive) {
      this.endMatch(true, 1);
    } else if (this.isSpectating && aliveBots <= 1) {
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
        subtitle.textContent = 'YOU CONQUERED THE GOD WARS BATTLE ROYALE (#1 / 16)';
        window.SFX.playAbility('ultimate');
        window.SFX.announce('You are the Apex Champion of Asgard.');
        if (specBtn) specBtn.classList.add('hidden');
      } else {
        title.textContent = 'SQUAD ELIMINATED';
        title.style.color = '#f43f5e';
        subtitle.textContent = `PLACEMENT: #${placement} OF 16 CONTENDERS`;
        if (specBtn) specBtn.classList.toggle('hidden', this.bots.filter(b => b.alive).length === 0);
      }

      const hData = window.GODWARS_DATA.HEROES[this.player.heroId];
      const rankInfo = this.getRankInfo(this.career.rp);
      stats.innerHTML = `
        <div class="end-stat-box"><span>HERO</span><b>${hData.name}</b></div>
        <div class="end-stat-box"><span>PLACEMENT</span><b>#${placement} / 16</b></div>
        <div class="end-stat-box"><span>ELIMINATIONS</span><b>${this.player.kills}</b></div>
        <div class="end-stat-box"><span>DAMAGE DEALT</span><b>${Math.round(this.player.damageDealt)}</b></div>
        <div class="end-stat-box"><span>EVO TIER REACHED</span><b>LV${this.player.shieldTier}</b></div>
        <div class="end-stat-box"><span>CAREER RANK</span><b style="color:${rankInfo.color}">${rankInfo.name}</b></div>
      `;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.GAME = new GodWarsGame();
});
