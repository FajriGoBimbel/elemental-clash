// Data simpanan lokal (koin, koleksi, pengaturan). Disimpan terenkripsi ringan + checksum
// di localStorage; cukup untuk mencegah suntingan iseng, bukan pengaman kriptografis.
import type { L } from './data';

export interface Save {
  v: 1; coins: number; chars: string[]; arenas: string[]; lang: 'id' | 'en';
  gfx: number; sfx: number; music: number; haptic: boolean; cb: boolean; text: number;
  ctrl: { size: number; opacity: number; margin: number; swap: boolean };
  lastChar: string; level: number; story: Record<string, number>; ease: Record<string, number>;
  streak: number; daily: { date: string; done: boolean }; wins: number; losses: number; tutorial: boolean;
}
const KEY = 'elemental-clash-save', SECRET = 0x9e3779b9;
const fresh = (): Save => ({
  v: 1, coins: 200, chars: ['aqualis', 'pyrra', 'terrok'], arenas: ['kuil', 'magma', 'gunung', 'dojo'],
  lang: (navigator.language || 'id').startsWith('id') ? 'id' : 'en', gfx: 1, sfx: .8, music: .5, haptic: true, cb: false, text: 1,
  ctrl: { size: 1, opacity: .75, margin: 0, swap: false }, lastChar: 'aqualis', level: 1, story: {}, ease: {},
  streak: 0, daily: { date: '', done: false }, wins: 0, losses: 0, tutorial: false,
});

function stream(len: number) { let s = SECRET; const o = new Uint8Array(len); for (let i = 0; i < len; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; o[i] = s & 255; } return o; }
function sum(b: Uint8Array) { let h = 0x811c9dc5; for (const x of b) { h ^= x; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
function enc(obj: unknown) { const b = new TextEncoder().encode(JSON.stringify(obj)), k = stream(b.length); const o = b.map((x, i) => x ^ k[i]); return sum(b) + '.' + btoa(String.fromCharCode(...o)); }
function dec(s: string) { const [h, d] = s.split('.'); const o = Uint8Array.from(atob(d), c => c.charCodeAt(0)), k = stream(o.length); const b = o.map((x, i) => x ^ k[i]); if (sum(b) !== h) throw new Error('checksum'); return JSON.parse(new TextDecoder().decode(b)); }

export let save: Save = fresh();
export function loadSave() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const d = dec(raw), f = fresh(); save = { ...f, ...d, ctrl: { ...f.ctrl, ...d.ctrl } }; } } catch { save = fresh(); }
  return save;
}
export function persist() { try { localStorage.setItem(KEY, enc(save)); } catch { /* penyimpanan penuh/diblokir: game tetap jalan */ } }
export function resetSave() { const keep = { lang: save.lang }; save = { ...fresh(), ...keep }; persist(); }

export const tr = (l: L) => l[save.lang === 'id' ? 0 : 1];
export const T = (id: string, en: string) => (save.lang === 'id' ? id : en);
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
