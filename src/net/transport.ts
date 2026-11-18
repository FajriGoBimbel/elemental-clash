// Lapisan soket jaringan lokal. Empat implementasi dengan perilaku yang sama:
//  - native : plugin Capacitor "Lan" (Android) — UDP + TCP sungguhan di Wi-Fi/hotspot, tanpa internet.
//  - web    : versi browser (mis. Vercel) — WebRTC DataChannel antar-perangkat; internet hanya untuk
//             perkenalan awal lewat server sinyal PeerJS, data permainan mengalir langsung (P2P) di Wi-Fi yang sama.
//  - relay  : khusus `npm run dev` — paket diteruskan lewat kanal HMR server dev Vite, untuk uji di browser HP.
//  - tab    : BroadcastChannel antar-tab browser yang sama (`?lan=tab`), untuk uji otomatis.
// Relay dan tab meniru UDP/TCP di atas "bus" siaran, sehingga logika protokol di host.ts/client.ts sama persis.
import { Capacitor, registerPlugin } from '@capacitor/core';

export type NetEv =
  | { t: 'udp'; host: string; port: number; data: string }
  | { t: 'open'; id: number; host: string }
  | { t: 'data'; id: number; data: string }
  | { t: 'close'; id: number };

export interface Sock {
  kind: 'native' | 'relay' | 'tab' | 'web';
  /** host: daftarkan kode ruangan agar bisa ditemukan (hanya transport web) */
  serve?(code: string): Promise<void>;
  /** kontroler: arahkan pencarian ke ruangan dengan kode ini (hanya transport web) */
  target?(code: string): void;
  name(): Promise<string>;
  /** port 0 = port acak; mengembalikan port yang dipakai */
  udpBind(port: number): Promise<number>;
  /** host '*' = siaran ke semua perangkat di jaringan lokal */
  udpSend(host: string, port: number, data: string): void;
  tcpListen(port: number): Promise<void>;
  tcpConnect(host: string, port: number): Promise<number>;
  tcpSend(id: number, data: string): void;
  tcpClose(id: number): void;
  closeAll(): void;
  on(cb: (e: NetEv) => void): () => void;
}

// ---------- native (Android) ----------
interface LanPlugin {
  info(): Promise<{ name: string }>;
  udpBind(o: { port: number }): Promise<{ port: number }>;
  udpSend(o: { host: string; port: number; data: string }): Promise<void>;
  tcpListen(o: { port: number }): Promise<void>;
  tcpConnect(o: { host: string; port: number; timeout: number }): Promise<{ id: number }>;
  tcpSend(o: { id: number; data: string }): Promise<void>;
  tcpClose(o: { id: number }): Promise<void>;
  closeAll(): Promise<void>;
  addListener(ev: 'net', cb: (e: NetEv) => void): Promise<{ remove(): void }>;
}
class NativeSock implements Sock {
  kind = 'native' as const; private p = registerPlugin<LanPlugin>('Lan'); private cbs = new Set<(e: NetEv) => void>();
  constructor() { this.p.addListener('net', e => this.cbs.forEach(c => c(e))); }
  async name() { try { return (await this.p.info()).name; } catch { return 'Android'; } }
  async udpBind(port: number) { return (await this.p.udpBind({ port })).port; }
  udpSend(host: string, port: number, data: string) { this.p.udpSend({ host, port, data }).catch(() => { }); }
  tcpListen(port: number) { return this.p.tcpListen({ port }); }
  async tcpConnect(host: string, port: number) { return (await this.p.tcpConnect({ host, port, timeout: 3000 })).id; }
  tcpSend(id: number, data: string) { this.p.tcpSend({ id, data }).catch(() => { }); }
  tcpClose(id: number) { this.p.tcpClose({ id }).catch(() => { }); }
  closeAll() { this.p.closeAll().catch(() => { }); }
  on(cb: (e: NetEv) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
}

// ---------- jaringan virtual di atas bus siaran ----------
export interface Bus { post(m: any): void; onmsg: (m: any) => void; serve?(code: string): Promise<void>; target?(code: string): void; reset?(): void }
type VConn = { peer: string; rc: number };
export class VirtualSock implements Sock {
  readonly addr = 'v' + Math.random().toString(16).slice(2, 8);
  private udp = 0; private listen = new Set<number>(); private conns = new Map<number, VConn>(); private nid = 1;
  private wait = new Map<number, (c: VConn | null) => void>(); private cbs = new Set<(e: NetEv) => void>();
  constructor(public kind: 'relay' | 'tab' | 'web', private bus: Bus, private label = 'Browser') {
    bus.onmsg = m => this.recv(m);
    if (bus.serve) this.serve = c => bus.serve!(c);
    if (bus.target) this.target = c => bus.target!(c);
  }
  serve?: (code: string) => Promise<void>; target?: (code: string) => void;
  private emit(e: NetEv) { this.cbs.forEach(c => c(e)); }
  private recv(m: any) {
    if (m.d !== '*' && m.d !== this.addr) return;
    if (m.s === this.addr) return;
    switch (m.k) {
      case 'u': if (this.udp && m.p === this.udp) this.emit({ t: 'udp', host: m.s, port: m.sp, data: m.x }); break;
      case 'c': // permintaan sambungan TCP
        if (!this.listen.has(m.p)) { this.bus.post({ k: 'a', s: this.addr, d: m.s, c: m.c, rc: 0 }); break; }
        { const id = this.nid++; this.conns.set(id, { peer: m.s, rc: m.c }); this.bus.post({ k: 'a', s: this.addr, d: m.s, c: m.c, rc: id }); this.emit({ t: 'open', id, host: m.s }); }
        break;
      case 'a': this.wait.get(m.c)?.(m.rc ? { peer: m.s, rc: m.rc } : null); break;
      case 't': if (this.conns.has(m.c)) this.emit({ t: 'data', id: m.c, data: m.x }); break;
      case 'x': if (this.conns.delete(m.c)) this.emit({ t: 'close', id: m.c }); break;
    }
  }
  async name() { return this.label; }
  async udpBind(port: number) { this.udp = port || 40000 + Math.floor(Math.random() * 20000); return this.udp; }
  udpSend(host: string, port: number, data: string) { this.bus.post({ k: 'u', s: this.addr, sp: this.udp, d: host, p: port, x: data }); }
  async tcpListen(port: number) { this.listen.add(port); }
  tcpConnect(host: string, port: number) {
    const id = this.nid++;
    return new Promise<number>((res, rej) => {
      const to = setTimeout(() => { this.wait.delete(id); rej(new Error('timeout')); }, 3000);
      this.wait.set(id, c => { clearTimeout(to); this.wait.delete(id); if (!c) return rej(new Error('refused')); this.conns.set(id, c); res(id); });
      this.bus.post({ k: 'c', s: this.addr, d: host, p: port, c: id });
    });
  }
  tcpSend(id: number, data: string) { const c = this.conns.get(id); if (c) this.bus.post({ k: 't', s: this.addr, d: c.peer, c: c.rc, x: data }); }
  tcpClose(id: number) { const c = this.conns.get(id); if (!c) return; this.conns.delete(id); this.bus.post({ k: 'x', s: this.addr, d: c.peer, c: c.rc }); }
  closeAll() { for (const id of [...this.conns.keys()]) this.tcpClose(id); this.listen.clear(); this.udp = 0; this.bus.reset?.(); }
  on(cb: (e: NetEv) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
}

// ---------- web: WebRTC lewat PeerJS ----------
// Host mendaftar di server sinyal dengan ID turunan kode ruangan; kontroler menyambung ke ID itu.
// Topologi bintang: kontroler hanya bicara dengan host, jadi "siaran" kontroler cukup dikirim ke host.
// Server sinyal bisa diganti (mis. PeerServer sendiri) lewat VITE_PEER_HOST/PORT/PATH/SECURE.
const PEER_PREFIX = 'elemental-clash-v1-';
type PeerMod = typeof import('peerjs');
type PConn = import('peerjs').DataConnection;
type PPeer = import('peerjs').Peer;
function peerOpts() {
  const e = import.meta.env, o: Record<string, unknown> = { debug: 0 };
  if (e.VITE_PEER_HOST) { o.host = e.VITE_PEER_HOST; o.port = +(e.VITE_PEER_PORT || 443); o.path = e.VITE_PEER_PATH || '/'; o.secure = e.VITE_PEER_SECURE !== 'false'; }
  return o;
}
export class PeerBus implements Bus {
  onmsg: (m: any) => void = () => { };
  private mod: Promise<PeerMod> | null = null;
  private hosts: PPeer[] = [];                 // host: satu Peer per kode (kode lama tetap hidup untuk sambungan lama)
  private byAddr = new Map<string, PConn>();   // host: alamat virtual kontroler → sambungan
  private me: PPeer | null = null; private meReady: Promise<PPeer> | null = null; // kontroler
  private conn: PConn | null = null; private code = ''; private tryAt = 0;
  private load() { return this.mod ??= import('peerjs'); }
  private hook(c: PConn) {
    c.on('data', d => { const m = d as any; if (m && typeof m === 'object') { if (m.s && this.hosts.length) this.byAddr.set(m.s, c); this.onmsg(m); } });
    const gone = () => { for (const [a, x] of this.byAddr) if (x === c) this.byAddr.delete(a); if (this.conn === c) this.conn = null; };
    c.on('close', gone); c.on('error', gone);
  }
  async serve(code: string) {
    const { Peer } = await this.load();
    await new Promise<void>((res, rej) => {
      const p = new Peer(PEER_PREFIX + code, peerOpts() as any);
      const to = setTimeout(() => { p.destroy(); rej(new Error('timeout')); }, 12000);
      p.on('open', () => { clearTimeout(to); this.hosts.push(p); res(); });
      p.on('error', (e: any) => { if (!this.hosts.includes(p)) { clearTimeout(to); p.destroy(); rej(Object.assign(new Error(e.type || 'peer'), { type: e.type })); } });
      p.on('connection', c => { this.hook(c); });
      p.on('disconnected', () => { if (this.hosts.includes(p) && !p.destroyed) setTimeout(() => !p.destroyed && p.reconnect(), 1000); }); // tetap bisa ditemukan
    });
  }
  target(code: string) { if (code !== this.code) { this.conn?.close(); this.conn = null; this.code = code; this.tryAt = 0; } this.dial(); }
  private dial() {
    if (!this.code || (this.conn && this.conn.open) || performance.now() - this.tryAt < 2500) return;
    this.tryAt = performance.now(); const code = this.code;
    this.meReady ??= this.load().then(({ Peer }) => new Promise<PPeer>((res, rej) => {
      const p = new Peer(peerOpts() as any); p.on('open', () => { this.me = p; res(p); });
      p.on('error', (e: any) => { if (!this.me) { this.meReady = null; p.destroy(); rej(e); } });
      p.on('disconnected', () => { if (!p.destroyed) setTimeout(() => !p.destroyed && p.reconnect(), 1000); });
    }));
    this.meReady.then(p => {
      if (code !== this.code || (this.conn && this.conn.open)) return;
      this.conn?.close(); const c = this.conn = p.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' }); this.hook(c);
    }).catch(() => { });
  }
  post(m: any) {
    if (this.hosts.length) { // host
      if (m.d === '*') { for (const c of new Set(this.byAddr.values())) if (c.open) c.send(m); }
      else { const c = this.byAddr.get(m.d); if (c?.open) c.send(m); }
    } else if (this.conn?.open) this.conn.send(m);
    else this.dial(); // belum/terputus: sambung lagi; pencarian ClientLink mengulang setiap 400 ms
  }
  /** Lepas semua sambungan; dihancurkan sedikit tertunda agar pesan pamit sempat terkirim. */
  reset() {
    const hosts = this.hosts, conn = this.conn; this.hosts = []; this.byAddr.clear(); this.conn = null; this.code = '';
    setTimeout(() => { hosts.forEach(p => p.destroy()); conn?.close(); }, 300);
  }
}

function browserName() {
  const ua = navigator.userAgent, m = ua.match(/Android [\d.]+; ([^;)]+)/);
  return m ? m[1].replace(/ Build.*/, '').trim() : /iPhone|iPad/.test(ua) ? (ua.includes('iPad') ? 'iPad' : 'iPhone') : 'Browser';
}

let sock: Sock | null | undefined;
/** Soket jaringan lokal yang tersedia di perangkat ini, atau null (mis. PWA di browser biasa). */
export function getSock(): Sock | null {
  if (sock !== undefined) return sock;
  const q = new URLSearchParams(location.search).get('lan');
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Lan')) sock = new NativeSock();
  else if (q === 'tab' && 'BroadcastChannel' in window) {
    const ch = new BroadcastChannel('ec-lan'), bus: Bus = { post: m => ch.postMessage(m), onmsg: () => { } };
    ch.onmessage = e => bus.onmsg(e.data);
    sock = new VirtualSock('tab', bus, browserName() + ' ' + Math.random().toString(36).slice(2, 5).toUpperCase());
  } else if (import.meta.hot && q !== 'off' && q !== 'web') {
    const hot = import.meta.hot, bus: Bus = { post: m => hot.send('ec:lan', m), onmsg: () => { } };
    hot.on('ec:lan', m => bus.onmsg(m));
    sock = new VirtualSock('relay', bus, browserName());
  } else if (q !== 'off' && 'RTCPeerConnection' in window) sock = new VirtualSock('web', new PeerBus(), browserName());
  else sock = null;
  return sock;
}
