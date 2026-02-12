require('dotenv').config();

const config = {
  bot: {
    token: process.env.BOT_TOKEN,
    adminIds: (process.env.BOT_ADMIN_IDS || '').split(',').map(Number).filter(Boolean),
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    wsUrl: process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com',
    backupRpcUrl: process.env.SOLANA_BACKUP_RPC_URL,
    commitment: process.env.COMMITMENT_LEVEL || 'confirmed',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  dexscreener: {
    apiUrl: process.env.DEXSCREENER_API_URL || 'https://api.dexscreener.com',
    paymentWallet: process.env.DEXSCREENER_PAYMENT_WALLET,
  },
  tokenDefaults: {
    decimals: parseInt(process.env.DEFAULT_TOKEN_DECIMALS || '9', 10),
    initialSupply: parseInt(process.env.DEFAULT_INITIAL_SUPPLY || '1000000000', 10),
  },
  trading: {
    maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS || '300', 10),
    priorityFeeLamports: parseInt(process.env.PRIORITY_FEE_LAMPORTS || '100000', 10),
    txTimeoutMs: parseInt(process.env.TX_TIMEOUT_MS || '60000', 10),
    platformFeeBps: parseInt(process.env.PLATFORM_FEE_BPS || '0', 10),
    platformFeeWallet: process.env.PLATFORM_FEE_WALLET,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30', 10),
  },
  security: {
    encryptionKey: process.env.WALLET_ENCRYPTION_KEY,
  },
};

module.exports = config;
