import { TELEGRAM_BOT_TOKEN } from './config.js';
import { initDb } from './db/index.js';
import { Telegraf } from 'telegraf';
import { registerStart } from './handlers/start.js';
import { registerProfile } from './handlers/profile.js';
import { registerMine } from './handlers/mine.js';
import { registerSell } from './handlers/sell.js';
import { registerShop } from './handlers/shop.js';
import { registerCases } from './handlers/cases.js';

async function main() {
  await initDb();
  const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

  registerStart(bot);
  registerProfile(bot);
  registerMine(bot);
  registerSell(bot);
  registerShop(bot);
  registerCases(bot);

  await bot.launch();
  console.log('Mines Stars bot launched');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
