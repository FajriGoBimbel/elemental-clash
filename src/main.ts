// Elemental Clash — alur layar dan loop game.
import './style.css';
import { ARENAS, BOSS, BOT_LEVELS, CHARS, CharDef, ELEMS, ELEM_ARENA, STORY, arenaById, charById, elemMul, hex, rivalOf } from './data';
import { Match, Ev } from './game/match';
import { Bot } from './game/bot';
import { Stage } from './gfx/stage';
import { FightView } from './gfx/fightview';
import { Hud } from './ui/hud';
import { Controls } from './ui/input';
import { $, $$, elVar, etag, icon, ui } from './ui/dom';
import { T, loadSave, persist, resetSave, save, today, tr } from './save';
import { sound } from './audio';

loadSave();
const stage = new Stage(document.getElementById('gl') as HTMLCanvasElement);
const portraits: Record<string, string> = {}, athumbs: Record<string, string> = {};
const params = new URLSearchParams(location.search);
type Mode = 'quick' | 'story' | 'training';
const app = { mode: 'quick' as Mode, char: save.lastChar, opp: 'random', level: save.level, dummy: 'stand', arena: 'kuil', pure: false, storyIdx: 0 };
interface Fight { m: Match; view: FightView; hud: Hud | null; ctl: Controls | null; bot: Bot; demo: Bot | null; paused: boolean; acc: number; started: boolean; oppId: string; arenaId: string; level: number }
let fight: Fight | null = null;
const STEP = 1 / 60;

function applySettings() {
  const r = document.documentElement; r.style.setProperty('--ts', String(save.text)); r.classList.toggle('cb', save.cb); r.lang = save.lang;
  if (stage.quality !== save.gfx) stage.setQuality(save.gfx);
  sound.setVol(save.sfx, save.music); fight?.ctl?.applySettings();
}
const vibrate = (ms: number) => { if (save.haptic && navigator.vibrate) navigator.vibrate(ms); };

// ---------- util layar ----------
type Handlers = Record<string, (v: string, el: HTMLElement) => void>;
function bind(root: HTMLElement, h: Handlers) {
  root.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]'); if (!t || !root.contains(t)) return;
    sound.unlock(); const a = t.dataset.a!; (a === 'back' ? sound.back() : sound.ui()); h[a]?.(t.dataset.v || '', t);
  });
}
function show(html: string, cls: string, h: Handlers = {}) {
  ui.innerHTML = `<div class="scr ${cls}">${html}</div>`; const root = ui.firstElementChild as HTMLElement; bind(root, h); return root;
}
function modal(html: string, h: Handlers, cls = '') {
  const o = document.createElement('div'); o.className = 'over'; o.innerHTML = `<div class="panel modal ${cls}">${html}</div>`; ui.appendChild(o); bind(o, h); return o;
}
function toast(text: string) { const d = document.createElement('div'); d.className = 'notice show'; d.style.top = '1rem'; d.style.zIndex = '50'; d.textContent = text; ui.appendChild(d); setTimeout(() => d.remove(), 1700); }
const coins = () => `<span class="coins">${save.coins}</span>`;
function buy(kind: 'chars' | 'arenas', id: string, price: number) {
  if (save.coins < price) { sound.deny(); toast(T('Koin belum cukup. Menangkan pertandingan untuk mendapat koin.', 'Not enough coins. Win matches to earn more.')); return false; }
  save.coins -= price; save[kind].push(id); persist(); sound.coin(); return true;
}
function endFight() { if (!fight) return; fight.hud?.destroy(); fight.ctl?.destroy(); fight.view.dispose(); fight = null; }

// ---------- splash ----------
async function splash() {
  show(`<div class="logo">Elemental<b>Clash</b></div><div class="elrow">${Object.keys(ELEMS).map(e => icon(e as any)).join('')}</div>
    <div class="load"><i></i></div><div class="mut" id="lt">${T('Memeriksa data simpanan…', 'Checking save data…')}</div>`, 'splash');
  const jobs: (() => void)[] = [...CHARS, BOSS].map(c => () => { portraits[c.id] = stage.thumbChar(c); });
  for (const a of ARENAS) jobs.push(() => { athumbs[a.id] = stage.thumbArena(a.id); });
  for (let i = 0; i < jobs.length; i++) { jobs[i](); $('.load i').style.width = (i + 1) / jobs.length * 100 + '%'; await new Promise(r => setTimeout(r, 0)); }
  if (params.has('skip')) return menu();
  $('#lt').outerHTML = `<div class="tap">${T('Ketuk untuk mulai', 'Tap to start')}</div>`; $('.load').remove();
  const root = ui.firstElementChild as HTMLElement;
  root.addEventListener('pointerup', () => { sound.unlock(); sound.confirm(); menu(); }, { once: true });
}

// ---------- menu ----------
function dailyGoal() {
  if (save.daily.date !== today()) { save.daily = { date: today(), done: false }; persist(); }
  let h = 0; for (const c of today()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { char: charById(save.chars[h % save.chars.length]), arena: arenaById(save.arenas[(h >>> 3) % save.arenas.length]) };
}
function menu() {
  endFight(); sound.music('menu');
  const c = charById(save.lastChar), d = dailyGoal(); stage.showChar(c, .5); stage.showSpin = .3;
  show(`<header class="topbar"><div class="logo sm">Elemental<b>Clash</b></div>${coins()}</header>
    <nav class="mnav">
      <button class="btn pri" data-a="mode" data-v="quick" style="--el:#ffd166">${T('Pertandingan Cepat', 'Quick Match')}</button>
      <button class="btn" data-a="mode" data-v="story">${T('Mode Cerita', 'Story Mode')}<small>${T('Turnamen', 'Tournament')}</small></button>
      <button class="btn" data-a="mode" data-v="training">${T('Latihan', 'Training')}</button>
      <button class="btn" data-a="collection">${T('Koleksi', 'Collection')}</button>
      <button class="btn" data-a="settings">${T('Pengaturan', 'Settings')}</button>
    </nav>
    <div class="menu-char"><h3>${c.name}</h3>${etag(c.elem)}</div>
    <aside class="panel daily"><h4>${T('Tantangan Harian', 'Daily Challenge')}</h4>
      ${save.daily.done ? `<p class="done">${T('Selesai! Kembali lagi besok.', 'Done! Come back tomorrow.')}</p>` : `<p>${T(`Menangkan Pertandingan Cepat memakai <b>${d.char.name}</b> di <b>${tr(d.arena.name)}</b>.`, `Win a Quick Match as <b>${d.char.name}</b> in <b>${tr(d.arena.name)}</b>.`)} <span class="coins">+150</span></p>`}
    </aside>`, 'menu', {
    mode: v => { app.mode = v as Mode; select(save.lastChar); },
    collection: () => collection(), settings: () => settings(),
  });
}

// ---------- pilih karakter ----------
const STAT = () => [T('Kekuatan', 'Power'), T('Kecepatan', 'Speed'), T('Pertahanan', 'Defense'), T('Jangkauan', 'Range')];
function charInfo(c: CharDef) {
  const E = ELEMS[c.elem];
  return `<h2>${c.name}</h2><div class="row">${etag(c.elem)}<span class="mut">${tr(c.role)}</span></div><p>${tr(c.style)}</p>
    <div class="stats">${STAT().map((s, i) => `<span>${s}</span><div class="bar">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= c.stats[i] ? 'on' : ''}"></i>`).join('')}</div>`).join('')}</div>
    <div class="moves">${(['s1', 's2', 'ult'] as const).map((k, i) => `<div class="mv"><b>${[T('Jurus 1', 'Skill 1'), T('Jurus 2', 'Skill 2'), T('Pamungkas', 'Ultimate')][i]}</b><span><strong>${tr(c.moves[k].name!)}</strong> — ${tr(c.moves[k].desc || ['', ''])}</span></div>`).join('')}</div>
    <div class="match"><span class="up">▲ ${T('Kuat', 'Strong')}: ${E.strong.map(icon).join('')}</span><span class="dn">▼ ${T('Lemah', 'Weak')}: ${E.weak.map(icon).join('')}</span></div>`;
}
const thumb = (c: CharDef, sel: boolean, a = 'pick', lock = false) => `<button class="th ${sel ? 'sel' : ''} ${lock ? 'lock' : ''}" data-a="${a}" data-v="${c.id}" style="${elVar(c.elem)};background-image:url(${portraits[c.id]})" aria-label="${c.name}">${icon(c.elem)}${lock ? `<span class="price coins">${c.price}</span>` : ''}</button>`;
function dragRotate(root: HTMLElement) {
  let id = -1, lx = 0;
  root.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('button,.panel')) return; id = e.pointerId; lx = e.clientX; });
  root.addEventListener('pointermove', e => { if (e.pointerId !== id) return; stage.rotateShow((e.clientX - lx) * .012); lx = e.clientX; });
  const up = () => { id = -1; }; root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
}
function select(id: string) {
  endFight(); sound.music('menu');
  const c = charById(id), owned = save.chars.includes(c.id);
  stage.showChar(c, -1.35, !owned); stage.showSpin = 0;
  const title = { quick: T('Pertandingan Cepat', 'Quick Match'), story: T('Mode Cerita', 'Story Mode'), training: T('Latihan', 'Training') }[app.mode];
  const root = show(`<div class="title"><h2>${T('Pilih Karakter', 'Choose Fighter')}</h2><span class="mut">${title} · ${T('geser untuk memutar model', 'drag to rotate the model')}</span><span class="grow"></span>${coins()}</div>
    <div class="sel-body"><div class="panel info" style="${elVar(c.elem)}">${charInfo(c)}</div></div>
    <div class="foot"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button>
      <div class="thumbs">${CHARS.map(x => thumb(x, x.id === id, 'pick', !save.chars.includes(x.id))).join('')}</div>
      ${owned ? `<button class="btn pri" data-a="ok" style="${elVar(c.elem)}">${T('Pilih', 'Select')}</button>` : `<button class="btn pri" data-a="buy" style="--el:#ffd166">${T('Buka', 'Unlock')} · ${c.price}</button>`}</div>`, 'select', {
    pick: v => select(v), back: () => menu(),
    buy: () => { if (buy('chars', c.id, c.price)) select(c.id); },
    ok: () => { app.char = c.id; save.lastChar = c.id; persist(); sound.confirm(); app.mode === 'story' ? story() : opponent(); },
  });
  dragRotate(root);
}

// ---------- pilih lawan + tingkat bot ----------
function opponent() {
  const me = charById(app.char), opp = app.opp === 'random' ? null : charById(app.opp), tr_ = app.mode === 'training';
  let mu = `<span class="mut">${T('Lawan acak: keunggulan elemen terlihat setelah lawan dipilih.', 'Random foe: element matchup appears once a foe is chosen.')}</span>`;
  if (opp) {
    const a = elemMul(me.elem, opp.elem), b = elemMul(opp.elem, me.elem);
    const line = (m: number, mine: boolean) => m > 1 ? `<span class="${mine ? 'up' : 'dn'}">${mine ? '▲' : '▼'} ${mine ? T('Seranganmu unggul +25%', 'Your attacks are strong +25%') : T('Serangan lawan unggul +25%', 'Foe attacks are strong +25%')}</span>`
      : m < 1 ? `<span class="${mine ? 'dn' : 'up'}">${mine ? '▼' : '▲'} ${mine ? T('Seranganmu lemah −20%', 'Your attacks are weak −20%') : T('Serangan lawan lemah −20%', 'Foe attacks are weak −20%')}</span>`
        : `<span class="mut">● ${mine ? T('Seranganmu netral', 'Your attacks are neutral') : T('Serangan lawan netral', 'Foe attacks are neutral')}</span>`;
    mu = line(a, true) + line(b, false);
  }
  const dummies = [['stand', T('Diam', 'Stand'), T('Target statis untuk latihan kombo', 'Static target for combo practice')], ['block', T('Menangkis', 'Block'), T('Latihan menjebol tangkisan', 'Practice guard breaks')], ['fight', T('Melawan', 'Fight back'), T('Bot Normal tanpa batas waktu', 'Normal bot with no timer')]];
  show(`<div class="title"><h2>${T('Pilih Lawan', 'Choose Opponent')}</h2><span class="mut">${tr_ ? T('Latihan', 'Training') : T('dan tingkat bot', 'and bot level')}</span></div>
    <div class="vsrow">
      <div class="vscol" style="${elVar(me.elem)}"><div class="bigpor" style="background-image:url(${portraits[me.id]})"></div><h3>${me.name}</h3>${etag(me.elem)}</div>
      <div class="vscol"><div class="vs">VS</div><div class="match" style="flex-direction:column;gap:.2rem;align-items:center">${mu}</div></div>
      <div class="vscol" style="${elVar(opp ? opp.elem : null)}"><div class="bigpor" style="${opp ? `background-image:url(${portraits[opp.id]})` : 'display:grid;place-items:center;font:700 4rem var(--disp)'}">${opp ? '' : '?'}</div><h3>${opp ? opp.name : T('Acak', 'Random')}</h3>${opp ? etag(opp.elem) : '<span class="etag">?</span>'}</div>
    </div>
    <div class="thumbs sm" style="margin-bottom:.5rem"><button class="th rand ${opp ? '' : 'sel'}" data-a="opp" data-v="random" aria-label="${T('Acak', 'Random')}">?</button>${CHARS.map(x => thumb(x, x.id === app.opp, 'opp')).join('')}</div>
    <div class="levels" style="${tr_ ? 'grid-template-columns:repeat(3,1fr)' : ''}">${tr_
      ? dummies.map(d => `<button class="lv ${app.dummy === d[0] ? 'sel' : ''}" data-a="dummy" data-v="${d[0]}"><b>${d[1]}</b><small>${d[2]}</small></button>`).join('')
      : BOT_LEVELS.map((l, i) => `<button class="lv ${app.level === i ? 'sel' : ''}" data-a="level" data-v="${i}"><b>${tr(l.name)}</b><small>${tr(l.goal)} · ${T('reaksi', 'reaction')} ${l.react[0] * 1000}–${l.react[1] * 1000} ms</small></button>`).join('')}</div>
    <div class="foot"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button><button class="btn pri" data-a="ok">${T('Lanjut', 'Next')}</button></div>`, 'dim', {
    opp: v => { app.opp = v; opponent(); }, level: v => { app.level = +v; save.level = +v; persist(); opponent(); }, dummy: v => { app.dummy = v; opponent(); },
    back: () => select(app.char), ok: () => { sound.confirm(); arenaScreen(); },
  });
}

// ---------- pilih arena ----------
function arenaScreen() {
  const cur = app.arena === 'random' ? null : arenaById(app.arena), locked = !!cur && !save.arenas.includes(cur.id);
  const card = (a: typeof ARENAS[0]) => {
    const lock = !save.arenas.includes(a.id);
    return `<button class="ac ${a.id === app.arena ? 'sel' : ''} ${lock ? 'lock' : ''}" data-a="pick" data-v="${a.id}" style="${elVar(a.elem)}">
      <div class="im" style="background-image:url(${athumbs[a.id]})"></div>${lock ? `<span class="price coins">${a.price}</span>` : ''}
      <div class="tx"><h4>${a.elem ? icon(a.elem) : ''}${tr(a.name)}</h4><p>${a.elem ? `<b style="color:${hex(ELEMS[a.elem].col)}">+10% ${tr(ELEMS[a.elem].name)}</b> · ` : ''}${tr(a.effect)}</p></div></button>`;
  };
  show(`<div class="title"><h2>${T('Pilih Arena', 'Choose Arena')}</h2><span class="mut">${T('Arena memberi bonus elemen dan satu efek lingkungan', 'Each arena grants an element bonus and one hazard')}</span><span class="grow"></span>${coins()}</div>
    <div class="agrid">${ARENAS.map(card).join('')}
      <button class="ac rand ${app.arena === 'random' ? 'sel' : ''}" data-a="pick" data-v="random"><div class="im">?</div><div class="tx"><h4>${T('Acak', 'Random')}</h4><p>${T('Pilih arena terbuka secara acak', 'Pick a random unlocked arena')}</p></div></button></div>
    <div class="foot"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button>
      <button class="tog ${app.pure ? 'on' : ''}" data-a="pure"><i></i><span><b>${T('Mode Murni', 'Pure Mode')}</b> <span class="mut">${T('— matikan efek lingkungan', '— turn hazards off')}</span></span></button>
      ${locked ? `<button class="btn pri" data-a="buy">${T('Buka', 'Unlock')} · ${cur!.price}</button>` : `<button class="btn pri" data-a="ok">${T('Mulai', 'Fight')}</button>`}</div>`, 'dim', {
    pick: v => { app.arena = v; arenaScreen(); }, pure: () => { app.pure = !app.pure; arenaScreen(); }, back: () => opponent(),
    buy: () => { if (buy('arenas', cur!.id, cur!.price)) arenaScreen(); },
    ok: () => {
      sound.confirm();
      const pool = CHARS.filter(c => c.id !== app.char);
      const opp = app.opp === 'random' ? pool[Math.floor(Math.random() * pool.length)].id : app.opp;
      const ar = app.arena === 'random' ? save.arenas[Math.floor(Math.random() * save.arenas.length)] : app.arena;
      startFight(opp, ar, app.mode === 'training' ? 1 : app.level);
    },
  });
}

// ---------- mode cerita ----------
function storyStage(c: CharDef, i: number) {
  const s = STORY[i], rv = rivalOf(c), opp = s.opp === 'rival' ? rv : charById(s.opp);
  return { ...s, oppDef: opp, arenaId: s.arena === 'rival' ? ELEM_ARENA[rv.elem] : s.arena };
}
function story() {
  endFight(); sound.music('menu');
  const c = charById(app.char), idx = Math.min(save.story[c.id] || 0, STORY.length), done = idx >= STORY.length;
  stage.showChar(c, 0); stage.showSpin = .3;
  const cur = done ? null : storyStage(c, idx), ease = save.ease[c.id] || 0;
  const nodes = STORY.map((_, i) => { const s = storyStage(c, i); return `<div class="node ${i < idx ? 'done' : i === idx ? 'cur' : ''}"><div class="th" style="${elVar(s.oppDef.elem)};background-image:url(${portraits[s.oppDef.id]})">${icon(s.oppDef.elem)}</div>${i === 8 ? T('BOS', 'BOSS') : i + 1}</div>`; }).join('<i class="link"></i>');
  show(`<div class="title"><h2>${T('Turnamen Elemen', 'Elemental Tournament')}</h2><span class="mut">${c.name} · ${T('8 lawan + bos', '8 foes + boss')}</span><span class="grow"></span>${coins()}</div>
    <div class="ladder">${nodes}</div>
    <div class="panel" style="${elVar(cur ? cur.oppDef.elem : null)}">${done
      ? `<h3 style="color:var(--gold)">${T('Juara Turnamen!', 'Tournament Champion!')}</h3><p>${T(`${c.name} menaklukkan Omnis. Coba dengan karakter lain atau ulangi dari awal.`, `${c.name} has defeated Omnis. Try another fighter or start over.`)}</p>`
      : `<div class="row"><h3>${idx === 8 ? T('Bos', 'Boss') : T('Babak ', 'Stage ') + (idx + 1)}: ${cur!.oppDef.name}</h3>${etag(cur!.oppDef.elem)}<span class="mut">${tr(arenaById(cur!.arenaId).name)} · ${tr(BOT_LEVELS[Math.max(0, cur!.level - ease)].name)}</span></div><p style="margin-top:.3rem">${tr(cur!.text)}</p>`}</div>
    <div class="foot"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button>
      ${done ? `<button class="btn pri" data-a="reset">${T('Ulangi dari awal', 'Start over')}</button>` : `<button class="btn pri" data-a="ok" style="${elVar(c.elem)}">${T('Bertarung', 'Fight')}</button>`}</div>`, 'dim', {
    back: () => select(app.char), reset: () => { save.story[c.id] = 0; save.ease[c.id] = 0; persist(); story(); },
    ok: () => { sound.confirm(); app.storyIdx = idx; app.pure = false; startFight(cur!.oppDef.id, cur!.arenaId, Math.max(0, cur!.level - ease)); },
  });
}

// ---------- pertarungan ----------
function startFight(oppId: string, arenaId: string, level: number) {
  endFight();
  const p1 = charById(app.char), p2 = charById(oppId), arena = arenaById(arenaId), training = app.mode === 'training';
  const m = new Match({ p1, p2, arena, pure: app.mode === 'story' ? false : app.pure, training }); m.events.length = 0;
  ui.innerHTML = ''; stage.showSpin = 0;
  const view = new FightView(stage, m), bot = new Bot(BOT_LEVELS[level], !!p2.boss);
  if (training && app.dummy !== 'fight') bot.dummy = app.dummy;
  fight = { m, view, hud: null, ctl: null, bot, demo: params.has('demo') ? new Bot(BOT_LEVELS[2]) : null, paused: false, acc: 0, started: false, oppId, arenaId, level };
  view.vsT = 2.2; view.onEvent = onFightEvent; sound.music(arena.id);
  ui.innerHTML = `<div class="vsban"><div class="side" style="${elVar(p1.elem)}"><h2>${p1.name}</h2>${etag(p1.elem)}</div><div class="vs">VS</div><div class="side" style="${elVar(p2.elem)}"><h2>${p2.name}</h2>${etag(p2.elem)}</div></div>`;
  sound.whoosh(2);
}
function beginRound1() {
  const f = fight!; ui.innerHTML = '';
  f.hud = new Hud(ui, f.m, portraits); f.ctl = new Controls(ui, f.m.f[0]); f.ctl.onPause = pause; f.hud.pauseBtn.addEventListener('click', pause);
  f.started = true; f.m.pt = 0; f.m.ev({ t: 'round', n: 1 });
  const a = f.m.arena; if (!f.m.pure && a.elem) setTimeout(() => fight === f && f.hud?.notice(`${tr(a.name)}: ${tr(a.effect)}`, hex(ELEMS[a.elem!].col), 3.5), 1800);
}
function onFightEvent(e: Ev) {
  const f = fight; if (!f) return; const hud = f.hud, m = f.m;
  switch (e.t) {
    case 'round': hud?.msg(m.wins[0] === 1 && m.wins[1] === 1 ? T('Ronde Penentu', 'Final Round') : T('Ronde ', 'Round ') + e.n, m.training ? T('Latihan bebas', 'Free training') : '', 1.3); sound.round(); break;
    case 'fight': hud?.msg(T('Bertarung!', 'Fight!'), '', .8, '#ff5a1f'); sound.fight(); break;
    case 'hit': {
      if (e.kind === 'block') sound.block(); else sound.hit(e.strong, e.elem);
      if (e.adv && hud) { const [x, y] = stage.project(e.x, e.y + .7); hud.pop(x, y, e.adv); }
      if (e.att && e.kind === 'hit') hud?.combo(e.att.idx, e.def.comboN);
      if (e.kind === 'break') hud?.notice(T('Tangkisan jebol!', 'Guard break!'), '#ff5b5b', 1.2);
      if (e.def.idx === 0 && e.kind !== 'block') vibrate(e.strong ? 45 : 18);
      break;
    }
    case 'move': sound.whoosh(e.mv.strong ? 1.6 : 1); if (e.mv.cd) sound.elem(e.f.elem, .6); break;
    case 'ult': hud?.ult(e.f); sound.ult(); vibrate(80); break;
    case 'entFire': { const v = e.e.vis; if (v === 'strike') sound.thunder(); else if (v === 'eruption' || v === 'quake' || v === 'lava') sound.boom(); else if (e.e.elem && v !== 'trap') sound.elem(e.e.elem, .8); break; }
    case 'ent': if (!e.e.owner && e.e.delay > .5) { sound.warn(); if (e.e.vis === 'lava') hud?.notice(T('Lava menyembur di tepi arena!', 'Lava bursts at the edges!'), '#ff5a1f'); if (e.e.vis === 'aroots') hud?.notice(T('Akar muncul!', 'Roots are sprouting!'), '#1fae5e', 1.4); } break;
    case 'warn': sound.warn(); hud?.notice(T('Ombak datang dari ', 'Wave incoming from the ') + (e.dir > 0 ? T('kiri', 'left') : T('kanan', 'right')) + T('! Lompati.', '! Jump over it.'), '#1fc7c1'); break;
    case 'wind': if (e.v) { sound.elem('angin', 1); hud?.notice(T('Angin kencang ', 'Strong wind ') + (e.v > 0 ? '→→' : '←←'), '#6fe3b8', 3.5); } break;
    case 'elemShift': hud?.notice(`Omnis → ${tr(ELEMS[e.f.elem as keyof typeof ELEMS].name)}`, hex(ELEMS[e.f.elem as keyof typeof ELEMS].col), 2.5); sound.elem(e.f.elem, 1); break;
    case 'ko': sound.ko(); vibrate(120); hud?.msg('K.O.', '', 1.6, '#ff5b5b'); break;
    case 'roundEnd': if (e.reason === 'time') hud?.msg(e.winner < 0 ? T('Seri', 'Draw') : T('Waktu Habis', 'Time Up'), e.winner < 0 ? T('Ronde diulang', 'Round replayed') : '', 1.6); else if (e.reason === 'ring') { hud?.msg('Ring Out!', '', 1.6, '#6fe3b8'); sound.ko(); } break;
    case 'matchEnd': if (f.ctl) f.ctl.enabled = false; setTimeout(() => fight === f && result(e.winner === 0), 900); break;
    case 'jump': sound.jump(); break; case 'land': sound.land(); break; case 'dash': sound.dash(); break; case 'heal': sound.heal(); break;
    case 'pillarBreak': sound.boom(); hud?.notice(T('Pilar hancur!', 'Pillar destroyed!'), '#e0b955', 1.4); break;
  }
}

function movesHtml(c: CharDef) {
  return `<div class="moves" style="${elVar(c.elem)}">
    <div class="mv"><b>${T('Serang', 'Attack')}</b><span>${T('Tekan beruntun untuk kombo 3 pukulan. Di udara: tendangan lompat. Sambil menunduk: sapuan.', 'Tap repeatedly for a 3-hit combo. In the air: jump kick. While crouching: sweep.')}</span></div>
    ${(['s1', 's2', 'ult'] as const).map((k, i) => `<div class="mv"><b>${[T('Jurus 1', 'Skill 1'), T('Jurus 2', 'Skill 2'), T('Pamungkas', 'Ultimate')][i]}</b><span><strong>${tr(c.moves[k].name!)}</strong> — ${tr(c.moves[k].desc || ['', ''])}${c.moves[k].cd ? ` <span class="mut">(${c.moves[k].cd} ${T('dtk', 's')})</span>` : ''}</span></div>`).join('')}
    <div class="mv"><b>${T('Tangkis', 'Block')}</b><span>${T('Menahan 85% damage. Tiap serangan yang ditahan memakai stamina; stamina habis = tangkisan jebol.', 'Blocks 85% of damage. Each blocked hit costs stamina; at zero your guard breaks.')}</span></div>
    <div class="mv"><b>Dash</b><span>${T('Melesat cepat dan kebal sesaat. Memakai 1 stamina; pulih penuh dalam 3 detik.', 'A quick burst with brief invulnerability. Costs 1 stamina; fully recovers in 3 seconds.')}</span></div></div>`;
}
function pause() {
  const f = fight; if (!f || f.paused || !f.started || f.m.phase === 'over') return;
  f.paused = true; sound.back();
  const c = f.m.f[0].def, tr_ = f.m.training;
  const o = modal(`<h2>${T('Jeda', 'Paused')}</h2><p class="mut">${c.name} · ${T('Daftar jurus', 'Move list')}</p>${movesHtml(c)}
    ${tr_ ? `<div class="srow"><span>${T('Perilaku lawan', 'Dummy behavior')}</span><div class="seg">${[['stand', T('Diam', 'Stand')], ['block', T('Tangkis', 'Block')], ['fight', T('Melawan', 'Fight')]].map(d => `<button data-a="dummy" data-v="${d[0]}" class="${app.dummy === d[0] ? 'on' : ''}">${d[1]}</button>`).join('')}</div></div>` : ''}
    <div class="mbtns"><button class="btn pri" data-a="resume">${T('Lanjutkan', 'Resume')}</button><button class="btn" data-a="restart">${T('Ulangi', 'Restart')}</button><button class="btn" data-a="quit">${T('Keluar', 'Quit')}</button></div>`, {
    resume: () => { o.remove(); f.paused = false; },
    dummy: (v, el) => { app.dummy = v; f.bot.dummy = v === 'fight' ? null : v; $$('.seg button', o).forEach(b => b.classList.toggle('on', b === el)); },
    restart: () => startFight(f.oppId, f.arenaId, f.level), quit: () => menu(),
  });
}

// ---------- hasil ----------
function result(win: boolean) {
  const f = fight; if (!f) return; f.hud?.destroy(); f.ctl?.destroy(); f.hud = null; f.ctl = null;
  const m = f.m, me = m.f[0].def, earn: [string, number][] = [];
  if (app.mode === 'quick') {
    earn.push(win ? [T('Kemenangan', 'Victory') + ` (${tr(BOT_LEVELS[f.level].name)})`, 40 + 20 * f.level] : [T('Hadiah hiburan', 'Consolation'), 10]);
    const d = dailyGoal();
    if (win && !save.daily.done && d.char.id === me.id && d.arena.id === f.arenaId) { earn.push([T('Tantangan Harian', 'Daily Challenge'), 150]); save.daily.done = true; }
  } else if (app.mode === 'story') {
    earn.push(win ? [app.storyIdx === 8 ? T('Menaklukkan bos', 'Boss defeated') : T('Babak ', 'Stage ') + (app.storyIdx + 1), app.storyIdx === 8 ? 500 : 80 + 20 * app.storyIdx] : [T('Hadiah hiburan', 'Consolation'), 10]);
    if (win) save.story[me.id] = app.storyIdx + 1;
  }
  const total = earn.reduce((s, e) => s + e[1], 0); save.coins += total;
  if (win) { save.wins++; save.streak = 0; sound.win(); } else { save.losses++; save.streak++; sound.lose(); }
  persist(); if (total) setTimeout(() => sound.coin(), 700);
  const col = win ? hex(ELEMS[me.elem].col) : '#ff5b5b';
  const btns = app.mode === 'story'
    ? (win ? `<button class="btn pri" data-a="story">${T('Lanjut', 'Continue')}</button>` : `<button class="btn pri" data-a="again">${T('Coba Lagi', 'Retry')}</button>`) + `<button class="btn" data-a="menu">Menu</button>`
    : `<button class="btn pri" data-a="again">${T('Main Lagi', 'Play Again')}</button><button class="btn sm" data-a="char">${T('Ganti Karakter', 'Change Fighter')}</button><button class="btn sm" data-a="arena">${T('Ganti Arena', 'Change Arena')}</button><button class="btn sm" data-a="menu">Menu</button>`;
  ui.innerHTML = `<div class="panel result" style="--el:${col}"><h1>${win ? T('Menang!', 'Victory!') : T('Kalah', 'Defeat')}</h1>
    <p class="mut">${m.f[0].def.name} ${m.wins[0]} – ${m.wins[1]} ${m.f[1].def.name} · ${tr(m.arena.name)}</p>
    <div class="earn">${earn.map(e => `<div><span>${e[0]}</span><span class="coins">+${e[1]}</span></div>`).join('')}${total ? `<div><b>${T('Total koin', 'Total coins')}</b>${coins()}</div>` : ''}</div>
    <div class="row" style="flex-wrap:wrap">${btns}</div></div>`;
  bind(ui.firstElementChild as HTMLElement, {
    again: () => startFight(f.oppId, f.arenaId, f.level), story: () => story(), menu: () => menu(), char: () => select(app.char), arena: () => arenaScreen(),
  });
  // kalah 3 kali beruntun: tawarkan turun satu tingkat (boleh ditolak)
  if (!win && save.streak >= 3 && f.level > 0 && app.mode !== 'training') {
    const lower = tr(BOT_LEVELS[f.level - 1].name);
    const o = modal(`<h2>${T('Turunkan tingkat?', 'Lower the difficulty?')}</h2><p>${T(`Kamu kalah 3 kali beruntun. Mau mencoba tingkat <b>${lower}</b>?`, `You lost 3 times in a row. Want to try <b>${lower}</b>?`)}</p>
      <div class="mbtns"><button class="btn pri" data-a="yes">${T('Ya, turunkan', 'Yes, lower it')}</button><button class="btn" data-a="no">${T('Tidak', 'No thanks')}</button></div>`, {
      yes: () => { save.streak = 0; if (app.mode === 'story') save.ease[me.id] = (save.ease[me.id] || 0) + 1; else { app.level = f.level - 1; save.level = app.level; } persist(); o.remove(); startFight(f.oppId, f.arenaId, f.level - 1); },
      no: () => { save.streak = 0; persist(); o.remove(); },
    });
  }
}

// ---------- koleksi ----------
function collection(view = save.lastChar) {
  const c = charById(view); stage.showChar(c, -2.2, !save.chars.includes(c.id)); stage.showSpin = .4;
  const st = Object.values(save.story).filter(v => v >= STORY.length).length;
  show(`<div class="title"><h2>${T('Koleksi', 'Collection')}</h2><span class="mut">${save.chars.length}/${CHARS.length} ${T('karakter', 'fighters')} · ${save.arenas.length}/${ARENAS.length} arena · ${save.wins} ${T('menang', 'wins')} / ${save.losses} ${T('kalah', 'losses')} · ${st} ${T('gelar juara', 'titles')}</span><span class="grow"></span>${coins()}</div>
    <div class="sel-body"><div class="scroll" style="flex:0 0 57%;height:100%"><h4 class="disp mut" style="font-size:.75rem;margin-bottom:.4rem">${T('Karakter', 'Fighters')}</h4>
      <div class="thumbs" style="justify-content:flex-start;padding:.35rem 0 .8rem">${CHARS.map(x => thumb(x, x.id === view, 'char', !save.chars.includes(x.id))).join('')}</div>
      <h4 class="disp mut" style="font-size:.75rem;margin-bottom:.4rem">Arena</h4>
      <div class="cgrid">${ARENAS.map(a => { const lock = !save.arenas.includes(a.id); return `<button class="ac ${lock ? 'lock' : ''}" data-a="arena" data-v="${a.id}" style="${elVar(a.elem)}"><div class="im" style="background-image:url(${athumbs[a.id]})"></div>${lock ? `<span class="price coins">${a.price}</span>` : ''}<div class="tx"><h4>${a.elem ? icon(a.elem) : ''}${tr(a.name)}</h4></div></button>`; }).join('')}</div></div></div>
    <div class="foot"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button><span class="mut" style="font-size:.8rem">${T('Ketuk item terkunci untuk membukanya dengan koin.', 'Tap a locked item to unlock it with coins.')}</span><span></span></div>`, 'select', {
    back: () => menu(),
    char: v => { const x = charById(v); collection(v); if (!save.chars.includes(v)) confirmBuy(x.name, x.price, () => { if (buy('chars', v, x.price)) collection(v); }); },
    arena: v => { const a = arenaById(v); if (!save.arenas.includes(v)) confirmBuy(tr(a.name), a.price, () => { if (buy('arenas', v, a.price)) collection(view); }); },
  });
  $('.select').style.background = 'linear-gradient(270deg, rgba(7,9,20,.94) 0%, rgba(7,9,20,.86) 56%, rgba(7,9,20,0) 72%)';
}
function confirmBuy(name: string, price: number, yes: () => void) {
  const o = modal(`<h2>${T('Buka', 'Unlock')} ${name}?</h2><p>${T('Harga', 'Price')}: <span class="coins">${price}</span> · ${T('Koinmu', 'Your coins')}: ${coins()}</p>
    <div class="mbtns"><button class="btn pri" data-a="yes">${T('Buka', 'Unlock')}</button><button class="btn" data-a="no">${T('Batal', 'Cancel')}</button></div>`, { yes: () => { o.remove(); yes(); }, no: () => o.remove() });
}

// ---------- pengaturan ----------
function settings() {
  const seg = (key: string, opts: [string | number | boolean, string][], cur: unknown) => `<div class="seg">${opts.map(o => `<button data-a="set" data-v="${key}:${o[0]}" class="${o[0] === cur ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`;
  const rng = (key: string, v: number, min: number, max: number, step: number) => `<input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${v}">`;
  const row = (l: string, c: string) => `<div class="srow"><span>${l}</span>${c}</div>`;
  const root = show(`<div class="title"><h2>${T('Pengaturan', 'Settings')}</h2></div><div class="sgrid">
    ${row(T('Bahasa', 'Language'), seg('lang', [['id', 'Indonesia'], ['en', 'English']], save.lang))}
    ${row(T('Ukuran tombol', 'Button size'), rng('ctrl.size', save.ctrl.size, .75, 1.35, .05))}
    ${row(T('Grafis', 'Graphics'), seg('gfx', [[0, T('Rendah', 'Low')], [1, T('Sedang', 'Medium')], [2, T('Tinggi', 'High')]], save.gfx))}
    ${row(T('Transparansi tombol', 'Button opacity'), rng('ctrl.opacity', save.ctrl.opacity, .3, 1, .05))}
    ${row(T('Volume efek', 'Effects volume'), rng('sfx', save.sfx, 0, 1, .05))}
    ${row(T('Jarak tombol dari tepi', 'Button edge offset'), rng('ctrl.margin', save.ctrl.margin, 0, 3, .25))}
    ${row(T('Volume musik', 'Music volume'), rng('music', save.music, 0, 1, .05))}
    ${row(T('Tukar sisi kontrol (kidal)', 'Swap control sides (left-handed)'), seg('ctrl.swap', [[false, T('Tidak', 'Off')], [true, T('Ya', 'On')]], save.ctrl.swap))}
    ${row(T('Getar haptic', 'Haptic feedback'), seg('haptic', [[false, T('Mati', 'Off')], [true, T('Nyala', 'On')]], save.haptic))}
    ${row(T('Mode buta warna', 'Colorblind mode'), seg('cb', [[false, T('Mati', 'Off')], [true, T('Nyala', 'On')]], save.cb))}
    ${row(T('Ukuran teks', 'Text size'), seg('text', [[.9, 'A−'], [1, 'A'], [1.15, 'A+']], save.text))}
    ${row(T('Hapus semua data simpanan', 'Erase all save data'), `<button class="btn sm" data-a="reset">${T('Hapus', 'Erase')}</button>`)}
    </div><div class="foot"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button><span class="mut" style="font-size:.75rem">Elemental Clash v0.1 · ${T('100% offline, data tersimpan di perangkat', '100% offline, data stays on this device')}</span></div>`, 'dim', {
    back: () => menu(),
    set: v => { const [k, raw] = v.split(':'); const val: any = raw === 'true' ? true : raw === 'false' ? false : isNaN(+raw) ? raw : +raw; setKey(k, val); settings(); },
    reset: () => { const o = modal(`<h2>${T('Hapus data?', 'Erase data?')}</h2><p>${T('Koin, koleksi, dan progres cerita akan hilang.', 'Coins, collection and story progress will be lost.')}</p><div class="mbtns"><button class="btn pri" style="--el:#ff5b5b" data-a="yes">${T('Hapus', 'Erase')}</button><button class="btn" data-a="no">${T('Batal', 'Cancel')}</button></div>`, { yes: () => { resetSave(); app.char = save.lastChar; applySettings(); settings(); }, no: () => o.remove() }); },
  });
  root.addEventListener('input', e => { const t = e.target as HTMLInputElement; if (t.dataset.k) setKey(t.dataset.k, +t.value); });
}
function setKey(k: string, val: any) { const p = k.split('.'); if (p.length === 2) (save as any)[p[0]][p[1]] = val; else (save as any)[k] = val; persist(); applySettings(); }

// ---------- loop ----------
let last = performance.now(), pending = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  pending += Math.min(.1, (now - last) / 1000); last = now;
  if (stage.fpsCap === 30 && pending < 1 / 30 - .003) return;
  const rdt = Math.min(.05, pending); pending = 0;
  const f = fight;
  if (f && !f.paused) {
    const m = f.m;
    if (!f.started) { if (f.view.vsT <= 0) beginRound1(); }
    else {
      const ts = m.slowmo > 0 ? .3 : 1; m.slowmo = Math.max(0, m.slowmo - rdt);
      f.acc = Math.min(.1, f.acc + rdt * ts);
      while (f.acc >= STEP) {
        const i0 = f.demo ? f.demo.update(STEP, m.f[0], m.f[1], m) : f.ctl ? f.ctl.read() : undefined;
        m.step(STEP, i0 || { mx: 0, up: false, down: false, atk: false, s1: false, s2: false, block: false, dash: false, ult: false }, f.bot.update(STEP, m.f[1], m.f[0], m));
        f.acc -= STEP;
      }
      f.ctl?.sync(m.f[0]); f.hud?.update(rdt);
    }
    f.view.update(rdt, rdt);
  }
  stage.render(f && f.paused ? 0 : rdt);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); sound.suspend(true); } else sound.suspend(false); });
addEventListener('contextmenu', e => e.preventDefault());

applySettings();
requestAnimationFrame(frame);
splash();
(window as any).__ec = { app, save, stage, startFight, menu, select, opponent, arenaScreen, story, settings, collection, result, get fight() { return fight; } };
