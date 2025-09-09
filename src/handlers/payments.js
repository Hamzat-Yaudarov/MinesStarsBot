import { MAIN_MENU } from '../data/constants.js';
import { getUser, updateUser, pool } from '../db/index.js';

function amountsKeyboard() {
  const opts = [50, 100, 250, 500, 1000, 2500, 10000];
  const rows = [];
  for (let i = 0; i < opts.length; i += 3) {
    rows.push(opts.slice(i, i+3).map(v => ({ text: `${v}⭐`, callback_data: `deposit:${v}` })));
  }
  return { inline_keyboard: rows };
}

export function registerPayments(bot) {
  bot.hears(MAIN_MENU.DEPOSIT, async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала /start');
    await ctx.reply('Выберите сумму пополнения в ⭐:', { reply_markup: amountsKeyboard() });
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('deposit:')) return next();
    const user = await getUser(ctx.from.id);
    if (!user) { await ctx.answerCbQuery('Сначала /start'); return; }
    const amount = Number(data.split(':')[1]);
    if (!Number.isInteger(amount) || amount <= 0) { await ctx.answerCbQuery('Неверная сумма'); return; }

    const payload = `dep:${user.tg_id}:${Date.now()}:${amount}`;
    await ctx.deleteMessage().catch(()=>{});
    await ctx.replyWithInvoice({
      title: 'Пополнение баланса',
      description: `${amount} ⭐ на баланс`,
      payload,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'Stars', amount }]
    });
  });

  bot.on('pre_checkout_query', async (ctx) => {
    try {
      await ctx.answerPreCheckoutQuery(true);
    } catch {
      await ctx.answerPreCheckoutQuery(false, 'Ошибка оформления');
    }
  });

  bot.on('successful_payment', async (ctx) => {
    const sp = ctx.message.successful_payment;
    if (!sp || sp.currency !== 'XTR') return;
    const tgId = ctx.from.id;
    const stars = Number(sp.total_amount || 0);
    if (stars <= 0) return;

    const user = await getUser(tgId);
    if (!user) return;
    await updateUser(tgId, { balance_stars: Number(user.balance_stars||0) + stars });
    await pool.query('insert into payments (user_tg_id, amount_stars, type, status) values ($1,$2,$3,$4)', [tgId, stars, 'deposit', 'success']);
    await ctx.reply(`✅ Пополнение: +${stars}⭐`);
  });
}
