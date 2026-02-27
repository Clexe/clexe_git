const { tradingMenuKeyboard } = require('../menus/mainMenu');
const { createLimitOrder, getActiveLimitOrders, cancelLimitOrder } = require('../../database/tradeRepo');
const dexService = require('../../services/dexscreenerService');
const { InlineKeyboard } = require('grammy');
const { SessionStore } = require('../../utils/sessionStore');

const sessions = new SessionStore();

function register(bot) {
  bot.callbackQuery('trade:limit', async (ctx) => {
    const kb = new InlineKeyboard()
      .text('Take Profit', 'limit:take_profit').text('Stop Loss', 'limit:stop_loss').row()
      .text('Limit Buy', 'limit:limit_buy').row()
      .text('📋 My Orders', 'limit:list').row()
      .text('🔙 Back', 'menu:trading');
    await ctx.editMessageText('📝 *Limit Orders*\n\nSet automatic take-profit, stop-loss, or limit buy orders.', {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^limit:(take_profit|stop_loss|limit_buy)$/, async (ctx) => {
    const orderType = ctx.callbackQuery.data.split(':')[1];
    const labels = { take_profit: 'Take Profit', stop_loss: 'Stop Loss', limit_buy: 'Limit Buy' };
    sessions.set(ctx.from.id, { action: 'limit_order', orderType, step: 'token' });
    await ctx.editMessageText(`📝 *${labels[orderType]}*\n\nSend the token mint address:`, { parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('limit:list', async (ctx) => {
    try {
      const orders = await getActiveLimitOrders(ctx.from.id);
      if (orders.length === 0) {
        await ctx.editMessageText('📋 No active limit orders.', { reply_markup: tradingMenuKeyboard() });
      } else {
        const kb = new InlineKeyboard();
        const lines = orders.map((o, i) => {
          const label = { take_profit: 'TP', stop_loss: 'SL', limit_buy: 'Buy' }[o.order_type] || o.order_type;
          kb.text(`Cancel #${i + 1}`, `limit_cancel:${o.id}`).row();
          return `${i + 1}. *${label}* — \`${o.token_mint.slice(0, 8)}...\`\n   Trigger: $${o.trigger_price_usd} | Amount: ${o.amount}${o.amount_type === 'percent' ? '%' : ' SOL'}`;
        }).join('\n\n');
        kb.text('🔙 Back', 'trade:limit');
        await ctx.editMessageText(`📋 *Active Limit Orders*\n\n${lines}`, {
          parse_mode: 'Markdown',
          reply_markup: kb,
        });
      }
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: tradingMenuKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^limit_cancel:/, async (ctx) => {
    const orderId = ctx.callbackQuery.data.split(':')[1];
    try {
      await cancelLimitOrder(orderId);
      await ctx.editMessageText('✅ Order cancelled.', { reply_markup: tradingMenuKeyboard() });
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: tradingMenuKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    if (!session || session.action !== 'limit_order') return next();

    const text = ctx.message.text.trim();
    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      await ctx.reply('❌ Cancelled.', { reply_markup: tradingMenuKeyboard() });
      return;
    }

    if (session.step === 'token') {
      session.tokenMint = text;
      session.step = 'price';
      // Show current price
      try {
        const info = await dexService.getTokenInfo(text);
        if (info) {
          const priceStr = info.priceUsd ? `$${info.priceUsd.toFixed(10).replace(/0+$/, '0')}` : 'N/A';
          await ctx.reply(`Current price: ${priceStr}\n\nEnter trigger price (USD):`);
          return;
        }
      } catch { /* ignore */ }
      await ctx.reply('Enter trigger price (USD):');
      return;
    }

    if (session.step === 'price') {
      const price = parseFloat(text.replace('$', ''));
      if (isNaN(price) || price <= 0) {
        await ctx.reply('❌ Invalid price. Enter a number:');
        return;
      }
      session.triggerPrice = price;
      session.step = 'amount';
      if (session.orderType === 'limit_buy') {
        await ctx.reply('Enter SOL amount to buy:');
      } else {
        await ctx.reply('Enter amount to sell (token amount, or type e.g. "50%" for percentage):');
      }
      return;
    }

    if (session.step === 'amount') {
      let amount, amountType = 'absolute';
      if (text.endsWith('%')) {
        amount = parseFloat(text);
        amountType = 'percent';
      } else {
        amount = parseFloat(text);
      }
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Invalid amount.');
        return;
      }

      sessions.delete(ctx.from.id);
      try {
        await createLimitOrder({
          userTelegramId: ctx.from.id,
          tokenMint: session.tokenMint,
          orderType: session.orderType,
          triggerPriceUsd: session.triggerPrice,
          amount,
          amountType,
        });
        const labels = { take_profit: 'Take Profit', stop_loss: 'Stop Loss', limit_buy: 'Limit Buy' };
        await ctx.reply(
          `✅ *${labels[session.orderType]} Order Set*\n\n` +
          `Token: \`${session.tokenMint.slice(0, 12)}...\`\n` +
          `Trigger: $${session.triggerPrice}\n` +
          `Amount: ${amount}${amountType === 'percent' ? '%' : ' SOL'}`,
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
