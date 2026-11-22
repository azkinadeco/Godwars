/**
 * GOD WARS: ASGARD ROYALE
 * Asgard Floating Island 3D Battle Royale Environment
 * - 6 Mythological POIs (Valhalla Citadel, Bifrost Observatory, Mjölnir Forge,
 *   Yggdrasil Sanctuary, Helheim Crypts, Valkyrie Sky Docks)
 * - 8 Bifrost Jump Pads (Octane-style high vertical/horizontal launch!)
 * - 28 Interactive Divine Supply Bins (Apex-style loot chests)
 * - 3D Shrinking Ragnarok Storm Ring
 */

class AsgardWorld {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // AABB boxes { minX, maxX, minZ, maxZ, maxY }
    this.supplyBins = [];
    this.jumpPads = [];
    this.groundLoot = [];
    this.ringMesh = null;
    this.islandRadius = window.GODWARS_DATA.MATCH_CONFIG.islandRadius;
  }

  build() {
    this.buildLightingAndSky();
    this.buildIslandTerrain();
    this.buildValhallaCitadel();
    this.buildBifrostObservatory();
    this.buildMjolnirForge();
    this.buildYggdrasilSanctuary();
    this.buildHelheimCrypts();
    this.buildValkyrieSkyDocks();
    this.buildTacticalRocksAndCover();
    this.buildJumpPads();
    this.buildSupplyBins();
    this.buildStormRing();
  }

  buildLightingAndSky() {
    this.scene.background = new THREE.Color(0x0b132b);
    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.0022);

    const hemiLight = new THREE.HemisphereLight(0xfef08a, 0x1e293b, 0.78);
    hemiLight.position.set(0, 160, 0);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.15);
    sunLight.position.set(95, 160, 80);
    this.scene.add(sunLight);

    // Cosmic Asgard Nebula Halo & Stars in the sky
    const starGeo = new THREE.BufferGeometry();
    const starCount = 750;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.46;
      const r = 420 + Math.random() * 80;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 30;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xfef08a, size: 1.8 });
    this.scene.add(new THREE.Points(starGeo, starMat));

    // Distant cosmic Bifrost Ring in the sky
    const skyRing = new THREE.Mesh(
      new THREE.TorusGeometry(320, 3.5, 10, 64),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 })
    );
    skyRing.rotation.x = Math.PI / 3;
    skyRing.position.set(0, 95, 0);
    this.scene.add(skyRing);
  }

  buildIslandTerrain() {
    // Main Floating Asgard Island Platform
    const islandGeo = new THREE.CylinderGeometry(this.islandRadius, this.islandRadius * 0.72, 26, 48);
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.82,
      metalness: 0.15
    });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.set(0, -13, 0);
    this.scene.add(island);

    // Golden Asgard Outer Ring Rim
    const rimGeo = new THREE.TorusGeometry(this.islandRadius - 2, 2.2, 10, 64);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.25 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.2, 0);
    this.scene.add(rim);

    // Subtle glowing radial circuit lines on the Asgard floor
    for (let r of [45, 95, 155, 210]) {
      const ringLine = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.4, r + 0.4, 48),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.25 })
      );
      ringLine.rotation.x = -Math.PI / 2;
      ringLine.position.y = 0.04;
      this.scene.add(ringLine);
    }
  }

  addBoxCollider(mesh, w, h, d, isClimbable = true) {
    this.scene.add(mesh);
    const pos = mesh.position;
    this.colliders.push({
      minX: pos.x - w / 2,
      maxX: pos.x + w / 2,
      minZ: pos.z - d / 2,
      maxZ: pos.z + d / 2,
      maxY: pos.y + h / 2,
      minY: pos.y - h / 2,
      isClimbable
    });
  }

  buildValhallaCitadel() {
    // Central POI (0, 0): Golden Hall of Odin
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85, roughness: 0.22 });
    const marbleMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.15 });
    const floorPlinth = new THREE.Mesh(new THREE.CylinderGeometry(32, 35, 1.6, 24), marbleMat);
    floorPlinth.position.set(0, 0.8, 0);
    this.scene.add(floorPlinth);

    // 10 Tall Golden Columns around Valhalla Citadel
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const px = Math.cos(angle) * 24;
      const pz = Math.sin(angle) * 24;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 14, 3.2), goldMat);
      pillar.position.set(px, 7, pz);
      this.addBoxCollider(pillar, 3.2, 14, 3.2);
    }

    // Central Elevated Throne Platform & Cover Walls
    const throneBase = new THREE.Mesh(new THREE.BoxGeometry(14, 3.2, 14), goldMat);
    throneBase.position.set(0, 1.6, 0);
    this.addBoxCollider(throneBase, 14, 3.2, 14, true);

    // Golden Roof Ring Crown
    const crown = new THREE.Mesh(new THREE.TorusGeometry(24, 1.4, 8, 32), goldMat);
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, 14.5, 0);
    this.scene.add(crown);

    // 4 Tactical Cover Walls around the plaza
    [
      [14, 0, 2.2, 3.2, 8],
      [-14, 0, 2.2, 3.2, 8],
      [0, 14, 8, 3.2, 2.2],
      [0, -14, 8, 3.2, 2.2]
    ].forEach(([x, z, w, h, d]) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), marbleMat);
      wall.position.set(x, h / 2, z);
      this.addBoxCollider(wall, w, h, d);
    });
  }

  buildBifrostObservatory() {
    // South POI (0, 135): Rainbow Bridge & Heimdall's Dome
    const cx = 0, cz = 135;
    const bridgeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      roughness: 0.15,
      metalness: 0.8
    });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 });

    // Glowing Bifrost Bridge Highway leading from Valhalla toward the Observatory
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 85), bridgeMat);
    bridge.position.set(0, 0.3, 95);
    this.scene.add(bridge);

    // Observatory Rotunda Walls
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const wx = cx + Math.cos(angle) * 20;
      const wz = cz + Math.sin(angle) * 20;
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(3.4, 10, 3.4), goldMat);
      pylon.position.set(wx, 5, wz);
      this.addBoxCollider(pylon, 3.4, 10, 3.4);
    }

    // Heimdall Sword Altar in center
    const altar = new THREE.Mesh(new THREE.BoxGeometry(8, 2.8, 8), bridgeMat);
    altar.position.set(cx, 1.4, cz);
    this.addBoxCollider(altar, 8, 2.8, 8);
  }

  buildMjolnirForge() {
    // West POI (-115, 35): Molten Dwarven Foundry
    const cx = -115, cz = 35;
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.35 });
    const lavaMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

    // Lava Pool Ring
    const lavaPool = new THREE.Mesh(new THREE.CircleGeometry(22, 24), lavaMat);
    lavaPool.rotation.x = -Math.PI / 2;
    lavaPool.position.set(cx, 0.08, cz);
    this.scene.add(lavaPool);

    // Giant Central Dwarven Anvil
    const anvilBase = new THREE.Mesh(new THREE.BoxGeometry(10, 4.5, 6), ironMat);
    anvilBase.position.set(cx, 2.25, cz);
    this.addBoxCollider(anvilBase, 10, 4.5, 6);

    // 6 Foundry Furnace Towers
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const fx = cx + Math.cos(a) * 24;
      const fz = cz + Math.sin(a) * 24;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 9, 5), ironMat);
      tower.position.set(fx, 4.5, fz);
      this.addBoxCollider(tower, 5, 9, 5);
    }
  }

  buildYggdrasilSanctuary() {
    // East POI (115, 30): Giant World Tree of Life
    const cx = 115, cz = 30;
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.35,
      roughness: 0.4
    });

    // Massive Tree Trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 8.5, 28, 12), barkMat);
    trunk.position.set(cx, 14, cz);
    this.addBoxCollider(trunk, 11, 28, 11, false);

    // Glowing Canopy Spheres
    [
      [0, 29, 0, 18],
      [-11, 25, 8, 12],
      [12, 26, -7, 13],
      [6, 24, 11, 11],
      [-9, 25, -10, 12]
    ].forEach(([ox, oy, oz, r]) => {
      const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), leafMat);
      canopy.position.set(cx + ox, oy, cz + oz);
      this.scene.add(canopy);
    });

    // Sanctuary Stone Cover Arches around Yggdrasil
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd1fae5, roughness: 0.5 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sx = cx + Math.cos(a) * 22;
      const sz = cz + Math.sin(a) * 22;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 2.5), stoneMat);
      wall.position.set(sx, 1.7, sz);
      this.addBoxCollider(wall, 6, 3.4, 2.5);
    }
  }

  buildHelheimCrypts() {
    // North-West POI (-85, -105): Obsidian Pillars & Necro Crystals
    const cx = -85, cz = -105;
    const obsMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 });
    const crystalMat = new THREE.MeshBasicMaterial({ color: 0x14b8a6 });

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 15 : 25;
      const px = cx + Math.cos(a) * r;
      const pz = cz + Math.sin(a) * r;
      const monolith = new THREE.Mesh(new THREE.BoxGeometry(4.2, 8.5, 4.2), obsMat);
      monolith.position.set(px, 4.25, pz);
      this.addBoxCollider(monolith, 4.2, 8.5, 4.2);

      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), crystalMat);
      crystal.position.set(px, 9.8, pz);
      this.scene.add(crystal);
    }
  }

  buildValkyrieSkyDocks() {
    // North-East POI (90, -100): Elevated Aerial Launch Pads
    const cx = 90, cz = -100;
    const dockMat = new THREE.MeshStandardMaterial({ color: 0xfde047, metalness: 0.85, roughness: 0.2 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x312e81, metalness: 0.7, roughness: 0.3 });

    const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(22, 3.0, 22), darkMat);
    mainDeck.position.set(cx, 1.5, cz);
    this.addBoxCollider(mainDeck, 22, 3.0, 22);

    // 4 Corner Towers
    [[-14, -14], [14, -14], [-14, 14], [14, 14]].forEach(([ox, oz]) => {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(4.5, 8, 4.5), dockMat);
      tower.position.set(cx + ox, 4, cz + oz);
      this.addBoxCollider(tower, 4.5, 8, 4.5);
    });
  }

  buildTacticalRocksAndCover() {
    // Scatter tactical cover blocks & golden shrines between POIs so there are no empty deadzones
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
    const goldTrim = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.25 });

    const coverCoords = [
      [-55, 20], [55, 18], [-45, -50], [48, -45], [0, -75],
      [-55, 85], [58, 82], [-150, -35], [150, -30], [0, 62],
      [-28, 48], [30, 48], [-32, -25], [32, -25], [72, -18], [-72, -15]
    ];

    coverCoords.forEach(([x, z], idx) => {
      const w = idx % 2 === 0 ? 6.5 : 3.2;
      const d = idx % 2 === 0 ? 2.6 : 6.5;
      const h = 3.0 + (idx % 3) * 0.8;
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), idx % 3 === 0 ? goldTrim : rockMat);
      block.position.set(x, h / 2, z);
      this.addBoxCollider(block, w, h, d);
    });
  }

  buildJumpPads() {
    // 8 Bifrost Jump Pads (Launch players high across Asgard like Octane's Launch Pad!)
    const padCoords = [
      [0, 36], [0, -36], [-38, 0], [38, 0],
      [-90, 35], [88, 30], [-65, -80], [68, -78]
    ];

    const baseMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    padCoords.forEach(([x, z]) => {
      const group = new THREE.Group();
      group.position.set(x, 0.15, z);

      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.35, 16), baseMat);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.42, 16), glowMat);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 8, 24), glowMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.45;

      group.add(base, inner, ring);
      this.scene.add(group);
      this.jumpPads.push({ x, z, radius: 2.6, mesh: group, ring });
    });
  }

  buildSupplyBins() {
    // 28 Interactive Divine Supply Bins across all 6 POIs
    const binLocations = [
      // Valhalla Citadel (6)
      [10, 10], [-10, 10], [10, -10], [-10, -10], [20, 0], [-20, 0],
      // Bifrost Observatory (4)
      [10, 128], [-10, 128], [0, 148], [14, 140],
      // Mjolnir Forge (4)
      [-102, 28], [-128, 28], [-115, 50], [-115, 18],
      // Yggdrasil Sanctuary (4)
      [100, 24], [130, 24], [115, 45], [115, 14],
      // Helheim Crypts (4)
      [-75, -98], [-95, -98], [-85, -118], [-85, -90],
      // Valkyrie Sky Docks (4)
      [78, -95], [102, -95], [90, -114], [90, -84],
      // Mid-map bins (2)
      [-48, 52], [48, 52]
    ];

    const weaponKeys = Object.keys(window.GODWARS_DATA.WEAPONS);
    const grenadeKeys = Object.keys(window.GODWARS_DATA.GRENADES);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
    const lidMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    binLocations.forEach(([x, z], i) => {
      const binGroup = new THREE.Group();
      binGroup.position.set(x, 0, z);

      const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.4), bodyMat);
      box.position.y = 0.55;
      binGroup.add(box);

      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.35, 1.46), lidMat);
      lid.position.set(0, 1.2, 0);
      binGroup.add(lid);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 1.5), glowMat.clone());
      strip.position.set(0, 0.85, 0);
      binGroup.add(strip);

      this.scene.add(binGroup);

      // Assign loot inside this Supply Bin
      const weaponId = weaponKeys[i % weaponKeys.length];
      const grenadeId = grenadeKeys[i % grenadeKeys.length];
      const shieldTier = (i % 4 === 0) ? 4 : (i % 3 === 0) ? 3 : 2; // Lv2 Blue, Lv3 Purple, Lv4 Gold Mythic

      this.supplyBins.push({
        id: i,
        x,
        z,
        opened: false,
        mesh: binGroup,
        lid,
        strip,
        loot: {
          weaponId,
          grenadeId,
          shieldTier,
          shieldBattery: 2,
          medkit: 1
        }
      });
    });
  }

  buildStormRing() {
    // 3D Translucent Glowing Ragnarok Storm Cylinder
    const ringGeo = new THREE.CylinderGeometry(1, 1, 140, 64, 1, true);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.ringMesh.position.set(0, 65, 0);
    this.ringMesh.scale.set(this.islandRadius, 1, this.islandRadius);
    this.scene.add(this.ringMesh);
  }

  updateRingVisual(centerX, centerZ, radius, time) {
    if (!this.ringMesh) return;
    this.ringMesh.position.x = centerX;
    this.ringMesh.position.z = centerZ;
    this.ringMesh.scale.set(Math.max(1, radius), 1, Math.max(1, radius));
    this.ringMesh.material.opacity = 0.2 + Math.sin(time * 3.5) * 0.05;

    // Spin Bifrost Jump Pad rings
    this.jumpPads.forEach(p => {
      p.ring.position.y = 0.4 + Math.sin(time * 4) * 0.12;
    });
  }

  getGroundHeight(x, z, currentY = 0) {
    let groundY = 0;
    for (const c of this.colliders) {
      if (x >= c.minX - 0.35 && x <= c.maxX + 0.35 && z >= c.minZ - 0.35 && z <= c.maxZ + 0.35) {
        if (currentY >= c.maxY - 1.1) {
          groundY = Math.max(groundY, c.maxY);
        }
      }
    }
    return groundY;
  }

  resolveHorizontalCollision(x, z, y, radius = 0.48) {
    let nx = x;
    let nz = z;
    for (const c of this.colliders) {
      // If player is standing on top of this collider, don't block horizontally
      if (y >= c.maxY - 0.45) continue;

      const closestX = Math.max(c.minX, Math.min(nx, c.maxX));
      const closestZ = Math.max(c.minZ, Math.min(nz, c.maxZ));
      const dx = nx - closestX;
      const dz = nz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius && distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        nx += (dx / dist) * overlap;
        nz += (dz / dist) * overlap;
      }
    }

    // Clamp inside Asgard Island edge
    const distFromCenter = Math.hypot(nx, nz);
    const maxR = this.islandRadius - 2.5;
    if (distFromCenter > maxR) {
      nx = (nx / distFromCenter) * maxR;
      nz = (nz / distFromCenter) * maxR;
    }

    return { x: nx, z: nz };
  }
}

window.AsgardWorld = AsgardWorld;
