const { dexscreenerMenuKeyboard, boostTierKeyboard, mainMenuKeyboard } = require('../menus/mainMenu');
const dexService = require('../../services/dexscreenerService');
const { getUserDexPayments } = require('../../database/tradeRepo');
const walletService = require('../../services/walletService');

const sessions = new Map();

function register(bot) {
  bot.command('dex', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length > 0) {
      return handleTokenLookup(ctx, args[0]);
    }
    await ctx.reply('🔥 *DexScreener*\n\nSearch tokens, view trending, and pay for boosts.', {
      parse_mode: 'Markdown',
      reply_markup: dexscreenerMenuKeyboard(),
    });
  });

  bot.command('trending', async (ctx) => {
    await showTrending(ctx);
  });

  bot.command('boost', async (ctx) => {
    const pubkey = await walletService.getPublicKey(ctx.from.id);
    if (!pubkey) {
      await ctx.reply('❌ You need a wallet first. Use /wallet to create or import one.');
      return;
    }
    sessions.set(ctx.from.id, { action: 'boost_pay', step: 'token' });
    await ctx.reply('💎 *Pay for Boost*\n\nSend the token mint address:', { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('menu:dexscreener', async (ctx) => {
    await ctx.editMessageText('🔥 *DexScreener*', {
      parse_mode: 'Markdown',
      reply_markup: dexscreenerMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:trending', async (ctx) => {
    await showTrending(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('dex:search', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'dex_search' });
    await ctx.editMessageText('🔎 Send a token name, symbol, or mint address to search:', { parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('dex:trending', async (ctx) => {
    await showTrending(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('dex:boosts', async (ctx) => {
    try {
      const boosts = await dexService.getLatestBoosts();
      if (boosts.length === 0) {
        await ctx.editMessageText('No recent boosts found.', { reply_markup: dexscreenerMenuKeyboard() });
      } else {
        const list = boosts.slice(0, 10).map((b, i) =>
          `${i + 1}. ${b.tokenAddress ? `\`${b.tokenAddress.slice(0, 8)}...\`` : 'N/A'} — ${b.amount || 'N/A'}`
        ).join('\n');
        await ctx.editMessageText(`⚡ *Latest Boosts*\n\n${list}`, {
          parse_mode: 'Markdown',
          reply_markup: dexscreenerMenuKeyboard(),
        });
      }
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: dexscreenerMenuKeyboard() });
    }
  });

  bot.callbackQuery('dex:pay', async (ctx) => {
    const pubkey = await walletService.getPublicKey(ctx.from.id);
    if (!pubkey) {
      await ctx.editMessageText('❌ You need a wallet first. Use /wallet to create or import one.', {
        reply_markup: dexscreenerMenuKeyboard(),
      });
      await ctx.answerCallbackQuery();
      return;
    }
    sessions.set(ctx.from.id, { action: 'boost_pay', step: 'token' });
    await ctx.editMessageText('💎 *Pay for DexScreener Boost*\n\nSend the token mint address:', { parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('dex:mypayments', async (ctx) => {
    const payments = await getUserDexPayments(ctx.from.id);
    if (payments.length === 0) {
      await ctx.editMessageText('📋 No payments yet.', { reply_markup: dexscreenerMenuKeyboard() });
    } else {
      const list = payments.map((p, i) =>
        `${i + 1}. ${p.payment_type} — ${p.amount_sol} SOL — ${p.status}\n` +
        (p.tx_signature ? `   TX: \`${p.tx_signature.slice(0, 16)}...\`` : '')
      ).join('\n');
      await ctx.editMessageText(`📋 *Your Payments*\n\n${list}`, {
        parse_mode: 'Markdown',
        reply_markup: dexscreenerMenuKeyboard(),
      });
    }
    await ctx.answerCallbackQuery();
  });

  // Boost tier selection callbacks
  const boostTiers = Object.keys(dexService.PAYMENT_TIERS);
  for (const tier of boostTiers) {
    bot.callbackQuery(`boost:${tier}`, async (ctx) => {
      const session = sessions.get(ctx.from.id);
      if (!session || !session.tokenMint) {
        await ctx.editMessageText('❌ Session expired. Start again.', { reply_markup: dexscreenerMenuKeyboard() });
        await ctx.answerCallbackQuery();
        return;
      }

      // For profile_update, collect token info before payment
      if (tier === 'profile_update') {
        session.selectedTier = tier;
        session.action = 'profile_update_info';
        session.step = 'icon_url';
        session.tokenInfo = {};
        await ctx.editMessageText(
          '📝 *Token Profile Update*\n\n' +
          'Please provide your token info. This will be included with your payment.\n\n' +
          '*Step 1/5:* Send your token icon URL (or type "skip"):',
          { parse_mode: 'Markdown' }
        );
        await ctx.answerCallbackQuery();
        return;
      }

      const tierInfo = dexService.PAYMENT_TIERS[tier];
      await ctx.editMessageText(`⏳ Processing ${tierInfo.label} payment (${tierInfo.costSol} SOL)...`);
      await ctx.answerCallbackQuery();

      try {
        const result = await dexService.payForDexBoost(ctx.from.id, session.tokenMint, tier);
        sessions.delete(ctx.from.id);
        await ctx.editMessageText(
          `✅ *Boost Payment Sent!*\n\n` +
          `Tier: *${result.tier}*\n` +
          `Amount: *${result.amountSol} SOL*\n` +
          `TX: [Solscan](https://solscan.io/tx/${result.signature})\n\n` +
          `The boost will be applied by the DexScreener team.`,
          { parse_mode: 'Markdown', link_preview_is_disabled: true, reply_markup: dexscreenerMenuKeyboard() }
        );
      } catch (err) {
        await ctx.editMessageText(`❌ Payment failed: ${err.message}`, { reply_markup: dexscreenerMenuKeyboard() });
      }
    });
  }

  // Handle text inputs for dex flows
  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return next();

    const text = ctx.message.text.trim();
    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      await ctx.reply('❌ Cancelled.', { reply_markup: dexscreenerMenuKeyboard() });
      return;
    }

    if (session.action === 'dex_search') {
      sessions.delete(ctx.from.id);
      return handleTokenLookup(ctx, text);
    }

    if (session.action === 'boost_pay' && session.step === 'token') {
      session.tokenMint = text;
      session.step = 'tier';
      await ctx.reply('Select a boost tier:', { reply_markup: boostTierKeyboard() });
      return;
    }

    if (session.action === 'profile_update_info') {
      const skip = text.toLowerCase() === 'skip';

      if (session.step === 'icon_url') {
        session.tokenInfo.iconUrl = skip ? null : text;
        session.step = 'website';
        await ctx.reply('*Step 2/5:* Send your website URL (or type "skip"):', { parse_mode: 'Markdown' });
        return;
      }
      if (session.step === 'website') {
        session.tokenInfo.website = skip ? null : text;
        session.step = 'description';
        await ctx.reply('*Step 3/5:* Send a short description for your token (or type "skip"):', { parse_mode: 'Markdown' });
        return;
      }
      if (session.step === 'description') {
        session.tokenInfo.description = skip ? null : text;
        session.step = 'twitter';
        await ctx.reply('*Step 4/5:* Send your Twitter/X link (or type "skip"):', { parse_mode: 'Markdown' });
        return;
      }
      if (session.step === 'twitter') {
        session.tokenInfo.twitter = skip ? null : text;
        session.step = 'telegram';
        await ctx.reply('*Step 5/5:* Send your Telegram group link (or type "skip"):', { parse_mode: 'Markdown' });
        return;
      }
      if (session.step === 'telegram') {
        session.tokenInfo.telegram = skip ? null : text;

        // Show summary and process payment
        const info = session.tokenInfo;
        const infoLines = [
          info.iconUrl ? `Icon: ${info.iconUrl}` : null,
          info.website ? `Website: ${info.website}` : null,
          info.description ? `Description: ${info.description}` : null,
          info.twitter ? `Twitter: ${info.twitter}` : null,
          info.telegram ? `Telegram: ${info.telegram}` : null,
        ].filter(Boolean);

        const tierInfo = dexService.PAYMENT_TIERS.profile_update;
        await ctx.reply(`⏳ Processing ${tierInfo.label} payment (${tierInfo.costSol} SOL)...`);

        try {
          const result = await dexService.payForDexBoost(ctx.from.id, session.tokenMint, 'profile_update', session.tokenInfo);
          sessions.delete(ctx.from.id);
          await ctx.reply(
            `✅ *Profile Update Payment Sent!*\n\n` +
            `Token: \`${session.tokenMint}\`\n` +
            `Amount: *${result.amountSol} SOL*\n` +
            `TX: [Solscan](https://solscan.io/tx/${result.signature})\n\n` +
            (infoLines.length > 0 ? `*Token Info Submitted:*\n${infoLines.join('\n')}\n\n` : '') +
            `Submit your token info at [DexScreener](https://dexscreener.com/token-update) with the TX signature above.`,
            { parse_mode: 'Markdown', link_preview_is_disabled: true, reply_markup: dexscreenerMenuKeyboard() }
          );
        } catch (err) {
          await ctx.reply(`❌ Payment failed: ${err.message}`, { reply_markup: dexscreenerMenuKeyboard() });
        }
        return;
      }
    }

    return next();
  });
}

async function handleTokenLookup(ctx, query) {
  try {
    const pairs = await dexService.searchTokens(query);
    if (pairs.length === 0) {
      await ctx.reply('No results found.', { reply_markup: dexscreenerMenuKeyboard() });
      return;
    }
    const list = pairs.slice(0, 5).map((p, i) => {
      const name = p.baseToken?.name || 'Unknown';
      const symbol = p.baseToken?.symbol || '?';
      const price = p.priceUsd ? `$${parseFloat(p.priceUsd).toFixed(8)}` : 'N/A';
      const vol = p.volume?.h24 ? `$${Number(p.volume.h24).toLocaleString()}` : 'N/A';
      const liq = p.liquidity?.usd ? `$${Number(p.liquidity.usd).toLocaleString()}` : 'N/A';
      return `${i + 1}. *${name}* (${symbol})\n   Price: ${price} | Vol: ${vol} | Liq: ${liq}\n   \`${p.baseToken?.address || ''}\``;
    }).join('\n\n');
    await ctx.reply(`🔎 *Search Results*\n\n${list}`, {
      parse_mode: 'Markdown',
      reply_markup: dexscreenerMenuKeyboard(),
    });
  } catch (err) {
    await ctx.reply(`❌ ${err.message}`, { reply_markup: dexscreenerMenuKeyboard() });
  }
}

async function showTrending(ctx) {
  try {
    const trending = await dexService.getTrendingTokens();
    if (trending.length === 0) {
      const text = '📈 No trending data available.';
      if (ctx.callbackQuery) {
        await ctx.editMessageText(text, { reply_markup: dexscreenerMenuKeyboard() });
      } else {
        await ctx.reply(text, { reply_markup: dexscreenerMenuKeyboard() });
      }
      return;
    }
    const list = trending.slice(0, 10).map((t, i) =>
      `${i + 1}. \`${(t.tokenAddress || '').slice(0, 12)}...\` — ${t.amount || 'N/A'} boost`
    ).join('\n');
    const text = `📈 *Trending Tokens (DexScreener)*\n\n${list}`;
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: dexscreenerMenuKeyboard() });
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: dexscreenerMenuKeyboard() });
    }
  } catch (err) {
    const text = `❌ ${err.message}`;
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: dexscreenerMenuKeyboard() });
    } else {
      await ctx.reply(text, { reply_markup: dexscreenerMenuKeyboard() });
    }
  }
}

module.exports = { register, sessions };
