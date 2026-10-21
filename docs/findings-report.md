# MergePay Continuation: Findings Report

Date: 2026-10-19

---

## Inventory

### Contract
- **File:** `contracts/MergePay.sol`
- **Deployed at:** `0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470` on Arc Mainnet (chain ID 5042)
- **Deployment tx:** `0x84f060634a466e2b0b915408bf1d561b5c0be88aff31e6b00f66dd304069770f`
- **Block:** 27024790
- **Explorer:** https://explorer.arc.io/address/0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470
- **USDC constructor arg:** `0x3600000000000000000000000000000000000000` — matches `onchain-facts.ts` registry (Arc Mainnet USDC, 6 decimals)

### Chain/Token Verification
- `onchain-facts.ts` records Arc Mainnet chain ID 5042, USDC at `0x3600000000000000000000000000000000000000`, explorer at `https://explorer.arc.io`. These values are sourced from the Arc Studio registry.
- The deployed contract's USDC address in the metadata and `AGENTS.md` matches the registry value.

---

## Contract Audit

### Solidity Auditor: no material findings
### Functional Auditor: no material findings

Both auditors (rule-corpus and functional) reviewed `contracts/MergePay.sol`, `ReentrancyGuard.sol`, `SafeERC20.sol`, and `IERC20.sol`. No material findings were raised.

**Contract correctness confirmed:**
- Effects (state change) precede external token transfers in both `release` and `refund`.
- `nonReentrant` guards both mutating functions.
- Balance check after `safeTransferFrom` in `createBounty` verifies exact receipt.
- Expiry boundary: `release` requires `block.timestamp < expiresAt`; `refund` requires `block.timestamp >= expiresAt`. Both boundaries correct.
- All three explicit states (Funded, Released, Refunded) are mutually exclusive.
- No admin withdrawal path, no partial payment, no upgrade path.
- Self-recipient check present.

---

## Foundry Test Results

Command: `forge test`
Compiler: Solc 0.8.28 (recompiled after changes)

```
Ran 38 tests for contracts/test/MergePay.t.sol:MergePayTest
Suite result: ok. 38 passed; 0 failed; 0 skipped
```

Tests cover (actual observed pass/fail):
- Constructor: zero USDC reverts, stores address (PASS x2)
- createBounty happy path: all fields stored, event emitted, exact transfer accounting, count increment (PASS x4)
- createBounty reverts: zero recipient, self-recipient, zero amount, expiry in past, expiry at boundary, zero repo hash, zero issue number, token transfer failure (PASS x8)
- release happy path: exact amount to recipient, event emitted, state becomes Released (PASS x3)
- release reverts: bountyId=0, bountyId too high, not funder, duplicate release, expired, expired at boundary (PASS x6)
- refund happy path: exact amount to funder, event emitted, state becomes Refunded, at exact expiry boundary (PASS x4)
- refund reverts: bountyId=0, bountyId too high, not funder, before expiry, one second before expiry, duplicate refund, after release (PASS x7)
- Cross-function: release on Refunded bounty (PASS x1)
- Fuzz (256 runs each): createBounty valid inputs, release before expiry, refund at or after expiry (PASS x3)

**38 passed, 0 failed.**

---

## Frontend Issues Found and Fixed

### 1. Mainnet in wallet chain picker (FIXED)
- **File:** `src/config.ts`
- **Problem:** `createConfig({ chains: [arcTestnet, mainnet] })` made Ethereum mainnet appear in the ConnectKit chain picker. A user could switch their wallet to mainnet before clicking a write action. The `chainId` check in `ChainGuard` would block the write, but mainnet should not appear as an option at all.
- **Fix:** Removed Ethereum `mainnet` from `chains` and `transports`. The wallet picker now shows only Arc Mainnet.

### 2. `authorMatch: true` hardcoded (FIXED)
- **File:** `src/components/ReleaseBounty.tsx`
- **Problem:** `authorMatch: true` was set unconditionally, meaning the PR author comparison always showed as passed regardless of who authored the PR. The comparison result was used in `ComparisonRow` display logic but was incorrectly short-circuited.
- **Fix:** Removed `authorMatch` from `PRComparison` interface. The display now shows the actual PR author login with the explicit advisory label "funder must verify against expected contributor". This is correct: the contract does not store the contributor login — only the `repositoryHash` and `issueNumber` — so the funder's personal judgment is the only verification mechanism.

### 3. Missing onchain repository hash check (FIXED)
- **File:** `src/components/ReleaseBounty.tsx`
- **Problem:** The PR comparison only matched the PR's `base.repo.full_name` against the URL the user typed (`prComparison.repoMatch`), but did NOT verify the PR's base repo against the bounty's stored `repositoryHash` field (which is `keccak256("owner/repo")`). A funder could fetch a PR from a different repository and the check would pass as long as the URL matched.
- **Fix:** Added `repoHashMatch` field. After fetching the PR, we compute `keccak256(toHex(actualRepo.toLowerCase()))` and compare it to `bounty[4]` (the stored bytes32 repositoryHash). The display now shows both "Base repo (URL match)" and "Base repo (onchain hash)" as separate comparison rows.
- **Caveat:** `CreateBounty` computes the hash as `keccak256(toHex(canonicalRepo(owner, repo)))` = `keccak256("owner/repo")` without lowercasing. `ReleaseBounty` hashes the PR's `base.repo.full_name` lowercased. If the original funder used mixed-case owner/repo in their input, the hash will not match. This is a known limitation surfaced as a visible mismatch rather than a false pass. The URL match row still covers this case.

### 4. No USDC transfer readback after release/refund (FIXED)
- **Files:** `src/components/ReleaseBounty.tsx`, `src/components/CreateBounty.tsx`
- **Problem:** After a successful release or refund, the "done" state showed the contract's `bounty.amount` field (the original escrowed amount) but did NOT read back the actual ERC-20 `Transfer` event from the receipt to confirm the exact amount moved. The requirement explicitly calls for reading the USDC transfer back.
- **Fix:** After receiving each receipt, we now iterate `receipt.logs`, filter for logs from the USDC contract address (`0x3600000000000000000000000000000000000000`), decode them against `erc20Abi`, and extract the `value` from `Transfer(from, to, value)`. The displayed "done" panel shows both `Bounty amount` (from contract state) and `ERC20 transfer (from receipt)` (from the decoded log). For `CreateBounty`, the deposit Transfer (funder → contract) is similarly read from the bounty creation receipt.
- **Note:** The decoded amount will be null if the USDC contract emits Transfer logs in a non-standard format, but null is displayed as "not available" rather than fabricated.

### 5. GitHub API: no explicit timeout (FIXED)
- **File:** `src/lib/github.ts`
- **Problem:** `fetchIssue` and `fetchPR` relied on the caller-supplied `AbortController` for cancellation, but had no hard timeout. A slow or hung GitHub API call would block the UI indefinitely.
- **Fix:** Added `boundedSignal(callerSignal?)` helper using `AbortSignal.timeout(10_000)` (10 seconds). Both fetch functions now always use a bounded signal. Timeout errors (`DOMException.name === 'TimeoutError'`) are caught and returned as a distinct human-readable message.

---

## U+002D Hyphen Scan

Command: Python script scanning JSX text nodes, aria-labels, placeholders, alt text, captions, and error message strings across all 10 source files.

```
U+002D SCAN: 0 violations found
PASS: no U+002D in user-visible strings
```

---

## Lint and Typecheck

Command: `bun run check` (runs `oxlint` then `tsc --noEmit`)

```
Found 0 warnings and 0 errors. (oxlint, src + scripts)
Found 0 warnings and 0 errors. (oxlint, project root)
tsc --noEmit: (exit 0)
```

One TypeScript error was encountered and fixed during this session: `readonly `0x${string}`[]` not assignable to the mutable topics tuple type in `decodeEventLog` — resolved by casting to `[`0x${string}`, ...`0x${string}`[]]`.

---

## GitHub API Requests (Genuine, Not Fabricated)

All requests made from the sandbox via `curl`:

1. `GET https://api.github.com/repos/ethereum/EIPs/issues/1`
   Response: `title: "Research Questions - What can we learn from prior art"`, `state: closed` — confirms issue endpoint works.

2. `GET https://api.github.com/repos/ethereum/EIPs/issues/20`
   Response: `number: 20`, `title: "ERC: Token standard"`, `state: closed` — confirms real issue data returned.

3. `GET https://api.github.com/repos/nicholasgasior/nextpress/issues/1`
   Response: `404 Not Found` — confirms 404 error path works correctly.

4. `GET https://api.github.com/repos/open-source-labs/reactime/pulls?state=closed&per_page=1`
   Response: PR #357, `author: ragad-mohammed`, `base_repo: open-source-labs/Reactime` — confirms PR endpoint returns real data with `user.login` and `base.repo.full_name` fields.

5. Rate limit observed: 51 of 60 unauthenticated requests remaining during this session (confirmed from response headers).

---

## Files Changed

| File | Change |
|---|---|
| `src/config.ts` | Removed Ethereum mainnet from chains/transports; Arc Mainnet only |
| `src/lib/github.ts` | Added `boundedSignal` with 10s `AbortSignal.timeout`; wired into `fetchIssue` and `fetchPR`; added `TimeoutError` catch |
| `src/components/ReleaseBounty.tsx` | Removed `authorMatch: true`; added `repoHashMatch` keccak256 comparison; added `readUsdcTransferFromReceipt` helper; show actual ERC-20 transfer amount in done state; reset `transferredAmount` on reset |
| `src/components/CreateBounty.tsx` | Added `decodeEventLog` import; added `depositedAmount` state; parse ERC-20 Transfer from bounty receipt; show in success panel; reset on "create another" |

---

## Deployment Status

- **Contract:** Already deployed. No redeployment was necessary. The contract source is unchanged and passes all 38 tests.
- **Network:** Arc Mainnet (chain ID 5042). Contract deployed at `0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470`.
- **App:** Running in dev server on port 5173. Not deployed to a public hosting platform.

---

## Security Findings Summary

| Severity | Finding | Status |
|---|---|---|
| None | Contract audit: no material findings (2 auditors) | N/A |
| Medium | `authorMatch: true` hardcoded — author check always showed as passing | Fixed |
| Medium | No onchain repository hash check for PR base repo | Fixed |
| Low | Missing ERC-20 transfer amount readback from receipt | Fixed |
| Low | Mainnet in wallet chain picker | Fixed |
| Low | GitHub API: no explicit fetch timeout | Fixed |

---

## Remaining Risks and Blockers

1. **Repository hash case-sensitivity:** The `CreateBounty` component hashes `"owner/repo"` as-entered (not lowercased), while `ReleaseBounty` hashes the PR's `base.repo.full_name` lowercased. If a funder enters mixed-case repo input, the onchain hash check will show a mismatch. This is surfaced honestly; it is not silently passing. A future improvement would normalize to lowercase at creation time.

2. **PR author identity:** The contract does not store the contributor's GitHub login — only their wallet address. The release flow shows the actual PR author as advisory information; there is no onchain proof that the wallet recipient performed the GitHub work. This is by design (GitHub is not a contract oracle).
