// Uji end-to-end joystick HP untuk mode solo: layar desktop + HP (2 Chrome terpisah).
// Pakai: npm run dev, lalu URL=http://localhost:5173 node scripts/pad-e2e.mjs <folder>   (LAN=web untuk uji WebRTC)
import puppeteer from 'puppeteer-core';
const out = process.argv[2] || '.', base = (process.env.URL || 'http://localhost:5173') + '/?skip' + (process.env.LAN ? '&lan=' + process.env.LAN : '');
const args = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];
const browsers = [], errs = [], log = (...a) => console.log(...a);
async function open(name, vp) {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args }); browsers.push(b);
  const p = (await b.pages())[0]; await p.setViewport(vp);
  p.on('pageerror', e => errs.push(name + ' PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/WakeLock/.test(m.text())) errs.push(name + ' ' + m.text()); });
  await p.goto(base, { waitUntil: 'load' }); await p.waitForFunction('window.__ec && document.querySelector(".menu")', { timeout: 90000 });
  await p.evaluate(`Object.defineProperty(document, 'hidden', { get: () => false })`); return p;
}
const click = async (p, sel) => { await p.waitForSelector(sel, { timeout: 20000 }); await p.$eval(sel, el => el.click()); };
const until = (p, js, t = 20000) => p.waitForFunction(js, { timeout: t, polling: 50 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png` });
let ok = 0, bad = 0; const check = (c, m) => { log((c ? '  ok    ' : '  GAGAL ') + m); c ? ok++ : bad++; };

try {
  const host = await open('layar', { width: 1280, height: 720 });
  const hp = await open('hp', { width: 844, height: 390, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, isLandscape: true });
  await click(host, '.menu [data-a="pad"]'); await until(host, 'document.querySelectorAll(".padm .code b").length === 6');
  const code = await host.$$eval('.padm .code b', b => b.map(x => x.textContent).join('')); log('kode', code);
  await shot(host, '01-layar-kode');
  await click(hp, '[data-a="versus"]'); await click(hp, '[data-a="join"]'); await until(hp, '!!document.querySelector(".keypad")');
  for (const ch of code) await click(hp, `.keypad [data-v="${ch}"]`); await click(hp, '[data-a="go"]');
  await until(host, '!!document.querySelector(".over [data-a=yes]")'); await click(host, '.over [data-a="yes"]');
  await until(hp, '!!document.querySelector(".cwait")'); await until(host, '!!document.querySelector(".padm .slot.ok")');
  check(true, 'HP tersambung sebagai joystick dari kode di menu'); await shot(host, '02-layar-tersambung'); await shot(hp, '03-hp-siap');
  await click(host, '.padm [data-a="ok"]'); await wait(300);
  check(await host.$eval('.menu [data-a="pad"]', b => b.classList.contains('on')), 'tombol menu menunjukkan "Joystick HP aktif"');
  // latihan melawan boneka diam
  await host.evaluate(`__ec.app.mode = 'training'; __ec.app.dummy = 'stand'; __ec.startFight('terrok', 'kuil', 0, 'pyrra')`);
  await until(hp, '!!document.querySelector(".cpad") && !!document.querySelector(".ctl .cb.hvy")', 20000);
  check(true, 'HP otomatis menampilkan joystick + tombol saat pertarungan solo');
  await until(host, '__ec.fight.started && __ec.fight.m.phase === "fight"', 30000);
  const x0 = await host.evaluate('__ec.fight.m.f[0].x');
  await hp.keyboard.down('KeyD'); await wait(800); await hp.keyboard.up('KeyD');
  const x1 = await host.evaluate('__ec.fight.m.f[0].x'); check(x1 > x0 + .5, `joystick HP menggerakkan P1: ${x0.toFixed(2)} → ${x1.toFixed(2)}`);
  let s0 = await host.evaluate('__ec.fight.m.f[0].seq'); await hp.keyboard.press('KeyK'); await wait(500);
  check(await host.evaluate('__ec.fight.m.f[0].seq') > s0, 'tombol Serangan Berat dari HP dijalankan');
  await wait(600); s0 = await host.evaluate('__ec.fight.m.f[0].seq'); await host.keyboard.press('KeyJ'); await wait(400);
  check(await host.evaluate('__ec.fight.m.f[0].seq') > s0, 'keyboard di layar tetap bisa dipakai bersamaan');
  await wait(300); check(!!(await hp.$eval('.php i', e => e.style.width)), 'HP menerima bar HP dari layar');
  await shot(host, '04-layar-fight'); await shot(hp, '05-hp-pad');
  await click(hp, '[data-a="pause"]'); await until(host, '__ec.fight.paused'); await until(hp, '!!document.querySelector(".cpause [data-a=resume]")');
  await shot(host, '06-layar-jeda'); await click(hp, '.cpause [data-a="resume"]'); await until(host, '!__ec.fight.paused && !document.querySelector(".over")');
  check(true, 'jeda & lanjutkan dari HP');
  await host.evaluate('__ec.menu()'); await until(hp, '!!document.querySelector(".cwait") && !document.querySelector(".cpad")');
  check(true, 'kembali ke menu: HP kembali ke layar "Joystick siap"');
} catch (e) { console.log('BERHENTI:', e.message.split('\n')[0]); bad++; }
log(errs.length ? errs.slice(0, 20).join('\n') : 'tidak ada error konsol');
log(`\n${ok} lolos, ${bad} gagal`);
for (const b of browsers) await b.close();
