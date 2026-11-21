import { ELEMS, Elem, hex } from '../data';
import { T, tr } from '../save';
import { sound } from '../audio';

export const ui = document.getElementById('ui')!;
export const $ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector(s) as T;
export const $$ = (s: string, el: ParentNode = document) => [...el.querySelectorAll(s)] as HTMLElement[];

const PATHS: Record<Elem, string> = {
  air: '<path d="M12 2.5c3.6 4.6 6 7.9 6 11.3a6 6 0 0 1-12 0c0-3.4 2.4-6.7 6-11.3z"/>',
  api: '<path d="M12.2 2c.8 3.6 5 5.4 5 10.6a5.2 5.2 0 0 1-10.4 0c0-1.9.7-3.1 1.6-4.1.3 1.4 1 2.3 2 2.7-.3-3.4.3-6.7 1.8-9.2z"/>',
  batu: '<path d="M12 2.5l7.6 4.6v9.4L12 21.5l-7.6-5V7.1z"/><path d="M12 2.5v6.2l7.6-1.6M12 8.7l-7.6-1.6M12 8.7l-3 6.3 3 6.5 3-6.5z" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1"/>',
  angin: '<path d="M3 8.5h9.5a2.8 2.8 0 1 0-2.8-2.8M3 12.5h14.5a3 3 0 1 1-3 3M3 16.5h6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  petir: '<path d="M13.6 2L5 13.6h5.6L9.4 22 19 9.6h-5.6z"/>',
  // kepalan tangan bersarung (bela diri)
  netral: '<path d="M6.5 9.2c0-1.5 1.2-2.7 2.7-2.7h6.6c1.9 0 3.4 1.5 3.4 3.4v3.6c0 3.4-2.7 6.1-6.1 6.1h-1.6c-2.8 0-5-2.2-5-5z"/><path d="M9.6 6.5v3.4M12.6 6.5v3.4M15.6 6.5v3.4M6.5 12.4h5.2" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.1" stroke-linecap="round"/>',
  tumbuhan: '<path d="M20.5 3.5C10 3.3 4.4 8.4 4.4 15c0 1.2.2 2.3.6 3.3l-1.7 2 1.4 1.2 1.7-2c1 .5 2.2.8 3.5.8 6.6 0 10.4-6.2 10.6-16.8zM8 17c1.6-4 4.4-7 8.4-9.2" /><path d="M8 17c1.6-4 4.4-7 8.4-9.2" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2" stroke-linecap="round"/>',
};
export const icon = (e: Elem) => `<span class="eic" style="--el:${hex(ELEMS[e].col)}"><svg class="ic" viewBox="0 0 24 24">${PATHS[e]}</svg></span>`;
export const etag = (e: Elem, extra = '') => `<span class="etag" style="--el:${hex(ELEMS[e].col)}"><svg class="ic" viewBox="0 0 24 24">${PATHS[e]}</svg>${tr(ELEMS[e].name)}${extra}</span>`;
export const elVar = (e: Elem | null) => `--el:${e ? hex(ELEMS[e].col) : '#ffd166'}`;
export const SVG = {
  atk: '<svg viewBox="0 0 24 24"><path d="M4 20L19 5M12 4.5h7.5V12M5 12l3 3"/></svg>',
  blk: '<svg viewBox="0 0 24 24"><path d="M12 3l7.5 3v5.2c0 4.6-3.1 8-7.5 9.8-4.4-1.8-7.5-5.2-7.5-9.8V6z"/></svg>',
  dsh: '<svg viewBox="0 0 24 24"><path d="M4.5 6l6 6-6 6M13 6l6 6-6 6"/></svg>',
  ult: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.8 6.3 6.7.7-5 4.6 1.4 6.7L12 17.4l-5.9 3.4 1.4-6.7-5-4.6 6.7-.7z" fill="currentColor" stroke="none"/></svg>',
};

// ---------- util layar (dipakai menu host dan mode kontroler) ----------
export type Handlers = Record<string, (v: string, el: HTMLElement) => void>;
export function bind(root: HTMLElement, h: Handlers) {
  root.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]'); if (!t || !root.contains(t) || t.classList.contains('hold')) return;
    sound.unlock(); const a = t.dataset.a!; (a === 'back' ? sound.back() : sound.ui()); h[a]?.(t.dataset.v || '', t);
  });
  // tombol .hold harus ditahan 2 detik (keluar/tutup di kontroler agar tidak terpencet saat bertarung)
  root.addEventListener('pointerdown', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a].hold'); if (!t || !root.contains(t)) return;
    t.classList.add('holding'); const id = setTimeout(() => { t.classList.remove('holding'); sound.back(); h[t.dataset.a!]?.(t.dataset.v || '', t); }, 2000);
    const stop = () => { clearTimeout(id); t.classList.remove('holding'); t.removeEventListener('pointerup', stop); t.removeEventListener('pointerleave', stop); t.removeEventListener('pointercancel', stop); };
    t.addEventListener('pointerup', stop); t.addEventListener('pointerleave', stop); t.addEventListener('pointercancel', stop);
  });
}
export function show(html: string, cls: string, h: Handlers = {}) {
  ui.innerHTML = `<div class="scr ${cls}">${html}</div>`; const root = ui.firstElementChild as HTMLElement; bind(root, h); return root;
}
export function modal(html: string, h: Handlers, cls = '') {
  const o = document.createElement('div'); o.className = 'over'; o.innerHTML = `<div class="panel modal ${cls}">${html}</div>`; ui.appendChild(o); bind(o, h); return o;
}
export function toast(text: string) { const d = document.createElement('div'); d.className = 'notice show'; d.style.top = '1rem'; d.style.zIndex = '50'; d.textContent = text; ui.appendChild(d); setTimeout(() => d.remove(), 1700); }
export const sigIcon = (n: number) => `<span class="sig s${n}" aria-label="${T('Sinyal', 'Signal')} ${n}/3"><i></i><i></i><i></i></span>`;
export const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
