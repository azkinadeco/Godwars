/**
 * GOD WARS: ASGARD ROYALE
 * Procedural 3D Models:
 * - 6 Mythological Heroes (Loki, Thor, Hades, Zeus, Hela, Valkyrie)
 * - 6 Divine Custom Firearms (P90, Kriss Vector, M4A1, Uzi, AK-47, Magnum)
 * - First-Person Viewmodel Rig + Holographic Rune Optics + Muzzle Flash
 * - Golden Viking Bifrost Dropship
 */

window.ModelFactory = {
  createWeaponModel(weaponId, heroId = 'thor', isFirstPerson = true) {
    const group = new THREE.Group();
    const wData = window.GODWARS_DATA.WEAPONS[weaponId] || window.GODWARS_DATA.WEAPONS.m4a1;
    const hData = window.GODWARS_DATA.HEROES[heroId] || window.GODWARS_DATA.HEROES.thor;

    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1e2430, metalness: 0.85, roughness: 0.25 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.92, roughness: 0.18 });
    const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.88, roughness: 0.2 });
    const glowMat = new THREE.MeshBasicMaterial({ color: wData.hexColor });
    const heroGlowMat = new THREE.MeshBasicMaterial({ color: hData.hexColor });

    if (weaponId === 'p90') {
      // BIFROST P90: Bullpup ergonomic body + translucent glowing top magazine
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.52), darkMetal);
      body.position.set(0, 0, 0);
      group.add(body);

      // Thumbhole stock & grip cutout
      const frontGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.08), goldMat);
      frontGrip.position.set(0, -0.09, -0.14);
      group.add(frontGrip);

      const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.07), darkMetal);
      rearGrip.position.set(0, -0.09, 0.06);
      group.add(rearGrip);

      // Top translucent Bifrost crystal 50-rd magazine
      const topMagMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.88
      });
      const topMag = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.038, 0.34), topMagMat);
      topMag.position.set(0, 0.088, -0.02);
      group.add(topMag);
      group.userData.magMesh = topMag;

      // Golden Asgardian winged shroud
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.26), goldMat);
      wingL.position.set(-0.046, 0.02, -0.06);
      const wingR = wingL.clone();
      wingR.position.x = 0.046;
      group.add(wingL, wingR);

      // Barrel
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.18, 12), silverMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.32);
      group.add(barrel);

    } else if (weaponId === 'kriss') {
      // FENRIR KRISS VECTOR: Forward Super-V receiver + angled mag + wolf fangs
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.46), darkMetal);
      upper.position.set(0, 0.03, 0);
      group.add(upper);

      // Super-V massive front lower block
      const superV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.14), darkMetal);
      superV.position.set(0, -0.06, -0.12);
      group.add(superV);

      // Angled forward extended magazine
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24, 0.055), glowMat);
      mag.position.set(0, -0.17, -0.13);
      mag.rotation.x = 0.22;
      group.add(mag);
      group.userData.magMesh = mag;

      // Rear pistol grip & folding stock
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.13, 0.06), darkMetal);
      grip.position.set(0, -0.07, 0.11);
      grip.rotation.x = -0.2;
      group.add(grip);

      // Fenrir crimson glowing wolf-fang barrel shroud
      const fangMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
      const fangL = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.14, 6), fangMat);
      fangL.rotation.x = -Math.PI / 2;
      fangL.position.set(-0.035, 0.01, -0.27);
      const fangR = fangL.clone();
      fangR.position.x = 0.035;
      group.add(fangL, fangR);

      const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 12), goldMat);
      suppressor.rotation.x = Math.PI / 2;
      suppressor.position.set(0, 0.03, -0.31);
      group.add(suppressor);

    } else if (weaponId === 'm4a1') {
      // VALHALLA M4A1: Gold & Pearl Odin Carbine with Valkyrie wing handguards
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.11, 0.36), silverMat);
      group.add(receiver);

      const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.085, 0.28), goldMat);
      handguard.position.set(0, 0.01, -0.3);
      group.add(handguard);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.28, 12), silverMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.015, -0.49);
      group.add(barrel);

      // Muzzle crown
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.07, 8), goldMat);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(0, 0.015, -0.62);
      group.add(muzzle);

      // Magazine
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.21, 0.075), goldMat);
      mag.position.set(0, -0.14, -0.05);
      mag.rotation.x = 0.16;
      group.add(mag);
      group.userData.magMesh = mag;

      // Grip & Stock
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), darkMetal);
      grip.position.set(0, -0.11, 0.11);
      grip.rotation.x = -0.25;
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.22), darkMetal);
      stock.position.set(0, -0.01, 0.26);
      group.add(grip, stock);

      // Glowing Rune Strips
      const runeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.022, 0.42), glowMat);
      runeStrip.position.set(0, 0.025, -0.12);
      group.add(runeStrip);

    } else if (weaponId === 'uzi') {
      // HERMES UZI: Compact T-frame Micro-SMG with golden feathered wings
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.1, 0.34), goldMat);
      body.position.set(0, 0.03, -0.04);
      group.add(body);

      // Central grip-fed extended magazine
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.16, 0.07), darkMetal);
      grip.position.set(0, -0.08, 0.01);
      group.add(grip);

      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.24, 0.054), glowMat);
      mag.position.set(0, -0.17, 0.01);
      group.add(mag);
      group.userData.magMesh = mag;

      // Hermes Wing Fins on sides
      const wingGeo = new THREE.BoxGeometry(0.014, 0.06, 0.22);
      const wingL = new THREE.Mesh(wingGeo, glowMat);
      wingL.position.set(-0.045, 0.05, -0.05);
      wingL.rotation.z = 0.35;
      const wingR = wingL.clone();
      wingR.position.x = 0.045;
      wingR.rotation.z = -0.35;
      group.add(wingL, wingR);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 10), silverMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.03, -0.26);
      group.add(barrel);

    } else if (weaponId === 'ak47') {
      // SURTR AK-47: Volcanic Obsidian & Molten Lava AK
      const lavaMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.105, 0.38), darkMetal);
      group.add(receiver);

      // Gas tube + barrel
      const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.08, 0.24), lavaMat);
      handguard.position.set(0, 0.005, -0.29);
      group.add(handguard);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.32, 10), darkMetal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.0, -0.52);
      const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), goldMat);
      gasTube.rotation.x = Math.PI / 2;
      gasTube.position.set(0, 0.04, -0.46);
      group.add(barrel, gasTube);

      // Iconic curved banana magazine
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.08), lavaMat);
      mag.position.set(0, -0.15, -0.08);
      mag.rotation.x = 0.36;
      group.add(mag);
      group.userData.magMesh = mag;

      // Stock
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.24), darkMetal);
      stock.position.set(0, -0.03, 0.27);
      stock.rotation.x = -0.12;
      group.add(stock);

    } else if (weaponId === 'magnum') {
      // GUNGNIR MAGNUM: Allfather .50 Handcannon with spinning rune cylinder
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.22), goldMat);
      frame.position.set(0, 0.01, -0.02);
      group.add(frame);

      // Rotating Rune Cylinder
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.095, 8), glowMat);
      cyl.rotation.x = Math.PI / 2;
      cyl.position.set(0, 0.02, -0.03);
      group.add(cyl);
      group.userData.magMesh = cyl;
      group.userData.isRevolver = true;

      // Heavy double-ribbed Gungnir spear barrel
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.085, 0.28), silverMat);
      barrel.position.set(0, 0.025, -0.24);
      group.add(barrel);

      const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 4), goldMat);
      spearTip.rotation.x = -Math.PI / 2;
      spearTip.position.set(0, -0.02, -0.39);
      group.add(spearTip);

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.14, 0.065), darkMetal);
      grip.position.set(0, -0.09, 0.08);
      grip.rotation.x = -0.32;
      group.add(grip);
    }

    // Divine Holographic Rune Sight on top of every weapon
    const sightGroup = new THREE.Group();
    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.018, 0.09), goldMat);
    sightBase.position.set(0, 0.095, 0.01);
    sightGroup.add(sightBase);

    const sightFrame = new THREE.Mesh(
      new THREE.TorusGeometry(0.034, 0.0045, 8, 20),
      goldMat
    );
    sightFrame.position.set(0, 0.132, 0.01);
    sightGroup.add(sightFrame);

    // Glowing reticle dot inside the sight
    const reticleDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0055, 8, 8),
      new THREE.MeshBasicMaterial({ color: wData.hexColor })
    );
    reticleDot.position.set(0, 0.132, 0.01);
    sightGroup.add(reticleDot);
    group.add(sightGroup);

    // First-person God Gauntlet / Hands holding the weapon
    if (isFirstPerson) {
      const armMat = new THREE.MeshStandardMaterial({ color: hData.hexColor, metalness: 0.7, roughness: 0.3 });
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

      // Muzzle Flash mesh (hidden by default)
      const flashMat = new THREE.MeshBasicMaterial({
        color: wData.hexColor,
        transparent: true,
        opacity: 0.0
      });
      const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), flashMat);
      flash.position.set(0, 0.02, weaponId === 'm4a1' || weaponId === 'ak47' ? -0.68 : -0.44);
      group.add(flash);
      group.userData.muzzleFlash = flash;
    }

    return group;
  },

  createHeroModel(heroId = 'thor') {
    const h = window.GODWARS_DATA.HEROES[heroId] || window.GODWARS_DATA.HEROES.thor;
    const root = new THREE.Group();

    const armorMat = new THREE.MeshStandardMaterial({
      color: h.hexColor,
      metalness: 0.78,
      roughness: 0.25
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: h.hexAccent,
      metalness: 0.92,
      roughness: 0.16
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.6,
      roughness: 0.45
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: heroId === 'hades' ? 0xcbd5e1 : 0xf1c27d,
      roughness: 0.5
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: h.hexColor });

    // Legs
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), darkMat);
    leftLeg.position.set(-0.18, 0.425, 0);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.18;
    root.add(leftLeg, rightLeg);

    // Knee guards
    const kneeL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.27), accentMat);
    kneeL.position.set(-0.18, 0.48, 0.02);
    const kneeR = kneeL.clone();
    kneeR.position.x = 0.18;
    root.add(kneeL, kneeR);

    // Torso & Divine Chestplate
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.82, 0.36), armorMat);
    torso.position.set(0, 1.24, 0);
    root.add(torso);

    // Glowing divine core on chest
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glowMat);
    core.position.set(0, 1.32, 0.19);
    root.add(core);

    // Pauldrons (Shoulders)
    const pauldronL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.42), accentMat);
    pauldronL.position.set(-0.46, 1.54, 0);
    pauldronL.rotation.z = 0.25;
    const pauldronR = pauldronL.clone();
    pauldronR.position.x = 0.46;
    pauldronR.rotation.z = -0.25;
    root.add(pauldronL, pauldronR);

    // Arms
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), darkMat);
    leftArm.position.set(-0.46, 1.15, 0);
    const rightArm = leftArm.clone();
    rightArm.position.x = 0.46;
    rightArm.position.z = 0.15;
    rightArm.rotation.x = -0.6;
    root.add(leftArm, rightArm);

    // Head
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.88, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), skinMat);
    headGroup.add(head);

    // Glowing god eyes
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.04), glowMat);
    eyeL.position.set(-0.09, 0.04, 0.19);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.09;
    headGroup.add(eyeL, eyeR);

    // Helmet base
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.42), accentMat);
    helm.position.set(0, 0.14, -0.01);
    headGroup.add(helm);

    // Hero-Specific Signature Ornament & Back Attachment
    if (heroId === 'loki') {
      // Loki's iconic curved golden horns
      const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.52, 8), accentMat);
      hornL.position.set(-0.16, 0.42, 0.08);
      hornL.rotation.z = 0.28;
      hornL.rotation.x = -0.25;
      const hornR = hornL.clone();
      hornR.position.x = 0.16;
      hornR.rotation.z = -0.28;
      headGroup.add(hornL, hornR);
    } else if (heroId === 'thor') {
      // Thor's silver-gold helmet wings + Crimson Cape
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
      // Hades' Underworld Bident Crown + Soul Orbs
      for (let i = -1; i <= 1; i += 2) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.44, 6), glowMat);
        spike.position.set(i * 0.14, 0.4, 0);
        headGroup.add(spike);
      }
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 20), glowMat);
      halo.position.set(0, 1.45, -0.22);
      root.add(halo);
    } else if (heroId === 'zeus') {
      // Zeus' Golden Sun Crown + Lightning Halo
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
      // Hela's multi-pronged Obsidian Antler Crown of Death
      const blackHornMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.9, roughness: 0.15 });
      [-2, -1, 1, 2].forEach(idx => {
        const antler = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.56, 6), blackHornMat);
        antler.position.set(idx * 0.12, 0.42, 0);
        antler.rotation.z = -idx * 0.35;
        headGroup.add(antler);
      });
    } else if (heroId === 'valkyrie') {
      // Valkyrie's Golden Mechanical VTOL Wings
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
    root.userData = {
      headGroup,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      torso,
      core
    };

    // Equipped 3rd-person weapon
    const defaultWep = h.defaultWeapons ? h.defaultWeapons[0] : 'm4a1';
    const gun = this.createWeaponModel(defaultWep, heroId, false);
    gun.scale.set(1.15, 1.15, 1.15);
    gun.position.set(0.46, 1.12, 0.38);
    root.add(gun);

    return root;
  },

  createDropshipModel() {
    const ship = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.75, roughness: 0.35 });
    const bifrostMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // Viking Longship Air-Hull
    const hull = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.8, 18), hullMat);
    ship.add(hull);

    const prow = new THREE.Mesh(new THREE.ConeGeometry(2.8, 6, 6), goldMat);
    prow.rotation.x = Math.PI / 2;
    prow.position.set(0, 1.2, 11.5);
    ship.add(prow);

    // Glowing Bifrost Energy Sails / Wings
    const wingGeo = new THREE.BoxGeometry(16, 0.35, 4.2);
    const wings = new THREE.Mesh(wingGeo, goldMat);
    wings.position.set(0, 1.4, 0);
    ship.add(wings);

    const engineL = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 4.5, 12), bifrostMat);
    engineL.rotation.x = Math.PI / 2;
    engineL.position.set(-5.2, 0.5, -7.5);
    const engineR = engineL.clone();
    engineR.position.x = 5.2;
    ship.add(engineL, engineR);

    return ship;
  }
};
