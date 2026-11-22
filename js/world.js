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
    this.cargoBots = [];        // Hovering Color-Cycling Apex Cargo Bots (Loot Drones!)
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
    this.buildEuphoriaInstancedNature();
    this.buildJumpPads();
    this.buildZiplinesAndJumpTower();
    this.buildArenaChampionBanners();
    this.buildSupplyBins();
    this.buildGroundLootAndReplicators();
    this.buildCargoBots();
    this.buildStormRing();
  }

  initMaterials() {
    const goldRuneTex = window.ModelFactory.getRuneTexture('#fbbf24', '#1e293b');
    goldRuneTex.repeat.set(2, 2);
    const cyanRuneTex = window.ModelFactory.getRuneTexture('#38bdf8', '#0f172a');
    cyanRuneTex.repeat.set(2, 2);

    // Euphoria-Inspired High-Resolution Painted Procedural Textures & FBM Detail Bump Maps
    const detailTex = window.ModelFactory.getDetailTexture();
    const marbleWallTex = window.ModelFactory.getSurfaceTexture('marble_wall', 3, 2);
    const marbleFloorTex = window.ModelFactory.getSurfaceTexture('marble_floor', 5, 5);
    const stoneTex = window.ModelFactory.getSurfaceTexture('asgard_stone', 4, 3);
    const woodGoldTex = window.ModelFactory.getSurfaceTexture('wood_gold', 3, 3);
    const grassTex = window.ModelFactory.getSurfaceTexture('lush_grass', 18, 18);
    const lavaTex = window.ModelFactory.getSurfaceTexture('molten_lava', 6, 6);

    this.mats = {
      gold: new THREE.MeshStandardMaterial({ color: 0xc8892a, metalness: 0.8, roughness: 0.34 }),
      brightGold: new THREE.MeshStandardMaterial({ color: 0xe0b24a, metalness: 0.88, roughness: 0.26 }),
      marbleWall: new THREE.MeshStandardMaterial({ color: 0xd8d0c2, map: marbleWallTex, roughness: 0.62, metalness: 0.04 }),
      marbleFloor: new THREE.MeshStandardMaterial({ color: 0xb0a898, map: marbleFloorTex, roughness: 0.55, metalness: 0.06 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x334155, map: goldRuneTex, metalness: 0.72, roughness: 0.32 }),
      obsidian: new THREE.MeshStandardMaterial({ color: 0x1e293b, map: cyanRuneTex, metalness: 0.76, roughness: 0.26 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xd0ccc4, map: stoneTex, roughness: 0.68, metalness: 0.12 }),
      woodGold: new THREE.MeshStandardMaterial({ color: 0xd97706, map: woodGoldTex, roughness: 0.58, metalness: 0.25 }),
      grass: new THREE.MeshStandardMaterial({ color: 0x4ade80, map: grassTex, roughness: 0.78, metalness: 0.05 }),
      lava: new THREE.MeshBasicMaterial({ color: 0xffedd5, map: lavaTex }),
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
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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
    mesh.castShadow = topY > 1.0;
    mesh.receiveShadow = true;
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
    group.userData.staticBatch = true;
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

    // Ornate Asgardian Corner Fluted Columns & Gilded Door Pediments (Euphoria Architectural Detail!)
    const totalH = floorCount * fh;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.54, totalH + 0.6, 10), trimMat);
      col.position.set(cx + sx * (width / 2 + 0.15), (totalH + 0.6) / 2, cz + sz * (depth / 2 + 0.15));
      this.scene.add(col);
    });
    for (let dSide of [-1, 1]) {
      const pediment = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.4, 0.48, 0.95), this.mats.brightGold);
      pediment.position.set(cx, 3.45, cz + dSide * (depth / 2 + 0.1));
      this.scene.add(pediment);
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
    this.scene.background = new THREE.Color(0x185ac2);
    this.scene.fog = new THREE.Fog(0xc9d8e6, 70, 440);

    // Euphoria Adventure Multi-Stop Celestial Sky Dome Shader (Sun Disc, Golden Corona & 2-Octave FBM Clouds!)
    this.skyUniforms = {
      zenith:  { value: new THREE.Color(0x1447a6) },
      midSky:  { value: new THREE.Color(0x4ea8f5) },
      horizon: { value: new THREE.Color(0xfde68a) },
      sunDir:  { value: new THREE.Vector3(0.52, 0.62, 0.45).normalize() },
      sunCol:  { value: new THREE.Color(0xfff4c8) },
      time:    { value: 0 },
      cloudTex:{ value: window.ModelFactory.getDetailTexture() }
    };
    const skyGeo = new THREE.SphereGeometry(600, 32, 18);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 zenith;
        uniform vec3 midSky;
        uniform vec3 horizon;
        uniform vec3 sunDir;
        uniform vec3 sunCol;
        uniform float time;
        uniform sampler2D cloudTex;
        varying vec3 vDir;
        void main() {
          float y = max(vDir.y, 0.0);
          vec3 c = mix(horizon, midSky, pow(y, 0.45));
          c = mix(c, zenith, pow(y, 1.55));

          vec3 sDir = normalize(sunDir);
          float sd = max(dot(normalize(vDir), sDir), 0.0);
          float sunDisc = smoothstep(0.9988, 0.9997, sd) * 3.8;
          float sunCorona = pow(sd, 36.0) * 0.58 + pow(sd, 9.0) * 0.22;
          c += sunCol * (sunDisc + sunCorona);

          if (vDir.y > 0.01) {
            vec2 cuv = vDir.xz / (vDir.y + 0.14);
            float cn = texture2D(cloudTex, cuv * 0.09 + vec2(time * 0.003, time * 0.001)).g * 0.62
                     + texture2D(cloudTex, cuv * 0.25 + vec2(time * 0.005, -time * 0.002)).g * 0.38;
            float cov = smoothstep(0.48, 0.74, cn) * smoothstep(0.02, 0.22, vDir.y);
            float clit = pow(max(dot(normalize(vDir), sDir), 0.0), 3.0);
            vec3 ccol = mix(mix(horizon, vec3(1.0), 0.72), sunCol * 1.12, clit * 0.55);
            c = mix(c, ccol, cov * 0.82);
          } else {
            c = mix(horizon, horizon * 0.68, min(-vDir.y * 3.5, 1.0));
          }
          gl_FragColor = vec4(c, 1.0);
        }
      `
    });
    // Sky dome rides with the camera so it never crosses the 650m far plane
    // (previously the far side got clipped and the flat blue background showed as a giant "dome").
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -1000;
    const camPos = new THREE.Vector3();
    skyMesh.onBeforeRender = (renderer, scene, camera) => {
      camPos.setFromMatrixPosition(camera.matrixWorld);
      skyMesh.position.copy(camPos);
      skyMesh.updateMatrixWorld(true);
    };
    this.scene.add(skyMesh);
    this.skyMesh = skyMesh;

    // Euphoria Adventure High-Contrast Anime/Fantasy Lighting + Tight Follow-Player Sun Shadow Map (P0-3)!
    const hemiLight = new THREE.HemisphereLight(0xb8d2f5, 0x5a4a38, 0.42);
    hemiLight.position.set(0, 180, 0);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffe2b8, 1.55);
    sunLight.position.set(60, 95, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    const sc = sunLight.shadow.camera;
    sc.left = -46;
    sc.right = 46;
    sc.top = 46;
    sc.bottom = -46;
    sc.near = 10;
    sc.far = 210;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);
    this.scene.add(sunLight.target);
    this.sunLight = sunLight;

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
      const pl = new THREE.PointLight(color, intensity * 0.55, dist, 2);
      pl.position.set(lx, ly, lz);
      this.scene.add(pl);
    });

    // (Removed: dodecahedron 'balloon' clouds, daytime star points and a 320m sky torus —
    //  the sky shader already paints FBM clouds, and those meshes read as clutter from the ground.)

    // Floating Asgard Mountains & Golden Waterfalls around Island Perimeter
    const isleRockMat = new THREE.MeshStandardMaterial({ color: 0x5b5148, roughness: 0.92, metalness: 0.0, flatShading: true });
    const isleGrassMat = new THREE.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 0.95, metalness: 0.0, flatShading: true });
    const islePineMat = new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 0.9, metalness: 0.0, flatShading: true });
    const fallMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      // Distant floating sky-islands: jagged rock underside + grassy cap + a few pines.
      const isle = new THREE.Group();
      const R = 16 + (i % 3) * 7;
      const rockGeo = new THREE.ConeGeometry(R, R * 2.6, 9, 5);
      const rp = rockGeo.attributes.position;
      for (let k = 0; k < rp.count; k++) {
        const y = rp.getY(k);
        if (y > R * 1.29) continue; // keep the top rim flat
        const j = 1 + Math.sin(k * 12.9898 + i * 4.1) * 0.18;
        rp.setX(k, rp.getX(k) * j); rp.setZ(k, rp.getZ(k) * j);
      }
      rockGeo.computeVertexNormals();
      const rock = new THREE.Mesh(rockGeo, isleRockMat);
      rock.rotation.x = Math.PI;
      rock.position.y = -R * 1.3;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.02, 2.2, 9), isleGrassMat);
      isle.add(rock, cap);
      for (let t = 0; t < 4; t++) {
        const ta = t * 1.7 + i;
        const pine = new THREE.Mesh(new THREE.ConeGeometry(2.4, 9, 6), islePineMat);
        pine.position.set(Math.cos(ta) * R * 0.5, 5.4, Math.sin(ta) * R * 0.5);
        isle.add(pine);
      }
      isle.position.set(Math.cos(a) * 330, 18 + (i % 3) * 16, Math.sin(a) * 330);
      isle.rotation.y = i * 0.9;
      this.scene.add(isle);

      const wx = Math.cos(a + 0.3) * (this.islandRadius - 1);
      const wz = Math.sin(a + 0.3) * (this.islandRadius - 1);
      const waterfall = new THREE.Mesh(new THREE.BoxGeometry(9, 48, 1.2), fallMat);
      waterfall.position.set(wx, -24, wz);
      waterfall.rotation.y = -a;
      this.scene.add(waterfall);
    }
  }

  // P0-2 FIXED: Real Sculpted 3D FBM Rolling Terrain Height Function (Euphoria-Style FLATS at POIs & Roads!)
  terrainHeightAt(x, z) {
    const rDist = Math.hypot(x, z);
    if (rDist > this.islandRadius - 6) return 0;

    // Smoothly flatten to y = 0 inside all 6 POI compounds & along the 5 main highways so buildings sit flush!
    let flatMask = 1.0;
    for (const poi of window.GODWARS_DATA.POIS) {
      const d = Math.hypot(x - poi.x, z - poi.z);
      const flatR = poi.id === 'valhalla' ? 56 : 46;
      if (d < flatR) return 0;
      if (d < flatR + 22) {
        flatMask = Math.min(flatMask, (d - flatR) / 22);
      }
      // Keep main roads to each POI smoothly graded at y = 0
      if (poi.id !== 'valhalla') {
        const len = Math.hypot(poi.x, poi.z);
        const ux = poi.x / len, uz = poi.z / len;
        const proj = x * ux + z * uz;
        if (proj > 0 && proj < len) {
          const perp = Math.abs(x * (-uz) + z * ux);
          if (perp < 8.5) return 0;
          if (perp < 16.5) flatMask = Math.min(flatMask, (perp - 8.5) / 8.0);
        }
      }
    }

    // Organic Multi-Octave Rolling Asgardian Hills & Valleys (0m to +6.5m)
    const h1 = Math.sin(x * 0.022 + 0.5) * Math.cos(z * 0.024 - 0.3) * 3.4;
    const h2 = Math.sin(x * 0.048 - z * 0.036) * 1.65;
    const h3 = Math.cos(x * 0.015 + z * 0.019) * 1.8;
    const rawH = Math.max(0, 2.2 + h1 + h2 + h3);
    const edgeFade = Math.max(0, Math.min(1, (this.islandRadius - 8 - rDist) / 22));
    return rawH * flatMask * edgeFade;
  }

  buildBiomesRoadsAndRivers() {
    const stoneCliffTex = window.ModelFactory.getSurfaceTexture('asgard_stone', 18, 4);
    const lushGrassTex = window.ModelFactory.getSurfaceTexture('lush_grass', 28, 28);
    const detailTex = window.ModelFactory.getDetailTexture();

    // 1. Floating Asgard Island Cliff Skirt (Rich Chiseled Cliff Masonry)
    const islandGeo = new THREE.CylinderGeometry(this.islandRadius, this.islandRadius * 0.74, 28, 64);
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      map: stoneCliffTex,
      roughness: 0.78,
      metalness: 0.14
    });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.set(0, -14.25, 0);
    this.scene.add(island);

    // 2. P0-2 FIXED: Single Sculpted 3D Multi-Biome Terrain Mesh (ZERO overlapping Z-fighting discs!)
    const terrainSize = this.islandRadius * 1.98;
    const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, 84, 84);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    const cols = new Float32Array(posAttr.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const rDist = Math.hypot(vx, vz);
      let vy = 0;
      if (rDist > this.islandRadius - 2.2) {
        vy = -5.5;
      } else {
        vy = this.terrainHeightAt(vx, vz);
      }
      posAttr.setY(i, vy);

      // Euphoria Multi-Biome Vertex Paint + Elevation Cliff Tint
      col.setRGB(0.40, 0.56, 0.27); // Sunlit Meadow Green (sRGB)
      // Large-scale macro variation: dry-grass patches and worn dirt so the meadow never reads flat.
      const n1 = Math.sin(vx * 0.031 + Math.sin(vz * 0.023) * 2.1) * Math.cos(vz * 0.027 - Math.sin(vx * 0.019) * 1.7);
      const n2 = Math.sin(vx * 0.083 + vz * 0.061) * Math.sin(vz * 0.097 - vx * 0.043);
      if (n1 > 0.15) col.lerp(new THREE.Color(0x9a9a52), Math.min(0.55, (n1 - 0.15) * 1.1));
      if (n2 > 0.55) col.lerp(new THREE.Color(0x7d6b4e), Math.min(0.45, (n2 - 0.55) * 1.6));
      if (n1 < -0.4) col.lerp(new THREE.Color(0x3f6b2c), Math.min(0.5, (-n1 - 0.4) * 1.2));
      if (vy > 3.2) {
        col.lerp(new THREE.Color(0x64748b), Math.min(0.65, (vy - 3.2) / 4.0)); // Rocky Highland Peaks
      }
      const dValhalla = Math.hypot(vx, vz);
      if (dValhalla < 58) {
        col.lerp(new THREE.Color(0xb89a6a), Math.max(0, 1 - dValhalla / 58) * 0.78); // Golden Citadel Sandstone
      }
      const dForge = Math.hypot(vx + 115, vz - 35);
      if (dForge < 62) {
        col.lerp(new THREE.Color(0x292524), Math.max(0, 1 - dForge / 62) * 0.88); // Volcanic Basalt
      }
      const dBifrost = Math.hypot(vx, vz - 135);
      if (dBifrost < 54) {
        col.lerp(new THREE.Color(0x38bdf8), Math.max(0, 1 - dBifrost / 54) * 0.68); // Crystalline Bifrost
      }
      const dHelheim = Math.hypot(vx + 85, vz + 105);
      if (dHelheim < 56) {
        col.lerp(new THREE.Color(0x0f766e), Math.max(0, 1 - dHelheim / 56) * 0.82); // Helheim Obsidian-Teal
      }
      col.convertSRGBToLinear(); // r128 treats vertex colors as linear; author in sRGB
      cols[i * 3] = col.r;
      cols[i * 3 + 1] = col.g;
      cols[i * 3 + 2] = col.b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: lushGrassTex,
      roughness: 0.80,
      metalness: 0.05
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    this.scene.add(terrainMesh);

    // Outer Golden Island Rim Wall
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(this.islandRadius - 1.5, 2.2, 10, 64),
      this.mats.gold
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.3, 0);
    this.scene.add(rim);

    // Paved Golden Asgardian Highways connecting Valhalla Citadel to all 6 POIs (Raised cleanly to y = 0.08!)
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x334155, map: window.ModelFactory.getSurfaceTexture('marble_floor', 2, 14), roughness: 0.52, metalness: 0.22 });
    window.GODWARS_DATA.POIS.forEach(poi => {
      if (poi.id === 'valhalla') return;
      const len = Math.hypot(poi.x, poi.z);
      const angle = Math.atan2(poi.x, poi.z);
      const road = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.14, len), roadMat);
      road.position.set(poi.x / 2, 0.04, poi.z / 2);
      road.rotation.y = angle;
      road.receiveShadow = true;
      this.scene.add(road);

      // Golden Road Edge Borders
      const borderL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, len), this.mats.gold);
      borderL.position.set(poi.x / 2 + Math.cos(angle) * 3.8, 0.06, poi.z / 2 - Math.sin(angle) * 3.8);
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
    this.buildValhallaShowcaseArchitecture();
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
      if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
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

  buildCargoBots() {
    // 4 Hovering Color-Cycling Apex Cargo Bots (Loot Drones) flying around Asgard POIs!
    // Shoot them when they glow GOLD for instant Mythic Gold Weapons & Lv5 Red Evo Shield!
    const botRoutes = [
      { cx: 0, cz: 0, radius: 36, height: 18 },
      { cx: 0, cz: 115, radius: 24, height: 16 },
      { cx: -115, cz: 35, radius: 28, height: 17 },
      { cx: 115, cz: 30, radius: 28, height: 18 }
    ];

    botRoutes.forEach((r, idx) => {
      const group = new THREE.Group();
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), sphereMat);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.55, 0.1, 8, 20),
        this.mats.gold
      );
      ring.rotation.x = Math.PI / 2;
      group.add(ball, ring);
      group.position.set(r.cx + r.radius, r.height, r.cz);
      this.scene.add(group);

      this.cargoBots.push({
        id: idx,
        alive: true,
        cx: r.cx,
        cz: r.cz,
        radius: r.radius,
        height: r.height,
        angle: idx * 1.5,
        colorPhase: idx * 1.1,
        currentTier: 2, // 2=Blue, 3=Purple, 4=Gold Mythic
        mesh: group,
        ballMat: sphereMat,
        position: group.position
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

    // Update Hovering Color-Cycling Apex Cargo Bots (Blue -> Purple -> Gold!)
    const tierHex = { 2: 0x38bdf8, 3: 0xa855f7, 4: 0xfbbf24 };
    this.cargoBots.forEach(cb => {
      if (!cb.alive) return;
      cb.angle += dt * 0.45;
      cb.colorPhase += dt * 0.9;
      const tiers = [2, 3, 4];
      cb.currentTier = tiers[Math.floor(cb.colorPhase) % 3];
      cb.ballMat.color.setHex(tierHex[cb.currentTier]);

      cb.mesh.position.set(
        cb.cx + Math.cos(cb.angle) * cb.radius,
        cb.height + Math.sin(time * 2.5 + cb.id) * 1.2,
        cb.cz + Math.sin(cb.angle) * cb.radius
      );
      cb.mesh.rotation.y += dt * 2.0;
    });

    if (this.skyUniforms && this.skyUniforms.time) {
      this.skyUniforms.time.value = time;
    }

    // BATCH 3: Animated Flowing Molten Lava & Rising Brazier Fire Embers!
    if (this.mats && this.mats.lava && this.mats.lava.map) {
      this.mats.lava.map.offset.y = (time * 0.22) % 1;
    }
    if (this.sunMotes) {
      this.sunMotes.rotation.y = time * 0.015;
      this.sunMotes.position.y = Math.sin(time * 0.6) * 0.8;
    }
    if (this.brazierEmbers) {
      const pos = this.brazierEmbers.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * (2.2 + (i % 3) * 0.8);
        if (y > 6.5) y = 1.4;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    // P0-3: Follow Player with Tight Directional Sun Shadow Camera for Crisp Shadows Everywhere!
    if (this.sunLight && arguments[2]) {
      const pPos = arguments[2];
      this.sunLight.position.set(pPos.x + 55, pPos.y + 92, pPos.z + 48);
      this.sunLight.target.position.set(pPos.x, pPos.y, pPos.z);
      this.sunLight.target.updateMatrixWorld();
    }
  }

  // Helper: Prevents Grass, Boulders, or Trees from EVER spawning inside Buildings, Plazas, or Roads!
  isBlockedForNature(x, z, margin = 2.0) {
    if (Math.hypot(x, z) < 54) return true; // Keep Valhalla Citadel marble plaza clean
    for (const poi of window.GODWARS_DATA.POIS) {
      if (poi.id !== 'valhalla') {
        const len = Math.hypot(poi.x, poi.z);
        const ux = poi.x / len, uz = poi.z / len;
        const proj = x * ux + z * uz;
        if (proj > 0 && proj < len) {
          const perp = Math.abs(x * (-uz) + z * ux);
          if (perp < 6.5 + margin) return true; // Keep paved highways clean
        }
      }
    }
    for (const s of this.walkableSurfaces) {
      if (x >= s.minX - margin && x <= s.maxX + margin && z >= s.minZ - margin && z <= s.maxZ + margin) {
        return true; // Never spawn inside or under building floors!
      }
    }
    return false;
  }

  // =========================================================================
  // P0-2 FIXED: EUPHORIA PAINTED ALPHA-CUTOUT GRASS, LEAF CANOPIES & BOULDERS
  // - ZERO pyramid cones! Uses crossed painted grass blade & leaf cards!
  // - ZERO overlap with buildings, interiors, or roads!
  // =========================================================================
  buildEuphoriaInstancedNature() {
    const dummy = new THREE.Object3D();
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // 1. 900 Crossed Painted Alpha-Cutout Grass Blade Tufts (2 Crossed Planes per Tuft -> 2 Draw Calls!)
    const grassTex = window.ModelFactory.getFoliageTexture('grass_blades');
    const grassMat = new THREE.MeshLambertMaterial({
      map: grassTex,
      alphaTest: 0.42,
      side: THREE.DoubleSide
    });
    const grassGeoA = new THREE.PlaneGeometry(1.5, 1.05);
    grassGeoA.translate(0, 0.5, 0);
    const grassGeoB = grassGeoA.clone();
    grassGeoB.rotateY(Math.PI / 2);

    const grassCount = 750;
    const grassInstA = new THREE.InstancedMesh(grassGeoA, grassMat, grassCount);
    const grassInstB = new THREE.InstancedMesh(grassGeoB, grassMat, grassCount);
    let gIdx = 0;
    for (let i = 0; i < grassCount * 3 && gIdx < grassCount; i++) {
      const a = rand() * Math.PI * 2;
      const r = 38 + Math.sqrt(rand()) * (this.islandRadius - 46);
      const gx = Math.cos(a) * r;
      const gz = Math.sin(a) * r;
      if (this.isBlockedForNature(gx, gz, 1.5)) continue;
      // Skip volcanic lava core
      if (Math.hypot(gx + 115, gz - 35) < 42) continue;
      const gy = this.terrainHeightAt(gx, gz);

      dummy.position.set(gx, gy, gz);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      const s = 0.75 + rand() * 0.7;
      dummy.scale.set(s, s * (0.8 + rand() * 0.5), s);
      dummy.updateMatrix();
      grassInstA.setMatrixAt(gIdx, dummy.matrix);
      grassInstB.setMatrixAt(gIdx, dummy.matrix);
      gIdx++;
    }
    grassInstA.count = gIdx;
    grassInstB.count = gIdx;
    grassInstA.instanceMatrix.needsUpdate = true;
    grassInstB.instanceMatrix.needsUpdate = true;
    this.scene.add(grassInstA, grassInstB);

    // 2. 110 Sculpted Geological Cliff Boulders (Never inside buildings or roads!)
    const rockCount = 110;
    const rockGeo = new THREE.DodecahedronGeometry(1.45, 1);
    rockGeo.translate(0, 0.65, 0);
    const rockInst = new THREE.InstancedMesh(rockGeo, this.mats.stone, rockCount);
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;
    let rIdx = 0;
    for (let i = 0; i < rockCount * 3 && rIdx < rockCount; i++) {
      const a = rand() * Math.PI * 2;
      const r = 46 + Math.sqrt(rand()) * (this.islandRadius - 54);
      const rx = Math.cos(a) * r;
      const rz = Math.sin(a) * r;
      if (this.isBlockedForNature(rx, rz, 3.5)) continue;
      const ry = this.terrainHeightAt(rx, rz);

      dummy.position.set(rx, ry, rz);
      dummy.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
      dummy.scale.set(0.8 + rand() * 1.5, 0.6 + rand() * 1.1, 0.8 + rand() * 1.5);
      dummy.updateMatrix();
      rockInst.setMatrixAt(rIdx, dummy.matrix);
      rIdx++;
    }
    rockInst.count = rIdx;
    rockInst.instanceMatrix.needsUpdate = true;
    this.scene.add(rockInst);

    // 3. 65 Layered Painted-Leaf Asgard Trees (Crossed Alpha-Cutout Leaf Canopies + Textured Trunks!)
    const leafTex = window.ModelFactory.getFoliageTexture('leaf_cluster');
    const leafMat = new THREE.MeshLambertMaterial({
      map: leafTex,
      alphaTest: 0.4,
      side: THREE.DoubleSide
    });
    const treeCount = 65;
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.52, 4.4, 7);
    trunkGeo.translate(0, 2.2, 0);
    const leafGeoA = new THREE.PlaneGeometry(5.6, 5.2);
    leafGeoA.translate(0, 5.2, 0);
    const leafGeoB = leafGeoA.clone();
    leafGeoB.rotateY(Math.PI / 2);

    const trunkInst = new THREE.InstancedMesh(trunkGeo, this.mats.woodGold, treeCount);
    const leafInstA = new THREE.InstancedMesh(leafGeoA, leafMat, treeCount);
    const leafInstB = new THREE.InstancedMesh(leafGeoB, leafMat, treeCount);
    trunkInst.castShadow = true;
    leafInstA.castShadow = true;

    let tIdx = 0;
    for (let i = 0; i < treeCount * 3 && tIdx < treeCount; i++) {
      const a = rand() * Math.PI * 2;
      const r = 52 + Math.sqrt(rand()) * (this.islandRadius - 60);
      const tx = Math.cos(a) * r;
      const tz = Math.sin(a) * r;
      if (this.isBlockedForNature(tx, tz, 5.0)) continue;
      const nearPoi = window.GODWARS_DATA.POIS.some(p => Math.hypot(tx - p.x, tz - p.z) < 34);
      if (nearPoi) continue;
      const ty = this.terrainHeightAt(tx, tz);

      dummy.position.set(tx, ty, tz);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      const ts = 0.85 + rand() * 0.7;
      dummy.scale.set(ts, ts * (0.9 + rand() * 0.35), ts);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(tIdx, dummy.matrix);
      leafInstA.setMatrixAt(tIdx, dummy.matrix);
      leafInstB.setMatrixAt(tIdx, dummy.matrix);
      tIdx++;
    }
    trunkInst.count = tIdx;
    leafInstA.count = tIdx;
    leafInstB.count = tIdx;
    trunkInst.instanceMatrix.needsUpdate = true;
    leafInstA.instanceMatrix.needsUpdate = true;
    leafInstB.instanceMatrix.needsUpdate = true;
    this.scene.add(trunkInst, leafInstA, leafInstB);
  }

  // =========================================================================
  // MULTI-STORY GROUND HEIGHT, RAMP INTERPOLATION & LEDGE MANTLE DETECTION
  // =========================================================================
  getGroundHeight(x, z, currentY = 0) {
    let groundY = this.terrainHeightAt ? this.terrainHeightAt(x, z) : 0;

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

  // =========================================================================
  // AAA SHOWCASE ARENA: SCULPTED EUPHORIA ASGARD & CITADEL GLB ARCHITECTURE
  // Places 12 high-detail sculpted Blender GLBs into Valhalla Citadel!
  // =========================================================================
  buildValhallaShowcaseArchitecture() {
    const placeSculpted = (name, x, y, z, scale = 1.0, rotY = 0) => {
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.rotation.y = rotY;
      grp.scale.setScalar(scale);
      this.scene.add(grp);
      if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
        window.ModelFactory.attachBlenderGLB(`euphoria/${name}`, grp, (glb) => {
          glb.traverse(c => {
            if (!c.isMesh) return;
            c.castShadow = true; c.receiveShadow = true;
            // Pure-white vertex-painted "toon" stone blows out under the sun; tint once to warm weathered limestone.
            const m = c.material;
            if (m && !m.userData.gwTinted && m.color) {
              m.userData.gwTinted = true;
              if (m.color.getHex() === 0xffffff) m.color.setHex(0xe6dccb);
              if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.7);
            }
          });
        });
      }
      return grp;
    };

    // 4 Corner Sculpted Citadel Watchtowers framing Valhalla Arena
    [[-44, -40], [44, -40], [-44, 40], [44, 40]].forEach(([tx, tz]) => {
      placeSculpted('citadel_tower', tx, 0, tz, 1.55, Math.atan2(-tx, -tz));
    });

    // 2 Monumental North & South Royal Gate Towers
    placeSculpted('citadel_gatetower', 0, 0, -48, 1.5, 0);
    placeSculpted('citadel_gatetower', 0, 0, 48, 1.5, Math.PI);

    // 8 Ornate Sculpted Asgard Columns lining the Valhalla Grand Plaza
    [[-18, -12], [18, -12], [-18, 12], [18, 12], [-34, -14], [34, -14], [-34, 14], [34, 14]].forEach(([cx, cz]) => {
      placeSculpted('asgard_column', cx, 0, cz, 1.35, 0);
    });

    // 6 Sculpted Flame Braziers & Fire Pillars illuminating the Citadel Arena
    [[-10, -14], [10, -14], [-10, 14], [10, 14], [-22, 0], [22, 0]].forEach(([bx, bz]) => {
      placeSculpted('brazier', bx, 0, bz, 1.35, 0);
    });

    // Grand Central Aurora Shrine + Giant Mythic Sword Landmark
    placeSculpted('aurora_shrine', 0, 0.1, -36, 1.25, 0);
    placeSculpted('giant_sword', 36, 0, 0, 1.6, -Math.PI / 2);
    placeSculpted('frost_arch', -36, 0, 0, 1.4, Math.PI / 2);

    // BATCH 5: Deploy Sculpted Euphoria Asgard/Citadel GLBs Across ALL 5 Outer POIs!
    // 1. Bifrost Observatory (South: 0, 135)
    placeSculpted('frost_arch', 0, 0, 118, 1.55, 0);
    placeSculpted('aurora_shrine', 0, 0, 152, 1.45, Math.PI);
    placeSculpted('asgard_column', -16, 0, 135, 1.35, 0);
    placeSculpted('asgard_column', 16, 0, 135, 1.35, 0);

    // 2. Mjölnir Dwarven Forge (West: -115, 35)
    placeSculpted('fire_pillar', -102, 0, 22, 1.5, 0);
    placeSculpted('fire_pillar', -102, 0, 48, 1.5, 0);
    placeSculpted('blade_dais', -115, 0, 35, 1.45, 0);
    placeSculpted('citadel_wall', -132, 0, 35, 1.4, Math.PI / 2);

    // 3. Yggdrasil Sanctuary (East: 115, 30)
    placeSculpted('asgard_dais', 115, 0, 14, 1.5, 0);
    placeSculpted('aurora_shrine', 132, 0, 30, 1.3, -Math.PI / 2);
    placeSculpted('asgard_column', 98, 0, 22, 1.3, 0);
    placeSculpted('asgard_column', 98, 0, 38, 1.3, 0);

    // 4. Helheim Crypts (North-West: -85, -105)
    placeSculpted('den_pillar', -72, 0, -94, 1.5, 0);
    placeSculpted('den_pillar', -98, 0, -94, 1.5, 0);
    placeSculpted('citadel_tower', -85, 0, -124, 1.55, 0);
    placeSculpted('frost_arch', -85, 0, -86, 1.4, 0);

    // 5. Valkyrie Sky Docks (North-East: 90, -100)
    placeSculpted('citadel_gatetower', 90, 0, -82, 1.45, 0);
    placeSculpted('giant_sword', 110, 0, -100, 1.65, Math.PI / 4);
    placeSculpted('brazier', 74, 0, -100, 1.35, 0);

    // BATCH 3 & 4: 220 Floating Golden Asgardian Sun-Motes + Rising Brazier Fire Embers (2 Draw Calls Total!)
    const moteCount = 220;
    const motePos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (this.islandRadius - 12);
      motePos[i * 3] = Math.cos(a) * r;
      motePos[i * 3 + 1] = 1.5 + Math.random() * 24;
      motePos[i * 3 + 2] = Math.sin(a) * r;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    this.sunMotes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
      color: 0xfde047,
      size: 0.45,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    this.scene.add(this.sunMotes);

    const brazierSpots = [[-10, -14], [10, -14], [-10, 14], [10, 14], [-22, 0], [22, 0], [-102, 22], [-102, 48]];
    const emberPos = new Float32Array(brazierSpots.length * 8 * 3);
    let ei = 0;
    brazierSpots.forEach(([bx, bz]) => {
      for (let k = 0; k < 8; k++) {
        emberPos[ei * 3] = bx + (Math.random() - 0.5) * 1.1;
        emberPos[ei * 3 + 1] = 1.5 + Math.random() * 4.5;
        emberPos[ei * 3 + 2] = bz + (Math.random() - 0.5) * 1.1;
        ei++;
      }
    });
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    this.brazierEmbers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
      color: 0xf97316,
      size: 0.52,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    this.scene.add(this.brazierEmbers);
  }
}

window.AsgardWorld = AsgardWorld;
