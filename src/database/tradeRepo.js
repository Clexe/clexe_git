const { query } = require('./db');
const { v4: uuidv4 } = require('uuid');

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

module.exports = {
  createTokenLaunch, updateTokenLaunch, getTokenLaunch, getUserLaunches,
  createDexPayment, updateDexPayment, getUserDexPayments,
  createTrade, updateTrade,
  createSnipeOrder, getActiveSnipeOrders, updateSnipeOrder,
};
