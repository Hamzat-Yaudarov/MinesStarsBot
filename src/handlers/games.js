import { MAIN_MENU, LADDER_ALLOWED_BETS_STARS, LADDER_LEVELS, LADDER_CHOICES, LADDER_MULTIPLIERS } from '../data/constants.js';
import { getUser, updateUser, getActiveLadderGame, createLadderGame, updateLadderGame } from '../db/index.js';

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function randomLayout() {
  // layout: { "1": [brokenIndices], ... }
  const layout = {};
  for (let lvl = 1; lvl <= LADDER_LEVELS; lvl++) {
    const broken = new Set();
    while (broken.size < lvl) {
      broken.add(Math.floor(Math.random() * LADDER_CHOICES) + 1);
    }
    layout[String(lvl)] = Array.from(broken);
  }
  return layout;
}

function betKeyboard() {
  const rows = [];
  for (let i = 0; i < LADDER_ALLOWED_BETS_STARS.length; i += 3) {
    rows.push(LADDER_ALLOWED_BETS_STARS.slice(i, i+3).map(v => ({ text: `${v}⭐`, callback_data: `ladder:bet:${v}` })));
  }
  return { inline_keyboard: rows };
}

function levelKeyboard(level) {
  const row = [];
  for (let i = 1; i <= LADDER_CHOICES; i++) row.push({ text: String(i), callback_data: `ladder:pick:${level}:${i}` });
  return { inline_keyboard: [row, [{ text: '💼 Забрать', callback_data: 'ladder:cash' }]] };
}

export function registerGames(bot) {
  bot.hears(MAIN_MENU.GAMES, async (ctx) => {
    await ctx.reply('🎲 Игры', { reply_markup: { inline_keyboard: [[{ text: '🪜 Лесенка', callback_data: 'ladder:start' }]] } });
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('ladder:')) return next();
    const user = await getUser(ctx.from.id);
    if (!user) { await ctx.answerCbQuery('Сначала /start'); return; }

    if (data === 'ladder:start') {
      const active = await getActiveLadderGame(user.tg_id);
      if (active) { await ctx.editMessageText('Идёт игра Лесенка. Выберите число:', { reply_markup: levelKeyboard(active.level + 1) }); return; }
      await ctx.editMessageText('Выберите ставку:', { reply_markup: betKeyboard() });
      return ctx.answerCbQuery();
    }

    if (data.startsWith('ladder:bet:')) {
      const bet = Number(data.split(':')[2]);
      if (!LADDER_ALLOWED_BETS_STARS.includes(bet)) { await ctx.answerCbQuery('Недопустимая ставка'); return; }
      if (Number(user.balance_stars||0) < bet) { await ctx.answerCbQuery('Недостаточно ⭐'); return; }
      const layout = randomLayout();
      await updateUser(user.tg_id, { balance_stars: Number(user.balance_stars) - bet });
      const game = await createLadderGame(user.tg_id, bet, layout);
      await ctx.editMessageText(`🪜 Лесенка — уровень 1 из ${LADDER_LEVELS}\nСтавка: ${bet}⭐\nВыберите число:`, { reply_markup: levelKeyboard(1) });
      return ctx.answerCbQuery('Игра начата');
    }

    if (data === 'ladder:cash') {
      const game = await getActiveLadderGame(user.tg_id);
      if (!game) { await ctx.answerCbQuery('Игра не найдена'); return; }
      if (game.level <= 0) { await ctx.answerCbQuery('Нечего забирать'); return; }
      const mult = LADDER_MULTIPLIERS[game.level - 1];
      const payout = Math.floor(Number(game.bet_stars) * mult);
      await updateUser(user.tg_id, { balance_stars: Number(user.balance_stars||0) + payout });
      await updateLadderGame(game.id, { status: 'cashed' });
      await ctx.editMessageText(`✅ Забрано: ${payout}⭐ (уровней пройдено: ${game.level}, x${mult.toFixed(2)})`);
      return ctx.answerCbQuery('Выплата');
    }

    if (data.startsWith('ladder:pick:')) {
      const [, , levelStr, idxStr] = data.split(':');
      const level = Number(levelStr);
      const pick = Number(idxStr);
      const game = await getActiveLadderGame(user.tg_id);
      if (!game) { await ctx.answerCbQuery('Игра не найдена'); return; }
      if (level !== Number(game.level) + 1) { await ctx.answerCbQuery('Неверный уровень'); return; }
      const layout = game.layout;
      const broken = (layout[String(level)] || []);

      await ctx.editMessageText(`🪜 Уровень ${level} — проверяем...`);
      await sleep(400);

      if (broken.includes(pick)) {
        await updateLadderGame(game.id, { status: 'lost' });
        await ctx.editMessageText(`💥 Лестница сломана на ${level}-м уровне. Ставка сгорела.`);
        return ctx.answerCbQuery('Проигрыш');
      }

      const nextLevel = level;
      await updateLadderGame(game.id, { level: nextLevel });

      if (nextLevel >= LADDER_LEVELS) {
        const mult = LADDER_MULTIPLIERS[nextLevel - 1];
        const payout = Math.floor(Number(game.bet_stars) * mult);
        await updateUser(user.tg_id, { balance_stars: Number(user.balance_stars||0) + payout });
        await updateLadderGame(game.id, { status: 'cashed' });
        await ctx.editMessageText(`🏁 Максимум! Пройдено ${LADDER_LEVELS} уровней. Выплата ${payout}⭐`);
        return ctx.answerCbQuery('Победа');
      }

      await ctx.editMessageText(`✅ Уровень ${level} пройден!\nТекущий множитель: x${LADDER_MULTIPLIERS[nextLevel - 1].toFixed(2)}\nВыберите число на уровне ${nextLevel+1}:`, { reply_markup: levelKeyboard(nextLevel + 1) });
      return ctx.answerCbQuery('Далее');
    }
  });
}
