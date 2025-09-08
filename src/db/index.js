import { Pool } from 'pg';
import { DATABASE_URL } from '../config.js';

export const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

export async function initDb() {
  await pool.query(`
    create table if not exists users (
      id bigserial primary key,
      tg_id bigint unique not null,
      username text,
      first_name text,
      referrer_tg_id bigint,
      pickaxe_level int not null default 0,
      balance_stars bigint not null default 0,
      balance_mc bigint not null default 0,
      last_dig_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table if not exists inventory (
      user_tg_id bigint not null references users(tg_id) on delete cascade,
      resource text not null,
      qty bigint not null default 0,
      primary key (user_tg_id, resource)
    );

    create index if not exists idx_users_tg_id on users(tg_id);

    create table if not exists payments (
      id bigserial primary key,
      user_tg_id bigint not null references users(tg_id) on delete cascade,
      amount_stars bigint not null,
      type text not null default 'deposit',
      status text not null default 'success',
      created_at timestamptz not null default now()
    );

    create table if not exists free_case_claims (
      user_tg_id bigint not null references users(tg_id) on delete cascade,
      claimed_on date not null,
      primary key (user_tg_id, claimed_on)
    );

    create table if not exists ladder_games (
      id bigserial primary key,
      user_tg_id bigint not null references users(tg_id) on delete cascade,
      bet_stars bigint not null,
      level int not null default 0, -- completed levels
      layout jsonb not null,
      status text not null default 'active',
      created_at timestamptz not null default now()
    );

    create table if not exists withdrawals (
      id bigserial primary key,
      user_tg_id bigint not null references users(tg_id) on delete cascade,
      amount_stars bigint not null,
      fee_stars bigint not null,
      total_stars bigint not null,
      status text not null default 'pending',
      created_at timestamptz not null default now()
    );

    alter table withdrawals add column if not exists reviewed_by_tg_id bigint;
    alter table withdrawals add column if not exists reviewed_at timestamptz;
    alter table withdrawals add column if not exists reason text;
    alter table withdrawals add column if not exists refunded boolean default false;
    alter table withdrawals add column if not exists admin_msg_chat_id text;
    alter table withdrawals add column if not exists admin_msg_message_id bigint;
  `);
}

export async function getOrCreateUser(ctx, referrer) {
  const tgId = ctx.from.id;
  const username = ctx.from.username || null;
  const firstName = ctx.from.first_name || null;

  const { rows } = await pool.query('select * from users where tg_id = $1', [tgId]);
  if (rows.length) {
    if (rows[0].username !== username || rows[0].first_name !== firstName) {
      await pool.query('update users set username=$1, first_name=$2 where tg_id=$3', [username, firstName, tgId]);
    }
    return rows[0];
  }
  await pool.query('insert into users (tg_id, username, first_name, referrer_tg_id, pickaxe_level) values ($1,$2,$3,$4,$5)', [tgId, username, firstName, referrer || null, 0]);
  for (const r of ['coal','copper','iron','gold','diamond']) {
    await pool.query('insert into inventory (user_tg_id, resource, qty) values ($1,$2,0) on conflict do nothing', [tgId, r]);
  }
  const { rows: created } = await pool.query('select * from users where tg_id=$1', [tgId]);
  return created[0];
}

export async function getUser(tgId) {
  const { rows } = await pool.query('select * from users where tg_id=$1', [tgId]);
  return rows[0] || null;
}

export async function getInventory(tgId) {
  const { rows } = await pool.query('select resource, qty from inventory where user_tg_id=$1 order by resource', [tgId]);
  const map = Object.fromEntries(rows.map(r => [r.resource, Number(r.qty)]));
  for (const k of ['coal','copper','iron','gold','diamond']) if (!(k in map)) map[k] = 0;
  return map;
}

export async function addInventory(tgId, changes) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const [resource, delta] of Object.entries(changes)) {
      await client.query(
        `insert into inventory (user_tg_id, resource, qty) values ($1,$2,$3)
         on conflict (user_tg_id, resource) do update set qty = inventory.qty + EXCLUDED.qty`,
        [tgId, resource, delta]
      );
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function updateUser(tgId, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k}=$${i+1}`).join(', ');
  const values = keys.map(k => fields[k]);
  values.push(tgId);
  await pool.query(`update users set ${sets} where tg_id=$${values.length}`, values);
}

export async function sumTodayDepositsStars(tgId) {
  const { rows } = await pool.query(
    `select coalesce(sum(amount_stars),0) as s
     from payments
     where user_tg_id=$1 and status='success' and type='deposit' and created_at::date = now()::date`,
    [tgId]
  );
  return Number(rows[0]?.s || 0);
}

export async function hasClaimedFreeCaseToday(tgId) {
  const { rows } = await pool.query(
    'select 1 from free_case_claims where user_tg_id=$1 and claimed_on = now()::date',
    [tgId]
  );
  return rows.length > 0;
}

export async function markFreeCaseClaimed(tgId) {
  await pool.query('insert into free_case_claims (user_tg_id, claimed_on) values ($1, now()::date) on conflict do nothing', [tgId]);
}

export async function getActiveLadderGame(tgId) {
  const { rows } = await pool.query("select * from ladder_games where user_tg_id=$1 and status='active' order by id desc limit 1", [tgId]);
  return rows[0] || null;
}

export async function createLadderGame(tgId, bet, layout) {
  const { rows } = await pool.query(
    'insert into ladder_games (user_tg_id, bet_stars, layout) values ($1,$2,$3) returning *',
    [tgId, bet, layout]
  );
  return rows[0];
}

export async function updateLadderGame(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k}=$${i+1}`).join(', ');
  const values = keys.map(k => fields[k]);
  values.push(id);
  await pool.query(`update ladder_games set ${sets} where id=$${values.length}`, values);
}

export async function createWithdrawal(tgId, amount, fee) {
  const total = amount + fee;
  const { rows } = await pool.query(
    'insert into withdrawals (user_tg_id, amount_stars, fee_stars, total_stars) values ($1,$2,$3,$4) returning *',
    [tgId, amount, fee, total]
  );
  return rows[0];
}

export async function listWithdrawals(tgId, limit = 5) {
  const { rows } = await pool.query('select * from withdrawals where user_tg_id=$1 order by id desc limit $2', [tgId, limit]);
  return rows;
}

export async function getWithdrawalById(id) {
  const { rows } = await pool.query('select * from withdrawals where id=$1', [id]);
  return rows[0] || null;
}

export async function updateWithdrawal(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k,i)=>`${k}=$${i+1}`).join(', ');
  const values = keys.map(k=>fields[k]);
  values.push(id);
  await pool.query(`update withdrawals set ${sets} where id=$${values.length}`, values);
}
