const { mainMenuKeyboard } = require('../menus/mainMenu');
const { findUser, upsertUser } = require('../../database/userRepo');
const { createReferral, getReferralsByReferrer, getUserByReferralCode } = require('../../database/tradeRepo');
const { query } = require('../../database/db');
const crypto = require('crypto');
const { InlineKeyboard } = require('grammy');

function register(bot) {
  bot.command('referral', async (ctx) => {
    await showReferralMenu(ctx);
  });

  bot.callbackQuery('menu:referral', async (ctx) => {
    await showReferralMenu(ctx);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('ref:mycode', async (ctx) => {
    try {
      const user = await findUser(ctx.from.id);
      let code = user?.referral_code;
      if (!code) {
        code = crypto.randomBytes(8).toString('hex');
        await query('UPDATE users SET referral_code = $1 WHERE telegram_id = $2', [code, ctx.from.id]);
      }
      const botInfo = ctx.me;
      const link = `https://t.me/${botInfo.username}?start=ref_${code}`;
      await ctx.editMessageText(
        `🔗 *Your Referral Link*\n\n` +
        `\`${link}\`\n\n` +
        `Share this link and earn *30%* of trading fees from your referrals!`,
        { parse_mode: 'Markdown', reply_markup: referralKeyboard() }
      );
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: mainMenuKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('ref:stats', async (ctx) => {
    try {
      const user = await findUser(ctx.from.id);
      const referrals = await getReferralsByReferrer(ctx.from.id);
      const earnings = user?.referral_earnings_sol || 0;
      await ctx.editMessageText(
        `📊 *Referral Stats*\n\n` +
        `Referrals: *${referrals.length}*\n` +
        `Total Earnings: *${earnings.toFixed(4)} SOL*`,
        { parse_mode: 'Markdown', reply_markup: referralKeyboard() }
      );
    } catch (err) {
      await ctx.editMessageText(`❌ ${err.message}`, { reply_markup: mainMenuKeyboard() });
    }
    await ctx.answerCallbackQuery();
  });
}

async function showReferralMenu(ctx) {
  const kb = referralKeyboard();
  const text = '🤝 *Referral Program*\n\n' +
    'Earn *30%* of trading fees from everyone you refer!\n\n' +
    'Get your link and start sharing.';
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
  }
}

function referralKeyboard() {
  return new InlineKeyboard()
    .text('🔗 My Referral Link', 'ref:mycode').row()
    .text('📊 Stats', 'ref:stats').row()
    .text('🔙 Back', 'menu:main');
}

// Process referral code from /start ref_XXXX
async function processReferralStart(ctx, startParam) {
  if (!startParam || !startParam.startsWith('ref_')) return;
  const code = startParam.replace('ref_', '');
  try {
    const referrer = await getUserByReferralCode(code);
    if (!referrer || referrer.telegram_id === ctx.from.id) return;
    await createReferral({
      referrerTelegramId: referrer.telegram_id,
      referredTelegramId: ctx.from.id,
      referralCode: code,
    });
    await query('UPDATE users SET referred_by = $1 WHERE telegram_id = $2 AND referred_by IS NULL', [referrer.telegram_id, ctx.from.id]);
  } catch { /* ignore duplicate referrals */ }
}

module.exports = { register, processReferralStart };
