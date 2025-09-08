export const RESOURCES = [
  { key: 'coal', name: 'Уголь', emoji: '🪨', priceMc: 1, chance: 0.5, min: 70, max: 400 },
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
  WITHDRAW: '🏦 Вывод'
};
