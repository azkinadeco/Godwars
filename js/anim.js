/**
 * GOD WARS — procedural character animation.
 *
 * HeroAnim: drives the skinned hero GLB skeleton (Hips/Spine/Chest/Neck/Head, arms, legs) for
 *   the third-person player body, bots and remote players. Everything is evaluated every frame
 *   from smoothed (exponentially damped, dt-based) state weights:
 *   gait cycle (hip bob/sway/twist, knee bend, foot roll), torso lean into velocity & turns, head
 *   stabilisation, two-hand weapon hold via analytic two-bone IK (hip / ADS / sprint carry),
 *   recoil + hit-flinch springs, jump tuck / land squash, slide, crouch, reload (support hand to
 *   mag well -> pouch -> back), heal/use-item, knocked kneel-crawl, melee and death fall.
 *   The baked Idle/Run/Slide clips are no longer used for driven heroes (mixer stopped).
 *
 * ViewAnim: first-person viewmodel motion (springs): bob, sprint carry, jump/land, slide tilt,
 *   ADS, look sway, recoil, reload with a visible magazine, melee, inspect, and the first-person
 *   healing hands (battery / cell into the wrist device, syringe, medkit).
 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') return;

  const V3 = THREE.Vector3, Q = THREE.Quaternion;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const dampF = (lambda, dt) => 1 - Math.exp(-lambda * dt);
  const damp = (cur, tgt, lambda, dt) => cur + (tgt - cur) * dampF(lambda, dt);
  const wrapPi = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  // Gun-local anchors (barrel along -Z), measured from the weapon GLBs.
  const GRIPS = {
    m4a1:   { r: [0, -0.11, 0.11], l: [0, -0.02, -0.29], mag: [0, -0.17, -0.07], magSize: [0.03, 0.15, 0.065], magTilt: 0.12 },
    ak47:   { r: [0, -0.10, 0.11], l: [0, -0.03, -0.29], mag: [0, -0.18, -0.09], magSize: [0.03, 0.16, 0.065], magTilt: 0.35 },
    p90:    { r: [0, -0.09, 0.05], l: [0, -0.09, -0.14], mag: [0, 0.07, -0.06], magSize: [0.055, 0.035, 0.3], magTilt: 0 },
    kriss:  { r: [0, -0.07, 0.11], l: [0, -0.05, -0.27], mag: [0, -0.19, -0.05], magSize: [0.028, 0.2, 0.05], magTilt: 0.05 },
    uzi:    { r: [0, -0.08, 0.01], l: [0, -0.16, -0.03], mag: [0, -0.22, 0.02], magSize: [0.025, 0.16, 0.04], magTilt: -0.1 },
    magnum: { r: [0, -0.09, 0.08], l: [-0.02, -0.12, 0.09], mag: [0, 0.01, -0.04], magSize: [0.03, 0.03, 0.03], magTilt: 0, revolver: true }
  };
  const TP_GUN_SCALE = { m4a1: 0.86, ak47: 0.84, p90: 0.95, kriss: 0.95, uzi: 1.0, magnum: 1.0 };

  const BONES = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'UAt', 'FAt', 'Ht', 'UAs', 'FAs', 'Hs', 'ThA', 'ShA', 'FtA', 'ThB', 'ShB', 'FtB'];
  const PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15];
  const NB = BONES.length;

  // ---------------------------------------------------------------- shared scratch
  const _q1 = new Q(), _q2 = new Q(), _q3 = new Q(), _qe = new Q();
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _v4 = new V3(), _v5 = new V3(), _v6 = new V3();
  const _Y = new V3(0, 1, 0);

  function eulerQ(out, x, y, z) { _e.set(x, y, z, 'YXZ'); return out.setFromEuler(_e); }

  // ---------------------------------------------------------------- materials / small meshes (shared)
  let _shared = null;
  function shared() {
    if (_shared) return _shared;
    const S = {};
    S.magMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a2e35).convertSRGBToLinear(), metalness: 0.7, roughness: 0.45 });
    S.brassMat = new THREE.MeshStandardMaterial({ color: 0xc89b3c, metalness: 0.9, roughness: 0.3 });
    S.cellCore = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    S.capMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.3 });
    S.goldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 });
    S.medMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.1, roughness: 0.55 });
    S.medGreen = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    S.glass = new THREE.MeshStandardMaterial({ color: 0xa7f3d0, transparent: true, opacity: 0.55, metalness: 0.1, roughness: 0.1, emissive: 0x10b981, emissiveIntensity: 0.6 });
    S.steel = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.95, roughness: 0.2 });
    S.bandage = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 });
    S.purple = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
    _shared = S;
    return S;
  }

  /** Heal props (shared by TP + FP builders). type -> Group with userData parts. */
  function buildHealProp(type, fp) {
    const S = shared();
    const g = new THREE.Group();
    const MF = window.ModelFactory;
    if (type === 'shield_battery') {
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 12), S.cellCore);
      const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.035, 12), S.capMat); capT.position.y = 0.085;
      const capB = capT.clone(); capB.position.y = -0.085;
      g.add(core, capT, capB);
      if (MF) MF.attachBlenderGLB('item_shield_battery', g, (glb) => { glb.scale.setScalar(0.62); }, [core, capT, capB]);
      g.userData.glow = S.cellCore;
    } else if (type === 'shield_cell') {
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.075, 10), S.cellCore);
      const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.018, 10), S.capMat); capT.position.y = 0.045;
      const capB = capT.clone(); capB.position.y = -0.045;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 14), S.goldMat); band.rotation.x = Math.PI / 2;
      g.add(core, capT, capB, band);
      g.userData.glow = S.cellCore;
    } else if (type === 'syringe') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.11, 10), S.glass);
      const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 8), S.medGreen);
      fluid.position.y = 0; barrel.add(fluid);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 10), S.capMat); collar.position.y = 0.058;
      const plunger = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 6), S.steel); rod.position.y = 0.04;
      const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 10), S.capMat); thumb.position.y = 0.082;
      plunger.add(rod, thumb); plunger.position.y = 0.05;
      const hub = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.02, 8), S.capMat); hub.rotation.x = Math.PI; hub.position.y = -0.065;
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.05, 4), S.steel); needle.position.y = -0.1;
      g.add(barrel, collar, plunger, hub, needle);
      g.userData.plunger = plunger; g.userData.fluid = fluid;
    } else { // medkit / phoenix_kit
      const gold = type === 'phoenix_kit';
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.13), gold ? S.goldMat : S.medMat);
      const lid = new THREE.Group(); lid.position.set(0, 0.045, -0.065);
      const lidM = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.13), gold ? S.goldMat : S.medMat); lidM.position.set(0, 0.012, 0.065);
      const crossA = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.022), gold ? S.purple : S.medGreen); crossA.position.set(0, 0.026, 0.065);
      const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.004, 0.07), gold ? S.purple : S.medGreen); crossB.position.set(0, 0.026, 0.065);
      lid.add(lidM, crossA, crossB);
      g.add(base, lid);
      if (MF && !gold) MF.attachBlenderGLB('item_medkit', g, (glb) => { glb.scale.set(1.35, 0.55, 1.4); glb.rotation.x = Math.PI / 2; glb.position.y = -0.005; }, [base]);
      const spray = new THREE.Group();
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 10), S.bandage);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6), gold ? S.purple : S.medGreen); nozzle.position.y = 0.055;
      spray.add(can, nozzle);
      spray.visible = false;
      g.add(spray);
      g.userData.lid = lid; g.userData.spray = spray;
    }
    g.traverse(m => { if (m.isMesh) { m.castShadow = !fp; m.receiveShadow = false; } });
    return g;
  }

  // =====================================================================================
  // HERO RIG (third person)
  // =====================================================================================
  function findRig(root) {
    const ud = root.userData;
    if (ud.gwRig) return ud.gwRig;
    ud._rigTry = (ud._rigTry || 0) + 1;
    if (ud._rigTry % 10 !== 1) return null; // GLB still loading: retry every 10 frames
    const named = {};
    root.traverse(o => { if (o.isBone && !named[o.name]) named[o.name] = o; });
    if (!named.Hips || !named.UpperArmL || !named.UpperArmR || !named.ThighL || !named.Chest) return null;

    // trigger (gun) arm = the one on model -X (anatomical right when facing +Z)
    const tSide = named.UpperArmL.position.x < 0 ? 'L' : 'R';
    const sSide = tSide === 'L' ? 'R' : 'L';
    const map = {
      Hips: 'Hips', Spine: 'Spine', Chest: 'Chest', Neck: 'Neck', Head: 'Head',
      UAt: 'UpperArm' + tSide, FAt: 'Forearm' + tSide, Ht: 'Hand' + tSide,
      UAs: 'UpperArm' + sSide, FAs: 'Forearm' + sSide, Hs: 'Hand' + sSide,
      ThA: 'ThighL', ShA: 'ShinL', FtA: 'FootL', ThB: 'ThighR', ShB: 'ShinR', FtB: 'FootR'
    };
    // rest pose from the never-animated cached source scene
    const cache = window.ModelFactory && window.ModelFactory._glbCache && window.ModelFactory._glbCache['hero_' + ud.heroId];
    const srcBones = {};
    if (cache && cache.scene) cache.scene.traverse(o => { if (o.isBone && !srcBones[o.name]) srcBones[o.name] = o; });

    const rig = { bones: [], restQ: [], restP: [], C: [], Ci: [], M: [], P: [], q: [], root, st: null };
    for (let i = 0; i < NB; i++) {
      const b = named[map[BONES[i]]];
      if (!b) return null;
      const src = srcBones[map[BONES[i]]] || b;
      rig.bones.push(b);
      rig.restQ.push(src.quaternion.clone());
      rig.restP.push(src.position.clone());
      rig.M.push(new Q()); rig.P.push(new V3()); rig.q.push(new Q());
    }
    // rest model-space rotation of each bone's parent (C) — model axes expressed in the parent frame
    const restM = [];
    for (let i = 0; i < NB; i++) {
      const p = PARENT[i];
      restM[i] = p < 0 ? rig.restQ[i].clone() : restM[p].clone().multiply(rig.restQ[i]);
      const C = p < 0 ? new Q() : restM[p].clone();
      rig.C.push(C); rig.Ci.push(C.clone().invert());
    }
    rig.lenUA = rig.restP[6].length(); rig.lenFA = rig.restP[7].length();
    // stop the baked clips: this body is now fully procedural
    if (ud.mixer) { try { ud.mixer.stopAllAction(); } catch (e) {} ud.gwMixer = ud.mixer; }
    ud.mixer = null;
    ud.playAnim = () => {};
    ud.gwRig = rig;
    rig.weaponId = null;
    rig.gun = ud.gun || null;
    if (rig.gun) setGunParent(rig, rig.gun, ud.gunWeaponId);
    rig.st = newState();
    return rig;
  }

  function setGunParent(rig, gun, weaponId) {
    rig.root.add(gun); // detach from the hand bone; the anim drives it in model space
    rig.gun = gun;
    rig.weaponId = weaponId || 'm4a1';
    rig.grip = GRIPS[rig.weaponId] || GRIPS.m4a1;
    rig.gunScale = TP_GUN_SCALE[rig.weaponId] || 0.9;
    gun.scale.setScalar(rig.gunScale);
    gun.matrixAutoUpdate = true;
  }

  function ensureWeapon(rig, weaponId) {
    if (!weaponId || weaponId === rig.weaponId || !window.ModelFactory) return;
    const old = rig.gun;
    const gun = window.ModelFactory.createWeaponModel(weaponId, rig.root.userData.heroId || 'thor', false);
    gun.traverse(c => { if (c.isMesh) { c.castShadow = true; } });
    if (old && old.parent) old.parent.remove(old);
    setGunParent(rig, gun, weaponId);
    rig.root.userData.gun = gun;
  }

  function newState() {
    return {
      init: false, px: 0, py: 0, pz: 0, yaw: 0,
      fwd: 0, side: 0, speed: 0, vy: 0, accF: 0, yawRate: 0,
      phase: Math.random() * 6.28, moveW: 0, runW: 0,
      w: { sprint: 0, slide: 0, crouch: 0, ads: 0, knock: 0, air: 0, heal: 0, reload: 0, melee: 0, nogun: 0, sky: 0, dead: 0 },
      aimPitch: 0, leanF: 0, leanS: 0,
      rec: 0, recV: 0, recYaw: 0, flinch: 0, flinchV: 0, flinchDir: 1,
      land: 0, landV: 0, wasGround: true,
      healT: 0, healType: null, reloadT: 0, meleeT: 0,
      deadT: -1, deadDir: -1, deadSide: 0, deadAt: 0,
      lastFire: 0, frameSkip: 0, acc: 0,
      healProp: null, healPropType: null, magProp: null
    };
  }

  // per-bone euler deltas (model axes, in the parent's rest frame) + hips offset + hand targets
  const POSE = new Float32Array(NB * 3);
  const HIPS = new V3();
  const TGT_T = new V3(), TGT_S = new V3();
  const POLE_T = new V3(), POLE_S = new V3();

  function setB(i, x, y, z) { POSE[i * 3] = x; POSE[i * 3 + 1] = y; POSE[i * 3 + 2] = z; }
  function addB(i, x, y, z) { POSE[i * 3] += x; POSE[i * 3 + 1] += y; POSE[i * 3 + 2] += z; }
  function lerpB(i, x, y, z, w) {
    if (w <= 0) return;
    POSE[i * 3] = lerp(POSE[i * 3], x, w); POSE[i * 3 + 1] = lerp(POSE[i * 3 + 1], y, w); POSE[i * 3 + 2] = lerp(POSE[i * 3 + 2], z, w);
  }

  /** Solve FK for bone i from POSE (+ explicit override quaternion for IK bones). */
  function fk(rig, i) {
    const p = PARENT[i];
    eulerQ(_qe, POSE[i * 3], POSE[i * 3 + 1], POSE[i * 3 + 2]);
    // q = Ci * E * C * rest
    const q = rig.q[i].copy(rig.Ci[i]).multiply(_qe).multiply(rig.C[i]).multiply(rig.restQ[i]);
    if (p < 0) {
      rig.M[i].copy(q);
      rig.P[i].copy(rig.restP[i]).add(HIPS);
    } else {
      rig.M[i].copy(rig.M[p]).multiply(q);
      rig.P[i].copy(rig.restP[i]).applyQuaternion(rig.M[p]).add(rig.P[p]);
    }
  }

  /** Point bone i's +Y at model-space direction `dir` with minimal twist; updates q/M. */
  function aimBone(rig, i, dir) {
    const p = PARENT[i];
    // rest-relative orientation under the current parent
    _q1.copy(rig.M[p]).multiply(rig.restQ[i]);
    _v6.copy(_Y).applyQuaternion(_q1);
    _q2.setFromUnitVectors(_v6, dir);
    rig.M[i].copy(_q2).multiply(_q1);
    rig.q[i].copy(rig.M[p]).invert().multiply(rig.M[i]);
    rig.P[i].copy(rig.restP[i]).applyQuaternion(rig.M[p]).add(rig.P[p]);
  }

  /** Analytic two-bone IK for arm (ua, fa, hand) to wrist target T with elbow pole point. */
  function solveArm(rig, ua, target, pole) {
    const fa = ua + 1, hd = ua + 2;
    const S = _v1.copy(rig.restP[ua]).applyQuaternion(rig.M[PARENT[ua]]).add(rig.P[PARENT[ua]]);
    const a = rig.lenUA, b = rig.lenFA;
    const toT = _v2.copy(target).sub(S);
    let d = toT.length();
    const dMax = (a + b) * 0.999, dMin = Math.abs(a - b) + 0.01;
    d = clamp(d, dMin, dMax);
    toT.normalize();
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const m = _v3.copy(pole).sub(S);
    m.addScaledVector(toT, -m.dot(toT));
    if (m.lengthSq() < 1e-6) m.set(0, -1, 0).addScaledVector(toT, -toT.y);
    m.normalize();
    const E = _v4.copy(S).addScaledVector(toT, a * cosA).addScaledVector(m, a * sinA);
    const W = _v5.copy(S).addScaledVector(toT, d);
    aimBone(rig, ua, _tmpDir.copy(E).sub(S).normalize());
    aimBone(rig, fa, _tmpDir.copy(W).sub(E).normalize());
    fk(rig, hd);
  }
  const _tmpDir = new V3();

  // gun model-space transform
  const GUN_Q = new Q(), GUN_P = new V3();
  const _aimQ = new Q(), _poseQ = new Q(), _flipY = new Q().setFromAxisAngle(new V3(0, 1, 0), Math.PI);
  const _gp = new V3(), _gl = new V3();

  function gunPoint(rig, local, out) {
    // local gun-space point -> model space
    return out.set(local[0], local[1], local[2]).multiplyScalar(rig.gunScale).applyQuaternion(GUN_Q).add(GUN_P);
  }

  /**
   * Drive a hero body. s = {
   *   grounded, sprint, slide, crouch, ads, knocked, reload (0..1 | -1), heal (type|null), healT (0..1),
   *   melee (0..1 | -1), aimPitch, noGun, skydive, weaponId, fired (bool pulse)
   * }
   */
  function drive(root, s, dt) {
    const rig = findRig(root);
    if (!rig) return false;
    if (dt <= 0) return true;
    dt = Math.min(dt, 0.1);
    const st = rig.st, W = st.w;
    if (s.weaponId) ensureWeapon(rig, s.weaponId);
    root.scale.set(1, 1, 1);

    // ---- kinematics from the transform (world -> model local)
    const pos = root.position, yaw = root.rotation.y;
    if (!st.init) { st.px = pos.x; st.py = pos.y; st.pz = pos.z; st.yaw = yaw; st.init = true; }
    let vx = (pos.x - st.px) / dt, vy = (pos.y - st.py) / dt, vz = (pos.z - st.pz) / dt;
    if (vx * vx + vz * vz > 900 || Math.abs(vy) > 60) { vx = vz = vy = 0; } // teleport
    st.px = pos.x; st.py = pos.y; st.pz = pos.z;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    let fwd = vx * sy + vz * cy;          // along model +Z
    let side = -vx * cy + vz * sy;        // toward character's right (model -X)
    if (s.vLocal) { fwd = s.vLocal[0]; side = s.vLocal[1]; } // explicit (treadmill / network)
    const yawRate = clamp(wrapPi(yaw - st.yaw) / dt, -12, 12);
    st.yaw = yaw;
    const pf = st.fwd;
    st.fwd = damp(st.fwd, fwd, 9, dt);
    st.side = damp(st.side, side, 9, dt);
    st.accF = damp(st.accF, (st.fwd - pf) / dt, 6, dt);
    st.yawRate = damp(st.yawRate, yawRate, 8, dt);
    st.vy = damp(st.vy, vy, 14, dt);
    const speed = Math.hypot(st.fwd, st.side);
    st.speed = speed;

    const dead = st.deadT >= 0;
    // ---- state weights
    const grounded = s.grounded !== false;
    const tw = (k, on, rate) => { W[k] = damp(W[k], on ? 1 : 0, rate, dt); };
    tw('dead', dead, 7);
    tw('knock', !dead && !!s.knocked, 6);
    tw('sky', !dead && !!s.skydive, 5);
    tw('slide', !dead && !!s.slide && !s.knocked, 12);
    tw('air', !dead && !grounded && !s.slide && !s.skydive && !s.knocked, 9);
    tw('sprint', !dead && !!s.sprint && speed > 4 && !s.ads && !s.knocked && !s.slide && !s.heal, 8);
    tw('crouch', !dead && !!s.crouch && !s.slide && !s.knocked, 9);
    tw('ads', !dead && !!s.ads && !s.knocked && !s.heal, 12);
    tw('heal', !dead && !!s.heal && !s.knocked, 8);
    tw('reload', !dead && s.reload >= 0 && !s.knocked && !s.heal, 10);
    tw('melee', !dead && s.melee >= 0 && !s.knocked, 16);
    tw('nogun', dead || !!s.noGun || !!s.knocked || !!s.heal || !!s.skydive, 10);
    if (s.reload >= 0) st.reloadT = s.reload;
    if (s.heal) { st.healType = s.heal; st.healT = s.healT || 0; }
    if (s.melee >= 0) st.meleeT = s.melee;
    st.aimPitch = damp(st.aimPitch, clamp(s.aimPitch || 0, -1.1, 1.1), 14, dt);

    // ---- springs: recoil, flinch, landing squash
    if (s.fired) { st.recV += 9 + Math.random() * 3; st.recYaw = (Math.random() - 0.5) * 0.12; }
    const spring = (x, v, k, c) => { const a = -k * x - c * v; v += a * dt; x += v * dt; return [x, v]; };
    [st.rec, st.recV] = spring(st.rec, st.recV, 260, 22);
    [st.flinch, st.flinchV] = spring(st.flinch, st.flinchV, 180, 14);
    if (grounded && !st.wasGround && st.lastAirVy < -4 && !dead) st.landV -= clamp(-st.lastAirVy * 0.09, 0.3, 2.4);
    if (!grounded) st.lastAirVy = vy;
    st.wasGround = grounded;
    [st.land, st.landV] = spring(st.land, st.landV, 140, 13);
    const landSq = clamp(-st.land, 0, 0.35);

    // ---- gait phase (distance driven so feet roughly track the ground)
    const mv = clamp(speed / 1.6, 0, 1) * (1 - W.slide) * (1 - W.air) * (1 - W.sky) * (1 - W.dead);
    st.moveW = damp(st.moveW, mv, 8, dt);
    st.runW = damp(st.runW, clamp((speed - 2.6) / 4.2, 0, 1), 5, dt);
    const runW = st.runW, moveW = st.moveW;
    let cycleLen = lerp(1.7, 3.5, runW) + W.sprint * 1.0;
    cycleLen = lerp(cycleLen, 2.2, W.crouch);
    cycleLen = lerp(cycleLen, 1.3, W.knock);
    if (grounded && !s.slide) st.phase += dt * (speed / cycleLen) * Math.PI * 2;
    else st.phase += dt * 1.5; // idle breathing drift
    const ph = st.phase;
    const dirA = Math.atan2(st.side, Math.max(-50, st.fwd)); // 0 = forward
    let sF = Math.cos(dirA), sS = Math.sin(dirA);
    if (speed < 0.3) { sF = 1; sS = 0; }
    const backW = clamp(-sF, 0, 1);

    // =============================================== LOCOMOTION BASE
    POSE.fill(0); HIPS.set(0, 0, 0);
    const t = performance.now() * 0.001;
    const breath = Math.sin(t * 1.7 + (root.id || 0)) * 0.018;
    const holdW = 1 - W.nogun;

    // idle rifle stance: bladed hips, support shoulder forward
    const idleW = (1 - moveW) * (1 - W.knock) * (1 - W.dead) * (1 - W.sky);
    const blade = holdW * (0.35 * idleW + 0.12 * (1 - idleW)) * (1 - W.sprint);
    // pelvis
    const amp = moveW * (1 - W.crouch * 0.4);
    const bob = amp * lerp(0.022, 0.06, runW) * (0.5 + 0.5 * Math.cos(2 * ph)) + runW * moveW * 0.035;
    const hipYaw = amp * lerp(0.1, 0.16, runW) * Math.sin(ph) * (1 - backW * 2) + blade * 0.55;
    const hipRoll = amp * 0.05 * Math.cos(ph);
    HIPS.set(amp * 0.022 * Math.cos(ph), -bob - landSq * 0.55 + breath * 0.15, 0);
    const leanF = clamp(st.fwd * 0.024 + st.accF * 0.012, -0.22, 0.36) + W.sprint * 0.14;
    const leanS = clamp(st.side * 0.028 + st.yawRate * clamp(speed / 6, 0, 1) * -0.05, -0.25, 0.25);
    st.leanF = damp(st.leanF, leanF, 6, dt); st.leanS = damp(st.leanS, leanS, 6, dt);
    setB(0, st.leanF * 0.35 + landSq * 0.4, hipYaw, -st.leanS * 0.4 + hipRoll);

    // legs (A: phase, B: phase+pi)
    const thA = lerp(0.44, 0.66, runW) + W.sprint * 0.12;
    const legStance = 0.05;
    for (let L = 0; L < 2; L++) {
      const p = ph + (L ? Math.PI : 0);
      const sw = Math.sin(p) * thA * amp;
      const kneeSwing = Math.pow(Math.max(0, Math.cos(p + 0.3)), 1.4) * lerp(0.7, 1.55, runW) * amp;
      const kneeStance = lerp(0.12, 0.28, runW) * amp * Math.max(0, -Math.cos(p + 0.3));
      const foot = amp * (0.3 * Math.sin(p + 1.0) - 0.05);
      const ti = L ? 14 : 11;
      const sideSign = L ? 1 : -1; // B leg on +X? (ThighR at +X)
      // forward/back swing on X (negative = forward), side-step swing on Z
      setB(ti, -sw * sF - st.leanF * 0.35 - landSq * 0.9, -hipYaw * 0.6, -sw * sS * 0.55 + sideSign * legStance);
      setB(ti + 1, kneeSwing + kneeStance + landSq * 1.9 + 0.04, 0, 0);
      setB(ti + 2, -foot - landSq * 0.8, 0, 0);
    }

    // spine / chest / head
    setB(1, st.leanF * 0.4 + breath * 0.5, -hipYaw * 0.55, -st.leanS * 0.35 - hipRoll * 0.6);
    // when holding the weapon the chest squares to the aim; otherwise counter-rotate naturally
    const chestYawHold = -(hipYaw * 0.45) - blade * 0.15;
    const chestYawFree = -hipYaw * 0.35;
    setB(2, st.leanF * 0.25 - st.aimPitch * 0.38 * holdW + breath, lerp(chestYawFree, chestYawHold, holdW), -st.leanS * 0.25 - hipRoll * 0.4);
    // head stabilisation: cancels most of the body lean/yaw, follows aim
    const bodyX = st.leanF * 1.0 - st.aimPitch * 0.38 * holdW;
    const bodyY = POSE[1] + POSE[4] + POSE[7];
    setB(3, -bodyX * 0.35 - st.aimPitch * 0.2, -bodyY * 0.45, st.leanS * 0.3);
    setB(4, -bodyX * 0.35 - st.aimPitch * 0.3, -bodyY * 0.45 + W.ads * 0.12, st.leanS * 0.3 + W.ads * 0.12);

    // =============================================== FULL-BODY OVERRIDES
    // crouch
    if (W.crouch > 0.001) {
      const c = W.crouch;
      HIPS.y = lerp(HIPS.y, -0.36 - bob * 0.5, c);
      for (let L = 0; L < 2; L++) {
        const p = ph + (L ? Math.PI : 0);
        const sw = Math.sin(p) * 0.32 * moveW;
        const ti = L ? 14 : 11;
        lerpB(ti, -0.95 - sw * sF, POSE[ti * 3 + 1], POSE[ti * 3 + 2], c);
        lerpB(ti + 1, 1.55 + Math.max(0, Math.cos(p + 0.3)) * 0.35 * moveW, 0, 0, c);
        lerpB(ti + 2, -0.55, 0, 0, c);
      }
      lerpB(1, 0.42, POSE[4], POSE[5], c);
      addB(3, -0.25 * c, 0, 0);
    }
    // jump / airborne tuck
    if (W.air > 0.001) {
      const a = W.air;
      const tuck = clamp(0.45 + st.vy * 0.05, 0, 1);
      HIPS.y = lerp(HIPS.y, -0.04, a);
      lerpB(11, -0.35 - 0.6 * tuck, 0, -0.06, a);
      lerpB(12, 0.4 + 1.0 * tuck, 0, 0, a);
      lerpB(13, 0.25, 0, 0, a);
      lerpB(14, -0.05 - 0.2 * tuck, 0, 0.06, a);
      lerpB(15, 0.6 + 0.6 * tuck, 0, 0, a);
      lerpB(16, 0.35, 0, 0, a);
      addB(1, 0.1 * a * tuck, 0, 0);
    }
    // slide: pelvis low, lead leg extended, trail leg tucked, torso leaning back
    if (W.slide > 0.001) {
      const w = W.slide;
      HIPS.y = lerp(HIPS.y, -0.6, w);
      HIPS.z = lerp(HIPS.z, -0.05, w);
      lerpB(0, -0.36, 0.32, 0.08, w);
      lerpB(11, -1.0, 0.1, -0.12, w);
      lerpB(12, 0.22, 0, 0, w);
      lerpB(13, -0.45, 0, 0, w);
      lerpB(14, -0.15, -0.3, 0.32, w);
      lerpB(15, 1.85, 0, 0, w);
      lerpB(16, 0.3, 0, 0, w);
      lerpB(1, 0.08, -0.12, -0.04, w);
      lerpB(2, 0.12 - st.aimPitch * 0.38, -0.15, 0, w);
      lerpB(3, 0.12, -0.05, 0, w);
      lerpB(4, 0.08 - st.aimPitch * 0.3, 0, 0, w);
    }
    // knocked: kneel on shins, leaning forward, crawl shuffle
    if (W.knock > 0.001) {
      const k = W.knock;
      const cr = Math.sin(ph), crawl = clamp(speed / 1.5, 0, 1);
      HIPS.y = lerp(HIPS.y, -0.52 + Math.abs(Math.cos(ph)) * 0.03 * crawl, k);
      HIPS.z = lerp(HIPS.z, -0.06, k);
      lerpB(0, 0.5, cr * 0.1 * crawl, cr * 0.04 * crawl, k);
      lerpB(11, -0.5 - cr * 0.28 * crawl, 0.05, -0.1, k);
      lerpB(12, 1.72 + cr * 0.12 * crawl, 0, 0, k);
      lerpB(13, 0.55, 0, 0, k);
      lerpB(14, -0.5 + cr * 0.28 * crawl, -0.05, 0.1, k);
      lerpB(15, 1.72 - cr * 0.12 * crawl, 0, 0, k);
      lerpB(16, 0.55, 0, 0, k);
      lerpB(1, 0.36, -cr * 0.08 * crawl, 0, k);
      lerpB(2, 0.26, -cr * 0.1 * crawl, 0.05, k);
      lerpB(3, -0.45 - st.aimPitch * 0.2, 0, 0, k);
      lerpB(4, -0.45 - st.aimPitch * 0.3, 0, 0, k);
    }
    // skydive: spread eagle, chest down (the root is pitched by the caller)
    if (W.sky > 0.001) {
      const k = W.sky, fl = Math.sin(t * 9) * 0.04;
      HIPS.y = lerp(HIPS.y, 0, k);
      lerpB(0, 0, 0, 0, k);
      lerpB(11, 0.25, 0, -0.25, k); lerpB(12, 0.9 + fl, 0, 0, k); lerpB(13, 0.4, 0, 0, k);
      lerpB(14, 0.25, 0, 0.25, k); lerpB(15, 0.9 - fl, 0, 0, k); lerpB(16, 0.4, 0, 0, k);
      lerpB(1, -0.2, 0, 0, k); lerpB(2, -0.15, 0, 0, k); lerpB(3, -0.5, 0, 0, k); lerpB(4, -0.35, 0, 0, k);
    }
    // melee: torso twist into the swing
    if (W.melee > 0.001) {
      const m = st.meleeT, k = W.melee;
      const wind = sstep(0, 0.25, m) * (1 - sstep(0.25, 0.5, m));
      const hit = sstep(0.25, 0.45, m) * (1 - sstep(0.6, 1, m));
      addB(1, 0.1 * hit * k, (0.35 * wind - 0.55 * hit) * k, 0);
      addB(2, 0.12 * hit * k, (0.3 * wind - 0.5 * hit) * k, 0);
      addB(4, 0, (-0.3 * wind + 0.45 * hit) * k, 0);
    }
    // recoil / hit-flinch springs
    addB(2, -st.rec * 0.05, st.rec * st.recYaw * 0.3, 0);
    addB(1, -st.flinch * 0.3 * st.flinchDir, 0, st.flinch * 0.12);
    addB(4, -st.flinch * 0.35 * st.flinchDir, st.flinch * 0.15, 0);

    // death fall: knees buckle then topple backwards/forwards onto the ground
    if (W.dead > 0.001 || dead) {
      const tt = dead ? (t - st.deadAt) : 1;
      const buckle = sstep(0, 0.28, tt), topple = clamp(Math.pow(clamp((tt - 0.12) / 0.62, 0, 1), 1.7), 0, 1);
      const dir = st.deadDir; // -1 back, +1 forward
      const bounce = tt > 0.74 ? Math.sin(clamp((tt - 0.74) / 0.3, 0, 1) * Math.PI) * 0.06 : 0;
      const k = dead ? 1 : W.dead;
      const startY = HIPS.y;
      HIPS.y = lerp(startY, lerp(-0.3 * buckle, -0.8 + bounce, topple), k);
      HIPS.z = lerp(HIPS.z, -dir * 0.35 * topple, k);
      lerpB(0, dir * 1.48 * topple + 0.1 * buckle * (1 - topple), st.deadSide * 0.4 * topple, st.deadSide * 0.25 * topple, k);
      lerpB(11, -0.35 * buckle * (1 - topple) - (dir > 0 ? 0.05 : 0.15) * topple, 0.15, -0.15 * topple, k);
      lerpB(12, 0.9 * buckle * (1 - topple) + 0.35 * topple, 0, 0, k);
      lerpB(13, -0.3 * topple, 0, 0, k);
      const lf = dir < 0 ? 1 : 0.25; // face-down: legs stay long instead of folding up into the air
      lerpB(14, -0.4 * buckle * (1 - topple) - 0.6 * topple * lf, -0.1, 0.12 * topple, k);
      lerpB(15, 1.0 * buckle * (1 - topple) + 1.1 * topple * lf, 0, 0, k);
      lerpB(16, -0.2 * topple, 0, 0, k);
      lerpB(1, -dir * 0.15 * topple, 0, 0, k);
      lerpB(2, -dir * 0.12 * topple, 0, 0, k);
      lerpB(3, -dir * 0.35 * topple, st.deadSide * 0.6 * topple, 0, k);
      lerpB(4, -dir * 0.2 * topple, st.deadSide * 0.5 * topple, 0, k);
    }

    // =============================================== FK: hips, spine, legs, neck
    for (let i = 0; i < 5; i++) fk(rig, i);
    for (let i = 11; i < 17; i++) fk(rig, i);

    // =============================================== WEAPON + ARMS
    const chestP = rig.P[2], chestM = rig.M[2];
    // aim frame: yaw of the hips/chest stance (not the gait twist) + true aim pitch
    const aimYaw = st.recYaw * st.rec * 0.2;
    _aimQ.setFromEuler(_e.set(-st.aimPitch, aimYaw, 0, 'YXZ'));
    // pose offsets (grip target relative to chest bone head, in aim frame) + extra rotation
    let ox = -0.14, oy = -0.13, oz = 0.3, rx = 0.12, ry = 0.06, rz = 0.0;
    // ADS: sight up to the eye
    ox = lerp(ox, -0.085, W.ads); oy = lerp(oy, 0.1, W.ads); oz = lerp(oz, 0.3, W.ads); rx = lerp(rx, 0, W.ads); ry = lerp(ry, 0.02, W.ads);
    // reload: tilt the gun, lift it toward the chest
    const RT = st.reloadT;
    if (W.reload > 0.001) {
      const r = W.reload;
      const bolt = sstep(0.8, 0.86, RT) * (1 - sstep(0.86, 0.96, RT));
      const seat = sstep(0.6, 0.64, RT) * (1 - sstep(0.64, 0.72, RT));
      ox = lerp(ox, -0.1, r); oy = lerp(oy, -0.02 + seat * 0.03, r); oz = lerp(oz, 0.27 - bolt * 0.04, r);
      rx = lerp(rx, 0.38 - seat * 0.1, r); ry = lerp(ry, 0.3, r); rz = lerp(rz, -0.55 + bolt * 0.25, r);
    }
    // sprint carry: muzzle down-across the body, bouncing with the stride
    if (W.sprint > 0.001) {
      const w = W.sprint, sb = Math.sin(ph * 2) * 0.025;
      ox = lerp(ox, -0.08, w); oy = lerp(oy, -0.13 + sb, w); oz = lerp(oz, 0.24, w);
      rx = lerp(rx, 0.62 + sb, w); ry = lerp(ry, 0.75, w); rz = lerp(rz, 0.4, w);
    }
    // melee: gun swung aside
    if (W.melee > 0.001) {
      const m = W.melee * (1 - sstep(0.7, 1, st.meleeT));
      ox = lerp(ox, -0.2, m); oy = lerp(oy, -0.14, m); oz = lerp(oz, 0.2, m); rx = lerp(rx, 0.7, m); ry = lerp(ry, -0.3, m);
    }
    // recoil: back along the barrel + muzzle climb
    oz -= st.rec * 0.035; oy += st.rec * 0.006; rx -= st.rec * 0.06;

    _gp.set(ox, oy, oz).applyQuaternion(_aimQ).add(chestP);
    _poseQ.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    GUN_Q.copy(_aimQ).multiply(_poseQ).multiply(_flipY);
    // place gun so the trigger grip sits on _gp
    _gl.set(rig.grip.r[0], rig.grip.r[1], rig.grip.r[2]).multiplyScalar(rig.gunScale).applyQuaternion(GUN_Q);
    GUN_P.copy(_gp).sub(_gl);

    // hand targets on the weapon (wrist slightly behind/below the grip centre)
    gunPoint(rig, [rig.grip.r[0] - 0.01, rig.grip.r[1] - 0.04, rig.grip.r[2] + 0.06], TGT_T);
    const supGrip = rig.grip.revolver ? rig.grip.l : [
      rig.grip.l[0] * 0.6 + rig.grip.r[0] * 0.4, rig.grip.l[1] * 0.75 + rig.grip.r[1] * 0.25, rig.grip.l[2] * 0.72 + rig.grip.r[2] * 0.28
    ];
    gunPoint(rig, [supGrip[0] + 0.03, supGrip[1] - 0.06, supGrip[2] + 0.04], TGT_S);

    // reload: support hand -> mag well -> belt pouch -> mag well -> foregrip
    let magInHand = false, magAtWell = false;
    if (W.reload > 0.001) {
      const well = gunPoint(rig, rig.grip.mag, _v1).clone();
      const pouch = _v2.set(0.14, 0.0, 0.12).applyQuaternion(chestM).add(rig.P[0]).add(_v3.set(0, -0.02, 0));
      const k1 = sstep(0.0, 0.14, RT), k2 = sstep(0.16, 0.34, RT), k3 = sstep(0.4, 0.6, RT), k4 = sstep(0.7, 0.82, RT);
      const p = _v4.copy(TGT_S).lerp(well, k1);
      p.lerp(pouch, k2 * (1 - k3));
      if (k3 > 0) p.lerp(well, k3);
      if (k4 > 0) p.lerp(TGT_S, k4);
      TGT_S.lerp(p, W.reload);
      magInHand = RT > 0.18 && RT < 0.62; magAtWell = RT >= 0.62 && RT < 0.7;
    }

    // free-arm targets (no weapon in hands): blend from the gun hold
    if (W.nogun > 0.001) {
      const k = W.nogun;
      const sw = Math.sin(ph) * moveW;
      // relaxed swing (holstered)
      const freeT = _v1.set(-0.2, -0.32, 0.05 - sw * 0.28 * lerp(0.6, 1.3, runW)).applyQuaternion(chestM).add(chestP);
      const freeS = _v2.set(0.2, -0.32, 0.05 + sw * 0.28 * lerp(0.6, 1.3, runW)).applyQuaternion(chestM).add(chestP);
      if (W.heal > 0.001) {
        // both hands in front of the chest working the item
        const ht = st.healT, ty = st.healType;
        const pump = ty === 'syringe' ? sstep(0.35, 0.45, ht) * (1 - sstep(0.8, 0.9, ht))
          : (ty === 'medkit' || ty === 'phoenix_kit') ? Math.sin(ht * 26) * sstep(0.4, 0.5, ht) * (1 - sstep(0.85, 0.9, ht))
          : sstep(0.3, 0.42, ht) * (1 - sstep(0.9, 1, ht));
        const hs = _v3.set(0.06, -0.12, 0.34).applyQuaternion(chestM).add(chestP);
        const htp = _v4.set(-0.06, -0.06 - pump * 0.05, 0.31 + pump * 0.03).applyQuaternion(chestM).add(chestP);
        freeS.lerp(hs, W.heal); freeT.lerp(htp, W.heal);
      }
      if (W.knock > 0.001) {
        // crawl: hands plant on the ground ahead, alternating
        const c = Math.sin(ph), crawl = clamp(speed / 1.5, 0, 1);
        const gs = _v3.set(0.26, 0.06 + Math.max(0, Math.cos(ph)) * 0.07 * crawl, 0.42 + c * 0.13 * crawl);
        const gt = _v4.set(-0.24, 0.06 + Math.max(0, -Math.cos(ph)) * 0.07 * crawl, 0.4 - c * 0.13 * crawl);
        if (s.kneelHurt) gt.set(-0.08, 0.95, 0.2); // clutching the wound
        freeS.lerp(gs, W.knock); freeT.lerp(gt, W.knock);
      }
      if (W.sky > 0.001) {
        freeS.lerp(_v3.set(0.55, 0.12, -0.05).applyQuaternion(chestM).add(chestP), W.sky);
        freeT.lerp(_v4.set(-0.55, 0.12, -0.05).applyQuaternion(chestM).add(chestP), W.sky);
      }
      if (W.dead > 0.001 || dead) {
        const kk = dead ? 1 : W.dead;
        freeS.lerp(_v3.set(0.52, 0.2, -0.12).applyQuaternion(chestM).add(chestP), kk);
        freeT.lerp(_v4.set(-0.5, 0.05, 0.12).applyQuaternion(chestM).add(chestP), kk);
      }
      TGT_T.lerp(freeT, k); TGT_S.lerp(freeS, k);
    }
    // melee: support hand jab
    if (W.melee > 0.001) {
      const m = st.meleeT;
      const ext = sstep(0.2, 0.42, m) * (1 - sstep(0.55, 0.95, m));
      const jab = _v1.set(0.02, 0.1, 0.22 + ext * 0.38).applyQuaternion(chestM).add(chestP);
      TGT_S.lerp(jab, W.melee * (0.4 + 0.6 * ext));
    }
    // poles: elbows down & out
    POLE_T.set(-0.55, -0.55, -0.25).applyQuaternion(chestM).add(chestP);
    POLE_S.set(0.5, -0.7, -0.05).applyQuaternion(chestM).add(chestP);
    solveArm(rig, 5, TGT_T, POLE_T);
    solveArm(rig, 8, TGT_S, POLE_S);

    // =============================================== write bones
    for (let i = 0; i < NB; i++) rig.bones[i].quaternion.copy(rig.q[i]);
    rig.bones[0].position.copy(rig.restP[0]).add(HIPS);

    // weapon
    if (rig.gun) {
      rig.gun.visible = W.nogun < 0.5 && !dead;
      rig.gun.position.copy(GUN_P);
      rig.gun.quaternion.copy(GUN_Q);
    }
    // reload magazine in the support hand
    if (W.reload > 0.05 && (magInHand || magAtWell) && rig.gun && rig.gun.visible) {
      if (!st.magProp) {
        const S = shared(), g = rig.grip;
        st.magProp = new THREE.Mesh(new THREE.BoxGeometry(g.magSize[0], g.magSize[1], g.magSize[2]), S.magMat);
        root.add(st.magProp);
      }
      st.magProp.visible = true;
      if (magAtWell) gunPoint(rig, rig.grip.mag, st.magProp.position);
      else st.magProp.position.copy(TGT_S).add(_v1.set(0, 0.06, 0).applyQuaternion(rig.M[10]));
      st.magProp.quaternion.copy(GUN_Q);
      st.magProp.scale.setScalar(rig.gunScale);
    } else if (st.magProp) st.magProp.visible = false;
    // heal prop between the hands
    if (W.heal > 0.3 && st.healType) {
      if (!st.healProp || st.healPropType !== st.healType) {
        if (st.healProp && st.healProp.parent) st.healProp.parent.remove(st.healProp);
        st.healProp = buildHealProp(st.healType, false);
        st.healPropType = st.healType;
        root.add(st.healProp);
      }
      st.healProp.visible = true;
      st.healProp.position.copy(TGT_S).lerp(TGT_T, 0.35).add(_v1.set(0, 0.07, 0.04).applyQuaternion(chestM));
      st.healProp.quaternion.copy(chestM);
      const ud = st.healProp.userData;
      if (ud.lid) ud.lid.rotation.x = -1.6 * sstep(0.15, 0.3, st.healT) * (1 - sstep(0.85, 0.95, st.healT));
      if (ud.plunger) ud.plunger.position.y = 0.05 - 0.07 * sstep(0.45, 0.8, st.healT);
    } else if (st.healProp) st.healProp.visible = false;
    return true;
  }

  /** Begin the death fall on an actor (bot / player / remote). Mesh stays visible while falling. */
  function startDeath(actor, fromDir) {
    const mesh = actor && (actor.thirdPersonMesh || actor.mesh);
    if (!mesh) return false;
    const rig = findRig(mesh) || (mesh.userData._rigTry = 0, findRig(mesh));
    if (!rig) return false;
    const st = rig.st;
    if (st.deadT >= 0) return true;
    st.deadT = 0;
    st.deadAt = performance.now() * 0.001;
    st.deadDir = Math.random() < 0.65 ? -1 : 1;
    if (fromDir) {
      // fall away from the shooter: shooter in front -> fall backwards
      const yaw = mesh.rotation.y;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      st.deadDir = (fromDir.x * fx + fromDir.z * fz) > 0 ? -1 : 1;
    }
    st.deadSide = (Math.random() - 0.5) * 1.2;
    mesh.visible = true;
    return true;
  }

  function resetDeath(mesh) {
    const rig = mesh && mesh.userData.gwRig;
    if (rig) { rig.st.deadT = -1; rig.st.w.dead = 0; }
  }

  // ---------------------------------------------------------------- actors (bots / remotes)
  const dying = [];

  function botState(b, game) {
    const s = {
      grounded: b.velocity ? b.velocity.y === 0 : true,
      sprint: false, slide: false, crouch: false, ads: false,
      knocked: !!b.knocked, reload: -1, heal: null, healT: 0, melee: -1,
      aimPitch: 0, noGun: false, skydive: !!b.skydiving, weaponId: b.weaponId, fired: false
    };
    if (b.currentEnemy && b.currentEnemy.position) {
      const e = b.currentEnemy.position;
      const dx = e.x - b.position.x, dz = e.z - b.position.z, dy = (e.y + 1.2) - (b.position.y + 1.5);
      s.aimPitch = Math.atan2(dy, Math.hypot(dx, dz));
      s.ads = Math.hypot(dx, dz) > 18;
    }
    if (b.isHealingBattery) { s.heal = 'shield_battery'; s.healT = 1 - clamp((b.batteryTimer || 0) / 2.6, 0, 1); }
    // fire pulse: fireTimer jumps up when a shot was taken
    const ft = b.fireTimer || 0;
    if (ft > (b._animLastFT || 0) + 0.04 && b.currentEnemy) s.fired = true;
    b._animLastFT = ft;
    return s;
  }

  function camPan(game, pos) {
    const cam = game.camera;
    if (!cam) return { pan: 0, dist: 0 };
    const dx = pos.x - cam.position.x, dz = pos.z - cam.position.z, dist = Math.hypot(dx, dz);
    _v1.set(1, 0, 0).applyQuaternion(cam.quaternion);
    return { pan: dist > 0.1 ? clamp((dx * _v1.x + dz * _v1.z) / dist, -1, 1) * 0.85 : 0, dist };
  }

  /** Per-frame: animate living bots, play their hurt / knock / death vocals, run death falls. */
  function updateActors(game, dt) {
    const cam = game.camera ? game.camera.position : null;
    const bots = game.bots || [];
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i], mesh = b.mesh;
      if (!mesh) continue;
      // death transition: combat hides the mesh; bring it back for the fall
      if (b._animAlive && !b.alive && !b.isDummy) {
        b._animAlive = false;
        const hp = camPan(game, b.position);
        if (startDeath(b)) {
          dying.push({ mesh, until: performance.now() * 0.001 + 3.2, actor: b });
          if (window.SFX && window.SFX.playVoice && hp.dist < 55) window.SFX.playVoice('death', { hero: b.heroId, seed: b.id, pan: hp.pan, dist: hp.dist });
        }
        continue;
      }
      if (!b.alive) continue;
      b._animAlive = true;
      if (!mesh.visible || b.inDropship) continue;
      // vocals: hurt / knock
      const hpNow = (b.hp || 0) + (b.shield || 0) + (b.knocked ? (b.knockedHp || 0) : 0);
      if (b._animHp != null && hpNow < b._animHp - 0.5) {
        const st = mesh.userData.gwRig && mesh.userData.gwRig.st;
        if (st) { st.flinchV += 4 + Math.min(6, (b._animHp - hpNow) * 0.15); st.flinchDir = Math.random() < 0.8 ? 1 : -1; }
        const now = performance.now() * 0.001;
        const hp = camPan(game, b.position);
        if (window.SFX && window.SFX.playVoice && hp.dist < 50) {
          if (now - (b._animVoiceAt || 0) > 0.9 && Math.random() < ((b._animHp - hpNow) >= 4 ? 0.7 : 0.15)) {
            b._animVoiceAt = now;
            window.SFX.playVoice((b._animHp - hpNow) > 30 ? 'hurtBig' : 'hurt', { hero: b.heroId, seed: b.id, pan: hp.pan, dist: hp.dist, vol: 0.8 });
          }
        }
      }
      if (b.knocked && !b._animKnocked && b._animHp != null && window.SFX && window.SFX.playVoice) {
        const hp = camPan(game, b.position);
        if (hp.dist < 55) window.SFX.playVoice('knock', { hero: b.heroId, seed: b.id, pan: hp.pan, dist: hp.dist });
        b._animVoiceAt = performance.now() * 0.001;
      }
      b._animKnocked = !!b.knocked;
      b._animHp = hpNow;
      // distance LOD: far bodies update at a lower rate
      let d = 0;
      if (cam) d = Math.hypot(mesh.position.x - cam.x, mesh.position.z - cam.z);
      const skip = d > 110 ? 4 : d > 55 ? 2 : 1;
      const ud = mesh.userData;
      ud._animAcc = (ud._animAcc || 0) + dt;
      ud._animF = ((ud._animF || 0) + 1) % skip;
      if (ud._animF !== 0) continue;
      drive(mesh, botState(b, game), ud._animAcc);
      ud._animAcc = 0;
    }
    // death falls
    const now = performance.now() * 0.001;
    for (let i = dying.length - 1; i >= 0; i--) {
      const dd = dying[i];
      if (dd.actor && dd.actor.alive) { resetDeath(dd.mesh); dying.splice(i, 1); continue; }
      if (now > dd.until) {
        if (!dd.keep) dd.mesh.visible = false;
        resetDeath(dd.mesh);
        dying.splice(i, 1);
        continue;
      }
      if (now > dd.until - 0.7 && !dd.keep) dd.mesh.position.y -= dt * 0.9; // sink away
      drive(dd.mesh, { grounded: true, knocked: false, reload: -1, melee: -1, noGun: true }, dt);
    }
  }

  window.HeroAnim = { drive, startDeath, resetDeath, updateActors, findRig, buildHealProp, dying, GRIPS };

  // =====================================================================================
  // FIRST-PERSON VIEWMODEL
  // =====================================================================================
  function Spring() { this.x = new V3(); this.v = new V3(); }
  Spring.prototype.step = function (target, k, c, dt) {
    // semi-implicit Euler with substeps (stable for k up to ~600 at 20 fps)
    const n = dt > 1 / 50 ? Math.ceil(dt * 60) : 1, h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v.x += (k * (target.x - this.x.x) - c * this.v.x) * h;
      this.v.y += (k * (target.y - this.x.y) - c * this.v.y) * h;
      this.v.z += (k * (target.z - this.x.z) - c * this.v.z) * h;
      this.x.addScaledVector(this.v, h);
    }
    return this.x;
  };

  const VA = {
    st: null,
    _init(game) {
      this.st = {
        pos: new Spring(), rot: new Spring(),     // base pose follow
        rec: new Spring(), recR: new Spring(),    // recoil (pos z/y, rot x/y/z)
        land: new Spring(),                       // jump / land
        sway: new Spring(),                       // look sway
        bobPh: 0, bobAmp: 0, wasGround: true, lastVy: 0,
        prevYaw: null, prevPitch: null,
        heal: null, healType: null, healAlpha: 0,
        mag: null, magDrop: null, magWep: null, reloadPrev: 0,
        vm: null
      };
      this.st.pos.x.set(0.19, -0.5, -0.58);
    },

    /** Called on every player shot. */
    kick(wep) {
      if (!this.st) return;
      const d = (wep && wep.data) || {};
      const heavy = d.id === 'magnum' || wep.id === 'magnum' ? 2.2 : wep.id === 'ak47' ? 1.3 : wep.id === 'uzi' || wep.id === 'p90' ? 0.75 : 1.0;
      const ads = window.GAME && window.GAME.player && window.GAME.player.isADS ? 0.45 : 1;
      this.st.rec.v.z += 2.2 * heavy * ads;
      this.st.rec.v.y += 0.35 * heavy * ads;
      this.st.recR.v.x += (2.6 + Math.random() * 0.8) * heavy * ads;
      this.st.recR.v.y += (Math.random() - 0.5) * 1.2 * heavy * ads;
      this.st.recR.v.z += (Math.random() - 0.5) * 1.8 * heavy * ads;
    },
    jump() { if (this.st) { this.st.land.v.y += 0.9; this.st.land.v.x -= 0.5; } },
    landed(impact) { if (this.st) { this.st.land.v.y -= 0.6 + impact * 2.4; this.st.land.v.x += impact * 1.2; } },

    _ensureMag(game, wep) {
      const st = this.st, vm = game.activeViewmodel;
      if (st.mag && st.magWep === vm) return;
      const g = GRIPS[wep.id] || GRIPS.m4a1, S = shared();
      const mk = () => {
        const m = new THREE.Group();
        if (g.revolver) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 12), S.magMat);
          c.rotation.x = Math.PI / 2; m.add(c);
          for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.02, 6), S.brassMat); const a = i / 6 * Math.PI * 2; b.position.set(Math.cos(a) * 0.016, Math.sin(a) * 0.016, -0.018); b.rotation.x = Math.PI / 2; m.add(b); }
        } else {
          const box = new THREE.Mesh(new THREE.BoxGeometry(g.magSize[0], g.magSize[1], g.magSize[2]), S.magMat);
          box.rotation.x = g.magTilt;
          const top = new THREE.Mesh(new THREE.BoxGeometry(g.magSize[0] * 0.7, 0.012, g.magSize[2] * 0.6), S.brassMat);
          top.position.y = g.magSize[1] / 2 + 0.004;
          box.add(top);
          m.add(box);
        }
        m.visible = false;
        m.userData.gwAnimProp = true;
        m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
        vm.add(m);
        return m;
      };
      st.mag = mk(); st.magDrop = mk(); st.magWep = vm;
    },

    _ensureHeal(game, type) {
      const st = this.st;
      if (!st.heal) {
        const g = new THREE.Group();
        g.visible = false;
        game.camera.add(g);
        st.heal = { root: g, props: {}, armL: null, armR: null, device: null, src: null };
      }
      const H = st.heal, vm = game.activeViewmodel;
      // clone the hero's first-person arms from the live viewmodel (shares geometry & materials)
      if (vm && H.src !== vm && vm.userData.leftArmGroup) {
        if (H.armL) H.root.remove(H.armL);
        if (H.armR) H.root.remove(H.armR);
        H.armL = vm.userData.leftArmGroup.clone(true);
        H.armR = vm.userData.rightArmGroup.clone(true);
        H.armL.userData.hand0 = H.armL.children[0].position.clone();
        H.armR.userData.hand0 = H.armR.children[0].position.clone();
        H.root.add(H.armL, H.armR);
        H.src = vm;
        if (!H.device) {
          // wrist "rune device" the shield items charge into
          const S = shared();
          const dev = new THREE.Group();
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 12), S.capMat);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.005, 6, 18), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 }));
          ring.rotation.x = Math.PI / 2; ring.position.y = 0.016;
          dev.add(base, ring);
          dev.userData.ring = ring;
          H.device = dev;
        }
        H.armL.children[0].add(H.device);
        H.device.position.set(-0.01, -0.035, 0.05);
        H.device.rotation.set(0, 0, 0);
      }
      if (type && !H.props[type]) {
        const p = buildHealProp(type, true);
        p.visible = false;
        H.root.add(p);
        H.props[type] = p;
      }
      return H;
    },

    /** Main per-frame update. inp = { inputLen, moveF, moveR } */
    update(game, p, wep, dt, inp) {
      const vm = game.activeViewmodel;
      if (!vm) return;
      if (!this.st) this._init(game);
      const st = this.st;
      dt = Math.min(dt, 0.1);
      const t = game.matchTime || performance.now() * 0.001;
      const healing = p.healTimer > 0 && !!p.healingType;
      const healT = healing ? clamp(1 - p.healTimer / Math.max(0.1, p.healDuration || 1), 0, 1) : 0;

      // ---------------- look sway (angular velocity -> lagging offset)
      if (st.prevYaw == null) { st.prevYaw = p.yaw; st.prevPitch = p.pitch; }
      const dYaw = wrapPi(p.yaw - st.prevYaw), dPitch = p.pitch - st.prevPitch;
      st.prevYaw = p.yaw; st.prevPitch = p.pitch;
      const adsK = p.isADS ? 0.22 : 1;
      _v1.set(clamp(-dYaw / dt * 0.012, -0.05, 0.05) * adsK, clamp(-dPitch / dt * 0.012, -0.04, 0.04) * adsK, 0);
      st.sway.step(_v1, 90, 13, dt);

      // ---------------- base pose
      const pos = _v2, rot = _v3;
      const speed = inp.inputLen * (p.isSprinting ? 1.4 : 1);
      if (p.isADS && !healing) { pos.set(0, -0.132, -0.32); rot.set(0, 0, 0); }
      else if (p.inspectTimer > 0) {
        const it = p.inspectTimer;
        pos.set(0.06, -0.14, -0.5); rot.set(0.15, Math.sin(it * 2.6) * 0.85, Math.cos(it * 2.6) * 0.35);
      } else if (p.isSprinting && !p.isSliding) { pos.set(0.15, -0.3, -0.5); rot.set(0.14, 0.62, -0.32); }
      else if (p.isSliding) { pos.set(0.15, -0.25, -0.54); rot.set(-0.04, 0.12, 0.26); }
      else { pos.set(0.19, -0.235, -0.58); rot.set(0, 0.07, 0); }
      if (p.isCrouching && !p.isADS) { pos.y += 0.01; rot.z += 0.05; }
      if (p.meleeTimer > 0) { pos.set(0.24, -0.36, -0.42); rot.set(-0.35, -0.3, 0.4); }
      if (p.holstered) { pos.set(0.19, -0.6, -0.5); rot.set(-0.6, 0, 0); }

      // reload choreography (gun tilt keyed to progress)
      const rl = wep.reloading ? clamp(1 - wep.reloadTimer / Math.max(0.1, wep._rlTotal || wep.data.reloadTime || 2), 0, 1) : -1;
      if (rl >= 0 && !healing) {
        const g = GRIPS[wep.id] || GRIPS.m4a1;
        const tilt = sstep(0, 0.12, rl) * (1 - sstep(0.8, 0.98, rl));
        if (g.revolver) {
          pos.set(lerp(pos.x, 0.08, tilt), lerp(pos.y, -0.2, tilt), lerp(pos.z, -0.45, tilt));
          rot.set(lerp(rot.x, 0.35, tilt), lerp(rot.y, 0.25, tilt), lerp(rot.z, 0.95, tilt));
        } else {
          // roll the mag well toward the camera and lift the gun so the magazine swap reads
          pos.set(lerp(pos.x, 0.13, tilt), lerp(pos.y, -0.17, tilt), lerp(pos.z, -0.46, tilt));
          rot.set(lerp(rot.x, 0.14, tilt), lerp(rot.y, 0.22, tilt), lerp(rot.z, -0.62, tilt));
        }
        // seat jolt + charging handle
        const seat = sstep(0.6, 0.63, rl) * (1 - sstep(0.63, 0.72, rl));
        const bolt = sstep(0.82, 0.86, rl) * (1 - sstep(0.86, 0.95, rl));
        pos.y += seat * 0.018; rot.x += seat * 0.08;
        pos.z += bolt * 0.03; rot.z -= bolt * 0.2; rot.y -= bolt * 0.08;
      }
      // healing: weapon drops out of view
      const hk = sstep(0, 0.12, healing ? 1 : 0);
      st.healAlpha = damp(st.healAlpha, healing ? 1 : 0, 10, dt);
      if (st.healAlpha > 0.01) {
        const a = st.healAlpha;
        pos.set(lerp(pos.x, 0.22, a), lerp(pos.y, -0.62, a), lerp(pos.z, -0.45, a));
        rot.set(lerp(rot.x, -0.9, a), lerp(rot.y, 0.3, a), lerp(rot.z, 0.2, a));
      }
      void hk;

      // ---------------- bob (figure-8), stronger when sprinting, minimal in ADS
      const moving = inp.inputLen > 0.1 && p.onGround && !p.isSliding;
      st.bobAmp = damp(st.bobAmp, moving ? (p.isADS ? 0.15 : p.isSprinting ? 2.0 : 1.0) : 0, 8, dt);
      st.bobPh += dt * (p.isSprinting ? 13.5 : p.isADS ? 7.5 : 10.5) * (moving ? 1 : 0.0);
      const ba = st.bobAmp;
      const breathe = (p.isADS ? 0.25 : 1) * Math.sin(t * 1.6) * 0.0035;
      pos.x += Math.sin(st.bobPh) * 0.011 * ba;
      pos.y += -Math.abs(Math.cos(st.bobPh)) * 0.011 * ba + breathe;
      rot.z += Math.sin(st.bobPh) * 0.018 * ba;
      rot.x += Math.abs(Math.cos(st.bobPh)) * 0.012 * ba;
      // strafe tilt
      rot.z -= (inp.moveR || 0) * (p.isADS ? 0.015 : 0.06);
      pos.x += (inp.moveR || 0) * -0.006;
      // airborne: weapon floats up slightly with vertical velocity
      if (!p.onGround && !p.ziplining) { pos.y += clamp(-p.velocity.y * 0.0025, -0.03, 0.03); rot.x += clamp(p.velocity.y * 0.006, -0.06, 0.06); }

      // landing / jump detection
      if (p.onGround && !st.wasGround && st.lastVy < -4) this.landed(clamp((-st.lastVy - 4) / 16, 0, 1));
      if (!p.onGround) st.lastVy = p.velocity.y;
      st.wasGround = p.onGround;

      // ---------------- springs
      const P = st.pos.step(pos, p.isADS ? 380 : 260, p.isADS ? 38 : 30, dt);
      const R = st.rot.step(rot, 240, 28, dt);
      const RC = st.rec.step(_v4.set(0, 0, 0), 420, 30, dt);
      const RR = st.recR.step(_v5.set(0, 0, 0), 360, 26, dt);
      const LD = st.land.step(_v6.set(0, 0, 0), 120, 14, dt);
      const SW = st.sway.x;
      vm.position.set(P.x + SW.x + RR.y * -0.01, P.y + SW.y + LD.y * 0.06 + RC.y * 0.01, P.z + RC.z * 0.035);
      vm.rotation.set(R.x + RR.x * 0.045 + LD.x * 0.04 - SW.y * 0.8, R.y + RR.y * 0.03 + SW.x * 1.4, R.z + RR.z * 0.03 + SW.x * -1.2, 'XYZ');

      // ---------------- support hand + magazine during reload
      const ud = vm.userData;
      const armL = ud.leftArmGroup;
      if (armL) {
        if (rl >= 0 && !healing) {
          this._ensureMag(game, wep);
          const g = GRIPS[wep.id] || GRIPS.m4a1;
          const toWell = _v1.set(g.mag[0] - g.l[0], g.mag[1] - g.l[1] - 0.04, g.mag[2] - g.l[2] + 0.02);
          const below = _v2.set(toWell.x + 0.05, toWell.y - 0.42, toWell.z + 0.12);
          const k1 = sstep(0.0, 0.12, rl), k2 = sstep(0.14, 0.3, rl), k3 = sstep(0.38, 0.6, rl), k4 = sstep(0.78, 0.95, rl);
          const off = _v4.set(0, 0, 0).lerp(toWell, k1);
          off.lerp(below, k2 * (1 - k3));
          if (k3 > 0) off.lerp(toWell, k3);
          if (k4 > 0) off.multiplyScalar(1 - k4);
          armL.position.copy(off);
          armL.rotation.set(-0.3 * (k1 - k4) * (1 - k2 + k3), 0, 0.25 * (k1 - k4));
          // new magazine travels with the hand from below, slides home at 0.6
          const mag = st.mag, drop = st.magDrop;
          const handP = _v5.copy(armL.children[0].position).add(armL.position);
          const showNew = rl > 0.3 && rl < 0.66;
          mag.visible = showNew;
          if (showNew) {
            const seatK = sstep(0.55, 0.62, rl);
            mag.position.set(handP.x - 0.03, handP.y + 0.06, handP.z).lerp(_v6.set(g.mag[0], g.mag[1], g.mag[2]), seatK);
            mag.rotation.set(0, 0, 0);
          }
          // old magazine drops out of the well
          const dk = clamp((rl - 0.1) / 0.22, 0, 1);
          drop.visible = !g.revolver && rl > 0.1 && rl < 0.32;
          if (drop.visible) {
            drop.position.set(g.mag[0], g.mag[1] - 0.02 - dk * dk * 0.5, g.mag[2] + dk * 0.04);
            drop.rotation.set(dk * 1.2, 0, dk * 0.6);
          }
          if (g.revolver && ud.isRevolver && ud.magMesh) ud.magMesh.rotation.z += dt * 18 * (rl > 0.2 && rl < 0.4 ? 1 : 0);
        } else {
          armL.position.multiplyScalar(1 - dampF(16, dt));
          armL.rotation.x *= 1 - dampF(16, dt); armL.rotation.z *= 1 - dampF(16, dt);
          if (st.mag && st.magWep === vm) { st.mag.visible = false; st.magDrop.visible = false; }
        }
      }

      // ---------------- melee: heirloom swing arc
      if (ud.meleeMesh) {
        const showHeirloom = !!(p.meleeTimer > 0 || p.holstered);
        ud.meleeMesh.visible = showHeirloom;
        if (p.meleeTimer > 0) {
          const m = 1 - p.meleeTimer / 0.52;
          const wind = sstep(0, 0.22, m), hit = sstep(0.22, 0.48, m), back = sstep(0.6, 1, m);
          ud.meleeMesh.position.set(lerp(-0.18, 0.05, wind) - hit * 0.32 + back * 0.15, -0.06 + wind * 0.12 - hit * 0.16 + back * 0.04, -0.25 - hit * 0.1);
          ud.meleeMesh.rotation.set(-0.4 * wind + 1.4 * hit - back, 0.5 * wind - 0.8 * hit, 0.9 * wind - 1.6 * hit + back * 0.7);
          if (m > 0.2 && m < 0.3 && !st._meleeVox) { st._meleeVox = true; if (window.SFX && window.SFX.playVoice) window.SFX.playVoice('effort', { hero: p.heroId, vol: 0.7 }); }
        } else {
          st._meleeVox = false;
          if (p.holstered) { ud.meleeMesh.rotation.y += dt * 4.5; ud.meleeMesh.position.set(0.0, -0.02, -0.25); }
        }
      }

      // ---------------- first-person healing hands
      this._updateHeal(game, p, healing, healT, dt, t);
    },

    _updateHeal(game, p, healing, ht, dt, t) {
      const st = this.st;
      if (!healing && (!st.heal || !st.heal.root.visible)) return;
      const type = healing ? p.healingType : st.healType;
      const H = this._ensureHeal(game, type);
      if (healing) st.healType = type;
      const a = st.healAlpha;
      H.root.visible = a > 0.02 && !!type;
      if (!H.root.visible || !H.armL) return;
      for (const k in H.props) H.props[k].visible = k === type;
      const prop = H.props[type];
      // the whole rig rises into view at the start and drops away at the end
      const outro = sstep(0.9, 1, ht);
      H.root.position.set(0, (1 - a) * -0.3 - outro * 0.12, 0);
      H.root.rotation.set(-outro * 0.25, 0, 0);
      const L = H.armL, R = H.armR, l0 = L.userData.hand0, r0 = R.userData.hand0;
      // arms keep their natural forearm direction (coming up from the bottom corners); only small tilts
      const place = (arm, h0, x, y, z, rx, ry, rz) => {
        arm.rotation.set(rx, ry, rz);
        _v1.copy(h0).applyEuler(arm.rotation);
        arm.position.set(x - _v1.x, y - _v1.y, z - _v1.z);
      };
      const PS = { shield_battery: 0.5, shield_cell: 0.95, syringe: 1.15, medkit: 0.72, phoenix_kit: 0.72 };
      if (prop) prop.scale.setScalar(PS[type] || 0.8);
      const shake = Math.sin(t * 43) * 0.0012;
      if (type === 'shield_battery' || type === 'shield_cell') {
        const big = type === 'shield_battery';
        const bring = sstep(0.0, big ? 0.3 : 0.22, ht), press = sstep(big ? 0.32 : 0.24, big ? 0.42 : 0.32, ht);
        const charge = sstep(big ? 0.42 : 0.33, 0.9, ht);
        // left forearm raised with the wrist device facing the camera
        const lx = -0.075, ly = -0.17 + shake * charge, lz = -0.36;
        place(L, l0, lx, ly, lz, 0.35, 0.25, -0.35);
        // right hand brings the item over the device, then pushes it in
        const hx = lerp(0.16, 0.0, bring), hy = lerp(-0.34, -0.11, bring) - press * 0.035, hz = lerp(-0.4, -0.355, bring);
        place(R, r0, hx + 0.03, hy - 0.035, hz + 0.01, -0.25, 0.15, 0.5);
        if (prop) {
          prop.position.set(hx - 0.01, hy + (big ? 0.012 : 0.006), hz);
          prop.rotation.set(0.35, 0, lerp(-0.7, -0.15, bring) + press * 0.1);
          const gl = prop.userData.glow;
          if (gl) gl.color.setHSL(0.55, 0.9, 0.42 + 0.3 * charge * (0.6 + 0.4 * Math.sin(t * 30)));
        }
        if (H.device && H.device.userData.ring) {
          const ring = H.device.userData.ring;
          ring.rotation.z += dt * (2 + charge * 18);
          ring.material.opacity = 0.3 + charge * 0.7 * (1 - outro);
          ring.scale.setScalar(1 + charge * 0.3);
        }
      } else if (type === 'syringe') {
        const bring = sstep(0, 0.3, ht), inject = sstep(0.34, 0.42, ht), push = sstep(0.45, 0.8, ht), pull = sstep(0.82, 0.92, ht);
        place(L, l0, -0.07, -0.19, -0.37, 0.3, 0.3, -0.3);
        const nx = lerp(0.15, 0.03, bring) - inject * 0.02 + pull * 0.04, ny = lerp(-0.34, -0.12, bring) - inject * 0.012 + pull * 0.03, nz = -0.36;
        place(R, r0, nx + 0.04, ny - 0.03, nz + 0.02, -0.2, 0.1, 0.6);
        if (prop) {
          prop.position.set(nx, ny, nz);
          prop.rotation.set(0.25, 0, 0.95);
          if (prop.userData.plunger) prop.userData.plunger.position.y = 0.05 - 0.07 * push;
          if (prop.userData.fluid) { prop.userData.fluid.scale.y = Math.max(0.05, 1 - push); prop.userData.fluid.position.y = -0.05 * push; }
        }
        if (H.device && H.device.userData.ring) H.device.userData.ring.material.opacity = 0.15;
      } else { // medkit / phoenix_kit
        const bring = sstep(0, 0.15, ht), open = sstep(0.15, 0.3, ht), spray = sstep(0.32, 0.45, ht), close = sstep(0.85, 0.95, ht);
        const kx = -0.03, ky = lerp(-0.34, -0.18, bring), kz = -0.38;
        place(L, l0, kx - 0.07, ky - 0.02, kz + 0.02, 0.3, 0.25, -0.3);
        if (prop) {
          prop.position.set(kx, ky + 0.015, kz);
          prop.rotation.set(0.55, 0.2, 0.05);
          if (prop.userData.lid) prop.userData.lid.rotation.x = -1.9 * open * (1 - close);
        }
        // right hand pulls the spray out of the kit and sweeps it over the left forearm
        const sw = spray * (1 - close);
        const c1 = Math.sin(ht * 22) * sw, c2 = Math.cos(ht * 22) * sw;
        const rx = lerp(0.1, -0.05 + c1 * 0.04, sw), ry = lerp(ky + 0.01, -0.15 + c2 * 0.02, sw) - open * 0.02 * (1 - sw), rz = lerp(-0.38, -0.36, sw);
        place(R, r0, rx + 0.03, ry - 0.03, rz + 0.01, -0.25, 0.1, 0.45 + sw * 0.3);
        if (prop && prop.userData.spray) {
          const sp = prop.userData.spray;
          sp.visible = sw > 0.05;
          _v1.set(rx, ry + 0.01, rz);
          prop.updateMatrix();
          _v1.applyMatrix4(_m4.copy(prop.matrix).invert());
          sp.position.copy(_v1);
          sp.rotation.set(-0.5, 0, 0.6);
        }
        if (H.device && H.device.userData.ring) H.device.userData.ring.material.opacity = 0.15;
      }
    }
  };
  const _m4 = new THREE.Matrix4();
  window.ViewAnim = VA;
})();
