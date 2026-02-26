const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} = require('@solana/web3.js');
const bs58 = require('bs58');
const config = require('../config');
const logger = require('./logger');

let primaryConnection = null;
let backupConnection = null;

function getConnection() {
  if (!primaryConnection) {
    primaryConnection = new Connection(config.solana.rpcUrl, {
      commitment: config.solana.commitment,
      wsEndpoint: config.solana.wsUrl,
      confirmTransactionInitialTimeout: config.trading.txTimeoutMs,
    });
  }
  return primaryConnection;
}

function getBackupConnection() {
  if (!backupConnection && config.solana.backupRpcUrl) {
    backupConnection = new Connection(config.solana.backupRpcUrl, {
      commitment: config.solana.commitment,
    });
  }
  return backupConnection;
}

function keypairFromSecret(secretKeyBase58) {
  return Keypair.fromSecretKey(bs58.decode(secretKeyBase58));
}

function keypairToBase58(keypair) {
  return bs58.encode(keypair.secretKey);
}

async function getBalance(publicKey) {
  const conn = getConnection();
  const balance = await conn.getBalance(new PublicKey(publicKey));
  return balance / LAMPORTS_PER_SOL;
}

async function getSplTokenBalance(walletPubkey, mintAddress) {
  const conn = getConnection();
  const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
  const accounts = await conn.getParsedTokenAccountsByOwner(
    new PublicKey(walletPubkey),
    { mint: new PublicKey(mintAddress) }
  );
  if (accounts.value.length === 0) return { uiAmount: 0, rawAmount: '0', decimals: 0 };
  const tokenAmount = accounts.value[0].account.data.parsed.info.tokenAmount;
  return {
    uiAmount: tokenAmount.uiAmount,
    rawAmount: tokenAmount.amount,
    decimals: tokenAmount.decimals,
  };
}

async function getAllSplTokenBalances(walletPubkey) {
  const conn = getConnection();
  const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
  const accounts = await conn.getParsedTokenAccountsByOwner(
    new PublicKey(walletPubkey),
    { programId: TOKEN_PROGRAM_ID }
  );
  return accounts.value
    .map(a => {
      const info = a.account.data.parsed.info;
      return {
        mint: info.mint,
        balance: info.tokenAmount.uiAmount,
        decimals: info.tokenAmount.decimals,
      };
    })
    .filter(t => t.balance > 0);
}

async function sendSol(fromKeypair, toPublicKey, solAmount) {
  const conn = getConnection();
  const tx = new Transaction();

  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: config.trading.priorityFeeLamports,
    })
  );

  tx.add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: new PublicKey(toPublicKey),
      lamports: Math.round(solAmount * LAMPORTS_PER_SOL),
    })
  );

  const signature = await sendAndConfirmTransaction(conn, tx, [fromKeypair], {
    commitment: config.solana.commitment,
  });
  return signature;
}

async function sendTransactionWithRetry(transaction, signers, maxRetries = 3) {
  const conn = getConnection();
  const backup = getBackupConnection();
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const sig = await sendAndConfirmTransaction(conn, transaction, signers, {
        commitment: config.solana.commitment,
      });
      return sig;
    } catch (err) {
      lastError = err;
      logger.warn({ attempt: i + 1, error: err.message }, 'TX retry');
      if (backup && i === maxRetries - 1) {
        try {
          return await sendAndConfirmTransaction(backup, transaction, signers, {
            commitment: config.solana.commitment,
          });
        } catch (backupErr) {
          lastError = backupErr;
        }
      }
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

module.exports = {
  getConnection,
  getBackupConnection,
  keypairFromSecret,
  keypairToBase58,
  getBalance,
  getSplTokenBalance,
  getAllSplTokenBalances,
  sendSol,
  sendTransactionWithRetry,
  LAMPORTS_PER_SOL,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
};
