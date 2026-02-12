const { settingsMenuKeyboard, mainMenuKeyboard } = require('../menus/mainMenu');
const { getUserSettings, updateUserSettings } = require('../../database/userRepo');

const sessions = new Map();

function register(bot) {
  bot.command('settings', async (ctx) => {
    const settings = getUserSettings(ctx.from.id);
    await ctx.reply(
      `⚙️ *Settings*\n\n` +
      `Slippage: *${settings.slippageBps || 300} bps* (${(settings.slippageBps || 300) / 100}%)\n` +
      `Priority Fee: *${settings.priorityFee || 100000} microlamports*`,
      { parse_mode: 'Markdown', reply_markup: settingsMenuKeyboard() }
    );
  });

  bot.callbackQuery('menu:settings', async (ctx) => {
    const settings = getUserSettings(ctx.from.id);
    await ctx.editMessageText(
      `⚙️ *Settings*\n\n` +
      `Slippage: *${settings.slippageBps || 300} bps*\n` +
      `Priority Fee: *${settings.priorityFee || 100000} microlamports*`,
      { parse_mode: 'Markdown', reply_markup: settingsMenuKeyboard() }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('settings:slippage', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'set_slippage' });
    await ctx.editMessageText('Enter slippage in bps (e.g., 300 = 3%):');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('settings:fee', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'set_fee' });
    await ctx.editMessageText('Enter priority fee in microlamports (e.g., 100000):');
    await ctx.answerCallbackQuery();
  });

  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return next();

    const text = ctx.message.text.trim();
    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      await ctx.reply('❌ Cancelled.', { reply_markup: settingsMenuKeyboard() });
      return;
    }

    const settings = getUserSettings(ctx.from.id);

    if (session.action === 'set_slippage') {
      const val = parseInt(text, 10);
      if (isNaN(val) || val < 1 || val > 5000) {
        await ctx.reply('❌ Must be 1–5000:');
        return;
      }
      sessions.delete(ctx.from.id);
      settings.slippageBps = val;
      updateUserSettings(ctx.from.id, settings);
      await ctx.reply(`✅ Slippage set to *${val} bps* (${val / 100}%)`, {
        parse_mode: 'Markdown',
        reply_markup: settingsMenuKeyboard(),
      });
      return;
    }

    if (session.action === 'set_fee') {
      const val = parseInt(text, 10);
      if (isNaN(val) || val < 0) {
        await ctx.reply('❌ Must be a positive number:');
        return;
      }
      sessions.delete(ctx.from.id);
      settings.priorityFee = val;
      updateUserSettings(ctx.from.id, settings);
      await ctx.reply(`✅ Priority fee set to *${val} microlamports*`, {
        parse_mode: 'Markdown',
        reply_markup: settingsMenuKeyboard(),
      });
      return;
    }

    return next();
  });
}

module.exports = { register, sessions };
