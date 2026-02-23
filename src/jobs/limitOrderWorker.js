const { getAllActiveLimitOrders, updateLimitOrder } = require('../database/tradeRepo');
const tradingService = require('../services/tradingService');
const dexService = require('../services/dexscreenerService');
const walletService = require('../services/walletService');
const logger = require('../utils/logger');

let interval = null;

function startLimitOrderWorker(bot, pollMs = 10000) {
  logger.info({ pollMs }, 'Limit order worker started');
  interval = setInterval(() => processLimitOrders(bot), pollMs);
}

function stopLimitOrderWorker() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    logger.info('Limit order worker stopped');
  }
}

async function processLimitOrders(bot) {
  try {
    const orders = await getAllActiveLimitOrders();
    if (orders.length === 0) return;

    // Group by token to batch price lookups
    const tokenGroups = {};
    for (const order of orders) {
      if (!tokenGroups[order.token_mint]) tokenGroups[order.token_mint] = [];
      tokenGroups[order.token_mint].push(order);
    }

    for (const [tokenMint, tokenOrders] of Object.entries(tokenGroups)) {
      let info;
      try {
        info = await dexService.getTokenInfo(tokenMint);
      } catch {
        continue;
      }
      if (!info || !info.priceUsd) continue;

      for (const order of tokenOrders) {
        try {
          const currentPrice = info.priceUsd;
          const triggerPrice = order.trigger_price_usd;
          let shouldTrigger = false;

          if (order.order_type === 'take_profit' && currentPrice >= triggerPrice) {
            shouldTrigger = true;
          } else if (order.order_type === 'stop_loss' && currentPrice <= triggerPrice) {
            shouldTrigger = true;
          } else if (order.order_type === 'limit_buy' && currentPrice <= triggerPrice) {
            shouldTrigger = true;
          }

          if (!shouldTrigger) continue;

          await updateLimitOrder(order.id, { status: 'triggered', triggered_at: new Date().toISOString() });

          let result;
          if (order.order_type === 'limit_buy') {
            const solAmount = order.amount;
            result = await tradingService.buyToken(order.user_telegram_id, tokenMint, solAmount, order.slippage_bps);
          } else {
            // Sell order (TP or SL)
            let sellAmount;
            if (order.amount_type === 'percent') {
              const balance = await walletService.getTokenBalance(order.user_telegram_id, tokenMint);
              sellAmount = Math.floor(balance * order.amount / 100);
            } else {
              sellAmount = Math.round(order.amount);
            }
            if (sellAmount <= 0) {
              await updateLimitOrder(order.id, { status: 'failed' });
              continue;
            }
            result = await tradingService.sellToken(order.user_telegram_id, tokenMint, sellAmount, order.slippage_bps);
          }

          await updateLimitOrder(order.id, { status: 'completed', tx_signature: result.signature });

          const labels = { take_profit: 'Take Profit', stop_loss: 'Stop Loss', limit_buy: 'Limit Buy' };
          try {
            await bot.api.sendMessage(order.user_telegram_id,
              `🎯 *${labels[order.order_type]} Triggered!*\n\n` +
              `Token: *${info.name}* (${info.symbol})\n` +
              `Price: $${currentPrice.toFixed(10).replace(/0+$/, '0')}\n` +
              `TX: [Solscan](https://solscan.io/tx/${result.signature})`,
              { parse_mode: 'Markdown', link_preview_is_disabled: true }
            );
          } catch { /* ignore notification failure */ }

          logger.info({ orderId: order.id, orderType: order.order_type, signature: result.signature }, 'Limit order triggered');
        } catch (err) {
          await updateLimitOrder(order.id, { status: 'failed' });
          logger.error({ err: err.message, orderId: order.id }, 'Limit order execution failed');
        }
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Limit order worker error');
  }
}

module.exports = { startLimitOrderWorker, stopLimitOrderWorker };
