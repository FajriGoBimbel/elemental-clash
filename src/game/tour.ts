// Bracket turnamen sistem gugur. Peserta = indeks 0..n-1; -1 = slot kosong (bye di babak 1, belum diketahui di babak lanjut).
export interface TMatch { a: number; b: number; w: number }
export type Rounds = TMatch[][];
export const TOUR_MIN = 4, TOUR_MAX = 16;

/** Membuat bracket dari urutan peserta (sudah diacak pemanggil). Bye diberikan ke peserta awal urutan. */
export function bracket(ids: number[]): Rounds {
  const n = ids.length; if (n < 2) throw new Error('turnamen butuh minimal 2 peserta');
  let size = 1; while (size < n) size *= 2;
  const half = size / 2, rs: Rounds = [];
  rs.push(Array.from({ length: half }, (_, i) => ({ a: ids[i], b: half + i < n ? ids[half + i] : -1, w: -1 })));
  for (let k = half / 2; k >= 1; k /= 2) rs.push(Array.from({ length: k }, () => ({ a: -1, b: -1, w: -1 })));
  settle(rs); return rs;
}

/** Menyelesaikan bye otomatis lalu meneruskan pemenang ke babak berikutnya. */
export function settle(rs: Rounds) {
  rs.forEach((r, ri) => r.forEach((m, j) => {
    if (ri === 0 && m.w < 0 && m.b < 0) m.w = m.a;
    if (m.w >= 0 && ri + 1 < rs.length) { const nx = rs[ri + 1][j >> 1]; if (j % 2) nx.b = m.w; else nx.a = m.w; }
  }));
}

/** Laga berikutnya yang siap dimainkan (kedua peserta sudah diketahui), urut per babak. */
export const nextMatch = (rs: Rounds) => rs.flat().find(m => m.a >= 0 && m.b >= 0 && m.w < 0) ?? null;
export const champion = (rs: Rounds) => rs[rs.length - 1][0].w;
