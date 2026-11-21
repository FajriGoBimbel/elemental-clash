// Tampilan bracket turnamen, dipakai host dan perangkat peserta Turnamen Online.
import { CHARS } from '../data';
import { champion, nextMatch, type Rounds, type TMatch } from '../game/tour';
import { elVar, esc } from './dom';
import { T } from '../save';

export interface TourView { rounds: Rounds; names: string[]; chars: string[] }
const pname = (i: number) => T('Pemain ', 'Player ') + (i + 1);
const charOf = (id: string) => CHARS.find(c => c.id === id) ?? CHARS[0];
export const tourName = (v: TourView, i: number) => esc(String(v.names[i] || pname(i)).slice(0, 24));

/** Data bracket dari jaringan: hanya diterima bila bentuknya benar (indeks peserta 0–15). */
export function validTour(d: any): TourView | null {
  const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= -1 && (n as number) < 16;
  if (!d || !Array.isArray(d.rounds) || !Array.isArray(d.names) || !Array.isArray(d.chars) || d.rounds.length < 1 || d.rounds.length > 4) return null;
  const rounds = d.rounds.map((r: any) => Array.isArray(r) && r.length <= 8 ? r.map((m: any) => ok(m?.a) && ok(m?.b) && ok(m?.w) ? { a: m.a, b: m.b, w: m.w } : null) : null);
  if (rounds.some((r: any) => !r || r.includes(null))) return null;
  return { rounds, names: d.names.slice(0, 16).map((x: unknown) => String(x ?? '')), chars: d.chars.slice(0, 16).map((x: unknown) => String(x ?? '')) };
}

export function bracketHtml(v: TourView, portraits: Record<string, string>) {
  const rs = v.rounds, nx = nextMatch(rs), L = rs.length;
  const rname = (ri: number) => ri === L - 1 ? 'Final' : ri === L - 2 ? T('Semifinal', 'Semifinal') : ri === L - 3 ? T('Perempat Final', 'Quarterfinal') : T('Babak ', 'Round ') + (ri + 1);
  const slot = (p: number, m: TMatch, ri: number) => {
    if (p < 0) return `<div class="ts none">${ri === 0 ? 'BYE' : '—'}</div>`;
    const c = charOf(v.chars[p]);
    return `<div class="ts ${m.w === p ? 'win' : m.w >= 0 ? 'out' : ''}" style="${elVar(c.elem)}"><i style="background-image:url(${portraits[c.id] || ''})"></i><span>${tourName(v, p)}</span></div>`;
  };
  return `<div class="tbr">${rs.map((r, ri) => `<div class="tcol"><h4>${rname(ri)}</h4><div class="tms">${r.map(m => `<div class="tm ${m === nx ? 'cur' : ''}">${slot(m.a, m, ri)}${slot(m.b, m, ri)}</div>`).join('')}</div></div>`).join('')}</div>`;
}

/** Teks status di bawah bracket: laga berikutnya atau juara. */
export function tourInfo(v: TourView, sides = true) {
  const ch = champion(v.rounds), nx = nextMatch(v.rounds);
  if (ch >= 0) return `<h3 style="color:var(--gold)">🏆 ${tourName(v, ch)} ${T('Juara Turnamen!', 'is the Champion!')}</h3>`;
  if (!nx) return '';
  return sides
    ? `<p><b>${tourName(v, nx.a)}</b> <span class="mut">(${T('kiri', 'left')} · WASD)</span> VS <b>${tourName(v, nx.b)}</b> <span class="mut">(${T('kanan', 'right')} · ${T('panah', 'arrows')})</span></p>`
    : `<p>${T('Laga berikutnya', 'Next match')}: <b>${tourName(v, nx.a)}</b> VS <b>${tourName(v, nx.b)}</b></p>`;
}
