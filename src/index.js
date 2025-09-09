import { TELEGRAM_BOT_TOKEN } from './config.js';
import { initDb } from './db/index.js';
import { Telegraf } from 'telegraf';
import { registerStart } from './handlers/start.js';
import { registerProfile } from './handlers/profile.js';
import { registerMine } from './handlers/mine.js';
import { registerSell } from './handlers/sell.js';
import { registerShop } from './handlers/shop.js';
import { registerCases } from './handlers/cases.js';
import { registerGames } from './handlers/games.js';
import { registerPayments } from './handlers/payments.js';
import { registerWithdraw } from './handlers/withdraw.js';
import { registerNfts } from './handlers/nfts.js';
import { registerAdmin } from './handlers/admin.js';
import { pool } from './db/index.js';

async function main() {
  await initDb();
  const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

  registerStart(bot);
  registerProfile(bot);
  registerMine(bot);
  registerSell(bot);
  registerShop(bot);
  // last_seen middleware
  bot.use(async (ctx, next) => {
    if (ctx.from?.id) {
      try { await pool.query('update users set last_seen_at=now() where tg_id=$1', [ctx.from.id]); } catch {}
    }
    return next();
  });

  registerCases(bot);
  registerGames(bot);
  registerPayments(bot);
  registerWithdraw(bot);
  registerNfts(bot);
  registerAdmin(bot);

  await bot.launch();
  console.log('Mines Stars bot launched');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
