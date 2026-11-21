// Uji bracket turnamen: setiap jumlah peserta 4–16 harus menghasilkan tepat satu juara dan n−1 laga sungguhan.
import { bracket, champion, nextMatch, settle, TOUR_MIN, TOUR_MAX } from '../src/game/tour';

let fail = 0;
for (let n = TOUR_MIN; n <= TOUR_MAX; n++) {
  const rs = bracket([...Array(n).keys()]);
  let played = 0, m;
  while ((m = nextMatch(rs))) { m.w = Math.random() < .5 ? m.a : m.b; settle(rs); played++; if (played > 64) break; }
  const ch = champion(rs), ok = played === n - 1 && ch >= 0 && ch < n && rs[0].every(x => x.a >= 0);
  if (!ok) { fail++; console.log(`GAGAL n=${n}: laga ${played}, juara ${ch}`); }
}
console.log(fail ? `${fail} gagal` : `semua lolos (${TOUR_MIN}–${TOUR_MAX} peserta)`);
process.exit(fail ? 1 : 0);
