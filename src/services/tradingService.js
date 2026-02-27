const axios = require('axios');
const {
  Transaction,
  PublicKey,
  ComputeBudgetProgram,
  VersionedTransaction,
} = require('@solana/web3.js');
const { getConnection, sendTransactionWithRetry, sendSol } = require('../utils/solana');
const { getKeypair } = require('./walletService');
const { createTrade, updateTrade, createPosition, getOpenPositionByMint, updatePosition, closePosition, addReferralEarnings } = require('../database/tradeRepo');
const { findUser } = require('../database/userRepo');
const dexService = require('./dexscreenerService');
const config = require('../config');
const logger = require('../utils/logger');

const SOL_MINT = 'So11111111111111111111111111111111111111112';

function jupiterHeaders() {
  const headers = {};
  if (config.jupiter.apiKey) {
    headers['x-api-key'] = config.jupiter.apiKey;
  }
  return headers;
}

function calculatePlatformFee(lamports, feeBps) {
  const bps = feeBps != null ? feeBps : config.trading.tradingFeeBps;
  const feeWallet = config.trading.platformFeeWallet;
  if (!bps || !feeWallet) return { fee: 0, wallet: null };
  return {
    fee: Math.floor(lamports * bps / 10000),
    wallet: feeWallet,
  };
}

async function collectPlatformFee(keypair, feeLamports, feeWallet) {
  if (!feeLamports || !feeWallet) return null;
  try {
    const solAmount = feeLamports / 1e9;
    const sig = await sendSol(keypair, feeWallet, solAmount);
    logger.info({ fee: solAmount, feeWallet, signature: sig }, 'Platform fee collected');
    return sig;
  } catch (err) {
    logger.error({ err: err.message, feeLamports, feeWallet }, 'Platform fee transfer failed');
    return null;
  }
}

async function getQuote(inputMint, outputMint, amount, slippageBps) {
  try {
    const { data } = await axios.get(`${config.jupiter.apiUrl}/quote`, {
      params: {
        inputMint,
        outputMint,
        amount: String(amount),
        slippageBps: slippageBps || config.trading.maxSlippageBps,
        onlyDirectRoutes: false,
      },
      headers: jupiterHeaders(),
      timeout: 10000,
    });
    return data;
  } catch (err) {
    logger.error({ err: err.message, inputMint, outputMint }, 'Jupiter quote failed');
    throw new Error('Failed to get swap quote');
  }
}

async function executeSwap(telegramId, { inputMint, outputMint, amount, slippageBps, priorityFeeLamports }) {
  const tradeType = inputMint === SOL_MINT ? 'buy' : 'sell';
  const tradeId = await createTrade({
    userTelegramId: telegramId,
    tradeType,
    tokenMint: tradeType === 'buy' ? outputMint : inputMint,
    amountIn: amount,
    slippageBps: slippageBps || config.trading.maxSlippageBps,
  });

  try {
    const keypair = await getKeypair(telegramId);

    // Calculate platform fee for buy orders (deduct from SOL input)
    let swapAmount = amount;
    let feeInfo = { fee: 0, wallet: null };
    if (tradeType === 'buy') {
      feeInfo = calculatePlatformFee(amount);
      swapAmount = amount - feeInfo.fee;
    }

    const quote = await getQuote(inputMint, outputMint, swapAmount, slippageBps);

    const { data: swapData } = await axios.post(`${config.jupiter.apiUrl}/swap`, {
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: priorityFeeLamports || config.trading.priorityFeeLamports,
    }, { headers: jupiterHeaders(), timeout: 15000 });

    const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([keypair]);

    const conn = getConnection();

    // Simulate transaction first to detect honeypots and failing swaps
    const simulation = await conn.simulateTransaction(transaction, {
      commitment: 'processed',
    });
    if (simulation.value.err) {
      const errStr = JSON.stringify(simulation.value.err);
      logger.warn({ telegramId, tradeType, err: errStr }, 'Transaction simulation failed');
      throw new Error(`Swap simulation failed: ${errStr}`);
    }

    const signature = await conn.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true, // we already simulated
      maxRetries: 3,
    });

    // Wait for confirmation and verify actual on-chain success
    const confirmation = await conn.confirmTransaction(signature, config.solana.commitment);
    if (confirmation.value?.err) {
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }

    await updateTrade(tradeId, {
      tx_signature: signature,
      amount_out: quote.outAmount,
      status: 'completed',
    });

    logger.info({ telegramId, tradeId, signature, tradeType }, 'Trade executed');

    // Collect platform fee + referral sharing
    let platformFee = 0;
    if (tradeType === 'buy') {
      platformFee = feeInfo.fee;
      await collectPlatformFee(keypair, feeInfo.fee, feeInfo.wallet);
    } else {
      const sellFeeInfo = calculatePlatformFee(Number(quote.outAmount));
      platformFee = sellFeeInfo.fee;
      await collectPlatformFee(keypair, sellFeeInfo.fee, sellFeeInfo.wallet);
    }

    // Referral fee sharing: 30% of platform fee to referrer
    if (platformFee > 0) {
      try {
        const user = await findUser(telegramId);
        if (user?.referred_by) {
          const referralShare = Math.floor(platformFee * 0.3);
          if (referralShare > 0) {
            const referralSol = referralShare / 1e9;
            const referrer = await findUser(user.referred_by);
            if (referrer?.wallet_public_key) {
              const refSig = await sendSol(keypair, referrer.wallet_public_key, referralSol);
              // Only record earnings after successful transfer
              await addReferralEarnings(user.referred_by, referralSol);
              logger.info({ referrer: user.referred_by, share: referralSol, signature: refSig }, 'Referral fee distributed');
            }
          }
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'Referral fee distribution failed');
      }
    }

    // Position tracking (retry once on failure — this is critical for /positions to work)
    const tokenMint = tradeType === 'buy' ? outputMint : inputMint;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (tradeType === 'buy') {
          await trackBuyPosition(telegramId, tokenMint, amount, quote.outAmount, tradeId);
        } else {
          await trackSellPosition(telegramId, tokenMint, Number(quote.outAmount), amount);
        }
        break; // success
      } catch (err) {
        if (attempt === 0) {
          logger.warn({ err: err.message, tradeId }, 'Position tracking failed, retrying...');
          await new Promise(r => setTimeout(r, 500));
        } else {
          logger.error({ err: err.message, tradeId }, 'Position tracking failed after retry');
        }
      }
    }

    return {
      tradeId,
      signature,
      inputMint,
      outputMint,
      amountIn: amount,
      amountOut: quote.outAmount,
      tradeType,
    };
  } catch (err) {
    await updateTrade(tradeId, { status: 'failed' });
    logger.error({ err: err.message, telegramId, tradeId }, 'Trade failed');
    throw new Error(`Trade failed: ${err.message}`);
  }
}

async function buyToken(telegramId, tokenMint, solAmount, slippageBps, priorityFeeLamports) {
  const lamports = Math.round(solAmount * 1e9);
  return executeSwap(telegramId, {
    inputMint: SOL_MINT,
    outputMint: tokenMint,
    amount: lamports,
    slippageBps,
    priorityFeeLamports,
  });
}

async function sellToken(telegramId, tokenMint, tokenAmount, slippageBps, priorityFeeLamports) {
  return executeSwap(telegramId, {
    inputMint: tokenMint,
    outputMint: SOL_MINT,
    amount: tokenAmount,
    slippageBps,
    priorityFeeLamports,
  });
}

async function getSwapPreview(inputMint, outputMint, amount, slippageBps) {
  const quote = await getQuote(inputMint, outputMint, amount, slippageBps);
  return {
    inputAmount: quote.inAmount,
    outputAmount: quote.outAmount,
    priceImpactPct: quote.priceImpactPct,
    routePlan: (quote.routePlan || []).map((r) => r.swapInfo?.label || 'Unknown').join(' → '),
    minimumReceived: quote.otherAmountThreshold,
  };
}

// Track a buy by creating or updating an open position
async function trackBuyPosition(telegramId, tokenMint, lamportsSpent, tokensReceived, tradeId) {
  const solSpent = lamportsSpent / 1e9;
  const tokens = Number(tokensReceived);

  // Fetch current price from DexScreener
  let priceUsd = null;
  let priceSol = null;
  let name = null;
  let symbol = null;
  try {
    const info = await dexService.getTokenInfo(tokenMint);
    if (info) {
      priceUsd = info.priceUsd;
      priceSol = info.priceNative;
      name = info.name;
      symbol = info.symbol;
    }
  } catch { /* ignore */ }

  // Check if there's an existing open position for this token
  const existing = await getOpenPositionByMint(telegramId, tokenMint);
  if (existing) {
    // Average into existing position
    const oldTokens = Number(existing.amount_tokens) || 0;
    const oldSolSpent = Number(existing.amount_sol_spent) || 0;
    const newTokens = oldTokens + tokens;
    const newSolSpent = oldSolSpent + solSpent;
    // Weighted average entry price
    const newEntryUsd = priceUsd
      ? ((Number(existing.entry_price_usd) || 0) * oldSolSpent + priceUsd * solSpent) / newSolSpent
      : existing.entry_price_usd;
    await updatePosition(existing.id, {
      amount_tokens: newTokens,
      amount_sol_spent: newSolSpent,
      entry_price_usd: newEntryUsd,
    });
  } else {
    await createPosition({
      userTelegramId: telegramId,
      tokenMint,
      tokenName: name,
      tokenSymbol: symbol,
      entryPriceUsd: priceUsd,
      entryPriceSol: priceSol,
      amountTokens: tokens,
      amountSolSpent: solSpent,
      tradeId,
    });
  }
}

// Track a sell by closing or reducing an open position
async function trackSellPosition(telegramId, tokenMint, solReceived, tokensSold) {
  const existing = await getOpenPositionByMint(telegramId, tokenMint);
  if (!existing) return; // No position to close

  const oldTokens = Number(existing.amount_tokens) || 0;
  const sold = Number(tokensSold);
  const remaining = oldTokens - sold;

  // Get current price for PnL calculation
  let exitPriceUsd = null;
  try {
    const info = await dexService.getTokenInfo(tokenMint);
    if (info) exitPriceUsd = info.priceUsd;
  } catch { /* ignore */ }

  if (remaining <= 0) {
    // Fully closed position
    const entryPrice = Number(existing.entry_price_usd) || 0;
    const pnlPct = entryPrice > 0 && exitPriceUsd ? ((exitPriceUsd - entryPrice) / entryPrice) * 100 : null;
    const pnlSol = (solReceived / 1e9) - Number(existing.amount_sol_spent);
    await closePosition(existing.id, exitPriceUsd, pnlSol, pnlPct);
  } else {
    // Partially sold — reduce position
    const proportionSold = sold / oldTokens;
    const solSpentReduced = Number(existing.amount_sol_spent) * (1 - proportionSold);
    await updatePosition(existing.id, {
      amount_tokens: remaining,
      amount_sol_spent: solSpentReduced,
    });
  }
}

module.exports = {
  buyToken,
  sellToken,
  getSwapPreview,
  getQuote,
  executeSwap,
  calculatePlatformFee,
  collectPlatformFee,
  SOL_MINT,
};
