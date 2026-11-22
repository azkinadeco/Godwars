/**
 * GOD WARS: ASGARD ROYALE — COMPLETE AAA APEX LEGENDS MAP ENGINE
 * Full 3D Architectural & Terrain Rebuild of Asgard Island:
 * - True Multi-Story Building Physics (Walkable Ground Floors, 2nd Floors, Rooftops, Ceilings & Interior Ramps/Stairs)
 * - Sloped Ramps & Staircases with smooth elevation interpolation & downhill Apex Slide speed boost
 * - Apex Ledge Mantle / Wall-Climb support on all walls, crates, and rooftops
 * - Interactive Apex Energy Doors ([E] Open/Close, [V] Melee Kick to Shatter!)
 * - 3D Visible Ground Loot Pickups inside buildings (3D Weapons, Evo Shields, Batteries, Medkits, Bombs)
 * - Interactive Dwarven Replicator Crafting Stations & Heimdall Survey Beacons
 * - 6 Fully Enterable Multi-Story POIs + 4 Mid-Map Outpost Compounds + Paved Roads + Bridges over Lava & Bifrost Rivers
 * - 6 Golden Bifrost Ziplines + Valhalla Jump Tower + 8 Bifrost Jump Pads + 28 Supply Bins + Odin Care Packages
 */

class AsgardWorld {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];        // Solid wall/pillar/prop AABBs { minX, maxX, minZ, maxZ, minY, maxY, isClimbable }
    this.walkableSurfaces = []; // Multi-story floor/roof slabs { minX, maxX, minZ, maxZ, y, thickness }
    this.ramps = [];            // Sloped stairs/ramps { minX, maxX, minZ, maxZ, dir, lowY, highY }
    this.doors = [];            // Interactive Apex Doors
    this.groundLoot = [];       // 3D Floor Loot items inside buildings
    this.replicators = [];      // Apex Replicator Crafting terminals
    this.surveyBeacons = [];    // Recon Survey Beacons on rooftops
    this.respawnBeacons = [];   // Apex Green Respawn Beacons for fallen Squadmates
    this.supplyBins = [];
    this.jumpPads = [];
    this.ziplines = [];
    this.carePackages = [];
    this.championBannerCanvases = [];
    this.animatedProps = [];
    this.jumpTower = null;
    this.ringMesh = null;
    this.islandRadius = window.GODWARS_DATA.MATCH_CONFIG.islandRadius;
  }

  build() {
    this.initMaterials();
    this.buildLightingAndSky();
    this.buildBiomesRoadsAndRivers();
    this.buildAsgardHillsAndRidges();
    this.buildValhallaCitadel();
    this.buildBifrostObservatory();
    this.buildMjolnirForge();
    this.buildYggdrasilSanctuary();
    this.buildHelheimCrypts();
    this.buildValkyrieSkyDocks();
    this.buildMidMapOutpostsAndFoliage();
    this.buildJumpPads();
    this.buildZiplinesAndJumpTower();
    this.buildArenaChampionBanners();
    this.buildSupplyBins();
    this.buildGroundLootAndReplicators();
    this.buildStormRing();
  }

  initMaterials() {
    const goldRuneTex = window.ModelFactory.getRuneTexture('#fbbf24', '#1e293b');
    goldRuneTex.repeat.set(2, 2);
    const cyanRuneTex = window.ModelFactory.getRuneTexture('#38bdf8', '#0f172a');
    cyanRuneTex.repeat.set(2, 2);

    this.mats = {
      gold: new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.88, roughness: 0.2 }),
      brightGold: new THREE.MeshStandardMaterial({ color: 0xfde047, metalness: 0.92, roughness: 0.15 }),
      marbleWall: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.15 }),
      marbleFloor: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4, metalness: 0.2 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x1e293b, map: goldRuneTex, metalness: 0.78, roughness: 0.32 }),
      obsidian: new THREE.MeshStandardMaterial({ color: 0x0f172a, map: cyanRuneTex, metalness: 0.82, roughness: 0.24 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.75, metalness: 0.12 }),
      woodGold: new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.65, metalness: 0.25 }),
      grass: new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.85, metalness: 0.05 }),
      lava: new THREE.MeshBasicMaterial({ color: 0xf97316 }),
      bifrostWater: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.55,
        roughness: 0.12,
        metalness: 0.85
      }),
      doorGlass: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.78
      }),
      necroGlow: new THREE.MeshBasicMaterial({ color: 0x14b8a6 }),
      amberGlow: new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    };
  }

  // =========================================================================
  // ARCHITECTURAL PRIMITIVES: WALLS, WALKABLE FLOORS, RAMPS/STAIRS & DOORS
  // =========================================================================
  addSolidWall(x, y, z, w, h, d, material, isClimbable = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || this.mats.marbleWall);
    mesh.position.set(x, y + h / 2, z);
    this.scene.add(mesh);

    this.colliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      minY: y,
      maxY: y + h,
      isClimbable
    });
    // Top of wall/crate is also walkable if player climbs/mantles onto it
    if (isClimbable) {
      this.walkableSurfaces.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
        y: y + h,
        thickness: h
      });
    }
    return mesh;
  }

  addWalkableFloor(x, topY, z, w, d, thickness = 0.4, material = null) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, thickness, d),
      material || this.mats.marbleFloor
    );
    mesh.position.set(x, topY - thickness / 2, z);
    this.scene.add(mesh);

    this.walkableSurfaces.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      y: topY,
      thickness
    });

    // Add horizontal slab collider for elevated 2nd-floor/roof slabs OR thick ground plinths (> 0.5m)
    if (topY > 0.5) {
      this.colliders.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
        minY: topY - thickness,
        maxY: topY,
        isSlab: true
      });
    }
    return mesh;
  }

  /**
   * Builds a walkable visual staircase / ramp from lowY to highY.
   * dir: 'N' (goes -Z), 'S' (goes +Z), 'E' (goes +X), 'W' (goes -X)
   */
  addStairRamp(x, z, w, d, lowY, highY, dir = 'N', material = null) {
    const steps = 10;
    const group = new THREE.Group();
    const mat = material || this.mats.gold;
    const dh = (highY - lowY) / steps;

    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const stepY = lowY + (i + 1) * dh;
      let sx = x, sz = z, sw = w, sd = d;

      if (dir === 'N') {
        sd = d / steps;
        sz = (z + d / 2) - t * d;
      } else if (dir === 'S') {
        sd = d / steps;
        sz = (z - d / 2) + t * d;
      } else if (dir === 'E') {
        sw = w / steps;
        sx = (x - w / 2) + t * w;
      } else if (dir === 'W') {
        sw = w / steps;
        sx = (x + w / 2) - t * w;
      }

      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(sw, dh + 0.15, sd + 0.08), mat);
      stepMesh.position.set(sx, stepY - (dh + 0.15) / 2, sz);
      group.add(stepMesh);
    }
    this.scene.add(group);

    this.ramps.push({
      minX: x - w / 2 - 0.2,
      maxX: x + w / 2 + 0.2,
      minZ: z - d / 2 - 0.2,
      maxZ: z + d / 2 + 0.2,
      lowY,
      highY,
      dir
    });
  }

  addApexDoor(x, y, z, width, height, axis = 'X') {
    const w = axis === 'X' ? width : 0.28;
    const d = axis === 'X' ? 0.28 : width;
    const doorGroup = new THREE.Group();
    doorGroup.position.set(x, y, z);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), this.mats.doorGlass.clone());
    panel.position.y = height / 2;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.1, 0.18, d + 0.1),
      this.mats.gold
    );
    frame.position.y = height - 0.1;
    doorGroup.add(panel, frame);
    this.scene.add(doorGroup);

    const collider = {
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      minY: y,
      maxY: y + height,
      isDoor: true,
      active: true
    };
    this.colliders.push(collider);

    const doorObj = {
      id: 'door_' + this.doors.length,
      x, y, z,
      width, height, axis,
      closedX: x,
      closedZ: z,
      open: false,
      broken: false,
      mesh: doorGroup,
      collider
    };
    this.doors.push(doorObj);
    return doorObj;
  }

  toggleDoor(door, breakDoor = false) {
    if (!door || door.broken) return;
    if (breakDoor) {
      door.broken = true;
      door.open = true;
      door.mesh.visible = false;
      door.collider.active = false;
      window.SFX.playHitmarker(false, true, true);
      return;
    }
    door.open = !door.open;
    door.collider.active = !door.open;
    const offset = door.open ? (door.width * 0.88) : 0;
    if (door.axis === 'X') {
      door.mesh.position.x = door.closedX + offset;
    } else {
      door.mesh.position.z = door.closedZ + offset;
    }
    window.SFX.playReload();
  }

  /**
   * Builds a complete Enterable 1, 2, or 3-Story Apex Legends Compound Building with:
   * - True Apex Proportions (4.6m floor height, 3.6m wide doors, 1.2m peek windows, interior cover crates!)
   * - Walkable Ground Floor, 2nd Floor (4.6m), 3rd Floor (9.2m), & Overwatch Rooftop (13.8m)
   * - Wide Exterior & Flanking Staircase Ramps connecting every single floor smoothly
   * - Rooftop Battlement Parapets & Golden Architectural Roof Trims
   */
  buildApexCompoundBuilding(cx, cz, width, depth, wallMat, trimMat, stories = 2) {
    const floorCount = typeof stories === 'boolean' ? (stories ? 2 : 1) : stories;
    const fh = 4.6;
    const wallT = 0.6;
    const doorW = 3.6;

    // 1. Ground Floor Slab (flush at y = 0.06)
    this.addWalkableFloor(cx, 0.06, cz, width, depth, 0.12, this.mats.marbleFloor);

    // Interior Tactical Cover Crates on Ground Floor (Real Apex indoor CQC cover!)
    this.addSolidWall(cx - width * 0.22, 0.06, cz, 2.2, 1.35, 2.2, trimMat, true);
    this.addSolidWall(cx + width * 0.22, 0.06, cz, 2.2, 1.35, 2.2, trimMat, true);

    // 2. Ground Floor North & South Walls with Interactive Apex Energy Doors!
    const segW = Math.max(1.5, (width - doorW) / 2);
    this.addSolidWall(cx - (doorW / 2 + segW / 2), 0, cz + depth / 2, segW, fh, wallT, wallMat);
    this.addSolidWall(cx + (doorW / 2 + segW / 2), 0, cz + depth / 2, segW, fh, wallT, wallMat);
    this.addApexDoor(cx, 0, cz + depth / 2, doorW, 3.2, 'X');

    this.addSolidWall(cx - (doorW / 2 + segW / 2), 0, cz - depth / 2, segW, fh, wallT, wallMat);
    this.addSolidWall(cx + (doorW / 2 + segW / 2), 0, cz - depth / 2, segW, fh, wallT, wallMat);
    this.addApexDoor(cx, 0, cz - depth / 2, doorW, 3.2, 'X');

    // East & West Ground Walls with Shoot-Through Chest-High Window Embrasures!
    for (let side of [-1, 1]) {
      const wx = cx + side * (width / 2);
      this.addSolidWall(wx, 0, cz, wallT, 1.25, depth, wallMat);
      this.addSolidWall(wx, 2.9, cz, wallT, fh - 2.9, depth, wallMat);
      this.addSolidWall(wx, 1.25, cz - depth * 0.36, wallT, 1.65, depth * 0.26, trimMat);
      this.addSolidWall(wx, 1.25, cz + depth * 0.36, wallT, 1.65, depth * 0.26, trimMat);
    }

    // 3. Build Upper Stories (2nd Floor y=4.6m, 3rd Floor y=9.2m, Overwatch Roof y=13.8m)
    for (let lvl = 1; lvl <= floorCount; lvl++) {
      const slabY = lvl * fh;
      const prevY = (lvl - 1) * fh;

      // Walkable Floor / Roof Deck Slab
      this.addWalkableFloor(cx, slabY, cz, width + 1.4, depth + 1.4, 0.42, lvl === floorCount ? trimMat : this.mats.marbleFloor);

      // Alternating East / West Wide Exterior Staircase Ramp connecting prevY -> slabY!
      const rampOnEast = (lvl % 2 === 1);
      const rx = rampOnEast ? (cx + width / 2 + 2.1) : (cx - width / 2 - 2.1);
      const rDir = rampOnEast ? 'N' : 'S';
      this.addStairRamp(rx, cz, 3.2, depth * 0.82, prevY, slabY, rDir, trimMat);

      if (lvl < floorCount) {
        // Upper Interior Floor Walls with Wide Balcony Doors, Windows & Interior Cover!
        this.addSolidWall(cx - width * 0.33, slabY, cz + depth / 2, width * 0.30, fh, wallT, wallMat);
        this.addSolidWall(cx + width * 0.33, slabY, cz + depth / 2, width * 0.30, fh, wallT, wallMat);
        this.addSolidWall(cx - width * 0.33, slabY, cz - depth / 2, width * 0.30, fh, wallT, wallMat);
        this.addSolidWall(cx + width * 0.33, slabY, cz - depth / 2, width * 0.30, fh, wallT, wallMat);

        // Chest-high peek walls on East/West balconies
        this.addSolidWall(cx - width / 2, slabY, cz, wallT, 1.3, depth * 0.72, trimMat);
        this.addSolidWall(cx + width / 2, slabY, cz, wallT, 1.3, depth * 0.72, trimMat);

        // Interior Cover Box on Upper Floor
        this.addSolidWall(cx, slabY, cz, 2.4, 1.25, 2.0, trimMat, true);
      } else {
        // Topmost Rooftop High-Ground Battlement Cover Parapets + Corner Spires!
        this.addSolidWall(cx, slabY, cz + depth / 2, width * 0.72, 1.25, 0.48, trimMat);
        this.addSolidWall(cx, slabY, cz - depth / 2, width * 0.72, 1.25, 0.48, trimMat);
        this.addSolidWall(cx - width / 2, slabY, cz, 0.48, 1.25, depth * 0.55, trimMat);
        this.addSolidWall(cx + width / 2, slabY, cz, 0.48, 1.25, depth * 0.55, trimMat);

        // Decorative Golden Corner Finials on Rooftop
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
          const finial = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.2, 4), this.mats.brightGold);
          finial.position.set(cx + sx * (width / 2), slabY + 1.8, cz + sz * (depth / 2));
          this.scene.add(finial);
        });
      }
    }
  }

  /**
   * Builds a Playable Multi-Tiered Asgardian Hill / Elevated Plateau with Wide Sloped Ramps
   * so players can fight uphill for Apex high ground and Apex-Slide downhill!
   */
  addPlayableHill(cx, cz, width, depth, height, biomeMat = null) {
    const hillMat = biomeMat || this.mats.stone;
    const grassTopMat = this.mats.grass;

    // Lower Terraced Base Skirt
    this.addWalkableFloor(cx, height * 0.5, cz, width + 10, depth + 10, height * 0.5, hillMat);
    // Upper Hilltop Plateau
    this.addWalkableFloor(cx, height, cz, width, depth, height * 0.5, grassTopMat);

    // 4 Wide Playable Sloped Ramps climbing from Ground (0) -> Mid Terrace -> Hilltop!
    const rampW = Math.min(8, width * 0.45);
    this.addStairRamp(cx, cz + (depth / 2 + 9), rampW, 10, 0, height * 0.5, 'N', hillMat);
    this.addStairRamp(cx, cz + (depth / 2 + 2.5), rampW, 5, height * 0.5, height, 'N', hillMat);

    this.addStairRamp(cx, cz - (depth / 2 + 9), rampW, 10, 0, height * 0.5, 'S', hillMat);
    this.addStairRamp(cx, cz - (depth / 2 + 2.5), rampW, 5, height * 0.5, height, 'S', hillMat);

    // Tactical Rock Cover Boulders on the Hilltop
    this.addSolidWall(cx - width * 0.3, height, cz, 2.6, 1.6, 4.2, hillMat, true);
    this.addSolidWall(cx + width * 0.3, height, cz, 2.6, 1.6, 4.2, hillMat, true);
  }

  placeBlenderStatue(glbName, x, y, z, rotY = 0, scale = 1.0) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    group.scale.set(scale, scale, scale);
    this.scene.add(group);
    if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
      window.ModelFactory.attachBlenderGLB(glbName, group);
    }
    // Solid pedestal base collider so players don't walk through the colossal statue base
    this.addSolidWall(x, y, z, 5.2 * scale, 2.8 * scale, 5.2 * scale, this.mats.gold, true);
    return group;
  }

  // =========================================================================
  // CONTORED ASGARDIAN HILLS, TERRACED PLATEAUS, CANYON RIDGES & HIGHWAY ARCHES
  // =========================================================================
  buildAsgardHillsAndRidges() {
    // 6 Large Playable Hills & Plateaus framing the valleys between POIs (Apex High-Ground!)
    this.addPlayableHill(-62, -25, 22, 18, 6.4, this.mats.stone);        // West-Central Ridge Hill
    this.addPlayableHill(62, -25, 22, 18, 6.4, this.mats.stone);         // East-Central Ridge Hill
    this.addPlayableHill(-58, 92, 20, 16, 5.6, this.mats.stone);         // South-West Cliff Hill
    this.addPlayableHill(58, 92, 20, 16, 5.6, this.mats.stone);          // South-East Cliff Hill
    this.addPlayableHill(0, -88, 26, 18, 7.2, this.mats.obsidian);       // North Overlook Ridge Hill
    this.addPlayableHill(-148, -28, 22, 22, 7.6, this.mats.darkSteel);   // Far-West Forge Mountain Plateau

    // Natural Mountain Cliff Ridges at Island Edges for Scenic Apex Horizon & Choke-Points
    const ridgeSpots = [
      [-172, 65, 26, 18, 16], [172, 65, 26, 18, 16],
      [-155, -110, 24, 22, 18], [155, -110, 24, 22, 18],
      [-75, 168, 28, 16, 15], [75, 168, 28, 16, 15]
    ];
    ridgeSpots.forEach(([rx, rz, rw, rh, rd]) => {
      this.addSolidWall(rx, 0, rz, rw, rh, rd, this.mats.stone, false);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(rw * 0.55, rh * 0.9, 6), this.mats.stone);
      peak.position.set(rx, rh + rh * 0.4, rz);
      this.scene.add(peak);
    });

    // Place Ornate Golden Blender Triumphal Archways along the 5 Major Asgardian Highways!
    window.GODWARS_DATA.POIS.forEach(poi => {
      if (poi.id === 'valhalla') return;
      const angle = Math.atan2(poi.x, poi.z);
      const ax = poi.x * 0.44;
      const az = poi.z * 0.44;
      const archGroup = new THREE.Group();
      archGroup.position.set(ax, 0, az);
      archGroup.rotation.y = angle;
      this.scene.add(archGroup);
      if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
        window.ModelFactory.attachBlenderGLB('prop_asgard_archway', archGroup);
      }
    });
  }

  // =========================================================================
  // SKYBOX, BIOMES, PAVED ROADS, LAVA & BIFROST RIVERS, BRIDGES
  // =========================================================================
  buildLightingAndSky() {
    this.scene.background = new THREE.Color(0x0b1528);
    this.scene.fog = new THREE.FogExp2(0x0e1a32, 0.0018);

    const hemiLight = new THREE.HemisphereLight(0xfff7ed, 0x1e293b, 0.92);
    hemiLight.position.set(0, 180, 0);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.32);
    sunLight.position.set(110, 180, 95);
    this.scene.add(sunLight);

    // Regional Atmospheric POI Point Lights (Apex World's Edge / Olympus Color Mood!)
    const poiLights = [
      [0, 18, 0, 0xfbbf24, 1.8, 95],       // Valhalla Golden Citadel Glow
      [0, 16, 135, 0x38bdf8, 1.8, 85],     // Bifrost Observatory Cyan Glow
      [-115, 16, 35, 0xf97316, 2.0, 90],   // Mjölnir Forge Lava Orange Glow
      [115, 18, 30, 0x10b981, 1.6, 85],    // Yggdrasil Sanctuary Emerald Glow
      [-85, 16, -105, 0x14b8a6, 1.8, 85],  // Helheim Crypts Necro Glow
      [90, 18, -100, 0xe879f9, 1.5, 85]    // Valkyrie Sky Docks Violet-Gold Glow
    ];
    poiLights.forEach(([lx, ly, lz, color, intensity, dist]) => {
      const pl = new THREE.PointLight(color, intensity, dist);
      pl.position.set(lx, ly, lz);
      this.scene.add(pl);
    });

    // Drifting Volumetric Cosmic Clouds high above Asgard Island
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0.14 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 90 + (i % 3) * 65;
      const cloud = new THREE.Mesh(new THREE.DodecahedronGeometry(18 + (i % 4) * 5, 1), cloudMat);
      cloud.scale.set(2.2, 0.45, 1.4);
      cloud.position.set(Math.cos(a) * r, 78 + (i % 3) * 14, Math.sin(a) * r);
      this.scene.add(cloud);
      this.animatedProps.push({ mesh: cloud, rotY: 0.04 });
    }

    const starGeo = new THREE.BufferGeometry();
    const starCount = 800;
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
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xfef08a, size: 1.9 })));

    const skyRing = new THREE.Mesh(
      new THREE.TorusGeometry(320, 4.0, 10, 64),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 })
    );
    skyRing.rotation.x = Math.PI / 3;
    skyRing.position.set(0, 95, 0);
    this.scene.add(skyRing);

    // Floating Asgard Mountains & Golden Waterfalls around Island Perimeter
    const spireMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
    const fallMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(24, 72, 6), spireMat);
      spire.position.set(Math.cos(a) * 310, 22 + (i % 3) * 14, Math.sin(a) * 310);
      spire.rotation.x = Math.PI;
      this.scene.add(spire);

      const wx = Math.cos(a + 0.3) * (this.islandRadius - 1);
      const wz = Math.sin(a + 0.3) * (this.islandRadius - 1);
      const waterfall = new THREE.Mesh(new THREE.BoxGeometry(9, 48, 1.2), fallMat);
      waterfall.position.set(wx, -24, wz);
      waterfall.rotation.y = -a;
      this.scene.add(waterfall);
    }
  }

  buildBiomesRoadsAndRivers() {
    const runeFloorTex = window.ModelFactory.getRuneTexture('#d97706', '#152238');
    runeFloorTex.repeat.set(22, 22);

    // Main Floating Asgard Island Base (Top surface is strictly at y = 0.0!)
    const islandGeo = new THREE.CylinderGeometry(this.islandRadius, this.islandRadius * 0.74, 28, 64);
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      map: runeFloorTex,
      roughness: 0.78,
      metalness: 0.18
    });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.set(0, -14, 0);
    this.scene.add(island);

    // Outer Golden Island Rim Wall
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(this.islandRadius - 1.5, 2.2, 10, 64),
      this.mats.gold
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.3, 0);
    this.scene.add(rim);

    //Distinct Regional Biome Ground Surfaces (Flush at y = 0.02 so zero camera clipping!)
    // 1. Yggdrasil Lush Emerald Sanctuary Biome (East)
    const eastBiome = new THREE.Mesh(new THREE.CircleGeometry(62, 32), this.mats.grass);
    eastBiome.rotation.x = -Math.PI / 2;
    eastBiome.position.set(115, 0.02, 30);
    this.scene.add(eastBiome);

    // 2. Mjölnir Volcanic Basalt & Lava Trench Biome (West)
    const westBiome = new THREE.Mesh(
      new THREE.CircleGeometry(58, 32),
      new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.85 })
    );
    westBiome.rotation.x = -Math.PI / 2;
    westBiome.position.set(-115, 0.02, 35);
    this.scene.add(westBiome);

    // 3. Helheim Obsidian Frost Biome (North-West)
    const nwBiome = new THREE.Mesh(
      new THREE.CircleGeometry(54, 32),
      new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.4, metalness: 0.6 })
    );
    nwBiome.rotation.x = -Math.PI / 2;
    nwBiome.position.set(-85, 0.02, -105);
    this.scene.add(nwBiome);

    // 4. Paved Golden Asgardian Highways connecting Valhalla Citadel to all 6 POIs
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.3 });
    window.GODWARS_DATA.POIS.forEach(poi => {
      if (poi.id === 'valhalla') return;
      const len = Math.hypot(poi.x, poi.z);
      const angle = Math.atan2(poi.x, poi.z);
      const road = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.06, len), roadMat);
      road.position.set(poi.x / 2, 0.03, poi.z / 2);
      road.rotation.y = angle;
      this.scene.add(road);

      // Golden Road Edge Borders
      const borderL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, len), this.mats.gold);
      borderL.position.set(poi.x / 2 + Math.cos(angle) * 3.8, 0.04, poi.z / 2 - Math.sin(angle) * 3.8);
      borderL.rotation.y = angle;
      this.scene.add(borderL);
    });
  }

  // =========================================================================
  // POI 1: VALHALLA GOLDEN CITADEL (CENTER [0, 0])
  // Expanded 3-Story Grand Palace Complex + Dual Skybridges + Colossal Odin Statue!
  // =========================================================================
  buildValhallaCitadel() {
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(52, 40), this.mats.marbleFloor);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.03, 0);
    this.scene.add(plaza);

    // North & South EXPANDED 3-Story Royal Palace Halls (30m x 14m, Roof at y = 13.8m!)
    this.buildApexCompoundBuilding(0, -24, 30, 14, this.mats.marbleWall, this.mats.gold, 3);
    this.buildApexCompoundBuilding(0, 24, 30, 14, this.mats.marbleWall, this.mats.gold, 3);

    // East & West Flanking 2-Story Palace Guard Wings
    this.buildApexCompoundBuilding(-26, 0, 12, 20, this.mats.marbleWall, this.mats.gold, 2);
    this.buildApexCompoundBuilding(26, 0, 12, 20, this.mats.marbleWall, this.mats.gold, 2);

    // Multi-Tiered Elevated Sky-Bridges connecting North & South Palaces on 2nd Floor (4.6m) & 3rd Floor (9.2m)!
    this.addWalkableFloor(-14, 4.6, 0, 4.5, 34, 0.4, this.mats.gold);
    this.addWalkableFloor(14, 4.6, 0, 4.5, 34, 0.4, this.mats.gold);
    this.addWalkableFloor(-14, 9.2, 0, 3.8, 34, 0.4, this.mats.brightGold);
    this.addWalkableFloor(14, 9.2, 0, 3.8, 34, 0.4, this.mats.brightGold);

    // Central Elevated Odin Allfather Altar (with 4 wide walkable royal staircases!)
    this.addWalkableFloor(0, 1.8, 0, 12, 12, 1.8, this.mats.gold);
    this.addStairRamp(0, 7.8, 5.0, 4.0, 0, 1.8, 'N', this.mats.brightGold);
    this.addStairRamp(0, -7.8, 5.0, 4.0, 0, 1.8, 'S', this.mats.brightGold);
    this.addStairRamp(7.8, 0, 4.0, 5.0, 0, 1.8, 'W', this.mats.brightGold);
    this.addStairRamp(-7.8, 0, 4.0, 5.0, 0, 1.8, 'E', this.mats.brightGold);

    // COLOSSAL 25-METER BLENDER STATUE OF ODIN ALLFATHER crowning Valhalla Citadel!
    this.placeBlenderStatue('statue_odin', 0, 1.8, 0, 0, 1.05);
  }

  // =========================================================================
  // POI 2: BIFROST OBSERVATORY & RAINBOW BRIDGE (SOUTH [0, 135])
  // =========================================================================
  buildBifrostObservatory() {
    const cx = 0, cz = 135;

    // Widened Elevated Walkable Rainbow Bridge Deck (y = 1.6m) with Approach Ramps & Cover Railings
    this.addWalkableFloor(0, 1.6, 82, 14, 58, 0.6, this.mats.bifrostWater);
    this.addStairRamp(0, 49, 14, 8, 0, 1.6, 'S', this.mats.bifrostWater);
    this.addStairRamp(0, 115, 14, 8, 1.6, 0, 'N', this.mats.bifrostWater);

    for (let z = 62; z <= 102; z += 13) {
      this.addSolidWall(-6.6, 1.6, z, 0.8, 1.35, 4.5, this.mats.gold);
      this.addSolidWall(6.6, 1.6, z, 0.8, 1.35, 4.5, this.mats.gold);
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(7.2, 0.38, 8, 22, Math.PI),
        this.mats.bifrostWater
      );
      arch.position.set(0, 1.6, z);
      this.scene.add(arch);
    }

    // EXPANDED 3-Story Enterable Heimdall Observatory Main Building (26m x 18m)
    this.buildApexCompoundBuilding(cx, cz, 26, 18, this.mats.darkSteel, this.mats.bifrostWater, 3);

    // COLOSSAL BLENDER GUARDIAN STATUE OF HEIMDALL guarding the Rainbow Bridge entrance!
    this.placeBlenderStatue('statue_heimdall', 18, 0, 120, -Math.PI * 0.25, 1.0);

    // Giant Spinning Bifrost Stargate Portal behind the Observatory (Blender GLB!)
    const portalGroup = new THREE.Group();
    portalGroup.position.set(0, 0, 166);
    const outerGate = new THREE.Mesh(new THREE.TorusGeometry(10, 0.9, 10, 32), this.mats.gold);
    outerGate.position.y = 11;
    const innerPortal = new THREE.Mesh(
      new THREE.CircleGeometry(9.2, 32),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.38, side: THREE.DoubleSide })
    );
    innerPortal.position.y = 11;
    portalGroup.add(outerGate, innerPortal);
    this.scene.add(portalGroup);
    if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
      window.ModelFactory.attachBlenderGLB('prop_bifrost_gate', portalGroup, null, outerGate);
    }
    this.animatedProps.push({ mesh: innerPortal, rotZ: 0.9 });
  }

  // =========================================================================
  // POI 3: MJÖLNIR DWARVEN FORGE & FOUNDRY (WEST [-115, 35])
  // =========================================================================
  buildMjolnirForge() {
    const cx = -115, cz = 35;

    const lavaCanal = new THREE.Mesh(new THREE.BoxGeometry(56, 0.1, 9), this.mats.lava);
    lavaCanal.position.set(cx, 0.04, cz);
    this.scene.add(lavaCanal);

    this.addWalkableFloor(cx - 14, 0.8, cz, 6.5, 13, 0.5, this.mats.darkSteel);
    this.addStairRamp(cx - 14, cz - 8.0, 6.5, 3, 0, 0.8, 'S', this.mats.stone);
    this.addStairRamp(cx - 14, cz + 8.0, 6.5, 3, 0, 0.8, 'N', this.mats.stone);

    this.addWalkableFloor(cx + 14, 0.8, cz, 6.5, 13, 0.5, this.mats.darkSteel);
    this.addStairRamp(cx + 14, cz - 8.0, 6.5, 3, 0, 0.8, 'S', this.mats.stone);
    this.addStairRamp(cx + 14, cz + 8.0, 6.5, 3, 0, 0.8, 'N', this.mats.stone);

    // EXPANDED Twin 3-Story Smelting Foundry Halls (26m x 14m)
    this.buildApexCompoundBuilding(cx, cz - 21, 26, 14, this.mats.darkSteel, this.mats.gold, 3);
    this.buildApexCompoundBuilding(cx, cz + 21, 26, 14, this.mats.darkSteel, this.mats.gold, 3);

    // Dual Elevated Overhead Catwalk Skybridges (2nd Floor y=4.6m & 3rd Floor y=9.2m)
    this.addWalkableFloor(cx, 4.6, cz, 5.5, 28, 0.4, this.mats.gold);
    this.addWalkableFloor(cx, 9.2, cz, 4.5, 28, 0.4, this.mats.darkSteel);

    // COLOSSAL BLENDER STATUE OF THOR raising Mjölnir overlooking the Forge!
    this.placeBlenderStatue('statue_thor', cx - 28, 0, cz - 14, Math.PI * 0.45, 1.05);

    const anvilGroup = new THREE.Group();
    anvilGroup.position.set(cx - 26, 0, cz + 4.5);
    this.scene.add(anvilGroup);
    if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
      window.ModelFactory.attachBlenderGLB('prop_forge_anvil', anvilGroup);
    }
    const hammerGroup = new THREE.Group();
    hammerGroup.position.set(cx - 26, 6, cz + 1.5);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 8), this.mats.gold);
    const head = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.5, 3.6), this.mats.darkSteel);
    head.position.set(0, -1.5, 3.2);
    hammerGroup.add(arm, head);
    this.scene.add(hammerGroup);
    this.animatedProps.push({ mesh: hammerGroup, hammerSwing: true });
  }

  // =========================================================================
  // POI 4: YGGDRASIL SANCTUARY & 2-TIER TREEHOUSE BASTION (EAST [115, 30])
  // =========================================================================
  buildYggdrasilSanctuary() {
    const cx = 115, cz = 30;
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.4,
      roughness: 0.4
    });

    const yggGroup = new THREE.Group();
    yggGroup.position.set(cx, 0, cz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 8.2, 34, 14), barkMat);
    trunk.position.set(0, 17, 0);
    yggGroup.add(trunk);
    this.scene.add(yggGroup);
    if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
      window.ModelFactory.attachBlenderGLB('prop_yggdrasil_tree', yggGroup, null, trunk);
    }
    this.colliders.push({
      minX: cx - 5.2, maxX: cx + 5.2,
      minZ: cz - 5.2, maxZ: cz + 5.2,
      minY: 0, maxY: 34,
      isClimbable: false
    });

    // TIER 1 Treehouse Deck (y = 4.6m) + TIER 2 Upper Canopy Deck (y = 9.2m)!
    this.addWalkableFloor(cx, 4.6, cz, 26, 26, 0.5, this.mats.woodGold);
    this.addStairRamp(cx - 16.5, cz, 7, 4.6, 0, 4.6, 'E', this.mats.gold);
    this.addStairRamp(cx + 16.5, cz, 7, 4.6, 0, 4.6, 'W', this.mats.gold);

    this.addWalkableFloor(cx, 9.2, cz, 20, 20, 0.5, this.mats.gold);
    this.addStairRamp(cx, cz - 11.5, 4.6, 7, 4.6, 9.2, 'S', this.mats.brightGold);

    this.addSolidWall(cx, 4.6, cz + 12.7, 18, 1.25, 0.5, this.mats.gold);
    this.addSolidWall(cx, 4.6, cz - 12.7, 18, 1.25, 0.5, this.mats.gold);

    // 2 Expanded 2-Story Sanctuary Shrine Buildings North & South of Yggdrasil
    this.buildApexCompoundBuilding(cx, cz - 28, 22, 12, this.mats.marbleWall, this.mats.gold, 2);
    this.buildApexCompoundBuilding(cx, cz + 28, 22, 12, this.mats.marbleWall, this.mats.gold, 2);
  }

  // =========================================================================
  // POI 5: HELHEIM FORTRESS & CRYPTS (NORTH-WEST [-85, -105])
  // =========================================================================
  buildHelheimCrypts() {
    const cx = -85, cz = -105;

    // EXPANDED 3-Story Obsidian Citadel of Hel (28m x 18m)
    this.buildApexCompoundBuilding(cx, cz, 28, 18, this.mats.obsidian, this.mats.necroGlow, 3);

    // Flanking 2-Story Crypt Towers connected via Elevated Battlement Walkways
    this.buildApexCompoundBuilding(cx - 26, cz + 6, 14, 14, this.mats.obsidian, this.mats.stone, 2);
    this.buildApexCompoundBuilding(cx + 26, cz + 6, 14, 14, this.mats.obsidian, this.mats.stone, 2);

    // COLOSSAL OBSIDIAN BLENDER STATUE OF HELA overlooking Helheim Fortress!
    this.placeBlenderStatue('statue_hela', cx, 0, cz - 22, 0, 1.05);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = cx + Math.cos(a) * 32;
      const pz = cz + Math.sin(a) * 32;
      this.addSolidWall(px, 0, pz, 2.8, 6.5, 2.8, this.mats.obsidian);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.3, 0), this.mats.necroGlow);
      crystal.position.set(px, 7.8, pz);
      this.scene.add(crystal);
      this.animatedProps.push({ mesh: crystal, rotY: 1.5 });
    }
  }

  // =========================================================================
  // POI 6: VALKYRIE SKY DOCKS & AERODROME (NORTH-EAST [90, -100])
  // =========================================================================
  buildValkyrieSkyDocks() {
    const cx = 90, cz = -100;

    // EXPANDED Twin 3-Story Aircraft Hangar Bays (20m x 22m)
    this.buildApexCompoundBuilding(cx - 20, cz, 20, 22, this.mats.darkSteel, this.mats.brightGold, 3);
    this.buildApexCompoundBuilding(cx + 20, cz, 20, 22, this.mats.darkSteel, this.mats.brightGold, 3);

    // Wide Elevated Helipad Flight Deck connecting both Hangars at y = 4.6m + Boarding Ramp
    this.addWalkableFloor(cx, 4.6, cz, 20, 20, 0.5, this.mats.brightGold);
    this.addStairRamp(cx, cz + 15, 9, 10, 0, 4.6, 'N', this.mats.gold);

    // COLOSSAL WINGED BLENDER STATUE OF VALKYRIE crowning the Sky Docks!
    this.placeBlenderStatue('statue_valkyrie', cx, 0, cz - 22, 0, 1.1);

    const skiff = window.ModelFactory.createDropshipModel();
    skiff.scale.set(0.45, 0.45, 0.45);
    skiff.position.set(cx, 5.7, cz);
    this.scene.add(skiff);
  }

  // =========================================================================
  // MID-MAP OUTPOST COMPOUNDS, TREES, BOULDERS & COVER CRATES
  // =========================================================================
  buildMidMapOutpostsAndFoliage() {
    // 4 Enterable Mid-Map Outpost Buildings along the rotation routes between POIs
    const outposts = [
      [-52, 72], [52, 72], [-52, -48], [52, -48]
    ];
    outposts.forEach(([ox, oz]) => {
      this.buildApexCompoundBuilding(ox, oz, 14, 10, this.mats.darkSteel, this.mats.gold, false);
    });

    // Scatter 36 Golden & Emerald Asgardian Trees and Tactical Cover Crates across open areas
    const treeLocations = [
      [-32, 35], [32, 35], [-35, -22], [35, -22], [68, -15], [-68, -15],
      [75, 58], [-75, 58], [28, 95], [-28, 95], [82, -42], [-82, -42],
      [145, 5], [142, 55], [92, 65], [150, -35], [-148, -32], [-145, 68],
      [0, -68], [22, -78], [-22, -78], [45, 118], [-45, 118], [0, -145]
    ];

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    const goldLeafMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
    const greenLeafMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.5 });

    treeLocations.forEach(([tx, tz], i) => {
      const tree = new THREE.Group();
      tree.position.set(tx, 0, tz);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 4.5, 8), trunkMat);
      trunk.position.y = 2.25;
      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(2.8, 6.5, 7),
        i % 2 === 0 ? goldLeafMat : greenLeafMat
      );
      foliage.position.y = 6.2;
      tree.add(trunk, foliage);
      if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
        window.ModelFactory.attachBlenderGLB('prop_asgard_tree', tree, null, [trunk, foliage]);
      }
      this.scene.add(tree);

      this.colliders.push({
        minX: tx - 0.65, maxX: tx + 0.65,
        minZ: tz - 0.65, maxZ: tz + 0.65,
        minY: 0, maxY: 5,
        isClimbable: false
      });

      // Add climbable tactical supply crate cluster next to every other tree
      if (i % 2 === 0) {
        this.addSolidWall(tx + 3.2, 0, tz + 1.5, 2.4, 1.8, 2.4, this.mats.darkSteel, true);
        this.addSolidWall(tx + 4.8, 0, tz + 1.5, 1.6, 1.1, 1.6, this.mats.gold, true);
      }
    });
  }

  buildJumpPads() {
    const padCoords = [
      [0, 38], [0, -38], [-38, 0], [38, 0],
      [-86, 35], [86, 30], [-58, -82], [62, -78]
    ];

    const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    padCoords.forEach(([x, z]) => {
      const group = new THREE.Group();
      group.position.set(x, 0.15, z);

      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.35, 16), this.mats.gold);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.42, 16), glowMat);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 8, 24), glowMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.45;

      group.add(base, inner, ring);
      if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
        window.ModelFactory.attachBlenderGLB('prop_jumppad', group, null, [base, inner]);
      }
      this.scene.add(group);
      this.jumpPads.push({ x, z, radius: 2.6, mesh: group, ring });
    });
  }

  buildZiplinesAndJumpTower() {
    const cableMat = new THREE.LineBasicMaterial({ color: 0xfde047, linewidth: 2 });

    (window.GODWARS_DATA.ZIPLINES || []).forEach(z => {
      const startVec = new THREE.Vector3(...z.start);
      const endVec = new THREE.Vector3(...z.end);

      [startVec, endVec].forEach(pt => {
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, pt.y, 10), this.mats.gold);
        pylon.position.set(pt.x, pt.y / 2, pt.z);
        const topOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        topOrb.position.set(pt.x, pt.y + 0.3, pt.z);
        this.scene.add(pylon, topOrb);
      });

      const lineGeo = new THREE.BufferGeometry().setFromPoints([startVec, endVec]);
      const line = new THREE.Line(lineGeo, cableMat);
      this.scene.add(line);

      this.ziplines.push({
        id: z.id,
        name: z.name,
        start: startVec,
        end: endVec
      });
    });

    // Central Valhalla Vertical Jump Tower (Redeploy Balloon) at (-26, 0)
    const towerX = -26, towerZ = 0;
    const basePole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 52, 12), this.mats.gold);
    basePole.position.set(towerX, 26, towerZ);
    const balloon = new THREE.Mesh(
      new THREE.OctahedronGeometry(4.0, 1),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e })
    );
    balloon.position.set(towerX, 54, towerZ);
    this.scene.add(basePole, balloon);
    this.jumpTower = { x: towerX, z: towerZ, topY: 75, balloon };
  }

  buildArenaChampionBanners() {
    const bannerPositions = [
      { x: 0, y: 13.5, z: 32, ry: 0 },
      { x: 0, y: 13.5, z: -32, ry: Math.PI },
      { x: 32, y: 13.5, z: 0, ry: Math.PI / 2 },
      { x: -32, y: 13.5, z: 0, ry: -Math.PI / 2 }
    ];

    bannerPositions.forEach(bp => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 512;
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 11), mat);
      mesh.position.set(bp.x, bp.y, bp.z);
      mesh.rotation.y = bp.ry;
      this.scene.add(mesh);
      this.championBannerCanvases.push({ canvas, tex });
    });

    this.updateChampionBanners('ODIN_Allfather', 'THOR', 3);
  }

  updateChampionBanners(leaderName, heroName, kills) {
    this.championBannerCanvases.forEach(({ canvas, tex }) => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 256, 512);

      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
      grad.addColorStop(0.5, 'rgba(30, 58, 138, 0.88)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(8, 8, 240, 496);

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, 240, 496);

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👑 KILL LEADER', 128, 56);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 34px sans-serif';
      ctx.fillText(heroName.toUpperCase(), 128, 140);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 21px sans-serif';
      ctx.fillText(leaderName.slice(0, 14), 128, 195);

      ctx.fillStyle = '#f43f5e';
      ctx.font = '900 68px sans-serif';
      ctx.fillText(`${kills}`, 128, 315);

      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('ELIMINATIONS', 128, 355);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('GOD WARS • ASGARD', 128, 455);

      tex.needsUpdate = true;
    });
  }

  // =========================================================================
  // 3D VISIBLE GROUND LOOT PICKUPS, REPLICATORS & SURVEY BEACONS
  // =========================================================================
  buildGroundLootAndReplicators() {
    // 1. Place 24 Visible 3D Ground Loot Pads inside buildings & on 2nd-floor decks!
    const lootSpots = [
      // Valhalla North & South Palace Interiors + 2nd Floor Decks
      [0, 0.1, -20, 'm4a1', 3], [-6, 0.1, -20, 'magnum', 4], [6, 4.6, -20, 'p90', 3],
      [0, 0.1, 20, 'ak47', 3],  [6, 0.1, 20, 'kriss', 3],    [-6, 4.6, 20, 'uzi', 4],
      // Bifrost Observatory Interior & Roof
      [0, 0.1, 135, 'm4a1', 3], [0, 4.6, 135, 'magnum', 4],
      // Mjölnir Forge North & South Foundries + Skybridge
      [-115, 0.1, 16, 'ak47', 3], [-115, 0.1, 54, 'kriss', 3], [-115, 4.6, 35, 'magnum', 4],
      // Yggdrasil Treehouse Deck & Shrines
      [115, 4.7, 30, 'p90', 4], [115, 0.1, 6, 'm4a1', 3], [115, 0.1, 54, 'uzi', 2],
      // Helheim Keep Interior & Roof
      [-85, 0.1, -105, 'kriss', 3], [-85, 4.6, -105, 'ak47', 4],
      // Valkyrie Sky Docks Hangars & Flight Deck
      [74, 0.1, -100, 'p90', 3], [106, 0.1, -100, 'm4a1', 3], [90, 4.6, -100, 'magnum', 4],
      // Mid-map Outposts
      [-52, 0.1, 72, 'uzi', 2], [52, 0.1, 72, 'p90', 2],
      [-52, 0.1, -48, 'kriss', 2], [52, 0.1, -48, 'ak47', 3]
    ];

    const tierColors = { 2: 0x38bdf8, 3: 0xa855f7, 4: 0xfbbf24, 5: 0xf43f5e };

    lootSpots.forEach(([x, y, z, weaponId, shieldTier], idx) => {
      const group = new THREE.Group();
      group.position.set(x, y, z);

      // Glowing Rune Pad on floor
      const pad = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.85, 20),
        new THREE.MeshBasicMaterial({ color: tierColors[shieldTier] || 0x38bdf8, side: THREE.DoubleSide })
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.05;
      group.add(pad);

      // Floating 3D Divine Weapon Mesh
      const wepMesh = window.ModelFactory.createWeaponModel(weaponId, 'thor', false, shieldTier >= 4);
      wepMesh.scale.set(1.35, 1.35, 1.35);
      wepMesh.position.set(0, 0.65, 0);
      group.add(wepMesh);

      // Floating Evo Shield Armor Core beside weapon (Blender GLB!)
      const armorGroup = new THREE.Group();
      armorGroup.position.set(0.65, 0.35, 0);
      const armorCore = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.24, 0),
        new THREE.MeshBasicMaterial({ color: tierColors[shieldTier] || 0x38bdf8 })
      );
      armorCore.position.y = 0.3;
      armorGroup.add(armorCore);
      if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
        window.ModelFactory.attachBlenderGLB('loot_evoshield', armorGroup, null, armorCore);
      }
      group.add(armorGroup);

      this.scene.add(group);
      this.animatedProps.push({ mesh: wepMesh, rotY: 1.4 });

      this.groundLoot.push({
        id: 'ground_' + idx,
        x, y, z,
        pickedUp: false,
        mesh: group,
        loot: {
          weaponId,
          isMythicGold: shieldTier >= 4,
          grenadeId: idx % 2 === 0 ? 'solar_bomb' : 'yggdrasil_arc',
          shieldTier,
          shieldBattery: 2,
          medkit: 1
        }
      });
    });

    // 2. Build 3 Interactive Dwarven Replicator Crafting Terminals
    const repCoords = [
      [18, 0, 0, 'Valhalla Replicator'],
      [-92, 0, 35, 'Mjölnir Forge Replicator'],
      [90, 0, -76, 'Valkyrie Docks Replicator']
    ];
    repCoords.forEach(([rx, ry, rz, name]) => {
      const repGroup = new THREE.Group();
      repGroup.position.set(rx, ry, rz);

      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 1.2, 6), this.mats.darkSteel);
      base.position.y = 0.6;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 2.8, 6), this.mats.gold);
      pillar.position.y = 2.0;
      const holo = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.65, 0),
        new THREE.MeshBasicMaterial({ color: 0x2dd4bf, wireframe: true })
      );
      holo.position.y = 3.6;
      repGroup.add(base, pillar, holo);
      if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
        window.ModelFactory.attachBlenderGLB('prop_replicator', repGroup);
      }
      this.scene.add(repGroup);
      this.animatedProps.push({ mesh: holo, rotY: 2.0 });

      this.replicators.push({ x: rx, y: ry, z: rz, name, used: false, mesh: repGroup });
    });

    // 2b. Build 3 Interactive Apex Green Respawn Beacons (Valhalla Soul Altars)
    const respawnCoords = [
      [0, 0, -48, 'Valhalla North Respawn Beacon'],
      [-74, 0, 35, 'Mjölnir Forge Respawn Beacon'],
      [74, 0, 30, 'Yggdrasil Sanctuary Respawn Beacon']
    ];
    respawnCoords.forEach(([bx, by, bz, name]) => {
      const rGroup = new THREE.Group();
      rGroup.position.set(bx, by, bz);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 1.1, 8), this.mats.darkSteel);
      ped.position.y = 0.55;
      const spire = new THREE.Mesh(new THREE.BoxGeometry(0.65, 3.2, 0.65), this.mats.gold);
      spire.position.y = 2.1;
      const greenBeacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 35, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.35 })
      );
      greenBeacon.position.y = 18;
      rGroup.add(ped, spire, greenBeacon);
      if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
        window.ModelFactory.attachBlenderGLB('prop_respawn_beacon', rGroup, null, [ped, spire]);
      }
      this.scene.add(rGroup);
      this.respawnBeacons.push({ x: bx, y: by, z: bz, name, used: false, mesh: rGroup, beam: greenBeacon });
    });

    // 3. Build 2 Rooftop Recon Survey Beacons (Valhalla 3rd-Story Roof & Bifrost Observatory 3rd-Story Roof)
    const beaconCoords = [
      [0, 13.8, -24, 'Valhalla 3F Roof Survey Beacon'],
      [0, 13.8, 135, 'Bifrost Observatory 3F Survey Beacon']
    ];
    beaconCoords.forEach(([bx, by, bz, name]) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(bx, by, bz);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.6, 8), this.mats.gold);
      stand.position.y = 0.8;
      const dish = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.6, 12), this.mats.bifrostWater);
      dish.position.y = 1.8;
      dish.rotation.x = Math.PI / 3;
      bGroup.add(stand, dish);
      if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
        window.ModelFactory.attachBlenderGLB('prop_survey_beacon', bGroup, null, [stand, dish]);
      }
      this.scene.add(bGroup);
      this.animatedProps.push({ mesh: dish, rotY: 1.6 });

      this.surveyBeacons.push({ x: bx, y: by, z: bz, name, mesh: bGroup });
    });
  }

  spawnCarePackage(x, z) {
    const podMesh = window.ModelFactory.createCarePackageModel();
    podMesh.position.set(x, 125, z);
    this.scene.add(podMesh);

    const weaponKeys = Object.keys(window.GODWARS_DATA.WEAPONS);
    const mythicWep = weaponKeys[Math.floor(Math.random() * weaponKeys.length)];

    const pkg = {
      id: 'carepkg_' + Date.now(),
      x,
      z,
      y: 125,
      targetY: this.getGroundHeight(x, z, 20),
      landed: false,
      opened: false,
      isCarePackage: true,
      mesh: podMesh,
      loot: {
        weaponId: mythicWep,
        isMythicGold: true,
        grenadeId: 'solar_bomb',
        shieldTier: 5,
        shieldBattery: 3,
        phoenixKit: 1
      }
    };
    this.carePackages.push(pkg);
    this.supplyBins.push(pkg);
    return pkg;
  }

  buildSupplyBins() {
    const binLocations = [
      [15, 10], [-15, 10], [15, -10], [-15, -10], [25, 0], [-20, 4],
      [14, 128], [-14, 128], [0, 150], [16, 140],
      [-100, 28], [-130, 28], [-115, 56], [-115, 8],
      [98, 24], [132, 24], [115, 48], [115, 12],
      [-70, -98], [-100, -98], [-85, -120], [-85, -88],
      [74, -86], [106, -86], [90, -116], [90, -80],
      [-45, 72], [45, 72]
    ];

    const weaponKeys = Object.keys(window.GODWARS_DATA.WEAPONS);
    const grenadeKeys = Object.keys(window.GODWARS_DATA.GRENADES);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    binLocations.forEach(([x, z], i) => {
      const binGroup = new THREE.Group();
      binGroup.position.set(x, 0, z);

      const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.4), this.mats.darkSteel);
      box.position.y = 0.55;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.35, 1.46), this.mats.gold);
      lid.position.set(0, 1.2, 0);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 1.5), glowMat.clone());
      strip.position.set(0, 0.85, 0);
      binGroup.add(box, lid, strip);
      if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
        window.ModelFactory.attachBlenderGLB('prop_supplybin', binGroup, null, [box, strip]);
      }

      this.scene.add(binGroup);

      const weaponId = weaponKeys[i % weaponKeys.length];
      const grenadeId = grenadeKeys[i % grenadeKeys.length];
      const shieldTier = (i % 5 === 0) ? 4 : (i % 3 === 0) ? 3 : 2;

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

  updateRingVisual(centerX, centerZ, radius, time, dt = 0.016) {
    if (!this.ringMesh) return;
    this.ringMesh.position.x = centerX;
    this.ringMesh.position.z = centerZ;
    this.ringMesh.scale.set(Math.max(1, radius), 1, Math.max(1, radius));
    this.ringMesh.material.opacity = 0.2 + Math.sin(time * 3.5) * 0.05;

    this.jumpPads.forEach(p => {
      p.ring.position.y = 0.4 + Math.sin(time * 4) * 0.12;
    });

    if (this.jumpTower && this.jumpTower.balloon) {
      this.jumpTower.balloon.position.y = 54 + Math.sin(time * 2.5) * 1.1;
      this.jumpTower.balloon.rotation.y += dt * 0.8;
    }

    // Animate 3D map props (Bifrost Stargate, Dwarven Forge Hammer, Floating Weapons, Crystals)
    this.animatedProps.forEach(p => {
      if (!p.mesh) return;
      if (p.rotY) p.mesh.rotation.y += p.rotY * dt;
      if (p.rotZ) p.mesh.rotation.z += p.rotZ * dt;
      if (p.hammerSwing) {
        p.mesh.rotation.x = Math.sin(time * 3.2) * 0.55;
      }
    });

    this.carePackages.forEach(pkg => {
      if (!pkg.landed) {
        pkg.y -= 28 * dt;
        if (pkg.y <= pkg.targetY) {
          pkg.y = pkg.targetY;
          pkg.landed = true;
          window.SFX.playExplosion(false);
        }
        pkg.mesh.position.y = pkg.y;
      } else if (pkg.opened && pkg.mesh.userData.beam) {
        pkg.mesh.userData.beam.visible = false;
      }
    });
  }

  // =========================================================================
  // MULTI-STORY GROUND HEIGHT, RAMP INTERPOLATION & LEDGE MANTLE DETECTION
  // =========================================================================
  getGroundHeight(x, z, currentY = 0) {
    let groundY = 0;

    // 1. Check Sloped Ramps & Staircases first (smoothly interpolates height!)
    for (const r of this.ramps) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
        let t = 0;
        if (r.dir === 'N') {
          t = (r.maxZ - z) / Math.max(0.01, r.maxZ - r.minZ);
        } else if (r.dir === 'S') {
          t = (z - r.minZ) / Math.max(0.01, r.maxZ - r.minZ);
        } else if (r.dir === 'E') {
          t = (x - r.minX) / Math.max(0.01, r.maxX - r.minX);
        } else if (r.dir === 'W') {
          t = (r.maxX - x) / Math.max(0.01, r.maxX - r.minX);
        }
        t = Math.max(0, Math.min(1, t));
        const rampY = r.lowY + t * (r.highY - r.lowY);
        if (currentY >= rampY - 1.65) {
          groundY = Math.max(groundY, rampY);
        }
      }
    }

    // 2. Check Walkable Multi-Story Floor / Roof Slabs
    for (const s of this.walkableSurfaces) {
      if (x >= s.minX - 0.3 && x <= s.maxX + 0.3 && z >= s.minZ - 0.3 && z <= s.maxZ + 0.3) {
        // Only snap onto a surface if the player's feet are above or within step-up tolerance (1.25m) of it!
        // This allows walking on the ground floor (y=0) right underneath a 2nd-floor ceiling (y=4.5)!
        if (currentY >= s.y - 1.25) {
          groundY = Math.max(groundY, s.y);
        }
      }
    }

    return groundY;
  }

  /**
   * Checks if there is a climbable ledge directly in front of the player (for Apex Ledge Mantling!)
   */
  findClimbableLedge(x, y, z, forwardDir) {
    const probeX = x + forwardDir.x * 0.85;
    const probeZ = z + forwardDir.z * 0.85;

    for (const s of this.walkableSurfaces) {
      if (probeX >= s.minX && probeX <= s.maxX && probeZ >= s.minZ && probeZ <= s.maxZ) {
        const heightDiff = s.y - y;
        // Player can mantle ledges between 1.0m and 4.6m above current feet position!
        if (heightDiff >= 0.9 && heightDiff <= 4.65) {
          return s.y;
        }
      }
    }
    return null;
  }

  resolveHorizontalCollision(x, z, y, radius = 0.48) {
    let nx = x;
    let nz = z;
    const playerHeadY = y + 1.65;

    for (const c of this.colliders) {
      if (c.isDoor && !c.active) continue;

      // Vertical overlap check: allows walking inside 1st floor underneath 2nd floor slabs,
      // and walking on top of roofs/crates without colliding horizontally!
      if (y >= c.maxY - 0.55 || playerHeadY <= c.minY + 0.15) continue;

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
