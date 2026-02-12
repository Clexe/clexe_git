const { getDb, closeDb } = require('./db');
const logger = require('../utils/logger');

function migrate() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      wallet_public_key TEXT,
      wallet_encrypted_secret TEXT,
      settings_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS token_launches (
      id TEXT PRIMARY KEY,
      creator_telegram_id INTEGER NOT NULL,
      token_name TEXT NOT NULL,
      token_symbol TEXT NOT NULL,
      decimals INTEGER DEFAULT 9,
      total_supply TEXT NOT NULL,
      mint_address TEXT,
      metadata_uri TEXT,
      liquidity_pool_address TEXT,
      initial_liquidity_sol REAL,
      status TEXT DEFAULT 'pending',
      tx_signature TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (creator_telegram_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS dex_payments (
      id TEXT PRIMARY KEY,
      user_telegram_id INTEGER NOT NULL,
      token_mint TEXT NOT NULL,
      payment_type TEXT NOT NULL,
      amount_sol REAL NOT NULL,
      tx_signature TEXT,
      status TEXT DEFAULT 'pending',
      dexscreener_order_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_telegram_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      user_telegram_id INTEGER NOT NULL,
      trade_type TEXT NOT NULL,
      token_mint TEXT NOT NULL,
      amount_in REAL NOT NULL,
      amount_out REAL,
      slippage_bps INTEGER,
      tx_signature TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_telegram_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS snipe_orders (
      id TEXT PRIMARY KEY,
      user_telegram_id INTEGER NOT NULL,
      token_mint TEXT,
      pair_address TEXT,
      amount_sol REAL NOT NULL,
      slippage_bps INTEGER DEFAULT 300,
      status TEXT DEFAULT 'active',
      triggered_at TEXT,
      tx_signature TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_telegram_id) REFERENCES users(telegram_id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_public_key);
    CREATE INDEX IF NOT EXISTS idx_launches_creator ON token_launches(creator_telegram_id);
    CREATE INDEX IF NOT EXISTS idx_launches_mint ON token_launches(mint_address);
    CREATE INDEX IF NOT EXISTS idx_dex_payments_user ON dex_payments(user_telegram_id);
    CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_telegram_id);
    CREATE INDEX IF NOT EXISTS idx_snipe_orders_status ON snipe_orders(status);
  `);

  logger.info('Database migrations complete');
}

if (require.main === module) {
  migrate();
  closeDb();
  logger.info('Migration script done');
}

module.exports = { migrate };
