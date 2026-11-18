// Renderer, pencahayaan, pengaturan kualitas, mode pajang karakter, dan thumbnail.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CharDef, ELEMS, Elem } from '../data';
import { CharModel, P, poseFor, outlineMat } from './character';
import { ArenaView, buildArena, makeSky, setSky } from './arenas';
import { FX } from './fx';

const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

export class Stage {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(36, 16 / 9, .1, 400);
  hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1); sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sky = makeSky(); fx = new FX(); content = new THREE.Group();
  quality = 1; fpsCap = 60; time = 0;
  private composer?: EffectComposer; private bloom?: UnrealBloomPass;
  private show?: { model: CharModel; ped: THREE.Group; yaw: number; x: number; pose: Float32Array; elem: Elem };
  showSpin = 0; private duo?: { key: string; models: CharModel[]; pose: Float32Array };

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.position.set(-5, 11, 8); this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 9; sc.bottom = -3; sc.near = 1; sc.far = 40; this.sun.shadow.bias = -.002;
    this.scene.add(this.sky, this.hemi, this.sun, this.sun.target, this.content, this.fx.group);
    this.scene.fog = new THREE.Fog(0x000000, 30, 90);
    this.setQuality(1);
    addEventListener('resize', () => this.resize());
  }

  setQuality(q: number) {
    this.quality = q; this.fpsCap = q === 0 ? 30 : 60;
    this.fx.q = [.4, .8, 1][q];
    this.renderer.shadowMap.enabled = q === 2; this.sun.castShadow = q === 2;
    this.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material; if (m) m.needsUpdate = true; });
    if (q === 2 && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .5, .6, .8);
      this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    }
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, [1, 1.5, 2][this.quality]) * (this.quality === 0 ? .8 : 1);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.composer?.setPixelRatio(dpr); this.composer?.setSize(w, h);
    this.fx.setViewport(h * dpr);
  }
  setEnv(a: Pick<ArenaView, 'sky' | 'fog' | 'hemi' | 'sun'>) {
    setSky(this.sky, a.sky);
    const f = this.scene.fog as THREE.Fog; f.color.setHex(a.fog[0]); f.near = a.fog[1]; f.far = a.fog[2];
    this.hemi.color.setHex(a.hemi[0]); this.hemi.groundColor.setHex(a.hemi[1]); this.hemi.intensity = a.hemi[2];
    this.sun.color.setHex(a.sun[0]); this.sun.intensity = a.sun[1];
  }
  clear() {
    for (const c of [...this.content.children]) {
      this.content.remove(c);
      c.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    }
    this.fx.clear(); this.show = undefined; this.duo = undefined;
  }

  // ----- Mode pajang (menu, pilih karakter, koleksi) -----
  private showEnv(e: Elem) {
    const E = ELEMS[e];
    this.setEnv({ sky: [0x070914, shade(E.col, .28), shade(E.col, .62)], fog: [shade(E.col, .3), 14, 50], hemi: [0xffffff, shade(E.col, .5), 1.35], sun: [0xffffff, 1.7] });
  }
  showChar(def: CharDef, x = 0, locked = false) {
    if (this.show && this.show.model.def === def) { this.show.x = x; this.show.model.group.visible = true; this.tintLocked(locked); return; }
    const yaw = this.show ? this.show.yaw : .35;
    this.clear();
    const E = ELEMS[def.elem], ped = new THREE.Group(), model = new CharModel(def);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, .22, 40), new THREE.MeshLambertMaterial({ color: 0x1a1d2e })); base.position.y = -.11; base.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.16, .035, 8, 60), new THREE.MeshBasicMaterial({ color: E.col })); ring.rotation.x = Math.PI / 2; ring.position.y = .01;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: E.col, transparent: true, opacity: .16 })); disc.rotation.x = -Math.PI / 2; disc.position.y = .012;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshLambertMaterial({ color: shade(E.col, .16) })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.22;
    ped.add(base, ring, disc, floor);
    for (let i = 0; i < 9; i++) { // pilar cahaya latar
      const b = new THREE.Mesh(new THREE.BoxGeometry(.5 + (i % 3) * .5, 14, .5), new THREE.MeshLambertMaterial({ color: shade(E.col, .22 + (i % 2) * .1) }));
      b.position.set(-12 + i * 3 + (i % 2), 4 + (i % 3) * 1.5, -9 - (i % 3) * 3); ped.add(b);
    }
    this.content.add(ped, model.group);
    this.show = { model, ped, yaw, x, pose: P(), elem: def.elem };
    this.showEnv(def.elem); this.tintLocked(locked);
    model.apply(this.show.pose, 0, 1, 0);
  }
  /** Dua petarung berdampingan (pilih karakter Main Bareng). */
  showDuo(a: CharDef, b: CharDef) {
    const key = a.id + '|' + b.id; if (this.duo?.key === key) return;
    this.clear();
    for (const [i, def] of [a, b].entries()) {
      const E = ELEMS[def.elem], x = i ? 2.15 : -2.15;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, .22, 40), new THREE.MeshLambertMaterial({ color: 0x1a1d2e })); base.position.set(x, -.11, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.06, .035, 8, 60), new THREE.MeshBasicMaterial({ color: E.col })); ring.rotation.x = Math.PI / 2; ring.position.set(x, .01, 0);
      this.content.add(base, ring);
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshLambertMaterial({ color: 0x14162a })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.22; this.content.add(floor);
    const models = [new CharModel(a), new CharModel(b, b.elem, a.id === b.id)];
    models.forEach((m, i) => { m.group.position.x = i ? 2.15 : -2.15; m.group.rotation.y = i ? -.55 : .55; this.content.add(m.group); });
    this.duo = { key, models, pose: P() };
    this.setEnv({ sky: [0x070914, shade(ELEMS[a.elem].col, .3), shade(ELEMS[b.elem].col, .45)], fog: [0x15182c, 14, 50], hemi: [0xffffff, 0x3a3f66, 1.35], sun: [0xffffff, 1.7] });
  }
  private tintLocked(l: boolean) { this.show?.model.flash(l ? -.75 : 0); }
  rotateShow(d: number) { if (this.show) this.show.yaw += d; }

  private updateShow(dt: number) {
    const s = this.show!; s.yaw += this.showSpin * dt;
    s.model.group.position.x += (s.x - s.model.group.position.x) * Math.min(1, dt * 8); s.ped.position.x = s.model.group.position.x;
    s.model.group.rotation.y = s.yaw;
    poseFor({ state: 'show', u: 0, st: 0, t: this.time, vy: 0, walkPh: 0, back: false, landed: false, alt: false }, s.pose);
    s.model.apply(s.pose, dt, 8, this.time);
    const gx = s.model.group.position.x, a = this.time * 1.4;
    if (Math.random() < .5) this.fx.elemPuff(s.elem, gx + Math.cos(a) * 1.1, .1 + Math.random() * 2.2, Math.sin(a) * 1.1, 1.1);
    const asp = this.camera.aspect, z = 5.2 * Math.max(1, 1.5 / asp);
    this.camera.position.set(0, 1.2, z); this.camera.lookAt(0, .8, 0);
  }

  render(dt: number) {
    this.time += dt;
    if (this.show) this.updateShow(dt);
    else if (this.duo) {
      const d = this.duo; poseFor({ state: 'show', u: 0, st: 0, t: this.time, vy: 0, walkPh: 0, back: false, landed: false, alt: false }, d.pose);
      d.models.forEach((m, i) => { m.apply(d.pose, dt, 8, this.time + i * 1.3); if (Math.random() < .35) this.fx.elemPuff(m.def.elem, m.group.position.x + (Math.random() - .5) * 2, .1 + Math.random() * 2, (Math.random() - .5), 1); });
      const z = 7.6 * Math.max(1, 1.6 / this.camera.aspect); this.camera.position.set(0, 1.3, z); this.camera.lookAt(0, .95, 0);
    }
    this.fx.update(dt);
    if (this.quality === 2 && this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  project(x: number, y: number, z = 0): [number, number] {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [(v.x * .5 + .5) * innerWidth, (-v.y * .5 + .5) * innerHeight];
  }

  // ----- Thumbnail (potret karakter dan pratinjau arena) -----
  private snap(w: number, h: number, pos: number[], look: number[], fov = 36): string {
    const pr = this.renderer.getPixelRatio(), size = this.renderer.getSize(new THREE.Vector2());
    const cam = new THREE.PerspectiveCamera(fov, w / h, .1, 400); cam.position.set(pos[0], pos[1], pos[2]); cam.lookAt(look[0], look[1], look[2]);
    this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false);
    this.renderer.render(this.scene, cam);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(this.renderer.domElement, 0, 0);
    this.renderer.setPixelRatio(pr); this.renderer.setSize(size.x, size.y, false);
    return c.toDataURL('image/webp', .86);
  }
  thumbChar(def: CharDef): string {
    this.clear();
    const m = new CharModel(def), E = ELEMS[def.elem], h = def.look.h; this.content.add(m.group); m.group.rotation.y = .45;
    const p = P(); poseFor({ state: 'show', u: 0, st: 0, t: 0, vy: 0, walkPh: 0, back: false, landed: false, alt: false }, p); m.apply(p, 0, 1, 0);
    this.setEnv({ sky: [shade(E.col, .2), shade(E.col, .5), shade(E.col, .95)], fog: [0, 50, 90], hemi: [0xffffff, shade(E.col, .6), 1.4], sun: [0xffffff, 1.7] });
    const url = this.snap(256, 256, [.2, 1.5 * h, 1.75], [0, 1.42 * h, 0], 30);
    this.clear(); return url;
  }
  thumbArena(id: string): string {
    this.clear();
    const a = buildArena(id); this.content.add(a.group); this.setEnv({ ...a, fog: [a.fog[0], a.fog[1] * 2.2, a.fog[2] * 2.2], hemi: [a.hemi[0], a.hemi[1], a.hemi[2] * 1.25] }); a.update(1, .016, this.fx); this.fx.update(.016);
    const url = this.snap(480, 270, [0, 2.2, 12.5], [0, 2.3, 0], 42);
    this.clear(); return url;
  }
}
export { outlineMat };
