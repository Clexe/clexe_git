const { mainMenuKeyboard } = require('../menus/mainMenu');
const { upsertUser } = require('../../database/userRepo');
const { processReferralStart } = require('./referralHandler');

function register(bot) {
  bot.command('start', async (ctx) => {
    await upsertUser({
      telegramId: ctx.from.id,
      username: ctx.from.username || null,
      firstName: ctx.from.first_name || null,
      walletPublicKey: null,
      walletEncryptedSecret: null,
    });

    // Process referral code if present (e.g. /start ref_abc123)
    const startParam = ctx.message.text.split(' ')[1];
    if (startParam) {
      await processReferralStart(ctx, startParam);
    }

    await ctx.reply(
      `🤖 *Welcome to DEX Trading Bot*\n\n` +
      `Your all-in-one Solana trading companion:\n\n` +
      `💰 *Wallet* — Create or import a Solana wallet\n` +
      `📊 *Trading* — Buy/sell with quick buttons & token info\n` +
      `📦 *Positions* — Track PnL on all your trades\n` +
      `📝 *Limit Orders* — Take-profit, stop-loss, limit buys\n` +
      `📅 *DCA* — Dollar-cost average into any token\n` +
      `🚀 *Launch Token* — Create & deploy SPL tokens\n` +
      `🔥 *DexScreener* — Search, trending, and paid boosts\n` +
      `🎯 *Sniper* — Set snipe orders for new pairs\n` +
      `👁 *Tracker* — Monitor any wallet's activity\n` +
      `🪞 *Copy Trade* — Mirror any wallet's trades\n` +
      `🤝 *Referral* — Earn 30% of referred users' fees\n\n` +
      `Get started by creating a wallet 👇`,
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
    );
  });

  bot.callbackQuery('menu:main', async (ctx) => {
    await ctx.editMessageText(
      '🤖 *DEX Trading Bot — Main Menu*\n\nSelect an option:',
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('cancel', async (ctx) => {
    await ctx.editMessageText('❌ Action cancelled.', { reply_markup: mainMenuKeyboard() });
    await ctx.answerCallbackQuery();
  });

  const helpText =
    `❓ *Help & Commands*\n\n` +
    `*Trading*\n` +
    `/buy — Buy a token (step-by-step)\n` +
    `/sell — Sell a token (step-by-step)\n` +
    `/positions — View open positions & PnL\n` +
    `/dca — Dollar-cost averaging\n` +
    `/snipe — Snipe new token launches\n\n` +
    `*Wallet*\n` +
    `/wallet — Manage wallets\n` +
    `/balance — Check wallet balance\n\n` +
    `*Tools*\n` +
    `/track \`<wallet>\` — Track a wallet\n` +
    `/copy — Copy trade a wallet\n` +
    `/dex \`<token>\` — DexScreener lookup\n` +
    `/trending — View trending tokens\n\n` +
    `*Other*\n` +
    `/settings — Bot settings\n` +
    `/referral — Your referral link & earnings\n` +
    `/launch — Launch a new SPL token\n` +
    `/help — This help menu\n\n` +
    `💡 *Tip:* Paste any token address to see its info & buy buttons!`;

  bot.command('help', async (ctx) => {
    await ctx.reply(helpText, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
  });

  bot.callbackQuery('menu:help', async (ctx) => {
    await ctx.editMessageText(helpText, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
    await ctx.answerCallbackQuery();
  });
}

module.exports = { register };
