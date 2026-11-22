/**
 * GOD WARS: ASGARD ROYALE
 * Main Engine, First-Person Controller, Mobile Multi-Touch + Desktop Input,
 * Lobby 3D Showcase, Minimap Renderer, and 16-Player Battle Royale Match Loop.
 */

class GodWarsGame {
  constructor() {
    this.selectedHeroId = 'thor';
    this.selectedLoadout = ['m4a1', 'p90'];
    this.selectedGrenadeId = 'solar_bomb';
    this.qualityPreset = 'balanced'; // 'mobile', 'balanced', 'ultra'
    this.fov = 90;
    this.lookSensitivity = 1.0;
    this.mobileAutoFire = false;
    this.forceMobileUI = this.detectMobile();

    this.matchActive = false;
    this.matchTime = 0;
    this.bots = [];

    this.keys = {};
    this.mouseDown = false;
    this.rightMouseDown = false;

    // Mobile Touch State
    this.touchMove = { active: false, id: null, startX: 0, startY: 0, dx: 0, dy: 0 };
    this.touchLook = { active: false, id: null, lastX: 0, lastY: 0 };
    this.touchFiring = false;

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
          <div class="armory-base-tag">BASE: ${w.baseName}</div>
          <div class="armory-divine-name">${w.divineName}</div>
          <div class="armory-stats">
            <span>DMG <b>${w.damage}</b></span>
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

    // Populate Divine Bombs preview in Armory
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

    // Lobby Tab Navigation
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

    // Start Match Button
    const startBtn = document.getElementById('btn-start-match');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        window.SFX.init();
        window.SFX.playAbility('ultimate');
        this.startBattleRoyaleMatch(false);
      });
    }

    // Instant Action Drop Button
    const quickDropBtn = document.getElementById('btn-instant-drop');
    if (quickDropBtn) {
      quickDropBtn.addEventListener('click', () => {
        window.SFX.init();
        window.SFX.playAbility('tactical');
        this.startBattleRoyaleMatch(true);
      });
    }

    // Settings Controls
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
    setTxt('info-passive-name', h.passiveName);
    setTxt('info-passive-desc', h.passiveDesc);
    setTxt('info-tactical-name', `${h.tacticalName} (${h.tacticalCooldown}s CD)`);
    setTxt('info-tactical-desc', h.tacticalDesc);
    setTxt('info-ult-name', h.ultimateName);
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

    const ambient = new THREE.HemisphereLight(0xfef08a, 0x1e293b, 1.1);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(4, 6, 5);
    this.previewScene.add(ambient, keyLight);

    // Golden Asgard Pedestal
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
    const wep = window.ModelFactory.createWeaponModel(weaponId, this.selectedHeroId, false);
    wep.scale.set(3.4, 3.4, 3.4);
    wep.position.set(0, 1.15, 0);
    this.previewRoot.add(wep);
  }

  // =========================================================================
  // MAIN 3D BATTLE ROYALE RENDERER & FIRST-PERSON VIEWMODEL
  // =========================================================================
  initGameRenderer() {
    const canvas = document.getElementById('game-canvas');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, window.innerWidth / window.innerHeight, 0.08, 650);
    this.camera.rotation.order = 'YXZ';

    // First-person weapon viewmodel container attached to camera
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
  // START 16-PLAYER ASGARD BATTLE ROYALE MATCH
  // =========================================================================
  startBattleRoyaleMatch(instantGroundDrop = false) {
    // Rebuild clean scene
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    this.scene.add(this.camera);

    this.world = new window.AsgardWorld(this.scene);
    this.world.build();
    this.combat = new window.CombatManager(this);

    const hData = window.GODWARS_DATA.HEROES[this.selectedHeroId];

    // Initialize Player State
    this.player = {
      isPlayer: true,
      name: `YOU (${hData.name})`,
      heroId: this.selectedHeroId,
      alive: true,
      inDropship: !instantGroundDrop,
      skydiving: false,
      maxHp: hData.maxHp,
      hp: hData.maxHp,
      shieldTier: 2, // Start with Level 2 Blue Evo Shield (75) like Apex Evo spawn!
      maxShield: 75,
      shield: 75,
      kills: 0,
      damageDealt: 0,
      position: new THREE.Vector3(0, instantGroundDrop ? 3.5 : 115, instantGroundDrop ? 25 : -175),
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
      ultCharge: 35,
      ultBuffTimer: 0,
      cloakTimer: 0,
      slowTimer: 0,
      flashBlindTimer: 0,
      ampedWallBonus: false,
      shieldBatteries: 3,
      medkits: 2,
      healTimer: 0,
      healingType: null,
      grenadeCounts: {
        solar_bomb: 2,
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
          reloading: false,
          reloadTimer: 0
        };
      }),
      fireCooldown: 0
    };

    // Build Bifrost Golden Dragon Dropship
    this.dropship = window.ModelFactory.createDropshipModel();
    this.dropship.position.set(-140, window.GODWARS_DATA.MATCH_CONFIG.dropshipHeight, -155);
    this.dropshipDir = new THREE.Vector3(140, 0, 155).normalize();
    this.dropship.rotation.y = Math.atan2(this.dropshipDir.x, this.dropshipDir.z);
    this.scene.add(this.dropship);

    // Spawn 15 AI Mythological Contenders (Total = 16 Players in Battle Royale)
    this.bots = [];
    const heroKeys = Object.keys(window.GODWARS_DATA.HEROES);
    const weaponKeys = Object.keys(window.GODWARS_DATA.WEAPONS);
    const botNames = window.GODWARS_DATA.BOT_NAMES;

    for (let i = 0; i < 15; i++) {
      const bHero = heroKeys[i % heroKeys.length];
      const bWep = weaponKeys[i % weaponKeys.length];
      const bot = new window.AIContender(i, botNames[i], bHero, bWep, this);
      if (instantGroundDrop) {
        bot.inDropship = false;
        bot.skydiving = false;
        bot.position.set(bot.dropTarget.x, this.world.getGroundHeight(bot.dropTarget.x, bot.dropTarget.z, 0), bot.dropTarget.z);
        bot.mesh.position.copy(bot.position);
        bot.mesh.visible = true;
      }
      this.bots.push(bot);
    }

    // Initialize Ragnarok Shrinking Storm Ring State
    this.ringPhaseIndex = 0;
    this.ringState = 'waiting'; // 'waiting' | 'shrinking'
    this.ringTimer = window.GODWARS_DATA.MATCH_CONFIG.ringPhases[0].waitTime;
    this.ringRadius = window.GODWARS_DATA.MATCH_CONFIG.islandRadius;
    this.ringStartRadius = this.ringRadius;
    this.ringTargetRadius = window.GODWARS_DATA.MATCH_CONFIG.ringPhases[0].targetRadius;
    this.ringCenter = { x: (Math.random() - 0.5) * 35, z: (Math.random() - 0.5) * 35 };
    this.ringDamagePerSec = window.GODWARS_DATA.MATCH_CONFIG.ringPhases[0].damagePerSec;

    // Equip Initial First-Person Divine Weapon Viewmodel
    this.equipViewmodelWeapon();

    // Switch Screens from Lobby to HUD
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('hud-screen').classList.remove('hidden');
    document.getElementById('match-end-modal').classList.add('hidden');
    document.getElementById('kill-feed').innerHTML = '';

    this.syncMobileHUDVisibility();
    this.matchActive = true;
    this.matchTime = 0;

    if (!this.forceMobileUI) {
      const canvas = document.getElementById('game-canvas');
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    }

    if (this.player.inDropship) {
      this.showBanner('BIFROST DROPSHIP: PRESS [SPACE / E] OR TAP LAUNCH TO SKYDIVE', '#38bdf8');
    } else {
      this.showBanner('WELCOME TO ASGARD ROYALE • 16 CONTENDERS ALIVE', '#fbbf24');
    }
  }

  equipViewmodelWeapon() {
    while (this.viewmodelHolder.children.length > 0) {
      this.viewmodelHolder.remove(this.viewmodelHolder.children[0]);
    }
    const currentWep = this.player.weapons[this.player.activeSlot];
    this.player.weaponId = currentWep.id;
    this.activeViewmodel = window.ModelFactory.createWeaponModel(currentWep.id, this.player.heroId, true);
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

    // Desktop PointerLock & Mouse Look
    canvas.addEventListener('click', () => {
      window.SFX.init();
      if (this.matchActive && !this.forceMobileUI && document.pointerLockElement !== canvas) {
        if (canvas.requestPointerLock) canvas.requestPointerLock();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.matchActive || document.pointerLockElement !== canvas) return;
      const sens = 0.0021 * this.lookSensitivity * (this.player && this.player.isADS ? 0.58 : 1.0);
      this.player.yaw -= e.movementX * sens;
      this.player.pitch = Math.max(-1.42, Math.min(1.42, this.player.pitch - e.movementY * sens));
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.matchActive || this.forceMobileUI) return;
      if (e.button === 0) {
        this.mouseDown = true;
        if (this.player.inDropship) this.launchFromDropship();
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

    // Mouse Wheel Weapon Swap
    window.addEventListener('wheel', () => {
      if (!this.matchActive || !this.player || !this.player.alive) return;
      this.swapWeapon();
    });

    // Keyboard Controls
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      this.keys[code] = true;
      if (!this.matchActive || !this.player || !this.player.alive) return;

      if (code === 'Space') {
        if (this.player.inDropship) this.launchFromDropship();
        else this.triggerJump();
      } else if (code === 'KeyE') {
        if (this.player.inDropship) this.launchFromDropship();
        else this.interactWithLootBin();
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
      } else if (code === 'KeyH' || code === 'Digit4') {
        this.startHealing();
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

    // Left Virtual Joystick (Movement + Auto-Sprint)
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

    // Right Touchpad (360 Camera Aiming)
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

    // Mobile Action Buttons
    const bindHoldBtn = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); window.SFX.init(); onDown(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (onUp) onUp(); }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); onDown(); });
      el.addEventListener('mouseup', (e) => { e.preventDefault(); if (onUp) onUp(); });
    };

    // Dual Fire Buttons (Right Thumb + Left Index Claw Fire) with Drag-Aim support!
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
      else this.triggerJump();
    }, () => {
      this.keys['Space'] = false;
    });

    bindHoldBtn('btn-touch-slide', () => this.triggerSlideOrCrouch());
    bindHoldBtn('btn-touch-reload', () => this.startReload());
    bindHoldBtn('btn-touch-tactical', () => this.useTacticalAbility());
    bindHoldBtn('btn-touch-ult', () => this.useUltimateAbility());
    bindHoldBtn('btn-touch-grenade', () => this.throwEquippedGrenade());
    bindHoldBtn('btn-touch-cycle-bomb', () => this.cycleGrenadeType());
    bindHoldBtn('btn-touch-heal', () => this.startHealing());
    bindHoldBtn('btn-touch-loot', () => this.interactWithLootBin());
    bindHoldBtn('btn-dropship-launch', () => this.launchFromDropship());

    // Weapon Slot Cards Tap to Swap
    const wSlot1 = document.getElementById('hud-weapon-slot-0');
    const wSlot2 = document.getElementById('hud-weapon-slot-1');
    if (wSlot1) wSlot1.addEventListener('click', () => this.selectWeaponSlot(0));
    if (wSlot2) wSlot2.addEventListener('click', () => this.selectWeaponSlot(1));
    if (wSlot1) wSlot1.addEventListener('touchstart', (e) => { e.preventDefault(); this.selectWeaponSlot(0); });
    if (wSlot2) wSlot2.addEventListener('touchstart', (e) => { e.preventDefault(); this.selectWeaponSlot(1); });

    // Ability HUD Cards Tap Support
    const hudTac = document.getElementById('hud-tactical-box');
    const hudUlt = document.getElementById('hud-ult-box');
    const hudHeal = document.getElementById('hud-heal-box');
    const hudBomb = document.getElementById('hud-bomb-box');
    if (hudTac) hudTac.addEventListener('click', () => this.useTacticalAbility());
    if (hudUlt) hudUlt.addEventListener('click', () => this.useUltimateAbility());
    if (hudHeal) hudHeal.addEventListener('click', () => this.startHealing());
    if (hudBomb) hudBomb.addEventListener('click', () => this.throwEquippedGrenade());

    // Minimap Tap to Toggle Full Asgard Map
    const minimapWrap = document.getElementById('minimap-container');
    if (minimapWrap) {
      minimapWrap.addEventListener('click', () => this.toggleFullMap());
    }

    // Return to Lobby / Play Again Buttons
    const btnReplay = document.getElementById('btn-play-again');
    const btnLobby = document.getElementById('btn-back-lobby');
    if (btnReplay) btnReplay.addEventListener('click', () => this.startBattleRoyaleMatch(false));
    if (btnLobby) btnLobby.addEventListener('click', () => this.returnToLobby());
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
  // PLAYER ACTIONS (JUMP, SLIDE, DROPSHIP, SHOOT, ABILITIES, LOOT, HEAL)
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
    if (!this.player || !this.player.alive) return;
    if (this.player.onGround) {
      this.player.velocity.y = 10.2;
      this.player.onGround = false;
      this.player.isSliding = false;
    } else if (this.player.heroId === 'valkyrie' && this.player.jetpackFuel > 10) {
      // Valkyrie VTOL Jetpack Burst
      this.player.velocity.y = 8.5;
    }
  }

  triggerSlideOrCrouch() {
    if (!this.player || !this.player.alive || !this.player.onGround) return;
    if (this.player.slideCooldown <= 0 && !this.player.isSliding) {
      this.player.isSliding = true;
      this.player.slideTimer = 0.85;
      this.player.slideCooldown = 1.1;
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
    this.equipViewmodelWeapon();
    window.SFX.playReload();
  }

  startReload() {
    if (!this.player || !this.player.alive) return;
    const wep = this.player.weapons[this.player.activeSlot];
    if (wep.reloading || wep.mag >= wep.data.magSize || wep.reserve <= 0) return;
    wep.reloading = true;
    // Zeus Passive: +20% Faster Reload!
    const mult = this.player.heroId === 'zeus' ? 0.8 : 1.0;
    wep.reloadTimer = wep.data.reloadTime * mult;
    window.SFX.playReload();
  }

  useTacticalAbility() {
    if (!this.player || !this.player.alive || this.player.inDropship) return;
    if (this.player.tacticalCooldown > 0) return;

    const hData = window.GODWARS_DATA.HEROES[this.player.heroId];
    this.player.tacticalCooldown = hData.tacticalCooldown;

    const eyePos = this.camera.position.clone();
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.combat.triggerHeroTactical(this.player, eyePos, lookDir);
  }

  useUltimateAbility() {
    if (!this.player || !this.player.alive || this.player.inDropship) return;
    if (this.player.ultCharge < 100) {
      this.showBanner(`ULTIMATE CHARGING (${Math.floor(this.player.ultCharge)}%)`, '#94a3b8');
      return;
    }
    this.player.ultCharge = 0;
    const eyePos = this.camera.position.clone();
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.combat.triggerHeroUltimate(this.player, eyePos, lookDir);
  }

  throwEquippedGrenade() {
    if (!this.player || !this.player.alive || this.player.inDropship) return;
    const count = this.player.grenadeCounts[this.selectedGrenadeId] || 0;
    if (count <= 0) {
      this.cycleGrenadeType();
      const nextCount = this.player.grenadeCounts[this.selectedGrenadeId] || 0;
      if (nextCount <= 0) {
        this.showBanner('NO DIVINE BOMBS LEFT • LOOT SUPPLY BINS!', '#f43f5e');
        return;
      }
    }
    this.player.grenadeCounts[this.selectedGrenadeId]--;
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

  startHealing() {
    if (!this.player || !this.player.alive || this.player.healTimer > 0) return;
    if (this.player.shield < this.player.maxShield && this.player.shieldBatteries > 0) {
      this.player.healingType = 'shield';
      this.player.healTimer = 2.2;
      this.showBanner('CHARGING DIVINE SHIELD BATTERY (2.2s)...', '#38bdf8');
    } else if (this.player.hp < this.player.maxHp && this.player.medkits > 0) {
      this.player.healingType = 'medkit';
      this.player.healTimer = 2.6;
      this.showBanner('APPLYING AMBROSIA MEDKIT (2.6s)...', '#10b981');
    } else {
      this.showBanner('SHIELD & HEALTH ALREADY FULL!', '#fbbf24');
    }
  }

  interactWithLootBin() {
    if (!this.player || !this.player.alive || !this.nearestBin) return;
    const bin = this.nearestBin;

    if (!bin.opened) {
      bin.opened = true;
      if (!bin.isDeathBox && bin.lid) {
        bin.lid.position.y = 1.65;
        bin.lid.position.z = -0.55;
        bin.lid.rotation.x = -1.1;
      }
    }

    // Equip or Replenish from Bin Loot
    const loot = bin.loot;
    const wData = window.GODWARS_DATA.WEAPONS[loot.weaponId];

    // Upgrade shield if bin has higher tier Evo Shield
    if (loot.shieldTier > this.player.shieldTier) {
      this.player.shieldTier = loot.shieldTier;
      this.player.maxShield = loot.shieldTier === 4 ? 125 : loot.shieldTier === 3 ? 100 : 75;
    }
    this.player.shield = this.player.maxShield;
    this.player.shieldBatteries += loot.shieldBattery;
    this.player.medkits += loot.medkit;
    this.player.grenadeCounts[loot.grenadeId] = (this.player.grenadeCounts[loot.grenadeId] || 0) + 2;

    // Refill ammo & swap active weapon if player doesn't have it
    const hasWepIdx = this.player.weapons.findIndex(w => w.id === loot.weaponId);
    if (hasWepIdx >= 0) {
      this.player.weapons[hasWepIdx].reserve += wData.magSize * 3;
      this.player.weapons[hasWepIdx].mag = wData.magSize;
    } else {
      this.player.weapons[this.player.activeSlot] = {
        id: loot.weaponId,
        data: wData,
        mag: wData.magSize,
        reserve: wData.reserveAmmo,
        reloading: false,
        reloadTimer: 0
      };
      this.equipViewmodelWeapon();
    }

    window.SFX.playReload();
    this.showBanner(
      `LOOTED: ${wData.divineName} + LV${this.player.shieldTier} SHIELD + BATTERIES`,
      wData.color
    );
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
    if (document.exitPointerLock) document.exitPointerLock();
    document.getElementById('hud-screen').classList.add('hidden');
    document.getElementById('match-end-modal').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
  }

  // =========================================================================
  // MAIN GAME LOOP (60 FPS)
  // =========================================================================
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // FPS Counter
    this.fpsFrames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      const fps = Math.round(this.fpsFrames / this.fpsTimer);
      const fpsEl = document.getElementById('hud-fps');
      if (fpsEl) fpsEl.textContent = `${fps} FPS`;
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }

    // Rotate 3D Hero / Weapon Pedestal in Lobby
    if (!this.matchActive && this.previewRenderer && this.previewRoot) {
      this.previewRoot.rotation.y += dt * 0.75;
      this.previewRenderer.render(this.previewScene, this.previewCamera);
      return;
    }

    if (!this.matchActive) return;

    this.matchTime += dt;
    this.updateDropship(dt);
    this.updatePlayer(dt);
    this.bots.forEach(bot => bot.update(dt, this.matchTime));
    this.combat.update(dt);
    this.updateStormRing(dt);
    this.updateHUD();
    this.drawMinimap();

    this.renderer.render(this.scene, this.camera);
  }

  updateDropship(dt) {
    if (!this.dropship) return;
    const speed = window.GODWARS_DATA.MATCH_CONFIG.dropshipSpeed;
    this.dropship.position.addScaledVector(this.dropshipDir, speed * dt);

    // Auto-launch player if dropship reaches edge of Asgard Island
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
    } else {
      this.viewmodelHolder.visible = this.player && this.player.alive;
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    if (!p || !p.alive || p.inDropship) return;

    // Update Cooldowns & Timers
    if (p.tacticalCooldown > 0) p.tacticalCooldown = Math.max(0, p.tacticalCooldown - dt);
    if (p.slideCooldown > 0) p.slideCooldown = Math.max(0, p.slideCooldown - dt);
    if (p.ultBuffTimer > 0) p.ultBuffTimer = Math.max(0, p.ultBuffTimer - dt);
    if (p.cloakTimer > 0) p.cloakTimer = Math.max(0, p.cloakTimer - dt);
    if (p.slowTimer > 0) p.slowTimer = Math.max(0, p.slowTimer - dt);
    if (p.flashBlindTimer > 0) p.flashBlindTimer = Math.max(0, p.flashBlindTimer - dt);

    p.ultCharge = Math.min(100, p.ultCharge + dt * 1.6);

    // Complete Shield Battery / Medkit Cast
    if (p.healTimer > 0) {
      p.healTimer -= dt;
      if (p.healTimer <= 0) {
        if (p.healingType === 'shield' && p.shieldBatteries > 0) {
          p.shieldBatteries--;
          p.shield = p.maxShield;
          this.showBanner('EVO SHIELD FULLY RESTORED!', '#38bdf8');
        } else if (p.healingType === 'medkit' && p.medkits > 0) {
          p.medkits--;
          p.hp = p.maxHp;
          this.showBanner('HEALTH FULLY RESTORED!', '#10b981');
        }
        p.healingType = null;
      }
    }

    // Calculate Input Vector (WASD + Mobile Virtual Joystick)
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

    // Skydive Gliding Mode
    if (p.skydiving) {
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
    } else {
      // Ground / Air Movement (Sprint + Apex Slide + Valkyrie VTOL Jetpack)
      const hData = window.GODWARS_DATA.HEROES[p.heroId];
      p.isSprinting = (this.keys['ShiftLeft'] || this.touchMove.dy < -0.75) && moveForward > 0.3 && !p.isADS;

      let speed = 7.8 * (hData.speedMult || 1.0);
      if (p.isSprinting) speed *= 1.38;
      if (p.isADS) speed *= 0.72;
      if (p.cloakTimer > 0) speed *= 1.3;
      if (p.slowTimer > 0) speed *= 0.6;

      if (p.isSliding) {
        p.slideTimer -= dt;
        const slideMult = p.heroId === 'loki' ? 1.75 : 1.55;
        speed = 8.2 * slideMult;
        if (p.slideTimer <= 0) p.isSliding = false;
      }

      // Thor Passive: Sprinting charges Mjölnir Static Core
      if (p.heroId === 'thor' && (p.isSprinting || p.isSliding)) {
        p.thunderCharge = Math.min(100, p.thunderCharge + 35 * dt);
      }

      p.position.x += wishDir.x * speed * dt;
      p.position.z += wishDir.z * speed * dt;

      // Valkyrie VTOL Jetpack Passive (Hold Space in mid-air)
      if (p.heroId === 'valkyrie' && !p.onGround && this.keys['Space'] && p.jetpackFuel > 0) {
        p.velocity.y = Math.min(9.5, p.velocity.y + 38 * dt);
        p.jetpackFuel = Math.max(0, p.jetpackFuel - 34 * dt);
      } else if (p.onGround) {
        p.jetpackFuel = Math.min(100, p.jetpackFuel + 28 * dt);
      }

      // Gravity
      p.velocity.y -= 25 * dt;
      p.position.y += p.velocity.y * dt;

      // Map Horizontal Collision & Ground Height
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

      // Check Bifrost Jump Pads (Octane-style High Launch!)
      for (const pad of this.world.jumpPads) {
        if (Math.hypot(p.position.x - pad.x, p.position.z - pad.z) < pad.radius && p.position.y < 1.5) {
          p.velocity.y = 21.5;
          p.onGround = false;
          window.SFX.playJumpPad();
          this.showBanner('BIFROST JUMP PAD LAUNCH!', '#38bdf8');
        }
      }
    }

    // Update First-Person Camera Position & FOV (Sprint / Slide / ADS interpolation)
    const eyeHeight = p.isSliding ? 0.92 : 1.68;
    this.camera.position.set(p.position.x, p.position.y + eyeHeight, p.position.z);
    this.camera.rotation.set(p.pitch, p.yaw, p.isSliding ? -0.06 : 0, 'YXZ');

    const wep = p.weapons[p.activeSlot];
    const targetFov = p.isADS ? (wep.data.adsFov || 55) : (p.isSprinting || p.isSliding ? this.fov + 8 : this.fov);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();

    // Update First-Person Weapon Viewmodel Position (Hipfire vs ADS Center Sight + Bobbing)
    if (this.activeViewmodel) {
      const targetX = p.isADS ? 0.0 : 0.24;
      const targetY = p.isADS ? -0.132 : -0.22;
      const targetZ = p.isADS ? -0.32 : -0.45;
      const bob = (inputLen > 0.1 && p.onGround && !p.isADS) ? Math.sin(this.matchTime * 11) * 0.012 : 0;

      this.activeViewmodel.position.x += (targetX - this.activeViewmodel.position.x) * Math.min(1, dt * 16);
      this.activeViewmodel.position.y += (targetY + bob - this.activeViewmodel.position.y) * Math.min(1, dt * 16);
      this.activeViewmodel.position.z += (targetZ - this.activeViewmodel.position.z) * Math.min(1, dt * 16);

      // Fade muzzle flash
      const flash = this.activeViewmodel.userData.muzzleFlash;
      if (flash && flash.material.opacity > 0) {
        flash.material.opacity = Math.max(0, flash.material.opacity - dt * 18);
        flash.rotation.z += dt * 25;
      }

      // Reload animation tilt
      if (wep.reloading) {
        this.activeViewmodel.rotation.x = -0.45;
        this.activeViewmodel.rotation.z = 0.35;
      } else {
        this.activeViewmodel.rotation.x += (0 - this.activeViewmodel.rotation.x) * Math.min(1, dt * 15);
        this.activeViewmodel.rotation.z += (0 - this.activeViewmodel.rotation.z) * Math.min(1, dt * 15);
      }
    }

    // Weapon Reload Progression
    if (wep.reloading) {
      wep.reloadTimer -= dt;
      if (wep.reloadTimer <= 0) {
        wep.reloading = false;
        const needed = wep.data.magSize - wep.mag;
        const take = Math.min(needed, wep.reserve);
        wep.mag += take;
        wep.reserve -= take;
      }
    }

    // Weapon Firing (Mouse / Touch Fire Button / Optional Mobile Auto-Fire on Crosshair Target)
    if (p.fireCooldown > 0) p.fireCooldown -= dt;

    let wantsToFire = this.mouseDown || this.touchFiring;
    if (!wantsToFire && this.mobileAutoFire && this.isCrosshairOnEnemy()) {
      wantsToFire = true;
    }

    if (wantsToFire && !wep.reloading && p.fireCooldown <= 0) {
      if (wep.mag > 0) {
        // Hela Empress of Helheim Ultimate grants infinite magazine ammo & +25% fire rate!
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

        // Trigger Gunshot SFX & Muzzle Flash
        window.SFX.playGunshot(wep.id, 0);
        if (this.activeViewmodel) {
          this.activeViewmodel.position.z += 0.045; // Visual recoil kick
          if (this.activeViewmodel.userData.muzzleFlash) {
            this.activeViewmodel.userData.muzzleFlash.material.opacity = 0.95;
          }
          if (this.activeViewmodel.userData.isRevolver && this.activeViewmodel.userData.magMesh) {
            this.activeViewmodel.userData.magMesh.rotation.z += Math.PI / 3;
          }
        }

        // Fire Ray with spread
        const spread = p.isADS ? wep.data.adsSpread : wep.data.spread;
        const shootDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        shootDir.x += (Math.random() - 0.5) * spread;
        shootDir.y += (Math.random() - 0.5) * spread;
        shootDir.z += (Math.random() - 0.5) * spread;
        shootDir.normalize();

        this.combat.fireWeapon(p, this.camera.position.clone(), shootDir, wep.data);

        // Apply slight camera recoil
        p.pitch = Math.min(1.42, p.pitch + wep.data.recoilPitch * (p.isADS ? 0.65 : 1.0));
        p.yaw += (Math.random() - 0.5) * wep.data.recoilYaw;

        if (wep.mag === 0 && wep.reserve > 0) {
          this.startReload();
        }
      } else if (wep.reserve > 0) {
        this.startReload();
      }
    }

    // Check Nearest Divine Supply Bin / Death Box for Loot Prompt
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

    this.world.updateRingVisual(this.ringCenter.x, this.ringCenter.z, this.ringRadius, this.matchTime);

    // Check if Player is outside the Safe Ring
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
  // APEX LEGENDS HUD, FLOATING DAMAGE NUMBERS, KILL FEED & MINIMAP
  // =========================================================================
  updateHUD() {
    const p = this.player;
    if (!p) return;

    const aliveBots = this.bots.filter(b => b.alive).length;
    const totalAlive = aliveBots + (p.alive ? 1 : 0);

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('hud-alive-count', `${totalAlive}/16`);
    setTxt('hud-kills-count', p.kills);
    setTxt('hud-damage-count', Math.round(p.damageDealt));

    const mins = Math.floor(Math.max(0, this.ringTimer) / 60);
    const secs = Math.floor(Math.max(0, this.ringTimer) % 60).toString().padStart(2, '0');
    setTxt(
      'hud-ring-timer',
      `RING ${this.ringPhaseIndex + 1} ${this.ringState === 'shrinking' ? 'CLOSING' : ''} ${mins}:${secs}`
    );

    // Dropship Launch Button Banner
    const dropBtn = document.getElementById('btn-dropship-launch');
    if (dropBtn) dropBtn.classList.toggle('hidden', !p.inDropship);

    // Hero Legend Portrait & Status
    const hData = window.GODWARS_DATA.HEROES[p.heroId];
    setTxt('hud-hero-name', hData.name);
    setTxt('hud-hp-text', `${Math.ceil(p.hp)}/${p.maxHp}`);
    setTxt('hud-shield-text', `${Math.ceil(p.shield)}/${p.maxShield}`);

    const hpFill = document.getElementById('hud-hp-fill');
    if (hpFill) hpFill.style.width = `${(p.hp / p.maxHp) * 100}%`;

    const shieldFill = document.getElementById('hud-shield-fill');
    if (shieldFill) {
      shieldFill.style.width = `${(p.shield / p.maxShield) * 100}%`;
      const tierColors = { 1: '#e2e8f0', 2: '#38bdf8', 3: '#a855f7', 4: '#fbbf24' };
      shieldFill.style.background = tierColors[p.shieldTier] || '#38bdf8';
    }

    const tierLabels = { 1: 'LV1 EVO', 2: 'LV2 BLUE EVO', 3: 'LV3 PURPLE EVO', 4: 'LV4 MYTHIC GOLD' };
    setTxt('hud-shield-tier', tierLabels[p.shieldTier] || 'EVO SHIELD');

    // Tactical (Q) & Ultimate (Z) HUD Boxes
    setTxt('hud-tactical-name', hData.tacticalName);
    setTxt('hud-tactical-cd', p.tacticalCooldown > 0 ? `${p.tacticalCooldown.toFixed(1)}s` : 'READY [Q]');
    const tacBox = document.getElementById('hud-tactical-box');
    if (tacBox) tacBox.classList.toggle('ready', p.tacticalCooldown <= 0);

    setTxt('hud-ult-name', hData.ultimateName);
    setTxt('hud-ult-pct', p.ultCharge >= 100 ? 'READY [Z]' : `${Math.floor(p.ultCharge)}%`);
    const ultBox = document.getElementById('hud-ult-box');
    if (ultBox) ultBox.classList.toggle('ready', p.ultCharge >= 100);

    // Heal & Divine Bomb Boxes
    setTxt('hud-heal-count', `⚡${p.shieldBatteries} ➕${p.medkits}`);
    const gData = window.GODWARS_DATA.GRENADES[this.selectedGrenadeId];
    const gCount = p.grenadeCounts[this.selectedGrenadeId] || 0;
    setTxt('hud-bomb-name', gData.shortName);
    setTxt('hud-bomb-count', `${gData.icon} x${gCount} [G]`);

    // Dual Weapon Slots
    p.weapons.forEach((w, idx) => {
      const slotEl = document.getElementById(`hud-weapon-slot-${idx}`);
      if (!slotEl) return;
      slotEl.classList.toggle('active', idx === p.activeSlot);
      slotEl.style.setProperty('--slot-color', w.data.color);
      setTxt(`hud-wep-name-${idx}`, w.data.divineName);
      setTxt(`hud-wep-base-${idx}`, w.data.baseName);
      setTxt(`hud-wep-ammo-${idx}`, w.reloading ? 'RELOADING...' : `${w.mag} / ${w.reserve}`);
    });

    // Center Active Ammo Counter near Crosshair
    const activeWep = p.weapons[p.activeSlot];
    setTxt('crosshair-ammo', activeWep.reloading ? 'RELOADING' : `${activeWep.mag}`);

    // ADS Holographic Sight Overlay
    const adsOverlay = document.getElementById('ads-optic-overlay');
    if (adsOverlay) {
      adsOverlay.classList.toggle('active', p.isADS);
      adsOverlay.style.setProperty('--optic-color', activeWep.data.color);
    }

    // Loot Prompt Overlay
    const lootPrompt = document.getElementById('hud-loot-prompt');
    const mobileLootBtn = document.getElementById('btn-touch-loot');
    if (this.nearestBin) {
      const binWep = window.GODWARS_DATA.WEAPONS[this.nearestBin.loot.weaponId];
      const title = this.nearestBin.isDeathBox
        ? `DEATH BOX (${this.nearestBin.victimName})`
        : 'DIVINE SUPPLY BIN';
      if (lootPrompt) {
        lootPrompt.classList.remove('hidden');
        lootPrompt.innerHTML = `<b>[E] / TAP</b> ${title}: <span style="color:${binWep.color}">${binWep.divineName}</span> + LV${this.nearestBin.loot.shieldTier} SHIELD`;
      }
      if (mobileLootBtn) mobileLootBtn.classList.remove('hidden');
    } else {
      if (lootPrompt) lootPrompt.classList.add('hidden');
      if (mobileLootBtn) mobileLootBtn.classList.add('hidden');
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

      // Asgard Island Circle
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx, cy, this.world.islandRadius * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#d97706';
      ctx.stroke();

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

      // Draw Enemies if Valkyrie Sky Scan / Loki Recon or firing recently
      const p = this.player;
      const scanActive = p && ((p.heroId === 'valkyrie' && p.ultBuffTimer > 0) || p.heroId === 'loki');
      this.bots.forEach(b => {
        if (!b.alive || b.inDropship) return;
        const distToPlayer = p ? p.position.distanceTo(b.position) : 999;
        if (scanActive || distToPlayer < 48 || b.fireTimer > 0.05) {
          ctx.fillStyle = '#ef4444';
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

  spawnFloatingDamageNumber(worldPos, amount, isHeadshot, hitShield, shieldBroken, shieldTier = 2) {
    const container = document.getElementById('damage-numbers-layer');
    if (!container) return;

    const proj = worldPos.clone().project(this.camera);
    if (proj.z > 1) return; // Behind camera

    const x = (proj.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 34;
    const y = (-proj.y * 0.5 + 0.5) * window.innerHeight - 18 + (Math.random() - 0.5) * 24;

    const el = document.createElement('div');
    el.className = `dmg-float ${isHeadshot ? 'headshot' : ''}`;
    const shieldColors = { 1: '#f8fafc', 2: '#38bdf8', 3: '#c084fc', 4: '#fbbf24' };
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

    // Hitmarker flash on crosshair
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
    if (!this.matchActive) return;
    const aliveBots = this.bots.filter(b => b.alive).length;

    if (!this.player.alive) {
      // Player Eliminated
      const rank = aliveBots + 1;
      this.endMatch(false, rank);
    } else if (aliveBots === 0) {
      // Player is the CHAMPION OF ASGARD!
      this.endMatch(true, 1);
    }
  }

  endMatch(isChampion, placement) {
    this.matchActive = false;
    if (document.exitPointerLock) document.exitPointerLock();

    const modal = document.getElementById('match-end-modal');
    const title = document.getElementById('match-end-title');
    const subtitle = document.getElementById('match-end-subtitle');
    const stats = document.getElementById('match-end-stats');

    if (modal && title && subtitle && stats) {
      modal.classList.remove('hidden');
      if (isChampion) {
        title.textContent = 'CHAMPION OF ASGARD';
        title.style.color = '#fbbf24';
        subtitle.textContent = 'YOU CONQUERED THE GOD WARS BATTLE ROYALE (#1 / 16)';
        window.SFX.playAbility('ultimate');
      } else {
        title.textContent = 'SQUAD ELIMINATED';
        title.style.color = '#f43f5e';
        subtitle.textContent = `PLACEMENT: #${placement} OF 16 CONTENDERS`;
      }

      const hData = window.GODWARS_DATA.HEROES[this.player.heroId];
      stats.innerHTML = `
        <div class="end-stat-box"><span>HERO</span><b>${hData.name}</b></div>
        <div class="end-stat-box"><span>PLACEMENT</span><b>#${placement} / 16</b></div>
        <div class="end-stat-box"><span>ELIMINATIONS</span><b>${this.player.kills}</b></div>
        <div class="end-stat-box"><span>DAMAGE DEALT</span><b>${Math.round(this.player.damageDealt)}</b></div>
      `;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.GAME = new GodWarsGame();
});
