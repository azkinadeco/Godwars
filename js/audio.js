/**
 * GOD WARS: ASGARD ROYALE
 * WebAudio Procedural Sound Engine (Zero external MP3 dependency, works 100% offline on mobile & desktop)
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterVolume = 0.42;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
  }

  playGunshot(weaponId, distance = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const atten = Math.max(0.05, 1 - distance / 180);
    const vol = this.masterVolume * atten;
    const now = this.ctx.currentTime;

    // Noise burst for percussive gunshot crack
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
    const freqs = { p90: 1400, kriss: 1750, uzi: 1850, m4a1: 1100, ak47: 820, magnum: 600 };
    filter.frequency.setValueAtTime(freqs[weaponId] || 1200, now);
    filter.Q.setValueAtTime(1.2, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol * (weaponId === 'magnum' ? 1.25 : 0.75), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (weaponId === 'magnum' ? 0.24 : 0.1));

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    whiteNoise.start(now);

    // Divine harmonic punch oscillator
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = weaponId === 'magnum' || weaponId === 'ak47' ? 'sawtooth' : 'triangle';
    const startFreq = weaponId === 'magnum' ? 240 : weaponId === 'ak47' ? 190 : 320;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);

    oscGain.gain.setValueAtTime(vol * 0.65, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  playHitmarker(isHeadshot = false, isShield = true, shieldBroken = false) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Apex style crisp metallic hit tick
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isHeadshot ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(isHeadshot ? 1950 : isShield ? 1320 : 880, now);
    osc.frequency.exponentialRampToValueAtTime(isHeadshot ? 2600 : 620, now + 0.065);

    gain.gain.setValueAtTime(this.masterVolume * 0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);

    if (shieldBroken) {
      // Apex Evo Shield shatter sound!
      [1600, 2100, 1250, 2450].forEach((freq, idx) => {
        const sOsc = this.ctx.createOscillator();
        const sGain = this.ctx.createGain();
        sOsc.type = 'sawtooth';
        sOsc.frequency.setValueAtTime(freq, now + idx * 0.03);
        sOsc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + idx * 0.03 + 0.12);
        sGain.gain.setValueAtTime(this.masterVolume * 0.55, now + idx * 0.03);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.13);
        sOsc.connect(sGain);
        sGain.connect(this.ctx.destination);
        sOsc.start(now + idx * 0.03);
        sOsc.stop(now + idx * 0.03 + 0.14);
      });
    }
  }

  playKillSound() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 880, 1174.66]; // D5 -> A5 -> D6 chord chime
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
      // High pitch celestial flashbang ring
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
}

window.SFX = new SoundEngine();
