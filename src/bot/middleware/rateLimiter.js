const config = require('../../config');
const logger = require('../../utils/logger');

// In-memory rate limiter (for single-instance). For multi-instance, swap to Redis.
const userRequests = new Map();

const CLEANUP_INTERVAL = 60000;

setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of userRequests) {
    if (now - entry.windowStart > config.rateLimit.windowMs * 2) {
      userRequests.delete(userId);
    }
  }
}, CLEANUP_INTERVAL);

function rateLimiter() {
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const now = Date.now();
    let entry = userRequests.get(userId);

    if (!entry || now - entry.windowStart > config.rateLimit.windowMs) {
      entry = { windowStart: now, count: 0 };
      userRequests.set(userId, entry);
    }

    entry.count++;

    if (entry.count > config.rateLimit.maxRequests) {
      logger.warn({ userId, count: entry.count }, 'Rate limit exceeded');
      await ctx.reply('⏳ Too many requests. Please slow down and try again shortly.');
      return;
    }

    return next();
  };
}

module.exports = { rateLimiter };
