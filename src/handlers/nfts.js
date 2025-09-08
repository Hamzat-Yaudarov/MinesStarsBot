import { getUser, getUserNfts, createNftWithdrawal, getNftWithdrawalById, updateNftWithdrawal } from '../db/index.js';
import { ADMIN_NFT_REVIEW_CHAT, ADMIN_DONE_CHAT } from '../config.js';

const awaitingNftRejectReason = new Map();

export function registerNfts(bot) {
  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('profile:nfts') && !data.startsWith('nft:') && !data.startsWith('nftadmin:')) return next();
    const user = await getUser(ctx.from.id);

    if (data === 'profile:nfts') {
      const list = await getUserNfts(user.tg_id);
      if (!list.length) { await ctx.answerCbQuery('NFT не найдено', { show_alert: true }); return; }
      const lines = list.map(n => `#${n.id}: ${n.type} — ${n.tg_link}`);
      await ctx.editMessageText(['Ваши NFT:', ...lines].join('\n'), {
        reply_markup: { inline_keyboard: [[{ text: '📤 Вывести NFT', callback_data: 'nft:withdraw' }]] }
      });
      return ctx.answerCbQuery();
    }

    if (data === 'nft:withdraw') {
      const list = await getUserNfts(user.tg_id);
      if (!list.length) { await ctx.answerCbQuery('NFT не найдено', { show_alert: true }); return; }
      const rows = list.map(n => [{ text: `#${n.id} (${n.type})`, callback_data: `nft:withdraw:${n.id}` }]);
      await ctx.editMessageText('Выберите NFT для вывода:', { reply_markup: { inline_keyboard: rows } });
      return ctx.answerCbQuery();
    }

    if (data.startsWith('nft:withdraw:')) {
      const id = Number(data.split(':')[2]);
      const list = await getUserNfts(user.tg_id);
      const nft = list.find(n => n.id === id);
      if (!nft) { await ctx.answerCbQuery('NFT не найдено', { show_alert: true }); return; }
      const req = await createNftWithdrawal(user.tg_id, id);
      const text = `Заявка на вывод NFT #${req.id}\nПользователь: @${user.username || '-'} (ID ${user.tg_id})\nNFT: #${nft.id} ${nft.type}\nСсылка: ${nft.tg_link}`;
      try {
        const m = await ctx.telegram.sendMessage(ADMIN_NFT_REVIEW_CHAT, text, {
          reply_markup: { inline_keyboard: [[
            { text: '✅ Выполнено', callback_data: `nftadmin:approve:${req.id}` },
            { text: '⛔ Отклонить', callback_data: `nftadmin:reject:${req.id}` }
          ]]} 
        });
        await updateNftWithdrawal(req.id, { admin_msg_chat_id: ADMIN_NFT_REVIEW_CHAT, admin_msg_message_id: m.message_id });
      } catch {}
      await ctx.editMessageText(`✅ Заявка #${req.id} на вывод NFT отправлена админам.`);
      return ctx.answerCbQuery('Отправлено');
    }

    // Admin flows
    if (data.startsWith('nftadmin:')) {
      const parts = data.split(':');
      const action = parts[1];
      const id = Number(parts[2]);
      const req = await getNftWithdrawalById(id);
      if (!req) { await ctx.answerCbQuery('Заявка не найдена'); return; }

      if (action === 'approve') {
        const { withLock } = await import('../utils/locks.js');
        await withLock('admin', `nft:${id}`, async () => {
          const cur = await getNftWithdrawalById(id);
          if (!cur || cur.status !== 'pending') { await ctx.answerCbQuery('Заявка уже обработана'); return; }
          await updateNftWithdrawal(id, { status: 'completed', reviewed_by_tg_id: ctx.from.id, reviewed_at: new Date().toISOString() });
          const doneText = `✅ Выполнена заявка NFT #${id}`;
          try { await ctx.telegram.editMessageText(cur.admin_msg_chat_id || ctx.chat.id, cur.admin_msg_message_id || ctx.callbackQuery.message.message_id, undefined, doneText); } catch {}
          try { await ctx.telegram.sendMessage(ADMIN_DONE_CHAT, doneText); } catch {}
          try { await ctx.telegram.sendMessage(cur.user_tg_id, `✅ Ваша заявка NFT #${id} выполнена.`); } catch {}
          await ctx.answerCbQuery('Готово');
        });
        return;
      }

      if (action === 'reject') {
        awaitingNftRejectReason.set(ctx.from.id, { id });
        await ctx.editMessageText(`Укажите причину отклонения заявки NFT #${id} сообщением:`);
        return ctx.answerCbQuery();
      }
    }
  });

  bot.on('text', async (ctx, next) => {
    const p = awaitingNftRejectReason.get(ctx.from.id);
    if (!p) return next();
    const reason = (ctx.message.text||'').trim();
    const cur = await getNftWithdrawalById(p.id);
    if (!cur || cur.status !== 'pending') { awaitingNftRejectReason.delete(ctx.from.id); return; }
    await updateNftWithdrawal(p.id, { status: 'rejected', reviewed_by_tg_id: ctx.from.id, reviewed_at: new Date().toISOString(), reason });
    const adminText = `⛔ Отклонена заявка NFT #${p.id}\nПричина: ${reason}`;
    try { await ctx.telegram.editMessageText(cur.admin_msg_chat_id || ctx.chat.id, cur.admin_msg_message_id || ctx.message.message_id, undefined, adminText); } catch {}
    try { await ctx.telegram.sendMessage(cur.user_tg_id, `⛔ Ваша заявка NFT #${p.id} отклонена. Причина: ${reason}`); } catch {}
    awaitingNftRejectReason.delete(ctx.from.id);
  });
}
