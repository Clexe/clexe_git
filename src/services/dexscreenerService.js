const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { sendSol } = require('../utils/solana');
const { getKeypair } = require('./walletService');
const { createDexPayment, updateDexPayment } = require('../database/tradeRepo');
const { calculatePlatformFee, collectPlatformFee } = require('./tradingService');

const api = axios.create({
  baseURL: config.dexscreener.apiUrl,
  timeout: 15000,
});

// DexScreener community-known payment tiers for promoted/trending
const PAYMENT_TIERS = {
  community_takeover: { label: 'Community Takeover', costSol: 5 },
  trending_boost_1h: { label: '1-Hour Trending Boost', costSol: 10 },
  trending_boost_4h: { label: '4-Hour Trending Boost', costSol: 25 },
  trending_boost_12h: { label: '12-Hour Trending Boost', costSol: 50 },
  trending_boost_24h: { label: '24-Hour Trending Boost', costSol: 100 },
  top_trending_24h: { label: '24h Top Trending', costSol: 200 },
  profile_update: { label: 'Token Profile Update', costSol: 3 },
};

async function getTokenPairs(tokenAddress) {
  try {
    const { data } = await api.get(`/latest/dex/tokens/${tokenAddress}`);
    return data.pairs || [];
  } catch (err) {
    logger.error({ err: err.message, tokenAddress }, 'DexScreener token lookup failed');
    throw new Error('Failed to fetch token data from DexScreener');
  }
}

async function getPairInfo(pairAddress) {
  try {
    const { data } = await api.get(`/latest/dex/pairs/solana/${pairAddress}`);
    return data.pair || null;
  } catch (err) {
    logger.error({ err: err.message, pairAddress }, 'DexScreener pair lookup failed');
    throw new Error('Failed to fetch pair data from DexScreener');
  }
}

async function searchTokens(query) {
  try {
    const { data } = await api.get(`/latest/dex/search`, { params: { q: query } });
    return (data.pairs || []).slice(0, 10);
  } catch (err) {
    logger.error({ err: err.message, query }, 'DexScreener search failed');
    throw new Error('Failed to search DexScreener');
  }
}

async function getTrendingTokens() {
  try {
    const { data } = await api.get('/token-boosts/top/v1');
    return (data || []).slice(0, 20);
  } catch (err) {
    logger.error({ err: err.message }, 'DexScreener trending fetch failed');
    return [];
  }
}

async function getLatestBoosts() {
  try {
    const { data } = await api.get('/token-boosts/latest/v1');
    return (data || []).slice(0, 20);
  } catch (err) {
    logger.error({ err: err.message }, 'DexScreener boosts fetch failed');
    return [];
  }
}

async function resolveTokenNames(tokenAddresses) {
  const unique = [...new Set(tokenAddresses)];
  const nameMap = {};
  await Promise.all(unique.map(async (addr) => {
    try {
      const pairs = await getTokenPairs(addr);
      if (pairs.length > 0 && pairs[0].baseToken) {
        nameMap[addr] = {
          name: pairs[0].baseToken.name || 'Unknown',
          symbol: pairs[0].baseToken.symbol || '?',
        };
      }
    } catch {
      // ignore lookup failures
    }
  }));
  return nameMap;
}

function getPaymentTiers() {
  return PAYMENT_TIERS;
}

async function payForDexBoost(telegramId, tokenMint, tierKey, tokenInfo = null) {
  const tier = PAYMENT_TIERS[tierKey];
  if (!tier) throw new Error(`Invalid payment tier: ${tierKey}`);

  if (!config.dexscreener.paymentWallet) {
    throw new Error('DexScreener payment wallet not configured. Contact admin.');
  }

  const paymentId = await createDexPayment({
    userTelegramId: telegramId,
    tokenMint,
    paymentType: tierKey,
    amountSol: tier.costSol,
    tokenInfo,
  });

  try {
    const keypair = await getKeypair(telegramId);
    const signature = await sendSol(keypair, config.dexscreener.paymentWallet, tier.costSol);

    await updateDexPayment(paymentId, {
      tx_signature: signature,
      status: 'completed',
    });

    logger.info({ telegramId, tierKey, signature, paymentId }, 'DEX boost payment sent');

    // Collect 4% platform fee on dex payments
    const feeLamports = Math.round(tier.costSol * 1e9);
    const feeInfo = calculatePlatformFee(feeLamports, config.trading.dexFeeBps);
    await collectPlatformFee(keypair, feeInfo.fee, feeInfo.wallet);

    return {
      paymentId,
      signature,
      tier: tier.label,
      amountSol: tier.costSol,
    };
  } catch (err) {
    await updateDexPayment(paymentId, { status: 'failed' });
    logger.error({ err: err.message, telegramId, tierKey }, 'DEX boost payment failed');
    throw new Error(`Payment failed: ${err.message}`);
  }
}

module.exports = {
  getTokenPairs,
  getPairInfo,
  searchTokens,
  getTrendingTokens,
  getLatestBoosts,
  resolveTokenNames,
  getPaymentTiers,
  payForDexBoost,
  PAYMENT_TIERS,
};
