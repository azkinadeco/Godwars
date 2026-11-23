/**
 * GOD WARS: ASGARD ROYALE — COMPLETE APEX COMBAT, SQUAD REVIVE & ATTACHMENT ENGINE
 * - Squad Friendly-Fire Protection (Allies on same teamId never damage each other)
 * - Weapon Attachment Stat Modifiers (Barrel, Mag, Optic, Hop-Up)
 * - Knocked Down (DBNO) Directional Knockdown Shield, Squad Revives & Squad Wipe logic
 * - Mythic God Finishers (100% Evo Shield Refill) & 6 Hero Tactical/Ultimate Skills
 */

class CombatManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.tracers = [];
    this.shells = [];
    this.grenades = [];
    this.vfxList = [];
    this.decoys = [];
    this.activeZones = [];
    this.energyOrbs = [];
    this.projectiles = [];
    this._orbGeo = new THREE.OctahedronGeometry(0.18, 0);
    this._boltGeo = new THREE.SphereGeometry(0.085, 6, 6);
  }

  isEnemy(actorA, actorB) {
    if (!actorA || !actorB) return true;
    if (actorA === actorB) return false;
    if (actorA.teamId !== undefined && actorB.teamId !== undefined) {
      return actorA.teamId !== actorB.teamId;
    }
    return true;
  }

  spawnShellCasing(origin, rightDir) {
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.032, 6),
      new THREE.MeshBasicMaterial({ color: 0xfde047 })
    );
    shell.position.copy(origin);
    this.scene.add(shell);

    const vel = rightDir.clone().multiplyScalar(2.2 + Math.random() * 1.4);
    vel.y += 2.0 + Math.random() * 1.2;
    this.shells.push({ mesh: shell, velocity: vel, age: 0, maxAge: 0.55 });
  }

  spawnTracer(startPos, endPos, colorHex, thickness = 1) {
    // 3D Glowing Additive Plasma Bolt Cylinder (Visible on iPhone/macOS Metal unlike 1px THREE.Line!)
    const diff = endPos.clone().sub(startPos);
    const len = Math.max(0.2, diff.length());
    const radius = 0.028 * Math.max(1, thickness * 0.7);
    const boltGeo = new THREE.CylinderGeometry(radius * 0.65, radius, len, 6);
    boltGeo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const line = new THREE.Mesh(boltGeo, mat);
    line.position.copy(startPos).addScaledVector(diff, 0.5);
    line.lookAt(endPos);
    this.scene.add(line);

    const spark = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    spark.position.copy(endPos);
    this.scene.add(spark);

    this.tracers.push({ line, spark, age: 0, maxAge: 0.15 });

    // BATCH 2: Physical Fast-Flying 3D Glowing Bullet Projectile Bolt!
    const projMesh = new THREE.Mesh(
      this._boltGeo,
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    projMesh.position.copy(startPos);
    this.scene.add(projMesh);
    const travelDir = diff.clone().normalize();
    const travelTime = Math.min(0.45, len / 175);
    this.projectiles.push({ mesh: projMesh, vel: travelDir.multiplyScalar(175), age: 0, maxAge: Math.max(0.06, travelTime) });
  }

  // BATCH 6: Molten Bullet Impact Scorch Ring on Wall/Floor Hits!
  spawnImpactScorch(pos, colorHex = 0xf97316) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.22, 12),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.vfxList.push({ type: 'scorch', mesh: ring, age: 0, maxAge: 0.9 });
  }

  // Euphoria-Style Homing Divine Energy Orbs (Pop out on Shield Break / Kill and fly into Player!)
  spawnEnergyOrbs(pos, colorHex = 0x38bdf8, count = 3) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const m = new THREE.Mesh(this._orbGeo, mat);
      m.position.copy(pos).add(new THREE.Vector3(0, 1.1, 0));
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3(Math.cos(a) * 3.6, 5.2 + Math.random() * 2.5, Math.sin(a) * 3.6);
      this.energyOrbs.push({ mesh: m, vel, age: 0 });
    }
  }

  spawnExplosionVFX(pos, radius, colorHex, duration = 0.55) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 18),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.78
      })
    );
    sphere.position.copy(pos);
    this.scene.add(sphere);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.0, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.15, pos.z);
    this.scene.add(ring);

    this.vfxList.push({
      type: 'explosion',
      sphere,
      ring,
      maxRadius: radius,
      age: 0,
      maxAge: duration
    });

    // Euphoria-Style Additive Rising Light Pillar
    const pillarMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.16, radius * 0.38, radius * 2.2, 14, 1, true),
      pillarMat
    );
    pillar.position.copy(pos);
    pillar.position.y += radius * 1.1;
    this.scene.add(pillar);
    this.vfxList.push({ type: 'pillar', mesh: pillar, age: 0, maxAge: duration * 1.15 });
  }

  // Euphoria-Style 3-Claw / Crescent Energy Slash Arc on Melee & Abilities!
  spawnSlashArc(origin, lookDir, colorHex = 0xfbbf24) {
    const grp = new THREE.Group();
    const yaw = Math.atan2(lookDir.x, lookDir.z);
    for (let k = -1; k <= 1; k++) {
      const arcMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const arcMesh = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.045, 6, 18, Math.PI * 0.75), arcMat);
      arcMesh.position.y = k * 0.14;
      arcMesh.rotation.x = Math.PI * 0.5 + k * 0.18;
      grp.add(arcMesh);
    }
    grp.position.copy(origin).addScaledVector(lookDir, 1.35);
    grp.rotation.y = yaw;
    this.scene.add(grp);
    this.vfxList.push({ type: 'slash', mesh: grp, age: 0, maxAge: 0.26 });
  }

  spawnLightningBolt(startPos, endPos, colorHex = 0x38bdf8, duration = 0.35) {
    const segments = 8;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = new THREE.Vector3().lerpVectors(startPos, endPos, t);
      if (i > 0 && i < segments) {
        p.x += (Math.random() - 0.5) * 1.4;
        p.y += (Math.random() - 0.5) * 1.2;
        p.z += (Math.random() - 0.5) * 1.4;
      }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 1 });
    const bolt = new THREE.Line(geo, mat);
    this.scene.add(bolt);
    this.vfxList.push({ type: 'bolt', mesh: bolt, age: 0, maxAge: duration });
  }

  performMelee(actor, origin, lookDir) {
    window.SFX.playMelee();
    const hData = window.GODWARS_DATA.HEROES[actor.heroId] || window.GODWARS_DATA.HEROES.thor;

    // Euphoria-Style 3-Hit Heirloom Melee Lunge Combo (Hit 1 -> Hit 2 -> Heavy AoE God Slam 3!)
    const now = performance.now();
    if (!actor._lastMeleeTime || now - actor._lastMeleeTime > 1350) {
      actor.meleeComboStep = 1;
    } else {
      actor.meleeComboStep = ((actor.meleeComboStep || 1) % 3) + 1;
    }
    actor._lastMeleeTime = now;
    const step = actor.meleeComboStep;

    // Forward Lunge Impulse so melee feels snappy & closes gaps!
    if (actor.isPlayer) {
      actor.momentumBoost = step === 3 ? 13.5 : 9.5;
      actor.momentumDir = new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize();
    }

    this.spawnSlashArc(origin, lookDir, step === 3 ? 0xfde047 : hData.hexColor);
    if (step === 3) {
      const slamPt = actor.position.clone().addScaledVector(new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize(), 2.2);
      this.spawnExplosionVFX(slamPt, 4.8, hData.hexColor, 0.42);
      if (actor.isPlayer) this.game.showBanner(`⚔️ 3-HIT HEIRLOOM FINISHER: ${hData.meleeName.toUpperCase()}!`, '#fde047');
    }
    const endPt = origin.clone().addScaledVector(lookDir, 4.2);
    this.spawnTracer(origin.clone().addScaledVector(lookDir, 0.5), endPt, hData.hexColor, 3);

    // Check if Melee Kicking an Apex Energy Door!
    for (const door of (this.game.world.doors || [])) {
      if (!door.broken && Math.hypot(actor.position.x - door.x, actor.position.z - door.z) < 3.5) {
        this.game.world.toggleDoor(door, true);
        this.spawnExplosionVFX(new THREE.Vector3(door.x, door.y + 1.5, door.z), 2.5, 0x38bdf8, 0.3);
        if (actor.isPlayer) this.game.showBanner('DOOR SMASHED OPEN!', '#38bdf8');
        return;
      }
    }

    const candidates = [...this.game.bots];
    if (this.game.player && this.game.player.alive) candidates.push(this.game.player);

    for (const target of candidates) {
      if (!target.alive || !this.isEnemy(actor, target)) continue;
      const tCenter = target.position.clone().add(new THREE.Vector3(0, 1.0, 0));
      const dist = origin.distanceTo(tCenter);
      const maxRange = actor.meleeComboStep === 3 ? 5.2 : 4.25;
      if (dist <= maxRange) {
        const toTarget = tCenter.clone().sub(origin).normalize();
        if (actor.meleeComboStep === 3 || toTarget.dot(lookDir) > 0.35) {
          let dmg = actor.meleeComboStep === 3 ? 65 : actor.meleeComboStep === 2 ? 44 : 36;
          if (actor.heroId === 'thor' && actor.thunderCharge >= 50) {
            dmg += 18;
            actor.thunderCharge = 0;
            this.spawnLightningBolt(origin, tCenter, 0x38bdf8, 0.4);
          }
          if (target.velocity) {
            target.velocity.x += lookDir.x * 11;
            target.velocity.y += 5.5;
            target.velocity.z += lookDir.z * 11;
          }
          this.applyDamage(actor, target, dmg, hData.meleeName, false, tCenter, true);
          break;
        }
      }
    }
  }

  fireWeapon(shooter, origin, dir, weaponData, isMythicGold = false, hopupMult = 1.0) {
    const range = weaponData.range || 160;
    let bestDist = range;
    let hitTarget = null;
    let isHeadshot = false;
    let hitPoint = origin.clone().addScaledVector(dir, range);

    for (const c of this.game.world.colliders) {
      if (c.isDoor && !c.active) continue;
      const boxMin = new THREE.Vector3(c.minX, c.minY, c.minZ);
      const boxMax = new THREE.Vector3(c.maxX, c.maxY, c.maxZ);
      const ray = new THREE.Ray(origin, dir);
      const intersectPt = new THREE.Vector3();
      if (ray.intersectBox(new THREE.Box3(boxMin, boxMax), intersectPt)) {
        const d = origin.distanceTo(intersectPt);
        if (d < bestDist) {
          bestDist = d;
          hitPoint.copy(intersectPt);
        }
      }
    }

    if (dir.y < -0.001) {
      const tGround = -origin.y / dir.y;
      if (tGround > 0 && tGround < bestDist) {
        bestDist = tGround;
        hitPoint.copy(origin).addScaledVector(dir, tGround);
      }
    }

    // Check intersection with Hovering Apex Cargo Bots (Loot Drones!)
    for (const cb of (this.game.world.cargoBots || [])) {
      if (!cb.alive) continue;
      const ray = new THREE.Ray(origin, dir);
      const pt = new THREE.Vector3();
      if (ray.intersectSphere(new THREE.Sphere(cb.position, 1.85), pt)) {
        const d = origin.distanceTo(pt);
        if (d < bestDist) {
          bestDist = d;
          hitPoint.copy(pt);
          cb.alive = false;
          cb.mesh.visible = false;
          const tier = cb.currentTier; // 2=Blue, 3=Purple, 4=Gold Mythic
          const tierColors = { 2: 0x38bdf8, 3: 0xa855f7, 4: 0xfbbf24 };
          this.spawnExplosionVFX(cb.position.clone(), 5.5, tierColors[tier], 0.55);
          window.SFX.playExplosion(false);
          window.SFX.playEvoUpgrade();
          // Drop Mythic Loot Box directly underneath on the ground!
          const dropY = this.game.world.getGroundHeight(cb.position.x, cb.position.z, cb.position.y);
          const weaponKeys = Object.keys(window.GODWARS_DATA.WEAPONS);
          const randWep = weaponKeys[Math.floor(Math.random() * weaponKeys.length)];
          const boxMesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.85, 0),
            new THREE.MeshBasicMaterial({ color: tierColors[tier] })
          );
          boxMesh.position.set(cb.position.x, dropY + 0.85, cb.position.z);
          this.scene.add(boxMesh);
          this.game.world.supplyBins.push({
            id: 'cargodrop_' + Date.now(),
            x: cb.position.x,
            z: cb.position.z,
            opened: false,
            isCarePackage: tier >= 4,
            mesh: boxMesh,
            lid: boxMesh,
            strip: boxMesh,
            loot: {
              weaponId: randWep,
              isMythicGold: tier >= 4,
              grenadeId: 'solar_bomb',
              shieldTier: tier >= 4 ? 5 : tier,
              attachmentTier: tier,
              shieldBattery: 3,
              phoenixKit: tier >= 4 ? 1 : 0
            }
          });
          if (shooter && shooter.isPlayer) {
            const label = tier >= 4 ? '★ GOLD CARGO BOT DESTROYED! MYTHIC LOOT DROPPED!' : `CARGO BOT DESTROYED! LV${tier} LOOT DROPPED!`;
            this.game.showBanner(label, tier >= 4 ? '#fde047' : '#a855f7');
          }
          this.spawnTracer(origin.clone().addScaledVector(dir, 0.7), hitPoint, tierColors[tier]);
          return;
        }
      }
    }

    const candidates = [...this.game.bots];
    if (this.game.player && this.game.player.alive) {
      candidates.push(this.game.player);
    }

    for (const target of candidates) {
      if (!target.alive || !this.isEnemy(shooter, target)) continue;
      const tPos = target.position;
      const height = target.knocked ? 1.15 : 2.15;
      const boxMin = new THREE.Vector3(tPos.x - 0.55, tPos.y, tPos.z - 0.55);
      const boxMax = new THREE.Vector3(tPos.x + 0.55, tPos.y + height, tPos.z + 0.55);
      const ray = new THREE.Ray(origin, dir);
      const pt = new THREE.Vector3();

      if (ray.intersectBox(new THREE.Box3(boxMin, boxMax), pt)) {
        const d = origin.distanceTo(pt);
        if (d < bestDist) {
          bestDist = d;
          hitPoint.copy(pt);
          hitTarget = target;
          isHeadshot = !target.knocked && (pt.y - tPos.y) >= 1.52;
        }
      }
    }

    if (shooter && shooter.isPlayer && this.game.isOnline && window.NET) window.NET.reportShot();
    const startTracer = origin.clone().addScaledVector(dir, 0.7);
    startTracer.y -= 0.08;
    this.spawnTracer(startTracer, hitPoint, isMythicGold ? 0xfde047 : weaponData.hexColor);
    if (shooter && shooter.isPlayer) {
      shooter.shotsFired = (shooter.shotsFired || 0) + 1;
    }

    if (hitTarget) {
      if (shooter && shooter.isPlayer) {
        shooter.shotsHit = (shooter.shotsHit || 0) + 1;
        if (isHeadshot) shooter.headshotsLanded = (shooter.headshotsLanded || 0) + 1;
      }
      let dmg = weaponData.damage * (isMythicGold ? 1.2 : 1.0) * hopupMult;
      if (shooter.perks && shooter.perks.dmgMult) dmg *= shooter.perks.dmgMult;
      if (isHeadshot) dmg = Math.round(dmg * weaponData.headshotMult);

      if (shooter.heroId === 'zeus' && hitTarget.shield > 0) {
        dmg = Math.round(dmg * 1.15);
      }
      if (shooter.heroId === 'hela' && hitTarget.hp < 60) {
        dmg = Math.round(dmg * 1.15);
      }
      if (shooter.ultBuffTimer && shooter.ultBuffTimer > 0 && shooter.heroId === 'loki') {
        dmg = Math.round(dmg * 1.35);
      }
      if (shooter.ampedWallBonus) {
        dmg = Math.round(dmg * 1.2);
      }
      if (shooter.heroId === 'thor' && shooter.thunderCharge >= 100) {
        shooter.thunderCharge = 0;
        dmg += 14;
        this.spawnLightningBolt(startTracer, hitPoint, 0x38bdf8, 0.35);
      }

      this.applyDamage(
        shooter,
        hitTarget,
        Math.round(dmg),
        isMythicGold ? `MYTHIC ${weaponData.divineName}` : weaponData.divineName,
        isHeadshot,
        hitPoint
      );
    } else if (bestDist < weaponData.range - 1) {
      // BATCH 4 & 6: Metallic 3D Impact Sparks + Molten Scorch Ring on Asgard surfaces
      this.spawnImpactSparks(hitPoint, isMythicGold ? 0xfde047 : 0xfbbf24, 5);
      this.spawnImpactScorch(hitPoint, isMythicGold ? 0xfde047 : weaponData.hexColor);
    }
  }

  spawnImpactSparks(pos, colorHex = 0xfbbf24, count = 6) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.22),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 })
      );
      m.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 9,
        2 + Math.random() * 6,
        (Math.random() - 0.5) * 9
      );
      this.scene.add(m);
      this.vfxList.push({ type: 'spark', mesh: m, vel, age: 0, maxAge: 0.32 });
    }
  }

  hasLivingSquadmate(victim) {
    const all = [...this.game.bots];
    if (this.game.player) all.push(this.game.player);
    for (const t of all) {
      if (t !== victim && t.alive && !t.knocked && t.teamId === victim.teamId) {
        return true;
      }
    }
    return false;
  }

  completeRevive(reviver, target) {
    if (!target || !target.alive || !target.knocked) return;
    target.knocked = false;
    target.reviveProgress = 0;
    target.hp = Math.max(45, Math.round(target.maxHp * 0.45));
    if (target.mesh) {
      target.mesh.scale.y = 1.0;
      if (target.mesh.userData.kdShield) {
        target.mesh.userData.kdShield.visible = false;
      }
    }
    window.SFX.playEvoUpgrade();
    if (target.isPlayer || (reviver && reviver.isPlayer)) {
      this.game.showBanner(`REVIVE COMPLETE: ${target.name} BACK IN THE FIGHT!`, '#10b981');
    }
  }

  applyDamage(attacker, victim, amount, sourceName, isHeadshot = false, hitWorldPos = null, bypassKnockShield = false) {
    if (!victim || !victim.alive) return;
    if (attacker && !this.isEnemy(attacker, victim)) return;
    // Online arena: damage to a human is reported to the server; the victim's client applies it.
    // We still run the local path below for hitmarkers / damage numbers, but never kill them locally.
    if (victim.isRemote && window.NET && this.game.isOnline && attacker && attacker.isPlayer) {
      window.NET.reportHit(victim, Math.round(amount), isHeadshot, sourceName);
    }

    let remaining = Math.round(amount);
    let hitShield = false;
    let shieldBroken = false;

    if (victim.knocked) {
      const shieldActive = victim.isPlayer ? victim.isADS : (victim.knockdownShieldHp > 0);
      if (!bypassKnockShield && shieldActive && victim.knockdownShieldHp > 0) {
        hitShield = true;
        if (victim.knockdownShieldHp >= remaining) {
          victim.knockdownShieldHp -= remaining;
          remaining = 0;
        } else {
          remaining -= victim.knockdownShieldHp;
          victim.knockdownShieldHp = 0;
          shieldBroken = true;
          if (victim.mesh && victim.mesh.userData.kdShield) {
            victim.mesh.userData.kdShield.visible = false;
          }
        }
      }
      if (remaining > 0) {
        victim.knockedHp = Math.max(0, (victim.knockedHp || 75) - remaining);
      }
      if (attacker && attacker.isPlayer) {
        window.SFX.playHitmarker(false, hitShield, shieldBroken);
        const worldPt = hitWorldPos || victim.position.clone().add(new THREE.Vector3(0, 0.8, 0));
        this.game.spawnFloatingDamageNumber(worldPt, amount, false, hitShield, shieldBroken, victim.shieldTier, victim);
      }
      if (victim.knockedHp <= 0) {
        this.handleElimination(attacker, victim, sourceName);
      }
      return;
    }

    if (victim.shield > 0) {
      hitShield = true;
      if (victim.shield >= remaining) {
        victim.shield -= remaining;
        remaining = 0;
        if (victim.shield === 0) shieldBroken = true;
      } else {
        remaining -= victim.shield;
        victim.shield = 0;
        shieldBroken = true;
      }
    }

    if (remaining > 0) {
      victim.hp = Math.max(0, victim.hp - remaining);
    }

    if (attacker && attacker !== victim) {
      attacker.damageDealt = (attacker.damageDealt || 0) + amount;
      const ultBonus = 1 + ((attacker.perks && attacker.perks.ultChargeBonus) || 0);
      attacker.ultCharge = Math.min(100, (attacker.ultCharge || 0) + amount * 0.25 * ultBonus);
      victim.lastDamageSource = {
        attackerName: attacker.name || 'ASGARD CONTENDER',
        weaponName: sourceName || 'DIVINE WEAPON',
        amount
      };

      const tiers = window.GODWARS_DATA.EVO_TIERS;
      for (let tLvl = 5; tLvl >= 2; tLvl--) {
        const prevThreshold = tiers[tLvl - 1] ? tiers[tLvl - 1].nextThreshold : 9999;
        if (attacker.damageDealt >= prevThreshold && attacker.shieldTier < tLvl) {
          attacker.shieldTier = tLvl;
          attacker.maxShield = tiers[tLvl].maxShield;
          attacker.shield = Math.min(attacker.maxShield, attacker.shield + 25);
          if (attacker.isPlayer) {
            window.SFX.playEvoUpgrade();
            this.game.showBanner(`RUNE ARMOR UPGRADED: ${tiers[tLvl].name} (${attacker.maxShield})`, tiers[tLvl].color);
            if (tLvl === 2 || tLvl === 3) {
              this.game.offerLegendPerkUpgrade(tLvl);
            }
          }
          break;
        }
      }
    }

    // Enemy 3D Hit-Flinch Stagger & Knockback Impulse (Makes shooting bots feel visceral!)
    if (!victim.isPlayer && victim.alive) {
      victim.hitFlinchTimer = 0.22;
      if (attacker && victim.position) {
        const kb = victim.position.clone().sub(attacker.position).setY(0);
        if (kb.lengthSq() > 0.01) {
          kb.normalize();
          const push = (isHeadshot || shieldBroken) ? 0.45 : 0.16;
          victim.position.x += kb.x * push;
          victim.position.z += kb.z * push;
        }
      }
    }

    if (shieldBroken) {
      const tierHex = (window.GODWARS_DATA.EVO_TIERS[victim.shieldTier] || { hex: 0x38bdf8 }).hex;
      this.spawnImpactSparks(hitWorldPos || victim.position.clone().add(new THREE.Vector3(0, 1.3, 0)), tierHex, 10);
      if (attacker && attacker.isPlayer) {
        this.spawnEnergyOrbs(victim.position, tierHex, 3);
      }
      if (victim.isPlayer && this.game.triggerShieldBreakFlash) {
        this.game.triggerShieldBreakFlash();
      }
    }

    if (attacker && attacker.isPlayer) {
      if (this.game.registerComboHit) {
        this.game.registerComboHit(amount, isHeadshot, shieldBroken);
      }
      window.SFX.playHitmarker(isHeadshot, hitShield, shieldBroken);
      const worldPt = hitWorldPos || victim.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      this.game.spawnFloatingDamageNumber(worldPt, amount, isHeadshot, hitShield, shieldBroken, victim.shieldTier, victim);
    }

    if (victim.isPlayer && attacker && attacker !== victim) {
      this.game.triggerDamageIndicator(attacker.position);
    }

    if (victim.isRemote) { victim.hp = Math.max(1, victim.hp); return; } // server/victim decides deaths

    if (victim.hp <= 0 && victim.alive) {
      const hasTeammate = this.hasLivingSquadmate(victim);
      const hasSelfRevive = victim.shieldTier >= 4 && !victim.usedSelfRevive;
      const canEnterKnockdown = !victim.isDummy && sourceName !== 'Ragnarok Storm Ring' && (hasTeammate || hasSelfRevive || !victim.isPlayer);

      if (canEnterKnockdown && !victim.knocked) {
        victim.knocked = true;
        victim.knockedHp = 80;
        victim.knockdownShieldHp = victim.shieldTier >= 3 ? 140 : 90;
        victim.bleedoutTimer = 24.0;
        victim.hp = 1;

        if (victim.mesh) {
          victim.mesh.scale.y = 0.58;
          if (victim.mesh.userData.kdShield) {
            const tierInfo = window.GODWARS_DATA.EVO_TIERS[victim.shieldTier] || window.GODWARS_DATA.EVO_TIERS[2];
            victim.mesh.userData.kdShield.material.color.setHex(tierInfo.hex);
            victim.mesh.userData.kdShield.visible = true;
          }
        }

        if (victim.isPlayer) {
          this.game.showBanner(
            hasSelfRevive
              ? 'KNOCKED DOWN! HOLD [ADS] FOR KNOCKDOWN SHIELD • PRESS [E] TO SELF-REVIVE!'
              : 'KNOCKED DOWN! HOLD [ADS] FOR KNOCKDOWN SHIELD WHILE SQUADMATE REVIVES YOU!',
            '#fbbf24'
          );
        } else if (attacker && attacker.isPlayer) {
          window.SFX.playKillSound();
          this.game.showBanner(`KNOCKED DOWN ${victim.name} • PRESS [E] NEARBY FOR FINISHER!`, '#fbbf24');
        }
      } else {
        this.handleElimination(attacker, victim, sourceName);
      }
    }
  }

  handleElimination(killer, victim, weaponName) {
    if (this.game.isOnline) {
      if (victim.isRemote) return;
      if (victim.isPlayer && victim.alive) {
        victim.alive = false;
        victim.knocked = false;
        if (window.NET) window.NET.reportDeath(killer, weaponName);
      }
      return;
    }
    if (victim.isDummy) {
      if (killer && killer.isPlayer) {
        window.SFX.playKillSound();
        killer.kills = (killer.kills || 0) + 1;
        this.game.showEliminationPopup(victim.name, victim.heroId, killer.kills);
      }
      victim.hp = victim.maxHp;
      victim.shield = victim.maxShield;
      victim.knocked = false;
      return;
    }

    victim.alive = false;
    victim.knocked = false;
    if (victim.mesh) victim.mesh.visible = false;

    this.spawnDeathBox(victim);

    // Squad Wipe check: if all living members of victim's team are only knocked down, eliminate them too!
    const all = [...this.game.bots];
    if (this.game.player) all.push(this.game.player);
    const remainingStandingOnTeam = all.filter(t => t.alive && !t.knocked && t.teamId === victim.teamId);
    if (remainingStandingOnTeam.length === 0) {
      const knockedOnTeam = all.filter(t => t.alive && t.knocked && t.teamId === victim.teamId && !(t.shieldTier >= 4 && !t.usedSelfRevive));
      knockedOnTeam.forEach(kt => {
        kt.alive = false;
        kt.knocked = false;
        if (kt.mesh) kt.mesh.visible = false;
        this.spawnDeathBox(kt);
      });

      if (killer && killer.isPlayer && victim.teamId !== killer.teamId && this.game.gameMode === 'trios') {
        killer.damageDealt += 50;
        window.SFX.playSquadWipe();
        this.game.showBanner(`☠️ SQUAD WIPED! (+50 RUNE BONUS)`, '#fbbf24');
      }
    }

    if (killer && killer !== victim) {
      killer.kills = (killer.kills || 0) + 1;

      if (killer.heroId === 'hades') {
        killer.shield = Math.min(killer.maxShield, killer.shield + 45);
        killer.hp = Math.min(killer.maxHp, killer.hp + 30);
        if (killer.isPlayer) this.game.showBanner('SOUL SIPHON: +45 SHIELD / +30 HP', '#a855f7');
      }
      if (killer.perks && killer.perks.shieldOnKill) {
        killer.shield = Math.min(killer.maxShield, killer.shield + killer.perks.shieldOnKill);
        if (killer.isPlayer) this.game.showBanner(`PERK SIPHON: +${killer.perks.shieldOnKill} RUNE ARMOR!`, '#38bdf8');
      }

      if (killer.isPlayer) {
        window.SFX.playKillSound();
        this.spawnEnergyOrbs(victim.position, 0xfde047, 5);
        this.game.showEliminationPopup(victim.name, victim.heroId, killer.kills);
        if (this.game.registerMultiKillStreak) this.game.registerMultiKillStreak();
      }

      this.game.updateKillLeader(killer);
    }

    const killerName = killer ? killer.name : 'RAGNAROK RING';
    if (!this.game.firstBloodTriggered && !this.game.isFiringRange) {
      this.game.firstBloodTriggered = true;
      this.game.showBanner(`🩸 FIRST BLOOD: ${killerName} ELIMINATED ${victim.name}!`, '#f43f5e');
      window.SFX.announce('First blood.');
    }
    this.game.addKillFeed(killerName, victim.name, weaponName);
    this.game.checkMatchState();
  }

  spawnDeathBox(victim) {
    const boxGeo = new THREE.BoxGeometry(1.3, 0.85, 0.9);
    const tierInfo = window.GODWARS_DATA.EVO_TIERS[Math.max(2, victim.shieldTier || 2)];
    const boxMat = new THREE.MeshStandardMaterial({
      color: tierInfo.hex,
      emissive: tierInfo.hex,
      emissiveIntensity: 0.35,
      metalness: 0.85,
      roughness: 0.2
    });
    const mesh = new THREE.Mesh(boxGeo, boxMat);
    mesh.position.set(victim.position.x, victim.position.y + 0.45, victim.position.z);
    this.scene.add(mesh);

    this.game.world.supplyBins.push({
      id: 'deathbox_' + Date.now() + '_' + Math.random(),
      x: victim.position.x,
      z: victim.position.z,
      opened: false,
      isDeathBox: true,
      victimName: victim.name,
      mesh,
      lid: mesh,
      strip: mesh,
      loot: {
        weaponId: victim.weaponId || 'm4a1',
        grenadeId: 'solar_bomb',
        shieldTier: Math.max(2, victim.shieldTier || 2),
        attachmentTier: Math.min(4, Math.max(2, victim.shieldTier || 2)),
        shieldBattery: 2,
        medkit: 1
      }
    });
  }

  throwGrenade(thrower, origin, dir, grenadeId) {
    const gData = window.GODWARS_DATA.GRENADES[grenadeId] || window.GODWARS_DATA.GRENADES.solar_bomb;
    const gGroup = new THREE.Group();
    const fallback = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 1),
      new THREE.MeshBasicMaterial({ color: gData.hexColor })
    );
    gGroup.add(fallback);
    const glbMap = { solar_bomb: 'bomb_solar', apollo_flash: 'bomb_flash', yggdrasil_arc: 'bomb_arc' };
    if (window.ModelFactory && window.ModelFactory.attachBlenderGLB) {
      window.ModelFactory.attachBlenderGLB(glbMap[grenadeId] || 'bomb_solar', gGroup, null, fallback);
    }
    gGroup.position.copy(origin);
    this.scene.add(gGroup);

    const vel = dir.clone().multiplyScalar(28);
    vel.y += 6.5;

    this.grenades.push({
      thrower,
      data: gData,
      mesh: gGroup,
      velocity: vel,
      fuse: gData.fuseTime,
      stuck: false
    });
  }

  detonateGrenade(g) {
    const pos = g.mesh.position.clone();
    this.scene.remove(g.mesh);

    const isFlash = g.data.id === 'apollo_flash';
    window.SFX.playExplosion(isFlash);
    this.spawnExplosionVFX(pos, g.data.radius, g.data.hexColor, isFlash ? 0.45 : 0.65);

    const targets = [...this.game.bots];
    if (this.game.player && this.game.player.alive) targets.push(this.game.player);

    for (const t of targets) {
      if (!t.alive || (g.thrower && !this.isEnemy(g.thrower, t) && t !== g.thrower)) continue;
      const dist = t.position.distanceTo(pos);
      if (dist <= g.data.radius) {
        const falloff = 1 - (dist / g.data.radius) * 0.65;
        const dmg = Math.round(g.data.damage * falloff);
        if (this.isEnemy(g.thrower, t)) {
          this.applyDamage(g.thrower, t, dmg, g.data.name, false, t.position, true);
        }

        if (isFlash && this.isEnemy(g.thrower, t)) {
          t.flashBlindTimer = 4.2 * falloff;
          if (t.isPlayer) {
            this.game.triggerFlashbangOverlay(falloff);
          }
        } else if (this.isEnemy(g.thrower, t)) {
          const push = t.position.clone().sub(pos).normalize();
          if (t.velocity) {
            t.velocity.x += push.x * 11 * falloff;
            t.velocity.y += 7 * falloff;
            t.velocity.z += push.z * 11 * falloff;
          }
        }
      }
    }
  }

  // =========================================================================
  // 6 HEROES TACTICAL (Q) & ULTIMATE (Z) ABILITIES
  // =========================================================================
  triggerHeroTactical(actor, origin, lookDir) {
    const heroId = actor.heroId;
    window.SFX.playAbility('tactical');

    if (heroId === 'loki') {
      const decoyMesh = window.ModelFactory.createHeroModel('loki');
      decoyMesh.position.copy(actor.position);
      const forwardYaw = Math.atan2(lookDir.x, lookDir.z);
      decoyMesh.rotation.y = forwardYaw;
      this.scene.add(decoyMesh);

      const moveDir = new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize();
      this.decoys.push({
        owner: actor,
        mesh: decoyMesh,
        position: actor.position.clone(),
        dir: moveDir,
        speed: 9.5,
        ttl: 6.0
      });

      actor.cloakTimer = 3.5;
      if (actor.isPlayer) this.game.showBanner('LOKI: PHANTOM DECOY & PHASE CLOAK ACTIVE', '#10b981');

    } else if (heroId === 'thor') {
      const targetPt = origin.clone().addScaledVector(lookDir, 28);
      targetPt.y = Math.max(0.5, targetPt.y);
      this.spawnLightningBolt(origin.clone().addScaledVector(lookDir, 1), targetPt, 0x38bdf8, 0.45);
      this.spawnExplosionVFX(targetPt, 8.5, 0x38bdf8, 0.45);

      const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
      targets.forEach(t => {
        if (t.position.distanceTo(targetPt) <= 11 || t.position.distanceTo(actor.position) <= 12) {
          this.spawnLightningBolt(targetPt, t.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xfbbf24, 0.45);
          this.applyDamage(actor, t, 38, 'Mjölnir Arc Bolt', false, t.position);
          t.slowTimer = 3.0;
        }
      });
      if (actor.isPlayer) this.game.showBanner('THOR: MJÖLNIR ARC BOLT UNLEASHED', '#38bdf8');

    } else if (heroId === 'hades') {
      const waveCenter = origin.clone().addScaledVector(lookDir, 10);
      waveCenter.y = actor.position.y + 1.0;
      this.spawnExplosionVFX(waveCenter, 10, 0xa855f7, 0.5);

      let totalDrain = 0;
      const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
      targets.forEach(t => {
        if (t.position.distanceTo(waveCenter) <= 11.5) {
          this.applyDamage(actor, t, 35, 'Stygian Soul Wave', false, t.position);
          totalDrain += 35;
        }
      });
      const healAmt = Math.max(25, totalDrain);
      actor.hp = Math.min(actor.maxHp, actor.hp + healAmt * 0.5);
      actor.shield = Math.min(actor.maxShield, actor.shield + healAmt * 0.5);
      if (actor.isPlayer) this.game.showBanner(`HADES: STYGIAN DRAIN (+${Math.round(healAmt)} HP/SHIELD)`, '#a855f7');

    } else if (heroId === 'zeus') {
      const wallPos = actor.position.clone().addScaledVector(new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize(), 3.2);
      const wallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 2.6, 0.25),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.42 })
      );
      wallMesh.position.set(wallPos.x, actor.position.y + 1.3, wallPos.z);
      wallMesh.rotation.y = Math.atan2(lookDir.x, lookDir.z);
      this.scene.add(wallMesh);

      actor.ampedWallBonus = true;
      setTimeout(() => { actor.ampedWallBonus = false; }, 10000);
      this.activeZones.push({ type: 'aegis_wall', owner: actor, mesh: wallMesh, ttl: 10.0 });
      if (actor.isPlayer) this.game.showBanner('ZEUS: AEGIS THUNDER WALL DEPLOYED (+20% AMPED SHOTS)', '#facc15');

    } else if (heroId === 'hela') {
      [-0.12, 0, 0.12].forEach(angleOffset => {
        const dir = lookDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset).normalize();
        const endPt = origin.clone().addScaledVector(dir, 36);
        this.spawnTracer(origin, endPt, 0x14b8a6, 3);

        const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
        targets.forEach(t => {
          const toTarget = t.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin);
          const proj = toTarget.dot(dir);
          if (proj > 0 && proj < 36) {
            const perpDist = toTarget.clone().sub(dir.clone().multiplyScalar(proj)).length();
            if (perpDist < 1.85) {
              this.applyDamage(actor, t, 32, 'Hela Necrosword Volley', false, t.position);
            }
          }
        });
      });
      if (actor.isPlayer) this.game.showBanner('HELA: NECROSWORD VOLLEY FIRED', '#14b8a6');

    } else if (heroId === 'valkyrie') {
      const aimCenter = origin.clone().addScaledVector(lookDir, 22);
      aimCenter.y = this.game.world.getGroundHeight(aimCenter.x, aimCenter.z, 0);

      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (!this.game.matchActive) return;
          const impact = aimCenter.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            0.3,
            (Math.random() - 0.5) * 8
          ));
          const skyStart = origin.clone().add(new THREE.Vector3(0, 8, 0));
          this.spawnTracer(skyStart, impact, 0xf97316, 2);
          this.spawnExplosionVFX(impact, 5.5, 0xf97316, 0.4);
          window.SFX.playExplosion(false);

          const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
          targets.forEach(t => {
            if (t.position.distanceTo(impact) <= 6.5) {
              this.applyDamage(actor, t, 22, 'Celestial Spear Swarm', false, t.position);
              t.slowTimer = 2.5;
            }
          });
        }, i * 110);
      }
      if (actor.isPlayer) this.game.showBanner('VALKYRIE: CELESTIAL SPEAR SWARM LAUNCHED', '#f97316');
    }
  }

  triggerHeroUltimate(actor, origin, lookDir) {
    const heroId = actor.heroId;
    window.SFX.playAbility('ultimate');

    if (heroId === 'loki') {
      actor.ultBuffTimer = 10.0;
      actor.cloakTimer = 4.0;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const decoyMesh = window.ModelFactory.createHeroModel('loki');
        decoyMesh.position.copy(actor.position);
        decoyMesh.rotation.y = angle;
        this.scene.add(decoyMesh);
        this.decoys.push({
          owner: actor,
          mesh: decoyMesh,
          position: actor.position.clone(),
          dir,
          speed: 8.8,
          ttl: 8.5
        });
      }
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: RAGNAROK MIRROR REALM (+35% CRIT DMG)', '#10b981');

    } else if (heroId === 'thor') {
      if (actor.velocity) {
        actor.velocity.y = 21;
        actor.velocity.x += lookDir.x * 16;
        actor.velocity.z += lookDir.z * 16;
      }
      setTimeout(() => {
        if (!actor.alive || !this.game.matchActive) return;
        const slamPos = actor.position.clone();
        const skyTop = slamPos.clone().add(new THREE.Vector3(0, 45, 0));
        this.spawnLightningBolt(skyTop, slamPos, 0x38bdf8, 0.7);
        this.spawnExplosionVFX(slamPos, 16, 0x38bdf8, 0.75);
        window.SFX.playExplosion(false);

        const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
        targets.forEach(t => {
          const d = t.position.distanceTo(slamPos);
          if (d <= 16) {
            const dmg = Math.round(90 * (1 - d / 22));
            this.applyDamage(actor, t, dmg, 'Bifrost Sky Slam', false, t.position);
          }
        });
      }, 850);
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: BIFROST SKY SLAM!', '#38bdf8');

    } else if (heroId === 'hades') {
      const domeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(14, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide
        })
      );
      domeMesh.position.copy(actor.position);
      this.scene.add(domeMesh);

      this.activeZones.push({
        type: 'tartarus_dome',
        owner: actor,
        position: actor.position.clone(),
        radius: 14,
        mesh: domeMesh,
        ttl: 11.0,
        tickTimer: 0
      });
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: DOMAIN OF TARTARUS DEPLOYED', '#a855f7');

    } else if (heroId === 'zeus') {
      const targetCenter = origin.clone().addScaledVector(lookDir, 24);
      targetCenter.y = 0;

      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (!this.game.matchActive) return;
          const strikePos = targetCenter.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 16,
            0,
            (Math.random() - 0.5) * 16
          ));
          const skyPos = strikePos.clone().add(new THREE.Vector3(0, 80, 0));
          this.spawnLightningBolt(skyPos, strikePos, 0xfacc15, 0.55);
          this.spawnExplosionVFX(strikePos, 9, 0xfacc15, 0.55);
          window.SFX.playExplosion(false);

          const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(actor, t));
          targets.forEach(t => {
            if (t.position.distanceTo(strikePos) <= 9.5) {
              this.applyDamage(actor, t, 45, 'Wrath of Olympus', false, t.position);
            }
          });
        }, i * 320);
      }
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: WRATH OF OLYMPUS ORBITAL BARRAGE!', '#facc15');

    } else if (heroId === 'hela') {
      actor.ultBuffTimer = 10.0;
      actor.shield = Math.min(actor.maxShield + 50, actor.shield + 75);
      actor.hp = Math.min(actor.maxHp, actor.hp + 40);
      this.spawnExplosionVFX(actor.position, 7, 0x14b8a6, 0.5);
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: EMPRESS OF HELHEIM (INFINITE AMMO & DEATH ARMOR)', '#14b8a6');

    } else if (heroId === 'valkyrie') {
      window.SFX.playJumpPad();
      actor.position.y += 3.0;
      if (actor.velocity) {
        actor.velocity.y = 42;
      }
      actor.skydiving = true;
      actor.ultBuffTimer = 12.0;
      if (actor.isPlayer) this.game.showBanner('ULTIMATE: SKYWARD ASCENSION & VALHALLA AERIAL SCAN!', '#f97316');
    }
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.age += dt;
      const alpha = Math.max(0, 1 - tr.age / tr.maxAge);
      tr.line.material.opacity = alpha;
      tr.spark.material.opacity = alpha;
      tr.spark.scale.setScalar(1 + tr.age * 10);
      if (tr.age >= tr.maxAge) {
        this.scene.remove(tr.line);
        this.scene.remove(tr.spark);
        this.tracers.splice(i, 1);
      }
    }

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.age += dt;
      s.velocity.y -= 18 * dt;
      s.mesh.position.addScaledVector(s.velocity, dt);
      s.mesh.rotation.x += 14 * dt;
      s.mesh.rotation.z += 11 * dt;
      if (s.age >= s.maxAge) {
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
      }
    }

    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;

      if (g.stuck && g.stuckTarget && g.stuckTarget.alive) {
        g.mesh.position.set(g.stuckTarget.position.x, g.stuckTarget.position.y + 1.25, g.stuckTarget.position.z);
        g.mesh.rotation.y += 14 * dt;
      } else if (!g.stuck) {
        g.velocity.y -= 22 * dt;
        g.mesh.position.addScaledVector(g.velocity, dt);
        g.mesh.rotation.x += 8 * dt;
        g.mesh.rotation.y += 6 * dt;

        // BATCH 5: Authentic Apex Arc Star Stick Mechanic!
        if (g.data.id === 'yggdrasil_arc') {
          const targets = [...this.game.bots];
          if (this.game.player && this.game.player.alive) targets.push(this.game.player);
          for (const t of targets) {
            if (!t.alive || !this.isEnemy(g.thrower, t)) continue;
            const tCenter = new THREE.Vector3(t.position.x, t.position.y + 1.2, t.position.z);
            if (g.mesh.position.distanceTo(tCenter) <= 1.45) {
              g.stuck = true;
              g.stuckTarget = t;
              window.SFX.playArcStarStick();
              this.applyDamage(g.thrower, t, 30, 'Yggdrasil Arc Rune (STUCK)', false, tCenter);
              if (g.thrower && g.thrower.isPlayer) {
                this.game.showBanner(`⚡ ARC RUNE STUCK ON ${t.name}! (+30)`, '#38bdf8');
              }
              break;
            }
          }
        }

        const groundY = this.game.world.getGroundHeight(g.mesh.position.x, g.mesh.position.z, g.mesh.position.y);
        if (!g.stuck && g.mesh.position.y <= groundY + 0.22) {
          g.mesh.position.y = groundY + 0.22;
          if (g.data.id === 'yggdrasil_arc') {
            g.stuck = true;
          } else {
            g.velocity.y = Math.abs(g.velocity.y) * 0.42;
            g.velocity.x *= 0.65;
            g.velocity.z *= 0.65;
          }
        }
      }

      if (g.fuse <= 0) {
        this.detonateGrenade(g);
        this.grenades.splice(i, 1);
      }
    }

    for (let i = this.vfxList.length - 1; i >= 0; i--) {
      const v = this.vfxList[i];
      v.age += dt;
      const t = v.age / v.maxAge;
      if (v.type === 'explosion') {
        const s = Math.max(0.1, v.maxRadius * Math.sin(t * Math.PI * 0.5));
        v.sphere.scale.setScalar(s);
        v.sphere.material.opacity = Math.max(0, 0.72 * (1 - t));
        v.ring.scale.setScalar(s * 1.15);
        v.ring.material.opacity = Math.max(0, 0.9 * (1 - t));
        if (v.age >= v.maxAge) {
          this.scene.remove(v.sphere);
          this.scene.remove(v.ring);
          this.vfxList.splice(i, 1);
        }
      } else if (v.type === 'bolt') {
        v.mesh.material.opacity = Math.max(0, 1 - t);
        if (v.age >= v.maxAge) {
          this.scene.remove(v.mesh);
          this.vfxList.splice(i, 1);
        }
      } else if (v.type === 'spark') {
        v.vel.y -= 18 * dt;
        v.mesh.position.addScaledVector(v.vel, dt);
        v.mesh.material.opacity = Math.max(0, 1 - t);
        if (v.age >= v.maxAge) {
          this.scene.remove(v.mesh);
          this.vfxList.splice(i, 1);
        }
      } else if (v.type === 'holospray') {
        v.mesh.rotation.y += 1.4 * dt;
        v.mesh.position.y = v.baseY + Math.sin(v.age * 3.0) * 0.14;
        if (v.age >= v.maxAge) {
          this.scene.remove(v.mesh);
          this.vfxList.splice(i, 1);
        }
      } else if (v.type === 'pillar') {
        v.mesh.scale.set(1 + t * 0.85, 1 + t * 0.35, 1 + t * 0.85);
        v.mesh.rotation.y += dt * 3.5;
        v.mesh.material.opacity = Math.max(0, 0.52 * (1 - t));
        if (v.age >= v.maxAge) {
          this.scene.remove(v.mesh);
          this.vfxList.splice(i, 1);
        }
      } else if (v.type === 'slash') {
        v.mesh.scale.setScalar(0.85 + t * 0.65);
        v.mesh.children.forEach(c => { if (c.material) c.material.opacity = Math.max(0, 0.88 * (1 - t)); });
        if (v.age >= v.maxAge) {
          this.scene.remove(v.mesh);
          this.vfxList.splice(i, 1);
        }
      } else if (v.type === 'scorch') {
        v.mesh.material.opacity = Math.max(0, 0.85 * (1 - t));
        if (v.age >= v.maxAge) {
          this.scene.remove(v.mesh);
          this.vfxList.splice(i, 1);
        }
      }
    }

    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.ttl -= dt;
      d.position.addScaledVector(d.dir, d.speed * dt);
      const col = this.game.world.resolveHorizontalCollision(d.position.x, d.position.z, d.position.y, 0.45);
      d.position.x = col.x;
      d.position.z = col.z;
      d.position.y = this.game.world.getGroundHeight(d.position.x, d.position.z, d.position.y);
      d.mesh.position.copy(d.position);

      const t = performance.now() * 0.012;
      if (d.mesh.userData.leftLeg) {
        d.mesh.userData.leftLeg.rotation.x = Math.sin(t) * 0.7;
        d.mesh.userData.rightLeg.rotation.x = -Math.sin(t) * 0.7;
      }

      if (d.ttl <= 0) {
        this.scene.remove(d.mesh);
        this.decoys.splice(i, 1);
      }
    }

    for (let i = this.activeZones.length - 1; i >= 0; i--) {
      const z = this.activeZones[i];
      z.ttl -= dt;
      if (z.type === 'tartarus_dome') {
        z.tickTimer += dt;
        if (z.tickTimer >= 0.5) {
          z.tickTimer = 0;
          if (z.owner && z.owner.alive && z.owner.position.distanceTo(z.position) <= z.radius) {
            z.owner.shield = Math.min(z.owner.maxShield, z.owner.shield + 8);
          }
          const targets = [...this.game.bots, this.game.player].filter(t => t && t.alive && this.isEnemy(z.owner, t));
          targets.forEach(t => {
            if (t.position.distanceTo(z.position) <= z.radius) {
              this.applyDamage(z.owner, t, 7, 'Domain of Tartarus', false, t.position);
            }
          });
        }
      }

      if (z.ttl <= 0) {
        this.scene.remove(z.mesh);
        this.activeZones.splice(i, 1);
      }
    }

    // Update Euphoria-Style Homing Divine Energy Orbs (Pop out, then magnet-fly into Player!)
    const p = this.game.player;
    for (let i = this.energyOrbs.length - 1; i >= 0; i--) {
      const o = this.energyOrbs[i];
      o.age += dt;
      o.mesh.rotation.y += dt * 7;
      o.mesh.rotation.x += dt * 5;
      if (o.age < 0.38 || !p || !p.alive) {
        o.vel.y -= 15 * dt;
        o.mesh.position.addScaledVector(o.vel, dt);
      } else {
        const target = p.position.clone().add(new THREE.Vector3(0, 1.15, 0));
        const toP = target.sub(o.mesh.position);
        const dist = toP.length();
        if (dist < 1.15 || o.age > 4.0) {
          if (dist < 1.15 && p.alive) {
            p.shield = Math.min(p.maxShield, p.shield + 10);
            p.ultCharge = Math.min(100, (p.ultCharge || 0) + 7);
            window.SFX.playArmorSwap();
          }
          this.scene.remove(o.mesh);
          this.energyOrbs.splice(i, 1);
          continue;
        }
        toP.normalize();
        o.mesh.position.addScaledVector(toP, Math.min(dist, (15 + o.age * 22) * dt));
      }
    }

    // BATCH 2: Update Physical Flying 3D Bullet Projectiles (with slight realistic gravity drop!)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.age += dt;
      pr.vel.y -= 9.8 * dt;
      pr.mesh.position.addScaledVector(pr.vel, dt);
      if (pr.age >= pr.maxAge) {
        this.scene.remove(pr.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
}

window.CombatManager = CombatManager;
