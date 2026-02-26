const { tradingMenuKeyboard, quickSellKeyboard } = require('../menus/mainMenu');
const { getOpenPositions, getClosedPositions } = require('../../database/tradeRepo');
const dexService = require('../../services/dexscreenerService');
const { InlineKeyboard } = require('grammy');

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
    const positions = await getOpenPositions(ctx.from.id);
    if (positions.length === 0) {
      const text = '📦 *No Open Positions*\n\nBuy some tokens to see your positions here.';
      if (ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: tradingMenuKeyboard() });
      } else {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: tradingMenuKeyboard() });
      }
      return;
    }

    // Fetch current prices for all positions in parallel
    const addresses = [...new Set(positions.map(p => p.token_mint))];
    const priceMap = {};
    await Promise.all(addresses.map(async (addr) => {
      try {
        const info = await dexService.getTokenInfo(addr);
        if (info) priceMap[addr] = info;
      } catch { /* ignore */ }
    }));

    const lines = positions.map((p, i) => {
      const info = priceMap[p.token_mint];
      const name = p.token_name || info?.name || 'Unknown';
      const symbol = p.token_symbol || info?.symbol || '?';
      const currentPrice = info?.priceUsd;
      const entryPrice = p.entry_price_usd;
      const mcap = info?.marketCap ? `$${Number(info.marketCap).toLocaleString()}` : 'N/A';

      let pnlText = '';
      if (currentPrice && entryPrice && entryPrice > 0) {
        const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
        const sign = pnlPct >= 0 ? '+' : '';
        pnlText = `PnL: *${sign}${pnlPct.toFixed(1)}%*`;
      }

      const spent = p.amount_sol_spent ? `${Number(p.amount_sol_spent).toFixed(3)} SOL` : 'N/A';

      return `${i + 1}. *${name}* (${symbol})\n` +
        `   Spent: ${spent} | MCap: ${mcap}\n` +
        `   ${pnlText}`;
    }).join('\n\n');

    const kb = new InlineKeyboard();
    positions.slice(0, 5).forEach(p => {
      const label = p.token_symbol || p.token_mint.slice(0, 6);
      kb.text(`Sell ${label}`, `psell:${p.token_mint}`).row();
    });
    kb.text('🔄 Refresh', 'positions:refresh').text('📜 PnL History', 'trade:pnl').row();
    kb.text('🔙 Back', 'menu:trading');

    const text = `📦 *Open Positions*\n\n${lines}`;
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
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: tradingMenuKeyboard() });
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
