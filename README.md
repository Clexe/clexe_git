# DEX Trading Telegram Bot

A high-performance Telegram bot for Solana DeFi — token launching, DexScreener paid boosts, and DEX trading via Jupiter aggregator.

## Features

- **Wallet Management** — Create, import, export Solana wallets (AES-256-GCM encrypted)
- **Token Launching** — Deploy SPL tokens with custom name, symbol, and supply
- **DexScreener Integration** — Search tokens, view trending, pay for boosts (trending, CTO, profile)
- **DEX Trading** — Buy/sell any Solana token via Jupiter v6 aggregator
- **Token Sniper** — Automated buy orders triggered when liquidity is detected
- **Settings** — Configurable slippage and priority fees per user
- **Admin Panel** — User count, memory, uptime stats
- **Scalable** — WAL-mode SQLite, rate limiting, priority fees, Docker-ready

## Architecture

```
src/
├── index.js                 # Entry point
├── config/                  # Environment config
├── database/                # SQLite DB, migrations, repositories
├── services/
│   ├── walletService.js     # Wallet create/import/export
│   ├── dexscreenerService.js # DexScreener API + paid boosts
│   ├── tokenLaunchService.js # SPL token deployment
│   └── tradingService.js    # Jupiter swap execution
├── bot/
│   ├── handlers/            # Telegram command & callback handlers
│   ├── middleware/           # Rate limiter, auth, error handler
│   └── menus/               # Inline keyboard layouts
├── jobs/                    # Background workers (sniper)
└── utils/                   # Logger, crypto, Solana helpers
```

## Setup

1. **Clone and install:**
   ```bash
   git clone <repo-url> && cd dex-trading-telegram-bot
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Run:**
   ```bash
   npm start        # Production
   npm run dev      # Development with auto-reload
   ```

4. **Docker:**
   ```bash
   docker-compose up -d
   ```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Main menu |
| `/wallet` | Wallet management |
| `/buy <mint> <sol>` | Quick buy token |
| `/sell <mint> <amount>` | Quick sell token |
| `/launch` | Launch a new token |
| `/dex <query>` | DexScreener search |
| `/trending` | View trending tokens |
| `/boost` | Pay for DexScreener boost |
| `/snipe` | Token sniper |
| `/balance` | Check SOL balance |
| `/settings` | Configure slippage & fees |
| `/admin` | Admin panel (admin only) |

## DexScreener Boost Tiers

| Tier | Cost |
|------|------|
| Profile Update | 3 SOL |
| Community Takeover | 5 SOL |
| 1h Trending | 10 SOL |
| 4h Trending | 25 SOL |
| 12h Trending | 50 SOL |
| 24h Trending | 100 SOL |
| Top 24h Trending | 200 SOL |

## Requirements

- Node.js >= 18
- Redis (for future job queue scaling)
- Solana RPC endpoint (Helius, Alchemy, or QuickNode recommended for production)
