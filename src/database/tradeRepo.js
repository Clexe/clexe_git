const { query } = require('./db');
const { v4: uuidv4 } = require('uuid');

// --- Token Launches ---
async function createTokenLaunch(data) {
  const id = uuidv4();
  await query(
    `INSERT INTO token_launches (id, creator_telegram_id, token_name, token_symbol, decimals, total_supply, metadata_uri, initial_liquidity_sol, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
    [id, data.creatorTelegramId, data.tokenName, data.tokenSymbol, data.decimals, data.totalSupply, data.metadataUri, data.initialLiquiditySol]
  );
  return id;
}

async function updateTokenLaunch(id, updates) {
  const keys = Object.keys(updates);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = Object.values(updates);
  await query(`UPDATE token_launches SET ${sets} WHERE id = $${keys.length + 1}`, [...values, id]);
}

async function getTokenLaunch(id) {
  const { rows } = await query('SELECT * FROM token_launches WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getUserLaunches(telegramId) {
  const { rows } = await query(
    'SELECT * FROM token_launches WHERE creator_telegram_id = $1 ORDER BY created_at DESC LIMIT 20',
    [telegramId]
  );
  return rows;
}

// --- Dex Payments ---
async function createDexPayment(data) {
  const id = uuidv4();
  await query(
    `INSERT INTO dex_payments (id, user_telegram_id, token_mint, payment_type, amount_sol, token_info, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
    [id, data.userTelegramId, data.tokenMint, data.paymentType, data.amountSol, data.tokenInfo ? JSON.stringify(data.tokenInfo) : null]
  );
  return id;
}

async function updateDexPayment(id, updates) {
  const keys = Object.keys(updates);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = Object.values(updates);
  await query(`UPDATE dex_payments SET ${sets} WHERE id = $${keys.length + 1}`, [...values, id]);
}

async function getUserDexPayments(telegramId) {
  const { rows } = await query(
    'SELECT * FROM dex_payments WHERE user_telegram_id = $1 ORDER BY created_at DESC LIMIT 20',
    [telegramId]
  );
  return rows;
}

// --- Trades ---
async function createTrade(data) {
  const id = uuidv4();
  await query(
    `INSERT INTO trades (id, user_telegram_id, trade_type, token_mint, amount_in, slippage_bps, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
    [id, data.userTelegramId, data.tradeType, data.tokenMint, data.amountIn, data.slippageBps]
  );
  return id;
}

async function updateTrade(id, updates) {
  const keys = Object.keys(updates);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = Object.values(updates);
  await query(`UPDATE trades SET ${sets} WHERE id = $${keys.length + 1}`, [...values, id]);
}

// --- Snipe Orders ---
async function createSnipeOrder(data) {
  const id = uuidv4();
  await query(
    `INSERT INTO snipe_orders (id, user_telegram_id, token_mint, pair_address, amount_sol, slippage_bps, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
    [id, data.userTelegramId, data.tokenMint, data.pairAddress, data.amountSol, data.slippageBps]
  );
  return id;
}

async function getActiveSnipeOrders() {
  const { rows } = await query("SELECT * FROM snipe_orders WHERE status = 'active'");
  return rows;
}

async function updateSnipeOrder(id, updates) {
  const keys = Object.keys(updates);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = Object.values(updates);
  await query(`UPDATE snipe_orders SET ${sets} WHERE id = $${keys.length + 1}`, [...values, id]);
}

// --- Positions (PnL Tracking) ---
async function createPosition(data) {
  const id = uuidv4();
  await query(
    `INSERT INTO positions (id, user_telegram_id, token_mint, token_name, token_symbol, entry_price_usd, entry_price_sol, amount_tokens, amount_sol_spent, trade_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open')`,
    [id, data.userTelegramId, data.tokenMint, data.tokenName, data.tokenSymbol, data.entryPriceUsd, data.entryPriceSol, data.amountTokens, data.amountSolSpent, data.tradeId]
  );
  return id;
}

async function getOpenPositions(telegramId) {
  const { rows } = await query(
    "SELECT * FROM positions WHERE user_telegram_id = $1 AND status = 'open' ORDER BY created_at DESC",
    [telegramId]
  );
  return rows;
}

async function getOpenPositionByMint(telegramId, tokenMint) {
  const { rows } = await query(
    "SELECT * FROM positions WHERE user_telegram_id = $1 AND token_mint = $2 AND status = 'open'",
    [telegramId, tokenMint]
  );
  return rows[0] || null;
}

async function updatePosition(id, updates) {
  const keys = Object.keys(updates);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = Object.values(updates);
  await query(`UPDATE positions SET ${sets} WHERE id = $${keys.length + 1}`, [...values, id]);
}

async function closePosition(id, exitPriceUsd, pnlSol, pnlPct) {
  await query(
    `UPDATE positions SET status = 'closed', closed_at = NOW(), exit_price_usd = $1, pnl_sol = $2, pnl_pct = $3 WHERE id = $4`,
    [exitPriceUsd, pnlSol, pnlPct, id]
  );
}

async function getClosedPositions(telegramId, limit = 10) {
  const { rows } = await query(
    "SELECT * FROM positions WHERE user_telegram_id = $1 AND status = 'closed' ORDER BY closed_at DESC LIMIT $2",
    [telegramId, limit]
  );
  return rows;
}

// --- Limit Orders ---
async function createLimitOrder(data) {
  const id = uuidv4();
  await query(
    `INSERT INTO limit_orders (id, user_telegram_id, token_mint, order_type, trigger_price_usd, amount, amount_type, slippage_bps, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
    [id, data.userTelegramId, data.tokenMint, data.orderType, data.triggerPriceUsd, data.amount, data.amountType || 'absolute', data.slippageBps || 300]
  );
  return id;
}

async function getActiveLimitOrders(telegramId) {
  const { rows } = await query(
    "SELECT * FROM limit_orders WHERE user_telegram_id = $1 AND status = 'active' ORDER BY created_at DESC",
    [telegramId]
  );
  return rows;
}

async function getAllActiveLimitOrders() {
  const { rows } = await query("SELECT * FROM limit_orders WHERE status = 'active'");
  return rows;
}

async function updateLimitOrder(id, updates) {
  const keys = Object.keys(updates);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = Object.values(updates);
  await query(`UPDATE limit_orders SET ${sets} WHERE id = $${keys.length + 1}`, [...values, id]);
}

async function cancelLimitOrder(id) {
  await query("UPDATE limit_orders SET status = 'cancelled' WHERE id = $1", [id]);
}

// --- Referrals ---
async function createReferral(data) {
  const id = uuidv4();
  await query(
    `INSERT INTO referrals (id, referrer_telegram_id, referred_telegram_id, referral_code)
     VALUES ($1, $2, $3, $4) ON CONFLICT (referred_telegram_id) DO NOTHING`,
    [id, data.referrerTelegramId, data.referredTelegramId, data.referralCode]
  );
  return id;
}

async function getReferralsByReferrer(telegramId) {
  const { rows } = await query(
    'SELECT * FROM referrals WHERE referrer_telegram_id = $1 ORDER BY created_at DESC',
    [telegramId]
  );
  return rows;
}

async function getUserByReferralCode(code) {
  const { rows } = await query('SELECT * FROM users WHERE referral_code = $1', [code]);
  return rows[0] || null;
}

async function addReferralEarnings(telegramId, solAmount) {
  await query(
    'UPDATE users SET referral_earnings_sol = COALESCE(referral_earnings_sol, 0) + $1 WHERE telegram_id = $2',
    [solAmount, telegramId]
  );
}

// --- Wallet Trackers ---
async function createWalletTracker(data) {
  const id = uuidv4();
  await query(
    `INSERT INTO wallet_trackers (id, user_telegram_id, tracked_wallet, label, active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (user_telegram_id, tracked_wallet) DO UPDATE SET active = true, label = EXCLUDED.label`,
    [id, data.userTelegramId, data.trackedWallet, data.label]
  );
  return id;
}

async function getUserWalletTrackers(telegramId) {
  const { rows } = await query(
    'SELECT * FROM wallet_trackers WHERE user_telegram_id = $1 AND active = true ORDER BY created_at DESC',
    [telegramId]
  );
  return rows;
}

async function getAllActiveWalletTrackers() {
  const { rows } = await query('SELECT * FROM wallet_trackers WHERE active = true');
  return rows;
}

async function updateWalletTracker(id, updates) {
  const keys = Object.keys(updates);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = Object.values(updates);
  await query(`UPDATE wallet_trackers SET ${sets} WHERE id = $${keys.length + 1}`, [...values, id]);
}

async function deactivateWalletTracker(userTelegramId, trackedWallet) {
  await query(
    'UPDATE wallet_trackers SET active = false WHERE user_telegram_id = $1 AND tracked_wallet = $2',
    [userTelegramId, trackedWallet]
  );
}

// --- Copy Trades ---
async function createCopyTrade(data) {
  const id = uuidv4();
  await query(
    `INSERT INTO copy_trades (id, user_telegram_id, target_wallet, max_sol_per_trade, slippage_bps, copy_buys, copy_sells, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     ON CONFLICT (user_telegram_id, target_wallet) DO UPDATE SET
       active = true, max_sol_per_trade = EXCLUDED.max_sol_per_trade,
       slippage_bps = EXCLUDED.slippage_bps, copy_buys = EXCLUDED.copy_buys, copy_sells = EXCLUDED.copy_sells`,
    [id, data.userTelegramId, data.targetWallet, data.maxSolPerTrade || 1, data.slippageBps || 300, data.copyBuys !== false, data.copySells !== false]
  );
  return id;
}

async function getUserCopyTrades(telegramId) {
  const { rows } = await query(
    'SELECT * FROM copy_trades WHERE user_telegram_id = $1 AND active = true ORDER BY created_at DESC',
    [telegramId]
  );
  return rows;
}

async function getAllActiveCopyTrades() {
  const { rows } = await query('SELECT * FROM copy_trades WHERE active = true');
  return rows;
}

async function deactivateCopyTrade(userTelegramId, targetWallet) {
  await query(
    'UPDATE copy_trades SET active = false WHERE user_telegram_id = $1 AND target_wallet = $2',
    [userTelegramId, targetWallet]
  );
}

// --- DCA Orders ---
async function createDcaOrder(data) {
  const id = uuidv4();
  const nextExecution = new Date(Date.now() + data.intervalSeconds * 1000);
  await query(
    `INSERT INTO dca_orders (id, user_telegram_id, token_mint, amount_sol_per_order, interval_seconds, total_orders, slippage_bps, status, next_execution_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)`,
    [id, data.userTelegramId, data.tokenMint, data.amountSolPerOrder, data.intervalSeconds, data.totalOrders, data.slippageBps || 300, nextExecution]
  );
  return id;
}

async function getActiveDcaOrders() {
  const { rows } = await query(
    "SELECT * FROM dca_orders WHERE status = 'active' AND next_execution_at <= NOW()"
  );
  return rows;
}

async function getUserDcaOrders(telegramId) {
  const { rows } = await query(
    "SELECT * FROM dca_orders WHERE user_telegram_id = $1 AND status = 'active' ORDER BY created_at DESC",
    [telegramId]
  );
  return rows;
}

async function updateDcaOrder(id, updates) {
  const keys = Object.keys(updates);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = Object.values(updates);
  await query(`UPDATE dca_orders SET ${sets} WHERE id = $${keys.length + 1}`, [...values, id]);
}

async function cancelDcaOrder(id) {
  await query("UPDATE dca_orders SET status = 'cancelled' WHERE id = $1", [id]);
}

module.exports = {
  createTokenLaunch, updateTokenLaunch, getTokenLaunch, getUserLaunches,
  createDexPayment, updateDexPayment, getUserDexPayments,
  createTrade, updateTrade,
  createSnipeOrder, getActiveSnipeOrders, updateSnipeOrder,
  // Positions
  createPosition, getOpenPositions, getOpenPositionByMint, updatePosition, closePosition, getClosedPositions,
  // Limit Orders
  createLimitOrder, getActiveLimitOrders, getAllActiveLimitOrders, updateLimitOrder, cancelLimitOrder,
  // Referrals
  createReferral, getReferralsByReferrer, getUserByReferralCode, addReferralEarnings,
  // Wallet Trackers
  createWalletTracker, getUserWalletTrackers, getAllActiveWalletTrackers, updateWalletTracker, deactivateWalletTracker,
  // Copy Trades
  createCopyTrade, getUserCopyTrades, getAllActiveCopyTrades, deactivateCopyTrade,
  // DCA
  createDcaOrder, getActiveDcaOrders, getUserDcaOrders, updateDcaOrder, cancelDcaOrder,
};
