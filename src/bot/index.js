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

  // Error handler
  bot.catch((err) => {
    const ctx = err.ctx;
    logger.error({ err: err.error?.message || err.message, userId: ctx?.from?.id }, 'Bot error');
    errorHandler()(err.error || err, ctx);
  });

  return bot;
}

module.exports = { createBot };
