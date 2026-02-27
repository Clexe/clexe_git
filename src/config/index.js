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
  jupiter: {
    apiUrl: process.env.JUPITER_API_URL || 'https://api.jup.ag/swap/v1',
    apiKey: process.env.JUPITER_API_KEY || '',
  },
  trading: {
    maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS || '300', 10),
    priorityFeeLamports: parseInt(process.env.PRIORITY_FEE_LAMPORTS || '100000', 10),
    txTimeoutMs: parseInt(process.env.TX_TIMEOUT_MS || '60000', 10),
    tradingFeeBps: parseInt(process.env.TRADING_FEE_BPS || '100', 10),
    dexFeeBps: parseInt(process.env.DEX_FEE_BPS || '400', 10),
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

// Validate required environment variables at startup
function validateConfig() {
  const errors = [];

  if (!config.bot.token) {
    errors.push('BOT_TOKEN is required');
  }
  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }
  if (!config.security.encryptionKey) {
    errors.push('WALLET_ENCRYPTION_KEY is required');
  } else if (config.security.encryptionKey.length < 32) {
    errors.push('WALLET_ENCRYPTION_KEY must be at least 32 characters (64 hex chars recommended)');
  }

  const warnings = [];
  if (!config.trading.platformFeeWallet) {
    warnings.push('PLATFORM_FEE_WALLET not set — platform fees will not be collected');
  }
  if (!config.jupiter.apiKey) {
    warnings.push('JUPITER_API_KEY not set — rate limits may apply');
  }
  if (config.bot.adminIds.length === 0) {
    warnings.push('BOT_ADMIN_IDS not set — /admin command will be inaccessible');
  }

  return { errors, warnings };
}

config.validate = validateConfig;

module.exports = config;
