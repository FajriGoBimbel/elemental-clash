// Data game: elemen, karakter, jurus, arena, tingkat bot, mode cerita.
export type L = [string, string]; // [Indonesia, English]
export type Elem = 'air' | 'api' | 'batu' | 'angin' | 'petir' | 'tumbuhan';

export const ELEM_ORDER: Elem[] = ['air', 'api', 'batu', 'angin', 'petir', 'tumbuhan'];

export const ELEMS: Record<Elem, { name: L; col: number; acc: number; strong: Elem[]; weak: Elem[] }> = {
  air: { name: ['Air', 'Water'], col: 0x1fc7c1, acc: 0xeaffff, strong: ['api', 'batu'], weak: ['petir', 'tumbuhan'] },
  api: { name: ['Api', 'Fire'], col: 0xff5a1f, acc: 0xffd23a, strong: ['tumbuhan', 'batu'], weak: ['air', 'angin'] },
  batu: { name: ['Batu', 'Stone'], col: 0xb07a4c, acc: 0xe0b955, strong: ['petir', 'angin'], weak: ['air', 'api'] },
  angin: { name: ['Angin', 'Wind'], col: 0x6fe3b8, acc: 0xeef9f6, strong: ['api', 'tumbuhan'], weak: ['batu', 'petir'] },
  petir: { name: ['Petir', 'Lightning'], col: 0x7a6bff, acc: 0xffe83a, strong: ['air', 'angin'], weak: ['batu', 'tumbuhan'] },
  tumbuhan: { name: ['Tumbuhan', 'Plant'], col: 0x1fae5e, acc: 0xff8fc0, strong: ['air', 'petir'], weak: ['api', 'angin'] },
};

export const ADV = 1.25, DIS = 0.8, ARENA_BONUS = 1.1;
/** Pengali damage elemen penyerang terhadap elemen bertahan. */
export function elemMul(a: Elem, d: Elem): number {
  return ELEMS[a].strong.includes(d) ? ADV : ELEMS[a].weak.includes(d) ? DIS : 1;
}
export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export interface StatusFx { burn?: number; shock?: number; slow?: number; root?: number }
export interface Move {
  id: string; name?: L; desc?: L; anim: string;
  su: number; ac: number; re: number; dmg: number;
  box?: [number, number, number, number]; // x0, x1 (ke depan), y0, y1 relatif terhadap kaki
  kb?: [number, number]; stun?: number; launch?: boolean; strong?: boolean; otg?: boolean; // otg: bisa mengenai lawan yang terbaring & melontarkannya
  lunge?: number; armor?: boolean; inv?: boolean; multi?: number;
  fx?: StatusFx; spawn?: string; cd?: number; ult?: boolean; air?: boolean;
  /** kombo: gerakan berikutnya bila tombol Light (atk) / Heavy (hvy) ditekan; `heavy` = lanjutannya menunggu separuh recovery */
  branch?: { atk?: string; hvy?: string }; heavy?: boolean;
  ai?: [number, number];
}
export interface Look {
  h: number; bulk: number; sh: number; skin: number; c1: number; c2: number; hair: number;
  style: 'flow' | 'flame' | 'rock' | 'swoosh' | 'bolt' | 'leaf' | 'crown';
}
export interface CharDef {
  id: string; name: string; elem: Elem; role: L; style: L;
  hp: number; spd: number; atk: number; def: number; jump: number; tempo: number; regen?: number;
  stats: [number, number, number, number]; // kekuatan, kecepatan, pertahanan, jangkauan (1–5)
  look: Look; moves: Record<string, Move>; price: number; boss?: boolean;
}

/** Serangan dasar + kombo 3 gerakan (L = Light, H = Heavy):
 *  L-L-L jab→cross→hook · L-L-H jab→cross→uppercut · L-H-H jab→roundhouse→spinning back kick
 *  H-H-H teep→roundhouse→kick · H-L-L teep→superman punch→hook · H-H-L teep→roundhouse→elbow
 *  `hv` = ciri elemen untuk semua tendangan berat, `fin` = tambahan khusus kick penutup H-H-H. */
const basic = (reach: number, pw = 1, hv: Partial<Move> = {}, fin: Partial<Move> = {}): Record<string, Move> => {
  const el: Partial<Move> = { fx: hv.fx }; // ciri elemen untuk gerakan Heavy di kombo campuran
  return {
  a1: { id: 'a1', anim: 'jab', su: .10, ac: .08, re: .20, dmg: 38 * pw, box: [.1, reach, .8, 1.6], kb: [3, 0], stun: .32, lunge: 2.5, branch: { atk: 'a2', hvy: 'a2h' } },
  a2: { id: 'a2', anim: 'cross', su: .11, ac: .08, re: .24, dmg: 46 * pw, box: [.1, reach + .1, .8, 1.6], kb: [3.5, 0], stun: .36, lunge: 3, branch: { atk: 'a3', hvy: 'a3h' } },
  a3: { id: 'a3', anim: 'hook', su: .17, ac: .10, re: .36, dmg: 72 * pw, box: [.1, reach + .35, .8, 1.7], kb: [9, 6], stun: .4, launch: true, strong: true, lunge: 3 },
  // kombo udara L-L-L: lutut → tendangan samping → tendangan kapak (membanting ke lantai); H kapan saja = penutup hvAir.
  // Pukulan udara yang kena menahan penyerang sebentar di udara (lihat Match.melee) agar ketiganya muat dalam satu lompatan.
  air: { id: 'air', anim: 'knee', su: .06, ac: .16, re: .12, dmg: 40 * pw, box: [0, reach * .8, -.3, 1.0], kb: [1, 5], stun: .4, air: true, branch: { atk: 'air2', hvy: 'hvAir' } },
  air2: { id: 'air2', anim: 'airkick', su: .06, ac: .10, re: .14, dmg: 46 * pw, box: [0, reach + .2, -.4, 1.0], kb: [1, 5], stun: .4, air: true, branch: { atk: 'air3', hvy: 'hvAir' } },
  air3: { id: 'air3', anim: 'axekick', su: .12, ac: .10, re: .18, dmg: 64 * pw, box: [0, reach + .1, -.8, 1.2], kb: [3, -16], stun: .4, launch: true, strong: true, air: true },
  low: { id: 'low', anim: 'sweep', su: .14, ac: .10, re: .32, dmg: 50 * pw, box: [.1, reach + .4, 0, .6], kb: [4, 5], stun: .3, launch: true, otg: true, lunge: 2 },
  // kombo berat sengaja lebih lambat dari ringan (ancang-ancang 0,22 / 0,22 / 0,32 dtk, lanjutannya baru bisa setelah separuh recovery);
  // stun 0,75 dtk tetap menjamin kombo tersambung bila kena
  hv: { id: 'hv', anim: 'teep', su: .22, ac: .10, re: .45, dmg: 66 * pw, box: [.1, reach + .45, .6, 1.4], kb: [3, 0], stun: .75, strong: true, heavy: true, branch: { hvy: 'hv2', atk: 'hl' }, ...hv },
  hv2: { id: 'hv2', anim: 'roundhouse', su: .22, ac: .12, re: .48, dmg: 80 * pw, box: [.1, reach + .5, .8, 1.9], kb: [3, 0], stun: .75, strong: true, heavy: true, lunge: 2, branch: { hvy: 'hv3', atk: 'hhl' }, ...hv },
  hv3: { id: 'hv3', anim: 'kick', su: .32, ac: .10, re: .5, dmg: 100 * pw, box: [.1, reach + .35, .6, 1.7], kb: [10, 7], stun: .5, launch: true, strong: true, lunge: 2.5, ...hv, ...fin },
  // varian berat di udara dan sambil menunduk ikut membawa efek elemen serangan berat karakter
  hvAir: { id: 'hvAir', anim: 'airkick', su: .16, ac: .30, re: .10, dmg: 78 * pw, box: [0, reach + .3, -.6, 1.1], kb: [8, 4], stun: .45, launch: true, strong: true, air: true, fx: hv.fx },
  hvLow: { id: 'hvLow', anim: 'uppercut', su: .2, ac: .14, re: .48, dmg: 84 * pw, box: [0, reach + .1, .3, 2.6], kb: [4, 10], stun: .45, launch: true, otg: true, strong: true, lunge: 1.5, fx: hv.fx },
  // kombo campuran: Heavy di dalam rantai Light memakai ancang-ancang cepat (±0,16 dtk) agar pasti tersambung
  a3h: { id: 'a3h', anim: 'uppercut', su: .16, ac: .10, re: .45, dmg: 80 * pw, box: [.1, reach + .35, .6, 2.3], kb: [3, 11], stun: .45, launch: true, strong: true, lunge: 2.5, ...el },
  a2h: { id: 'a2h', anim: 'roundhouse', su: .16, ac: .12, re: .44, dmg: 70 * pw, box: [.1, reach + .5, .8, 1.9], kb: [3, 0], stun: .75, strong: true, heavy: true, lunge: 2, branch: { hvy: 'a3hh' }, ...el },
  a3hh: { id: 'a3hh', anim: 'spinkick', su: .2, ac: .12, re: .5, dmg: 95 * pw, box: [.1, reach + .55, .7, 1.6], kb: [12, 6], stun: .5, launch: true, strong: true, ...el },
  // Light di dalam rantai Heavy: cepat; superman punch melompat maju menutup jarak setelah teep
  hl: { id: 'hl', anim: 'superman', su: .14, ac: .10, re: .3, dmg: 52 * pw, box: [.1, reach + .2, .9, 1.7], kb: [2, 0], stun: .42, lunge: 9, branch: { atk: 'a3' } },
  hhl: { id: 'hhl', anim: 'elbow', su: .12, ac: .10, re: .38, dmg: 75 * pw, box: [.1, reach + .2, .9, 1.8], kb: [8, 6], stun: .4, lunge: 5, launch: true, strong: true },
  };
};

export const CHARS: CharDef[] = [
  {
    id: 'aqualis', name: 'Aqualis', elem: 'air', price: 0,
    role: ['Penyeimbang', 'All-rounder'], style: ['Jarak menengah, serangan mengalir, bisa memulihkan sedikit HP', 'Mid-range, flowing strikes, can restore a little HP'],
    hp: 1020, spd: 4.3, atk: 1.06, def: 1.02, jump: 11, tempo: 1, stats: [3, 3, 3, 4],
    look: { h: 1, bulk: 1, sh: 1, skin: 0xf2c9a8, c1: 0x157f96, c2: 0xe8fbff, hair: 0x39d5d0, style: 'flow' },
    moves: {
      ...basic(1.3, 1, { name: ['Tendangan Ombak', 'Tidal Kicks'] }, { kb: [13, 5] }),
      s1: { id: 's1', name: ['Peluru Air', 'Water Bolt'], desc: ['Bola air melesat lurus ke depan.', 'A water orb that flies straight ahead.'], anim: 'cast', su: .22, ac: .1, re: .3, dmg: 0, spawn: 'bolt', cd: 2.5, ai: [2.5, 9] },
      ult: { id: 'ult', name: ['Tsunami Kuil', 'Temple Tsunami'], desc: ['Gelombang besar menyapu arena dan mendorong lawan.', 'A huge wave sweeps the arena and shoves the foe.'], anim: 'cast2', su: .4, ac: .3, re: .5, dmg: 0, spawn: 'tsunami', ult: true, inv: true, ai: [0, 8] },
    },
  },
  {
    id: 'pyrra', name: 'Pyrra', elem: 'api', price: 0,
    role: ['Penyerang', 'Attacker'], style: ['Agresif jarak dekat, efek terbakar dari waktu ke waktu', 'Aggressive up close, burns over time'],
    hp: 950, spd: 4.6, atk: 1.1, def: .95, jump: 11.5, tempo: .95, stats: [4, 4, 2, 2],
    look: { h: .98, bulk: .95, sh: .95, skin: 0xe8a878, c1: 0xb3261e, c2: 0x2a1a1a, hair: 0xff7a1a, style: 'flame' },
    moves: {
      ...basic(1.25, 1, { name: ['Tendangan Bara', 'Ember Kicks'], fx: { burn: 1.5 } }),
      s1: { id: 's1', name: ['Api Membubung', 'Rising Flame'], desc: ['Pukulan ke atas berapi; ampuh melawan lompatan.', 'A blazing uppercut; great against jump-ins.'], anim: 'upper', su: .1, ac: .22, re: .46, dmg: 95, box: [0, 1.3, .3, 2.9], kb: [4, 11], stun: .4, launch: true, strong: true, inv: true, fx: { burn: 3 }, cd: 6, ai: [0, 1.6] },
      ult: { id: 'ult', name: ['Letusan Phoenix', 'Phoenix Eruption'], desc: ['Ledakan api besar di sekeliling Pyrra.', 'A massive fire blast around Pyrra.'], anim: 'raise', su: .35, ac: .3, re: .5, dmg: 0, spawn: 'eruption', ult: true, inv: true, ai: [0, 3.2] },
    },
  },
  {
    id: 'terrok', name: 'Terrok', elem: 'batu', price: 0,
    role: ['Penahan', 'Tank'], style: ['Lambat tapi sangat kuat, pertahanan tinggi', 'Slow but very strong, high defense'],
    hp: 1220, spd: 3.4, atk: 1.14, def: 1.14, jump: 9.8, tempo: 1.28, stats: [5, 1, 5, 3],
    look: { h: 1.1, bulk: 1.5, sh: 1.35, skin: 0x9a7758, c1: 0x6b4a32, c2: 0xd9b24f, hair: 0x54402f, style: 'rock' },
    moves: {
      ...basic(1.45, 1, { name: ['Tendangan Karang', 'Crag Kicks'], stun: .85 }, { armor: true }),
      s1: { id: 's1', name: ['Serudukan Karang', 'Crag Charge'], desc: ['Menyeruduk tanpa bisa dihentikan serangan biasa.', 'A charge that ordinary hits cannot stop.'], anim: 'charge', su: .2, ac: .35, re: .4, dmg: 115, box: [0, 1.4, .3, 1.7], lunge: 10, armor: true, kb: [10, 6], stun: .4, launch: true, strong: true, cd: 6, ai: [1.5, 5] },
      ult: { id: 'ult', name: ['Gempa Titan', 'Titan Quake'], desc: ['Hantaman lantai mengguncang lawan yang menapak tanah.', 'A floor slam that staggers any grounded foe.'], anim: 'slam', su: .45, ac: .2, re: .6, dmg: 0, spawn: 'quake', ult: true, inv: true, ai: [0, 9] },
    },
  },
  {
    id: 'zephyr', name: 'Zephyr', elem: 'angin', price: 500,
    role: ['Kecepatan', 'Speedster'], style: ['Gesit, menghindar, dorongan jarak jauh', 'Nimble, evasive, long-range pushes'],
    hp: 880, spd: 5.4, atk: .92, def: .9, jump: 12.5, tempo: .85, stats: [2, 5, 2, 4],
    look: { h: .96, bulk: .85, sh: .9, skin: 0xf0cfb0, c1: 0x2f9f84, c2: 0xf4fbf9, hair: 0xe9f3f0, style: 'swoosh' },
    moves: {
      ...basic(1.25, 1, { name: ['Tendangan Topan', 'Gale Kicks'], su: .19, re: .38 }, { kb: [15, 6] }),
      s1: { id: 's1', name: ['Hembusan', 'Gale'], desc: ['Angin kencang yang mendorong lawan jauh.', 'A gust that shoves the foe far away.'], anim: 'cast', su: .16, ac: .1, re: .25, dmg: 0, spawn: 'gust', cd: 3, ai: [2, 9] },
      ult: { id: 'ult', name: ['Siklon', 'Cyclone'], desc: ['Pusaran menarik lawan lalu melemparnya.', 'A vortex pulls the foe in, then flings them.'], anim: 'spin', su: .35, ac: .3, re: .5, dmg: 0, spawn: 'cyclone', ult: true, inv: true, ai: [0, 6] },
    },
  },
  {
    id: 'voltrix', name: 'Voltrix', elem: 'petir', price: 500,
    role: ['Ledakan damage', 'Burst'], style: ['Serangan cepat, kombo pendek, peluang menyetrum', 'Fast strikes, short combos, chance to shock'],
    hp: 880, spd: 4.9, atk: 1.14, def: .88, jump: 11.5, tempo: .85, stats: [5, 4, 1, 3],
    look: { h: 1, bulk: .92, sh: 1, skin: 0xd9b08c, c1: 0x3a2f8f, c2: 0x1a1830, hair: 0xffe83a, style: 'bolt' },
    moves: {
      ...basic(1.2, 1, { name: ['Tendangan Kilat', 'Volt Kicks'], lunge: 6, fx: { shock: .2 } }),
      s1: { id: 's1', name: ['Kilat Sergap', 'Spark Dash'], desc: ['Melesat secepat kilat dan menyetrum lawan.', 'Dashes like lightning and shocks the foe.'], anim: 'lunge', su: .1, ac: .16, re: .3, dmg: 78, box: [0, 1.4, .5, 1.6], lunge: 22, kb: [5, 2], stun: .35, fx: { shock: .45 }, cd: 3.5, ai: [2, 6] },
      ult: { id: 'ult', name: ['Murka Badai', 'Storm Wrath'], desc: ['Lima sambaran beruntun mengejar lawan.', 'Five successive bolts chase the foe.'], anim: 'raise', su: .35, ac: .4, re: .5, dmg: 0, spawn: 'storm', ult: true, inv: true, ai: [0, 9] },
    },
  },
  {
    id: 'sylva', name: 'Sylva', elem: 'tumbuhan', price: 500,
    role: ['Pengendali', 'Controller'], style: ['Jebakan akar, memperlambat lawan, regenerasi pelan', 'Root traps, slows the foe, slow regeneration'],
    hp: 1020, spd: 4.1, atk: 1.05, def: 1.04, jump: 11, tempo: 1, regen: .004, stats: [3, 2, 4, 5],
    look: { h: .97, bulk: .95, sh: .95, skin: 0xe9c9a2, c1: 0x1f7a45, c2: 0x7b4f2c, hair: 0x2fc46c, style: 'leaf' },
    moves: {
      ...basic(1.3, 1, { name: ['Tendangan Sulur', 'Vine Kicks'], fx: { slow: 1.5 } }),
      s1: { id: 's1', name: ['Cambuk Duri', 'Thorn Lash'], desc: ['Cambuk jarak jauh yang memperlambat lawan.', 'A long-range lash that slows the foe.'], anim: 'whip', su: .2, ac: .12, re: .36, dmg: 82, box: [.2, 3.3, .5, 1.5], kb: [4, 0], stun: .38, fx: { slow: 2.5 }, cd: 3.5, ai: [1.8, 3.4] },
      ult: { id: 'ult', name: ['Hutan Murka', 'Raging Forest'], desc: ['Akar raksasa mengunci lawan beberapa detik.', 'Giant roots lock the foe in place for seconds.'], anim: 'slam', su: .4, ac: .2, re: .55, dmg: 0, spawn: 'forest', ult: true, inv: true, ai: [0, 9] },
    },
  },
];

// Bos Mode Cerita: berganti elemen secara berurutan (pola yang bisa dipelajari).
export const BOSS: CharDef = {
  id: 'omnis', name: 'Omnis', elem: 'api', price: 0, boss: true,
  role: ['Bos', 'Boss'], style: ['Penguasa semua elemen; berganti elemen tiap 10 detik', 'Master of all elements; shifts element every 10 seconds'],
  hp: 1250, spd: 4.3, atk: 1, def: 1.05, jump: 11, tempo: 1, stats: [5, 3, 4, 4],
  look: { h: 1.14, bulk: 1.2, sh: 1.2, skin: 0x8f86a8, c1: 0x231a3a, c2: 0xd8d2ee, hair: 0xffffff, style: 'crown' },
  moves: {
    ...basic(1.4, 1, { name: ['Tendangan Purba', 'Primal Kicks'] }),
    // bos punya spesial kedua (bawah + Spesial); hanya dipakai bot
    s2: { id: 's2', name: ['Bola Purba', 'Primal Orb'], anim: 'cast', su: .24, ac: .1, re: .3, dmg: 0, spawn: 'orb', cd: 3, ai: [2.5, 9] },
    s1: { id: 's1', name: ['Terjangan Purba', 'Primal Rush'], anim: 'lunge', su: .2, ac: .2, re: .5, dmg: 95, box: [.1, 1.5, .5, 1.6], lunge: 13, kb: [8, 5], stun: .4, strong: true, launch: true, cd: 4.5, ai: [1.5, 5] },
    ult: { id: 'ult', name: ['Kiamat Elemen', 'Elemental Doom'], anim: 'raise', su: .5, ac: .3, re: .6, dmg: 0, spawn: 'eruption', ult: true, inv: true, ai: [0, 3.2] },
  },
};
export const BOSS_CYCLE: Elem[] = ['api', 'air', 'tumbuhan', 'petir', 'batu', 'angin'];
export const charById = (id: string) => (id === 'omnis' ? BOSS : CHARS.find(c => c.id === id)!);

export interface ArenaDef { id: string; name: L; elem: Elem | null; vibe: L; effect: L; price: number }
export const ARENAS: ArenaDef[] = [
  { id: 'kuil', name: ['Kuil Pasang Surut', 'Tidal Temple'], elem: 'air', price: 0, vibe: ['Kuil kuno di tepi laut, senja biru-toska', 'Ancient seaside temple at teal dusk'], effect: ['Ombak berkala mendorong petarung ke samping', 'Periodic waves push fighters sideways'] },
  { id: 'magma', name: ['Kawah Magma', 'Magma Crater'], elem: 'api', price: 0, vibe: ['Kawah vulkanik, langit merah-oranye', 'Volcanic crater under a red-orange sky'], effect: ['Semburan lava di tepi memberi efek terbakar', 'Lava bursts at the edges inflict burn'] },
  { id: 'gunung', name: ['Reruntuhan Gunung', 'Mountain Ruins'], elem: 'batu', price: 0, vibe: ['Pilar batu dan tebing berdebu', 'Stone pillars and dusty cliffs'], effect: ['Pilar bisa dihancurkan dan jadi pelindung sementara', 'Pillars give temporary cover and can be destroyed'] },
  { id: 'awan', name: ['Puncak Awan', 'Cloud Summit'], elem: 'angin', price: 250, vibe: ['Platform melayang di atas awan', 'A platform floating above the clouds'], effect: ['Angin kencang mengubah arah dorongan; jatuh dari tepi = ring-out', 'Strong wind bends knockback; falling off the edge = ring-out'] },
  { id: 'hutan', name: ['Hutan Kuno', 'Ancient Forest'], elem: 'tumbuhan', price: 250, vibe: ['Hutan berlumut, cahaya hijau berkabut', 'Mossy forest in misty green light'], effect: ['Akar muncul acak dan memperlambat gerak', 'Roots sprout at random and slow movement'] },
  { id: 'menara', name: ['Menara Badai', 'Storm Spire'], elem: 'petir', price: 250, vibe: ['Menara tinggi di tengah badai malam', 'A tall spire in a night storm'], effect: ['Sambaran petir acak pada titik yang ditandai lebih dulu', 'Random lightning strikes on pre-marked spots'] },
  { id: 'dojo', name: ['Dojo', 'Dojo'], elem: null, price: 0, vibe: ['Arena latihan netral', 'Neutral training hall'], effect: ['Tanpa bonus dan tanpa efek', 'No bonus and no effects'] },
];
export const arenaById = (id: string) => ARENAS.find(a => a.id === id)!;

export interface BotLevel {
  id: string; name: L; goal: L; react: [number, number]; think: [number, number];
  aggr: number; block: number; dodge: number; punish: number; combo: number; skill: number; ult: number;
  elem: boolean; arena: boolean; read: boolean;
}
export const BOT_LEVELS: BotLevel[] = [
  { id: 'pemula', name: ['Pemula', 'Beginner'], goal: ['Belajar kontrol', 'Learn the controls'], react: [.6, .8], think: [.55, 1.0], aggr: .32, block: .06, dodge: 0, punish: 0, combo: 1, skill: .08, ult: .1, elem: false, arena: false, read: false },
  { id: 'normal', name: ['Normal', 'Normal'], goal: ['Pemain kasual', 'Casual players'], react: [.35, .5], think: [.35, .65], aggr: .5, block: .28, dodge: .04, punish: .2, combo: 2, skill: .3, ult: 1, elem: false, arena: false, read: false },
  { id: 'mahir', name: ['Mahir', 'Expert'], goal: ['Pemain menengah', 'Intermediate players'], react: [.2, .3], think: [.22, .45], aggr: .62, block: .52, dodge: .22, punish: .65, combo: 3, skill: .5, ult: 1, elem: true, arena: true, read: false },
  { id: 'master', name: ['Master', 'Master'], goal: ['Tantangan akhir', 'The final challenge'], react: [.12, .18], think: [.15, .32], aggr: .66, block: .78, dodge: .4, punish: .9, combo: 3, skill: .6, ult: 1, elem: true, arena: true, read: true },
];

export interface Stage { opp: string | 'rival'; arena: string; level: number; text: L }
export const STORY: Stage[] = [
  { opp: 'terrok', arena: 'dojo', level: 0, text: ['Babak penyisihan. Terrok menguji dasar-dasarmu di Dojo.', 'Qualifiers. Terrok tests your basics in the Dojo.'] },
  { opp: 'sylva', arena: 'hutan', level: 0, text: ['Sylva menunggumu di antara akar Hutan Kuno.', 'Sylva waits among the roots of the Ancient Forest.'] },
  { opp: 'aqualis', arena: 'kuil', level: 1, text: ['Ombak naik di Kuil Pasang Surut. Aqualis tidak akan mengalah.', 'The tide rises at the Tidal Temple. Aqualis will not yield.'] },
  { opp: 'zephyr', arena: 'awan', level: 1, text: ['Di Puncak Awan, satu langkah salah berarti jatuh.', 'On the Cloud Summit, one wrong step means a fall.'] },
  { opp: 'pyrra', arena: 'magma', level: 1, text: ['Perempat final. Pyrra membakar semangat di Kawah Magma.', 'Quarterfinal. Pyrra burns bright in the Magma Crater.'] },
  { opp: 'voltrix', arena: 'menara', level: 2, text: ['Badai menyambut di puncak menara. Voltrix menyerang lebih dulu.', 'A storm greets you atop the spire. Voltrix strikes first.'] },
  { opp: 'terrok', arena: 'gunung', level: 2, text: ['Semifinal. Terrok kembali, kali ini tanpa menahan diri.', 'Semifinal. Terrok returns, holding nothing back.'] },
  { opp: 'rival', arena: 'rival', level: 2, text: ['Final. Lawan yang elemennya menekan elemenmu.', 'The final. A foe whose element counters yours.'] },
  { opp: 'omnis', arena: 'magma', level: 2, text: ['Omnis, penguasa semua elemen, turun ke arena. Pelajari polanya.', 'Omnis, master of all elements, enters the arena. Learn the pattern.'] },
];
export const ELEM_ARENA: Record<Elem, string> = { air: 'kuil', api: 'magma', batu: 'gunung', angin: 'awan', petir: 'menara', tumbuhan: 'hutan' };
/** Rival final: karakter yang elemennya kuat melawan elemen pemain. */
export function rivalOf(c: CharDef): CharDef {
  return CHARS.find(o => ELEMS[o.elem].strong.includes(c.elem) && o.id !== c.id)!;
}
