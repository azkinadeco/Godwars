/**
 * GOD WARS: ASGARD ROYALE (APEX LEGENDS EDITION - 10-BATCH FULL UPGRADE)
 * 15 Smart AI Battle Royale Contenders + Firing Range Combat Dummies:
 * - Jump from Bifrost Dropship across Asgard's 6 POIs
 * - Equip Divine Weapons (P90, Kriss, M4A1, Uzi, AK47, Magnum) & Evo Shields
 * - Support Knocked Down (DBNO) state with 3D directional Knockdown Shield & crawling
 * - Fight other AI contenders and the player using firearms + Hero Tactical/Ultimate skills
 */

class AIContender {
  constructor(id, name, heroId, weaponId, game, isDummy = false) {
    this.id = id;
    this.name = name;
    this.heroId = heroId;
    this.weaponId = weaponId;
    this.game = game;
    this.isPlayer = false;
    this.isDummy = isDummy;

    const hData = window.GODWARS_DATA.HEROES[heroId] || window.GODWARS_DATA.HEROES.thor;
    this.maxHp = hData.maxHp || 100;
    this.hp = this.maxHp;
    this.shieldTier = isDummy ? ((id % 4) + 2) : ((id % 3) + 1);
    const tierInfo = window.GODWARS_DATA.EVO_TIERS[this.shieldTier] || window.GODWARS_DATA.EVO_TIERS[2];
    this.maxShield = tierInfo.maxShield;
    this.shield = this.maxShield;

    this.alive = true;
    this.knocked = false;
    this.knockedHp = 70;
    this.knockdownShieldHp = 90;
    this.bleedoutTimer = 18.0;
    this.inDropship = !isDummy;
    this.skydiving = false;
    this.kills = 0;
    this.damageDealt = 0;
    this.ultCharge = 35;

    const pois = window.GODWARS_DATA.POIS;
    const poi = pois[id % pois.length];
    const angle = Math.random() * Math.PI * 2;
    const dist = 8 + Math.random() * (poi.radius * 0.75);
    this.dropTarget = new THREE.Vector3(
      poi.x + Math.cos(angle) * dist,
      0,
      poi.z + Math.sin(angle) * dist
    );
    this.dropDelay = 1.2 + (id / 15) * 9.5;

    this.position = new THREE.Vector3(this.dropTarget.x, isDummy ? 0 : 110, this.dropTarget.z);
    this.velocity = new THREE.Vector3();
    this.moveTarget = this.dropTarget.clone();

    this.fireTimer = 0;
    this.tacticalTimer = 6 + Math.random() * 8;
    this.retargetTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.flashBlindTimer = 0;
    this.slowTimer = 0;
    this.cloakTimer = 0;
    this.ultBuffTimer = 0;

    this.mesh = window.ModelFactory.createHeroModel(heroId);
    this.mesh.position.copy(this.position);
    this.mesh.visible = isDummy;
    this.game.scene.add(this.mesh);
  }

  update(dt, elapsedMatchTime) {
    if (!this.alive) return;

    // Firing Range Combat Dummy Behavior (Strafes side-to-side for target practice)
    if (this.isDummy) {
      if (this.id % 2 === 1) {
        this.position.x = this.dropTarget.x + Math.sin(elapsedMatchTime * 1.8 + this.id) * 6.5;
      }
      this.position.y = this.game.world.getGroundHeight(this.position.x, this.position.z, this.position.y);
      this.mesh.position.copy(this.position);
      if (this.game.player) {
        const toP = this.game.player.position.clone().sub(this.position);
        this.mesh.rotation.y = Math.atan2(toP.x, toP.z);
      }
      return;
    }

    // Handle Knocked Down (DBNO) Crawling & Bleedout
    if (this.knocked) {
      this.bleedoutTimer -= dt;
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
    this.ultCharge = Math.min(100, this.ultCharge + dt * 1.4);

    // 1. Dropship & Skydive Phase
    if (this.inDropship) {
      if (elapsedMatchTime >= this.dropDelay && this.game.dropship) {
        this.inDropship = false;
        this.skydiving = true;
        this.position.copy(this.game.dropship.position);
        this.position.x += (Math.random() - 0.5) * 6;
        this.position.z += (Math.random() - 0.5) * 6;
        this.mesh.visible = true;
      } else {
        return;
      }
    }

    if (this.skydiving) {
      const toDrop = this.dropTarget.clone().sub(this.position);
      toDrop.y = 0;
      if (toDrop.length() > 2) {
        toDrop.normalize();
        this.position.x += toDrop.x * 26 * dt;
        this.position.z += toDrop.z * 26 * dt;
        this.mesh.rotation.y = Math.atan2(toDrop.x, toDrop.z);
      }
      this.position.y -= 24 * dt;
      const groundY = this.game.world.getGroundHeight(this.position.x, this.position.z, this.position.y);
      if (this.position.y <= groundY) {
        this.position.y = groundY;
        this.skydiving = false;
      }
      this.mesh.position.copy(this.position);
      return;
    }

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

    // 3. Target Acquisition
    this.retargetTimer -= dt;
    if (this.retargetTimer <= 0) {
      this.retargetTimer = 0.6 + Math.random() * 0.4;
      this.currentEnemy = this.findBestTarget();

      if (distToRingCenter > this.game.ringRadius * 0.82) {
        const angle = Math.atan2(
          this.game.ringCenter.z - this.position.z,
          this.game.ringCenter.x - this.position.x
        ) + (Math.random() - 0.5) * 0.5;
        const step = Math.min(35, distToRingCenter * 0.5);
        this.moveTarget.set(
          this.position.x + Math.cos(angle) * step,
          0,
          this.position.z + Math.sin(angle) * step
        );
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

    // 4. Movement & Strafe Physics
    let speed = 6.4;
    if (this.slowTimer > 0) speed *= 0.55;
    if (this.cloakTimer > 0) speed *= 1.25;

    let moveVec = new THREE.Vector3();
    if (this.currentEnemy && distToRingCenter <= this.game.ringRadius * 0.95) {
      const toEnemy = this.currentEnemy.position.clone().sub(this.position);
      const dist = toEnemy.length();
      toEnemy.y = 0;
      if (toEnemy.lengthSq() > 0.001) toEnemy.normalize();

      this.mesh.rotation.y = Math.atan2(toEnemy.x, toEnemy.z);

      const strafe = new THREE.Vector3(-toEnemy.z * this.strafeDir, 0, toEnemy.x * this.strafeDir);
      moveVec.addScaledVector(strafe, 0.75);
      if (dist > 26) moveVec.addScaledVector(toEnemy, 0.75);
      else if (dist < 11) moveVec.addScaledVector(toEnemy, -0.65);
    } else {
      const toWay = this.moveTarget.clone().sub(this.position);
      toWay.y = 0;
      if (toWay.length() > 1.5) {
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

    // 5. Combat Firing & Hero Abilities
    if (this.currentEnemy && this.flashBlindTimer <= 0) {
      const eyeOrigin = this.position.clone().add(new THREE.Vector3(0, 1.55, 0));
      const targetCenter = this.currentEnemy.position.clone().add(new THREE.Vector3(0, 1.25, 0));
      const dist = eyeOrigin.distanceTo(targetCenter);

      if (dist <= 68) {
        this.fireTimer -= dt;
        const wData = window.GODWARS_DATA.WEAPONS[this.weaponId] || window.GODWARS_DATA.WEAPONS.m4a1;
        const fireInterval = Math.max(0.14, (60 / wData.rpm) * 1.85);

        if (this.fireTimer <= 0) {
          this.fireTimer = fireInterval + Math.random() * 0.12;
          const aimDir = targetCenter.clone().sub(eyeOrigin).normalize();
          const spreadAmt = 0.068;
          aimDir.x += (Math.random() - 0.5) * spreadAmt;
          aimDir.y += (Math.random() - 0.5) * spreadAmt;
          aimDir.z += (Math.random() - 0.5) * spreadAmt;
          aimDir.normalize();

          window.SFX.playGunshot(this.weaponId, this.position.distanceTo(this.game.player.position));
          this.game.combat.fireWeapon(this, eyeOrigin, aimDir, wData);
        }

        this.tacticalTimer -= dt;
        if (this.tacticalTimer <= 0 && dist < 35) {
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
    } else if (this.hp < this.maxHp * 0.65 || this.shield < this.maxShield * 0.5) {
      this.shield = Math.min(this.maxShield, this.shield + 4 * dt);
      this.hp = Math.min(this.maxHp, this.hp + 2.5 * dt);
    }
  }

  findBestTarget() {
    for (const decoy of this.game.combat.decoys) {
      if (decoy.owner !== this && decoy.position.distanceTo(this.position) < 38) {
        return { position: decoy.position, alive: true, isDecoy: true };
      }
    }

    let best = null;
    let bestScore = 72;

    const allTargets = [...this.game.bots];
    if (this.game.player && this.game.player.alive && !this.game.player.knocked) {
      allTargets.push(this.game.player);
    }

    for (const t of allTargets) {
      if (!t.alive || t.knocked || t === this || t.inDropship) continue;
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
