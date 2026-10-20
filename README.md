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
Pending — see `scripts/deploy-mainnet.sh`.

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

## Mainnet deployment

See `scripts/deploy-mainnet.sh` for the full external deployment workflow.
After deployment, set `MERGEPAY_MAINNET_ADDRESS` in `src/lib/chainConfig.ts`.

## Security

The contract has passed automated rule-corpus review and functional review.
49 unit and fuzz tests pass. This is **not** a professional security audit.
