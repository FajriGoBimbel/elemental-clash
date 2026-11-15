// Simulasi bot lawan bot tanpa grafis untuk memeriksa keseimbangan elemen dan tingkat bot.
// Pakai: npm run sim -- [jumlah pertandingan per pasangan]
import { CHARS, BOSS, BOT_LEVELS, arenaById, ARENAS } from '../src/data';
import { Match } from '../src/game/match';
import { Bot } from '../src/game/bot';

const N = +(process.argv[2] || 20), DT = 1 / 60;
function play(a: any, b: any, la: number, lb: number, arena = 'dojo', boss = false) {
  const m = new Match({ p1: a, p2: b, arena: arenaById(arena), pure: false });
  const b0 = new Bot(BOT_LEVELS[la]), b1 = new Bot(BOT_LEVELS[lb], boss);
  let steps = 0;
  while (m.phase !== 'over' && steps++ < 60 * 400) {
    m.step(DT, b0.update(DT, m.f[0], m.f[1], m), b1.update(DT, m.f[1], m.f[0], m)); m.events.length = 0;
  }
  return { w: m.phase === 'over' ? m.winner : -1, t: steps * DT };
}

console.log(`== Karakter vs karakter (Mahir vs Mahir, Dojo, ${N} pertandingan/pasangan) ==`);
const tot: Record<string, [number, number]> = {};
let dur = 0, games = 0, stuck = 0;
for (const a of CHARS) {
  let row = a.name.padEnd(9);
  for (const b of CHARS) {
    if (a === b) { row += '   -- '; continue; }
    let w = 0;
    for (let i = 0; i < N; i++) { const r = play(a, b, 2, 2); if (r.w === 0) w++; if (r.w < 0) stuck++; dur += r.t; games++; }
    (tot[a.id] ||= [0, 0])[0] += w; tot[a.id][1] += N; (tot[b.id] ||= [0, 0])[0] += N - w; tot[b.id][1] += N;
    row += (' ' + Math.round(100 * w / N) + '%').padStart(6);
  }
  console.log(row);
}
console.log('Rata-rata menang:', Object.entries(tot).map(([k, v]) => `${k} ${Math.round(100 * v[0] / v[1])}%`).join(' | '));
console.log(`Durasi rata-rata ${(dur / games).toFixed(1)} dtk, macet: ${stuck}`);

console.log('\n== Tingkat bot (baris vs kolom, karakter acak) ==');
for (let la = 0; la < 4; la++) {
  let row = BOT_LEVELS[la].id.padEnd(9);
  for (let lb = 0; lb < 4; lb++) {
    let w = 0; const n = N * 3;
    for (let i = 0; i < n; i++) { const a = CHARS[i % 6], b = CHARS[(i * 5 + 1) % 6]; if (play(a, b, la, lb).w === 0) w++; }
    row += (' ' + Math.round(100 * w / n) + '%').padStart(6);
  }
  console.log(row);
}
console.log('\n== Arena (Mahir vs Mahir, semua efek aktif) ==');
for (const ar of ARENAS) {
  let d = 0, s = 0; const n = N * 2;
  for (let i = 0; i < n; i++) { const r = play(CHARS[i % 6], CHARS[(i + 2) % 6], 2, 2, ar.id); d += r.t; if (r.w < 0) s++; }
  console.log(ar.id.padEnd(8), `durasi ${(d / n).toFixed(1)} dtk, macet ${s}`);
}
let bw = 0; for (let i = 0; i < N * 3; i++) if (play(CHARS[i % 6], BOSS, 3, 2, 'magma', true).w === 1) bw++;
console.log(`\nBos Omnis menang melawan bot Master: ${Math.round(100 * bw / (N * 3))}%`);
