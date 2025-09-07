import { MAIN_MENU } from '../utils/textUtils.js';
import { pool } from '../database.js';

export function registerStart(bot) {
  bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || null;
    const payload = ctx.match; // deep-link payload

    await pool.query('insert into users(id, username) values ($1,$2) on conflict (id) do update set username=excluded.username', [userId, username]);
    await pool.query('insert into user_resources(user_id) values ($1) on conflict (user_id) do nothing', [userId]);

    if (payload && /^ref_\d+$/.test(payload)) {
      const refId = BigInt(payload.replace('ref_', ''));
      if (refId !== BigInt(userId)) {
        const res = await pool.query('select referred_by from users where id=$1', [userId]);
        if (!res.rows[0]?.referred_by) {
          await pool.query('update users set referred_by=$2 where id=$1', [userId, refId.toString()]);
          await pool.query('update users set referrals = referrals + 1 where id=$1', [refId.toString()]);
          try { await ctx.api.sendMessage(Number(refId), `Новый реферал: @${username || userId}`); } catch (_) {}
        }
      }
    }

    const text = `Добро пожаловать в Mines Stars!\n\n• Добывай ресурсы в шахте, продавай их и улучшай кирку.\n• Пополняй баланс Stars (XTR) и выводи с комиссией 10%.\n • Играй в мини-игры и открывай кейсы.\n\nОткрывай меню кнопками ниже.`;
    await ctx.reply(text, MAIN_MENU);
  });
}
