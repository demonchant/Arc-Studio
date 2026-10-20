/**
 * ReleaseBounty: funder reviews a PR and releases or (after expiry) refunds a bounty.
 * PR data is advisory evidence — GitHub is not a contract oracle.
 * No fake success, no simulated states.
 */
import { useState, useRef, useCallback } from 'react'
import {
  useAccount,
  useWriteContract,
  useReadContract,
} from 'wagmi'
import { keccak256, toHex, createPublicClient, http, erc20Abi, decodeEventLog } from 'viem'
import { arc as vArc } from 'viem/chains'
import { toast } from 'sonner'
import {
  Loader2, ExternalLink, CheckCircle, AlertCircle, GitMerge, Clock, XCircle,
} from 'lucide-react'

import { parsePRUrl, fetchPR, canonicalPRUrl, type GitHubPR } from '@/lib/github'
import { fmtAddress, fmtTimestamp, fmtUsdc, fmtIsoDate, canonicalRepo } from '@/lib/utils'
import { buildTxExplorerUrl, requireChain } from '@/onchain-facts'
import { MERGEPAY_ADDRESS, MERGEPAY_ABI, BOUNTY_STATE_LABEL, MAINNET_READY } from '@/lib/mergePayContract'
import { ChainGuardBanner, useChainGuard } from './ChainGuard'
import { APP_CHAIN_ID, USDC_ADDRESS } from '@/lib/chainConfig'

const arcChain = requireChain(APP_CHAIN_ID)

function parseOnchainError(err: unknown): string {
  const msg = (err as { message?: string; shortMessage?: string })?.shortMessage
    ?? (err as { message?: string })?.message ?? ''
  if (msg.includes('User rejected') || msg.includes('user rejected')) return 'Transaction cancelled.'
  if (msg.includes('NotFunder')) return 'Only the original funder can perform this action.'
  if (msg.includes('WrongState')) return 'Bounty is not in Funded state.'
  if (msg.includes('AlreadyExpiredOrExpiring')) return 'The bounty has already expired. Use refund instead.'
  if (msg.includes('NotExpired')) return 'The bounty has not expired yet. Release funds instead.'
  if (msg.includes('BountyNotFound')) return 'Bounty not found on chain.'
  return 'Transaction failed. Please try again.'
}

type Step = 'lookup' | 'loaded' | 'pr_input' | 'pr_fetching' | 'pr_review' | 'releasing' | 'refunding' | 'done'

interface PRComparison {
  /** Whether the PR's base repo hash matches the bounty's stored repositoryHash. */
  repoHashMatch: boolean
  /** Whether the PR's base.repo.full_name matches the parsed URL repo (case-insensitive). */
  repoMatch: boolean
  isMerged: boolean
  expectedRepo: string
  actualRepo: string
  actualAuthor: string
  /**
   * Advisory: whether the PR body contains a reference to the bounty issue number.
   * null means the body was empty or unparseable; true/false is an advisory finding only.
   */
  issueRefInBody: boolean | null
  bountyIssueNumber: bigint | null
}

export function ReleaseBounty() {
  const { address } = useAccount()
  const { isReady } = useChainGuard()
  // Computed in state initializer (runs once); prevents purity lint in JSX expressions
  const [nowSecs] = useState(() => BigInt(Math.floor(Date.now() / 1000)))

  const [bountyIdInput, setBountyIdInput] = useState('')
  const [step, setStep] = useState<Step>('lookup')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [bountyId, setBountyId] = useState<bigint | null>(null)

  const [prUrlInput, setPrUrlInput] = useState('')
  const [prError, setPrError] = useState<string | null>(null)
  const [pr, setPr] = useState<GitHubPR | null>(null)
  const [prFetchedAt, setPrFetchedAt] = useState<string | null>(null)
  const [prComparison, setPrComparison] = useState<PRComparison | null>(null)
  const [parsedPR, setParsedPR] = useState<{ owner: string; repo: string; prNumber: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [txError, setTxError] = useState<string | null>(null)
  const [txType, setTxType] = useState<'release' | 'refund' | null>(null)
  // Actual USDC amount transferred, read back from ERC-20 Transfer event in receipt
  const [transferredAmount, setTransferredAmount] = useState<bigint | null>(null)

  const { writeContractAsync } = useWriteContract()

  // Lookup bounty
  const { data: bountyRaw, isLoading: isLoadingBounty, refetch: refetchBounty } = useReadContract({
    address: MERGEPAY_ADDRESS ?? undefined,
    abi: MERGEPAY_ABI,
    functionName: 'bounties',
    args: bountyId ? [bountyId] : undefined,
    chainId: APP_CHAIN_ID,
    query: { enabled: MAINNET_READY && !!bountyId && step !== 'lookup' },
  })

  const bounty = bountyRaw as [string, string, bigint, bigint, string, bigint, number] | undefined

  const handleLookup = () => {
    setLookupError(null)
    const id = parseInt(bountyIdInput.trim(), 10)
    if (isNaN(id) || id <= 0) {
      setLookupError('Enter a valid bounty ID (positive integer).')
      return
    }
    setBountyId(BigInt(id))
    setStep('loaded')
  }

  const handleFetchPR = useCallback(async () => {
    setPrError(null)
    const parsed = parsePRUrl(prUrlInput)
    if (!parsed) {
      setPrError('Enter a valid GitHub pull request URL (https://github.com/owner/repo/pull/N).')
      return
    }
    setParsedPR(parsed)
    setStep('pr_fetching')

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const result = await fetchPR(parsed.owner, parsed.repo, parsed.prNumber, ac.signal)
    if (!result.ok) {
      setPrError(result.reason)
      setStep('pr_input')
      return
    }

    const data = result.data
    setPr(data)
    setPrFetchedAt(result.retrievedAt)

    // Validate against bounty
    const actualRepo = data.base.repo.full_name
    const urlRepo = `${parsed.owner}/${parsed.repo}`
    // Case-insensitive match between PR base repo and the URL the user entered
    const repoMatch = actualRepo.toLowerCase() === urlRepo.toLowerCase()
    // Onchain hash check: use canonicalRepo (lowercase owner/repo) — same function used
    // in CreateBounty when computing the hash stored on-chain.
    const storedRepoHash = bounty ? bounty[4] as `0x${string}` : null
    let repoHashMatch = false
    if (storedRepoHash) {
      try {
        // canonicalRepo lowercases both sides; split actualRepo at the first slash
        const [prOwner, ...repoParts] = actualRepo.split('/')
        const prRepoHash = keccak256(toHex(canonicalRepo(prOwner, repoParts.join('/'))))
        repoHashMatch = prRepoHash.toLowerCase() === storedRepoHash.toLowerCase()
      } catch { repoHashMatch = false }
    }
    const actualAuthor = data.user.login
    const isMerged = data.merged === true

    // Advisory: look for a reference to the bounty's issue number in the PR body.
    // We check for "#N" or "issues/N" patterns — this is informational only.
    const bountyIssueNumber = bounty ? bounty[5] : null
    let issueRefInBody: boolean | null = null
    if (bountyIssueNumber !== null && typeof data.body === 'string' && data.body.length > 0) {
      const issueNumStr = bountyIssueNumber.toString()
      // Match "#N" or "issues/N" (not part of a larger number)
      const bodyRef =
        new RegExp(`(?:^|\\D)#${issueNumStr}(?:\\D|$)`).test(data.body) ||
        new RegExp(`issues/${issueNumStr}(?:\\D|$)`).test(data.body)
      issueRefInBody = bodyRef
    }

    setPrComparison({
      repoHashMatch,
      repoMatch,
      isMerged,
      expectedRepo: urlRepo,
      actualRepo,
      actualAuthor,
      issueRefInBody,
      bountyIssueNumber,
    })
    setStep('pr_review')
  }, [prUrlInput, bounty])

  /**
   * Verify the USDC Transfer event in the receipt.
   *
   * Requirements (all must hold or the result is an error):
   *   - The log is emitted by the configured USDC contract address.
   *   - event.from === MERGEPAY_ADDRESS  (contract is the sender of funds)
   *   - event.to   === expectedRecipient (correct recipient received funds)
   *   - event.value === expectedAmount   (exact bounty amount transferred)
   *
   * Returns the verified transferred amount on success, or a reason string on failure.
   * Never returns success when any field is absent, mismatched, or the log is missing.
   */
  const verifyUsdcTransfer = useCallback(
    (
      receipt: { logs: Array<{ address: string; data: `0x${string}`; topics: readonly `0x${string}`[] }> } | null,
      expectedRecipient: string,
      expectedAmount: bigint,
    ): { ok: true; amount: bigint } | { ok: false; reason: string } => {
      if (!receipt) return { ok: false, reason: 'No receipt returned from chain.' }
      if (!USDC_ADDRESS) return { ok: false, reason: 'USDC address not configured.' }

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue
        try {
          const decoded = decodeEventLog({
            abi: erc20Abi,
            data: log.data,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          })
          if (decoded.eventName !== 'Transfer') continue
          const args = decoded.args as { from: string; to: string; value: bigint }

          // Verify sender is the MergePay contract
          if (!MERGEPAY_ADDRESS || args.from.toLowerCase() !== MERGEPAY_ADDRESS.toLowerCase()) {
            continue // may be a different Transfer log (e.g. from approval), keep searching
          }
          // Verify recipient matches the expected address
          if (args.to.toLowerCase() !== expectedRecipient.toLowerCase()) {
            return {
              ok: false,
              reason: `Transfer recipient mismatch: expected ${expectedRecipient}, got ${args.to}.`,
            }
          }
          // Verify exact amount
          if (args.value !== expectedAmount) {
            return {
              ok: false,
              reason: `Transfer amount mismatch: expected ${expectedAmount}, got ${args.value}.`,
            }
          }
          return { ok: true, amount: args.value }
        } catch { /* log decode failed — not an ERC-20 Transfer */ }
      }

      return {
        ok: false,
        reason: `No USDC Transfer log found from MergePay contract (${MERGEPAY_ADDRESS ?? 'unknown'}) in the transaction receipt. The transaction may have succeeded but the expected transfer was not recorded.`,
      }
    },
    [],
  )

  const handleRelease = useCallback(async () => {
    if (!bountyId || !parsedPR) return
    setTxError(null)
    setTxType('release')
    setTransferredAmount(null)
    setStep('releasing')

    const prUrl = canonicalPRUrl(parsedPR.owner, parsedPR.repo, parsedPR.prNumber)
    const prHash = keccak256(toHex(prUrl))

    try {
      if (!MAINNET_READY || !MERGEPAY_ADDRESS) throw new Error('Mainnet contract not yet deployed.')
      const hash = await writeContractAsync({
        address: MERGEPAY_ADDRESS,
        abi: MERGEPAY_ABI,
        functionName: 'release',
        args: [bountyId, prHash],
        chainId: APP_CHAIN_ID,
      })
      setTxHash(hash)

      // Wait for receipt
      const client = createPublicClient({ chain: vArc, transport: http() })
      let receipt = null
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        try {
          receipt = await client.getTransactionReceipt({ hash })
          if (receipt) break
        } catch { /* keep polling */ }
      }

      if (!receipt || receipt.status !== 'success') {
        setTxError('Release transaction did not confirm. Check the explorer.')
        setStep('pr_review')
        return
      }

      // Verify the ERC-20 Transfer: must be from MergePay, to the stored recipient, exact amount
      const recipient = bounty![1]
      const expectedAmount = bounty![2]
      const transferResult = verifyUsdcTransfer(receipt, recipient, expectedAmount)
      if (!transferResult.ok) {
        setTxError(`Receipt verified but USDC transfer could not be confirmed: ${transferResult.reason}`)
        setStep('pr_review')
        return
      }
      setTransferredAmount(transferResult.amount)

      // Read back contract state — must show Released
      const refreshed = await refetchBounty()
      const newState = (refreshed.data as [string, string, bigint, bigint, string, bigint, number] | undefined)?.[6]
      if (newState !== 1 /* Released */) {
        setTxError(`Transfer confirmed but contract state did not update to Released (got ${newState ?? 'unknown'}). Check the explorer.`)
        setStep('pr_review')
        return
      }

      setStep('done')
      toast.success('Bounty released.')
    } catch (err) {
      const msg = parseOnchainError(err)
      setTxError(msg)
      if (!msg.includes('cancelled')) toast.error(msg)
      setStep('pr_review')
    }
  }, [bountyId, parsedPR, bounty, writeContractAsync, refetchBounty, verifyUsdcTransfer])

  const handleRefund = useCallback(async () => {
    if (!bountyId) return
    setTxError(null)
    setTxType('refund')
    setTransferredAmount(null)
    setStep('refunding')

    try {
      if (!MAINNET_READY || !MERGEPAY_ADDRESS) throw new Error('Mainnet contract not yet deployed.')
      const hash = await writeContractAsync({
        address: MERGEPAY_ADDRESS,
        abi: MERGEPAY_ABI,
        functionName: 'refund',
        args: [bountyId],
        chainId: APP_CHAIN_ID,
      })
      setTxHash(hash)

      const client = createPublicClient({ chain: vArc, transport: http() })
      let receipt = null
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        try {
          receipt = await client.getTransactionReceipt({ hash })
          if (receipt) break
        } catch { /* keep polling */ }
      }

      if (!receipt || receipt.status !== 'success') {
        setTxError('Refund transaction did not confirm. Check the explorer.')
        setStep(pr ? 'pr_review' : 'loaded')
        return
      }

      // Verify the ERC-20 Transfer: must be from MergePay, to the stored funder, exact amount
      const funder = bounty![0]
      const expectedAmount = bounty![2]
      const transferResult = verifyUsdcTransfer(receipt, funder, expectedAmount)
      if (!transferResult.ok) {
        setTxError(`Receipt verified but USDC transfer could not be confirmed: ${transferResult.reason}`)
        setStep(pr ? 'pr_review' : 'loaded')
        return
      }
      setTransferredAmount(transferResult.amount)

      // Read back contract state — must show Refunded
      const refreshed = await refetchBounty()
      const newState = (refreshed.data as [string, string, bigint, bigint, string, bigint, number] | undefined)?.[6]
      if (newState !== 2 /* Refunded */) {
        setTxError(`Transfer confirmed but contract state did not update to Refunded (got ${newState ?? 'unknown'}). Check the explorer.`)
        setStep(pr ? 'pr_review' : 'loaded')
        return
      }

      setStep('done')
      toast.success('Bounty refunded.')
    } catch (err) {
      const msg = parseOnchainError(err)
      setTxError(msg)
      if (!msg.includes('cancelled')) toast.error(msg)
      // Return to pr_review if PR evidence was loaded, otherwise back to loaded
      setStep(pr ? 'pr_review' : 'loaded')
    }
  }, [bountyId, pr, bounty, writeContractAsync, refetchBounty, verifyUsdcTransfer])

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-4">
        <div
          className="flex flex-col gap-4 rounded-2xl p-5"
          style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle size={18} style={{ color: 'var(--success)' }} aria-hidden="true" />
            <span className="font-semibold" style={{ color: 'var(--success)' }}>
              {txType === 'release' ? 'Bounty released' : 'Bounty refunded'}
            </span>
          </div>
          {txHash && (
            <a
              href={buildTxExplorerUrl(APP_CHAIN_ID, txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium"
              style={{ color: 'var(--accent)' }}
            >
              View transaction on {arcChain.name} <ExternalLink size={11} aria-hidden="true" />
            </a>
          )}
          {bounty && (
            <div
              className="rounded-xl p-4 text-xs"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <p className="mb-1 font-semibold" style={{ color: 'var(--ink)' }}>
                Contract state (read from chain)
              </p>
              <dl className="flex flex-col gap-1" style={{ color: 'var(--muted)' }}>
                <Row label="State">{BOUNTY_STATE_LABEL[bounty[6]]}</Row>
                <Row label="Bounty amount">{fmtUsdc(bounty[2])} USDC</Row>
                {transferredAmount !== null && (
                  <Row label="ERC20 transfer (from receipt)">{fmtUsdc(transferredAmount)} USDC</Row>
                )}
                <Row label="Recipient">{fmtAddress(bounty[1])}</Row>
              </dl>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            setStep('lookup')
            setBountyId(null)
            setBountyIdInput('')
            setPr(null)
            setPrUrlInput('')
            setTxHash(undefined)
            setTxType(null)
            setTransferredAmount(null)
          }}
          className="w-full rounded-xl py-2.5 text-sm font-semibold transition hover:opacity-80"
          style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)' }}
          type="button"
        >
          Look up another bounty
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bounty lookup */}
      {step === 'lookup' && (
        <>
          <Field label="Bounty ID" htmlFor="rb-id">
            <input
              id="rb-id"
              type="text"
              inputMode="numeric"
              value={bountyIdInput}
              onChange={(e) => setBountyIdInput(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="1"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm tabular-nums outline-none transition"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </Field>
          {lookupError && (
            <ErrorBox>{lookupError}</ErrorBox>
          )}
          <button
            onClick={handleLookup}
            disabled={!bountyIdInput}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#0a1628' }}
            type="button"
          >
            Load bounty
          </button>
        </>
      )}

      {/* Bounty loaded: show details */}
      {(step === 'loaded' || step === 'pr_input' || step === 'pr_fetching' || step === 'pr_review' || step === 'releasing' || step === 'refunding') && (
        <>
          <button
            onClick={() => { setStep('lookup'); setBountyId(null); setBountyIdInput('') }}
            className="self-start text-xs font-medium"
            style={{ color: 'var(--muted)' }}
            type="button"
          >
            Back to lookup
          </button>

          {isLoadingBounty && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Loading from chain...
            </div>
          )}

          {bounty && (
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest"
                  style={{
                    background:
                      bounty[6] === 0 ? 'rgba(245,158,11,0.15)' : 'rgba(148,163,184,0.12)',
                    color: bounty[6] === 0 ? 'var(--accent-amber)' : 'var(--muted)',
                  }}
                >
                  {BOUNTY_STATE_LABEL[bounty[6]]}
                </span>
              </div>
              <dl className="flex flex-col gap-2 text-sm">
                <Row label="Amount">{fmtUsdc(bounty[2])} USDC</Row>
                <Row label="Recipient">{fmtAddress(bounty[1])}</Row>
                <Row label="Funder">{fmtAddress(bounty[0])}</Row>
                <Row label="Expires">{fmtTimestamp(bounty[3])}</Row>
              </dl>
            </div>
          )}
        </>
      )}

      {/* PR fetch panel */}
      {(step === 'loaded' || step === 'pr_input' || step === 'pr_fetching') && bounty && bounty[6] === 0 && (
        <>
          {(() => {
            // nowSecs from component scope
            const expired = nowSecs >= bounty[3]

            if (expired) {
              return (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{ background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.2)', color: 'var(--muted)' }}
                >
                  This bounty has expired. As the original funder you may now refund.
                </div>
              )
            }

            return (
              <div className="flex flex-col gap-3">
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Enter the pull request URL to load GitHub evidence before deciding whether to release funds. GitHub data is advisory only.
                </p>
                <Field label="Pull request URL" htmlFor="rb-prurl">
                  <input
                    id="rb-prurl"
                    type="text"
                    value={prUrlInput}
                    onChange={(e) => setPrUrlInput(e.target.value)}
                    placeholder="https://github.com/owner/repo/pull/42"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                    disabled={step === 'pr_fetching'}
                    spellCheck={false}
                  />
                </Field>
                {prError && <ErrorBox>{prError}</ErrorBox>}
                <button
                  onClick={() => { void handleFetchPR() }}
                  disabled={!prUrlInput || step === 'pr_fetching' || !isReady}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
                  type="button"
                >
                  {step === 'pr_fetching' ? (
                    <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Fetching PR...</>
                  ) : 'Fetch pull request'}
                </button>
              </div>
            )
          })()}
        </>
      )}

      {/* PR review + release/refund */}
      {(step === 'pr_review' || step === 'releasing' || step === 'refunding') && bounty && pr && prComparison && parsedPR && (
        <div className="flex flex-col gap-4">
          {/* PR evidence */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="mb-3 flex items-center gap-2">
              <GitMerge size={14} style={{ color: pr.merged ? 'var(--success)' : 'var(--muted)' }} aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
                GitHub PR (advisory evidence)
              </span>
            </div>

            <p className="font-semibold" style={{ color: 'var(--ink)' }}>{pr.title}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              by <strong>{pr.user.login}</strong> into {pr.base.repo.full_name} #{pr.number}
            </p>
            {prFetchedAt && (
              <p className="mt-0.5 text-xs" style={{ color: 'var(--subtle)' }}>
                Fetched at {new Date(prFetchedAt).toLocaleTimeString()} (advisory only)
              </p>
            )}

            <div className="mt-3 flex flex-col gap-1.5">
              <ComparisonRow
                label="Merged"
                pass={prComparison.isMerged}
                value={prComparison.isMerged ? `Yes, at ${pr.merged_at ? fmtIsoDate(pr.merged_at) : 'unknown'}` : 'Not merged'}
              />
              <ComparisonRow
                label="Base repo (URL match)"
                pass={prComparison.repoMatch}
                value={`${prComparison.actualRepo} (expected ${prComparison.expectedRepo})`}
              />
              <ComparisonRow
                label="Base repo (onchain hash)"
                pass={prComparison.repoHashMatch}
                value={prComparison.repoHashMatch ? 'Matches stored repositoryHash' : 'Does not match stored repositoryHash'}
              />
              <ComparisonRow
                label="PR author"
                pass={null}
                value={`${prComparison.actualAuthor} (advisory: funder must verify against expected contributor)`}
              />
              {prComparison.issueRefInBody !== null && (
                <ComparisonRow
                  label={`Issue #${prComparison.bountyIssueNumber?.toString()} in PR body`}
                  pass={null}
                  value={
                    prComparison.issueRefInBody
                      ? 'Referenced in PR body (advisory only)'
                      : 'Not found in PR body (advisory only)'
                  }
                />
              )}
              {prComparison.issueRefInBody === null && pr.body === null && (
                <ComparisonRow
                  label="Issue reference in PR body"
                  pass={null}
                  value="PR body is empty (advisory check skipped)"
                />
              )}
              {pr.merge_commit_sha && (
                <div className="flex items-start justify-between gap-2 text-xs">
                  <span style={{ color: 'var(--subtle)' }}>Merge commit</span>
                  <span className="mono text-right" style={{ color: 'var(--muted)' }}>
                    {pr.merge_commit_sha.slice(0, 12)}
                  </span>
                </div>
              )}
            </div>

            <a
              href={pr.html_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--accent)' }}
            >
              View on GitHub <ExternalLink size={10} aria-hidden="true" />
            </a>
          </div>

          {/* Chain time vs expiry */}
          {(() => {
            // nowSecs from component scope
            const expired = nowSecs >= bounty[3]
            return (
              <div
                className="rounded-xl px-4 py-3 text-xs"
                style={{
                  background: expired ? 'rgba(148,163,184,0.08)' : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${expired ? 'rgba(148,163,184,0.2)' : 'rgba(245,158,11,0.2)'}`,
                  color: expired ? 'var(--muted)' : 'var(--accent-amber)',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <Clock size={11} aria-hidden="true" />
                  {expired
                    ? 'Bounty has expired. Release is no longer available; refund is available.'
                    : `Expires: ${fmtTimestamp(bounty[3])}`}
                </div>
              </div>
            )
          })()}

          {txError && <ErrorBox>{txError}</ErrorBox>}
          <ChainGuardBanner compact />

          {/* Decision buttons */}
          {(() => {
            // nowSecs from component scope
            const expired = nowSecs >= bounty[3]
            const isFunder = address?.toLowerCase() === bounty[0].toLowerCase()
            const isReleasing = step === 'releasing'
            const isRefunding = step === 'refunding'

            if (!isFunder) {
              return (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{ background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.2)', color: 'var(--muted)' }}
                  role="alert"
                >
                  Only the original funder ({fmtAddress(bounty[0])}) can release or refund this bounty.
                </div>
              )
            }

            return (
              <div className="flex flex-col gap-3">
                {!expired && (
                  <div
                    className="rounded-xl px-4 py-3 text-xs"
                    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', color: 'var(--muted)' }}
                  >
                    You are about to release{' '}
                    <strong style={{ color: 'var(--ink)' }}>{fmtUsdc(bounty[2])} USDC</strong> to{' '}
                    <span className="mono">{fmtAddress(bounty[1])}</span>.
                    This is irreversible. Review the PR evidence above before confirming.
                  </div>
                )}
                {!expired && (
                  <button
                    onClick={() => { void handleRelease() }}
                    disabled={!isReady || isReleasing || isRefunding}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: 'var(--success)', color: '#0a1628' }}
                    type="button"
                  >
                    {isReleasing ? (
                      <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Confirming release...</>
                    ) : `Release ${fmtUsdc(bounty[2])} USDC to contributor`}
                  </button>
                )}
                {expired && (
                  <button
                    onClick={() => { void handleRefund() }}
                    disabled={!isReady || isRefunding || isReleasing}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: 'var(--surface-strong)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                    type="button"
                  >
                    {isRefunding ? (
                      <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Confirming refund...</>
                    ) : `Reclaim ${fmtUsdc(bounty[2])} USDC (refund)`}
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Expired refund path when no PR loaded */}
      {step === 'loaded' && bounty && bounty[6] === 0 && (() => {
        // nowSecs from component scope
        const expired = nowSecs >= bounty[3]
        const isFunder = address?.toLowerCase() === bounty[0].toLowerCase()
        if (!expired || !isFunder) return null
        return (
          <div className="flex flex-col gap-3">
            {txError && <ErrorBox>{txError}</ErrorBox>}
            <ChainGuardBanner compact />
            <button
              onClick={() => { void handleRefund() }}
              disabled={!isReady || step === ('refunding' as Step)}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: 'var(--surface-strong)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              type="button"
            >
              Reclaim {fmtUsdc(bounty[2])} USDC (refund)
            </button>
          </div>
        )
      })()}
    </div>
  )
}

/* Helpers */
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs" style={{ color: 'var(--subtle)' }}>{label}</dt>
      <dd className="text-right font-medium" style={{ color: 'var(--ink)' }}>{children}</dd>
    </div>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
      style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--danger)' }}
      role="alert"
    >
      <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      {children}
    </div>
  )
}

function ComparisonRow({
  label,
  pass,
  value,
}: {
  label: string
  pass: boolean | null
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="flex items-center gap-1" style={{ color: 'var(--subtle)' }}>
        {pass === true && <CheckCircle size={10} style={{ color: 'var(--success)' }} aria-label="Match" />}
        {pass === false && <XCircle size={10} style={{ color: 'var(--danger)' }} aria-label="Mismatch" />}
        {pass === null && <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--subtle)' }} aria-label="Advisory" />}
        {label}
      </span>
      <span className="text-right" style={{ color: 'var(--muted)' }}>{value}</span>
    </div>
  )
}
