/**
 * Blocks write actions when the wallet is on the wrong chain.
 * Also exports the hook useChainGuard for programmatic checks.
 */
import { useAccount, useSwitchChain } from 'wagmi'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { requireChain } from '@/onchain-facts'
import { APP_CHAIN_ID } from '@/lib/chainConfig'

const arcTestnet = requireChain(APP_CHAIN_ID)

export function useChainGuard() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const onWrongChain = isConnected && chainId !== APP_CHAIN_ID
  const isReady = isConnected && !onWrongChain

  const requestSwitch = () =>
    switchChain({ chainId: APP_CHAIN_ID })

  return { isConnected, onWrongChain, isReady, isSwitching, requestSwitch }
}

interface ChainGuardBannerProps {
  compact?: boolean
}

/** Banner shown when wallet is connected to the wrong network */
export function ChainGuardBanner({ compact = false }: ChainGuardBannerProps) {
  const { onWrongChain, isSwitching, requestSwitch } = useChainGuard()

  if (!onWrongChain) return null

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
        style={{
          background: 'rgba(248, 113, 113, 0.10)',
          border: '1px solid rgba(248, 113, 113, 0.25)',
          color: 'var(--danger)',
        }}
        role="alert"
      >
        <AlertTriangle size={13} aria-hidden="true" />
        <span>Writes disabled: wrong network. Please switch to {arcTestnet.name}.</span>
        <button
          onClick={requestSwitch}
          disabled={isSwitching}
          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-0.5 font-semibold transition disabled:opacity-50"
          style={{ background: 'rgba(248,113,113,0.18)', color: 'var(--danger)' }}
          type="button"
        >
          {isSwitching ? <RefreshCw size={10} className="animate-spin" aria-hidden="true" /> : null}
          Switch
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-5"
      style={{
        background: 'rgba(248, 113, 113, 0.08)',
        border: '1px solid rgba(248, 113, 113, 0.25)',
      }}
      role="alert"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} style={{ color: 'var(--danger)' }} aria-hidden="true" />
        <span className="font-semibold" style={{ color: 'var(--danger)' }}>
          Wrong network
        </span>
      </div>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        MergePay runs on{' '}
        <strong style={{ color: 'var(--ink)' }}>{arcTestnet.name}</strong> (chain ID{' '}
        {APP_CHAIN_ID}). Wallet writes are disabled until you switch.
      </p>
      <button
        onClick={requestSwitch}
        disabled={isSwitching}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
        style={{ background: 'var(--danger)', color: '#fff' }}
        type="button"
      >
        {isSwitching && <RefreshCw size={14} className="animate-spin" aria-hidden="true" />}
        Switch to {arcTestnet.name}
      </button>
    </div>
  )
}
