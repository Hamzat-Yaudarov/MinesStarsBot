import { ADMIN_IDS } from '../config.js';
import { getUser, pool } from '../db/index.js';
import { NFT_TYPES } from '../data/constants.js';

const awaiting = new Map(); // adminId -> { mode: 'nft_single'|'nft_batch' }

function isAdmin(id){ return ADMIN_IDS.includes(id); }

function adminMenuKb(){
  return { inline_keyboard: [
    [{ text: '📊 Статистика', callback_data: 'admin:stats' }],
    [{ text: '➕ Добавить NFT', callback_data: 'admin:nft:add' }],
    [{ text: '📦 Массовое добавление NFT', callback_data: 'admin:nft:batch' }]
  ]};
}

async function getStats() {
  let totalUsers = 0;
  let starsSpent = '0';
  let starsEarned = '0';
  let depositsStr = '0';
  let wdStr = '0';
  let activeToday = 0;

  try { const r = await pool.query('select count(*)::int as c from users'); totalUsers = Number(r.rows[0]?.c||0); } catch {}
  try { const r = await pool.query("select coalesce(sum(case when amount<0 then -amount else 0 end),0)::bigint as s from star_ledger"); starsSpent = String(r.rows[0]?.s||0); } catch {}
  try { const r = await pool.query("select coalesce(sum(case when amount>0 then amount else 0 end),0)::bigint as s from star_ledger"); starsEarned = String(r.rows[0]?.s||0); } catch {}
  try { const r = await pool.query("select coalesce(sum(amount_stars),0)::bigint as s from payments where status='success' and type='deposit'"); depositsStr = String(r.rows[0]?.s||0); } catch {}
  try { const r = await pool.query("select coalesce(sum(total_stars),0)::bigint as s from withdrawals where status='completed'"); wdStr = String(r.rows[0]?.s||0); } catch {}
  try {
    const { rows } = await pool.query(`
      select count(distinct x.tg_id)::int as c from (
        select tg_id from users where created_at::date=now()::date or (last_dig_at is not null and last_dig_at::date=now()::date)
        union all select user_tg_id as tg_id from star_ledger where created_at::date=now()::date
        union all select user_tg_id as tg_id from payments where created_at::date=now()::date
        union all select user_tg_id as tg_id from ladder_games where created_at::date=now()::date
        union all select user_tg_id as tg_id from withdrawals where created_at::date=now()::date
      ) x`);
    activeToday = Number(rows[0]?.c||0);
  } catch {}

  let botNet = '0';
  try { botNet = (BigInt(depositsStr) - BigInt(wdStr)).toString(); } catch { botNet = '0'; }

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


    if (data === 'admin:stats') {
      try { await ctx.answerCbQuery('Открываю…'); } catch {}
      try {
        const s = await getStats();
        const text = `📊 Статистика\nПользователей всего: ${s.totalUsers}\nАктивных сегодня: ${s.activeToday}\nЗвёзды: потрачено ${s.starsSpent}, заработано ${s.starsEarned}\nЧистыми бот: ${s.botNet}`;
        try {
          await ctx.editMessageText(text, { reply_markup: adminMenuKb() });
        } catch {
          await ctx.reply(text, { reply_markup: adminMenuKb() });
        }
      } catch {
        try { await ctx.reply('Не удалось получить статистику'); } catch {}
      }
      return;
    }

    if (data === 'admin:nft:add') {
      awaiting.set(ctx.from.id, { mode: 'nft_single' });
      const typeList = Object.values(NFT_TYPES).join(' | ');
      await ctx.editMessageText(`Отправьте строку: Тип ; Ссылка\nТип: ${typeList}` , { reply_markup: adminMenuKb() });
      return ctx.answerCbQuery();
    }
    if (data === 'admin:nft:batch') {
      awaiting.set(ctx.from.id, { mode: 'nft_batch' });
      const allTypes = Object.values(NFT_TYPES);
      let lines = [];
      try {
        const { rows } = await pool.query("select type, count(*)::int as total, sum(case when assigned=false then 1 else 0 end)::int as free from nfts group by type");
        lines = allTypes.map(t => {
          const r = rows.find(x => x.type === t);
          const total = r?.total || 0;
          const free = r?.free || 0;
          return `- ${t} (свободно: ${free}, всего: ${total})`;
        });
      } catch {
        lines = allTypes.map(t => `- ${t}`);
      }
      const msg = ['Отправьте несколько строк, каждая: Тип ; Ссылка', 'Доступные типы:', ...lines].join('\n');
      await ctx.editMessageText(msg, { reply_markup: adminMenuKb() });
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
    const validTypes = new Set(Object.values(NFT_TYPES));
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
