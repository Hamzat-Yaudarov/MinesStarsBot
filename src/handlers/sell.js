import { MAIN_MENU, RESOURCES, MC_PER_STAR } from '../data/constants.js';
import { getInventory, getUser, updateUser, addInventory } from '../db/index.js';

const awaitingAmount = new Map(); // userId -> { resource }

function keyboardForResources(inv) {
  const rows = [];
  for (const r of RESOURCES) {
    const qty = inv[r.key] || 0;
    rows.push([{ text: `${r.emoji} ${r.name}: ${qty}`, callback_data: `sell_res:${r.key}` }]);
  }
  rows.push([{ text: '💸 Продать всё', callback_data: 'sell_all' }]);
  return { inline_keyboard: rows };
}

export function registerSell(bot) {
  bot.hears(MAIN_MENU.SELL, async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала нажмите /start');
    const inv = await getInventory(ctx.from.id);
    await ctx.reply('Выберите ресурс для продажи:', { reply_markup: keyboardForResources(inv) });
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery.data || '';
    if (!data.startsWith('sell_')) return next();
    const userId = ctx.from.id;

    if (data === 'sell_all') {
      const inv = await getInventory(userId);
      let totalMc = 0;
      const price = (key) => RESOURCES.find(r=>r.key===key).priceMc;
      for (const r of RESOURCES) totalMc += (inv[r.key]||0) * price(r.key);
      if (totalMc <= 0) return ctx.answerCbQuery('Нечего продавать');

      // zero-out inventory and add mc
      const changes = {};
      for (const r of RESOURCES) if (inv[r.key]>0) changes[r.key] = -inv[r.key];
      await addInventory(userId, changes);
      const user = await getUser(userId);
      await updateUser(userId, { balance_mc: Number(user.balance_mc||0) + totalMc });

      await ctx.editMessageText(`✅ Продано всё на сумму ${totalMc} MC. Баланс обновлён.`);
      return ctx.answerCbQuery('Готово');
    }

    if (data.startsWith('sell_res:')) {
      const key = data.split(':')[1];
      const inv = await getInventory(userId);
      const qty = inv[key] || 0;
      if (qty <= 0) {
        await ctx.answerCbQuery('Нет такого ресурса');
        return;
      }
      const r = RESOURCES.find(x=>x.key===key);
      const row = [
        [{ text: `Продать всё (${qty})`, callback_data: `sell_res_all:${key}` }],
        [{ text: 'Выбрать часть', callback_data: `sell_res_part:${key}` }]
      ];
      await ctx.editMessageText(`Выберите действие для ${r.emoji} ${r.name}:`, { reply_markup: { inline_keyboard: row } });
      return ctx.answerCbQuery();
    }

    if (data.startsWith('sell_res_all:')) {
      const key = data.split(':')[1];
      const inv = await getInventory(userId);
      const qty = inv[key] || 0;
      if (qty <= 0) { await ctx.answerCbQuery('Нет такого ресурса'); return; }
      const r = RESOURCES.find(x=>x.key===key);
      const total = qty * r.priceMc;
      await addInventory(userId, { [key]: -qty });
      const user = await getUser(userId);
      await updateUser(userId, { balance_mc: Number(user.balance_mc||0) + total });
      await ctx.editMessageText(`✅ Продано ${qty} × ${r.emoji} ${r.name} за ${total} MC.`);
      return ctx.answerCbQuery('Готово');
    }

    if (data.startsWith('sell_res_part:')) {
      const key = data.split(':')[1];
      awaitingAmount.set(userId, { resource: key });
      await ctx.editMessageText('Введите количество для продажи числом:');
      return ctx.answerCbQuery();
    }
  });

  bot.on('text', async (ctx, next) => {
    const pending = awaitingAmount.get(ctx.from.id);
    if (!pending) return next();
    const amount = Number((ctx.message.text||'').trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      await ctx.reply('Введите положительное число.');
      return;
    }
    const inv = await getInventory(ctx.from.id);
    const key = pending.resource;
    const have = inv[key] || 0;
    if (amount > have) {
      await ctx.reply(`У вас только ${have}. Введите число не больше.`);
      return;
    }
    const r = RESOURCES.find(x=>x.key===key);
    const total = amount * r.priceMc;
    await addInventory(ctx.from.id, { [key]: -amount });
    const user = await getUser(ctx.from.id);
    await updateUser(ctx.from.id, { balance_mc: Number(user.balance_mc||0) + total });
    awaitingAmount.delete(ctx.from.id);
    await ctx.reply(`✅ Продано ${amount} × ${r.emoji} ${r.name} за ${total} MC.`);
  });
}
