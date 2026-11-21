// Mode Kontroler: HP ini menjadi joystick + tombol untuk host Main Bareng.
// Tidak merender arena 3D (hemat baterai); semua hasil pertarungan dihitung di host.
import { ELEMS, arenaById, charById, hex } from '../data';
import { ClientLink, CODE_ABC, RECONNECT_MS } from '../net/room';
import { getSock } from '../net/transport';
import { Controls, KEYMAP } from './input';
import { noInput, type Input } from '../game/fighter';
import { bracketHtml, myStatus } from './bracketview';
import { $, bind, elVar, esc, etag, icon, modal, show, sigIcon, ui } from './dom';
import { T, persist, save, tr } from '../save';
import { sound } from '../audio';

export interface GuestOpts { p: [string, string]; a: string; pure: boolean; slot: number; names?: [string, string]; need?: number }
/** Mode 2 Layar: perangkat ini merender pertarungan sendiri (disediakan main.ts). */
interface GuestApi { start(o: GuestOpts, onPause: () => void): void; read(): Input; snap(s: unknown): void; end(): void }
interface Ctx { portraits: Record<string, string>; athumbs: Record<string, string>; resume?: boolean; code?: string; guest: GuestApi; exit: () => void }
let ctx: Ctx, link: ClientLink | null = null, code = '', scr: any = null, view = '', pad: Controls | null = null;
let wake: { release(): Promise<void> } | null = null, sigT = 0, guestMid = -1;
const pname = (i: number) => T('Pemain ', 'Player ') + (i + 1);
/** Label pemain di HP ini: nama turnamen bila ada, selain itu "Pemain N". */
const meName = () => scr?.nm ? esc(scr.nm) : pname(link!.slot);
const NKEY = 'ec-tname', TJ = 'ec-tj'; let lastCall = -1, autoName = '';
/** Tab ini sudah terdaftar di turnamen berkode ini → nama dikirim ulang otomatis saat host dibuka kembali. */
const tjoined = (): { code: string; name: string } | null => { try { return JSON.parse(sessionStorage.getItem(TJ) || 'null'); } catch { return null; } };
const savedName = () => { try { return localStorage.getItem(NKEY) || ''; } catch { return ''; } };

// Sesi disimpan per tab: bila halaman dimuat ulang (reload server dev, tab dibuang sistem),
// kontroler langsung menyambung lagi dengan token yang sama tanpa kode dan izin ulang.
const SKEY = 'ec-ctl', SESSION_MS = 60000;
type Saved = { code: string; tok: string; t: number };
export function ctlSaved(): Saved | null {
  try { const v = JSON.parse(sessionStorage.getItem(SKEY) || 'null') as Saved | null; return v && v.tok && Date.now() - v.t < SESSION_MS ? v : null; } catch { return null; }
}
function store(on: boolean) {
  try { if (on && link?.tok) sessionStorage.setItem(SKEY, JSON.stringify({ code: link.code, tok: link.tok, t: Date.now() })); else if (!on) sessionStorage.removeItem(SKEY); } catch { /* penyimpanan tidak tersedia */ }
}

export async function controllerMode(c: Ctx) {
  ctx = c; const sock = getSock(); if (!sock) return c.exit();
  link = new ClientLink(sock, await sock.name());
  link.onState = render; link.onMsg = m => { if (m.t === 'scr') { scr = m; render(); } };
  link.onFb = fb; link.onBuzz = buzz; link.onSnap = m => { if (guestMid >= 0) ctx.guest.snap(m); };
  await link.start();
  keepAwake(true); (screen.orientation as any)?.lock?.('landscape').catch(() => { });
  addEventListener('keydown', typeKey); document.addEventListener('visibilitychange', onVis);
  sigT = setInterval(() => { if (link?.state === 'in') store(true); const s = $('[data-csig]'); if (s && link) { const h = sigIcon(link.sig); if (s.innerHTML !== h) s.innerHTML = h; } }, 500) as unknown as number;
  view = ''; joinScreen();
  const sv = c.resume ? ctlSaved() : null;
  if (sv) { code = sv.code; link.resume(sv.code, sv.tok); }
  else if (c.code) { code = c.code; link.join(code); } // dari link undangan
}
function leave(notify = true) {
  if (notify) { link?.cmd('leave'); try { sessionStorage.removeItem(TJ); } catch { /* */ } }
  setTimeout(() => {
    store(false); padOff(); link?.leave(); link = null; scr = null; view = ''; keepAwake(false); clearInterval(sigT);
    removeEventListener('keydown', typeKey); document.removeEventListener('visibilitychange', onVis); ctx.exit();
  }, notify ? 120 : 0);
}
function keepAwake(on: boolean) {
  if (!on) { wake?.release().catch(() => { }); wake = null; return; }
  (navigator as any).wakeLock?.request('screen').then((l: any) => { wake = l; }).catch(() => { });
}
function onVis() { if (!document.hidden && link) keepAwake(true); }
function buzz(k: string) { if (save.haptic && navigator.vibrate) navigator.vibrate(k === 'hit' ? 18 : k === 'hurt' ? 45 : [60, 50, 120]); }
function padOff() { link?.setReader(null); pad?.destroy(); pad = null; if (guestMid >= 0) { guestMid = -1; ctx.guest.end(); } }
/** Layar host bilang "bertarung": tampilkan joystick (kontroler) atau pertarungan penuh (2 Layar). */
function play(s: any) {
  if (s.cfg === 'D') {
    if (guestMid === (s.mid ?? 0)) return;
    padOff(); guestMid = s.mid ?? 0;
    ctx.guest.start({ p: s.p, a: s.a, pure: !!s.pure, slot: s.side ?? link!.slot, names: s.names, need: s.need }, () => link?.cmd('pause'));
    link!.setReader(() => ctx.guest.read());
  } else if (!pad) padOn(s.id || '');
}

// ---------- gabung: papan ketik kode ----------
function typeKey(e: KeyboardEvent) {
  if (view !== 'join' || link?.state === 'search') return;
  const k = e.key.toUpperCase();
  if (k.length === 1 && CODE_ABC.includes(k) && code.length < 6) { code += k; updJoin(); }
  else if (e.key === 'Backspace') { code = code.slice(0, -1); updJoin(); }
  else if (e.key === 'Enter' && code.length === 6) link?.join(code);
}
function joinScreen() {
  padOff(); view = 'join';
  show(`<div class="title"><h2>${T('Gabung sebagai Kontroler', 'Join as Controller')}</h2><span class="mut">${T('Masukkan kode ruangan dari layar host', 'Enter the room code shown on the host')}</span></div>
    <div class="join"><div class="jl">
      <div class="code in"></div><div class="jst"></div>
      <div class="row"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button><button class="btn pri" data-a="go"></button></div>
    </div>
    <div class="keypad">${[...CODE_ABC].map(ch => `<button data-a="k" data-v="${ch}">${ch}</button>`).join('')}<button class="wide" data-a="del" aria-label="${T('Hapus satu', 'Backspace')}">⌫</button><button class="wide" data-a="clr">${T('Kosongkan', 'Clear')}</button></div></div>`, 'dim ctlr', {
    k: v => { if (link?.state !== 'search' && code.length < 6) { code += v; updJoin(); } },
    del: () => { if (link?.state !== 'search') { code = code.slice(0, -1); updJoin(); } },
    clr: () => { if (link?.state !== 'search') { code = ''; updJoin(); } },
    go: () => { if (link?.state === 'search') link.cancel(); else if (code.length === 6) link?.join(code); },
    back: () => leave(false),
  });
  updJoin();
}
function updJoin() {
  if (view !== 'join' || !link) return;
  const st = link.state, busy = st === 'search';
  $('.code.in').innerHTML = [0, 1, 2, 3, 4, 5].map(i => `<b class="${i === code.length && !busy ? 'cur' : ''}">${code[i] || ''}</b>`).join('');
  const go = $('[data-a="go"]'); go.textContent = busy ? T('Batal', 'Cancel') : T('Sambungkan', 'Connect'); go.toggleAttribute('disabled', !busy && code.length < 6);
  const why: Record<string, string> = {
    full: T('Ruangan penuh: sudah ada 2 kontroler.', 'The room is full: 2 controllers are already connected.'),
    reject: T('Host menolak permintaanmu.', 'The host declined your request.'),
    closed: T('Ruangan ditutup oleh host.', 'The host closed the room.'),
    reg: T('Pendaftaran turnamen sudah ditutup.', 'Tournament registration is closed.'),
    kick: T('Kamu dikeluarkan oleh pembuat turnamen.', 'You were removed by the tournament host.'),
    code: T('Kode ruangan sudah berubah. Minta kode terbaru dari host.', 'The room code has changed. Ask the host for the new code.'),
    lost: T('Gagal tersambung kembali ke host dalam 15 detik.', 'Could not reconnect to the host within 15 seconds.'),
  };
  const web = getSock()?.kind === 'web';
  const guide = web ? `<ul><li>${T('Pastikan kode sama persis dengan layar host.', 'Check the code matches the host screen exactly.')}</li>
    <li>${T('Versi web butuh internet di HP ini dan di host untuk menyambung. Periksa kuota/Wi-Fi.', 'The web version needs internet on this phone and the host to connect. Check data/Wi-Fi.')}</li>
    <li>${T('Beberapa Wi-Fi kantor/publik memblokir koneksi langsung antar-perangkat; coba data seluler atau hotspot yang punya internet.', 'Some office/public Wi-Fi blocks direct device-to-device links; try mobile data or a hotspot with internet.')}</li></ul>` : `<ul><li>${T('Pastikan kode sama persis dengan layar host.', 'Check the code matches the host screen exactly.')}</li>
    <li>${T('Kedua HP harus tersambung ke Wi-Fi yang sama.', 'Both phones must be on the same Wi-Fi.')}</li>
    <li>${T('Wi-Fi publik atau kantor sering memblokir koneksi antarperangkat. Nyalakan <b>hotspot</b> di salah satu HP dan sambungkan HP lain ke hotspot itu — kuota tidak terpakai.', 'Public or office Wi-Fi often blocks device-to-device traffic. Turn on a <b>hotspot</b> on one phone and connect the other to it — no data is used.')}</li></ul>`;
  $('.jst').innerHTML = busy ? `<p><span class="spin"></span>${T('Mencari host di jaringan lokal…', 'Looking for the host on the local network…')}</p>`
    : st === 'fail' ? `<div class="guide"><b>${link.why === 'notfound' ? T(`Ruangan ${esc(link.code)} tidak ditemukan.`, `Room ${esc(link.code)} was not found.`) : why[link.why] || ''}</b>${link.why === 'notfound' || link.why === 'lost' ? guide : ''}</div>`
      : `<p class="mut">${web ? T('Versi web: butuh internet untuk menyambung ke host.', 'Web version: internet is needed to reach the host.') : T('Tidak perlu internet: cukup Wi-Fi yang sama atau hotspot salah satu HP.', 'No internet needed: just the same Wi-Fi or one phone\'s hotspot.')}</p>`;
}

// ---------- tampilan sesuai status sambungan + layar dari host ----------
function render() {
  if (!link) return;
  const st = link.state;
  if (st === 'idle' || st === 'search' || st === 'fail') {
    if (st === 'fail') store(false);
    if (st === 'fail' && link.why === 'closed') code = '';
    $('.lostov')?.remove(); if (view !== 'join') joinScreen(); else updJoin(); return;
  }
  if (st === 'wait') {
    padOff(); view = 'wait';
    show(`<div class="cwait"><span class="spin big"></span><h2>${T('Menunggu persetujuan host', 'Waiting for the host to approve')}</h2>
      <p class="mut">${T('Ketuk <b>Izinkan</b> di layar host.', 'Tap <b>Allow</b> on the host screen.')} · ${T('Kode', 'Code')} ${esc(code)}</p>
      <button class="btn" data-a="cancel">${T('Batal', 'Cancel')}</button></div>`, 'dim ctlr', { cancel: () => { link?.cancel(); joinScreen(); } });
    return;
  }
  if (st === 'lost') { lostOverlay(); return; }
  store(true);
  $('.lostov')?.remove();
  if (scr) inScreen();
}
function lostOverlay() {
  if ($('.lostov')) return;
  const o = document.createElement('div'); o.className = 'over lostov'; ui.appendChild(o); const t0 = performance.now();
  const tick = () => {
    if (!o.isConnected) return; const left = Math.max(0, Math.ceil((RECONNECT_MS - (performance.now() - t0)) / 1000));
    o.innerHTML = `<div class="panel modal"><h2>${T('Koneksi terputus', 'Connection lost')}</h2><p><span class="spin"></span>${T(`Menyambung ulang ke host… ${left}`, `Reconnecting to the host… ${left}`)}</p><p class="mut">${T('Tetap di dekat host dan jangan matikan Wi-Fi.', 'Stay close to the host and keep Wi-Fi on.')}</p></div>`;
    setTimeout(tick, 500);
  };
  tick();
}
const top = (extra = '') => `<header class="ctop"><b>${meName()}</b><span class="mut">${T('ke', 'on')} ${esc(link!.hostName)}</span><span data-csig>${sigIcon(link!.sig)}</span>${extra}<span class="grow"></span>
  <button class="btn sm" data-a="lay">${T('Atur tombol', 'Layout')}</button><button class="btn sm hold" data-a="exit" title="${T('Tahan 2 detik', 'Hold 2 seconds')}">${T('Keluar', 'Leave')}<i></i></button></header>`;
const common = { lay: () => layoutModal(), exit: () => leave() };

function inScreen() {
  const s = scr; const key = s.s + '|' + (s.s === 'fight' ? s.id + '|' + (s.mid ?? 0) : JSON.stringify(s));
  if (s.nm && link) try { sessionStorage.setItem(TJ, JSON.stringify({ code: link.code, name: s.nm })); } catch { /* */ }
  if (key === view) return; const same = view.split('|')[0] === s.s; view = key;
  if (s.s !== 'fight' && s.s !== 'pause') padOff();
  switch (s.s) {
    case 'lobby':
      show(`${top()}<div class="cwait"><h2>${T('Terhubung!', 'Connected!')}</h2><p>${T(`Kamu <b>${pname(s.slot)}</b>. Menunggu pemain lain…`, `You are <b>${pname(s.slot)}</b>. Waiting for the other player…`)}</p>
        <p class="mut">${T('Lihat layar host untuk mengikuti permainan.', 'Watch the host screen to follow the game.')}</p></div>`, 'dim ctlr', common);
      break;
    case 'char': {
      const ids: string[] = s.ids, c = charById(s.pick), i = Math.max(0, ids.indexOf(s.pick));
      const step = (d: number) => { const id = ids[(i + d + ids.length) % ids.length]; link!.cmd('pick', id); scr = { ...s, pick: id }; inScreen(); };
      show(`${top()}<div class="csel" style="${elVar(c.elem)}">
        <button class="nav" data-a="prev" aria-label="${T('Sebelumnya', 'Previous')}" ${s.ready ? 'disabled' : ''}>‹</button>
        <div class="cport" style="background-image:url(${ctx.portraits[c.id]})"></div>
        <div class="cinfo"><h2>${c.name}</h2><div class="row">${etag(c.elem)}<span class="mut">${tr(c.role)}</span></div><p>${tr(c.style)}</p>
          <div class="thumbs sm">${ids.map(id => { const x = charById(id); return `<button class="th ${id === c.id ? 'sel' : ''}" data-a="pick" data-v="${id}" style="${elVar(x.elem)};background-image:url(${ctx.portraits[id]})" aria-label="${x.name}" ${s.ready ? 'disabled' : ''}>${icon(x.elem)}</button>`; }).join('')}</div>
          <div class="row"><button class="btn ${s.ready ? '' : 'pri'}" data-a="ready">${s.tour ? T('Daftar dengan karakter ini', 'Register with this fighter') : s.ready ? T('Batal siap', 'Unready') : T('Siap', 'Ready')}</button><span class="mut">${s.tour ? T('Pilih karakter untuk turnamen', 'Pick your tournament fighter') : s.other ? T('Lawan sudah siap', 'Opponent is ready') : T('Lawan masih memilih…', 'Opponent is choosing…')}</span></div></div>
        <button class="nav" data-a="next" aria-label="${T('Berikutnya', 'Next')}" ${s.ready ? 'disabled' : ''}>›</button></div>`, 'dim ctlr', {
        ...common, prev: () => step(-1), next: () => step(1),
        pick: id => { link!.cmd('pick', id); scr = { ...s, pick: id }; inScreen(); },
        ready: () => { link!.cmd('ready', !s.ready); scr = { ...s, ready: !s.ready }; inScreen(); },
      });
      break;
    }
    case 'arena': {
      const ids: string[] = s.ids, i = Math.max(0, ids.indexOf(s.pick)), id = ids[i], a = id === 'random' ? null : arenaById(id);
      const step = (d: number) => { const n = ids[(i + d + ids.length) % ids.length]; link!.cmd('pick', n); scr = { ...s, pick: n }; inScreen(); };
      show(`${top()}<div class="csel" style="${elVar(a?.elem || null)}">
        <button class="nav" data-a="prev">‹</button>
        <div class="cport wide" style="${a ? `background-image:url(${ctx.athumbs[a.id]})` : ''}">${a ? '' : '?'}</div>
        <div class="cinfo"><h2>${a ? tr(a.name) : T('Arena Acak', 'Random Arena')}</h2>
          <p>${a ? `${a.elem ? `<b style="color:${hex(ELEMS[a.elem].col)}">+10% ${tr(ELEMS[a.elem].name)}</b> · ` : ''}${tr(a.effect)}` : T('Arena terbuka dipilih acak.', 'A random unlocked arena.')}</p>
          <button class="tog ${s.pure ? 'on' : ''}" data-a="pure"><i></i><span><b>${T('Mode Murni', 'Pure Mode')}</b> <span class="mut">${T('— tanpa efek lingkungan', '— no hazards')}</span></span></button>
          <div class="row"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button><button class="btn pri" data-a="ok">${T('Mulai', 'Fight')}</button></div></div>
        <button class="nav" data-a="next">›</button></div>`, 'dim ctlr', {
        ...common, prev: () => step(-1), next: () => step(1), pure: () => { link!.cmd('pure', !s.pure); scr = { ...s, pure: !s.pure }; inScreen(); },
        ok: () => link!.cmd('ok'), back: () => link!.cmd('back'),
      });
      break;
    }
    case 'wait':
      show(s.w === 'solo'
        ? `${top()}<div class="cwait"><h2>${T('Joystick siap!', 'Gamepad ready!')}</h2><p>${T('Pilih mode & karakter di layar utama. Joystick aktif saat pertarungan dimulai.', 'Pick a mode & fighter on the main screen. The gamepad turns on when the fight starts.')}</p><p class="mut">${T('Bisa dipakai di Pertandingan Cepat, Mode Cerita, dan Latihan.', 'Works in Quick Match, Story Mode and Training.')}</p></div>`
        : `${top()}<div class="cwait"><span class="spin big"></span><h2>${s.w === 'arena' ? T('Pemain 1 memilih arena…', 'Player 1 is choosing the arena…') : T('Tunggu sebentar…', 'Please wait…')}</h2></div>`, 'dim ctlr', common);
      break;
    case 'fight':
      $('.over.cpause')?.remove();
      play(s);
      break;
    case 'pause': {
      play(s);
      $('.over.cpause')?.remove();
      const me = s.by === s.slot || !!s.solo, drop = s.drop >= 0; // solo: joystick selalu boleh melanjutkan
      const o = modal(`<h2>${T('Jeda', 'Paused')}</h2><p>${drop ? T(`${s.dn ? esc(s.dn) : pname(s.drop)} terputus. Menunggu…`, `${s.dn ? esc(s.dn) : pname(s.drop)} disconnected. Waiting…`) : s.by < 0 ? T('Dijeda dari layar host.', 'Paused from the host screen.') : me ? T('Kamu menjeda pertandingan.', 'You paused the match.') : T(`Dijeda oleh ${s.bn ? esc(s.bn) : pname(s.by)}.`, `Paused by ${s.bn ? esc(s.bn) : pname(s.by)}.`)}</p>
        <div class="mbtns">${me && !drop ? `<button class="btn pri" data-a="resume">${T('Lanjutkan', 'Resume')}</button>` : ''}<button class="btn hold" data-a="exit">${T('Keluar (tahan)', 'Leave (hold)')}<i></i></button></div>`, { resume: () => link!.cmd('resume'), exit: () => leave() });
      o.classList.add('cpause');
      break;
    }
    case 'tname': tourName(s); break;
    case 'tlobby': {
      const c = charById(s.pub.ps[s.me].c);
      show(`${top()}<div class="tlob"><div class="cport sm" style="${elVar(c.elem)};background-image:url(${ctx.portraits[c.id]})"></div>
        <div><h2>${esc(s.pub.title)}</h2><p>${T(`Terdaftar sebagai <b>${esc(s.nm)}</b> · ${c.name}`, `Registered as <b>${esc(s.nm)}</b> · ${c.name}`)}</p>
        <p class="mut">${T('Menunggu pembuat memulai turnamen…', 'Waiting for the host to start…')} (${s.pub.ps.length}/${s.pub.max})</p>
        <div class="tnames">${s.pub.ps.map((p: any, i: number) => `<span class="${i === s.me ? 'me' : ''} ${p.on ? '' : 'off'}">${esc(p.n)}</span>`).join('')}</div>
        <button class="btn sm" data-a="rechar">${T('Ganti karakter', 'Change fighter')}</button></div></div>`, 'dim ctlr', { ...common, rechar: () => link!.cmd('rechar') });
      break;
    }
    case 'tbr':
      show(`${top()}${myStatus(s.pub, s.me)}<div class="bwrap">${bracketHtml(s.pub, s.me)}</div>`, 'dim ctlr tbrv', common);
      break;
    case 'tcall': {
      if (lastCall !== s.mid) { lastCall = s.mid; buzz('ult'); sound.confirm(); } // HP bergetar saat dipanggil
      const o = charById(s.oc), ids: string[] = s.ids, me = charById(s.pick);
      show(`${top()}<div class="tcall"><h1>${T('Giliranmu!', 'You\'re up!')}</h1>
        <p>${T('Lawan', 'Opponent')}: <b>${esc(s.opp)}</b> <span class="mut">${o.name}</span></p>
        ${!s.lock && !s.ready ? `<div class="thumbs sm">${ids.map(id => { const x = charById(id); return `<button class="th ${id === me.id ? 'sel' : ''}" data-a="pick" data-v="${id}" style="${elVar(x.elem)};background-image:url(${ctx.portraits[id]})" aria-label="${x.name}">${icon(x.elem)}</button>`; }).join('')}</div>` : `<p class="mut">${T('Karaktermu', 'Your fighter')}: ${me.name}</p>`}
        ${s.ready ? `<p><span class="spin"></span>${T('Siap! Menunggu lawan…', 'Ready! Waiting for the opponent…')}</p>` : `<button class="btn pri big" data-a="go">${T('Siap', 'Ready')}</button>`}
        <p class="mut">${T(`Tekan Siap dalam ${s.left} detik — jika tidak, kalah WO.`, `Press Ready within ${s.left} s — otherwise you lose by walkover.`)}</p></div>`, 'dim ctlr', {
        ...common, go: () => link!.cmd('tready'), pick: id => { link!.cmd('pick', id); scr = { ...s, pick: id }; inScreen(); },
      });
      break;
    }
    case 'result': {
      const w = s.winner, me = s.slot;
      const head = w < 0 ? T('Seri', 'Draw') : w === me ? T('Menang!', 'Victory!') : T('Kalah', 'Defeat');
      show(`${top()}<div class="cwait"><h1 class="res ${w === me ? 'win' : w < 0 ? '' : 'lose'}">${head}</h1><p class="mut">${pname(0)} ${s.score} ${pname(1)}</p>
        ${s.ctl ? `<div class="row" style="flex-wrap:wrap;justify-content:center"><button class="btn pri" data-a="res" data-v="again">Rematch</button><button class="btn sm" data-a="res" data-v="char">${T('Ganti Karakter', 'Change Fighters')}</button><button class="btn sm" data-a="res" data-v="arena">${T('Ganti Arena', 'Change Arena')}</button><button class="btn sm hold" data-a="res" data-v="close">${T('Tutup Ruangan (tahan)', 'Close Room (hold)')}<i></i></button></div>`
          : `<p>${T('Menunggu pilihan host: Rematch, ganti karakter, atau tutup ruangan.', 'Waiting for the host: rematch, change fighters, or close the room.')}</p>`}</div>`, 'dim ctlr', { ...common, res: v => link!.cmd('res', v) });
      break;
    }
  }
  if (same && s.s !== 'fight' && s.s !== 'pause') (ui.firstElementChild as HTMLElement | null)?.classList.add('still'); // pembaruan data: tanpa animasi masuk
}

// ---------- turnamen: isi nama ----------
function tourName(s: any) {
  const j = tjoined();
  if (j && link && j.code === link.code && !s.err && autoName !== link.code + j.name) { autoName = link.code + j.name; link.cmd('name', j.name); }
  const err: Record<string, string> = {
    dup: T('Nama sudah dipakai peserta lain.', 'That name is already taken.'),
    reg: T('Pendaftaran sudah ditutup — hanya peserta terdaftar yang bisa masuk lagi dengan namanya.', 'Registration is closed — only registered players can rejoin with their name.'),
    full: T('Turnamen sudah penuh.', 'The tournament is full.'), empty: T('Isi namamu dulu.', 'Enter your name first.'),
  };
  show(`${top()}<div class="tname"><h2>${esc(s.title)}</h2><p>${s.reg ? T('Isi nama yang akan tampil di bagan (maks. 12 huruf).', 'Enter the name shown on the bracket (max 12 letters).') : T('Turnamen sudah berjalan. Masukkan nama yang kamu pakai saat mendaftar.', 'The tournament is running. Enter the name you registered with.')}</p>
    <input class="tin big" maxlength="12" autocomplete="nickname" value="${esc(savedName())}" aria-label="${T('Nama', 'Name')}">
    ${s.err ? `<p class="warn">${err[s.err] || ''}</p>` : ''}<button class="btn pri" data-a="ok">${T('Lanjut', 'Continue')}</button></div>`, 'dim ctlr', {
    ...common, ok: () => submit(),
  });
  const inp = $('.tname input') as HTMLInputElement;
  const submit = () => { const v = inp.value.trim().slice(0, 12); try { localStorage.setItem(NKEY, v); } catch { /* */ } link?.cmd('name', v); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') submit(); });
}

// ---------- joystick + tombol ----------
function padOn(id: string) {
  padOff(); const c = charById(id || 'aqualis');
  ui.innerHTML = `<div class="cpad" style="${elVar(c.elem)}"><div class="pbar"><b>${meName()}</b><span>${c.name}</span>
    <div class="php"><i></i></div><div class="pen"><i></i></div><span class="wins"></span><span data-csig>${sigIcon(link!.sig)}</span><span class="grow"></span>
    <button class="cpause-b" data-a="pause" aria-label="${T('Jeda', 'Pause')}">II</button></div>
    <p class="watch">${T('Lihat layar host', 'Watch the host screen')}</p></div>`;
  bind(ui.firstElementChild as HTMLElement, { pause: () => link!.cmd('pause') });
  pad = new Controls(ui, c.elem, { keys: KEYMAP.solo }); pad.onPause = () => link!.cmd('pause');
  link!.setReader(() => pad ? pad.read() : noInput());
}
function fb(m: any) {
  if (!pad) return;
  pad.sync({ c1: m.c1, en: m.en, st: m.st });
  const hp = $('.php i'), en = $('.pen i'), w = $('.cpad .wins');
  if (hp) { hp.style.width = Math.max(0, m.hp / m.mh) * 100 + '%'; hp.parentElement!.classList.toggle('low', m.hp / m.mh < .25); }
  if (en) { en.style.width = Math.min(100, m.en) + '%'; en.parentElement!.classList.toggle('full', m.en >= 100); }
  if (w && Array.isArray(m.w)) { const t = `${m.w[link!.slot]}–${m.w[1 - link!.slot]}`; if (w.textContent !== t) w.textContent = t; }
}

// ---------- pengaturan tombol (tersimpan di HP ini) ----------
function layoutModal() {
  const rng = (k: string, v: number, a: number, b: number, st: number) => `<input type="range" data-k="${k}" min="${a}" max="${b}" step="${st}" value="${v}">`;
  const row = (l: string, c: string) => `<div class="srow"><span>${l}</span>${c}</div>`;
  const o = modal(`<h2>${T('Atur Tombol', 'Button Layout')}</h2>
    ${row(T('Ukuran tombol', 'Button size'), rng('size', save.ctrl.size, .75, 1.35, .05))}
    ${row(T('Transparansi', 'Opacity'), rng('opacity', save.ctrl.opacity, .3, 1, .05))}
    ${row(T('Jarak dari tepi', 'Edge offset'), rng('margin', save.ctrl.margin, 0, 3, .25))}
    ${row(T('Tukar sisi (kidal)', 'Swap sides (left-handed)'), `<button class="tog ${save.ctrl.swap ? 'on' : ''}" data-a="swap"><i></i></button>`)}
    ${row(T('Getar haptic', 'Haptics'), `<button class="tog ${save.haptic ? 'on' : ''}" data-a="hap"><i></i></button>`)}
    <div class="mbtns"><button class="btn pri" data-a="ok">${T('Selesai', 'Done')}</button></div>`, {
    swap: (_, el) => { save.ctrl.swap = !save.ctrl.swap; el.classList.toggle('on', save.ctrl.swap); persist(); },
    hap: (_, el) => { save.haptic = !save.haptic; el.classList.toggle('on', save.haptic); persist(); if (save.haptic) buzz('hit'); },
    ok: () => o.remove(),
  });
  o.addEventListener('input', e => { const t = e.target as HTMLInputElement; if (t.dataset.k) { (save.ctrl as any)[t.dataset.k] = +t.value; persist(); } });
  sound.ui();
}
