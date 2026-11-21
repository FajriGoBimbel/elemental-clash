// Tampilan bagan Turnamen Bareng — dipakai di layar host dan di HP peserta (data publik yang sama).
import { BMatch, Bracket, Format, podium, standings, status } from '../game/bracket';
import { charById } from '../data';
import { elVar, esc, icon } from './dom';
import { T } from '../save';

export interface PubP { n: string; c: string; k: 'p' | 'host' | 'bot'; on: boolean; ok: boolean }
export interface TourPub { title: string; fmt: Format; seed: number; phase: 'reg' | 'draw' | 'run' | 'done'; ps: PubP[]; br: Bracket | null; cur: number; max: number }

export const fmtName = (f: Format) => ({ se: T('Gugur tunggal', 'Single elimination'), de: T('Gugur ganda', 'Double elimination'), rr: T('Liga', 'League'), gr: T('Grup lalu gugur', 'Groups + knockout') })[f];
const G = 'ABCD';

function nm(pub: TourPub, p: number | null, me: number) {
  if (p === null) return `<span class="mut">…</span>`;
  if (p < 0) return `<span class="mut">BYE</span>`;
  const x = pub.ps[p], c = charById(x.c);
  return `<span class="pn ${p === me ? 'me' : ''}" style="${elVar(c.elem)}">${icon(c.elem)}${esc(x.n)}${x.k === 'bot' ? ' <small>BOT</small>' : ''}</span>`;
}
function card(pub: TourPub, m: BMatch, me: number) {
  const fin = m.w !== null && !m.auto;
  const row = (p: number | null, i: number) => `<div class="br ${fin && m.w === p ? 'win' : fin ? 'lose' : ''}">${nm(pub, p, me)}<b>${fin ? (m.wo ? (m.w === p ? 'WO' : '–') : m.sc[i]) : ''}</b></div>`;
  return `<div class="bm ${m.id === pub.cur ? 'cur' : ''} ${m.auto ? 'auto' : ''} ${m.a === me || m.b === me ? 'mine' : ''}" data-m="${m.id}">${row(m.a, 0)}${row(m.b, 1)}</div>`;
}
const koName = (left: number) => left === 0 ? T('Final', 'Final') : left === 1 ? T('Semifinal', 'Semifinal') : left === 2 ? T('Perempat final', 'Quarterfinal') : '';
function cols(pub: TourPub, ms: BMatch[], me: number, label: (rd: number, last: number) => string) {
  const rds = [...new Set(ms.map(m => m.rd))].sort((a, b) => a - b), last = rds[rds.length - 1];
  return `<div class="bcols">${rds.map(rd => `<div class="bcol"><h5>${label(rd, last)}</h5><div class="bstack">${ms.filter(m => m.rd === rd).map(m => card(pub, m, me)).join('')}</div></div>`).join('')}</div>`;
}
function table(pub: TourPub, b: Bracket, ids: number[], filter: (m: BMatch) => boolean, me: number, adv = 0) {
  const rows = standings(b, ids, filter);
  return `<table class="stand"><thead><tr><th>#</th><th>${T('Peserta', 'Player')}</th><th>${T('Main', 'P')}</th><th>${T('M', 'W')}</th><th>${T('K', 'L')}</th><th>±</th><th>${T('Poin', 'Pts')}</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr class="${r.p === me ? 'me' : ''} ${i < adv ? 'adv' : ''}"><td>${i + 1}</td><td>${nm(pub, r.p, me)}</td><td>${r.main}</td><td>${r.m}</td><td>${r.k}</td><td>${r.rf - r.ra > 0 ? '+' : ''}${r.rf - r.ra}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table>`;
}

/** HTML bagan lengkap sesuai format. me = indeks peserta yang melihat (disorot), -1 untuk host. */
export function bracketHtml(pub: TourPub, me = -1) {
  const b = pub.br; if (!b) return '';
  const ko = (rd: number, last: number) => koName(last - rd) || T(`Babak ${rd}`, `Round ${rd}`);
  const po = b.ms.filter(m => m.st === 'P');
  const playoff = po.length ? `<h4>${T('Playoff penentu seri', 'Tiebreak playoff')}</h4>${cols(pub, po, me, rd => T(`Playoff ${rd}`, `Playoff ${rd}`))}` : '';
  let h = '';
  if (b.fmt === 'se') h = cols(pub, b.ms.filter(m => m.st === 'W'), me, ko);
  else if (b.fmt === 'de') {
    h = `<h4>${T('Bagan atas', 'Upper bracket')}</h4>${cols(pub, b.ms.filter(m => m.st === 'W'), me, (rd, last) => rd === last ? T('Final atas', 'Upper final') : T(`Babak ${rd}`, `Round ${rd}`))}
      <h4>${T('Bagan bawah', 'Lower bracket')}</h4>${cols(pub, b.ms.filter(m => m.st === 'L'), me, (rd, last) => rd === last ? T('Final bawah', 'Lower final') : T(`Babak ${rd}`, `Round ${rd}`))}
      <h4>${T('Final besar', 'Grand final')}</h4>${cols(pub, b.ms.filter(m => m.st === 'F'), me, rd => rd === 1 ? T('Final besar', 'Grand final') : T('Final ulang', 'Reset'))}`;
  } else if (b.fmt === 'rr') {
    h = table(pub, b, b.order, m => m.st === 'R', me) + playoff
      + `<h4>${T('Jadwal', 'Schedule')}</h4>${cols(pub, b.ms.filter(m => m.st === 'R'), me, rd => T(`Ronde ${rd}`, `Round ${rd}`))}`;
    return wrap(pub, me, h);
  } else {
    h = `<div class="groups">${b.groups!.map((g, gi) => `<div><h4>${T('Grup', 'Group')} ${G[gi]}</h4>${table(pub, b, g, m => m.st === 'G' && m.g === gi, me, 2)}</div>`).join('')}</div>`
      + playoff + `<h4>${T('Babak gugur', 'Knockout')}</h4>${cols(pub, b.ms.filter(m => m.st === 'K'), me, ko)}`;
    return wrap(pub, me, h);
  }
  return wrap(pub, me, h + playoff);
}
const wrap = (_pub: TourPub, _me: number, h: string) => `<div class="bracket">${h}</div>`;

/** Ringkasan status untuk HP peserta. */
export function myStatus(pub: TourPub, me: number) {
  const b = pub.br; if (!b) return '';
  const pd = podium(b);
  if (pd) {
    const place = pd[0] === me ? 1 : pd[1] === me ? 2 : pd[2].includes(me) ? 3 : 0;
    return place ? `<div class="mst gold">${['', T('JUARA!', 'CHAMPION!'), T('Juara 2', 'Runner-up'), T('Juara 3', 'Third place')][place]}</div>` : `<div class="mst">${T('Turnamen selesai', 'Tournament finished')} · ${T('Juara', 'Champion')}: <b>${esc(pub.ps[pd[0]].n)}</b></div>`;
  }
  const s = status(b, me);
  if (s.st === 'out') return `<div class="mst">${T('Kamu tersingkir — terima kasih sudah bermain! Tetap bisa melihat bagan.', 'You are out — thanks for playing! You can still follow the bracket.')}</div>`;
  if (b.ms[pub.cur] && (b.ms[pub.cur].a === me || b.ms[pub.cur].b === me)) return `<div class="mst gold">${T('Giliranmu sekarang!', 'You are up now!')}</div>`;
  if (s.next) { const o = s.next.a === me ? s.next.b! : s.next.a!; return `<div class="mst">${T('Pertandingan berikutnya', 'Next match')}: ${T('lawan', 'vs')} <b>${esc(pub.ps[o].n)}</b> · ${s.pos === 0 ? T('giliran berikutnya', 'up next') : T(`antrean ke-${s.pos + 1}`, `#${s.pos + 1} in queue`)}</div>`; }
  return `<div class="mst">${T('Menunggu hasil pertandingan lain…', 'Waiting for other results…')}</div>`;
}
