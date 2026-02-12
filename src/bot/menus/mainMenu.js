const { InlineKeyboard } = require('grammy');

function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text('💰 Wallet', 'menu:wallet').text('📊 Trading', 'menu:trading').row()
    .text('🚀 Launch Token', 'menu:launch').text('🔥 DexScreener', 'menu:dexscreener').row()
    .text('📈 Trending', 'menu:trending').text('🎯 Sniper', 'menu:sniper').row()
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
    .text('🔙 Back', 'menu:main');
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

function settingsMenuKeyboard() {
  return new InlineKeyboard()
    .text('📊 Slippage', 'settings:slippage').text('⛽ Priority Fee', 'settings:fee').row()
    .text('🔙 Back', 'menu:main');
}

function confirmKeyboard(action) {
  return new InlineKeyboard()
    .text('✅ Confirm', `confirm:${action}`).text('❌ Cancel', 'cancel');
}

module.exports = {
  mainMenuKeyboard,
  walletMenuKeyboard,
  tradingMenuKeyboard,
  launchMenuKeyboard,
  dexscreenerMenuKeyboard,
  boostTierKeyboard,
  sniperMenuKeyboard,
  settingsMenuKeyboard,
  confirmKeyboard,
};
