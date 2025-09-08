import { pool } from '../database.js';
import { InlineKeyboard } from 'grammy';
import { PICKAXE_PRICES, COINS_PER_STAR, fmtCoins, fmtStars } from '../utils/textUtils.js';

export function registerShop(bot) {
  bot.hears('🛒 Магазин', async (ctx) => openShop(ctx));
  bot.callbackQuery('shop:open', async (ctx) => openShop(ctx));
  bot.callbackQuery(/shop:buy:(\d+)/, async (ctx) => buyPickaxe(ctx));
  bot.callbackQuery(/shop:buystars:(\d+)/, async (ctx) => buyPickaxeWithStars(ctx));
  bot.callbackQuery('shop:ex:coins2stars', async (ctx) => exCoins2Stars(ctx));
  bot.callbackQuery('shop:ex:stars2coins', async (ctx) => exStars2Coins(ctx));
}

export async function openShop(ctx) {
  const userId = ctx.from.id;
  const u = await pool.query('select coins, stars, pickaxe_level from users where id=$1', [userId]);
  const { coins, stars, pickaxe_level } = u.rows[0];
  const next = Math.min(10, (pickaxe_level || 0) + 1);
  const price = PICKAXE_PRICES[next];
  const kb = new InlineKeyboard();
  if (pickaxe_level < 10) {
    kb.text(`⛏️ Улучшить до ${next} (${fmtCoins(price)})`, `shop:buy:${next}`).row();
    const priceStars = Math.ceil(price / COINS_PER_STAR);
    kb.text(`⛏️ Купить за ${priceStars} ⭐️`, `shop:buystars:${next}`).row();
  }
  kb.text('🔄 Обмен: MC ➜ ⭐️', 'shop:ex:coins2stars').text('⭐️ ➜ MC', 'shop:ex:stars2coins');
  const text = `Магазин\nКирка: Уровень ${pickaxe_level}\nБаланс: ${fmtCoins(coins)} | ${fmtStars(stars)}\n\nКурс: 1 ⭐️ = ${COINS_PER_STAR} MC\nПервую кирку можно купить за 10 000 MC или 50 ⭐️ (обменом).`;
  if (ctx.callbackQuery) return ctx.editMessageText(text, { reply_markup: kb });
  return ctx.reply(text, { reply_markup: kb });
}

async function buyPickaxe(ctx) {
  const userId = ctx.from.id;
  const toLevel = Number(ctx.match[1]);
  const u = await pool.query('select coins, pickaxe_level from users where id=$1', [userId]);
  const { coins, pickaxe_level } = u.rows[0];
  if (toLevel !== (pickaxe_level + 1)) return ctx.answerCallbackQuery({ text: 'Покупать можно только следующий уровень', show_alert: true });
  const price = PICKAXE_PRICES[toLevel];
  if (coins < price) return ctx.answerCallbackQuery({ text: 'Недостаточно монет', show_alert: true });
  await pool.query('update users set coins = coins - $2, pickaxe_level = $3 where id=$1', [userId, price, toLevel]);
  await pool.query('insert into transactions(user_id, kind, amount_coins, meta) values ($1,$2,$3,$4)', [userId, 'pickaxe_upgrade', -price, JSON.stringify({ toLevel })]);
  await ctx.answerCallbackQuery({ text: `Кирка улучшена до уровня ${toLevel}!` });
  return openShop(ctx);
}

async function buyPickaxeWithStars(ctx) {
  const userId = ctx.from.id;
  const toLevel = Number(ctx.match[1]);
  const u = await pool.query('select stars, pickaxe_level from users where id=$1', [userId]);
  const { stars, pickaxe_level } = u.rows[0];
  if (toLevel !== (pickaxe_level + 1)) return ctx.answerCallbackQuery({ text: 'Покупать можно только следующий уровень', show_alert: true });
  const price = PICKAXE_PRICES[toLevel];
  const priceStars = Math.ceil(price / COINS_PER_STAR);
  if (stars < priceStars) return ctx.answerCallbackQuery({ text: 'Недостаточно ⭐️', show_alert: true });
  await pool.query('update users set stars = stars - $2, pickaxe_level = $3 where id=$1', [userId, priceStars, toLevel]);
  await pool.query('insert into transactions(user_id, kind, amount_stars, meta) values ($1,$2,$3,$4)', [userId, 'pickaxe_upgrade_stars', -priceStars, JSON.stringify({ toLevel })]);
  await ctx.answerCallbackQuery({ text: `Кирка куплена/улучшена до уровня ${toLevel} за ${priceStars} ⭐️!` });
  return openShop(ctx);
}

async function exCoins2Stars(ctx) {
  const userId = ctx.from.id;
  const u = await pool.query('select coins from users where id=$1', [userId]);
  const { coins } = u.rows[0];
  const can = Math.floor(coins / COINS_PER_STAR);
  if (can <= 0) return ctx.answerCallbackQuery({ text: 'Недостаточно монет для обмена', show_alert: true });
  const stars = can; // exchange max
  const spend = stars * COINS_PER_STAR;
  await pool.query('update users set coins = coins - $2, stars = stars + $3 where id=$1', [userId, spend, stars]);
  await pool.query('insert into transactions(user_id, kind, amount_coins, amount_stars, meta) values ($1,$2,$3,$4,$5)', [userId, 'exchange_c2s', -spend, stars, JSON.stringify({ rate: COINS_PER_STAR })]);
  await ctx.answerCallbackQuery({ text: `Обмен: -${fmtCoins(spend)} ➜ +${fmtStars(stars)}` });
  return openShop(ctx);
}

async function exStars2Coins(ctx) {
  const userId = ctx.from.id;
  const u = await pool.query('select stars from users where id=$1', [userId]);
  const { stars } = u.rows[0];
  if (stars <= 0) return ctx.answerCallbackQuery({ text: 'Нет Stars для обмена', show_alert: true });
  const coins = stars * COINS_PER_STAR;
  await pool.query('update users set stars = 0, coins = coins + $2 where id=$1', [userId, coins]);
  await pool.query('insert into transactions(user_id, kind, amount_coins, amount_stars, meta) values ($1,$2,$3,$4,$5)', [userId, 'exchange_s2c', coins, -stars, JSON.stringify({ rate: COINS_PER_STAR })]);
  await ctx.answerCallbackQuery({ text: `Обмен: -${fmtStars(stars)} ➜ +${fmtCoins(coins)}` });
  return openShop(ctx);
}
