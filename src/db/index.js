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
      last_active_at timestamptz,
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

    create table if not exists nfts (
      id bigserial primary key,
      type text not null,
      tg_link text not null unique,
      assigned boolean not null default false,
      assigned_to_tg_id bigint references users(tg_id) on delete set null,
      assigned_at timestamptz,
      reserved boolean not null default false,
      reserved_by_tg_id bigint,
      reserved_at timestamptz
    );
    create index if not exists idx_nfts_type_assigned on nfts(type, assigned);

    create table if not exists nft_withdrawals (
      id bigserial primary key,
      user_tg_id bigint not null references users(tg_id) on delete cascade,
      nft_id bigint not null references nfts(id) on delete restrict,
      status text not null default 'pending',
      reviewed_by_tg_id bigint,
      reviewed_at timestamptz,
      reason text,
      admin_msg_chat_id text,
      admin_msg_message_id bigint,
      created_at timestamptz not null default now()
    );
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

export async function getUserNfts(tgId) {
  const { rows } = await pool.query('select id, type, tg_link from nfts where assigned=true and reserved=false and assigned_to_tg_id=$1 order by id desc', [tgId]);
  return rows;
}

export async function getOwnedNft(tgId, nftId) {
  const { rows } = await pool.query('select id, type, tg_link from nfts where id=$1 and assigned=true and reserved=false and assigned_to_tg_id=$2', [nftId, tgId]);
  return rows[0] || null;
}

export async function assignRandomNftOfType(type, tgId) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const sel = await client.query("select id from nfts where type=$1 and assigned=false for update skip locked limit 1", [type]);
    if (sel.rows.length === 0) { await client.query('rollback'); return null; }
    const id = sel.rows[0].id;
    await client.query('update nfts set assigned=true, assigned_to_tg_id=$1, assigned_at=now() where id=$2', [tgId, id]);
    const { rows } = await client.query('select id, type, tg_link from nfts where id=$1', [id]);
    await client.query('commit');
    return rows[0];
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function createNftWithdrawal(tgId, nftId) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // reserve NFT and hide from inventory
    const chk = await client.query('select id from nfts where id=$1 and assigned=true and reserved=false and assigned_to_tg_id=$2 for update', [nftId, tgId]);
    if (!chk.rows.length) { await client.query('rollback'); return null; }
    await client.query('update nfts set reserved=true, reserved_by_tg_id=$1, reserved_at=now() where id=$2', [tgId, nftId]);
    const { rows } = await client.query('insert into nft_withdrawals (user_tg_id, nft_id) values ($1,$2) returning *', [tgId, nftId]);
    await client.query('commit');
    return rows[0];
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function getNftWithdrawalById(id) {
  const { rows } = await pool.query('select * from nft_withdrawals where id=$1', [id]);
  return rows[0] || null;
}

export async function updateNftWithdrawal(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k,i)=>`${k}=$${i+1}`).join(', ');
  const values = keys.map(k=>fields[k]);
  values.push(id);
  await pool.query(`update nft_withdrawals set ${sets} where id=$${values.length}`, values);
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
