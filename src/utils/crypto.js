const crypto = require('crypto');
const config = require('../config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey() {
  const key = config.security.encryptionKey;
  if (!key) {
    throw new Error('WALLET_ENCRYPTION_KEY is not set');
  }
  // Prefer 64-char hex key (32 bytes)
  if (key.length >= 64 && /^[0-9a-fA-F]+$/.test(key.slice(0, 64))) {
    return Buffer.from(key.slice(0, 64), 'hex');
  }
  // Fallback: derive a proper 32-byte key via SHA-256 from whatever was provided
  // This ensures consistent key length regardless of input format
  if (key.length >= 32) {
    return crypto.createHash('sha256').update(key).digest();
  }
  throw new Error('WALLET_ENCRYPTION_KEY must be at least 32 characters (64 hex chars recommended)');
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

function decrypt(ciphertext) {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted data format');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };
