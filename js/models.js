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

    const assetList = [
      'weapon_p90', 'weapon_kriss', 'weapon_m4a1', 'weapon_uzi', 'weapon_ak47', 'weapon_magnum',
      'hero_loki', 'hero_thor', 'hero_hades', 'hero_zeus', 'hero_hela', 'hero_valkyrie',
      'prop_dropship', 'prop_carepackage', 'prop_supplybin', 'prop_replicator',
      'bomb_solar', 'bomb_flash', 'bomb_arc', 'loot_evoshield',
      'prop_jumppad', 'prop_respawn_beacon', 'prop_survey_beacon',
      'prop_odin_statue', 'prop_bifrost_gate', 'prop_yggdrasil_tree',
      'prop_asgard_tree', 'prop_forge_anvil',
      'statue_odin', 'statue_thor', 'statue_valkyrie', 'statue_heimdall', 'statue_hela', 'prop_asgard_archway'
    ];

    assetList.forEach(name => {
      if (this._glbCache[name] || this._glbLoading[name]) return;
      this._glbLoading[name] = [];
      this._loader.load(
        `assets/models/${name}.glb`,
        (gltf) => {
          this._glbCache[name] = gltf.scene;
          const callbacks = this._glbLoading[name] || [];
          delete this._glbLoading[name];
          callbacks.forEach(cb => cb(gltf.scene.clone(true)));
        },
        undefined,
        () => {
          delete this._glbLoading[name];
        }
      );
    });
  },

  attachBlenderGLB(assetName, targetGroup, onLoadedTransform = null, fallbackToHide = null) {
    if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return false;
    this.initGLBPreload();

    const applyClone = (clonedScene) => {
      if (onLoadedTransform) onLoadedTransform(clonedScene);
      if (fallbackToHide) {
        if (Array.isArray(fallbackToHide)) fallbackToHide.forEach(m => { if (m) m.visible = false; });
        else fallbackToHide.visible = false;
      }
      targetGroup.add(clonedScene);
    };

    if (this._glbCache[assetName]) {
      applyClone(this._glbCache[assetName].clone(true));
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
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
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

    // Attach High-Detail Beveled Blender 3.6 GLB Mesh (assets/models/weapon_<id>.glb)
    this.attachBlenderGLB(`weapon_${weaponId}`, group, (glbScene) => {
      glbScene.scale.set(1.02, 1.02, 1.02);
    });

    // First-person God Gauntlet / Hands + Hidden Heirloom Melee Mesh
    if (isFirstPerson) {
      const armMat = new THREE.MeshStandardMaterial({ color: hData.hexColor, metalness: 0.75, roughness: 0.25 });
      const cuffMat = new THREE.MeshStandardMaterial({ color: hData.hexAccent, metalness: 0.9, roughness: 0.2 });

      const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.22), armMat);
      rightHand.position.set(0.02, -0.11, 0.18);
      rightHand.rotation.x = 0.22;
      const rightCuff = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.05), cuffMat);
      rightCuff.position.set(0.02, -0.12, 0.24);
      group.add(rightHand, rightCuff);

      if (weaponId !== 'magnum') {
        const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.26), armMat);
        leftHand.position.set(-0.045, -0.09, -0.08);
        leftHand.rotation.y = 0.24;
        leftHand.rotation.x = 0.12;
        group.add(leftHand);
      }

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

    // Attach High-Detail Beveled Blender 3.6 GLB Hero Armor Overlay (assets/models/hero_<id>.glb)
    this.attachBlenderGLB(`hero_${heroId}`, root);

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

    this.attachBlenderGLB('prop_carepackage', group);

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
    this.attachBlenderGLB('prop_dropship', ship);
    return ship;
  }
};
