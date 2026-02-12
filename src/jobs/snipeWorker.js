const { getActiveSnipeOrders, updateSnipeOrder } = require('../database/tradeRepo');
const { buyToken } = require('../services/tradingService');
const { getConnection } = require('../utils/solana');
const { PublicKey } = require('@solana/web3.js');
const logger = require('../utils/logger');

let running = false;
let intervalId = null;

async function checkAndExecuteSnipes(bot) {
  if (running) return;
  running = true;

  try {
    const orders = await getActiveSnipeOrders();
    if (orders.length === 0) {
      running = false;
      return;
    }

    const conn = getConnection();

    for (const order of orders) {
      try {
        const mint = order.token_mint;
        if (!mint) continue;

        // Check if token has any liquidity (accounts exist)
        const accounts = await conn.getProgramAccounts(
          new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'), // Raydium AMM
          {
            filters: [{ memcmp: { offset: 400, bytes: mint } }],
            dataSlice: { offset: 0, length: 0 },
          }
        ).catch(() => []);

        if (accounts.length > 0) {
          logger.info({ orderId: order.id, mint }, 'Snipe target has liquidity, executing');
          await updateSnipeOrder(order.id, { status: 'executing', triggered_at: new Date().toISOString() });

          try {
            const result = await buyToken(
              order.user_telegram_id,
              mint,
              order.amount_sol,
              order.slippage_bps
            );
            await updateSnipeOrder(order.id, { status: 'completed', tx_signature: result.signature });

            // Notify user
            try {
              await bot.api.sendMessage(
                order.user_telegram_id,
                `🎯 *Snipe Executed!*\n\nToken: \`${mint}\`\nSpent: ${order.amount_sol} SOL\nTX: [Solscan](https://solscan.io/tx/${result.signature})`,
                { parse_mode: 'Markdown', link_preview_is_disabled: true }
              );
            } catch {}
          } catch (err) {
            await updateSnipeOrder(order.id, { status: 'failed' });
            logger.error({ err: err.message, orderId: order.id }, 'Snipe execution failed');
            try {
              await bot.api.sendMessage(
                order.user_telegram_id,
                `❌ Snipe failed for \`${mint}\`: ${err.message}`,
                { parse_mode: 'Markdown' }
              );
            } catch {}
          }
        }
      } catch (err) {
        logger.error({ err: err.message, orderId: order.id }, 'Snipe check error');
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Snipe worker error');
  }

  running = false;
}

function startSnipeWorker(bot, intervalMs = 5000) {
  logger.info('Snipe worker started');
  intervalId = setInterval(() => checkAndExecuteSnipes(bot), intervalMs);
}

function stopSnipeWorker() {
  if (intervalId) clearInterval(intervalId);
}

module.exports = { startSnipeWorker, stopSnipeWorker };
