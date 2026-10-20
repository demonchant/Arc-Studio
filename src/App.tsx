/**
 * MergePay — onchain bounty escrow for open source maintainers.
 * Arc Mainnet. No fake data, no simulated states.
 * Writes disabled until MERGEPAY_MAINNET_ADDRESS is provided in chainConfig.ts.
 */
import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { GitBranch, PlusCircle, ArrowRightCircle, Search, AlertTriangle } from 'lucide-react'
import { Header } from '@/components/Header'
import { Carousel } from '@/components/Carousel'
import { CreateBounty } from '@/components/CreateBounty'
import { ReleaseBounty } from '@/components/ReleaseBounty'
import { BountyDetail } from '@/components/BountyDetail'
import { MERGEPAY_ADDRESS, MAINNET_READY } from '@/lib/mergePayContract'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { APP_CHAIN_ID } from '@/lib/chainConfig'

type Tab = 'home' | 'create' | 'release' | 'detail'

export default function App() {
  const { isConnected } = useAccount()
  const [tab, setTab] = useState<Tab>('home')
  const [detailBountyId, setDetailBountyId] = useState<bigint | null>(null)

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <Header />

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
        {/* Hero carousel — headline and actions overlaid on the illustrations */}
        <div className="mb-8">
          <Carousel
            overlay={{
              meta: (
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs" style={{ color: 'rgba(240,246,255,0.7)' }}>
                  <span
                    className="flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold"
                    style={{ background: 'rgba(34,211,238,0.18)', color: 'var(--accent)', border: '1px solid rgba(34,211,238,0.25)' }}
                  >
                    <GitBranch size={10} aria-hidden="true" />
                    Arc Mainnet
                  </span>
                  {MAINNET_READY && MERGEPAY_ADDRESS ? (
                    <a
                      href={buildAddressExplorerUrl(APP_CHAIN_ID, MERGEPAY_ADDRESS)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:opacity-80"
                      style={{ color: 'rgba(240,246,255,0.65)' }}
                    >
                      Contract on explorer
                    </a>
                  ) : (
                    <span style={{ color: 'rgba(240,246,255,0.5)' }}>Deployment pending</span>
                  )}
                </div>
              ),
              headline: (
                <h1
                  className="display text-4xl font-bold leading-tight sm:text-5xl"
                  style={{ color: '#f0f6ff', textShadow: '0 2px 12px rgba(5,14,30,0.6)', letterSpacing: '-0.02em' }}
                >
                  MergePay
                </h1>
              ),
              subtext: (
                <p className="text-sm leading-relaxed sm:text-base" style={{ color: 'rgba(240,246,255,0.82)', textShadow: '0 1px 6px rgba(5,14,30,0.5)' }}>
                  Escrow USDC for open source contributors. Post a bounty, review the work, release when satisfied.
                </p>
              ),
              cta: (
                <button
                  onClick={() => setTab('create')}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-90"
                  style={{ background: 'var(--accent)', color: '#0a1628' }}
                  type="button"
                >
                  <PlusCircle size={14} aria-hidden="true" />
                  New bounty
                </button>
              ),
              ctaSecondary: (
                <button
                  onClick={() => setTab('release')}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-80"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(240,246,255,0.9)', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(6px)' }}
                  type="button"
                >
                  <ArrowRightCircle size={14} aria-hidden="true" />
                  Release or refund
                </button>
              ),
            }}
          />
        </div>

        {/* Deployment pending banner — shown until mainnet address is provided */}
        {!MAINNET_READY && (
          <div
            className="mb-4 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm"
            style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.25)',
              color: 'var(--accent-amber)',
            }}
            role="status"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <strong>Mainnet contract not yet deployed.</strong>{' '}
              Run{' '}
              <code
                className="rounded px-1 py-0.5 text-xs"
                style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent-amber)' }}
              >
                scripts/deploy-mainnet.sh
              </code>{' '}
              locally, sign the transaction in your wallet, then set{' '}
              <code
                className="rounded px-1 py-0.5 text-xs"
                style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent-amber)' }}
              >
                MERGEPAY_MAINNET_ADDRESS
              </code>{' '}
              in{' '}
              <code
                className="rounded px-1 py-0.5 text-xs"
                style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent-amber)' }}
              >
                src/lib/chainConfig.ts
              </code>
              {' '}to enable all write operations.
            </div>
          </div>
        )}

        {/* Main panel */}
        <div
          className="rounded-3xl p-1"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {/* Tab bar */}
          <div
            className="mb-1 flex gap-1 rounded-2xl p-1"
            style={{ background: 'var(--surface-muted)' }}
            role="tablist"
            aria-label="MergePay actions"
          >
            {(
              [
                { id: 'home' as Tab, label: 'Overview', icon: null },
                { id: 'create' as Tab, label: 'New bounty', icon: PlusCircle },
                { id: 'release' as Tab, label: 'Release or refund', icon: ArrowRightCircle },
                { id: 'detail' as Tab, label: 'Bounty detail', icon: Search },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={tab === id}
                aria-controls="tab-panel"
                onClick={() => setTab(id)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition"
                style={{
                  background: tab === id ? 'var(--surface-strong)' : 'transparent',
                  color: tab === id ? 'var(--ink)' : 'var(--muted)',
                  border: tab === id ? '1px solid var(--border)' : '1px solid transparent',
                }}
                type="button"
              >
                {Icon && <Icon size={12} aria-hidden="true" />}
                <span className="hidden sm:inline">{label}</span>
                {!Icon && <span className="sm:hidden">{label}</span>}
                {Icon && <span className="sm:hidden">{id === 'create' ? 'New' : id === 'release' ? 'Action' : 'Detail'}</span>}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4" role="tabpanel" id="tab-panel" aria-labelledby={`tab-${tab}`}>
            {tab === 'home' && <HomeTab onCreateClick={() => setTab('create')} onReleaseClick={() => setTab('release')} />}
            {tab === 'create' && (
              isConnected ? (
                <CreateBounty
                  onBountyCreated={(id) => {
                    setDetailBountyId(id)
                    setTab('detail')
                  }}
                />
              ) : <ConnectPrompt action="create a bounty" />
            )}
            {tab === 'release' && (
              isConnected ? <ReleaseBounty /> : <ConnectPrompt action="release or refund a bounty" />
            )}
            {tab === 'detail' && (
              <DetailTab bountyId={detailBountyId} onLoadBounty={setDetailBountyId} />
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-xs" style={{ color: 'var(--subtle)' }}>
          MergePay is a testnet demo. Not security audited. GitHub data is advisory only and does not trigger payments automatically.
        </footer>
      </main>
    </div>
  )
}

function HomeTab({ onCreateClick, onReleaseClick }: { onCreateClick: () => void; onReleaseClick: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="display mb-1 text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          How it works
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
          MergePay is a simple onchain escrow. A funder locks USDC for one contributor wallet, linked to a GitHub issue. After reviewing the work the funder personally decides to release the funds. GitHub data is loaded as advisory evidence. A merged pull request never triggers payment automatically.
        </p>
      </div>

      <ol className="flex flex-col gap-3 text-sm" style={{ color: 'var(--muted)' }}>
        {[
          'Connect your wallet to Arc Testnet.',
          'Enter the repository, issue, contributor wallet, amount, and expiry.',
          'MergePay fetches the real GitHub issue for your review.',
          'Approve and fund: two wallet signatures lock USDC in the contract.',
          'Review the pull request and release funds when satisfied, or reclaim after expiry.',
        ].map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className="display flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: 'rgba(34,211,238,0.12)', color: 'var(--accent)' }}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onCreateClick}
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition hover:opacity-90"
          style={{ background: 'var(--accent)', color: '#0a1628' }}
          type="button"
        >
          <PlusCircle size={15} aria-hidden="true" />
          New bounty
        </button>
        <button
          onClick={onReleaseClick}
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition hover:opacity-80"
          style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
          type="button"
        >
          <ArrowRightCircle size={15} aria-hidden="true" />
          Release or refund
        </button>
      </div>

      {/* Disclaimer */}
      <div
        className="rounded-xl px-4 py-3 text-xs leading-relaxed"
        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.16)', color: 'var(--muted)' }}
      >
        Testnet only. Funds on Arc Testnet have no real value. This contract has not received an independent security review. Do not use for production without a professional audit.
      </div>
    </div>
  )
}

function DetailTab({
  bountyId,
  onLoadBounty,
}: {
  bountyId: bigint | null
  onLoadBounty: (id: bigint) => void
}) {
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  if (bountyId !== null) {
    return (
      <BountyDetail
        bountyId={bountyId}
        onBack={() => onLoadBounty(null as unknown as bigint)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Enter a bounty ID to view its current state directly from the contract.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="detail-id" className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
          Bounty ID
        </label>
        <input
          id="detail-id"
          type="text"
          inputMode="numeric"
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="1"
          className="w-full rounded-xl px-3.5 py-2.5 text-sm tabular-nums outline-none transition"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        />
      </div>
      {inputError && (
        <div
          className="text-sm"
          style={{ color: 'var(--danger)' }}
          role="alert"
        >
          {inputError}
        </div>
      )}
      <button
        onClick={() => {
          setInputError(null)
          const id = parseInt(input, 10)
          if (isNaN(id) || id <= 0) { setInputError('Enter a valid bounty ID.'); return }
          onLoadBounty(BigInt(id))
        }}
        disabled={!input}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#0a1628' }}
        type="button"
      >
        <Search size={14} aria-hidden="true" />
        View bounty
      </button>
    </div>
  )
}

function ConnectPrompt({ action }: { action: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Connect your wallet to {action}.
      </p>
      <ConnectKitButton />
    </div>
  )
}
