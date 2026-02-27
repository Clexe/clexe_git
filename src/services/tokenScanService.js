const { getConnection, PublicKey } = require('../utils/solana');
const logger = require('../utils/logger');

/**
 * On-chain token security checks.
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

    // Check if token uses Token-2022 program (may have transfer fees)
    const owner = accountInfo.value.owner?.toBase58?.() || '';
    if (owner === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
      warnings.push('Token-2022 program — may have transfer fees or extensions');
    }

    // Check supply and decimals for anomalies
    const totalSupply = Number(mintData.supply);
    const decimals = mintData.decimals || 0;
    if (totalSupply === 0) {
      warnings.push('Total supply is 0');
    }
    if (decimals === 0 && totalSupply > 0) {
      warnings.push('Token has 0 decimals — may be an NFT or unusual token');
    }

    // Check supply concentration by looking at largest accounts
    try {
      const topHolders = await conn.getTokenLargestAccounts(mintPubkey);
      if (topHolders.value.length > 0 && totalSupply > 0) {
        const topHolderPct = (Number(topHolders.value[0].amount) / totalSupply) * 100;
        if (topHolderPct > 80) {
          warnings.push(`Top holder owns ${topHolderPct.toFixed(1)}% — high rug risk`);
        } else if (topHolderPct > 50) {
          warnings.push(`Top holder owns ${topHolderPct.toFixed(1)}% of supply`);
        }

        // Check if very few holders
        const holdersWithBalance = topHolders.value.filter(h => Number(h.amount) > 0).length;
        if (holdersWithBalance <= 3 && totalSupply > 0) {
          warnings.push(`Only ${holdersWithBalance} holder(s) detected — low distribution`);
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
