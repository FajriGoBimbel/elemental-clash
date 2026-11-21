// Mesin bagan Turnamen Bareng (CR-002): murni data, tanpa UI/jaringan, sehingga bisa diuji untuk semua 2–16 peserta.
// Input: jumlah peserta, format, seed → struktur pertandingan; hasil dilaporkan lewat report(), bagan diperbarui otomatis.
// Peserta = indeks 0..n-1. BYE (-1) = slot kosong / lolos otomatis.

export type Format = 'se' | 'de' | 'rr' | 'gr';
export const FORMATS: Format[] = ['se', 'de', 'rr', 'gr'];
export const BYE = -1;
export const MIN_P = 2, MAX_P = 16;

type Src = { p: number } | { bye: 1 } | { w: number } | { l: number } | { g: number; r: number };
/** st: W = bagan atas/gugur, L = bagan bawah, F = final besar, R = liga, G = grup, K = gugur setelah grup, P = playoff seri */
export interface BMatch {
  id: number; st: 'W' | 'L' | 'F' | 'R' | 'G' | 'K' | 'P'; rd: number; g?: number; key: number;
  src: [Src, Src]; a: number | null; b: number | null; w: number | null; l: number | null;
  sc: [number, number]; wo?: boolean; auto?: boolean; defer?: boolean; bo1?: boolean;
}
export interface Bracket {
  fmt: Format; n: number; seed: number; order: number[]; size: number; reset: boolean;
  ms: BMatch[]; groups?: number[][]; groupDone?: boolean[]; ranks?: Record<string, number[]>; // ranks: 'rr' / 'g0'.. → urutan akhir
}

/** Format yang tersedia untuk jumlah peserta n (CR-002 Bagian 5). */
export function formatOk(f: Format, n: number) {
  if (n < MIN_P || n > MAX_P) return false;
  if (f === 'de') return n >= 3; // 2 peserta: tidak ada bagan bawah
  return f !== 'gr' || (n >= 6 && n <= 8) || (n >= 12 && n <= 16);
}
const pow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return p; };

/** Jumlah pertandingan yang dimainkan (tanpa bye & playoff) — untuk estimasi durasi dan uji. */
export function matchCount(f: Format, n: number, reset = false) {
  if (f === 'se') return n - 1;
  if (f === 'de') return 2 * n - 2 + (reset ? 1 : 0); // +1 bila final besar diulang (opsional, hanya jika bagan bawah menang)
  if (f === 'rr') return n * (n - 1) / 2;
  const G = n <= 8 ? 2 : 4; return groupSizes(n, G).reduce((s, k) => s + k * (k - 1) / 2, 0) + 2 * G - 1;
}
function groupSizes(n: number, G: number) { return Array.from({ length: G }, (_, i) => Math.floor(n / G) + (i < n % G ? 1 : 0)); }

// ---------- acak dengan seed ----------
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const newSeed = () => (crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000; // 6 digit, mudah dibaca di layar
function shuffle<T>(a: T[], r: () => number) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }

// ---------- pembuatan bagan ----------
export function makeBracket(n: number, fmt: Format, seed: number, reset = true): Bracket {
  if (!formatOk(fmt, n)) throw new Error(`format ${fmt} tidak tersedia untuk ${n} peserta`);
  const order = shuffle(Array.from({ length: n }, (_, i) => i), rng(seed));
  const b: Bracket = { fmt, n, seed, order, size: n, reset, ms: [] };
  const add = (m: Omit<BMatch, 'id' | 'a' | 'b' | 'w' | 'l' | 'sc' | 'key'> & { key?: number }) => {
    const x: BMatch = { key: 0, ...m, id: b.ms.length, a: null, b: null, w: null, l: null, sc: [0, 0] }; b.ms.push(x); return x.id;
  };
  /** Gugur: entries berpasangan (0-1, 2-3, …) untuk babak pertama; mengembalikan id pertandingan per babak. */
  const ko = (entries: Src[], st: 'W' | 'K', base: number) => {
    const rounds: number[][] = []; let cur: Src[] = entries, rd = 1;
    while (cur.length > 1) {
      const ids: number[] = [];
      for (let i = 0; i < cur.length; i += 2) ids.push(add({ st, rd, src: [cur[i], cur[i + 1]], key: base + rd }));
      rounds.push(ids); cur = ids.map(id => ({ w: id })); rd++;
    }
    return rounds;
  };
  if (fmt === 'se' || fmt === 'de') {
    const P = pow2(n), byes = P - n, pairs = P / 2;
    b.size = P;
    // bye disebar merata; tiap bye berpasangan dengan peserta berbeda (tidak pernah bye lawan bye)
    const byePair = new Set(Array.from({ length: byes }, (_, k) => Math.floor(k * pairs / byes)));
    const entries: Src[] = []; let k = 0;
    for (let i = 0; i < pairs; i++) { entries.push({ p: order[k++] }); entries.push(byePair.has(i) ? { bye: 1 } : { p: order[k++] }); }
    const W = ko(entries, 'W', 0);
    if (fmt === 'de') {
      const rW = W.length; let prev: number[] = [], key = 1;
      const L1: number[] = [];
      for (let j = 0; j < W[0].length; j += 2) L1.push(add({ st: 'L', rd: 1, src: [{ l: W[0][j] }, { l: W[0][j + 1] }], key: 1.5 }));
      prev = L1; let lr = 2;
      for (let k2 = 1; k2 < rW; k2++) {
        const drop = k2 % 2 ? [...W[k2]].reverse() : W[k2]; // dibalik agar tidak langsung bertemu lawan yang sama
        prev = prev.map((id, j) => add({ st: 'L', rd: lr, src: [{ w: id }, { l: drop[j] }], key: k2 + 1.5 })); lr++;
        if (k2 < rW - 1) { const nx: number[] = []; for (let j = 0; j < prev.length; j += 2) nx.push(add({ st: 'L', rd: lr, src: [{ w: prev[j] }, { w: prev[j + 1] }], key: k2 + 1.8 })); prev = nx; lr++; }
        key = k2 + 2;
      }
      add({ st: 'F', rd: 1, src: [{ w: W[rW - 1][0] }, { w: prev[0] }], key: key + 1 });
    }
  } else if (fmt === 'rr') {
    roundRobin(order, 'R', undefined, add);
  } else {
    const G = n <= 8 ? 2 : 4;
    b.groups = Array.from({ length: G }, () => [] as number[]);
    order.forEach((p, i) => b.groups![i % G].push(p));
    b.groupDone = b.groups.map(() => false);
    b.groups.forEach((g, gi) => roundRobin(g, 'G', gi, add));
    // juara grup bertemu runner-up grup lain; peserta satu grup baru bisa bertemu di final
    const E = (g: number, r: number): Src => ({ g, r });
    const entries = G === 2 ? [E(0, 0), E(1, 1), E(1, 0), E(0, 1)] : [E(0, 0), E(1, 1), E(2, 0), E(3, 1), E(1, 0), E(0, 1), E(3, 0), E(2, 1)];
    ko(entries, 'K', 100);
  }
  propagate(b);
  return b;
}
function roundRobin(ids: number[], st: 'R' | 'G', g: number | undefined, add: (m: any) => number) {
  const list = [...ids]; if (list.length % 2) list.push(BYE);
  const m = list.length;
  for (let r = 0; r < m - 1; r++) {
    for (let i = 0; i < m / 2; i++) {
      const a = list[i], c = list[m - 1 - i];
      if (a !== BYE && c !== BYE) add({ st, rd: r + 1, g, src: [{ p: a }, { p: c }], key: r + 1 });
    }
    list.splice(1, 0, list.pop()!); // metode lingkaran: peserta pertama tetap, sisanya berputar
  }
}

// ---------- hasil & pembaruan ----------
function val(b: Bracket, s: Src): number | null {
  if ('p' in s) return s.p;
  if ('bye' in s) return BYE;
  if ('w' in s) return b.ms[s.w].w;
  if ('l' in s) return b.ms[s.l].l;
  const rk = b.ranks?.['g' + s.g]; return rk ? rk[s.r] ?? BYE : null;
}
/** Mengisi peserta tiap pertandingan, menyelesaikan bye otomatis, menutup grup/liga, dan final besar ulang. */
export function propagate(b: Bracket) {
  for (let changed = true; changed;) {
    changed = false;
    for (const m of b.ms) {
      if (m.w !== null) continue;
      const a = val(b, m.src[0]), c = val(b, m.src[1]);
      if (a !== m.a || c !== m.b) { m.a = a; m.b = c; changed = true; }
      if (a === null || c === null) continue;
      if (a === BYE || c === BYE) { m.w = a === BYE ? c : a; m.l = BYE; m.auto = true; changed = true; }
    }
    if (b.fmt === 'gr') b.groups!.forEach((g, gi) => {
      if (b.groupDone![gi]) return;
      const r = closeTable(b, 'g' + gi, g, x => x.st === 'G' && x.g === gi || x.st === 'P' && x.g === gi);
      if (r === 'done') b.groupDone![gi] = true; if (r) changed = true;
    });
    if (b.fmt === 'rr' && !b.ranks?.rr && closeTable(b, 'rr', b.order, x => x.st === 'R' || x.st === 'P')) changed = true;
    if (b.fmt === 'de' && b.reset) {
      const fs = b.ms.filter(x => x.st === 'F');
      const f1 = fs[0];
      if (fs.length === 1 && f1.w !== null && !f1.auto && f1.w === f1.b && f1.b !== BYE) { // juara bagan bawah menang: final besar diulang
        b.ms.push({ id: b.ms.length, st: 'F', rd: 2, key: f1.key + 1, src: [{ p: f1.a! }, { p: f1.b! }], a: null, b: null, w: null, l: null, sc: [0, 0] }); changed = true;
      }
    }
  }
}

export interface Row { p: number; main: number; m: number; k: number; rf: number; ra: number; pts: number }
/** Klasemen: poin (menang 3), selisih ronde, pertemuan langsung, lalu playoff (CR-002 Bagian 9). */
export function standings(b: Bracket, ids: number[], filter: (m: BMatch) => boolean): Row[] {
  const rows = new Map(ids.map(p => [p, { p, main: 0, m: 0, k: 0, rf: 0, ra: 0, pts: 0 }]));
  const ms = b.ms.filter(m => filter(m) && m.st !== 'P' && m.w !== null && !m.auto);
  for (const m of ms) {
    for (const [p, i] of [[m.a!, 0], [m.b!, 1]] as const) {
      const r = rows.get(p); if (!r) continue;
      r.main++; r.rf += m.sc[i]; r.ra += m.sc[1 - i];
      if (m.w === p) { r.m++; r.pts += 3; } else r.k++;
    }
  }
  const out = [...rows.values()], seedPos = (p: number) => b.order.indexOf(p);
  const h2h = (grp: number[]) => { const s = new Map(grp.map(p => [p, 0])); for (const m of ms) if (grp.includes(m.a!) && grp.includes(m.b!) && m.w! >= 0) s.set(m.w!, s.get(m.w!)! + 3); return s; };
  const po = playoffOrder(b, filter);
  out.sort((x, y) => y.pts - x.pts || (y.rf - y.ra) - (x.rf - x.ra) || seedPos(x.p) - seedPos(y.p));
  // pertemuan langsung & playoff hanya di antara peserta yang masih sama poin dan selisihnya
  const res: Row[] = [];
  for (let i = 0; i < out.length;) {
    let j = i + 1; while (j < out.length && tie(out[i], out[j])) j++;
    const grp = out.slice(i, j);
    if (grp.length > 1) {
      const h = h2h(grp.map(r => r.p));
      grp.sort((x, y) => h.get(y.p)! - h.get(x.p)! || (po.get(x.p) ?? 99) - (po.get(y.p) ?? 99) || seedPos(x.p) - seedPos(y.p));
    }
    res.push(...grp); i = j;
  }
  return res;
}
const tie = (x: Row, y: Row) => x.pts === y.pts && x.rf - x.ra === y.rf - y.ra;
/** Urutan dari rantai playoff: pemenang terakhir di atas, lalu yang tersingkir paling akhir. */
function playoffOrder(b: Bracket, filter: (m: BMatch) => boolean) {
  const ms = b.ms.filter(m => m.st === 'P' && filter(m) && m.w !== null), o = new Map<number, number>();
  for (let i = ms.length - 1, k = 0; i >= 0; i--) {
    const m = ms[i];
    if (!o.has(m.w!) && m.w! >= 0) o.set(m.w!, k++);
    if (!o.has(m.l!) && m.l! >= 0) o.set(m.l!, k++);
  }
  return o;
}
/** Setelah semua pertandingan liga/grup selesai: tetapkan urutan, atau buat playoff untuk seri yang menentukan. */
function closeTable(b: Bracket, key: string, ids: number[], filter: (m: BMatch) => boolean): 'done' | 'playoff' | false {
  const ms = b.ms.filter(filter);
  if (ms.some(m => m.w === null)) return false;
  const rows = standings(b, ids, filter);
  // posisi penting: juara (liga) atau batas lolos & juara grup (grup lalu gugur)
  const cut = key === 'rr' ? [0] : [0, 1];
  const playedP = new Set(ms.filter(m => m.st === 'P').flatMap(m => [m.a!, m.b!]));
  for (const c of cut) {
    const grp = tiedAt(b, rows, c, filter);
    if (grp.length > 1 && !grp.every(p => playedP.has(p))) {
      // rantai playoff 1 ronde: t0 lawan t1, pemenangnya lawan t2, dst.
      let prev = -1, g = key === 'rr' ? undefined : +key.slice(1);
      for (let i = 1; i < grp.length; i++) {
        const src: [Src, Src] = [prev < 0 ? { p: grp[0] } : { w: prev }, { p: grp[i] }];
        prev = b.ms.push({ id: b.ms.length, st: 'P', rd: i, g, key: (ms[ms.length - 1]?.key ?? 0) + .5, src, a: null, b: null, w: null, l: null, sc: [0, 0], bo1: true }) - 1;
      }
      return 'playoff';
    }
  }
  (b.ranks ??= {})[key] = rows.map(r => r.p);
  return 'done';
}
/** Peserta yang benar-benar seri (poin, selisih, pertemuan langsung) di sekitar posisi c. */
function tiedAt(b: Bracket, rows: Row[], c: number, filter: (m: BMatch) => boolean) {
  if (c + 1 >= rows.length) return [];
  const same = rows.filter(r => tie(r, rows[c]));
  if (same.length < 2) return [];
  const ms = b.ms.filter(m => filter(m) && m.st !== 'P' && m.w !== null && !m.auto), ids = same.map(r => r.p);
  const h = new Map(ids.map(p => [p, 0])); for (const m of ms) if (ids.includes(m.a!) && ids.includes(m.b!) && m.w! >= 0) h.set(m.w!, h.get(m.w!)! + 3);
  const hv = h.get(rows[c].p)!, grp = ids.filter(p => h.get(p) === hv);
  const at = rows.findIndex(r => r.p === grp[0]), end = at + grp.length - 1;
  // hanya perlu playoff bila seri itu menyentuh posisi c dan c+1 (mis. juara, atau lolos/tidak lolos)
  return grp.length > 1 && at <= c && end >= c + 1 ? grp : [];
}

/** Laporkan hasil. winner = indeks peserta, atau BYE bila keduanya kalah WO. sc = ronde dimenangkan [a, b]. */
export function report(b: Bracket, id: number, winner: number, sc: [number, number], wo = false) {
  const m = b.ms[id]; if (m.w !== null || m.a === null || m.b === null) throw new Error('pertandingan tidak bisa dilaporkan');
  m.w = winner; m.l = winner === BYE ? BYE : winner === m.a ? m.b : m.a; m.sc = sc; if (wo) m.wo = true;
  propagate(b);
}

/** Pertandingan yang siap dimainkan, urut antrean (yang ditunda di belakang). */
export function queue(b: Bracket) {
  return b.ms.filter(m => m.w === null && m.a !== null && m.b !== null && m.a >= 0 && m.b >= 0)
    .sort((x, y) => (+!!x.defer - +!!y.defer) || x.key - y.key || x.id - y.id);
}
export const nextMatch = (b: Bracket) => queue(b)[0] ?? null;

/** Podium: [juara, runner-up, juara 3 (bisa dua pada gugur tanpa perebutan juara 3)]; null bila belum selesai. */
export function podium(b: Bracket): [number, number, number[]] | null {
  const ok = (p: number | null | undefined) => p !== null && p !== undefined && p >= 0;
  if (b.fmt === 'rr') { const r = b.ranks?.rr; return r ? [r[0], r[1], [r[2]].filter(ok)] : null; }
  if (b.fmt === 'de') {
    const fs = b.ms.filter(m => m.st === 'F'), f = fs[fs.length - 1];
    if (!f || f.w === null || (b.reset && fs.length === 1 && f.w === f.b && !f.auto && f.b !== BYE)) return null;
    const lf = b.ms.filter(m => m.st === 'L').pop();
    return [f.w, f.l!, [lf?.l].filter(ok) as number[]];
  }
  const st = b.fmt === 'se' ? 'W' : 'K', ko = b.ms.filter(m => m.st === st), fin = ko[ko.length - 1];
  if (!fin || fin.w === null) return null;
  const semis = ko.filter(m => m.rd === fin.rd - 1);
  return [fin.w, fin.l!, semis.map(m => m.l).filter(ok) as number[]];
}
export const done = (b: Bracket) => podium(b) !== null;

/** Status peserta untuk layar HP: 'in' masih bertanding, 'out' tersingkir, 'champ' juara; plus pertandingan berikutnya & antreannya. */
export function status(b: Bracket, p: number): { st: 'in' | 'out' | 'champ'; next: BMatch | null; pos: number } {
  const pd = podium(b);
  if (pd) return { st: pd[0] === p ? 'champ' : 'out', next: null, pos: -1 };
  const lost = b.ms.filter(m => m.l === p && m.st !== 'P' && m.st !== 'R' && m.st !== 'G').length;
  let out = false;
  if (b.fmt === 'se') out = lost >= 1;
  else if (b.fmt === 'de') out = lost >= 2;
  else if (b.fmt === 'gr') out = lost >= 1 || b.groups!.some((g, gi) => g.includes(p) && !!b.ranks?.['g' + gi] && b.ranks['g' + gi].indexOf(p) >= 2);
  const q = queue(b), i = q.findIndex(m => m.a === p || m.b === p);
  return { st: out ? 'out' : 'in', next: i >= 0 ? q[i] : null, pos: i };
}
