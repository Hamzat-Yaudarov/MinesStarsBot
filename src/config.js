const must = (value, name) => {
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const TELEGRAM_BOT_TOKEN = must(process.env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN');
export const DATABASE_URL = must(process.env.DATABASE_URL, 'DATABASE_URL');
export const ADMIN_ID = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : null;
export const BOT_USERNAME = process.env.BOT_USERNAME || '';
export const ADMIN_REVIEW_CHAT = process.env.ADMIN_REVIEW_CHAT || '';
export const ADMIN_DONE_CHAT = process.env.ADMIN_DONE_CHAT || '';
