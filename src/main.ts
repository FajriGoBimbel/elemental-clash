// Elemental Clash — alur layar dan loop game.
import './style.css';
import { ARENAS, BOSS, BOT_LEVELS, CHARS, CharDef, ELEMS, ELEM_ARENA, STORY, arenaById, charById, elemMul, hex, rivalOf } from './data';
import { Match, Ev } from './game/match';
import { Bot } from './game/bot';
import { Stage } from './gfx/stage';
import { FightView } from './gfx/fightview';
import { Hud } from './ui/hud';
import { Controls, KEYMAP } from './ui/input';
import { Input, noInput } from './game/fighter';
import { HostRoom } from './net/room';
import { Mirror, snapshot } from './net/sync';
import { getSock } from './net/transport';
import { controllerMode, ctlSaved, GuestOpts } from './ui/controller';
import { initScreen } from './ui/screen';
import { joinLink, shareModal, takeJoinCode } from './ui/share';
import { $, $$, bind, elVar, esc, etag, icon, modal, show, sigIcon, toast, ui } from './ui/dom';
import { T, loadSave, persist, resetSave, save, today, tr } from './save';
import { sound } from './audio';

loadSave();
const stage = new Stage(document.getElementById('gl') as HTMLCanvasElement);
const portraits: Record<string, string> = {}, athumbs: Record<string, string> = {};
const params = new URLSearchParams(location.search);
type Mode = 'quick' | 'story' | 'training' | 'versus';
const app = { mode: 'quick' as Mode, char: save.lastChar, opp: 'random', level: save.level, dummy: 'stand', arena: 'kuil', pure: false, storyIdx: 0 };
interface Fight {
  m: Match; view: FightView; hud: Hud | null; bot: Bot | null; demo: Bot | null; paused: boolean; acc: number; started: boolean; oppId: string; arenaId: string; level: number;
  /** kontrol sentuh/keyboard di layar ini dan slot pemain yang dikendalikan masing-masing */
  ctls: Controls[]; ctlSlot: number[]; src: (() => Input)[];
  /** mode 2 Layar di perangkat kedua: keadaan datang dari host, tidak disimulasikan di sini */
  mirror?: Mirror; guest?: { slot: number; onPause: () => void };
  /** Main Bareng: siapa yang menjeda (-1 = host), modal jeda, slot yang terputus */
  pauseBy: number; pauseEl: HTMLElement | null; dropSlot: number;
}
let fight: Fight | null = null;
const STEP = 1 / 60;

function applySettings() {
  const r = document.documentElement; r.style.setProperty('--ts', String(save.text)); r.classList.toggle('cb', save.cb); r.lang = save.lang;
  if (stage.quality !== save.gfx) stage.setQuality(save.gfx);
  sound.setVol(save.sfx, save.music); fight?.ctls.forEach(c => c.applySettings());
}
const vibrate = (ms: number) => { if (save.haptic && navigator.vibrate) navigator.vibrate(ms); };

// ---------- util layar ----------
const coins = () => `<span class="coins">${save.coins}</span>`;
function buy(kind: 'chars' | 'arenas', id: string, price: number) {
  if (save.coins < price) { sound.deny(); toast(T('Koin belum cukup. Menangkan pertandingan untuk mendapat koin.', 'Not enough coins. Win matches to earn more.')); return false; }
  save.coins -= price; save[kind].push(id); persist(); sound.coin(); return true;
}
function endFight() { if (!fight) return; fight.hud?.destroy(); fight.ctls.forEach(c => c.destroy()); fight.pauseEl?.remove(); fight.view.dispose(); fight = null; }

// ---------- splash ----------
async function splash() {
  show(`<div class="logo">Elemental<b>Clash</b></div><div class="elrow">${Object.keys(ELEMS).map(e => icon(e as any)).join('')}</div>
    <div class="load"><i></i></div><div class="mut" id="lt">${T('Memeriksa data simpanan…', 'Checking save data…')}</div>`, 'splash');
  const jobs: (() => void)[] = [...CHARS, BOSS].map(c => () => { portraits[c.id] = stage.thumbChar(c); });
  for (const a of ARENAS) jobs.push(() => { athumbs[a.id] = stage.thumbArena(a.id); });
  for (let i = 0; i < jobs.length; i++) { jobs[i](); $('.load i').style.width = (i + 1) / jobs.length * 100 + '%'; await new Promise(r => setTimeout(r, 0)); }
  const jc = takeJoinCode(), saved = ctlSaved();
  if (getSock()) {
    if (jc && saved?.code !== jc) return joinCtl(false, jc); // dibuka dari link undangan: langsung gabung dengan kodenya
    if (saved) return joinCtl(true); // halaman sempat dimuat ulang saat jadi kontroler: sambung lagi otomatis
  }
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
  endFight(); vsClose(); if (idle) setIdle(false); sound.music('menu');
  const c = charById(save.lastChar), d = dailyGoal(); stage.showChar(c, .5); stage.showSpin = .3;
  show(`<header class="topbar"><div class="logo sm">Elemental<b>Clash</b></div><div class="row">${padBtn()}${coins()}</div></header>
    <nav class="mnav">
      <button class="btn pri" data-a="mode" data-v="quick" style="--el:#ffd166">${T('Pertandingan Cepat', 'Quick Match')}</button>
      <button class="btn" data-a="mode" data-v="story">${T('Mode Cerita', 'Story Mode')}<small>${T('Turnamen', 'Tournament')}</small></button>
      <button class="btn" data-a="versus">${T('Main Bareng', 'Versus')}<small>${T('2 pemain', '2 players')}</small></button>
      <button class="btn" data-a="mode" data-v="training">${T('Latihan', 'Training')}</button>
      <button class="btn" data-a="collection">${T('Koleksi', 'Collection')}</button>
      <button class="btn" data-a="settings">${T('Pengaturan', 'Settings')}</button>
    </nav>
    <div class="menu-char"><h3>${c.name}</h3>${etag(c.elem)}</div>
    <aside class="panel daily"><h4>${T('Tantangan Harian', 'Daily Challenge')}</h4>
      ${save.daily.done ? `<p class="done">${T('Selesai! Kembali lagi besok.', 'Done! Come back tomorrow.')}</p>` : `<p>${T(`Menangkan Pertandingan Cepat memakai <b>${d.char.name}</b> di <b>${tr(d.arena.name)}</b>.`, `Win a Quick Match as <b>${d.char.name}</b> in <b>${tr(d.arena.name)}</b>.`)} <span class="coins">+150</span></p>`}
    </aside>`, 'menu', {
    mode: v => { app.mode = v as Mode; select(save.lastChar); },
    collection: () => collection(), settings: () => settings(), versus: () => vsMenu(), pad: () => padModal(),
  });
}

// ---------- pilih karakter ----------
const STAT = () => [T('Kekuatan', 'Power'), T('Kecepatan', 'Speed'), T('Pertahanan', 'Defense'), T('Jangkauan', 'Range')];
function charInfo(c: CharDef) {
  const E = ELEMS[c.elem];
  return `<h2>${c.name}</h2><div class="row">${etag(c.elem)}<span class="mut">${tr(c.role)}</span></div><p>${tr(c.style)}</p>
    <div class="stats">${STAT().map((s, i) => `<span>${s}</span><div class="bar">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= c.stats[i] ? 'on' : ''}"></i>`).join('')}</div>`).join('')}</div>
    <div class="moves">${(['s1', 'ult'] as const).map((k, i) => `<div class="mv"><b>${[T('Spesial', 'Special'), T('Pamungkas', 'Ultimate')][i]}</b><span><strong>${tr(c.moves[k].name!)}</strong> — ${tr(c.moves[k].desc || ['', ''])}</span></div>`).join('')}</div>
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
function arenaScreen(still = false) {
  const V = app.mode === 'versus';
  const cur = app.arena === 'random' ? null : arenaById(app.arena), locked = !!cur && !save.arenas.includes(cur.id);
  const card = (a: typeof ARENAS[0]) => {
    const lock = !save.arenas.includes(a.id);
    return `<button class="ac ${a.id === app.arena ? 'sel' : ''} ${lock ? 'lock' : ''}" data-a="pick" data-v="${a.id}" style="${elVar(a.elem)}">
      <div class="im" style="background-image:url(${athumbs[a.id]})"></div>${lock ? `<span class="price coins">${a.price}</span>` : ''}
      <div class="tx"><h4>${a.elem ? icon(a.elem) : ''}${tr(a.name)}</h4><p>${a.elem ? `<b style="color:${hex(ELEMS[a.elem].col)}">+10% ${tr(ELEMS[a.elem].name)}</b> · ` : ''}${tr(a.effect)}</p></div></button>`;
  };
  show(`<div class="title"><h2>${T('Pilih Arena', 'Choose Arena')}</h2><span class="mut">${V ? (remote(0) ? T('Pemain 1 memilih arena di HP-nya', 'Player 1 picks the arena on their phone') : T('Pemain 1 memilih arena', 'Player 1 picks the arena')) : T('Arena memberi bonus elemen dan satu efek lingkungan', 'Each arena grants an element bonus and one hazard')}</span><span class="grow"></span>${coins()}</div>
    <div class="agrid">${ARENAS.map(card).join('')}
      <button class="ac rand ${app.arena === 'random' ? 'sel' : ''}" data-a="pick" data-v="random"><div class="im">?</div><div class="tx"><h4>${T('Acak', 'Random')}</h4><p>${T('Pilih arena terbuka secara acak', 'Pick a random unlocked arena')}</p></div></button></div>
    <div class="foot"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button>
      <button class="tog ${app.pure ? 'on' : ''}" data-a="pure"><i></i><span><b>${T('Mode Murni', 'Pure Mode')}</b> <span class="mut">${T('— matikan efek lingkungan', '— turn hazards off')}</span></span></button>
      ${locked ? `<button class="btn pri" data-a="buy">${T('Buka', 'Unlock')} · ${cur!.price}</button>` : `<button class="btn pri" data-a="ok">${T('Mulai', 'Fight')}</button>`}</div>`, still ? 'dim still' : 'dim', {
    pick: v => { app.arena = v; arenaScreen(); }, pure: () => { app.pure = !app.pure; arenaScreen(); }, back: () => V ? vsSelect(true) : opponent(),
    buy: () => { if (buy('arenas', cur!.id, cur!.price)) arenaScreen(); },
    ok: () => {
      if (V) return vsGo();
      sound.confirm();
      const pool = CHARS.filter(c => c.id !== app.char);
      const opp = app.opp === 'random' ? pool[Math.floor(Math.random() * pool.length)].id : app.opp;
      const ar = app.arena === 'random' ? save.arenas[Math.floor(Math.random() * save.arenas.length)] : app.arena;
      startFight(opp, ar, app.mode === 'training' ? 1 : app.level);
    },
  });
  if (V) vsSync();
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
function startFight(oppId: string, arenaId: string, level: number, p1Id = app.char) {
  endFight();
  const V = app.mode === 'versus', p1 = charById(p1Id), p2 = charById(oppId), arena = arenaById(arenaId), training = app.mode === 'training';
  const m = new Match({ p1, p2, arena, pure: app.mode === 'story' ? false : app.pure, training }); m.events.length = 0;
  ui.innerHTML = ''; stage.showSpin = 0;
  const view = new FightView(stage, m), bot = V ? null : new Bot(BOT_LEVELS[level], !!p2.boss);
  if (bot && training && app.dummy !== 'fight') bot.dummy = app.dummy;
  const F: Fight = fight = {
    m, view, hud: null, bot, demo: params.has('demo') && !V ? new Bot(BOT_LEVELS[2]) : null, paused: false, acc: 0, started: false, oppId, arenaId, level,
    ctls: [], ctlSlot: [], src: [], pauseBy: -1, pauseEl: null, dropSlot: -1,
  };
  F.src = V ? [0, 1].map(i => () => vsInput(F, i))
    : [() => F.demo ? F.demo.update(STEP, m.f[0], m.f[1], m) : padInput(F.ctls[0]?.read() ?? noInput()), () => bot!.update(STEP, m.f[1], m.f[0], m)];
  view.vsT = 2.2; view.onEvent = onFightEvent; sound.music(arena.id);
  vsBanner(p1, p2);
}
function vsBanner(p1: CharDef, p2: CharDef) {
  ui.innerHTML = `<div class="vsban"><div class="side" style="${elVar(p1.elem)}"><h2>${p1.name}</h2>${etag(p1.elem)}</div><div class="vs">VS</div><div class="side" style="${elVar(p2.elem)}"><h2>${p2.name}</h2>${etag(p2.elem)}</div></div>`;
  sound.whoosh(2);
}
/** Mode 2 Layar, perangkat kedua: tampilkan pertarungan dari host di layar ini, kendalikan petarung slot sendiri. */
function guestStart(o: GuestOpts, onPause: () => void) {
  endFight(); setIdle(false);
  const p1 = charById(o.p[0]), p2 = charById(o.p[1]), arena = arenaById(o.a);
  const m = new Match({ p1, p2, arena, pure: o.pure }); m.events.length = 0;
  ui.innerHTML = ''; stage.showSpin = 0;
  const view = new FightView(stage, m);
  fight = {
    m, view, hud: null, bot: null, demo: null, paused: false, acc: 0, started: false, oppId: o.p[1], arenaId: o.a, level: 1,
    ctls: [], ctlSlot: [], src: [], pauseBy: -1, pauseEl: null, dropSlot: -1, mirror: new Mirror(m), guest: { slot: o.slot, onPause },
  };
  view.vsT = 2.2; view.onEvent = onFightEvent; sound.music(arena.id);
  vsBanner(p1, p2);
}
const guestApi = {
  start: guestStart,
  read: (): Input => fight?.guest ? fight.ctls[0]?.read() ?? noInput() : noInput(),
  snap: (s: unknown) => fight?.mirror?.apply(s),
  end: () => { if (fight?.guest) endFight(); setIdle(true); sound.music(null); },
};
function beginRound1() {
  const f = fight!; ui.innerHTML = '';
  f.hud = new Hud(ui, f.m, portraits); f.hud.pauseBtn.addEventListener('click', () => pause());
  if (f.guest) { const g = f.guest; f.ctls = [new Controls(ui, f.m.f[g.slot].elem, { keys: KEYMAP.solo })]; f.ctlSlot = [g.slot]; }
  else if (app.mode === 'versus') vsControls(f);
  else { f.ctls = [new Controls(ui, f.m.f[0].elem)]; f.ctlSlot = [0]; }
  f.ctls.forEach(c => c.onPause = () => pause());
  f.started = true; if (f.mirror) return; // 2 Layar: ronde & efek arena mengikuti snapshot host
  f.m.pt = 0; f.m.ev({ t: 'round', n: 1 });
  const a = f.m.arena; if (!f.m.pure && a.elem) setTimeout(() => fight === f && f.hud?.notice(`${tr(a.name)}: ${tr(a.effect)}`, hex(ELEMS[a.elem!].col), 3.5), 1800);
}
function onFightEvent(e: Ev) {
  const f = fight; if (!f) return; const hud = f.hud, m = f.m;
  if (vs?.cfg === 'D' && !f.mirror) vs.evq.push(e); // diteruskan ke layar kedua bersama snapshot
  switch (e.t) {
    case 'round': hud?.msg(m.wins[0] === 1 && m.wins[1] === 1 ? T('Ronde Penentu', 'Final Round') : T('Ronde ', 'Round ') + e.n, m.training ? T('Latihan bebas', 'Free training') : '', 1.3); sound.round(); break;
    case 'fight': hud?.msg(T('Bertarung!', 'Fight!'), '', .8, '#ff5a1f'); sound.fight(); break;
    case 'hit': {
      if (e.kind === 'block') sound.block(); else sound.hit(e.strong, e.elem, e.n, e.fin);
      if (e.fin) hud?.impact();
      if (e.adv && hud) { const [x, y] = stage.project(e.x, e.y + .7); hud.pop(x, y, e.adv); }
      if (e.att && e.kind !== 'block') hud?.combo(e.att.idx, e.def.comboN, e.kind === 'break' ? 'GUARD BREAK!' : e.fin ? (e.def.comboN >= 5 ? 'BRUTAL!' : e.dmg >= 110 ? 'SMASH!' : 'NICE!') : '');
      if (e.kind !== 'block') {
        if (isLocal(e.def.idx)) vibrate(e.strong ? 45 : 18);
        buzz(e.def.idx, 'hurt'); if (e.att) buzz(e.att.idx, 'hit');
      }
      break;
    }
    case 'move': sound.whoosh(e.mv.strong ? 1.6 : 1); if (e.mv.cd) sound.elem(e.f.elem, .6); break;
    case 'ult': hud?.ult(e.f); sound.ult(); vibrate(80); buzz(e.f.idx, 'ult'); break;
    case 'entFire': { const v = e.e.vis; if (v === 'strike') sound.thunder(); else if (v === 'eruption' || v === 'quake' || v === 'lava') sound.boom(); else if (e.e.elem && v !== 'trap') sound.elem(e.e.elem, .8); break; }
    case 'ent': if (!e.e.owner && e.e.delay > .5) { sound.warn(); if (e.e.vis === 'lava') hud?.notice(T('Lava menyembur di tepi arena!', 'Lava bursts at the edges!'), '#ff5a1f'); if (e.e.vis === 'aroots') hud?.notice(T('Akar muncul!', 'Roots are sprouting!'), '#1fae5e', 1.4); } break;
    case 'warn': sound.warn(); hud?.notice(T('Ombak datang dari ', 'Wave incoming from the ') + (e.dir > 0 ? T('kiri', 'left') : T('kanan', 'right')) + T('! Lompati.', '! Jump over it.'), '#1fc7c1'); break;
    case 'wind': if (e.v) { sound.elem('angin', 1); hud?.notice(T('Angin kencang ', 'Strong wind ') + (e.v > 0 ? '→→' : '←←'), '#6fe3b8', 3.5); } break;
    case 'elemShift': hud?.notice(`Omnis → ${tr(ELEMS[e.f.elem as keyof typeof ELEMS].name)}`, hex(ELEMS[e.f.elem as keyof typeof ELEMS].col), 2.5); sound.elem(e.f.elem, 1); break;
    case 'ko': sound.ko(); vibrate(120); hud?.msg('K.O.', '', 1.6, '#ff5b5b'); break;
    case 'roundEnd': if (e.reason === 'time') hud?.msg(e.winner < 0 ? T('Seri', 'Draw') : T('Waktu Habis', 'Time Up'), e.winner < 0 ? T('Ronde diulang', 'Round replayed') : '', 1.6); else if (e.reason === 'ring') { hud?.msg('Ring Out!', '', 1.6, '#6fe3b8'); sound.ko(); } break;
    case 'matchEnd': f.ctls.forEach(c => c.enabled = false); if (f.mirror) break; setTimeout(() => fight === f && (app.mode === 'versus' ? vsResult(e.winner) : result(e.winner === 0)), 900); break;
    case 'charged': sound.elem(e.f.elem, .8); break;
    case 'jump': sound.jump(); break; case 'land': sound.land(e.slam); break; case 'dash': sound.dash(); break; case 'heal': sound.heal(); break;
    case 'pillarBreak': sound.boom(); hud?.notice(T('Pilar hancur!', 'Pillar destroyed!'), '#e0b955', 1.4); break;
  }
}

// nama gerakan kombo menurut animasinya; gerakan khas (yang punya desc) memakai namanya sendiri
const ANIM_NAME: Record<string, [string, string]> = {
  jab: ['Jab', 'Jab'], cross: ['Cross', 'Cross'], hook: ['Hook', 'Hook'], uppercut: ['Uppercut', 'Uppercut'], roundhouse: ['Roundhouse', 'Roundhouse'],
  spinkick: ['Tendangan Putar', 'Spinning Back Kick'], teep: ['Teep', 'Teep'], kick: ['Tendangan', 'Kick'], superman: ['Superman Punch', 'Superman Punch'], elbow: ['Sikutan', 'Elbow'],
  gknee: ['Lutut Bara', 'Ember Knee'], spinfist: ['Tinju Putar', 'Spinning Backfist'], sweep: ['Sapuan Akar', 'Root Sweep'], crescent: ['Tendangan Kipas', 'Crescent Kick'],
};
const hvChain = (c: CharDef) => (['hv', 'hv2', 'hv3'] as const).map(id => { const m = c.moves[id]; return tr(m.desc ? m.name! : ANIM_NAME[m.anim] || [m.anim, m.anim]); }).join(', ');
/** Semua rantai kombo karakter (L-L-L, H-L, ...), ditelusuri dari cabang data gerakannya. */
function combos(c: CharDef) {
  const out: [string, string][] = [], mv = c.moves;
  const walk = (id: string, pat: string, names: string[]) => {
    const m = mv[id], n = [...names, m.desc ? tr(m.name!) : tr(ANIM_NAME[m.anim] || [m.anim, m.anim])];
    const br = m.branch || {};
    // lanjutan ke kombo udara tidak dirinci di sini (sudah dijelaskan di baris serangan udara)
    if (br.atk && mv[br.atk].air) { out.push([pat.split('').join('-'), n.join(', ') + ' → ' + T('kombo udara', 'air combo')]); return; }
    if (!br.atk && !br.hvy) { if (pat.length > 1) out.push([pat.split('').join('-'), n.join(', ')]); return; }
    if (br.atk) walk(br.atk, pat + 'L', n);
    if (br.hvy) walk(br.hvy, pat + 'H', n);
  };
  walk('a1', 'L', []); walk('hv', 'H', []);
  return out;
}
function movesHtml(c: CharDef) {
  return `<div class="moves" style="${elVar(c.elem)}">
    <div class="mv"><b>${T('Serangan Ringan', 'Light Attack')}</b><span>${T('Tekan beruntun untuk kombo jab, cross, hook. Di udara: tendangan lompat. Sambil menunduk: sapuan.', 'Tap repeatedly for a jab, cross, hook combo. In the air: jump kick. While crouching: sweep.')}</span></div>
    <div class="mv"><b>${T('Serangan Berat', 'Heavy Attack')}</b><span><strong>${tr(c.moves.hv.name!)}</strong> — ${T(`Tekan beruntun untuk kombo ${hvChain(c)}: ritmenya lebih lambat dari serangan ringan tapi kuat, serangan terakhir menjatuhkan lawan. Di udara: tendangan menukik. Sambil menunduk: pukulan ke atas, ampuh melawan lompatan.`, `Tap repeatedly for a ${hvChain(c)} combo: slower rhythm than light attacks but strong, the last hit knocks the foe down. In the air: diving kick. While crouching: rising strike, great against jump-ins.`)}</span></div>
    ${(['s1', 'ult'] as const).map((k, i) => `<div class="mv"><b>${[T('Spesial', 'Special'), T('Pamungkas', 'Ultimate')][i]}</b><span><strong>${tr(c.moves[k].name!)}</strong> — ${tr(c.moves[k].desc || ['', ''])}${c.moves[k].cd ? ` <span class="mut">(${c.moves[k].cd} ${T('dtk', 's')})</span>` : ''}</span></div>`).join('')}
    ${(['a2', 'a3', 'a4', 'hv3', 'hhl'] as const).filter(k => c.moves[k]?.desc).map(k => `<div class="mv"><b>${T('Ciri khas', 'Signature')}</b><span><strong>${tr(c.moves[k].name!)}</strong> — ${tr(c.moves[k].desc!)}</span></div>`).join('')}
    <div class="mv"><b>${T('Kombo', 'Combos')}</b><span>${combos(c).map(([k, n]) => `<strong>${k}</strong> ${n}`).join(' · ')} <span class="mut">(L = ${T('ringan', 'light')}, H = ${T('berat', 'heavy')})</span></span></div>
    <div class="mv"><b>${T('Tahan penutup', 'Hold finisher')}</b><span>${T('Tahan tombol pukulan ke-3: Light = rentetan pukulan yang menahan lawan; Heavy = pukulan charged yang menjebol tangkisan.', 'Hold the 3rd button: Light = a flurry that keeps the foe stunned; Heavy = a charged blow that breaks guard.')}</span></div>
    <div class="mv"><b>${T('Tangkis', 'Block')}</b><span>${T('Menahan 85% damage. Tiap serangan yang ditahan memakai stamina; stamina habis = tangkisan jebol. Saat terjatuh atau terlempar: tekan untuk langsung bangun dan kebal sesaat, seperti dash (1 stamina).', 'Blocks 85% of damage. Each blocked hit costs stamina; at zero your guard breaks. While knocked down or airborne: tap to get up instantly with brief invulnerability, like dash (1 stamina).')}</span></div>
    <div class="mv"><b>Dash</b><span>${T('Dengan arah: melesat cepat dan kebal sesaat. Tanpa arah: kebal di tempat. Saat terjatuh atau terlempar: lepas dari kombo. Saat terhuyung kena pukul: combo breaker (2 stamina). Memakai 1 stamina; pulih penuh dalam ±5 detik.', 'With a direction: a quick burst with brief invulnerability. Without: invulnerable in place. While knocked down or airborne: break free. While staggered: combo breaker (2 stamina). Costs 1 stamina; fully recovers in about 5 seconds.')}</span></div></div>`;
}
function pause(by = -1) {
  if (fight?.guest) return fight.guest.onPause(); // layar kedua: minta host menjeda
  const f = fight; if (!f || f.paused || !f.started || f.m.phase === 'over') return;
  f.paused = true; f.pauseBy = by; sound.back();
  if (app.mode === 'versus') return vsPauseModal();
  const c = f.m.f[0].def, tr_ = f.m.training;
  const o = modal(`<h2>${T('Jeda', 'Paused')}</h2><p class="mut">${c.name} · ${T('Daftar jurus', 'Move list')}</p>${movesHtml(c)}
    ${tr_ ? `<div class="srow"><span>${T('Perilaku lawan', 'Dummy behavior')}</span><div class="seg">${[['stand', T('Diam', 'Stand')], ['block', T('Tangkis', 'Block')], ['fight', T('Melawan', 'Fight')]].map(d => `<button data-a="dummy" data-v="${d[0]}" class="${app.dummy === d[0] ? 'on' : ''}">${d[1]}</button>`).join('')}</div></div>` : ''}
    <div class="mbtns"><button class="btn pri" data-a="resume">${T('Lanjutkan', 'Resume')}</button><button class="btn" data-a="restart">${T('Ulangi', 'Restart')}</button><button class="btn" data-a="quit">${T('Keluar', 'Quit')}</button></div>`, {
    resume: () => soloResume(),
    dummy: (v, el) => { app.dummy = v; f.bot.dummy = v === 'fight' ? null : v; $$('.seg button', o).forEach(b => b.classList.toggle('on', b === el)); },
    restart: () => startFight(f.oppId, f.arenaId, f.level), quit: () => menu(),
  });
  f.pauseEl = o;
}
function soloResume() {
  const f = fight; if (!f || !f.paused || app.mode === 'versus') return;
  f.pauseEl?.remove(); f.pauseEl = null; f.paused = false; pad?.input[0].release();
}

// ---------- hasil ----------
function result(win: boolean) {
  const f = fight; if (!f) return; f.hud?.destroy(); f.ctls.forEach(c => c.destroy()); f.hud = null; f.ctls = []; f.ctlSlot = [];
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

// ---------- cheat: tekan \ di menu utama ----------
const CHEATS: Record<string, () => string> = {
  'rich-guy': () => { save.coins += 1000; persist(); sound.coin(); return T('+1000 koin!', '+1000 coins!'); },
};
addEventListener('keydown', e => {
  if (e.code !== 'Backslash' || !$('.scr.menu') || $('.over')) return;
  e.preventDefault();
  const o = modal(`<h2>Command</h2><input class="cmd" type="text" autocomplete="off" spellcheck="false" aria-label="Command">
    <div class="mbtns"><button class="btn pri" data-a="run">${T('Jalankan', 'Run')}</button><button class="btn" data-a="no">${T('Batal', 'Cancel')}</button></div>`, {
    run: () => run(), no: () => o.remove(),
  });
  const inp = $('.cmd', o) as HTMLInputElement;
  const run = () => {
    const f = CHEATS[inp.value.trim().toLowerCase()]; o.remove();
    if (f) { const msg = f(); menu(); toast(msg); } else { sound.deny(); toast(T('Kode tidak dikenal.', 'Unknown code.')); }
  };
  inp.addEventListener('keydown', k => { k.stopPropagation(); if (k.key === 'Enter') run(); else if (k.key === 'Escape') o.remove(); });
  inp.focus();
});

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

// ---------- Main Bareng (host) ----------
// A = satu layar (2 pemain sentuh), B = layar + 1 kontroler HP, C = layar + 2 kontroler HP,
// D = 2 layar: Pemain 2 bermain di perangkatnya sendiri (mis. desktop vs desktop) dan melihat pertarungan di layarnya.
type Cfg = 'A' | 'B' | 'C' | 'D';
type VsPhase = 'lobby' | 'char' | 'arena' | 'fight' | 'result';
interface Vs {
  cfg: Cfg; room: HostRoom | null; phase: VsPhase; picks: [string, string]; ready: [boolean, boolean]; bots: (Bot | null)[];
  arenaId: string; result: { winner: number; score: string } | null; timer: number; fbT: number; advT: number;
  evq: Ev[]; ssT: number; mid: number;
}
let vs: Vs | null = null;
const MP_COINS = 15, MP_DAILY = 10; // koin Main Bareng hanya untuk profil host, dibatasi per hari
const pname = (i: number) => T('Pemain ', 'Player ') + (i + 1);
const remote = (i: number) => !!vs?.room && vs.room.remote(i);
const isLocal = (i: number) => fight?.guest ? i === fight.guest.slot : app.mode === 'versus' ? !remote(i) : i === 0;
const buzz = (i: number, k: 'hit' | 'hurt' | 'ult') => {
  if (remote(i) && !vs!.bots[i]) vs!.room!.buzz(i, k);
  else if (i === 0 && soloPad()) pad!.buzz(0, k);
};
const cfgName = (c: Cfg) => ({ A: T('Satu Layar', 'One Screen'), B: T('Layar + 1 Kontroler', 'Screen + 1 Controller'), C: T('Layar + 2 Kontroler', 'Screen + 2 Controllers'), D: T('2 Layar', 'Two Screens') })[c];

// ---------- Main Bareng (host) ----------
// ${card('A', T('Satu Layar', 'One Screen'), T('Berdua bermain sentuh di layar ini. Paling nyaman di tablet.', 'Both players use touch on this screen. Best on a tablet.'), T('1 perangkat', '1 device'), false)}
function vsMenu() {
  endFight(); vsClose(); padClose(); sound.music('menu');
  stage.showChar(charById(save.lastChar), 0); stage.clear(); // langit menu tetap, tanpa model agar kartu tidak tertutup
  const sock = getSock(), lan = !!sock;
  const card = (k: Cfg, t: string, d: string, n: string, need: boolean) => `<button class="vcard" data-a="cfg" data-v="${k}" ${need && !lan ? 'disabled' : ''}>
    <span class="dev ${k === 'D' ? 'two' : ''}">${'<i></i>'.repeat(k === 'A' ? 1 : k === 'C' ? 3 : 2)}</span><h3>${t}</h3><p>${d}</p><small>${n}</small></button>`;
  show(`<div class="title"><h2>${T('Main Bareng', 'Versus')}</h2><span class="mut">${sock?.kind === 'web' ? T('1 lawan 1 dengan teman', '1v1 with a friend') : T('1 lawan 1 dengan teman · tanpa internet', '1v1 with a friend · no internet needed')}</span></div>
    <div class="vcards">
      ${card('B', T('Layar + 1 Kontroler', 'Screen + 1 Controller'), T('Pemain 1 sentuh di layar ini, Pemain 2 memakai HP-nya sebagai joystick.', 'Player 1 uses touch here, Player 2 uses their phone as a gamepad.'), T('2 perangkat', '2 devices'), true)}
      ${card('C', T('Layar + 2 Kontroler', 'Screen + 2 Controllers'), T('Kedua pemain memakai HP masing-masing; layar ini hanya menampilkan pertarungan.', 'Both players use their own phones; this screen only shows the fight.'), T('3 perangkat · tablet atau TV', '3 devices · tablet or TV'), true)}
      ${card('D', T('2 Layar', 'Two Screens'), T('Tiap pemain di perangkat & layarnya sendiri, mis. desktop lawan desktop. Pemain 2 gabung dengan kode.', 'Each player on their own device and screen, e.g. desktop vs desktop. Player 2 joins with the code.'), T('2 perangkat · 2 layar', '2 devices · 2 screens'), true)}
      <button class="vcard join" data-a="join" ${lan ? '' : 'disabled'}><span class="dev pad">${SVG_PAD}</span><h3>${T('Gabung dengan Kode', 'Join with Code')}</h3><p>${T('Masukkan kode ruangan dari layar host. Perangkat ini jadi kontroler, atau layar Pemain 2 di mode 2 Layar.', 'Enter the room code from the host. This device becomes a gamepad, or Player 2\'s screen in Two Screens mode.')}</p><small>${T('Perangkat ini', 'This device')}</small></button>
    </div>
    <p class="vnote ${lan ? '' : 'warn'}">${lan
      ? sock!.kind === 'web'
        ? T('Versi web: semua perangkat butuh internet sebentar untuk saling terhubung, lalu data permainan dikirim langsung antar-perangkat. Paling lancar bila semua di Wi-Fi yang sama. Untuk main tanpa internet sama sekali, pakai aplikasi Android.', 'Web version: devices need internet briefly to find each other, then game data flows directly between them. Smoothest on the same Wi-Fi. To play fully offline, use the Android app.')
        : T('Semua perangkat harus di Wi-Fi yang sama, atau sambungkan ke hotspot salah satu HP. Kuota internet tidak terpakai.', 'All devices must share one Wi-Fi network, or join one phone\'s hotspot. No mobile data is used.') + (sock!.kind !== 'native' ? ` <span class="mut">(${sock!.kind === 'relay' ? T('mode uji: relay server dev', 'test mode: dev server relay') : T('mode uji: antar-tab', 'test mode: between tabs')})</span>` : '')
      : T('Kontroler HP membutuhkan aplikasi Android Elemental Clash; versi browser tidak bisa membuka jaringan lokal. Mode Satu Layar tetap bisa dimainkan.', 'Phone controllers need the Elemental Clash Android app; the browser version cannot open local network sockets. One Screen mode still works.')}</p>
    <div class="foot"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button></div>`, 'dim', {
    cfg: v => vsStart(v as Cfg), back: () => menu(),
    join: () => joinCtl(),
  });
}
function joinCtl(resume = false, code = '') { padClose(); endFight(); setIdle(true); sound.music(null); controllerMode({ portraits, athumbs, resume, code, guest: guestApi, exit: () => { setIdle(false); vsMenu(); } }); }
const SVG_PAD = '<svg viewBox="0 0 24 24"><rect x="2.5" y="6.5" width="19" height="11" rx="5.5"/><path d="M7 10v4M5 12h4"/><circle cx="16" cy="10.6" r=".9" fill="currentColor"/><circle cx="18" cy="13.2" r=".9" fill="currentColor"/></svg>';

/** Mode kontroler: tidak merender 3D sama sekali (hemat baterai di HP kontroler). */
function setIdle(on: boolean) { idle = on; if (on) stage.clear(); stage.canvas.style.visibility = on ? 'hidden' : ''; }
async function vsStart(cfg: Cfg) {
  app.mode = 'versus';
  const second = save.chars.find(id => id !== save.lastChar) || save.lastChar;
  const v: Vs = vs = { cfg, room: null, phase: 'lobby', picks: [save.lastChar, second], ready: [false, false], bots: [null, null], arenaId: 'kuil', result: null, timer: 0, fbT: 0, advT: 0, evq: [], ssT: 0, mid: 0 };
  if (!save.arenas.includes(app.arena) && app.arena !== 'random') app.arena = 'kuil';
  v.timer = setInterval(vsTick, 300) as unknown as number;
  if (cfg === 'A') return vsSelect();
  const sock = getSock()!, room = new HostRoom(sock, cfg === 'C' ? [0, 1] : [1], await sock.name());
  try { await room.open(); } catch {
    vsClose(); toast(sock.kind === 'web'
      ? T('Gagal membuka ruangan. Versi web butuh internet untuk menyambungkan perangkat — periksa koneksi lalu coba lagi.', 'Could not open the room. The web version needs internet to pair devices — check the connection and try again.')
      : T('Gagal membuka ruangan. Pastikan Wi-Fi atau hotspot menyala, lalu coba lagi.', 'Could not open the room. Make sure Wi-Fi or hotspot is on, then try again.')); return vsMenu();
  }
  if (vs !== v) { room.close(); return; }
  v.room = room;
  room.onChange = () => { if (vs !== v) return; if (v.phase === 'lobby') lobby(); else if (v.phase === 'char') vsPanels(); };
  room.onJoin = () => { sound.confirm(); vsSync(); };
  room.onCmd = vsCmd; room.onDrop = vsDrop; room.onBack = vsBack;
  lobby();
}
function vsClose() {
  if (!vs) return; vs.room?.close(); clearInterval(vs.timer); vs = null; app.mode = 'quick';
}

function lobby() {
  const v = vs!, r = v.room!; v.phase = 'lobby'; endFight();
  const all = r.slots.every(i => r.ready(i)), D = v.cfg === 'D';
  const slot = (i: number) => {
    if (!r.remote(i)) return `<div class="slot ok"><b>${pname(i)}</b><span>${T('Main di perangkat ini', 'Plays on this device')}</span><i>${T('Siap', 'Ready')}</i></div>`;
    const p = r.peers[i];
    if (!p) return `<div class="slot"><b>${pname(i)}</b><span class="mut">${D ? T('Menunggu perangkat Pemain 2…', 'Waiting for Player 2\'s device…') : T('Menunggu kontroler…', 'Waiting for a controller…')}</span><i>${T('Menunggu', 'Waiting')}</i></div>`;
    return `<div class="slot ${p.up ? 'ok' : 'bad'}"><b>${pname(i)}</b><span>${esc(p.name)} <span data-sig="${i}">${sigIcon(r.sig(i))}</span></span><i>${p.up ? T('Terhubung', 'Connected') : T('Terputus…', 'Reconnecting…')}</i></div>`;
  };
  show(`<div class="title"><h2>${T('Lobi', 'Lobby')}</h2><span class="mut">${T('Main Bareng', 'Versus')} · ${cfgName(v.cfg)}</span></div>
    <div class="lobby"><div class="panel codebox"><span class="mut">${T('Kode ruangan', 'Room code')}</span>
      <div class="code" aria-label="${[...r.code].join(' ')}">${[...r.code].map(c => `<b>${c}</b>`).join('')}</div>
      <div class="row">${joinLink(r.code) ? `<button class="btn sm pri" data-a="share">${T('Bagikan link / QR', 'Share link / QR')}</button>` : ''}<button class="btn sm" data-a="regen">${T('Buat ulang kode', 'New code')}</button></div>
      <ol class="steps"><li>${D ? T('Di perangkat lain buka game ini → <b>Main Bareng → Gabung dengan Kode</b>', 'On the other device open this game → <b>Versus → Join with Code</b>') : T('Di HP lain buka <b>Main Bareng → Gabung dengan Kode</b>', 'On another phone open <b>Versus → Join with Code</b>')}</li><li>${T('Masukkan kode di atas', 'Enter the code above')}</li><li>${T('Izinkan permintaannya di layar ini', 'Approve the request on this screen')}</li></ol>
      <p class="mut">${getSock()?.kind === 'web' ? T('Buka game ini di HP (alamat yang sama) → Main Bareng → Gabung sebagai Kontroler', 'Open this game on the phone (same address) → Versus → Join as Controller') : T('Wi-Fi yang sama atau hotspot salah satu HP · tanpa internet', 'Same Wi-Fi or one phone\'s hotspot · no internet')}</p></div>
      <div class="slots">${slot(0)}${slot(1)}${all ? `<p class="go">${T('Semua pemain terhubung!', 'Everyone is connected!')}</p>` : ''}</div></div>
    <div class="foot"><button class="btn" data-a="back">${T('Tutup Ruangan', 'Close Room')}</button><button class="btn pri" data-a="ok" ${all ? '' : 'disabled'}>${T('Lanjut', 'Next')}</button></div>`, 'dim', {
    regen: () => r.regen(), back: () => vsMenu(), ok: () => vsSelect(), share: () => shareModal(r.code, D ? 'p2' : 'ctl'),
  });
  const q = r.reqs[0];
  if (q) modal(`<h2>${T('Permintaan bergabung', 'Join request')}</h2><p><b>${esc(q.name)}</b> ${D ? T('ingin bergabung sebagai Pemain 2.', 'wants to join as Player 2.') : T('ingin bergabung sebagai kontroler.', 'wants to join as a controller.')}</p>
    <div class="mbtns"><button class="btn pri" data-a="yes">${T('Izinkan', 'Allow')}</button><button class="btn" data-a="no">${T('Tolak', 'Deny')}</button></div>`, { yes: () => r.approve(q.conn, true), no: () => r.approve(q.conn, false) });
  // semua kontroler sudah masuk: lanjut otomatis ke pilih karakter
  clearTimeout(v.advT); if (all && !q) v.advT = setTimeout(() => { if (vs === v && v.phase === 'lobby' && r.slots.every(i => r.ready(i))) vsSelect(); }, 1200) as unknown as number;
  vsSync();
}

function vsSelect(unready = false) {
  const v = vs!; v.phase = 'char'; endFight(); sound.music('menu');
  if (unready) v.ready = [false, false];
  show(`<div class="title"><h2>${T('Pilih Karakter', 'Choose Fighters')}</h2><span class="mut">${T('Main Bareng', 'Versus')} · ${T('karakter yang sama boleh dipilih berdua', 'both players may pick the same fighter')}</span></div>
    <div class="vsel"><div class="panel vsp" id="vp0"></div><span class="grow"></span><div class="panel vsp" id="vp1"></div></div>
    <div class="foot"><button class="btn" data-a="back">${T('Kembali', 'Back')}</button><span class="mut">${T('Lanjut ke arena saat kedua pemain siap', 'Continues once both players are ready')}</span></div>`, 'vssel', {
    pick: (id, el) => { const i = +el.dataset.p!; if (v.ready[i]) return; v.picks[i] = id; vsPanels(); vsSync(); },
    ready: val => { const i = +val; v.ready[i] = !v.ready[i]; vsAfterReady(); },
    back: () => v.room ? lobby() : vsMenu(),
  });
  vsPanels(); vsSync();
}
function vsPanels() {
  const v = vs!; stage.showDuo(charById(v.picks[0]), charById(v.picks[1])); stage.showSpin = 0;
  for (const i of [0, 1]) {
    const el = $('#vp' + i); if (!el) return; const c = charById(v.picks[i]), rem = remote(i), p = v.room?.peers[i];
    el.setAttribute('style', elVar(c.elem)); el.classList.toggle('rdy', v.ready[i]);
    const who = rem ? (p ? `${esc(p.name)} <span data-sig="${i}">${sigIcon(v.room!.sig(i))}</span>` : T('Terputus', 'Disconnected')) : T('Layar ini', 'This screen');
    el.innerHTML = `<div class="pn"><b>${pname(i)}</b><span class="mut">${who}</span></div>
      <h3>${c.name}</h3><div class="row">${etag(c.elem)}${i === 1 && v.picks[0] === v.picks[1] ? `<span class="mut">${T('warna ke-2', 'alt colors')}</span>` : ''}</div>
      ${v.ready[i] ? `<div class="rd">✓ ${T('Siap', 'Ready')}</div>` : rem ? `<p class="mut">${T('Memilih di HP-nya…', 'Choosing on their phone…')}</p>` : ''}
      ${rem ? '' : `<div class="mini">${save.chars.map(id => { const x = charById(id); return `<button class="th ${id === c.id ? 'sel' : ''}" data-a="pick" data-p="${i}" data-v="${id}" style="${elVar(x.elem)};background-image:url(${portraits[id]})" aria-label="${x.name}">${icon(x.elem)}</button>`; }).join('')}</div>
        <button class="btn sm ${v.ready[i] ? '' : 'pri'}" data-a="ready" data-v="${i}">${v.ready[i] ? T('Batal', 'Cancel') : T('Siap', 'Ready')}</button>`}`;
  }
}
function vsAfterReady() {
  const v = vs!; vsPanels(); vsSync();
  if (v.ready[0] && v.ready[1]) { sound.confirm(); setTimeout(() => { if (vs === v && v.phase === 'char' && v.ready[0] && v.ready[1]) { v.phase = 'arena'; arenaScreen(); } }, 500); }
}
function vsGo(same = false) {
  const v = vs!; sound.confirm(); v.phase = 'fight'; v.bots = [null, null]; v.mid++; v.evq = [];
  if (!same) v.arenaId = app.arena === 'random' ? save.arenas[Math.floor(Math.random() * save.arenas.length)] : app.arena;
  startFight(v.picks[1], v.arenaId, 1, v.picks[0]); vsSync();
}
function vsControls(f: Fight) {
  const v = vs!, m = f.m;
  if (v.cfg === 'A') { f.ctls = [new Controls(ui, m.f[0].elem, { side: 'l', keys: KEYMAP.p1 }), new Controls(ui, m.f[1].elem, { side: 'r', keys: KEYMAP.p2 })]; f.ctlSlot = [0, 1]; }
  else if (v.cfg === 'B' || v.cfg === 'D') { f.ctls = [new Controls(ui, m.f[0].elem)]; f.ctlSlot = [0]; }
  else { f.ctls = []; f.ctlSlot = []; f.hud!.el.classList.add('big'); }
  if (v.room) f.hud!.el.insertAdjacentHTML('beforeend', `<div class="vsig">${[0, 1].map(i => `<span class="p${i + 1}">${remote(i) ? `<span data-sig="${i}">${sigIcon(v.room!.sig(i))}</span>` : ''}</span>`).join('')}</div>`);
}
function vsInput(f: Fight, i: number): Input {
  const v = vs; if (!v) return noInput();
  const b = v.bots[i]; if (b) return b.update(STEP, f.m.f[i], f.m.f[1 - i], f.m);
  if (remote(i)) return v.room!.input[i].read();
  const k = f.ctlSlot.indexOf(i); return f.ctls[k]?.read() ?? noInput(); // kontrol sudah dilepas (layar hasil) → tanpa input
}
/** HP, energi, cooldown untuk layar kontroler (15×/dtk, juga saat dijeda agar sambungan tetap hidup). */
function vsFeedback(t: number) {
  const v = vs, f = fight; if (!v?.room || !f || v.phase !== 'fight') return;
  if (v.cfg === 'D' && t - v.ssT >= 15) { v.ssT = t; v.room.state(1, snapshot(f.m, v.evq.splice(0))); }
  if (t - v.fbT < 66) return; v.fbT = t;
  for (const i of v.room.slots) { const x = f.m.f[i]; v.room.fb(i, { hp: Math.round(Math.max(0, x.hp)), mh: x.def.hp, en: Math.round(x.energy), c1: +(x.cd1 / x.def.moves.s1.cd!).toFixed(2), st: +x.stam.toFixed(2), w: f.m.wins }); }
}
function vsPauseModal() {
  const f = fight!; f.pauseEl?.remove(); const by = f.pauseBy;
  f.pauseEl = modal(`<h2>${T('Jeda', 'Paused')}</h2><p>${by < 0 ? T('Dijeda dari layar ini.', 'Paused from this screen.') : T(`Dijeda oleh ${pname(by)}.`, `Paused by ${pname(by)}.`)}
    ${by >= 0 && remote(by) ? T(' Lanjutkan dari HP pemain itu atau dari layar ini.', ' Resume from that player\'s phone or from this screen.') : ''}</p>
    ${movesHtml(f.m.f[0].def)}
    <div class="mbtns"><button class="btn pri" data-a="resume">${T('Lanjutkan', 'Resume')}</button><button class="btn" data-a="restart">${T('Ulangi', 'Restart')}</button><button class="btn" data-a="quit">${T('Keluar', 'Quit')}</button></div>`, {
    resume: () => vsResume(-1), restart: () => vsGo(true), quit: () => vsSelect(true),
  });
  vsSync();
}
function vsResume(by: number) {
  const f = fight; if (!f || !f.paused || f.dropSlot >= 0) return;
  if (by >= 0 && by !== f.pauseBy) return; // hanya pemain yang menjeda (atau host) yang bisa melanjutkan
  f.pauseEl?.remove(); f.pauseEl = null; f.paused = false; vs?.room?.input.forEach(x => x.release()); vsSync();
}
function vsCmd(slot: number, m: { a: string; v?: any }) {
  const v = vs; if (!v) return;
  if (m.a === 'leave') { v.room!.kick(slot); return vsGone(slot); }
  if (v.phase === 'char') {
    if (m.a === 'pick' && !v.ready[slot] && save.chars.includes(m.v)) { v.picks[slot] = m.v; vsPanels(); vsSync(); }
    else if (m.a === 'ready') { v.ready[slot] = !!m.v; vsAfterReady(); }
  } else if (v.phase === 'arena' && slot === 0) {
    if (m.a === 'pick' && (m.v === 'random' || save.arenas.includes(m.v))) { app.arena = m.v; arenaScreen(true); }
    else if (m.a === 'pure') { app.pure = !!m.v; arenaScreen(true); }
    else if (m.a === 'ok' && (app.arena === 'random' || save.arenas.includes(app.arena))) vsGo();
    else if (m.a === 'back') vsSelect(true);
  } else if (v.phase === 'fight') {
    if (m.a === 'pause') pause(slot); else if (m.a === 'resume') vsResume(slot);
  } else if (v.phase === 'result' && slot === 0 && v.cfg === 'C') vsResAction(String(m.v));
}
function vsDrop(slot: number) {
  const v = vs!, f = fight;
  if (v.phase === 'fight' && f && f.m.phase !== 'over' && !v.bots[slot]) {
    if (!f.paused) { f.paused = true; f.pauseBy = slot; }
    f.dropSlot = slot; vsDropModal(slot, performance.now() + RECONNECT_WAIT);
  } else toast(`${pname(slot)} ${T('terputus — menunggu sambung ulang', 'disconnected — waiting to reconnect')}`);
  vsSync();
}
const RECONNECT_WAIT = 15000;
function vsDropModal(slot: number, until: number) {
  const f = fight!; f.pauseEl?.remove();
  const o = f.pauseEl = modal(`<h2>${pname(slot)} ${T('terputus', 'disconnected')}</h2><p class="dm"></p><div class="mbtns"></div>`, {
    bot: () => { vs!.bots[slot] = new Bot(BOT_LEVELS[1]); f.dropSlot = -1; o.remove(); f.pauseEl = null; f.paused = false; vsSync(); },
    end: () => { vs!.room!.kick(slot); vsGone(slot); },
  });
  const tick = () => {
    if (f.pauseEl !== o || !o.isConnected) return;
    const left = Math.ceil((until - performance.now()) / 1000);
    if (left > 0) { $('.dm', o).textContent = T(`Pertandingan dijeda. Menunggu kontroler tersambung kembali… ${left}`, `Match paused. Waiting for the controller to reconnect… ${left}`); setTimeout(tick, 250); return; }
    $('.dm', o).textContent = T('Kontroler tidak tersambung kembali. Lanjutkan melawan bot atau akhiri pertandingan?', 'The controller did not reconnect. Continue against a bot or end the match?');
    $('.mbtns', o).innerHTML = `<button class="btn pri" data-a="bot">${T('Lanjut lawan Bot', 'Continue vs Bot')}</button><button class="btn" data-a="end">${T('Akhiri', 'End match')}</button>`;
  };
  tick();
}
/** Kontroler keluar atau dilepas: kembali ke lobi agar kontroler lain bisa masuk. */
function vsGone(slot: number) {
  const v = vs!; toast(`${pname(slot)} ${T('keluar dari ruangan', 'left the room')}`);
  if (v.phase === 'fight' && fight && fight.m.phase !== 'over') { fight.dropSlot = slot; vsDropModal(slot, 0); return; }
  v.ready = [false, false];
  if (v.phase !== 'result') lobby(); // di layar hasil: tetap tampil, lobi dibuka saat pilihan berikutnya
  else vsSync();
}
function vsBack(slot: number) {
  const v = vs!, f = fight; toast(`${pname(slot)} ${T('tersambung kembali', 'reconnected')}`); v.bots[slot] = null;
  if (v.phase === 'fight' && f && f.dropSlot === slot) { f.dropSlot = -1; f.pauseBy = slot; vsPauseModal(); }
  vsSync();
}
function vsTick() {
  const v = vs; if (!v?.room) return; const r = v.room;
  for (const el of $$('[data-sig]')) { const i = +el.dataset.sig!, h = sigIcon(r.sig(i)); if (el.innerHTML !== h) el.innerHTML = h; }
  // di luar pertarungan, kontroler yang terputus lebih dari 15 detik dilepas dari slotnya
  for (const i of r.slots) { const p = r.peers[i]; if (p && !p.up && performance.now() - p.dropAt > RECONNECT_WAIT && v.phase !== 'fight') { r.kick(i); vsGone(i); } }
}
/** Mengirim layar yang sedang aktif ke tiap kontroler. */
function vsSync() {
  const v = vs, r = v?.room; if (!v || !r) return;
  for (const i of r.slots) {
    let s: object;
    switch (v.phase) {
      case 'lobby': s = { s: 'lobby' }; break;
      case 'char': s = { s: 'char', ids: save.chars, pick: v.picks[i], ready: v.ready[i], other: v.ready[1 - i] }; break;
      case 'arena': s = i === 0 ? { s: 'arena', ids: ['random', ...save.arenas], pick: app.arena, pure: app.pure } : { s: 'wait', w: 'arena' }; break;
      case 'fight': { const f = fight; const g = v.cfg === 'D' ? { p: v.picks, a: v.arenaId, pure: app.pure, mid: v.mid } : {};
        s = f?.paused ? { s: 'pause', by: f.pauseBy, drop: f.dropSlot, id: v.picks[i], ...g } : { s: 'fight', id: v.picks[i], ...g }; break; }
      default: s = { s: 'result', ...v.result!, ctl: v.cfg === 'C' && i === 0 };
    }
    r.send(i, { t: 'scr', slot: i, cfg: v.cfg, ...s });
  }
}
function vsResult(winner: number) {
  const f = fight, v = vs; if (!f || !v) return;
  f.hud?.destroy(); f.ctls.forEach(c => c.destroy()); f.hud = null; f.ctls = []; f.ctlSlot = [];
  const m = f.m; v.phase = 'result'; v.result = { winner, score: `${m.wins[0]}–${m.wins[1]}` };
  if (save.mp.date !== today()) save.mp = { date: today(), n: 0 };
  const earn = save.mp.n < MP_DAILY ? MP_COINS : 0; if (earn) { save.mp.n++; save.coins += earn; setTimeout(() => sound.coin(), 700); }
  persist(); sound.win();
  const col = winner < 0 ? '#ffd166' : hex(ELEMS[m.f[winner].def.elem].col);
  ui.innerHTML = `<div class="panel result" style="--el:${col}"><h1>${winner < 0 ? T('Seri', 'Draw') : pname(winner) + T(' Menang!', ' Wins!')}</h1>
    <p class="mut">${m.f[0].def.name} ${m.wins[0]} – ${m.wins[1]} ${m.f[1].def.name} · ${tr(m.arena.name)}</p>
    <div class="earn"><div><span>${T('Koin Main Bareng', 'Versus coins')} <small class="mut">(${save.mp.n}/${MP_DAILY} ${T('hari ini', 'today')})</small></span><span class="coins">+${earn}</span></div>
      ${earn ? '' : `<div><span class="mut">${T('Batas koin Main Bareng hari ini sudah tercapai.', 'Today\'s versus coin limit has been reached.')}</span></div>`}<div><b>${T('Total koin', 'Total coins')}</b>${coins()}</div></div>
    <div class="row" style="flex-wrap:wrap"><button class="btn pri" data-a="again">Rematch</button><button class="btn sm" data-a="char">${T('Ganti Karakter', 'Change Fighters')}</button><button class="btn sm" data-a="arena">${T('Ganti Arena', 'Change Arena')}</button><button class="btn sm" data-a="close">${v.room ? T('Tutup Ruangan', 'Close Room') : 'Menu'}</button></div></div>`;
  bind(ui.firstElementChild as HTMLElement, { again: () => vsResAction('again'), char: () => vsResAction('char'), arena: () => vsResAction('arena'), close: () => vsResAction('close') });
  vsSync();
}
function vsResAction(a: string) {
  const v = vs; if (!v || v.phase !== 'result') return;
  if (a === 'close') return menu();
  if (v.room && !v.room.slots.every(i => v.room!.ready(i))) return lobby(); // ada kontroler yang keluar: tunggu pengganti
  if (a === 'again') vsGo(true);
  else if (a === 'char') vsSelect(true);
  else if (a === 'arena') { endFight(); v.phase = 'arena'; arenaScreen(); }
}

// ---------- joystick HP untuk mode solo ----------
// Layar ini (desktop/TV/tablet) membuka ruangan 1 slot; HP bergabung lewat "Gabung dengan Kode" dan menjadi
// joystick Pemain 1 di Pertandingan Cepat, Cerita, dan Latihan. Kontrol keyboard/sentuh di layar tetap aktif.
let pad: HostRoom | null = null, padOpening: Promise<boolean> | null = null, padReqEl: HTMLElement | null = null, padMEl: HTMLElement | null = null;
let padKey = '', padFbT = 0;
const padUp = () => !!pad?.ready(0);
const soloPad = () => padUp() && app.mode !== 'versus' && !!fight && !fight.guest;
function padInput(a: Input): Input {
  if (!padUp() || app.mode === 'versus') return a;
  const b = pad!.input[0].read();
  return { mx: Math.abs(a.mx) >= Math.abs(b.mx) ? a.mx : b.mx, up: a.up || b.up, down: a.down || b.down, atk: a.atk || b.atk, hvy: a.hvy || b.hvy, s1: a.s1 || b.s1, s2: a.s2 || b.s2, block: a.block || b.block, dash: a.dash || b.dash, ult: a.ult || b.ult };
}
function padOpen(): Promise<boolean> {
  if (pad) return Promise.resolve(true);
  return padOpening ??= (async () => {
    const sock = getSock(); if (!sock) return false;
    const r = new HostRoom(sock, [0], await sock.name());
    try { await r.open(); } catch { return false; } finally { padOpening = null; }
    pad = r; padKey = '';
    r.onChange = padChange;
    r.onJoin = () => { sound.confirm(); toast(T('Joystick HP tersambung', 'Phone gamepad connected')); padKey = ''; };
    r.onBack = () => { toast(T('Joystick HP tersambung kembali', 'Phone gamepad reconnected')); padKey = ''; };
    r.onDrop = () => { toast(T('Joystick HP terputus', 'Phone gamepad disconnected')); if (fight && !fight.guest && app.mode !== 'versus') pause(0); };
    r.onCmd = (_slot, m) => {
      if (m.a === 'leave') { r.kick(0); toast(T('Joystick HP dilepas', 'Phone gamepad left')); }
      else if (app.mode !== 'versus' && fight && !fight.guest) { if (m.a === 'pause') pause(0); else if (m.a === 'resume') soloResume(); }
    };
    return true;
  })();
}
function padClose() {
  if (!pad) return; pad.close(); pad = null; padKey = '';
  padReqEl?.remove(); padReqEl = null; padMEl?.remove(); padMEl = null; padChange();
}
const padBtn = () => getSock() ? `<button class="btn sm padb ${padUp() ? 'on' : pad ? 'wait' : ''}" data-a="pad" aria-label="${T('Joystick HP', 'Phone gamepad')}"><span class="dev pad">${SVG_PAD}</span>${padUp() ? T('Joystick HP aktif', 'Gamepad on') : T('Joystick HP', 'Phone gamepad')}</button>` : '';
function padHtml() {
  const r = pad!, p = r.peers[0];
  const st = p ? `<div class="slot ${p.up ? 'ok' : 'bad'}"><b>${T('Joystick', 'Gamepad')}</b><span>${esc(p.name)} <span data-sig="p">${sigIcon(r.sig(0))}</span></span><i>${p.up ? T('Terhubung', 'Connected') : T('Terputus…', 'Reconnecting…')}</i></div>`
    : `<div class="slot"><b>${T('Joystick', 'Gamepad')}</b><span class="mut">${T('Menunggu HP…', 'Waiting for a phone…')}</span><i>${T('Menunggu', 'Waiting')}</i></div>`;
  return `<h2>${T('Pakai HP sebagai Joystick', 'Use a Phone as Gamepad')}</h2>
    <p class="mut">${T('Untuk Pertandingan Cepat, Cerita, dan Latihan. Keyboard & sentuh di layar ini tetap bisa dipakai.', 'For Quick Match, Story and Training. Keyboard & touch on this screen still work.')}</p>
    <div class="code" aria-label="${[...r.code].join(' ')}">${[...r.code].map(c => `<b>${c}</b>`).join('')}</div>
    <ol class="steps"><li>${T('Di HP buka game ini → <b>Main Bareng → Gabung dengan Kode</b>', 'On the phone open this game → <b>Versus → Join with Code</b>')}</li><li>${T('Masukkan kode di atas, lalu izinkan di layar ini', 'Enter the code above, then approve it here')}</li></ol>
    ${st}
    <div class="mbtns"><button class="btn pri" data-a="ok">${T('Selesai', 'Done')}</button>${p ? `<button class="btn" data-a="off">${T('Putuskan', 'Disconnect')}</button>` : `${joinLink(r.code) ? `<button class="btn" data-a="share">${T('Bagikan link / QR', 'Share link / QR')}</button>` : ''}<button class="btn sm" data-a="regen">${T('Kode baru', 'New code')}</button>`}</div>`;
}
async function padModal() {
  if (!getSock()) return;
  if (!await padOpen()) { toast(getSock()?.kind === 'web' ? T('Gagal membuka joystick HP. Periksa koneksi internet.', 'Could not open the phone gamepad. Check the internet connection.') : T('Gagal membuka joystick HP. Pastikan Wi-Fi atau hotspot menyala.', 'Could not open the phone gamepad. Make sure Wi-Fi or hotspot is on.')); return; }
  padMEl?.remove();
  const o = padMEl = modal(padHtml(), {
    ok: () => { o.remove(); padMEl = null; if (!pad?.peers[0]) padClose(); }, // tidak dipakai: lepas ruangannya
    off: () => { pad?.kick(0); padClose(); },
    regen: () => pad?.regen(),
    share: () => pad && shareModal(pad.code, 'pad'),
  }, 'padm');
}
function padChange() {
  const r = pad;
  if (padMEl?.isConnected && r) padMEl.firstElementChild!.innerHTML = padHtml();
  const b = $('.menu [data-a="pad"]'); if (b) b.outerHTML = padBtn();
  const q = r?.reqs[0];
  if (!q) { padReqEl?.remove(); padReqEl = null; return; }
  if (padReqEl?.isConnected) return;
  const o = padReqEl = modal(`<h2>${T('Permintaan joystick', 'Gamepad request')}</h2><p><b>${esc(q.name)}</b> ${T('ingin menjadi joystick di layar ini.', 'wants to be the gamepad for this screen.')}</p>
    <div class="mbtns"><button class="btn pri" data-a="yes">${T('Izinkan', 'Allow')}</button><button class="btn" data-a="no">${T('Tolak', 'Deny')}</button></div>`,
    { yes: () => { o.remove(); padReqEl = null; r!.approve(q.conn, true); }, no: () => { o.remove(); padReqEl = null; r!.approve(q.conn, false); } });
}
/** Layar untuk HP joystick + umpan balik HP/energi; juga melepas HP yang putus > 15 dtk agar HP lain bisa masuk. */
function padTick(t: number) {
  const r = pad!, p = r.peers[0];
  if (p && !p.up && performance.now() - p.dropAt > RECONNECT_WAIT) { r.kick(0); padChange(); }
  if (r.reqs.length && !padReqEl?.isConnected) padChange(); // modal permintaan tertimpa pergantian layar: tampilkan lagi
  if (!padUp()) return;
  const f = fight, solo = !!f && !f.guest && app.mode !== 'versus' && f.m.phase !== 'over'; // sejak intro VS: pad langsung siap
  const s = solo ? (f!.paused ? { s: 'pause', by: f!.pauseBy, drop: -1, solo: true } : { s: 'fight' }) : { s: 'wait', w: 'solo' };
  const id = solo ? f!.m.f[0].def.id : '', key = s.s + id;
  if (key !== padKey) { padKey = key; r.send(0, { t: 'scr', slot: 0, cfg: 'S', id, ...s }); }
  if (solo && t - padFbT >= 66) {
    padFbT = t; const x = f!.m.f[0];
    r.fb(0, { hp: Math.round(Math.max(0, x.hp)), mh: x.def.hp, en: Math.round(x.energy), c1: +(x.cd1 / x.def.moves.s1.cd!).toFixed(2), c2: +(x.cd2 / x.def.moves.s2.cd!).toFixed(2), st: +x.stam.toFixed(2), w: f!.m.wins });
  }
  const sg = $('[data-sig="p"]'); if (sg) { const h = sigIcon(r.sig(0)); if (sg.innerHTML !== h) sg.innerHTML = h; }
}

// ---------- loop ----------
let last = performance.now(), pending = 0, idle = false;
function frame(now: number) {
  requestAnimationFrame(frame);
  pending += Math.min(.1, (now - last) / 1000); last = now;
  if (stage.fpsCap === 30 && pending < 1 / 30 - .003) return;
  const rdt = Math.min(.05, pending); pending = 0;
  const f = fight;
  if (f && !f.paused) {
    const m = f.m;
    if (!f.started) { if (f.view.vsT <= 0) beginRound1(); }
    else if (f.mirror) { f.ctls.forEach((c, k) => c.sync(m.f[f.ctlSlot[k]])); f.hud?.update(rdt); } // 2 Layar: keadaan dari snapshot host
    else {
      const ts = m.slowmo > 0 ? .3 : 1; m.slowmo = Math.max(0, m.slowmo - rdt);
      f.acc = Math.min(.1, f.acc + rdt * ts);
      while (f.acc >= STEP) { const i0 = f.src[0](), i1 = f.src[1](); m.step(STEP, i0, i1); f.acc -= STEP; }
      f.ctls.forEach((c, k) => c.sync(m.f[f.ctlSlot[k]])); f.hud?.update(rdt);
    }
    f.view.update(rdt, rdt);
  }
  if (f) vsFeedback(now);
  if (pad) padTick(now);
  if (!idle) stage.render(f && f.paused ? 0 : rdt);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); sound.suspend(true); } else sound.suspend(false); });
addEventListener('contextmenu', e => e.preventDefault());

applySettings();
initScreen();
requestAnimationFrame(frame);
splash();
(window as any).__ec = { app, save, stage, startFight, menu, select, opponent, arenaScreen, story, settings, collection, result, vsMenu, get fight() { return fight; }, get vs() { return vs; } };
