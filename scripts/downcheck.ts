import { CHARS, BOT_LEVELS, ARENAS } from '../src/data';
import { Match } from '../src/game/match';
import { Bot } from '../src/game/bot';
const DT = 1 / 60; const seen: Record<string, number> = {};
for (let g = 0; g < 400; g++) {
  const a = CHARS[g % 6], b = CHARS[(g * 5 + 1 + (g >> 3)) % 6], ar = ARENAS[g % 7];
  const m = new Match({ p1: a, p2: b, arena: ar, pure: false, training: g % 5 === 0 });
  const b0 = new Bot(BOT_LEVELS[2]), b1 = new Bot(BOT_LEVELS[3]);
  const dur = [0, 0], lx = [0, 0]; let steps = 0;
  while (m.phase !== 'over' && steps++ < 60 * 200) {
    m.step(DT, b0.update(DT, m.f[0], m.f[1], m), b1.update(DT, m.f[1], m.f[0], m)); m.events.length = 0;
    if (m.freeze > 0 || m.hitstop > 0) continue;
    m.f.forEach((f, i) => {
      if (f.state === 'down') {
        dur[i] += DT;
        const k = dur[i] > 3 ? `stuck arena=${ar.id} landed=${f.landed} y=${f.y.toFixed(3)} vy=${f.vy.toFixed(2)} phase=${m.phase}` : f.landed && Math.abs(f.x - lx[i]) > .02 ? `slide arena=${ar.id} push=${f.push.toFixed(1)} vx=${f.vx.toFixed(1)} phase=${m.phase}` : '';
        if (k) seen[k.replace(/-?\d+\.\d+/g, '#')] = (seen[k.replace(/-?\d+\.\d+/g, '#')] || 0) + 1;
      } else dur[i] = 0;
      lx[i] = f.x;
    });
  }
}
console.log(Object.keys(seen).length ? seen : 'no anomalies');
