// Alat uji visual: membuka game di Chrome headless lalu mengambil screenshot.
// Pakai: node scripts/shot.mjs <folder-keluaran> <nama>=<js> ...   (js dievaluasi di halaman; "wait:ms" untuk jeda)
import puppeteer from 'puppeteer-core';
const [out, ...steps] = process.argv.slice(2);
const url = process.env.URL || 'http://localhost:5173/?skip';
const [w, h] = (process.env.SIZE || '844x390').split('x').map(Number);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', `--window-size=${w},${h}`] });
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: +(process.env.DPR || 2), isLandscape: true });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction('window.__ec && document.querySelector(".menu,.tap")', { timeout: 60000 });
for (const s of steps) {
  const i = s.indexOf('='), name = s.slice(0, i), js = s.slice(i + 1);
  for (const part of js.split(';;')) {
    const p = part.trim();
    if (p.startsWith('wait:')) await new Promise(r => setTimeout(r, +p.slice(5)));
    else if (p.startsWith('down:')) await page.keyboard.down(p.slice(5));
    else if (p.startsWith('up:')) await page.keyboard.up(p.slice(3));
    else if (p.startsWith('press:')) await page.keyboard.press(p.slice(6), { delay: 40 });
    else if (p.startsWith('touch:')) { const [x0, y0, x1, y1, ms] = p.slice(6).split(',').map(Number); await page.touchscreen.touchStart(x0, y0); await page.touchscreen.touchMove(x1, y1); await new Promise(r => setTimeout(r, ms)); await page.touchscreen.touchEnd(); }
    else if (p.startsWith('tap:')) { const [x, y] = p.slice(4).split(',').map(Number); await page.touchscreen.tap(x, y); }
    else if (p.startsWith('log:')) console.log(p.slice(4), '=>', JSON.stringify(await page.evaluate(p.slice(4))));
    else if (p.startsWith('until:')) await page.waitForFunction(p.slice(6), { timeout: 30000, polling: 30 }).catch(() => errs.push('TIMEOUT ' + p));
    else if (p) await page.evaluate(p);
  }
  if (name !== '-') await page.screenshot({ path: `${out}/${name}.png` });
}
console.log(errs.length ? errs.slice(0, 15).join('\n') : 'no console errors');
await browser.close();
