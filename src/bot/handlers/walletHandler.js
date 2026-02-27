const { walletMenuKeyboard, mainMenuKeyboard } = require('../menus/mainMenu');
const walletService = require('../../services/walletService');

// Session store for multi-step flows
const sessions = new Map();

function register(bot) {
  bot.command('wallet', async (ctx) => {
    await ctx.reply('💰 *Wallet Management*\n\nChoose an option:', {
      parse_mode: 'Markdown',
      reply_markup: walletMenuKeyboard(),
    });
  });

  bot.callbackQuery('menu:wallet', async (ctx) => {
    await ctx.editMessageText('💰 *Wallet Management*\n\nChoose an option:', {
      parse_mode: 'Markdown',
      reply_markup: walletMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('wallet:create', async (ctx) => {
    try {
      const result = await walletService.createWallet(ctx.from.id, ctx.from.username, ctx.from.first_name);
      if (result.isNew) {
        await ctx.editMessageText(
          `✅ *Wallet Created!*\n\n` +
          `Address: \`${result.publicKey}\`\n\n` +
          `Send SOL to this address to fund your wallet.\n` +
          `⚠️ *Back up your private key* using Export Key.`,
          { parse_mode: 'Markdown', reply_markup: walletMenuKeyboard() }
        );
      } else {
        await ctx.editMessageText(
          `ℹ️ *Wallet Already Exists*\n\nAddress: \`${result.publicKey}\``,
          { parse_mode: 'Markdown', reply_markup: walletMenuKeyboard() }
        );
      }
    } catch (err) {
      await ctx.editMessageText(`❌ Error: ${err.message}`, { reply_markup: walletMenuKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('wallet:import', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'import_wallet' });
    await ctx.editMessageText(
      '📥 *Import Wallet*\n\n' +
      'Send your base58-encoded Solana private key as a message.\n\n' +
      '⚠️ *Delete the message immediately after* for security.\n' +
      'Type "cancel" to abort.',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('wallet:balance', async (ctx) => {
    try {
      const balance = await walletService.getWalletBalance(ctx.from.id);
      const pubkey = await walletService.getPublicKey(ctx.from.id);
      await ctx.editMessageText(
        `💵 *Wallet Balance*\n\n` +
        `Address: \`${pubkey}\`\n` +
        `Balance: *${balance.toFixed(6)} SOL*`,
        { parse_mode: 'Markdown', reply_markup: walletMenuKeyboard() }
      );
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: walletMenuKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('wallet:export', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'confirm_export' });
    await ctx.editMessageText(
      '🔑 *Export Private Key*\n\n' +
      '⚠️ *WARNING:* Anyone with your private key can steal all your funds.\n\n' +
      'Type *CONFIRM* to export your key, or "cancel" to abort.',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  // Handle wallet text input (import + export confirmation)
  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return next();

    const text = ctx.message.text.trim();

    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      await ctx.reply('❌ Cancelled.', { reply_markup: walletMenuKeyboard() });
      return;
    }

    // Export key confirmation flow
    if (session.action === 'confirm_export') {
      sessions.delete(ctx.from.id);
      if (text !== 'CONFIRM') {
        await ctx.reply('❌ Export cancelled. You must type exactly *CONFIRM* (all caps).', {
          parse_mode: 'Markdown', reply_markup: walletMenuKeyboard(),
        });
        return;
      }
      try {
        const privateKey = await walletService.exportPrivateKey(ctx.from.id);
        await ctx.reply(
          `🔑 *Your Private Key:*\n\n\`${privateKey}\`\n\n` +
          `⚠️ *DELETE THIS MESSAGE NOW!* Never share your key with anyone.`,
          { parse_mode: 'Markdown' }
        );
        await ctx.reply('🔑 Private key sent above. Please delete it after saving.', {
          reply_markup: walletMenuKeyboard(),
        });
      } catch (err) {
        await ctx.reply(`❌ ${err.message}`, { reply_markup: walletMenuKeyboard() });
      }
      return;
    }

    if (session.action !== 'import_wallet') return next();

    sessions.delete(ctx.from.id);

    try {
      const result = await walletService.importWallet(ctx.from.id, ctx.from.username, ctx.from.first_name, text);
      // Try to delete the message containing the private key
      try { await ctx.deleteMessage(); } catch {}
      await ctx.reply(
        `✅ *Wallet Imported!*\n\nAddress: \`${result.publicKey}\`\n\n⚠️ We tried to delete your key message. Verify it's gone.`,
        { parse_mode: 'Markdown', reply_markup: walletMenuKeyboard() }
      );
    } catch (err) {
      try { await ctx.deleteMessage(); } catch {}
      await ctx.reply(`❌ Import failed: ${err.message}`, { reply_markup: walletMenuKeyboard() });
    }
  });

  bot.command('balance', async (ctx) => {
    try {
      const balance = await walletService.getWalletBalance(ctx.from.id);
      const pubkey = await walletService.getPublicKey(ctx.from.id);
      await ctx.reply(
        `💵 Balance: *${balance.toFixed(6)} SOL*\nAddress: \`${pubkey}\``,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  });
}

module.exports = { register, sessions };
