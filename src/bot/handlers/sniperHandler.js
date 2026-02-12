const { sniperMenuKeyboard, mainMenuKeyboard } = require('../menus/mainMenu');
const { createSnipeOrder, getActiveSnipeOrders, updateSnipeOrder } = require('../../database/tradeRepo');

const sessions = new Map();

function register(bot) {
  bot.command('snipe', async (ctx) => {
    await ctx.reply('🎯 *Token Sniper*\n\nSet up automatic buy orders for new token pairs.', {
      parse_mode: 'Markdown',
      reply_markup: sniperMenuKeyboard(),
    });
  });

  bot.callbackQuery('menu:sniper', async (ctx) => {
    await ctx.editMessageText('🎯 *Token Sniper*\n\nSet up automatic buy orders for new pairs.', {
      parse_mode: 'Markdown',
      reply_markup: sniperMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('snipe:new', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'new_snipe', step: 'token' });
    await ctx.editMessageText(
      '🎯 *New Snipe Order*\n\nSend the token mint address (or pair address) to snipe:',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('snipe:list', async (ctx) => {
    const orders = getActiveSnipeOrders().filter(o => o.user_telegram_id === ctx.from.id);
    if (orders.length === 0) {
      await ctx.editMessageText('📋 No active snipe orders.', { reply_markup: sniperMenuKeyboard() });
    } else {
      const list = orders.map((o, i) =>
        `${i + 1}. \`${(o.token_mint || o.pair_address || '').slice(0, 12)}...\`\n` +
        `   Amount: ${o.amount_sol} SOL | Slippage: ${o.slippage_bps} bps`
      ).join('\n\n');
      await ctx.editMessageText(`📋 *Active Snipe Orders*\n\n${list}`, {
        parse_mode: 'Markdown',
        reply_markup: sniperMenuKeyboard(),
      });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('snipe:cancelall', async (ctx) => {
    const orders = getActiveSnipeOrders().filter(o => o.user_telegram_id === ctx.from.id);
    for (const order of orders) {
      updateSnipeOrder(order.id, { status: 'cancelled' });
    }
    await ctx.editMessageText(`✅ Cancelled ${orders.length} snipe order(s).`, {
      reply_markup: sniperMenuKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  // Handle snipe text inputs
  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    if (!session || session.action !== 'new_snipe') return next();

    const text = ctx.message.text.trim();
    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      await ctx.reply('❌ Cancelled.', { reply_markup: sniperMenuKeyboard() });
      return;
    }

    if (session.step === 'token') {
      session.tokenMint = text;
      session.step = 'amount';
      await ctx.reply('How much SOL to spend when sniping?');
      return;
    }

    if (session.step === 'amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Invalid amount. Enter a number:');
        return;
      }
      session.amountSol = amount;
      session.step = 'slippage';
      await ctx.reply('Slippage in bps? (e.g., 300 = 3%, or type "default" for 3%):');
      return;
    }

    if (session.step === 'slippage') {
      const slippage = text.toLowerCase() === 'default' ? 300 : parseInt(text, 10);
      if (isNaN(slippage) || slippage <= 0 || slippage > 5000) {
        await ctx.reply('❌ Invalid slippage. Enter 1–5000:');
        return;
      }

      sessions.delete(ctx.from.id);
      try {
        createSnipeOrder({
          userTelegramId: ctx.from.id,
          tokenMint: session.tokenMint,
          pairAddress: null,
          amountSol: session.amountSol,
          slippageBps: slippage,
        });
        await ctx.reply(
          `✅ *Snipe Order Created!*\n\n` +
          `Token: \`${session.tokenMint}\`\n` +
          `Amount: ${session.amountSol} SOL\n` +
          `Slippage: ${slippage} bps\n\n` +
          `The bot will execute when liquidity is detected.`,
          { parse_mode: 'Markdown', reply_markup: sniperMenuKeyboard() }
        );
      } catch (err) {
        await ctx.reply(`❌ ${err.message}`, { reply_markup: sniperMenuKeyboard() });
      }
      return;
    }

    return next();
  });
}

module.exports = { register, sessions };
