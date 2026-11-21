// Uji end-to-end Turnamen Online: host + 3 peserta, masing-masing di Chrome terpisah (seperti 4 PC dalam satu ruangan).
// Pakai: npm run dev, lalu URL=http://localhost:5173 node scripts/tour-e2e.mjs <folder>
import puppeteer from 'puppeteer-core';
const out = process.argv[2] || '.', base = (process.env.URL || 'http://localhost:5173') + '/?skip' + (process.env.LAN ? '&lan=' + process.env.LAN : '');
const launch = () => puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const browsers = [], errs = [], log = (...a) => console.log(...a);
async function open(name) {
  const b = await launch(); browsers.push(b); const p = (await b.pages())[0] || await b.newPage(); await p.setViewport({ width: 1100, height: 620 });
  p.on('pageerror', e => errs.push(name + ' PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/WakeLock/.test(m.text())) errs.push(name + ' ' + m.text()); });
  await p.goto(base, { waitUntil: 'load' }); await p.waitForFunction('window.__ec && document.querySelector(".menu")', { timeout: 90000 });
  await p.evaluate(`Object.defineProperty(document, 'hidden', { get: () => false })`);
  return p;
}
const click = async (p, sel) => { await p.waitForSelector(sel, { timeout: 20000 }); await p.$eval(sel, el => el.click()); };
const until = (p, js, t = 30000) => p.waitForFunction(js, { timeout: t, polling: 50 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = async (p, n) => { await p.bringToFront(); await p.screenshot({ path: `${out}/${n}.png` }); };
let ok = 0, bad = 0; const check = (c, m) => { log((c ? '  ok    ' : '  GAGAL ') + m); c ? ok++ : bad++; };

try {
  const host = await open('host'), gs = await Promise.all([1, 2, 3].map(i => open('pc' + i)));
  await click(host, '.mnav [data-a="tour"]');
  check(await host.evaluate('!document.querySelector("[data-a=online], [data-a=local], .tcount")'), 'turnamen langsung membuka ruangan (tanpa pilihan Satu Layar)');
  await until(host, 'document.querySelectorAll(".code b").length === 6');
  const code = await host.$$eval('.code b', b => b.map(x => x.textContent).join('')); log('kode ruangan', code);
  for (const [k, g] of gs.entries()) {
    await click(g, '[data-a="versus"]'); await click(g, '[data-a="join"]'); await until(g, '!!document.querySelector(".keypad")');
    for (const ch of code) await g.keyboard.press(ch); await g.keyboard.press('Enter');
    await until(host, '!!document.querySelector(".over [data-a=yes]")'); await click(host, '.over [data-a="yes"]');
    await until(g, '!!document.querySelector(".tlob")'); await wait(300);
    await g.$eval('.tname', (el, v) => { el.value = v; el.dispatchEvent(new Event('change')); }, ['Budi', 'Sari', 'Joko'][k]); await wait(300);
    check(true, `PC ${k + 1} bergabung ke ruangan turnamen`);
  }
  await until(host, 'document.querySelectorAll(".lobby .tp").length === 4');
  check(await host.$eval('[data-a="go"]', b => !b.disabled), 'host: 4 pemain di lobi, tombol mulai aktif');
  // PC 1 memilih karakter lain di perangkatnya
  const pick = await gs[0].$$eval('.tlob [data-a=pick]', b => b.map(x => x.dataset.v));
  await click(gs[0], `.tlob [data-a=pick][data-v="${pick[1]}"]`); await wait(600);
  check(await host.evaluate(`__ec.tour?.chars[1] === ${JSON.stringify(pick[1])}`), `pilihan karakter PC 1 (${pick[1]}) diterima host`);
  await shot(host, 't1-lobby'); await shot(gs[0], 't2-guest-lobby');
  await host.$eval('.hname', el => { el.value = 'Host'; el.dispatchEvent(new Event('change')); }); await wait(200);
  await click(host, '[data-a="go"]');
  for (const g of gs) await until(g, '!!document.querySelector(".tbr")');
  check(true, 'semua PC menampilkan bracket'); await wait(900); await shot(gs[1], 't3-guest-bracket');
  const nm = await gs[2].$$eval('.ts span', s => s.map(x => x.textContent).sort().join(','));
  check(nm === 'Budi,Host,Joko,Sari', `nama yang diketik peserta tampil di bracket PC lain: ${nm}`);

  // dua laga semifinal lalu final
  for (let match = 0; match < 3; match++) {
    const cur = await host.evaluate('(() => { const t = __ec.tour, rs = t.rounds; return rs.flat().find(m => m.a >= 0 && m.b >= 0 && m.w < 0); })()');
    log(`laga ${match + 1}: peserta ${cur.a} vs ${cur.b}`);
    await click(host, '[data-a="play"]');
    await until(host, '__ec.fight && __ec.fight.started && __ec.fight.m.phase === "fight"', 40000);
    for (const [k, g] of gs.entries()) await until(g, '!!(__ec.fight && __ec.fight.mirror && __ec.fight.started)', 30000);
    const hostCtl = await host.evaluate('document.querySelectorAll(".ctl").length');
    check(hostCtl === ((cur.a === 0 || cur.b === 0) ? 1 : 0), `host: ${hostCtl ? 'kontrol layar penuh (ikut bertanding)' : 'tanpa kontrol (menonton)'}`);
    for (const [k, g] of gs.entries()) {
      const slot = k + 1, playing = cur.a === slot || cur.b === slot, n = await g.evaluate('document.querySelectorAll(".ctl").length');
      check(n === (playing ? 1 : 0), `PC ${slot}: ${playing ? 'kontrol satu pemain (bukan layar terbagi)' : 'menonton tanpa kontrol'}`);
    }
    // peserta dari PC lain menggerakkan petarungnya sendiri
    const gp = [cur.a, cur.b].find(p => p > 0);
    if (gp) {
      const side = cur.a === gp ? 0 : 1, g = gs[gp - 1], x0 = await host.evaluate(`__ec.fight.m.f[${side}].x`);
      const key = side === 0 ? 'KeyD' : 'KeyA'; await g.bringToFront(); await g.keyboard.down(key); await wait(700); await g.keyboard.up(key); await wait(300);
      const x1 = await host.evaluate(`__ec.fight.m.f[${side}].x`), seen = await Promise.all(gs.map(p => p.evaluate(`__ec.fight?.m.f[${side}].x ?? NaN`)));
      check(Math.abs(x1 - x0) > .5, `PC ${gp} menggerakkan petarungnya di host: ${x0.toFixed(2)} → ${x1.toFixed(2)}`);
      check(seen.every(x => Math.abs(x - x1) < .4), `posisi sinkron di semua PC: ${seen.map(x => x.toFixed(2)).join(' / ')}`);
      if (match === 0) { await shot(g, 't4-player-fight'); await shot(gs.find((_, k) => k + 1 !== cur.a && k + 1 !== cur.b), 't5-spectator'); }
    }
    // akhiri cepat: petarung kiri menang 2 ronde
    await host.evaluate(`window.__ko = setInterval(() => { const f = __ec.fight; if (!f || f.m.phase === 'over') return clearInterval(__ko); if (f.started && f.m.phase === 'fight') f.m.dot(f.m.f[1], 9999); }, 150)`);
    await until(host, '!!document.querySelector(".result [data-a=br]")', 90000);
    await click(host, '.result [data-a="br"]');
    for (const g of gs) await until(g, '!!document.querySelector(".tbr") && !__ec.fight', 30000);
    check(await host.evaluate(`__ec.tour.rounds.flat().some(m => m.a === ${cur.a} && m.b === ${cur.b} && m.w === ${cur.a})`), `pemenang laga ${match + 1} tercatat di bracket`);
  }
  const champ = await host.evaluate('__ec.tour.rounds.at(-1)[0].w');
  await until(gs[0], '!!document.querySelector(".tinfo h3")'); await shot(gs[0], 't6-guest-champion'); await shot(host, 't7-host-champion');
  check(champ >= 0, `juara ditentukan (peserta ${champ}) dan tampil di PC peserta`);
} catch (e) { bad++; log('  GAGAL ' + (e?.message || e)); }
finally {
  if (errs.length) { log('console error:'); errs.slice(0, 15).forEach(e => log('  ' + e)); }
  log(`\n${ok} lolos, ${bad} gagal`); await Promise.all(browsers.map(b => b.close())); process.exit(bad || errs.length ? 1 : 0);
}
