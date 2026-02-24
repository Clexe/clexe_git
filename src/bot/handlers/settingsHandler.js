const { settingsMenuKeyboard, buySettingsKeyboard, sellSettingsKeyboard, mainMenuKeyboard } = require('../menus/mainMenu');
const { getUserSettings, updateUserSettings } = require('../../database/userRepo');

const sessions = new Map();

// Default settings schema
const DEFAULTS = {
  txSpeed: 'turbo',        // fast, turbo, custom
  customPriorityFee: 100000,
  buySlippageBps: 300,
  sellSlippageBps: 300,
  buyButtons: [0.1, 0.5, 1, 2, 5],
  sellButtons: [25, 50, 75, 100],
  mevProtectBuy: false,
  mevProtectSell: false,
  autoBuy: false,
  autoSell: false,
  confirmTrades: true,
  pnlCards: true,
  chartPreviews: false,
};

function withDefaults(settings) {
  return { ...DEFAULTS, ...settings };
}

// TX speed -> priority fee mapping
const SPEED_FEES = { fast: 50000, turbo: 200000 };

function getPriorityFee(settings) {
  const s = withDefaults(settings);
  if (s.txSpeed === 'custom') return s.customPriorityFee;
  return SPEED_FEES[s.txSpeed] || SPEED_FEES.turbo;
}

function register(bot) {
  // /settings command
  bot.command('settings', async (ctx) => {
    const settings = withDefaults(await getUserSettings(ctx.from.id));
    await ctx.reply(formatSettingsText(settings), {
      parse_mode: 'Markdown',
      reply_markup: settingsMenuKeyboard(settings),
    });
  });

  // Settings main menu callback
  bot.callbackQuery('menu:settings', async (ctx) => {
    const settings = withDefaults(await getUserSettings(ctx.from.id));
    await ctx.editMessageText(formatSettingsText(settings), {
      parse_mode: 'Markdown',
      reply_markup: settingsMenuKeyboard(settings),
    });
    await ctx.answerCallbackQuery();
  });

  // --- TX Speed presets ---
  bot.callbackQuery(/^settings:speed:/, async (ctx) => {
    const speed = ctx.callbackQuery.data.split(':')[2];
    const settings = withDefaults(await getUserSettings(ctx.from.id));

    if (speed === 'custom') {
      sessions.set(ctx.from.id, { action: 'set_custom_fee' });
      await ctx.editMessageText(
        `Current custom fee: *${settings.customPriorityFee}* microlamports\n\nEnter new priority fee (microlamports):`,
        { parse_mode: 'Markdown' }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    settings.txSpeed = speed;
    await updateUserSettings(ctx.from.id, settings);
    await ctx.editMessageText(formatSettingsText(settings), {
      parse_mode: 'Markdown',
      reply_markup: settingsMenuKeyboard(settings),
    });
    await ctx.answerCallbackQuery(`TX speed: ${speed}`);
  });

  // --- Toggle settings ---
  bot.callbackQuery(/^settings:toggle:/, async (ctx) => {
    const key = ctx.callbackQuery.data.split(':')[2];
    const settings = withDefaults(await getUserSettings(ctx.from.id));

    settings[key] = !settings[key];
    await updateUserSettings(ctx.from.id, settings);

    await ctx.editMessageText(formatSettingsText(settings), {
      parse_mode: 'Markdown',
      reply_markup: settingsMenuKeyboard(settings),
    });
    const label = formatToggleLabel(key);
    await ctx.answerCallbackQuery(`${label}: ${settings[key] ? 'ON' : 'OFF'}`);
  });

  // --- Buy Settings sub-menu ---
  bot.callbackQuery('settings:buy', async (ctx) => {
    const settings = withDefaults(await getUserSettings(ctx.from.id));
    const amounts = settings.buyButtons || DEFAULTS.buyButtons;
    await ctx.editMessageText(
      `🟢 *Buy Settings*\n\n` +
      `Slippage: *${settings.buySlippageBps / 100}%*\n` +
      `Quick buy buttons: ${amounts.map(a => `${a} SOL`).join(' | ')}`,
      { parse_mode: 'Markdown', reply_markup: buySettingsKeyboard(settings) }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('settings:buySlippage', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'set_buy_slippage' });
    await ctx.editMessageText('Enter buy slippage in % (e.g. 3 for 3%):');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('settings:editBuyBtns', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'set_buy_buttons' });
    await ctx.editMessageText(
      'Enter 5 SOL amounts separated by commas:\n(e.g. `0.1, 0.5, 1, 2, 5`)',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  // --- Sell Settings sub-menu ---
  bot.callbackQuery('settings:sell', async (ctx) => {
    const settings = withDefaults(await getUserSettings(ctx.from.id));
    const pcts = settings.sellButtons || DEFAULTS.sellButtons;
    await ctx.editMessageText(
      `🔴 *Sell Settings*\n\n` +
      `Slippage: *${settings.sellSlippageBps / 100}%*\n` +
      `Quick sell buttons: ${pcts.map(p => `${p}%`).join(' | ')}`,
      { parse_mode: 'Markdown', reply_markup: sellSettingsKeyboard(settings) }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('settings:sellSlippage', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'set_sell_slippage' });
    await ctx.editMessageText('Enter sell slippage in % (e.g. 5 for 5%):');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('settings:editSellBtns', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'set_sell_buttons' });
    await ctx.editMessageText(
      'Enter 4 sell percentages separated by commas:\n(e.g. `25, 50, 75, 100`)',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCallbackQuery();
  });

  // Legacy callbacks (keep backward compat)
  bot.callbackQuery('settings:slippage', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'set_buy_slippage' });
    await ctx.editMessageText('Enter slippage in % (e.g. 3 for 3%):');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('settings:fee', async (ctx) => {
    sessions.set(ctx.from.id, { action: 'set_custom_fee' });
    await ctx.editMessageText('Enter priority fee in microlamports (e.g., 100000):');
    await ctx.answerCallbackQuery();
  });

  // --- Text input handler ---
  bot.on('message:text', async (ctx, next) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return next();

    const text = ctx.message.text.trim();
    if (text.toLowerCase() === 'cancel') {
      sessions.delete(ctx.from.id);
      const settings = withDefaults(await getUserSettings(ctx.from.id));
      await ctx.reply('❌ Cancelled.', { reply_markup: settingsMenuKeyboard(settings) });
      return;
    }

    const settings = withDefaults(await getUserSettings(ctx.from.id));

    if (session.action === 'set_custom_fee') {
      const val = parseInt(text, 10);
      if (isNaN(val) || val < 0) {
        await ctx.reply('❌ Must be a positive number:');
        return;
      }
      sessions.delete(ctx.from.id);
      settings.customPriorityFee = val;
      settings.txSpeed = 'custom';
      await updateUserSettings(ctx.from.id, settings);
      await ctx.reply(
        `✅ Custom priority fee: *${val}* microlamports`,
        { parse_mode: 'Markdown', reply_markup: settingsMenuKeyboard(settings) }
      );
      return;
    }

    if (session.action === 'set_buy_slippage') {
      const val = parseFloat(text);
      if (isNaN(val) || val < 0.1 || val > 50) {
        await ctx.reply('❌ Must be 0.1–50:');
        return;
      }
      sessions.delete(ctx.from.id);
      settings.buySlippageBps = Math.round(val * 100);
      await updateUserSettings(ctx.from.id, settings);
      await ctx.reply(
        `✅ Buy slippage: *${val}%*`,
        { parse_mode: 'Markdown', reply_markup: buySettingsKeyboard(settings) }
      );
      return;
    }

    if (session.action === 'set_sell_slippage') {
      const val = parseFloat(text);
      if (isNaN(val) || val < 0.1 || val > 50) {
        await ctx.reply('❌ Must be 0.1–50:');
        return;
      }
      sessions.delete(ctx.from.id);
      settings.sellSlippageBps = Math.round(val * 100);
      await updateUserSettings(ctx.from.id, settings);
      await ctx.reply(
        `✅ Sell slippage: *${val}%*`,
        { parse_mode: 'Markdown', reply_markup: sellSettingsKeyboard(settings) }
      );
      return;
    }

    if (session.action === 'set_buy_buttons') {
      const parts = text.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
      if (parts.length < 3 || parts.length > 6) {
        await ctx.reply('❌ Enter 3–6 valid SOL amounts separated by commas:');
        return;
      }
      sessions.delete(ctx.from.id);
      settings.buyButtons = parts;
      await updateUserSettings(ctx.from.id, settings);
      await ctx.reply(
        `✅ Buy buttons: ${parts.map(a => `${a} SOL`).join(' | ')}`,
        { reply_markup: buySettingsKeyboard(settings) }
      );
      return;
    }

    if (session.action === 'set_sell_buttons') {
      const parts = text.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0 && n <= 100);
      if (parts.length < 2 || parts.length > 5) {
        await ctx.reply('❌ Enter 2–5 valid percentages (1–100):');
        return;
      }
      sessions.delete(ctx.from.id);
      settings.sellButtons = parts;
      await updateUserSettings(ctx.from.id, settings);
      await ctx.reply(
        `✅ Sell buttons: ${parts.map(p => `${p}%`).join(' | ')}`,
        { reply_markup: sellSettingsKeyboard(settings) }
      );
      return;
    }

    return next();
  });
}

function formatSettingsText(s) {
  const speedLabel = { fast: 'Fast', turbo: 'Turbo', custom: `Custom (${s.customPriorityFee})` }[s.txSpeed] || 'Turbo';
  const onOff = (v) => v ? 'ON' : 'OFF';
  return (
    `⚙️ *Settings*\n\n` +
    `*TX Speed:* ${speedLabel}\n` +
    `*Buy Slippage:* ${s.buySlippageBps / 100}%\n` +
    `*Sell Slippage:* ${s.sellSlippageBps / 100}%\n\n` +
    `MEV Protect (Buy): *${onOff(s.mevProtectBuy)}*\n` +
    `MEV Protect (Sell): *${onOff(s.mevProtectSell)}*\n` +
    `Auto Buy: *${onOff(s.autoBuy)}*\n` +
    `Auto Sell: *${onOff(s.autoSell)}*\n` +
    `Confirm Trades: *${onOff(s.confirmTrades)}*\n` +
    `PnL Cards: *${onOff(s.pnlCards)}*\n` +
    `Chart Previews: *${onOff(s.chartPreviews)}*`
  );
}

function formatToggleLabel(key) {
  const labels = {
    mevProtectBuy: 'MEV Protect (Buy)',
    mevProtectSell: 'MEV Protect (Sell)',
    autoBuy: 'Auto Buy',
    autoSell: 'Auto Sell',
    confirmTrades: 'Confirm Trades',
    pnlCards: 'PnL Cards',
    chartPreviews: 'Chart Previews',
  };
  return labels[key] || key;
}

module.exports = { register, sessions, withDefaults, getPriorityFee, DEFAULTS };
