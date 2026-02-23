const { mainMenuKeyboard } = require('../menus/mainMenu');
const { createCopyTrade, getUserCopyTrades, deactivateCopyTrade } = require('../../database/tradeRepo');
const { InlineKeyboard } = require('grammy');

const sessions = new Map();

function register(bot) {
  bot.command('copy', async (ctx) => {
    await showCopyMenu(ctx);
  });

  bot.callbackQuery('menu:copy', async (ctx) => {
    await showCopyMenu(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('copy:add', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'copy_trade', step: 'wallet' });
    await ctx.editMessageText('🪞 *Copy Trade*\n\nSend the wallet address to copy:', { parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('copy:list', async (ctx) => {
    try {
      const copies = await getUserCopyTrades(ctx.from.id);
      if (copies.length === 0) {
        await ctx.editMessageText('No active copy trades.', { reply_markup: copyKeyboard() });
      } else {
        const kb = new InlineKeyboard();
        const lines = copies.map((c, i) => {
          kb.text(`Stop #${i + 1}`, `copy_rm:${c.target_wallet}`).row();
          return `${i + 1}. \`${c.target_wallet.slice(0, 12)}...\`\n   Max: ${c.max_sol_per_trade} SOL | Buys: ${c.copy_buys ? 'Yes' : 'No'} | Sells: ${c.copy_sells ? 'Yes' : 'No'}`;
        }).join('\n\n');
        kb.text('🔙 Back', 'menu:copy');
        await ctx.editMessageText(`🪞 *Active Copy Trades*\n\n${lines}`, { parse_mode: 'Markdown', reply_markup: kb });
      }
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: copyKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^copy_rm:/, async (ctx) => {
    const wallet = ctx.callbackQuery.data.split(':')[1];
    try {
      await deactivateCopyTrade(ctx.from.id, wallet);
      await ctx.editMessageText('✅ Copy trade stopped.', { reply_markup: copyKeyboard() });
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: copyKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    if (!session || session.action !== 'copy_trade') return next();

    const text = ctx.message.text.trim();
    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      await ctx.reply('❌ Cancelled.', { reply_markup: copyKeyboard() });
      return;
    }

    if (session.step === 'wallet') {
      session.targetWallet = text;
      session.step = 'max_sol';
      await ctx.reply('Max SOL per copied trade (e.g. 1):');
      return;
    }

    if (session.step === 'max_sol') {
      const maxSol = parseFloat(text);
      if (isNaN(maxSol) || maxSol <= 0) {
        await ctx.reply('❌ Invalid amount. Enter a number:');
        return;
      }
      sessions.delete(ctx.from.id);
      try {
        await createCopyTrade({
          userTelegramId: ctx.from.id,
          targetWallet: session.targetWallet,
          maxSolPerTrade: maxSol,
        });
        await ctx.reply(
          `✅ *Copy Trade Active*\n\n` +
          `Wallet: \`${session.targetWallet.slice(0, 16)}...\`\n` +
          `Max: *${maxSol} SOL* per trade\n` +
          `Copying buys and sells.`,
          { parse_mode: 'Markdown', reply_markup: copyKeyboard() }
        );
      } catch (err) {
        await ctx.reply(`❌ ${err.message}`, { reply_markup: copyKeyboard() });
      }
      return;
    }

    return next();
  });
}

async function showCopyMenu(ctx) {
  const text = '🪞 *Copy Trading*\n\nMirror the trades of any wallet automatically.';
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: copyKeyboard() });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: copyKeyboard() });
  }
}

function copyKeyboard() {
  return new InlineKeyboard()
    .text('➕ Copy Wallet', 'copy:add').text('📋 Active Copies', 'copy:list').row()
    .text('🔙 Back', 'menu:main');
}

module.exports = { register, sessions };
