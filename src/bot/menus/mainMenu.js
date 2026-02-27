const { InlineKeyboard } = require('grammy');

function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text('💰 Wallet', 'menu:wallet').text('📊 Trading', 'menu:trading').row()
    .text('🚀 Launch Token', 'menu:launch').text('🔥 DexScreener', 'menu:dexscreener').row()
    .text('📈 Trending', 'menu:trending').text('🎯 Sniper', 'menu:sniper').row()
    .text('👁 Tracker', 'menu:tracker').text('🪞 Copy Trade', 'menu:copy').row()
    .text('🤝 Referral', 'menu:referral').row()
    .text('⚙️ Settings', 'menu:settings').text('❓ Help', 'menu:help');
}

function walletMenuKeyboard() {
  return new InlineKeyboard()
    .text('📝 Create Wallet', 'wallet:create').text('📥 Import Wallet', 'wallet:import').row()
    .text('💵 Balance', 'wallet:balance').text('📤 Export Key', 'wallet:export').row()
    .text('🔙 Back', 'menu:main');
}

function tradingMenuKeyboard() {
  return new InlineKeyboard()
    .text('🟢 Buy Token', 'trade:buy').text('🔴 Sell Token', 'trade:sell').row()
    .text('📊 Price Check', 'trade:price').text('💹 Preview Swap', 'trade:preview').row()
    .text('📦 Positions', 'trade:positions').text('📝 Limit Orders', 'trade:limit').row()
    .text('📅 DCA', 'trade:dca').row()
    .text('🔙 Back', 'menu:main');
}

function quickBuyKeyboard(tokenMint) {
  return new InlineKeyboard()
    .text('0.1 SOL', `qbuy:${tokenMint}:0.1`).text('0.5 SOL', `qbuy:${tokenMint}:0.5`).text('1 SOL', `qbuy:${tokenMint}:1`).row()
    .text('2 SOL', `qbuy:${tokenMint}:2`).text('5 SOL', `qbuy:${tokenMint}:5`).text('Custom', `qbuy:${tokenMint}:custom`).row()
    .text('🔙 Back', 'menu:trading');
}

function quickSellKeyboard(tokenMint) {
  return new InlineKeyboard()
    .text('25%', `qsell:${tokenMint}:25`).text('50%', `qsell:${tokenMint}:50`).text('75%', `qsell:${tokenMint}:75`).text('100%', `qsell:${tokenMint}:100`).row()
    .text('Custom', `qsell:${tokenMint}:custom`).row()
    .text('🔙 Back', 'menu:trading');
}

function launchMenuKeyboard() {
  return new InlineKeyboard()
    .text('🆕 New Token', 'launch:new').text('📋 My Launches', 'launch:list').row()
    .text('💧 Add Liquidity', 'launch:liquidity').row()
    .text('🔙 Back', 'menu:main');
}

function dexscreenerMenuKeyboard() {
  return new InlineKeyboard()
    .text('🔎 Search Token', 'dex:search').text('🔥 Trending', 'dex:trending').row()
    .text('⚡ Latest Boosts', 'dex:boosts').text('💎 Pay for Boost', 'dex:pay').row()
    .text('📋 My Payments', 'dex:mypayments').row()
    .text('🔙 Back', 'menu:main');
}

function boostTierKeyboard() {
  return new InlineKeyboard()
    .text('Profile Update (3 SOL)', 'boost:profile_update').row()
    .text('CTO (5 SOL)', 'boost:community_takeover').row()
    .text('1h Trending (10 SOL)', 'boost:trending_boost_1h').row()
    .text('4h Trending (25 SOL)', 'boost:trending_boost_4h').row()
    .text('12h Trending (50 SOL)', 'boost:trending_boost_12h').row()
    .text('24h Trending (100 SOL)', 'boost:trending_boost_24h').row()
    .text('Top 24h (200 SOL)', 'boost:top_trending_24h').row()
    .text('🔙 Back', 'menu:dexscreener');
}

function sniperMenuKeyboard() {
  return new InlineKeyboard()
    .text('🎯 New Snipe Order', 'snipe:new').text('📋 Active Orders', 'snipe:list').row()
    .text('❌ Cancel All', 'snipe:cancelall').row()
    .text('🔙 Back', 'menu:main');
}

function settingsMenuKeyboard(settings = {}) {
  const onOff = (val) => val ? '✅' : '❌';
  const speed = settings.txSpeed || 'turbo';
  return new InlineKeyboard()
    // TX Speed row
    .text(speed === 'fast' ? '[ Fast ]' : 'Fast', 'settings:speed:fast')
    .text(speed === 'turbo' ? '[ Turbo ]' : 'Turbo', 'settings:speed:turbo')
    .text(speed === 'custom' ? '[ Custom ]' : 'Custom', 'settings:speed:custom').row()
    // Sub-menus
    .text('Buy Settings', 'settings:buy').text('Sell Settings', 'settings:sell').row()
    // Active toggles
    .text(`${onOff(settings.autoBuy)} Auto Buy`, 'settings:toggle:autoBuy')
    .text(`${onOff(settings.confirmTrades !== false)} Confirm Trades`, 'settings:toggle:confirmTrades').row()
    .text(`${onOff(settings.pnlCards !== false)} PnL Cards`, 'settings:toggle:pnlCards').row()
    .text('🔙 Back', 'menu:main');
}

function buySettingsKeyboard(settings = {}) {
  const s = settings.buySlippageBps || 300;
  const amounts = settings.buyButtons || [0.1, 0.5, 1, 2, 5];
  return new InlineKeyboard()
    .text(`Slippage: ${s / 100}%`, 'settings:buySlippage').row()
    .text(amounts[0] + ' SOL', 'settings:buyBtn:0').text(amounts[1] + ' SOL', 'settings:buyBtn:1')
    .text(amounts[2] + ' SOL', 'settings:buyBtn:2').row()
    .text(amounts[3] + ' SOL', 'settings:buyBtn:3').text(amounts[4] + ' SOL', 'settings:buyBtn:4').row()
    .text('Edit Buy Buttons', 'settings:editBuyBtns').row()
    .text('🔙 Back', 'menu:settings');
}

function sellSettingsKeyboard(settings = {}) {
  const s = settings.sellSlippageBps || 300;
  const pcts = settings.sellButtons || [25, 50, 75, 100];
  return new InlineKeyboard()
    .text(`Slippage: ${s / 100}%`, 'settings:sellSlippage').row()
    .text(pcts[0] + '%', 'settings:sellBtn:0').text(pcts[1] + '%', 'settings:sellBtn:1')
    .text(pcts[2] + '%', 'settings:sellBtn:2').text(pcts[3] + '%', 'settings:sellBtn:3').row()
    .text('Edit Sell Buttons', 'settings:editSellBtns').row()
    .text('🔙 Back', 'menu:settings');
}

function confirmKeyboard(action) {
  return new InlineKeyboard()
    .text('✅ Confirm', `confirm:${action}`).text('❌ Cancel', 'cancel');
}

module.exports = {
  mainMenuKeyboard,
  walletMenuKeyboard,
  tradingMenuKeyboard,
  quickBuyKeyboard,
  quickSellKeyboard,
  launchMenuKeyboard,
  dexscreenerMenuKeyboard,
  boostTierKeyboard,
  sniperMenuKeyboard,
  settingsMenuKeyboard,
  buySettingsKeyboard,
  sellSettingsKeyboard,
  confirmKeyboard,
};
