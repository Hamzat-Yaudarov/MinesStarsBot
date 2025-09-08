import { MAIN_MENU, DIG_COOLDOWN_MS } from '../data/constants.js';
import { addInventory, getInventory, getUser, updateUser } from '../db/index.js';
import { calcTotalMcFromDrops, invSummary, resourceLabel } from '../utils/format.js';
import { generateDrops } from '../services/mining.js';

function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }

export function registerMine(bot) {
  bot.hears(MAIN_MENU.MINE, async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала нажмите /start');
    if (user.pickaxe_level === 0) {
      return ctx.reply('У вас нет кирки. Зайдите в магазин и купите первую кирку за 10,000 MC (или 50 ⭐).');
    }
    const now = Date.now();
    const last = user.last_dig_at ? new Date(user.last_dig_at).getTime() : 0;
    const ready = now - last >= DIG_COOLDOWN_MS;
    if (!ready) {
      const left = DIG_COOLDOWN_MS - (now - last);
      return ctx.reply(`Рано копать. Оставшееся время: ~${Math.ceil(left/60000)} мин.`);
    }

    const msg = await ctx.reply('⛏️ Копаем в шахте...');
    await sleep(600);
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, '⛏️ Копаем в шахте...\n🔦 Ищем жилы руды...');
    await sleep(700);

    const { drops, usedMc, cap } = generateDrops(user.pickaxe_level);
    if (!Object.keys(drops).length) {
      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, '😕 Сегодня пусто... Возвращайтесь позже!');
      await updateUser(ctx.from.id, { last_dig_at: new Date().toISOString() });
      return;
    }

    await addInventory(ctx.from.id, drops);
    await updateUser(ctx.from.id, { last_dig_at: new Date().toISOString() });

    const lines = Object.entries(drops).map(([k,v]) => `+ ${v} ${resourceLabel(k)}`);
    const inv = await getInventory(ctx.from.id);

    const text = [
      '🎉 Добыча завершена!',
      '',
      ...lines,
      '',
      `💼 Ценность добычи: ${usedMc} MC (лимит ${cap} MC)`,
      '',
      '📦 Инвентарь',
      invSummary(inv),
      '',
      'Чтобы продать, нажмите «Продажа»'
    ].join('\n');

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, text, { parse_mode: 'HTML' });
  });
}
