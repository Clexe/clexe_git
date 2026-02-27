const { tradingMenuKeyboard } = require('../menus/mainMenu');
const { createDcaOrder, getUserDcaOrders, cancelDcaOrder } = require('../../database/tradeRepo');
const { InlineKeyboard } = require('grammy');
const { SessionStore } = require('../../utils/sessionStore');

const sessions = new SessionStore();

const INTERVAL_MAP = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '12h': 43200,
  '24h': 86400,
};

function register(bot) {
  bot.command('dca', async (ctx) => {
    await showDcaMenu(ctx);
  });

  bot.callbackQuery('trade:dca', async (ctx) => {
    await showDcaMenu(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('dca:new', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'dca_new', step: 'token' });
    await ctx.editMessageText('📅 *New DCA Order*\n\nSend the token mint address:', { parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('dca:list', async (ctx) => {
    try {
      const orders = await getUserDcaOrders(ctx.from.id);
      if (orders.length === 0) {
        await ctx.editMessageText('No active DCA orders.', { reply_markup: dcaKeyboard() });
      } else {
        const kb = new InlineKeyboard();
        const lines = orders.map((o, i) => {
          kb.text(`Cancel #${i + 1}`, `dca_cancel:${o.id}`).row();
          const interval = Object.entries(INTERVAL_MAP).find(([, s]) => s === o.interval_seconds)?.[0] || `${o.interval_seconds}s`;
          return `${i + 1}. \`${o.token_mint.slice(0, 8)}...\`\n   ${o.amount_sol_per_order} SOL every ${interval} — ${o.completed_orders}/${o.total_orders} done`;
        }).join('\n\n');
        kb.text('🔙 Back', 'trade:dca');
        await ctx.editMessageText(`📅 *Active DCA Orders*\n\n${lines}`, { parse_mode: 'Markdown', reply_markup: kb });
      }
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: dcaKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dca_cancel:/, async (ctx) => {
    const orderId = ctx.callbackQuery.data.split(':')[1];
    try {
      await cancelDcaOrder(orderId);
      await ctx.editMessageText('✅ DCA order cancelled.', { reply_markup: dcaKeyboard() });
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: dcaKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    if (!session || session.action !== 'dca_new') return next();

    const text = ctx.message.text.trim();
    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      await ctx.reply('❌ Cancelled.', { reply_markup: dcaKeyboard() });
      return;
    }

    if (session.step === 'token') {
      session.tokenMint = text;
      session.step = 'amount';
      await ctx.reply('SOL amount per buy:');
      return;
    }

    if (session.step === 'amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Invalid amount.');
        return;
      }
      session.amountSol = amount;
      session.step = 'interval';
      await ctx.reply('Interval between buys (1m, 5m, 15m, 1h, 4h, 12h, 24h):');
      return;
    }

    if (session.step === 'interval') {
      const seconds = INTERVAL_MAP[text.toLowerCase()];
      if (!seconds) {
        await ctx.reply('❌ Invalid interval. Use: 1m, 5m, 15m, 1h, 4h, 12h, or 24h');
        return;
      }
      session.intervalSeconds = seconds;
      session.step = 'count';
      await ctx.reply('How many total orders?');
      return;
    }

    if (session.step === 'count') {
      const count = parseInt(text, 10);
      if (isNaN(count) || count <= 0 || count > 1000) {
        await ctx.reply('❌ Enter a number between 1 and 1000.');
        return;
      }
      sessions.delete(ctx.from.id);
      try {
        await createDcaOrder({
          userTelegramId: ctx.from.id,
          tokenMint: session.tokenMint,
          amountSolPerOrder: session.amountSol,
          intervalSeconds: session.intervalSeconds,
          totalOrders: count,
        });
        const interval = Object.entries(INTERVAL_MAP).find(([, s]) => s === session.intervalSeconds)?.[0] || `${session.intervalSeconds}s`;
        await ctx.reply(
          `✅ *DCA Order Created*\n\n` +
          `Token: \`${session.tokenMint.slice(0, 12)}...\`\n` +
          `Amount: *${session.amountSol} SOL* x ${count} orders\n` +
          `Interval: every *${interval}*\n` +
          `Total: *${(session.amountSol * count).toFixed(2)} SOL*`,
          { parse_mode: 'Markdown', reply_markup: dcaKeyboard() }
        );
      } catch (err) {
        await ctx.reply(`❌ ${err.message}`, { reply_markup: dcaKeyboard() });
      }
      return;
    }

    return next();
  });
}

async function showDcaMenu(ctx) {
  const text = '📅 *Dollar-Cost Averaging*\n\nAutomatically buy a token at regular intervals.';
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: dcaKeyboard() });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: dcaKeyboard() });
  }
}

function dcaKeyboard() {
  return new InlineKeyboard()
    .text('🆕 New DCA', 'dca:new').text('📋 My DCAs', 'dca:list').row()
    .text('🔙 Back', 'menu:trading');
}

module.exports = { register, sessions };
