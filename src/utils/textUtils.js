export function coins(n) { return Number(n) || 0; }
export function stars(n) { return Number(n) || 0; }
export function fmtCoins(n) { return `${coins(n).toLocaleString('ru-RU')} MC`; }
export function fmtStars(n) { return `${stars(n).toLocaleString('ru-RU')} ⭐️`; }

export const MAIN_MENU = {
  reply_markup: {
    keyboard: [
      [{ text: '🧑‍🚀 Профиль' }, { text: '⛏️ Шахта' }],
      [{ text: '🛒 Магазин' }, { text: '🎁 Кейсы' }],
      [{ text: '🎮 Игры' }, { text: '💳 Пополнить' }, { text: '💸 Вывод' }]
    ],
    resize_keyboard: true
  }
};

export const Resource = {
  coal: { name: 'Уголь', price: 1, emoji: '🪨' },
  copper: { name: 'Медь', price: 3, emoji: '🥉' },
  iron: { name: 'Железо', price: 10, emoji: '⛓️' },
  gold: { name: 'Золото', price: 30, emoji: '🥇' },
  diamond: { name: 'Алмаз', price: 100, emoji: '💎' }
};

export const PICKAXE_PRICES = [
  0,
  10000, 50000, 100000, 150000, 200000,
  250000, 300000, 350000, 400000, 500000
];

export const COINS_PER_STAR = 200; // 200 MC = 1 STAR

export function typingFrames(prefix = '') {
  const frames = ['⛏️', '⛏️.', '⛏️..', '⛏️...', '⛏️..', '⛏️.'];
  return frames.map(f => `${prefix}${f}`);
}

export function caseSpinFrames(items) {
  const base = items.map(i => `${i.emoji || '⭐️'} ${i.label}`).join('  |  ');
  const frames = [];
  for (let i = 0; i < 12; i++) {
    const shift = i % items.length;
    const row = items.slice(shift).concat(items.slice(0, shift));
    frames.push(row.map(i => `${i.emoji || '⭐️'} ${i.label}`).join('  |  '));
  }
  return [base, ...frames];
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
