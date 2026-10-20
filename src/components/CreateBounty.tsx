/**
 * CreateBounty: the full maintainer flow for creating a new bounty.
 * Steps: 1) Enter details, 2) Fetch GitHub issue, 3) Review and confirm, 4) Post-creation readback.
 *
 * No fake success, no mock data, no simulated states.
 */
import { useState, useRef, useCallback } from 'react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi'
import { erc20Abi, keccak256, toHex, decodeEventLog } from 'viem'
import { toast } from 'sonner'
import { Loader2, GitBranch, ExternalLink, CheckCircle, AlertCircle, Search } from 'lucide-react'
import {
  parseRepoInput,
  parseIssueInput,
  fetchIssue,
  type GitHubIssue,
} from '@/lib/github'
import { fmtAddress, fmtTimestamp, fmtUsdc, parseUsdcInput, isValidAddress, canonicalRepo } from '@/lib/utils'
import { getUsdc, buildTxExplorerUrl, requireChain } from '@/onchain-facts'

import { MERGEPAY_ADDRESS, MERGEPAY_ABI, MAINNET_READY } from '@/lib/mergePayContract'
import { ChainGuardBanner, useChainGuard } from './ChainGuard'
import { APP_CHAIN_ID } from '@/lib/chainConfig'

const usdcFact = getUsdc(APP_CHAIN_ID)!
const USDC_ADDRESS = usdcFact.address as `0x${string}`
const arcChain = requireChain(APP_CHAIN_ID)

type Step = 'form' | 'fetching' | 'review' | 'approving' | 'funding' | 'success'

function parseOnchainError(err: unknown): string {
  const msg = (err as { message?: string; shortMessage?: string })?.shortMessage
    ?? (err as { message?: string })?.message ?? ''
  if (msg.includes('User rejected') || msg.includes('user rejected')) return 'Transaction cancelled.'
  if (msg.includes('insufficient') || msg.includes('balance')) return 'Insufficient USDC balance.'
  if (msg.includes('ZeroAddress')) return 'Recipient address cannot be zero.'
  if (msg.includes('SelfRecipient')) return 'Recipient cannot be your own address.'
  if (msg.includes('ZeroAmount')) return 'Amount must be greater than zero.'
  if (msg.includes('InvalidExpiry')) return 'Expiry must be in the future.'
  if (msg.includes('InvalidRepositoryHash')) return 'Repository identifier is required.'
  if (msg.includes('InvalidIssueNumber')) return 'Issue number must be a positive integer.'
  if (msg.includes('BalanceMismatch')) return 'Token balance mismatch after transfer. Try again.'
  if (msg.includes('reverted')) {
    const m = msg.match(/reason: (.+)/)
    return m ? `Transaction failed: ${m[1]}` : 'Transaction failed. Please try again.'
  }
  return 'Something went wrong. Please try again.'
}

interface CreateBountyProps {
  /** Called after a bounty is successfully created. Allows the parent to navigate to bounty detail. */
  onBountyCreated?: (bountyId: bigint) => void
}

export function CreateBounty({ onBountyCreated }: CreateBountyProps = {}) {
  const { address } = useAccount()
  const { isReady } = useChainGuard()

  // Form state
  const [repoInput, setRepoInput] = useState('')
  const [issueInput, setIssueInput] = useState('')
  const [contributorLogin, setContributorLogin] = useState('')
  const [recipientInput, setRecipientInput] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [expiryInput, setExpiryInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // GitHub fetch state
  const [step, setStep] = useState<Step>('form')
  const [issue, setIssue] = useState<GitHubIssue | null>(null)
  const [issueError, setIssueError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [parsedRepo, setParsedRepo] = useState<{ owner: string; repo: string } | null>(null)
  const [parsedIssueNum, setParsedIssueNum] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Transaction state
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>()
  const [bountyTxHash, setBountyTxHash] = useState<`0x${string}` | undefined>()
  const [newBountyId, setNewBountyId] = useState<bigint | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  // Actual USDC amount deposited, read from ERC-20 Transfer event in bounty creation receipt
  const [depositedAmount, setDepositedAmount] = useState<bigint | null>(null)

  // Wagmi hooks
  const { writeContractAsync: writeContractAsync } = useWriteContract()

  const { isLoading: isApproveConfirming } =
    useWaitForTransactionReceipt({ hash: approveTxHash })

  const { isLoading: isBountyConfirming } =
    useWaitForTransactionReceipt({ hash: bountyTxHash })

  // Read-back bounty after creation
  const { data: createdBounty } = useReadContract({
    address: MERGEPAY_ADDRESS ?? undefined,
    abi: MERGEPAY_ABI,
    functionName: 'bounties',
    args: newBountyId ? [newBountyId] : undefined,
    chainId: APP_CHAIN_ID,
    query: { enabled: MAINNET_READY && !!newBountyId && step === 'success' },
  })

  const validateForm = useCallback((): boolean => {
    setFormError(null)
    const repo = parseRepoInput(repoInput)
    if (!repo) { setFormError('Enter a valid GitHub repository URL or "owner/repo".'); return false }
    const issueNum = parseIssueInput(issueInput)
    if (!issueNum) { setFormError('Enter a valid issue number or GitHub issue URL.'); return false }
    if (!contributorLogin.trim()) { setFormError('Enter the contributor GitHub login.'); return false }
    if (!isValidAddress(recipientInput)) { setFormError('Enter a valid contributor wallet address.'); return false }
    if (address && recipientInput.toLowerCase() === address.toLowerCase()) {
      setFormError('Recipient cannot be your own address.')
      return false
    }
    const amt = parseUsdcInput(amountInput)
    if (!amt || amt <= 0n) { setFormError('Enter a valid USDC amount greater than zero.'); return false }
    if (!expiryInput) { setFormError('Select an expiry date.'); return false }
    const expiryTs = Math.floor(new Date(expiryInput).getTime() / 1000)
    if (expiryTs <= Math.floor(Date.now() / 1000)) { setFormError('Expiry must be in the future.'); return false }
    return true
  }, [repoInput, issueInput, contributorLogin, recipientInput, amountInput, expiryInput, address])

  const handleFetchIssue = useCallback(async () => {
    if (!validateForm()) return
    const repo = parseRepoInput(repoInput)!
    const issueNum = parseIssueInput(issueInput)!
    setParsedRepo(repo)
    setParsedIssueNum(issueNum)
    setIssueError(null)
    setIssue(null)
    setStep('fetching')

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const result = await fetchIssue(repo.owner, repo.repo, issueNum, ac.signal)
    if (result.ok) {
      setIssue(result.data)
      setFetchedAt(result.retrievedAt)
      setStep('review')
    } else {
      setIssueError(result.reason)
      setStep('form')
    }
  }, [validateForm, repoInput, issueInput])

  const handleSubmit = useCallback(async () => {
    if (!parsedRepo || !parsedIssueNum || !address) return
    setTxError(null)
    const amount = parseUsdcInput(amountInput)
    if (!amount) return
    const recipient = recipientInput as `0x${string}`
    const expiryTs = BigInt(Math.floor(new Date(expiryInput).getTime() / 1000))
    const repoHash = keccak256(toHex(canonicalRepo(parsedRepo.owner, parsedRepo.repo)))

    try {
      if (!MAINNET_READY || !MERGEPAY_ADDRESS) {
        setTxError('Mainnet contract not yet deployed. Run scripts/deploy-mainnet.sh and provide the address.')
        return
      }
      // Step 1: approve exact amount
      setStep('approving')
      const approveHash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [MERGEPAY_ADDRESS, amount],
        chainId: APP_CHAIN_ID,
      })
      setApproveTxHash(approveHash)

      // Wait for approval confirmation by polling receipt
      let approveReceipt = null
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        try {
          const { createPublicClient, http } = await import('viem')
          const { arc: vArc } = await import('viem/chains')
          const client = createPublicClient({ chain: vArc, transport: http() })
          approveReceipt = await client.getTransactionReceipt({ hash: approveHash })
          if (approveReceipt) break
        } catch { /* keep polling */ }
      }

      if (!approveReceipt || approveReceipt.status !== 'success') {
        setTxError('Approval transaction did not confirm. Please try again.')
        setStep('review')
        return
      }

      // Step 2: create bounty
      setStep('funding')
      if (!MERGEPAY_ADDRESS) { setTxError('Mainnet contract not yet deployed.'); setStep('review'); return }
      const bountyHash = await writeContractAsync({
        address: MERGEPAY_ADDRESS,
        abi: MERGEPAY_ABI,
        functionName: 'createBounty',
        args: [recipient, amount, expiryTs, repoHash, BigInt(parsedIssueNum)],
        chainId: APP_CHAIN_ID,
      })
      setBountyTxHash(bountyHash)

      // Wait for bounty confirmation
      let bountyReceipt = null
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        try {
          const { createPublicClient, http } = await import('viem')
          const { arc: vArc } = await import('viem/chains')
          const client = createPublicClient({ chain: vArc, transport: http() })
          bountyReceipt = await client.getTransactionReceipt({ hash: bountyHash })
          if (bountyReceipt) break
        } catch { /* keep polling */ }
      }

      if (!bountyReceipt || bountyReceipt.status !== 'success') {
        setTxError('Bounty creation transaction did not confirm. Please try again.')
        setStep('review')
        return
      }

      // Parse BountyCreated event to get bountyId, and ERC-20 Transfer to verify deposit amount
      const { parseAbi } = await import('viem')
      const eventAbi = parseAbi([
        'event BountyCreated(uint256 indexed bountyId, address indexed funder, address indexed recipient, uint256 amount, uint64 expiresAt, bytes32 repositoryHash, uint256 issueNumber)',
      ])
      let id: bigint | null = null
      let deposited: bigint | null = null
      for (const log of bountyReceipt.logs) {
        // Try BountyCreated
        try {
          const decoded = decodeEventLog({ abi: eventAbi, data: log.data, topics: log.topics })
          if (decoded.eventName === 'BountyCreated') {
            id = (decoded.args as { bountyId: bigint }).bountyId
          }
        } catch { /* not a BountyCreated log */ }
        // Try ERC-20 Transfer from USDC contract
        if (log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
          try {
            const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics })
            if (decoded.eventName === 'Transfer') {
              const args = decoded.args as { from: string; to: string; value: bigint }
              // The transfer from funder to contract
              if (args.to.toLowerCase() === MERGEPAY_ADDRESS.toLowerCase()) {
                deposited = args.value
              }
            }
          } catch { /* not a Transfer log */ }
        }
      }
      setNewBountyId(id)
      setDepositedAmount(deposited)
      setStep('success')
      toast.success('Bounty created successfully.')
    } catch (err) {
      const msg = parseOnchainError(err)
      setTxError(msg)
      if (!msg.includes('cancelled')) toast.error(msg)
      setStep('review')
    }
  }, [
    parsedRepo, parsedIssueNum, address, amountInput, recipientInput,
    expiryInput, writeContractAsync,
  ])

  // Min date for expiry input: computed in state initializer (runs once)
  const [minDate] = useState(() => new Date(Date.now() + 60_000).toISOString().slice(0, 16))

  if (step === 'success') {
    return (
      <div className="flex flex-col gap-5">
        <div
          className="flex flex-col gap-4 rounded-2xl p-5"
          style={{ background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52,211,153,0.25)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle size={18} style={{ color: 'var(--success)' }} aria-hidden="true" />
            <span className="font-semibold" style={{ color: 'var(--success)' }}>Bounty created</span>
          </div>

          {newBountyId !== null && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Bounty ID:{' '}
              <span className="mono font-semibold" style={{ color: 'var(--ink)' }}>
                {newBountyId.toString()}
              </span>
            </p>
          )}

          {bountyTxHash && (
            <a
              href={buildTxExplorerUrl(APP_CHAIN_ID, bountyTxHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium"
              style={{ color: 'var(--accent)' }}
            >
              View transaction on {arcChain.name} <ExternalLink size={11} aria-hidden="true" />
            </a>
          )}

          {createdBounty != null && (() => {
            type RawBounty = [string, string, bigint, bigint, string, bigint, number]
            const b = createdBounty as RawBounty
            return (
              <div
                className="rounded-xl p-4 text-xs"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <p className="mb-1 font-semibold" style={{ color: 'var(--ink)' }}>Contract state (read from chain)</p>
                <dl className="flex flex-col gap-1" style={{ color: 'var(--muted)' }}>
                  <Row label="Amount">{fmtUsdc(b[2])} USDC</Row>
                  {depositedAmount !== null && (
                    <Row label="ERC20 deposited (from receipt)">{fmtUsdc(depositedAmount)} USDC</Row>
                  )}
                  <Row label="Recipient">{fmtAddress(b[1])}</Row>
                  <Row label="Expires">{fmtTimestamp(b[3])}</Row>
                  <Row label="State">Funded</Row>
                </dl>
              </div>
            )
          })()}
        </div>

        <div className="flex flex-col gap-2">
          {newBountyId !== null && onBountyCreated && (
            <button
              onClick={() => onBountyCreated(newBountyId)}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition hover:opacity-90"
              style={{ background: 'var(--accent)', color: '#0a1628' }}
              type="button"
            >
              View bounty detail
            </button>
          )}
          <button
            onClick={() => {
              setStep('form')
              setIssue(null)
              setRepoInput('')
              setIssueInput('')
              setContributorLogin('')
              setRecipientInput('')
              setAmountInput('')
              setExpiryInput('')
              setApproveTxHash(undefined)
              setBountyTxHash(undefined)
              setNewBountyId(null)
              setDepositedAmount(null)
            }}
            className="w-full rounded-xl py-2.5 text-sm font-semibold transition hover:opacity-80"
            style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)' }}
            type="button"
          >
            Create another bounty
          </button>
        </div>
      </div>
    )
  }

  if (step === 'review' || step === 'approving' || step === 'funding') {
    const amount = parseUsdcInput(amountInput)
    const expiryTs = expiryInput ? Math.floor(new Date(expiryInput).getTime() / 1000) : null

    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={() => { setStep('form'); setIssue(null) }}
          className="self-start text-xs font-medium"
          style={{ color: 'var(--muted)' }}
          type="button"
          disabled={step === 'approving' || step === 'funding'}
        >
          Back to form
        </button>

        {/* GitHub evidence panel */}
        {issue && (
          <div
            className="rounded-xl p-4 text-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="mb-2 flex items-center gap-2">
              <GitBranch size={14} style={{ color: 'var(--accent)' }} aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
                GitHub Issue (advisory)
              </span>
            </div>
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>{issue.title}</p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
              {parsedRepo?.owner}/{parsedRepo?.repo} #{issue.number} &middot;{' '}
              <span className={issue.state === 'open' ? '' : ''} style={{ color: issue.state === 'open' ? 'var(--success)' : 'var(--muted)' }}>
                {issue.state}
              </span>
            </p>
            {fetchedAt && (
              <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
                Fetched at {new Date(fetchedAt).toLocaleTimeString()} (advisory only)
              </p>
            )}
            <a
              href={issue.html_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--accent)' }}
            >
              View on GitHub <ExternalLink size={10} aria-hidden="true" />
            </a>
          </div>
        )}

        {/* Bounty terms */}
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
            Bounty terms
          </p>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Network">{arcChain.name}</Row>
            <Row label="Token">USDC ({usdcFact.address.slice(0, 8)}...)</Row>
            <Row label="Amount">{amount ? fmtUsdc(amount) : '?'} USDC</Row>
            <Row label="Recipient">{fmtAddress(recipientInput)}</Row>
            <Row label="Contributor">{contributorLogin}</Row>
            <Row label="Funder">{address ? fmtAddress(address) : 'Not connected'}</Row>
            <Row label="Expires">{expiryTs ? fmtTimestamp(expiryTs) : '?'}</Row>
            <Row label="Contract">{MERGEPAY_ADDRESS ? fmtAddress(MERGEPAY_ADDRESS) : 'Deployment pending'}</Row>
          </dl>
        </div>

        <div
          className="rounded-xl px-4 py-3 text-xs"
          style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--muted)' }}
        >
          Funding requires two wallet confirmations: first to allow the contract to spend your USDC, then to create the bounty. Each requires a separate signature.
        </div>

        {txError && (
          <div
            className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--danger)' }}
            role="alert"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {txError}
          </div>
        )}

        <ChainGuardBanner compact />

        <button
          onClick={() => { void handleSubmit() }}
          disabled={!isReady || step === 'approving' || step === 'funding'}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent-amber)', color: '#0a1628' }}
          type="button"
        >
          {step === 'approving' && (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              {isApproveConfirming ? 'Confirming approval...' : 'Confirm USDC approval in wallet...'}
            </>
          )}
          {step === 'funding' && (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              {isBountyConfirming ? 'Confirming bounty...' : 'Confirm bounty creation in wallet...'}
            </>
          )}
          {step === 'review' && `Fund bounty: ${amount ? fmtUsdc(amount) : '?'} USDC`}
        </button>
      </div>
    )
  }

  // Form
  return (
    <div className="flex flex-col gap-4">
      {step === 'fetching' && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Fetching issue from GitHub...
        </div>
      )}

      {issueError && (
        <div
          className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--danger)' }}
          role="alert"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {issueError}
        </div>
      )}

      <fieldset className="flex flex-col gap-3 border-none p-0">
        <legend className="sr-only">Bounty details</legend>

        <Field label="GitHub repository" htmlFor="cb-repo">
          <input
            id="cb-repo"
            type="text"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="https://github.com/owner/repo or owner/repo"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field label="Issue number or URL" htmlFor="cb-issue">
          <input
            id="cb-issue"
            type="text"
            value={issueInput}
            onChange={(e) => setIssueInput(e.target.value)}
            placeholder="42 or https://github.com/owner/repo/issues/42"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            autoComplete="off"
          />
        </Field>

        <Field label="Contributor GitHub login" htmlFor="cb-login">
          <input
            id="cb-login"
            type="text"
            value={contributorLogin}
            onChange={(e) => setContributorLogin(e.target.value)}
            placeholder="octocat"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field label="Contributor wallet address" htmlFor="cb-recipient">
          <input
            id="cb-recipient"
            type="text"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            placeholder="0x..."
            className="mono w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field label="USDC amount" htmlFor="cb-amount">
          <div className="relative">
            <input
              id="cb-amount"
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setAmountInput(v)
              }}
              placeholder="10.00"
              className="w-full rounded-xl py-2.5 pl-3.5 pr-16 text-sm tabular-nums outline-none transition"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold"
              style={{ color: 'var(--subtle)' }}
              aria-hidden="true"
            >
              USDC
            </span>
          </div>
        </Field>

        <Field label="Expiry date and time" htmlFor="cb-expiry">
          <input
            id="cb-expiry"
            type="datetime-local"
            value={expiryInput}
            onChange={(e) => setExpiryInput(e.target.value)}
            min={minDate}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        </Field>
      </fieldset>

      {formError && (
        <div
          className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--danger)' }}
          role="alert"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {formError}
        </div>
      )}

      <ChainGuardBanner compact />

      <button
        onClick={() => { void handleFetchIssue() }}
        disabled={!isReady || step === 'fetching'}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#0a1628' }}
        type="button"
      >
        {step === 'fetching' ? (
          <>
            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            Fetching issue...
          </>
        ) : (
          <>
            <Search size={15} aria-hidden="true" />
            Fetch issue and review
          </>
        )}
      </button>
    </div>
  )
}

/* Small helper components */
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
      <dt className="shrink-0" style={{ color: 'var(--subtle)' }}>{label}</dt>
      <dd className="text-right font-medium" style={{ color: 'var(--ink)' }}>{children}</dd>
    </div>
  )
}
