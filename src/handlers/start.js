import { MAIN_MENU } from '../data/constants.js';
import { getOrCreateUser } from '../db/index.js';

export function registerStart(bot) {
  bot.start(async (ctx) => {
    let ref = null;
    const payload = (ctx.startPayload || '').trim();
    if (payload && /^\d+$/.test(payload)) ref = Number(payload);
    await getOrCreateUser(ctx, ref);

    const { ADMIN_IDS } = await import('../config.js');
    const isAdmin = ADMIN_IDS.includes(Number(ctx.from.id));
    const rows = [
      [MAIN_MENU.PROFILE, MAIN_MENU.MINE],
      [MAIN_MENU.SELL, MAIN_MENU.SHOP],
      [MAIN_MENU.CASES, MAIN_MENU.GAMES],
      [MAIN_MENU.DEPOSIT, MAIN_MENU.WITHDRAW]
    ];
    if (isAdmin) rows.push(['🛠️ Админ-панель']);
    await ctx.reply('Добро пожаловать в Mines Stars! Выберите раздел ниже.', {
      reply_markup: {
        keyboard: rows,
        resize_keyboard: true
      }
    });
  });
}
