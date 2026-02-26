const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const { encrypt, decrypt } = require('../utils/crypto');
const { getBalance, getSplTokenBalance, getAllSplTokenBalances } = require('../utils/solana');
const { findUser, upsertUser } = require('../database/userRepo');
const logger = require('../utils/logger');

async function createWallet(telegramId, username, firstName) {
  const existing = await findUser(telegramId);
  if (existing && existing.wallet_public_key) {
    return {
      publicKey: existing.wallet_public_key,
      isNew: false,
    };
  }

  const keypair = Keypair.generate();
  const secretBase58 = bs58.encode(keypair.secretKey);
  const encryptedSecret = encrypt(secretBase58);

  await upsertUser({
    telegramId,
    username,
    firstName,
    walletPublicKey: keypair.publicKey.toBase58(),
    walletEncryptedSecret: encryptedSecret,
  });

  logger.info({ telegramId, publicKey: keypair.publicKey.toBase58() }, 'Wallet created');

  return {
    publicKey: keypair.publicKey.toBase58(),
    isNew: true,
  };
}

async function importWallet(telegramId, username, firstName, privateKeyBase58) {
  let keypair;
  try {
    keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
  } catch {
    throw new Error('Invalid private key. Must be a base58-encoded Solana private key.');
  }

  const encryptedSecret = encrypt(privateKeyBase58);
  await upsertUser({
    telegramId,
    username,
    firstName,
    walletPublicKey: keypair.publicKey.toBase58(),
    walletEncryptedSecret: encryptedSecret,
  });

  logger.info({ telegramId, publicKey: keypair.publicKey.toBase58() }, 'Wallet imported');
  return { publicKey: keypair.publicKey.toBase58() };
}

async function getKeypair(telegramId) {
  const user = await findUser(telegramId);
  if (!user || !user.wallet_encrypted_secret) {
    throw new Error('No wallet found. Use /wallet to create one.');
  }
  const secretBase58 = decrypt(user.wallet_encrypted_secret);
  return Keypair.fromSecretKey(bs58.decode(secretBase58));
}

async function getPublicKey(telegramId) {
  const user = await findUser(telegramId);
  if (!user || !user.wallet_public_key) return null;
  return user.wallet_public_key;
}

async function getWalletBalance(telegramId) {
  const pubkey = await getPublicKey(telegramId);
  if (!pubkey) throw new Error('No wallet found.');
  return getBalance(pubkey);
}

async function getTokenBalance(telegramId, mintAddress) {
  const pubkey = await getPublicKey(telegramId);
  if (!pubkey) throw new Error('No wallet found.');
  const result = await getSplTokenBalance(pubkey, mintAddress);
  return result;
}

async function getAllTokenBalances(telegramId) {
  const pubkey = await getPublicKey(telegramId);
  if (!pubkey) throw new Error('No wallet found.');
  return getAllSplTokenBalances(pubkey);
}

async function exportPrivateKey(telegramId) {
  const user = await findUser(telegramId);
  if (!user || !user.wallet_encrypted_secret) {
    throw new Error('No wallet found.');
  }
  return decrypt(user.wallet_encrypted_secret);
}

module.exports = {
  createWallet,
  importWallet,
  getKeypair,
  getPublicKey,
  getWalletBalance,
  getTokenBalance,
  getAllTokenBalances,
  exportPrivateKey,
};
