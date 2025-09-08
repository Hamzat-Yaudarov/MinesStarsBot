const locks = new Map();

export function isLocked(userId, key = 'global') {
  const k = `${userId}:${key}`;
  return locks.has(k);
}

export async function withLock(userId, key, fn) {
  const k = `${userId}:${key}`;
  if (locks.has(k)) throw new Error('locked');
  locks.set(k, true);
  try {
    return await fn();
  } finally {
    locks.delete(k);
  }
}
