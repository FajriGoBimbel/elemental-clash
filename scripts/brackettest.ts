// Unit test mesin bagan Turnamen Bareng (CR-002): semua format × semua jumlah peserta 4–16, banyak seed.
// Pakai: npx tsx scripts/brackettest.ts
import { BYE, FORMATS, Format, formatOk, makeBracket, matchCount, nextMatch, podium, report, rng, standings, status, Bracket } from '../src/game/bracket';

let ok = 0, bad = 0; const fails: string[] = [];
const check = (c: boolean, m: string) => { if (c) ok++; else { bad++; if (fails.length < 30) fails.push(m); } };

/** Mainkan turnamen sampai selesai dengan hasil acak (bisa WO sesekali). */
function run(b: Bracket, seed: number, opt: { wo?: boolean; ties?: boolean } = {}) {
  const r = rng(seed); let guard = 0;
  const played: { a: number; b: number; st: string }[] = [];
  for (let m = nextMatch(b); m; m = nextMatch(b)) {
    if (++guard > 500) throw new Error('macet');
    const aw = opt.ties ? m.a! < m.b! : r() < .5; // ties: peserta indeks kecil selalu menang → mudah memicu seri melingkar? (tidak) — uji umum
    const need = m.bo1 ? 1 : 2, lose = Math.floor(r() * need);
    played.push({ a: m.a!, b: m.b!, st: m.st });
    if (opt.wo && r() < .08) report(b, m.id, aw ? m.a! : m.b!, aw ? [need, 0] : [0, need], true);
    else report(b, m.id, aw ? m.a! : m.b!, aw ? [need, lose] : [lose, need]);
  }
  return played;
}

for (const f of FORMATS) for (let n = 4; n <= 16; n++) {
  if (!formatOk(f, n)) { check(f === 'gr' && (n < 6 || (n > 8 && n < 12)), `${f}/${n}: ketersediaan format salah`); continue; }
  for (let s = 1; s <= 25; s++) {
    const seed = 1000 + s * 7919 + n;
    const b = makeBracket(n, f, seed, s % 2 === 0), tag = `${f}/${n}/seed${seed}`;
    // undian: semua peserta tepat sekali
    check([...b.order].sort((x, y) => x - y).join() === Array.from({ length: n }, (_, i) => i).join(), tag + ': undian tidak lengkap');
    // sama seed → sama; seed lain → (hampir selalu) beda
    check(JSON.stringify(makeBracket(n, f, seed, s % 2 === 0).order) === JSON.stringify(b.order), tag + ': seed sama menghasilkan susunan berbeda');
    if (f === 'se' || f === 'de') {
      const P = b.size, byes = P - n, r1 = b.ms.filter(m => m.st === 'W' && m.rd === 1);
      check(P >= n && P / 2 < n, tag + ': ukuran bagan bukan pangkat 2 terdekat');
      const byeM = r1.filter(m => m.src.some(x => 'bye' in x));
      check(byeM.length === byes, tag + `: jumlah bye ${byeM.length} ≠ ${byes}`);
      check(r1.every(m => !m.src.every(x => 'bye' in x)), tag + ': bye lawan bye');
      check(new Set(byeM.map(m => m.w)).size === byes && byeM.every(m => m.w! >= 0), tag + ': bye tidak ke peserta berbeda');
    }
    if (f === 'gr') {
      const G = b.groups!.length; check(G === (n <= 8 ? 2 : 4), tag + ': jumlah grup');
      check(b.groups!.every(g => g.length === 3 || g.length === 4), tag + ': ukuran grup bukan 3–4');
    }
    const played = run(b, seed, { wo: s % 5 === 0 });
    const pd = podium(b);
    check(!!pd && pd[0] >= 0 && pd[1] >= 0 && pd[0] !== pd[1], tag + ': tidak ada juara/runner-up');
    const main = played.filter(p => p.st !== 'P').length, exp = matchCount(f, n, false);
    const reset = b.ms.filter(m => m.st === 'F').length === 2;
    check(main === exp + (reset ? 1 : 0), tag + `: jumlah pertandingan ${main} ≠ ${exp}${reset ? '+1' : ''}`);
    check(played.every(p => p.a >= 0 && p.b >= 0 && p.a !== p.b), tag + ': pertandingan dengan peserta tidak sah');
    if (f === 'rr' || f === 'gr') {
      // tiap pasangan bertemu sekali di liga/grup; tiap peserta maksimal sekali per ronde
      const pairs = played.filter(p => p.st === 'R' || p.st === 'G').map(p => [p.a, p.b].sort((x, y) => x - y).join('-'));
      check(new Set(pairs).size === pairs.length, tag + ': pasangan liga bertemu lebih dari sekali');
      const perRound = new Map<string, number>();
      for (const m of b.ms.filter(m => m.st === 'R' || m.st === 'G')) for (const p of [m.a, m.b]) { const k = `${m.g ?? ''}:${m.rd}:${p}`; perRound.set(k, (perRound.get(k) ?? 0) + 1); }
      check([...perRound.values()].every(v => v === 1), tag + ': peserta bermain >1× dalam satu ronde');
    }
    if (f === 'gr') {
      // juara grup selalu bertemu runner-up grup lain di babak gugur pertama
      const k1 = b.ms.filter(m => m.st === 'K' && m.rd === 1), gOf = (p: number) => b.groups!.findIndex(g => g.includes(p));
      check(k1.every(m => gOf(m.a!) !== gOf(m.b!)), tag + ': satu grup bertemu di babak gugur pertama');
      if (b.groups!.length === 2) { const sf = k1; check(sf.every(m => gOf(m.a!) !== gOf(m.b!)), tag + ': semifinal satu grup'); }
    }
    if (f === 'se') check(status(b, pd![1]).st === 'out' && status(b, pd![0]).st === 'champ', tag + ': status juara/tersingkir');
    if (f === 'de') {
      // tidak ada peserta yang masih bermain setelah kalah dua kali
      const losses = new Map<number, number>();
      for (const m of b.ms.filter(m => m.w !== null && !m.auto && m.l! >= 0).sort((x, y) => x.id - y.id)) {
        for (const p of [m.a!, m.b!]) check((losses.get(p) ?? 0) < 2, tag + `: peserta ${p} bermain setelah kalah 2×`);
        losses.set(m.l!, (losses.get(m.l!) ?? 0) + 1);
      }
    }
  }
}

// undi ulang → seed berbeda menghasilkan susunan berbeda (AC-06)
{ const a = makeBracket(8, 'se', 111111), b = makeBracket(8, 'se', 222222); check(JSON.stringify(a.order) !== JSON.stringify(b.order), 'undi ulang: susunan sama'); }

// urutan penentu klasemen: poin → selisih ronde → pertemuan langsung → playoff (AC-08)
{
  // 4 peserta, buat seri 3 arah sempurna di puncak: 0>1, 1>2, 2>0 semua 2-1; semua menang 2-0 atas 3
  const b = makeBracket(4, 'rr', 5);
  for (let m = nextMatch(b); m; m = nextMatch(b)) {
    if (m.st === 'P') { report(b, m.id, Math.min(m.a!, m.b!), [1, 0]); continue; }
    const beats = (x: number, y: number) => (x === 0 && y === 1) || (x === 1 && y === 2) || (x === 2 && y === 0) || y === 3;
    const w = beats(m.a!, m.b!) ? m.a! : m.b!; report(b, m.id, w, w === m.a ? [2, w === 3 || m.b === 3 ? 0 : 1] : [m.a === 3 ? 0 : 1, 2]);
  }
  check(b.ms.some(m => m.st === 'P'), 'seri melingkar di puncak memicu playoff');
  check(podium(b)?.[0] === 0, 'pemenang rantai playoff jadi juara: ' + podium(b)?.[0]);
  // selisih ronde memisahkan poin yang sama
  const c = makeBracket(4, 'rr', 9);
  for (let m = nextMatch(c); m; m = nextMatch(c)) {
    const w = m.a! < m.b! ? m.a! : m.b!; const big = m.a === 0 || m.b === 0; report(c, m.id, w, w === m.a ? [2, big ? 0 : 1] : [big ? 0 : 1, 2]);
  }
  const rows = standings(c, c.order, m => m.st === 'R');
  check(rows.map(r => r.p).join() === '0,1,2,3' && rows[0].pts === 9, 'klasemen poin: ' + rows.map(r => `${r.p}:${r.pts}`).join(' '));
  check(!c.ms.some(m => m.st === 'P'), 'tanpa seri: tidak ada playoff');
}
// keduanya WO di gugur: keduanya tersingkir, lawan berikutnya lolos
{
  const b = makeBracket(4, 'se', 77); const m = nextMatch(b)!; report(b, m.id, BYE, [0, 0], true);
  const m2 = nextMatch(b)!; report(b, m2.id, m2.a!, [2, 0]);
  check(podium(b)?.[0] === m2.a, 'WO ganda: lawan di final lolos otomatis');
}

console.log(fails.join('\n'));
console.log(`\n${ok} lolos, ${bad} gagal`); process.exit(bad ? 1 : 0);
