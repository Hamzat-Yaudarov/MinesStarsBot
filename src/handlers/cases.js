import { MAIN_MENU, CASE100_REWARDS, CASE700_WEIGHTS } from '../data/constants.js';
import { getUser, updateUser, assignRandomNftOfType } from '../db/index.js';
import { weightedChoice } from '../utils/random.js';

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

export function registerCases(bot) {
  bot.hears(MAIN_MENU.CASES, async (ctx) => {
    await ctx.reply('🎁 Кейсы', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💼 Кейс за 100⭐', callback_data: 'case:100' }],
          [{ text: '🪪 Кейс за 700⭐ (NFT)', callback_data: 'case:700' }]
        ]
      }
    });
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('case:')) return next();
    const user = await getUser(ctx.from.id);
    if (!user) { await ctx.answerCbQuery('Нажмите /start'); return; }

    if (data === 'case:100') {
      const { withLock, isLocked } = await import('../utils/locks.js');
      if (isLocked(ctx.from.id, 'cases')) { await ctx.answerCbQuery('Уже открываем кейс'); return; }
      await withLock(ctx.from.id, 'cases', async () => {
        if (Number(user.balance_stars||0) < 100) { await ctx.answerCbQuery('Не хватает ⭐'); return; }
        await updateUser(user.tg_id, { balance_stars: Number(user.balance_stars) - 100 });
        await ctx.editMessageText('🎁 Кейс 100⭐...');
        await sleep(300); await ctx.editMessageText('🎁 Кейс 100⭐... 🔄');
        const outcomes = CASE100_REWARDS.map(x => [x.amount, x.weight]);
        const reward = weightedChoice(outcomes);
        await updateUser(user.tg_id, { balance_stars: Number(user.balance_stars||0) + reward });
        await ctx.editMessageText(`🎉 Выигрыш: +${reward}⭐`);
        await ctx.answerCbQuery('Открыто');
      });
      return;
    }

    if (data === 'case:700') {
      const { withLock, isLocked } = await import('../utils/locks.js');
      if (isLocked(ctx.from.id, 'cases')) { await ctx.answerCbQuery('Уже открываем кейс'); return; }
      await withLock(ctx.from.id, 'cases', async () => {
        const fresh = await getUser(ctx.from.id);
        if (Number(fresh.balance_stars||0) < 700) { await ctx.answerCbQuery('Не хватает ⭐'); return; }
        await ctx.editMessageText('🪪 Кейс 700⭐ (NFT)...');
        await sleep(300); await ctx.editMessageText('🪪 Кейс 700⭐ (NFT)... 🔄');
        const pick = weightedChoice(CASE700_WEIGHTS.map(x => [x.type, x.weight]));
        const nft = await assignRandomNftOfType(pick, user.tg_id);
        if (!nft) {
          await ctx.editMessageText('🙁 Временно нет доступных NFT этого типа. Стоимость кейса возвращена.');
          await ctx.answerCbQuery('Нет NFT');
          return;
        }
        // Deduct only after NFT reserved
        const latest = await getUser(ctx.from.id);
        if (Number(latest.balance_stars||0) < 700) { await ctx.answerCbQuery('Недостаточно ⭐'); return; }
        await updateUser(latest.tg_id, { balance_stars: Number(latest.balance_stars) - 700 });
        await ctx.editMessageText(`🎉 Выпал NFT: ${nft.type}\nID: ${nft.id}\nСсылка: ${nft.tg_link}`);
        await ctx.answerCbQuery('Готово');
      });
      return;
    }
  });
}
