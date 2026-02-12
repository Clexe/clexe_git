const { query } = require('./db');

async function findUser(telegramId) {
  const { rows } = await query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  return rows[0] || null;
}

async function upsertUser({ telegramId, username, firstName, walletPublicKey, walletEncryptedSecret }) {
  await query(
    `INSERT INTO users (telegram_id, username, first_name, wallet_public_key, wallet_encrypted_secret)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(telegram_id) DO UPDATE SET
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       wallet_public_key = COALESCE(EXCLUDED.wallet_public_key, users.wallet_public_key),
       wallet_encrypted_secret = COALESCE(EXCLUDED.wallet_encrypted_secret, users.wallet_encrypted_secret),
       updated_at = NOW()`,
    [telegramId, username, firstName, walletPublicKey, walletEncryptedSecret]
  );
}

async function updateUserSettings(telegramId, settings) {
  await query(
    'UPDATE users SET settings_json = $1, updated_at = NOW() WHERE telegram_id = $2',
    [JSON.stringify(settings), telegramId]
  );
}

async function getUserSettings(telegramId) {
  const user = await findUser(telegramId);
  if (!user) return {};
  try {
    return typeof user.settings_json === 'object' ? user.settings_json : JSON.parse(user.settings_json || '{}');
  } catch { return {}; }
}

async function countUsers() {
  const { rows } = await query('SELECT COUNT(*) as count FROM users');
  return parseInt(rows[0].count, 10);
}

module.exports = { findUser, upsertUser, updateUserSettings, getUserSettings, countUsers };
