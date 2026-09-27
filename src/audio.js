// Placeholder sounds synthesized with Web Audio (no sound files).
// On iPhone the hardware silent switch mutes Web Audio.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastImpact = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  _ok() { return this.ctx && !this.muted; }

  _noise(t, dur, type, freq, q, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
    return f;
  }

  _tone(t, freq, dur, type, gain, slideTo) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  fire() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._tone(t, 110, 0.25, 'sine', 0.7, 45);
    const f = this._noise(t, 0.35, 'bandpass', 900, 0.8, 0.35);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.35);
  }

  impact(force, withGround) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    if (t - this.lastImpact < 0.045) return;
    this.lastImpact = t;
    const k = Math.min(1, force / 350);
    if (withGround) this._noise(t, 0.18, 'lowpass', 500, 0.7, 0.18 + k * 0.3);
    else {
      this._noise(t, 0.12 + k * 0.1, 'bandpass', 700 + Math.random() * 300, 1.4, 0.15 + k * 0.45);
      this._tone(t, 180 + Math.random() * 60, 0.09, 'triangle', 0.08 + k * 0.15, 120);
    }
  }

  shatter() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.45, 'highpass', 2500, 0.7, 0.55);
    for (let i = 0; i < 6; i++) this._tone(t + i * 0.025, 1800 + Math.random() * 2400, 0.25, 'sine', 0.06, null);
  }

  rescue() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime + 0.15;
    [784, 988, 1175].forEach((f, i) => this._tone(t + i * 0.08, f, 0.22, 'triangle', 0.18, null));
  }

  win() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime + 0.1;
    [523, 659, 784, 1047].forEach((f, i) => this._tone(t + i * 0.1, f, 0.35, 'triangle', 0.2, null));
  }

  lose() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime + 0.05;
    [392, 330, 262].forEach((f, i) => this._tone(t + i * 0.14, f, 0.3, 'sine', 0.16, null));
  }
}

export function vibrate(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ }
}
