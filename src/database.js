import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });

export async function migrate() {
  // Users, resources, payments, transactions, ladder sessions, withdrawals
  await pool.query(`
    create table if not exists users (
      id bigint primary key,
      username text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      coins bigint not null default 0,
      stars bigint not null default 0,
      pickaxe_level int not null default 0,
      last_mine_at timestamptz,
      referred_by bigint,
      referrals int not null default 0
    );

    create table if not exists user_resources (
      user_id bigint primary key references users(id) on delete cascade,
      coal bigint not null default 0,
      copper bigint not null default 0,
      iron bigint not null default 0,
      gold bigint not null default 0,
      diamond bigint not null default 0
    );

    create table if not exists payments (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      stars bigint not null,
      payload text,
      created_at timestamptz not null default now()
    );

    create table if not exists transactions (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      kind text not null,
      amount_coins bigint not null default 0,
      amount_stars bigint not null default 0,
      meta jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists ladder_sessions (
      user_id bigint primary key references users(id) on delete cascade,
      is_active boolean not null default false,
      bet bigint,
      level int,
      broken_map jsonb,
      current_multiplier numeric(10,2)
    );

    create table if not exists withdrawals (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      amount_stars bigint not null,
      fee_stars bigint not null,
      total_debit bigint not null,
      status text not null default 'pending',
      created_at timestamptz not null default now()
    );

    create index if not exists idx_payments_user_id on payments(user_id);
    create index if not exists idx_tx_user_id on transactions(user_id);
  `);
}
