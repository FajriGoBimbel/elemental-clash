// Membuat ikon PNG (192 & 512) dari public/icon.svg memakai Chrome headless.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
for (const s of [192, 512]) {
  await p.setViewport({ width: s, height: s });
  await p.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body>`);
  await p.screenshot({ path: `public/icon-${s}.png` });
}
await b.close();
