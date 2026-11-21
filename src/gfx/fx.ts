// Partikel dan efek sementara (cincin, kilat, pilar cahaya) untuk jurus elemen.
import * as THREE from 'three';
import { ELEMS, Elem } from '../data';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const C = new THREE.Color();

class Particles {
  points: THREE.Points; private n = 0; private pos: Float32Array; private col: Float32Array; private size: Float32Array;
  private vel: Float32Array; private life: Float32Array; private max: Float32Array; private grav: Float32Array; private s0: Float32Array; private drag: Float32Array;
  constructor(private cap: number, additive: boolean) {
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.grav = new Float32Array(cap); this.s0 = new Float32Array(cap); this.drag = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { sc: { value: 600 } },
      vertexShader: 'attribute vec4 aCol; attribute float aSize; varying vec4 vC; uniform float sc; void main(){ vC=aCol; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*sc/-mv.z; gl_Position=projectionMatrix*mv; }',
      fragmentShader: additive
        ? 'varying vec4 vC; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.05,d); gl_FragColor=vec4(vC.rgb*a*vC.a, a*vC.a);\n#include <colorspace_fragment>\n}'
        : 'varying vec4 vC; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.38,d); gl_FragColor=vec4(vC.rgb, a*vC.a);\n#include <colorspace_fragment>\n}',
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; g.setDrawRange(0, 0);
  }
  setScale(h: number) { (this.points.material as THREE.ShaderMaterial).uniforms.sc.value = h; }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, g = 0, drag = 0) {
    if (this.n >= this.cap) return;
    const i = this.n++; C.setHex(color);
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([C.r, C.g, C.b, 1], i * 4);
    this.life[i] = this.max[i] = life; this.size[i] = this.s0[i] = size; this.grav[i] = g; this.drag[i] = drag;
  }
  update(dt: number) {
    const { pos, vel, col, life, max, size, s0, grav, drag } = this;
    for (let i = 0; i < this.n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) { // tukar dengan partikel terakhir
        const l = --this.n;
        if (i !== l) {
          pos.copyWithin(i * 3, l * 3, l * 3 + 3); vel.copyWithin(i * 3, l * 3, l * 3 + 3); col.copyWithin(i * 4, l * 4, l * 4 + 4);
          life[i] = life[l]; max[i] = max[l]; size[i] = size[l]; s0[i] = s0[l]; grav[i] = grav[l]; drag[i] = drag[l];
        }
        i--; continue;
      }
      const k = life[i] / max[i], d = Math.exp(-drag[i] * dt);
      vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - grav[i] * dt; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (grav[i] > 0 && pos[i * 3 + 1] < .03) { pos[i * 3 + 1] = .03; vel[i * 3 + 1] *= -.3; vel[i * 3] *= .6; }
      col[i * 4 + 3] = Math.min(1, k * 2.2); size[i] = s0[i] * (.45 + .55 * k);
    }
    const g = this.points.geometry; g.setDrawRange(0, this.n);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true; (g.attributes.aCol as THREE.BufferAttribute).needsUpdate = true; (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }
}

interface Tr { o: THREE.Object3D; t: number; life: number; fn: (k: number, o: THREE.Object3D, dt: number) => void }

export class FX {
  group = new THREE.Group(); q = 1;
  glow = new Particles(2600, true); solid = new Particles(900, false);
  private tr: Tr[] = [];
  constructor() { this.group.add(this.glow.points, this.solid.points); }

  private cnt(n: number) { return Math.max(1, Math.round(n * this.q)); }
  /** Semburan partikel ke segala arah. */
  burst(x: number, y: number, z: number, n: number, color: number, speed: number, life: number, size: number, o: { g?: number; up?: number; solid?: boolean; drag?: number; flat?: boolean; spread?: number } = {}) {
    const p = o.solid ? this.solid : this.glow;
    for (let i = 0, c = this.cnt(n); i < c; i++) {
      const a = Math.random() * Math.PI * 2, e = o.flat ? 0 : rnd(-1, 1), s = speed * rnd(.35, 1), r = Math.sqrt(1 - e * e);
      const sp = o.spread ?? .15;
      p.emit(x + rnd(-sp, sp), y + rnd(-sp, sp), z + rnd(-sp, sp), Math.cos(a) * r * s, e * s + (o.up || 0), Math.sin(a) * r * s * .6, life * rnd(.6, 1), size * rnd(.6, 1.2), color, o.g || 0, o.drag ?? 2);
    }
  }
  one(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, g = 0, solid = false, drag = 1.5) {
    if (this.q < 1 && Math.random() > this.q) return;
    (solid ? this.solid : this.glow).emit(x, y, z, vx, vy, vz, life, size, color, g, drag);
  }
  private addTr(o: THREE.Object3D, life: number, fn: Tr['fn']) { this.group.add(o); this.tr.push({ o, t: 0, life, fn }); return o; }
  private mat(color: number, op = 1) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); }

  /** Cincin gelombang kejut; flat = di lantai. */
  ring(x: number, y: number, z: number, color: number, r0: number, r1: number, life: number, flat = true, thick = .12) {
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - thick, 1, 40), this.mat(color));
    m.position.set(x, y, z); if (flat) m.rotation.x = -Math.PI / 2;
    this.addTr(m, life, (k, o) => { const e = 1 - (1 - k) * (1 - k); o.scale.setScalar(r0 + (r1 - r0) * e); ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k; });
  }
  flash(x: number, y: number, z: number, color: number, r: number, life: number) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.mat(color, .8)); m.position.set(x, y, z);
    this.addTr(m, life, (k, o) => { o.scale.setScalar(r * (.3 + .7 * Math.sqrt(k))); ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = .8 * (1 - k); });
  }
  pillar(x: number, z: number, color: number, r: number, h: number, life: number) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true), this.mat(color, .7)); m.position.set(x, h / 2, z);
    this.addTr(m, life, (k, o) => { const w = r * (k < .15 ? k / .15 : 1 - (k - .15) * .9); o.scale.set(w, h, w); ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = .7 * (1 - k * k); });
  }
  /** Kilat zig-zag dari atas ke bawah. */
  bolt(x: number, y1: number, y0: number, z: number, color: number, life = .22, width = .09) {
    const g = new THREE.Group(), segs = 9; let px = x + rnd(-.6, .6), py = y1;
    for (let i = 1; i <= segs; i++) {
      const ny = y1 + (y0 - y1) * i / segs, nx = i === segs ? x : x + rnd(-.45, .45);
      const dx = nx - px, dy = ny - py, len = Math.hypot(dx, dy);
      for (const [w, c, op] of [[width * 3, color, .45], [width, 0xffffff, 1]] as const) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(w, len), this.mat(c, op)); s.position.set((px + nx) / 2, (py + ny) / 2, z); s.rotation.z = Math.atan2(-dx, dy); g.add(s);
      }
      px = nx; py = ny;
    }
    this.addTr(g, life, (k, o) => { o.visible = k < .35 || (k > .5 && k < .8); });
  }
  /** Busur tebasan di depan penyerang. */
  slash(x: number, y: number, dir: number, color: number, r = .9, life = .16) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r * .72, r, 20, 1, -Math.PI * .42, Math.PI * .84), this.mat(color, .9));
    m.position.set(x, y, .25); m.scale.x = dir; m.rotation.z = rnd(-.5, .5);
    this.addTr(m, life, (k, o) => { o.scale.set(dir * (1 + k * .5), 1 + k * .5, 1); ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = .9 * (1 - k); });
  }
  /** Objek yang tumbuh dari tanah lalu tenggelam (akar, bongkah). */
  rise(o: THREE.Object3D, h: number, life: number) {
    const y0 = o.position.y;
    this.addTr(o, life, (k, ob) => { const u = k < .12 ? k / .12 : k > .8 ? (1 - k) / .2 : 1; ob.position.y = y0 - h * (1 - u); });
  }
  timed(o: THREE.Object3D, life: number, fn: Tr['fn']) { return this.addTr(o, life, fn); }

  /** Partikel khas elemen (dipakai di tangan, proyektil, dan status). */
  elemPuff(e: Elem | null, x: number, y: number, z: number, k = 1) {
    const E = e ? ELEMS[e] : null, c = E ? (Math.random() < .35 ? E.acc : E.col) : 0xffffff;
    switch (e) {
      case 'air': this.one(x, y, z, rnd(-.4, .4), rnd(.2, 1.2), 0, .5, .12 * k, c, 3); break;
      case 'api': this.one(x, y, z, rnd(-.3, .3), rnd(.8, 2), 0, .45, .17 * k, c, -1); break;
      case 'batu': this.one(x, y, z, rnd(-.6, .6), rnd(.3, 1.4), 0, .5, .09 * k, Math.random() < .5 ? 0x8a6a4a : 0xd9b24f, 7, true); break;
      case 'angin': this.one(x, y, z, rnd(-2, 2), rnd(-.2, .6), 0, .35, .1 * k, c, 0, false, 3); break;
      case 'petir': this.one(x + rnd(-.15, .15), y + rnd(-.15, .15), z, rnd(-3, 3), rnd(-3, 3), 0, .12, .1 * k, c, 0, false, 6); break;
      case 'tumbuhan': this.one(x, y, z, rnd(-.5, .5), rnd(.1, .8), rnd(-.2, .2), .8, .1 * k, Math.random() < .3 ? 0xff8fc0 : 0x58d68a, .8, Math.random() < .6); break;
      case 'netral': this.one(x, y, z, rnd(-.4, .4), rnd(.1, .6), 0, .35, .07 * k, Math.random() < .3 ? E!.acc : 0xffffff, 1.5); break; // keringat/kapur tipis
      default: this.one(x, y, z, rnd(-1, 1), rnd(-1, 1), 0, .3, .1 * k, c);
    }
  }
  /** Efek kena pukul sesuai elemen penyerang. */
  hit(e: Elem | null, x: number, y: number, strong: boolean, blocked: boolean) {
    const E = e ? ELEMS[e] : { col: 0xffffff, acc: 0xffffff }, k = strong ? 1.6 : 1;
    if (blocked) { this.ring(x, y, .3, 0xbfd6ff, .15, .7, .16, false, .2); this.burst(x, y, .3, 8, 0xdfe9ff, 5, .2, .1); return; }
    this.flash(x, y, .3, E.acc, .55 * k, .12);
    this.ring(x, y, .3, E.col, .2, 1.1 * k, .22, false, .16);
    this.burst(x, y, .3, 10 * k, 0xffffff, 8 * k, .18, .11);
    switch (e) {
      case 'air': this.burst(x, y, .3, 16 * k, E.col, 5, .5, .16, { g: 12 }); this.burst(x, y, .3, 8 * k, E.acc, 3, .4, .1, { g: 6 }); break;
      case 'api': this.burst(x, y, .3, 18 * k, E.col, 4.5, .45, .22, { up: 2, g: -3 }); this.burst(x, y, .3, 10 * k, E.acc, 7, .3, .1); break;
      case 'batu': this.burst(x, y, .3, 14 * k, 0x8a6a4a, 6, .7, .13, { g: 18, solid: true }); this.burst(x, y, .3, 6 * k, E.acc, 5, .5, .09, { g: 14, solid: true }); break;
      case 'angin': this.burst(x, y, .3, 16 * k, E.acc, 9, .28, .1, { flat: true, drag: 4 }); this.ring(x, y, .3, E.acc, .3, 1.6 * k, .3, false, .06); break;
      case 'petir': this.burst(x, y, .3, 18 * k, E.acc, 11, .16, .12, { drag: 6 }); this.bolt(x, y + 1.4, y - .2, .3, E.col, .14, .04); break;
      case 'tumbuhan': this.burst(x, y, .3, 12 * k, 0x58d68a, 4, .8, .13, { g: 4, solid: true }); this.burst(x, y, .3, 8 * k, E.acc, 3.5, .9, .11, { g: 2, solid: true }); break;
      // bela diri: percikan keringat + gelombang benturan
      case 'netral': this.burst(x, y, .3, 14 * k, 0xeaf4ff, 7, .35, .09, { g: 10 }); this.ring(x, y, .3, 0xffffff, .2, 1.4 * k, .2, false, .1); this.burst(x, y, .3, 5 * k, E.acc, 5, .2, .08); break;
      default: this.burst(x, y, .3, 10 * k, 0xffe9b0, 6, .25, .12);
    }
  }

  update(dt: number) {
    this.glow.update(dt); this.solid.update(dt);
    for (const t of this.tr) { t.t += dt; t.fn(Math.min(1, t.t / t.life), t.o, dt); }
    for (const t of this.tr) if (t.t >= t.life) { this.group.remove(t.o); t.o.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
    this.tr = this.tr.filter(t => t.t < t.life);
  }
  clear() { for (const t of this.tr) this.group.remove(t.o); this.tr = []; }
  setViewport(h: number) { this.glow.setScale(h * 1.25); this.solid.setScale(h * 1.25); }
}
