const { getConnection, PublicKey } = require('../utils/solana');
const logger = require('../utils/logger');

/**
 * Basic on-chain token security checks.
 * Returns { safe: bool, warnings: string[] }
 */
async function scanToken(mintAddress) {
  const warnings = [];
  try {
    const conn = getConnection();
    const mintPubkey = new PublicKey(mintAddress);
    const accountInfo = await conn.getParsedAccountInfo(mintPubkey);

    if (!accountInfo.value) {
      return { safe: false, warnings: ['Token mint account does not exist'] };
    }

    const data = accountInfo.value.data;
    if (!data.parsed) {
      return { safe: true, warnings: ['Could not parse mint data'] };
    }

    const mintData = data.parsed.info;

    // Check mint authority (can create more tokens)
    if (mintData.mintAuthority && mintData.mintAuthority !== null) {
      warnings.push('Mint authority NOT revoked — dev can mint more tokens');
    }

    // Check freeze authority (can freeze token accounts)
    if (mintData.freezeAuthority && mintData.freezeAuthority !== null) {
      warnings.push('Freeze authority active — dev can freeze your tokens');
    }

    // Check supply concentration by looking at largest accounts
    try {
      const topHolders = await conn.getTokenLargestAccounts(mintPubkey);
      if (topHolders.value.length > 0) {
        const totalSupply = Number(mintData.supply);
        if (totalSupply > 0) {
          const topHolderPct = (Number(topHolders.value[0].amount) / totalSupply) * 100;
          if (topHolderPct > 50) {
            warnings.push(`Top holder owns ${topHolderPct.toFixed(1)}% of supply`);
          }
        }
      }
    } catch { /* ignore if largest accounts fails */ }

    return { safe: warnings.length === 0, warnings };
  } catch (err) {
    logger.warn({ err: err.message, mintAddress }, 'Token scan failed');
    return { safe: true, warnings: ['Scan failed — proceed with caution'] };
  }
}

/**
 * Format warnings into a Telegram-friendly string
 */
function formatScanWarnings(warnings) {
  if (!warnings || warnings.length === 0) return '';
  return '\n\n⚠️ *Security Warnings:*\n' + warnings.map(w => `  • ${w}`).join('\n');
}

module.exports = { scanToken, formatScanWarnings };
