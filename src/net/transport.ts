// Lapisan soket jaringan lokal. Tiga implementasi dengan perilaku yang sama:
//  - native : plugin Capacitor "Lan" (Android) — UDP + TCP sungguhan di Wi-Fi/hotspot, tanpa internet.
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
  kind: 'native' | 'relay' | 'tab';
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
export interface Bus { post(m: any): void; onmsg: (m: any) => void }
type VConn = { peer: string; rc: number };
export class VirtualSock implements Sock {
  readonly addr = 'v' + Math.random().toString(16).slice(2, 8);
  private udp = 0; private listen = new Set<number>(); private conns = new Map<number, VConn>(); private nid = 1;
  private wait = new Map<number, (c: VConn | null) => void>(); private cbs = new Set<(e: NetEv) => void>();
  constructor(public kind: 'relay' | 'tab', private bus: Bus, private label = 'Browser') {
    bus.onmsg = m => this.recv(m);
  }
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
  closeAll() { for (const id of [...this.conns.keys()]) this.tcpClose(id); this.listen.clear(); this.udp = 0; }
  on(cb: (e: NetEv) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
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
  } else if (import.meta.hot && q !== 'off') {
    const hot = import.meta.hot, bus: Bus = { post: m => hot.send('ec:lan', m), onmsg: () => { } };
    hot.on('ec:lan', m => bus.onmsg(m));
    sock = new VirtualSock('relay', bus, browserName());
  } else sock = null;
  return sock;
}
