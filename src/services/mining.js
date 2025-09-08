import { RESOURCES, PICKAXE_LIMIT_MC } from '../data/constants.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getCapForLevel(level) {
  return PICKAXE_LIMIT_MC[level] || 0;
}

export function generateDrops(level) {
  const cap = getCapForLevel(level);
  const drops = {};
  let usedMc = 0;
  for (const r of RESOURCES) {
    if (Math.random() < r.chance) {
      let qty = randInt(r.min, r.max);
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
