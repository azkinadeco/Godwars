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

// Deterministic 2D value-noise FBM (terrain, mountains). Same output every session and on every client.
const _gwHash = (x, z) => { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); };
const _gwNoise = (x, z) => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = _gwHash(ix, iz), b = _gwHash(ix + 1, iz), c = _gwHash(ix, iz + 1), d = _gwHash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
};
const _gwFbm = (x, z, oct = 4) => { let v = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { v += _gwNoise(x * f, z * f) * amp; f *= 2.03; amp *= 0.5; } return v / (1 - Math.pow(0.5, oct)); };
const _gwRidge = (x, z, oct = 5) => { let v = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { v += (1 - Math.abs(_gwNoise(x * f, z * f) * 2 - 1)) * amp; f *= 2.1; amp *= 0.5; } return v / (1 - Math.pow(0.5, oct)); };

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
    // Spots that are authored at y = 0 outside the POI flats (outposts, trees + crates, jump pads,
    // zipline pylons, bins). terrainHeightAt levels a pad around each so hills never swallow them.
    const D = window.GODWARS_DATA;
    this.flatZones = [
      [-52, 72, 20], [52, 72, 20], [-52, -48, 20], [52, -48, 20],
      [0, 38, 7], [0, -38, 7], [-38, 0, 7], [38, 0, 7], [-86, 35, 7], [86, 30, 7], [-58, -82, 7], [62, -78, 7],
      [-45, 72, 5], [45, 72, 5],
      ...[[-32, 35], [32, 35], [-35, -22], [35, -22], [68, -15], [-68, -15], [75, 58], [-75, 58], [28, 95], [-28, 95],
          [82, -42], [-82, -42], [145, 5], [142, 55], [92, 65], [150, -35], [-148, -32], [-145, 68], [0, -68], [22, -78],
          [-22, -78], [45, 118], [-45, 118], [0, -145]].map(([x, z]) => [x + 2, z + 1, 8]),
      ...((D.ZIPLINES || []).flatMap(zl => [[zl.start[0], zl.start[2], 4], [zl.end[0], zl.end[2], 4]]))
    ];
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
    const stoneTex = window.ModelFactory.getSurfaceTexture('rock', 3, 3);
    const metalPanelTex = window.ModelFactory.getSurfaceTexture('metal_panel', 3, 2);
    const basaltTex = window.ModelFactory.getSurfaceTexture('basalt', 3, 3);
    const woodGoldTex = window.ModelFactory.getSurfaceTexture('wood_gold', 3, 3);
    const grassTex = window.ModelFactory.getSurfaceTexture('lush_grass', 18, 18);
    const lavaTex = window.ModelFactory.getSurfaceTexture('molten_lava', 6, 6);

    // Blender-baked seamless PBR sets (albedo + tangent normal). One coherent "Asgard divine-tech" palette:
    // pale marble ashlar + flagstone for temples, cast concrete for civic blocks, painted steel cladding,
    // weathered bronze trim, basalt for Helheim/forge, layered rock for terrain features.
    const P = (n) => window.ModelFactory.getPBR(n);
    const pbr = (n, opts) => { const t = P(n); return new THREE.MeshStandardMaterial(Object.assign({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.9, 0.9) }, opts)); };
    this.mats = {
      gold: new THREE.MeshStandardMaterial({ color: 0x9a7740, metalness: 0.78, roughness: 0.4, normalMap: P('metal_panel').normalMap, normalScale: new THREE.Vector2(0.35, 0.35) }),
      brightGold: new THREE.MeshStandardMaterial({ color: 0xc49a4c, metalness: 0.85, roughness: 0.32 }),
      marbleWall: pbr('marble', { color: 0xd6d1c8, roughness: 0.6, metalness: 0.0 }),
      marbleFloor: pbr('stone_tiles', { color: 0xa8a196, roughness: 0.72, metalness: 0.0 }),
      concrete: pbr('concrete', { color: 0xb4b0a8, roughness: 0.85, metalness: 0.0 }),
      darkSteel: pbr('metal_panel', { color: 0xc8ced6, metalness: 0.35, roughness: 0.5 }),
      obsidian: pbr('basalt', { color: 0xd8d8dc, metalness: 0.0, roughness: 0.78 }),
      stone: pbr('rock', { color: 0xd8d2c8, metalness: 0.0, roughness: 0.92 }),
      roof: pbr('roof', { color: 0xd0d8dc, metalness: 0.45, roughness: 0.55 }),
      dirt: pbr('dirt', { color: 0xffffff, metalness: 0.0, roughness: 0.95 }),
      woodGold: new THREE.MeshStandardMaterial({ color: 0x6e6256, map: woodGoldTex, roughness: 0.82, metalness: 0.0 }),
      grass: pbr('grass', { color: 0x6f9a48, roughness: 0.92, metalness: 0.0 }),
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
      // Structural trims: big slabs/roofs/crates need lit, textured surfaces. Unlit glow or mirror-water
      // on 30m roofs read as flat neon blocks; keep glow for small accents (crystals, strips) only.
      cornice: pbr('concrete', { color: 0x8e8a82, roughness: 0.85, metalness: 0.0 }),
      helTrim: pbr('basalt', { color: 0x9fc4be, emissive: 0x0b3b36, emissiveIntensity: 0.35, roughness: 0.78, metalness: 0.05 }),
      frostTrim: pbr('marble', { color: 0xd4e2f0, roughness: 0.5, metalness: 0.0 }),
      amberGlow: new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    };
  }

  // =========================================================================
  // ARCHITECTURAL PRIMITIVES: WALLS, WALKABLE FLOORS, RAMPS/STAIRS & DOORS
  // =========================================================================
  /**
   * Re-map a BoxGeometry's per-face 0..1 UVs to metres / tile so every wall, slab and step shares
   * the same texel density (a 30 m wall used to stretch one texture tile across its whole face).
   * BoxGeometry face order: +x,-x (depth x height), +y,-y (width x depth), +z,-z (width x height).
   */
  _worldUV(geo, w, h, d, ox = 0, oz = 0, tile = 4) {
    const uv = geo.attributes.uv;
    if (!uv) return geo;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    const off = ((ox * 0.37 + oz * 0.61) / tile) % 1;
    for (let f = 0; f < 6; f++) {
      const [su, sv] = dims[f];
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, uv.getX(i) * su / tile + off, uv.getY(i) * sv / tile);
      }
    }
    uv.needsUpdate = true;
    return geo;
  }

  addSolidWall(x, y, z, w, h, d, material, isClimbable = true) {
    const mesh = new THREE.Mesh(this._worldUV(new THREE.BoxGeometry(w, h, d), w, h, d, x, z), material || this.mats.marbleWall);
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

  /**
   * GLB architecture used to be pure visuals: players, bots and the camera walked straight
   * through gates, columns and towers. Once a GLB is attached, derive one AABB per ground-touching
   * mesh part (overhead lintels/arches are skipped so passages stay open).
   */
  addGLBColliders(group, glb) {
    if (glb.parent !== group) group.add(glb);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    glb.traverse(m => {
      if (!m.isMesh || !m.geometry) return;
      box.setFromObject(m);
      if (box.isEmpty()) return;
      const w = box.max.x - box.min.x, d = box.max.z - box.min.z, h = box.max.y - box.min.y;
      if (box.min.y > group.position.y + 2.2) return;   // overhead piece: leave the walkway open
      if (h < 0.35 || w < 0.25 || d < 0.25) return;      // trim, decals, flat plates
      if (w * d > 900) return;                           // giant shells would trap players
      this.colliders.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, minY: box.min.y, maxY: box.max.y, isClimbable: h < 3.2, fromGLB: true });
      if (h < 3.2) this.walkableSurfaces.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, y: box.max.y, thickness: h });
    });
  }

  addWalkableFloor(x, topY, z, w, d, thickness = 0.4, material = null) {
    const mesh = new THREE.Mesh(
      this._worldUV(new THREE.BoxGeometry(w, thickness, d), w, thickness, d, x, z, 6),
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
  addStairRamp(x, z, w, d, lowY, highY, dir = 'N', material = null, rails = false) {
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

      const stepMesh = new THREE.Mesh(this._worldUV(new THREE.BoxGeometry(sw, dh + 0.15, sd + 0.08), sw, dh + 0.15, sd + 0.08, sx, sz), mat);
      stepMesh.position.set(sx, stepY - (dh + 0.15) / 2, sz);
      group.add(stepMesh);
    }
    if (rails) {
      // steel handrails on both long sides: sloped tube + end posts
      const railMat = this.mats.gold;
      const along = (dir === 'N' || dir === 'S');
      const len = along ? d : w;
      const rise = highY - lowY;
      const slopeLen = Math.hypot(len, rise);
      const ang = Math.atan2(rise, len);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, slopeLen), railMat);
        const px = along ? x + side * (w / 2 - 0.05) : x, pz = along ? z : z + side * (d / 2 - 0.05);
        rail.position.set(px, (lowY + highY) / 2 + 1.0, pz);
        if (along) rail.rotation.x = (dir === 'N' ? 1 : -1) * ang;
        else { rail.rotation.order = 'YXZ'; rail.rotation.y = Math.PI / 2; rail.rotation.x = (dir === 'E' ? -1 : 1) * ang; }
        group.add(rail);
        for (const t of [0.04, 0.5, 0.96]) {
          const yy = lowY + rise * t;
          let qx = px, qz = pz;
          if (dir === 'N') qz = z + d / 2 - t * d; else if (dir === 'S') qz = z - d / 2 + t * d;
          else if (dir === 'E') qx = x - w / 2 + t * w; else qx = x + w / 2 - t * w;
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), railMat);
          post.position.set(qx, yy + 0.5, qz);
          group.add(post);
        }
      }
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
    const M = this.mats;
    const crateMat = M.darkSteel, stairMat = M.darkSteel, roofMat = M.cornice;
    this.addSolidWall(cx - width * 0.22, 0.06, cz, 2.2, 1.35, 2.2, crateMat, true);
    this.addSolidWall(cx + width * 0.22, 0.06, cz, 2.2, 1.35, 2.2, crateMat, true);

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
      this.addSolidWall(wx, 1.25, cz - depth * 0.36, wallT, 1.65, depth * 0.26, wallMat);
      this.addSolidWall(wx, 1.25, cz + depth * 0.36, wallT, 1.65, depth * 0.26, wallMat);
      // window frames: bronze sill + lintel so the openings read as windows, not missing blocks
      for (const wz of [cz - depth * 0.115, cz + depth * 0.115]) {
        const span = depth * 0.23 - 0.2;
        [1.22, 2.93].forEach(fy => {
          const fr = new THREE.Mesh(new THREE.BoxGeometry(wallT + 0.16, 0.14, span), trimMat);
          fr.position.set(wx, fy, wz); fr.castShadow = true; this.scene.add(fr);
        });
      }
    }

    // Ornate Asgardian Corner Fluted Columns & Gilded Door Pediments (Euphoria Architectural Detail!)
    const totalH = floorCount * fh;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const col = new THREE.Mesh(this._worldUV(new THREE.BoxGeometry(0.9, totalH + 0.6, 0.9), 0.9, totalH + 0.6, 0.9), wallMat === M.marbleWall ? M.cornice : M.concrete);
      col.position.set(cx + sx * (width / 2 + 0.15), (totalH + 0.6) / 2, cz + sz * (depth / 2 + 0.15));
      this.scene.add(col);
    });
    for (let dSide of [-1, 1]) {
      const pediment = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.4, 0.48, 0.95), trimMat);
      pediment.position.set(cx, 3.45, cz + dSide * (depth / 2 + 0.1));
      this.scene.add(pediment);
    }

    // 3. Build Upper Stories (2nd Floor y=4.6m, 3rd Floor y=9.2m, Overwatch Roof y=13.8m)
    for (let lvl = 1; lvl <= floorCount; lvl++) {
      const slabY = lvl * fh;
      const prevY = (lvl - 1) * fh;

      // Walkable Floor / Roof Deck Slab
      this.addWalkableFloor(cx, slabY, cz, width + 1.4, depth + 1.4, 0.42, lvl === floorCount ? roofMat : this.mats.marbleFloor);

      // Visual-only cornice band wrapping each slab edge: gives every storey a readable silhouette line
      // (previously each level was a bare slab and buildings read like parking decks).
      const cw = width + 1.9, cd = depth + 1.9, ch = 0.55, ct = 0.32;
      const corniceMat = this.mats.cornice;
      [[0, cd / 2, cw, ct], [0, -cd / 2, cw, ct], [cw / 2, 0, ct, cd], [-cw / 2, 0, ct, cd]].forEach(([ox, oz, bw, bd]) => {
        const band = new THREE.Mesh(new THREE.BoxGeometry(bw, ch, bd), corniceMat);
        band.position.set(cx + ox, slabY - 0.2, cz + oz);
        band.castShadow = true; band.receiveShadow = true;
        this.scene.add(band);
      });

      // Alternating East / West Wide Exterior Staircase Ramp connecting prevY -> slabY!
      const rampOnEast = (lvl % 2 === 1);
      const rx = rampOnEast ? (cx + width / 2 + 2.1) : (cx - width / 2 - 2.1);
      const rDir = rampOnEast ? 'N' : 'S';
      this.addStairRamp(rx, cz, 3.2, depth * 0.82, prevY, slabY, rDir, stairMat, true);

      if (lvl < floorCount) {
        // Upper Interior Floor Walls with Wide Balcony Doors, Windows & Interior Cover!
        this.addSolidWall(cx - width * 0.33, slabY, cz + depth / 2, width * 0.30, fh, wallT, wallMat);
        this.addSolidWall(cx + width * 0.33, slabY, cz + depth / 2, width * 0.30, fh, wallT, wallMat);
        this.addSolidWall(cx - width * 0.33, slabY, cz - depth / 2, width * 0.30, fh, wallT, wallMat);
        this.addSolidWall(cx + width * 0.33, slabY, cz - depth / 2, width * 0.30, fh, wallT, wallMat);

        // Chest-high peek walls on East/West balconies
        this.addSolidWall(cx - width / 2, slabY, cz, wallT, 1.3, depth * 0.72, wallMat);
        this.addSolidWall(cx + width / 2, slabY, cz, wallT, 1.3, depth * 0.72, wallMat);

        // Interior Cover Box on Upper Floor
        this.addSolidWall(cx, slabY, cz, 2.4, 1.25, 2.0, crateMat, true);
      } else {
        // Topmost Rooftop High-Ground Battlement Cover Parapets + Corner Spires!
        this.addSolidWall(cx, slabY, cz + depth / 2, width * 0.72, 1.25, 0.48, wallMat);
        this.addSolidWall(cx, slabY, cz - depth / 2, width * 0.72, 1.25, 0.48, wallMat);
        this.addSolidWall(cx - width / 2, slabY, cz, 0.48, 1.25, depth * 0.55, wallMat);
        this.addSolidWall(cx + width / 2, slabY, cz, 0.48, 1.25, depth * 0.55, wallMat);
        // parapet coping caps in trim colour
        [[0, depth / 2, width * 0.72 + 0.1, 0.62], [0, -depth / 2, width * 0.72 + 0.1, 0.62], [-width / 2, 0, 0.62, depth * 0.55 + 0.1], [width / 2, 0, 0.62, depth * 0.55 + 0.1]].forEach(([ox, oz, bw, bd]) => {
          const cap = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.12, bd), trimMat);
          cap.position.set(cx + ox, slabY + 1.31, cz + oz); this.scene.add(cap);
        });

        // Decorative Golden Corner Finials on Rooftop
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
          const finial = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), trimMat);
          finial.position.set(cx + sx * (width / 2 + 0.15), slabY + 0.25, cz + sz * (depth / 2 + 0.15));
          this.scene.add(finial);
        });
      }
    }
    this.decorateBuildingArchetype(cx, cz, width, depth, floorCount * fh, wallMat, trimMat);
  }

  /**
   * Per-theme silhouette pass so POIs stop sharing one box template.
   * Style is inferred from the wall material: marble=temple, darkSteel=foundry, obsidian=crypt.
   * Bifrost / Sky Docks get crystal crown / radar via their trim material.
   */
  decorateBuildingArchetype(cx, cz, width, depth, roofY, wallMat, trimMat) {
    const M = this.mats;
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    let style = 'temple';
    if (wallMat === M.darkSteel) style = trimMat === M.frostTrim ? 'crystal' : trimMat === M.brightGold ? 'skydock' : 'foundry';
    else if (wallMat === M.obsidian) style = 'crypt';

    if (style === 'temple') {
      // Triangular pediment crowning both long facades + acroteria; walkable roof stays open in the middle.
      const pedW = Math.min(width * 0.62, 18), pedH = 2.6;
      const tri = new THREE.Shape();
      tri.moveTo(-pedW / 2, 0); tri.lineTo(pedW / 2, 0); tri.lineTo(0, pedH); tri.lineTo(-pedW / 2, 0);
      const pedGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.7, bevelEnabled: false });
      for (const sz of [-1, 1]) {
        add(pedGeo, M.marbleWall, cx, roofY + 1.25, cz + sz * (depth / 2 + 0.35) - 0.35);
        add(new THREE.BoxGeometry(pedW + 0.8, 0.35, 1.0), M.cornice, cx, roofY + 1.3, cz + sz * (depth / 2 + 0.2));
        add(new THREE.ConeGeometry(0.45, 1.4, 6), M.brightGold, cx, roofY + 1.25 + pedH + 0.6, cz + sz * (depth / 2 + 0.1));
      }
    } else if (style === 'foundry') {
      // Smokestacks with glowing mouths + exterior pipe runs: readable "industrial" skyline from 150 m.
      const glow = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
      [[-0.32, -0.3], [0.3, 0.28]].forEach(([fx, fz], i) => {
        const x = cx + fx * width, z = cz + fz * depth, h = 9 + i * 3;
        add(new THREE.CylinderGeometry(0.9, 1.15, h, 14), M.darkSteel, x, roofY + h / 2, z);
        add(new THREE.CylinderGeometry(1.05, 1.05, 0.5, 14), M.cornice, x, roofY + h, z);
        add(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 14), glow, x, roofY + h + 0.3, z);
        this.colliders.push({ minX: x - 1.15, maxX: x + 1.15, minZ: z - 1.15, maxZ: z + 1.15, minY: roofY, maxY: roofY + h, isClimbable: false });
      });
      for (const sz of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.28, 0.28, width * 0.9, 10), M.gold, cx, roofY * 0.55, cz + sz * (depth / 2 + 0.55), 0, 0, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.28, 0.28, roofY * 0.55, 10), M.gold, cx + width * 0.45, roofY * 0.275, cz + sz * (depth / 2 + 0.55));
      }
    } else if (style === 'crypt') {
      // Leaning buttresses down the long sides + needle spires: jagged gothic silhouette.
      const n = Math.max(2, Math.round(width / 7));
      for (let i = 0; i < n; i++) {
        const x = cx - width / 2 + (i + 0.5) * (width / n);
        for (const sz of [-1, 1]) {
          const b = add(new THREE.BoxGeometry(0.9, roofY * 0.8, 1.6), M.obsidian, x, roofY * 0.4, cz + sz * (depth / 2 + 1.0), sz * 0.16, 0, 0);
          b.position.z += sz * 0.4;
          add(new THREE.ConeGeometry(0.45, 3.4, 5), M.helTrim, x, roofY * 0.8 + 1.4, cz + sz * (depth / 2 + 1.6));
        }
      }
      add(new THREE.ConeGeometry(1.4, 9, 6), M.obsidian, cx, roofY + 4.5, cz);
      add(new THREE.OctahedronGeometry(0.8, 0), M.necroGlow, cx, roofY + 9.4, cz);
    } else if (style === 'crystal') {
      // Cluster of tall translucent-looking crystal blades on the roof centre.
      const crystalMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x2a7fd4, emissiveIntensity: 0.45, roughness: 0.15, metalness: 0.1 });
      [[0, 0, 7.5, 0], [-2, 1.2, 5.2, 0.25], [2.1, -1, 5.8, -0.22], [0.8, 2.2, 4.2, 0.4]].forEach(([dx, dz, h, tilt]) => {
        add(new THREE.ConeGeometry(0.9, h, 6), crystalMat, cx + dx, roofY + h / 2, cz + dz, tilt * 0.6, 0, tilt);
      });
    } else if (style === 'skydock') {
      // Comms mast + tilted radar dish + landing-pad ring: aerodrome read.
      const mx = cx + width * 0.3, mz = cz - depth * 0.3;
      add(new THREE.CylinderGeometry(0.22, 0.35, 10, 8), M.darkSteel, mx, roofY + 5, mz);
      const dish = add(new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), M.cornice, mx, roofY + 10.4, mz, -0.9, 0.6, 0);
      dish.material = M.cornice;
      add(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b }), mx, roofY + 10.2, mz);
      add(new THREE.TorusGeometry(Math.min(width, depth) * 0.28, 0.12, 6, 40), M.brightGold, cx - width * 0.15, roofY + 0.08, cz + depth * 0.1, Math.PI / 2);
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

  /** Cluster of noise-displaced boulders (shared geometries) with AABB colliders sized to the core. */
  addRockOutcrop(cx, cz, scale = 1, seed = 0) {
    if (!this._boulderGeos) {
      this._boulderGeos = [0, 1, 2].map(k => {
        const g = new THREE.IcosahedronGeometry(1, 2);
        const p = g.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i);
          const n = _gwFbm(v.x * 1.3 + k * 9, v.z * 1.3 + v.y * 1.1 - k * 4, 3);
          const flat = v.y < -0.2 ? 0.55 : 1;                    // flat-ish base so it sits on the ground
          v.multiplyScalar(0.72 + n * 0.55);
          v.y *= flat * 0.8;
          p.setXYZ(i, v.x, v.y, v.z);
        }
        g.computeVertexNormals();
        // planar world-ish UVs so the rock texture keeps scale
        const uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) * 0.35, p.getY(i) * 0.35);
        return g;
      });
    }
    const pieces = [[0, 0, 4.2, 0], [3.6, 1.8, 2.6, 1], [-3.2, 2.4, 2.2, 2], [1.2, -3.4, 1.8, 1], [-2.4, -2.2, 1.4, 0]];
    pieces.forEach(([ox, oz, r, gi], k) => {
      const rr = r * scale;
      const x = cx + ox * scale, z = cz + oz * scale;
      const gy = this.terrainHeightAt(x, z);
      const m = new THREE.Mesh(this._boulderGeos[(gi + seed) % 3], this.mats.stone);
      m.position.set(x, gy + rr * 0.32, z);
      m.scale.set(rr * (1 + 0.15 * ((k + seed) % 2)), rr * 0.95, rr);
      m.rotation.y = seed * 1.7 + k * 2.3;
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      const core = rr * 0.62, top = gy + rr * 0.32 + rr * 0.62;
      this.colliders.push({ minX: x - core, maxX: x + core, minZ: z - core, maxZ: z + core, minY: gy - 1, maxY: top, isClimbable: true });
      this.walkableSurfaces.push({ minX: x - core * 0.7, maxX: x + core * 0.7, minZ: z - core * 0.7, maxZ: z + core * 0.7, y: top, thickness: top - gy });
    });
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
    // High ground now lives in the terrain heightfield (terrainHeightAt). The old box plateaus with
    // staircases and pyramid "mountains" are gone; instead, rock outcrops give cover on the ridges.
    [[-62, -25, 1.2], [62, -25, 1.1], [-58, 92, 1.0], [58, 92, 1.15], [0, -88, 1.3], [-148, -28, 1.25],
     [-30, 60, 0.8], [40, 52, 0.75], [-150, 110, 1.0], [150, -40, 1.05], [-110, -150, 0.9], [120, 150, 0.95],
     [170, 60, 1.1], [-175, 40, 1.0], [30, -160, 0.9], [-40, -130, 0.8]
    ].forEach(([x, z, sc], i) => this.addRockOutcrop(x, z, sc, i));

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
        window.ModelFactory.attachBlenderGLB('prop_asgard_archway', archGroup, (glb) => this.addGLBColliders(archGroup, glb));
      }
    });
  }

  // =========================================================================
  // SKYBOX, BIOMES, PAVED ROADS, LAVA & BIFROST RIVERS, BRIDGES
  // =========================================================================
  buildLightingAndSky() {
    this.scene.background = new THREE.Color(0x185ac2);
    this.scene.fog = new THREE.Fog(0xc6d6e6, 110, 680);

    // Euphoria Adventure Multi-Stop Celestial Sky Dome Shader (Sun Disc, Golden Corona & 2-Octave FBM Clouds!)
    this.skyUniforms = {
      zenith:  { value: new THREE.Color(0x2a63b8) },
      midSky:  { value: new THREE.Color(0x76aee6) },
      horizon: { value: new THREE.Color(0xcbd9e6) },   // == fog colour: mountains melt into haze
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
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    sunLight.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sunLight.shadow.normalBias = 0.04;
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

    // (Removed: flat-shaded floating isles + box waterfalls — the mountain ring now owns the horizon.)
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

    for (const [fx, fz, fr] of this.flatZones) {
      const d = Math.hypot(x - fx, z - fz);
      if (d < fr) return 0;
      if (d < fr + 14) flatMask = Math.min(flatMask, (d - fr) / 14);
    }

    // Organic FBM rolling hills + a few broad ridges between POIs (0 .. ~11 m). Replaces the old
    // box "playable hills" — high ground is now real terrain you can slide down.
    const base = _gwFbm(x * 0.011 + 3.1, z * 0.011 - 1.7, 4);
    const ridge = _gwRidge(x * 0.006 - 2.3, z * 0.006 + 4.4, 3);
    const rawH = Math.max(0, (base - 0.38) * 14 + Math.max(0, ridge - 0.55) * 22);
    const edgeFade = Math.max(0, Math.min(1, (this.islandRadius - 8 - rDist) / 22));
    return rawH * flatMask * edgeFade;
  }

  /**
   * Terrain material: grass / dirt / rock / snow blended per-vertex in the fragment shader
   * (attribute blendW = rock, dirt, snow). Vertex colour stays a gentle biome tint.
   */
  _makeTerrainMaterial() {
    const P = (n) => window.ModelFactory.getPBR(n);
    const grass = P('grass'), rock = P('rock'), dirt = P('dirt');
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grass.map, normalMap: rock.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.93, metalness: 0.0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.rockMap = { value: rock.map };
      sh.uniforms.dirtMap = { value: dirt.map };
      sh.vertexShader = 'attribute vec3 blendW;\nvarying vec3 vBlendW;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vBlendW = blendW;');
      sh.fragmentShader = 'uniform sampler2D rockMap;\nuniform sampler2D dirtMap;\nvarying vec3 vBlendW;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
        vec4 gC = mapTexelToLinear(texture2D(map, vUv));
        vec4 gF = mapTexelToLinear(texture2D(map, vUv * 0.173));
        gC.rgb *= 0.75 + 0.5 * gF.g;                                  // break up tiling with a low-frequency pass
        vec4 rC = mapTexelToLinear(texture2D(rockMap, vUv * 0.55));
        vec4 dC = mapTexelToLinear(texture2D(dirtMap, vUv * 0.8));
        vec4 texelColor = mix(gC, dC, clamp(vBlendW.y, 0.0, 1.0));
        texelColor = mix(texelColor, rC, clamp(vBlendW.x, 0.0, 1.0));
        texelColor = mix(texelColor, vec4(vec3(0.86, 0.89, 0.93) * (0.82 + 0.18 * rC.r * 2.0), 1.0), clamp(vBlendW.z, 0.0, 1.0));
        diffuseColor *= texelColor;`);
    };
    return mat;
  }

  buildBiomesRoadsAndRivers() {
    const R = this.islandRadius;
    const lowSpec = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const terrainMat = this._makeTerrainMaterial();
    this.terrainMat = terrainMat;

    // Island underside (only visible from the dropship): rock skirt.
    const island = new THREE.Mesh(new THREE.CylinderGeometry(R + 4, R * 0.7, 40, 64, 1, true), this.mats.stone);
    island.position.set(0, -20.5, 0);
    this.scene.add(island);

    // ---- playable terrain
    const terrainSize = R * 2.04;
    const seg = lowSpec ? 100 : 150;
    const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, seg, seg);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i), vz = posAttr.getZ(i);
      posAttr.setY(i, Math.hypot(vx, vz) > R - 6 ? 0 : this.terrainHeightAt(vx, vz));
    }
    terrainGeo.computeVertexNormals();
    const nrm = terrainGeo.attributes.normal;
    const cols = new Float32Array(posAttr.count * 3);
    const blend = new Float32Array(posAttr.count * 3);
    const col = new THREE.Color();
    const tint = (hex, amt) => col.lerp(new THREE.Color(hex), Math.max(0, Math.min(1, amt)));
    const POI = window.GODWARS_DATA.POIS;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i), vy = posAttr.getY(i), vz = posAttr.getZ(i);
      const slope = 1 - nrm.getY(i);
      let rockW = Math.max(0, Math.min(1, (slope - 0.07) / 0.1)) + Math.max(0, (vy - 8.5) / 3);
      const pn = _gwFbm(vx * 0.035 + 11, vz * 0.035 - 7, 3);
      let dirtW = Math.max(0, (pn - 0.62) * 4);
      // worn dirt ring around every POI + road shoulders
      for (const poi of POI) {
        const d = Math.hypot(vx - poi.x, vz - poi.z);
        const ring = poi.id === 'valhalla' ? 60 : 50;
        dirtW = Math.max(dirtW, Math.max(0, 1 - Math.abs(d - ring) / 9) * (0.55 + pn * 0.6));
        if (poi.id !== 'valhalla') {
          const len = Math.hypot(poi.x, poi.z), ux = poi.x / len, uz = poi.z / len;
          const proj = vx * ux + vz * uz;
          if (proj > 0 && proj < len) {
            const perp = Math.abs(vx * (-uz) + vz * ux);
            dirtW = Math.max(dirtW, Math.max(0, 1 - Math.abs(perp - 5.5) / 3.2) * 0.85);
          }
        }
      }
      // biome tint (sRGB authored)
      col.setRGB(0.36, 0.47, 0.22);
      tint(0x8c8a48, (_gwFbm(vx * 0.018, vz * 0.018, 3) - 0.5) * 2.2);       // sun-dried meadow
      tint(0x2f4f22, (0.45 - _gwFbm(vx * 0.02 + 5, vz * 0.02 + 9, 3)) * 2.5); // lush hollows
      const dForge = Math.hypot(vx + 115, vz - 35);
      if (dForge < 70) { tint(0x5a4c44, (1 - dForge / 70) * 0.9); dirtW = Math.max(dirtW, (1 - dForge / 70) * 0.8); }
      const dHel = Math.hypot(vx + 85, vz + 105);
      if (dHel < 64) tint(0x6f9c90, (1 - dHel / 64) * 0.75);
      const dBif = Math.hypot(vx, vz - 135);
      if (dBif < 60) tint(0xc8e0e8, (1 - dBif / 60) * 0.6);
      col.lerp(new THREE.Color(0.82, 0.8, 0.78), Math.min(1, Math.max(rockW, dirtW * 0.75)));
      col.convertSRGBToLinear();
      cols.set([col.r, col.g, col.b], i * 3);
      blend.set([Math.min(1, rockW), Math.min(1, dirtW), 0], i * 3);
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    terrainGeo.setAttribute('blendW', new THREE.BufferAttribute(blend, 3));
    const uv = terrainGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * terrainSize / 7, uv.getY(i) * terrainSize / 7);
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    this.scene.add(terrainMesh);

    this.buildMountainRing(terrainMat, lowSpec);

    // ---- highways: flagstone paving with low concrete curbs (world-UV'd so slabs keep real size)
    const roadMat = this.mats.marbleFloor;
    POI.forEach(poi => {
      if (poi.id === 'valhalla') return;
      const len = Math.hypot(poi.x, poi.z);
      const angle = Math.atan2(poi.x, poi.z);
      const road = new THREE.Mesh(this._worldUV(new THREE.BoxGeometry(7.5, 0.14, len), 7.5, 0.14, len, 0, 0, 6), roadMat);
      road.position.set(poi.x / 2, 0.04, poi.z / 2);
      road.rotation.y = angle;
      road.receiveShadow = true;
      this.scene.add(road);
      for (const side of [-1, 1]) {
        const curb = new THREE.Mesh(this._worldUV(new THREE.BoxGeometry(0.5, 0.26, len), 0.5, 0.26, len), this.mats.cornice);
        curb.position.set(poi.x / 2 + Math.cos(angle) * 3.95 * side, 0.1, poi.z / 2 - Math.sin(angle) * 3.95 * side);
        curb.rotation.y = angle;
        curb.receiveShadow = true;
        this.scene.add(curb);
      }
    });
  }

  /**
   * Ring of ridged mountains just outside the playable radius: gives every horizon a silhouette
   * (the island used to end in a flat yellow void) and frames the ring like a real valley.
   */
  buildMountainRing(mat, lowSpec) {
    const R = this.islandRadius;
    const radii = [R - 10, R - 2, R + 3, R + 8, R + 14, R + 22, R + 32, R + 45, R + 62, R + 85, R + 115, R + 150, R + 190, R + 230, R + 270];
    const segA = lowSpec ? 160 : 240;
    const verts = [], cols = [], blend = [], uvs = [], idx = [];
    const heightAt = this._mountainHeightAt = (x, z, r) => {
      const t = Math.max(0, Math.min(1, (r - R + 2) / 34));
      const rise = t * t * (3 - 2 * t);
      const far = Math.max(0, Math.min(1, (R + 270 - r) / 90));
      const rg = _gwRidge(x * 0.0085 + 7.3, z * 0.0085 - 2.1, 5);
      const big = _gwFbm(x * 0.0032 - 4, z * 0.0032 + 6, 3);
      return -0.6 + rise * (26 + Math.pow(rg, 1.4) * 105 * (0.55 + big * 0.9)) * (0.45 + 0.55 * far);
    };
    for (let ri = 0; ri < radii.length; ri++) {
      for (let ai = 0; ai <= segA; ai++) {
        const a = (ai / segA) * Math.PI * 2;
        const jitter = ri > 1 ? (_gwNoise(ai * 0.37, ri * 1.7) - 0.5) * 8 : 0;
        const r = radii[ri] + jitter;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const y = heightAt(x, z, r);
        verts.push(x, y, z);
        uvs.push(a * R / 7, r / 7);
      }
    }
    const row = segA + 1;
    for (let ri = 0; ri < radii.length - 1; ri++) {
      for (let ai = 0; ai < segA; ai++) {
        const a = ri * row + ai, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const n = geo.attributes.normal;
    const col = new THREE.Color();
    for (let i = 0; i < n.count; i++) {
      const y = verts[i * 3 + 1];
      const slope = 1 - n.getY(i);
      const rock = Math.min(1, Math.max(0, (slope - 0.05) / 0.12) + Math.max(0, (y - 14) / 10));
      const snow = Math.min(1, Math.max(0, (y - 62) / 14) * (1 - Math.max(0, (slope - 0.35) / 0.25)));
      col.setRGB(0.34, 0.44, 0.22).lerp(new THREE.Color(0.85, 0.83, 0.8), rock).convertSRGBToLinear();
      cols.push(col.r, col.g, col.b);
      blend.push(rock, 0.15 * (1 - rock), snow);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setAttribute('blendW', new THREE.Float32BufferAttribute(blend, 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.mountainRing = mesh;
  }

  // =========================================================================
  // POI 1: VALHALLA GOLDEN CITADEL (CENTER [0, 0])
  // Expanded 3-Story Grand Palace Complex + Dual Skybridges + Colossal Odin Statue!
  // =========================================================================
  buildValhallaCitadel() {
    const plazaGeo = new THREE.CircleGeometry(52, 40);
    const puv = plazaGeo.attributes.uv; for (let i = 0; i < puv.count; i++) puv.setXY(i, puv.getX(i) * 104 / 6, puv.getY(i) * 104 / 6);
    const plaza = new THREE.Mesh(plazaGeo, this.mats.marbleFloor);
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
    this.addWalkableFloor(-14, 4.6, 0, 4.5, 34, 0.4, this.mats.cornice);
    this.addWalkableFloor(14, 4.6, 0, 4.5, 34, 0.4, this.mats.cornice);
    this.addWalkableFloor(-14, 9.2, 0, 3.8, 34, 0.4, this.mats.cornice);
    this.addWalkableFloor(14, 9.2, 0, 3.8, 34, 0.4, this.mats.cornice);
    // skybridges were 34 m slabs floating on nothing: give them piers + bronze guard rails
    for (const bx of [-14, 14]) {
      for (const bz of [-6, 6]) {
        const pier = new THREE.Mesh(this._worldUV(new THREE.BoxGeometry(1.0, 9.0, 1.0), 1, 9, 1), this.mats.marbleWall);
        pier.position.set(bx, 4.5, bz); pier.castShadow = true; pier.receiveShadow = true; this.scene.add(pier);
        this.colliders.push({ minX: bx - 0.5, maxX: bx + 0.5, minZ: bz - 0.5, maxZ: bz + 0.5, minY: 0, maxY: 9.0, isClimbable: false });
      }
      for (const [ry, hw] of [[4.6, 2.25], [9.2, 1.9]]) {
        for (const sd of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 20), this.mats.gold);
          rail.position.set(bx + sd * (hw - 0.05), ry + 1.0, 0); this.scene.add(rail);
          for (let pz = -9; pz <= 9; pz += 3) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), this.mats.gold);
            post.position.set(bx + sd * (hw - 0.05), ry + 0.5, pz); this.scene.add(post);
          }
        }
      }
    }

    // Central Elevated Odin Allfather Altar (with 4 wide walkable royal staircases!)
    this.buildValhallaShowcaseArchitecture();
    this.addWalkableFloor(0, 1.8, 0, 12, 12, 1.8, this.mats.marbleWall);
    this.addStairRamp(0, 7.8, 5.0, 4.0, 0, 1.8, 'N', this.mats.marbleFloor);
    this.addStairRamp(0, -7.8, 5.0, 4.0, 0, 1.8, 'S', this.mats.marbleFloor);
    this.addStairRamp(7.8, 0, 4.0, 5.0, 0, 1.8, 'W', this.mats.marbleFloor);
    this.addStairRamp(-7.8, 0, 4.0, 5.0, 0, 1.8, 'E', this.mats.marbleFloor);

    // COLOSSAL 25-METER BLENDER STATUE OF ODIN ALLFATHER crowning Valhalla Citadel!
    this.placeBlenderStatue('statue_odin', 0, 1.8, 0, 0, 1.05);
  }

  // =========================================================================
  // POI 2: BIFROST OBSERVATORY & RAINBOW BRIDGE (SOUTH [0, 135])
  // =========================================================================
  buildBifrostObservatory() {
    const cx = 0, cz = 135;

    // Widened Elevated Walkable Rainbow Bridge Deck (y = 1.6m) with Approach Ramps & Cover Railings
    this.addWalkableFloor(0, 1.6, 82, 14, 58, 0.6, this.mats.marbleFloor);
    this.addStairRamp(0, 49, 14, 8, 0, 1.6, 'S', this.mats.marbleFloor);
    this.addStairRamp(0, 115, 14, 8, 1.6, 0, 'N', this.mats.marbleFloor);
    // glowing bifrost light-strips inlaid along both deck edges (the deck itself is stone you can read)
    for (const sx of [-6.2, 6.2]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 58), this.mats.bifrostWater);
      strip.position.set(sx, 1.62, 82); this.scene.add(strip);
    }

    for (let z = 62; z <= 102; z += 13) {
      this.addSolidWall(-6.6, 1.6, z, 0.8, 1.35, 4.5, this.mats.frostTrim);
      this.addSolidWall(6.6, 1.6, z, 0.8, 1.35, 4.5, this.mats.frostTrim);
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(7.2, 0.38, 8, 22, Math.PI),
        this.mats.gold
      );
      arch.position.set(0, 1.6, z);
      this.scene.add(arch);
    }

    // EXPANDED 3-Story Enterable Heimdall Observatory Main Building (26m x 18m)
    this.buildApexCompoundBuilding(cx, cz, 26, 18, this.mats.darkSteel, this.mats.frostTrim, 3);

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
      window.ModelFactory.attachBlenderGLB('prop_bifrost_gate', portalGroup, (glb) => this.addGLBColliders(portalGroup, glb), outerGate);
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
    this.addWalkableFloor(cx, 4.6, cz, 5.5, 28, 0.4, this.mats.darkSteel);
    this.addWalkableFloor(cx, 9.2, cz, 4.5, 28, 0.4, this.mats.darkSteel);

    // COLOSSAL BLENDER STATUE OF THOR raising Mjölnir overlooking the Forge!
    this.placeBlenderStatue('statue_thor', cx - 28, 0, cz - 14, Math.PI * 0.45, 1.05);

    const anvilGroup = new THREE.Group();
    anvilGroup.position.set(cx - 26, 0, cz + 4.5);
    this.scene.add(anvilGroup);
    if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
      window.ModelFactory.attachBlenderGLB('prop_forge_anvil', anvilGroup, (glb) => this.addGLBColliders(anvilGroup, glb));
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
    this.addStairRamp(cx - 16.5, cz, 7, 4.6, 0, 4.6, 'E', this.mats.woodGold, true);
    this.addStairRamp(cx + 16.5, cz, 7, 4.6, 0, 4.6, 'W', this.mats.woodGold, true);

    this.addWalkableFloor(cx, 9.2, cz, 20, 20, 0.5, this.mats.woodGold);
    this.addStairRamp(cx, cz - 11.5, 4.6, 7, 4.6, 9.2, 'S', this.mats.woodGold, true);

    this.addSolidWall(cx, 4.6, cz + 12.7, 18, 1.25, 0.5, this.mats.woodGold);
    this.addSolidWall(cx, 4.6, cz - 12.7, 18, 1.25, 0.5, this.mats.woodGold);
    // timber posts holding the treehouse decks up
    [[-12, -12], [12, -12], [-12, 12], [12, 12], [-9, -9], [9, 9], [-9, 9], [9, -9]].forEach(([px, pz], i) => {
      const top = i < 4 ? 4.6 : 9.2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, top, 8), this.mats.woodGold);
      post.position.set(cx + px, top / 2, cz + pz); post.castShadow = true; this.scene.add(post);
    });

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
    this.buildApexCompoundBuilding(cx, cz, 28, 18, this.mats.obsidian, this.mats.helTrim, 3);

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
    this.addWalkableFloor(cx, 4.6, cz, 20, 20, 0.5, this.mats.concrete);
    this.addStairRamp(cx, cz + 15, 9, 10, 0, 4.6, 'N', this.mats.darkSteel, true);

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
      // Loot drone: armoured hull + glowing tier band/eye (ballMat drives the tier colour) + 4 rotor pods.
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const hullMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x30343c).convertSRGBToLinear(), metalness: 0.7, roughness: 0.35 });
      const hull = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14), hullMat);
      hull.scale.set(1, 0.72, 1);
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 6, 32), sphereMat);
      band.rotation.x = Math.PI / 2;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), sphereMat);
      eye.position.set(0, -0.15, 0.9);
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 0.35, 16), hullMat);
      skirt.position.y = -0.7;
      group.add(hull, band, eye, skirt);
      const rotorMat = new THREE.MeshBasicMaterial({ color: 0xcfd8e3, transparent: true, opacity: 0.25, depthWrite: false });
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.18), hullMat);
        arm.position.set(Math.cos(a) * 1.2, 0.25, Math.sin(a) * 1.2); arm.rotation.y = -a;
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 10), hullMat);
        pod.position.set(Math.cos(a) * 1.85, 0.3, Math.sin(a) * 1.85);
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.02, 20), rotorMat);
        rotor.position.set(Math.cos(a) * 1.85, 0.48, Math.sin(a) * 1.85);
        group.add(arm, pod, rotor);
      }
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
  /** Instance every mesh of a Blender GLB at the given world matrices (one draw call per material). */
  _instanceGLB(name, matrices, shadows = true) {
    if (!matrices.length || !window.ModelFactory || !window.ModelFactory.attachBlenderGLB) return;
    const holder = new THREE.Group();
    window.ModelFactory.attachBlenderGLB(name, holder, (glb) => {
      glb.updateMatrixWorld(true);
      const tmp = new THREE.Matrix4();
      glb.traverse(m => {
        if (!m.isMesh) return;
        const inst = new THREE.InstancedMesh(m.geometry, m.material, matrices.length);
        matrices.forEach((mx, i) => { tmp.multiplyMatrices(mx, m.matrixWorld); inst.setMatrixAt(i, tmp); });
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = shadows; inst.receiveShadow = true;
        inst.frustumCulled = false; // r128 culls instanced meshes by the base geometry's bounds
        this.scene.add(inst);
      });
    });
  }

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
      color: 0x9fb07a, // the painted blades were neon next to the baked meadow
      emissive: 0x1c2a10, // back faces of the crossed cards read as black specks from above
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
    const rockGeo = this._boulderGeos ? this._boulderGeos[1].clone().scale(1.45, 1.45, 1.45) : new THREE.DodecahedronGeometry(1.45, 1);
    rockGeo.translate(0, 0.45, 0);
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

    // 3. Instanced Blender forests: broadleaf (lite) in the meadows, pines on cooler / higher ground and
    //    a dense pine belt along the mountain foot so the valley edge reads as forest, not a wall.
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const broad = [], pines = [], mtx = () => new THREE.Matrix4();
    const want = coarse ? 30 : 85;
    for (let i = 0; i < want * 4 && broad.length + pines.length < want; i++) {
      const a = rand() * Math.PI * 2;
      const r = 52 + Math.sqrt(rand()) * (this.islandRadius - 62);
      const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
      if (this.isBlockedForNature(tx, tz, 5.0)) continue;
      if (window.GODWARS_DATA.POIS.some(p => Math.hypot(tx - p.x, tz - p.z) < 36)) continue;
      const ty = this.terrainHeightAt(tx, tz);
      const isPine = ty > 4.5 || Math.hypot(tx + 85, tz + 105) < 90 || _gwNoise(tx * 0.02, tz * 0.02) > 0.62;
      const ts = (isPine ? 0.8 : 0.85) + rand() * 0.6;
      dummy.position.set(tx, ty - 0.15, tz);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(ts, ts * (0.9 + rand() * 0.3), ts);
      dummy.updateMatrix();
      (isPine ? pines : broad).push(mtx().copy(dummy.matrix));
      this.colliders.push({ minX: tx - 0.5, maxX: tx + 0.5, minZ: tz - 0.5, maxZ: tz + 0.5, minY: ty, maxY: ty + 5, isClimbable: false });
    }
    // mountain-foot pine belt (outside the playable radius: visual only)
    const belt = coarse ? 70 : 220;
    for (let i = 0; i < belt; i++) {
      const a = rand() * Math.PI * 2;
      const r = this.islandRadius + 1 + rand() * 34;
      const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
      const ty = this._mountainHeightAt ? this._mountainHeightAt(tx, tz, r) : 0;
      const ts = 0.9 + rand() * 0.9;
      dummy.position.set(tx, ty - 0.3, tz);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(ts, ts * (0.95 + rand() * 0.4), ts);
      dummy.updateMatrix();
      pines.push(mtx().copy(dummy.matrix));
    }
    this._instanceGLB('prop_tree_lite', broad);
    this._instanceGLB('prop_pine_tree', pines, !coarse);
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
            // Candy-red toon roofs / maroon walls clashed with the marble+bronze palette:
            // remap red vertex paint to slate roofing and weathered stone (geometry is shared -> once).
            const g = c.geometry, ca = g && g.attributes.color;
            if (ca && !g.userData.gwRepaint) {
              g.userData.gwRepaint = true;
              const cc = new THREE.Color(), hsl = {};
              // r128 getX() returns raw ints for normalized (Uint8/Uint16) glTF colours
              const q = ca.normalized ? (ca.array instanceof Uint8Array ? 255 : ca.array instanceof Uint16Array ? 65535 : 1) : 1;
              for (let i = 0; i < ca.count; i++) {
                cc.setRGB(ca.getX(i) / q, ca.getY(i) / q, ca.getZ(i) / q);
                cc.getHSL(hsl);
                if ((hsl.h < 0.06 || hsl.h > 0.93) && hsl.s > 0.3) {
                  if (hsl.l > 0.28) cc.setHex(0x34424e).convertSRGBToLinear();            // roof -> slate
                  else cc.setRGB(hsl.l * 1.9, hsl.l * 1.8, hsl.l * 1.65);              // wall -> stone
                  ca.setXYZ(i, cc.r * q, cc.g * q, cc.b * q);
                }
              }
              ca.needsUpdate = true;
            }
          });
          this.addGLBColliders(grp, glb);
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
