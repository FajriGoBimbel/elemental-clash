// Kontrol pemain: joystick virtual + tombol sentuh (landscape) dan keyboard untuk desktop.
import { Fighter, Input, noInput, MAX_STAM } from '../game/fighter';
import { save, T } from '../save';
import { icon, SVG, elVar } from './dom';

const KEYS: Record<string, string> = {
  KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd',
  KeyJ: 'atk', KeyK: 's1', KeyL: 's2', KeyI: 'block', Space: 'block', KeyO: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyU: 'ult',
};
type Edge = 'atk' | 's1' | 's2' | 'dash' | 'ult';

export class Controls {
  el: HTMLElement; private held: Record<string, boolean> = {}; private edge: Record<string, boolean> = {};
  private sx = 0; private sy = 0; private stickId = -1; private ox = 0; private oy = 0; private btn: Record<string, HTMLElement> = {};
  onPause: () => void = () => { }; enabled = true;

  constructor(parent: HTMLElement, f: Fighter) {
    const el = this.el = document.createElement('div'); el.className = 'ctl auto'; el.setAttribute('style', elVar(f.elem));
    el.innerHTML = `<div class="stick-zone"><div class="stick-base"><div class="stick-knob"></div></div></div>
      <div class="btns">
        <button class="cb dsh" data-k="dash" aria-label="Dash">${SVG.dsh}<small>DASH</small></button>
        <button class="cb blk" data-k="block" aria-label="${T('Tangkis', 'Block')}">${SVG.blk}</button>
        <button class="cb s1" data-k="s1" aria-label="${T('Jurus 1', 'Skill 1')}">${icon(f.def.elem)}<small>1</small><i class="cd"></i></button>
        <button class="cb s2" data-k="s2" aria-label="${T('Jurus 2', 'Skill 2')}">${icon(f.def.elem)}<small>2</small><i class="cd"></i></button>
        <button class="cb ult" data-k="ult" aria-label="${T('Pamungkas', 'Ultimate')}">${SVG.ult}</button>
        <button class="cb atk" data-k="atk" aria-label="${T('Serang', 'Attack')}">${SVG.atk}</button>
      </div>`;
    parent.appendChild(el); this.applySettings();
    el.querySelectorAll<HTMLElement>('.cb').forEach(b => {
      const k = b.dataset.k!; this.btn[k] = b;
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); if (k === 'block') this.held.block = true; else this.edge[k] = true; });
      const up = () => { b.classList.remove('on'); if (k === 'block') this.held.block = false; };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    });
    const zone = el.querySelector<HTMLElement>('.stick-zone')!, base = el.querySelector<HTMLElement>('.stick-base')!, knob = el.querySelector<HTMLElement>('.stick-knob')!;
    const rad = () => base.offsetWidth / 2;
    zone.addEventListener('pointerdown', e => {
      if (this.stickId >= 0) return; e.preventDefault(); zone.setPointerCapture(e.pointerId); this.stickId = e.pointerId;
      const r = zone.getBoundingClientRect(), R = rad(); // joystick mengambang: muncul di titik sentuh
      this.ox = Math.max(r.left + R, Math.min(r.right - R, e.clientX)); this.oy = Math.max(r.top + R, Math.min(r.bottom - R, e.clientY));
      base.style.left = this.ox - r.left - R + 'px'; base.style.right = 'auto'; base.style.bottom = 'auto'; base.style.top = this.oy - r.top - R + 'px';
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== this.stickId) return; const R = rad();
      let dx = (e.clientX - this.ox) / R, dy = (e.clientY - this.oy) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      this.sx = dx; this.sy = dy; knob.style.transform = `translate(${dx * R * .6}px, ${dy * R * .6}px)`;
    });
    const end = (e: PointerEvent) => { if (e.pointerId !== this.stickId) return; this.stickId = -1; this.sx = this.sy = 0; knob.style.transform = ''; base.removeAttribute('style'); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    addEventListener('keydown', this.kd); addEventListener('keyup', this.ku);
  }
  private kd = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'KeyP') { this.onPause(); return; }
    const k = KEYS[e.code]; if (!k) return; e.preventDefault();
    if (!e.repeat && (k === 'atk' || k === 's1' || k === 's2' || k === 'dash' || k === 'ult')) this.edge[k] = true;
    this.held[k] = true;
  };
  private ku = (e: KeyboardEvent) => { const k = KEYS[e.code]; if (k) this.held[k] = false; };

  applySettings() {
    const c = save.ctrl, s = this.el.style;
    s.setProperty('--cs', String(c.size)); s.setProperty('--co', String(c.opacity)); s.setProperty('--cm', c.margin + 'rem');
    this.el.classList.toggle('swap', c.swap);
  }
  /** Membaca input satu langkah simulasi; tombol sekali-tekan langsung dikosongkan. */
  read(): Input {
    const i = noInput(); if (!this.enabled) { this.edge = {}; return i; }
    const h = this.held;
    i.mx = (h.r ? 1 : 0) - (h.l ? 1 : 0) || (Math.abs(this.sx) > .28 ? Math.sign(this.sx) * Math.min(1, Math.abs(this.sx) * 1.5) : 0);
    i.up = !!h.u || this.sy < -.6; i.down = !!h.d || this.sy > .6; i.block = !!h.block;
    for (const k of ['atk', 's1', 's2', 'dash', 'ult'] as Edge[]) { i[k] = !!this.edge[k]; this.edge[k] = false; }
    return i;
  }
  /** Memperbarui cooldown jurus dan tombol pamungkas. */
  sync(f: Fighter) {
    this.btn.s1.style.setProperty('--p', String(f.cd1 / f.def.moves.s1.cd!)); this.btn.s2.style.setProperty('--p', String(f.cd2 / f.def.moves.s2.cd!));
    this.btn.ult.classList.toggle('ready', f.energy >= 100);
    const low = f.stam < 1; this.btn.dash.style.opacity = low ? '.35' : ''; this.btn.block.style.opacity = f.stam < MAX_STAM * .34 ? '.5' : '';
  }
  destroy() { removeEventListener('keydown', this.kd); removeEventListener('keyup', this.ku); this.el.remove(); }
}
