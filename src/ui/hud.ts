// HUD pertarungan: HP, meter energi, stamina, timer, skor ronde, pesan, dan indikator elemen.
import { ELEMS, hex } from '../data';
import { Fighter, MAX_STAM } from '../game/fighter';
import { Match } from '../game/match';
import { save, T, tr } from '../save';
import { $, icon, elVar, esc } from './dom';

export class Hud {
  el: HTMLElement; private q: Record<string, HTMLElement> = {}; private lastElem: string[] = ['', '']; private comboT = [0, 0]; private noticeT = 0;
  constructor(parent: HTMLElement, private m: Match, portraits: Record<string, string>, names?: [string, string]) {
    const el = this.el = document.createElement('div'); el.className = 'hud';
    const side = (f: Fighter, c: string) => `<div class="pl ${c}" style="${elVar(f.elem)}">
      <div class="por" style="background-image:url(${portraits[f.def.id]})"></div>
      <div class="bars"><div class="nm"><span>${names ? `${esc(names[f.idx])} <small>${f.def.name}</small>` : f.def.name}</span><span class="ei">${icon(f.elem)}</span><span class="sts"></span></div>
      <div class="hp"><i class="ghost"></i><i class="fill"></i></div>
      <div class="sub"><div class="en"><i></i></div><div class="stm">${'<b></b>'.repeat(MAX_STAM)}</div></div></div></div>`;
    el.innerHTML = `<div class="hud-top">${side(m.f[0], 'p1')}
      <div class="mid"><div class="timer">60</div><div class="pips"><span class="w0">${'<b></b>'.repeat(m.need)}</span><span class="w1">${'<b></b>'.repeat(m.need)}</span></div><div class="rnd"></div></div>
      ${side(m.f[1], 'p2')}</div>
      <div class="msg"></div><div class="notice"></div><div class="combo l"></div><div class="combo r"></div><div class="ultban"></div><div class="pops"></div><div class="impact"></div>
      <button class="pause" aria-label="${T('Jeda', 'Pause')}">II</button>
      ${matchMedia('(hover: hover) and (pointer: fine)').matches ? `<div class="keys"><b>A/D</b> ${T('gerak', 'move')} · <b>W</b> ${T('lompat', 'jump')} · <b>S</b> ${T('tunduk', 'crouch')} · <b>J</b> ${T('ringan', 'light')} · <b>K</b> ${T('berat', 'heavy')} · <b>L</b> ${T('spesial', 'special')} · <b>I</b> ${T('pamungkas', 'ultimate')} · <b>Space</b> ${T('tangkis', 'block')} · <b>Shift/O</b> dash</div>` : ''}`;
    parent.appendChild(el);
    for (const k of ['timer', 'rnd', 'msg', 'notice', 'ultban', 'pops', 'pause', 'impact']) this.q[k] = $('.' + k, el);
    if (m.training) { this.q.timer.textContent = '∞'; $('.pips', el).style.display = 'none'; this.q.rnd.textContent = T('Latihan', 'Training'); }
  }
  get pauseBtn() { return this.q.pause; }

  update(dt: number) {
    const m = this.m, el = this.el;
    m.f.forEach((f, i) => {
      const p = $(i ? '.p2' : '.p1', el), r = Math.max(0, f.hp / f.def.hp) * 100;
      const fill = $('.fill', p), gh = $('.ghost', p); fill.style.width = r + '%'; gh.style.width = r + '%';
      $('.hp', p).classList.toggle('low', r < 25);
      const en = $('.en', p); (en.firstElementChild as HTMLElement).style.width = f.energy + '%'; en.classList.toggle('full', f.energy >= 100);
      p.querySelectorAll('.stm b').forEach((b, k) => b.classList.toggle('on', f.stam >= k + .99));
      if (f.elem !== this.lastElem[i]) { this.lastElem[i] = f.elem; p.setAttribute('style', elVar(f.elem)); $('.ei', p).innerHTML = icon(f.elem); }
      const st: string[] = [];
      if (f.burn > 0) st.push(`<span style="color:#ff9a4a">${T('Terbakar', 'Burn')}</span>`);
      if (f.slow > 0) st.push(`<span style="color:#7ee0a0">${T('Lambat', 'Slow')}</span>`);
      if (f.root > 0) st.push(`<span style="color:#c9a36a">${T('Terikat', 'Rooted')}</span>`);
      const s = st.join(''), se = $('.sts', p); if (se.innerHTML !== s) se.innerHTML = s;
      el.querySelectorAll(`.w${i} b`).forEach((b, k) => b.classList.toggle('on', m.wins[i] > k));
      if (this.comboT[i] > 0) { this.comboT[i] -= dt; if (this.comboT[i] <= 0) $(i ? '.combo.r' : '.combo.l', el).classList.remove('show'); }
    });
    if (!m.training) {
      const t = Math.ceil(m.time); this.q.timer.textContent = String(t); this.q.timer.classList.toggle('low', t <= 10);
      this.q.rnd.textContent = T('Ronde ', 'Round ') + m.round;
    }
    if (this.noticeT > 0) { this.noticeT -= dt; if (this.noticeT <= 0) this.q.notice.classList.remove('show'); }
  }
  msg(text: string, sub = '', dur = 1.2, el: string | null = null) {
    const e = this.q.msg; e.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); e.style.setProperty('--d', dur + 's'); e.style.setProperty('--el', el || '#ffd166');
    e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
  }
  notice(text: string, color = '#ffd166', dur = 2.2) { const n = this.q.notice; n.textContent = text; n.style.setProperty('--el', color); n.classList.add('show'); this.noticeT = dur; }
  /** Tulisan tawa melayang (emote ketawa ngejek). */
  laugh(x: number, y: number, n: number) {
    const d = document.createElement('div'); d.className = 'pop laugh' + (n % 2 ? ' r' : ''); d.style.left = x + 'px'; d.style.top = y + 'px';
    d.textContent = n % 3 === 2 ? '😂' : n % 2 ? 'HA!' : 'HAHA';
    this.q.pops.appendChild(d); setTimeout(() => d.remove(), 1000);
  }
  /** Panah keunggulan elemen di titik kena (hijau naik / merah turun). */
  pop(x: number, y: number, adv: number) {
    const d = document.createElement('div'); d.className = 'pop ' + (adv > 0 ? 'up' : 'dn'); d.style.left = x + 'px'; d.style.top = y + 'px';
    d.innerHTML = adv > 0 ? `▲<small>${T('UNGGUL', 'STRONG')}</small>` : `▼<small>${T('LEMAH', 'WEAK')}</small>`;
    this.q.pops.appendChild(d); setTimeout(() => d.remove(), 820);
  }
  /** Penghitung kombo: warnanya naik tiap tingkat (2/4/6/8+ hit), label muncul di penutup. */
  combo(attIdx: number, n: number, tag = '') {
    if (n < 2 && !tag) return; const c = $(attIdx ? '.combo.r' : '.combo.l', this.el);
    c.innerHTML = `${n >= 2 ? `${n}<small>HIT</small>` : ''}${tag ? `<em>${tag}</em>` : ''}`;
    c.dataset.t = String(Math.min(4, Math.floor(n / 2)));
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); this.comboT[attIdx] = tag ? 1.6 : 1.2;
  }
  /** Kilat putih sekejap (impact frame) untuk pukulan penutup. */
  impact() { const d = this.q.impact; d.classList.remove('show'); void d.offsetWidth; d.classList.add('show'); }
  ult(f: Fighter) {
    const b = this.q.ultban; b.textContent = tr(f.def.moves.ult.name!); b.style.setProperty('--el', hex(ELEMS[f.elem].col)); b.classList.toggle('r', f.idx === 1);
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  destroy() { this.el.remove(); }
}
