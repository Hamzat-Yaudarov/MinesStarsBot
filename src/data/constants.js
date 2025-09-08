export const RESOURCES = [
  { key: 'coal', name: 'Уголь', emoji: '⬛', priceMc: 1, chance: 1, min: 70, max: 400 },
  { key: 'copper', name: 'Медь', emoji: '🟫', priceMc: 2, chance: 0.50, min: 30, max: 65 },
  { key: 'iron', name: 'Железо', emoji: '⚙️', priceMc: 4, chance: 0.35, min: 12, max: 20 },
  { key: 'gold', name: 'Золото', emoji: '🟨', priceMc: 5, chance: 0.14, min: 5, max: 7 },
  { key: 'diamond', name: 'Алмаз', emoji: '💎', priceMc: 7, chance: 0.08, min: 1, max: 2 }
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

export const MINING_RANGES = {
  1: { coal: { min: 85, max: 480 }, copper: { min: 36, max: 78 }, iron: { min: 14, max: 24 }, gold: { min: 6, max: 9 }, diamond: { min: 1, max: 3 } },
  2: { coal: { min: 182, max: 582 }, copper: { min: 49, max: 93 }, iron: { min: 17, max: 30 }, gold: { min: 8, max: 11 }, diamond: { min: 2, max: 4 } },
  3: { coal: { min: 279, max: 684 }, copper: { min: 63, max: 107 }, iron: { min: 21, max: 37 }, gold: { min: 10, max: 14 }, diamond: { min: 2, max: 5 } },
  4: { coal: { min: 377, max: 787 }, copper: { min: 76, max: 122 }, iron: { min: 25, max: 44 }, gold: { min: 11, max: 17 }, diamond: { min: 3, max: 5 } },
  5: { coal: { min: 474, max: 889 }, copper: { min: 89, max: 137 }, iron: { min: 29, max: 51 }, gold: { min: 13, max: 20 }, diamond: { min: 3, max: 6 } },
  6: { coal: { min: 571, max: 991 }, copper: { min: 103, max: 151 }, iron: { min: 33, max: 59 }, gold: { min: 14, max: 23 }, diamond: { min: 4, max: 7 } },
  7: { coal: { min: 668, max: 1093 }, copper: { min: 116, max: 166 }, iron: { min: 37, max: 66 }, gold: { min: 16, max: 26 }, diamond: { min: 4, max: 8 } },
  8: { coal: { min: 766, max: 1196 }, copper: { min: 129, max: 180 }, iron: { min: 41, max: 74 }, gold: { min: 17, max: 29 }, diamond: { min: 5, max: 8 } },
  9: { coal: { min: 863, max: 1298 }, copper: { min: 143, max: 195 }, iron: { min: 47, max: 82 }, gold: { min: 19, max: 33 }, diamond: { min: 5, max: 9 } },
  10: { coal: { min: 960, max: 1400 }, copper: { min: 156, max: 210 }, iron: { min: 48, max: 90 }, gold: { min: 18, max: 38 }, diamond: { min: 6, max: 10 } }
};

export const CHANCE_INCREASE_PER_LEVEL = 0.025;
