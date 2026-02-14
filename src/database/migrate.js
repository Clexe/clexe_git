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

  // Add token_info column for profile updates (safe to run multiple times)
  await query(`ALTER TABLE dex_payments ADD COLUMN IF NOT EXISTS token_info JSONB`);

  await query(`CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_public_key)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_launches_creator ON token_launches(creator_telegram_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_launches_mint ON token_launches(mint_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dex_payments_user ON dex_payments(user_telegram_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_telegram_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_snipe_orders_status ON snipe_orders(status)`);

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
