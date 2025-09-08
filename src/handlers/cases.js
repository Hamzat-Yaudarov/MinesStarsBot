import { InlineKeyboard } from 'grammy';
import dayjs from 'dayjs';
import { pool } from '../database.js';
import { caseSpinFrames, sleep, fmtStars } from '../utils/textUtils.js';

const FREE_MIN_DEPOSIT_TODAY = 200; // stars

const CASES = {
  free: { cost: 0, rewards: [10, 15, 20, 30, 40, 50, 60, 75], weights: [20, 18, 16, 14, 12, 10, 7, 3] },
  c150: { cost: 150, rewards: [0, 15, 25, 50, 100, 200, 225], weights: [40, 18, 16, 12, 8, 4, 2] },
  c250: { cost: 250, rewards: [100, 150, 175, 275, 300, 350], weights: [20, 18, 16, 14, 12, 10] }
};

function weightedPick(rewards, weights) {
  const total = weights.reduce((a,b)=>a+b,0);
  let r = Math.random() * total;
  for (let i=0;i<rewards.length;i++) { r -= weights[i]; if (r <= 0) return rewards[i]; }
  return rewards[rewards.length-1];
}

export function registerCases(bot) {
  bot.hears('🎁 Кейсы', async (ctx) => openCases(ctx));
  bot.callbackQuery('cases:open', async (ctx) => openCases(ctx));
  bot.callbackQuery(['cases:free','cases:c150','cases:c250'], async (ctx) => openCase(ctx));
}

export async function openCases(ctx) {
  const kb = new InlineKeyboard()
    .text('🆓 Бесплатный', 'cases:free').row()
    .text('💠 150 ⭐️', 'cases:c150').row()
    .text('💠 250 ⭐️', 'cases:c250');
  const text = 'Кейсы\n• Бесплатный: 1/день при депо��ите ≥ 200 ⭐️ за сегодня (10–75 ⭐️)\n• За 150 ⭐️: 0, 15, 25, 50, 100, 200, 225\n• За 250 ⭐️: 100, 150, 175, 275, 300, 350\nЧем больше награда — тем ниже шанс.';
  if (ctx.callbackQuery) return ctx.editMessageText(text, { reply_markup: kb });
  return ctx.reply(text, { reply_markup: kb });
}

async function openCase(ctx) {
  const kind = ctx.callbackQuery.data.split(':')[1];
  const cfg = CASES[kind];
  const userId = ctx.from.id;

  if (kind === 'free') {
    const r = await pool.query("select sum(stars) s from payments where user_id=$1 and created_at::date = now()::date", [userId]);
    const sumToday = Number(r.rows[0]?.s || 0);
    if (sumToday < FREE_MIN_DEPOSIT_TODAY) return ctx.answerCallbackQuery({ text: 'Нужно пополнить ≥ 200 ⭐️ сегодня', show_alert: true });
    const opened = await pool.query("select 1 from transactions where user_id=$1 and kind='free_case' and created_at::date = now()::date", [userId]);
    if (opened.rowCount > 0) return ctx.answerCallbackQuery({ text: 'Бесплатный кейс уже открыт сегодня', show_alert: true });
  } else {
    const u = await pool.query('select stars from users where id=$1', [userId]);
    if (u.rows[0].stars < cfg.cost) return ctx.answerCallbackQuery({ text: 'Недостаточно ⭐️', show_alert: true });
    await pool.query('update users set stars = stars - $2 where id=$1', [userId, cfg.cost]);
    await pool.query('insert into transactions(user_id, kind, amount_stars, meta) values ($1,$2,$3,$4)', [userId, 'case_open', -cfg.cost, JSON.stringify({ kind })]);
  }

  const prize = weightedPick(cfg.rewards, cfg.weights);

  const frames = caseSpinFrames(cfg.rewards.map(v => ({ label: `${v}⭐️` })));
  const msg = await ctx.editMessageText('Открываем кейс...');
  for (let i=0;i<frames.length;i++) { await sleep(200); await ctx.api.editMessageText(ctx.chat.id, msg.message_id, frames[i]); }

  await pool.query('update users set stars = stars + $2 where id=$1', [userId, prize]);
  const kindTx = kind === 'free' ? 'free_case' : 'case_prize';
  await pool.query('insert into transactions(user_id, kind, amount_stars, meta) values ($1,$2,$3,$4)', [userId, kindTx, prize, JSON.stringify({ kind, prize })]);

  await ctx.editMessageText(`Выпало: ${fmtStars(prize)}!`);
}
