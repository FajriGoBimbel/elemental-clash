// Data game: elemen, karakter, jurus, arena, tingkat bot, mode cerita.
export type L = [string, string]; // [Indonesia, English]
export type Elem = 'air' | 'api' | 'batu' | 'angin' | 'petir' | 'tumbuhan' | 'netral';

export const ELEM_ORDER: Elem[] = ['air', 'api', 'batu', 'angin', 'petir', 'tumbuhan'];

export const ELEMS: Record<Elem, { name: L; col: number; acc: number; strong: Elem[]; weak: Elem[] }> = {
  air: { name: ['Air', 'Water'], col: 0x1fc7c1, acc: 0xeaffff, strong: ['api', 'batu'], weak: ['petir', 'tumbuhan'] },
  api: { name: ['Api', 'Fire'], col: 0xff5a1f, acc: 0xffd23a, strong: ['tumbuhan', 'batu'], weak: ['air', 'angin'] },
  batu: { name: ['Batu', 'Stone'], col: 0xb07a4c, acc: 0xe0b955, strong: ['petir', 'angin'], weak: ['air', 'api'] },
  angin: { name: ['Angin', 'Wind'], col: 0x6fe3b8, acc: 0xeef9f6, strong: ['api', 'tumbuhan'], weak: ['batu', 'petir'] },
  petir: { name: ['Petir', 'Lightning'], col: 0x7a6bff, acc: 0xffe83a, strong: ['air', 'angin'], weak: ['batu', 'tumbuhan'] },
  tumbuhan: { name: ['Tumbuhan', 'Plant'], col: 0x1fae5e, acc: 0xff8fc0, strong: ['air', 'petir'], weak: ['api', 'angin'] },
  // bela diri murni: tidak unggul dan tidak kalah dari elemen mana pun (damage selalu ×1)
  netral: { name: ['Bela Diri', 'Martial'], col: 0xc9ced6, acc: 0xff4d4d, strong: [], weak: [] },
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
  /** `grab` = tangkapan/bantingan: menembus tangkisan & armor, tapi luput bila lawan di udara atau terbaring.
   *  `pin` = pukulan ke lawan terbaring yang menahannya tetap di lantai (ground & pound). `sub` = pamungkas kuncian (lihat Match.submission). */
  grab?: boolean; pin?: boolean; sub?: boolean;
  /** bantingan: lawan dipegang & diangkat selama sekian detik sebelum dilempar (suplex) */
  throw?: number;
  kb?: [number, number]; stun?: number; launch?: boolean; strong?: boolean; otg?: boolean; // otg: bisa mengenai lawan yang terbaring & melontarkannya
  lunge?: number; armor?: boolean; inv?: boolean; multi?: number;
  /** bagian damage yang kembali sebagai HP penyerang bila kena (bukan ditangkis) */
  drain?: number;
  /** efek visual khas gerakan (lihat FightView), mis. 'fireFist' */
  vis?: string;
  /** `pass` = menembus lawan (tidak saling dorong) selama menerjang; `hop` = penyerang melompat (vy) saat pukulan aktif */
  pass?: boolean; hop?: number;
  fx?: StatusFx; spawn?: string; cd?: number; ult?: boolean; air?: boolean;
  /** kombo: gerakan berikutnya bila tombol Light (atk) / Heavy (hvy) ditekan; `heavy` = lanjutannya menunggu separuh recovery */
  branch?: { atk?: string; hvy?: string }; heavy?: boolean;
  ai?: [number, number];
  /** penutup kombo: [gerakan versi hold, tombol yang ditahan]; `crush` = menembus tangkisan */
  hold?: [string, 'atk' | 'hvy']; crush?: boolean;
}
export interface Look {
  h: number; bulk: number; sh: number; skin: number; c1: number; c2: number; hair: number;
  style: 'flow' | 'flame' | 'rock' | 'swoosh' | 'bolt' | 'leaf' | 'crown' | 'afro';
}
export interface CharDef {
  id: string; name: string; elem: Elem; role: L; style: L;
  hp: number; spd: number; atk: number; def: number; jump: number; tempo: number; regen?: number;
  stats: [number, number, number, number]; // kekuatan, kecepatan, pertahanan, jangkauan (1–5)
  look: Look; moves: Record<string, Move>; price: number; boss?: boolean;
  /** pasif Tahan Banting: bangun lebih cepat, bantingan yang kena memulihkan 1 stamina */
  tough?: boolean;
}

/** Serangan dasar + kombo 3 gerakan (L = Light, H = Heavy):
 *  L-L-L jab→cross→hook · L-L-H jab→cross→uppercut · L-H-H jab→roundhouse→spinning back kick
 *  H-H-H teep→roundhouse→kick · H-L-L teep→superman punch→hook · H-H-L teep→roundhouse→elbow
 *  `hv` = ciri elemen untuk semua tendangan berat, `fin` = tambahan khusus kick penutup H-H-H. */
const basic = (reach: number, pw = 1, hv: Partial<Move> = {}, fin: Partial<Move> = {}, over: Record<string, Partial<Move>> = {}): Record<string, Move> => {
  const el: Partial<Move> = { fx: hv.fx }; // ciri elemen untuk gerakan Heavy di kombo campuran
  const mv: Record<string, Move> = {
  a1: { id: 'a1', anim: 'jab', su: .10, ac: .08, re: .20, dmg: 38 * pw, box: [.1, reach, .8, 1.6], kb: [3, 0], stun: .32, lunge: 2.5, branch: { atk: 'a2', hvy: 'a2h' } },
  a2: { id: 'a2', anim: 'cross', su: .11, ac: .08, re: .24, dmg: 46 * pw, box: [.1, reach + .1, .8, 1.6], kb: [3.5, 0], stun: .36, lunge: 3, branch: { atk: 'a3', hvy: 'a3h' } },
  a3: { id: 'a3', anim: 'hook', su: .17, ac: .10, re: .36, dmg: 72 * pw, box: [.1, reach + .35, .8, 1.7], kb: [9, 6], stun: .4, launch: true, strong: true, lunge: 3 },
  // kombo udara L-L-L: lutut → tendangan samping → tendangan kapak (membanting ke lantai); H kapan saja = penutup hvAir.
  // Pukulan udara yang kena menahan penyerang sebentar di udara (lihat Match.melee) agar ketiganya muat dalam satu lompatan.
  air: { id: 'air', anim: 'knee', su: .06, ac: .16, re: .12, dmg: 40 * pw, box: [0, reach * .8, -.3, 1.0], kb: [1, 5], stun: .4, air: true, branch: { atk: 'air2', hvy: 'hvAir' } },
  air2: { id: 'air2', anim: 'airkick', su: .06, ac: .10, re: .14, dmg: 46 * pw, box: [0, reach + .2, -.4, 1.0], kb: [1, 5], stun: .4, air: true, branch: { atk: 'air3', hvy: 'hvAir' } },
  air3: { id: 'air3', anim: 'axekick', su: .12, ac: .10, re: .18, dmg: 64 * pw, box: [0, reach + .1, -.8, 1.2], kb: [3, -16], stun: .4, launch: true, strong: true, air: true },
  low: { id: 'low', anim: 'sweep', su: .14, ac: .10, re: .32, dmg: 50 * pw, box: [.1, reach + .4, 0, .6], kb: [4, 5], stun: .3, launch: true, otg: true, lunge: 2 },
  // kombo berat sengaja lebih lambat dari ringan (ancang-ancang 0,17 / 0,18 / 0,26 dtk, lanjutannya baru bisa setelah separuh recovery);
  // stun 0,75 dtk tetap menjamin kombo tersambung bila kena
  hv: { id: 'hv', anim: 'teep', su: .17, ac: .10, re: .45, dmg: 66 * pw, box: [.1, reach + .45, .6, 1.4], kb: [3, 0], stun: .75, strong: true, heavy: true, armor: true, branch: { hvy: 'hv2', atk: 'hl' }, ...hv }, // armor: tahan Light saat ancang-ancang
  hv2: { id: 'hv2', anim: 'roundhouse', su: .18, ac: .12, re: .48, dmg: 80 * pw, box: [.1, reach + .5, .8, 1.9], kb: [3, 0], stun: .75, strong: true, heavy: true, lunge: 2, branch: { hvy: 'hv3', atk: 'hhl' }, ...hv },
  hv3: { id: 'hv3', anim: 'kick', su: .26, ac: .10, re: .5, dmg: 100 * pw, box: [.1, reach + .35, .6, 1.7], kb: [10, 7], stun: .5, launch: true, strong: true, heavy: true, lunge: 2.5, ...hv, ...fin },
  // varian berat di udara dan sambil menunduk ikut membawa efek elemen serangan berat karakter
  hvAir: { id: 'hvAir', anim: 'airkick', su: .16, ac: .30, re: .10, dmg: 78 * pw, box: [0, reach + .3, -.6, 1.1], kb: [8, 4], stun: .45, launch: true, strong: true, heavy: true, air: true, fx: hv.fx },
  hvLow: { id: 'hvLow', anim: 'uppercut', su: .17, ac: .14, re: .48, dmg: 84 * pw, box: [0, reach + .1, .3, 2.6], kb: [4, 10], stun: .45, launch: true, otg: true, strong: true, heavy: true, lunge: 1.5, fx: hv.fx },
  // kombo campuran: Heavy di dalam rantai Light memakai ancang-ancang cepat (±0,16 dtk) agar pasti tersambung
  a3h: { id: 'a3h', anim: 'uppercut', su: .16, ac: .10, re: .45, dmg: 80 * pw, box: [.1, reach + .35, .6, 2.3], kb: [3, 11], stun: .45, launch: true, strong: true, heavy: true, lunge: 2.5, ...el },
  a2h: { id: 'a2h', anim: 'roundhouse', su: .16, ac: .12, re: .44, dmg: 70 * pw, box: [.1, reach + .5, .8, 1.9], kb: [3, 0], stun: .75, strong: true, heavy: true, lunge: 2, branch: { hvy: 'a3hh' }, ...el },
  a3hh: { id: 'a3hh', anim: 'spinkick', su: .2, ac: .12, re: .5, dmg: 95 * pw, box: [.1, reach + .55, .7, 1.6], kb: [12, 6], stun: .5, launch: true, strong: true, heavy: true, ...el },
  // Light di dalam rantai Heavy: cepat; superman punch melompat maju menutup jarak setelah teep
  hl: { id: 'hl', anim: 'superman', su: .14, ac: .10, re: .3, dmg: 52 * pw, box: [.1, reach + .2, .9, 1.7], kb: [2, 0], stun: .42, lunge: 9, branch: { atk: 'a3' } },
  hhl: { id: 'hhl', anim: 'elbow', su: .12, ac: .10, re: .38, dmg: 75 * pw, box: [.1, reach + .2, .9, 1.8], kb: [8, 6], stun: .4, lunge: 5, launch: true, strong: true },
  };
  // gerakan khas karakter (dipasang sebelum varian hold agar versi hold ikut mewarisinya)
  for (const k in over) mv[k] = { ...mv[k], ...over[k] };
  // hold di penutup kombo: tahan Light = rentetan pukulan yang menahan lawan; tahan Heavy = pukulan charged yang menembus tangkisan
  // penutup kombo Light = ujung rantai L dari a1 (a3 biasanya; a2 / a4 untuk karakter dengan kombo 2 / 4 pukulan)
  let lEnd = 'a1'; while (mv[lEnd].branch?.atk) lEnd = mv[lEnd].branch!.atk!;
  for (const [id, key] of [[lEnd, 'atk'], ['hhl', 'atk'], ['a3h', 'hvy'], ['a3hh', 'hvy'], ['hv3', 'hvy']] as const) {
    const f = mv[id]; if (key === 'atk' && !f.box) continue; // rentetan pukulan butuh hitbox jarak dekat (lemparan tidak)
    f.hold = [id + 'C', key];
    mv[id + 'C'] = key === 'atk'
      ? { ...f, id: id + 'C', hold: undefined, ac: f.ac + .2, multi: .09, dmg: f.dmg * .4, kb: [1.5, 0], launch: false, stun: .5, lunge: (f.lunge || 0) * .6 }
      : { ...f, id: id + 'C', hold: undefined, dmg: f.dmg * 1.5, kb: [f.kb![0] * 1.4, Math.max(f.kb![1], 8)], launch: true, strong: true, crush: true };
  }
  return mv;
};

/** Kiting Man (MMA): striking di Light, clinch & bantingan di Heavy, ground & pound setelah takedown. */
function kitingMoves(): Record<string, Move> {
  const mv = basic(1.15, 1, { name: ['Clinch & Bantingan', 'Clinch & Takedown'] }, {}, {
    a3: { name: ['Tendangan Betis', 'Calf Kick'], desc: ['Penutup L-L-L: tendangan rendah ke betis yang membuat kaki lawan goyah dan melambat. Tahan Light: Overhand yang menjatuhkan lawan.', "L-L-L finisher: a low kick to the calf that buckles the foe's leg and slows them. Hold Light: an Overhand that drops the foe."],
      anim: 'lowkick', su: .14, ac: .1, re: .34, dmg: 58, box: [.1, 1.6, 0, .8], kb: [2, 0], stun: .6, launch: false, strong: true, lunge: 2, fx: { slow: 2.5 } },
    a3h: { name: ['Lutut Terbang', 'Flying Knee'], desc: ['L-L-H: melompat maju dan menghantamkan lutut ke dagu lawan hingga terlempar.', "L-L-H: leaps forward and drives a knee into the foe's chin, launching them."],
      anim: 'flyknee', su: .16, ac: .14, re: .42, dmg: 88, box: [.1, 1.5, .6, 2.2], kb: [6, 9], hop: 6, lunge: 6, launch: true, strong: true },
    hv: { name: ['Lutut Clinch', 'Clinch Knees'], desc: ['Pembuka Heavy: memegang kepala lawan lalu menghantamkan lutut dua kali.', "Heavy opener: grabs the foe's head and drives two knees in."],
      anim: 'gknee', ac: .22, multi: .11, dmg: 38, kb: [1.5, 0], stun: .7, lunge: 3 },
    hv2: { name: ['Sikut Turun', 'Downward Elbow'], anim: 'elbowdown', dmg: 78, kb: [2.5, 0], stun: .8 },
    hv3: { name: ['Takedown', 'Takedown'], desc: ['Penutup H-H-H: menyeruduk pinggang lawan dan membantingnya. Tidak bisa ditangkis, tapi luput bila lawan melompat. Tekan Light setelahnya untuk Ground & Pound.', "H-H-H finisher: shoots for the foe's waist and slams them down. Can't be blocked, but misses a jumping foe. Press Light afterwards for Ground & Pound."],
      anim: 'takedown', su: .22, ac: .14, re: .5, dmg: 80, box: [.1, 1.5, 0, 1.4], kb: [2, 5], stun: .5, launch: true, lunge: 9, grab: true, branch: { atk: 'gnp' } },
    hhl: { name: ['Tinju Belakang Putar', 'Spinning Backfist'], anim: 'spinfist' },
    hl: { name: ['Superman Punch', 'Superman Punch'] },
  });
  // tahan Light di penutup L-L-L: Overhand (bukan rentetan pukulan seperti karakter lain)
  mv.a3C = { ...mv.a3C, name: ['Overhand', 'Overhand'], anim: 'overhand', multi: undefined, ac: .1, dmg: 92, box: [.1, 1.5, .7, 1.9], kb: [5, 7], stun: .5, launch: true, strong: true, fx: undefined, lunge: 3 };
  mv.gnp = { id: 'gnp', name: ['Ground & Pound', 'Ground & Pound'], desc: ['H-H-H-L: menindih lawan yang terbanting lalu memukulinya bertubi-tubi; lawan tertahan di lantai selama dipukul.', 'H-H-H-L: mounts the slammed foe and rains down punches, pinning them to the floor while it lasts.'],
    anim: 'gnp', su: .12, ac: .6, re: .4, dmg: 20, multi: .12, box: [-.8, 1.4, -.2, .9], kb: [0, 0], stun: .3, otg: true, pin: true, lunge: .9 };
  mv.s1 = { id: 's1', name: ['Bantingan Suplex', 'Suplex'], desc: ['Menangkap lawan di jarak sangat dekat lalu membantingnya ke belakang. Tidak bisa ditangkis; hindari dengan dash, lompat, atau menyerang lebih dulu.', "Grabs a foe at very close range and suplexes them behind. Can't be blocked; avoid it by dashing, jumping, or striking first."],
    anim: 'suplex', su: .14, ac: .12, re: .55, dmg: 115, box: [.1, 1.2, 0, 1.7], kb: [-7, 10], stun: .5, launch: true, strong: true, grab: true, throw: .35, lunge: 2, cd: 5, ai: [0, 1.3] };
  mv.ult = { id: 'ult', name: ['Kunci Maut', 'Death Lock'], desc: ['Menerjang dan menangkap lawan, menindihnya dengan pukulan beruntun, lalu menutup dengan kuncian lengan. Tidak bisa ditangkis.', "Rushes in and grabs the foe, mounts them with a flurry of punches, then finishes with an armbar. Can't be blocked."],
    anim: 'takedown', su: .3, ac: .42, re: .5, dmg: 30, box: [.1, 1.5, 0, 1.6], kb: [1, 3], stun: .5, launch: true, lunge: 8, grab: true, sub: true, ult: true, inv: true, ai: [0, 3.5] };
  // fase pamungkas setelah tangkapan kena (dijalankan oleh Match.submission, tanpa hitbox sendiri)
  mv.ultGnp = { id: 'ultGnp', anim: 'gnp', su: .01, ac: 1.2, re: .05, dmg: 0, inv: true };
  mv.ultArm = { id: 'ultArm', anim: 'armbar', su: .25, ac: .6, re: .45, dmg: 0, inv: true };
  return mv;
}

export const CHARS: CharDef[] = [
  {
    id: 'aqualis', name: 'Aqualis', elem: 'air', price: 0,
    role: ['Penyeimbang', 'All-rounder'], style: ['Jarak menengah, serangan mengalir, bisa memulihkan sedikit HP', 'Mid-range, flowing strikes, can restore a little HP'],
    hp: 1020, spd: 4.3, atk: 1.06, def: 1.02, jump: 11, tempo: 1, stats: [3, 3, 3, 4],
    look: { h: 1, bulk: 1, sh: 1, skin: 0xf2c9a8, c1: 0x157f96, c2: 0xe8fbff, hair: 0x39d5d0, style: 'flow' },
    moves: {
      // ciri Air: kontrol jarak menengah + pulih HP. L-L-L ditutup cambuk yang menarik lawan mendekat & menyerap HP,
      // H-H-H ditutup semburan geyser di depan (kena walau lawan agak jauh) yang melontarkan ke atas.
      ...basic(1.3, 1, { name: ['Tendangan Ombak', 'Tidal Kicks'] }, {}, {
        a3: { name: ['Cambuk Arus', 'Current Lash'], desc: ['Penutup L-L-L: cambuk air panjang yang menarik lawan mendekat dan memulihkan HP.', 'L-L-L finisher: a long water lash that pulls the foe in and restores HP.'],
          anim: 'whip', su: .18, box: [.2, 2.6, .6, 1.7], kb: [-8, 0], stun: .55, launch: false, lunge: 1, drain: .3 },
        hv3: { name: ['Semburan Geyser', 'Geyser Burst'], desc: ['Penutup H-H-H: geyser menyembur di depan dan melontarkan lawan tinggi ke atas.', 'H-H-H finisher: a geyser erupts ahead and launches the foe high.'],
          anim: 'slam', box: undefined, spawn: 'geyser', kb: [2, 13], lunge: 0 },
      }),
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
      // ciri Api: agresif jarak dekat. Kombo Light jadi 4 pukulan (sikutan cepat di urutan ke-3) ditutup tinju yang meledak,
      // H-H-H ditutup ledakan api jarak dekat; keduanya membakar lebih lama dari serangan biasa.
      ...basic(1.25, 1, { name: ['Hantaman Bara', 'Ember Strikes'], fx: { burn: 1.5 } }, {}, {
        // H-H-H khas Pyrra: lutut maju → tinju putar → dorongan telapak ganda yang memicu Ledakan Bara
        hv: { anim: 'gknee', lunge: 4 },
        hv2: { anim: 'spinfist' },
        a3: { anim: 'elbow', su: .12, ac: .08, re: .24, dmg: 48, kb: [3, 0], stun: .4, launch: false, strong: false, lunge: 3, branch: { atk: 'a4', hvy: 'a3h' } },
        a4: { id: 'a4', name: ['Tinju Bara', 'Ember Fist'], desc: ['Kombo Light Pyrra 4 pukulan (L-L-L-L): sikutan lalu tinju yang meledak dan membakar lawan.', "Pyrra's Light combo has 4 hits (L-L-L-L): an elbow, then a fist that explodes and burns the foe."],
          anim: 'hook', su: .16, ac: .1, re: .36, dmg: 70, box: [.1, 1.6, .8, 1.7], kb: [9, 6], stun: .4, launch: true, strong: true, lunge: 3, fx: { burn: 3 }, vis: 'fireFist' },
        hv3: { name: ['Ledakan Bara', 'Ember Blast'], desc: ['Penutup H-H-H: dorongan telapak yang menyemburkan api agak jauh ke depan, menghempas lawan dan membakarnya lama.', 'H-H-H finisher: a palm thrust that sprays fire a good distance ahead, hurling the foe away and burning them for long.'],
          anim: 'palms', box: undefined, spawn: 'blast', kb: [12, 6], fx: { burn: 3.5 } },
      }),
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
      // ciri Batu: lambat tapi berat & sulit dihentikan. Kombo Light hanya 2 pukulan, ditutup hantaman palu ber-armor;
      // semua Heavy ber-armor dan H-H-H ditutup duri batu yang mencuat dari tanah.
      ...basic(1.45, 1, { name: ['Tendangan Karang', 'Crag Kicks'], stun: .85 }, { armor: true }, {
        a1: { dmg: 50, su: .12, stun: .4 },
        a2: { name: ['Palu Karang', 'Crag Hammer'], desc: ['Kombo Light Terrok hanya 2 pukulan (L-L): ditutup hantaman palu ber-armor yang membanting lawan.', "Terrok's Light combo is only 2 hits (L-L): it ends in an armored hammer blow that slams the foe."],
          anim: 'slam', su: .22, ac: .1, re: .42, dmg: 95, box: [.1, 1.9, 0, 1.9], kb: [6, 7], stun: .45, launch: true, strong: true, armor: true, lunge: 2, branch: undefined, vis: 'rockSmash' },
        // aturan Terrok: pukulan Light di dalam kombo langsung jadi penutup (L-L, L-H, H-L); hanya H-H-H / H-H-L yang 3 pukulan
        a2h: { branch: undefined, kb: [9, 5], stun: .45, launch: true },
        hl: { branch: undefined, kb: [8, 5], stun: .45, launch: true, strong: true },
        hv2: { armor: true },
        hhl: { name: ['Lempar Batu', 'Rock Toss'], desc: ['Penutup H-H-L: Terrok melempar bongkahan batu yang melambung dan menjatuhkan lawan di kejauhan.', 'H-H-L finisher: Terrok hurls a boulder in an arc that knocks down a distant foe.'],
          anim: 'cast2', su: .2, ac: .1, re: .4, box: undefined, spawn: 'rockToss', dmg: 85, kb: [7, 5], stun: .45, launch: true, strong: true, lunge: 0 },
        hv3: { name: ['Duri Karang', 'Crag Spikes'], desc: ['Penutup H-H-H: duri batu mencuat dari tanah di depan Terrok dan melontarkan lawan.', 'H-H-H finisher: stone spikes burst from the ground ahead of Terrok and launch the foe.'],
          anim: 'raise', box: undefined, spawn: 'crag', kb: [3, 11], lunge: 0 },
      }),
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
      // ciri Angin: gesit & bermain di udara. L-L-L ditutup terjangan yang menembus lawan dan mendarat di belakangnya,
      // H-H-H ditutup tendangan putar yang ikut melompat bersama lawan agar langsung bisa disambung kombo udara.
      ...basic(1.25, 1, { name: ['Tendangan Topan', 'Gale Kicks'], su: .15, re: .38 }, {}, {
        a3: { name: ['Langkah Topan', 'Gale Step'], desc: ['Penutup L-L-L: Zephyr menerjang menembus lawan dan mendarat di belakangnya; lawan terhuyung sehingga kombo bisa dilanjutkan dari belakang.', 'L-L-L finisher: Zephyr dashes through the foe and lands behind them; the foe staggers so the combo can continue from behind.'],
          anim: 'lunge', su: .12, ac: .18, re: .3, dmg: 60, box: [-.4, 1.2, .5, 1.7], kb: [1, 0], stun: .6, launch: false, strong: true, lunge: 16, pass: true, vis: 'galeStep' },
        hv3: { name: ['Tendangan Badai', 'Storm Kick'], desc: ['Penutup H-H-H: tendangan putar yang melontarkan lawan sambil ikut melompat; lanjutkan dengan kombo udara (L-L-L di udara).', 'H-H-H finisher: a spinning kick that launches the foe as Zephyr leaps with them; follow up with an air combo (L-L-L in the air).'],
          anim: 'spinkick', kb: [0.5, 11], hop: 10.5, lunge: 3, vis: 'storm', branch: { atk: 'air', hvy: 'hvAir' } },
      }),
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
      // ciri Petir: setruman yang mengunci lawan. L-L-L ditutup hook yang melumpuhkan (lawan membeku ±0,9 dtk, bebas dilanjut),
      // H-H-H ditutup medan listrik di sekitar Voltrix yang menyetrum beberapa kali lalu meledak.
      ...basic(1.2, 1, { name: ['Tendangan Kilat', 'Volt Kicks'], lunge: 6, fx: { shock: .2 } }, {}, {
        a3: { name: ['Kilat Kejut', 'Stun Bolt'], desc: ['Penutup L-L-L: hook bermuatan petir yang melumpuhkan lawan hampir 1 detik; sambaran petir menghantam dari langit.', 'L-L-L finisher: a charged hook that paralyzes the foe for almost a second as lightning strikes from the sky.'],
          kb: [2, 0], stun: .4, launch: false, fx: { shock: .5 }, vis: 'thunder' },
        hv3: { name: ['Ledakan Statis', 'Static Burst'], desc: ['Penutup H-H-H: medan listrik di sekitar Voltrix menyetrum lawan beberapa kali lalu meledak melontarkannya.', 'H-H-H finisher: an electric field around Voltrix zaps the foe several times, then bursts and launches them.'],
          anim: 'spin', box: undefined, spawn: 'static', kb: [9, 8], lunge: 0 },
      }),
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
      // ciri Tumbuhan: kontrol & bertahan lama. L-L-L ditutup sulur yang mencuat di jarak menengah dan mengakar lawan,
      // H-H-H ditutup tendangan yang memekarkan bunga berduri: memulihkan banyak HP Sylva dan memperlambat lawan.
      ...basic(1.3, 1, { name: ['Tendangan Sulur', 'Vine Kicks'], fx: { slow: 1.5 } }, {}, {
        // H-H-H khas Sylva: sapuan rendah → tendangan kipas → salto yang memekarkan bunga berduri
        hv: { anim: 'sweep', box: [.1, 1.8, 0, .9] },
        hv2: { anim: 'crescent' },
        a3: { name: ['Jerat Sulur', 'Vine Snare'], desc: ['Penutup L-L-L: sulur mencuat dari tanah di depan Sylva (sampai jarak menengah) dan mengakar lawan sehingga tidak bisa bergerak sesaat.', 'L-L-L finisher: vines burst from the ground ahead of Sylva (up to mid range) and root the foe in place for a moment.'],
          anim: 'cast', box: undefined, spawn: 'snare', kb: [1, 0], stun: .45, launch: false, strong: true, lunge: 0, fx: { root: 1.4, slow: 2.5 } },
        hv3: { name: ['Mekar Berduri', 'Thorn Bloom'], desc: ['Penutup H-H-H: salto ke belakang sambil menendang lawan ke atas dan memekarkan bunga berduri, memulihkan HP Sylva sebesar separuh damage-nya dan memperlambat lawan.', "H-H-H finisher: a backflip kick that launches the foe upward and blooms a thorn flower, restoring half its damage as Sylva's HP and slowing the foe."],
          anim: 'flipkick', box: [.1, 1.6, .3, 2.4], kb: [3, 11], drain: .5, fx: { slow: 3 }, vis: 'bloom' },
      }),
      s1: { id: 's1', name: ['Cambuk Duri', 'Thorn Lash'], desc: ['Cambuk jarak jauh yang memperlambat lawan.', 'A long-range lash that slows the foe.'], anim: 'whip', su: .2, ac: .12, re: .36, dmg: 82, box: [.2, 3.3, .5, 1.5], kb: [4, 0], stun: .38, fx: { slow: 2.5 }, cd: 3.5, ai: [1.8, 3.4] },
      ult: { id: 'ult', name: ['Golem Hutan', 'Forest Golem'], desc: ['Memanggil golem hutan selama 5 detik yang mengejar lawan dan menghantam tanah, memperlambat lawan. Golem bisa diserang lawan dan hancur.', 'Summons a forest golem for 5 seconds that chases the foe and pounds the ground, slowing them. The foe can attack and destroy it.'], anim: 'slam', su: .4, ac: .2, re: .55, dmg: 0, spawn: 'golem', ult: true, inv: true, ai: [0, 9] },
    },
  },
  {
    id: 'kiting', name: 'Kiting Man', elem: 'netral', price: 700, tough: true,
    role: ['Petarung MMA', 'MMA Fighter'], style: ['Jarak sangat dekat: bantingan menembus tangkisan, lalu memukuli lawan yang terjatuh. Pasif Tahan Banting: bangun lebih cepat, bantingan memulihkan stamina.', 'Very close range: throws break through guard, then pounds the downed foe. Passive Tough: gets up faster, throws restore stamina.'],
    hp: 1060, spd: 4.5, atk: 1.08, def: 1.02, jump: 11, tempo: .95, stats: [4, 4, 3, 1],
    look: { h: 1.02, bulk: 1.12, sh: 1.12, skin: 0x8d5a3b, c1: 0x2a2a36, c2: 0xd3202e, hair: 0x1a120c, style: 'afro' },
    moves: kitingMoves(),
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
  /** hardcore: kombo selalu penuh, dash-cancel untuk menekan terus, kebal & gerakan tipuan. Damage/HP tetap sama. */
  hard?: boolean;
}
export const BOT_LEVELS: BotLevel[] = [
  { id: 'pemula', name: ['Pemula', 'Beginner'], goal: ['Belajar kontrol', 'Learn the controls'], react: [.6, .8], think: [.55, 1.0], aggr: .32, block: .06, dodge: 0, punish: 0, combo: 1, skill: .08, ult: .1, elem: false, arena: false, read: false },
  { id: 'normal', name: ['Normal', 'Normal'], goal: ['Pemain kasual', 'Casual players'], react: [.35, .5], think: [.35, .65], aggr: .5, block: .28, dodge: .04, punish: .2, combo: 2, skill: .3, ult: 1, elem: false, arena: false, read: false },
  { id: 'mahir', name: ['Mahir', 'Expert'], goal: ['Pemain menengah', 'Intermediate players'], react: [.2, .3], think: [.22, .45], aggr: .62, block: .52, dodge: .22, punish: .65, combo: 3, skill: .5, ult: 1, elem: true, arena: true, read: false },
  { id: 'master', name: ['Master', 'Master'], goal: ['Tantangan akhir', 'The final challenge'], react: [.12, .18], think: [.15, .32], aggr: .66, block: .78, dodge: .4, punish: .9, combo: 3, skill: .6, ult: 1, elem: true, arena: true, read: true },
  { id: 'hardcore', name: ['Hardcore', 'Hardcore'], goal: ['Kombo tanpa henti', 'Relentless combos'], react: [.08, .12], think: [.08, .2], aggr: .8, block: .8, dodge: .55, punish: .95, combo: 3, skill: .65, ult: 1, elem: true, arena: true, read: true, hard: true },
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
export const ELEM_ARENA: Record<Elem, string> = { air: 'kuil', api: 'magma', batu: 'gunung', angin: 'awan', petir: 'menara', tumbuhan: 'hutan', netral: 'dojo' };
/** Rival final: karakter yang elemennya kuat melawan elemen pemain. */
export function rivalOf(c: CharDef): CharDef {
  // elemen netral tidak punya penekan: rival final = Terrok, petarung jarak dekat yang paling kuat
  return CHARS.find(o => ELEMS[o.elem].strong.includes(c.elem) && o.id !== c.id) || charById('terrok');
}
