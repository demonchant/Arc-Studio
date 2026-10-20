/**
 * BountyDetail: shows live contract state for a single bounty.
 * Loads bountyId from URL hash (#bounty-N) or from prop.
 * No fake data, no simulated states.
 */
import { useState } from 'react'
import { useReadContract } from 'wagmi'
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { MERGEPAY_ADDRESS, MERGEPAY_ABI, BOUNTY_STATE_LABEL, MAINNET_READY } from '@/lib/mergePayContract'
import { fmtAddress, fmtTimestamp, fmtUsdc } from '@/lib/utils'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { APP_CHAIN_ID } from '@/lib/chainConfig'

interface BountyDetailProps {
  bountyId: bigint
  onBack?: () => void
}

export function BountyDetail({ bountyId, onBack }: BountyDetailProps) {
  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: MERGEPAY_ADDRESS ?? undefined,
    abi: MERGEPAY_ABI,
    functionName: 'bounties',
    args: [bountyId],
    chainId: APP_CHAIN_ID,
    query: { refetchInterval: 10_000, enabled: MAINNET_READY },
  })

  const bounty = data as
    | [string, string, bigint, bigint, string, bigint, number]
    | undefined

  const stateLabel = bounty ? BOUNTY_STATE_LABEL[bounty[6]] ?? 'Unknown' : null

  return (
    <div className="flex flex-col gap-4">
      {onBack && (
        <button
          onClick={onBack}
          className="self-start text-xs font-medium"
          style={{ color: 'var(--muted)' }}
          type="button"
        >
          Back
        </button>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
            Bounty #{bountyId.toString()}
          </h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Live contract state from{' '}
            {MAINNET_READY && MERGEPAY_ADDRESS ? (
              <a
                href={buildAddressExplorerUrl(APP_CHAIN_ID, MERGEPAY_ADDRESS)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5"
                style={{ color: 'var(--accent)' }}
              >
                Arc Mainnet <ExternalLink size={10} aria-hidden="true" />
              </a>
            ) : (
              <span style={{ color: 'var(--muted)' }}>Arc Mainnet (deployment pending)</span>
            )}
          </p>
        </div>
        <button
          onClick={() => { void refetch() }}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
          style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          aria-label="Refresh bounty state"
          type="button"
        >
          <RefreshCw size={11} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Loading from chain...
        </div>
      )}

      {isError && (
        <div
          className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--danger)' }}
          role="alert"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {(error as { message?: string })?.message ?? 'Failed to load bounty from chain.'}
        </div>
      )}

      {bounty && (
        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="mb-4 flex items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest"
              style={{
                background:
                  bounty[6] === 0
                    ? 'rgba(245,158,11,0.15)'
                    : bounty[6] === 1
                    ? 'rgba(52,211,153,0.15)'
                    : 'rgba(148,163,184,0.15)',
                color:
                  bounty[6] === 0
                    ? 'var(--accent-amber)'
                    : bounty[6] === 1
                    ? 'var(--success)'
                    : 'var(--muted)',
              }}
            >
              {stateLabel}
            </span>
          </div>

          <dl className="flex flex-col gap-3 text-sm">
            <DetailRow label="Amount">
              <span className="tabular-nums font-bold" style={{ color: 'var(--ink)' }}>
                {fmtUsdc(bounty[2])} USDC
              </span>
            </DetailRow>
            <DetailRow label="Funder">
              <a
                href={buildAddressExplorerUrl(APP_CHAIN_ID, bounty[0])}
                target="_blank"
                rel="noreferrer"
                className="mono inline-flex items-center gap-1"
                style={{ color: 'var(--accent)' }}
              >
                {fmtAddress(bounty[0])} <ExternalLink size={10} aria-hidden="true" />
              </a>
            </DetailRow>
            <DetailRow label="Recipient">
              <a
                href={buildAddressExplorerUrl(APP_CHAIN_ID, bounty[1])}
                target="_blank"
                rel="noreferrer"
                className="mono inline-flex items-center gap-1"
                style={{ color: 'var(--accent)' }}
              >
                {fmtAddress(bounty[1])} <ExternalLink size={10} aria-hidden="true" />
              </a>
            </DetailRow>
            <DetailRow label="Expires">{fmtTimestamp(bounty[3])}</DetailRow>
            <DetailRow label="Issue number">
              <span className="tabular-nums">{bounty[5].toString()}</span>
            </DetailRow>
            <DetailRow label="Repository hash">
              <span className="mono text-xs" style={{ color: 'var(--muted)' }}>
                {bounty[4].slice(0, 18)}...
              </span>
            </DetailRow>
          </dl>
        </div>
      )}

      {bounty && bounty[6] === 0 && <BountyStatusNote bounty={bounty} />}
    </div>
  )
}

function BountyStatusNote({ bounty }: { bounty: [string, string, bigint, bigint, string, bigint, number] }) {
  const [nowSecs] = useState(() => BigInt(Math.floor(Date.now() / 1000)))
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
      {expired
        ? 'This bounty has passed its expiry. The original funder may now claim a refund.'
        : `Expiry: ${fmtTimestamp(bounty[3])}. Before expiry the funder can release funds to the recipient after reviewing the work.`}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-xs font-medium" style={{ color: 'var(--subtle)' }}>{label}</dt>
      <dd className="text-right" style={{ color: 'var(--ink)' }}>{children}</dd>
    </div>
  )
}
