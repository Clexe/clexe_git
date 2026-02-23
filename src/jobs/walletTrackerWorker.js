const { getAllActiveWalletTrackers, updateWalletTracker } = require('../database/tradeRepo');
const { getConnection, PublicKey } = require('../utils/solana');
const logger = require('../utils/logger');

let interval = null;

function startWalletTrackerWorker(bot, pollMs = 30000) {
  logger.info({ pollMs }, 'Wallet tracker worker started');
  interval = setInterval(() => processWalletTrackers(bot), pollMs);
}

function stopWalletTrackerWorker() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    logger.info('Wallet tracker worker stopped');
  }
}

async function processWalletTrackers(bot) {
  try {
    const trackers = await getAllActiveWalletTrackers();
    if (trackers.length === 0) return;

    // Group by wallet to avoid duplicate lookups
    const walletMap = {};
    for (const t of trackers) {
      if (!walletMap[t.tracked_wallet]) walletMap[t.tracked_wallet] = [];
      walletMap[t.tracked_wallet].push(t);
    }

    const conn = getConnection();

    for (const [wallet, subscribers] of Object.entries(walletMap)) {
      try {
        const pubkey = new PublicKey(wallet);
        const sigs = await conn.getSignaturesForAddress(pubkey, { limit: 5 });
        if (sigs.length === 0) continue;

        const latestSig = sigs[0].signature;

        for (const tracker of subscribers) {
          if (tracker.last_signature === latestSig) continue;

          // New transactions detected
          const newSigs = [];
          for (const sig of sigs) {
            if (sig.signature === tracker.last_signature) break;
            newSigs.push(sig);
          }

          if (newSigs.length > 0) {
            await updateWalletTracker(tracker.id, { last_signature: latestSig });
            const label = tracker.label || wallet.slice(0, 12) + '...';
            const txList = newSigs.slice(0, 3).map(s =>
              `[${s.signature.slice(0, 12)}...](https://solscan.io/tx/${s.signature})`
            ).join('\n');
            try {
              await bot.api.sendMessage(tracker.user_telegram_id,
                `👁 *Wallet Activity: ${label}*\n\n` +
                `${newSigs.length} new transaction(s):\n${txList}`,
                { parse_mode: 'Markdown', link_preview_is_disabled: true }
              );
            } catch { /* ignore send failure */ }
          }
        }
      } catch (err) {
        logger.error({ err: err.message, wallet }, 'Wallet tracker lookup failed');
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Wallet tracker worker error');
  }
}

module.exports = { startWalletTrackerWorker, stopWalletTrackerWorker };
