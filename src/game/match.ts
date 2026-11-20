import { ArenaDef, CharDef, Elem, StatusFx, elemMul, ARENA_BONUS, BOSS_CYCLE } from '../data';
import { Fighter, Input, noInput } from './fighter';

export const W = 9;          // setengah lebar arena (dinding)
export const RING = 7.6;     // tepi platform Puncak Awan
export const ROUND_TIME = 60;

export interface HitSpec { dmg: number; kb?: [number, number]; stun?: number; launch?: boolean; strong?: boolean; fx?: StatusFx; ult?: boolean; soft?: boolean; otg?: boolean }
export interface Ent extends HitSpec {
  id: number; kind: 'proj' | 'zone'; vis: string; owner: Fighter | null; elem: Elem | null;
  x: number; y: number; vx: number; vy: number; g?: number; w: number; h: number; // zone: y..y+h ; proj: pusat y, tinggi h
  t: number; delay: number; life: number; fired?: boolean; dead?: boolean; pierce?: boolean;
  tick?: number; pull?: number; final?: HitSpec; onlyGround?: boolean; trap?: boolean; pushOnly?: number;
  hitAt: number[]; dir: number;
}
export interface Pillar { x: number; hp: number }
export type Ev = { t: string;[k: string]: any };
export interface MatchOpts { p1: CharDef; p2: CharDef; arena: ArenaDef; pure: boolean; training?: boolean }

const NO = noInput();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Match {
  f: [Fighter, Fighter]; ents: Ent[] = []; events: Ev[] = []; pillars: Pillar[] = [];
  arena: ArenaDef; pure: boolean; training: boolean;
  phase: 'intro' | 'fight' | 'ko' | 'over' = 'intro'; pt = 0; time = ROUND_TIME; round = 1; wins = [0, 0]; winner = -1;
  freeze = 0; hitstop = 0; slowmo = 0; wind = 0; windT = 0;
  private hazT = 5; private hazDir = 1; private sched: { t: number; fn: () => void }[] = []; private nid = 1;
  private bossT = 0; private lastHurt = [0, 0]; clock = 0;

  constructor(o: MatchOpts) {
    this.f = [new Fighter(o.p1, 0), new Fighter(o.p2, 1)];
    this.arena = o.arena; this.pure = o.pure; this.training = !!o.training;
    this.startRound();
  }
  get ringOut() { return this.arena.id === 'awan' && !this.pure; }
  ev(e: Ev) { this.events.push(e); }

  startRound() {
    this.f[0].reset(-2.6, 1); this.f[1].reset(2.6, -1);
    this.ents = []; this.sched = []; this.phase = 'intro'; this.pt = 0; this.time = ROUND_TIME; this.hazT = 5; this.wind = 0;
    this.pillars = this.arena.id === 'gunung' && !this.pure ? [{ x: -4.2, hp: 160 }, { x: 4.2, hp: 160 }] : [];
    this.ev({ t: 'round', n: this.round });
  }

  step(dt: number, i0: Input, i1: Input) {
    if (this.phase === 'over') return;
    // selama jeda (freeze/hitstop) tombol tetap disimpan di buffer agar input kombo tidak hilang
    if (this.freeze > 0 || this.hitstop > 0) {
      if (this.phase === 'fight') { this.f[0].hold(i0); this.f[1].hold(i1); }
      if (this.freeze > 0) this.freeze -= dt; else this.hitstop -= dt;
      return;
    }
    this.pt += dt; this.clock += dt;
    for (const s of this.sched) s.t -= dt;
    const due = this.sched.filter(s => s.t <= 0); this.sched = this.sched.filter(s => s.t > 0);
    for (const s of due) s.fn();
    const [a, b] = this.f, fight = this.phase === 'fight';
    a.update(dt, fight ? i0 : NO, b, this); b.update(dt, fight ? i1 : NO, a, this);
    this.bounds();
    if (fight) {
      this.melee(a, b, dt); this.melee(b, a, dt);
      this.updateEnts(dt);
      if (!this.pure) this.updateArena(dt);
      for (const f of this.f) if (f.def.boss) {
        this.bossT += dt;
        if (this.bossT >= 10) { this.bossT = 0; f.elem = BOSS_CYCLE[(BOSS_CYCLE.indexOf(f.elem) + 1) % BOSS_CYCLE.length]; this.ev({ t: 'elemShift', f }); }
      }
      if (this.training) {
        for (const f of this.f) { if (this.clock - this.lastHurt[f.idx] > 2.5) f.hp = Math.min(f.def.hp, f.hp + f.def.hp * dt); }
        a.energy = Math.min(100, a.energy + 10 * dt);
      } else {
        this.time -= dt;
        if (this.time <= 0) {
          this.time = 0;
          const ra = a.hp / a.def.hp, rb = b.hp / b.def.hp;
          this.endRound(Math.abs(ra - rb) < 1e-4 ? -1 : ra > rb ? 0 : 1, 'time');
        }
      }
    } else if (this.phase === 'intro') {
      if (this.pt >= 1.7) { this.phase = 'fight'; this.ev({ t: 'fight' }); }
    } else if (this.phase === 'ko') {
      const w = this.winner >= 0 ? this.f[this.winner] : null;
      if (w && this.pt > .9 && w.state !== 'win' && (w.actionable || w.state === 'attack' && w.phase === 3)) { w.state = 'win'; w.st = 0; w.move = null; w.vx = 0; }
      if (this.pt >= 3.2) {
        if (this.winner >= 0 && this.wins[this.winner] >= 2) { this.phase = 'over'; this.ev({ t: 'matchEnd', winner: this.winner }); }
        else { if (this.winner >= 0) this.round++; this.startRound(); }
      }
    }
  }

  private endRound(winner: number, reason: string) {
    if (this.phase !== 'fight') return;
    this.phase = 'ko'; this.pt = 0; this.winner = winner; this.ents = []; this.sched = []; this.wind = 0;
    if (winner >= 0) this.wins[winner]++;
    const final = winner >= 0 && this.wins[winner] >= 2;
    if (final && reason === 'ko') this.slowmo = .9;
    this.ev({ t: 'roundEnd', winner, reason, final });
  }

  private bounds() {
    const [a, b] = this.f;
    // petarung yang terbaring tidak ikut terdorong (bisa dilewati)
    if (Math.abs(a.y - b.y) < 1.2 && a.alive && b.alive && a.state !== 'down' && b.state !== 'down') {
      const dx = b.x - a.x, min = .85;
      if (Math.abs(dx) < min) { const p = (min - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1); a.x -= p; b.x += p; }
    }
    for (const f of this.f) {
      if (this.ringOut) {
        if (f.state === 'fall') { if (f.y < -7 && this.phase === 'fight') { f.hp = 0; this.ev({ t: 'ringout', f }); this.endRound(1 - f.idx, 'ring'); } }
        else if (Math.abs(f.x) > RING && f.y <= 0) {
          if (this.phase === 'fight' && !this.training) { f.state = 'fall'; f.move = null; f.vy = 0; f.vx = Math.sign(f.x) * 2; f.st = 0; this.ev({ t: 'fallStart', f }); }
          else f.x = Math.sign(f.x) * RING;
        }
      } else {
        const lim = W - .45;
        if (f.x > lim) { f.x = lim; if (f.vx > 0 && f.state === 'down') f.vx *= -.3; }
        if (f.x < -lim) { f.x = -lim; if (f.vx < 0 && f.state === 'down') f.vx *= -.3; }
      }
    }
  }

  private melee(att: Fighter, def: Fighter, dt: number) {
    const mv = att.move;
    if (att.phase !== 2 || !mv || !mv.box) return;
    if (att.hitDone) { if (!mv.multi) return; att.multiT -= dt; if (att.multiT > 0) return; }
    const x0 = att.x + att.face * mv.box[0], x1 = att.x + att.face * mv.box[1];
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1), y0 = att.y + mv.box[2], y1 = att.y + mv.box[3];
    for (const p of this.pillars) if (p.hp > 0 && hi > p.x - .5 && lo < p.x + .5 && y0 < 2.6 && (att as any)._pseq !== att.seq) {
      (att as any)._pseq = att.seq; this.hurtPillar(p, mv.dmg * att.def.atk);
    }
    if (hi < def.x - .38 || lo > def.x + .38 || y1 < def.y || y0 > def.y + def.hurtH) return;
    att.hitDone = true; att.multiT = mv.multi || 0;
    // pukulan udara yang kena menahan penyerang sebentar di udara agar kombo udara tersambung
    if (this.applyHit(att, def, mv, att.x) && mv.air) att.vy = Math.max(att.vy, 5);
  }

  private hurtPillar(p: Pillar, dmg: number) {
    p.hp -= dmg; this.ev({ t: 'pillarHit', p });
    if (p.hp <= 0) this.ev({ t: 'pillarBreak', p });
  }

  /** Damage dari efek berkala (terbakar). */
  dot(f: Fighter, dmg: number) {
    if (this.phase !== 'fight') return;
    f.hp = Math.max(this.training ? 1 : 0, f.hp - dmg); this.lastHurt[f.idx] = this.clock;
    this.ev({ t: 'dot', f });
    if (f.hp <= 0) this.ko(f, 0);
  }
  private ko(f: Fighter, dir: number) {
    f.setHit(0, dir * 8, 8, true); f.state = 'ko';
    this.hitstop = .14; this.ev({ t: 'ko', f }); this.endRound(1 - f.idx, 'ko');
  }

  applyHit(att: Fighter | null, def: Fighter, s: HitSpec, srcX: number): boolean {
    const otg = def.state === 'down' && def.landed; // lawan terbaring: hanya serangan bawah (otg) yang kena
    if (def.inv > 0 || !def.alive || def.state === 'getup' || def.state === 'win' || (otg && !s.otg)) return false;
    if (this.phase !== 'fight') return false;
    const dir = Math.sign(def.x - srcX) || (att ? att.face : 1);
    let mul = 1 / def.def.def, adv = 0;
    if (att) {
      const e = elemMul(att.elem, def.elem); adv = e > 1 ? 1 : e < 1 ? -1 : 0;
      mul *= att.def.atk * e * (!this.pure && this.arena.elem === att.elem ? ARENA_BONUS : 1);
    }
    if (s.soft) { this.status(def, s.fx); this.ev({ t: 'soft', f: def, fx: s.fx }); return true; }
    const inCombo = def.state === 'hit' || def.state === 'down'; // otg ikut skala kombo agar tidak bisa loop tanpa batas
    def.comboN = inCombo ? def.comboN + 1 : 1;
    const scale = Math.max(.45, 1 - .08 * (def.comboN - 1));
    const blocking = def.state === 'block' && (Math.abs(srcX - def.x) < .3 || Math.sign(srcX - def.x) === def.face);
    const kb = s.kb || [3, 0];
    let dmg = s.dmg * mul, kind = 'hit';
    if (blocking) {
      const cost = s.ult ? 2 : 1;
      def.stamWait = 1;
      if (def.stam < cost) {
        def.stam = 0; dmg *= .35; kind = 'break'; def.setHit(1.0, dir * 3, 0, false);
      } else {
        def.stam -= cost; dmg *= .15; kind = 'block'; def.lock = .2; def.push = dir * (4 + kb[0] * .3); def.comboN = 0;
      }
    } else if (def.state === 'attack' && def.move?.armor && def.phase <= 2 && !s.ult) {
      dmg *= .6; kind = 'armor';
    } else {
      dmg *= scale;
      this.status(def, s.fx);
      const stun = (s.stun ?? .3) + (s.fx?.shock || 0);
      if (otg) def.setHit(stun, dir * 1, 11, true); // knockup: terangkat tinggi, sedikit terdorong, bisa dikejar
      else def.setHit(stun, dir * kb[0], kb[1], !!s.launch || def.comboN >= 9);
      if (def.comboN >= 9) def.inv = 1.2;
    }
    def.hp = Math.max(this.training ? 1 : 0, def.hp - dmg); this.lastHurt[def.idx] = this.clock;
    if (att && !s.ult) att.energy = Math.min(100, att.energy + dmg * (kind === 'block' ? .05 : .075));
    def.energy = Math.min(100, def.energy + dmg * .05);
    this.hitstop = Math.max(this.hitstop, kind === 'block' ? .03 : s.ult ? .1 : s.strong ? .085 : .045);
    this.ev({ t: 'hit', kind, x: def.x - dir * .25, y: def.y + (def.state === 'crouch' ? .7 : 1.15), dir, strong: !!s.strong || !!s.ult, adv: kind === 'block' ? 0 : adv, elem: att ? att.elem : null, att, def, dmg, fx: s.fx });
    if (def.hp <= 0) this.ko(def, dir);
    return true;
  }
  private status(f: Fighter, fx?: StatusFx) {
    if (!fx) return;
    if (fx.burn) { f.burn = Math.max(f.burn, fx.burn); }
    if (fx.slow) f.slow = Math.max(f.slow, fx.slow);
    if (fx.root) f.root = Math.max(f.root, fx.root);
  }

  private add(p: Partial<Ent> & { vis: string; kind: 'proj' | 'zone'; x: number; w: number; h: number }): Ent {
    const e: Ent = { id: this.nid++, owner: null, elem: null, y: 0, vx: 0, vy: 0, t: 0, delay: 0, life: .12, dmg: 0, hitAt: [-9, -9], dir: 1, ...p } as Ent;
    this.ents.push(e); this.ev({ t: 'ent', e }); return e;
  }

  spawn(key: string, f: Fighter, o: Fighter) {
    const dir = f.face, base = { owner: f, elem: f.elem, dir };
    const P = (p: any) => this.add({ kind: 'proj', ...base, ...p });
    const Z = (p: any) => this.add({ kind: 'zone', ...base, ...p });
    switch (key) {
      case 'bolt': P({ vis: 'bolt', x: f.x + dir * .8, y: 1.15, vx: 12 * dir, w: .55, h: .55, dmg: 68, kb: [4, 0], stun: .34, life: 1.7 }); break;
      case 'orb': P({ vis: 'orb', x: f.x + dir * .8, y: 1.15, vx: 10.5 * dir, w: .7, h: .7, dmg: 80, kb: [5, 0], stun: .36, life: 2 }); break;
      case 'boulder': P({ vis: 'boulder', x: f.x + dir * .7, y: 1.7, vx: 9 * dir, vy: 5.5, g: 15, w: .85, h: .85, dmg: 105, kb: [8, 5], launch: true, strong: true, life: 3 }); break;
      case 'gust': P({ vis: 'gust', x: f.x + dir * .8, y: 1.0, vx: 16 * dir, w: .9, h: 1.3, dmg: 38, kb: [15, 2], stun: .32, life: 1.1 }); break;
      case 'tide':
        f.hp = Math.min(f.def.hp, f.hp + f.def.hp * .07); this.ev({ t: 'heal', f });
        Z({ vis: 'tide', x: f.x, w: 3.4, h: 2, dmg: 35, kb: [12, 3], stun: .3 }); break;
      case 'tsunami': P({ vis: 'tsunami', x: f.x + dir * .6, y: 1.6, vx: 10 * dir, w: 2.2, h: 3.2, dmg: 250, kb: [14, 8], launch: true, ult: true, pierce: true, life: 2.2 }); break;
      case 'eruption': Z({ vis: 'eruption', x: f.x, w: 7, h: 4, dmg: 290, kb: [10, 10], launch: true, ult: true, fx: { burn: 3 }, delay: .05, life: .25 }); break;
      case 'quake': Z({ vis: 'quake', x: 0, w: 2 * W + 2, h: .6, dmg: 270, kb: [0, 0], stun: 1.1, ult: true, onlyGround: true, delay: .05 }); break;
      case 'cyclone': Z({ vis: 'cyclone', x: f.x + dir * 3, w: 5.5, h: 3.6, dmg: 26, kb: [0, 0], stun: .35, tick: .22, pull: 13, life: 1.3, ult: true, final: { dmg: 130, kb: [7, 14], launch: true, ult: true, strong: true } }); break;
      case 'strike': Z({ vis: 'strike', x: o.x, w: 1.5, h: 8, dmg: 98, kb: [3, 0], stun: .35, fx: { shock: .45 }, delay: .55 }); break;
      case 'storm':
        for (let i = 0; i < 5; i++) this.sched.push({ t: i * .32, fn: () => Z({ vis: 'strike', x: o.x, w: 1.6, h: 8, dmg: 62, kb: [1, 0], stun: .4, fx: { shock: .25 }, delay: .28, ult: i === 0, strong: true }) });
        break;
      case 'trap': Z({ vis: 'trap', x: Math.max(-W + 1, Math.min(W - 1, f.x + dir * 3.2)), w: 1.3, h: .8, dmg: 40, kb: [0, 0], stun: .25, fx: { root: 1.5 }, delay: .4, life: 7, trap: true, onlyGround: true }); break;
      case 'forest': Z({ vis: 'forest', x: o.x, w: 3.2, h: 2.6, dmg: 120, kb: [0, 0], stun: .5, fx: { root: 2.6, burn: 3 }, delay: .4, life: .2, ult: true }); break;
    }
  }

  private updateEnts(dt: number) {
    for (const e of this.ents) {
      e.t += dt;
      if (e.kind === 'proj') {
        e.vy -= (e.g || 0) * dt; e.x += (e.vx + this.wind * .5) * dt; e.y += e.vy * dt;
        if (Math.abs(e.x) > W + 4 || (e.g && e.y < .3)) { e.dead = true; if (e.g) this.ev({ t: 'entEnd', e }); }
        for (const p of this.pillars) if (p.hp > 0 && !e.pushOnly && !e.ult && Math.abs(e.x - p.x) < .5 + e.w / 2 && e.y < 2.8) {
          e.dead = true; this.hurtPillar(p, e.dmg); this.ev({ t: 'entEnd', e });
        }
      }
      const armed = e.t >= e.delay;
      if (armed && !e.fired) { e.fired = true; this.ev({ t: 'entFire', e }); }
      if (armed && !e.dead) for (const f of this.f) {
        if (f === e.owner) continue;
        if (e.tick ? e.t - e.hitAt[f.idx] < e.tick : e.hitAt[f.idx] >= 0) continue;
        const y0 = e.kind === 'proj' ? e.y - e.h / 2 : e.y, y1 = y0 + e.h;
        if (Math.abs(f.x - e.x) > e.w / 2 + .38 || f.y > y1 || f.y + f.hurtH < y0) continue;
        if (e.onlyGround && !f.grounded) continue;
        if (e.pushOnly) { if (f.alive && f.state !== 'down') f.push = e.pushOnly; e.hitAt[f.idx] = e.t; this.ev({ t: 'pushed', f }); continue; }
        const src = e.kind === 'proj' ? e.x - Math.sign(e.vx) * 2 : e.owner ? e.owner.x : e.x;
        const ok = this.applyHit(e.owner, f, e, src);
        e.hitAt[f.idx] = e.t;
        if (ok && ((e.kind === 'proj' && !e.pierce) || e.trap)) { e.dead = true; this.ev({ t: 'entEnd', e }); }
        if (this.phase !== 'fight') return;
      }
      if (e.pull && armed && e.owner) {
        const o = this.f[1 - e.owner.idx];
        if (Math.abs(o.x - e.x) < e.w / 2 + 1.5 && o.alive && !(o.state === 'down' && o.landed)) o.x += Math.max(-e.pull * dt, Math.min(e.pull * dt, e.x - o.x));
      }
      if (e.t >= e.delay + e.life && !e.dead) {
        e.dead = true;
        if (e.final && e.owner) { const o = this.f[1 - e.owner.idx]; if (Math.abs(o.x - e.x) < e.w / 2 + .4) this.applyHit(e.owner, o, e.final, e.owner.x); }
        this.ev({ t: 'entEnd', e });
        if (this.phase !== 'fight') return;
      }
    }
    this.ents = this.ents.filter(e => !e.dead);
  }

  private updateArena(dt: number) {
    if (this.windT > 0) { this.windT -= dt; if (this.windT <= 0) { this.wind = 0; this.ev({ t: 'wind', v: 0 }); } }
    this.hazT -= dt; if (this.hazT > 0) return;
    const pick = () => this.f[Math.random() < .5 ? 0 : 1].x;
    const cl = (x: number) => Math.max(-W + 1, Math.min(W - 1, x));
    switch (this.arena.id) {
      case 'kuil': {
        const d = this.hazDir = -this.hazDir; this.hazT = 9.5;
        this.ev({ t: 'warn', kind: 'wave', dir: d });
        this.sched.push({ t: 1.4, fn: () => this.add({ kind: 'proj', vis: 'wave', x: -d * (W + 2), y: .65, vx: d * 11, w: 1.6, h: 1.3, pushOnly: d * 13, pierce: true, life: 2.4, dir: d }) });
        break;
      }
      case 'magma':
        this.hazT = 8;
        for (const s of [-1, 1]) this.add({ kind: 'zone', vis: 'lava', x: s * 7.8, w: 2.4, h: 3, dmg: 40, kb: [7, 3], stun: .3, fx: { burn: 3 }, delay: 1.3, life: .3, elem: 'api' });
        break;
      case 'awan': {
        this.hazT = 7.5; this.wind = (Math.random() < .5 ? -1 : 1) * rnd(3, 5); this.windT = 4;
        this.ev({ t: 'wind', v: this.wind }); break;
      }
      case 'hutan':
        this.hazT = 6.5;
        this.add({ kind: 'zone', vis: 'aroots', x: cl(pick() + rnd(-1.5, 1.5)), w: 2.6, h: 1, dmg: 0, soft: true, fx: { slow: 2.5 }, delay: 1.1, life: .5, onlyGround: true, elem: 'tumbuhan' });
        break;
      case 'menara': {
        this.hazT = 5.2;
        const n = Math.random() < .45 ? 2 : 1;
        for (let i = 0; i < n; i++) this.add({ kind: 'zone', vis: 'strike', x: cl(i ? rnd(-7, 7) : pick() + rnd(-1.2, 1.2)), w: 1.5, h: 8, dmg: 60, kb: [2, 0], stun: .3, fx: { shock: .45 }, delay: 1.15, elem: 'petir' });
        break;
      }
      default: this.hazT = 99;
    }
  }
}
