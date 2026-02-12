const { getDb } = require('./db');
const { v4: uuidv4 } = require('uuid');

const stmtCache = {};
function getStmt(key, sql) {
  if (!stmtCache[key]) stmtCache[key] = getDb().prepare(sql);
  return stmtCache[key];
}

function createTokenLaunch(data) {
  const id = uuidv4();
  getStmt('createLaunch',
    `INSERT INTO token_launches (id, creator_telegram_id, token_name, token_symbol, decimals, total_supply, metadata_uri, initial_liquidity_sol, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).run(id, data.creatorTelegramId, data.tokenName, data.tokenSymbol, data.decimals, data.totalSupply, data.metadataUri, data.initialLiquiditySol);
  return id;
}

function updateTokenLaunch(id, updates) {
  const sets = Object.entries(updates).map(([k]) => `${k} = ?`).join(', ');
  getDb().prepare(`UPDATE token_launches SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
}

function getTokenLaunch(id) {
  return getStmt('getLaunch', 'SELECT * FROM token_launches WHERE id = ?').get(id);
}

function getUserLaunches(telegramId) {
  return getStmt('userLaunches', 'SELECT * FROM token_launches WHERE creator_telegram_id = ? ORDER BY created_at DESC LIMIT 20').all(telegramId);
}

function createDexPayment(data) {
  const id = uuidv4();
  getStmt('createDexPayment',
    `INSERT INTO dex_payments (id, user_telegram_id, token_mint, payment_type, amount_sol, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).run(id, data.userTelegramId, data.tokenMint, data.paymentType, data.amountSol);
  return id;
}

function updateDexPayment(id, updates) {
  const sets = Object.entries(updates).map(([k]) => `${k} = ?`).join(', ');
  getDb().prepare(`UPDATE dex_payments SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
}

function getUserDexPayments(telegramId) {
  return getStmt('userDexPayments', 'SELECT * FROM dex_payments WHERE user_telegram_id = ? ORDER BY created_at DESC LIMIT 20').all(telegramId);
}

function createTrade(data) {
  const id = uuidv4();
  getStmt('createTrade',
    `INSERT INTO trades (id, user_telegram_id, trade_type, token_mint, amount_in, slippage_bps, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`
  ).run(id, data.userTelegramId, data.tradeType, data.tokenMint, data.amountIn, data.slippageBps);
  return id;
}

function updateTrade(id, updates) {
  const sets = Object.entries(updates).map(([k]) => `${k} = ?`).join(', ');
  getDb().prepare(`UPDATE trades SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
}

function createSnipeOrder(data) {
  const id = uuidv4();
  getStmt('createSnipe',
    `INSERT INTO snipe_orders (id, user_telegram_id, token_mint, pair_address, amount_sol, slippage_bps, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`
  ).run(id, data.userTelegramId, data.tokenMint, data.pairAddress, data.amountSol, data.slippageBps);
  return id;
}

function getActiveSnipeOrders() {
  return getStmt('activeSnipes', "SELECT * FROM snipe_orders WHERE status = 'active'").all();
}

function updateSnipeOrder(id, updates) {
  const sets = Object.entries(updates).map(([k]) => `${k} = ?`).join(', ');
  getDb().prepare(`UPDATE snipe_orders SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
}

module.exports = {
  createTokenLaunch, updateTokenLaunch, getTokenLaunch, getUserLaunches,
  createDexPayment, updateDexPayment, getUserDexPayments,
  createTrade, updateTrade,
  createSnipeOrder, getActiveSnipeOrders, updateSnipeOrder,
};
