const { tradingMenuKeyboard, quickBuyKeyboard, quickSellKeyboard, mainMenuKeyboard } = require('../menus/mainMenu');
const tradingService = require('../../services/tradingService');
const dexService = require('../../services/dexscreenerService');
const walletService = require('../../services/walletService');
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

  // Buy flow — ask for mint, then show token info + quick-buy buttons
  bot.callbackQuery('trade:buy', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'buy_token', step: 'token' });
    await ctx.editMessageText(
      '🟢 *Buy Token*\n\nSend the token mint address:',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  // Sell flow — ask for mint, then show token info + quick-sell buttons
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

  // Quick buy callback: qbuy:<mint>:<amount>
  bot.callbackQuery(/^qbuy:/, async (ctx) => {
    const parts = ctx.callbackQuery.data.split(':');
    const tokenMint = parts[1];
    const amountStr = parts[2];

    if (amountStr === 'custom') {
      sessions.set(ctx.from.id, { action: 'buy_token', step: 'amount', tokenMint });
      await ctx.editMessageText('How much SOL do you want to spend?');
      await ctx.answerCallbackQuery();
      return;
    }

    const solAmount = parseFloat(amountStr);
    await ctx.editMessageText(`⏳ Buying ${solAmount} SOL worth...`);
    await ctx.answerCallbackQuery();

    try {
      const result = await tradingService.buyToken(ctx.from.id, tokenMint, solAmount);
      let msg = `✅ *Buy Executed!*\n\n` +
        `Spent: *${solAmount} SOL*\n` +
        `TX: [Solscan](https://solscan.io/tx/${result.signature})`;
      try {
        const info = await dexService.getTokenInfo(tokenMint);
        if (info) msg = `✅ *Buy Executed — ${info.name} (${info.symbol})*\n\n` +
          `Spent: *${solAmount} SOL*\n` +
          `Price: $${info.priceUsd?.toFixed(10).replace(/0+$/, '0') || 'N/A'}\n` +
          `MCap: $${info.marketCap ? Number(info.marketCap).toLocaleString() : 'N/A'}\n` +
          `TX: [Solscan](https://solscan.io/tx/${result.signature})`;
      } catch { /* ignore info lookup failure */ }
      await ctx.editMessageText(msg, {
        parse_mode: 'Markdown', link_preview_is_disabled: true, reply_markup: tradingMenuKeyboard(),
      });
    } catch (err) {
      await ctx.editMessageText(`❌ Buy failed: ${err.message}`, { reply_markup: tradingMenuKeyboard() });
    }
  });

  // Quick sell callback: qsell:<mint>:<percent>
  bot.callbackQuery(/^qsell:/, async (ctx) => {
    const parts = ctx.callbackQuery.data.split(':');
    const tokenMint = parts[1];
    const pctStr = parts[2];

    if (pctStr === 'custom') {
      sessions.set(ctx.from.id, { action: 'sell_token', step: 'amount', tokenMint });
      await ctx.editMessageText('How many tokens to sell? (raw amount)');
      await ctx.answerCallbackQuery();
      return;
    }

    const pct = parseInt(pctStr, 10);
    await ctx.answerCallbackQuery();

    try {
      const balance = await walletService.getTokenBalance(ctx.from.id, tokenMint);
      if (!balance || balance <= 0) {
        await ctx.editMessageText('❌ No token balance found.', { reply_markup: tradingMenuKeyboard() });
        return;
      }
      const sellAmount = Math.floor(balance * pct / 100);
      if (sellAmount <= 0) {
        await ctx.editMessageText('❌ Amount too small to sell.', { reply_markup: tradingMenuKeyboard() });
        return;
      }
      await ctx.editMessageText(`⏳ Selling ${pct}% (${sellAmount} tokens)...`);

      const result = await tradingService.sellToken(ctx.from.id, tokenMint, sellAmount);
      let msg = `✅ *Sell Executed!*\n\n` +
        `Sold: *${pct}%*\n` +
        `TX: [Solscan](https://solscan.io/tx/${result.signature})`;
      try {
        const info = await dexService.getTokenInfo(tokenMint);
        if (info) msg = `✅ *Sell Executed — ${info.name} (${info.symbol})*\n\n` +
          `Sold: *${pct}%* (${sellAmount} tokens)\n` +
          `Price: $${info.priceUsd?.toFixed(10).replace(/0+$/, '0') || 'N/A'}\n` +
          `MCap: $${info.marketCap ? Number(info.marketCap).toLocaleString() : 'N/A'}\n` +
          `TX: [Solscan](https://solscan.io/tx/${result.signature})`;
      } catch { /* ignore */ }
      await ctx.editMessageText(msg, {
        parse_mode: 'Markdown', link_preview_is_disabled: true, reply_markup: tradingMenuKeyboard(),
      });
    } catch (err) {
      await ctx.editMessageText(`❌ Sell failed: ${err.message}`, { reply_markup: tradingMenuKeyboard() });
    }
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
      let msg = `✅ *Buy Order Executed!*\n\n` +
        `Token: \`${tokenMint}\`\n` +
        `Spent: ${solAmount} SOL\n` +
        `TX: [View on Solscan](https://solscan.io/tx/${result.signature})`;
      try {
        const info = await dexService.getTokenInfo(tokenMint);
        if (info) msg = `✅ *Bought ${info.name} (${info.symbol})*\n\n` +
          `Spent: *${solAmount} SOL*\n` +
          `Price: $${info.priceUsd?.toFixed(10).replace(/0+$/, '0') || 'N/A'}\n` +
          `MCap: $${info.marketCap ? Number(info.marketCap).toLocaleString() : 'N/A'}\n` +
          `TX: [Solscan](https://solscan.io/tx/${result.signature})`;
      } catch { /* ignore */ }
      await ctx.reply(msg, { parse_mode: 'Markdown', link_preview_is_disabled: true });
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
      let msg = `✅ *Sell Order Executed!*\n\n` +
        `Token: \`${tokenMint}\`\n` +
        `TX: [View on Solscan](https://solscan.io/tx/${result.signature})`;
      try {
        const info = await dexService.getTokenInfo(tokenMint);
        if (info) msg = `✅ *Sold ${info.name} (${info.symbol})*\n\n` +
          `Price: $${info.priceUsd?.toFixed(10).replace(/0+$/, '0') || 'N/A'}\n` +
          `MCap: $${info.marketCap ? Number(info.marketCap).toLocaleString() : 'N/A'}\n` +
          `TX: [Solscan](https://solscan.io/tx/${result.signature})`;
      } catch { /* ignore */ }
      await ctx.reply(msg, { parse_mode: 'Markdown', link_preview_is_disabled: true });
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
        // Fetch and display token info with quick-buy buttons
        try {
          const info = await dexService.getTokenInfo(text);
          if (info) {
            const infoText = dexService.formatTokenInfo(info);
            await ctx.reply(
              `🟢 *Buy Token*\n\n${infoText}\n\nSelect amount or type custom SOL amount:`,
              { parse_mode: 'Markdown', reply_markup: quickBuyKeyboard(text) }
            );
            return;
          }
        } catch { /* ignore, fall through to plain prompt */ }
        await ctx.reply('How much SOL do you want to spend?', { reply_markup: quickBuyKeyboard(text) });
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
          let msg = `✅ *Buy Executed!*\n\nTX: [Solscan](https://solscan.io/tx/${result.signature})`;
          try {
            const info = await dexService.getTokenInfo(session.tokenMint);
            if (info) msg = `✅ *Bought ${info.name} (${info.symbol})*\n\n` +
              `Spent: *${solAmount} SOL*\n` +
              `Price: $${info.priceUsd?.toFixed(10).replace(/0+$/, '0') || 'N/A'}\n` +
              `MCap: $${info.marketCap ? Number(info.marketCap).toLocaleString() : 'N/A'}\n` +
              `TX: [Solscan](https://solscan.io/tx/${result.signature})`;
          } catch { /* ignore */ }
          await ctx.reply(msg, {
            parse_mode: 'Markdown', link_preview_is_disabled: true, reply_markup: tradingMenuKeyboard(),
          });
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
        // Fetch and display token info with quick-sell buttons
        try {
          const info = await dexService.getTokenInfo(text);
          const balance = await walletService.getTokenBalance(ctx.from.id, text);
          if (info) {
            const infoText = dexService.formatTokenInfo(info);
            const balText = balance ? `\nYour balance: *${balance.toLocaleString()}* tokens` : '';
            await ctx.reply(
              `🔴 *Sell Token*\n\n${infoText}${balText}\n\nSelect % to sell or type custom amount:`,
              { parse_mode: 'Markdown', reply_markup: quickSellKeyboard(text) }
            );
            return;
          }
        } catch { /* ignore */ }
        await ctx.reply('How many tokens to sell? (raw amount)', { reply_markup: quickSellKeyboard(text) });
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
          let msg = `✅ *Sell Executed!*\n\nTX: [Solscan](https://solscan.io/tx/${result.signature})`;
          try {
            const info = await dexService.getTokenInfo(session.tokenMint);
            if (info) msg = `✅ *Sold ${info.name} (${info.symbol})*\n\n` +
              `Price: $${info.priceUsd?.toFixed(10).replace(/0+$/, '0') || 'N/A'}\n` +
              `MCap: $${info.marketCap ? Number(info.marketCap).toLocaleString() : 'N/A'}\n` +
              `TX: [Solscan](https://solscan.io/tx/${result.signature})`;
          } catch { /* ignore */ }
          await ctx.reply(msg, {
            parse_mode: 'Markdown', link_preview_is_disabled: true, reply_markup: tradingMenuKeyboard(),
          });
        } catch (err) {
          await ctx.reply(`❌ ${err.message}`, { reply_markup: tradingMenuKeyboard() });
        }
        return;
      }
    }

    if (session.action === 'price_check') {
      sessions.delete(ctx.from.id);
      try {
        const info = await dexService.getTokenInfo(text);
        if (info) {
          const infoText = dexService.formatTokenInfo(info);
          await ctx.reply(
            `📊 *Token Info*\n\n${infoText}\n\n\`${text}\``,
            { parse_mode: 'Markdown', reply_markup: quickBuyKeyboard(text) }
          );
        } else {
          // Fallback to Jupiter quote
          const preview = await tradingService.getSwapPreview(
            tradingService.SOL_MINT, text, 1e9, 100
          );
          await ctx.reply(
            `📊 *Price Check (1 SOL)*\n\n` +
            `Output: ${preview.outputAmount}\n` +
            `Price Impact: ${preview.priceImpactPct}%\n` +
            `Route: ${preview.routePlan}`,
            { parse_mode: 'Markdown', reply_markup: tradingMenuKeyboard() }
          );
        }
      } catch (err) {
        await ctx.reply(`❌ ${err.message}`, { reply_markup: tradingMenuKeyboard() });
      }
      return;
    }

    return next();
  });
}

module.exports = { register, sessions };
