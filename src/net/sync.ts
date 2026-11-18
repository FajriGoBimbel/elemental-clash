// Sinkronisasi pertarungan untuk mode "2 Layar": host tetap satu-satunya yang menghitung (Match.step),
// perangkat kedua hanya menerima snapshot keadaan + event lalu merendernya di layarnya sendiri.
// Objek yang dirujuk event (Fighter, Move, Ent, Pillar) dikirim sebagai penanda indeks/ID.
import { Fighter } from '../game/fighter';
import type { Match, Ent, Ev } from '../game/match';

const SKIP_F = new Set(['def', 'idx', 'move', 'buf']);
const M_KEYS = ['phase', 'pt', 'time', 'round', 'wins', 'winner', 'freeze', 'hitstop', 'slowmo', 'wind', 'windT', 'clock'] as const;
const r3 = (v: unknown) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;

function moveKey(m: Match, mv: unknown): [number, string] | null {
  for (const f of m.f) for (const k in f.def.moves) if (f.def.moves[k] === mv) return [f.idx, k];
  return null;
}
function enc(m: Match, v: any): any {
  if (v instanceof Fighter) return { $f: v.idx };
  if (v && typeof v === 'object') {
    if ('hitAt' in v && 'kind' in v && typeof v.id === 'number') return { $e: v.id };
    const pi = m.pillars.indexOf(v); if (pi >= 0) return { $p: pi };
    const mk = 'anim' in v && 'su' in v ? moveKey(m, v) : null; if (mk) return { $mv: mk };
  }
  return v;
}
const MISSING = Symbol('missing');
function dec(m: Match, ents: Map<number, Ent>, v: any): any {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if ('$f' in v) return m.f[v.$f];
    if ('$e' in v) return ents.get(v.$e) ?? MISSING;
    if ('$p' in v) return m.pillars[v.$p] ?? { x: 0, hp: 0 };
    if ('$mv' in v) return m.f[v.$mv[0]].def.moves[v.$mv[1]];
  }
  return v;
}

/** Host: keadaan pertarungan + event sejak snapshot sebelumnya. */
export function snapshot(m: Match, evs: Ev[]) {
  const f = m.f.map(x => {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(x)) if (!SKIP_F.has(k)) { const v = (x as any)[k]; if (typeof v !== 'object' || v === null) o[k] = r3(v); }
    o.mv = x.move ? moveKey(m, x.move)?.[1] ?? null : null;
    return o;
  });
  const ents = m.ents.map(e => ({ ...e, owner: e.owner ? e.owner.idx : -1 }));
  const mm: Record<string, unknown> = {}; for (const k of M_KEYS) mm[k] = r3(m[k] as unknown);
  const ev = evs.filter(e => e.t !== 'ent').map(e => { const o: Ev = { t: e.t }; for (const k in e) if (k !== 't') o[k] = enc(m, e[k]); return o; });
  return { m: mm, f, e: ents, p: m.pillars.map(p => p.hp), ev };
}

/** Perangkat kedua: menerapkan snapshot ke Match lokal (hanya untuk tampilan, tidak pernah di-step). */
export class Mirror {
  private ents = new Map<number, Ent>(); private gone = new Map<number, Ent>(); private n = -1;
  constructor(public m: Match) { }
  apply(s: any) {
    if (typeof s.n === 'number') { if (s.n <= this.n) return; this.n = s.n; } // paket UDP lama/terlambat dibuang
    const m = this.m;
    for (const k of M_KEYS) (m as any)[k] = s.m[k];
    s.f.forEach((o: any, i: number) => {
      const f = m.f[i] as any;
      for (const k in o) if (k !== 'mv') f[k] = o[k];
      f.move = o.mv ? f.def.moves[o.mv] ?? null : null;
    });
    s.p.forEach((hp: number, i: number) => { if (m.pillars[i]) m.pillars[i].hp = hp; });
    // entitas: objek dipertahankan per ID karena tampilan efek menyimpan rujukannya
    const live = new Set<number>(), fresh: Ent[] = [];
    for (const o of s.e) {
      live.add(o.id); let e = this.ents.get(o.id);
      if (!e) { e = {} as Ent; this.ents.set(o.id, e); fresh.push(e); }
      Object.assign(e, o, { owner: o.owner >= 0 ? m.f[o.owner] : null });
    }
    for (const [id, e] of this.ents) if (!live.has(id)) { this.ents.delete(id); this.gone.set(id, e); }
    while (this.gone.size > 64) this.gone.delete(this.gone.keys().next().value!);
    m.ents = [...live].map(id => this.ents.get(id)!);
    for (const e of fresh) m.events.push({ t: 'ent', e }); // event 'ent' dibuat ulang di sini agar tetap muncul walau paket hilang
    const all = new Map([...this.gone, ...this.ents]);
    ev: for (const o of s.ev) {
      const e: Ev = { t: o.t };
      for (const k in o) if (k !== 't') { const v = dec(m, all, o[k]); if (v === MISSING) continue ev; e[k] = v; } // rujukan entitas tak dikenal: lewati
      m.events.push(e);
    }
  }
}
