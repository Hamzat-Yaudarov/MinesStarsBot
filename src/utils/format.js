import { MC_PER_STAR, RESOURCES } from '../data/constants.js';

export function humanMs(ms) {
  const s = Math.floor(ms/1000);
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const ss = s%60;
  if (h>0) return `${h} ч ${m} м`;
  if (m>0) return `${m} м ${ss} с`;
  return `${ss} с`;
}

export function formatBalances(user) {
  const stars = Number(user.balance_stars||0);
  const mc = Number(user.balance_mc||0);
  return `⭐ ${stars} STARS\n🪙 ${mc} MC`;
}

export function invSummary(inv) {
  const lines = RESOURCES.map(r => `${r.emoji} ${r.name}: ${inv[r.key]||0}`);
  return lines.join('\n');
}

export function calcTotalMcFromDrops(drops) {
  let total = 0;
  for (const [k, qty] of Object.entries(drops)) {
    const r = RESOURCES.find(x=>x.key===k);
    if (r) total += qty * r.priceMc;
  }
  return total;
}

export function resourceLabel(key) {
  const r = RESOURCES.find(x=>x.key===key);
  return r ? `${r.emoji} ${r.name}` : key;
}
