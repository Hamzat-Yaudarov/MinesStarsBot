import dayjs from 'dayjs';
import { pool } from '../database.js';
import { InlineKeyboard } from 'grammy';
import { typingFrames, sleep, Resource, fmtCoins } from '../utils/textUtils.js';

const DROP_TABLE = {
  0: {
    coal: { chance: 0.60, min: 70, max: 400 },
    copper: { chance: 0.25, min: 30, max: 65 },
    iron: { chance: 0.10, min: 12, max: 20 },
    gold: { chance: 0.0416, min: 5, max: 7 },
    diamond: { chance: 0.0116, min: 1, max: 2 }
  },
  1: { coal: { chance: 0.60, min: 85, max: 480 }, copper: { chance: 0.25, min: 36, max: 78 }, iron: { chance: 0.10, min: 14, max: 24 }, gold: { chance: 0.0416, min: 6, max: 9 }, diamond: { chance: 0.0116, min: 1, max: 3 } },
  2: { coal: { chance: 0.60, min: 100, max: 560 }, copper: { chance: 0.25, min: 43, max: 91 }, iron: { chance: 0.10, min: 17, max: 28 }, gold: { chance: 0.0416, min: 7, max: 11 }, diamond: { chance: 0.0116, min: 2, max: 3 } },
  3: { coal: { chance: 0.60, min: 120, max: 650 }, copper: { chance: 0.25, min: 52, max: 105 }, iron: { chance: 0.10, min: 20, max: 33 }, gold: { chance: 0.0416, min: 9, max: 13 }, diamond: { chance: 0.0116, min: 2, max: 4 } },
  4: { coal: { chance: 0.60, min: 145, max: 750 }, copper: { chance: 0.25, min: 63, max: 120 }, iron: { chance: 0.10, min: 24, max: 39 }, gold: { chance: 0.0416, min: 11, max: 16 }, diamond: { chance: 0.0116, min: 3, max: 4 } },
  5: { coal: { chance: 0.60, min: 170, max: 850 }, copper: { chance: 0.25, min: 76, max: 136 }, iron: { chance: 0.10, min: 29, max: 46 }, gold: { chance: 0.0416, min: 13, max: 19 }, diamond: { chance: 0.0116, min: 3, max: 5 } },
  6: { coal: { chance: 0.60, min: 195, max: 960 }, copper: { chance: 0.25, min: 90, max: 150 }, iron: { chance: 0.10, min: 34, max: 54 }, gold: { chance: 0.0416, min: 15, max: 22 }, diamond: { chance: 0.0116, min: 4, max: 6 } },
  7: { coal: { chance: 0.60, min: 220, max: 1070 }, copper: { chance: 0.25, min: 105, max: 165 }, iron: { chance: 0.10, min: 40, max: 62 }, gold: { chance: 0.0416, min: 18, max: 25 }, diamond: { chance: 0.0116, min: 4, max: 7 } },
  8: { coal: { chance: 0.60, min: 245, max: 1180 }, copper: { chance: 0.25, min: 120, max: 180 }, iron: { chance: 0.10, min: 47, max: 71 }, gold: { chance: 0.0416, min: 21, max: 29 }, diamond: { chance: 0.0116, min: 5, max: 8 } },
  9: { coal: { chance: 0.60, min: 270, max: 1290 }, copper: { chance: 0.25, min: 135, max: 195 }, iron: { chance: 0.10, min: 54, max: 80 }, gold: { chance: 0.0416, min: 25, max: 33 }, diamond: { chance: 0.0116, min: 6, max: 9 } },
  10: { coal: { chance: 0.60, min: 300, max: 1400 }, copper: { chance: 0.25, min: 150, max: 210 }, iron: { chance: 0.10, min: 62, max: 90 }, gold: { chance: 0.0416, min: 29, max: 38 }, diamond: { chance: 0.0116, min: 7, max: 10 } }
};

export function registerMining(bot) {
  bot.hears('⛏️ Шахта', async (ctx) => openMine(ctx));
  bot.callbackQuery('mine:open', async (ctx) => openMine(ctx));
  bot.callbackQuery('mine:dig', async (ctx) => doMine(ctx));
  bot.callbackQuery('mine:sellall', async (ctx) => sellAll(ctx));
  bot.callbackQuery('sell:menu', async (ctx) => sellMenu(ctx));
  bot.callbackQuery(/sell:res:(\w+):all/, async (ctx) => sellResourceAll(ctx));
  bot.callbackQuery('noop', async (ctx) => { await ctx.answerCallbackQuery(); });
}

async function openMine(ctx) {
  const userId = ctx.from.id;
  const u = await pool.query('select pickaxe_level, last_mine_at from users where id=$1', [userId]);
  const user = u.rows[0];
  const cdMin = user?.last_mine_at ? Math.max(0, dayjs(user.last_mine_at).add(3,'hour').diff(dayjs(), 'minute')) : 0;
  const kb = new InlineKeyboard()
    .text(cdMin>0 ? `⏳ Через ${Math.floor(cdMin/60)}ч ${cdMin%60}м` : '⛏️ Копать', cdMin>0 ? 'noop' : 'mine:dig')
    .row()
    .text('💰 Продать', 'sell:menu');
  const text = `Шахта\nКирка: Уровень ${user?.pickaxe_level||0}\nКопать можно раз в 3 часа.`;
  if (ctx.callbackQuery) return ctx.editMessageText(text, { reply_markup: kb });
  return ctx.reply(text, { reply_markup: kb });
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function doMine(ctx) {
  const userId = ctx.from.id;
  const u = await pool.query('select pickaxe_level, last_mine_at from users where id=$1', [userId]);
  const lvl = u.rows[0]?.pickaxe_level || 0;
  const last = u.rows[0]?.last_mine_at ? dayjs(u.rows[0].last_mine_at) : null;
  if (last && dayjs().isBefore(last.add(3, 'hour'))) {
    const left = last.add(3,'hour').diff(dayjs(), 'minute');
    return ctx.answerCallbackQuery({ text: `Рано! Осталось ${Math.floor(left/60)}ч ${left%60}м`, show_alert: true });
  }

  // Animation
  const frames = typingFrames('Копаю ');
  const msg = await ctx.editMessageText(frames[0]);
  for (let i=1;i<frames.length;i++) { await sleep(300); await ctx.api.editMessageText(ctx.chat.id, msg.message_id, frames[i]); }

  // RNG
  const table = DROP_TABLE[Math.max(0, Math.min(10, lvl))];
  const drops = { coal:0, copper:0, iron:0, gold:0, diamond:0 };
  for (const key of Object.keys(table)) {
    const roll = Math.random();
    if (roll < table[key].chance) {
      drops[key] = randInt(table[key].min, table[key].max);
    }
  }

  // Apply
  await pool.query('update users set last_mine_at = now(), updated_at = now() where id=$1', [userId]);
  await pool.query(`update user_resources set
    coal = coal + $2, copper = copper + $3, iron = iron + $4, gold = gold + $5, diamond = diamond + $6
    where user_id=$1`, [userId, drops.coal, drops.copper, drops.iron, drops.gold, drops.diamond]);

  const summary = [`Результат копа:`,
    drops.coal? `${Resource.coal.emoji} Уголь: +${drops.coal}`: null,
    drops.copper? `${Resource.copper.emoji} Медь: +${drops.copper}`: null,
    drops.iron? `${Resource.iron.emoji} Железо: +${drops.iron}`: null,
    drops.gold? `${Resource.gold.emoji} Золото: +${drops.gold}`: null,
    drops.diamond? `${Resource.diamond.emoji} Алмазы: +${drops.diamond}`: null
  ].filter(Boolean).join('\n');

  const kb = new InlineKeyboard().text('💰 Продать', 'sell:menu');
  await ctx.editMessageText(summary || 'Ничего не найдено на этот раз.', { reply_markup: kb });
}

async function sellMenu(ctx) {
  const userId = ctx.from.id;
  const r = await pool.query('select * from user_resources where user_id=$1', [userId]);
  const res = r.rows[0];
  const kb = new InlineKeyboard();
  kb.text(`${Resource.coal.emoji} Уголь: ${res.coal} ➜ Продать всё`, `sell:res:coal:all`).row();
  kb.text(`${Resource.copper.emoji} Медь: ${res.copper} ➜ Продать всё`, `sell:res:copper:all`).row();
  kb.text(`${Resource.iron.emoji} Железо: ${res.iron} ➜ Продать всё`, `sell:res:iron:all`).row();
  kb.text(`${Resource.gold.emoji} Золото: ${res.gold} ➜ Продать всё`, `sell:res:gold:all`).row();
  kb.text(`${Resource.diamond.emoji} Алмазы: ${res.diamond} ➜ Продать всё`, `sell:res:diamond:all`).row();
  kb.text('🔙 Назад', 'mine:open');
  await ctx.editMessageText('Продажа ресурсов — выберите ресурс:', { reply_markup: kb });
}

async function sellResourceAll(ctx) {
  const data = ctx.callbackQuery.data; // sell:res:coal:all
  const parts = data.split(':');
  const resource = parts[2];
  const userId = ctx.from.id;
  const r = await pool.query('select * from user_resources where user_id=$1', [userId]);
  const res = r.rows[0];
  const amount = res[resource] || 0;
  if (!amount || amount <= 0) return ctx.answerCallbackQuery({ text: 'Нет такого ресурса для продажи', show_alert: true });
  const price = Resource[resource].price;
  const total = amount * price;
  await pool.query(`update users set coins = coins + $2 where id=$1`, [userId, total]);
  await pool.query(`update user_resources set ${resource} = 0 where user_id=$1`, [userId]);
  await pool.query('insert into transactions(user_id, kind, amount_coins, meta) values ($1,$2,$3,$4)', [userId, 'sell_resource', total, JSON.stringify({ resource, amount })]);
  await ctx.editMessageText(`Продано ${amount} ${resource} на ${fmtCoins(total)}.`);
}

async function sellAll(ctx) {
  const userId = ctx.from.id;
  const r = await pool.query('select * from user_resources where user_id=$1', [userId]);
  const res = r.rows[0];
  const price = Resource;
  const total = res.coal*price.coal.price + res.copper*price.copper.price + res.iron*price.iron.price + res.gold*price.gold.price + res.diamond*price.diamond.price;
  if (total <= 0) return ctx.answerCallbackQuery({ text: 'Нет ресурсов для продажи', show_alert: true });
  await pool.query('update users set coins = coins + $2 where id=$1', [userId, total]);
  await pool.query('update user_resources set coal=0, copper=0, iron=0, gold=0, diamond=0 where user_id=$1', [userId]);
  await pool.query('insert into transactions(user_id, kind, amount_coins, meta) values ($1,$2,$3,$4)', [userId, 'sell_all', total, JSON.stringify(res)]);
  await ctx.editMessageText(`Продано все ресурсы на ${fmtCoins(total)}.`);
}
