export function weightedChoice(entries) {
  // entries: Array<[value, weight]>
  const total = entries.reduce((s, [,w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of entries) {
    if ((r -= w) <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
