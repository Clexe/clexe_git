const { adminOnly } = require('../middleware/auth');
const { countUsers } = require('../../database/userRepo');
const { mainMenuKeyboard } = require('../menus/mainMenu');

function register(bot) {
  bot.command('admin', adminOnly(), async (ctx) => {
    const userCount = await countUsers();
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);

    await ctx.reply(
      `🔧 *Admin Panel*\n\n` +
      `👥 Total Users: *${userCount}*\n` +
      `⏱ Uptime: *${hours}h ${mins}m*\n` +
      `💾 Memory: *${Math.round(memUsage.heapUsed / 1024 / 1024)}MB* / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB\n` +
      `📊 RSS: *${Math.round(memUsage.rss / 1024 / 1024)}MB*`,
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
    );
  });
}

module.exports = { register };
