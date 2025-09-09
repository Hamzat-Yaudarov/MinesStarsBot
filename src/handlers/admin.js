import { ADMIN_IDS } from '../config.js';
import { getUser, pool } from '../db/index.js';

const awaiting = new Map(); // adminId -> { mode: 'nft_single'|'nft_batch' }

function isAdmin(id){ return ADMIN_IDS.includes(id); }

function adminMenuKb(){
  return { inline_keyboard: [
    [{ text: '📊 Статистика', callback_data: 'admin:stats' }],
    [{ text: '➕ Добавить NFT', callback_data: 'admin:nft:add' }],
    [{ text: '📦 Массовое добавление NFT', callback_data: 'admin:nft:batch' }],
    [{ text: '↩️ К пользователю', callback_data: 'admin:back' }]
  ]};
}

async function getStats() {
  const [[users], [spent], [earned], [deposits], [wd]] = await Promise.all([
    pool.query('select count(*)::int as c from users'),
    pool.query("select coalesce(sum(case when amount<0 then -amount else 0 end),0)::bigint as s from star_ledger"),
    pool.query("select coalesce(sum(case when amount>0 then amount else 0 end),0)::bigint as s from star_ledger"),
    pool.query("select coalesce(sum(amount_stars),0)::bigint as s from payments where status='success' and type='deposit'"),
    pool.query("select coalesce(sum(total_stars),0)::bigint as s from withdrawals where status='completed'")
  ]);
  const totalUsers = users.rows[0].c;
  const starsSpent = Number(spent.rows[0].s);
  const starsEarned = Number(earned.rows[0].s);
  const botNet = Number(deposits.rows[0].s) - Number(wd.rows[0].s);

  const { rows: activeRows } = await pool.query(`
    select count(distinct x.tg_id)::int as c from (
      select tg_id from users where created_at::date=now()::date or (last_dig_at is not null and last_dig_at::date=now()::date)
      union all select user_tg_id as tg_id from star_ledger where created_at::date=now()::date
      union all select user_tg_id as tg_id from payments where created_at::date=now()::date
      union all select user_tg_id as tg_id from ladder_games where created_at::date=now()::date
      union all select user_tg_id as tg_id from withdrawals where created_at::date=now()::date
    ) x`);
  const activeToday = activeRows[0].c;

  return { totalUsers, activeToday, starsSpent, starsEarned, botNet };
}

export function registerAdmin(bot) {
  bot.hears('🛠️ Админ-панель', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.reply('Админ-панель', { reply_markup: adminMenuKb() });
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('admin:')) return next();
    if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('Нет прав', { show_alert: true }); return; }

    if (data === 'admin:back') {
      await ctx.editMessageText('Админ-панель', { reply_markup: adminMenuKb() });
      return ctx.answerCbQuery();
    }

    if (data === 'admin:stats') {
      const s = await getStats();
      const text = `📊 Статистика\nПользователей всего: ${s.totalUsers}\nАктивных сегодня: ${s.activeToday}\nЗвёзды: потрачено ${s.starsSpent}, заработано ${s.starsEarned}\nЧистыми бот: ${s.botNet}`;
      await ctx.editMessageText(text, { reply_markup: adminMenuKb() });
      return ctx.answerCbQuery();
    }

    if (data === 'admin:nft:add') {
      awaiting.set(ctx.from.id, { mode: 'nft_single' });
      await ctx.editMessageText('Отправьте строку: Тип ; Ссылка\nТип: Snoop Dogg | Swag Bag | Snoop Cigar | Low Rider', { reply_markup: adminMenuKb() });
      return ctx.answerCbQuery();
    }
    if (data === 'admin:nft:batch') {
      awaiting.set(ctx.from.id, { mode: 'nft_batch' });
      await ctx.editMessageText('Отправьте несколько строк, каждая: Тип ; Ссылка', { reply_markup: adminMenuKb() });
      return ctx.answerCbQuery();
    }
  });

  bot.on('text', async (ctx, next) => {
    const p = awaiting.get(ctx.from.id);
    if (!p || !isAdmin(ctx.from.id)) return next();
    const lines = (ctx.message.text||'').split(/\n+/).map(s=>s.trim()).filter(Boolean);

    const parse = (line) => {
      const [typeRaw, linkRaw] = line.split(/;|\||\s{2,}/).map(s=>s?.trim()).filter(Boolean);
      return { type: typeRaw, link: linkRaw };
    };

    const rows = p.mode === 'nft_single' ? [parse(lines[0])] : lines.map(parse);
    const validTypes = new Set(['Snoop Dogg','Swag Bag','Snoop Cigar','Low Rider']);
    const toInsert = rows.filter(r => r.type && r.link && validTypes.has(r.type));

    if (!toInsert.length) { await ctx.reply('Не удалось распознать данные. Формат: Тип ; Ссылка'); return; }

    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const r of toInsert) {
        await client.query('insert into nfts (type, tg_link) values ($1,$2) on conflict (tg_link) do nothing', [r.type, r.link]);
      }
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      await ctx.reply('Ошибка добавления');
      return;
    } finally { client.release(); }

    awaiting.delete(ctx.from.id);
    await ctx.reply(`Добавлено: ${toInsert.length}`);
  });
}
