const axios = require('axios');
const {
  Transaction,
  PublicKey,
  ComputeBudgetProgram,
  VersionedTransaction,
} = require('@solana/web3.js');
const { getConnection, sendTransactionWithRetry, sendSol } = require('../utils/solana');
const { getKeypair } = require('./walletService');
const { createTrade, updateTrade } = require('../database/tradeRepo');
const config = require('../config');
const logger = require('../utils/logger');

const JUPITER_API = 'https://quote-api.jup.ag/v6';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

function calculatePlatformFee(lamports) {
  const feeBps = config.trading.platformFeeBps;
  const feeWallet = config.trading.platformFeeWallet;
  if (!feeBps || !feeWallet) return { fee: 0, wallet: null };
  return {
    fee: Math.floor(lamports * feeBps / 10000),
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
    const { data } = await axios.get(`${JUPITER_API}/quote`, {
      params: {
        inputMint,
        outputMint,
        amount: String(amount),
        slippageBps: slippageBps || config.trading.maxSlippageBps,
        onlyDirectRoutes: false,
      },
      timeout: 10000,
    });
    return data;
  } catch (err) {
    logger.error({ err: err.message, inputMint, outputMint }, 'Jupiter quote failed');
    throw new Error('Failed to get swap quote');
  }
}

async function executeSwap(telegramId, { inputMint, outputMint, amount, slippageBps }) {
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

    const { data: swapData } = await axios.post(`${JUPITER_API}/swap`, {
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: config.trading.priorityFeeLamports,
    }, { timeout: 15000 });

    const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([keypair]);

    const conn = getConnection();
    const signature = await conn.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    await conn.confirmTransaction(signature, config.solana.commitment);

    await updateTrade(tradeId, {
      tx_signature: signature,
      amount_out: quote.outAmount,
      status: 'completed',
    });

    logger.info({ telegramId, tradeId, signature, tradeType }, 'Trade executed');

    // Collect platform fee
    if (tradeType === 'buy') {
      // Fee was already deducted from input; transfer it to platform wallet
      await collectPlatformFee(keypair, feeInfo.fee, feeInfo.wallet);
    } else {
      // For sells, take fee from SOL output
      const sellFeeInfo = calculatePlatformFee(Number(quote.outAmount));
      await collectPlatformFee(keypair, sellFeeInfo.fee, sellFeeInfo.wallet);
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

async function buyToken(telegramId, tokenMint, solAmount, slippageBps) {
  const lamports = Math.round(solAmount * 1e9);
  return executeSwap(telegramId, {
    inputMint: SOL_MINT,
    outputMint: tokenMint,
    amount: lamports,
    slippageBps,
  });
}

async function sellToken(telegramId, tokenMint, tokenAmount, slippageBps) {
  return executeSwap(telegramId, {
    inputMint: tokenMint,
    outputMint: SOL_MINT,
    amount: tokenAmount,
    slippageBps,
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

module.exports = {
  buyToken,
  sellToken,
  getSwapPreview,
  getQuote,
  executeSwap,
  SOL_MINT,
};
