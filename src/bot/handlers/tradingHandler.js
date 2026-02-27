const { tradingMenuKeyboard, mainMenuKeyboard } = require('../menus/mainMenu');
const tradingService = require('../../services/tradingService');
const dexService = require('../../services/dexscreenerService');
const walletService = require('../../services/walletService');
const { scanToken, formatScanWarnings } = require('../../services/tokenScanService');
const { getUserSettings } = require('../../database/userRepo');
const { getOpenPositionByMint } = require('../../database/tradeRepo');
const { withDefaults } = require('./settingsHandler');
const { InlineKeyboard } = require('grammy');

const sessions = new Map();

// Build quick-buy keyboard from user's settings
function userBuyKeyboard(tokenMint, settings) {
  const s = withDefaults(settings);
  const amounts = s.buyButtons || [0.1, 0.5, 1, 2, 5];
  const kb = new InlineKeyboard();
  // Row 1: first 3 buttons
  amounts.slice(0, 3).forEach(a => kb.text(`${a} SOL`, `qbuy:${tokenMint}:${a}`));
  kb.row();
  // Row 2: remaining + custom
  amounts.slice(3).forEach(a => kb.text(`${a} SOL`, `qbuy:${tokenMint}:${a}`));
  kb.text('Custom', `qbuy:${tokenMint}:custom`).row();
  kb.text('🔙 Back', 'menu:trading');
  return kb;
}

// Build quick-sell keyboard from user's settings
function userSellKeyboard(tokenMint, settings) {
  const s = withDefaults(settings);
  const pcts = s.sellButtons || [25, 50, 75, 100];
  const kb = new InlineKeyboard();
  pcts.forEach(p => kb.text(`${p}%`, `qsell:${tokenMint}:${p}`));
  kb.row();
  kb.text('Custom', `qsell:${tokenMint}:custom`).row();
  kb.text('🔙 Back', 'menu:trading');
  return kb;
}

// Check if text looks like a Solana address (base58, 32-44 chars)
function isSolanaAddress(text) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text);
}

// Build a sell holdings keyboard showing all user's tokens
async function buildHoldingsMessage(telegramId) {
  const holdings = await walletService.getAllTokenBalances(telegramId);
  if (!holdings || holdings.length === 0) {
    return { text: '🔴 *Sell Token*\n\nYou have no token holdings.', kb: tradingMenuKeyboard() };
  }

  // Resolve names from DexScreener (parallel, best effort)
  const nameMap = await dexService.resolveTokenNames(holdings.map(h => h.mint));

  const kb = new InlineKeyboard();
  const lines = [];
  for (const h of holdings.slice(0, 10)) {
    const info = nameMap[h.mint];
    const name = info?.name || 'Unknown';
    const symbol = info?.symbol || h.mint.slice(0, 6);
    const balStr = h.balance.toLocaleString(undefined, { maximumFractionDigits: 4 });
    lines.push(`*${name}* (${symbol}) — ${balStr}`);
    kb.text(`Sell ${symbol}`, `sell_pick:${h.mint}`).row();
  }
  kb.text('Enter address manually', 'sell_manual').row();
  kb.text('🔙 Back', 'menu:trading');

  const text = `🔴 *Sell Token*\n\nYour holdings:\n\n${lines.join('\n')}`;
  return { text, kb };
}

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

  // Sell flow — show holdings
  bot.callbackQuery('trade:sell', async (ctx) => {
    try {
      const { text, kb } = await buildHoldingsMessage(ctx.from.id);
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb });
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: tradingMenuKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  // Pick a token from holdings to sell
  bot.callbackQuery(/^sell_pick:/, async (ctx) => {
    const tokenMint = ctx.callbackQuery.data.split(':')[1];
    sessions.set(ctx.from.id, { action: 'sell_token', step: 'amount', tokenMint });
    const settings = withDefaults(await getUserSettings(ctx.from.id));
    try {
      const info = await dexService.getTokenInfo(tokenMint);
      const balInfo = await walletService.getTokenBalance(ctx.from.id, tokenMint);
      if (info) {
        const infoText = dexService.formatTokenInfo(info);
        const balText = balInfo.uiAmount ? `\nYour balance: *${balInfo.uiAmount.toLocaleString()}* tokens` : '';
        await ctx.editMessageText(
          `🔴 *Sell Token*\n\n${infoText}${balText}\n\nSelect % to sell or type custom amount:`,
          { parse_mode: 'Markdown', reply_markup: userSellKeyboard(tokenMint, settings) }
        );
      } else {
        await ctx.editMessageText('Select % to sell or type custom amount:', {
          reply_markup: userSellKeyboard(tokenMint, settings),
        });
      }
    } catch {
      await ctx.editMessageText('Select % to sell or type custom amount:', {
        reply_markup: userSellKeyboard(tokenMint, settings),
      });
    }
    await ctx.answerCallbackQuery();
  });

  // Manual sell address entry
  bot.callbackQuery('sell_manual', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'sell_token', step: 'token' });
    await ctx.editMessageText('🔴 *Sell Token*\n\nSend the token mint address:', { parse_mode: 'Markdown' });
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
    const settings = withDefaults(await getUserSettings(ctx.from.id));
    await ctx.editMessageText(`⏳ Buying ${solAmount} SOL worth...`);
    await ctx.answerCallbackQuery();

    try {
      const result = await tradingService.buyToken(ctx.from.id, tokenMint, solAmount, settings.buySlippageBps);
      const msg = await buildBuyConfirmation(tokenMint, solAmount, result.signature, ctx.from.id);
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
      const settings = withDefaults(await getUserSettings(ctx.from.id));
      const balInfo = await walletService.getTokenBalance(ctx.from.id, tokenMint);
      if (!balInfo || balInfo.uiAmount <= 0) {
        await ctx.editMessageText('❌ No token balance found.', { reply_markup: tradingMenuKeyboard() });
        return;
      }
      // Use raw amount (smallest unit) for Jupiter swap
      const rawBalance = BigInt(balInfo.rawAmount);
      const sellRaw = Number(rawBalance * BigInt(pct) / BigInt(100));
      if (sellRaw <= 0) {
        await ctx.editMessageText('❌ Amount too small to sell.', { reply_markup: tradingMenuKeyboard() });
        return;
      }
      const displayAmount = (balInfo.uiAmount * pct / 100).toFixed(balInfo.decimals > 4 ? 4 : balInfo.decimals);
      await ctx.editMessageText(`⏳ Selling ${pct}% (${displayAmount} tokens)...`);

      const result = await tradingService.sellToken(ctx.from.id, tokenMint, sellRaw, settings.sellSlippageBps);
      const msg = await buildSellConfirmation(tokenMint, pct, displayAmount, result.signature, ctx.from.id, settings);
      await ctx.editMessageText(msg, {
        parse_mode: 'Markdown', link_preview_is_disabled: true, reply_markup: tradingMenuKeyboard(),
      });
    } catch (err) {
      await ctx.editMessageText(`❌ Sell failed: ${err.message}`, { reply_markup: tradingMenuKeyboard() });
    }
  });

  // Sell from position view: psell:<mint>
  bot.callbackQuery(/^psell:/, async (ctx) => {
    const tokenMint = ctx.callbackQuery.data.split(':')[1];
    const settings = await getUserSettings(ctx.from.id);
    sessions.set(ctx.from.id, { action: 'sell_token', step: 'amount', tokenMint });
    try {
      const info = await dexService.getTokenInfo(tokenMint);
      const balInfo = await walletService.getTokenBalance(ctx.from.id, tokenMint);
      if (info) {
        const infoText = dexService.formatTokenInfo(info);
        const balText = balInfo.uiAmount ? `\nYour balance: *${balInfo.uiAmount.toLocaleString()}* tokens` : '';
        await ctx.editMessageText(
          `🔴 *Sell Token*\n\n${infoText}${balText}\n\nSelect % to sell or type custom amount:`,
          { parse_mode: 'Markdown', reply_markup: userSellKeyboard(tokenMint, settings) }
        );
      } else {
        await ctx.editMessageText('Select % to sell or type custom amount:', {
          reply_markup: userSellKeyboard(tokenMint, settings),
        });
      }
    } catch {
      await ctx.editMessageText('Select % to sell or type custom amount:', {
        reply_markup: userSellKeyboard(tokenMint, settings),
      });
    }
    await ctx.answerCallbackQuery();
  });

  // /buy command — step by step, or shorthand /buy <mint> <sol>
  bot.command('buy', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length >= 2) {
      // Shorthand: /buy <mint> <sol>
      const [tokenMint, solAmountStr] = args;
      const solAmount = parseFloat(solAmountStr);
      if (isNaN(solAmount) || solAmount <= 0) {
        await ctx.reply('❌ Invalid SOL amount.');
        return;
      }
      await ctx.reply(`⏳ Buying ${solAmount} SOL worth of \`${tokenMint.slice(0, 8)}...\``, { parse_mode: 'Markdown' });
      try {
        const result = await tradingService.buyToken(ctx.from.id, tokenMint, solAmount);
        const msg = await buildBuyConfirmation(tokenMint, solAmount, result.signature, ctx.from.id);
        await ctx.reply(msg, { parse_mode: 'Markdown', link_preview_is_disabled: true });
      } catch (err) {
        await ctx.reply(`❌ Buy failed: ${err.message}`);
      }
      return;
    }

    if (args.length === 1 && isSolanaAddress(args[0])) {
      // /buy <mint> — skip to amount step
      const tokenMint = args[0];
      sessions.set(ctx.from.id, { action: 'buy_token', step: 'amount', tokenMint });
      const settings = withDefaults(await getUserSettings(ctx.from.id));
      try {
        const info = await dexService.getTokenInfo(tokenMint);
        if (info) {
          const infoText = dexService.formatTokenInfo(info);
          await ctx.reply(
            `🟢 *Buy Token*\n\n${infoText}\n\nSelect amount or type custom SOL amount:`,
            { parse_mode: 'Markdown', reply_markup: userBuyKeyboard(tokenMint, settings) }
          );
          return;
        }
      } catch { /* ignore */ }
      await ctx.reply('How much SOL do you want to spend?', { reply_markup: userBuyKeyboard(tokenMint, settings) });
      return;
    }

    // No args — start step-by-step flow
    sessions.set(ctx.from.id, { action: 'buy_token', step: 'token' });
    await ctx.reply('🟢 *Buy Token*\n\nSend the token mint address:', { parse_mode: 'Markdown' });
  });

  // /sell command — step by step, or shorthand /sell <mint> <amount>
  bot.command('sell', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length >= 2) {
      // Shorthand: /sell <mint> <amount>
      const [tokenMint, amountStr] = args;
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Invalid amount.');
        return;
      }
      await ctx.reply(`⏳ Selling ${amount} of \`${tokenMint.slice(0, 8)}...\``, { parse_mode: 'Markdown' });
      try {
        const result = await tradingService.sellToken(ctx.from.id, tokenMint, Math.round(amount));
        const sellSettings = withDefaults(await getUserSettings(ctx.from.id));
        const msg = await buildSellConfirmation(tokenMint, null, Math.round(amount), result.signature, ctx.from.id, sellSettings);
        await ctx.reply(msg, { parse_mode: 'Markdown', link_preview_is_disabled: true });
      } catch (err) {
        await ctx.reply(`❌ Sell failed: ${err.message}`);
      }
      return;
    }

    if (args.length === 1 && isSolanaAddress(args[0])) {
      // /sell <mint> — skip to amount step
      const tokenMint = args[0];
      sessions.set(ctx.from.id, { action: 'sell_token', step: 'amount', tokenMint });
      const settings = withDefaults(await getUserSettings(ctx.from.id));
      try {
        const info = await dexService.getTokenInfo(tokenMint);
        const balInfo = await walletService.getTokenBalance(ctx.from.id, tokenMint);
        if (info) {
          const infoText = dexService.formatTokenInfo(info);
          const balText = balInfo.uiAmount ? `\nYour balance: *${balInfo.uiAmount.toLocaleString()}* tokens` : '';
          await ctx.reply(
            `🔴 *Sell Token*\n\n${infoText}${balText}\n\nSelect % to sell or type custom amount:`,
            { parse_mode: 'Markdown', reply_markup: userSellKeyboard(tokenMint, settings) }
          );
          return;
        }
      } catch { /* ignore */ }
      await ctx.reply('How many tokens to sell? (raw amount)', { reply_markup: userSellKeyboard(tokenMint, settings) });
      return;
    }

    // No args — show holdings
    try {
      const { text, kb } = await buildHoldingsMessage(ctx.from.id);
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`, { reply_markup: tradingMenuKeyboard() });
    }
  });

  // Handle trading session text inputs + auto-buy on paste
  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    const text = ctx.message.text.trim();

    // Auto-buy: if user pastes a token address with no active session and autoBuy is ON
    if (!session && isSolanaAddress(text)) {
      const settings = withDefaults(await getUserSettings(ctx.from.id));
      if (settings.autoBuy) {
        // Auto-buy with first buy button amount
        const autoAmount = settings.buyButtons?.[0] || 0.1;
        await ctx.reply(`⚡ *Auto Buy* — ${autoAmount} SOL\n\nFetching token info...`, { parse_mode: 'Markdown' });
        try {
          const info = await dexService.getTokenInfo(text);
          if (info) {
            const infoText = dexService.formatTokenInfo(info);
            await ctx.reply(infoText, { parse_mode: 'Markdown' });
          }
          const result = await tradingService.buyToken(ctx.from.id, text, autoAmount);
          const msg = await buildBuyConfirmation(text, autoAmount, result.signature, ctx.from.id);
          await ctx.reply(msg, { parse_mode: 'Markdown', link_preview_is_disabled: true, reply_markup: tradingMenuKeyboard() });
        } catch (err) {
          await ctx.reply(`❌ Auto-buy failed: ${err.message}`, { reply_markup: tradingMenuKeyboard() });
        }
        return;
      }
      // Not autoBuy, but still show token info with buy buttons + security scan
      try {
        const [info, scan] = await Promise.all([
          dexService.getTokenInfo(text).catch(() => null),
          scanToken(text).catch(() => ({ safe: true, warnings: [] })),
        ]);
        if (info) {
          const infoText = dexService.formatTokenInfo(info);
          const scanWarnings = formatScanWarnings(scan.warnings);
          await ctx.reply(
            `📊 *Token Detected*\n\n${infoText}${scanWarnings}\n\n\`${text}\``,
            { parse_mode: 'Markdown', reply_markup: userBuyKeyboard(text, settings) }
          );
          return;
        }
      } catch { /* not a known token, ignore */ }
    }

    if (!session) return next();

    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      await ctx.reply('❌ Cancelled.', { reply_markup: tradingMenuKeyboard() });
      return;
    }

    const settings = withDefaults(await getUserSettings(ctx.from.id));

    if (session.action === 'buy_token') {
      if (session.step === 'token') {
        session.tokenMint = text;
        session.step = 'amount';
        try {
          const info = await dexService.getTokenInfo(text);
          if (info) {
            const infoText = dexService.formatTokenInfo(info);
            await ctx.reply(
              `🟢 *Buy Token*\n\n${infoText}\n\nSelect amount or type custom SOL amount:`,
              { parse_mode: 'Markdown', reply_markup: userBuyKeyboard(text, settings) }
            );
            return;
          }
        } catch { /* ignore */ }
        await ctx.reply('How much SOL do you want to spend?', { reply_markup: userBuyKeyboard(text, settings) });
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
          const msg = await buildBuyConfirmation(session.tokenMint, solAmount, result.signature, ctx.from.id);
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
        try {
          const info = await dexService.getTokenInfo(text);
          const balInfo = await walletService.getTokenBalance(ctx.from.id, text);
          if (info) {
            const infoText = dexService.formatTokenInfo(info);
            const balText = balInfo.uiAmount ? `\nYour balance: *${balInfo.uiAmount.toLocaleString()}* tokens` : '';
            await ctx.reply(
              `🔴 *Sell Token*\n\n${infoText}${balText}\n\nSelect % to sell or type custom amount:`,
              { parse_mode: 'Markdown', reply_markup: userSellKeyboard(text, settings) }
            );
            return;
          }
        } catch { /* ignore */ }
        await ctx.reply('How many tokens to sell? (raw amount)', { reply_markup: userSellKeyboard(text, settings) });
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
          const sellSettings = withDefaults(await getUserSettings(ctx.from.id));
          const msg = await buildSellConfirmation(session.tokenMint, null, Math.round(amount), result.signature, ctx.from.id, sellSettings);
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
            { parse_mode: 'Markdown', reply_markup: userBuyKeyboard(text, settings) }
          );
        } else {
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

// Helper: build buy confirmation message with token info
async function buildBuyConfirmation(tokenMint, solAmount, signature, telegramId) {
  let msg = `✅ *Buy Executed!*\n\n` +
    `Spent: *${solAmount} SOL*\n` +
    `TX: [Solscan](https://solscan.io/tx/${signature})`;
  try {
    const info = await dexService.getTokenInfo(tokenMint);
    if (info) {
      const price = info.priceUsd?.toFixed(10).replace(/0+$/, '0') || 'N/A';
      const mcap = info.marketCap ? `$${Number(info.marketCap).toLocaleString()}` : 'N/A';
      const pc = info.priceChange;
      const fmt = (v) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—';
      msg = `✅ *Bought ${info.name} (${info.symbol})*\n\n` +
        `Spent: *${solAmount} SOL*\n` +
        `Price: $${price}\n` +
        `MCap: ${mcap}\n` +
        `5m: ${fmt(pc.m5)} | 1h: ${fmt(pc.h1)} | 24h: ${fmt(pc.h24)}\n` +
        `TX: [Solscan](https://solscan.io/tx/${signature})`;

      // Show position summary after buy
      if (telegramId) {
        try {
          const position = await getOpenPositionByMint(telegramId, tokenMint);
          if (position) {
            const totalSpent = Number(position.amount_sol_spent || 0).toFixed(4);
            const entryStr = position.entry_price_usd
              ? `$${Number(position.entry_price_usd).toFixed(10).replace(/0+$/, '0')}`
              : 'N/A';
            msg += `\n\n📊 *Position*\n` +
              `Entry: ${entryStr}\n` +
              `Total invested: ${totalSpent} SOL`;
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return msg;
}

// Helper: build sell confirmation message with token info + PnL card
async function buildSellConfirmation(tokenMint, pct, displayAmount, signature, telegramId, settings) {
  const soldLabel = pct ? `*${pct}%* (${displayAmount} tokens)` : `*${displayAmount}* tokens`;
  let msg = `✅ *Sell Executed!*\n\n` +
    `Sold: ${soldLabel}\n` +
    `TX: [Solscan](https://solscan.io/tx/${signature})`;
  try {
    const info = await dexService.getTokenInfo(tokenMint);
    if (info) {
      const price = info.priceUsd?.toFixed(10).replace(/0+$/, '0') || 'N/A';
      const mcap = info.marketCap ? `$${Number(info.marketCap).toLocaleString()}` : 'N/A';
      const pc = info.priceChange;
      const fmt = (v) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—';
      msg = `✅ *Sold ${info.name} (${info.symbol})*\n\n` +
        `Sold: ${soldLabel}\n` +
        `Price: $${price}\n` +
        `MCap: ${mcap}\n` +
        `5m: ${fmt(pc.m5)} | 1h: ${fmt(pc.h1)} | 24h: ${fmt(pc.h24)}\n` +
        `TX: [Solscan](https://solscan.io/tx/${signature})`;

      // PnL card: show entry vs exit price + PnL if position data exists
      if (telegramId && (!settings || settings.pnlCards !== false)) {
        try {
          const position = await getOpenPositionByMint(telegramId, tokenMint);
          if (position && position.entry_price_usd) {
            const entryPrice = Number(position.entry_price_usd);
            const exitPrice = info.priceUsd;
            if (entryPrice > 0 && exitPrice) {
              const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
              const pnlSign = pnlPct >= 0 ? '+' : '';
              const pnlEmoji = pnlPct >= 0 ? '🟢' : '🔴';
              const entryStr = entryPrice.toFixed(10).replace(/0+$/, '0');
              const solSpent = Number(position.amount_sol_spent || 0).toFixed(4);
              msg += `\n\n${pnlEmoji} *PnL Card*\n` +
                `Entry: $${entryStr}\n` +
                `Exit: $${price}\n` +
                `Invested: ${solSpent} SOL\n` +
                `PnL: *${pnlSign}${pnlPct.toFixed(2)}%*`;
            }
          }
        } catch { /* ignore position lookup failure */ }
      }
    }
  } catch { /* ignore */ }
  return msg;
}

module.exports = { register, sessions };
