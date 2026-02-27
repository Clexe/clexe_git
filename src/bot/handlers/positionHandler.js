const { tradingMenuKeyboard, quickSellKeyboard } = require('../menus/mainMenu');
const { getOpenPositions, getClosedPositions, closePosition, updatePosition } = require('../../database/tradeRepo');
const walletService = require('../../services/walletService');
const dexService = require('../../services/dexscreenerService');
const { InlineKeyboard } = require('grammy');
const logger = require('../../utils/logger');

function register(bot) {
  bot.command('positions', async (ctx) => {
    await showPositions(ctx);
  });

  bot.callbackQuery('trade:positions', async (ctx) => {
    await showPositions(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('trade:pnl', async (ctx) => {
    await showPnlHistory(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('positions:refresh', async (ctx) => {
    await showPositions(ctx);
    await ctx.answerCallbackQuery('Refreshed');
  });

  bot.callbackQuery('pnl:refresh', async (ctx) => {
    await showPnlHistory(ctx);
    await ctx.answerCallbackQuery('Refreshed');
  });
}

async function showPositions(ctx) {
  try {
    const dbPositions = await getOpenPositions(ctx.from.id);

    // Deduplicate: keep only one position per token_mint
    // Merge duplicates in the background (not on every refresh)
    const mintMap = new Map();
    const mergePromises = [];
    for (const p of dbPositions) {
      const existing = mintMap.get(p.token_mint);
      if (!existing) {
        mintMap.set(p.token_mint, p);
      } else {
        // Merge into the existing entry, close the duplicate in background
        const mergedSol = (Number(existing.amount_sol_spent) || 0) + (Number(p.amount_sol_spent) || 0);
        const mergedTokens = (Number(existing.amount_tokens) || 0) + (Number(p.amount_tokens) || 0);
        existing.amount_sol_spent = mergedSol;
        existing.amount_tokens = mergedTokens;
        mergePromises.push(
          Promise.all([
            updatePosition(existing.id, { amount_sol_spent: mergedSol, amount_tokens: mergedTokens }),
            closePosition(p.id, null, 0, 0),
          ]).catch(err => logger.warn({ err: err.message }, 'Position merge cleanup failed'))
        );
      }
    }
    // Fire-and-forget merge cleanup — don't block the UI
    if (mergePromises.length > 0) {
      Promise.all(mergePromises).catch(() => {});
    }

    // Cross-check with on-chain balances and prune positions with 0 balance
    let onChainBalances = {};
    try {
      const holdings = await walletService.getAllTokenBalances(ctx.from.id);
      for (const h of holdings) {
        onChainBalances[h.mint] = h.balance;
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to fetch on-chain balances for position pruning');
    }

    const activePositions = [];
    for (const [mint, p] of mintMap) {
      const onChainBal = onChainBalances[mint] || 0;
      if (onChainBal <= 0) {
        // Token no longer held — auto-close the stale position
        try {
          const info = await dexService.getTokenInfo(mint).catch(() => null);
          const exitPrice = info?.priceUsd || null;
          const entryPrice = Number(p.entry_price_usd) || 0;
          const pnlPct = entryPrice > 0 && exitPrice ? ((exitPrice - entryPrice) / entryPrice) * 100 : null;
          await closePosition(p.id, exitPrice, null, pnlPct);
        } catch {
          await closePosition(p.id, null, null, null);
        }
        continue;
      }
      p._onChainBalance = onChainBal;
      activePositions.push(p);
    }

    if (activePositions.length === 0) {
      const text = '📦 *No Open Positions*\n\nBuy some tokens to see your positions here.';
      if (ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: tradingMenuKeyboard() });
      } else {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: tradingMenuKeyboard() });
      }
      return;
    }

    // Fetch current prices for all active positions in parallel
    const addresses = activePositions.map(p => p.token_mint);
    const priceMap = {};
    await Promise.all(addresses.map(async (addr) => {
      try {
        const info = await dexService.getTokenInfo(addr);
        if (info) priceMap[addr] = info;
      } catch { /* ignore */ }
    }));

    const lines = activePositions.map((p, i) => {
      const info = priceMap[p.token_mint];
      const name = p.token_name || info?.name || 'Unknown';
      const symbol = p.token_symbol || info?.symbol || '?';
      const currentPrice = info?.priceUsd;
      const entryPrice = Number(p.entry_price_usd) || 0;
      const mcap = info?.marketCap ? `$${Number(info.marketCap).toLocaleString()}` : 'N/A';

      let pnlText = '';
      if (currentPrice && entryPrice > 0) {
        const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
        const sign = pnlPct >= 0 ? '+' : '';
        pnlText = `PnL: *${sign}${pnlPct.toFixed(1)}%*`;
      }

      const spent = p.amount_sol_spent ? `${Number(p.amount_sol_spent).toFixed(3)} SOL` : 'N/A';
      const bal = p._onChainBalance ? p._onChainBalance.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '';

      return `${i + 1}. *${name}* (${symbol})\n` +
        `   Bal: ${bal} | Spent: ${spent}\n` +
        `   MCap: ${mcap} | ${pnlText}`;
    }).join('\n\n');

    const kb = new InlineKeyboard();
    activePositions.slice(0, 5).forEach(p => {
      const label = p.token_symbol || p.token_mint.slice(0, 6);
      kb.text(`Sell ${label}`, `psell:${p.token_mint}`).row();
    });
    kb.text('🔄 Refresh', 'positions:refresh').text('📜 PnL History', 'trade:pnl').row();
    kb.text('🔙 Back', 'menu:trading');

    const text = `📦 *Open Positions (${activePositions.length})*\n\n${lines}`;
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
    }
  } catch (err) {
    const text = `❌ ${err.message}`;
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: tradingMenuKeyboard() });
    } else {
      await ctx.reply(text, { reply_markup: tradingMenuKeyboard() });
    }
  }
}

async function showPnlHistory(ctx) {
  try {
    const closed = await getClosedPositions(ctx.from.id, 10);
    if (closed.length === 0) {
      const text = '📜 *No closed positions yet.*';
      if (ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: tradingMenuKeyboard() });
      } else {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: tradingMenuKeyboard() });
      }
      return;
    }

    let totalPnl = 0;
    const lines = closed.map((p, i) => {
      const name = p.token_name || 'Unknown';
      const symbol = p.token_symbol || '?';
      const pnlPct = p.pnl_pct != null ? `${p.pnl_pct >= 0 ? '+' : ''}${p.pnl_pct.toFixed(1)}%` : 'N/A';
      const pnlSol = p.pnl_sol != null ? `${p.pnl_sol >= 0 ? '+' : ''}${p.pnl_sol.toFixed(4)} SOL` : '';
      if (p.pnl_sol) totalPnl += p.pnl_sol;
      return `${i + 1}. *${name}* (${symbol}) — ${pnlPct} ${pnlSol}`;
    }).join('\n');

    const totalSign = totalPnl >= 0 ? '+' : '';
    const text = `📜 *PnL History*\n\n${lines}\n\n*Total: ${totalSign}${totalPnl.toFixed(4)} SOL*`;
    const pnlKb = new InlineKeyboard()
      .text('🔄 Refresh', 'pnl:refresh').row()
      .text('📦 Positions', 'trade:positions').text('🔙 Back', 'menu:trading');
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: pnlKb });
  } catch (err) {
    await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: tradingMenuKeyboard() });
  }
}

module.exports = { register };
