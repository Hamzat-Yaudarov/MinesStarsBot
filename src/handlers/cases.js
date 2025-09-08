import { MAIN_MENU } from '../data/constants.js';
import { getUser, updateUser, sumTodayDepositsStars, hasClaimedFreeCaseToday, markFreeCaseClaimed } from '../db/index.js';
import { weightedChoice, randInt } from '../utils/random.js';

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

export function registerCases(bot) {
  bot.hears(MAIN_MENU.CASES, async (ctx) => {
    await ctx.reply('🎁 Кейсы', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🆓 Ежедневный (депозит ≥ 200⭐)', callback_data: 'case:free' }],
          [{ text: '💼 Кейс за 150⭐', callback_data: 'case:150' }],
          [{ text: '💼 Кейс за 250⭐', callback_data: 'case:250' }]
        ]
      }
    });
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('case:')) return next();
    const user = await getUser(ctx.from.id);
    if (!user) { await ctx.answerCbQuery('Нажмите /start'); return; }

    if (data === 'case:free') {
      if (await hasClaimedFreeCaseToday(user.tg_id)) {
        await ctx.answerCbQuery('Сегодня уже получали');
        return;
      }
      const deposited = await sumTodayDepositsStars(user.tg_id);
      if (deposited < 200) {
        await ctx.answerCbQuery('Требуется пополнение сегодня на 200⭐');
        return;
      }
      const m = await ctx.editMessageText('🎁 Открываем...');
      await sleep(400); await ctx.editMessageText('🎁 Открываем... ✨');
      await sleep(400); await ctx.editMessageText('🎁 Открываем... ✨✨');
      const reward = randInt(10, 75);
      await updateUser(user.tg_id, { balance_stars: Number(user.balance_stars||0) + reward });
      await markFreeCaseClaimed(user.tg_id);
      await ctx.editMessageText(`✅ Бесплатный кейс: +${reward}⭐`);
      await ctx.answerCbQuery('Готово');
      return;
    }

    if (data === 'case:150') {
      if (Number(user.balance_stars||0) < 150) { await ctx.answerCbQuery('Не хватает ⭐'); return; }
      await updateUser(user.tg_id, { balance_stars: Number(user.balance_stars) - 150 });
      const m = await ctx.editMessageText('🎁 Кейс 150⭐...');
      await sleep(300); await ctx.editMessageText('🎁 Кейс 150⭐... 🔄');
      const values150 = [0, 15, 25, 50, 100, 200, 225];
      const base150 = 20; const step150 = 2; // ��очти равные шансы, чуть выше у меньших
      const outcomes = values150.sort((a,b)=>a-b).map((v,i)=>[v, base150 - step150*i]);
      const reward = weightedChoice(outcomes);
      if (reward > 0) await updateUser(user.tg_id, { balance_stars: Number(user.balance_stars||0) + reward });
      await ctx.editMessageText(reward > 0 ? `🎉 Выигрыш: +${reward}⭐` : '🙁 Ничего не выпало');
      await ctx.answerCbQuery('Открыто');
      return;
    }

    if (data === 'case:250') {
      if (Number(user.balance_stars||0) < 250) { await ctx.answerCbQuery('Не хватает ⭐'); return; }
      await updateUser(user.tg_id, { balance_stars: Number(user.balance_stars) - 250 });
      const m = await ctx.editMessageText('🎁 Кейс 250⭐...');
      await sleep(300); await ctx.editMessageText('🎁 Кейс 250⭐... 🔄');
      const values250 = [100, 150, 175, 275, 300, 350];
      const base250 = 18; const step250 = 2; // почти равные шансы, чуть выше у меньших
      const outcomes = values250.sort((a,b)=>a-b).map((v,i)=>[v, base250 - step250*i]);
      const reward = weightedChoice(outcomes);
      await updateUser(user.tg_id, { balance_stars: Number(user.balance_stars||0) + reward });
      await ctx.editMessageText(`🎉 Выигрыш: +${reward}⭐`);
      await ctx.answerCbQuery('Открыто');
      return;
    }
  });
}
