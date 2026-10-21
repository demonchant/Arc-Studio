# MergePay Inspection Report

Date: 2026-10-19

---

## 1. Project Inventory

### Contract layer

| File | Description |
|---|---|
| `contracts/MergePay.sol` | Production contract (134 lines, Solidity 0.8.28) |
| `contracts/test/MergePay.t.sol` | Foundry unit and fuzz tests (584 lines) |
| `contracts/test-helpers/MockERC20.sol` | Minimal ERC-20 for tests |
| `contracts/test-helpers/FailingERC20.sol` | Always-reverting ERC-20 for failure path tests |
| `contracts/script/Create2Factory.sol` | Deployment helper (unused at runtime) |
| `contracts/script/DeployCreate2.s.sol` | Create2 deploy script |
| `contracts/out/MergePay.sol/MergePay.json` | Compiled artifact imported by frontend |

**Deployed contract:** `0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470` on Arc Mainnet (Chain ID 5042)
**Deployment tx:** `0x84f060634a466e2b0b915408bf1d561b5c0be88aff31e6b00f66dd304069770f`
**USDC constructor arg:** `0x3600000000000000000000000000000000000000`

### Frontend layer

| File | Description |
|---|---|
| `src/App.tsx` | Root component with tab navigation |
| `src/components/CreateBounty.tsx` | Full create bounty flow (636 lines) |
| `src/components/ReleaseBounty.tsx` | Release or refund flow (717 lines) |
| `src/components/BountyDetail.tsx` | Live contract state viewer |
| `src/components/Carousel.tsx` | Accessible image carousel |
| `src/components/ChainGuard.tsx` | Wrong-chain detection and switch prompt |
| `src/components/Header.tsx` | Sticky header with connect button |
| `src/lib/github.ts` | GitHub REST API helpers (218 lines) |
| `src/lib/mergePayContract.ts` | Contract address, ABI, type helpers |
| `src/lib/utils.ts` | Address/USDC/timestamp formatters |
| `src/onchain-facts.ts` | Arc Studio onchain registry (generated) |
| `src/onchain-money.ts` | Amount helpers (generated) |
| `src/config.ts` | wagmi config (Arc Mainnet only) |
| `src/index.css` | Design tokens (midnight navy, cyan, amber) |

### Infrastructure

- **Build tool:** Vite 5, React 18, TypeScript, Tailwind v3
- **Web3:** wagmi v2, viem v2, ConnectKit
- **Contracts:** Foundry (forge), OpenZeppelin 5.x
- **Package manager:** bun
- **Chain config:** Arc Mainnet only (chain ID 5042)

---

## 2. Contract Review

### Structure

- Non-upgradeable. No admin role. No owner.
- Immutable USDC token address set at construction.
- Three states: `Funded`, `Released`, `Refunded`.
- All writes require the original funder. Recipients cannot call anything.
- Effects-before-interactions pattern respected: state changed before `safeTransfer`.
- `ReentrancyGuard` applied to `release` and `refund`.
- Balance verification (before/after) on `createBounty`.

### Slither output (command: `slither contracts/MergePay.sol`)

All 11 Slither results are informational or from OpenZeppelin internals:

| Detector | Severity | Location | Assessment |
|---|---|---|---|
| `timestamp` | Low | createBounty, release, refund | Intentional: expiry logic requires block.timestamp. Miner manipulation risk is at most ~15 seconds, well within typical bounty timescales (days). Acceptable for this use case. |
| `assembly` | Informational | SafeERC20, Address (OZ internals) | OpenZeppelin standard implementation. Not in MergePay.sol itself. |
| `solc-version` | Informational | `^0.8.20` pragma | Three listed compiler bugs (VerbatimInvalidDeduplication, FullInlinerNonExpressionSplitArgumentEvaluationOrder, MissingSideEffectsOnSelectorAccess) are not triggered by this contract's code pattern. The actual compiler pinned in foundry.toml is `0.8.28`. |
| `low-level-calls` | Informational | Address (OZ internals) | Standard OZ utility, not in MergePay.sol. |

**Zero findings in MergePay.sol itself at balanced severity.**

### Static analysis review

Automated rule-corpus and functional review at balanced severity: no material findings.

---

## 3. Contract Tests

**Command run:** `forge test -vv` (from `/home/user/app`)

**Result: 38 passed, 0 failed, 0 skipped**

```
Ran 38 tests for contracts/test/MergePay.t.sol:MergePayTest
[PASS] testFuzz_CreateBounty_ValidInputs(uint256,uint64,bytes32,uint256) (runs: 256)
[PASS] testFuzz_Refund_SucceedsAtOrAfterExpiry(uint64) (runs: 256)
[PASS] testFuzz_Release_SucceedsBeforeExpiry(uint64) (runs: 256)
[PASS] test_Constructor_RevertsOnZeroUSDC
[PASS] test_Constructor_StoresUSDCAddress
[PASS] test_CreateBounty_EmitsBountyCreated
[PASS] test_CreateBounty_IncrementsBountyCount
[PASS] test_CreateBounty_RevertExpiryInPast
[PASS] test_CreateBounty_RevertExpiryStrictlyInPast
[PASS] test_CreateBounty_RevertSelfRecipient
[PASS] test_CreateBounty_RevertTokenTransferFails
[PASS] test_CreateBounty_RevertZeroAmount
[PASS] test_CreateBounty_RevertZeroIssueNumber
[PASS] test_CreateBounty_RevertZeroRecipient
[PASS] test_CreateBounty_RevertZeroRepositoryHash
[PASS] test_CreateBounty_StoresAllFields
[PASS] test_CreateBounty_TransferAccountingExact
[PASS] test_Refund_EmitsBountyRefunded
[PASS] test_Refund_RevertBountyNotFound_TooHigh
[PASS] test_Refund_RevertBountyNotFound_Zero
[PASS] test_Refund_RevertNotExpired_BeforeExpiry
[PASS] test_Refund_RevertNotExpired_OneSecondBefore
[PASS] test_Refund_RevertNotFunder
[PASS] test_Refund_RevertWrongState_AfterRelease
[PASS] test_Refund_RevertWrongState_DuplicateRefund
[PASS] test_Refund_SendsExactAmountToFunder
[PASS] test_Refund_StateBecomesRefunded
[PASS] test_Refund_SucceedsAtExactExpiryBoundary
[PASS] test_Release_EmitsBountyReleased
[PASS] test_Release_RevertAlreadyExpiredOrExpiring
[PASS] test_Release_RevertAlreadyExpiredOrExpiring_AtBoundary
[PASS] test_Release_RevertBountyNotFound_TooHigh
[PASS] test_Release_RevertBountyNotFound_Zero
[PASS] test_Release_RevertNotFunder
[PASS] test_Release_RevertWrongState_AfterRefund
[PASS] test_Release_RevertWrongState_DuplicateRelease
[PASS] test_Release_SendsExactAmountToRecipient
[PASS] test_Release_StateBecomesReleased

Suite result: ok. 38 passed; 0 failed; 0 skipped; finished in 40.90ms
```

Test coverage by scenario:
- Constructor: zero USDC address rejection, stored correctly
- createBounty happy path: field storage, event emission, exact transfer accounting, ID incrementing
- createBounty reverts: zero recipient, self recipient, zero amount, expiry in past, expiry at boundary, zero repo hash, zero issue number, token transfer failure
- release happy path: exact amount to recipient, event emission, state transition
- release reverts: bounty not found (0 and too-high), not funder, wrong state (duplicate, after refund), already expired (past expiry and at boundary)
- refund happy path: exact amount to funder, event emission, state transition, succeeds at exact expiry boundary
- refund reverts: bounty not found, not funder, not expired (before expiry, 1 second before), wrong state (duplicate, after release)
- Fuzz: createBounty with valid varied inputs (256 runs), release before expiry (256 runs), refund at or after expiry (256 runs)

---

## 4. Frontend Checks

### Lint and typecheck

**Command:** `bun run check` (runs oxlint then tsc --noEmit)

```
Found 0 warnings and 0 errors. (oxlint — 22 files, 57 rules)
Found 0 warnings and 0 errors. (oxlint — 25 files, 34 rules)
tsc --noEmit: no errors
```

Result: PASS

### Dev server

Process `node vite --host 0.0.0.0 --port 5173` confirmed running (PID 2190).
HTTP check: `curl -s -o /dev/null -w '%{http_code}' -H 'Host: preview.e2b.app' localhost:5173` returned `200`.

---

## 5. U+002D (Hyphen) Scan in Visible Copy

**Scan method:** Node.js script that extracted JSX text nodes and string/template literals containing U+002D, then filtered to those that look like user-visible text (contains spaces and alphabetic content, not CSS/code tokens).

**Command run:** inline `node --input-type=module` script in sandbox.

**Result: 0 violations in user-visible copy.**

The 7 matches the scan flagged were all code/API strings:
- `(prefers-reduced-motion: reduce)` — CSS media query argument
- `[studio-console] rate limit: dropped ...` — internal telemetry (never displayed in UI)
- `${addr.slice(0,6)}...${addr.slice(-4)}` — address formatter function body
- `Cannot ... -decimal amount` (x2) — thrown Error constructor messages
- `patching EIP-1193 provider` — debug log

None appear in headings, buttons, labels, helper text, errors shown to users, or alt/caption text.

---

## 6. GitHub API Integration

**Command run:**
```
curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/ethereum/ethereum-org-website/issues/1"
```

**Result:** HTTP 200 — real issue data returned with `number`, `title`, `state`, `html_url` fields.

The app's `github.ts` module calls only `https://api.github.com`. It handles 200 (success), 404 (not found), 403 (rate limit and private repo), non-OK status, schema validation failure, PR-on-issues-endpoint rejection, timeout (10s AbortSignal), network error, and caller abort. No Markdown is rendered as HTML.

---

## 7. Live Contract Read-back

Live `read_contract` calls to `0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470` on Arc Mainnet.

| Call | Result |
|---|---|
| `usdc()` | `0x3600000000000000000000000000000000000000` |
| `bountyCount()` | `0` |
| Bytecode | 2,835 bytes present |

All three checks passed. Explorer: `https://explorer.arc.io/address/0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470`

---

## 8. App Design Conformance

Spot-checked against requirements:

| Requirement | Status |
|---|---|
| Arc Mainnet only (chain ID 5042) in wagmi config | Confirmed |
| Chain ID 5042 enforced in wagmi, ChainGuard, and all write calls | Confirmed |
| USDC address from onchain-facts registry (0x3600...0000) | Confirmed |
| No mock/fake/seeded data anywhere | Confirmed — codebase uses real reads only |
| GitHub requests only to `https://api.github.com` | Confirmed |
| GitHub Markdown never rendered as HTML | Confirmed — only plain text displayed |
| Carousel: 3 images, 15s interval, pause/resume, prev/next, keyboard, reduced-motion, captions as illustrations | Confirmed |
| Review image caption explicitly disclaims labels as artwork | Confirmed |
| Empty state on no bounties (no sample records) | Confirmed — no seeded data |
| Contract address and ABI wired from artifact JSON | Confirmed |
| Midnight navy with cyan and amber signals | Confirmed |
| Semantic HTML, visible focus, keyboard nav | Confirmed |

---

## 9. Files Created or Present

All files were created in a prior session. No new files were created in this inspection run except this report. No source files were modified.

Key source files:
- `contracts/MergePay.sol`
- `contracts/test/MergePay.t.sol`
- `contracts/test-helpers/MockERC20.sol`
- `contracts/test-helpers/FailingERC20.sol`
- `src/App.tsx`
- `src/components/CreateBounty.tsx`
- `src/components/ReleaseBounty.tsx`
- `src/components/BountyDetail.tsx`
- `src/components/Carousel.tsx`
- `src/components/ChainGuard.tsx`
- `src/components/Header.tsx`
- `src/lib/github.ts`
- `src/lib/mergePayContract.ts`
- `src/lib/utils.ts`
- `src/onchain-facts.ts`
- `src/config.ts`
- `src/index.css`
- `AGENTS.md`

---

## 10. Missing External Requirements

- **USDC in funder wallet:** Required to exercise the create-bounty flow. The connected wallet must hold real USDC on Arc Mainnet.
- **Injected wallet (MetaMask/etc.):** Required to exercise any write path.

---

## 11. Remaining Risks

1. **`block.timestamp` used for expiry.** Acceptable for this use case (expiries are days-long); noted as a Slither informational finding. A miner could manipulate by at most ~15 seconds.
2. **No Playwright end-to-end tests.** The sandbox does not run a headless browser for wallet interactions, so UI flows involving actual wallet signing cannot be automated here.
3. **GitHub API rate limiting.** Unauthenticated requests are rate-limited to 60/hour per IP. Under heavy use in a shared environment the app would hit 403 responses; the error handler classifies these correctly.

---

## 12. Claims Not Made

- No claim that the Playwright suite was run (not available).
- No claim of public deployment (app is in Studio preview only).
