/**
 * GOD WARS — ONLINE ARENA CLIENT
 * Connects to server/server.js, mirrors remote players as shootable "contenders" inside GAME.bots,
 * so the existing hitscan, aim-assist, minimap and damage-number code works on humans unchanged.
 */
(function () {
  const SEND_HZ = 15;
  const INTERP_DELAY_MS = 110; // render remote players slightly in the past for smooth motion
  const RESPAWN_S = 3.5;
  const SPAWNS = [[0, 34], [0, -34], [34, 0], [-34, 0], [24, 24], [-24, -24], [24, -24], [-24, 24]];

  function defaultServerUrl() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q.startsWith('ws') ? q : `ws://${q}/ws`;
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    }
    return 'ws://localhost:8787/ws';
  }

  class RemoteContender {
    constructor(info, game) {
      const H = window.GODWARS_DATA.HEROES;
      this.isRemote = true;
      this.netId = info.id;
      this.name = info.name;
      this.heroId = H[info.hero] ? info.hero : 'thor';
      this.teamId = 1000 + info.id;           // everyone is an enemy (free-for-all arena)
      this.isAlly = false;
      this.inDropship = false;
      this.skydiving = false;
      this.knocked = false;
      this.alive = true;
      this.maxHp = (H[this.heroId] && H[this.heroId].maxHp) || 100;
      this.hp = this.maxHp;
      this.shield = 75; this.maxShield = 75; this.shieldTier = 2;
      this.fireTimer = 0;
      this.perks = {};
      this.kills = info.kills || 0;
      this.position = new THREE.Vector3(0, -50, 0);
      this.buffer = [];                        // [{ts, p:[x,y,z], y}]
      this.mesh = window.ModelFactory.createHeroModel(this.heroId);
      this.mesh.visible = false;
      game.scene.add(this.mesh);
      this.game = game;
      this.anim = 'Idle';
    }
    pushState(ts, s) {
      this.buffer.push({ ts, p: s.p, y: s.y });
      if (this.buffer.length > 30) this.buffer.shift();
      this.hp = s.hp; this.shield = s.sh; this.shieldTier = s.st;
      this.maxShield = (window.GODWARS_DATA.EVO_TIERS[s.st] || { maxShield: 75 }).maxShield;
      this.alive = !!s.a;
      this.anim = s.an || 'Idle';
      if (s.f) this.fireTimer = 0.2;
    }
    update(dt) {
      this.fireTimer = Math.max(0, this.fireTimer - dt);
      const renderTs = Date.now() - INTERP_DELAY_MS + (NET.clockOffset || 0);
      const b = this.buffer;
      if (b.length) {
        let a = b[0], c = b[b.length - 1];
        for (let i = 0; i < b.length - 1; i++) {
          if (b[i].ts <= renderTs && b[i + 1].ts >= renderTs) { a = b[i]; c = b[i + 1]; break; }
        }
        const span = Math.max(1, c.ts - a.ts);
        const t = Math.max(0, Math.min(1, (renderTs - a.ts) / span));
        this.position.set(a.p[0] + (c.p[0] - a.p[0]) * t, a.p[1] + (c.p[1] - a.p[1]) * t, a.p[2] + (c.p[2] - a.p[2]) * t);
        let dy = c.y - a.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        this.mesh.rotation.y = a.y + dy * t + Math.PI;
      }
      this.mesh.position.copy(this.position);
      this.mesh.visible = this.alive && b.length > 0;
      const ud = this.mesh.userData;
      if (ud.mixer) ud.mixer.update(dt);
      if (ud.playAnim) ud.playAnim(this.anim);
    }
    dispose() {
      if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
    }
  }

  const NET = {
    ws: null,
    id: 0,
    room: '',
    remotes: new Map(),
    connected: false,
    clockOffset: 0,
    _sendTimer: null,
    _lastShotFlag: false,

    connect(name, room, url) {
      return new Promise((resolve, reject) => {
        let ws;
        try { ws = new WebSocket(url || defaultServerUrl()); } catch (e) { return reject(e); }
        this.ws = ws;
        const timer = setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error('timeout')); }, 5000);
        ws.onopen = () => {
          const G = window.GAME;
          ws.send(JSON.stringify({ t: 'join', name, room, hero: G.selectedHeroId }));
        };
        ws.onmessage = ev => {
          let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (m.t === 'welcome') { clearTimeout(timer); this.id = m.id; this.room = m.room; this.connected = true; this._pendingPlayers = m.players; resolve(m); }
          else if (m.t === 'full') { clearTimeout(timer); reject(new Error('room full')); }
          else this.onMessage(m);
        };
        ws.onerror = () => { clearTimeout(timer); reject(new Error('cannot reach server')); };
        ws.onclose = () => {
          const was = this.connected;
          this.connected = false;
          this.stopSending();
          if (was && window.GAME) window.GAME.showBanner('DISCONNECTED FROM ARENA SERVER', '#f43f5e');
        };
      });
    },

    send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); },

    startSending() {
      this.stopSending();
      this._sendTimer = setInterval(() => {
        const G = window.GAME, p = G && G.player;
        if (!p) return;
        const sp = Math.hypot(p.velocity.x, p.velocity.z);
        const an = p.isSliding ? 'Slide' : sp > 1.2 ? 'Run' : 'Idle';
        const w = p.weapons && p.weapons[p.activeWeaponIndex || 0];
        this.send({
          t: 'state', p: [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2)],
          y: +p.yaw.toFixed(3), pi: +p.pitch.toFixed(3), hp: Math.round(p.hp), sh: Math.round(p.shield), st: p.shieldTier,
          a: p.alive ? 1 : 0, an, w: w && w.id, f: this._lastShotFlag ? 1 : 0
        });
        this._lastShotFlag = false;
      }, 1000 / SEND_HZ);
    },
    stopSending() { if (this._sendTimer) clearInterval(this._sendTimer); this._sendTimer = null; },

    ensureRemote(info) {
      if (info.id === this.id) return null;
      let r = this.remotes.get(info.id);
      if (!r) {
        r = new RemoteContender(info, window.GAME);
        this.remotes.set(info.id, r);
        window.GAME.bots.push(r);
      }
      return r;
    },
    removeRemote(id) {
      const r = this.remotes.get(id);
      if (!r) return;
      r.dispose();
      this.remotes.delete(id);
      const G = window.GAME;
      G.bots = G.bots.filter(b => b !== r);
    },

    onMessage(m) {
      const G = window.GAME;
      if (!G) return;
      if (m.t === 'snap') {
        this.clockOffset = this.clockOffset * 0.9 + (m.ts - Date.now()) * 0.1;
        m.s.forEach(s => {
          const r = this.ensureRemote({ id: s.id, name: (this.remotes.get(s.id) || {}).name || `PLAYER ${s.id}`, hero: 'thor' });
          if (r) r.pushState(m.ts, s);
        });
      } else if (m.t === 'joined') {
        this.ensureRemote(m.p);
        G.showBanner(`${m.p.name} JOINED THE ARENA`, '#38bdf8');
      } else if (m.t === 'left') {
        const r = this.remotes.get(m.id);
        if (r) G.showBanner(`${r.name} LEFT`, '#94a3b8');
        this.removeRemote(m.id);
      } else if (m.t === 'hit') {
        const attacker = this.remotes.get(m.from);
        if (G.player && G.player.alive && G.combat) {
          G.combat._applyingNetHit = true;
          G.combat.applyDamage(attacker || null, G.player, m.d, m.src || 'ARENA FIRE', !!m.h, null);
          G.combat._applyingNetHit = false;
        }
      } else if (m.t === 'kill') {
        const nameOf = id => id === this.id ? (G.player && G.player.name) || 'YOU' : (this.remotes.get(id) || {}).name || `PLAYER ${id}`;
        G.addKillFeed(m.killer ? nameOf(m.killer) : 'ARENA', nameOf(m.victim), m.src || '');
        if (m.killer === this.id && m.victim !== this.id && G.player) {
          G.player.kills = (G.player.kills || 0) + 1;
          window.SFX && window.SFX.playKillSound && window.SFX.playKillSound();
          const v = this.remotes.get(m.victim);
          G.showEliminationPopup(nameOf(m.victim), v ? v.heroId : 'thor', G.player.kills);
        }
        (m.board || []).forEach(b => { const r = this.remotes.get(b.id); if (r) { r.kills = b.kills; r.name = b.name; } });
        this.board = m.board;
      }
    },

    // ---- hooks used by combat.js
    reportHit(victim, amount, isHeadshot, src) {
      this.send({ t: 'hit', v: victim.netId, d: amount, h: isHeadshot ? 1 : 0, src });
    },
    reportShot() { this._lastShotFlag = true; },
    reportDeath(killer, src) {
      this.send({ t: 'died', by: killer && killer.isRemote ? killer.netId : 0, src });
      const G = window.GAME;
      G.showBanner(`ELIMINATED${killer && killer.name ? ' BY ' + killer.name : ''} • RESPAWNING IN ${RESPAWN_S}s`, '#f43f5e');
      setTimeout(() => this.respawn(), RESPAWN_S * 1000);
    },
    respawn() {
      const G = window.GAME, p = G.player;
      if (!p || !G.isOnline) return;
      const [sx, sz] = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
      p.position.set(sx, G.world.getGroundHeight(sx, sz, 20) + 0.1, sz);
      p.velocity.set(0, 0, 0);
      p.yaw = Math.atan2(sx, sz);
      p.hp = p.maxHp; p.shield = p.maxShield;
      p.knocked = false; p.alive = true;
      G.showBanner('BACK IN THE FIGHT', '#10b981');
    },

    leave() {
      this.stopSending();
      this.remotes.forEach((r, id) => this.removeRemote(id));
      if (this.ws) { try { this.ws.close(); } catch (e) {} }
      this.ws = null; this.connected = false;
    },

    // Lobby entry point
    async startArena(name, room) {
      const G = window.GAME;
      G.showLoadingHint && G.showLoadingHint('CONNECTING TO ARENA…');
      try {
        await this.connect(name, room);
      } catch (e) {
        alert(`Tidak bisa terhubung ke server arena (${e.message}).\n\nJalankan di Mac: node server/server.js\nlalu buka http://<IP-Mac>:8787 di HP (Wi-Fi yang sama).`);
        return;
      }
      G.isOnline = true;
      G.startBattleRoyaleMatch(true, true);       // reuse firing-range shell: no ring, no dropship
      G.isOnline = true;
      // remove training dummies; arena opponents are humans only
      G.bots.forEach(b => b.mesh && b.mesh.parent && b.mesh.parent.remove(b.mesh));
      G.bots = []; G.allies = [];
      const rp = document.getElementById('hud-range-controls'); if (rp) rp.classList.add('hidden');
      G.player.name = name;
      (this._pendingPlayers || []).forEach(info => this.ensureRemote(info));
      this.respawn();
      this.startSending();
      G.showBanner(`ONLINE ARENA • ROOM ${this.room} • FREE-FOR-ALL`, '#fbbf24');
    }
  };

  window.NET = NET;
})();
