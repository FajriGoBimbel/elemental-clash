// Tujuh arena prosedural. Bidang tarung: z = 0, x ∈ [-9, 9], lantai di y = 0.
import * as THREE from 'three';
import type { FX } from './fx';

export interface ArenaView {
  group: THREE.Group; sky: [number, number, number]; fog: [number, number, number];
  hemi: [number, number, number]; sun: [number, number]; update(t: number, dt: number, fx: FX): void;
  pillars?: THREE.Object3D[]; flashLight?: number;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
// acak berbenih agar arena selalu sama
function seeded(s: number) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function buildArena(id: string): ArenaView {
  const g = new THREE.Group(), R = seeded(id.length * 7919 + id.charCodeAt(0) * 31);
  const r = (a: number, b: number) => a + R() * (b - a);
  const mats = new Map<string, THREE.Material>();
  const L = (c: number, flat = true): THREE.Material => { const k = c + (flat ? 'f' : 's'); if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, flatShading: flat })); return mats.get(k)!; };
  const B = (c: number, op = 1, addv = false): THREE.Material => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1 || addv, opacity: op, blending: addv ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !addv && op >= 1, side: THREE.DoubleSide });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, par: THREE.Object3D = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); par.add(o); return o; };
  const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, par?: THREE.Object3D) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, par);
  const cyl = (rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10, par?: THREE.Object3D) => add(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, par);
  const sph = (rad: number, m: THREE.Material, x = 0, y = 0, z = 0, par?: THREE.Object3D) => add(new THREE.SphereGeometry(rad, 12, 8), m, x, y, z, par);
  const cone = (rad: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 7, par?: THREE.Object3D) => add(new THREE.ConeGeometry(rad, h, seg), m, x, y, z, par);
  const rock = (rad: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = add(new THREE.DodecahedronGeometry(rad, 0), m, x, y, z); o.rotation.set(r(0, 3), r(0, 3), r(0, 3)); return o; };
  const floor = (m: THREE.Material, w = 22, d = 8, z = -.6) => { const f = box(w, 1, d, m, 0, -.5, z); f.receiveShadow = true; return f; };
  const upd: ((t: number, dt: number, fx: FX) => void)[] = [];
  const v: ArenaView = { group: g, sky: [0, 0, 0], fog: [0, 30, 90], hemi: [0xffffff, 0x444444, 1.1], sun: [0xffffff, 1.6], update: (t, dt, fx) => { for (const u of upd) u(t, dt, fx); } };

  switch (id) {
    case 'kuil': {
      v.sky = [0x0b2f55, 0x1f8a96, 0xf6b580]; v.fog = [0x4fa3a8, 22, 85]; v.hemi = [0xbdf4f0, 0x2a5a66, 1.25]; v.sun = [0xffd9b0, 1.7];
      floor(L(0xb8c6c2)); box(22.4, .25, 8.4, L(0x8fa3a0), 0, -1.05, -.6); box(22, .06, .5, L(0x4fb8b0), 0, .0, 2.9); box(22, .06, .35, L(0x4fb8b0), 0, .0, -4.2);
      for (let i = -5; i <= 5; i++) box(.05, .02, 7, L(0x93a7a3), i * 2, .005, -.6);
      for (let i = 0; i < 7; i++) { // deretan pilar kuil
        const x = -10.5 + i * 3.5, h = i === 2 ? 2.6 : i === 5 ? 3.6 : 5.6;
        cyl(.42, .5, h, L(0xd5ded8), x, h / 2, -4.6, 10); box(1.2, .3, 1.2, L(0xc1ccc6), x, .15, -4.6);
        if (h > 5) { box(1.3, .35, 1.3, L(0xc1ccc6), x, h + .15, -4.6); sph(.2, B(0x7ff5ee), x, h + .7, -4.6); } else rock(.5, L(0xc1ccc6), x + .8, .3, -4.2);
      }
      box(8, .5, 1.4, L(0xc8d3cd), -7, 5.95, -4.6); box(4.6, .5, 1.4, L(0xc8d3cd), 8.2, 5.95, -4.6);
      for (let i = 0; i < 4; i++) box(16 - i * 3.6, 2.2, 6, L(0x5f8f96), 3, 1 + i * 2.2, -30); // kuil jauh
      cone(1.8, 3, L(0x76b0b3), 3, 10.2, -30, 4);
      add(new THREE.CircleGeometry(5, 32), B(0xffe2b8), -14, 6, -70);
      const sea = add(new THREE.PlaneGeometry(240, 120, 1, 1), new THREE.ShaderMaterial({
        uniforms: { t: { value: 0 } },
        vertexShader: 'varying vec3 p; void main(){ p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform float t; varying vec3 p; void main(){ float w=sin(p.x*.5+t*1.3)*.5+sin(p.y*1.4-t*1.7+p.x*.2)*.5; float f=smoothstep(.72,.95,w); float d=clamp((p.y+10.)/60.,0.,1.); vec3 c=mix(vec3(.05,.45,.52),vec3(.55,.75,.72),d); c=mix(c,vec3(.85,1.,.98),f*.6*(1.-d)); gl_FragColor=vec4(c,1.); }',
      }), 0, -1.6, -30); sea.rotation.x = -Math.PI / 2;
      upd.push(t => { (sea.material as THREE.ShaderMaterial).uniforms.t.value = t; });
      break;
    }
    case 'magma': {
      v.sky = [0x14040a, 0x7d1c0e, 0xff8a2a]; v.fog = [0x6a1a10, 18, 70]; v.hemi = [0xffb080, 0x4a1208, 1.05]; v.sun = [0xffb070, 1.5];
      floor(L(0x2b2328)); box(22.4, .4, 8.4, L(0x1a1418), 0, -1.1, -.6);
      for (let i = 0; i < 14; i++) { const c = box(r(.8, 2.6), .02, .07, B(0xff6a1a), r(-6, 6), .012, r(-3.6, 2)); c.rotation.y = r(0, 3); }
      const pools = [-1, 1].map(s => { const p = box(2.4, .04, 7.6, B(0xff7a1f), s * 7.8, .02, -.6); box(.25, .12, 7.6, L(0x1a1418), s * 6.5, .05, -.6); return p; });
      const lava = add(new THREE.PlaneGeometry(240, 100), new THREE.ShaderMaterial({
        uniforms: { t: { value: 0 } },
        vertexShader: 'varying vec3 p; void main(){ p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform float t; varying vec3 p; void main(){ float w=sin(p.x*.35+t*.4)+sin(p.y*.6-t*.5)+sin((p.x+p.y)*.2+t*.3); float f=smoothstep(-.6,1.6,w); vec3 c=mix(vec3(.35,.04,.02),vec3(1.,.55,.1),f); c=mix(c,vec3(1.,.9,.5),smoothstep(1.9,2.6,w)); gl_FragColor=vec4(c,1.); }',
      }), 0, -1.4, -28); lava.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 16; i++) { const x = r(-26, 26), z = r(-22, -5.5), h = r(3, 10); cone(r(1, 2.6), h, L(i % 3 ? 0x2a1c1e : 0x3a2426), x, h / 2 - 1.2, z, 6).rotation.y = r(0, 3); }
      cone(22, 22, L(0x24161a), -6, 9, -60, 9); cyl(3.5, 4.4, 1.2, B(0xffa23a), -6, 20, -60, 9); cone(14, 13, L(0x2c1a1c), 28, 5, -52, 8);
      upd.push((t, dt, fx) => {
        (lava.material as THREE.ShaderMaterial).uniforms.t.value = t;
        pools.forEach((p, i) => (p.material as THREE.MeshBasicMaterial).color.setHSL(.06, 1, .5 + Math.sin(t * 3 + i) * .06));
        if (Math.random() < .5) fx.one(rnd(-11, 11), rnd(-.5, .5), rnd(-5, 2.5), rnd(-.3, .3), rnd(1, 2.6), 0, 2.2, .09, Math.random() < .5 ? 0xff7a1f : 0xffd23a, -.2);
      });
      break;
    }
    case 'gunung': {
      v.sky = [0x5f86b3, 0xdcbc8e, 0xf3dfba]; v.fog = [0xdcc29a, 26, 95]; v.hemi = [0xfff0d0, 0x7a6248, 1.3]; v.sun = [0xfff0d6, 1.8];
      floor(L(0xa8906e)); box(22.4, .5, 8.4, L(0x8a7254), 0, -1.15, -.6);
      for (let i = 0; i < 9; i++) rock(r(.15, .4), L(0x8f775a), r(-10, 10), .05, r(-4, -2.2));
      for (let i = 0; i < 8; i++) { const x = -15 + i * 4.3 + r(-.8, .8), h = r(5, 12); const c = box(r(3.5, 6), h, r(3, 5), L(i % 2 ? 0x9b7f5e : 0x86694b), x, h / 2 - 1, r(-11, -8)); c.rotation.set(r(-.06, .06), r(-.4, .4), r(-.08, .08)); }
      for (const [x, h] of [[-8.6, 4.2], [-1.2, 2.2], [6.8, 5]] as const) { cyl(.5, .58, h, L(0xcdb48f), x, h / 2, -4.3, 8); rock(.62, L(0xbfa680), x, h + .1, -4.3); box(1.4, .3, 1.4, L(0xb39a76), x, .15, -4.3); }
      box(9, .6, 1.3, L(0xbfa680), -4.8, 4.6, -4.3).rotation.z = -.05;
      for (let i = 0; i < 6; i++) cone(r(12, 20), r(14, 26), L(0xc9b08e), -60 + i * 24 + r(-5, 5), 6, r(-80, -55), 6);
      // pilar gameplay (pelindung yang bisa dihancurkan)
      v.pillars = [-4.2, 4.2].map(x => {
        const p = new THREE.Group(); p.position.set(x, 0, -.95); g.add(p);
        cyl(.46, .54, 2.5, L(0xd9c39c), 0, 1.25, 0, 9, p).castShadow = true; box(1.25, .28, 1.25, L(0xc4ac84), 0, .14, 0, p); box(1.2, .26, 1.2, L(0xc4ac84), 0, 2.63, 0, p);
        cyl(.5, .5, .1, B(0xe0b955), 0, 1.9, 0, 9, p);
        return p;
      });
      upd.push((t, dt, fx) => { if (Math.random() < .25) fx.one(rnd(-12, 12), rnd(.2, 3), rnd(-3, 2), rnd(.8, 2), rnd(-.1, .2), 0, 2.5, .07, 0xe9d3aa, 0, true, 0); });
      break;
    }
    case 'awan': {
      v.sky = [0x2c6ad2, 0x8ecbf2, 0xffe6c8]; v.fog = [0xbfe0f5, 40, 140]; v.hemi = [0xffffff, 0x9fc4e8, 1.45]; v.sun = [0xfff6e0, 1.7];
      const f = box(15.2, .6, 6, L(0xeef2f0), 0, -.3, -.6); f.receiveShadow = true;
      box(15.6, .18, 6.4, L(0x6fe3b8), 0, -.52, -.6); box(15.2, .03, .3, L(0x8eeacb), 0, .005, 1.9); box(15.2, .03, .3, L(0x8eeacb), 0, .005, -3.1);
      const under = cone(7.4, 9, L(0xa9b7c2), 0, -5.2, -.6, 8); under.rotation.x = Math.PI; under.scale.z = .55;
      const banners: THREE.Object3D[] = [];
      for (const x of [-7, 7]) { cyl(.16, .2, 4.4, L(0xdfe6e4), x, 2.2, -3.2, 8); sph(.26, B(0x9ff5d6), x, 4.6, -3.2); const b = new THREE.Group(); b.position.set(x, 4.1, -3.2); g.add(b); box(1.5, .7, .03, L(0x2f9f84), .8, -.3, 0, b); banners.push(b); }
      const clouds: THREE.Group[] = [];
      for (let i = 0; i < 16; i++) {
        const c = new THREE.Group(), far = i > 5; c.position.set(r(-45, 45), far ? r(-6, 12) : r(-7, -3), far ? r(-60, -14) : r(-10, 6)); g.add(c);
        for (let j = 0; j < 5; j++) sph(r(1.2, 2.6) * (far ? 1.6 : 1), L(0xffffff, false), r(-3, 3), r(-.4, .6), r(-1, 1), c).scale.y = .6;
        clouds.push(c);
      }
      for (let i = 0; i < 4; i++) { const x = -34 + i * 22 + r(-4, 4), y = r(-2, 8), z = r(-50, -30), s = r(2.5, 5); const c = cone(s, s * 1.8, L(0x9aa9b6), x, y, z, 7); c.rotation.x = Math.PI; cyl(s, s, .5, L(0x7fcf8a), x, y + s * .9 + .2, z, 7); }
      add(new THREE.CircleGeometry(4, 32), B(0xfffbe8), 24, 26, -90);
      upd.push((t, dt) => { for (const c of clouds) { c.position.x += dt * .5; if (c.position.x > 48) c.position.x = -48; } banners.forEach((b, i) => { b.rotation.y = Math.sin(t * 2.4 + i) * .35; }); });
      break;
    }
    case 'hutan': {
      v.sky = [0x0b2418, 0x2c6a44, 0xa6dc8c]; v.fog = [0x356f4a, 12, 52]; v.hemi = [0xc8ffb0, 0x1c3a26, 1.2]; v.sun = [0xe8ffc0, 1.5];
      floor(L(0x3d5d36)); box(22.4, .5, 8.4, L(0x2a3f26), 0, -1.15, -.6);
      for (let i = 0; i < 16; i++) { const p = cyl(r(.5, 1.4), r(.5, 1.4), .03, L(i % 2 ? 0x4f7a3f : 0x35522f), r(-10, 10), .012, r(-4, 2.4), 9); p.scale.z = .6; }
      for (let i = 0; i < 11; i++) {
        const x = -22 + i * 4.4 + r(-1.2, 1.2), z = i % 2 ? r(-7, -5.4) : r(-15, -10), rad = r(.8, 1.7);
        cyl(rad * .8, rad * 1.15, 18, L(i % 2 ? 0x4a3524 : 0x3a2a1c), x, 8, z, 9);
        for (let k = 0; k < 3; k++) { const rt = add(new THREE.TorusGeometry(rad * 1.3, .22, 6, 10, Math.PI), L(0x4a3524), x + r(-.5, .5), 0, z + r(-.3, .6)); rt.rotation.y = r(0, 3); }
        for (let k = 0; k < 3; k++) sph(r(3, 5), L(k % 2 ? 0x1f5a34 : 0x2a7040), x + r(-3, 3), r(11, 15), z + r(-2, 2));
      }
      for (let i = 0; i < 9; i++) { const x = r(-10, 10), z = r(-4.2, -2.6), c = i % 2 ? 0xff8fc0 : 0x7ff5ee; cyl(.04, .05, .25, L(0xe8e0d0), x, .12, z, 6); sph(.14, B(c), x, .28, z).scale.y = .6; }
      const shafts: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i++) { const s = cone(r(1.4, 2.4), 16, B(0xd8ffb0, .09, true), -9 + i * 4.5 + r(-1, 1), 7.5, r(-5, -2), 12); s.rotation.z = .28; shafts.push(s); }
      upd.push((t, dt, fx) => {
        shafts.forEach((s, i) => { (s.material as THREE.MeshBasicMaterial).opacity = .07 + Math.sin(t * .7 + i * 1.7) * .03; });
        if (Math.random() < .35) fx.one(rnd(-11, 11), rnd(.3, 4), rnd(-4, 2.5), rnd(-.3, .3), rnd(-.1, .3), 0, 3, .08, Math.random() < .7 ? 0xd8ff8a : 0xff8fc0, 0, false, 0);
      });
      break;
    }
    case 'menara': {
      v.sky = [0x070a1e, 0x2a2674, 0x7a58c8]; v.fog = [0x2a2a5c, 22, 85]; v.hemi = [0xb8c0ff, 0x24244a, 1.2]; v.sun = [0xd4d8ff, 1.4];
      floor(L(0x3c3f62)); box(22.4, .6, 8.4, L(0x1c1d30), 0, -1.2, -.6);
      const rune = add(new THREE.RingGeometry(3.1, 3.3, 48), B(0x7a6bff, .9, true), 0, .012, -.6); rune.rotation.x = -Math.PI / 2; rune.scale.y = .55;
      const rune2 = add(new THREE.RingGeometry(5.6, 5.7, 48), B(0xffe83a, .5, true), 0, .012, -.6); rune2.rotation.x = -Math.PI / 2; rune2.scale.y = .55;
      for (let i = -5; i <= 5; i++) if (i % 2) box(1.6, 1.3, .7, L(0x34365a), i * 2, .65, -4.4); else box(1.6, .5, .7, L(0x34365a), i * 2, .25, -4.4);
      const tips: THREE.Mesh[] = [];
      for (const x of [-9.6, 9.6]) { cyl(.22, .34, 7, L(0x33355a), x, 3.5, -3.6, 8); for (let k = 0; k < 3; k++) add(new THREE.TorusGeometry(.5 - k * .1, .05, 6, 14), L(0x55588a), x, 5 + k * .7, -3.6).rotation.x = Math.PI / 2; tips.push(sph(.3, B(0xffe83a), x, 7.2, -3.6)); }
      for (let i = 0; i < 14; i++) { const c = sph(r(6, 12), L(0x23254a, false), r(-60, 60), r(14, 30), r(-70, -30)); c.scale.y = .4; }
      for (let i = 0; i < 7; i++) { const h = r(8, 22); box(r(2, 4), h, r(2, 4), L(0x1e2044), -40 + i * 13 + r(-3, 3), h / 2 - 12, r(-45, -30)); }
      let next = 2;
      upd.push((t, dt, fx) => {
        rune.rotation.z = t * .2; rune2.rotation.z = -t * .12;
        tips.forEach((m, i) => m.scale.setScalar(1 + Math.sin(t * 6 + i * 2) * .15));
        for (let i = 0; i < 5; i++) fx.one(rnd(-13, 13), rnd(6, 9), rnd(-6, 3), -1.5, -17, 0, .5, .05, 0x9fb0ff, 0, false, 0);
        v.flashLight = Math.max(0, (v.flashLight || 0) - dt * 4);
        if (t > next) { next = t + rnd(2.5, 6); v.flashLight = 1; fx.bolt(rnd(-30, 30), 30, rnd(2, 8), -40, 0x9f8fff, .3, .35); }
      });
      break;
    }
    default: { // dojo
      v.sky = [0x1c120c, 0x3a2618, 0x5a3c24]; v.fog = [0x3a2618, 30, 90]; v.hemi = [0xffe8c8, 0x5a3c24, 1.3]; v.sun = [0xfff0d8, 1.6];
      floor(L(0x9d6c3e), 24, 9);
      for (let i = -11; i <= 11; i++) box(.04, .02, 9, L(0x7d5530), i + .5, .006, -.6);
      box(24, .12, 2.6, L(0xcfc8a8), 0, .008, -.4); // matras
      box(26, 9, .4, L(0x4a3020), 0, 4.5, -5.6);
      for (let i = -4; i <= 4; i++) { box(2.5, 4.6, .1, L(0xefe6cc), i * 2.8, 2.9, -5.35); for (let k = 0; k < 3; k++) box(2.5, .06, .14, L(0x4a3020), i * 2.8, 1.4 + k * 1.3, -5.3); box(.08, 4.6, .14, L(0x4a3020), i * 2.8, 2.9, -5.3); }
      for (const x of [-11, -5.6, 5.6, 11]) cyl(.28, .28, 9, L(0x7a2a1c), x, 4.5, -4.9, 10);
      box(26, .5, .8, L(0x7a2a1c), 0, 5.6, -4.9); box(26, .3, .6, L(0x3a2418), 0, .3, -5.2);
      const lan: THREE.Mesh[] = [];
      for (const x of [-8.4, -2.8, 2.8, 8.4]) { cyl(.015, .015, 1.4, L(0x2a1a10), x, 7.3, -3.6, 4); const l = sph(.36, B(0xffc878), x, 6.4, -3.6); l.scale.y = 1.25; lan.push(l); }
      const cols = [0x1fc7c1, 0xff5a1f, 0xb07a4c, 0x6fe3b8, 0x7a6bff, 0x1fae5e];
      cols.forEach((c, i) => { const a = i / 6 * Math.PI * 2; add(new THREE.CircleGeometry(.32, 20), B(c), Math.cos(a) * .95, 7.4 + Math.sin(a) * .95, -5.3); });
      add(new THREE.RingGeometry(1.5, 1.6, 40), B(0xefe6cc), 0, 7.4, -5.32);
      upd.push(t => lan.forEach((l, i) => l.position.x += Math.sin(t * 1.3 + i) * .0006));
    }
  }
  return v;
}

/** Kubah langit bergradasi. */
export function makeSky(): THREE.Mesh {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 d; void main(){ d=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 d; void main(){ float y=normalize(d).y; vec3 c=mix(bot,mid,smoothstep(-.08,.22,y)); c=mix(c,top,smoothstep(.2,.75,y)); gl_FragColor=vec4(c,1.);\n#include <colorspace_fragment>\n}',
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), m); s.renderOrder = -10; s.frustumCulled = false;
  return s;
}
export function setSky(s: THREE.Mesh, c: [number, number, number]) {
  const u = (s.material as THREE.ShaderMaterial).uniforms;
  // warna shader mentah: konversi ke linear agar cocok dengan output sRGB renderer
  u.top.value.setHex(c[0]); u.mid.value.setHex(c[1]); u.bot.value.setHex(c[2]);
}
