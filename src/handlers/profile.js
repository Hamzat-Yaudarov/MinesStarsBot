import { MAIN_MENU, DIG_COOLDOWN_MS } from '../data/constants.js';
import { getInventory, getUser } from '../db/index.js';
import { formatBalances, invSummary, humanMs } from '../utils/format.js';

export function registerProfile(bot) {
  bot.hears(MAIN_MENU.PROFILE, async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала нажмите /start');
    const inv = await getInventory(ctx.from.id);
    const now = Date.now();
    const last = user.last_dig_at ? new Date(user.last_dig_at).getTime() : 0;
    const rest = DIG_COOLDOWN_MS - (now - last);
    const cooldown = user.pickaxe_level === 0 ? 'Нет кирки' : (rest > 0 ? `⏳ Откат: ${humanMs(rest)}` : 'Готов к копке');

    const text = [
      `📇 Профиль @${ctx.from.username || ''}`.trim(),
      `\nКирка: уровень ${user.pickaxe_level}`,
      formatBalances(user),
      '',
      '⛏️ Шахта',
      cooldown,
      '',
      '📦 Инвентарь',
      invSummary(inv)
    ].join('\n');

    await ctx.reply(text, {
      reply_markup: {
        keyboard: [
          [MAIN_MENU.PROFILE, MAIN_MENU.MINE],
          [MAIN_MENU.SELL, MAIN_MENU.SHOP],
          [MAIN_MENU.CASES, MAIN_MENU.GAMES],
          [MAIN_MENU.WITHDRAW]
        ],
        resize_keyboard: true
      }
    });
  });
}
