const { tradingMenuKeyboard, mainMenuKeyboard, confirmKeyboard } = require('../menus/mainMenu');
const tradingService = require('../../services/tradingService');
const { requireWallet } = require('../middleware/auth');

const sessions = new Map();

function register(bot) {
  bot.callbackQuery('menu:trading', async (ctx) => {
    await ctx.editMessageText('📊 *Trading*\n\nBuy and sell tokens via Jupiter aggregator.', {
      parse_mode: 'Markdown',
      reply_markup: tradingMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  // Buy flow
  bot.callbackQuery('trade:buy', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'buy_token', step: 'token' });
    await ctx.editMessageText(
      '🟢 *Buy Token*\n\nSend the token mint address:',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  // Sell flow
  bot.callbackQuery('trade:sell', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'sell_token', step: 'token' });
    await ctx.editMessageText(
      '🔴 *Sell Token*\n\nSend the token mint address:',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  // Price check
  bot.callbackQuery('trade:price', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'price_check', step: 'token' });
    await ctx.editMessageText(
      '📊 *Price Check*\n\nSend the token mint address:',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  // Quick buy command: /buy <mint> <sol_amount>
  bot.command('buy', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
      await ctx.reply('Usage: `/buy <token_mint_address> <sol_amount>`', { parse_mode: 'Markdown' });
      return;
    }
    const [tokenMint, solAmountStr] = args;
    const solAmount = parseFloat(solAmountStr);
    if (isNaN(solAmount) || solAmount <= 0) {
      await ctx.reply('❌ Invalid SOL amount.');
      return;
    }

    await ctx.reply(`⏳ Buying ${solAmount} SOL worth of \`${tokenMint.slice(0, 8)}...\``, { parse_mode: 'Markdown' });

    try {
      const result = await tradingService.buyToken(ctx.from.id, tokenMint, solAmount);
      await ctx.reply(
        `✅ *Buy Order Executed!*\n\n` +
        `Token: \`${tokenMint}\`\n` +
        `Spent: ${solAmount} SOL\n` +
        `TX: [View on Solscan](https://solscan.io/tx/${result.signature})`,
        { parse_mode: 'Markdown', link_preview_is_disabled: true }
      );
    } catch (err) {
      await ctx.reply(`❌ Buy failed: ${err.message}`);
    }
  });

  // Quick sell command: /sell <mint> <token_amount>
  bot.command('sell', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
      await ctx.reply('Usage: `/sell <token_mint_address> <token_amount>`', { parse_mode: 'Markdown' });
      return;
    }
    const [tokenMint, amountStr] = args;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount.');
      return;
    }

    await ctx.reply(`⏳ Selling ${amount} of \`${tokenMint.slice(0, 8)}...\``, { parse_mode: 'Markdown' });

    try {
      const result = await tradingService.sellToken(ctx.from.id, tokenMint, Math.round(amount));
      await ctx.reply(
        `✅ *Sell Order Executed!*\n\n` +
        `Token: \`${tokenMint}\`\n` +
        `TX: [View on Solscan](https://solscan.io/tx/${result.signature})`,
        { parse_mode: 'Markdown', link_preview_is_disabled: true }
      );
    } catch (err) {
      await ctx.reply(`❌ Sell failed: ${err.message}`);
    }
  });

  // Handle trading session text inputs
  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return next();

    const text = ctx.message.text.trim();
    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      await ctx.reply('❌ Cancelled.', { reply_markup: tradingMenuKeyboard() });
      return;
    }

    if (session.action === 'buy_token') {
      if (session.step === 'token') {
        session.tokenMint = text;
        session.step = 'amount';
        await ctx.reply('How much SOL do you want to spend?');
        return;
      }
      if (session.step === 'amount') {
        const solAmount = parseFloat(text);
        if (isNaN(solAmount) || solAmount <= 0) {
          await ctx.reply('❌ Invalid amount. Enter a number:');
          return;
        }
        sessions.delete(ctx.from.id);
        await ctx.reply(`⏳ Buying ${solAmount} SOL worth...`);
        try {
          const result = await tradingService.buyToken(ctx.from.id, session.tokenMint, solAmount);
          await ctx.reply(
            `✅ *Buy Executed!*\n\nTX: [Solscan](https://solscan.io/tx/${result.signature})`,
            { parse_mode: 'Markdown', link_preview_is_disabled: true, reply_markup: tradingMenuKeyboard() }
          );
        } catch (err) {
          await ctx.reply(`❌ ${err.message}`, { reply_markup: tradingMenuKeyboard() });
        }
        return;
      }
    }

    if (session.action === 'sell_token') {
      if (session.step === 'token') {
        session.tokenMint = text;
        session.step = 'amount';
        await ctx.reply('How many tokens to sell? (raw amount)');
        return;
      }
      if (session.step === 'amount') {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) {
          await ctx.reply('❌ Invalid amount. Enter a number:');
          return;
        }
        sessions.delete(ctx.from.id);
        await ctx.reply('⏳ Selling...');
        try {
          const result = await tradingService.sellToken(ctx.from.id, session.tokenMint, Math.round(amount));
          await ctx.reply(
            `✅ *Sell Executed!*\n\nTX: [Solscan](https://solscan.io/tx/${result.signature})`,
            { parse_mode: 'Markdown', link_preview_is_disabled: true, reply_markup: tradingMenuKeyboard() }
          );
        } catch (err) {
          await ctx.reply(`❌ ${err.message}`, { reply_markup: tradingMenuKeyboard() });
        }
        return;
      }
    }

    if (session.action === 'price_check') {
      sessions.delete(ctx.from.id);
      try {
        const preview = await tradingService.getSwapPreview(
          tradingService.SOL_MINT, text, 1e9, 100 // 1 SOL quote
        );
        await ctx.reply(
          `📊 *Price Check (1 SOL)*\n\n` +
          `Output: ${preview.outputAmount}\n` +
          `Price Impact: ${preview.priceImpactPct}%\n` +
          `Route: ${preview.routePlan}`,
          { parse_mode: 'Markdown', reply_markup: tradingMenuKeyboard() }
        );
      } catch (err) {
        await ctx.reply(`❌ ${err.message}`, { reply_markup: tradingMenuKeyboard() });
      }
      return;
    }

    return next();
  });
}

module.exports = { register, sessions };
