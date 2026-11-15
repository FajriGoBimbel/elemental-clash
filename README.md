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

Kontrol desktop: `A/D` gerak · `W` lompat · `S` menunduk · `J` serang · `K/L` jurus · `I`/`Spasi` tangkis · `O`/`Shift` dash · `U` pamungkas · `Esc` jeda.
Tambahkan `?demo` di URL agar karakter pemain dimainkan bot (mode tontonan), `?skip` untuk melewati layar ketuk.

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
| `src/ui/` | HUD, kontrol sentuh/keyboard, ikon elemen |
| `src/main.ts` | Alur layar dan loop game |
| `src/save.ts`, `src/audio.ts` | Data simpanan lokal, audio sintetis |
| `scripts/` | `sim.ts` (simulasi keseimbangan), `shot.mjs` (uji visual headless), `android-build.sh` |

## Menyetel keseimbangan

Angka karakter dan jurus ada di `src/data.ts`. Setelah mengubahnya, jalankan `npm run sim -- 30` dan lihat tabel
menang per pasangan, urutan tingkat bot, serta durasi per arena.
