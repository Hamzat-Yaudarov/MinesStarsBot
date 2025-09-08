import { pool } from '../database.js';
import { InlineKeyboard } from 'grammy';
import { pool } from '../database.js';

const OPTIONS = [100, 250, 500, 1000, 2500, 10000];

export function registerWithdraw(bot) {
  bot.hears('💸 Вывод', async (ctx) => openWithdraw(ctx));
  bot.callbackQuery('withdraw:open', async (ctx) => openWithdraw(ctx));
  bot.callbackQuery(/withdraw:req:(\d+)/, async (ctx) => createWithdraw(ctx));
}

export async function openWithdraw(ctx) {
  const userId = ctx.from.id;
  const u = await pool.query('select stars from users where id=$1', [userId]);
  const bal = Number(u.rows[0]?.stars || 0);
  const kb = new InlineKeyboard();
  for (const a of OPTIONS) kb.text(`${a}⭐️ (нужно ${Math.floor(a*1.1)}⭐️)`, `withdraw:req:${a}`).row();
  const text = `Вывод средств\nКомиссия 10% (пример: чтобы вывести 1000⭐️, нужно иметь 1100⭐️).\nВаш баланс: ${bal}⭐️\nВыберите сумму:`;
  if (ctx.callbackQuery) return ctx.editMessageText(text, { reply_markup: kb });
  return ctx.reply(text, { reply_markup: kb });
}

async function createWithdraw(ctx) {
  const userId = ctx.from.id;
  const amount = Number(ctx.match[1]);
  const need = Math.floor(amount * 1.1);
  const u = await pool.query('select stars from users where id=$1', [userId]);
  const bal = Number(u.rows[0]?.stars || 0);
  if (bal < need) return ctx.answerCallbackQuery({ text: 'Недостаточно ⭐️ для вывода с комиссией 10%', show_alert: true });
  const fee = need - amount;
  await pool.query('update users set stars = stars - $2 where id=$1', [userId, need]);
  const w = await pool.query('insert into withdrawals(user_id, amount_stars, fee_stars, total_debit) values ($1,$2,$3,$4) returning id', [userId, amount, fee, need]);
  const id = w.rows[0].id;
  await pool.query('insert into transactions(user_id, kind, amount_stars, meta) values ($1,$2,$3,$4)', [userId, 'withdraw_request', -need, JSON.stringify({ request_id: id, amount, fee })]);

  const admin = Number(process.env.ADMIN_ID);
  try {
    await ctx.api.sendMessage(admin, `Заявка на вывод #${id} от ${userId}: ${amount}⭐️ (комиссия ${fee}⭐️)`);
  } catch (_) {}

  await ctx.answerCallbackQuery({ text: 'Заявка на вывод создана. Ожидайте.', show_alert: true });
  return openWithdraw(ctx);
}
