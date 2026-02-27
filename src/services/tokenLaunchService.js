const {
  Keypair,
  Transaction,
  SystemProgram,
  PublicKey,
  ComputeBudgetProgram,
} = require('@solana/web3.js');
const {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');
const { getConnection, sendTransactionWithRetry, LAMPORTS_PER_SOL } = require('../utils/solana');
const { getKeypair } = require('./walletService');
const { createTokenLaunch, updateTokenLaunch, getTokenLaunch, getUserLaunches } = require('../database/tradeRepo');
const config = require('../config');
const logger = require('../utils/logger');

async function launchToken(telegramId, params) {
  const {
    tokenName,
    tokenSymbol,
    totalSupply,
    decimals = config.tokenDefaults.decimals,
    metadataUri = '',
    initialLiquiditySol = 0,
  } = params;

  if (!tokenName || !tokenSymbol || !totalSupply) {
    throw new Error('Token name, symbol, and total supply are required.');
  }
  if (tokenSymbol.length > 10) {
    throw new Error('Token symbol must be 10 characters or less.');
  }
  if (totalSupply <= 0) {
    throw new Error('Total supply must be positive.');
  }

  const launchId = await createTokenLaunch({
    creatorTelegramId: telegramId,
    tokenName,
    tokenSymbol,
    decimals,
    totalSupply: String(totalSupply),
    metadataUri,
    initialLiquiditySol,
  });

  try {
    const conn = getConnection();
    const creatorKeypair = await getKeypair(telegramId);
    const mintKeypair = Keypair.generate();

    const lamports = await getMinimumBalanceForRentExemptMint(conn);
    const supplyWithDecimals = BigInt(totalSupply) * BigInt(10 ** decimals);

    const ata = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      creatorKeypair.publicKey
    );

    const tx = new Transaction();

    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: config.trading.priorityFeeLamports,
      })
    );

    // Create mint account
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: creatorKeypair.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    // Initialize mint
    tx.add(
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        creatorKeypair.publicKey,
        creatorKeypair.publicKey
      )
    );

    // Create ATA for creator
    tx.add(
      createAssociatedTokenAccountInstruction(
        creatorKeypair.publicKey,
        ata,
        creatorKeypair.publicKey,
        mintKeypair.publicKey
      )
    );

    // Mint entire supply to creator
    tx.add(
      createMintToInstruction(
        mintKeypair.publicKey,
        ata,
        creatorKeypair.publicKey,
        supplyWithDecimals
      )
    );

    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.feePayer = creatorKeypair.publicKey;

    const signature = await sendTransactionWithRetry(tx, [creatorKeypair, mintKeypair]);

    await updateTokenLaunch(launchId, {
      mint_address: mintKeypair.publicKey.toBase58(),
      tx_signature: signature,
      status: 'minted',
    });

    logger.info({
      telegramId,
      launchId,
      mint: mintKeypair.publicKey.toBase58(),
      signature,
    }, 'Token minted successfully');

    return {
      launchId,
      mintAddress: mintKeypair.publicKey.toBase58(),
      signature,
      tokenName,
      tokenSymbol,
      totalSupply,
      decimals,
    };
  } catch (err) {
    await updateTokenLaunch(launchId, { status: 'failed' });
    logger.error({ err: err.message, telegramId, launchId }, 'Token launch failed');
    throw new Error(`Token launch failed: ${err.message}`);
  }
}

async function addLiquidity(telegramId, launchId, solAmount) {
  const launch = await getTokenLaunch(launchId);
  if (!launch) throw new Error('Launch not found');
  if (launch.creator_telegram_id !== telegramId) throw new Error('Unauthorized');
  if (!launch.mint_address) throw new Error('Token not yet minted');

  // NOTE: On-chain Raydium AMM pool creation is not yet implemented.
  // This records the intent in the database for future implementation.
  throw new Error(
    'Liquidity pool creation is not yet available. ' +
    'You can add liquidity manually via Raydium (raydium.io) using your minted token address: ' +
    launch.mint_address
  );
}

async function getLaunchStatus(launchId) {
  return getTokenLaunch(launchId);
}

async function getMyLaunches(telegramId) {
  return getUserLaunches(telegramId);
}

module.exports = {
  launchToken,
  addLiquidity,
  getLaunchStatus,
  getMyLaunches,
};
