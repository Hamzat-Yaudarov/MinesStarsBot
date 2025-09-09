import { MAIN_MENU, NFT_TYPES } from '../data/constants.js';
import { ADMIN_IDS } from '../config.js';
import { addNftsBulk, getStats } from '../db/index.js';

const awaitingBulk = new Map(); // adminId -> true

function isAdmin(id){ return ADMIN_IDS.includes(Number(id)); }

function typesList(){
  return Object.values(NFT_TYPES).join(', ');
}

export function registerAdmin(bot) {
  bot.hears(MAIN_MENU.ADMIN, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const text = [
      '🛡️ Админ-панель',
      `Доступные типы NFT: ${typesList()}`
    ].join('\n');
    await ctx.reply(text, {
      reply_markup: { inline_keyboard: [
        [{ text: '➕ Добавить NFT (bulk)', callback_data: 'admin:add_nfts' }],
        [{ text: '📈 Статистика', callback_data: 'admin:stats' }]
      ] }
    });
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('admin:')) return next();
    if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('Нет доступа', { show_alert: true }); return; }

    if (data === 'admin:add_nfts') {
      awaitingBulk.set(ctx.from.id, true);
      const guide = [
        'Вставьте список NFT построчно в формате:',
        'Тип, Ссылка',
        `Тип — один из: ${typesList()}`,
        'Пример:',
        'Snoop Dogg, https://t.me/...',
        'Swag Bag, https://t.me/...'
      ].join('\n');
      await ctx.editMessageText(guide);
      return ctx.answerCbQuery();
    }

    if (data === 'admin:stats') {
      const s = await getStats();
      const byType = Object.values(NFT_TYPES).map(t => {
        const row = s.nfts_available.find(r => r.type === t);
        return `${t}: ${row?.c || 0}`;
      }).join('\n');
      const text = `📈 Статистика\nПользователи всего: ${s.users_total}\nАктивные сегодня: ${s.users_active_today}\n\nДоступные NFT:\n${byType}`;
      await ctx.editMessageText(text);
      return ctx.answerCbQuery();
    }
  });

  bot.on('text', async (ctx, next) => {
    if (!awaitingBulk.get(ctx.from.id)) return next();
    if (!isAdmin(ctx.from.id)) return;
    const body = (ctx.message.text||'').trim();
    if (!body) { awaitingBulk.delete(ctx.from.id); return; }

    const allowed = new Map(Object.values(NFT_TYPES).map(v => [v.toLowerCase(), v]));
    const items = [];
    const lines = body.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    for (const line of lines) {
      const m = line.split(/[,|]/).map(s=>s.trim());
      if (m.length < 2) continue;
      const typeRaw = m[0].toLowerCase();
      const link = m[1];
      const type = allowed.get(typeRaw);
      if (!type || !link.startsWith('http')) continue;
      items.push({ type, tg_link: link });
    }
    if (!items.length) { awaitingBulk.delete(ctx.from.id); await ctx.reply('Не найдено валидных строк'); return; }
    const res = await addNftsBulk(items);
    awaitingBulk.delete(ctx.from.id);
    await ctx.reply(`Готово. Добавлено: ${res.inserted}, пропущено (дубликаты): ${res.skipped}`);
  });
}
