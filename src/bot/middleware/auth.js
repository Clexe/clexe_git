const { findUser } = require('../../database/userRepo');

function requireWallet() {
  return async (ctx, next) => {
    const user = findUser(ctx.from.id);
    if (!user || !user.wallet_public_key) {
      await ctx.reply('You need a wallet first. Use /wallet to create or import one.');
      return;
    }
    ctx.userWallet = user.wallet_public_key;
    return next();
  };
}

function adminOnly() {
  const config = require('../../config');
  return async (ctx, next) => {
    if (!config.bot.adminIds.includes(ctx.from.id)) {
      await ctx.reply('This command is admin-only.');
      return;
    }
    return next();
  };
}

module.exports = { requireWallet, adminOnly };
