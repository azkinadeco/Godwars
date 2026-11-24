/**
 * GOD WARS: ASGARD ROYALE (APEX LEGENDS EDITION)
 * WebAudio Procedural Sound Engine + SpeechSynthesis Apex Announcer
 * - Authentic Apex-style Shield Hit ticks, Shield Shatter glass/electric crack, Headshot chime
 * - Ping System sonar beep (Enemy Threat vs Loot vs Location)
 * - Zipline pulley whine, Melee swing/impact, Evo Shield Level-Up fanfare, Care Package siren
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.voiceEnabled = true;
    this.masterVolume = 0.44;
    this.musicEnabled = true;
    this.musicVolume = 0.55;
    this.lobbyAudio = null;
    this.lobbySource = null;
    this.analyser = null;
    this.freqData = null;
    this.fadeInterval = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.setupLobbyMusicAnalyser();
  }

  initLobbyMusic() {
    if (this.lobbyAudio) return;
    this.lobbyAudio = new Audio('ZHU%20-%20Villain%20(HUD%20Loby).mp3');
    this.lobbyAudio.loop = true;
    this.lobbyAudio.volume = this.musicEnabled ? this.musicVolume : 0;
    this.lobbyAudio.preload = 'auto';
  }

  setupLobbyMusicAnalyser() {
    if (!this.ctx || !this.lobbyAudio || this.lobbySource) return;
    try {
      this.lobbySource = this.ctx.createMediaElementSource(this.lobbyAudio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.lobbySource.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch (e) {}
  }

  playLobbyMusic() {
    this.initLobbyMusic();
    if (!this.musicEnabled || !this.lobbyAudio) return;
    clearInterval(this.fadeInterval);
    this.lobbyAudio.volume = this.musicVolume;
    const p = this.lobbyAudio.play();
    if (p && p.catch) {
      p.catch(() => {
        // Browser autoplay blocked until first gesture; handled by global unlock listener
      });
    }
  }

  fadeOutLobbyMusic(durationMs = 1000) {
    if (!this.lobbyAudio || this.lobbyAudio.paused) return;
    clearInterval(this.fadeInterval);
    const startVol = this.lobbyAudio.volume;
    const steps = 20;
    let step = 0;
    this.fadeInterval = setInterval(() => {
      step++;
      const t = step / steps;
      if (this.lobbyAudio) {
        this.lobbyAudio.volume = Math.max(0, startVol * (1 - t));
      }
      if (step >= steps) {
        clearInterval(this.fadeInterval);
        if (this.lobbyAudio) this.lobbyAudio.pause();
      }
    }, durationMs / steps);
  }

  toggleLobbyMusic() {
    this.musicEnabled = !this.musicEnabled;
    this.initLobbyMusic();
    if (this.musicEnabled) {
      this.playLobbyMusic();
    } else if (this.lobbyAudio) {
      this.lobbyAudio.pause();
    }
    return this.musicEnabled;
  }

  setLobbyMusicVolume(vol) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (this.lobbyAudio && this.musicEnabled) {
      this.lobbyAudio.volume = this.musicVolume;
    }
  }

  getMusicSpectrum() {
    if (!this.analyser || !this.freqData || !this.lobbyAudio || this.lobbyAudio.paused) return null;
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  playSquadWipe() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [392.0, 523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(this.masterVolume * 0.45, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.38);
    });
  }

  announce(text) {
    if (!this.enabled || !this.voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.pitch = 0.88;
      utter.volume = 0.65;
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }

  // Helper: Connect node through 3D StereoPannerNode (P2-1 Spatial Audio)
  _connectSpatial(sourceNode, pan = 0) {
    if (!this.ctx) return;
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan || 0)), this.ctx.currentTime);
      sourceNode.connect(panner);
      panner.connect(this.ctx.destination);
    } else {
      sourceNode.connect(this.ctx.destination);
    }
  }

  playGunshot(weaponId, distance = 0, isMythicGold = false, pan = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const atten = Math.max(0.05, 1 - distance / 185);
    const vol = this.masterVolume * atten * (isMythicGold ? 1.15 : 1.0);
    const now = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * (weaponId === 'magnum' ? 0.25 : 0.11);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.045));
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const freqs = { p90: 1450, kriss: 1780, uzi: 1880, m4a1: 1120, ak47: 820, magnum: 580 };
    filter.frequency.setValueAtTime(freqs[weaponId] || 1200, now);
    filter.Q.setValueAtTime(1.25, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol * (weaponId === 'magnum' ? 1.25 : 0.78), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (weaponId === 'magnum' ? 0.24 : 0.1));

    whiteNoise.connect(filter);
    filter.connect(gain);
    this._connectSpatial(gain, pan);
    whiteNoise.start(now);

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = weaponId === 'magnum' || weaponId === 'ak47' ? 'sawtooth' : 'triangle';
    const startFreq = weaponId === 'magnum' ? 240 : weaponId === 'ak47' ? 190 : 330;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);

    oscGain.gain.setValueAtTime(vol * 0.65, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(oscGain);
    this._connectSpatial(oscGain, pan);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  // ---------------------------------------------------------------- movement foley (procedural)
  _noise() {
    if (!this._noiseBuffer) {
      const len = this.ctx.sampleRate;
      this._noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this._noiseBuffer;
  }

  // one shaped noise burst through a filter; returns nothing (fire & forget)
  _burst(t, { type = 'bandpass', freq = 1500, q = 1, attack = 0.003, decay = 0.05, vol = 0.3, pan = 0, sweepTo = null }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise();
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f); f.connect(g); this._connectSpatial(g, pan);
    src.start(t, Math.random() * 0.5); src.stop(t + attack + decay + 0.02);
  }

  _thump(t, { from = 110, to = 45, decay = 0.07, vol = 0.3, pan = 0, type = 'sine' }) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + decay);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); this._connectSpatial(g, pan); o.start(t); o.stop(t + decay + 0.02);
  }

  /** surface: 'stone' | 'grass' | 'metal' | 'wood'; intensity 0..1 (walk ~0.55, sprint 1); dist in metres */
  playFootstep(surface = 'stone', intensity = 0.7, pan = 0, dist = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const att = Math.max(0, 1 - dist / 32);
    if (att <= 0.02) return;
    const v = this.masterVolume * intensity * att * (0.85 + Math.random() * 0.3);
    const t = this.ctx.currentTime + 0.005;
    const r = 0.92 + Math.random() * 0.16;
    if (surface === 'grass') {
      this._burst(t, { type: 'bandpass', freq: 2400 * r, q: 0.6, attack: 0.012, decay: 0.11, vol: v * 0.34, pan });
      this._burst(t + 0.02, { type: 'highpass', freq: 4200, q: 0.5, attack: 0.01, decay: 0.07, vol: v * 0.12, pan });
      this._thump(t, { from: 90, to: 50, decay: 0.06, vol: v * 0.18, pan });
    } else if (surface === 'metal') {
      this._burst(t, { type: 'bandpass', freq: 3400 * r, q: 2.5, attack: 0.002, decay: 0.05, vol: v * 0.4, pan });
      this._thump(t, { from: 620 * r, to: 560 * r, decay: 0.22, vol: v * 0.06, pan, type: 'triangle' });
      this._thump(t, { from: 930 * r, to: 880 * r, decay: 0.15, vol: v * 0.04, pan, type: 'triangle' });
      this._thump(t, { from: 120, to: 60, decay: 0.08, vol: v * 0.22, pan });
    } else if (surface === 'wood') {
      this._burst(t, { type: 'bandpass', freq: 900 * r, q: 1.6, attack: 0.002, decay: 0.06, vol: v * 0.38, pan });
      this._thump(t, { from: 170 * r, to: 90, decay: 0.09, vol: v * 0.3, pan, type: 'triangle' });
    } else { // stone / concrete
      this._burst(t, { type: 'bandpass', freq: 2100 * r, q: 1.3, attack: 0.002, decay: 0.035, vol: v * 0.42, pan });
      this._burst(t + 0.012, { type: 'highpass', freq: 5000, q: 0.7, attack: 0.002, decay: 0.03, vol: v * 0.1, pan });
      this._thump(t, { from: 105, to: 48, decay: 0.065, vol: v * 0.3, pan });
    }
  }

  playJump(surface = 'stone') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005, v = this.masterVolume;
    this.playFootstep(surface, 0.9);
    // cloth / gear whoosh
    this._burst(t + 0.02, { type: 'bandpass', freq: 500, q: 0.8, attack: 0.05, decay: 0.16, vol: v * 0.16, sweepTo: 1900 });
  }

  /** impact 0..1 from fall speed */
  playLand(surface = 'stone', impact = 0.5) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005, v = this.masterVolume * (0.45 + impact * 0.75);
    this.playFootstep(surface, 0.8 + impact * 0.4);
    this.playFootstep(surface, 0.7 + impact * 0.3); // second foot, near-simultaneous
    this._thump(t, { from: 85, to: 32, decay: 0.12 + impact * 0.1, vol: v * 0.5 });
    this._burst(t + 0.01, { type: 'lowpass', freq: 900, q: 0.7, attack: 0.004, decay: 0.12 + impact * 0.12, vol: v * 0.22 });
    this._burst(t + 0.03, { type: 'bandpass', freq: 1600, q: 0.7, attack: 0.02, decay: 0.12, vol: v * 0.1 }); // gear rattle
  }

  playSlide(surface = 'stone', duration = 0.85) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005, v = this.masterVolume;
    const freq = surface === 'grass' ? 1700 : surface === 'metal' ? 2600 : surface === 'wood' ? 1100 : 1400;
    this._burst(t, { type: 'bandpass', freq, q: 0.7, attack: 0.04, decay: duration, vol: v * (surface === 'grass' ? 0.2 : 0.26), sweepTo: freq * 0.55 });
    this._burst(t, { type: 'lowpass', freq: 380, q: 0.6, attack: 0.03, decay: duration * 0.8, vol: v * 0.16 });
  }

  playMantle(surface = 'stone') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    this._burst(t, { type: 'bandpass', freq: 800, q: 0.9, attack: 0.03, decay: 0.14, vol: this.masterVolume * 0.18, sweepTo: 2200 });
    setTimeout(() => this.playFootstep(surface, 0.7), 140);
  }

  playShieldBatteryHum(pan = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(860, now + 0.45);
    gain.gain.setValueAtTime(this.masterVolume * 0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    osc.connect(gain);
    this._connectSpatial(gain, pan);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  playHitmarker(isHeadshot = false, isShield = true, shieldBroken = false) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isHeadshot ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(isHeadshot ? 1980 : isShield ? 1360 : 880, now);
    osc.frequency.exponentialRampToValueAtTime(isHeadshot ? 2680 : 620, now + 0.068);

    gain.gain.setValueAtTime(this.masterVolume * 0.62, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.072);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);

    if (shieldBroken) {
      [1650, 2150, 1280, 2550].forEach((freq, idx) => {
        const sOsc = this.ctx.createOscillator();
        const sGain = this.ctx.createGain();
        sOsc.type = 'sawtooth';
        sOsc.frequency.setValueAtTime(freq, now + idx * 0.03);
        sOsc.frequency.exponentialRampToValueAtTime(freq * 0.58, now + idx * 0.03 + 0.12);
        sGain.gain.setValueAtTime(this.masterVolume * 0.58, now + idx * 0.03);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.13);
        sOsc.connect(sGain);
        sGain.connect(this.ctx.destination);
        sOsc.start(now + idx * 0.03);
        sOsc.stop(now + idx * 0.03 + 0.14);
      });
    }
  }

  playPing(type = 'location') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const notes = type === 'enemy' ? [980, 1480, 980] : type === 'loot' ? [880, 1320] : [740, 1110];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type === 'enemy' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      gain.gain.setValueAtTime(this.masterVolume * 0.45, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.14);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.15);
    });
  }

  playEvoUpgrade() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.065);
      gain.gain.setValueAtTime(this.masterVolume * 0.6, now + i * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.065 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.065);
      osc.stop(now + i * 0.065 + 0.27);
    });
  }

  playMelee() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(290, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.16);
    gain.gain.setValueAtTime(this.masterVolume * 0.75, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  playZiplineAttach() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.linearRampToValueAtTime(760, now + 0.28);
    gain.gain.setValueAtTime(this.masterVolume * 0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  playKillSound() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 880, 1174.66];
    notes.forEach((n, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n, now + i * 0.055);
      gain.gain.setValueAtTime(this.masterVolume * 0.65, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.3);
    });
  }

  playAbility(type = 'tactical') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type === 'ultimate' ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(type === 'ultimate' ? 220 : 440, now);
    osc.frequency.exponentialRampToValueAtTime(type === 'ultimate' ? 980 : 880, now + (type === 'ultimate' ? 0.45 : 0.25));

    gain.gain.setValueAtTime(this.masterVolume * 0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (type === 'ultimate' ? 0.5 : 0.28));

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + (type === 'ultimate' ? 0.52 : 0.3));
  }

  playExplosion(isFlash = false) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const duration = isFlash ? 0.45 : 0.65;
    const bufferSize = this.ctx.sampleRate * duration;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * (isFlash ? 0.12 : 0.22)));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = isFlash ? 'highpass' : 'lowpass';
    filter.frequency.setValueAtTime(isFlash ? 1600 : 420, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.masterVolume * 0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);

    if (isFlash) {
      const ring = this.ctx.createOscillator();
      const rGain = this.ctx.createGain();
      ring.type = 'sine';
      ring.frequency.setValueAtTime(3400, now);
      rGain.gain.setValueAtTime(this.masterVolume * 0.25, now);
      rGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      ring.connect(rGain);
      rGain.connect(this.ctx.destination);
      ring.start(now);
      ring.stop(now + 1.45);
    }
  }

  playReload() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [0, 0.22].forEach((offset, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 520 : 780, now + offset);
      gain.gain.setValueAtTime(this.masterVolume * 0.25, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.065);
    });
  }

  playJumpPad() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.35);
    gain.gain.setValueAtTime(this.masterVolume * 0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  // BATCH 9: Apex Legends Crisp Combat & Movement SFX
  playArmorSwap() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 880, 1320].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.035);
      gain.gain.setValueAtTime(this.masterVolume * 0.45, now + i * 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.035 + 0.09);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.035);
      osc.stop(now + i * 0.035 + 0.1);
    });
  }

  playWallBounce() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.12);
    gain.gain.setValueAtTime(this.masterVolume * 0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playHoloSpray() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [587.33, 880, 1174.66, 1760].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.045);
      gain.gain.setValueAtTime(this.masterVolume * 0.35, now + i * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.26);
    });
  }

  playPerkUnlock() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 554.37, 659.25, 880, 1108.73].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.055);
      gain.gain.setValueAtTime(this.masterVolume * 0.48, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.3);
    });
  }

  playArcStarStick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(2800, now + 0.16);
    gain.gain.setValueAtTime(this.masterVolume * 0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }
}

window.SFX = new SoundEngine();

// =====================================================================================
// Body foley: procedural VOICE grunts (formant synthesis) + Apex-style HEAL item sounds.
// Everything is synthesized (no samples). Voices: glottal sawtooth + breath noise through a
// 3-formant bank; per-hero pitch / gender / roughness. Heals: start / scheduled timeline / finish,
// with cancel support (all scheduled nodes are stopped + a short "abort" blip).
// =====================================================================================
Object.assign(SoundEngine.prototype, {
  _VOICE_HEROES: {
    thor:     { f0: 104, female: false, rough: 0.35 },
    zeus:     { f0: 116, female: false, rough: 0.25 },
    hades:    { f0: 92,  female: false, rough: 0.55 },
    loki:     { f0: 134, female: false, rough: 0.15 },
    hela:     { f0: 192, female: true,  rough: 0.35 },
    valkyrie: { f0: 222, female: true,  rough: 0.15 }
  },
  // [F1, F2, F3] male formants (Hz); female voices are scaled ~1.17
  _VOWELS: {
    uh:  [640, 1190, 2390],
    ah:  [790, 1180, 2600],
    eh:  [560, 1700, 2500],
    oh:  [560, 860, 2420],
    hng: [290, 1050, 2300]
  },

  _voiceCount: 0,

  /**
   * Synthesize one vocalization.
   * opts: { f0, female, rough, vowel, vowelTo, dur, contour:[[t01, mult],...], breath, vol, pan, dist, closed }
   */
  _vox(opts) {
    const ctx = this.ctx;
    if (!ctx || this._voiceCount > 5) return;
    const t0 = ctx.currentTime + 0.01;
    const dur = opts.dur || 0.2;
    const f0 = opts.f0 || 120;
    const fm = opts.female ? 1.17 : 1.0;
    const att = Math.max(0, 1 - (opts.dist || 0) / 55);
    if (att <= 0.02) return;
    const vol = this.masterVolume * (opts.vol || 0.4) * att * att;
    this._voiceCount++;
    setTimeout(() => { this._voiceCount = Math.max(0, this._voiceCount - 1); }, (dur + 0.1) * 1000);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.035, dur * 0.2));
    out.gain.setValueAtTime(vol, t0 + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    // distance: darker + quieter
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = (opts.closed ? 1400 : 4200) * (1 - Math.min(0.75, (opts.dist || 0) / 60));
    tone.connect(out);
    this._connectSpatial(out, opts.pan || 0);

    // glottal source with pitch contour
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const c = opts.contour || [[0, 1], [1, 0.9]];
    osc.frequency.setValueAtTime(f0 * c[0][1], t0);
    for (let i = 1; i < c.length; i++) osc.frequency.linearRampToValueAtTime(f0 * c[i][1], t0 + dur * c[i][0]);
    // vibrato / strain jitter
    const vib = ctx.createOscillator(), vibG = ctx.createGain();
    vib.frequency.value = 5.5 + Math.random() * 3;
    vibG.gain.value = f0 * 0.018;
    vib.connect(vibG); vibG.connect(osc.frequency);
    const src = ctx.createGain();
    src.gain.value = 0.6;
    osc.connect(src);
    // roughness: amplitude modulation at sub-harmonic rate (vocal fry / growl)
    const rough = opts.rough || 0;
    let am = null;
    if (rough > 0.05) {
      am = ctx.createOscillator();
      am.type = 'square';
      am.frequency.value = f0 * 0.5 * c[0][1];
      const amG = ctx.createGain();
      amG.gain.value = 0.32 * rough;
      am.connect(amG); amG.connect(src.gain);
    }
    // breath noise
    const nz = ctx.createBufferSource();
    nz.buffer = this._noise();
    nz.loop = true;
    const nzF = ctx.createBiquadFilter();
    nzF.type = 'bandpass'; nzF.frequency.value = 1800; nzF.Q.value = 0.6;
    const nzG = ctx.createGain();
    const br = opts.breath == null ? 0.3 : opts.breath;
    nzG.gain.setValueAtTime(br * 0.9, t0);
    nzG.gain.linearRampToValueAtTime(br * 0.35, t0 + dur);
    nz.connect(nzF); nzF.connect(nzG);

    // formant bank
    const v0 = this._VOWELS[opts.vowel || 'ah'];
    const v1 = this._VOWELS[opts.vowelTo || opts.vowel || 'ah'];
    const gains = opts.closed ? [1.0, 0.25, 0.1] : [1.0, 0.6, 0.32];
    for (let i = 0; i < 3; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(v0[i] * fm, t0);
      bp.frequency.linearRampToValueAtTime(v1[i] * fm, t0 + dur * 0.85);
      bp.Q.value = [6, 9, 11][i];
      const g = ctx.createGain();
      g.gain.value = gains[i] * [3.2, 3.6, 3.6][i];
      src.connect(bp); nzG.connect(bp);
      bp.connect(g); g.connect(tone);
    }
    osc.start(t0); vib.start(t0); nz.start(t0, Math.random() * 0.5);
    if (am) am.start(t0);
    const tEnd = t0 + dur + 0.05;
    osc.stop(tEnd); vib.stop(tEnd); nz.stop(tEnd);
    if (am) am.stop(tEnd);
  },

  /**
   * kind: 'jump' | 'land' | 'hurt' | 'hurtBig' | 'knock' | 'death' | 'effort'
   * opts: { hero, pan, dist, vol, seed }  (seed varies the pitch per bot)
   */
  playVoice(kind, opts = {}) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const H = this._VOICE_HEROES[opts.hero] || this._VOICE_HEROES.thor;
    const seed = opts.seed || 0;
    const f0 = H.f0 * (1 + (((seed * 37) % 11) - 5) * 0.012) * (0.96 + Math.random() * 0.08);
    const base = { f0, female: H.female, rough: H.rough, pan: opts.pan || 0, dist: opts.dist || 0 };
    const vm = opts.vol == null ? 1 : opts.vol;
    const r = Math.random();
    switch (kind) {
      case 'jump':
        this._vox({ ...base, vowel: r < 0.5 ? 'uh' : 'hng', vowelTo: 'uh', closed: r >= 0.5, dur: 0.13 + r * 0.05,
          contour: [[0, 1.0], [0.35, 1.12], [1, 0.92]], breath: 0.45, rough: H.rough * 0.3, vol: 0.26 * vm });
        break;
      case 'land':
        this._vox({ ...base, vowel: 'hng', vowelTo: 'uh', closed: true, dur: 0.2 + r * 0.06,
          contour: [[0, 0.95], [0.3, 1.02], [1, 0.8]], breath: 0.55, rough: H.rough * 0.8 + 0.15, vol: 0.4 * vm });
        break;
      case 'effort':
        this._vox({ ...base, vowel: 'ah', vowelTo: 'uh', dur: 0.14, contour: [[0, 1.08], [1, 0.95]], breath: 0.6, vol: 0.3 * vm });
        break;
      case 'hurt':
        this._vox({ ...base, vowel: r < 0.5 ? 'ah' : 'uh', vowelTo: 'uh', dur: 0.17 + r * 0.1,
          contour: [[0, 1.25], [0.25, 1.42], [1, 1.02]], breath: 0.35, rough: H.rough + 0.1, vol: 0.5 * vm });
        break;
      case 'hurtBig':
        this._vox({ ...base, vowel: 'ah', vowelTo: 'oh', dur: 0.36 + r * 0.1,
          contour: [[0, 1.3], [0.2, 1.55], [0.7, 1.2], [1, 0.95]], breath: 0.3, rough: H.rough + 0.3, vol: 0.6 * vm });
        break;
      case 'knock':
        this._vox({ ...base, vowel: 'ah', vowelTo: 'uh', dur: 0.95 + r * 0.2,
          contour: [[0, 1.3], [0.12, 1.62], [0.45, 1.38], [0.85, 1.0], [1, 0.78]], breath: 0.32, rough: H.rough + 0.4, vol: 0.72 * vm });
        break;
      case 'death':
        this._vox({ ...base, vowel: 'ah', vowelTo: 'oh', dur: 1.1 + r * 0.2,
          contour: [[0, 1.45], [0.1, 1.7], [0.5, 1.25], [0.9, 0.8], [1, 0.6]], breath: 0.4, rough: H.rough + 0.45, vol: 0.75 * vm });
        break;
    }
  },

  // ------------------------------------------------------------------ heal item foley
  // Small helpers that schedule on the audio clock and register nodes on a handle for cancel.
  _hTone(h, t, { type = 'sine', from = 400, to = null, dur = 0.2, vol = 0.2, attack = 0.01, pan = 0, ramp = 'exp' }) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to) (ramp === 'lin' ? o.frequency.linearRampToValueAtTime(to, t + dur) : o.frequency.exponentialRampToValueAtTime(to, t + dur));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(h.bus);
    o.start(t); o.stop(t + dur + 0.03);
    h.nodes.push(o);
    return o;
  },
  _hNoise(h, t, { type = 'bandpass', freq = 2000, to = null, q = 1, dur = 0.1, vol = 0.2, attack = 0.005 }) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this._noise(); s.loop = true;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(h.bus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
    h.nodes.push(s);
  },
  _hClick(h, t, freq = 3200, vol = 0.3) {
    this._hNoise(h, t, { type: 'bandpass', freq, q: 3, dur: 0.025, vol, attack: 0.001 });
    this._hTone(h, t, { type: 'square', from: freq * 0.35, to: freq * 0.2, dur: 0.03, vol: vol * 0.35, attack: 0.001 });
  },

  /** Start the full heal foley timeline. Returns a handle for healCancel(). */
  healStart(type, castTime = 2, opts = {}) {
    if (!this.enabled) return null;
    this.init();
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const h = { nodes: [], bus: ctx.createGain(), type, done: false };
    const att = Math.max(0, 1 - (opts.dist || 0) / 40);
    h.bus.gain.value = this.masterVolume * (opts.vol == null ? 1 : opts.vol) * att;
    this._connectSpatial(h.bus, opts.pan || 0);
    const t = ctx.currentTime + 0.01, T = castTime;
    if (type === 'shield_battery' || type === 'shield_cell') {
      const big = type === 'shield_battery';
      // pull from pouch: cloth rustle + case clack
      this._hNoise(h, t, { freq: 900, to: 2400, q: 0.7, dur: 0.18, vol: 0.12, attack: 0.04 });
      this._hClick(h, t + T * (big ? 0.2 : 0.15), 2400, 0.22);
      // crack / slot into the arm device: two-stage click + zap
      const tc = t + T * (big ? 0.38 : 0.3);
      this._hClick(h, tc, 3800, 0.35);
      this._hClick(h, tc + 0.06, 2600, 0.3);
      this._hNoise(h, tc + 0.02, { type: 'highpass', freq: 3000, q: 0.5, dur: 0.12, vol: 0.12 });
      this._hTone(h, tc + 0.02, { type: 'sawtooth', from: 1400, to: 300, dur: 0.12, vol: 0.08 });
      // rising electric charge hum (loop body)
      const t1 = tc + 0.08, t2 = t + T * 0.93;
      const hum = ctx.createOscillator(), hum2 = ctx.createOscillator(), hg = ctx.createGain(), hf = ctx.createBiquadFilter();
      hum.type = 'sawtooth'; hum2.type = 'square';
      hum.frequency.setValueAtTime(big ? 110 : 160, t1);
      hum.frequency.exponentialRampToValueAtTime(big ? 520 : 600, t2);
      hum2.frequency.setValueAtTime(big ? 221 : 322, t1);
      hum2.frequency.exponentialRampToValueAtTime(big ? 1046 : 1210, t2);
      hf.type = 'bandpass'; hf.Q.value = 2.2;
      hf.frequency.setValueAtTime(500, t1); hf.frequency.exponentialRampToValueAtTime(3200, t2);
      hg.gain.setValueAtTime(0.0001, t1);
      hg.gain.exponentialRampToValueAtTime(big ? 0.14 : 0.1, t1 + 0.12);
      hg.gain.setValueAtTime(big ? 0.14 : 0.1, t2 - 0.05);
      hg.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.06);
      // tremolo crackle
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.setValueAtTime(9, t1); lfo.frequency.linearRampToValueAtTime(26, t2);
      lg.gain.value = 0.05;
      lfo.connect(lg); lg.connect(hg.gain);
      hum.connect(hf); hum2.connect(hf); hf.connect(hg); hg.connect(h.bus);
      [hum, hum2, lfo].forEach(o => { o.start(t1); o.stop(t2 + 0.1); h.nodes.push(o); });
      // static fizz over the charge
      this._hNoise(h, t1, { type: 'highpass', freq: 5200, q: 0.4, dur: t2 - t1, vol: 0.035, attack: 0.2 });
      // finish: bright confirm chime + eject clack
      this._hTone(h, t2, { type: 'sine', from: big ? 1320 : 1560, to: big ? 1980 : 2340, dur: 0.22, vol: 0.12, ramp: 'lin' });
      this._hTone(h, t2 + 0.05, { type: 'triangle', from: big ? 2640 : 3120, dur: 0.18, vol: 0.06 });
      this._hClick(h, t2 + 0.03, 1800, 0.18);
    } else if (type === 'syringe') {
      this._hClick(h, t + T * 0.12, 4200, 0.22);            // cap off
      this._hNoise(h, t + T * 0.12, { freq: 6000, q: 1, dur: 0.05, vol: 0.08 });
      const ti = t + T * 0.38;                               // needle in: soft tick
      this._hClick(h, ti, 5200, 0.16);
      // plunger hiss + pneumatic injection
      this._hNoise(h, ti + 0.05, { type: 'bandpass', freq: 3500, to: 7000, q: 1.4, dur: T * 0.38, vol: 0.13, attack: 0.04 });
      this._hTone(h, ti + 0.05, { type: 'sine', from: 180, to: 120, dur: T * 0.38, vol: 0.05, attack: 0.05 });
      this._hClick(h, t + T * 0.82, 3000, 0.2);             // plunger bottom-out
      this._hTone(h, t + T * 0.92, { type: 'sine', from: 880, to: 1320, dur: 0.16, vol: 0.08, ramp: 'lin' });
    } else { // medkit / phoenix_kit
      const gold = type === 'phoenix_kit';
      // zipper: a train of tiny ticks with rising pitch
      const tz = t + T * 0.12, zd = T * 0.16;
      for (let i = 0; i < 14; i++) this._hNoise(h, tz + (i / 14) * zd, { freq: 2200 + i * 160, q: 4, dur: 0.018, vol: 0.09, attack: 0.001 });
      // velcro rip
      this._hNoise(h, tz + zd + 0.02, { type: 'bandpass', freq: 1800, to: 4200, q: 0.8, dur: 0.22, vol: 0.2, attack: 0.01 });
      for (let i = 0; i < 10; i++) this._hNoise(h, tz + zd + 0.03 + i * 0.019, { freq: 2500 + Math.random() * 1500, q: 2, dur: 0.014, vol: 0.1, attack: 0.001 });
      // spray hisses (3 bursts) + bandage cloth wraps
      const ts = t + T * 0.45;
      for (let i = 0; i < 3; i++) {
        this._hNoise(h, ts + i * T * 0.13, { type: 'highpass', freq: 4000, q: 0.5, dur: T * 0.1, vol: 0.12, attack: 0.02 });
        this._hNoise(h, ts + i * T * 0.13 + T * 0.05, { freq: 700, to: 1500, q: 0.6, dur: 0.12, vol: 0.07, attack: 0.03 });
      }
      if (gold) this._hTone(h, ts, { type: 'sine', from: 440, to: 880, dur: T * 0.45, vol: 0.05, attack: 0.2, ramp: 'lin' });
      // close + confirm
      this._hClick(h, t + T * 0.9, 1600, 0.2);
      this._hTone(h, t + T * 0.93, { type: 'sine', from: gold ? 990 : 784, to: gold ? 1480 : 1175, dur: 0.2, vol: 0.1, ramp: 'lin' });
    }
    return h;
  },

  /** Interrupt a running heal: kill every scheduled node and play a short abort blip. */
  healCancel(h) {
    if (!h || h.done || !this.ctx) return;
    h.done = true;
    const now = this.ctx.currentTime;
    h.nodes.forEach(n => { try { n.stop(now + 0.01); } catch (e) {} });
    try {
      h.bus.gain.cancelScheduledValues(now);
      h.bus.gain.setValueAtTime(h.bus.gain.value, now);
      h.bus.gain.linearRampToValueAtTime(0, now + 0.03);
    } catch (e) {}
    const c = { nodes: [], bus: this.ctx.createGain() };
    c.bus.gain.value = this.masterVolume;
    c.bus.connect(this.ctx.destination);
    this._hTone(c, now + 0.02, { type: 'square', from: 520, to: 180, dur: 0.12, vol: 0.06 });
    this._hNoise(c, now + 0.02, { freq: 1200, to: 500, q: 0.8, dur: 0.1, vol: 0.08 });
  },

  /** Heal completed: the confirm chime is already on the timeline; mark the handle done. */
  healFinish(h) { if (h) h.done = true; }
});
