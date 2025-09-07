import dayjs from 'dayjs';
import { pool } from '../database.js';
import { MAIN_MENU, fmtCoins, fmtStars } from '../utils/textUtils.js';
import { InlineKeyboard } from 'grammy';

export function registerProfile(bot) {
  bot.hears('🧑‍🚀 Профиль', async (ctx) => showProfile(ctx));
  bot.callbackQuery('profile:open', async (ctx) => showProfile(ctx));
  bot.callbackQuery('profile:ref', async (ctx) => sendRef(ctx));
}

async function showProfile(ctx) {
  const userId = ctx.from.id;
  await pool.query('insert into users(id, username) values ($1,$2) on conflict (id) do update set username=excluded.username', [userId, ctx.from.username || null]);
  await pool.query('insert into user_resources(user_id) values ($1) on conflict (user_id) do nothing', [userId]);
  const u = await pool.query('select * from users where id=$1', [userId]);
  const r = await pool.query('select * from user_resources where user_id=$1', [userId]);
  const user = u.rows[0];
  const res = r.rows[0];
  const cd = user.last_mine_at ? Math.max(0, dayjs(user.last_mine_at).add(3, 'hour').diff(dayjs(), 'minute')) : 0;
  const nextMine = cd > 0 ? `${Math.floor(cd/60)}ч ${cd%60}м` : 'доступно';

  const kb = new InlineKeyboard()
    .text('🔗 Реф. ссылка', 'profile:ref').row()
    .text('💰 Продать', 'sell:menu').row();

  const text = [
    `Профиль @${ctx.from.username || userId}`,
    `⭐️ Stars: ${fmtStars(user.stars)}`,
    `🪙 Coins: ${fmtCoins(user.coins)}`,
    `⛏️ Кирка: Уровень ${user.pickaxe_level}`,
    `⏱️ Копать через: ${nextMine}`,
    '',
    `Ресурсы:`,
    `🪨 Уголь: ${res.coal}`,
    `🥉 Медь: ${res.copper}`,
    `⛓️ Железо: ${res.iron}`,
    `🥇 Золото: ${res.gold}`,
    `💎 Алмазы: ${res.diamond}`
  ].join('\n');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb });
  } else {
    await ctx.reply(text, { ...MAIN_MENU, reply_markup: { ...MAIN_MENU.reply_markup, inline_keyboard: kb.inline_keyboard } });
  }
}

async function sendRef(ctx) {
  const userId = ctx.from.id;
  const username = process.env.BOT_USERNAME;
  const link = `https://t.me/${username}?start=ref_${userId}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(`Ваша реферальная ссылка (5% от депозитов друзей):\n${link}`);
}
