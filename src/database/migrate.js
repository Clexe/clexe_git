const { query, closeDb } = require('./db');
const logger = require('../utils/logger');

async function migrate() {
  // Test connectivity before running migrations
  const result = await query('SELECT 1');
  logger.info('Database connection verified');

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id BIGINT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      wallet_public_key TEXT,
      wallet_encrypted_secret TEXT,
      settings_json JSONB DEFAULT '{}',
      referral_code TEXT UNIQUE,
      referred_by BIGINT,
      referral_earnings_sol DOUBLE PRECISION DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS token_launches (
      id TEXT PRIMARY KEY,
      creator_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
      token_name TEXT NOT NULL,
      token_symbol TEXT NOT NULL,
      decimals INTEGER DEFAULT 9,
      total_supply TEXT NOT NULL,
      mint_address TEXT,
      metadata_uri TEXT,
      liquidity_pool_address TEXT,
      initial_liquidity_sol DOUBLE PRECISION,
      status TEXT DEFAULT 'pending',
      tx_signature TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dex_payments (
      id TEXT PRIMARY KEY,
      user_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
      token_mint TEXT NOT NULL,
      payment_type TEXT NOT NULL,
      amount_sol DOUBLE PRECISION NOT NULL,
      tx_signature TEXT,
      status TEXT DEFAULT 'pending',
      dexscreener_order_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      user_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
      trade_type TEXT NOT NULL,
      token_mint TEXT NOT NULL,
      amount_in DOUBLE PRECISION NOT NULL,
      amount_out DOUBLE PRECISION,
      slippage_bps INTEGER,
      tx_signature TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS snipe_orders (
      id TEXT PRIMARY KEY,
      user_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
      token_mint TEXT,
      pair_address TEXT,
      amount_sol DOUBLE PRECISION NOT NULL,
      slippage_bps INTEGER DEFAULT 300,
      status TEXT DEFAULT 'active',
      triggered_at TIMESTAMPTZ,
      tx_signature TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Positions for PnL tracking
  await query(`
    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      user_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
      token_mint TEXT NOT NULL,
      token_name TEXT,
      token_symbol TEXT,
      entry_price_usd DOUBLE PRECISION,
      entry_price_sol DOUBLE PRECISION,
      amount_tokens DOUBLE PRECISION NOT NULL DEFAULT 0,
      amount_sol_spent DOUBLE PRECISION NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'open',
      closed_at TIMESTAMPTZ,
      exit_price_usd DOUBLE PRECISION,
      pnl_sol DOUBLE PRECISION,
      pnl_pct DOUBLE PRECISION,
      trade_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Limit orders (take-profit, stop-loss, limit buy)
  await query(`
    CREATE TABLE IF NOT EXISTS limit_orders (
      id TEXT PRIMARY KEY,
      user_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
      token_mint TEXT NOT NULL,
      order_type TEXT NOT NULL,
      trigger_price_usd DOUBLE PRECISION NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      amount_type TEXT DEFAULT 'absolute',
      slippage_bps INTEGER DEFAULT 300,
      status TEXT DEFAULT 'active',
      triggered_at TIMESTAMPTZ,
      tx_signature TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Referrals
  await query(`
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
      referred_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
      referral_code TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(referred_telegram_id)
    )
  `);

  // Wallet trackers
  await query(`
    CREATE TABLE IF NOT EXISTS wallet_trackers (
      id TEXT PRIMARY KEY,
      user_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
      tracked_wallet TEXT NOT NULL,
      label TEXT,
      active BOOLEAN DEFAULT true,
      last_signature TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_telegram_id, tracked_wallet)
    )
  `);

  // Copy trades
  await query(`
    CREATE TABLE IF NOT EXISTS copy_trades (
      id TEXT PRIMARY KEY,
      user_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
      target_wallet TEXT NOT NULL,
      max_sol_per_trade DOUBLE PRECISION DEFAULT 1,
      slippage_bps INTEGER DEFAULT 300,
      copy_buys BOOLEAN DEFAULT true,
      copy_sells BOOLEAN DEFAULT true,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_telegram_id, target_wallet)
    )
  `);

  // DCA orders
  await query(`
    CREATE TABLE IF NOT EXISTS dca_orders (
      id TEXT PRIMARY KEY,
      user_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
      token_mint TEXT NOT NULL,
      amount_sol_per_order DOUBLE PRECISION NOT NULL,
      interval_seconds INTEGER NOT NULL,
      total_orders INTEGER NOT NULL,
      completed_orders INTEGER DEFAULT 0,
      slippage_bps INTEGER DEFAULT 300,
      status TEXT DEFAULT 'active',
      next_execution_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Safe ALTER TABLEs for existing tables
  await query(`ALTER TABLE dex_payments ADD COLUMN IF NOT EXISTS token_info JSONB`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_earnings_sol DOUBLE PRECISION DEFAULT 0`);

  // Indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_public_key)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_launches_creator ON token_launches(creator_telegram_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_launches_mint ON token_launches(mint_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dex_payments_user ON dex_payments(user_telegram_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_telegram_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_snipe_orders_status ON snipe_orders(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_telegram_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_positions_open ON positions(user_telegram_id, status) WHERE status = 'open'`);
  await query(`CREATE INDEX IF NOT EXISTS idx_limit_orders_active ON limit_orders(status) WHERE status = 'active'`);
  await query(`CREATE INDEX IF NOT EXISTS idx_wallet_trackers_active ON wallet_trackers(active) WHERE active = true`);
  await query(`CREATE INDEX IF NOT EXISTS idx_copy_trades_active ON copy_trades(active) WHERE active = true`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dca_orders_active ON dca_orders(status) WHERE status = 'active'`);
  await query(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_telegram_id)`);

  logger.info('Database migrations complete');
}

if (require.main === module) {
  migrate().then(() => {
    logger.info('Migration script done');
    return closeDb();
  }).catch((err) => {
    logger.error({ err: err.message }, 'Migration failed');
    process.exit(1);
  });
}

module.exports = { migrate };
