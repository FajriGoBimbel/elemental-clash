// Model karakter 3D prosedural: satu rangka humanoid untuk semua karakter (animasi dibagi),
// material toon + outline, dan aksesori khas tiap elemen.
import * as THREE from 'three';
import { CharDef, ELEMS, Elem } from '../data';

const D = Math.PI / 180;
const TH = .42, SH = .42, FOOT = .07, TORSO = .5, UA = .27, FA = .26;

let grad: THREE.DataTexture;
function gradient() {
  if (!grad) {
    grad = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  }
  return grad;
}
export const outlineMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { w: { value: .014 }, col: { value: new THREE.Color(0x120d1c) } },
  vertexShader: 'uniform float w; void main(){ vec3 p = position + normalize(normal) * w; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
  fragmentShader: 'uniform vec3 col; void main(){ gl_FragColor = vec4(col, 1.0); }',
});
const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const mix = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

// ---------- Pose ----------
export const PK = ['y', 'lean', 'twist', 'roll', 'pitch', 'sp', 'spT', 'hd', 'hdT', 'aLs', 'aLr', 'aLe', 'aRs', 'aRr', 'aRe', 'lLh', 'lLk', 'lLs', 'lRh', 'lRk', 'lRs'] as const;
export type Pose = Float32Array;
export interface PoseSpec { y?: number; lean?: number; twist?: number; roll?: number; pitch?: number; sp?: number; spT?: number; hd?: number; hdT?: number; aL?: number[]; aR?: number[]; lL?: number[]; lR?: number[] }
const STANCE: PoseSpec = { lean: 7, twist: -20, hdT: 16, aL: [58, 12, 100], aR: [38, 16, 116], lL: [24, 30, 5], lR: [-20, 24, 6] };
export function P(o: PoseSpec = {}, base: PoseSpec = STANCE): Pose {
  const s = { ...base, ...o }, p = new Float32Array(21);
  p[0] = s.y || 0; p[1] = s.lean || 0; p[2] = s.twist || 0; p[3] = s.roll || 0; p[4] = s.pitch || 0; p[5] = s.sp || 0; p[6] = s.spT || 0; p[7] = s.hd || 0; p[8] = s.hdT || 0;
  const set = (i: number, a?: number[]) => { if (a) { p[i] = a[0] || 0; p[i + 1] = a[1] || 0; p[i + 2] = a[2] || 0; } };
  set(9, s.aL); set(12, s.aR); set(15, s.lL); set(18, s.lR);
  return p;
}
const tmp = new Float32Array(21);
function seq(u: number, fr: [number, Pose][], out: Pose) {
  if (u <= fr[0][0]) { out.set(fr[0][1]); return; }
  for (let i = 1; i < fr.length; i++) if (u <= fr[i][0]) {
    let k = (u - fr[i - 1][0]) / (fr[i][0] - fr[i - 1][0]); k = k * k * (3 - 2 * k);
    const a = fr[i - 1][1], b = fr[i][1];
    for (let j = 0; j < 21; j++) out[j] = a[j] + (b[j] - a[j]) * k;
    return;
  }
  out.set(fr[fr.length - 1][1]);
}

const S0 = P();
const atk = (wind: PoseSpec, hit: PoseSpec, tw = .75): [number, Pose][] => [[0, S0], [tw, P(wind)], [1.08, P(hit)], [2.05, P(hit)], [3, S0]];
const ATK: Record<string, [number, Pose][]> = {
  jab: atk({ aR: [18, 20, 128], twist: -34 }, { aR: [90, 4, 4], twist: 16, lean: 13, lL: [32, 30, 5], lR: [-30, 16, 6] }),
  cross: atk({ aL: [22, 16, 128], twist: 6 }, { aL: [92, 2, 4], aR: [28, 22, 124], twist: -56, lean: 15, lL: [34, 34, 5], lR: [-30, 12, 6] }),
  kick: atk({ lR: [58, 105, 8], lean: -6, twist: -5 }, { lR: [102, 4, 8], lL: [-4, 8, 0], lean: -24, twist: 28, aL: [62, 32, 80], aR: [-34, 34, 40] }, .8),
  airkick: [[0, P({ lL: [50, 90, 5], lR: [30, 80, 5] })], [.9, P({ lR: [80, 6, 5], lL: [-28, 98, 5], lean: -12, aL: [70, 28, 70], aR: [-24, 38, 50], twist: 10 })], [3, P({ lR: [80, 6, 5], lL: [-28, 98, 5], lean: -12, aL: [70, 28, 70], aR: [-24, 38, 50], twist: 10 })]],
  sweep: atk({ lL: [78, 128, 10], lR: [50, 118, 10], lean: 20 }, { lL: [76, 132, 10], lR: [84, 6, 2], lean: 4, twist: 30, aL: [20, 40, 40], aR: [-20, 50, 30] }),
  cast: atk({ aR: [-38, 26, 72], aL: [62, 10, 60], twist: -38 }, { aR: [90, 0, 4], aL: [82, -4, 12], twist: 18, lean: 15, lL: [34, 34, 5], lR: [-30, 14, 6] }),
  cast2: atk({ aR: [-55, 22, 30], aL: [-55, 22, 30], lean: 24, lL: [50, 80, 8], lR: [10, 70, 8] }, { aR: [128, 22, 8], aL: [128, 22, 8], lean: -6, sp: -10, hd: -10, lL: [30, 28, 8], lR: [-26, 12, 8], twist: 0 }),
  raise: atk({ aL: [62, -22, 124], aR: [62, -22, 124], lean: 14, lL: [36, 60, 6], lR: [0, 56, 6], twist: 0 }, { aL: [168, 36, 10], aR: [168, 36, 10], sp: -14, hd: -18, y: .28, lean: -4, twist: 0, lL: [14, 26, 6], lR: [-6, 40, 6] }),
  lunge: atk({ aR: [-42, 22, 95], lean: 22, lL: [44, 56, 5], lR: [-30, 34, 6], twist: -30 }, { aR: [94, 0, 0], aL: [-42, 22, 60], lean: 38, twist: 24, lL: [58, 46, 5], lR: [-48, 8, 6] }),
  upper: atk({ lL: [62, 104, 8], lR: [42, 104, 8], aR: [16, 12, 132], lean: 18, twist: -30 }, { aR: [174, 4, 12], aL: [10, 28, 80], y: .55, lean: -10, twist: 30, lL: [8, 14, 4], lR: [34, 74, 6], hd: -14 }),
  slam: atk({ aL: [176, 10, 22], aR: [176, 10, 22], lean: -14, y: .18, twist: 0, sp: -8 }, { aL: [46, 6, 8], aR: [46, 6, 8], lean: 46, twist: 0, lL: [72, 108, 14], lR: [56, 112, 14], hd: 16 }),
  whip: atk({ aR: [152, 22, 62], twist: -42, lean: -4 }, { aR: [70, -10, 4], aL: [-20, 30, 50], twist: 36, lean: 20, lL: [36, 36, 5], lR: [-32, 12, 6] }),
  charge: atk({ lean: 22, twist: -30, aL: [34, 6, 130], lL: [40, 56, 5], lR: [-20, 40, 6] }, { lean: 42, twist: -58, aL: [30, 4, 134], aR: [-34, 16, 62], lL: [56, 50, 5], lR: [-46, 10, 6], hd: -14 }),
  spin: atk({ lR: [40, 90, 8], aL: [20, 50, 60], aR: [20, 50, 60], twist: -60 }, { lR: [88, 5, 12], lL: [-4, 10, 0], aL: [10, 82, 16], aR: [10, 82, 16], lean: -8, twist: 0 }),
};
const POSES = {
  jumpUp: P({ lL: [54, 98, 5], lR: [22, 84, 5], aL: [64, 42, 60], aR: [44, 42, 70], lean: 4 }),
  jumpDn: P({ lL: [28, 30, 6], lR: [-12, 42, 6], aL: [104, 44, 30], aR: [96, 46, 34], lean: 2 }),
  crouch: P({ lL: [80, 128, 10], lR: [56, 122, 10], lean: 24, hd: -14 }),
  block: P({ aL: [78, -20, 118], aR: [72, -18, 122], lean: -5, hd: 10, lL: [28, 44, 6], lR: [-22, 36, 8], twist: -8 }),
  dash: P({ lean: 32, aL: [-52, 16, 30], aR: [-52, 16, 30], lL: [54, 44, 5], lR: [-44, 30, 6], twist: 0, hd: -18 }),
  hitA: P({ lean: -24, sp: -10, hd: -26, aL: [8, 32, 40], aR: [-4, 38, 50], twist: 18, lL: [10, 24, 6], lR: [-26, 20, 8] }),
  hitB: P({ lean: 18, sp: 10, hd: 20, aL: [30, 30, 70], aR: [24, 34, 80], twist: -30, lL: [20, 40, 6], lR: [-16, 34, 8] }),
  fly: P({ pitch: -62, aL: [62, 52, 30], aR: [40, 62, 30], lL: [44, 44, 8], lR: [8, 54, 10], twist: 0, hd: 10 }),
  lie: P({ pitch: -90, aL: [4, 72, 12], aR: [8, 64, 16], lL: [6, 12, 12], lR: [-4, 18, 14], twist: 0, hdT: 0, lean: 0 }),
  win: P({ aR: [172, 14, 24], aL: [8, 38, 84], lL: [6, 6, 9], lR: [-4, 6, 9], twist: 0, lean: -4, hdT: 0, hd: -8 }),
  lose: P({ lean: 30, hd: 30, aL: [10, 8, 10], aR: [10, 8, 10], lL: [10, 14, 6], lR: [-4, 12, 6], twist: 0, hdT: 0 }),
  fall: P({ pitch: 24, aL: [150, 40, 30], aR: [130, 50, 20], lL: [40, 60, 12], lR: [-20, 50, 12] }),
  show: P({ twist: 0, hdT: 0, lean: 2, aL: [10, 12, 22], aR: [14, 16, 60], lL: [6, 8, 7], lR: [-5, 8, 7] }),
};

export interface AnimCtx { state: string; anim?: string; u: number; st: number; t: number; vy: number; walkPh: number; back: boolean; landed: boolean; alt: boolean }
/** Menghitung pose target untuk state petarung. */
export function poseFor(c: AnimCtx, out: Pose) {
  const t = c.t;
  switch (c.state) {
    case 'attack': {
      const fr = ATK[c.anim!] || ATK.jab; seq(c.u, fr, out);
      if (c.anim === 'spin' && c.u > .75 && c.u < 2.3) out[2] = -(c.u - .75) / 1.55 * 720;
      return;
    }
    case 'walk': {
      out.set(S0); const ph = c.walkPh * (c.back ? -1 : 1), s = Math.sin(ph), k = Math.cos(ph);
      out[15] = 10 + 28 * s; out[16] = 26 + 26 * Math.max(0, k); out[18] = -6 - 28 * s; out[19] = 24 + 26 * Math.max(0, -k);
      out[0] = Math.abs(k) * .015; return;
    }
    case 'jump': seq(c.vy, [[-6, POSES.jumpDn], [4, POSES.jumpUp]], out); return;
    case 'crouch': out.set(POSES.crouch); return;
    case 'block': out.set(POSES.block); return;
    case 'dash': out.set(POSES.dash); return;
    case 'hit': out.set(c.alt ? POSES.hitB : POSES.hitA); return;
    case 'down': case 'ko': out.set(c.landed ? POSES.lie : POSES.fly); if (!c.landed) out[4] = -40 - Math.min(50, c.st * 160); return;
    case 'getup': seq(c.st, [[0, POSES.lie], [.3, POSES.crouch]], out); return;
    case 'win': out.set(POSES.win); out[0] = Math.abs(Math.sin(t * 5)) * .06; out[12] = 172 + Math.sin(t * 10) * 6; return;
    case 'lose': out.set(POSES.lose); return;
    case 'fall': out.set(POSES.fall); out[9] = 150 + Math.sin(t * 22) * 30; out[12] = 130 - Math.sin(t * 22) * 30; return;
    case 'show': out.set(POSES.show); out[0] = Math.sin(t * 2) * .008; out[5] = Math.sin(t * 2) * 1.5; out[11] = 22 + Math.sin(t * 2) * 3; return;
    default: {
      out.set(S0); const b = Math.sin(t * 3.2);
      out[0] = b * .012; out[5] = b * 2; out[11] = 100 + b * 4; out[14] = 116 - b * 4; out[16] = 30 + b * 2; out[19] = 24 + b * 2;
    }
  }
}

// ---------- Model ----------
export class CharModel {
  group = new THREE.Group(); private tilt = new THREE.Group(); private pelvis = new THREE.Group(); private spine = new THREE.Group(); private head = new THREE.Group();
  private arms: THREE.Group[][] = []; private legs: THREE.Group[][] = [];
  handL = new THREE.Object3D(); handR = new THREE.Object3D(); chest = new THREE.Object3D();
  pose = P(); private toon: THREE.MeshToonMaterial[] = []; private glow: THREE.MeshBasicMaterial[] = []; private glowAcc: THREE.MeshBasicMaterial[] = [];
  private sway: { o: THREE.Object3D; a: number; s: number; base: number }[] = []; private outlines: THREE.Mesh[] = [];
  scale: number;

  constructor(public def: CharDef, elem: Elem = def.elem) {
    const lk = def.look, b = lk.bulk, E = ELEMS[elem];
    this.scale = lk.h;
    const body = new THREE.Group(); body.scale.setScalar(lk.h); this.group.add(body); body.add(this.tilt); this.tilt.add(this.pelvis);
    const T = (c: number) => { const m = new THREE.MeshToonMaterial({ color: c, gradientMap: gradient() }); this.toon.push(m); return m; };
    const Gm = (acc = false) => { const m = new THREE.MeshBasicMaterial({ color: acc ? E.acc : E.col }); (acc ? this.glowAcc : this.glow).push(m); return m; };
    const skin = T(lk.skin), c1 = T(lk.c1), c2 = T(lk.c2), pants = T(shade(lk.c1, .55)), hair = T(lk.hair), dark = T(0x1b1626), gCol = Gm(), gAcc = Gm(true);
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, ol = true) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m);
      if (ol) { const o = new THREE.Mesh(geo, outlineMat); m.add(o); this.outlines.push(o); }
      return m;
    };
    const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, Math.max(.01, len - r), 4, 10);
    const sph = (r: number) => new THREE.SphereGeometry(r, 14, 10);
    const rock = (r: number) => new THREE.DodecahedronGeometry(r, 0);
    const cone = (r: number, h: number) => new THREE.ConeGeometry(r, h, 8);

    // panggul + kaki
    add(this.pelvis, sph(.15), pants).scale.set(1.15 * b, .78, .95 * b);
    for (const s of [1, -1]) {
      const hip = new THREE.Group(), knee = new THREE.Group(); hip.position.set(s * .1 * Math.sqrt(b), -.02, 0); knee.position.y = -TH;
      this.pelvis.add(hip); hip.add(knee); this.legs.push([hip, knee]);
      add(hip, cap(.088 * b, TH), pants, 0, -TH / 2, 0);
      add(knee, cap(.07 * b, SH - .1), pants, 0, -SH / 2 + .06, 0);
      add(knee, cap(.082 * b, .2), c2, 0, -SH + .13, 0);
      add(knee, new THREE.BoxGeometry(.13 * b, .09, .26), c2, 0, -SH + .01, .05);
    }
    // badan
    this.spine.position.y = .05; this.pelvis.add(this.spine);
    const torso = add(this.spine, new THREE.CylinderGeometry(.2 * lk.sh, .135 * b, TORSO, 12), c1, 0, TORSO / 2, 0); torso.scale.z = .72;
    add(this.spine, new THREE.CylinderGeometry(.15 * b, .15 * b, .07, 12), gAcc, 0, .03, 0).scale.z = .8;
    add(this.spine, sph(.07), gCol, 0, TORSO * .62, .125 * lk.sh, false); // permata elemen di dada
    this.chest.position.set(0, TORSO * .6, 0); this.spine.add(this.chest);
    for (const s of [1, -1]) {
      const sh = new THREE.Group(), el = new THREE.Group(); sh.position.set(s * .225 * lk.sh, TORSO - .06, 0); el.position.y = -UA;
      this.spine.add(sh); sh.add(el); this.arms.push([sh, el]);
      add(sh, sph(.09 * b), c2, 0, 0, 0);
      add(sh, cap(.066 * b, UA), skin, 0, -UA / 2, 0);
      add(el, cap(.058 * b, FA), skin, 0, -FA / 2, 0);
      add(el, new THREE.CylinderGeometry(.07 * b, .064 * b, .13, 10), c2, 0, -FA * .55, 0);
      add(el, sph(.075 * b), skin, 0, -FA - .02, 0);
      const h = s > 0 ? this.handL : this.handR; h.position.set(0, -FA - .02, 0); el.add(h);
      const orb = new THREE.Mesh(sph(.11), new THREE.MeshBasicMaterial({ color: E.col, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.glow.push(orb.material as THREE.MeshBasicMaterial); h.add(orb);
    }
    // kepala
    this.head.position.y = TORSO + .03; this.spine.add(this.head);
    add(this.head, new THREE.CylinderGeometry(.05 * b, .06 * b, .08, 8), skin, 0, .02, 0, false);
    const hy = .2;
    add(this.head, sph(.19), skin, 0, hy, 0).scale.set(1, 1.06, 1);
    for (const s of [1, -1]) {
      add(this.head, sph(.03), dark, s * .075, hy + .015, .168, false).scale.set(1, 1.25, .5);
      add(this.head, sph(.009), new THREE.MeshBasicMaterial({ color: 0xffffff }), s * .068, hy + .03, .188, false);
      const br = add(this.head, new THREE.BoxGeometry(.07, .016, .02), lk.style === 'rock' ? dark : hair, s * .075, hy + .075, .175, false); br.rotation.z = -s * .28;
    }
    const capGeo = new THREE.SphereGeometry(.205, 16, 10, 0, Math.PI * 2, 0, Math.PI * .5);
    const hairCap = (m: THREE.Material) => { const c = add(this.head, capGeo, m, 0, hy + .01, -.012); c.rotation.x = -.62; return c; };
    const swayOf = (o: THREE.Object3D, a: number, s: number) => this.sway.push({ o, a, s, base: o.rotation.x });
    const tab = (z: number, col: THREE.Material, len = .34) => { const g = new THREE.Group(); g.position.set(0, -.04, z); this.pelvis.add(g); add(g, new THREE.BoxGeometry(.2 * b, len, .025), col, 0, -len / 2, 0); g.rotation.x = z > 0 ? -.12 : .2; swayOf(g, .12, 3); return g; };

    switch (lk.style) {
      case 'flow': {
        hairCap(hair);
        let par: THREE.Object3D = this.head, y = hy + .05, z = -.17;
        for (let i = 0; i < 4; i++) { // kuncir panjang mengalir
          const g = new THREE.Group(); g.position.set(0, y, z); par.add(g);
          add(g, cap(.075 - i * .012, .2), i > 1 ? T(mix(lk.hair, 0xffffff, .45)) : hair, 0, -.1, 0);
          g.rotation.x = i ? -.22 : 1.0; swayOf(g, .14, 2.6 + i * .3); par = g; y = -.2; z = 0;
        }
        tab(.11, c2); tab(-.11, c2, .42);
        for (const a of this.arms) add(a[1], new THREE.TorusGeometry(.085, .014, 6, 14), gCol, 0, -FA * .3, 0, false).rotation.x = Math.PI / 2;
        add(this.head, new THREE.TorusGeometry(.197, .011, 6, 24), gAcc, 0, hy + .1, -.005, false).rotation.x = Math.PI / 2 - .42;
        break;
      }
      case 'flame': {
        hairCap(T(shade(lk.hair, .8)));
        const fl = [[0, .36, -.04, .1, .34, -.3], [.09, .31, -.06, .075, .26, -.2], [-.09, .31, -.06, .075, .26, -.2], [0, .29, -.15, .085, .3, -.9], [.07, .2, -.19, .06, .24, -1.3], [-.07, .2, -.19, .06, .24, -1.3]];
        fl.forEach((f, i) => { const m = add(this.head, cone(f[3], f[4]), i === 0 || i === 3 ? gAcc : gCol, f[0], hy + f[1] - .1, f[2], false); m.rotation.x = f[5]; m.rotation.z = -f[0] * 3; swayOf(m, .14, 7 + i); });
        tab(-.11, c1, .3);
        for (const a of this.arms) add(a[1], new THREE.CylinderGeometry(.078 * b, .07 * b, .07, 10), gAcc, 0, -FA * .78, 0, false);
        break;
      }
      case 'rock': {
        add(this.head, rock(.13), c1, 0, hy + .15, -.03).scale.set(1.35, .8, 1.3);
        add(this.head, new THREE.BoxGeometry(.3, .05, .06), c1, 0, hy + .085, .15);
        add(this.head, new THREE.BoxGeometry(.2, .07, .1), c1, 0, hy - .14, .1);
        for (const a of this.arms) { add(a[0], rock(.17), c1, 0, .05, 0).rotation.set(.4, .7, .2); add(a[1], rock(.13), c1, 0, -FA * .6, 0).scale.set(1, 1.4, 1); add(a[1], rock(.05), gAcc, 0, -FA * .6, .11, false); }
        add(this.spine, rock(.16), c1, 0, TORSO * .75, -.15).rotation.set(.5, .2, 0);
        add(this.spine, rock(.11), gAcc, .1, TORSO * .45, -.14, false);
        break;
      }
      case 'swoosh': {
        hairCap(hair);
        [[0, .3, -.1, -1.2, .32], [.08, .26, -.1, -1.35, .26], [-.08, .26, -.1, -1.35, .26], [0, .2, -.15, -1.7, .26]].forEach(f => { const m = add(this.head, cone(.07, f[4]), hair, f[0], hy + f[1] - .1, f[2] - .08); m.rotation.x = f[3]; });
        add(this.spine, new THREE.TorusGeometry(.12, .045, 8, 16), c2, 0, TORSO + .02, 0).rotation.x = Math.PI / 2;
        for (const s of [1, -1]) { const g = new THREE.Group(); g.position.set(s * .06, TORSO, -.12); this.spine.add(g); add(g, new THREE.BoxGeometry(.09, .5, .02), c2, 0, -.25, 0); g.rotation.x = .75 + s * .12; swayOf(g, .25, 5 + s); }
        tab(.1, c2, .26);
        break;
      }
      case 'bolt': {
        hairCap(dark);
        for (let i = 0; i < 5; i++) { const m = add(this.head, cone(.045, .2 + (i % 2) * .08), gAcc, (i % 2 ? .02 : -.02), hy + .27 - i * .028, .1 - i * .07, false); m.rotation.x = -.25 - i * .32; }
        add(this.head, new THREE.BoxGeometry(.3, .045, .06), gAcc, 0, hy + .02, .16, false);
        for (const a of this.arms) { add(a[0], cone(.07, .2), c1, 0, .1, 0).rotation.z = 0; add(a[1], new THREE.TorusGeometry(.078, .013, 6, 12), gAcc, 0, -FA * .4, 0, false).rotation.x = Math.PI / 2; }
        tab(-.11, c2, .36);
        break;
      }
      case 'leaf': {
        hairCap(hair);
        for (let i = 0; i < 7; i++) { const a = (i - 3) * .42, m = add(this.head, sph(.11), i % 2 ? T(shade(lk.hair, .8)) : hair, Math.sin(a) * .17, hy + .1 - Math.abs(i - 3) * .03, -.1 - Math.cos(a) * .1); m.scale.set(.55, .2, 1.25); m.rotation.set(-.75, a, 0); }
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(this.head, sph(.035), gAcc, .15 + Math.cos(a) * .04, hy + .13 + Math.sin(a) * .04, .09, false); }
        add(this.head, sph(.03), new THREE.MeshBasicMaterial({ color: 0xffe066 }), .15, hy + .13, .115, false);
        for (const a of this.arms) for (let i = 0; i < 2; i++) add(a[1], new THREE.TorusGeometry(.07, .013, 6, 12), hair, 0, -FA * (.3 + i * .3), 0, false).rotation.set(Math.PI / 2, 0, .4);
        for (let i = 0; i < 5; i++) { const a = (i - 2) * .5, g = new THREE.Group(); g.position.set(Math.sin(a) * .14 * b, -.02, Math.cos(a) * .1 - .02); this.pelvis.add(g); const m = add(g, sph(.1), i % 2 ? c1 : hair, 0, -.13, 0); m.scale.set(.6, 1.5, .18); g.rotation.set(Math.cos(a) > .5 ? -.3 : .25, a, 0); swayOf(g, .1, 3 + i); }
        break;
      }
      case 'crown': {
        hairCap(c2);
        for (const s of [1, -1]) { const h1 = add(this.head, cone(.055, .22), c2, s * .15, hy + .2, -.02); h1.rotation.z = -s * .7; const h2 = add(this.head, cone(.035, .2), c2, s * .25, hy + .34, -.02); h2.rotation.z = -s * .1; add(this.arms[s > 0 ? 0 : 1][0], cone(.09, .3), c2, s * .04, .14, 0).rotation.z = -s * .5; }
        add(this.head, new THREE.TorusGeometry(.15, .018, 6, 20), gAcc, 0, hy + .34, 0, false).rotation.x = Math.PI / 2;
        const g = new THREE.Group(); g.position.set(0, TORSO - .04, -.13); this.spine.add(g); add(g, new THREE.BoxGeometry(.5, .95, .02), T(0x3a1f5c), 0, -.47, 0); g.rotation.x = .22; swayOf(g, .12, 2.2);
        tab(.11, c2, .4);
        break;
      }
    }
  }

  setElem(e: Elem) { const E = ELEMS[e]; for (const m of this.glow) m.color.setHex(E.col); for (const m of this.glowAcc) m.color.setHex(E.acc); }
  flash(k: number) { for (const m of this.toon) m.emissive.setScalar(k); }
  setOutline(on: boolean) { for (const o of this.outlines) o.visible = on; }

  /** Menghaluskan pose saat ini menuju target lalu menerapkannya ke rangka. */
  apply(target: Pose, dt: number, rate: number, time: number) {
    const k = dt <= 0 ? 1 : 1 - Math.exp(-rate * dt), p = this.pose;
    for (let i = 0; i < 21; i++) p[i] += (target[i] - p[i]) * k;
    const drop = (h: number, kn: number, s: number) => TH * Math.cos(h * D) * Math.cos(s * D) + SH * Math.cos((h - kn) * D);
    const lie = Math.min(1, Math.abs(p[4]) / 90);
    const py = Math.max(drop(p[15], p[16], p[17]), drop(p[18], p[19], p[20]), .25) + FOOT;
    this.pelvis.position.y = py + p[0];
    this.pelvis.rotation.set(0, p[2] * D, p[3] * D);
    this.tilt.rotation.x = p[4] * D; this.tilt.position.set(0, lie * .17, lie * .45);
    this.spine.rotation.set(p[1] * D + p[5] * D, p[6] * D, 0);
    this.head.rotation.set(p[7] * D, p[8] * D, 0);
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1, a = this.arms[i], l = this.legs[i], ai = 9 + i * 3, li = 15 + i * 3;
      a[0].rotation.set(-p[ai] * D, 0, s * p[ai + 1] * D); a[1].rotation.x = -p[ai + 2] * D;
      l[0].rotation.set(-p[li] * D, 0, s * p[li + 2] * D); l[1].rotation.x = p[li + 1] * D;
    }
    for (const w of this.sway) w.o.rotation.x = w.base + Math.sin(time * w.s + w.s) * w.a;
  }
}
