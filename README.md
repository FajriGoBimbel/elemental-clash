# Elemental Clash

Game fighting 1 lawan 1 berbasis elemen, offline melawan bot — implementasi MVP dari `PRD — Elemental Clash.md`.

Stack: **Three.js + TypeScript + Vite**, dikemas sebagai **PWA offline** dan dibungkus **Capacitor** untuk Android/iOS.
Semua karakter, arena, efek, dan audio dibuat prosedural lewat kode (tanpa berkas aset), sehingga ukuran build ±1,2 MB.

## Menjalankan

```bash
npm install
npm run dev        # buka http://localhost:5173 (di HP: pakai alamat Network, posisi landscape)
npm run build      # build produksi ke dist/
npm run preview    # menjalankan hasil build
npm run sim -- 20  # simulasi bot lawan bot untuk memeriksa keseimbangan
```

Kontrol desktop: `A/D` gerak · `W` lompat · `S` menunduk · `J` serangan ringan · `H` serangan berat · `K/L` jurus · `I`/`Spasi` tangkis · `O`/`Shift` dash · `U` pamungkas · `Esc` jeda.
Tambahkan `?demo` di URL agar karakter pemain dimainkan bot (mode tontonan), `?skip` untuk melewati layar ketuk.

## Main Bareng (multiplayer lokal, CR-001)

Menu **Main Bareng** punya tiga konfigurasi: **A** satu layar (dua set kontrol sentuh kiri/kanan; keyboard P1 `WASD J H K L I O U`,
P2 panah + `, M . / ' ; Shift kanan` atau numpad), **B** layar + 1 HP kontroler, **C** layar + 2 HP kontroler.
HP kontroler memilih **Gabung sebagai Kontroler**, memasukkan kode 6 karakter dari lobi, lalu menunggu izin host.

- Host satu-satunya penentu hasil; kontroler hanya mengirim input (UDP 60×/dtk, 3 frame terakhir ikut dikirim).
- Penemuan host lewat siaran UDP di port 47820, sesi lewat TCP 47821, hanya di jaringan lokal (Wi-Fi sama atau hotspot).
- Putus koneksi: pertandingan dijeda, kontroler menyambung ulang otomatis ≤ 15 dtk; lewat itu host memilih lanjut lawan bot atau akhiri.
- Halaman kontroler sempat dimuat ulang (mis. reload server dev): sesi tersimpan per tab, kontroler langsung menyambung lagi tanpa kode/izin.
- Di browser HP, ketukan pertama membuka layar penuh + kunci landscape, dan layar dijaga tetap menyala (NoSleep: Wake Lock di HTTPS, video senyap di `http://`).
- Koin Main Bareng: +15 per pertandingan untuk profil host, maksimal 10 pertandingan per hari.
- **D — 2 Layar** (mis. desktop vs desktop): host = Pemain 1; perangkat kedua memilih *Gabung dengan Kode* (kode bisa diketik
  dengan keyboard) dan menjadi Pemain 2 dengan layar sendiri. Host tetap satu-satunya yang menghitung; perangkat kedua
  mengirim input dan menerima snapshot keadaan ±60×/dtk + event (`src/net/sync.ts`) lalu merender arena, HUD, dan suara sendiri.
  Uji: `npm run test:mp2` (tambah `LAN=web` untuk jalur WebRTC).
- **Joystick HP untuk mode solo:** tombol *Joystick HP* di menu utama membuka ruangan 1 slot. HP bergabung lewat
  *Main Bareng → Gabung dengan Kode* dan menjadi joystick Pemain 1 di Pertandingan Cepat, Cerita, dan Latihan
  (keyboard/sentuh di layar tetap aktif bersamaan). HP putus → pertandingan dijeda. Uji: `npm run test:pad`.
- **Link undangan:** tombol *Bagikan link / QR* di lobi dan di modal Joystick HP menampilkan QR + link `…/?join=KODE`
  (salin / bagikan lewat menu bawaan HP). Membuka link langsung bergabung dengan kode itu tanpa mengetik; parameter
  dihapus dari alamat setelah dipakai. Hanya versi web (APK tidak punya alamat yang bisa dibuka HP lain). Uji: `npm run test:share`.
  Alamat dasar link diatur lewat env **`VITE_SHARE_URL`** (lihat `.env.example`; di Vercel: Project Settings → Environment
  Variables, lalu redeploy). Kosong = alamat halaman yang sedang dibuka.
- **Versi web (mis. Vercel):** browser tidak bisa membuka UDP/TCP lokal, jadi dipakai WebRTC DataChannel lewat PeerJS
  (`src/net/transport.ts` → `PeerBus`). Internet hanya untuk perkenalan awal di server sinyal (default: cloud publik PeerJS),
  data permainan mengalir langsung antar-perangkat. Server sinyal sendiri: set `VITE_PEER_HOST`, `VITE_PEER_PORT`,
  `VITE_PEER_PATH`, `VITE_PEER_SECURE` di environment build Vercel. Main tanpa internet sama sekali tetap lewat APK Android.
- Uji transport web lokal: jalankan PeerServer (`npx peer --port 9000`), `VITE_PEER_HOST=localhost VITE_PEER_PORT=9000 VITE_PEER_SECURE=false npm run dev`,
  lalu `LAN=web npm run test:mp`.

Jaringan lokal butuh aplikasi Android (plugin native `LanPlugin`/`LanCore` di `android/`). Untuk uji tanpa APK:
`npm run dev`, lalu buka alamat Network di beberapa HP/tab — paket diteruskan lewat server dev (hanya mode dev).

```bash
npm run test:net                                   # uji protokol: pairing, izin, penuh, 5% paket hilang, putus-sambung
npm run dev & URL=http://localhost:5173 npm run test:mp -- <folder-screenshot>   # uji 3 tab: host + 2 kontroler
```

## Android

Proyek Android ada di `android/` (landscape, layar penuh imersif, minSdk 26 = Android 8).
JDK 21 (`~/.local/opt`) dan Android command-line tools (`~/Android/Sdk`) sudah terpasang; paket SDK belum,
karena lisensinya harus Anda setujui sendiri:

```bash
bash scripts/android-build.sh   # tampilkan lisensi → pasang SDK → build → APK debug
```

iOS: jalankan `npm i @capacitor/ios && npx cap add ios` di macOS dengan Xcode, lalu kunci orientasi ke landscape.

## Struktur

| Lokasi | Isi |
| --- | --- |
| `src/data.ts` | Elemen, 6 karakter + bos, jurus, 7 arena, 4 tingkat bot, tangga Mode Cerita |
| `src/game/` | Logika murni tanpa grafis: `fighter.ts` (state petarung), `match.ts` (hit, ronde, efek arena), `bot.ts` (AI) |
| `src/gfx/` | `character.ts` (model + rangka + animasi), `arenas.ts`, `fx.ts` (partikel), `fightview.ts` (kamera, efek jurus), `stage.ts` (renderer, kualitas) |
| `src/ui/` | HUD, kontrol sentuh/keyboard, ikon elemen, `controller.ts` (mode HP kontroler) |
| `src/net/` | `transport.ts` (soket native / relay dev / antar-tab), `room.ts` (protokol host & kontroler) |
| `src/main.ts` | Alur layar dan loop game |
| `src/save.ts`, `src/audio.ts` | Data simpanan lokal, audio sintetis |
| `scripts/` | `sim.ts` (simulasi keseimbangan), `shot.mjs` (uji visual headless), `android-build.sh` |

## Menyetel keseimbangan

Angka karakter dan jurus ada di `src/data.ts`. Setelah mengubahnya, jalankan `npm run sim -- 30` dan lihat tabel
menang per pasangan, urutan tingkat bot, serta durasi per arena.

## Cheat Code

┌────────────────┬────────────────────────────┐
│      Kode      │            Efek            │
├────────────────┼────────────────────────────┤
│ rich-guy       │ +1000 koin                 │
├────────────────┼────────────────────────────┤
│ unlimited-ulti │ Pamungkas selalu siap      │
├────────────────┼────────────────────────────┤
│ unlimited-dash │ Dash tidak memakai stamina │
├────────────────┼────────────────────────────┤
│ unlimited-hp   │ HP tidak pernah berkurang  │
└────────────────┴────────────────────────────┘