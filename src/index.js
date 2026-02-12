const logger = require('./utils/logger');
const config = require('./config');
const { migrate } = require('./database/migrate');
const { createBot } = require('./bot');
const { startSnipeWorker, stopSnipeWorker } = require('./jobs/snipeWorker');

async function main() {
  logger.info('Starting DEX Trading Bot...');

  // Run database migrations
  await migrate();

  // Create and start bot
  const bot = createBot();

  // Start background workers
  startSnipeWorker(bot, 5000);

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down...');
    stopSnipeWorker();
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
  logger.fatal({ err: err.message, stack: err.stack }, 'Failed to start');
  process.exit(1);
});
