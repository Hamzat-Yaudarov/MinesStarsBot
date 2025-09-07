import { Bot, InlineKeyboard } from 'grammy';
import { migrate, pool } from './database.js';
import { MAIN_MENU, fmtCoins, fmtStars, COINS_PER_STAR } from './utils/textUtils.js';
import { registerStart } from './commands/start.js';
import { registerProfile } from './handlers/profile.js';
import { registerMining } from './handlers/mining.js';
import { registerShop } from './handlers/shop.js';
import { registerCases } from './handlers/cases.js';
import { registerGames } from './handlers/games.js';
import { registerWithdraw } from './handlers/withdraw.js';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is not set');
  throw new Error('BOT_TOKEN is not set');
}

const PORT = process.env.PORT || 3000;

try {
  console.log('Starting migrations...');
  await migrate();
  console.log('Migrations completed');
} catch (e) {
  console.error('Migration error', e);
  throw e;
}

const bot = new Bot(token);

registerStart(bot);
registerProfile(bot);
registerMining(bot);
registerShop(bot);
registerCases(bot);
registerGames(bot);
registerWithdraw(bot);

bot.hears('💳 Пополнить', async (ctx) => {
  const amounts = [50, 100, 200, 500, 1000, 2500];
  const kb = new InlineKeyboard();
  for (const a of amounts) kb.text(`${a} ⭐️`, `pay:${a}`).row();
  await ctx.reply(
    'Пополнение Stars (XTR)\nВыберите сумму. После оплаты Stars будут начислены на баланс.\n\nКурс: 1 ⭐️ = 200 MC',
    { reply_markup: kb }
  );
});

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (data.startsWith('pay:')) {
    const stars = Number(data.split(':')[1]);
    const prices = [{ label: `${stars}⭐️`, amount: stars }];
    try {
      await ctx.api.sendInvoice({
        chat_id: ctx.chat.id,
        title: `Пополнение на ${stars} ⭐️`,
        description: 'Оплата внутренней валюты бота Telegram Stars (XTR) для игр и покупок',
        payload: `deposit:${stars}:${Date.now()}`,
        currency: 'XTR',
        prices,
        provider_token: ''
      });
    } catch (e) {
      console.error('Invoice send error', e);
    }
    await ctx.answerCallbackQuery();
  }
});

bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('message:successful_payment', async (ctx) => {
  const { successful_payment } = ctx.update.message;
  const total = Number(successful_payment.total_amount);
  const userId = ctx.from.id;
  try {
    await pool.query('insert into users(id, username) values ($1,$2) on conflict (id) do update set username=excluded.username', [userId, ctx.from.username || null]);
    await pool.query('update users set stars = stars + $2, updated_at = now() where id = $1', [userId, total]);
    await pool.query('insert into payments(user_id, stars, payload) values ($1,$2,$3)', [userId, total, successful_payment.invoice_payload]);
    await pool.query('insert into transactions(user_id, kind, amount_stars, meta) values ($1,$2,$3,$4)', [userId, 'deposit', total, JSON.stringify({ payload: successful_payment.invoice_payload })]);
    const ref = await pool.query('select referred_by from users where id=$1', [userId]);
    const referredBy = ref.rows[0]?.referred_by;
    if (referredBy) {
      const bonus = Math.floor(total * 0.05);
      await pool.query('update users set stars = stars + $2 where id=$1', [referredBy, bonus]);
      try {
        await ctx.api.sendMessage(referredBy, `Ваш реферал пополнил на ${fmtStars(total)}. Начислено 5%: ${fmtStars(bonus)}.`);
      } catch (_) {}
    }
    await ctx.reply(`Оплата получена: ${fmtStars(total)} зачислены на баланс.`, MAIN_MENU);
  } catch (e) {
    console.error('Successful payment handling error', e);
  }
});

bot.catch((err) => console.error('Bot error', err));

// health server for Railway / diagnostics
import express from 'express';
const app = express();
app.get('/health', async (req, res) => {
  try {
    const r = await pool.query('select 1');
    res.json({ status: 'ok', db: !!r });
  } catch (e) {
    res.status(500).json({ status: 'error', error: String(e) });
  }
});
app.get('/ready', async (req, res) => {
  try {
    const r = await pool.query('select 1');
    res.json({ ready: true });
  } catch (e) {
    res.status(500).json({ ready: false });
  }
});

process.on('unhandledRejection', (r) => console.error('UnhandledRejection', r));
process.on('uncaughtException', (err) => console.error('UncaughtException', err));

// start express then bot
app.listen(PORT, async () => {
  console.log(`Health server listening on ${PORT}`);
  try {
    // quick DB check
    await pool.query('select 1');
    console.log('Database connected');
  } catch (e) {
    console.error('Database connection error', e);
  }
  try {
    await bot.start();
    console.log('Mines Stars bot started');
  } catch (e) {
    console.error('Failed to start bot', e);
  }
});
