import type { CharDef, Move, Elem } from '../data';
import type { Match } from './match';

export interface Input { mx: number; up: boolean; down: boolean; atk: boolean; hvy: boolean; s1: boolean; s2: boolean; block: boolean; dash: boolean; ult: boolean }
export const noInput = (): Input => ({ mx: 0, up: false, down: false, atk: false, hvy: false, s1: false, s2: false, block: false, dash: false, ult: false });
export type State = 'idle' | 'walk' | 'crouch' | 'jump' | 'attack' | 'block' | 'dash' | 'hit' | 'down' | 'getup' | 'ko' | 'win' | 'fall';

const G = 32;
export const MAX_STAM = 3;

export class Fighter {
  x = 0; y = 0; vx = 0; vy = 0; push = 0; face = 1;
  hp: number; energy = 0; stam = MAX_STAM; stamWait = 0;
  state: State = 'idle'; st = 0;
  move: Move | null = null; mt = 0; su = 0; ac = 0; re = 0; hitDone = false; spawned = false; multiT = 0; seq = 0;
  cd1 = 0; cd2 = 0; burn = 0; burnTick = 0; slow = 0; root = 0; inv = 0; lock = 0; stunT = 0;
  landed = false; airUsed = false; dashDir = 1; comboN = 0; hitSeq = 0;
  elem: Elem;
  private buf = { atk: 0, hvy: 0, s1: 0, s2: 0, dash: 0, ult: 0 };

  constructor(public def: CharDef, public idx: number) { this.elem = def.elem; this.hp = def.hp; }

  reset(x: number, face: number) {
    this.x = x; this.y = 0; this.vx = this.vy = this.push = 0; this.face = face; this.hp = this.def.hp;
    this.stam = MAX_STAM; this.stamWait = 0; this.state = 'idle'; this.st = 0; this.move = null;
    this.cd1 = this.cd2 = this.burn = this.slow = this.root = this.inv = this.lock = 0; this.comboN = 0;
    this.buf = { atk: 0, hvy: 0, s1: 0, s2: 0, dash: 0, ult: 0 };
  }
  get grounded() { return this.y <= 0.001; }
  get actionable() { return this.state === 'idle' || this.state === 'walk' || this.state === 'crouch' || (this.state === 'block' && this.lock <= 0); }
  get alive() { return this.state !== 'ko' && this.state !== 'fall'; }
  /** 0 tidak menyerang, 1 startup, 2 aktif, 3 recovery */
  get phase() { return this.state !== 'attack' ? 0 : this.mt < this.su ? 1 : this.mt < this.su + this.ac ? 2 : 3; }
  get hurtH() { return this.state === 'crouch' ? 1.05 : this.state === 'down' || this.state === 'ko' ? .6 : 1.7; }

  startMove(mv: Move, m: Match) {
    this.state = 'attack'; this.st = 0; this.move = mv; this.mt = 0; this.hitDone = false; this.spawned = false; this.multiT = 0; this.seq++;
    const t = this.def.tempo; this.su = mv.su * t; this.ac = mv.ac; this.re = mv.re * t;
    if (mv.inv) this.inv = Math.max(this.inv, this.su + this.ac);
    if (!mv.air) this.vx = 0;
    m.ev({ t: 'move', f: this, mv });
  }

  setHit(stun: number, kx: number, ky: number, launch: boolean) {
    this.move = null; this.lock = 0; this.st = 0; this.hitSeq++;
    if (launch || !this.grounded) {
      this.state = 'down'; this.landed = false; this.vx = kx; this.vy = Math.max(ky, 5); this.y = Math.max(this.y, .02);
    } else { this.state = 'hit'; this.stunT = stun; this.vx = 0; this.push = kx; }
  }

  private tryActions(inp: Input, m: Match): boolean {
    const mv = this.def.moves, b = this.buf;
    if (b.ult > 0 && this.energy >= 100) { b.ult = 0; this.energy = 0; this.startMove(mv.ult, m); m.freeze = 1.0; m.ev({ t: 'ult', f: this }); return true; }
    if (b.s2 > 0 && this.cd2 <= 0) { b.s2 = 0; this.cd2 = mv.s2.cd!; this.startMove(mv.s2, m); return true; }
    if (b.s1 > 0 && this.cd1 <= 0) { b.s1 = 0; this.cd1 = mv.s1.cd!; this.startMove(mv.s1, m); return true; }
    if (b.hvy > 0) { b.hvy = 0; this.startMove(inp.down ? mv.hvLow : mv.hv, m); return true; }
    if (b.atk > 0) { b.atk = 0; this.startMove(inp.down ? mv.low : mv.a1, m); return true; }
    if (b.dash > 0 && this.stam >= 1 && this.root <= 0) {
      b.dash = 0; this.stam -= 1; this.stamWait = .8; this.state = 'dash'; this.st = 0;
      this.dashDir = Math.abs(inp.mx) > .2 ? Math.sign(inp.mx) : this.face; this.inv = Math.max(this.inv, .16);
      m.ev({ t: 'dash', f: this }); return true;
    }
    return false;
  }

  update(dt: number, inp: Input, opp: Fighter, m: Match) {
    const d = this.def, b = this.buf;
    this.cd1 = Math.max(0, this.cd1 - dt); this.cd2 = Math.max(0, this.cd2 - dt);
    this.slow = Math.max(0, this.slow - dt); this.root = Math.max(0, this.root - dt);
    this.inv = Math.max(0, this.inv - dt); this.lock = Math.max(0, this.lock - dt);
    if (this.burn > 0 && this.alive) {
      this.burn -= dt; this.burnTick -= dt;
      if (this.burnTick <= 0) { this.burnTick = .5; m.dot(this, 9); }
    }
    if (d.regen && this.alive && this.hp > 0) this.hp = Math.min(d.hp, this.hp + d.hp * d.regen * dt);
    if (this.stamWait > 0) this.stamWait -= dt; else this.stam = Math.min(MAX_STAM, this.stam + dt);
    for (const k of ['atk', 'hvy', 's1', 's2', 'dash', 'ult'] as const) b[k] = inp[k] ? .16 : b[k] - dt;
    this.st += dt;
    const spd = d.spd * (this.slow > 0 ? .55 : 1);

    switch (this.state) {
      case 'idle': case 'walk': case 'crouch': case 'block': {
        this.face = opp.x >= this.x ? 1 : -1;
        if (this.lock > 0) { this.vx = 0; break; }
        if (this.tryActions(inp, m)) break;
        if (inp.block) { this.state = 'block'; this.vx = 0; }
        else if (inp.up && this.root <= 0) {
          this.state = 'jump'; this.st = 0; this.vy = d.jump; this.y = .01; this.vx = inp.mx * spd * .95; this.airUsed = false;
          m.ev({ t: 'jump', f: this });
        }
        else if (inp.down) { this.state = 'crouch'; this.vx = 0; }
        else if (Math.abs(inp.mx) > .2 && this.root <= 0) {
          this.state = 'walk'; this.vx = inp.mx * spd * (Math.sign(inp.mx) === this.face ? 1 : .82);
        } else { this.state = 'idle'; this.vx = 0; }
        break;
      }
      case 'jump':
        if ((b.atk > 0 || b.hvy > 0) && !this.airUsed) {
          const k = b.hvy > 0 ? 'hvAir' : 'air'; b.atk = b.hvy = 0; this.airUsed = true; this.face = opp.x >= this.x ? 1 : -1; this.startMove(d.moves[k], m);
        }
        break;
      case 'attack': {
        const mv = this.move!; this.mt += dt;
        const total = this.su + this.ac + this.re;
        if (mv.lunge && this.mt >= this.su * .5 && this.mt < this.su + this.ac) this.vx = this.face * mv.lunge * (this.root > 0 ? 0 : 1);
        else if (this.grounded) this.vx = 0;
        if (!this.spawned && this.mt >= this.su) { this.spawned = true; if (mv.spawn) m.spawn(mv.spawn, this, opp); }
        // kombo: tombol yang ditekan memilih cabang berikutnya (lihat daftar kombo di data.ts).
        // Gerakan Heavy selalu menunggu separuh recovery agar ritmenya terasa lebih lambat dari Light.
        const br = mv.branch, nx = br && (b.hvy > 0 && br.hvy ? br.hvy : b.atk > 0 && br.atk ? br.atk : null);
        if (nx && this.mt >= this.su + this.ac + (this.hitDone && !mv.heavy ? 0 : this.re * .5)) {
          b.atk = b.hvy = 0; this.face = opp.x >= this.x ? 1 : -1; this.startMove(d.moves[nx], m); break;
        }
        if (this.mt >= total) { this.move = null; this.state = this.grounded ? 'idle' : 'jump'; this.st = 0; }
        break;
      }
      case 'dash':
        this.vx = this.dashDir * 14;
        if (this.st >= .2) { this.state = 'idle'; this.vx = 0; }
        break;
      case 'hit':
        if (this.st >= this.stunT) { this.state = 'idle'; this.st = 0; }
        break;
      case 'down':
        if (this.landed && this.st >= .5) { this.state = 'getup'; this.st = 0; this.inv = .5; }
        break;
      case 'getup':
        if (this.st >= .28) { this.state = 'idle'; this.st = 0; this.comboN = 0; }
        break;
      case 'ko': case 'win': if (this.grounded) this.vx = 0; break;
      case 'fall': break;
    }

    // fisika
    // pakai y > 0 (bukan !grounded): ambang grounded 0,001 dulu membuat petarung yang jatuh
    // berhenti tepat di atas lantai tanpa pernah tercatat mendarat, sehingga tidak bisa bangun.
    if (this.y > 0 || this.vy > 0 || this.state === 'fall') {
      this.vy -= G * dt; this.y += this.vy * dt;
      if (m.wind && this.state !== 'fall') this.x += m.wind * dt * .9;
      if (this.y <= .001 && this.state !== 'fall') {
        this.y = 0; this.vy = 0;
        if (this.state === 'jump') { this.state = 'idle'; this.st = 0; m.ev({ t: 'land', f: this }); }
        else if (this.state === 'attack' && this.move?.air) { this.move = null; this.state = 'idle'; this.st = 0; m.ev({ t: 'land', f: this }); }
        else if (this.state === 'down' || this.state === 'ko') { this.landed = true; this.st = 0; this.vx = 0; this.push = 0; m.ev({ t: 'land', f: this, heavy: true }); }
      }
    }
    this.x += (this.vx + this.push) * dt;
    this.push *= Math.exp(-9 * dt);
    if (Math.abs(this.push) < .05) this.push = 0;
  }
}
