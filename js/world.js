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
    this.shotBlockers = [];     // Ballistics-only solids (stair treads, overhead arches, rock ellipsoids): stop bullets/grenades/LOS, never block movement
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
    this.buildPropKit();
    this.furnishInteriors();
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
    // envMapIntensity 0.3: the sky IBL was flattening every diffuse surface to pastel; sun + hemi now carry the read
    const pbr = (n, opts) => { const t = P(n); return new THREE.MeshStandardMaterial(Object.assign({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 0.3 }, opts)); };
    this.mats = {
      gold: new THREE.MeshStandardMaterial({ color: 0x9a7740, metalness: 0.78, roughness: 0.4, normalMap: P('metal_panel').normalMap, normalScale: new THREE.Vector2(0.35, 0.35) }),
      brightGold: new THREE.MeshStandardMaterial({ color: 0xc49a4c, metalness: 0.85, roughness: 0.32 }),
      marbleWall: pbr('marble', { color: 0xb3ada3, roughness: 0.6, metalness: 0.0 }),
      marbleFloor: pbr('stone_tiles', { color: 0x8c867b, roughness: 0.72, metalness: 0.0 }),
      concrete: pbr('concrete', { color: 0x9c988f, roughness: 0.85, metalness: 0.0 }),
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

  /** footstep surface for a material: 'stone' | 'grass' | 'metal' | 'wood' */
  _surfaceKind(m) {
    const M = this.mats || {};
    if (!m) return 'stone';
    if (m === M.darkSteel || m === M.gold || m === M.brightGold || m === M.roof) return 'metal';
    if (m === M.woodGold) return 'wood';
    if (m === M.grass) return 'grass';
    return 'stone';
  }

  /** What the feet at (x, y, z) are standing on — mirrors getGroundHeight's priority. */
  surfaceAt(x, z, y) {
    let best = null, bestY = -1e9;
    for (const r of this.ramps) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
        const t = r.dir === 'N' ? (r.maxZ - z) / (r.maxZ - r.minZ) : r.dir === 'S' ? (z - r.minZ) / (r.maxZ - r.minZ) : r.dir === 'E' ? (x - r.minX) / (r.maxX - r.minX) : (r.maxX - x) / (r.maxX - r.minX);
        const ry = r.lowY + Math.max(0, Math.min(1, t)) * (r.highY - r.lowY);
        if (Math.abs(ry - y) < 0.4 && ry > bestY) { bestY = ry; best = r.kind; }
      }
    }
    for (const s of this.walkableSurfaces) {
      if (x >= s.minX - 0.3 && x <= s.maxX + 0.3 && z >= s.minZ - 0.3 && z <= s.maxZ + 0.3 && Math.abs(s.y - y) < 0.35 && s.y > bestY) { bestY = s.y; best = s.kind; }
    }
    if (best) return best;
    // open ground: paved plaza / highways read as stone, everything else is meadow
    if (Math.hypot(x, z) < 52) return 'stone';
    for (const poi of window.GODWARS_DATA.POIS) {
      if (poi.id === 'valhalla') continue;
      const len = Math.hypot(poi.x, poi.z), ux = poi.x / len, uz = poi.z / len, proj = x * ux + z * uz;
      if (proj > 0 && proj < len && Math.abs(x * (-uz) + z * ux) < 4.2) return 'stone';
    }
    return 'grass';
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
        thickness: h,
        kind: this._surfaceKind(material)
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
      if (h < 0.35 || w < 0.25 || d < 0.25) return;      // trim, decals, flat plates
      if (box.min.y > group.position.y + 2.2) {          // overhead piece: leave the walkway open, but stop shots
        if (w * d <= 900) this.shotBlockers.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, minY: box.min.y, maxY: box.max.y, fromGLB: true });
        return;
      }
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
      thickness,
      kind: this._surfaceKind(material || this.mats.marbleFloor)
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
      // treads stop bullets/grenades (movement uses the ramp surface instead)
      this.shotBlockers.push({ minX: sx - sw / 2, maxX: sx + sw / 2, minZ: sz - (sd + 0.08) / 2, maxZ: sz + (sd + 0.08) / 2, minY: stepY - dh - 0.15, maxY: stepY, isStep: true });
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
      kind: this._surfaceKind(mat),
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
   * Enclosed multi-storey building (replaces the old open "parking deck" template):
   * full perimeter walls with framed windows on every floor, ground-floor doors N/S, an interior
   * switchback-free stair stack along the west wall that runs through a stairwell all the way
   * to a parapeted roof, stone plinth, storey cornices and rooftop plant boxes for cover.
   * Collision stays AABB (walls/sills/headers are separate boxes), so windows can be mantled
   * through and shot through, Apex-style.
   */
  /** Window/door layout along one facade wall (shared by the builder and the interior furnisher). */
  _wallOpenings(a0, a1, door, avoid, doorW = 3.6, WIN = 2.0) {
    const L = a1 - a0;
    const n = Math.max(1, Math.floor((L - 1.5) / 4.0));
    const ops = [];
    for (let i = 0; i < n; i++) {
      const oc = a0 + (i + 0.5) * (L / n);
      if (door && Math.abs(oc - (a0 + a1) / 2) < doorW / 2 + WIN / 2 + 0.4) continue;
      if (avoid && oc > avoid[0] - WIN / 2 - 0.3 && oc < avoid[1] + WIN / 2 + 0.3) continue;
      ops.push({ c: oc, w: WIN, kind: 'win' });
    }
    if (door) ops.push({ c: (a0 + a1) / 2, w: doorW, kind: 'door' });
    ops.sort((p, q) => p.c - q.c);
    return ops;
  }

  buildApexCompoundBuilding(cx, cz, width, depth, wallMat, trimMat, stories = 2) {
    const floorCount = typeof stories === 'boolean' ? (stories ? 2 : 1) : stories;
    const M = this.mats;
    const fh = 4.6, wallT = 0.5, doorW = 3.6;
    const SILL = 1.05, HEAD = 2.75, WIN = 2.0;
    const x0 = cx - width / 2, x1 = cx + width / 2, z0 = cz - depth / 2, z1 = cz + depth / 2;
    const stairW = 3.0, stairL = Math.min(depth - 3.2, Math.max(7.5, depth * 0.72));
    const sx0 = x0 + wallT / 2, sx1 = sx0 + stairW;                 // stair strip along the west wall
    const sz0 = cz - stairL / 2, sz1 = cz + stairL / 2;
    const vis = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; this.scene.add(m); return m; };

    // ---- openings along one wall. axis 'X': wall runs along x at z = c; 'Z': along z at x = c.
    const facade = (axis, c, a0, a1, baseY, h, door, avoid) => {
      const ops = this._wallOpenings(a0, a1, door, avoid, doorW, WIN);
      const box = (s0, s1, y0, y1, mat = wallMat) => {
        if (s1 - s0 < 0.05 || y1 - y0 < 0.05) return;
        if (axis === 'X') this.addSolidWall((s0 + s1) / 2, y0, c, s1 - s0, y1 - y0, wallT, mat);
        else this.addSolidWall(c, y0, (s0 + s1) / 2, wallT, y1 - y0, s1 - s0, mat);
      };
      let cur = a0;
      ops.forEach(o => {
        const s0 = o.c - o.w / 2, s1 = o.c + o.w / 2;
        box(cur, s0, baseY, baseY + h);                               // pier
        if (o.kind === 'win') {
          box(s0, s1, baseY, baseY + SILL);                           // sill wall (mantle-able)
          box(s0, s1, baseY + HEAD, baseY + h);                       // header
          // frame: proud sill ledge, lintel and a centre mullion (visual)
          const along = (len, hh, dd) => axis === 'X' ? new THREE.BoxGeometry(len, hh, dd) : new THREE.BoxGeometry(dd, hh, len);
          const px = axis === 'X' ? o.c : c, pz = axis === 'X' ? c : o.c;
          vis(along(o.w + 0.3, 0.12, wallT + 0.22), trimMat, px, baseY + SILL + 0.06, pz);
          vis(along(o.w + 0.2, 0.1, wallT + 0.14), trimMat, px, baseY + HEAD - 0.05, pz);
          vis(along(0.09, HEAD - SILL, 0.09), trimMat, px, baseY + (SILL + HEAD) / 2, pz);
        } else {
          box(s0, s1, baseY + 3.2, baseY + h);                        // door header
          if (baseY < 0.5) this.addApexDoor(axis === 'X' ? o.c : c, baseY, axis === 'X' ? c : o.c, doorW, 3.2, axis);
        }
        cur = s1;
      });
      box(cur, a1, baseY, baseY + h);
    };

    // ---- ground slab + stone plinth band
    this.addWalkableFloor(cx, 0.06, cz, width, depth, 0.12, M.marbleFloor);
    [[cx, z1 + 0.06, width + 0.24, 0.12], [cx, z0 - 0.06, width + 0.24, 0.12], [x1 + 0.06, cz, 0.12, depth], [x0 - 0.06, cz, 0.12, depth]].forEach(([px, pz, bw, bd]) => {
      vis(this._worldUV(new THREE.BoxGeometry(bw + 0.24 * (bd > bw ? 1 : 0), 0.7, bd), bw, 0.7, bd), M.stone, px, 0.35, pz);
    });

    // ---- ground-floor interior cover (kept clear of the stair strip)
    this.addSolidWall(cx + width * 0.22, 0.06, cz, 2.2, 1.35, 2.2, M.darkSteel, true);
    this.addSolidWall(cx + width * 0.02, 0.06, cz + depth * 0.18, 1.6, 1.1, 1.6, M.darkSteel, true);

    for (let lvl = 0; lvl < floorCount; lvl++) {
      const baseY = lvl * fh;
      const topY = baseY + fh;
      // walls: N/S with ground doors, E/W windows (west wall skips windows behind the stair)
      facade('X', z1, x0, x1, baseY, fh, lvl === 0, null);
      facade('X', z0, x0, x1, baseY, fh, lvl === 0, null);
      facade('Z', x1, z0 + wallT / 2, z1 - wallT / 2, baseY, fh, false, null);
      facade('Z', x0, z0 + wallT / 2, z1 - wallT / 2, baseY, fh, false, [sz0, sz1]);

      // stair flight inside, west strip, climbing north (-Z) from baseY to topY
      this.addStairRamp((sx0 + sx1) / 2, cz, stairW, stairL, baseY, topY, 'N', M.darkSteel, true);

      // slab above with a stairwell hole over the flight (3 pieces around the hole)
      const isRoof = lvl === floorCount - 1;
      const slabMat = isRoof ? M.cornice : M.marbleFloor;
      const ov = 0.25, t = 0.42;
      const ex0 = x0 - ov, ex1 = x1 + ov, ez0 = z0 - ov, ez1 = z1 + ov;
      this.addWalkableFloor((sx1 + ex1) / 2, topY, cz, ex1 - sx1, ez1 - ez0, t, slabMat);
      this.addWalkableFloor((ex0 + sx1) / 2, topY, (ez0 + sz0) / 2, sx1 - ex0, sz0 - ez0, t, slabMat);
      this.addWalkableFloor((ex0 + sx1) / 2, topY, (sz1 + ez1) / 2, sx1 - ex0, ez1 - sz1, t, slabMat);
      // guard wall along the stairwell's open (east) side so you enter the flight from the south end
      this.addSolidWall(sx1 + 0.12, topY, cz - 0.6, 0.24, 1.05, stairL - 1.2, trimMat, true);

      // storey cornice band (visual)
      const cw = width + 0.9, cd = depth + 0.9;
      [[0, cd / 2, cw, 0.3], [0, -cd / 2, cw, 0.3], [cw / 2, 0, 0.3, cd], [-cw / 2, 0, 0.3, cd]].forEach(([ox, oz, bw, bd]) => {
        vis(new THREE.BoxGeometry(bw, 0.45, bd), M.cornice, cx + ox, topY - 0.12, cz + oz);
      });

      if (lvl > 0) this.addSolidWall(cx + width * 0.2, baseY, cz - depth * 0.15, 2.0, 1.25, 1.6, M.darkSteel, true);
    }

    // ---- roof: parapet with trim coping, plant boxes / vents as cover
    const roofY = floorCount * fh;
    const pT = 0.35, pH = 1.1;
    this.addSolidWall(cx, roofY, z1 - pT / 2, width, pH, pT, wallMat);
    this.addSolidWall(cx, roofY, z0 + pT / 2, width, pH, pT, wallMat);
    this.addSolidWall(x1 - pT / 2, roofY, cz, pT, pH, depth - pT * 2, wallMat);
    this.addSolidWall(x0 + pT / 2, roofY, cz, pT, pH, depth - pT * 2, wallMat);
    [[0, depth / 2 - pT / 2, width + 0.1, pT + 0.16], [0, -depth / 2 + pT / 2, width + 0.1, pT + 0.16], [width / 2 - pT / 2, 0, pT + 0.16, depth], [-width / 2 + pT / 2, 0, pT + 0.16, depth]].forEach(([ox, oz, bw, bd]) => {
      vis(new THREE.BoxGeometry(bw, 0.1, bd), trimMat, cx + ox, roofY + pH + 0.05, cz + oz);
    });
    this.addSolidWall(cx + width * 0.28, roofY, cz + depth * 0.22, 2.4, 1.3, 1.8, M.darkSteel, true);
    this.addSolidWall(cx + width * 0.05, roofY, cz - depth * 0.25, 1.4, 0.9, 1.4, M.darkSteel, true);
    vis(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 10), M.darkSteel, cx + width * 0.36, roofY + 0.8, cz - depth * 0.3);

    (this.buildings = this.buildings || []).push({ cx, cz, width, depth, roofY, compound: true, floorCount, fh, wallT, doorW, stairX1: sx1, stairZ0: sz0, stairZ1: sz1 });
    this.addBuildingDressing(cx, cz, width, depth, floorCount, wallMat, trimMat);
    this.decorateBuildingArchetype(cx, cz, width, depth, roofY, wallMat, trimMat);
  }

  /** Per-building set dressing (deterministic by position): awnings, wall lamps, drainpipes,
   *  a balcony and a rooftop water tank so the shared template stops reading as copy-paste. */
  addBuildingDressing(cx, cz, width, depth, floorCount, wallMat, trimMat) {
    const M = this.mats, fh = 4.6, roofY = floorCount * fh;
    const h = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1;
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; this.scene.add(m); return m; };
    if (!this._dressMats) {
      const c = (hex, r = 0.9) => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).convertSRGBToLinear(), roughness: r, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.3 });
      this._dressMats = { awnings: [c(0x7a2e2a), c(0x2e5a5c), c(0x5c5a2e), c(0x34405e)], lamp: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), pipe: new THREE.MeshStandardMaterial({ color: new THREE.Color(0x3a3d42).convertSRGBToLinear(), metalness: 0.7, roughness: 0.45 }) };
    }
    const D = this._dressMats;
    const awn = D.awnings[Math.floor(h * 4) % 4];
    // door awnings (both facades) + wall lamps beside each door
    for (const sz of [-1, 1]) {
      const zf = cz + sz * (depth / 2);
      const a = add(new THREE.BoxGeometry(4.6, 0.06, 1.5), awn, cx, 3.55, zf + sz * 0.72, sz * -0.32, 0, 0);
      a.castShadow = true;
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.06, 0.06, 1.4), D.pipe, cx + sx * 2.2, 3.45, zf + sz * 0.66, sz * -0.32, 0, 0);
        add(new THREE.BoxGeometry(0.16, 0.24, 0.12), D.pipe, cx + sx * 2.5, 2.7, zf + sz * 0.3);
        add(new THREE.BoxGeometry(0.1, 0.12, 0.06), D.lamp, cx + sx * 2.5, 2.66, zf + sz * 0.37);
      }
    }
    // corner drainpipe(s) running the full height
    const cornerX = cx + (h > 0.5 ? 1 : -1) * (width / 2 + 0.08), cornerZ = cz + depth / 2 + 0.08;
    add(new THREE.CylinderGeometry(0.08, 0.08, roofY + 0.6, 8), D.pipe, cornerX, (roofY + 0.6) / 2, cornerZ);
    for (let y = 1.5; y < roofY; y += 3) add(new THREE.BoxGeometry(0.22, 0.06, 0.22), D.pipe, cornerX, y, cornerZ);
    // balcony on an upper floor (walkable, railed), east or west face
    if (floorCount >= 2 && h > 0.25) {
      // east face only: the west face hosts the interior stair
      const by = fh, bw = 1.5, bd = Math.min(6, depth * 0.45), sx = 1, bxx = cx + width / 2 + 0.75;
      this.addWalkableFloor(bxx, by, cz + depth * 0.15, bw, bd, 0.25, M.cornice);
      this.addSolidWall(bxx + sx * (bw / 2 - 0.05), by, cz + depth * 0.15, 0.08, 1.0, bd, M.gold, false);
      [-1, 1].forEach(e => this.addSolidWall(bxx, by, cz + depth * 0.15 + e * (bd / 2 - 0.04), bw, 1.0, 0.08, M.gold, false));
      add(new THREE.BoxGeometry(0.12, 0.5, bd), D.pipe, bxx - sx * 0.3, by - 0.35, cz + depth * 0.15); // bracket beam
    }
    // rooftop water tank on legs or a second plant box
    if (h < 0.55) {
      const tx = cx + width * 0.05, tz = cz + depth * 0.2;
      add(new THREE.CylinderGeometry(1.0, 1.0, 1.8, 16), M.darkSteel, tx, roofY + 2.1, tz);
      add(new THREE.ConeGeometry(1.05, 0.4, 16), M.darkSteel, tx, roofY + 3.2, tz);
      [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].forEach(([lx, lz]) => add(new THREE.BoxGeometry(0.1, 1.2, 0.1), D.pipe, tx + lx, roofY + 0.6, tz + lz));
      this.colliders.push({ minX: tx - 1, maxX: tx + 1, minZ: tz - 1, maxZ: tz + 1, minY: roofY, maxY: roofY + 3.4, isClimbable: false });
    }
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
      // ballistic shell ~ the visible boulder (the movement core above is deliberately smaller)
      const erx = rr * (1 + 0.075 * ((k + seed) % 2)) * 0.92, ery = rr * 0.95 * 0.8 * 0.95, ecy = gy + rr * 0.32;
      this.shotBlockers.push({ ell: true, ex: x, ey: ecy, ez: z, rx: erx, ry: ery, rz: erx, minX: x - erx, maxX: x + erx, minZ: z - erx, maxZ: z + erx, minY: ecy - ery, maxY: ecy + ery, isRock: true });
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
      zenith:  { value: new THREE.Color(0x1a56c0) },
      midSky:  { value: new THREE.Color(0x5a9ae2) },
      horizon: { value: new THREE.Color(0xcbd9e6) },   // == fog colour: mountains melt into haze
      sunDir:  { value: new THREE.Vector3(0.52, 0.62, 0.45).normalize() },
      sunCol:  { value: new THREE.Color(0xfff4c8) },
      time:    { value: 0 },
      cloudTex:{ value: window.ModelFactory.getDetailTexture() },
      linearOut: window.GW_LINEAR_OUT || { value: 0 }  // shared with PostFX: HDR path wants linear radiance
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
        uniform float linearOut;
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
          if (linearOut > 0.5) c = pow(max(c, vec3(0.0)), vec3(2.2)) * 1.08;
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
    // cooler, dimmer fill + warmer, stronger key = Apex-style sunlit contrast (shadows read blue, lit faces warm)
    const hemiLight = new THREE.HemisphereLight(0x9fc2f0, 0x4a3d30, 0.42);
    hemiLight.position.set(0, 180, 0);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffd6a0, 1.95);
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
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grass.map, normalMap: rock.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.93, metalness: 0.0, envMapIntensity: 0.3 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.rockMap = { value: rock.map };
      sh.uniforms.dirtMap = { value: dirt.map };
      // storm: ground outside the current ring (but inside the playable island) is tinted crimson
      sh.uniforms.uGwRing = this._stormU().uRing;
      sh.vertexShader = 'attribute vec3 blendW;\nvarying vec3 vBlendW;\nvarying vec2 vGwWP;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vBlendW = blendW;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGwWP = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <tonemapping_fragment>', `
        float gwD = length(vGwWP - uGwRing.xy);
        float gwK = smoothstep(uGwRing.z, uGwRing.z + 12.0, gwD) * (1.0 - smoothstep(uGwRing.w - 4.0, uGwRing.w + 2.0, gwD));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(1.05, 0.3, 0.28) + vec3(0.04, 0.0, 0.003), gwK * 0.78);
        #include <tonemapping_fragment>`);
      sh.fragmentShader = 'uniform sampler2D rockMap;\nuniform sampler2D dirtMap;\nuniform vec4 uGwRing;\nvarying vec3 vBlendW;\nvarying vec2 vGwWP;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
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
        idx.push(a, b, c, b, d, c); // CCW seen from above -> normals point up
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
      // alpine banding: meadow on gentle lower slopes, cool grey rock above, snow caps on the peaks
      const rock = Math.min(1, Math.max(0, (slope - 0.22) / 0.16) + Math.max(0, (y - 26) / 14));
      const snow = Math.min(1, Math.max(0, (y - 44) / 12) * (1 - Math.max(0, (slope - 0.5) / 0.3)));
      col.setRGB(0.30, 0.42, 0.2).lerp(new THREE.Color(0.7, 0.74, 0.8), rock).convertSRGBToLinear();
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

  /** Shared storm uniforms (wall shader, outside-ground tint on the terrain, screen overlay). */
  _stormU() {
    if (!this._stormUniforms) {
      this._stormUniforms = {
        uRing: { value: new THREE.Vector4(0, 0, this.islandRadius, this.islandRadius - 3) }, // cx, cz, radius, playable edge
        uTime: { value: 0 },
        uLinear: { value: 0 },
        uStrength: { value: 0 }
      };
    }
    return this._stormUniforms;
  }

  /**
   * Ragnarok storm: a 220 m crimson energy curtain on the ring edge. Rising bands + vertical
   * streaks, grazing-angle (fresnel) build-up so the wall reads as a crisp line from afar while the
   * part straight ahead stays see-through, foot glow where it meets the ground, alpha fading with
   * height and when you're right at it. Plus a full-screen storm overlay when the camera is outside.
   */
  buildStormRing() {
    const U = this._stormU();
    const NOISE = `
      float gwH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gwN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(gwH(i), gwH(i + vec2(1.0, 0.0)), f.x), mix(gwH(i + vec2(0.0, 1.0)), gwH(i + vec2(1.0, 1.0)), f.x), f.y); }`;
    const ringMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: `varying vec3 vWP;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec4 uRing; uniform float uTime; uniform float uLinear; varying vec3 vWP;` + NOISE + `
        void main(){
          vec2 rel = vWP.xz - uRing.xy;
          float arc = atan(rel.y, rel.x) * uRing.z;           // metres along the curtain
          float y = vWP.y;
          vec3 V = cameraPosition - vWP; float dist = length(V); V /= max(dist, 1e-3);
          vec3 N = normalize(vec3(rel.x, 0.0, rel.y));
          float fres = 1.0 - abs(dot(N, V));
          float wob = gwN(vec2(arc * 0.035, uTime * 0.25)) * 3.0;
          float band = pow(0.5 + 0.5 * sin(y * 0.3 - uTime * 2.2 + wob), 5.0);
          float band2 = pow(0.5 + 0.5 * sin(y * 0.09 - uTime * 1.1 + wob * 0.5), 4.0);
          float st = smoothstep(0.58, 0.95, gwN(vec2(arc * 0.16, y * 0.012 - uTime * 0.45)));
          float foot = 1.0 - smoothstep(0.0, 16.0, y);
          float hFade = 1.0 - smoothstep(12.0, 150.0, y);
          float nearK = 0.3 + 0.7 * smoothstep(1.5, 22.0, dist);  // walking through it doesn't blind you
          float farK = 1.0 - 0.25 * smoothstep(260.0, 620.0, dist);
          float lowK = 1.0 - smoothstep(10.0, 70.0, y);            // grazing build-up only on the lower curtain (no arcs across the sky)
          float a = (0.17 + 0.3 * fres * fres * lowK + 0.16 * band + 0.1 * band2 + 0.14 * st + 0.26 * foot) * hFade * nearK * farK;
          vec3 deep = vec3(0.55, 0.02, 0.05), hot = vec3(0.95, 0.13, 0.09);
          vec3 col = mix(deep, hot, clamp(band * 0.9 + st * 0.45 + foot * 0.35, 0.0, 1.0));
          if (uLinear > 0.5) {                               // HDR target blends in linear: gamma-decode, tame alpha, let bands bloom
            col = pow(col, vec3(2.2)) * (1.0 + 0.9 * band + 0.5 * foot);
            a *= 0.6;
          }
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.8));
        }`,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false
    });
    this.ringMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 220, 160, 1, true), ringMat);
    this.ringMesh.position.set(0, 100, 0);
    this.ringMesh.scale.set(this.islandRadius, 1, this.islandRadius);
    this.ringMesh.frustumCulled = false;
    this.ringMesh.renderOrder = 5;
    this.scene.add(this.ringMesh);

    // screen-space storm overlay (only drawn while the camera is outside the ring)
    const ovMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uLinear; uniform float uStrength; varying vec2 vUv;` + NOISE + `
        void main(){
          vec2 q = vUv - 0.5;
          float r = length(q * vec2(1.0, 0.82));
          float vig = smoothstep(0.18, 0.72, r);
          float n = gwN(vec2(vUv.x * 5.0 + uTime * 0.35, vUv.y * 3.0 - uTime * 1.1));
          float streak = smoothstep(0.62, 1.0, gwN(vec2(vUv.x * 46.0, vUv.y * 1.6 + uTime * 2.4)));
          float pulse = 0.85 + 0.15 * sin(uTime * 5.0);
          float a = uStrength * (0.2 + 0.58 * vig * (0.65 + 0.35 * n) * pulse + 0.12 * streak * (0.3 + vig));
          vec3 col = mix(vec3(0.5, 0.0, 0.03), vec3(0.95, 0.12, 0.08), clamp(n * 0.5 + streak * 0.4, 0.0, 1.0));
          if (uLinear > 0.5) { col = pow(col, vec3(2.2)); a *= 0.85; }
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.88));
        }`,
      transparent: true, depthTest: false, depthWrite: false, fog: false
    });
    this.stormOverlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ovMat);
    this.stormOverlay.frustumCulled = false;
    this.stormOverlay.renderOrder = 9990;
    this.stormOverlay.visible = false;
    this.scene.add(this.stormOverlay);
  }

  updateRingVisual(centerX, centerZ, radius, time, dt = 0.016) {
    if (!this.ringMesh) return;
    this.ringMesh.position.x = centerX;
    this.ringMesh.position.z = centerZ;
    this.ringMesh.scale.set(Math.max(1, radius), 1, Math.max(1, radius));
    const U = this._stormU();
    U.uRing.value.set(centerX, centerZ, Math.max(1, radius), this.islandRadius - 3);
    U.uTime.value = time;
    U.uLinear.value = (window.GW_LINEAR_OUT && window.GW_LINEAR_OUT.value) ? 1 : 0;
    // outside-the-ring screen treatment (camera based, eased) + PostFX heat-haze distortion
    const cam = window.GAME && window.GAME.camera;
    let want = 0;
    if (cam && window.GAME.matchActive !== false) {
      const out = Math.hypot(cam.position.x - centerX, cam.position.z - centerZ) - radius;
      want = Math.max(0, Math.min(1, (out + 0.5) / 5));
    }
    const k = Math.min(1, dt * 6);
    U.uStrength.value += (want - U.uStrength.value) * k;
    if (U.uStrength.value < 0.003) U.uStrength.value = 0;
    if (this.stormOverlay) this.stormOverlay.visible = U.uStrength.value > 0;
    window.GW_STORM_FX = window.GW_STORM_FX || { value: 0, time: 0 };
    window.GW_STORM_FX.value = U.uStrength.value;
    window.GW_STORM_FX.time = time;

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
  /**
   * Blender prop kit (assets/models/kit_*.glb): set dressing + cover. Colliders come from each
   * model's real bounding box once it loads; spots that would overlap existing geometry are skipped.
   */
  placeKit(name, x, z, rotY = 0, opts = {}) {
    const r = opts.radius || 1.2;
    const y = opts.y !== undefined ? opts.y : this.terrainHeightAt(x, z);
    if (!opts.force) {
      for (const c of this.colliders) {
        if (c.isDoor) continue;
        if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ && y + 1 > c.minY && y < c.maxY) return null;
      }
      for (const d of this.doors) if (Math.hypot(x - d.x, z - d.z) < 3.2 + r) return null;
    }
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    if (opts.scale) g.scale.setScalar(opts.scale);
    this.scene.add(g);
    // reserve the footprint immediately so later placements don't stack on it
    const res = { minX: x - r * 0.7, maxX: x + r * 0.7, minZ: z - r * 0.7, maxZ: z + r * 0.7, minY: y, maxY: y + 0.01, isClimbable: true, reserved: true };
    if (!opts.noCollide) this.colliders.push(res);
    window.ModelFactory.attachBlenderGLB(name, g, (glb) => {
      glb.traverse(m => { if (m.isMesh) { m.castShadow = !opts.noShadow; m.receiveShadow = true; if (m.material && !m.material.userData.gwKit) { m.material.userData.gwKit = true; if (!m.material.emissiveMap && m.material.envMapIntensity !== undefined) m.material.envMapIntensity = 0.45; } } });
      if (opts.noCollide) return;
      g.add(glb); g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(glb);
      const h = box.max.y - box.min.y;
      Object.assign(res, { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, minY: box.min.y, maxY: box.max.y, isClimbable: h < 2.4, reserved: false, thin: opts.thin });
      this._shotGridDirty = true; // the reserve box just grew to the model's real bounds
      if (opts.thin) { // poles: collide only with a slim core
        const cx0 = (box.min.x + box.max.x) / 2, cz0 = (box.min.z + box.max.z) / 2;
        Object.assign(res, { minX: cx0 - 0.25, maxX: cx0 + 0.25, minZ: cz0 - 0.25, maxZ: cz0 + 0.25 });
      } else if (h < 2.4) {
        this.walkableSurfaces.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, y: box.max.y, thickness: h, kind: /barrel|generator|ac_unit|crate/.test(name) ? 'metal' : 'stone' });
      }
    });
    return g;
  }

  buildPropKit() {
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); // phones: lighter dressing
    let seed = 4242;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const POIS = window.GODWARS_DATA.POIS;
    const R = this.islandRadius;
    // 1. highways: street lamps both sides every ~28 m, jersey barriers in staggered pairs (cover while rotating)
    POIS.forEach(poi => {
      if (poi.id === 'valhalla') return;
      const len = Math.hypot(poi.x, poi.z), ux = poi.x / len, uz = poi.z / len, px = -uz, pz = ux, ang = Math.atan2(ux, uz);
      for (let t = 62; t < len - 48; t += coarse ? 56 : 28) {
        const side = (Math.round(t / 28) % 2) ? 1 : -1;
        this.placeKit('kit_lamppost', ux * t + px * 5.1 * side, uz * t + pz * 5.1 * side, ang + (side > 0 ? Math.PI / 2 : -Math.PI / 2), { radius: 0.4, thin: true });
      }
      for (let t = 75; t < len - 55; t += 46) {
        const side = rnd() > 0.5 ? 1 : -1;
        this.placeKit('kit_barrier', ux * t + px * 8.5 * side, uz * t + pz * 8.5 * side, ang + (rnd() - 0.5) * 0.5, { radius: 1.2 });
        this.placeKit('kit_barrier', ux * (t + 3) + px * 9.2 * side, uz * (t + 3) + pz * 9.2 * side, ang + 0.3, { radius: 1.2 });
      }
    });
    // 2. around every building: crate stacks, barrels, generators near walls; AC + antenna on roofs
    (this.buildings || []).forEach((b, i) => {
      const along = [[b.cx + b.width / 2 + 2.2, b.cz + b.depth * 0.3, Math.PI / 2], [b.cx - b.width / 2 - 2.2, b.cz - b.depth * 0.3, -Math.PI / 2],
                     [b.cx + b.width * 0.32, b.cz + b.depth / 2 + 2.4, 0], [b.cx - b.width * 0.32, b.cz - b.depth / 2 - 2.4, Math.PI]];
      along.forEach(([x, z, ry], k) => {
        const pick = (i + k) % 4;
        if (pick === 0) { this.placeKit('kit_crate_large', x, z, ry, { radius: 1.0 }); this.placeKit('kit_crate_small', x + 1.3 * Math.cos(ry), z - 1.3 * Math.sin(ry), ry + 0.4, { radius: 0.6 }); }
        else if (pick === 1) { this.placeKit('kit_barrel', x, z, rnd() * 6, { radius: 0.45 }); this.placeKit('kit_barrel', x + 0.75, z + 0.3, rnd() * 6, { radius: 0.45 }); }
        else if (pick === 2) this.placeKit('kit_generator', x, z, ry, { radius: 1.1 });
        else this.placeKit('kit_spool', x, z, ry, { radius: 0.8 });
      });
      this.placeKit('kit_ac_unit', b.cx + b.width * 0.3, b.cz - b.depth * 0.05, 0, { y: b.roofY, radius: 0.8 });
      if (!coarse && i % 3 === 0) this.placeKit('kit_antenna', b.cx + b.width * 0.38, b.cz + b.depth * 0.36, 0, { y: b.roofY, radius: 0.4, thin: true });
    });
    // 3. POI perimeters: sandbag nests facing outward + rune banners at the approaches
    POIS.forEach((poi, pi) => {
      const ring = poi.id === 'valhalla' ? 58 : 44;
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * Math.PI * 2 + pi * 0.7 + 0.4;
        this.placeKit('kit_sandbags', poi.x + Math.cos(a) * ring, poi.z + Math.sin(a) * ring, -a + Math.PI / 2, { radius: 1.4 });
      }
      for (let k = 0; k < 2; k++) {
        const a = Math.atan2(-poi.z, -poi.x) + (k ? 0.22 : -0.22);
        if (poi.id === 'valhalla') continue;
        this.placeKit('kit_rune_banner', poi.x + Math.cos(a) * (ring - 6), poi.z + Math.sin(a) * (ring - 6), -a, { radius: 0.4, thin: true });
      }
    });
    // 4. Valhalla plaza market: a ring of stalls between the palaces
    [[-36, 26, 0.3], [36, 26, -0.3], [-36, -26, Math.PI - 0.3], [36, -26, Math.PI + 0.3], [-44, 6, Math.PI / 2], [44, -6, -Math.PI / 2]].forEach(([x, z, ry]) => this.placeKit('kit_market_stall', x, z, ry, { radius: 1.8 }));
    // 5. open-field cover scatter: crates & barriers in the meadows between POIs
    for (let i = 0, placed = 0; i < 160 && placed < (coarse ? 16 : 34); i++) {
      const a = rnd() * Math.PI * 2, r = 50 + rnd() * (R - 75);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (POIS.some(p => Math.hypot(x - p.x, z - p.z) < 40)) continue;
      const kinds = ['kit_crate_large', 'kit_barrier', 'kit_sandbags', 'kit_crate_small', 'kit_barrel'];
      if (this.placeKit(kinds[i % kinds.length], x, z, rnd() * Math.PI * 2, { radius: 1.3 })) placed++;
    }
  }

  /**
   * Interior furnishing pass for enclosed compound buildings (assets/models/int_*.glb, built by
   * tools/blender_generate_interiors.py). Per floor: 3-6 wall-standing props (2-3 on phones) in the
   * piers between windows (low props may sit under a sill), an optional centre table, a rug, a wall
   * map screen and emissive ceiling panels (no real lights). Keeps clear: the west stair strip + its
   * approach/landing, the N/S door lanes on the ground floor and a central walking lane.
   * Deterministic per building (same position hash as addBuildingDressing).
   */
  furnishInteriors() {
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    // footprints in model space (front = +Z, back = -Z), from the Blender export report
    const P = {
      int_workbench: { x0: -1.10, x1: 1.00, z0: -0.38, z1: 0.53, h: 1.20 },
      int_lockers:   { x0: -0.64, x1: 0.64, z0: -0.25, z1: 0.27, h: 2.21, tall: true },
      int_shelf:     { x0: -0.65, x1: 0.65, z0: -0.25, z1: 0.25, h: 2.00, tall: true },
      int_sofa:      { x0: -1.01, x1: 1.01, z0: -0.42, z1: 0.38, h: 0.81 },
      int_desk:      { x0: -0.81, x1: 0.81, z0: -0.47, z1: 0.81, h: 1.32 },
      int_bunk:      { x0: -1.00, x1: 1.00, z0: -0.47, z1: 0.50, h: 1.79, tall: true },
      int_ammo_stack:{ x0: -0.51, x1: 0.51, z0: -0.31, z1: 0.31, h: 0.84 },
    };
    const WALL_KINDS = Object.keys(P);
    let total = 0;
    const stats = this.interiorStats = {};
    const put = (name, x, z, ry, o) => { stats[name] = (stats[name] || 0) + 1; return this.placeKit(name, x, z, ry, o); };   // noShadow: indoor props sit under the roof anyway; keeps them out of the sun shadow pass
    (this.buildings || []).forEach(b => {
      if (!b.compound) return;
      const { cx, cz, width, depth, floorCount, fh, wallT, doorW } = b;
      const x0 = cx - width / 2, x1 = cx + width / 2, z0 = cz - depth / 2, z1 = cz + depth / 2;
      const ix0 = x0 + wallT / 2, ix1 = x1 - wallT / 2, iz0 = z0 + wallT / 2, iz1 = z1 - wallT / 2;
      const stairClearX = b.stairX1 + 1.4;              // stair strip + its approach/landing lane
      const hsh = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1;
      for (let lvl = 0; lvl < floorCount; lvl++) {
        const y = lvl === 0 ? 0.06 : lvl * fh;
        const ceilY = (lvl + 1) * fh - 0.42;
        let seed = (Math.floor(hsh * 2147483000) + lvl * 7919 + 1) % 2147483646 + 1;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
        const placed = [];   // world-space XZ AABBs placed on this floor
        const free = (bx0, bx1, bz0, bz1, h, pad = 0.25, cpad = 0) => {   // cpad 0: wall-huggers sit 4 cm off the wall face
          if (bx0 < stairClearX) return false;
          // stair exits: the top landing (north end) and the foot (south end) open eastward into the room
          if (bx0 < b.stairX1 + 3.6 && (bz0 < b.stairZ0 + 1.0 || bz1 > b.stairZ1 - 0.6)) return false;
          if (bx0 < ix0 - 0.01 || bx1 > ix1 + 0.01 || bz0 < iz0 - 0.01 || bz1 > iz1 + 0.01) return false;
          if (lvl === 0 && Math.abs((bx0 + bx1) / 2 - cx) < (bx1 - bx0) / 2 + doorW / 2 + 0.9 && (bz0 < iz0 + 2.6 || bz1 > iz1 - 2.6)) return false; // door lanes
          for (const q of placed) if (bx0 < q[1] + pad && bx1 > q[0] - pad && bz0 < q[3] + pad && bz1 > q[2] - pad) return false;
          for (const c of this.colliders) {
            if (c.isDoor || c.reserved) continue;
            if (c.maxY <= y + 0.05 || c.minY >= y + h) continue;
            if (bx0 < c.maxX + cpad && bx1 > c.minX - cpad && bz0 < c.maxZ + cpad && bz1 > c.minZ - cpad) return false;
          }
          return true;
        };
        // wall slots: N (z0, faces +Z), S (z1, faces -Z), E (x1, faces -X). West wall hosts the stair.
        const walls = [
          { id: 'N', along: 'X', a0: x0, a1: x1, door: lvl === 0, rot: 0 },
          { id: 'S', along: 'X', a0: x0, a1: x1, door: lvl === 0, rot: Math.PI },
          { id: 'E', along: 'Z', a0: z0 + wallT / 2, a1: z1 - wallT / 2, door: false, rot: -Math.PI / 2 },
        ];
        const slots = [];
        walls.forEach(w => {
          const ops = this._wallOpenings(w.a0, w.a1, w.door, null, doorW);
          const lo = w.along === 'X' ? ix0 : iz0, hi = w.along === 'X' ? ix1 : iz1;
          let cur = lo;
          ops.forEach(o => {
            const s0 = o.c - o.w / 2, s1 = o.c + o.w / 2;
            if (s0 - cur > 0.6) slots.push({ w, s0: cur, s1: s0, kind: 'pier' });
            if (o.kind === 'win') slots.push({ w, s0: s0 - 0.15, s1: s1 + 0.15, kind: 'win' });
            cur = s1;
          });
          if (hi - cur > 0.6) slots.push({ w, s0: cur, s1: hi, kind: 'pier' });
        });
        // world AABB of a prop with its back against wall w, centred at `a` along it
        const footprint = (p, w, a) => {
          const back = -p.z0 + 0.04, front = p.z1;
          if (w.id === 'N') return { x: a, z: iz0 + back, bb: [a + p.x0, a + p.x1, iz0 + 0.04, iz0 + back + front] };
          if (w.id === 'S') return { x: a, z: iz1 - back, bb: [a - p.x1, a - p.x0, iz1 - back - front, iz1 - 0.04] };
          return { x: ix1 - back, z: a, bb: [ix1 - back - front, ix1 - 0.04, a - p.x1, a - p.x0] };
        };
        // shuffle slots deterministically; piers first-ish so tall props get used
        slots.forEach(s => { s.k = rnd() + (s.kind === 'pier' ? 0 : 0.35); });
        slots.sort((p, q) => p.k - q.k);
        const want = coarse ? 2 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 4) + (width * depth > 300 ? 2 : 0);   // big halls get a little more
        const used = {};
        let n = 0;
        const screenSlots = [];
        for (const s of slots) {
          if (n >= want) break;
          const len = s.s1 - s.s0;
          const opts = WALL_KINDS.filter(k => {
            const p = P[k];
            if (s.kind === 'win' && p.h > 1.35) return false;          // never block a window with a tall prop
            if (p.x1 - p.x0 > len - 0.1) return false;
            if ((used[k] || 0) >= (k === 'int_ammo_stack' ? 2 : 1)) return false;
            return true;
          });
          if (s.kind === 'pier' && len > 2.0) screenSlots.push(s);
          for (let t = 0; t < 3 && opts.length; t++) {
            const k = opts.splice(Math.floor(rnd() * opts.length), 1)[0], p = P[k];
            const slack = len - (p.x1 - p.x0) - 0.1;
            const a = (s.s0 + s.s1) / 2 + (rnd() - 0.5) * Math.max(0, slack) * 0.6;
            const f = footprint(p, s.w, a);
            if (!free(f.bb[0], f.bb[1], f.bb[2], f.bb[3], p.h)) continue;
            put(k, f.x, f.z, s.w.rot, { y, force: true, radius: 0.5, noShadow: true });
            (this.interiorPlacements = this.interiorPlacements || []).push({ name: k, x: f.x, z: f.z, y, wall: s.w.id });
            placed.push(f.bb); used[k] = (used[k] || 0) + 1; n++; total++;
            if (p.tall) s.tall = true;
            break;
          }
        }
        // map / ops screen on a free stretch of pier above head-height props
        if (!coarse || lvl === 0) {
          const s = screenSlots.find(q => !q.tall && q.s1 - q.s0 > 2.1);
          if (s) {
            const f = footprint({ x0: -0.95, x1: 0.95, z0: -0.04, z1: 0.05 }, s.w, (s.s0 + s.s1) / 2);
            put('int_wall_screen', f.x, f.z, s.w.rot, { y: y + 1.5, force: true, noCollide: true, noShadow: true });
          }
        }
        // centre-room island: mess table (big rooms, desktop) and a floor rug
        const roomX0 = Math.max(stairClearX, ix0) + 1.2, roomX1 = ix1 - 1.4;
        const spots = [];
        for (let i = 0; i < 6; i++) spots.push([roomX0 + rnd() * (roomX1 - roomX0), iz0 + 2.4 + rnd() * Math.max(0, iz1 - iz0 - 4.8)]);
        const awayFromLane = ([sx]) => Math.abs(sx - cx) > 2.6;
        let tableAt = null;
        if (!coarse && width * depth > 200) {
          const sp = spots.find(([sx, sz]) => awayFromLane([sx]) && free(sx - 1.0, sx + 1.0, sz - 0.95, sz + 0.95, 0.9, 0.9, 0.8));
          if (sp) { tableAt = sp; put('int_table', sp[0], sp[1], rnd() < 0.5 ? 0 : Math.PI, { y, force: true, radius: 0.5, noShadow: true }); placed.push([sp[0] - 0.9, sp[0] + 0.9, sp[1] - 0.85, sp[1] + 0.85]); total++; }
        }
        let rsp = null;
        if (tableAt && rnd() < 0.6) rsp = tableAt;   // rug under the mess table reads as a deliberate briefing nook
        else rsp = spots.find(([sx, sz]) => free(sx - 1.4, sx + 1.4, sz - 0.9, sz + 0.9, 0.3, 0.1, 0.3));
        if (rsp) put('int_rug', rsp[0], rsp[1], 0, { y: y + 0.002, force: true, noCollide: true, noShadow: true });
        // emissive ceiling light panels in a row down the room (no THREE lights)
        const lx0 = Math.max(stairClearX, ix0) + 1.0, lx1 = ix1 - 1.2;
        const nl = Math.max(1, Math.min(coarse ? 2 : 4, Math.round((lx1 - lx0) / 6)));
        const rows = depth >= 16 && !coarse ? [cz - depth * 0.22, cz + depth * 0.22] : [cz];
        rows.forEach(rz => {
          for (let i = 0; i < nl; i++) {
            const lx = lx0 + (i + 0.5) * (lx1 - lx0) / nl;
            put('int_ceiling_light', lx, rz, 0, { y: ceilY - 0.15, force: true, noCollide: true, noShadow: true });
          }
        });
      }
    });
    this.interiorPropCount = total;
  }

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

    const grassCount = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ? 650 : 1600;
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
  // BALLISTIC COLLISION — every solid AABB (walls split around window/door openings, slabs,
  // roofs, props, trees, rocks) plus ballistics-only blockers, bucketed in a uniform XZ grid.
  // Rays walk the grid with a 2D DDA and slab-test only the boxes in the cells they cross, so a
  // shot costs a few dozen box tests instead of ~3000. Windows/doorways are real gaps between
  // boxes, so bullets, grenades and bot sight pass through them and nothing else.
  // =========================================================================
  _buildShotGrid() {
    const CS = 8;
    const list = [];
    for (const c of this.colliders) if (!c.reserved) list.push(c);
    for (const c of this.shotBlockers) list.push(c);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const c of list) { if (c.minX < x0) x0 = c.minX; if (c.minZ < z0) z0 = c.minZ; if (c.maxX > x1) x1 = c.maxX; if (c.maxZ > z1) z1 = c.maxZ; }
    if (!list.length) { x0 = z0 = -1; x1 = z1 = 1; }
    x0 -= 1; z0 -= 1; x1 += 1; z1 += 1;
    const nx = Math.max(1, Math.ceil((x1 - x0) / CS)), nz = Math.max(1, Math.ceil((z1 - z0) / CS));
    const cells = new Array(nx * nz);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const ia = Math.max(0, Math.floor((c.minX - x0) / CS)), ib = Math.min(nx - 1, Math.floor((c.maxX - x0) / CS));
      const ja = Math.max(0, Math.floor((c.minZ - z0) / CS)), jb = Math.min(nz - 1, Math.floor((c.maxZ - z0) / CS));
      for (let j = ja; j <= jb; j++) for (let k = ia; k <= ib; k++) {
        const id = j * nx + k;
        (cells[id] || (cells[id] = [])).push(i);
      }
    }
    this._sg = { CS, x0, z0, x1: x0 + nx * CS, z1: z0 + nz * CS, nx, nz, cells, list, stamp: new Uint32Array(list.length), sid: 0, len: this.colliders.length, blen: this.shotBlockers.length };
    this._shotGridDirty = false;
    return this._sg;
  }

  /**
   * First solid hit along o + d*t (d normalised), 0 <= t <= maxT. Boxes that contain the origin
   * are ignored (a muzzle pressed into cover still fires out of it). Returns t (Infinity on miss);
   * `out` (optional) receives { c, nx, ny, nz } — the collider and the face normal that was hit.
   */
  raycastSolids(ox, oy, oz, dx, dy, dz, maxT, out) {
    let sg = this._sg;
    if (!sg || this._shotGridDirty || sg.len !== this.colliders.length || sg.blen !== this.shotBlockers.length) sg = this._buildShotGrid();
    const CS = sg.CS, nx = sg.nx, nz = sg.nz, list = sg.list, stamp = sg.stamp, cells = sg.cells;
    const ix = dx !== 0 ? 1 / dx : 1e30, iy = dy !== 0 ? 1 / dy : 1e30, iz = dz !== 0 ? 1 / dz : 1e30;
    // clip the ray to the grid rectangle (XZ)
    let tA = 0, tB = maxT;
    { const a = (sg.x0 - ox) * ix, b = (sg.x1 - ox) * ix; tA = Math.max(tA, Math.min(a, b)); tB = Math.min(tB, Math.max(a, b)); }
    { const a = (sg.z0 - oz) * iz, b = (sg.z1 - oz) * iz; tA = Math.max(tA, Math.min(a, b)); tB = Math.min(tB, Math.max(a, b)); }
    if (tA > tB) return Infinity;
    if (++sg.sid >= 0xffffffff) { stamp.fill(0); sg.sid = 1; }
    const sid = sg.sid;
    const px = ox + dx * tA, pz = oz + dz * tA;
    let cx = Math.min(nx - 1, Math.max(0, Math.floor((px - sg.x0) / CS)));
    let cz = Math.min(nz - 1, Math.max(0, Math.floor((pz - sg.z0) / CS)));
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdX = Math.abs(CS * ix), tdZ = Math.abs(CS * iz);
    let tmX = dx !== 0 ? ((sg.x0 + (cx + (dx > 0 ? 1 : 0)) * CS) - ox) * ix : Infinity;
    let tmZ = dz !== 0 ? ((sg.z0 + (cz + (dz > 0 ? 1 : 0)) * CS) - oz) * iz : Infinity;
    let best = maxT, hit = null, axis = 0;
    for (let guard = 0; guard < 4096; guard++) {
      const cell = cells[cz * nx + cx];
      if (cell) {
        for (let n = 0; n < cell.length; n++) {
          const id = cell[n];
          if (stamp[id] === sid) continue;
          stamp[id] = sid;
          const c = list[id];
          if (c.isDoor && !c.active) continue;
          if (c.ell) {
            // ellipsoid (rocks): scale into the unit sphere
            const qx = (ox - c.ex) / c.rx, qy = (oy - c.ey) / c.ry, qz = (oz - c.ez) / c.rz;
            const vx = dx / c.rx, vy = dy / c.ry, vz = dz / c.rz;
            const A = vx * vx + vy * vy + vz * vz, B = qx * vx + qy * vy + qz * vz, C = qx * qx + qy * qy + qz * qz - 1;
            if (C <= 0) continue;
            const disc = B * B - A * C;
            if (disc < 0) continue;
            const t = (-B - Math.sqrt(disc)) / A;
            if (t >= 0 && t < best) { best = t; hit = c; axis = 3; }
            continue;
          }
          let t1 = (c.minX - ox) * ix, t2 = (c.maxX - ox) * ix;
          let tn = Math.min(t1, t2), tf = Math.max(t1, t2), ax = 0;
          t1 = (c.minY - oy) * iy; t2 = (c.maxY - oy) * iy;
          let a = Math.min(t1, t2), b = Math.max(t1, t2);
          if (a > tn) { tn = a; ax = 1; }
          if (b < tf) tf = b;
          t1 = (c.minZ - oz) * iz; t2 = (c.maxZ - oz) * iz;
          a = Math.min(t1, t2); b = Math.max(t1, t2);
          if (a > tn) { tn = a; ax = 2; }
          if (b < tf) tf = b;
          if (tf >= tn && tn >= 0 && tn < best) { best = tn; hit = c; axis = ax; }
        }
      }
      const tExit = Math.min(tmX, tmZ);
      if (best <= tExit || tExit > tB) break;
      if (tmX < tmZ) { cx += sx; tmX += tdX; if (cx < 0 || cx >= nx) break; }
      else { cz += sz; tmZ += tdZ; if (cz < 0 || cz >= nz) break; }
    }
    if (!hit) return Infinity;
    if (out) {
      out.c = hit;
      if (axis === 3) {
        const hx = (ox + dx * best - hit.ex) / (hit.rx * hit.rx), hy = (oy + dy * best - hit.ey) / (hit.ry * hit.ry), hz = (oz + dz * best - hit.ez) / (hit.rz * hit.rz);
        const l = Math.hypot(hx, hy, hz) || 1;
        out.nx = hx / l; out.ny = hy / l; out.nz = hz / l;
      } else {
        out.nx = axis === 0 ? -Math.sign(dx) : 0;
        out.ny = axis === 1 ? -Math.sign(dy) : 0;
        out.nz = axis === 2 ? -Math.sign(dz) : 0;
      }
    }
    return best;
  }

  /** Coarse terrain occlusion along a segment (hills only rise ~11 m; skipped above that). */
  _terrainBlocks(ax, ay, az, bx, by, bz) {
    if (!this.terrainHeightAt || (ay > 14 && by > 14)) return false;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.min(60, Math.ceil(len / 3));
    for (let i = 1; i < n; i++) {
      const t = i / n, y = ay + (by - ay) * t;
      if (y > 14) continue;
      if (y < this.terrainHeightAt(ax + (bx - ax) * t, az + (bz - az) * t) - 0.15) return true;
    }
    return false;
  }

  /** True when nothing solid (walls, slabs, props, rocks, closed doors, terrain) lies between a and b. */
  segmentClear(a, b, terrain = true) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return true;
    if (this.raycastSolids(a.x, a.y, a.z, dx / len, dy / len, dz / len, len - 0.05) < len - 0.05) return false;
    return !(terrain && this._terrainBlocks(a.x, a.y, a.z, b.x, b.y, b.z));
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
              m.envMapIntensity = 0.35;
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
