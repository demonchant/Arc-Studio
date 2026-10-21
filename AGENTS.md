# MergePay

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

MergePay is an onchain bounty escrow for open source maintainers. A funder locks USDC for a named contributor wallet linked to a GitHub issue. The funder reviews a pull request and decides whether to release the funds. GitHub data is advisory evidence only. After expiry the funder can reclaim the funds.

## Deployed Contracts

| Contract | Network | Address | Explorer |
|---|---|---|---|
| MergePay | Arc Testnet (Chain ID 5042002) | 0xd22e0efe90d9a92ea9c669acfb610e42a4129e84 | https://explorer.testnet.arc.io/address/0xd22e0efe90d9a92ea9c669acfb610e42a4129e84 |
| MergePay | Arc Mainnet (Chain ID 5042) | 0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470 | https://explorer.arc.io/address/0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470 |

USDC constructor arg (both networks): 0x3600000000000000000000000000000000000000

Mainnet deployment tx: 0x84f060634a466e2b0b915408bf1d561b5c0be88aff31e6b00f66dd304069770f
Mainnet deployment block: 27024790
Mainnet deployer: 0xf7c1F9f31A6D4dc9d725527a0A3819c1274E3245

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Mainnet (Chain ID: 5042) and Arc Testnet (5042002), imported from `viem/chains`
- App currently targets Arc Mainnet. Toggle APP_CHAIN_ID in src/lib/chainConfig.ts to switch.
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, both Arc networks)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
