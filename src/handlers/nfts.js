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
      const { getOwnedNft } = await import('../db/index.js');
      const nft = await getOwnedNft(user.tg_id, id);
      if (!nft) { await ctx.answerCbQuery('NFT не найдено', { show_alert: true }); return; }
      const req = await createNftWithdrawal(user.tg_id, id);
      if (!req) { await ctx.answerCbQuery('Не удалось создать заявку', { show_alert: true }); return; }
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
          // finalize: remove ownership and reservation
          await ctx.telegram.editMessageText(cur.admin_msg_chat_id || ctx.chat.id, cur.admin_msg_message_id || ctx.callbackQuery.message.message_id, undefined, `✅ Выполнена заявка NFT #${id}` ).catch(()=>{});
          await updateNftWithdrawal(id, { status: 'completed', reviewed_by_tg_id: ctx.from.id, reviewed_at: new Date().toISOString() });
          // reflect in NFT table
          await ctx.telegram.answerCbQuery().catch(()=>{});
          const { pool } = await import('../db/index.js');
          await pool.query("update nfts set assigned=false, assigned_to_tg_id=null, assigned_at=null, reserved=false, reserved_by_tg_id=null, reserved_at=null where id=$1", [cur.nft_id]);
          try { await ctx.telegram.sendMessage(ADMIN_DONE_CHAT, `✅ Выполнена заявка NFT #${id}`); } catch {}
          try { await ctx.telegram.sendMessage(cur.user_tg_id, `✅ Ваша заявка NFT #${id} выполнена.`); } catch {}
        });
        return;
      }

      if (action === 'reject') {
        // ask return or not via inline options
        await ctx.editMessageText(`Отклонить з��явку NFT #${id}. Вернуть NFT?`, {
          reply_markup: { inline_keyboard: [
            [{ text: 'Вернуть', callback_data: `nftadmin:rejopt:${id}:yes` }],
            [{ text: 'Не возвращать', callback_data: `nftadmin:rejopt:${id}:no` }]
          ] }
        });
        return ctx.answerCbQuery();
      }
    }
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data || '';
    if (!data.startsWith('nftadmin:rejopt:')) return next();
    const [_, __, idStr, choice] = data.split(':');
    const id = Number(idStr);
    awaitingNftRejectReason.set(ctx.from.id, { id, choice });
    await ctx.editMessageText('Укажите причину отклонения сообщением:');
    return ctx.answerCbQuery();
  });

  bot.on('text', async (ctx, next) => {
    const p = awaitingNftRejectReason.get(ctx.from.id);
    if (!p) return next();
    const reason = (ctx.message.text||'').trim();
    const cur = await getNftWithdrawalById(p.id);
    if (!cur || cur.status !== 'pending') { awaitingNftRejectReason.delete(ctx.from.id); return; }
    await updateNftWithdrawal(p.id, { status: 'rejected', reviewed_by_tg_id: ctx.from.id, reviewed_at: new Date().toISOString(), reason });
    const { pool } = await import('../db/index.js');
    if (p.choice === 'yes') {
      // return NFT to user: unreserve
      await pool.query('update nfts set reserved=false, reserved_by_tg_id=null, reserved_at=null where id=$1', [cur.nft_id]);
    } else {
      // do not return: remove ownership
      await pool.query('update nfts set assigned=false, assigned_to_tg_id=null, assigned_at=null, reserved=false, reserved_by_tg_id=null, reserved_at=null where id=$1', [cur.nft_id]);
    }
    const adminText = `⛔ Отклонена заявка NFT #${p.id}\nВозврат: ${p.choice === 'yes' ? 'да' : 'нет'}\nПричина: ${reason}`;
    try { await ctx.telegram.editMessageText(cur.admin_msg_chat_id || ctx.chat.id, cur.admin_msg_message_id || ctx.message.message_id, undefined, adminText); } catch {}
    try { await ctx.telegram.sendMessage(cur.user_tg_id, `⛔ Ваша заявка NFT #${p.id} отклонена. ${p.choice==='yes'?'NFT возвращён.':'Без возврата.'}\nПричина: ${reason}`); } catch {}
    awaitingNftRejectReason.delete(ctx.from.id);
  });
}
