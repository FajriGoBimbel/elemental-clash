// Uji protokol Main Bareng tanpa perangkat: host + 3 kontroler di jaringan virtual dalam satu proses,
// dengan opsi kehilangan paket UDP. Pakai: npx tsx scripts/nettest.ts
import { VirtualSock, Bus } from '../src/net/transport';
import { HostRoom, ClientLink } from '../src/net/room';
import { noInput } from '../src/game/fighter';

let loss = 0, blackhole = new Set<string>();
const peers: { s: VirtualSock; bus: Bus }[] = [];
function mk(name: string) {
  const bus: Bus = { post: m => { for (const p of peers) if (p.bus !== bus) {
    if (m.k === 'u' && Math.random() < loss) continue;
    if (blackhole.has(m.s) || blackhole.has(p.s.addr)) continue;
    // UDP boleh tiba acak; TCP (k: c/a/t/x) harus berurutan seperti TCP sungguhan
    setTimeout(() => p.bus.onmsg(structuredClone(m)), m.k === 'u' ? 2 + Math.random() * 6 : 4); } }, onmsg: () => { } };
  const s = new VirtualSock('tab', bus, name); peers.push({ s, bus }); return s;
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 12000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); await wait(20); } };
let ok = 0, bad = 0; const check = (c: boolean, msg: string) => { console.log((c ? '  ok  ' : '  GAGAL ') + msg); c ? ok++ : bad++; };

const hs = mk('Tablet'), host = new HostRoom(hs, [0, 1], 'Tablet');
const drops: number[] = [], backs: number[] = [];
host.onDrop = s => drops.push(s); host.onBack = s => backs.push(s);
await host.open();
const c1 = new ClientLink(mk('HP-A'), 'HP-A'), c2 = new ClientLink(mk('HP-B'), 'HP-B'), c3 = new ClientLink(mk('HP-C'), 'HP-C');
for (const c of [c1, c2, c3]) await c.start();

console.log('1) kode salah → gagal dengan alasan notfound (dipercepat)');
const cw = new ClientLink(mk('HP-W'), 'HP-W'); await cw.start();
(cw as any).search = ((orig: any) => function (this: any) { return orig.call(this, 1500); })((cw as any).search);
cw.join('ZZZZZZ'); await until(() => cw.state === 'fail'); check(cw.why === 'notfound', 'kode salah: ' + cw.why);

console.log('2) pairing + izin host');
let t0 = performance.now(); c1.join(host.code); await until(() => host.reqs.length === 1);
await until(() => c1.state === 'wait'); check(true, 'kontroler menunggu izin'); host.approve(host.reqs[0].conn, true);
await until(() => c1.state === 'in'); check(c1.slot === 0, `terhubung slot 0 dalam ${Math.round(performance.now() - t0)} ms`);
c2.join(host.code); await until(() => host.reqs.length === 1); host.approve(host.reqs[0].conn, false);
await until(() => c2.state === 'fail'); check(c2.why === 'reject', 'ditolak host: ' + c2.why);
c2.join(host.code); await until(() => host.reqs.length === 1); host.approve(host.reqs[0].conn, true); await until(() => c2.state === 'in');
check(c2.slot === 1, 'kontroler kedua slot 1');
c3.join(host.code); await until(() => c3.state === 'fail'); check(c3.why === 'full', 'kontroler ketiga: ' + c3.why);

console.log('3) input 60/dtk dengan 5% paket hilang');
loss = .05; let n = 0, pressed = 0, got = 0;
c1.setReader(() => { n++; const i = noInput(); i.mx = 1; if (n % 30 === 0) { i.atk = true; pressed++; } return i; });
const iv = setInterval(() => { const i = host.input[0].read(); if (i.atk) got++; }, 1000 / 60);
await wait(3000); c1.setReader(null); await wait(100); clearInterval(iv);
check(host.input[0].read().mx === 1, 'arah joystick sampai');
check(got >= pressed - 1, `tombol serang: ditekan ${pressed}, diterima ${got}`);
check(c1.rtt > 0 && c1.rtt < 50, `rtt kontroler ${c1.rtt.toFixed(1)} ms`);
loss = 0;

console.log('4) putus koneksi dan sambung ulang otomatis');
blackhole.add((c1 as any).sock.addr); await until(() => drops.includes(0), 5000); check(true, 'host mendeteksi putus');
await wait(1500); blackhole.clear();
await until(() => backs.includes(0) && c1.state === 'in', 15000); check(c1.slot === 0, 'kontroler kembali ke slot 0 tanpa kode/izin ulang');

console.log('5) paket UDP tanpa token dibuang');
host.input[1].read(); (c3 as any).sock.udpSend((c2 as any).host, 47820, JSON.stringify({ t: 'in', k: 'palsu', s: 999, f: [[100, 8]] }));
await wait(100); check(!host.input[1].read().atk, 'input palsu diabaikan');

console.log('6) host menutup ruangan');
host.close(); await until(() => c1.state === 'fail' && c2.state === 'fail'); check(c1.why === 'closed', 'kontroler diberi tahu ruangan ditutup');
console.log(`\n${ok} lolos, ${bad} gagal`); process.exit(bad ? 1 : 0);
