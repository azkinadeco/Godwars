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
