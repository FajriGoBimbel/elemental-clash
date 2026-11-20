// Uji link undangan (?join=KODE): HP membuka link dari modal "Bagikan" dan langsung bergabung tanpa mengetik kode.
// Pakai: npm run dev, lalu URL=http://localhost:5173 node scripts/share-e2e.mjs <folder>   (LAN=web untuk uji WebRTC)
import puppeteer from 'puppeteer-core';
const out = process.argv[2] || '.', base = (process.env.URL || 'http://localhost:5173') + '/?skip' + (process.env.LAN ? '&lan=' + process.env.LAN : '');
const args = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];
const browsers = [], errs = [], log = (...a) => console.log(...a);
async function launch(name, vp) {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args }); browsers.push(b);
  const p = (await b.pages())[0]; await p.setViewport(vp);
  p.on('pageerror', e => errs.push(name + ' PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/WakeLock/.test(m.text())) errs.push(name + ' ' + m.text()); });
  return p;
}
const ready = p => p.waitForFunction('window.__ec && document.querySelector(".menu")', { timeout: 90000 });
const click = async (p, sel) => { await p.waitForSelector(sel, { timeout: 20000 }); await p.$eval(sel, el => el.click()); };
const until = (p, js, t = 20000) => p.waitForFunction(js, { timeout: t, polling: 50 });
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const check = (c, m) => { log((c ? '  ok    ' : '  GAGAL ') + m); c ? ok++ : bad++; };
const PHONE = { width: 844, height: 390, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, isLandscape: true };

try {
  const host = await launch('layar', { width: 1280, height: 720 }); await host.goto(base, { waitUntil: 'load' }); await ready(host);
  await host.evaluate(`Object.defineProperty(document, 'hidden', { get: () => false })`);
  // 1) lobi Layar + 1 Kontroler → bagikan
  await click(host, '[data-a="versus"]'); await click(host, '[data-a="cfg"][data-v="B"]'); await until(host, 'document.querySelectorAll(".code b").length === 6');
  const code = await host.$$eval('.code b', b => b.map(x => x.textContent).join(''));
  await click(host, '[data-a="share"]'); await until(host, '!!document.querySelector(".sharem .qr svg")');
  const link = await host.$eval('.sh-url', e => e.value);
  check(link.includes('join=' + code), 'modal bagikan berisi QR + link dengan kode: ' + link);
  await host.screenshot({ path: `${out}/01-share-modal.png` });
  await click(host, '.sharem [data-a="close"]');
  // HP membuka link
  const hp = await launch('hp', PHONE); await hp.goto(link, { waitUntil: 'load' });
  await until(host, '!!document.querySelector(".over [data-a=yes]")', 90000);
  check(await hp.evaluate('!location.search.includes("join=")'), 'link dibuka: HP langsung meminta bergabung, parameter join dihapus dari alamat');
  await hp.screenshot({ path: `${out}/02-hp-wait.png` });
  await click(host, '.over [data-a="yes"]'); await until(hp, '!!document.querySelector(".ctop")');
  check(true, 'HP jadi kontroler tanpa mengetik kode');
  await hp.reload({ waitUntil: 'load' }); await until(hp, '!!document.querySelector(".ctop")', 90000);
  check(await host.evaluate('__ec.vs.room.peers[1].up'), 'reload setelah gabung: menyambung ulang dengan sesi, bukan minta izin lagi');
  // 2) joystick solo lewat link
  await host.evaluate('__ec.menu()'); await wait(800);
  await until(hp, '!!document.querySelector(".keypad")', 20000).catch(() => { }); // ruangan ditutup → HP kembali ke layar kode
  await click(host, '.menu [data-a="pad"]'); await until(host, '!!document.querySelector(".padm [data-a=share]")');
  await click(host, '.padm [data-a="share"]'); await until(host, '!!document.querySelector(".sharem .sh-url")');
  const link2 = await host.$eval('.sh-url', e => e.value);
  const hp2 = await launch('hp2', PHONE); await hp2.goto(link2, { waitUntil: 'load' });
  await until(host, '!!document.querySelector(".over [data-a=yes]")', 90000); await click(host, '.over [data-a="yes"]');
  await until(hp2, '!!document.querySelector(".cwait")'); check(await host.evaluate('!!document.querySelector(".padb.on, .padm .slot.ok")'), 'link joystick solo: HP tersambung sebagai joystick');
} catch (e) { console.log('BERHENTI:', e.message.split('\n')[0]); bad++; }
log(errs.length ? errs.slice(0, 20).join('\n') : 'tidak ada error konsol');
log(`\n${ok} lolos, ${bad} gagal`);
for (const b of browsers) await b.close();
