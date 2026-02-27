const { getAllActiveCopyTrades } = require('../database/tradeRepo');
const { getConnection, PublicKey } = require('../utils/solana');
const { query } = require('../database/db');
const tradingService = require('../services/tradingService');
const logger = require('../utils/logger');

let interval = null;
const lastSignatures = new Map(); // in-memory cache, seeded from DB on first run

function startCopyTradeWorker(bot, pollMs = 10000) {
  logger.info({ pollMs }, 'Copy trade worker started');
  interval = setInterval(() => processCopyTrades(bot), pollMs);
}

function stopCopyTradeWorker() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    logger.info('Copy trade worker stopped');
  }
}

async function processCopyTrades(bot) {
  try {
    const copies = await getAllActiveCopyTrades();
    if (copies.length === 0) return;

    // Group by target wallet
    const walletMap = {};
    for (const c of copies) {
      if (!walletMap[c.target_wallet]) walletMap[c.target_wallet] = [];
      walletMap[c.target_wallet].push(c);
    }

    const conn = getConnection();

    for (const [wallet, subscribers] of Object.entries(walletMap)) {
      try {
        const pubkey = new PublicKey(wallet);
        const sigs = await conn.getSignaturesForAddress(pubkey, { limit: 3 });
        if (sigs.length === 0) continue;

        const latestSig = sigs[0].signature;

        // Seed from DB on first encounter of this wallet
        if (!lastSignatures.has(wallet)) {
          const dbSig = subscribers[0].last_signature;
          if (dbSig) lastSignatures.set(wallet, dbSig);
        }

        const previousSig = lastSignatures.get(wallet);

        if (previousSig === latestSig) continue;
        lastSignatures.set(wallet, latestSig);

        // Persist to DB so it survives restarts
        try {
          await query(
            'UPDATE copy_trades SET last_signature = $1 WHERE target_wallet = $2 AND active = true',
            [latestSig, wallet]
          );
        } catch (e) {
          logger.warn({ err: e.message, wallet }, 'Failed to persist copy trade signature');
        }

        // Skip on first run (just record the signature)
        if (!previousSig) continue;

        // Parse the latest transaction for swap info
        const txInfo = await conn.getParsedTransaction(latestSig, {
          maxSupportedTransactionVersion: 0,
        });
        if (!txInfo) continue;

        // Look for token swap patterns in instructions
        const instructions = txInfo.transaction?.message?.instructions || [];
        const innerInstructions = txInfo.meta?.innerInstructions || [];

        // Detect Jupiter/swap program calls
        let swapDetected = false;
        let tokenMint = null;

        for (const ix of instructions) {
          const programId = ix.programId?.toBase58?.() || ix.programId;
          // Jupiter v6 program
          if (programId === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' ||
              programId === 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcPX7a') {
            swapDetected = true;
          }
        }

        if (!swapDetected) continue;

        // Try to extract token from post-token balances
        const postTokenBalances = txInfo.meta?.postTokenBalances || [];
        for (const bal of postTokenBalances) {
          if (bal.owner === wallet && bal.mint !== tradingService.SOL_MINT) {
            tokenMint = bal.mint;
            break;
          }
        }

        if (!tokenMint) continue;

        // Determine if it was a buy or sell based on SOL balance change
        const preBalances = txInfo.meta?.preBalances || [];
        const postBalances = txInfo.meta?.postBalances || [];
        const accountKeys = txInfo.transaction?.message?.accountKeys || [];
        let walletIdx = accountKeys.findIndex(k => (k.pubkey?.toBase58?.() || k) === wallet);
        const isBuy = walletIdx >= 0 && postBalances[walletIdx] < preBalances[walletIdx];

        for (const copyConfig of subscribers) {
          if (isBuy && !copyConfig.copy_buys) continue;
          if (!isBuy && !copyConfig.copy_sells) continue;

          try {
            let result;
            if (isBuy) {
              result = await tradingService.buyToken(
                copyConfig.user_telegram_id,
                tokenMint,
                copyConfig.max_sol_per_trade,
                copyConfig.slippage_bps
              );
            } else {
              // Sell all of this token
              const walletService = require('../services/walletService');
              const balance = await walletService.getTokenBalance(copyConfig.user_telegram_id, tokenMint);
              if (!balance || balance.uiAmount <= 0) continue;
              result = await tradingService.sellToken(
                copyConfig.user_telegram_id,
                tokenMint,
                Number(balance.rawAmount),
                copyConfig.slippage_bps
              );
            }

            try {
              await bot.api.sendMessage(copyConfig.user_telegram_id,
                `🪞 *Copy Trade Executed!*\n\n` +
                `${isBuy ? 'Bought' : 'Sold'}: \`${tokenMint.slice(0, 12)}...\`\n` +
                `Copied: \`${wallet.slice(0, 12)}...\`\n` +
                `TX: [Solscan](https://solscan.io/tx/${result.signature})`,
                { parse_mode: 'Markdown', link_preview_is_disabled: true }
              );
            } catch { /* ignore */ }

            logger.info({ userId: copyConfig.user_telegram_id, wallet, tokenMint, isBuy }, 'Copy trade executed');
          } catch (err) {
            logger.error({ err: err.message, userId: copyConfig.user_telegram_id, wallet }, 'Copy trade execution failed');
          }
        }
      } catch (err) {
        logger.error({ err: err.message, wallet }, 'Copy trade wallet check failed');
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Copy trade worker error');
  }
}

module.exports = { startCopyTradeWorker, stopCopyTradeWorker };
