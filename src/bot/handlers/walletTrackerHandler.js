const { mainMenuKeyboard } = require('../menus/mainMenu');
const { createWalletTracker, getUserWalletTrackers, deactivateWalletTracker } = require('../../database/tradeRepo');
const { InlineKeyboard } = require('grammy');
const { SessionStore } = require('../../utils/sessionStore');

const sessions = new SessionStore();

function register(bot) {
  bot.command('track', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length > 0) {
      try {
        await createWalletTracker({ userTelegramId: ctx.from.id, trackedWallet: args[0], label: args[1] || null });
        await ctx.reply(`✅ Now tracking \`${args[0].slice(0, 12)}...\`${args[1] ? ` (${args[1]})` : ''}`, { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.reply(`❌ ${err.message}`);
      }
      return;
    }
    await showTrackerMenu(ctx);
  });

  bot.callbackQuery('menu:tracker', async (ctx) => {
    await showTrackerMenu(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('tracker:add', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'add_tracker', step: 'wallet' });
    await ctx.editMessageText('👁 *Track Wallet*\n\nSend the Solana wallet address to track:', { parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('tracker:list', async (ctx) => {
    try {
      const trackers = await getUserWalletTrackers(ctx.from.id);
      if (trackers.length === 0) {
        await ctx.editMessageText('No tracked wallets.', { reply_markup: trackerKeyboard() });
      } else {
        const kb = new InlineKeyboard();
        const lines = trackers.map((t, i) => {
          kb.text(`Remove #${i + 1}`, `tracker_rm:${t.tracked_wallet}`).row();
          return `${i + 1}. \`${t.tracked_wallet.slice(0, 12)}...\`${t.label ? ` — ${t.label}` : ''}`;
        }).join('\n');
        kb.text('🔙 Back', 'menu:tracker');
        await ctx.editMessageText(`👁 *Tracked Wallets*\n\n${lines}`, { parse_mode: 'Markdown', reply_markup: kb });
      }
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: trackerKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^tracker_rm:/, async (ctx) => {
    const wallet = ctx.callbackQuery.data.split(':')[1];
    try {
      await deactivateWalletTracker(ctx.from.id, wallet);
      await ctx.editMessageText('✅ Wallet removed from tracking.', { reply_markup: trackerKeyboard() });
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: trackerKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    if (!session || session.action !== 'add_tracker') return next();

    const text = ctx.message.text.trim();
    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      await ctx.reply('❌ Cancelled.', { reply_markup: trackerKeyboard() });
      return;
    }

    if (session.step === 'wallet') {
      session.wallet = text;
      session.step = 'label';
      await ctx.reply('Optional: send a label for this wallet (or type "skip"):');
      return;
    }

    if (session.step === 'label') {
      const label = text.toLowerCase() === 'skip' ? null : text;
      sessions.delete(ctx.from.id);
      try {
        await createWalletTracker({ userTelegramId: ctx.from.id, trackedWallet: session.wallet, label });
        await ctx.reply(
          `✅ *Now Tracking*\n\n\`${session.wallet.slice(0, 16)}...\`${label ? `\nLabel: ${label}` : ''}`,
          { parse_mode: 'Markdown', reply_markup: trackerKeyboard() }
        );
      } catch (err) {
        await ctx.reply(`❌ ${err.message}`, { reply_markup: trackerKeyboard() });
      }
      return;
    }

    return next();
  });
}

async function showTrackerMenu(ctx) {
  const text = '👁 *Wallet Tracker*\n\nTrack wallets and get notified when they trade.';
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: trackerKeyboard() });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: trackerKeyboard() });
  }
}

function trackerKeyboard() {
  return new InlineKeyboard()
    .text('➕ Track Wallet', 'tracker:add').text('📋 My Trackers', 'tracker:list').row()
    .text('🔙 Back', 'menu:main');
}

module.exports = { register, sessions };
