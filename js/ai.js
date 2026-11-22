/**
 * GOD WARS: ASGARD ROYALE — SMART SQUAD & CONTENDER AI ENGINE
 * - Supports Trios Squad Royale (2 Allied AI God Squadmates on Player's Team 0 + Rival 3-God Squads!)
 * - Supports Solos Free-For-All (16 Independent Contenders) & Firing Range Combat Dummies
 * - Allied Squadmates follow Player & Player Pings [F], focus-fire hostiles, and REVIVE Knocked Player/Teammates!
 * - 3D Glowing Bifrost Skydive Trails during aerial drop
 */

class AIContender {
  constructor(id, name, heroId, weaponId, game, isDummy = false, teamId = null, isAlly = false) {
    this.id = id;
    this.name = name;
    this.heroId = heroId;
    this.weaponId = weaponId;
    this.game = game;
    this.isPlayer = false;
    this.isDummy = isDummy;
    this.teamId = teamId !== null ? teamId : (id + 1);
    this.isAlly = isAlly;

    const hData = window.GODWARS_DATA.HEROES[heroId] || window.GODWARS_DATA.HEROES.thor;
    this.maxHp = hData.maxHp || 100;
    this.hp = this.maxHp;
    this.shieldTier = isDummy ? ((id % 4) + 2) : isAlly ? 2 : ((id % 3) + 1);
    const tierInfo = window.GODWARS_DATA.EVO_TIERS[this.shieldTier] || window.GODWARS_DATA.EVO_TIERS[2];
    this.maxShield = tierInfo.maxShield;
    this.shield = this.maxShield;

    this.alive = true;
    this.knocked = false;
    this.knockedHp = 80;
    this.knockdownShieldHp = 100;
    this.bleedoutTimer = 24.0;
    this.reviveProgress = 0;
    this.inDropship = !isDummy;
    this.skydiving = false;
    this.kills = 0;
    this.damageDealt = 0;
    this.ultCharge = 35;

    const pois = window.GODWARS_DATA.POIS;
    // Squads drop together at the same POI!
    const poiIndex = isAlly ? 0 : (this.teamId % pois.length);
    const poi = pois[poiIndex];
    const angle = (id * 2.1) % (Math.PI * 2);
    const dist = 6 + (id % 3) * 7;
    this.dropTarget = new THREE.Vector3(
      poi.x + Math.cos(angle) * dist,
      0,
      poi.z + Math.sin(angle) * dist
    );
    this.dropDelay = isAlly ? 1.5 : (1.0 + (this.teamId / 6) * 8.5);

    this.position = new THREE.Vector3(this.dropTarget.x, isDummy ? 0 : 115, this.dropTarget.z);
    this.velocity = new THREE.Vector3();
    this.moveTarget = this.dropTarget.clone();

    this.fireTimer = 0;
    this.tacticalTimer = 6 + Math.random() * 7;
    this.retargetTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.flashBlindTimer = 0;
    this.slowTimer = 0;
    this.cloakTimer = 0;
    this.ultBuffTimer = 0;

    this.mesh = window.ModelFactory.createHeroModel(heroId);
    this.mesh.position.copy(this.position);
    this.mesh.visible = isDummy;

    // 3D Skydive Trail Ribbon attached to Hero
    const trailGeo = new THREE.CylinderGeometry(0.08, 0.45, 7.5, 8);
    const trailMat = new THREE.MeshBasicMaterial({
      color: isAlly ? 0x38bdf8 : hData.hexColor,
      transparent: true,
      opacity: 0.65
    });
    this.diveTrail = new THREE.Mesh(trailGeo, trailMat);
    this.diveTrail.position.set(0, 4.2, 0);
    this.diveTrail.visible = false;
    this.mesh.add(this.diveTrail);

    this.game.scene.add(this.mesh);
  }

  update(dt, elapsedMatchTime) {
    if (!this.alive) return;

    if (this.isDummy) {
      const rs = this.game.rangeSettings || { movingDummies: true, combatDummies: false };
      if (rs.movingDummies) {
        const amp = this.id % 2 === 1 ? 7.5 : 4.5;
        const spd = this.id % 2 === 1 ? 2.1 : 1.4;
        this.position.x = this.dropTarget.x + Math.sin(elapsedMatchTime * spd + this.id) * amp;
      }
      this.position.y = this.game.world.getGroundHeight(this.position.x, this.position.z, this.position.y);
      this.mesh.position.copy(this.position);
      if (this.game.player && this.game.player.alive) {
        const toP = this.game.player.position.clone().sub(this.position);
        this.mesh.rotation.y = Math.atan2(toP.x, toP.z);
        if (rs.combatDummies && toP.length() < 42) {
          this.fireTimer -= dt;
          if (this.fireTimer <= 0) {
            this.fireTimer = 0.85 + Math.random() * 0.45;
            const origin = this.position.clone().add(new THREE.Vector3(0, 1.5, 0));
            const dir = this.game.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(origin).normalize();
            dir.x += (Math.random() - 0.5) * 0.14;
            dir.y += (Math.random() - 0.5) * 0.12;
            dir.z += (Math.random() - 0.5) * 0.14;
            this.game.combat.fireWeapon(this, origin, dir.normalize(), this.weaponId, false);
          }
        }
      }
      return;
    }

    // Handle Knocked Down (DBNO) Crawling & Bleedout
    if (this.knocked) {
      this.bleedoutTimer -= dt;
      // Crawl slowly toward nearest living teammate
      const ally = this.findNearestLivingTeammate();
      if (ally) {
        const toAlly = ally.position.clone().sub(this.position);
        toAlly.y = 0;
        if (toAlly.length() > 2.2) {
          toAlly.normalize();
          this.position.x += toAlly.x * 1.6 * dt;
          this.position.z += toAlly.z * 1.6 * dt;
          this.position.y = this.game.world.getGroundHeight(this.position.x, this.position.z, this.position.y);
          this.mesh.position.copy(this.position);
        }
      }
      if (this.game.player) {
        const toP = this.game.player.position.clone().sub(this.position);
        this.mesh.rotation.y = Math.atan2(toP.x, toP.z);
      }
      if (this.bleedoutTimer <= 0) {
        this.game.combat.handleElimination(null, this, 'Bleedout');
      }
      return;
    }

    if (this.flashBlindTimer > 0) this.flashBlindTimer -= dt;
    if (this.slowTimer > 0) this.slowTimer -= dt;
    if (this.cloakTimer > 0) this.cloakTimer -= dt;
    if (this.ultBuffTimer > 0) this.ultBuffTimer -= dt;
    if (this.hitFlinchTimer > 0) {
      this.hitFlinchTimer -= dt;
      if (this.mesh && this.mesh.userData.torso) {
        this.mesh.userData.torso.rotation.x = -Math.sin((this.hitFlinchTimer / 0.22) * Math.PI) * 0.36;
      }
    } else if (this.mesh && this.mesh.userData.torso) {
      this.mesh.userData.torso.rotation.x = 0;
    }
    this.ultCharge = Math.min(100, this.ultCharge + dt * 1.4);

    // 1. Dropship & Skydive Phase
    if (this.inDropship) {
      // Allied Squadmates wait for Player to jump (or jump with Player!)
      const playerJumped = this.game.player && !this.game.player.inDropship;
      const shouldJump = this.isAlly ? playerJumped : (elapsedMatchTime >= this.dropDelay);

      if (shouldJump && this.game.dropship) {
        this.inDropship = false;
        this.skydiving = true;
        this.position.copy(this.game.dropship.position);
        this.position.x += (Math.random() - 0.5) * 7;
        this.position.z += (Math.random() - 0.5) * 7;
        this.mesh.visible = true;
        if (this.diveTrail) this.diveTrail.visible = true;
      } else {
        return;
      }
    }

    if (this.skydiving) {
      // Allied Squadmates follow the Player's landing spot during skydive!
      if (this.isAlly && this.game.player) {
        const offsetAngle = this.id * 2.4;
        this.dropTarget.set(
          this.game.player.position.x + Math.cos(offsetAngle) * 7,
          0,
          this.game.player.position.z + Math.sin(offsetAngle) * 7
        );
      }

      const toDrop = this.dropTarget.clone().sub(this.position);
      toDrop.y = 0;
      if (toDrop.length() > 2) {
        toDrop.normalize();
        this.position.x += toDrop.x * 28 * dt;
        this.position.z += toDrop.z * 28 * dt;
        this.mesh.rotation.y = Math.atan2(toDrop.x, toDrop.z);
      }
      this.position.y -= 24 * dt;
      const groundY = this.game.world.getGroundHeight(this.position.x, this.position.z, this.position.y);
      if (this.position.y <= groundY) {
        this.position.y = groundY;
        this.skydiving = false;
        if (this.diveTrail) this.diveTrail.visible = false;
      }
      this.mesh.position.copy(this.position);
      return;
    }

    if (this.diveTrail && this.diveTrail.visible) this.diveTrail.visible = false;

    // 2. Check Ragnarok Storm Ring Damage
    const distToRingCenter = Math.hypot(
      this.position.x - this.game.ringCenter.x,
      this.position.z - this.game.ringCenter.z
    );
    if (distToRingCenter > this.game.ringRadius) {
      this.ringDmgAccum = (this.ringDmgAccum || 0) + this.game.ringDamagePerSec * dt;
      if (this.ringDmgAccum >= 2) {
        const dmg = Math.floor(this.ringDmgAccum);
        this.ringDmgAccum -= dmg;
        this.game.combat.applyDamage(null, this, dmg, 'Ragnarok Storm Ring');
        if (!this.alive) return;
      }
    }

    // 3. Squad Revive Behaviour: Check if a Teammate (or Player!) is Knocked Down nearby!
    const knockedTeammate = this.findKnockedTeammate();
    if (knockedTeammate && (!this.currentEnemy || this.position.distanceTo(knockedTeammate.position) < 22)) {
      const distToKnocked = this.position.distanceTo(knockedTeammate.position);
      if (distToKnocked > 2.2) {
        const dir = knockedTeammate.position.clone().sub(this.position).normalize();
        this.position.x += dir.x * 7.4 * dt;
        this.position.z += dir.z * 7.4 * dt;
        this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      } else {
        // Perform Revive!
        knockedTeammate.reviveProgress = (knockedTeammate.reviveProgress || 0) + dt;
        if (knockedTeammate.isPlayer) {
          this.game.showBanner(`SQUADMATE ${this.name} REVIVING YOU (${Math.min(100, Math.round((knockedTeammate.reviveProgress / 3.0) * 100))}%)...`, '#10b981');
        }
        if (knockedTeammate.reviveProgress >= 3.0) {
          knockedTeammate.reviveProgress = 0;
          this.game.combat.completeRevive(this, knockedTeammate);
        }
      }
      this.updatePhysicsAndGround(dt);
      return;
    }

    // 4. Target Acquisition & Squad Following
    this.retargetTimer -= dt;
    if (this.retargetTimer <= 0) {
      this.retargetTimer = 0.55 + Math.random() * 0.35;
      this.currentEnemy = this.findBestTarget();

      if (distToRingCenter > this.game.ringRadius * 0.85) {
        const angle = Math.atan2(
          this.game.ringCenter.z - this.position.z,
          this.game.ringCenter.x - this.position.x
        ) + (Math.random() - 0.5) * 0.4;
        const step = Math.min(35, distToRingCenter * 0.5);
        this.moveTarget.set(
          this.position.x + Math.cos(angle) * step,
          0,
          this.position.z + Math.sin(angle) * step
        );
      } else if (this.isAlly && this.game.player && this.game.player.alive) {
        // Allied Squadmates follow Player's Active Ping or stay in squad formation around Player!
        if (this.game.activePing && this.game.activePing.ttl > 0) {
          this.moveTarget.copy(this.game.activePing.position);
        } else {
          const formAngle = this.id * 2.2 + this.game.player.yaw;
          this.moveTarget.set(
            this.game.player.position.x + Math.sin(formAngle) * 8.5,
            this.game.player.position.y,
            this.game.player.position.z + Math.cos(formAngle) * 8.5
          );
        }
      } else if (!this.currentEnemy && this.position.distanceTo(this.moveTarget) < 5) {
        const r = Math.random() * (this.game.ringRadius * 0.72);
        const a = Math.random() * Math.PI * 2;
        this.moveTarget.set(
          this.game.ringCenter.x + Math.cos(a) * r,
          0,
          this.game.ringCenter.z + Math.sin(a) * r
        );
      }

      if (Math.random() < 0.35) this.strafeDir *= -1;
    }

    // 5. Movement & Tactical Cover / Shield Battery Retreat Physics (P1-4)
    let speed = this.isAlly ? 7.2 : 6.5;
    if (this.slowTimer > 0) speed *= 0.55;
    if (this.cloakTimer > 0) speed *= 1.25;
    if (this.batteryCooldown > 0) this.batteryCooldown -= dt;

    // Trigger Apex Tactical Shield Battery Retreat when Shield cracks in combat!
    if (!this.isHealingBattery && this.shield <= 0 && this.hp < 85 && (this.batteryCooldown || 0) <= 0 && this.currentEnemy) {
      this.isHealingBattery = true;
      this.batteryTimer = 2.6;
      this.batteryCooldown = 14.0;
      if (!this.batteryAura) {
        this.batteryAura = new THREE.Mesh(
          new THREE.TorusGeometry(0.85, 0.06, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })
        );
        this.batteryAura.rotation.x = Math.PI / 2;
        this.batteryAura.position.y = 1.05;
        this.mesh.add(this.batteryAura);
      }
      this.batteryAura.visible = true;
      if (this.game.player) {
        const dx = this.position.x - this.game.player.position.x;
        const dz = this.position.z - this.game.player.position.z;
        const rel = Math.atan2(dx, -dz) + this.game.player.yaw;
        window.SFX.playShieldBatteryHum(Math.sin(rel));
      }
    }

    if (this.isHealingBattery) {
      this.batteryTimer -= dt;
      speed *= 0.85;
      if (this.batteryAura) {
        this.batteryAura.position.y = 0.45 + ((2.6 - this.batteryTimer) / 2.6) * 1.35;
      }
      if (this.batteryTimer <= 0) {
        this.isHealingBattery = false;
        this.shield = this.maxShield;
        if (this.batteryAura) this.batteryAura.visible = false;
      }
    }

    let moveVec = new THREE.Vector3();
    if (this.currentEnemy && distToRingCenter <= this.game.ringRadius * 0.95) {
      const toEnemy = this.currentEnemy.position.clone().sub(this.position);
      const dist = toEnemy.length();
      toEnemy.y = 0;
      if (toEnemy.lengthSq() > 0.001) toEnemy.normalize();

      this.mesh.rotation.y = Math.atan2(toEnemy.x, toEnemy.z);

      const strafe = new THREE.Vector3(-toEnemy.z * this.strafeDir, 0, toEnemy.x * this.strafeDir);
      if (this.isHealingBattery) {
        moveVec.addScaledVector(toEnemy, -0.95);
        moveVec.addScaledVector(strafe, 0.85);
      } else {
        moveVec.addScaledVector(strafe, 0.75);
        if (dist > 26) moveVec.addScaledVector(toEnemy, 0.75);
        else if (dist < 11) moveVec.addScaledVector(toEnemy, -0.65);
      }
    } else {
      const toWay = this.moveTarget.clone().sub(this.position);
      toWay.y = 0;
      if (toWay.length() > 2.2) {
        toWay.normalize();
        moveVec.copy(toWay);
        this.mesh.rotation.y = Math.atan2(toWay.x, toWay.z);
      }
    }

    if (moveVec.lengthSq() > 0.01) {
      moveVec.normalize();
      this.position.x += moveVec.x * speed * dt;
      this.position.z += moveVec.z * speed * dt;

      const runCycle = performance.now() * 0.01;
      if (this.mesh.userData.leftLeg) {
        this.mesh.userData.leftLeg.rotation.x = Math.sin(runCycle + this.id) * 0.65;
        this.mesh.userData.rightLeg.rotation.x = -Math.sin(runCycle + this.id) * 0.65;
      }
    }

    this.updatePhysicsAndGround(dt);

    // 6. Combat Firing & Hero Abilities (Paused while popping Shield Battery!)
    if (this.currentEnemy && this.flashBlindTimer <= 0 && !this.isHealingBattery) {
      const eyeOrigin = this.position.clone().add(new THREE.Vector3(0, 1.55, 0));
      const targetCenter = this.currentEnemy.position.clone().add(new THREE.Vector3(0, 1.25, 0));
      const dist = eyeOrigin.distanceTo(targetCenter);

      if (dist <= 70) {
        this.fireTimer -= dt;
        const wData = window.GODWARS_DATA.WEAPONS[this.weaponId] || window.GODWARS_DATA.WEAPONS.m4a1;
        const fireInterval = Math.max(0.14, (60 / wData.rpm) * 1.8);

        if (this.fireTimer <= 0) {
          this.fireTimer = fireInterval + Math.random() * 0.11;
          const aimDir = targetCenter.clone().sub(eyeOrigin).normalize();
          const spreadAmt = this.isAlly ? 0.048 : 0.068;
          aimDir.x += (Math.random() - 0.5) * spreadAmt;
          aimDir.y += (Math.random() - 0.5) * spreadAmt;
          aimDir.z += (Math.random() - 0.5) * spreadAmt;
          aimDir.normalize();

          const distToPlayer = this.game.player ? this.position.distanceTo(this.game.player.position) : 50;
          let pan = 0;
          if (this.game.player) {
            const dx = this.position.x - this.game.player.position.x;
            const dz = this.position.z - this.game.player.position.z;
            pan = Math.sin(Math.atan2(dx, -dz) + this.game.player.yaw);
          }
          window.SFX.playGunshot(this.weaponId, distToPlayer, false, pan);
          this.game.combat.fireWeapon(this, eyeOrigin, aimDir, wData);
        }

        this.tacticalTimer -= dt;
        if (this.tacticalTimer <= 0 && dist < 36) {
          this.tacticalTimer = 14 + Math.random() * 6;
          const aimDir = targetCenter.clone().sub(eyeOrigin).normalize();
          if (this.ultCharge >= 100 && Math.random() < 0.45) {
            this.ultCharge = 0;
            this.game.combat.triggerHeroUltimate(this, eyeOrigin, aimDir);
          } else {
            this.game.combat.triggerHeroTactical(this, eyeOrigin, aimDir);
          }
        }
      }
    } else if (this.hp < this.maxHp * 0.7 || this.shield < this.maxShield * 0.6) {
      this.shield = Math.min(this.maxShield, this.shield + 5 * dt);
      this.hp = Math.min(this.maxHp, this.hp + 3 * dt);
    }
  }

  updatePhysicsAndGround(dt) {
    this.velocity.y -= 24 * dt;
    this.position.y += this.velocity.y * dt;

    const col = this.game.world.resolveHorizontalCollision(this.position.x, this.position.z, this.position.y, 0.48);
    this.position.x = col.x;
    this.position.z = col.z;

    const groundY = this.game.world.getGroundHeight(this.position.x, this.position.z, this.position.y);
    if (this.position.y <= groundY) {
      this.position.y = groundY;
      this.velocity.y = 0;
    }

    for (const pad of this.game.world.jumpPads) {
      if (Math.hypot(this.position.x - pad.x, this.position.z - pad.z) < pad.radius && this.position.y < 1.2) {
        this.velocity.y = 18.5;
      }
    }

    this.mesh.position.copy(this.position);
  }

  findKnockedTeammate() {
    const all = [...this.game.bots];
    if (this.game.player) all.push(this.game.player);
    for (const t of all) {
      if (t !== this && t.alive && t.knocked && t.teamId === this.teamId && !t.inDropship) {
        if (this.position.distanceTo(t.position) < 42) return t;
      }
    }
    return null;
  }

  findNearestLivingTeammate() {
    const all = [...this.game.bots];
    if (this.game.player) all.push(this.game.player);
    let best = null;
    let bestD = 999;
    for (const t of all) {
      if (t !== this && t.alive && !t.knocked && t.teamId === this.teamId) {
        const d = this.position.distanceTo(t.position);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
    }
    return best;
  }

  findBestTarget() {
    for (const decoy of this.game.combat.decoys) {
      if (decoy.owner && decoy.owner.teamId !== this.teamId && decoy.position.distanceTo(this.position) < 38) {
        return { position: decoy.position, alive: true, isDecoy: true };
      }
    }

    let best = null;
    let bestScore = 75;

    const allTargets = [...this.game.bots];
    if (this.game.player && this.game.player.alive && !this.game.player.knocked) {
      allTargets.push(this.game.player);
    }

    for (const t of allTargets) {
      if (!t.alive || t.knocked || t === this || t.inDropship) continue;
      // Never target teammates on the same squad!
      if (t.teamId === this.teamId) continue;
      if (t.cloakTimer && t.cloakTimer > 0 && t.position.distanceTo(this.position) > 7) continue;

      const d = this.position.distanceTo(t.position);
      if (d < bestScore) {
        bestScore = d;
        best = t;
      }
    }
    return best;
  }
}

window.AIContender = AIContender;
