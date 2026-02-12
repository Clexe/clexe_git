const logger = require('../../utils/logger');

function errorHandler() {
  return async (err, ctx) => {
    const userId = ctx?.from?.id || 'unknown';
    logger.error({ err: err.message, stack: err.stack, userId }, 'Unhandled bot error');

    try {
      await ctx.reply('Something went wrong. Please try again or contact support.');
    } catch {
      // reply may fail if context is invalid
    }
  };
}

module.exports = { errorHandler };
