import { BotLevel, elemMul } from '../data';
import { Fighter, Input, noInput } from './fighter';
import { Match, W, RING } from './match';

// Bot memakai Input yang sama dengan pemain dan melihat lawan dengan jeda waktu reaksi.
interface Snap { t: number; x: number; y: number; state: string; phase: number; seq: number; reach: number; block: boolean }
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Bot {
  private hist: Snap[] = []; private now = 0; private react: number;
  private plan = 'wait'; private planT = 0; private presses = 0; private blockT = 0; private counter = false;
  private seenSeq = -1; private punSeq = -1; private seenEnt = new Set<number>(); private jumped = false;
  private habit = { atk: 0, blk: 0, n: 0 }; private lastOppSeq = -1;
  private bossStep = 0; private pat = 'LLL';
  private downSeq = -1; private escape = false; private chaseSeq = -1; private pressSeq = -1; private holdSeq = -1; private wantHold = false;
  private static PATS = ['LLL', 'LLH', 'LHH', 'HHH', 'HLL', 'HHL'];
  /** mode latihan: 'stand' | 'block' | null */
  dummy: string | null = null;

  constructor(public L: BotLevel, private boss = false) { this.react = rnd(L.react[0], L.react[1]); }

  private setPlan(p: string, t: number, presses = 0) {
    this.plan = p; this.planT = t; this.presses = presses; this.jumped = false;
    // kombo: pilih salah satu pola L/H, dipotong sesuai jumlah tekanan
    if (p === 'combo' && this.L.hard) this.presses = presses = 3;
    if (p === 'combo') this.pat = Bot.PATS[Math.floor(Math.random() * Bot.PATS.length)].slice(0, Math.max(1, presses));
  }

  update(dt: number, me: Fighter, opp: Fighter, m: Match): Input {
    const inp = noInput(), L = this.L;
    this.now += dt;
    if (this.dummy === 'stand') return inp;
    if (this.dummy === 'block') { inp.block = true; return inp; }
    const mv = opp.move;
    this.hist.push({ t: this.now, x: opp.x, y: opp.y, state: opp.state, phase: opp.phase, seq: opp.seq, reach: mv?.box ? mv.box[1] + (mv.lunge ? mv.lunge * .25 : 0) : 0, block: opp.state === 'block' });
    while (this.hist.length > 2 && this.hist[1].t <= this.now - this.react) this.hist.shift();
    const s = this.hist[0];
    const dx = s.x - me.x, dist = Math.abs(dx), to = Math.sign(dx) || 1;
    const reach = me.def.moves.a1.box![1] + .3;
    const edge = (m.ringOut ? RING : W) - 1.2;

    // kebiasaan pemain (dibaca oleh Master)
    if (opp.seq !== this.lastOppSeq) { this.lastOppSeq = opp.seq; if (dist < 2.5) { this.habit.atk++; this.habit.n++; } }
    if (s.block && dist < 2.5 && Math.random() < dt * 3) { this.habit.blk++; this.habit.n++; }
    const blkRate = this.habit.n > 6 ? this.habit.blk / this.habit.n : .3;

    // 0. terjatuh/terlempar: dash untuk kebal & lepas dari tekanan (diputuskan sekali tiap kena pukul)
    // terhuyung: combo breaker (2 stamina) hanya oleh bot level tinggi, ditengah kombo lawan
    if (me.state === 'down' || me.state === 'hit') {
      const hit = me.state === 'hit';
      if (this.downSeq !== me.hitSeq) { this.downSeq = me.hitSeq; this.escape = Math.random() < (hit ? (L.hard ? .45 : L.read ? .25 : L.dodge > .2 ? .1 : 0) : L.hard ? .95 : Math.min(.9, L.dodge * 1.5 + L.block * .4)); }
      const danger = dist < 3 || opp.state === 'attack';
      if (this.escape && me.stam >= (hit ? 2 : 1) && danger && (hit ? me.comboN >= 2 : me.landed ? me.st > .1 : me.comboN >= 3)) {
        this.escape = false; inp.dash = true;
        if (dist < 2 && Math.abs(me.x - to * 2.5) < edge) inp.mx = -to; // ada ruang: dash menjauh; terpojok: kebal di tempat
      }
      return inp;
    }
    if (!me.actionable && me.state !== 'attack' && me.state !== 'jump') return inp;
    // penutup kombo: kadang ditahan untuk versi hold (Heavy charged lebih sering bila lawan suka menangkis)
    const hm = me.state === 'attack' ? me.move?.hold : undefined;
    if (hm) {
      if (this.holdSeq !== me.seq) { this.holdSeq = me.seq; this.wantHold = Math.random() < (L.hard ? .45 : L.read ? .3 : L.combo >= 3 ? .15 : 0) + (hm[1] === 'hvy' && s.block ? .3 : 0); }
      if (this.wantHold && me.chargeT < (hm[1] === 'hvy' ? .42 : .32)) { if (hm[1] === 'hvy') inp.hvyHold = true; else inp.atkHold = true; }
    }

    // 1. sedang menahan tangkisan
    if (this.blockT > 0) {
      this.blockT -= dt;
      if (this.blockT > 0 || (s.phase > 0 && s.phase < 3 && dist < s.reach + 1)) { inp.block = true; return inp; }
      if (this.counter) { this.counter = false; this.setPlan('combo', .9, L.combo); }
    }
    // 2. reaksi terhadap serangan
    if (s.phase > 0 && s.phase < 3 && s.seq !== this.seenSeq && dist < s.reach + .9 && me.actionable) {
      this.seenSeq = s.seq; this.react = rnd(L.react[0], L.react[1]);
      const canBlock = me.stam >= 1 || !L.read, r = Math.random();
      if (L.hard && me.stam >= 1 && Math.random() < .35) { inp.dash = true; this.setPlan('combo', 1); return inp; } // kebal di tempat lalu balas
      if (r < L.block && canBlock) { this.blockT = .3; this.counter = Math.random() < L.punish; inp.block = true; return inp; }
      if (r < L.block + L.dodge && me.stam >= 1) { inp.dash = true; if (Math.abs(me.x - to * 2) < edge) inp.mx = -to; return inp; } // terpojok: kebal di tempat
    }
    // 3. proyektil dan zona yang ditandai
    if (me.actionable) for (const e of m.ents) {
      if (e.owner === me || e.t < this.react || e.pushOnly && !L.arena) continue;
      if (!e.owner && !L.arena) continue;
      if (e.kind === 'proj') {
        const tti = (me.x - e.x) / (e.vx || 1e-3);
        if (tti < 0 || tti > .45) continue;
        if (!this.seenEnt.has(e.id)) {
          this.seenEnt.add(e.id); const r = Math.random();
          (e as any)._b = e.pushOnly ? (r < L.dodge + .4 ? 'j' : '') : r < L.block ? 'b' : r < L.block + L.dodge ? 'j' : '';
        }
        if ((e as any)._b === 'b') { inp.block = true; return inp; }
        if ((e as any)._b === 'j') { inp.up = true; return inp; }
      } else if (e.t < e.delay + e.life && Math.abs(me.x - e.x) < e.w / 2 + .6 && e.w < 8) {
        if (!this.seenEnt.has(e.id)) { this.seenEnt.add(e.id); (e as any)._b = Math.random() < Math.max(L.dodge * 1.6, L.arena ? .7 : 0) ? 'm' : ''; }
        if ((e as any)._b === 'm') {
          let d = Math.sign(me.x - e.x) || -to; if (Math.abs(me.x + d * 2) > edge) d = -d;
          inp.mx = d; if (e.delay - e.t < .3 && me.stam >= 1) inp.dash = true; return inp;
        }
      }
    }
    // 4. menghukum serangan yang meleset
    if (s.phase === 3 && s.seq !== this.punSeq && dist < 3.4 && me.actionable) {
      this.punSeq = s.seq;
      if (Math.random() < L.punish) this.setPlan('combo', 1, L.combo);
    }
    // 5. pamungkas
    if (me.energy >= 100 && me.actionable) {
      const u = me.def.moves.ult, inR = dist >= u.ai![0] && dist <= u.ai![1];
      const open = s.state === 'hit' || s.phase === 3 || s.phase === 1;
      if (inR && !(u.spawn === 'quake' && s.y > .1) && Math.random() < dt * (L.read ? (open ? 30 : s.block ? 0 : .8) : L.ult * (open ? 12 : 2.5))) { inp.ult = true; return inp; }
    }
    // 5b. kejar lawan yang terjatuh: serangan bawah ke lantai (knockup) atau lompat untuk kombo udara
    if (L.combo >= 2 && s.state === 'down' && me.actionable && this.chaseSeq !== opp.hitSeq) {
      if (opp.landed && dist < reach + .4) {
        this.chaseSeq = opp.hitSeq;
        if (Math.random() < L.punish + .3) { inp.down = true; if (Math.random() < .5) inp.hvy = true; else inp.atk = true; this.setPlan('combo', 1.1, L.combo); return inp; }
      } else if (!opp.landed && opp.y > .4 && dist < 3) {
        this.chaseSeq = opp.hitSeq;
        if (Math.random() < L.punish + .2) { this.setPlan('jumpin', .9); }
      } else if (opp.landed && dist < 4.5) { inp.mx = to; if (dist > 2.5 && me.stam >= 2) inp.dash = true; return inp; }
    }
    // pola bos: serbu → kombo → jurus → jeda terbuka (bisa dipelajari)
    if (this.boss && me.actionable && this.planT <= 0) {
      const st = this.bossStep++ % 4;
      if (st === 0) this.setPlan('combo', 1.6, 3);
      else if (st === 1) this.setPlan('s1', .5);
      else if (st === 2) this.setPlan('taunt', 1.15);
      else this.setPlan(dist > 3 && me.def.moves.s2 ? 's2' : 'retreat', .5);
    }

    // 6. berpikir
    this.planT -= dt;
    if (this.planT <= 0 && me.actionable) {
      let aggr = L.aggr;
      if (L.elem) { const e = elemMul(me.elem, opp.elem); aggr += e > 1 ? .12 : e < 1 ? -.1 : 0; }
      if (L.read) aggr += blkRate > .45 ? .12 : this.habit.n > 6 && blkRate < .15 ? -.12 : 0;
      const mvs = me.def.moves;
      const opts: [string, number][] = [];
      if (me.cd1 <= 0 && dist >= mvs.s1.ai![0] && dist <= mvs.s1.ai![1]) opts.push(['s1', L.skill]);
      if (mvs.s2 && me.cd2 <= 0 && dist >= mvs.s2.ai![0] && dist <= mvs.s2.ai![1]) opts.push(['s2', L.skill]);
      if (dist > 4.5) { opts.push(['approach', aggr], ['wait', (1 - aggr) * .6]); }
      else if (dist > reach + .5) { opts.push(['approach', aggr], ['wait', (1 - aggr) * .4], ['jumpin', .07 + L.dodge * .1], ['retreat', L.arena ? .12 : .05]); }
      else { opts.push(['combo', aggr], ['guard', L.block * (L.read && me.stam < 1.5 ? .1 : .45) * (1.3 - aggr)], ['retreat', .08 + (L.elem ? .06 : 0)], ['wait', (1 - aggr) * .25]); }
      if (L.hard && dist < 6 && me.stam >= 1) opts.push(['feint', .35]);
      let tot = 0; for (const o of opts) tot += o[1];
      let r = Math.random() * tot, pick = opts[0][0];
      for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
      const th = rnd(L.think[0], L.think[1]);
      if (pick === 'combo') this.setPlan('combo', 1.2, 1 + Math.floor(Math.random() * L.combo + (blkRate > .45 && L.read ? 1 : 0)));
      else if (pick === 'approach') this.setPlan('approach', th + .3);
      else if (pick === 'guard') { this.blockT = th; this.counter = L.punish > .5; this.setPlan('wait', th); }
      else this.setPlan(pick, pick === 'jumpin' ? .9 : th);
    }

    // 7. menjalankan rencana
    const can = me.actionable;
    switch (this.plan) {
      case 'approach':
        if (dist > reach) inp.mx = to; else this.setPlan('combo', 1, 1 + Math.floor(Math.random() * L.combo));
        if (can && (L.hard ? dist > 2.5 && me.stam >= 1.5 && Math.random() < dt * 6 : L.dodge > .2 && dist > 5 && me.stam >= 2.5 && Math.random() < dt * 2)) inp.dash = true;
        break;
      case 'combo':
        if (dist > reach && can) inp.mx = to;
        else if (this.presses > 0 && (can || (me.state === 'attack' && me.seq !== this.pressSeq && (me.move!.heavy ? me.mt >= me.su + me.ac + me.re * (me.hitDone ? .3 : .5) - .1 : me.phase === 3 || me.hitDone)))) { this.pressSeq = me.seq; if (this.pat[this.pat.length - this.presses] === 'H') inp.hvy = true; else inp.atk = true; this.presses--; }
        else if (L.hard && this.presses <= 0 && me.state === 'attack' && me.hitDone && me.grounded && dist > reach && dist < 5 && me.stam >= 1) {
          inp.dash = true; inp.mx = to; this.setPlan('combo', 1.2); // tekanan beruntun
        }
        else if (this.presses <= 0 && can) {
          if (me.cd1 <= 0 && dist <= me.def.moves.s1.ai![1] && dist >= me.def.moves.s1.ai![0] && Math.random() < L.skill * .5) inp.s1 = true;
          this.planT = 0;
        }
        break;
      case 'retreat':
        if (Math.abs(me.x - to * 1.5) < edge) inp.mx = -to; else this.planT = 0;
        break;
      case 'jumpin':
        if (!this.jumped && can) { inp.up = true; inp.mx = to; this.jumped = true; }
        else if (me.state === 'jump') { inp.mx = to; if ((me.vy < 2 || s.y > .4) && dist < (s.y > .4 ? reach * .9 : reach + .6) && Math.abs(s.y - me.y) < 1.6) { if (Math.random() < .35) inp.hvy = true; else inp.atk = true; } }
        else if (me.state === 'attack' && me.move?.air && me.hitDone) { if (Math.random() < .25) inp.hvy = true; else inp.atk = true; }
        else if (this.jumped && can) this.setPlan('combo', .8, Math.min(2, L.combo));
        break;
      case 's1': if (can) { inp.s1 = true; this.planT = Math.min(this.planT, .15); } break;
      case 's2': if (can) { inp.s1 = inp.down = true; this.planT = Math.min(this.planT, .15); } break;
      case 'feint': // gerakan tipuan acak: dash masuk, dash mundur, kebal di tempat, atau lompat
        if (can) {
          const r = Math.random(); inp.dash = r < .7;
          if (r < .35) inp.mx = to; else if (r < .6 && Math.abs(me.x - to * 2) < edge) inp.mx = -to; else if (r >= .7) { inp.up = true; inp.mx = Math.random() < .6 ? to : -to; }
          this.setPlan(Math.random() < .6 ? 'combo' : 'wait', rnd(.15, .45));
        }
        break;
      case 'taunt': case 'wait': break;
    }
    // jangan berjalan keluar dari tepi arena
    if (inp.mx && Math.abs(me.x + inp.mx * .4) > edge + .7 && Math.sign(inp.mx) === Math.sign(me.x)) inp.mx = 0;
    return inp;
  }
}
