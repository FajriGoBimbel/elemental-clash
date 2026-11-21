// Audio sepenuhnya disintesis dengan Web Audio (tanpa berkas, 100% offline):
// efek pukulan/elemen dan musik latar berlapis yang berbeda tiap arena.
import type { Elem } from './data';

const MUSIC: Record<string, { root: number; scale: number[]; bpm: number; wave: OscillatorType; prog: number[] }> = {
  menu: { root: 110, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 96, wave: 'triangle', prog: [0, 5, 3, 4] },
  kuil: { root: 98, scale: [0, 2, 3, 5, 7, 9, 10], bpm: 108, wave: 'sine', prog: [0, 3, 5, 4] },
  magma: { root: 82.4, scale: [0, 1, 3, 5, 7, 8, 10], bpm: 132, wave: 'sawtooth', prog: [0, 1, 0, 4] },
  gunung: { root: 87.3, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 100, wave: 'triangle', prog: [0, 4, 5, 3] },
  awan: { root: 130.8, scale: [0, 2, 4, 7, 9, 12, 14], bpm: 124, wave: 'sine', prog: [0, 3, 4, 2] },
  hutan: { root: 103.8, scale: [0, 2, 3, 5, 7, 9, 10], bpm: 92, wave: 'triangle', prog: [0, 2, 5, 4] },
  menara: { root: 92.5, scale: [0, 1, 4, 5, 7, 8, 11], bpm: 140, wave: 'square', prog: [0, 0, 1, 4] },
  dojo: { root: 110, scale: [0, 2, 5, 7, 9, 12, 14], bpm: 104, wave: 'triangle', prog: [0, 3, 0, 4] },
};

class Sound {
  ctx?: AudioContext; private sfxG!: GainNode; private musG!: GainNode; private nbuf!: AudioBuffer;
  private track: string | null = null; private timer = 0; private step = 0; private next = 0;
  sfxVol = .8; musVol = .5;

  /** Dipanggil pada interaksi pertama pengguna (syarat browser). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(); const comp = c.createDynamicsCompressor(); comp.connect(c.destination);
    this.sfxG = c.createGain(); this.musG = c.createGain(); this.sfxG.connect(comp); this.musG.connect(comp);
    this.nbuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = this.nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.setVol(this.sfxVol, this.musVol);
    if (this.track) { const t = this.track; this.track = null; this.music(t); }
  }
  setVol(sfx: number, mus: number) { this.sfxVol = sfx; this.musVol = mus; if (this.ctx) { this.sfxG.gain.value = sfx; this.musG.gain.value = mus * .5; } }
  suspend(on: boolean) { if (this.ctx) on ? this.ctx.suspend() : this.ctx.resume(); }

  private tone(f: number, dur: number, type: OscillatorType, vol: number, to?: number, out?: GainNode, at = 0) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    o.connect(g); g.connect(out || this.sfxG); o.start(t); o.stop(t + dur + .02);
  }
  private noise(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass', to?: number, q = 1, out?: GainNode, at = 0) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nbuf; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t); if (to) f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(out || this.sfxG); s.start(t, Math.random()); s.stop(t + dur + .02);
  }

  ui() { this.tone(880, .06, 'triangle', .12, 1200); }
  confirm() { this.tone(520, .09, 'triangle', .16, 780); this.tone(1040, .12, 'sine', .1, 1560, undefined, .06); }
  back() { this.tone(520, .08, 'triangle', .12, 320); }
  deny() { this.tone(180, .14, 'square', .1, 120); }
  coin() { this.tone(1320, .08, 'square', .08); this.tone(1760, .2, 'square', .08, undefined, undefined, .07); }
  whoosh(k = 1) { this.noise(.14, .12 * k, 900, 'bandpass', 2600, .8); }
  jump() { this.tone(260, .1, 'sine', .08, 520); }
  land(slam = false) { this.noise(.08, .14, 300); if (slam) { this.tone(60, .4, 'sine', .7, 28); this.noise(.25, .4, 700, 'lowpass', 90); } }
  dash() { this.noise(.16, .16, 2200, 'bandpass', 600, 1.2); }
  block() { this.tone(240, .07, 'square', .12, 160); this.noise(.06, .2, 2400, 'highpass'); }
  hit(strong: boolean, e: Elem | null, step = 1, fin = false) {
    const v = strong ? 1.35 : 1, up = 1 + Math.min(5, step - 1) * .07; // kombo makin panjang = nada makin tinggi
    this.tone((strong ? 150 : 190) * up, strong ? .2 : .12, 'sine', .5 * v, 48);
    if (step > 1) this.tone(520 + Math.min(6, step) * 90, .07, 'triangle', .07);
    if (fin) { this.tone(72, .45, 'sine', .7, 30); this.noise(.3, .35, 900, 'lowpass', 120); } this.noise(strong ? .14 : .08, .4 * v, strong ? 1800 : 2600, 'lowpass', 400);
    this.elem(e, .5 * v);
  }
  elem(e: Elem | null, v = 1) {
    switch (e) {
      case 'air': this.noise(.3, .22 * v, 1400, 'bandpass', 500, 3); this.tone(700, .16, 'sine', .08 * v, 260); break;
      case 'api': this.noise(.34, .3 * v, 700, 'lowpass', 2800, .6); break;
      case 'batu': this.tone(90, .24, 'triangle', .4 * v, 40); this.noise(.2, .3 * v, 500, 'lowpass', 120); break;
      case 'angin': this.noise(.34, .24 * v, 2400, 'bandpass', 5200, 2); break;
      case 'petir': this.noise(.16, .32 * v, 5200, 'highpass'); this.tone(1900, .1, 'sawtooth', .1 * v, 260); break;
      case 'tumbuhan': this.noise(.22, .2 * v, 3200, 'bandpass', 900, 4); this.tone(330, .16, 'triangle', .1 * v, 495); break;
      case 'netral': this.noise(.09, .35 * v, 1200, 'lowpass', 300); this.tone(120, .1, 'sine', .25 * v, 60); break; // tamparan sarung tangan
    }
  }
  thunder() { this.noise(.9, .7, 2400, 'lowpass', 70); this.tone(70, .7, 'sine', .5, 30); }
  boom() { this.noise(.8, .8, 1600, 'lowpass', 60); this.tone(110, .6, 'sine', .7, 28); }
  ult() { this.tone(110, .9, 'sawtooth', .16, 880); this.noise(.9, .2, 300, 'bandpass', 5000, 2); this.tone(1760, .5, 'sine', .12, 880, undefined, .5); }
  ko() { this.tone(220, 1.1, 'sawtooth', .25, 36); this.noise(.7, .6, 2600, 'lowpass', 90); }
  warn() { this.tone(660, .1, 'square', .08); this.tone(660, .1, 'square', .08, undefined, undefined, .16); }
  heal() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .22, 'sine', .11, undefined, undefined, i * .06)); }
  round() { this.tone(392, .16, 'square', .1); this.tone(523, .3, 'square', .1, undefined, undefined, .16); }
  fight() { this.tone(523, .12, 'sawtooth', .14); this.tone(784, .4, 'sawtooth', .14, undefined, undefined, .1); this.noise(.3, .2, 4000, 'highpass', undefined, 1, undefined, .1); }
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, .3, 'triangle', .16, undefined, undefined, i * .11)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, .4, 'triangle', .15, undefined, undefined, i * .17)); }

  /** Musik latar generatif; id arena atau 'menu'. null = berhenti. */
  music(id: string | null) {
    if (id === this.track) return;
    this.track = id; clearInterval(this.timer); this.step = 0;
    if (!id || !this.ctx) return;
    this.next = this.ctx.currentTime + .1;
    this.timer = window.setInterval(() => this.schedule(), 90);
  }
  private schedule() {
    const c = this.ctx, m = MUSIC[this.track || ''] || MUSIC.menu; if (!c || c.state !== 'running') return;
    const sp = 60 / m.bpm / 2; // not 1/8
    if (this.next < c.currentTime) this.next = c.currentTime + .05;
    while (this.next < c.currentTime + .25) {
      const s = this.step++, at = this.next - c.currentTime, bar = Math.floor(s / 8) % 4, deg = m.prog[bar], b = s % 8;
      const n = (d: number, oct = 0) => m.root * Math.pow(2, (m.scale[(d + 70) % 7] + 12 * Math.floor(d / 7)) / 12 + oct);
      if (b === 0) for (const d of [0, 2, 4]) this.tone(n(deg + d, 1), sp * 7.6, m.wave === 'square' ? 'triangle' : m.wave, .045, undefined, this.musG, at); // pad
      if (b % 2 === 0) this.tone(n(deg + (b === 4 ? 4 : 0), -1), sp * 1.7, 'triangle', .2, undefined, this.musG, at); // bas
      const arp = [0, 2, 4, 6, 4, 2, 7, 4][(b + bar * 3) % 8]; if ((s * 7 + bar) % 5 !== 0) this.tone(n(deg + arp, 2), sp * .9, m.wave, .035, undefined, this.musG, at);
      if (b % 4 === 0) { this.tone(120, .16, 'sine', .32, 40, this.musG, at); } // kick
      if (b % 4 === 2) this.noise(.09, .1, 1800, 'bandpass', undefined, 1, this.musG, at); // snare
      this.noise(.03, b % 2 ? .035 : .02, 7000, 'highpass', undefined, 1, this.musG, at); // hat
      this.next += sp;
    }
  }
}
export const sound = new Sound();
