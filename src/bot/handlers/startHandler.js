const { mainMenuKeyboard } = require('../menus/mainMenu');
const { upsertUser } = require('../../database/userRepo');

function register(bot) {
  bot.command('start', async (ctx) => {
    upsertUser({
      telegramId: ctx.from.id,
      username: ctx.from.username || null,
      firstName: ctx.from.first_name || null,
      walletPublicKey: null,
      walletEncryptedSecret: null,
    });

    await ctx.reply(
      `🤖 *Welcome to DEX Trading Bot*\n\n` +
      `Your all-in-one Solana trading companion:\n\n` +
      `💰 *Wallet* — Create or import a Solana wallet\n` +
      `📊 *Trading* — Buy/sell tokens via Jupiter aggregator\n` +
      `🚀 *Launch Token* — Create & deploy SPL tokens\n` +
      `🔥 *DexScreener* — Search, trending, and paid boosts\n` +
      `🎯 *Sniper* — Set snipe orders for new pairs\n\n` +
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

  bot.callbackQuery('menu:help', async (ctx) => {
    await ctx.editMessageText(
      `❓ *Help & Commands*\n\n` +
      `/start — Main menu\n` +
      `/wallet — Wallet management\n` +
      `/buy <token> <sol_amount> — Quick buy\n` +
      `/sell <token> <amount> — Quick sell\n` +
      `/launch — Launch a new token\n` +
      `/dex <token> — DexScreener lookup\n` +
      `/trending — View trending tokens\n` +
      `/boost — Pay for DexScreener boost\n` +
      `/snipe — Sniper settings\n` +
      `/settings — Bot settings\n` +
      `/balance — Check wallet balance\n\n` +
      `Need help? Contact the bot admin.`,
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
    );
    await ctx.answerCallbackQuery();
  });
}

module.exports = { register };
