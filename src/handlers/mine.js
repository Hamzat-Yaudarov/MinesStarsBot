import { MAIN_MENU, DIG_COOLDOWN_MS } from '../data/constants.js';
import { addInventory, getInventory, getUser, updateUser } from '../db/index.js';
import { invSummary, resourceLabel } from '../utils/format.js';
import { generateDrops } from '../services/mining.js';

function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }

function msToMin(ms){ return Math.max(0, Math.ceil(ms/60000)); }

function mineScreen(user){
  const now = Date.now();
  const last = user.last_dig_at ? new Date(user.last_dig_at).getTime() : 0;
  const left = Math.max(0, DIG_COOLDOWN_MS - (now - last));
  const digLabel = left > 0 ? `⛏ Копать (⏳ ${msToMin(left)}м)` : '⛏ Копать';
  const text = `Шахта\nКирка: уровень ${user.pickaxe_level}\nКопать можно раз в 3 часа.`;
  const kb = { inline_keyboard: [
    [{ text: digLabel, callback_data: 'mine:dig' }],
    [{ text: '💰 Продать', callback_data: 'open_sell' }]
  ]};
  return { text, kb };
}

export function registerMine(bot) {
  bot.hears(MAIN_MENU.MINE, async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала нажмите /start');
    if (user.pickaxe_level === 0) {
      return ctx.reply('Шахта\nКирка: отсутствует\nКопать нельзя без кирки.', {
        reply_markup: { inline_keyboard: [[{ text: '🛒 В магазин', callback_data: 'nav:shop' }]] }
      });
    }
    const { text, kb } = mineScreen(user);
    await ctx.reply(text, { reply_markup: kb });
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('mine:') && data !== 'nav:shop') return next();
    const user = await getUser(ctx.from.id);
    if (!user) { await ctx.answerCbQuery('Сначала /start', { show_alert: true }); return; }

    if (data === 'nav:shop') {
      await ctx.answerCbQuery('Открываю магазин');
      await ctx.telegram.sendMessage(ctx.chat.id, '🛒 Магазин откроется по кнопке снизу');
      return;
    }

    if (data === 'mine:dig') {
      if (user.pickaxe_level === 0) {
        await ctx.answerCbQuery('Нет кирки. Купите в магазине.', { show_alert: true });
        return;
      }
      const now = Date.now();
      const last = user.last_dig_at ? new Date(user.last_dig_at).getTime() : 0;
      const left = Math.max(0, DIG_COOLDOWN_MS - (now - last));
      if (left > 0) {
        const { kb } = mineScreen(user);
        try { await ctx.editMessageReplyMarkup(kb); } catch {}
        await ctx.answerCbQuery(`Рано копать. Осталось ~${msToMin(left)} мин.`, { show_alert: true });
        return;
      }

      // per-user lock
      const { withLock, isLocked } = await import('../utils/locks.js');
      if (isLocked(ctx.from.id, 'mine')) { await ctx.answerCbQuery('Идёт копка, подождите...', { show_alert: true }); return; }

      const anim = await ctx.reply('⛏ Копаю');
      const frames = ['⛏ Копаю', '⛏ Копаю.', '⛏ Копаю..', '⛏ Копаю...'];
      let running = true;
      // Start animation loop
      (async () => {
        let i = 0; let t = 0;
        while (running && t < 12) { // ~12 ticks ~ 4-5s
          try { await ctx.telegram.editMessageText(ctx.chat.id, anim.message_id, undefined, frames[i]); } catch {}
          i = (i + 1) % frames.length; t++;
          await sleep(350);
        }
      })();

      // Compute drops
      const { drops, usedMc, cap } = generateDrops(user.pickaxe_level);
      await updateUser(ctx.from.id, { last_dig_at: new Date().toISOString() });
      if (Object.keys(drops).length) await addInventory(ctx.from.id, drops);

      running = false;
      const lines = Object.entries(drops).map(([k,v]) => `+ ${v} ${resourceLabel(k)}`);
      const inv = await getInventory(ctx.from.id);
      const result = [
        '🎉 Добыча завершена!',
        ... (lines.length ? [''].concat(lines) : ['\nСегодня пусто...']),
        '',
        `💼 Ценность добычи: ${usedMc} MC (лимит ${cap} MC)`,
        '',
        '📦 Инвентарь',
        invSummary(inv)
      ].join('\n');
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, anim.message_id, undefined, result, {
          reply_markup: { inline_keyboard: [[{ text: '💰 Продать', callback_data: 'open_sell' }]] }
        });
      } catch {}
      await ctx.answerCbQuery('Готово');
      return;
    }
  });
}
