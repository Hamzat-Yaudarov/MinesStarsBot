export const RESOURCES = [
  { key: 'coal', name: 'Уголь', emoji: '⬛', priceMc: 1, chance: 0.5, min: 70, max: 400 },
  { key: 'copper', name: 'Медь', emoji: '🟫', priceMc: 2, chance: 0.2, min: 30, max: 65 },
  { key: 'iron', name: 'Железо', emoji: '⚙️', priceMc: 4, chance: 0.15, min: 12, max: 20 },
  { key: 'gold', name: 'Золото', emoji: '🟨', priceMc: 5, chance: 0.08, min: 5, max: 7 },
  { key: 'diamond', name: 'Алмаз', emoji: '💎', priceMc: 7, chance: 0.07, min: 1, max: 2 }
];

export const PICKAXE_LIMIT_MC = {
  1: 350,
  2: 450,
  3: 700,
  4: 900,
  5: 1150,
  6: 1400,
  7: 1700,
  8: 2250,
  9: 2400,
  10: 2750
};

export const PICKAXE_LEVEL_COST_MC = {
  1: 10000,
  2: 50000,
  3: 100000,
  4: 150000,
  5: 200000,
  6: 250000,
  7: 300000,
  8: 350000,
  9: 400000,
  10: 500000
};

export const DIG_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours
export const MC_PER_STAR = 200; // 200 MC = 1 STAR

export const MAIN_MENU = {
  PROFILE: '📇 Профиль',
  MINE: '⛏️ Шахта',
  SELL: '💰 Продажа',
  SHOP: '🛒 Магазин',
  CASES: '🎁 Кейсы',
  GAMES: '🎲 Игры',
  DEPOSIT: '💳 Пополнение',
  WITHDRAW: '🏦 Вывод'
};

export const LADDER_LEVELS = 7;
export const LADDER_CHOICES = 8;
export const LADDER_MULTIPLIERS = [1.14, 1.28, 1.42, 1.56, 1.70, 1.84, 1.98]; // index: level-1
export const LADDER_ALLOWED_BETS_STARS = [10, 15, 25, 50, 150, 250, 300, 400, 500];
