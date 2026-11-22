/**
 * GOD WARS — STATIC GEOMETRY BATCHER
 * Merges thousands of static world meshes (walls, floors, stairs, columns, trims)
 * into a handful of chunked meshes grouped by material + spatial cell.
 * Collisions are AABB-based (world.colliders), so merging visuals is gameplay-safe.
 *
 * Rules (conservative, so nothing interactive ever gets frozen):
 *  - only meshes that are direct children of the scene, or children of Groups flagged
 *    userData.staticBatch (stair ramps);
 *  - never anything referenced from the world's own state (doors, loot, bins, ring, props…);
 *  - single opaque material, visible, non-instanced, non-skinned.
 */
(function () {
  const CELL = 64; // meters per spatial chunk (keeps frustum culling useful)

  function collectDynamic(root, out, depth) {
    if (!root || depth > 4) return;
    if (root.isObject3D) { out.add(root); return; }
    if (Array.isArray(root)) { root.forEach(v => collectDynamic(v, out, depth + 1)); return; }
    if (typeof root === 'object' && !(root instanceof HTMLElement) && !(root.isMaterial) && !(root.isTexture) && !(root.isBufferGeometry)) {
      for (const k in root) {
        if (k === 'scene' || k === 'mats' || k === 'renderer' || k === 'world') continue;
        const v = root[k];
        if (v && typeof v === 'object') collectDynamic(v, out, depth + 1);
      }
    }
  }

  function isAncestorDynamic(obj, dyn, scene) {
    let q = obj;
    while (q && q !== scene) {
      if (dyn.has(q)) return true;
      q = q.parent;
    }
    return false;
  }

  // Identical-looking materials (common with cloned GLBs) share one batch.
  const matKeyCache = new WeakMap();
  function materialKey(m) {
    if (matKeyCache.has(m)) return matKeyCache.get(m);
    const parts = [m.type, m.side, m.vertexColors ? 1 : 0, m.flatShading ? 1 : 0];
    ['color', 'emissive'].forEach(k => parts.push(m[k] ? m[k].getHexString() : '-'));
    ['roughness', 'metalness', 'emissiveIntensity', 'bumpScale', 'alphaTest', 'envMapIntensity'].forEach(k => parts.push(m[k] !== undefined ? (+m[k]).toFixed(3) : '-'));
    ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'bumpMap', 'aoMap', 'alphaMap'].forEach(k => parts.push(m[k] ? m[k].uuid : '-'));
    const key = m.isShaderMaterial ? m.uuid : parts.join('/');
    matKeyCache.set(m, key);
    return key;
  }

  function signature(geo) {
    const a = geo.attributes;
    return ['position', 'normal', 'uv', 'color'].filter(n => a[n]).join('|');
  }

  // r128 getX() returns raw integers for normalized attributes; convert to 0..1 floats.
  function denorm(attr) {
    if (!attr.normalized) return 1;
    const A = attr.array;
    if (A instanceof Uint8Array || A instanceof Uint8ClampedArray) return 1 / 255;
    if (A instanceof Uint16Array) return 1 / 65535;
    if (A instanceof Int8Array) return 1 / 127;
    if (A instanceof Int16Array) return 1 / 32767;
    return 1;
  }

  function mergeBucket(list, attrNames) {
    let vCount = 0, iCount = 0;
    list.forEach(m => {
      const g = m.geometry;
      vCount += g.attributes.position.count;
      iCount += g.index ? g.index.count : g.attributes.position.count;
    });
    const out = new THREE.BufferGeometry();
    const arrays = {};
    const sizes = { position: 3, normal: 3, uv: 2, color: 3 };
    attrNames.forEach(n => { arrays[n] = new Float32Array(vCount * sizes[n]); });
    const IndexArr = vCount > 65535 ? Uint32Array : Uint16Array;
    const index = new IndexArr(iCount);

    const v3 = new THREE.Vector3();
    const nMat = new THREE.Matrix3();
    let vOff = 0, iOff = 0;
    list.forEach(m => {
      const g = m.geometry;
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      m.updateWorldMatrix(true, false);
      const mw = m.matrixWorld;
      nMat.getNormalMatrix(mw);
      for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i).multiplyScalar(denorm(pos)).applyMatrix4(mw);
        arrays.position.set([v3.x, v3.y, v3.z], (vOff + i) * 3);
        if (arrays.normal) {
          v3.fromBufferAttribute(nor, i).multiplyScalar(denorm(nor)).applyMatrix3(nMat).normalize();
          arrays.normal.set([v3.x, v3.y, v3.z], (vOff + i) * 3);
        }
        if (arrays.uv) {
          const uv = g.attributes.uv, k = denorm(uv);
          arrays.uv[(vOff + i) * 2] = uv.getX(i) * k;
          arrays.uv[(vOff + i) * 2 + 1] = uv.getY(i) * k;
        }
        if (arrays.color) {
          const c = g.attributes.color, k = denorm(c);
          arrays.color.set([c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k], (vOff + i) * 3);
        }
      }
      if (g.index) {
        for (let i = 0; i < g.index.count; i++) index[iOff + i] = g.index.getX(i) + vOff;
        iOff += g.index.count;
      } else {
        for (let i = 0; i < pos.count; i++) index[iOff + i] = i + vOff;
        iOff += pos.count;
      }
      vOff += pos.count;
    });
    attrNames.forEach(n => out.setAttribute(n, new THREE.BufferAttribute(arrays[n], sizes[n])));
    out.setIndex(new THREE.BufferAttribute(index, 1));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }

  window.StaticBatcher = {
    // deep=false: build-time pass (scene children + stair groups only).
    // deep=true : post-GLB-load pass; walks static GLB groups (statues, architecture, archways).
    batch(scene, world, deep = false, extraRoots = null) {
      const t0 = performance.now();
      const dyn = new Set();
      collectDynamic(world, dyn, 0);
      if (extraRoots) collectDynamic(extraRoots, dyn, 0);
      dyn.delete(scene);

      const buckets = new Map();
      const candidates = [];
      scene.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isPoints || o.isLine) return;
        const parent = o.parent;
        let parentOk;
        if (deep) {
          parentOk = true;
          let q = parent;
          while (q && q !== scene) {
            const ud = q.userData || {};
            const keys = Object.keys(ud).filter(k => k !== 'staticBatch' && k !== 'name');
            if (!q.visible || keys.length || q.isBone || q.isCamera) { parentOk = false; break; }
            q = q.parent;
          }
          if (q !== scene) parentOk = false;
        } else {
          parentOk = parent === scene || (parent && parent.userData && parent.userData.staticBatch && parent.parent === scene);
        }
        if (!parentOk || !o.visible || (parent !== scene && !parent.visible)) return;
        if (Array.isArray(o.material) || !o.material || o.material.transparent) return;
        if (o.material.isShaderMaterial && !o.material.userData.batchable) return;
        if (Object.keys(o.userData).filter(k => !(deep && k === 'name')).length) return;
        if (isAncestorDynamic(o, dyn, scene)) return;
        if (!o.geometry || !o.geometry.attributes.position) return;
        candidates.push(o);
      });

      candidates.forEach(m => {
        m.updateWorldMatrix(true, false);
        const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
        const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
        const sig = signature(m.geometry);
        const key = `${materialKey(m.material)}|${sig}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${cx},${cz}`;
        if (!buckets.has(key)) buckets.set(key, { mat: m.material, sig, cast: m.castShadow, recv: m.receiveShadow, list: [] });
        buckets.get(key).list.push(m);
      });

      let merged = 0, removed = 0;
      buckets.forEach(b => {
        if (b.list.length < 2) return;
        const geo = mergeBucket(b.list, b.sig.split('|'));
        const mesh = new THREE.Mesh(geo, b.mat);
        mesh.castShadow = b.cast;
        mesh.receiveShadow = b.recv;
        mesh.matrixAutoUpdate = false;
        mesh.name = 'static_batch';
        scene.add(mesh);
        b.list.forEach(m => { m.parent.remove(m); removed++; });
        merged++;
      });
      if (deep) {
        // prune empty static ancestors
        let pruned = true;
        while (pruned) {
          pruned = false;
          scene.traverse(o => {
            if (o !== scene && !o.isMesh && !o.isLight && !o.isCamera && o.type === 'Group' && o.children.length === 0 && o.parent && !dyn.has(o)) { o.userData._prune = true; }
          });
          const list = [];
          scene.traverse(o => { if (o.userData && o.userData._prune) list.push(o); });
          list.forEach(o => { o.parent.remove(o); pruned = true; });
        }
      }
      // drop now-empty stair groups
      scene.children.filter(c => c.userData && c.userData.staticBatch && c.children.length === 0).forEach(c => scene.remove(c));

      const ms = (performance.now() - t0).toFixed(0);
      console.info(`[StaticBatcher] ${removed} meshes -> ${merged} batches in ${ms}ms`);
      return { removed, merged };
    },

    // Waits for every pending GLB load, then runs the deep pass once.
    batchWhenGLBReady(scene, world, isAlive, extraRoots) {
      const MF = window.ModelFactory;
      let tries = 0;
      const tick = () => {
        if (isAlive && !isAlive()) return;
        tries++;
        const pending = MF && MF._glbLoading ? Object.keys(MF._glbLoading).filter(k => MF._glbLoading[k] && !MF._glbCache[k]).length : 0;
        if (pending > 0 && tries < 40) { setTimeout(tick, 500); return; }
        try { this.batch(scene, world, true, extraRoots ? extraRoots() : null); } catch (e) { console.warn('StaticBatcher deep pass failed', e); }
      };
      setTimeout(tick, 600);
    }
  };
})();
