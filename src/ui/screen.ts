// Layar penuh + layar tetap menyala untuk browser HP (aplikasi Android sudah imersif dari MainActivity).
// Browser hanya mengizinkan fullscreen dari sentuhan pengguna, jadi diminta pada ketukan pertama
// dan diminta lagi bila pemain sempat keluar (mis. gestur kembali).
// Wake Lock API hanya jalan di HTTPS; NoSleep memakai video senyap sebagai cadangan di http://IP-lokal.
import NoSleep from 'nosleep.js';
import { Capacitor } from '@capacitor/core';

const d = document as Document & { webkitFullscreenElement?: Element };
const isFull = () => !!(d.fullscreenElement || d.webkitFullscreenElement);
let ns: NoSleep | null = null;

function lockLandscape() { (screen.orientation as any)?.lock?.('landscape').catch(() => { }); }

function gesture() {
  if (!isFull()) {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
      Promise.resolve(p).then(lockLandscape, () => { });
    } catch { /* tidak didukung (mis. iPhone) */ }
  }
  if (!ns) ns = new NoSleep();
  if (!ns.isEnabled) ns.enable().catch(() => { });
}

/** Aktif hanya di browser perangkat sentuh, bukan di aplikasi native atau desktop. */
export function initScreen() {
  if (Capacitor.isNativePlatform() || !matchMedia('(pointer: coarse)').matches) return;
  // Safari iOS mengabaikan user-scalable=no: cubit dua jari tetap men-zoom halaman kecuali gestur ini dicegah
  for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, e => e.preventDefault(), { passive: false });
  addEventListener('touchend', gesture, { capture: true, passive: true });
  addEventListener('click', gesture, true);
  document.addEventListener('fullscreenchange', () => { if (isFull()) lockLandscape(); });
}
