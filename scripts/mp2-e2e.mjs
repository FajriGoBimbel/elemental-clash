// Uji end-to-end Main Bareng konfigurasi D (2 Layar, mis. desktop vs desktop): host + perangkat kedua di 2 tab Chrome headless.
// Pakai: npm run dev, lalu URL=http://localhost:5173 node scripts/mp2-e2e.mjs <folder>   (LAN=web untuk uji WebRTC)
import puppeteer from 'puppeteer-core';
const out = process.argv[2] || '.', base = (process.env.URL || 'http://localhost:5173') + '/?skip' + (process.env.LAN ? '&lan=' + process.env.LAN : '');
const launch = () => puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const browsers = []; // satu Chrome per perangkat: kedua layar sama-sama terlihat seperti dua desktop sungguhan
const errs = [], log = (...a) => console.log(...a);
async function open(name) {
  const b = await launch(); browsers.push(b); const p = (await b.pages())[0] || await b.newPage(); await p.setViewport({ width: 1280, height: 720 }); // desktop
  p.on('pageerror', e => errs.push(name + ' PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/WakeLock/.test(m.text())) errs.push(name + ' ' + m.text()); });
  await p.goto(base, { waitUntil: 'load' }); await p.waitForFunction('window.__ec && document.querySelector(".menu")', { timeout: 90000 });
  await p.evaluate(`Object.defineProperty(document, 'hidden', { get: () => false })`); // dua jendela desktop sama-sama terlihat
  return p;
}
const click = async (p, sel) => { await p.waitForSelector(sel, { timeout: 20000 }); await p.$eval(sel, el => el.click()); };
const until = (p, js, t = 20000) => p.waitForFunction(js, { timeout: t, polling: 50 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = async (p, n) => { await p.bringToFront(); await p.screenshot({ path: `${out}/${n}.png` }); };
let ok = 0, bad = 0; const check = (c, m) => { log((c ? '  ok    ' : '  GAGAL ') + m); c ? ok++ : bad++; };

try {
  const host = await open('host'), g = await open('guest');
  await click(host, '[data-a="versus"]'); await shot(host, '01-menu');
  await click(host, '[data-a="cfg"][data-v="D"]'); await until(host, 'document.querySelectorAll(".code b").length === 6');
  const code = await host.$$eval('.code b', b => b.map(x => x.textContent).join('')); log('kode ruangan', code);
  await click(g, '[data-a="versus"]'); await click(g, '[data-a="join"]'); await until(g, '!!document.querySelector(".keypad")');
  for (const ch of code) await g.keyboard.press(ch === ch.toLowerCase() ? ch : ch); // desktop: ketik kode dengan keyboard
  await g.keyboard.press('Enter');
  await until(host, '!!document.querySelector(".over [data-a=yes]")'); await shot(host, '02-approve');
  await click(host, '.over [data-a="yes"]'); await until(g, '!!document.querySelector(".ctop")');
  check(true, 'perangkat kedua bergabung dengan kode yang diketik di keyboard');
  await until(host, '!!document.querySelector("#vp0")'); await wait(400);
  await click(g, '[data-a="next"]'); await wait(200); await click(g, '[data-a="ready"]');
  await click(host, '[data-a="ready"][data-v="0"]');
  await until(host, '!!document.querySelector(".agrid")'); await click(host, '[data-a="ok"]');
  await until(host, '__ec.fight && __ec.fight.started', 30000);
  await until(g, '!!(__ec.fight && __ec.fight.mirror && __ec.fight.started)', 30000);
  check(await g.evaluate('getComputedStyle(document.getElementById("gl")).visibility !== "hidden" && !!document.querySelector(".hud") && !!document.querySelector(".ctl")'), 'layar kedua merender arena 3D + HUD + kontrol sendiri');
  await until(host, '__ec.fight.m.phase === "fight"');
  // P1 (host) bergerak → terlihat di layar kedua
  await host.bringToFront(); await host.keyboard.down('KeyD'); await wait(700); await host.keyboard.up('KeyD'); await wait(300);
  const hx = await host.evaluate('__ec.fight.m.f[0].x'), gx = await g.evaluate('__ec.fight.m.f[0].x');
  check(Math.abs(hx - gx) < .3, `posisi P1 sinkron di layar kedua: host ${hx.toFixed(2)} / tamu ${gx.toFixed(2)}`);
  // P2 (tamu) bergerak dengan keyboard di perangkatnya
  const x0 = await host.evaluate('__ec.fight.m.f[1].x');
  await g.bringToFront(); await g.keyboard.down('KeyA'); await wait(700); await g.keyboard.up('KeyA'); await wait(300);
  const x1 = await host.evaluate('__ec.fight.m.f[1].x'), gx1 = await g.evaluate('__ec.fight.m.f[1].x');
  check(x1 < x0 - .5, `keyboard perangkat kedua menggerakkan P2 di host: ${x0.toFixed(2)} → ${x1.toFixed(2)}`);
  check(Math.abs(x1 - gx1) < .3, `posisi P2 sinkron kembali ke layar kedua: ${gx1.toFixed(2)}`);
  const s0 = await host.evaluate('__ec.fight.m.f[1].seq'); await g.keyboard.press('KeyK'); await wait(400); // jurus 1 (proyektil/efek)
  check(await host.evaluate('__ec.fight.m.f[1].seq') > s0, 'jurus dari perangkat kedua dijalankan host');
  await wait(300); await shot(host, '03-host-fight'); await shot(g, '04-guest-fight');
  const hpH = await host.evaluate('__ec.fight.m.f[0].hp'), hpG = await g.evaluate('__ec.fight.m.f[0].hp');
  check(Math.abs(hpH - hpG) < 1, `HP sinkron: ${hpH} / ${hpG}`);
  // jeda dari perangkat kedua (Esc)
  await g.keyboard.press('Escape'); await until(host, '__ec.fight.paused'); await until(g, '!!document.querySelector(".cpause [data-a=resume]")');
  await shot(g, '05-guest-pause'); await click(g, '.cpause [data-a="resume"]'); await until(host, '!__ec.fight.paused');
  check(true, 'perangkat kedua bisa menjeda (Esc) dan melanjutkan');
  // akhiri cepat
  await host.evaluate('__ec.fight.m.wins[0] = 1; __ec.fight.m.f[1].hp = 10; __ec.fight.m.time = 0.05');
  await until(host, '!!document.querySelector(".result")', 30000); await until(g, '!!document.querySelector(".res")', 15000);
  await wait(500); await shot(host, '06-host-result'); await shot(g, '07-guest-result');
  check(await g.evaluate('!__ec.fight && getComputedStyle(document.getElementById("gl")).visibility === "hidden"'), 'layar hasil di perangkat kedua, pertarungan lokal dibersihkan');
  await click(host, '[data-a="again"], [data-a="res"][data-v="again"]').catch(() => { });
  await until(g, '!!(__ec.fight && __ec.fight.mirror)', 20000).then(() => check(true, 'rematch: layar kedua ikut mulai lagi'), () => check(false, 'rematch: layar kedua ikut mulai lagi'));
} catch (e) {
  console.log('BERHENTI:', e.message.split('\n')[0]); bad++;
  for (const b of browsers) for (const p of (await b.pages()).slice(-1)) log('DBG', await p.evaluate(`JSON.stringify({vs: window.__ec.vs && {phase: __ec.vs.phase, ready: __ec.vs.ready}, f: !!__ec.fight, st: __ec.fight && __ec.fight.started, ui: document.querySelector('#ui').innerHTML.replace(/<svg.*?<\\/svg>/g, '').slice(0, 300)})`).catch(e => e.message));
}
log(errs.length ? errs.slice(0, 20).join('\n') : 'tidak ada error konsol');
log(`\n${ok} lolos, ${bad} gagal`);
for (const b of browsers) await b.close();
