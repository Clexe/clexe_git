const { dexscreenerMenuKeyboard, boostTierKeyboard, mainMenuKeyboard } = require('../menus/mainMenu');
const dexService = require('../../services/dexscreenerService');
const { getUserDexPayments } = require('../../database/tradeRepo');

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
    sessions.set(ctx.from.id, { action: 'boost_pay', step: 'token' });
    await ctx.editMessageText('💎 *Pay for DexScreener Boost*\n\nSend the token mint address:', { parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('dex:mypayments', async (ctx) => {
    const payments = getUserDexPayments(ctx.from.id);
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
