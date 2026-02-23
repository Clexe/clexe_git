const logger = require('./utils/logger');
const config = require('./config');
const { migrate } = require('./database/migrate');
const { createBot } = require('./bot');
const { startSnipeWorker, stopSnipeWorker } = require('./jobs/snipeWorker');
const { startLimitOrderWorker, stopLimitOrderWorker } = require('./jobs/limitOrderWorker');
const { startDcaWorker, stopDcaWorker } = require('./jobs/dcaWorker');
const { startWalletTrackerWorker, stopWalletTrackerWorker } = require('./jobs/walletTrackerWorker');
const { startCopyTradeWorker, stopCopyTradeWorker } = require('./jobs/copyTradeWorker');

async function main() {
  logger.info('Starting DEX Trading Bot...');

  // Run database migrations
  await migrate();

  // Create and start bot
  const bot = createBot();

  // Start background workers
  startSnipeWorker(bot, 5000);
  startLimitOrderWorker(bot, 10000);
  startDcaWorker(bot, 15000);
  startWalletTrackerWorker(bot, 30000);
  startCopyTradeWorker(bot, 10000);

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down...');
    stopSnipeWorker();
    stopLimitOrderWorker();
    stopDcaWorker();
    stopWalletTrackerWorker();
    stopCopyTradeWorker();
    await bot.stop();
    const { closeDb } = require('./database/db');
    await closeDb();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (err) => {
    logger.error({ err: err?.message, stack: err?.stack }, 'Unhandled rejection');
  });

  // Start polling
  logger.info('Bot starting with long polling...');
  await bot.start({
    onStart: () => {
      logger.info('Bot is running!');
    },
    drop_pending_updates: true,
  });
}

main().catch((err) => {
  logger.fatal({ err: err.message, stack: err.stack, code: err.code }, 'Failed to start');
  console.error('FATAL:', err);
  process.exit(1);
});
