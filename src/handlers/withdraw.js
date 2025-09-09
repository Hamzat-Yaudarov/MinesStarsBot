import { MAIN_MENU } from '../data/constants.js';
import { getUser, updateUser, createWithdrawal, listWithdrawals, getWithdrawalById, updateWithdrawal } from '../db/index.js';
import { ADMIN_REVIEW_CHAT, ADMIN_DONE_CHAT } from '../config.js';

const awaitingAdminReason = new Map(); // adminId -> { id, refund }

function withdrawKeyboard() {
  const opts = [100, 250, 500, 1000, 2500, 10000];
  const rows = [];
  for (let i = 0; i < opts.length; i += 3) rows.push(opts.slice(i,i+3).map(v => ({ text: `${v}⭐`, callback_data: `wd:amt:${v}` })));
  rows.push([{ text: '📜 Мои заявки', callback_data: 'wd:list' }]);
  return { inline_keyboard: rows };
}

function adminButtons(id) {
  return { inline_keyboard: [[
    { text: '✅ Выполнено', callback_data: `wdadmin:approve:${id}` },
    { text: '⛔ Отклонить', callback_data: `wdadmin:reject:${id}` }
  ]] };
}

function formatUserInfo(u) {
  return `ID: ${u.tg_id}\nUsername: @${u.username || '-'}\nИмя: ${u.first_name || '-'}\nБаланс: ${Number(u.balance_stars||0)}⭐ / ${Number(u.balance_mc||0)} MC`;
}

export function registerWithdraw(bot) {
  bot.hears(MAIN_MENU.WITHDRAW, async (ctx) => {
    await ctx.reply('Выберите сумму вывода (10% комиссия):', { reply_markup: withdrawKeyboard() });
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('wd:') && !data.startsWith('wdadmin:')) return next();

    // User flows
    if (data.startsWith('wd:')) {
      const user = await getUser(ctx.from.id);
      if (!user) { await ctx.answerCbQuery('Сначала /start'); return; }

      if (data === 'wd:list') {
        const last = await listWithdrawals(user.tg_id, 10);
        if (!last.length) { await ctx.editMessageText('Заявок нет'); return ctx.answerCbQuery(); }
        const lines = last.map(r => `#${r.id}: ${r.amount_stars}⭐ (комиссия ${r.fee_stars}⭐) — ${r.status}`);
        await ctx.editMessageText(lines.join('\n'));
        return ctx.answerCbQuery();
      }

      if (data.startsWith('wd:amt:')) {
        const amount = Number(data.split(':')[2]);
        const fee = Math.ceil(amount * 0.10);
        const total = amount + fee;
        const balance = Number(user.balance_stars||0);
        if (balance < total) { await ctx.answerCbQuery(`Нужно ${total}⭐ на балансе`); return; }
        await ctx.editMessageText(`Подтвердить вывод ${amount}⭐ (комиссия ${fee}⭐, всего спишется ${total}⭐)?`, {
          reply_markup: { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: `wd:confirm:${amount}` }], [{ text: '↩️ Назад', callback_data: 'wd:back' }]] }
        });
        return ctx.answerCbQuery();
      }

      if (data === 'wd:back') {
        await ctx.editMessageText('Выберите сумму вывода (10% комиссия):', { reply_markup: withdrawKeyboard() });
        return ctx.answerCbQuery();
      }

      if (data.startsWith('wd:confirm:')) {
        const { withLock, isLocked } = await import('../utils/locks.js');
        if (isLocked(ctx.from.id, 'withdraw')) { await ctx.answerCbQuery('Уже создаём заявку', { show_alert: true }); return; }
        await withLock(ctx.from.id, 'withdraw', async () => {
          const amount = Number(data.split(':')[2]);
          const fee = Math.ceil(amount * 0.10);
          const total = amount + fee;
          const balance = Number(user.balance_stars||0);
          if (balance < total) { await ctx.answerCbQuery('Недостаточно ⭐'); return; }
          await updateUser(user.tg_id, { balance_stars: balance - total });
          const w = await createWithdrawal(user.tg_id, amount, fee);
        const { addLedger } = await import('../db/index.js');
        await addLedger(user.tg_id, -total, 'withdraw_request');
        const info = formatUserInfo(user);
          const text = `Новая заявка на вывод #${w.id}\nПользователь:\n${info}\nСумма: ${amount}⭐\nКомиссия: ${fee}⭐\nСписано всего: ${total}⭐`;
          try {
            const m = await ctx.telegram.sendMessage(ADMIN_REVIEW_CHAT, text, { reply_markup: adminButtons(w.id) });
            await updateWithdrawal(w.id, { admin_msg_chat_id: ADMIN_REVIEW_CHAT, admin_msg_message_id: m.message_id });
          } catch (e) {}
          await ctx.editMessageText(`✅ Заявка #${w.id} создана: ${amount}⭐ (комиссия ${fee}⭐). Статус: pending.`);
          await ctx.answerCbQuery('Заявка создана');
        });
        return;
      }
    }

    // Admin flows
    if (data.startsWith('wdadmin:')) {
      const parts = data.split(':');
      const action = parts[1];
      const id = Number(parts[2]);
      const w = await getWithdrawalById(id);
      if (!w) { await ctx.answerCbQuery('Заявка не найдена'); return; }
      const user = await getUser(w.user_tg_id);

      if (action === 'approve') {
        const { withLock } = await import('../utils/locks.js');
        await withLock('admin', `wd:${id}`, async () => {
          const cur = await getWithdrawalById(id);
          if (!cur || cur.status !== 'pending') { await ctx.answerCbQuery('Заявка уже обработана'); return; }
          await updateWithdrawal(id, { status: 'completed', reviewed_by_tg_id: ctx.from.id, reviewed_at: new Date().toISOString(), refunded: false });
          const doneText = `✅ Выполнена заявка #${id}\nПользователь @${user?.username || '-'} (ID ${w.user_tg_id})\nСумма: ${w.amount_stars}⭐`;
          try { await ctx.telegram.editMessageText(w.admin_msg_chat_id || ctx.chat.id, w.admin_msg_message_id || ctx.callbackQuery.message.message_id, undefined, doneText); } catch {}
          try { await ctx.telegram.sendMessage(ADMIN_DONE_CHAT, doneText); } catch {}
          try { await ctx.telegram.sendMessage(w.user_tg_id, `✅ Ваша заявка #${id} выполнена.`); } catch {}
          await ctx.answerCbQuery('Готово');
        });
        return;
      }

      if (action === 'reject') {
        await ctx.editMessageText(`Отклонить заявку #${id}. Вернуть звёзды?`, {
          reply_markup: { inline_keyboard: [
            [{ text: 'Вернуть', callback_data: `wdadmin:rejopt:${id}:yes` }],
            [{ text: 'Не возвращать', callback_data: `wdadmin:rejopt:${id}:no` }]
          ] }
        });
        return ctx.answerCbQuery();
      }

      if (action === 'rejopt') {
        const choice = parts[3];
        const refund = choice === 'yes';
        const cur = await getWithdrawalById(id);
        if (!cur || cur.status !== 'pending') { await ctx.answerCbQuery('Заявка уже обработана'); return; }
        awaitingAdminReason.set(ctx.from.id, { id, refund });
        await ctx.editMessageText('Укажите причину отклонения сообщением:');
        return ctx.answerCbQuery();
      }
    }
  });

  bot.on('text', async (ctx, next) => {
    const pending = awaitingAdminReason.get(ctx.from.id);
    if (!pending) return next();
    const reason = (ctx.message.text || '').trim();
    const { id, refund } = pending;
    const w = await getWithdrawalById(id);
    if (!w) { awaitingAdminReason.delete(ctx.from.id); return; }
    const user = await getUser(w.user_tg_id);

    if (refund) {
      const u = await getUser(w.user_tg_id);
      if (u) await updateUser(u.tg_id, { balance_stars: Number(u.balance_stars||0) + Number(w.total_stars||0) });
    }

    await updateWithdrawal(id, { status: 'rejected', reviewed_by_tg_id: ctx.from.id, reviewed_at: new Date().toISOString(), refunded: !!refund, reason });

    const adminText = `⛔ Отклонена заявка #${id}\nПользователь @${user?.username || '-'} (ID ${w.user_tg_id})\nСумма: ${w.amount_stars}⭐\nВозврат: ${refund ? 'да' : 'нет'}\nПричина: ${reason}`;
    try { await ctx.telegram.editMessageText(w.admin_msg_chat_id || ctx.chat.id, w.admin_msg_message_id || ctx.message.message_id, undefined, adminText); } catch {}
    try { await ctx.telegram.sendMessage(w.user_tg_id, `⛔ Ваша заявка #${id} отклонена. ${refund ? 'Средства возвращены.' : 'Без возврата.'}\nПричина: ${reason}`); } catch {}

    awaitingAdminReason.delete(ctx.from.id);
  });
}
