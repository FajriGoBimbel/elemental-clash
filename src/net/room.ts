// Protokol Main Bareng: host (menjalankan pertandingan) dan kontroler (hanya mengirim input).
// - Penemuan host : kontroler menyiarkan {find, code} lewat UDP; hanya host dengan kode itu yang menjawab.
// - Sesi (TCP)    : hello → wait (menunggu izin host) → ok {slot, tok} / deny; lalu perintah menu & layar.
// - Input (UDP)   : 60×/dtk, tiap paket membawa 3 frame terakhir agar paket hilang tidak terasa.
// - Umpan balik   : UDP dari host (HP, energi, cooldown, getar). Paket UDP tanpa token sesi yang sah dibuang.
import { Input, noInput } from '../game/fighter';
import type { NetEv, Sock } from './transport';

export const UDP_PORT = 47820, TCP_PORT = 47821;
export const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 simbol, tanpa O dan I
export const DROP_MS = 2500, RECONNECT_MS = 15000, SEARCH_MS = 10000;
export function newCode() { return [...crypto.getRandomValues(new Uint8Array(6))].map(x => CODE_ABC[x & 31]).join(''); }
const newTok = () => [...crypto.getRandomValues(new Uint8Array(8))].map(x => x.toString(16).padStart(2, '0')).join('');
const now = () => performance.now();
const parse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

const BITS = ['up', 'down', 'block', 'atk', 's1', 's2', 'dash', 'ult'] as const;
const EDGE = ['atk', 's1', 's2', 'dash', 'ult'] as const;
export type Frame = [number, number];
export function pack(i: Input): Frame { let b = 0; BITS.forEach((k, n) => { if (i[k]) b |= 1 << n; }); return [Math.round(i.mx * 100), b]; }

/** Input jarak jauh untuk satu pemain. Tombol sekali-tekan dikumpulkan sampai dibaca simulasi. */
export class RemoteInput {
  private held = noInput(); private edges = noInput(); lastSeq = -1;
  push(seq: number, frames: Frame[]) {
    if (!Array.isArray(frames)) return;
    for (let k = Math.min(frames.length, 3) - 1; k >= 0; k--) {
      const s = seq - k, f = frames[k]; if (s <= this.lastSeq || !Array.isArray(f)) continue;
      this.lastSeq = s; const b = f[1] | 0;
      this.held.mx = Math.max(-1, Math.min(1, (f[0] | 0) / 100)); this.held.up = !!(b & 1); this.held.down = !!(b & 2); this.held.block = !!(b & 4);
      EDGE.forEach(e => { if (b & (1 << BITS.indexOf(e))) this.edges[e] = true; });
    }
  }
  read(): Input { const i = { ...this.held }; for (const e of EDGE) { i[e] = this.edges[e]; this.edges[e] = false; } return i; }
  release() { this.held = noInput(); this.edges = noInput(); }
}

// ---------------- host ----------------
export interface Peer { slot: number; name: string; tok: string; conn: number; host: string; uport: number; last: number; up: boolean; rtt: number; ts: number; dropAt: number }
export interface Req { conn: number; name: string }
export type DenyWhy = 'code' | 'full' | 'reject' | 'closed';

export class HostRoom {
  code = newCode(); peers: (Peer | null)[] = [null, null]; reqs: Req[] = []; input = [new RemoteInput(), new RemoteInput()];
  onChange = () => { }; onCmd = (_slot: number, _m: any) => { }; onJoin = (_slot: number) => { }; onDrop = (_slot: number) => { }; onBack = (_slot: number) => { };
  private conns = new Map<number, string>(); private off: (() => void) | null = null; private timer = 0; private bz = 0;
  constructor(private sock: Sock, public slots: number[], public hostName: string) { }

  async open() {
    this.off = this.sock.on(e => this.ev(e));
    await this.sock.udpBind(UDP_PORT); await this.sock.tcpListen(TCP_PORT);
    if (this.sock.serve) { // web: kode harus unik di server sinyal; bila sudah dipakai orang lain, buat kode baru
      for (let i = 0; ; i++) {
        try { await this.sock.serve(this.code); break; } catch (e: any) { if (e?.type !== 'unavailable-id' || i >= 4) { this.off?.(); throw e; } this.code = newCode(); }
      }
    }
    this.timer = setInterval(() => this.tick(), 200) as unknown as number;
  }
  close() {
    for (const p of this.peers) if (p?.up) this.sock.tcpSend(p.conn, JSON.stringify({ t: 'bye' }));
    for (const r of this.reqs) this.sock.tcpSend(r.conn, JSON.stringify({ t: 'deny', why: 'closed' }));
    setTimeout(() => this.sock.closeAll(), 150); this.off?.(); clearInterval(this.timer);
  }
  regen() {
    const c = newCode();
    if (!this.sock.serve) { this.code = c; this.onChange(); return; }
    this.sock.serve(c).then(() => { this.code = c; this.onChange(); }, (e: any) => { if (e?.type === 'unavailable-id') this.regen(); }); // web: pakai kode baru setelah terdaftar
  }
  remote(slot: number) { return this.slots.includes(slot); }
  ready(slot: number) { return !!this.peers[slot]?.up; }

  private ev(e: NetEv) {
    if (e.t === 'udp') {
      const m = parse(e.data); if (!m) return;
      if (m.t === 'find') { if (m.code === this.code) this.sock.udpSend(e.host, e.port, JSON.stringify({ t: 'here', code: this.code, name: this.hostName, tcp: TCP_PORT })); return; }
      const p = this.peers.find(x => x && x.tok === m.k); if (!p || !p.up) return; // token tidak sah / sedang terputus
      p.last = now(); p.ts = m.ts; if (m.r) p.rtt = m.r; p.host = e.host; p.uport = e.port;
      if (m.t === 'in') { this.input[p.slot].push(m.s, m.f); if (m.s % 4 === 0) this.udp(p, { t: 'hb', ts: m.ts }); }
      else if (m.t === 'hb') this.udp(p, { t: 'hb', ts: m.ts });
    } else if (e.t === 'open') this.conns.set(e.id, e.host);
    else if (e.t === 'data') { const m = parse(e.data); if (m) this.msg(e.id, m); }
    else {
      this.conns.delete(e.id);
      const n = this.reqs.length; this.reqs = this.reqs.filter(r => r.conn !== e.id); if (n !== this.reqs.length) this.onChange();
      const p = this.peers.find(x => x && x.conn === e.id); if (p) this.lose(p);
    }
  }
  private msg(id: number, m: any) {
    const host = this.conns.get(id); if (host === undefined) return;
    if (m.t === 'hello') {
      const p = m.tok ? this.peers.find(x => x && x.tok === m.tok) : null;
      if (p) { // sambung ulang: tanpa kode ulang dan tanpa izin ulang
        const old = p.conn, was = p.up; p.conn = id; p.host = host; p.uport = m.uport; p.last = now(); p.up = true;
        if (old !== id) this.sock.tcpClose(old);
        this.send(p.slot, { t: 'ok', slot: p.slot, tok: p.tok, host: this.hostName });
        this.onBack(p.slot); this.onChange(); return; // selalu: kontroler yang dimuat ulang butuh layar terkini meski host belum sempat menandainya putus
      }
      if (m.code !== this.code) return this.deny(id, 'code');
      if (this.slots.filter(s => !this.peers[s]).length - this.reqs.length <= 0) return this.deny(id, 'full');
      this.reqs.push({ conn: id, name: String(m.name || '?').slice(0, 24), uport: m.uport } as Req & { uport: number });
      this.sock.tcpSend(id, JSON.stringify({ t: 'wait' })); this.onChange();
      return;
    }
    const p = this.peers.find(x => x && x.conn === id); if (!p) return;
    p.last = now(); if (m.t === 'cmd') this.onCmd(p.slot, m);
  }
  approve(conn: number, yes: boolean) {
    const r = this.reqs.find(x => x.conn === conn) as (Req & { uport: number }) | undefined; if (!r) return;
    this.reqs = this.reqs.filter(x => x !== r);
    const slot = this.slots.find(s => !this.peers[s]);
    if (!yes || slot === undefined) { this.deny(conn, yes ? 'full' : 'reject'); this.onChange(); return; }
    const p: Peer = { slot, name: r.name, tok: newTok(), conn, host: this.conns.get(conn) || '', uport: r.uport, last: now(), up: true, rtt: 0, ts: 0, dropAt: 0 };
    this.peers[slot] = p; this.input[slot] = new RemoteInput();
    this.send(slot, { t: 'ok', slot, tok: p.tok, host: this.hostName }); this.onJoin(slot); this.onChange();
  }
  private deny(id: number, why: DenyWhy) { this.sock.tcpSend(id, JSON.stringify({ t: 'deny', why })); setTimeout(() => this.sock.tcpClose(id), 300); }
  private lose(p: Peer) {
    if (!p.up) return; p.up = false; p.dropAt = now(); this.input[p.slot].release();
    this.sock.tcpClose(p.conn); this.onDrop(p.slot); this.onChange();
  }
  kick(slot: number) { const p = this.peers[slot]; if (!p) return; if (p.up) { this.send(slot, { t: 'bye' }); setTimeout(() => this.sock.tcpClose(p.conn), 200); } this.peers[slot] = null; this.onChange(); }
  private tick() { const t = now(); for (const p of this.peers) if (p?.up && t - p.last > DROP_MS) this.lose(p); }
  private udp(p: Peer, m: object) { this.sock.udpSend(p.host, p.uport, JSON.stringify(m)); }
  send(slot: number, m: object) { const p = this.peers[slot]; if (p?.up) this.sock.tcpSend(p.conn, JSON.stringify(m)); }
  fb(slot: number, d: object) { const p = this.peers[slot]; if (p?.up) this.udp(p, { t: 'fb', ts: p.ts, ...d }); }
  buzz(slot: number, k: 'hit' | 'hurt' | 'ult') { const p = this.peers[slot]; if (!p?.up) return; const m = { t: 'bz', k, n: ++this.bz }; this.udp(p, m); this.udp(p, m); }
  /** 0–3 batang sinyal */
  sig(slot: number) { const p = this.peers[slot]; if (!p?.up) return 0; const age = now() - p.last; return age > 1000 ? 1 : sigOf(p.rtt); }
}
export const sigOf = (rtt: number) => rtt <= 0 ? 3 : rtt < 60 ? 3 : rtt < 140 ? 2 : 1;

// ---------------- kontroler ----------------
export type CState = 'idle' | 'search' | 'wait' | 'in' | 'lost' | 'fail';
export class ClientLink {
  state: CState = 'idle'; why: DenyWhy | 'notfound' | 'lost' | '' = ''; slot = -1; tok = ''; hostName = ''; code = ''; rtt = 0; lastRx = 0;
  onState = () => { }; onMsg = (_m: any) => { }; onFb = (_m: any) => { }; onBuzz = (_k: string) => { };
  private conn = -1; private host = ''; private uport = 0; private seq = 0; private hist: Frame[] = []; private reader: (() => Input) | null = null;
  private off: (() => void) | null = null; private timer = 0; private inTimer = 0; private attempt = 0; private bzN = 0; private connecting = false;
  constructor(private sock: Sock, private name: string) { }

  async start() { this.off = this.sock.on(e => this.ev(e)); this.uport = await this.sock.udpBind(0); this.timer = setInterval(() => this.tick(), 200) as unknown as number; }
  join(code: string) { this.code = code; this.tok = ''; this.sock.target?.(code); this.search(SEARCH_MS); }
  /** Menyambung lagi dengan token lama (mis. setelah halaman dimuat ulang). */
  resume(code: string, tok: string) { this.code = code; this.tok = tok; this.sock.target?.(code); this.search(RECONNECT_MS); }
  private set(s: CState, why: ClientLink['why'] = '') { this.state = s; this.why = why; this.onState(); }
  private search(ms: number) {
    const id = ++this.attempt, t0 = now(); this.connecting = false;
    this.set(this.tok ? 'lost' : 'search');
    const ping = () => {
      if (id !== this.attempt || (this.state !== 'search' && this.state !== 'lost')) return;
      if (now() - t0 > ms) { this.attempt++; this.set('fail', this.tok ? 'lost' : 'notfound'); return; }
      if (!this.connecting) this.sock.udpSend('*', UDP_PORT, JSON.stringify({ t: 'find', code: this.code }));
      setTimeout(ping, 400);
    };
    ping();
  }
  private async connect(host: string, port: number) {
    if (this.connecting) return; this.connecting = true; const id = this.attempt;
    try {
      const c = await this.sock.tcpConnect(host, port);
      if (id !== this.attempt) { this.sock.tcpClose(c); return; }
      this.conn = c; this.host = host;
      this.sock.tcpSend(c, JSON.stringify({ t: 'hello', code: this.code, name: this.name, tok: this.tok || undefined, uport: this.uport }));
    } catch { this.connecting = false; }
  }
  private ev(e: NetEv) {
    if (e.t === 'udp') {
      const m = parse(e.data); if (!m) return;
      if (m.t === 'here') { if (m.code === this.code && (this.state === 'search' || this.state === 'lost')) this.connect(e.host, m.tcp); return; }
      if (e.host !== this.host || this.state !== 'in') return;
      this.lastRx = now(); if (m.ts) this.rtt = this.rtt ? this.rtt * .8 + (now() - m.ts) * .2 : now() - m.ts;
      if (m.t === 'fb') this.onFb(m); else if (m.t === 'bz' && m.n !== this.bzN) { this.bzN = m.n; this.onBuzz(m.k); }
    } else if (e.t === 'data' && e.id === this.conn) {
      const m = parse(e.data); if (!m) return; this.lastRx = now();
      if (m.t === 'wait') this.set('wait');
      else if (m.t === 'ok') { this.slot = m.slot; this.tok = m.tok; this.hostName = m.host; this.attempt++; this.set('in'); }
      else if (m.t === 'deny') { this.attempt++; this.drop(); this.set('fail', m.why); }
      else if (m.t === 'bye') { this.attempt++; this.drop(); this.tok = ''; this.set('fail', 'closed'); }
      else this.onMsg(m);
    } else if (e.t === 'close' && e.id === this.conn) {
      this.conn = -1;
      if (this.state === 'in') this.lost(); else if (this.state === 'wait') this.set('fail', 'closed');
    }
  }
  private drop() { if (this.conn >= 0) this.sock.tcpClose(this.conn); this.conn = -1; }
  private lost() { this.drop(); this.search(RECONNECT_MS); }
  private tick() {
    if (this.state !== 'in') return;
    if (now() - this.lastRx > DROP_MS) { this.lost(); return; }
    if (!this.reader) this.sock.udpSend(this.host, UDP_PORT, JSON.stringify({ t: 'hb', k: this.tok, ts: now(), r: Math.round(this.rtt) }));
  }
  /** Mulai/berhenti mengirim input 60×/dtk. */
  setReader(fn: (() => Input) | null) {
    this.reader = fn; clearInterval(this.inTimer); this.hist = [];
    if (fn) this.inTimer = setInterval(() => this.sendInput(), 1000 / 60) as unknown as number;
  }
  private sendInput() {
    if (!this.reader) return; const i = this.reader();
    if (this.state !== 'in') return;
    this.hist.unshift(pack(i)); if (this.hist.length > 3) this.hist.length = 3;
    this.sock.udpSend(this.host, UDP_PORT, JSON.stringify({ t: 'in', k: this.tok, s: ++this.seq, ts: now(), r: Math.round(this.rtt), f: this.hist }));
  }
  cmd(a: string, v?: string | number | boolean) { if (this.conn >= 0 && this.state === 'in') this.sock.tcpSend(this.conn, JSON.stringify({ t: 'cmd', a, v })); }
  get sig() { return this.state !== 'in' ? 0 : now() - this.lastRx > 1000 ? 1 : sigOf(this.rtt); }
  cancel() { this.attempt++; this.drop(); this.tok = ''; this.set('idle'); }
  leave() { this.attempt++; this.setReader(null); this.drop(); this.sock.closeAll(); this.off?.(); clearInterval(this.timer); this.state = 'idle'; }
}
