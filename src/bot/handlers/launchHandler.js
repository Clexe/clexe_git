const { launchMenuKeyboard, mainMenuKeyboard } = require('../menus/mainMenu');
const tokenLaunchService = require('../../services/tokenLaunchService');
const { SessionStore } = require('../../utils/sessionStore');

const sessions = new SessionStore();

function register(bot) {
  bot.command('launch', async (ctx) => {
    await ctx.reply('🚀 *Token Launcher*\n\nDeploy your own SPL token on Solana.', {
      parse_mode: 'Markdown',
      reply_markup: launchMenuKeyboard(),
    });
  });

  bot.callbackQuery('menu:launch', async (ctx) => {
    await ctx.editMessageText('🚀 *Token Launcher*\n\nDeploy your own SPL token on Solana.', {
      parse_mode: 'Markdown',
      reply_markup: launchMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('launch:new', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'new_launch', step: 'name', data: {} });
    await ctx.editMessageText(
      '🆕 *Create Token — Step 1/4*\n\nEnter the *token name* (e.g., "My Token"):',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('launch:list', async (ctx) => {
    const launches = await tokenLaunchService.getMyLaunches(ctx.from.id);
    if (launches.length === 0) {
      await ctx.editMessageText('📋 No token launches yet.', { reply_markup: launchMenuKeyboard() });
    } else {
      const list = launches.map((l, i) =>
        `${i + 1}. *${l.token_name}* (${l.token_symbol})\n` +
        `   Mint: \`${l.mint_address || 'pending'}\`\n` +
        `   Status: ${l.status}`
      ).join('\n\n');
      await ctx.editMessageText(`📋 *Your Launches*\n\n${list}`, {
        parse_mode: 'Markdown',
        reply_markup: launchMenuKeyboard(),
      });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('launch:liquidity', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'add_liquidity', step: 'launch_id', data: {} });
    await ctx.editMessageText(
      '💧 *Add Liquidity*\n\nEnter the launch ID or token mint address:',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  // Handle launch text input flow
  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return next();

    const text = ctx.message.text.trim();
    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      await ctx.reply('❌ Cancelled.', { reply_markup: launchMenuKeyboard() });
      return;
    }

    if (session.action === 'new_launch') {
      if (session.step === 'name') {
        session.data.tokenName = text;
        session.step = 'symbol';
        await ctx.reply('*Step 2/4* — Enter the *token symbol* (e.g., "MTK", max 10 chars):', { parse_mode: 'Markdown' });
        return;
      }
      if (session.step === 'symbol') {
        if (text.length > 10) {
          await ctx.reply('❌ Symbol must be 10 chars or less. Try again:');
          return;
        }
        session.data.tokenSymbol = text.toUpperCase();
        session.step = 'supply';
        await ctx.reply('*Step 3/4* — Enter the *total supply* (e.g., 1000000000):', { parse_mode: 'Markdown' });
        return;
      }
      if (session.step === 'supply') {
        const supply = parseInt(text.replace(/,/g, ''), 10);
        if (isNaN(supply) || supply <= 0) {
          await ctx.reply('❌ Invalid supply. Enter a positive number:');
          return;
        }
        session.data.totalSupply = supply;
        session.step = 'confirm';
        await ctx.reply(
          `*Step 4/4 — Confirm Launch*\n\n` +
          `Name: *${session.data.tokenName}*\n` +
          `Symbol: *${session.data.tokenSymbol}*\n` +
          `Supply: *${supply.toLocaleString()}*\n` +
          `Decimals: 9\n\n` +
          `Type "yes" to launch or "cancel" to abort.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      if (session.step === 'confirm') {
        if (text.toLowerCase() !== 'yes') {
          sessions.delete(ctx.from.id);
          await ctx.reply('❌ Launch cancelled.', { reply_markup: launchMenuKeyboard() });
          return;
        }
        sessions.delete(ctx.from.id);
        await ctx.reply('⏳ Launching token on Solana...');

        try {
          const result = await tokenLaunchService.launchToken(ctx.from.id, session.data);
          await ctx.reply(
            `🚀 *Token Launched!*\n\n` +
            `Name: *${result.tokenName}*\n` +
            `Symbol: *${result.tokenSymbol}*\n` +
            `Mint: \`${result.mintAddress}\`\n` +
            `Supply: ${result.totalSupply.toLocaleString()}\n` +
            `TX: [Solscan](https://solscan.io/tx/${result.signature})\n\n` +
            `Entire supply minted to your wallet.`,
            { parse_mode: 'Markdown', link_preview_is_disabled: true, reply_markup: launchMenuKeyboard() }
          );
        } catch (err) {
          await ctx.reply(`❌ Launch failed: ${err.message}`, { reply_markup: launchMenuKeyboard() });
        }
        return;
      }
    }

    if (session.action === 'add_liquidity') {
      if (session.step === 'launch_id') {
        session.data.launchId = text;
        session.step = 'amount';
        await ctx.reply('Enter the SOL amount for initial liquidity:');
        return;
      }
      if (session.step === 'amount') {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) {
          await ctx.reply('❌ Invalid amount:');
          return;
        }
        sessions.delete(ctx.from.id);
        try {
          const result = await tokenLaunchService.addLiquidity(ctx.from.id, session.data.launchId, amount);
          await ctx.reply(
            `💧 *Liquidity Request Submitted*\n\n${result.message}`,
            { parse_mode: 'Markdown', reply_markup: launchMenuKeyboard() }
          );
        } catch (err) {
          await ctx.reply(`❌ ${err.message}`, { reply_markup: launchMenuKeyboard() });
        }
        return;
      }
    }

    return next();
  });
}

module.exports = { register, sessions };
