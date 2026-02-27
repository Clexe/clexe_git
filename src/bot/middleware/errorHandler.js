const logger = require('../../utils/logger');

function errorHandler() {
  return async (err, ctx) => {
    const userId = ctx?.from?.id || 'unknown';
    logger.error({ err: err.message, stack: err.stack, userId }, 'Unhandled bot error');

    // Send a user-friendly message without exposing internals
    const userMessage = getPublicErrorMessage(err);
    try {
      await ctx.reply(userMessage);
    } catch {
      // reply may fail if context is invalid
    }
  };
}

function getPublicErrorMessage(err) {
  const msg = err?.message || '';
  // Allow specific user-facing messages through
  if (msg.includes('No wallet found')) return 'You need a wallet first. Use /wallet to create or import one.';
  if (msg.includes('Insufficient balance')) return 'Insufficient balance for this operation.';
  if (msg.includes('rate limit') || msg.includes('Rate limit')) return 'Too many requests. Please wait a moment and try again.';
  if (msg.includes('Trade failed')) return `Trade failed. Please try again with adjusted slippage.`;
  return 'Something went wrong. Please try again or contact support.';
}

module.exports = { errorHandler };
