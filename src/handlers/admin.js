import { ADMIN_IDS } from '../config.js';
import { NFT_TYPES } from '../data/constants.js';
import { pool, getUser } from '../db/index.js';

const awaiting = new Map(); // adminId -> { mode: 'add_one'|'add_many', type }

function isAdmin(id){ return ADMIN_IDS.includes(Number(id)); }

function adminMenu() {
  return { inline_keyboard: [
    [{ text: '↩️ В пользовательскую часть', callback_data: 'admin:back' }],
    [{ text: '➕ Добавить NFT', callback_data: 'admin:add_one' }],
    [{ text: '📦 Массовое добавление NFT', callback_data: 'admin:add_many' }],
    [{ text: '📊 Статистика', callback_data: 'admin:stats' }]
  ] };
}

function nftTypeButtons(prefix='admin:type') {
  const types = Object.values(NFT_TYPES);
  return { inline_keyboard: types.map(t => [{ text: t, callback_data: `${prefix}:${t}` }]) };
}

export function registerAdmin(bot) {
  bot.hears('🛠️ Админ-панель', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.reply('🛠️ Админ-панель', { reply_markup: adminMenu() });
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('admin:')) return next();
    if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('Нет доступа', { show_alert: true }); return; }

    if (data === 'admin:back') {
      await ctx.editMessageText('Возврат в пользовательскую часть. Откройте нужный раздел с меню снизу.');
      return ctx.answerCbQuery();
    }

    if (data === 'admin:add_one') {
      awaiting.set(ctx.from.id, { mode: 'add_one' });
      await ctx.editMessageText('Выберите тип NFT:', { reply_markup: nftTypeButtons('admin:pick') });
      return ctx.answerCbQuery();
    }

    if (data === 'admin:add_many') {
      awaiting.set(ctx.from.id, { mode: 'add_many' });
      await ctx.editMessageText('Выберите тип NFT для массового добавления:', { reply_markup: nftTypeButtons('admin:pick') });
      return ctx.answerCbQuery();
    }

    if (data.startsWith('admin:pick:')) {
      const type = data.split(':')[2];
      const p = awaiting.get(ctx.from.id);
      if (!p) { await ctx.answerCbQuery('Сессия истекла'); return; }
      p.type = type;
      awaiting.set(ctx.from.id, p);
      if (p.mode === 'add_one') {
        await ctx.editMessageText(`Тип: ${type}\nОтправьте ссылку NFT (уникальную, телеграм-ссылку):`);
      } else {
        await ctx.editMessageText(`Тип: ${type}\nВставьте список ссылок, по одной в строке:`);
      }
      return ctx.answerCbQuery();
    }

    if (data === 'admin:stats') {
      const { rows: u1 } = await pool.query('select count(*)::int as c from users');
      const { rows: u2 } = await pool.query("select count(*)::int as c from users where last_active_at::date = now()::date");
      const { rows: nft } = await pool.query("select type, count(*)::int as c from nfts where assigned=false and reserved=false group by type order by type");
      const lines = [
        `Пользователи всего: ${u1[0].c}`,
        `Активно сегодня: ${u2[0].c}`,
        'Доступные NFT:'
      ].concat(nft.map(r => `• ${r.type}: ${r.c}`));
      await ctx.editMessageText(lines.join('\n'));
      return ctx.answerCbQuery();
    }
  });

  bot.on('text', async (ctx, next) => {
    const p = awaiting.get(ctx.from.id);
    if (!p) return next();
    if (!isAdmin(ctx.from.id)) return next();
    const text = (ctx.message.text||'').trim();
    if (!text) return;

    if (p.mode === 'add_one') {
      const link = text;
      try {
        await pool.query('insert into nfts (type, tg_link) values ($1,$2)', [p.type, link]);
        await ctx.reply(`✅ Добавлено: ${p.type} — ${link}`);
      } catch (e) {
        await ctx.reply('Ошибка добавления (возможно дубль ссылки).');
      }
      awaiting.delete(ctx.from.id);
      return;
    }

    if (p.mode === 'add_many') {
      const links = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      let ok=0, fail=0;
      for (const link of links) {
        try {
          await pool.query('insert into nfts (type, tg_link) values ($1,$2)', [p.type, link]);
          ok++;
        } catch { fail++; }
      }
      awaiting.delete(ctx.from.id);
      await ctx.reply(`Готово. Успешно: ${ok}, ошибок: ${fail}`);
      return;
    }
  });
}
