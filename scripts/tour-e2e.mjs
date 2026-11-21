// Uji end-to-end Turnamen Bareng (CR-002): host desktop + 3 HP peserta + 1 bot pengisi, gugur tunggal best of 1,
// sampai juara; termasuk nama kembar ditolak, Undi Ulang, dan host dimuat ulang di tengah turnamen (Lanjutkan Turnamen).
// Pakai: npm run dev, lalu URL=http://localhost:5173 node scripts/tour-e2e.mjs <folder>   (LAN=web untuk uji WebRTC)
import puppeteer from 'puppeteer-core';
const out = process.argv[2] || '.', base = (process.env.URL || 'http://localhost:5173') + '/?skip' + (process.env.LAN ? '&lan=' + process.env.LAN : '');
const args = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const errs = [], log = (...a) => console.log(...a), browsers = [];
const launch = async () => { const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args }); browsers.push(b); return b; };
function watch(p, name) { p.on('pageerror', e => errs.push(name + ' PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/WakeLock/.test(m.text())) errs.push(name + ' ' + m.text()); }); }
const ready = p => p.waitForFunction('window.__ec && document.querySelector(".menu")', { timeout: 90000 });
const click = async (p, sel) => { await p.waitForSelector(sel, { timeout: 20000 }); await p.$eval(sel, el => el.click()); };
const until = (p, js, t = 20000) => p.waitForFunction(js, { timeout: t, polling: 100 });
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const check = (c, m) => { log((c ? '  ok    ' : '  GAGAL ') + m); c ? ok++ : bad++; };
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png` }).catch(() => { });

async function typeName(p, name) {
  await until(p, '!!document.querySelector(".tname input")');
  await p.$eval('.tname input', (el, v) => { el.value = v; }, name); await click(p, '.tname [data-a="ok"]');
}
async function hostToTour(host) {
  await click(host, '[data-a="versus"]'); await click(host, '[data-a="cfg"][data-v="T"]'); await until(host, '!!document.querySelector(".tcards")');
}

try {
  const hb = await launch(), host = (await hb.pages())[0]; watch(host, 'host');
  await host.setViewport({ width: 1280, height: 720 }); await host.goto(base, { waitUntil: 'load' }); await ready(host);
  await host.evaluate(`Object.defineProperty(document, 'hidden', { get: () => false })`);
  await hostToTour(host); await shot(host, '01-menu');
  await click(host, '[data-a="new"]'); await until(host, '!!document.querySelector(".tform")');
  for (let i = 0; i < 4; i++) await click(host, '[data-a="max"][data-v="-1"]'); // 8 → 4
  await click(host, '[data-a="bo"][data-v="1"]'); await click(host, '[data-a="bots"]');
  check(await host.$eval('.step b', e => e.textContent) === '4', 'peserta maksimal bisa diatur (4) dan tidak di bawah 4');
  await click(host, '[data-a="max"][data-v="-1"]'); check(await host.$eval('.step b', e => e.textContent) === '4', 'nilai di bawah 4 tidak bisa dipilih');
  await shot(host, '02-create');
  const t0 = Date.now(); await click(host, '[data-a="go"]'); await until(host, 'document.querySelectorAll(".code b").length === 6');
  check(Date.now() - t0 < 2000, `kode turnamen tampil dalam ${Date.now() - t0} ms`);
  const code = await host.$$eval('.code b', b => b.map(x => x.textContent).join('')); log('kode', code);

  const pb = await launch(); const ps = [];
  for (const [i, name] of ['Andi', 'Budi', 'Cici'].entries()) {
    const p = i === 0 ? (await pb.pages())[0] : await pb.newPage(); watch(p, name); ps.push(p);
    await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, isLandscape: true });
    await p.goto(base, { waitUntil: 'load' }); await ready(p);
    await click(p, '[data-a="versus"]'); await click(p, '[data-a="join"]'); await until(p, '!!document.querySelector(".keypad")');
    for (const ch of code) await click(p, `.keypad [data-v="${ch}"]`); await click(p, '[data-a="go"]');
    if (i === 2) { // nama kembar ditolak
      await typeName(p, 'andi'); await until(p, '!!document.querySelector(".tname .warn")');
      check(true, 'nama kembar ("andi" vs "Andi") ditolak');
      check(await p.$eval('.tname input', e => e.maxLength) === 12, 'nama dibatasi 12 karakter');
    }
    await typeName(p, name); await until(p, '!!document.querySelector("[data-a=ready]")');
    await click(p, '[data-a="next"]'); await click(p, '[data-a="ready"]'); await until(p, '!!document.querySelector(".tlob")');
  }
  await until(host, 'document.querySelectorAll(".tp").length === 3 && !document.querySelector("[data-a=start][disabled]")');
  check(true, '3 peserta terdaftar + 1 slot bot → tombol Mulai aktif'); await shot(host, '03-lobby'); await shot(ps[0], '04-hp-lobby');

  await click(host, '[data-a="start"]'); await until(host, '!!document.querySelector("[data-a=lock]")', 15000);
  const seed1 = await host.$eval('.title .mut b', e => e.textContent); await shot(host, '05-draw');
  await click(host, '[data-a="redo"]'); await until(host, '!!document.querySelector("[data-a=lock]")', 15000);
  const seed2 = await host.$eval('.title .mut b', e => e.textContent);
  check(seed1 !== seed2, `Undi Ulang memberi seed baru: ${seed1} → ${seed2}`);
  await click(host, '[data-a="lock"]'); await until(host, '!!document.querySelector(".trun")');
  await until(ps[0], '!!document.querySelector(".tbrv .bm")'); check(true, 'bagan tampil di HP peserta'); await shot(ps[0], '06-hp-bracket');

  let played = 0, resumed = false;
  for (let guard = 0; guard < 8; guard++) {
    await until(host, '!!document.querySelector(".trun [data-a=call], .trun [data-a=sim], .podium")', 20000);
    if (await host.$('.podium')) break;
    await click(host, '.trun [data-a="call"]');
    await wait(400); await shot(host, `07-call-${played}`);
    const called = new Set();
    for (let k = 0; k < 60 && !(await host.evaluate('!!(__ec.fight && __ec.fight.started)')); k++) { // tekan Siap di HP yang dipanggil
      for (const p of ps) if (await p.$('.tcall [data-a=go]')) { called.add(p); await p.$eval('.tcall [data-a=go]', e => e.click()).catch(() => { }); }
      await wait(250);
    }
    if (played === 0) check(called.size >= 1, `peserta yang dipanggil melihat layar "Giliranmu!" (${called.size} HP)`);
    await until(host, '__ec.fight && __ec.fight.started && __ec.fight.m.phase === "fight"', 30000);
    if (played === 0) {
      check(await host.evaluate('__ec.fight.m.need') === 1, 'best of 1: cukup menang 1 ronde');
      const c0 = [...called][0]; await until(c0, '!!document.querySelector(".cpad")'); await shot(host, '09-fight'); await shot(c0, '10-hp-pad');
    }
    const winSide = played % 2; // ganti-ganti pemenang
    await host.evaluate(`__ec.fight.m.f[${1 - winSide}].hp = 10; __ec.fight.m.time = 0.05`);
    await until(host, '!!document.querySelector(".tres")', 30000); played++;
    if (played === 1) { await shot(host, '11-result'); await click(host, '.tres [data-a="ok"]'); }
    if (played === 1 && !resumed) {
      // host tertutup mendadak → buka lagi → Lanjutkan Turnamen (AC-11)
      resumed = true; await host.reload({ waitUntil: 'load' }); await ready(host);
      await host.evaluate(`Object.defineProperty(document, 'hidden', { get: () => false })`);
      await hostToTour(host); await until(host, '!!document.querySelector("[data-a=resume]")'); await click(host, '[data-a="resume"]');
      await until(host, '!!document.querySelector(".trun")', 20000);
      const doneAfter = await host.$$eval('.bm .br.win', e => e.length);
      check(doneAfter >= 1, 'host dibuka ulang: Lanjutkan Turnamen memulihkan bagan dengan hasil pertandingan pertama');
      // peserta tersambung lagi sendiri (token/nama); bila lewat 15 dtk, sambungkan lagi dengan kode yang sama
      for (const p of ps) {
        const st = await until(p, '!!document.querySelector(".tbrv") || !!document.querySelector("[data-a=go]:not([disabled])")', 40000).then(() => p.$('.tbrv'));
        if (!st) { await click(p, '[data-a="go"]'); await until(p, '!!document.querySelector(".tbrv")', 30000); }
      }
      check(true, 'semua HP peserta kembali ke bagan setelah host dilanjutkan (nama dikirim ulang otomatis)');
    }
  }
  await until(host, '!!document.querySelector(".podium")', 30000);
  check(played === 3, `gugur tunggal 4 peserta: ${played} pertandingan dimainkan sampai juara`);
  const champ = await host.$eval('.pod.p1 b', e => e.textContent); log('juara:', champ);
  await shot(host, '12-champion');
  const gold = []; for (const p of ps) { await until(p, '!!document.querySelector(".mst")', 10000); gold.push(await p.$eval('.mst', e => e.textContent)); }
  check(gold.some(t => /JUARA|CHAMPION/.test(t)) || champ.startsWith('Bot'), 'HP juara menampilkan "JUARA!": ' + gold.join(' | '));
  await shot(ps[0], '13-hp-final');
} catch (e) {
  console.log('BERHENTI:', e.message.split('\n')[0]); bad++;
  for (const b of browsers) for (const p of await b.pages()) log('DBG', await p.evaluate(`JSON.stringify({f: !!__ec.fight, st: __ec.fight && __ec.fight.started, ph: __ec.fight && __ec.fight.m.phase, ui: (document.querySelector('#ui').innerText || '').replace(/\\s+/g, ' ').slice(0, 260)})`).catch(x => x.message));
}
log(errs.length ? errs.slice(0, 20).join('\n') : 'tidak ada error konsol');
log(`\n${ok} lolos, ${bad} gagal`);
for (const b of browsers) await b.close();
