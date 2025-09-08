import { RESOURCES, PICKAXE_LIMIT_MC, MINING_RANGES, CHANCE_INCREASE_PER_LEVEL } from '../data/constants.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getCapForLevel(level) {
  return PICKAXE_LIMIT_MC[level] || 0;
}

export function generateDrops(level) {
  const lvl = Math.max(1, Math.min(10, Number(level) || 1));
  const cap = getCapForLevel(lvl);
  const drops = {};
  let usedMc = 0;
  for (const r of RESOURCES) {
    const baseChance = Number(r.chance) || 0;
    const chance = Math.min(0.99, baseChance + (lvl - 1) * CHANCE_INCREASE_PER_LEVEL);
    const range = MINING_RANGES[lvl]?.[r.key] || { min: r.min, max: r.max };
    if (Math.random() < chance) {
      let qty = randInt(range.min, range.max);
      const value = qty * r.priceMc;
      const remain = cap - usedMc;
      if (remain <= 0) { qty = 0; }
      else if (value > remain) {
        qty = Math.floor(remain / r.priceMc);
      }
      if (qty > 0) {
        drops[r.key] = qty;
        usedMc += qty * r.priceMc;
      }
    }
  }
  return { drops, usedMc, cap };
}
