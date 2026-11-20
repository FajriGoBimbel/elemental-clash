// Tampilan pertarungan: model petarung, efek jurus, bahaya arena, dan kamera.
import * as THREE from 'three';
import { ELEMS, Elem } from '../data';
import { Fighter } from '../game/fighter';
import { Match, Ent, Ev, W } from '../game/match';
import { CharModel, P, poseFor, AnimCtx } from './character';
import { ArenaView, buildArena } from './arenas';
import type { Stage } from './stage';
import type { FX } from './fx';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const V = new THREE.Vector3();

class FighterView {
  model: CharModel; shadow: THREE.Mesh; target = P(); yaw: number; flashT = 0; walkPh = 0; lastX: number; lastHit = 0; alt = false;
  aura: THREE.Mesh; auraOn = false;
  private ctx: AnimCtx = { state: 'idle', u: 0, st: 0, t: 0, vy: 0, walkPh: 0, back: false, landed: false, alt: false };
  constructor(public f: Fighter, par: THREE.Group, alt = false) {
    this.model = new CharModel(f.def, f.elem, alt);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(.55, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    // aura bundar penanda kebal (dash tanpa arah)
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.15, 28, 18), new THREE.MeshBasicMaterial({ color: ELEMS[f.elem].col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.aura.scale.set(1, 1.05, .8); this.aura.visible = false;
    par.add(this.model.group, this.shadow, this.aura);
    this.yaw = f.face * (Math.PI / 2 - .42); this.lastX = f.x;
  }
  update(m: Match, rdt: number, t: number, fx: FX) {
    const f = this.f, c = this.ctx, md = this.model;
    this.walkPh += Math.abs(f.x - this.lastX) * 2.7; this.lastX = f.x;
    if (f.hitSeq !== this.lastHit) { this.lastHit = f.hitSeq; this.alt = !this.alt; }
    c.state = f.state; c.st = f.st; c.t = t + f.idx * 1.7; c.vy = f.vy; c.walkPh = this.walkPh; c.back = Math.sign(f.vx) !== f.face; c.landed = f.landed; c.alt = this.alt;
    if (f.state === 'attack' && f.move) {
      c.anim = f.move.anim;
      c.u = f.mt < f.su ? f.mt / f.su : f.mt < f.su + f.ac ? 1 + (f.mt - f.su) / f.ac : 2 + Math.min(1, (f.mt - f.su - f.ac) / f.re);
    } else if (f.state === 'dash' && !f.dashDir) c.state = 'immune';
    else if (m.phase === 'ko' && m.winner >= 0 && m.winner !== f.idx && f.actionable && m.pt > .6) c.state = 'lose';
    poseFor(c, this.target);
    if (f.state === 'dash' && !f.dashDir) this.auraOn = true; else if (f.inv <= 0 || f.state === 'hit' || f.state === 'down') this.auraOn = false;
    const am = this.aura.material as THREE.MeshBasicMaterial;
    am.opacity += ((this.auraOn ? .28 : 0) - am.opacity) * Math.min(1, rdt * 18);
    this.aura.visible = am.opacity > .01;
    if (this.aura.visible) {
      this.aura.position.set(f.x, f.y + .95, 0); this.aura.scale.setScalar(1 + Math.sin(t * 14) * .04); this.aura.scale.z *= .8;
      if (this.auraOn && Math.random() < .8) { const a = rnd(0, Math.PI * 2); fx.one(f.x + Math.cos(a) * 1.1, f.y + .95 + Math.sin(a) * 1.1, .3, -Math.cos(a) * .6, -Math.sin(a) * .6, 0, .3, .1, ELEMS[f.elem].acc); }
    }
    const fast = f.state === 'attack' || f.state === 'hit' || f.state === 'block' || f.state === 'dash';
    md.apply(this.target, rdt, fast ? 26 : 14, t);
    md.group.position.set(f.x, f.y, 0);
    const ty = f.state === 'win' ? f.face * .3 : f.face * (Math.PI / 2 - .42);
    this.yaw += (ty - this.yaw) * Math.min(1, rdt * 14); md.group.rotation.y = this.yaw;
    this.shadow.position.set(f.x, .02, 0); const s = Math.max(.35, 1 - Math.max(0, f.y) * .22) * f.def.look.bulk; this.shadow.scale.setScalar(s);
    this.shadow.visible = f.y > -.5;
    if (this.flashT > 0) { this.flashT -= rdt; md.flash(this.flashT > 0 ? .9 : 0); }
    // efek elemen di tangan + status
    const act = f.state === 'attack' ? 1 : .25;
    for (const h of [md.handL, md.handR]) if (Math.random() < act) { h.getWorldPosition(V); fx.elemPuff(f.elem, V.x, V.y, V.z + .05, f.state === 'attack' ? 1.3 : .8); }
    const cy = f.y + 1.1;
    if (f.burn > 0 && Math.random() < .7) fx.one(f.x + rnd(-.3, .3), cy + rnd(-.6, .5), .2, rnd(-.3, .3), rnd(1, 2.2), 0, .4, .2, Math.random() < .5 ? 0xff5a1f : 0xffd23a, -1);
    if (f.slow > 0 && Math.random() < .4) fx.one(f.x + rnd(-.4, .4), f.y + rnd(.1, .7), .2, 0, rnd(-.4, -.1), 0, .6, .12, 0x58d68a, 0, true);
    if (f.root > 0 && Math.random() < .6) fx.one(f.x + rnd(-.45, .45), f.y + rnd(0, .9), .25, 0, rnd(.2, .8), 0, .5, .13, Math.random() < .5 ? 0x7b4f2c : 0x2fc46c, 0, true);
    if (f.energy >= 100 && Math.random() < .5) fx.one(f.x + rnd(-.4, .4), f.y + rnd(0, .4), rnd(-.3, .3), 0, rnd(1.5, 3), 0, .5, .1, ELEMS[f.elem].acc);
    if (f.state === 'dash' && f.dashDir && Math.random() < .9) fx.one(f.x, cy + rnd(-.7, .5), 0, -f.dashDir * rnd(2, 5), 0, 0, .25, .14, ELEMS[f.elem].acc, 0, false, 2);
  }
}

interface EntView { o?: THREE.Object3D; mark?: THREE.Mesh; upd?(e: Ent, dt: number, t: number): void; fire?(e: Ent): void; end?(e: Ent): void }

export class FightView {
  views: FighterView[]; av: ArenaView; group = new THREE.Group(); time = 0; shake = 0; vsT = 0;
  private ents = new Map<number, EntView>(); private cine: { f: Fighter; t: number } | null = null;
  private camPos = new THREE.Vector3(0, 2.2, 13); private camLook = new THREE.Vector3(0, 1.35, 0);
  private base = { hemi: 1, sun: 1 }; private pillarOn: boolean[] = [];
  onEvent: (e: Ev) => void = () => { };

  constructor(public stage: Stage, public m: Match) {
    stage.clear();
    this.av = buildArena(m.arena.id); stage.setEnv(this.av); this.base = { hemi: this.av.hemi[2], sun: this.av.sun[1] };
    this.group.add(this.av.group); stage.content.add(this.group);
    this.views = m.f.map(f => new FighterView(f, this.group, f.idx === 1 && m.f[0].def === f.def));
    this.views.forEach(v => v.model.setOutline(stage.quality > 0));
    if (m.pure && this.av.pillars) this.av.pillars.forEach(p => p.visible = false);
    this.pillarOn = (this.av.pillars || []).map(() => true);
    this.updateCamera(1, true);
  }
  private get fx() { return this.stage.fx; }
  private basic(c: number, op = 1) { return new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); }
  private marker(e: Ent, color: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(e.w, 18), 2.4), this.basic(color, .3)); m.rotation.x = -Math.PI / 2; m.position.set(e.x, .03, -.2);
    this.group.add(m); return m;
  }
  private roots(x: number, w: number, n: number, h: number, life: number) {
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(rnd(.1, .2), h * rnd(.6, 1.1), 6), new THREE.MeshLambertMaterial({ color: i % 3 ? 0x6b4a2c : 0x2fa45c }));
      c.position.set(x + (i / (n - 1) - .5) * w + rnd(-.1, .1), h * .4, rnd(-.5, .5)); c.rotation.set(rnd(-.3, .3), 0, rnd(-.35, .35));
      this.fx.rise(c, h * 1.2, life * rnd(.85, 1));
    }
    this.fx.burst(x, .4, .2, 22, 0x58d68a, 5, .8, .13, { g: 6, solid: true, spread: w / 3 });
  }

  private makeEnt(e: Ent): EntView {
    const fx = this.fx, E = e.elem ? ELEMS[e.elem] : { col: 0xffffff, acc: 0xffffff }, g = new THREE.Group(); g.position.set(e.x, e.y, 0);
    const sphere = (r: number, c: number, op: number, par: THREE.Object3D = g) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), op >= 1 ? new THREE.MeshBasicMaterial({ color: c }) : this.basic(c, op)); par.add(s); return s; };
    switch (e.vis) {
      case 'bolt': case 'orb': {
        const r = e.vis === 'orb' ? .3 : .22; sphere(r, E.acc, 1); sphere(r * 2, E.col, .45); this.group.add(g);
        return { o: g, upd: () => { g.position.set(e.x, e.y, 0); g.scale.setScalar(1 + Math.sin(this.time * 30) * .1); for (let i = 0; i < 2; i++) fx.elemPuff(e.elem, e.x - e.dir * .2, e.y + rnd(-.15, .15), 0, 1.2); }, end: () => { fx.burst(e.x, e.y, .2, 16, E.col, 5, .4, .15, { g: 6 }); fx.ring(e.x, e.y, .2, E.acc, .2, 1, .2, false); } };
      }
      case 'boulder': {
        const b = new THREE.Mesh(new THREE.DodecahedronGeometry(.45, 0), new THREE.MeshLambertMaterial({ color: 0x8a6a4a, flatShading: true })); b.castShadow = true; g.add(b); this.group.add(g);
        return { o: g, upd: (_, dt) => { g.position.set(e.x, e.y, 0); b.rotation.z -= e.dir * dt * 9; b.rotation.x += dt * 3; if (Math.random() < .6) fx.one(e.x, e.y, 0, rnd(-.5, .5), rnd(0, 1), 0, .5, .12, 0xbfa680, 3, true); }, end: () => { fx.burst(e.x, Math.max(.3, e.y), .2, 20, 0x8a6a4a, 6, .7, .15, { g: 18, solid: true }); fx.burst(e.x, .3, .2, 10, 0xd9c39c, 2.5, .6, .3, { solid: true }); this.shake = Math.max(this.shake, .25); } };
      }
      case 'gust': {
        for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(.35 + i * .2, .035, 6, 18, Math.PI * 1.3), this.basic(i % 2 ? E.col : E.acc, .7)); t.rotation.y = Math.PI / 2; t.position.x = -e.dir * i * .3; g.add(t); }
        this.group.add(g);
        return { o: g, upd: (_, dt) => { g.position.set(e.x, e.y, 0); g.children.forEach((c, i) => c.rotation.x += dt * (14 + i * 5)); for (let i = 0; i < 2; i++) fx.one(e.x, e.y + rnd(-.6, .6), rnd(-.3, .3), -e.dir * rnd(2, 6), 0, 0, .25, .1, E.acc, 0, false, 2); }, end: () => fx.burst(e.x, e.y, .2, 12, E.acc, 7, .25, .1, { flat: true }) };
      }
      case 'tsunami': case 'wave': {
        const big = e.vis === 'tsunami', hh = big ? 2.3 : 1.0, col = big ? E.col : 0x1fc7c1;
        const a = sphere(1, col, .55); a.scale.set(big ? 1.4 : 1, hh, 3.6); const b = sphere(1, 0xeaffff, .3); b.scale.set(big ? .9 : .6, hh * .85, 3.2); b.position.x = e.dir * .5;
        g.position.y = hh * .35; this.group.add(g);
        return { o: g, upd: () => { g.position.x = e.x; g.scale.y = 1 + Math.sin(this.time * 14) * .06; for (let i = 0; i < (big ? 5 : 2); i++) fx.one(e.x + e.dir * rnd(0, 1.2), rnd(.2, hh * 1.5), rnd(-2.5, 2.5), e.dir * rnd(1, 5), rnd(1, 4), 0, .55, .17, Math.random() < .5 ? 0xeaffff : col, 9); if (big) this.shake = Math.max(this.shake, .08); } };
      }
      case 'cyclone': {
        for (let i = 0; i < 8; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(.45 + i * .17, .05, 6, 20, Math.PI * 1.5), this.basic(i % 2 ? E.col : E.acc, .6)); t.rotation.x = Math.PI / 2; t.position.y = .25 + i * .42; g.add(t); }
        g.position.set(e.x, 0, 0); this.group.add(g);
        return { o: g, upd: (_, dt) => { g.children.forEach((c, i) => { c.rotation.z += dt * (11 + i * 1.5); c.position.x = Math.sin(this.time * 6 + i * .6) * .12; }); for (let i = 0; i < 3; i++) { const a = rnd(0, 6.3), r = rnd(.4, 2.2); fx.one(e.x + Math.cos(a) * r, rnd(.1, 3.4), Math.sin(a) * r * .5, -Math.sin(a) * 6, rnd(1, 3), 0, .35, .11, E.acc, 0, false, 2); } this.shake = Math.max(this.shake, .06); }, end: () => { fx.ring(e.x, .1, 0, E.acc, .5, 4, .35); fx.burst(e.x, 1.5, .2, 30, E.acc, 10, .4, .12); this.shake = .35; } };
      }
      case 'strike': {
        const col = ELEMS.petir, mark = this.marker(e, col.acc);
        return { mark, upd: () => { (mark.material as THREE.MeshBasicMaterial).opacity = .2 + Math.abs(Math.sin(e.t * 16)) * .35; if (Math.random() < .5) fx.one(e.x + rnd(-.6, .6), rnd(0, .3), rnd(-.5, .5), 0, rnd(1, 3), 0, .3, .08, col.acc); }, fire: () => { fx.bolt(e.x, 16, 0, .1, col.col, .25, .16); fx.flash(e.x, .6, .2, col.acc, 1.5, .18); fx.ring(e.x, .05, 0, col.acc, .3, 2, .3); fx.burst(e.x, .4, .2, 26, col.acc, 9, .3, .13, { drag: 4 }); this.shake = Math.max(this.shake, .22); this.av.flashLight = .7; } };
      }
      case 'eruption': return { fire: () => { fx.flash(e.x, 1.4, .2, E.acc, 3.8, .35); fx.pillar(e.x, 0, E.col, 2.4, 8, .55); fx.ring(e.x, .05, 0, E.acc, .6, 4.4, .45); fx.burst(e.x, 1, .2, 80, E.col, 9, .8, .28, { up: 4, g: -2, spread: 1 }); fx.burst(e.x, 1, .2, 40, E.acc, 13, .5, .14); this.shake = .6; } };
      case 'quake': return { fire: () => { const ox = e.owner ? e.owner.x : 0; fx.ring(ox, .05, 0, 0xe0b955, 1, 14, .6); fx.ring(ox, .05, 0, 0xffffff, .5, 9, .45); for (let x = -W; x <= W; x += 1.2) { fx.burst(x, .1, rnd(-.5, .5), 6, 0x8a6a4a, 7, .8, .16, { g: 20, solid: true, up: 5 }); fx.burst(x, .2, 0, 3, 0xd9c39c, 2, .7, .35, { solid: true }); } this.shake = .8; } };
      case 'tide': return { fire: () => { fx.ring(e.x, .08, 0, E.col, .4, 3.4, .4); fx.ring(e.x, .08, 0, E.acc, .2, 2.4, .5); fx.burst(e.x, .5, .2, 36, E.col, 7, .6, .16, { g: 10, flat: true, up: 3 }); } };
      case 'lava': {
        const mark = this.marker(e, 0xff7a1f);
        return { mark, upd: () => { (mark.material as THREE.MeshBasicMaterial).opacity = .25 + Math.abs(Math.sin(e.t * 12)) * .4; fx.one(e.x + rnd(-1, 1), .1, rnd(-1, 1), 0, rnd(1, 3), 0, .4, .14, 0xffa23a); }, fire: () => { fx.pillar(e.x, 0, 0xff5a1f, 1.3, 6, .5); fx.burst(e.x, .5, .2, 50, 0xff7a1f, 8, .8, .25, { up: 7, g: 9, spread: .8 }); this.shake = Math.max(this.shake, .2); } };
      }
      case 'aroots': case 'forest': {
        const big = e.vis === 'forest', mark = this.marker(e, 0x58d68a);
        return { mark, upd: () => { (mark.material as THREE.MeshBasicMaterial).opacity = .2 + Math.abs(Math.sin(e.t * 12)) * .3; }, fire: () => { this.roots(e.x, e.w, big ? 9 : 6, big ? 2.4 : 1.1, big ? 2.6 : 1.3); if (big) { fx.ring(e.x, .05, 0, 0xff8fc0, .5, 3.2, .4); this.shake = .4; } } };
      }
      case 'trap': {
        const t = new THREE.Mesh(new THREE.TorusGeometry(.55, .05, 6, 20), new THREE.MeshLambertMaterial({ color: 0x2fa45c })); t.rotation.x = Math.PI / 2; t.position.set(e.x, .05, 0); t.scale.y = .6; this.group.add(t);
        return { o: t, upd: () => { if (e.fired && Math.random() < .25) fx.one(e.x + rnd(-.5, .5), .1, rnd(-.3, .3), 0, rnd(.3, .9), 0, .6, .09, 0xff8fc0, 0, true); }, end: () => { if (e.hitAt[0] >= 0 || e.hitAt[1] >= 0) this.roots(e.x, 1.2, 5, 1.2, 1.5); } };
      }
    }
    return {};
  }

  private handle(e: Ev) {
    const fx = this.fx;
    switch (e.t) {
      case 'ent': this.ents.set(e.e.id, this.makeEnt(e.e)); break;
      case 'entFire': { const v = this.ents.get(e.e.id); v?.fire?.(e.e); if (v?.mark && e.e.vis !== 'trap') { this.group.remove(v.mark); v.mark = undefined; } break; }
      case 'entEnd': this.ents.get(e.e.id)?.end?.(e.e); break;
      case 'hit': {
        fx.hit(e.elem, e.x, e.y, e.strong, e.kind === 'block');
        if (e.kind !== 'block') this.views[e.def.idx].flashT = .07;
        this.shake = Math.max(this.shake, e.kind === 'block' ? .04 : e.strong ? .3 : .12);
        if (e.kind === 'break') { fx.ring(e.x, e.y, .3, 0xff4a4a, .3, 2, .35, false); fx.burst(e.x, e.y, .3, 24, 0xffd0d0, 9, .35, .13); }
        if (e.fx?.shock && e.kind === 'hit') fx.bolt(e.def.x, e.def.y + 2.4, e.def.y, .3, ELEMS.petir.acc, .3, .05);
        break;
      }
      case 'move': {
        const f: Fighter = e.f, E = ELEMS[f.elem];
        if (e.mv.box) setTimeout(() => this.alive && fx.slash(f.x + f.face * (e.mv.box[1] * .6), f.y + (e.mv.box[2] + e.mv.box[3]) / 2, f.face, E.acc, Math.min(1.3, e.mv.box[1] * .7)), f.su * 1000);
        break;
      }
      case 'ult': {
        const f: Fighter = e.f, E = ELEMS[f.elem]; this.cine = { f, t: 0 };
        fx.ring(f.x, f.y + 1.1, .2, E.acc, 3, .3, .5, false, .05); fx.ring(f.x, .05, 0, E.col, .4, 2.6, .9);
        break;
      }
      case 'ko': fx.flash(e.f.x, e.f.y + 1.1, .3, 0xffffff, 3, .3); this.shake = .7; break;
      case 'land': fx.burst(e.f.x, .08, .2, e.heavy ? 14 : 6, 0xd8d0c0, e.heavy ? 3 : 1.6, .5, .22, { flat: true, solid: true }); if (e.heavy) this.shake = Math.max(this.shake, .15); break;
      case 'jump': fx.burst(e.f.x, .08, .2, 5, 0xd8d0c0, 1.6, .4, .18, { flat: true, solid: true }); break;
      case 'heal': for (let i = 0; i < 26; i++) fx.one(e.f.x + rnd(-.6, .6), e.f.y + rnd(0, 1.6), .3, 0, rnd(1, 2.6), 0, .9, .14, i % 2 ? 0x8affc8 : 0xeaffff); break;
      case 'dot': fx.burst(e.f.x, e.f.y + 1.2, .3, 6, 0xff7a1f, 2, .3, .16, { up: 1.5 }); break;
      case 'soft': fx.burst(e.f.x, .3, .3, 12, 0x58d68a, 3, .6, .12, { solid: true }); break;
      case 'pushed': fx.burst(e.f.x, .6, .3, 22, 0xeaffff, 6, .5, .15, { g: 10 }); break;
      case 'pillarHit': fx.burst(e.p.x, 1.4, -.5, 8, 0xd9c39c, 4, .6, .12, { g: 14, solid: true }); break;
      case 'pillarBreak': fx.burst(e.p.x, 1.3, -.6, 40, 0xcdb48f, 7, .9, .2, { g: 16, solid: true, spread: .6 }); this.shake = Math.max(this.shake, .3); break;
      case 'elemShift': this.views[e.f.idx].model.setElem(e.f.elem); fx.ring(e.f.x, e.f.y + 1.1, .2, ELEMS[e.f.elem as Elem].col, .3, 2.6, .5, false); fx.burst(e.f.x, e.f.y + 1.1, .2, 30, ELEMS[e.f.elem as Elem].col, 6, .6, .16); break;
      case 'fallStart': fx.burst(e.f.x, .2, .2, 14, 0xffffff, 4, .5, .2, { solid: true }); break;
      case 'round': this.cine = null; break;
    }
    this.onEvent(e);
  }
  private alive = true;

  private updateCamera(rdt: number, snap = false) {
    const m = this.m, [a, b] = m.f, cam = this.stage.camera, asp = Math.max(1, 1.9 / cam.aspect);
    const mid = (a.x + b.x) / 2, sep = Math.abs(a.x - b.x);
    const look = new THREE.Vector3(Math.max(-5.2, Math.min(5.2, mid)), 1.18 + Math.max(0, Math.max(a.y, b.y)) * .25, 0);
    const pos = new THREE.Vector3(look.x, 1.75, Math.max(7.6, Math.min(15.5, 5.4 + sep * .68)) * asp);
    let k = 6;
    if (this.vsT > 0) { const p = 1 - this.vsT / 2.2, e = p * p * (3 - 2 * p); pos.set(-4.5 + e * 4.5, 1.45 + e * .3, (5.6 + e * 3.4) * asp); look.set(0, 1.18, 0); k = 30; }
    else if (this.cine) { const f = this.cine.f; pos.set(f.x + f.face * 2.3, f.y + 1.45, 4.4 * asp); look.set(f.x - f.face * .2, f.y + 1.2, 0); k = 12; }
    else if (m.phase === 'ko' || m.phase === 'over') {
      const w = m.winner >= 0 ? m.f[m.winner] : null;
      if (w && w.state === 'win') { pos.set(w.x + w.face * 1.4, 1.5, 5.6 * asp); look.set(w.x, 1.15, 0); k = 3.5; }
    }
    const t = snap ? 1 : 1 - Math.exp(-k * rdt);
    this.camPos.lerp(pos, t); this.camLook.lerp(look, t);
    cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    if (this.shake > .005) { cam.position.x += rnd(-1, 1) * this.shake * .35; cam.position.y += rnd(-1, 1) * this.shake * .35; }
  }

  /** dt = waktu simulasi (bisa melambat), rdt = waktu nyata. */
  update(dt: number, rdt: number) {
    const m = this.m, st = this.stage;
    this.time += rdt; this.vsT = Math.max(0, this.vsT - rdt);
    for (const e of m.events) this.handle(e);
    m.events.length = 0;
    for (const v of this.views) v.update(m, rdt, this.time, st.fx);
    const live = new Set(m.ents.map(e => e.id));
    for (const [id, v] of this.ents) {
      const e = m.ents.find(x => x.id === id);
      if (e && !e.dead) v.upd?.(e, dt, this.time);
      if (!live.has(id)) { if (v.o) this.group.remove(v.o); if (v.mark) this.group.remove(v.mark); this.ents.delete(id); }
    }
    (this.av.pillars || []).forEach((p, i) => { const on = !!m.pillars[i] && m.pillars[i].hp > 0; if (on !== this.pillarOn[i]) { this.pillarOn[i] = on; p.visible = on; } if (on) p.rotation.z = Math.sin(this.time * 40) * .0; });
    this.av.update(this.time, rdt, st.fx);
    // pamungkas: redupkan arena, kamera sinematik
    if (this.cine) { this.cine.t += rdt; const f = this.cine.f, E = ELEMS[f.elem]; if (Math.random() < .9) { const a = rnd(0, 6.3), r = rnd(1.2, 2.2); st.fx.one(f.x + Math.cos(a) * r, f.y + 1.1 + Math.sin(a) * r, .2, -Math.cos(a) * r * 2.4, -Math.sin(a) * r * 2.4, 0, .4, .16, Math.random() < .5 ? E.col : E.acc, 0, false, 0); } if (m.freeze <= 0) this.cine = null; }
    const dim = this.cine ? .35 : 1, fl = this.av.flashLight || 0;
    st.hemi.intensity += ((this.base.hemi * dim + fl * 1.2) - st.hemi.intensity) * Math.min(1, rdt * 12);
    st.sun.intensity += (this.base.sun * (this.cine ? .6 : 1) - st.sun.intensity) * Math.min(1, rdt * 12);
    this.shake *= Math.exp(-9 * rdt);
    st.sun.target.position.set(this.camLook.x, 0, 0); st.sun.position.set(this.camLook.x - 5, 11, 8);
    this.updateCamera(rdt);
  }
  dispose() { this.alive = false; this.stage.clear(); this.stage.hemi.intensity = this.base.hemi; }
}
