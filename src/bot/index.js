const { Bot } = require('grammy');
const config = require('../config');
const logger = require('../utils/logger');
const { rateLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');

// Handlers
const startHandler = require('./handlers/startHandler');
const walletHandler = require('./handlers/walletHandler');
const tradingHandler = require('./handlers/tradingHandler');
const launchHandler = require('./handlers/launchHandler');
const dexscreenerHandler = require('./handlers/dexscreenerHandler');
const sniperHandler = require('./handlers/sniperHandler');
const settingsHandler = require('./handlers/settingsHandler');
const adminHandler = require('./handlers/adminHandler');
const positionHandler = require('./handlers/positionHandler');
const limitOrderHandler = require('./handlers/limitOrderHandler');
const referralHandler = require('./handlers/referralHandler');
const walletTrackerHandler = require('./handlers/walletTrackerHandler');
const copyTradeHandler = require('./handlers/copyTradeHandler');
const dcaHandler = require('./handlers/dcaHandler');

function createBot() {
  if (!config.bot.token) {
    throw new Error('BOT_TOKEN is required. Set it in .env');
  }

  const bot = new Bot(config.bot.token);

  // Global middleware
  bot.use(rateLimiter());

  // Register all command/callback handlers
  // Order matters: specific handlers before generic text handlers
  startHandler.register(bot);
  walletHandler.register(bot);
  launchHandler.register(bot);
  dexscreenerHandler.register(bot);
  sniperHandler.register(bot);
  positionHandler.register(bot);
  limitOrderHandler.register(bot);
  referralHandler.register(bot);
  walletTrackerHandler.register(bot);
  copyTradeHandler.register(bot);
  dcaHandler.register(bot);
  tradingHandler.register(bot);
  settingsHandler.register(bot);
  adminHandler.register(bot);

  // Set bot command menu (side menu)
  bot.api.setMyCommands([
    { command: 'start', description: 'Start trading on Solana' },
    { command: 'buy', description: 'Buy a token' },
    { command: 'sell', description: 'Sell a token' },
    { command: 'positions', description: 'View your open positions & PnL' },
    { command: 'wallet', description: 'Manage your wallets' },
    { command: 'settings', description: 'Configure your bot settings' },
    { command: 'snipe', description: 'Snipe new token launches' },
    { command: 'dca', description: 'Dollar-cost average into a token' },
    { command: 'copy', description: 'Copy trade a wallet' },
    { command: 'track', description: 'Track a wallet — /track [address]' },
    { command: 'referral', description: 'Your referral link & earnings' },
    { command: 'dex', description: 'DexScreener lookup — /dex [token]' },
    { command: 'trending', description: 'View trending tokens' },
    { command: 'launch', description: 'Launch a new SPL token' },
    { command: 'balance', description: 'Check wallet balance' },
    { command: 'help', description: 'FAQ & commands' },
  ]).catch(err => logger.error({ err: err.message }, 'Failed to set bot commands'));

  // Error handler
  bot.catch((err) => {
    const ctx = err.ctx;
    logger.error({ err: err.error?.message || err.message, userId: ctx?.from?.id }, 'Bot error');
    errorHandler()(err.error || err, ctx);
  });

  return bot;
}

module.exports = { createBot };
