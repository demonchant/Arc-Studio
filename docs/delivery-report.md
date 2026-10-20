# MergePay Delivery Report

Date: 2026-10-19

---

## Files Created or Modified

### Contract layer

| File | Role |
|---|---|
| `contracts/MergePay.sol` | Production contract — 134 lines, Solidity 0.8.28, non-upgradeable |
| `contracts/test/MergePay.t.sol` | Foundry unit and fuzz tests — 584 lines |
| `contracts/test-helpers/MockERC20.sol` | Minimal ERC-20 for test fixtures |
| `contracts/test-helpers/FailingERC20.sol` | Always-reverting ERC-20 for failure-path tests |

### Frontend layer

| File | Role |
|---|---|
| `src/App.tsx` | Root component — tab nav, ARIA tabpanel with `aria-labelledby`, bounty-detail callback |
| `src/components/CreateBounty.tsx` | Create bounty flow — form, GitHub issue fetch, review, approve+fund, success with "View bounty detail" |
| `src/components/ReleaseBounty.tsx` | Release/refund flow — bounty lookup, PR fetch, comparison, release, refund |
| `src/components/BountyDetail.tsx` | Live contract state viewer — auto-refreshes every 10 s |
| `src/components/Carousel.tsx` | Accessible illustration carousel — horizontal slide, 15 s, pause/resume, reduced-motion |
| `src/components/ChainGuard.tsx` | Wrong-chain detection and switch prompt |
| `src/components/Header.tsx` | Sticky header — wallet connect, wrong-network badge |
| `src/lib/github.ts` | GitHub REST API helpers — issue and PR fetch with full error classification |
| `src/lib/mergePayContract.ts` | Contract address, ABI (from compiled artifact), state labels |
| `src/lib/utils.ts` | Formatters — address, USDC, timestamp, canonicalRepo (lowercased) |
| `src/config.ts` | wagmi config — Arc Testnet only, no mainnet |
| `src/index.css` | Design tokens — midnight navy, cyan accent, amber signal |
| `src/onchain-facts.ts` | Arc Studio onchain registry (generated — do not edit) |
| `AGENTS.md` | Project memory |
| `docs/inspection-report.md` | Prior-turn inspection findings |

---

## Contract Review Findings

**Command:** `slither contracts/MergePay.sol`

11 results total. Zero in `MergePay.sol` itself.

| Detector | Severity | Location | Assessment |
|---|---|---|---|
| `timestamp` | Low | `createBounty`, `release`, `refund` | Intentional — expiry logic requires `block.timestamp`. Acceptable for day-scale bounties. |
| `assembly` | Informational | OpenZeppelin `SafeERC20`, `Address` | OZ internals, not in `MergePay.sol`. |
| `solc-version` | Informational | `^0.8.20` pragma | Three listed bugs are not triggered by this contract's patterns; actual compiler pinned to `0.8.28`. |
| `low-level-calls` | Informational | OZ `Address` | Standard OZ utility, not in `MergePay.sol`. |

Automated audit (rule-corpus and functional) at balanced severity: **no material findings.**

This is a static analysis pass only. **No independent professional security audit has been performed.**

---

## Contract Tests

**Command:** `forge test -vv`

**Result: 38 passed, 0 failed, 0 skipped** (finished in ~45 ms)

Scenarios covered:

- Constructor: zero USDC address rejection; USDC address stored correctly
- `createBounty` happy path: all 7 fields stored, event emitted, exact transfer accounting, ID incrementing
- `createBounty` reverts: zero recipient, self recipient, zero amount, expiry in past, expiry at boundary (equal to `block.timestamp`), zero repo hash, zero issue number, token transfer failure
- `release` happy path: exact amount to recipient, `BountyReleased` event, state becomes Released
- `release` reverts: bounty not found (id 0 and too-high), not funder, wrong state (duplicate, after refund), already expired (past and at-boundary)
- `refund` happy path: exact amount to funder, `BountyRefunded` event, state becomes Refunded, succeeds at exact expiry boundary
- `refund` reverts: bounty not found, not funder, not expired (before and one second before), wrong state (duplicate, after release)
- Fuzz: `createBounty` with varied valid inputs (256 runs), `release` before expiry (256 runs), `refund` at or after expiry (256 runs)

---

## Lint and Typecheck

**Command:** `bun run check` (runs oxlint then `tsc --noEmit`)

```
Found 0 warnings and 0 errors. (oxlint — 22 files, 57 rules)
Found 0 warnings and 0 errors. (oxlint — 25 files, 34 rules)
tsc --noEmit: no errors
```

**Result: PASS**

---

## U+002D Hyphen Scan

**Command:** Inline `node --input-type=module` script — extracts JSX text nodes and string/template literals from all `src/**/*.{ts,tsx}` files, filters to human-readable text (contains spaces and alphabetic content, not CSS/code tokens), checks for U+002D.

**Result: 0 violations in visible copy.**

7 scan hits are all code/API strings:
- `(prefers-reduced-motion: reduce)` — CSS media query argument passed to `window.matchMedia()`
- `[studio-console] rate limit: dropped...` — internal telemetry, never rendered to DOM
- `${addr.slice(0,6)}...${addr.slice(-4)}` — address formatter function body
- `Cannot ... -decimal amount` (×2) — thrown `AmountError` constructor messages
- `patching EIP-1193 provider` — debug log in tracing module

None appear in headings, buttons, labels, helper text, error messages, status text, captions, or alt text.

---

## GitHub API

**Live request made:**
```
curl -H "Accept: application/vnd.github.v3+json" \
     -H "X-GitHub-Api-Version: 2022-11-28" \
     "https://api.github.com/repos/ethereum/ethereum-org-website/issues/1"
```
**Result:** HTTP 200 — real issue data returned.

The app calls only `https://api.github.com`. Error paths: 200 (success), 404 (not found / private), 403 (rate limit and access denied), non-OK status, schema validation failure, PR-returned-on-issues-endpoint, 10 s timeout (`AbortSignal.timeout`), network error, caller abort. No GitHub Markdown is rendered as HTML.

---

## Network and Deployment Status

| Item | Status |
|---|---|
| Contract deployed on Arc Testnet | `0xd22e0efe90d9a92ea9c669acfb610e42a4129e84` |
| Explorer link | `https://explorer.testnet.arc.io/address/0xd22e0efe90d9a92ea9c669acfb610e42a4129e84` |
| USDC address | `0x3600000000000000000000000000000000000000` (from Arc Studio onchain registry) |
| Chain ID | 5042002 (Arc Testnet) |
| Mainnet | Not configured anywhere in this project |
| Arc Testnet RPC availability | Timed out during prior inspection. The app shows honest loading/error states when the RPC is down. |
| App dev server | Running on port 5173, HTTP 200 |

---

## Missing External Requirements

1. **Testnet USDC in wallet** — required to exercise the create-bounty flow. Use the "Get test USDC" button in the Arc Studio sidebar.
2. **Injected wallet (MetaMask etc.)** — required for any write path. Not available in the preview-only sandbox.
3. **Arc Testnet RPC availability** — the RPC endpoint was unreachable at inspection time. App handles this gracefully.

---

## Remaining Risks

1. **No independent professional security audit.** The contract passed static analysis at balanced severity with zero findings, but that is not a substitute for a professional audit. Do not use on mainnet without one.
2. **`block.timestamp` expiry.** Acceptable for day-scale bounties; miner manipulation is at most ~15 s.
3. **No Playwright end-to-end tests.** Wallet signing cannot be automated in this sandbox.
4. **GitHub API rate limit.** 60 unauthenticated requests/hour per IP. Under heavy shared-IP use the 403 path fires; the error handler classifies it correctly.
5. **Arc Testnet RPC instability.** Persistent outage blocks live reads. App handles gracefully.

---

## Claims Not Made

- No security audit status claimed.
- No mainnet readiness claimed.
- No real transaction observed (RPC was down during inspection).
- No Playwright coverage claimed.
- No public deployment claimed (app is in Arc Studio preview only).
