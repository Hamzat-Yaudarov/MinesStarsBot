import { pool } from '../database.js';
import { InlineKeyboard } from 'grammy';
import { sleep } from '../utils/textUtils.js';

const BETS = [10, 15, 25, 50, 150, 250, 300, 400, 500];

function levelMultiplier(level) { return Number((1 + 0.14 * level).toFixed(2)); }

function makeBrokenMap() {
  const map = {};
  for (let lvl=1; lvl<=7; lvl++) {
    const broken = new Set();
    while (broken.size < lvl) broken.add(Math.floor(Math.random()*8));
    map[lvl] = Array.from(broken);
  }
  return map;
}

export function registerGames(bot) {
  bot.hears('🎮 Игры', async (ctx) => openGames(ctx));
  bot.callbackQuery('games:open', async (ctx) => openGames(ctx));
  bot.callbackQuery('game:start', async (ctx) => chooseBet(ctx));
  bot.callbackQuery(/game:bet:(\d+)/, async (ctx) => startSession(ctx));
  bot.callbackQuery(/game:pick:(\d+)/, async (ctx) => pickLadder(ctx));
  bot.callbackQuery('game:cashout', async (ctx) => cashout(ctx));
}

export async function openGames(ctx) {
  const kb = new InlineKeyboard().text('🪜 Игра "Лесенка"', 'game:start');
  const text = 'Игры\n• Лесенка: пройди 7 уровней, на каждом из 8 вариантов некоторые сломаны. Забери выигрыш в любой момент!';
  if (ctx.callbackQuery) return ctx.editMessageText(text, { reply_markup: kb });
  return ctx.reply(text, { reply_markup: kb });
}

async function chooseBet(ctx) {
  const kb = new InlineKeyboard();
  for (const b of BETS) kb.text(`${b}⭐️`, `game:bet:${b}`).row();
  await ctx.editMessageText('Выберите ставку в ⭐️', { reply_markup: kb });
}

async function startSession(ctx) {
  const userId = ctx.from.id;
  const bet = Number(ctx.match[1]);
  const u = await pool.query('select stars from users where id=$1', [userId]);
  if (u.rows[0].stars < bet) return ctx.answerCallbackQuery({ text: 'Недостаточно ⭐️', show_alert: true });
  await pool.query('update users set stars = stars - $2 where id=$1', [userId, bet]);
  const map = makeBrokenMap();
  await pool.query('insert into ladder_sessions(user_id, is_active, bet, level, broken_map, current_multiplier) values ($1,true,$2,1,$3,$4) on conflict (user_id) do update set is_active=excluded.is_active, bet=excluded.bet, level=excluded.level, broken_map=excluded.broken_map, current_multiplier=excluded.current_multiplier', [userId, bet, JSON.stringify(map), levelMultiplier(1)]);
  await pool.query('insert into transactions(user_id, kind, amount_stars, meta) values ($1,$2,$3,$4)', [userId, 'ladder_bet', -bet, JSON.stringify({ bet })]);
  return drawLevel(ctx, 1);
}

function buildLevelKeyboard(level) {
  const kb = new InlineKeyboard();
  for (let i=0;i<8;i++) kb.text(`⬆️ ${i+1}`, `game:pick:${i}`);
  const mul = levelMultiplier(level);
  kb.row().text(`💰 Забрать (x${mul})`, 'game:cashout');
  return kb;
}

async function animateChoices(ctx, level) {
  // small text animation cycling highlight
  const base = `Лесенка — Уровень ${level}/7\nВыбираем...`;
  const frames = [base + '\n🎲', base + '\n🎲 .', base + '\n🎲 ..', base + '\n🎲 ...'];
  const msg = await ctx.editMessageText(frames[0]);
  for (let i=1;i<frames.length;i++) {
    await sleep(180);
    try { await ctx.api.editMessageText(ctx.chat.id, msg.message_id, frames[i]); } catch(_){}
  }
}

async function drawLevel(ctx, level) {
  const mul = levelMultiplier(level);
  await animateChoices(ctx, level);
  return ctx.editMessageText(`Лесенка — Уровень ${level}/7\nТекущий множитель: x${mul}\nВыберите лестницу (1–8)`, { reply_markup: buildLevelKeyboard(level) });
}

async function pickLadder(ctx) {
  const userId = ctx.from.id;
  const pick = Number(ctx.match[1]);
  const s = await pool.query('select * from ladder_sessions where user_id=$1', [userId]);
  const ses = s.rows[0];
  if (!ses?.is_active) return ctx.answerCallbackQuery({ text: 'Игра не активна', show_alert: true });
  const level = ses.level;
  const broken = ses.broken_map[level];
  const isBroken = Array.isArray(broken) ? broken.includes(pick) : JSON.parse(ses.broken_map)[level].includes(pick);
  if (isBroken) {
    await pool.query('update ladder_sessions set is_active=false where user_id=$1', [userId]);
    await ctx.answerCallbackQuery({ text: 'Лестница сломалась! Вы проиграли ставку.', show_alert: true });
    return ctx.editMessageText('Проигрыш. Ставка сгорела.');
  }
  const nextLevel = level + 1;
  if (nextLevel > 7) {
    // Auto cashout at final level
    const winMul = levelMultiplier(level);
    const win = Math.floor(Number(ses.bet) * winMul);
    await pool.query('update users set stars = stars + $2 where id=$1', [userId, win]);
    await pool.query('update ladder_sessions set is_active=false where user_id=$1', [userId]);
    await pool.query('insert into transactions(user_id, kind, amount_stars, meta) values ($1,$2,$3,$4)', [userId, 'ladder_win', win, JSON.stringify({ level })]);
    return ctx.editMessageText(`Поздравляем! Вы дошли до конца и выиграли ${win}⭐️ (x${winMul}).`);
  }
  const mul = levelMultiplier(nextLevel);
  await pool.query('update ladder_sessions set level=$2, current_multiplier=$3 where user_id=$1', [userId, nextLevel, mul]);
  await ctx.answerCallbackQuery();
  return drawLevel(ctx, nextLevel);
}

async function cashout(ctx) {
  const userId = ctx.from.id;
  const s = await pool.query('select * from ladder_sessions where user_id=$1', [userId]);
  const ses = s.rows[0];
  if (!ses?.is_active) return ctx.answerCallbackQuery({ text: 'Игра не активна', show_alert: true });
  const win = Math.floor(Number(ses.bet) * Number(ses.current_multiplier));
  await pool.query('update users set stars = stars + $2 where id=$1', [userId, win]);
  await pool.query('update ladder_sessions set is_active=false where user_id=$1', [userId]);
  await pool.query('insert into transactions(user_id, kind, amount_stars, meta) values ($1,$2,$3,$4)', [userId, 'ladder_cashout', win, JSON.stringify({ level: ses.level, mul: ses.current_multiplier })]);
  await ctx.answerCallbackQuery({ text: `Забрали: ${win}⭐️` });
  return ctx.editMessageText(`Игра завершена. Вы забрали ${win}⭐️.`);
}
