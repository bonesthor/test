// A quiet generative soundtrack driven by what happens in the pool.
// Births pluck a note from a pentatonic scale chosen by species pigment;
// kills are soft low thumps; speciation chimes a rising fifth; extinction
// falls a minor third. Under it all, a hush of filtered noise swells with
// the plankton season.

const PENTATONIC = [0, 2, 4, 7, 9];

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.tokens = 4;
    this.lastRefill = 0;
  }

  async enable() {
    if (!this.ctx) this.build();
    await this.ctx.resume();
    this.enabled = true;
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.4);
  }

  disable() {
    this.enabled = false;
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    this.master.connect(tone).connect(ctx.destination);

    // A short feedback delay gives the notes a watery tail.
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.23;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.bus.connect(this.master);
    this.bus.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.master);

    // Brown noise for the sea.
    const len = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const seaFilter = ctx.createBiquadFilter();
    seaFilter.type = 'lowpass';
    seaFilter.frequency.value = 420;
    this.sea = ctx.createGain();
    this.sea.gain.value = 0.05;
    noise.connect(seaFilter).connect(this.sea).connect(this.master);
    noise.start();
  }

  // Up to ~4 notes a second, however fast the simulation runs.
  take() {
    if (!this.enabled) return false;
    const now = this.ctx.currentTime;
    this.tokens = Math.min(4, this.tokens + (now - this.lastRefill) * 4);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  note(freq, { type = 'sine', gain = 0.05, attack = 0.005, decay = 0.9, when = 0, glide = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(freq * glide, t + decay);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(env).connect(this.bus);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }

  birth(hue) {
    if (!this.take()) return;
    const step = Math.floor((hue / 360) * PENTATONIC.length * 2);
    const semis = PENTATONIC[step % PENTATONIC.length] + 12 * Math.floor(step / PENTATONIC.length);
    const f = 330 * 2 ** (semis / 12);
    this.note(f, { gain: 0.035, decay: 0.7 + Math.random() * 0.4 });
    this.note(f * 2, { type: 'triangle', gain: 0.008, decay: 0.3 });
  }

  kill() {
    if (!this.take()) return;
    this.note(110, { gain: 0.09, decay: 0.22, glide: 0.45 });
  }

  speciation() {
    if (!this.enabled) return;
    this.note(660, { gain: 0.04, decay: 1.6 });
    this.note(990, { gain: 0.035, decay: 1.8, when: 0.12 });
  }

  extinction() {
    if (!this.enabled) return;
    this.note(262, { type: 'triangle', gain: 0.04, decay: 1.4 });
    this.note(220, { type: 'triangle', gain: 0.04, decay: 1.8, when: 0.28 });
  }

  // A rising arpeggio for achievements and wins.
  fanfare() {
    if (!this.enabled) return;
    [523, 659, 784, 1047].forEach((f, i) => this.note(f, { gain: 0.04, decay: 1.2, when: i * 0.09 }));
  }

  season(level) {
    if (this.enabled) this.sea.gain.setTargetAtTime(0.025 + 0.05 * level, this.ctx.currentTime, 1.5);
  }
}
