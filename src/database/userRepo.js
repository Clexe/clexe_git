const { getDb } = require('./db');

const stmtCache = {};

function getStmt(key, sql) {
  if (!stmtCache[key]) {
    stmtCache[key] = getDb().prepare(sql);
  }
  return stmtCache[key];
}

function findUser(telegramId) {
  return getStmt('findUser', 'SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

function upsertUser({ telegramId, username, firstName, walletPublicKey, walletEncryptedSecret }) {
  return getStmt(
    'upsertUser',
    `INSERT INTO users (telegram_id, username, first_name, wallet_public_key, wallet_encrypted_secret)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET
       username = excluded.username,
       first_name = excluded.first_name,
       wallet_public_key = COALESCE(excluded.wallet_public_key, users.wallet_public_key),
       wallet_encrypted_secret = COALESCE(excluded.wallet_encrypted_secret, users.wallet_encrypted_secret),
       updated_at = datetime('now')`
  ).run(telegramId, username, firstName, walletPublicKey, walletEncryptedSecret);
}

function updateUserSettings(telegramId, settings) {
  return getStmt('updateSettings', 'UPDATE users SET settings_json = ?, updated_at = datetime(\'now\') WHERE telegram_id = ?')
    .run(JSON.stringify(settings), telegramId);
}

function getUserSettings(telegramId) {
  const user = findUser(telegramId);
  if (!user) return {};
  try { return JSON.parse(user.settings_json || '{}'); } catch { return {}; }
}

function countUsers() {
  return getStmt('countUsers', 'SELECT COUNT(*) as count FROM users').get().count;
}

module.exports = { findUser, upsertUser, updateUserSettings, getUserSettings, countUsers };
