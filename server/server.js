/**
 * GOD WARS — ONLINE ARENA SERVER (zero dependencies, Node >= 18)
 *
 *   node server/server.js            -> http://localhost:8787  (also serves the game files)
 *   PORT=9000 node server/server.js
 *
 * Phones on the same Wi-Fi can join via http://<this-mac-LAN-IP>:8787 .
 *
 * Model (prototype): each client is authoritative for its OWN position/health; shooters report
 * hits, the server relays them to the victim, the victim applies damage and reports its death.
 * That keeps latency feel good on mobile but is NOT cheat-proof — fine for friends, not for ranked.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8787', 10);
const ROOT = path.resolve(__dirname, '..');
const MAX_PER_ROOM = 12;
const TICK_HZ = 20;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.JPG': 'image/jpeg', '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};

// ---------------------------------------------------------------- static files
function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.resolve(ROOT, '.' + urlPath);
  if (!filePath.startsWith(ROOT + path.sep) || filePath.includes(`${path.sep}.`)) { res.writeHead(403); return res.end(); }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ---------------------------------------------------------------- minimal RFC 6455
function encodeFrame(str) {
  const payload = Buffer.from(str);
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.from([0x81, len]); }
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.onText = null;
    this.onClose = null;
    this.closed = false;
    socket.on('data', d => this._data(d));
    socket.on('close', () => this._close());
    socket.on('error', () => this._close());
  }
  send(obj) {
    if (this.closed) return;
    try { this.socket.write(encodeFrame(typeof obj === 'string' ? obj : JSON.stringify(obj))); } catch (e) { this._close(); }
  }
  _close() {
    if (this.closed) return;
    this.closed = true;
    try { this.socket.destroy(); } catch (e) {}
    if (this.onClose) this.onClose();
  }
  _data(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (this.buf.length > 1 << 20) return this._close(); // 1 MB guard
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 64 * 1024) return this._close();
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload = this.buf.slice(off + (masked ? 4 : 0), need);
      if (masked) {
        const mask = this.buf.slice(off, off + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      this.buf = this.buf.slice(need);
      if (opcode === 0x8) return this._close();
      if (opcode === 0x9) { // ping -> pong
        try { this.socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch (e) {}
        continue;
      }
      if (opcode === 0x1 && this.onText) this.onText(payload.toString('utf8'));
    }
  }
}

// ---------------------------------------------------------------- rooms
const rooms = new Map(); // code -> { players: Map(id -> player) }
let nextId = 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cleanName = s => String(s || 'GUEST').replace(/[^\w \-]/g, '').slice(0, 14).toUpperCase() || 'GUEST';
const cleanRoom = s => String(s || 'ASGARD').replace(/[^\w]/g, '').slice(0, 12).toUpperCase() || 'ASGARD';
const HEROES = ['thor', 'loki', 'hades', 'zeus', 'hela', 'valkyrie'];

function roomOf(code) {
  if (!rooms.has(code)) rooms.set(code, { players: new Map() });
  return rooms.get(code);
}
function broadcast(room, msg, exceptId) {
  const s = JSON.stringify(msg);
  room.players.forEach(p => { if (p.id !== exceptId) p.conn.send(s); });
}
function publicInfo(p) {
  return { id: p.id, name: p.name, hero: p.hero, kills: p.kills, deaths: p.deaths };
}

function handleMessage(conn, state, raw) {
  let m;
  try { m = JSON.parse(raw); } catch (e) { return; }
  if (!m || typeof m.t !== 'string') return;

  if (m.t === 'join' && !state.player) {
    const code = cleanRoom(m.room);
    const room = roomOf(code);
    if (room.players.size >= MAX_PER_ROOM) return conn.send({ t: 'full' });
    const p = {
      id: nextId++, conn, name: cleanName(m.name), hero: HEROES.includes(m.hero) ? m.hero : 'thor',
      kills: 0, deaths: 0, s: null, lastSeen: Date.now()
    };
    room.players.set(p.id, p);
    state.player = p; state.room = room; state.code = code;
    conn.send({ t: 'welcome', id: p.id, room: code, players: [...room.players.values()].filter(o => o.id !== p.id).map(publicInfo) });
    broadcast(room, { t: 'joined', p: publicInfo(p) }, p.id);
    console.log(`[room ${code}] + ${p.name} (#${p.id}) — ${room.players.size} online`);
    return;
  }
  const p = state.player, room = state.room;
  if (!p) return;
  p.lastSeen = Date.now();

  if (m.t === 'state' && Array.isArray(m.p) && m.p.length === 3) {
    // sanitize: numbers only, bounded to the island
    p.s = {
      p: m.p.map(v => clamp(+v || 0, -400, 400)),
      y: +m.y || 0, pi: clamp(+m.pi || 0, -1.6, 1.6),
      hp: clamp(+m.hp || 0, 0, 999), sh: clamp(+m.sh || 0, 0, 999), st: clamp(m.st | 0, 1, 5),
      a: m.a ? 1 : 0, an: String(m.an || 'Idle').slice(0, 8), w: String(m.w || '').slice(0, 10), f: m.f ? 1 : 0
    };
  } else if (m.t === 'hit') {
    const victim = room.players.get(m.v | 0);
    if (!victim || victim.id === p.id) return;
    const dmg = clamp(Math.round(+m.d || 0), 0, 250); // cap per-hit damage (anti-tamper floor, not a full anti-cheat)
    victim.conn.send({ t: 'hit', from: p.id, d: dmg, h: m.h ? 1 : 0, src: String(m.src || '').slice(0, 32) });
  } else if (m.t === 'died') {
    p.deaths++;
    const killer = room.players.get(m.by | 0);
    if (killer && killer.id !== p.id) killer.kills++;
    broadcast(room, { t: 'kill', killer: killer ? killer.id : 0, victim: p.id, src: String(m.src || '').slice(0, 32), board: [...room.players.values()].map(publicInfo) });
  } else if (m.t === 'fx') {
    // cosmetic relay (shots/tracers) so others see you firing
    broadcast(room, { t: 'fx', id: p.id, k: String(m.k || '').slice(0, 8), o: (m.o || []).slice(0, 3).map(Number), e: (m.e || []).slice(0, 3).map(Number) }, p.id);
  }
}

function leave(state) {
  const p = state.player, room = state.room;
  if (!p || !room) return;
  room.players.delete(p.id);
  broadcast(room, { t: 'left', id: p.id });
  console.log(`[room ${state.code}] - ${p.name} (#${p.id}) — ${room.players.size} online`);
  if (room.players.size === 0) rooms.delete(state.code);
  state.player = null;
}

// snapshot tick: send everyone else's latest state
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room) => {
    const snap = [];
    room.players.forEach(p => {
      if (now - p.lastSeen > 15000) { p.conn._close(); return; }
      if (p.s) snap.push({ id: p.id, ...p.s });
    });
    if (snap.length) room.players.forEach(p => p.conn.send({ t: 'snap', ts: now, s: snap.filter(x => x.id !== p.id) }));
  });
}, 1000 / TICK_HZ);

// ---------------------------------------------------------------- boot
const server = http.createServer(serveStatic);
server.on('upgrade', (req, socket) => {
  if (!(req.url || '').startsWith('/ws') || (req.headers.upgrade || '').toLowerCase() !== 'websocket') return socket.destroy();
  const key = req.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const conn = new Conn(socket);
  const state = { player: null, room: null, code: null };
  conn.onText = raw => handleMessage(conn, state, raw);
  conn.onClose = () => leave(state);
});

if (require.main === module) {
  server.listen(PORT, () => {
    const nets = require('os').networkInterfaces();
    const lan = Object.values(nets).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
    console.log(`God Wars Online Arena on http://localhost:${PORT}`);
    lan.forEach(ip => console.log(`  same Wi-Fi: http://${ip}:${PORT}`));
  });
}
module.exports = { server, rooms };
