const { getActiveDcaOrders, updateDcaOrder } = require('../database/tradeRepo');
const tradingService = require('../services/tradingService');
const logger = require('../utils/logger');

let interval = null;

function startDcaWorker(bot, pollMs = 15000) {
  logger.info({ pollMs }, 'DCA worker started');
  interval = setInterval(() => processDcaOrders(bot), pollMs);
}

function stopDcaWorker() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    logger.info('DCA worker stopped');
  }
}

async function processDcaOrders(bot) {
  try {
    const orders = await getActiveDcaOrders();
    for (const order of orders) {
      try {
        const result = await tradingService.buyToken(
          order.user_telegram_id,
          order.token_mint,
          order.amount_sol_per_order,
          order.slippage_bps
        );

        const newCompleted = order.completed_orders + 1;
        const nextExecution = new Date(Date.now() + order.interval_seconds * 1000);

        if (newCompleted >= order.total_orders) {
          await updateDcaOrder(order.id, {
            completed_orders: newCompleted,
            status: 'completed',
          });
          try {
            await bot.api.sendMessage(order.user_telegram_id,
              `📅 *DCA Complete!*\n\n` +
              `Token: \`${order.token_mint.slice(0, 12)}...\`\n` +
              `${newCompleted}/${order.total_orders} orders done\n` +
              `Total spent: *${(order.amount_sol_per_order * newCompleted).toFixed(2)} SOL*`,
              { parse_mode: 'Markdown' }
            );
          } catch { /* ignore */ }
        } else {
          await updateDcaOrder(order.id, {
            completed_orders: newCompleted,
            next_execution_at: nextExecution.toISOString(),
          });
        }

        logger.info({ orderId: order.id, completed: newCompleted, signature: result.signature }, 'DCA order executed');
      } catch (err) {
        // Don't cancel on failure, just skip this round
        const nextExecution = new Date(Date.now() + order.interval_seconds * 1000);
        await updateDcaOrder(order.id, { next_execution_at: nextExecution.toISOString() });
        logger.error({ err: err.message, orderId: order.id }, 'DCA order execution failed');
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, 'DCA worker error');
  }
}

module.exports = { startDcaWorker, stopDcaWorker };
