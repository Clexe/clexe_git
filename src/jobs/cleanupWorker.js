const { query } = require('../database/db');
const logger = require('../utils/logger');

let interval = null;

function startCleanupWorker(intervalMs = 6 * 60 * 60 * 1000) {
  logger.info('Cleanup worker started (runs every 6 hours)');
  // Run once on startup after a short delay, then periodically
  setTimeout(() => runCleanup(), 30000);
  interval = setInterval(() => runCleanup(), intervalMs);
  if (interval.unref) interval.unref();
}

function stopCleanupWorker() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    logger.info('Cleanup worker stopped');
  }
}

async function runCleanup() {
  try {
    // Clean up failed/expired snipe orders older than 7 days
    const snipeResult = await query(
      "DELETE FROM snipe_orders WHERE status IN ('failed', 'cancelled') AND created_at < NOW() - INTERVAL '7 days'"
    );
    if (snipeResult.rowCount > 0) {
      logger.info({ deleted: snipeResult.rowCount }, 'Cleaned up old snipe orders');
    }

    // Clean up failed trades older than 30 days
    const tradeResult = await query(
      "DELETE FROM trades WHERE status = 'failed' AND created_at < NOW() - INTERVAL '30 days'"
    );
    if (tradeResult.rowCount > 0) {
      logger.info({ deleted: tradeResult.rowCount }, 'Cleaned up old failed trades');
    }

    // Clean up cancelled limit orders older than 14 days
    const limitResult = await query(
      "DELETE FROM limit_orders WHERE status IN ('failed', 'cancelled') AND created_at < NOW() - INTERVAL '14 days'"
    );
    if (limitResult.rowCount > 0) {
      logger.info({ deleted: limitResult.rowCount }, 'Cleaned up old limit orders');
    }

    // Clean up completed/cancelled DCA orders older than 30 days
    const dcaResult = await query(
      "DELETE FROM dca_orders WHERE status IN ('completed', 'cancelled') AND created_at < NOW() - INTERVAL '30 days'"
    );
    if (dcaResult.rowCount > 0) {
      logger.info({ deleted: dcaResult.rowCount }, 'Cleaned up old DCA orders');
    }

    // Clean up failed dex payments older than 30 days
    const dexResult = await query(
      "DELETE FROM dex_payments WHERE status = 'failed' AND created_at < NOW() - INTERVAL '30 days'"
    );
    if (dexResult.rowCount > 0) {
      logger.info({ deleted: dexResult.rowCount }, 'Cleaned up old failed dex payments');
    }

    logger.debug('Cleanup worker cycle complete');
  } catch (err) {
    logger.error({ err: err.message }, 'Cleanup worker error');
  }
}

module.exports = { startCleanupWorker, stopCleanupWorker };
