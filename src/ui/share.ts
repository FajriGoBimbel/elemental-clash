// Undangan ruangan: link `?join=KODE` + QR code. Membuka link langsung masuk sebagai kontroler / Pemain 2 / joystick.
// Hanya untuk versi web (dev server atau mis. Vercel); aplikasi Android tidak punya alamat web yang bisa dibuka HP lain.
import qrcode from 'qrcode-generator';
import { Capacitor } from '@capacitor/core';
import { CODE_ABC } from '../net/room';
import { esc, modal, toast } from './dom';
import { T } from '../save';

export const validCode = (c: string) => c.length === 6 && [...c].every(ch => CODE_ABC.includes(ch));

/** Alamat dasar link undangan: env VITE_SHARE_URL bila diisi, selain itu alamat halaman ini. */
function shareBase(): URL | null {
  const env = (import.meta.env.VITE_SHARE_URL || '').trim();
  if (env) { try { const u = new URL(env); if (/^https?:$/.test(u.protocol)) return u; } catch { /* nilai env tidak valid: pakai alamat halaman */ } }
  return /^https?:$/.test(location.protocol) ? new URL(location.pathname, location.origin) : null;
}

/** Link undangan untuk kode ini, atau null bila tidak ada alamat web yang bisa dibuka perangkat lain. */
export function joinLink(code: string): string | null {
  // aplikasi Android memakai UDP/TCP lokal, versi web memakai WebRTC: link web tidak bisa masuk ke ruangan APK
  if (Capacitor.isNativePlatform()) return null;
  const u = shareBase(); if (!u) return null;
  u.search = ''; u.hash = ''; u.searchParams.set('join', code);
  const lan = new URLSearchParams(location.search).get('lan'); if (lan) u.searchParams.set('lan', lan); // mode uji ikut terbawa
  return u.toString();
}

/** Kode dari link undangan di alamat halaman ini (lalu dihapus dari alamat agar reload tidak bergabung ulang). */
export function takeJoinCode(): string {
  const u = new URL(location.href), c = (u.searchParams.get('join') || '').toUpperCase();
  if (u.searchParams.has('join')) { u.searchParams.delete('join'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
  return validCode(c) ? c : '';
}

async function copy(text: string, field: HTMLInputElement) {
  try { await navigator.clipboard.writeText(text); }
  catch { field.select(); document.execCommand('copy'); } // http://IP-lokal: Clipboard API tidak tersedia
  toast(T('Link disalin', 'Link copied'));
}

export type ShareAs = 'ctl' | 'p2' | 'pad';
export function shareModal(code: string, as: ShareAs) {
  const url = joinLink(code); if (!url) return;
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  const what = { ctl: T('jadi kontroler', 'join as a controller'), p2: T('bergabung sebagai Pemain 2', 'join as Player 2'), pad: T('jadi joystick', 'become the gamepad') }[as];
  const local = /^(localhost|127\.|\[::1\])/.test(new URL(url).hostname);
  const canShare = typeof navigator.share === 'function';
  const o = modal(`<h2>${T('Bagikan Undangan', 'Share Invite')}</h2>
    <div class="share"><div class="qr" aria-label="QR">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>
      <div class="sh-r"><p>${T(`Pindai QR dengan kamera HP atau buka link ini untuk langsung ${what} — kode <b>${code}</b> terisi otomatis.`, `Scan the QR with a phone camera or open this link to ${what} — code <b>${code}</b> is filled in automatically.`)}</p>
        <input class="sh-url" readonly value="${esc(url)}" aria-label="Link">
        ${local ? `<p class="warn">${T('Alamat ini <b>localhost</b> — HP lain tidak bisa membukanya. Isi <code>VITE_SHARE_URL</code> di env (mis. http://192.168.x.x:5173) atau buka game lewat alamat jaringan.', 'This is a <b>localhost</b> address — other phones cannot open it. Set <code>VITE_SHARE_URL</code> in the env (e.g. http://192.168.x.x:5173) or open the game via its network address.')}</p>` : ''}
        <div class="mbtns"><button class="btn pri" data-a="copy">${T('Salin link', 'Copy link')}</button>${canShare ? `<button class="btn" data-a="share">${T('Bagikan…', 'Share…')}</button>` : ''}<button class="btn" data-a="close">${T('Tutup', 'Close')}</button></div></div></div>`, {
    copy: () => copy(url, o.querySelector('.sh-url')!),
    share: () => navigator.share({ title: 'Elemental Clash', text: T(`Ayo main Elemental Clash! Kode ruangan ${code}`, `Let's play Elemental Clash! Room code ${code}`), url }).catch(() => { }),
    close: () => o.remove(),
  }, 'sharem');
  return o;
}
