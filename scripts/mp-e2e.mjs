// Uji end-to-end Main Bareng (konfigurasi C): 1 host + 2 kontroler di 3 tab Chrome headless,
// tersambung lewat relay server dev. Pakai: npm run dev, lalu URL=http://localhost:5173 node scripts/mp-e2e.mjs <folder>
import puppeteer from 'puppeteer-core';
const out = process.argv[2] || '.', base = (process.env.URL || 'http://localhost:5173') + '/?skip';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
let host;
const errs = [], log = (...a) => console.log(...a);
async function open(name) {
  const p = await browser.newPage(); await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 1.5, isLandscape: true, hasTouch: true });
  p.on('pageerror', e => errs.push(name + ' PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/WakeLock/.test(m.text())) errs.push(name + ' ' + m.text()); }); // WakeLock ditolak di tab latar headless: wajar
  await p.goto(base, { waitUntil: 'load' }); await p.waitForFunction('window.__ec && document.querySelector(".menu")', { timeout: 90000 }); return p;
}
const click = async (p, sel) => { await p.waitForSelector(sel, { timeout: 20000 }); await p.$eval(sel, el => el.click()); };
const until = (p, js, t = 20000) => p.waitForFunction(js, { timeout: t, polling: 50 });
const shot = async (p, n) => { await p.bringToFront(); await p.screenshot({ path: `${out}/${n}.png` }); if (host && p !== host) { await host.bringToFront(); await wait(150); await host.evaluate(`__ec.fight && __ec.fight.paused && __ec.fight.pauseBy < 0 && document.querySelector('.over [data-a=resume]')?.click()`); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const check = (c, m) => { log((c ? '  ok    ' : '  GAGAL ') + m); c ? ok++ : bad++; };

try {
host = await open('host'); const c1 = await open('c1'), c2 = await open('c2');
await host.bringToFront(); await host.evaluate(`Object.defineProperty(document, 'hidden', { get: () => false })`); // tab latar di uji ini ≠ aplikasi host ke latar
await click(host, '[data-a="versus"]'); await shot(host, '01-host-menu-versus');
await click(host, '[data-a="cfg"][data-v="C"]'); await until(host, 'document.querySelectorAll(".code b").length === 6');
const code = await host.$$eval('.code b', b => b.map(x => x.textContent).join('')); log('kode ruangan', code);
await shot(host, '02-host-lobby');
for (const [c, n] of [[c1, 1], [c2, 2]]) {
  await click(c, '[data-a="versus"]'); await click(c, '[data-a="join"]'); await until(c, '!!document.querySelector(".keypad")');
  for (const ch of code) await click(c, `.keypad [data-v="${ch}"]`);
  if (n === 1) await shot(c, '03-ctl-join');
  const t0 = Date.now(); await click(c, '[data-a="go"]');
  await until(host, '!!document.querySelector(".over [data-a=yes]")'); if (n === 1) { await shot(host, '04-host-approve'); await shot(c, '05-ctl-wait'); }
  await click(host, '.over [data-a="yes"]'); await until(c, '!!document.querySelector(".ctop")');
  check(true, `kontroler ${n} terhubung dalam ${Date.now() - t0} ms (termasuk klik izin)`);
}
await until(host, '!!document.querySelector("#vp0")'); await wait(600); await shot(host, '06-host-select'); await shot(c1, '07-ctl-select');
await click(c1, '[data-a="next"]'); await wait(300);
const p0 = await host.evaluate('__ec.vs.picks[0]'); check(p0 !== 'aqualis', 'pilihan karakter dari kontroler sampai ke host: ' + p0);
await click(c2, '[data-a="pick"][data-v="' + p0 + '"]'); await wait(300);
await click(c1, '[data-a="ready"]'); await click(c2, '[data-a="ready"]');
await until(c1, '!!document.querySelector("[data-a=pure]")'); await until(host, '!!document.querySelector(".agrid")');
await shot(c1, '08-ctl-arena'); await shot(c2, '09-ctl-wait-arena');
await click(c1, '[data-a="next"]'); await wait(250); await shot(host, '10-host-arena');
await click(c1, '[data-a="ok"]'); await wait(500); log('host phase', await host.evaluate('__ec.vs.phase + " " + __ec.app.arena + " " + !!__ec.fight'));
await until(host, '__ec.fight && __ec.fight.started', 30000); await until(c1, '!!document.querySelector(".cpad")');
await wait(1500); await shot(host, '11-host-fight'); await shot(c1, '12-ctl-pad');
await until(host, '__ec.fight.m.phase === "fight"'); const x0 = await host.evaluate('__ec.fight.m.f[0].x');
await c1.keyboard.down('KeyD'); await wait(900); await c1.keyboard.up('KeyD');
const x1 = await host.evaluate('__ec.fight.m.f[0].x');
void ( await host.evaluate('JSON.stringify({seq: __ec.vs.room.input.map(i => i.lastSeq), up: __ec.vs.room.peers.map(p => p && p.up), paused: __ec.fight.paused, phase: __ec.fight.m.phase, st: __ec.fight.m.f[0].state})')); check(x1 > x0 + .5, `joystick kontroler 1 menggerakkan P1: x ${x0.toFixed(2)} → ${x1.toFixed(2)}`);
const n0 = await host.evaluate('__ec.fight.m.f[1].seq'); await c2.keyboard.press('KeyJ'); await wait(300);
check(await host.evaluate('__ec.fight.m.f[1].seq') > n0, 'tombol serang kontroler 2 memicu serangan P2');
const hp = await c1.$eval('.php i', e => e.style.width); check(!!hp, 'kontroler menerima HP dari host: ' + hp);
// HP kontroler memuat ulang halaman (mis. reload server dev / tab dibuang): harus menyambung lagi sendiri
await c1.bringToFront(); await c1.reload({ waitUntil: 'load' }); await until(c1, '!!document.querySelector(".cpad") && !!document.querySelector(".ctl .cb.atk")', 90000)
  .catch(async e => { log('DEBUG c1', await c1.evaluate(`JSON.stringify({ss: sessionStorage.getItem('ec-ctl'), ui: document.querySelector('#ui').innerHTML.slice(0, 400)})`)); throw e; });
check(await host.evaluate('__ec.vs.room.peers[0].up'), 'kontroler 1 dimuat ulang → tersambung lagi otomatis, joystick & tombol tampil lagi');
if (await c1.$('.cpause [data-a=resume]')) { await click(c1, '.cpause [data-a="resume"]'); } await until(host, '!__ec.fight.paused', 8000).catch(() => { });
await shot(c1, '12b-ctl-after-reload');
// jeda dari kontroler 2
await click(c2, '[data-a="pause"]'); await until(host, '__ec.fight.paused'); await until(c2, '!!document.querySelector(".cpause [data-a=resume]")');
check(!(await c1.$('.cpause [data-a=resume]')), 'kontroler lain tidak bisa melanjutkan jeda');
await shot(host, '13-host-pause'); await shot(c2, '14-ctl-pause');
await click(c2, '.cpause [data-a="resume"]'); await until(host, '!__ec.fight.paused'); check(true, 'pemain yang menjeda bisa melanjutkan');
// putus: tutup tab kontroler 2
await c2.close(); await until(host, '__ec.fight.dropSlot === 1', 8000); await wait(400); await shot(host, '15-host-drop');
check(await host.evaluate('__ec.fight.paused'), 'pertandingan dijeda saat kontroler putus');
await until(host, '!!document.querySelector(".over [data-a=bot]")', 20000); await shot(host, '16-host-drop-choice');
await click(host, '.over [data-a="bot"]'); await wait(1500);
check(!(await host.evaluate('__ec.fight.paused')) && !!(await host.evaluate('__ec.vs.bots[1]')), 'lanjut melawan bot setelah 15 detik');
// selesaikan pertandingan cepat
await host.evaluate('__ec.fight.m.wins[0] = 1; __ec.fight.m.f[1].hp = 10; __ec.fight.m.time = 0.05'); // waktu habis, P1 unggul HP
await until(host, '!!document.querySelector(".result")', 30000).catch(() => { });
await wait(600); await shot(host, '17-host-result'); await shot(c1, '18-ctl-result');
check(!!(await host.$('.result')), 'layar hasil Main Bareng tampil');
await click(c1, '[data-a="res"][data-v="again"]'); await until(host, '__ec.vs.phase !== "result"', 8000).catch(() => { });
check(await host.evaluate('__ec.vs.phase') === 'lobby', 'Rematch dari kontroler P1: kontroler 2 sudah keluar → host membuka lobi untuk pengganti');
} catch (e) { console.log('BERHENTI:', e.message.split('\n')[0]); bad++; }
log(errs.length ? errs.slice(0, 20).join('\n') : 'tidak ada error konsol');
log(`\n${ok} lolos, ${bad} gagal`);
await browser.close();
