import { ADMIN_ID } from '../config.js';
import { setSetting } from '../db/index.js';

export function registerAdmin(bot) {
  bot.command('bind_nft_review', async (ctx) => {
    if (ADMIN_ID && ctx.from.id !== ADMIN_ID) return;
    await setSetting('nft_review_chat', String(ctx.chat.id));
    await ctx.reply(`OK, nft_review_chat = ${ctx.chat.id}`);
  });

  bot.command('bind_done_chat', async (ctx) => {
    if (ADMIN_ID && ctx.from.id !== ADMIN_ID) return;
    await setSetting('done_chat', String(ctx.chat.id));
    await ctx.reply(`OK, done_chat = ${ctx.chat.id}`);
  });
}
