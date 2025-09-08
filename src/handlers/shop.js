import { MAIN_MENU, MC_PER_STAR, PICKAXE_LEVEL_COST_MC } from '../data/constants.js';
import { getUser, updateUser } from '../db/index.js';

const awaiting = new Map(); // userId -> { dir: 'mc2stars'|'stars2mc' }

export function registerShop(bot) {
  bot.hears(MAIN_MENU.SHOP, async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала /start');

    const buttons = [];
    if (user.pickaxe_level === 0) {
      buttons.push([{ text: '⛏️ Купить кирку (10,000 MC)', callback_data: 'shop:pickaxe:mc' }]);
      buttons.push([{ text: '⛏️ Купить кирку (50 ⭐)', callback_data: 'shop:pickaxe:stars' }]);
    } else {
      const lvl = Number(user.pickaxe_level);
      const next = Math.min(10, lvl + 1);
      const cost = PICKAXE_LEVEL_COST_MC[next];
      buttons.push([{ text: `⛏️ Кирка ур. ${lvl}`, callback_data: 'noop' }]);
      if (lvl < 10) buttons.push([{ text: `🔧 Улучшить до ур. ${next} (${cost.toLocaleString()} MC)`, callback_data: `shop:upgrade:${next}` }]);
      else buttons.push([{ text: '✅ Максимальный уровень', callback_data: 'noop' }]);
    }
    buttons.push([{ text: '🔄 Обмен MC ↔️ ⭐', callback_data: 'shop:exchange' }]);

    await ctx.reply('🛒 Магазин', { reply_markup: { inline_keyboard: buttons } });
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('shop:')) return next();
    const user = await getUser(ctx.from.id);
    if (!user) { await ctx.answerCbQuery('Сначала /start'); return; }

    if (data.startsWith('shop:upgrade:')) {
      const next = Number(data.split(':')[2]);
      const lvl = Number(user.pickaxe_level);
      if (!Number.isInteger(next) || next !== lvl + 1 || next < 1 || next > 10) { await ctx.answerCbQuery('Некорректный уровень'); return; }
      const cost = PICKAXE_LEVEL_COST_MC[next];
      if (Number(user.balance_mc||0) < cost) { await ctx.answerCbQuery('Не хватает MC'); return; }
      await updateUser(user.tg_id, { balance_mc: Number(user.balance_mc) - cost, pickaxe_level: next });
      await ctx.editMessageText(`✅ Улучшение: ур. ${lvl} → ур. ${next} (−${cost.toLocaleString()} MC)`);
      return ctx.answerCbQuery('Готово');
    }

    if (data === 'shop:exchange') {
      await ctx.editMessageText('Выберите направлен��е обмена:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: `MC → ⭐ (1⭐ = ${MC_PER_STAR} MC)`, callback_data: 'shop:exchange:mc2stars' }],
            [{ text: `⭐ → MC (1⭐ = ${MC_PER_STAR} MC)`, callback_data: 'shop:exchange:stars2mc' }]
          ]
        }
      });
      return ctx.answerCbQuery();
    }

    if (data === 'shop:exchange:mc2stars' || data === 'shop:exchange:stars2mc') {
      const dir = data.split(':').pop();
      awaiting.set(ctx.from.id, { dir });
      await ctx.editMessageText(dir === 'mc2stars' ? 'Введите количество ⭐ для покупки за MC:' : 'Введите количество ⭐ для продажи в MC:');
      return ctx.answerCbQuery();
    }

    if (data === 'shop:pickaxe:mc') {
      if (user.pickaxe_level > 0) { await ctx.answerCbQuery('Кирка уже куплена'); return; }
      if (Number(user.balance_mc||0) < 10000) { await ctx.answerCbQuery('Не хватает MC'); return; }
      await updateUser(user.tg_id, { balance_mc: Number(user.balance_mc) - 10000, pickaxe_level: 1 });
      await ctx.editMessageText('✅ Кирка куплена за 10,000 MC. Теперь можно копать!');
      return ctx.answerCbQuery('Готово');
    }

    if (data === 'shop:pickaxe:stars') {
      if (user.pickaxe_level > 0) { await ctx.answerCbQuery('Кирка уже куплена'); return; }
      if (Number(user.balance_stars||0) < 50) { await ctx.answerCbQuery('Не хватает ⭐'); return; }
      await updateUser(user.tg_id, { balance_stars: Number(user.balance_stars) - 50, pickaxe_level: 1 });
      await ctx.editMessageText('✅ Кирка куплена за 50 ⭐. Теперь можно копать!');
      return ctx.answerCbQuery('Готово');
    }
  });

  bot.on('text', async (ctx, next) => {
    const p = awaiting.get(ctx.from.id);
    if (!p) return next();
    const n = Number((ctx.message.text||'').trim());
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      await ctx.reply('Введите целое положительное число ⭐');
      return;
    }
    const user = await getUser(ctx.from.id);
    if (!user) return; 

    if (p.dir === 'mc2stars') {
      const needMc = n * MC_PER_STAR;
      if (Number(user.balance_mc||0) < needMc) { await ctx.reply(`Нужно ${needMc} MC`); return; }
      await updateUser(user.tg_id, {
        balance_mc: Number(user.balance_mc) - needMc,
        balance_stars: Number(user.balance_stars||0) + n
      });
      awaiting.delete(ctx.from.id);
      await ctx.reply(`✅ Обмен: -${needMc} MC → +${n} ⭐`);
      return;
    }

    if (p.dir === 'stars2mc') {
      if (Number(user.balance_stars||0) < n) { await ctx.reply('Не хватает ⭐'); return; }
      const gainMc = n * MC_PER_STAR;
      await updateUser(user.tg_id, {
        balance_stars: Number(user.balance_stars) - n,
        balance_mc: Number(user.balance_mc||0) + gainMc
      });
      awaiting.delete(ctx.from.id);
      await ctx.reply(`✅ Обмен: -${n} ⭐ → +${gainMc} MC`);
      return;
    }
  });
}
