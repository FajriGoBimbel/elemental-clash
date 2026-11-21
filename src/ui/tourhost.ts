// Turnamen Bareng (CR-002) — sisi pembuat/host: buat turnamen, lobi 2–16 peserta, undian, bagan, giliran, WO,
// simpan otomatis & lanjutkan. Semua keputusan dihitung di sini; HP peserta hanya menampilkan data publik.
import { BMatch, BYE, Format, FORMATS, MAX_P, MIN_P, done, formatOk, makeBracket, matchCount, newSeed, nextMatch, podium, report, standings } from '../game/bracket';
import { HostRoom } from '../net/room';
import { getSock } from '../net/transport';
import { Bot } from '../game/bot';
import { BOT_LEVELS, CHARS, arenaById, charById } from '../data';
import { Input, noInput } from '../game/fighter';
import type { Ev, Match } from '../game/match';
import { snapshot } from '../net/sync';
import { $, $$, elVar, esc, etag, icon, modal, show, sigIcon, toast } from './dom';
import { T, save, tr } from '../save';
import { sound } from '../audio';
import { TourPub, bracketHtml, fmtName } from './bracketview';
import { joinLink, shareModal } from './share';

/** Kaitan ke mesin pertarungan di main.ts untuk satu pertandingan turnamen. */
export interface Ext {
  names: [string, string]; local: [boolean, boolean]; need: number;
  input(i: number, m: Match, dt: number): Input | null; // null = kontrol di layar ini
  buzz(i: number, k: 'hit' | 'hurt' | 'ult'): void;
  tick(t: number, m: Match): void;
  ev(e: Ev): void; // event pertarungan → dikirim ke layar peserta bersama snapshot
  pause(by: number): void;
  end(winner: number, wins: number[]): void;
}
export interface TourCtx {
  portraits: Record<string, string>; athumbs: Record<string, string>;
  fight(o: { p: [string, string]; arena: string; pure: boolean; ext: Ext }): void;
  endFight(): void; pause(by: number): void; resume(): void; paused(): boolean;
  bg(): void; back(): void; join(): void;
}

type Kind = 'p' | 'host' | 'bot';
interface TP { name: string; char: string; kind: Kind; ok: boolean }
interface Tour {
  v: 1; code: string; title: string; max: number; fmt: Format; bots: boolean; botLvl: number; bo: 1 | 3; lock: boolean;
  arena: string; pure: boolean; reset: boolean; host: boolean; hostName: string;
  phase: 'reg' | 'draw' | 'run' | 'done'; ps: TP[]; seed: number; br: ReturnType<typeof makeBracket> | null;
}
const KEY = 'ec-tour', CALL_S = 60, RECONNECT_MS = 15000, NAME_MAX = 12, SLOTS = 24;
const MIN_PER = { 1: 1.5, 3: 3 } as const; // menit per pertandingan (estimasi)

let ctx: TourCtx, tour: Tour | null = null, room: HostRoom | null = null, timer = 0, scr = '';
let slotOf: number[] = [];                                  // peserta → slot ruangan (-1 = tidak tersambung)
const pendErr = new Map<number, string>();                  // slot yang belum mengisi nama → pesan galat terakhir
let call: { id: number; ready: [boolean, boolean]; t0: number } | null = null;
let play: { id: number; bots: (Bot | null)[]; drop: number; dropAt: number; pauseBy: number; fbT: number; el: HTMLElement | null; arena: string; evq: Ev[] } | null = null;

const loadSaved = (): Tour | null => { try { const t = JSON.parse(localStorage.getItem(KEY) || 'null'); return t?.v === 1 ? t : null; } catch { return null; } };
const persistTour = () => { try { if (tour) localStorage.setItem(KEY, JSON.stringify(tour)); } catch { /* penyimpanan penuh/tidak tersedia */ } };
const clearSaved = () => { try { localStorage.removeItem(KEY); } catch { /* */ } };
const cleanName = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const online = (i: number) => { const p = tour!.ps[i]; return p.kind !== 'p' || (slotOf[i] >= 0 && !!room?.ready(slotOf[i])); };
const need = (m: BMatch) => m.bo1 || tour!.bo === 1 ? 1 : 2;
const minutes = (f: Format, n: number) => Math.round(matchCount(f, n) * MIN_PER[tour?.bo ?? draft.bo]);

/** Render ulang layar yang sama tanpa animasi masuk (hindari kedip saat data berubah). */
const view = (name: string) => { const again = scr === name; scr = name; return again ? 'dim still' : 'dim'; };

// ---------- menu ----------
export function tourMenu(c: TourCtx) {
  ctx = c; ctx.bg(); const sv = loadSaved(), resumable = sv && sv.phase !== 'done';
  show(`<div class="title"><h2>${T('Turnamen Bareng', 'Tournament')}</h2><span class="mut">${T(`${MIN_P}–${MAX_P} peserta · bagan & undian otomatis`, `${MIN_P}–${MAX_P} players · automatic bracket & draw`)}</span></div>
    <div class="vcards tcards">
      <button class="vcard" data-a="new"><h3>${T('Buat Turnamen', 'Create Tournament')}</h3><p>${T('Layar ini jadi host: atur format, bagikan kode, lalu pertandingan dimainkan bergiliran di sini.', 'This screen hosts: pick a format, share the code, then matches are played here in turns.')}</p><small>${T('Pembuat', 'Host')}</small></button>
      ${resumable ? `<button class="vcard join" data-a="resume"><h3>${T('Lanjutkan Turnamen', 'Resume Tournament')}</h3><p><b>${esc(sv!.title)}</b> · ${fmtName(sv!.fmt)} · ${sv!.ps.length} ${T('peserta', 'players')}<br>${T('Kode', 'Code')} ${sv!.code}</p><small>${T('Tersimpan otomatis', 'Auto-saved')}</small></button>` : ''}
      <button class="vcard" data-a="join"><h3>${T('Gabung dengan Kode', 'Join with Code')}</h3><p>${T('Ikut dari laptop/HP ini: masukkan kode, isi nama, pilih karakter. Kamu bertanding di layar perangkatmu sendiri.', 'Join from this laptop/phone: enter the code, your name and a fighter. You fight on your own screen.')}</p><small>${T('Peserta', 'Player')}</small></button>
    </div>
    <div class="foot"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button></div>`, 'dim', {
    new: () => { if (resumable) { const o = modal(`<h2>${T('Buat turnamen baru?', 'Start a new tournament?')}</h2><p>${T('Turnamen tersimpan akan dihapus.', 'The saved tournament will be deleted.')}</p><div class="mbtns"><button class="btn pri" data-a="y">${T('Buat baru', 'Create new')}</button><button class="btn" data-a="n">${T('Batal', 'Cancel')}</button></div>`, { y: () => { o.remove(); clearSaved(); createScreen(); }, n: () => o.remove() }); } else createScreen(); },
    resume: () => resume(sv!), join: () => ctx.join(), back: () => ctx.back(),
  });
}

// ---------- buat turnamen ----------
const draft = { title: '', max: 8, fmt: 'se' as Format, bots: false, botLvl: 1, bo: 3 as 1 | 3, lock: true, arena: 'random', pure: false, reset: true, host: false, hostName: '' };
function createScreen() {
  scr = 'create'; if (!draft.title) draft.title = T('Turnamen ', 'Tournament ') + new Date().toLocaleDateString(save.lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short' });
  const d = draft, seg = (a: string, opts: [string, string][], cur: string) => `<div class="seg">${opts.map(([v, l]) => `<button data-a="${a}" data-v="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const tog = (a: string, on: boolean) => `<button class="tog ${on ? 'on' : ''}" data-a="${a}"><i></i></button>`;
  const row = (l: string, c: string, hint = '') => `<div class="srow"><span>${l}${hint ? `<small class="mut">${hint}</small>` : ''}</span>${c}</div>`;
  const grNote = T('6–8 atau 12–16 peserta', '6–8 or 12–16 players');
  const est = minutes(d.fmt, d.max), warnRR = d.fmt === 'rr' && d.max > 8;
  show(`<div class="title"><h2>${T('Buat Turnamen', 'Create Tournament')}</h2><span class="mut">${T('Bisa diubah sampai turnamen dimulai', 'Editable until the tournament starts')}</span></div>
    <div class="tform">
      ${row(T('Nama turnamen', 'Tournament name'), `<input class="tin" data-k="title" maxlength="24" value="${esc(d.title)}">`)}
      ${row(T('Peserta maksimal', 'Max players'), `<div class="step"><button data-a="max" data-v="-1">−</button><b>${d.max}</b><button data-a="max" data-v="1">+</button></div>`, `${MIN_P}–${MAX_P}`)}
      ${row(T('Format', 'Format'), seg('fmt', FORMATS.map(f => [f, fmtName(f)]), d.fmt), d.fmt === 'gr' ? grNote : d.fmt === 'de' ? T('minimal 3 peserta', 'at least 3 players') : '')}
      ${d.fmt === 'de' ? row(T('Final besar diulang', 'Grand final reset'), tog('reset', d.reset), T('jika juara bagan bawah menang', 'if the lower-bracket winner wins')) : ''}
      ${row(T('Panjang pertandingan', 'Match length'), seg('bo', [['1', 'Best of 1'], ['3', 'Best of 3']], String(d.bo)), T('60 detik per ronde', '60 s per round'))}
      ${row(T('Kunci karakter', 'Lock fighters'), tog('lock', d.lock), T('karakter tetap selama turnamen', 'fighter stays the same all tournament'))}
      ${row(T('Arena', 'Arena'), `<select class="tin" data-k="arena"><option value="random">${T('Acak tiap pertandingan', 'Random each match')}</option>${save.arenas.map(a => `<option value="${a}" ${d.arena === a ? 'selected' : ''}>${tr(arenaById(a).name)}</option>`).join('')}</select>`)}
      ${row(T('Mode Murni', 'Pure Mode'), tog('pure', d.pure), T('tanpa efek arena', 'no arena hazards'))}
      ${row(T('Bot pengisi slot kosong', 'Fill empty slots with bots'), `${d.bots ? seg('lvl', BOT_LEVELS.slice(0, 4).map((l, i) => [String(i), tr(l.name)]), String(d.botLvl)) : ''}${tog('bots', d.bots)}`)}
      ${row(T('Pembuat ikut bermain', 'Host also plays'), `${d.host ? `<input class="tin sm" data-k="hostName" maxlength="${NAME_MAX}" placeholder="${T('Nama kamu', 'Your name')}" value="${esc(d.hostName)}">` : ''}${tog('host', d.host)}`, T('main dengan kontrol di layar ini', 'plays with this screen\'s controls'))}
      <p class="test ${warnRR ? 'warn' : ''}">${T(`Estimasi: ${matchCount(d.fmt, d.max)} pertandingan · ± ${est} menit untuk ${d.max} peserta`, `Estimate: ${matchCount(d.fmt, d.max)} matches · ~${est} min for ${d.max} players`)}${warnRR ? ' — ' + T('liga di atas 8 peserta sangat lama; disarankan maksimal 8.', 'a league above 8 players takes very long; 8 max is recommended.') : ''}${d.fmt === 'gr' && !formatOk('gr', d.max) ? ' — ' + T(`grup lalu gugur butuh ${grNote}.`, `groups need ${grNote}.`) : ''}${d.fmt === 'de' && !formatOk('de', d.max) ? ' — ' + T('gugur ganda butuh minimal 3 peserta.', 'double elimination needs at least 3 players.') : ''}</p>
    </div>
    <div class="foot"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button><button class="btn pri" data-a="go">${T('Buat & Buka Pendaftaran', 'Create & Open Registration')}</button></div>`, 'dim', {
    max: v => { d.max = Math.max(MIN_P, Math.min(MAX_P, d.max + +v)); createScreen(); },
    fmt: v => { d.fmt = v as Format; createScreen(); }, bo: v => { d.bo = +v as 1 | 3; createScreen(); }, lvl: v => { d.botLvl = +v; createScreen(); },
    reset: () => { d.reset = !d.reset; createScreen(); }, lock: () => { d.lock = !d.lock; createScreen(); }, pure: () => { d.pure = !d.pure; createScreen(); },
    bots: () => { d.bots = !d.bots; createScreen(); }, host: () => { d.host = !d.host; createScreen(); },
    back: () => tourMenu(ctx), go: () => create(),
  });
  for (const el of $$('.tform [data-k]') as HTMLInputElement[]) {
    const k = el.dataset.k as 'title' | 'arena' | 'hostName';
    el.addEventListener('input', () => { (d as any)[k] = el.value; });
    el.addEventListener('change', () => { (d as any)[k] = el.value; });
    el.addEventListener('keydown', e => e.stopPropagation()); // jangan sampai terbaca sebagai tombol permainan
  }
}
async function create() {
  const d = draft, title = d.title.trim().slice(0, 24) || T('Turnamen', 'Tournament');
  if (d.host && !cleanName(d.hostName)) return toast(T('Isi nama kamu untuk ikut bermain', 'Enter your name to play'));
  tour = {
    v: 1, code: '', title, max: d.max, fmt: d.fmt, bots: d.bots, botLvl: d.botLvl, bo: d.bo, lock: d.lock, arena: d.arena, pure: d.pure, reset: d.reset,
    host: d.host, hostName: cleanName(d.hostName), phase: 'reg', seed: 0, br: null,
    ps: d.host ? [{ name: cleanName(d.hostName), char: save.lastChar, kind: 'host', ok: true }] : [],
  };
  slotOf = tour.ps.map(() => -1);
  if (!await openRoom()) { tour = null; return; }
  persistTour(); lobby();
}
async function resume(sv: Tour) {
  tour = sv; slotOf = sv.ps.map(() => -1); call = null; play = null;
  if (!await openRoom(sv.code)) { tour = null; return; }
  toast(T('Turnamen dilanjutkan — peserta bisa masuk lagi dengan kode & nama yang sama', 'Tournament resumed — players can rejoin with the same code & name'));
  if (tour.phase === 'reg') lobby(); else if (tour.phase === 'draw') drawScreen(false); else if (tour.phase === 'done') champion(); else runScreen();
}
async function openRoom(code = '') {
  const sock = getSock();
  if (!sock) { toast(T('Turnamen butuh aplikasi Android atau versi web dengan internet.', 'Tournaments need the Android app or the web version with internet.')); return false; }
  const r = new HostRoom(sock, Array.from({ length: SLOTS }, (_, i) => i), tour!.title);
  if (code) r.code = code;
  r.auto = true; r.regClosed = false; // tahap nama: pendaftaran baru ditolak di sana bila sudah ditutup, agar peserta lama tetap bisa masuk lagi
  try { await r.open(); } catch {
    toast(sock.kind === 'web' ? T('Gagal membuka turnamen. Periksa koneksi internet.', 'Could not open the tournament. Check the internet connection.') : T('Gagal membuka turnamen. Pastikan Wi-Fi atau hotspot menyala.', 'Could not open the tournament. Make sure Wi-Fi or hotspot is on.'));
    return false;
  }
  room = r; tour!.code = r.code;
  r.onJoin = slot => { pendErr.set(slot, ''); syncOne(slot); };
  r.onBack = slot => { const i = slotOf.indexOf(slot); if (play && i >= 0) back(i); syncOne(slot); refresh(); };
  r.onDrop = slot => { const i = slotOf.indexOf(slot); if (i >= 0 && play) dropped(i); refresh(); };
  r.onCmd = cmd; r.onChange = () => { if (tour?.code !== r.code) { tour!.code = r.code; persistTour(); } refresh(); };
  clearInterval(timer); timer = setInterval(tick, 500) as unknown as number;
  return true;
}
function closeTour(notify = true) {
  clearInterval(timer); if (notify) room?.close(); else room?.close();
  room = null; tour = null; call = null; play = null; slotOf = []; pendErr.clear();
}

// ---------- perintah dari HP peserta ----------
function cmd(slot: number, m: { a: string; v?: any }) {
  const t = tour!; let i = slotOf.indexOf(slot);
  if (m.a === 'leave') { room!.kick(slot); if (i >= 0) { if (t.phase === 'reg') removeP(i); else slotOf[i] = -1; } refresh(); return; }
  if (i < 0) { if (m.a === 'name') nameCmd(slot, m.v); return; }
  const p = t.ps[i];
  switch (m.a) {
    case 'pick': if (save.chars.includes(m.v) && (t.phase === 'reg' ? !p.ok : !t.lock && call && inCall(i) && !call.ready[callSide(i)])) { p.char = m.v; persistTour(); refresh(); } break;
    case 'ready': if (t.phase === 'reg') { p.ok = !!m.v; persistTour(); refresh(); } break;
    case 'rechar': if (t.phase === 'reg') { p.ok = false; persistTour(); refresh(); } break;
    case 'tready': if (call && inCall(i)) { call.ready[callSide(i)] = true; refresh(); checkCall(); } break;
    case 'pause': if (play && inPlay(i) >= 0 && !ctx.paused()) ctx.pause(inPlay(i)); break;
    case 'resume': if (play && play.pauseBy === inPlay(i) && play.drop < 0) resumePlay(); break;
  }
}
function nameCmd(slot: number, v: unknown) {
  const t = tour!, n = cleanName(v), err = (e: string) => { pendErr.set(slot, e); syncOne(slot); };
  if (!n) return err('empty');
  const same = (x: string) => x.toLowerCase() === n.toLowerCase();
  const ex = t.ps.findIndex(p => same(p.name));
  if (ex >= 0) {
    const p = t.ps[ex];
    if (p.kind !== 'p' || (slotOf[ex] >= 0 && room!.ready(slotOf[ex]))) return err('dup');
    if (slotOf[ex] >= 0 && slotOf[ex] !== slot) room!.kick(slotOf[ex]);
    slotOf[ex] = slot; pendErr.delete(slot); // peserta lama masuk lagi (mis. setelah host dibuka ulang)
    if (play) back(ex);
    toast(`${p.name} ${T('tersambung kembali', 'reconnected')}`); refresh(); return;
  }
  if (t.phase !== 'reg' || room!.regClosed) return err('reg');
  if (t.ps.length >= t.max) return err('full');
  t.ps.push({ name: n, char: save.chars.includes(save.lastChar) ? save.lastChar : save.chars[0], kind: 'p', ok: false });
  slotOf.push(slot); pendErr.delete(slot); sound.confirm(); persistTour(); refresh();
}
function removeP(i: number) { tour!.ps.splice(i, 1); slotOf.splice(i, 1); persistTour(); }

// ---------- sinkronisasi ke HP ----------
function pub(): TourPub {
  const t = tour!;
  return { title: t.title, fmt: t.fmt, seed: t.seed, phase: t.phase, max: t.max, br: t.br, cur: play?.id ?? call?.id ?? -1,
    ps: t.ps.map((p, i) => ({ n: p.name, c: p.char, k: p.kind, on: online(i), ok: p.ok })) };
}
const inCall = (i: number) => !!call && (tour!.br!.ms[call.id].a === i || tour!.br!.ms[call.id].b === i);
const callSide = (i: number) => tour!.br!.ms[call!.id].a === i ? 0 : 1;
const inPlay = (i: number) => { if (!play) return -1; const m = tour!.br!.ms[play.id]; return m.a === i ? 0 : m.b === i ? 1 : -1; };
function scrFor(slot: number): object {
  const t = tour!, i = slotOf.indexOf(slot);
  if (i < 0) return { s: 'tname', title: t.title, err: pendErr.get(slot) ?? '', reg: t.phase === 'reg' && !room!.regClosed };
  const p = t.ps[i], base = { cfg: 'T', nm: p.name };
  if (t.phase === 'reg') return p.ok ? { ...base, s: 'tlobby', pub: pub(), me: i, lock: t.lock } : { ...base, s: 'char', ids: save.chars, pick: p.char, ready: false, other: false, tour: 1 };
  const k = inPlay(i);
  if (play && k >= 0) {
    const m = t.br!.ms[play.id], names = [t.ps[m.a!].name, t.ps[m.b!].name];
    // cfg D: pertarungan tampil penuh di perangkat peserta (laptop lawan laptop), bukan hanya joystick
    const g = { ...base, cfg: 'D', p: [t.ps[m.a!].char, t.ps[m.b!].char], a: play.arena, pure: t.pure, side: k, names, need: need(m), mid: play.id, id: p.char };
    return ctx.paused() ? { ...g, s: 'pause', slot: k, by: play.pauseBy, drop: play.drop, bn: names[play.pauseBy] ?? '', dn: names[play.drop] ?? '' } : { ...g, s: 'fight' };
  }
  if (call && inCall(i)) {
    const m = t.br!.ms[call.id], sd = callSide(i), o = t.ps[sd ? m.a! : m.b!];
    return { ...base, s: 'tcall', mid: call.id, opp: o.name, oc: o.char, left: callLeft(), ready: call.ready[sd], lock: t.lock, ids: save.chars, pick: p.char };
  }
  return { ...base, s: 'tbr', pub: pub(), me: i };
}
function syncOne(slot: number) { if (room?.ready(slot)) room.send(slot, { t: 'scr', slot, ...scrFor(slot) }); }
function syncAll() { if (!room) return; for (let s = 0; s < SLOTS; s++) if (room.peers[s]) syncOne(s); }
/** Status berubah: perbarui layar host yang sedang tampil + semua HP. */
function refresh() {
  syncAll();
  if (scr === 'lobby') lobby(); else if (scr === 'run') runScreen(); else if (scr.startsWith('draw:')) drawScreen(false);
}

// ---------- lobi ----------
function lobby() {
  const t = tour!, r = room!, cls = view('lobby');
  const humans = t.ps.filter(p => p.kind !== 'bot'), total = t.bots ? t.max : t.ps.length;
  const notReady = t.ps.filter((p, i) => p.kind === 'p' && (!p.ok || !online(i))).length;
  const why = total < MIN_P ? T(`Minimal ${MIN_P} peserta (termasuk bot pengisi)`, `At least ${MIN_P} players (bots included)`)
    : !formatOk(t.fmt, total) ? T(`${fmtName(t.fmt)} tidak tersedia untuk ${total} peserta`, `${fmtName(t.fmt)} is not available for ${total} players`)
      : notReady ? T(`${notReady} peserta belum memilih karakter / terputus`, `${notReady} players haven't picked a fighter / are offline`) : '';
  const rowP = (p: TP, i: number) => {
    const c = charById(p.char), sl = slotOf[i], on = online(i);
    return `<div class="tp ${on ? '' : 'off'}" style="${elVar(c.elem)}"><span class="por" style="background-image:url(${ctx.portraits[c.id]})"></span><b>${esc(p.name)}</b>
      <span class="mut">${c.name}${p.kind === 'host' ? ' · ' + T('pembuat', 'host') : ''}</span>${p.kind === 'p' && sl >= 0 ? `<span data-sig="${sl}">${sigIcon(r.sig(sl))}</span>` : ''}
      <i>${!on ? T('Terputus', 'Offline') : p.ok ? T('Siap', 'Ready') : T('Memilih…', 'Choosing…')}</i>
      ${p.kind === 'host' ? `<button class="btn sm" data-a="hchar">${T('Ganti', 'Change')}</button>` : `<button class="btn sm" data-a="kick" data-v="${i}" aria-label="${T('Keluarkan', 'Remove')} ${esc(p.name)}">✕</button>`}</div>`;
  };
  const link = joinLink(r.code);
  show(`<div class="title"><h2>${esc(t.title)}</h2><span class="mut">${fmtName(t.fmt)} · ${t.bo === 1 ? 'Best of 1' : 'Best of 3'}${t.lock ? ' · ' + T('karakter dikunci', 'fighters locked') : ''}</span></div>
    <div class="lobby tlobby"><div class="panel codebox"><span class="mut">${T('Kode turnamen', 'Tournament code')}</span>
      <div class="code" aria-label="${[...r.code].join(' ')}">${[...r.code].map(c => `<b>${c}</b>`).join('')}</div>
      <div class="row">${link ? `<button class="btn sm pri" data-a="share">${T('Bagikan link / QR', 'Share link / QR')}</button>` : ''}</div>
      <ol class="steps"><li>${T('Peserta buka game → <b>Main Bareng → Gabung dengan Kode</b>', 'Players open the game → <b>Versus → Join with Code</b>')}</li><li>${T('Isi nama (maks. 12 huruf) & pilih karakter', 'Enter a name (max 12) & pick a fighter')}</li></ol>
      <div class="srow"><span>${T('Peserta maksimal', 'Max players')}</span><div class="step"><button data-a="max" data-v="-1">−</button><b>${t.max}</b><button data-a="max" data-v="1">+</button></div></div>
      ${t.ps.length > 8 ? `<p class="warn">${T('Hotspot HP biasanya hanya menampung 8–10 perangkat; pakai router Wi-Fi untuk lebih banyak peserta.', 'Phone hotspots usually allow only 8–10 devices; use a Wi-Fi router for more players.')}</p>` : ''}</div>
      <div class="tplist"><h4>${T('Peserta', 'Players')} ${t.ps.length}/${t.max}${t.bots && t.ps.length < t.max ? ` <span class="mut">+ ${t.max - t.ps.length} bot ${T('saat mulai', 'at start')}</span>` : ''}${r.regClosed ? ` · <span class="warn">${T('pendaftaran ditutup', 'registration closed')}</span>` : ''}</h4>
        ${t.ps.map(rowP).join('') || `<p class="mut">${T('Belum ada peserta. Bagikan kode di sebelah kiri.', 'No players yet. Share the code on the left.')}</p>`}</div></div>
    <div class="foot"><button class="btn hold" data-a="cancel">${T('Batalkan (tahan)', 'Cancel (hold)')}<i></i></button><span class="grow"></span>
      <button class="btn" data-a="reg">${r.regClosed ? T('Buka Pendaftaran', 'Reopen Registration') : T('Tutup Pendaftaran', 'Close Registration')}</button>
      <span class="mut">${why}</span><button class="btn pri" data-a="start" ${why ? 'disabled' : ''}>${T('Mulai & Undi', 'Start & Draw')}</button></div>`, cls, {
    share: () => shareModal(r.code, 'ctl'),
    max: v => { t.max = Math.max(MIN_P, Math.max(t.ps.length, Math.min(MAX_P, t.max + +v))); persistTour(); lobby(); syncAll(); },
    kick: v => { const i = +v, sl = slotOf[i]; if (sl >= 0) room!.kick(sl, 'kick'); removeP(i); toast(T('Peserta dikeluarkan', 'Player removed')); refresh(); },
    hchar: () => { const p = t.ps.find(x => x.kind === 'host')!, ids = save.chars; p.char = ids[(ids.indexOf(p.char) + 1) % ids.length]; persistTour(); refresh(); },
    reg: () => { r.regClosed = !r.regClosed; refresh(); },
    cancel: () => cancelTour(), start: () => startDraw(),
  });
}
function cancelTour() {
  const o = modal(`<h2>${T('Batalkan turnamen?', 'Cancel the tournament?')}</h2><p>${T('Semua peserta diberi tahu dan kode dihanguskan.', 'All players are notified and the code expires.')}</p>
    <div class="mbtns">${tour?.br ? `<button class="btn" data-a="img">${T('Simpan gambar bagan', 'Save bracket image')}</button>` : ''}<button class="btn pri" data-a="y">${T('Batalkan turnamen', 'Cancel tournament')}</button><button class="btn" data-a="n">${T('Kembali', 'Back')}</button></div>`, {
    img: () => saveImage(), y: () => { o.remove(); if (play) ctx.endFight(); closeTour(); clearSaved(); tourMenu(ctx); }, n: () => o.remove(),
  });
}

// ---------- undian ----------
function startDraw() {
  const t = tour!; room!.regClosed = true;
  if (t.bots) {
    const used = new Set(t.ps.map(p => p.name.toLowerCase()));
    for (let k = 1; t.ps.length < t.max; k++) { const n = `Bot ${k}`; if (used.has(n.toLowerCase())) continue; t.ps.push({ name: n, char: CHARS[Math.floor(Math.random() * CHARS.length)].id, kind: 'bot', ok: true }); slotOf.push(-1); }
  }
  if (!formatOk(t.fmt, t.ps.length)) { toast(T('Format tidak tersedia untuk jumlah peserta ini', 'Format not available for this player count')); return; }
  t.phase = 'draw'; draw();
}
function draw() { const t = tour!; t.seed = newSeed(); t.br = makeBracket(t.ps.length, t.fmt, t.seed, t.reset); persistTour(); drawScreen(true); syncAll(); }
function drawScreen(anim: boolean) {
  const t = tour!; scr = 'draw';
  if (anim) { // animasi undian ±3 detik: nama diacak bergantian
    show(`<div class="drawing"><h2>${T('Mengundi bagan…', 'Drawing the bracket…')}</h2><div class="dnames">${t.ps.map(p => `<span>${esc(p.name)}</span>`).join('')}</div><p class="mut">Seed ${t.seed}</p></div>`, 'dim');
    sound.whoosh(2); const el = $('.dnames'), t0 = performance.now();
    const step = () => {
      if (scr !== 'draw' || !el.isConnected) return;
      if (performance.now() - t0 > 3000) { sound.confirm(); drawScreen(false); return; }
      const kids = [...el.children]; el.appendChild(kids[Math.floor(Math.random() * kids.length)]); setTimeout(step, 90);
    };
    step(); return;
  }
  const cls = view('draw:' + t.seed);
  show(`<div class="title"><h2>${esc(t.title)}</h2><span class="mut">${fmtName(t.fmt)} · ${t.ps.length} ${T('peserta', 'players')} · seed <b>${t.seed}</b> · ${T('belum dikunci', 'not locked')}</span></div>
    <div class="bwrap">${bracketHtml(pub())}</div>
    <div class="foot"><button class="btn" data-a="redo">${T('Undi Ulang', 'Redraw')}</button><span class="grow"></span><span class="mut">${T('Setelah dikunci, bagan tidak bisa diubah.', 'Once locked, the bracket can\'t change.')}</span><button class="btn pri" data-a="lock">${T('Kunci Bagan', 'Lock Bracket')}</button></div>`, cls, {
    redo: () => draw(), lock: () => { t.phase = 'run'; persistTour(); sound.confirm(); runScreen(); syncAll(); },
  });
}

// ---------- jalannya turnamen ----------
function runScreen() {
  const t = tour!, b = t.br!, cls = view('run');
  if (done(b)) { t.phase = 'done'; persistTour(); return champion(); }
  const m = nextMatch(b), nmx = (i: number) => `<b>${esc(t.ps[i].name)}</b> <span class="mut">${charById(t.ps[i].char).name}${t.ps[i].kind === 'bot' ? ' · bot' : ''}</span>`;
  let side = '';
  if (call) {
    const cm = b.ms[call.id], left = callLeft();
    const st = (i: number, k: number) => `<div class="cr ${call!.ready[k] ? 'ok' : ''}">${nmx(i)}<i>${call!.ready[k] ? T('Siap', 'Ready') : online(i) ? T('Menunggu…', 'Waiting…') : T('Terputus', 'Offline')}</i></div>`;
    side = `<h3>${T('Dipanggil', 'Called')}</h3>${st(cm.a!, 0)}<div class="vs">VS</div>${st(cm.b!, 1)}
      <p class="mut">${T(`Tekan Siap di perangkat peserta dalam <b class="cleft">${left}</b> detik. Tidak siap = kalah WO.`, `Press Ready on the player's device within <b class="cleft">${left}</b> s. Not ready = walkover loss.`)}${cm.defer ? ' ' + T('(sudah pernah ditunda)', '(already postponed once)') : ''}</p>`;
  } else if (m) {
    const bots = t.ps[m.a!].kind === 'bot' && t.ps[m.b!].kind === 'bot';
    side = `<h3>${T('Pertandingan berikutnya', 'Next match')}</h3><div class="cr">${nmx(m.a!)}</div><div class="vs">VS</div><div class="cr">${nmx(m.b!)}</div>
      ${m.st === 'P' ? `<p class="mut">${T('Playoff penentu seri · 1 ronde', 'Tiebreak playoff · 1 round')}</p>` : ''}${m.defer ? `<p class="warn">${T('Ditunda sekali', 'Postponed once')}</p>` : ''}
      <button class="btn pri" data-a="${bots ? 'sim' : 'call'}">${bots ? T('Simulasikan (bot lawan bot)', 'Simulate (bot vs bot)') : T('Panggil', 'Call')}</button>`;
  }
  const left = b.ms.filter(x => x.w === null).length;
  show(`<div class="title"><h2>${esc(t.title)}</h2><span class="mut">${fmtName(t.fmt)} · seed ${t.seed} · ${T('kode', 'code')} <b>${room?.code ?? t.code}</b> · ${T(`${left} pertandingan tersisa`, `${left} matches left`)}</span></div>
    <div class="trun"><div class="bwrap">${bracketHtml(pub())}</div><aside class="panel tside">${side}</aside></div>
    <div class="foot"><button class="btn hold" data-a="cancel">${T('Batalkan (tahan)', 'Cancel (hold)')}<i></i></button><button class="btn" data-a="img">${T('Simpan gambar', 'Save image')}</button><span class="grow"></span>
      <button class="btn" data-a="exit">${T('Keluar (tersimpan)', 'Exit (saved)')}</button></div>`, cls, {
    call: () => { const x = nextMatch(b); if (x) callMatch(x); },
    sim: () => { const x = nextMatch(b); if (x) simulate(x); },
    cancel: () => cancelTour(), img: () => saveImage(),
    exit: () => { closeTour(); tourMenu(ctx); toast(T('Turnamen tersimpan. Pilih Lanjutkan Turnamen untuk meneruskan.', 'Tournament saved. Choose Resume Tournament to continue.')); },
  });
}
function simulate(m: BMatch) {
  const t = tour!, n = need(m), aw = Math.random() < .5, lose = Math.floor(Math.random() * n);
  report(t.br!, m.id, aw ? m.a! : m.b!, aw ? [n, lose] : [lose, n]); persistTour(); sound.ui(); runScreen(); syncAll();
}
const callLeft = () => call ? Math.max(0, Math.ceil(CALL_S - (performance.now() - call.t0) / 1000)) : 0;
function callMatch(m: BMatch) {
  const t = tour!, auto = (i: number) => t.ps[i].kind !== 'p';
  call = { id: m.id, ready: [auto(m.a!), auto(m.b!)], t0: performance.now() }; sound.confirm(); runScreen(); syncAll(); checkCall();
}
function checkCall() {
  if (!call) return;
  const t = tour!, m = t.br!.ms[call.id];
  if (call.ready[0] && call.ready[1]) { const id = call.id; call = null; startPlay(id); return; }
  if (callLeft() > 0) return;
  // waktu habis: aturan WO (CR-002 Bagian 9)
  const [ra, rb] = call.ready, n = need(m); call = null;
  if (ra || rb) { report(t.br!, m.id, ra ? m.a! : m.b!, ra ? [n, 0] : [0, n], true); toast(T(`${t.ps[ra ? m.b! : m.a!].name} kalah WO`, `${t.ps[ra ? m.b! : m.a!].name} loses by walkover`)); }
  else if (!m.defer) { m.defer = true; toast(T('Keduanya tidak siap — pertandingan ditunda ke akhir antrean', 'Neither was ready — match moved to the end of the queue')); }
  else { report(t.br!, m.id, BYE, [0, 0], true); toast(T('Keduanya tidak siap lagi — keduanya kalah WO', 'Neither was ready again — both lose by walkover')); }
  persistTour(); runScreen(); syncAll();
}

// ---------- pertandingan ----------
function startPlay(id: number) {
  const t = tour!, m = t.br!.ms[id], a = t.ps[m.a!], b = t.ps[m.b!];
  const arena = t.arena === 'random' || !save.arenas.includes(t.arena) ? save.arenas[Math.floor(Math.random() * save.arenas.length)] : t.arena;
  const lvl = BOT_LEVELS[t.botLvl] ?? BOT_LEVELS[1];
  play = { id, bots: [a.kind === 'bot' ? new Bot(lvl) : null, b.kind === 'bot' ? new Bot(lvl) : null], drop: -1, dropAt: 0, pauseBy: -1, fbT: 0, el: null, arena, evq: [] };
  scr = 'fight'; const P = [m.a!, m.b!];
  const ext: Ext = {
    names: [a.name, b.name], local: [a.kind === 'host', b.kind === 'host'], need: need(m),
    input: (i, mt, dt) => {
      const bot = play?.bots[i]; if (bot) return bot.update(dt, mt.f[i], mt.f[1 - i], mt);
      const p = t.ps[P[i]]; if (p.kind === 'host') return null;
      const sl = slotOf[P[i]]; return sl >= 0 && room?.ready(sl) ? room.input[sl].read() : noInput();
    },
    buzz: (i, k) => { const sl = slotOf[P[i]]; if (sl >= 0 && !play?.bots[i]) room?.buzz(sl, k); },
    ev: e => { play?.evq.push(e); },
    tick: (now, mt) => {
      if (!play) return;
      // tiap peserta bertanding di layarnya sendiri: kirim keadaan pertarungan tiap frame (host tetap satu-satunya penghitung)
      const ss = snapshot(mt, play.evq.splice(0));
      P.forEach((pi, i) => { const sl = slotOf[pi]; if (sl >= 0 && !play!.bots[i]) room?.state(sl, ss); });
      if (now - play.fbT < 66) return; play.fbT = now;
      P.forEach((pi, i) => { const sl = slotOf[pi], x = mt.f[i]; if (sl >= 0 && room?.ready(sl)) room.fb(sl, { hp: Math.round(Math.max(0, x.hp)), mh: x.def.hp, en: Math.round(x.energy), c1: +(x.cd1 / (x.def.moves.s1.cd || 1)).toFixed(2), c2: 0, st: +x.stam.toFixed(2), w: i ? [mt.wins[1], mt.wins[0]] : mt.wins }); });
    },
    pause: by => { if (!play) return; play.pauseBy = by; pauseModal(); syncAll(); },
    end: (winner, wins) => finish(winner, wins),
  };
  ctx.fight({ p: [a.char, b.char], arena, pure: t.pure, ext }); syncAll();
}
function pauseModal() {
  const t = tour!, p = play!; p.el?.remove();
  const m = t.br!.ms[p.id], names = [t.ps[m.a!].name, t.ps[m.b!].name];
  if (p.drop >= 0) { dropModal(); return; }
  p.el = modal(`<h2>${T('Jeda', 'Paused')}</h2><p>${p.pauseBy >= 0 ? T(`Dijeda oleh ${esc(names[p.pauseBy])}.`, `Paused by ${esc(names[p.pauseBy])}.`) : T('Dijeda dari layar ini.', 'Paused from this screen.')}</p>
    <div class="mbtns"><button class="btn pri" data-a="resume">${T('Lanjutkan', 'Resume')}</button><button class="btn" data-a="wo">${T('Nyatakan WO…', 'Declare walkover…')}</button></div>`, {
    resume: () => resumePlay(), wo: () => woPick(),
  });
}
function woPick() {
  const t = tour!, m = t.br!.ms[play!.id];
  const o = modal(`<h2>${T('Siapa yang kalah WO?', 'Who loses by walkover?')}</h2><div class="mbtns"><button class="btn" data-a="x" data-v="0">${esc(t.ps[m.a!].name)}</button><button class="btn" data-a="x" data-v="1">${esc(t.ps[m.b!].name)}</button><button class="btn" data-a="n">${T('Batal', 'Cancel')}</button></div>`, {
    x: v => { o.remove(); walkover(+v); }, n: () => o.remove(),
  });
}
function resumePlay() {
  if (!play || play.drop >= 0) return;
  play.el?.remove(); play.el = null; play.pauseBy = -1;
  tour!.br!.ms[play.id] && [0, 1].forEach(i => { const sl = slotOf[[tour!.br!.ms[play!.id].a!, tour!.br!.ms[play!.id].b!][i]]; if (sl >= 0) room?.input[sl].release(); });
  ctx.resume(); syncAll();
}
function dropped(i: number) {
  const k = inPlay(i); if (!play || k < 0 || play.bots[k]) return;
  play.drop = k; play.dropAt = performance.now();
  if (!ctx.paused()) ctx.pause(k); else pauseModal();
  syncAll();
}
function back(i: number) {
  const k = inPlay(i); if (!play || k < 0 || play.drop !== k) return;
  play.drop = -1; play.pauseBy = k; toast(`${tour!.ps[i].name} ${T('tersambung kembali', 'reconnected')}`); pauseModal(); syncAll();
}
function dropModal() {
  const t = tour!, p = play!, m = t.br!.ms[p.id], name = t.ps[[m.a!, m.b!][p.drop]].name;
  p.el?.remove();
  const o = p.el = modal(`<h2>${esc(name)} ${T('terputus', 'disconnected')}</h2><p class="dm"></p><div class="mbtns"></div>`, {
    wo: () => walkover(p.drop),
    bot: () => { p.bots[p.drop] = new Bot(BOT_LEVELS[t.botLvl] ?? BOT_LEVELS[1]); p.drop = -1; resumePlay(); },
  });
  const tick = () => {
    if (p.el !== o || !o.isConnected || play !== p) return;
    const left = Math.ceil((RECONNECT_MS - (performance.now() - p.dropAt)) / 1000);
    if (left > 0) { $('.dm', o).textContent = T(`Menunggu tersambung kembali… ${left}`, `Waiting to reconnect… ${left}`); setTimeout(tick, 250); return; }
    $('.dm', o).textContent = T('Tidak tersambung kembali dalam 15 detik.', 'Did not reconnect within 15 seconds.');
    $('.mbtns', o).innerHTML = `<button class="btn pri" data-a="wo">${T('Nyatakan kalah WO', 'Declare walkover')}</button>${t.bots ? `<button class="btn" data-a="bot">${T('Bot menggantikan', 'Bot takes over')}</button>` : ''}`;
  };
  tick();
}
function walkover(k: number) {
  const t = tour!, p = play!, m = t.br!.ms[p.id], n = need(m);
  p.el?.remove(); play = null; ctx.endFight();
  report(t.br!, m.id, k === 0 ? m.b! : m.a!, k === 0 ? [0, n] : [n, 0], true); persistTour();
  toast(`${t.ps[k === 0 ? m.a! : m.b!].name} ${T('kalah WO', 'loses by walkover')}`); ctx.bg(); runScreen(); syncAll();
}
function finish(winner: number, wins: number[]) {
  const t = tour!, p = play; if (!p) return;
  const m = t.br!.ms[p.id], w = winner === 0 ? m.a! : m.b!;
  p.el?.remove(); play = null;
  report(t.br!, m.id, w, [wins[0], wins[1]]); persistTour(); syncAll();
  ctx.endFight(); ctx.bg(); scr = 'res';
  const fin = done(t.br!);
  show(`<div class="result tres"><h1 class="res win">${esc(t.ps[w].name)}</h1><p>${T('menang', 'wins')} <b>${wins[winner]}–${wins[1 - winner]}</b> ${T('melawan', 'against')} ${esc(t.ps[w === m.a ? m.b! : m.a!].name)}</p>
    <div class="row" style="justify-content:center"><button class="btn pri" data-a="ok">${fin ? T('Lihat Juara', 'See Champion') : T('Lihat Bagan', 'View Bracket')}</button></div></div>`, 'dim', { ok: () => runScreen() });
  setTimeout(() => { if (scr === 'res' && tour === t) runScreen(); }, 5000);
}

// ---------- juara ----------
function champion() {
  const t = tour!, pd = podium(t.br!)!; scr = 'champ'; ctx.bg();
  const pl = (i: number, place: number) => { const p = t.ps[i], c = charById(p.char); return `<div class="pod p${place}" style="${elVar(c.elem)}"><span class="por" style="background-image:url(${ctx.portraits[c.id]})"></span><b>${esc(p.name)}</b><span class="mut">${c.name}</span><i>${place}</i></div>`; };
  show(`<div class="title"><h2>${T('Juara', 'Champion')} · ${esc(t.title)}</h2><span class="mut">${fmtName(t.fmt)} · ${t.ps.length} ${T('peserta', 'players')} · seed ${t.seed}</span></div>
    <div class="podium">${pd[1] >= 0 ? pl(pd[1], 2) : ''}${pl(pd[0], 1)}${pd[2].map(i => pl(i, 3)).join('')}</div>
    <div class="bwrap sm">${bracketHtml(pub())}</div>
    <div class="foot"><button class="btn" data-a="close">${T('Tutup', 'Close')}</button><span class="grow"></span><button class="btn" data-a="img">${T('Simpan Hasil', 'Save Results')}</button><button class="btn pri" data-a="again">${T('Turnamen Baru', 'New Tournament')}</button></div>`, 'dim', {
    img: () => saveImage(), again: () => { closeTour(); clearSaved(); createScreen(); }, close: () => { closeTour(); clearSaved(); tourMenu(ctx); },
  });
  sound.coin(); syncAll();
}

// ---------- simpan gambar hasil (PNG) ----------
function saveImage() {
  const t = tour!, b = t.br; if (!b) return;
  const lines: [string, string][] = [];
  const pd = podium(b);
  if (pd) { lines.push(['h', T('Podium', 'Podium')]); lines.push(['', `1. ${t.ps[pd[0]].name}`]); if (pd[1] >= 0) lines.push(['', `2. ${t.ps[pd[1]].name}`]); pd[2].forEach(i => lines.push(['', `3. ${t.ps[i].name}`])); }
  if (b.fmt === 'rr' || b.fmt === 'gr') {
    const tables = b.fmt === 'rr' ? [[T('Klasemen', 'Standings'), b.order, (m: BMatch) => m.st === 'R']] as const : b.groups!.map((g, gi) => [T('Grup ', 'Group ') + 'ABCD'[gi], g, (m: BMatch) => m.st === 'G' && m.g === gi] as const);
    for (const [title, ids, f] of tables) { lines.push(['h', title]); standings(b, [...ids], f).forEach((r, i) => lines.push(['', `${i + 1}. ${t.ps[r.p].name}  —  ${r.pts} ${T('poin', 'pts')}  (${r.m}-${r.k}, ${r.rf - r.ra >= 0 ? '+' : ''}${r.rf - r.ra})`])); }
  }
  lines.push(['h', T('Hasil pertandingan', 'Match results')]);
  const stName: Record<string, string> = { W: t.fmt === 'de' ? T('Atas', 'Upper') : T('Babak', 'Round'), L: T('Bawah', 'Lower'), F: T('Final besar', 'Grand final'), R: T('Ronde', 'Round'), G: T('Grup', 'Group'), K: T('Gugur', 'KO'), P: 'Playoff' };
  for (const m of b.ms) if (m.w !== null && !m.auto) {
    const n = (i: number) => i >= 0 ? t.ps[i].name : 'BYE';
    lines.push(['', `${stName[m.st]} ${m.st === 'G' ? 'ABCD'[m.g!] + ' ' : ''}${m.rd}:  ${n(m.a!)} ${m.wo ? 'WO' : m.sc[0]} – ${m.wo ? '' : m.sc[1]} ${n(m.b!)}${m.w! >= 0 ? `  →  ${n(m.w!)}` : ''}`]);
  }
  const W = 1080, LH = 34, c = document.createElement('canvas'); c.width = W; c.height = 200 + lines.length * LH;
  const g = c.getContext('2d')!; g.fillStyle = '#070914'; g.fillRect(0, 0, W, c.height);
  g.fillStyle = '#ffd166'; g.font = '700 48px "Chakra Petch", sans-serif'; g.fillText(t.title, 48, 84);
  g.fillStyle = '#a2abcf'; g.font = '500 24px Barlow, sans-serif'; g.fillText(`Elemental Clash · ${fmtName(t.fmt)} · ${t.ps.length} ${T('peserta', 'players')} · seed ${t.seed}`, 48, 124);
  let y = 180;
  for (const [k, s] of lines) { g.fillStyle = k === 'h' ? '#ffd166' : '#eef1ff'; g.font = k === 'h' ? '700 28px "Chakra Petch", sans-serif' : '500 24px Barlow, sans-serif'; if (k === 'h') y += 10; g.fillText(s, 48, y); y += LH; }
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `turnamen-${t.title.replace(/[^\w-]+/g, '-').toLowerCase()}.png`;
  document.body.appendChild(a); a.click(); a.remove(); toast(T('Gambar hasil disimpan', 'Results image saved'));
}

// ---------- detak ----------
function tick() {
  if (!room || !tour) return;
  for (const el of $$('[data-sig]')) { const sl = +el.dataset.sig!; if (Number.isNaN(sl)) continue; const h = sigIcon(room.sig(sl)); if (el.innerHTML !== h) el.innerHTML = h; }
  // slot yang terputus lama dilepas (peserta tetap di bagan; bisa masuk lagi dengan kode + nama)
  for (let s = 0; s < SLOTS; s++) { const p = room.peers[s]; if (p && !p.up && performance.now() - p.dropAt > RECONNECT_MS) { room.kick(s); const i = slotOf.indexOf(s); if (i >= 0 && !play) slotOf[i] = -1; pendErr.delete(s); refresh(); } }
  if (call) {
    const before = callLeft(); checkCall();
    if (call && scr === 'run') { const el = $(".tside .cleft"); if (el) el.textContent = String(before); }
    if (call) for (const i of [tour.br!.ms[call.id].a!, tour.br!.ms[call.id].b!]) if (slotOf[i] >= 0) syncOne(slotOf[i]);
  }
}
/** Dipanggil main.ts saat keluar dari Main Bareng (mis. ke menu). */
export function tourLeave() { if (room) closeTour(); }
export const tourActive = () => !!tour;
void icon; void etag;
