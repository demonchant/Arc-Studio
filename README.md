# MergePay

An onchain bounty escrow for open source maintainers, built on Arc with USDC.

A funder locks a fixed USDC amount for one named contributor wallet, linked to a GitHub issue. The funder personally reviews a merged pull request and decides whether to release the funds. GitHub data is advisory evidence only — a merged PR never triggers payment automatically.

Built with [Arc Studio](https://studio.arc.io).

---

## How it works

1. **Create a bounty** — Enter a GitHub repo URL, issue number, contributor wallet, USDC amount, and expiry. The app fetches the real GitHub issue and shows it for review. After you confirm, it pulls the exact USDC from your wallet into the contract.

2. **Review the work** — Enter the contributor's pull request URL. The app fetches the real PR from GitHub and checks: correct repository, merged state, and base repository. You review the evidence and decide.

3. **Release or refund** — If satisfied, you release USDC directly to the contributor's wallet. After expiry, you can reclaim the funds. Every completion step verifies the actual on-chain receipt, final bounty state, and exact USDC transfer log before showing success.

## Contract

`MergePay.sol` — non-upgradeable, no admin, no partial payment, no recipient change.

- `createBounty(recipient, amount, expiresAt, repositoryHash, issueNumber)`
- `release(bountyId, pullRequestHash)` — funder only, before expiry
- `refund(bountyId)` — funder only, at or after expiry

**Testnet deployment (Arc Testnet, chain ID 5042002):**
`0xd22e0efe90d9a92ea9c669acfb610e42a4129e84`

**Mainnet deployment (Arc Mainnet, chain ID 5042):**
`0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470`
Tx: `0x84f060634a466e2b0b915408bf1d561b5c0be88aff31e6b00f66dd304069770f`
Block: 27024790
Explorer: https://explorer.arc.io/address/0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470

## Tech stack

- React 18, Vite, TypeScript, Tailwind CSS
- wagmi v2, viem v2, ConnectKit
- Solidity 0.8.28, Foundry (forge)
- OpenZeppelin contracts (SafeERC20, ReentrancyGuard)
- USDC: `0x3600000000000000000000000000000000000000` (Arc Testnet and Mainnet)

## Setup

```bash
bun install
bun run dev
```

Contract tests:

```bash
forge test
```

## Running against Arc Mainnet

The app targets Arc Mainnet by default. Connect MetaMask (or any injected wallet) to **Arc Mainnet (chain ID 5042)**:

- RPC: `https://rpc.mainnet.arc.io`
- Chain ID: `5042`
- Currency: USDC
- Explorer: `https://explorer.arc.io`

```bash
bun install
bun run dev
```

Open the preview, connect your wallet on chain 5042, and all write operations are live.

## Security

The contract has passed automated rule-corpus review and functional review.
49 unit and fuzz tests pass. This is **not** a professional security audit.
