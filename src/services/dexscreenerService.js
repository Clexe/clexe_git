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

async function getTokenInfo(tokenAddress) {
  const pairs = await getTokenPairs(tokenAddress);
  if (!pairs.length) return null;
  // Pick the highest-liquidity pair
  const pair = pairs.reduce((best, p) =>
    (p.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? p : best
  , pairs[0]);
  const base = pair.baseToken || {};
  const pc = pair.priceChange || {};
  return {
    name: base.name || 'Unknown',
    symbol: base.symbol || '?',
    address: base.address || tokenAddress,
    priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : null,
    priceNative: pair.priceNative ? parseFloat(pair.priceNative) : null,
    marketCap: pair.marketCap || pair.fdv || null,
    liquidity: pair.liquidity?.usd || null,
    volume24h: pair.volume?.h24 || null,
    priceChange: {
      m5: pc.m5 != null ? pc.m5 : null,
      h1: pc.h1 != null ? pc.h1 : null,
      h6: pc.h6 != null ? pc.h6 : null,
      h24: pc.h24 != null ? pc.h24 : null,
    },
    pairAddress: pair.pairAddress || null,
    dexId: pair.dexId || null,
  };
}

function formatTokenInfo(info) {
  const price = info.priceUsd != null ? `$${info.priceUsd.toFixed(10).replace(/0+$/, '0')}` : 'N/A';
  const mcap = info.marketCap ? `$${Number(info.marketCap).toLocaleString()}` : 'N/A';
  const liq = info.liquidity ? `$${Number(info.liquidity).toLocaleString()}` : 'N/A';
  const vol = info.volume24h ? `$${Number(info.volume24h).toLocaleString()}` : 'N/A';
  const pc = info.priceChange;
  const fmt = (v) => {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  };
  return (
    `*${info.name}* (${info.symbol})\n` +
    `Price: ${price}\n` +
    `MCap: ${mcap} | Liq: ${liq}\n` +
    `Vol 24h: ${vol}\n` +
    `5m: ${fmt(pc.m5)} | 1h: ${fmt(pc.h1)} | 6h: ${fmt(pc.h6)} | 24h: ${fmt(pc.h24)}`
  );
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
  getTokenInfo,
  formatTokenInfo,
  getPaymentTiers,
  payForDexBoost,
  PAYMENT_TIERS,
};
