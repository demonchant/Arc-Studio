import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { AlertTriangle, GitBranch } from 'lucide-react'
import { APP_CHAIN_ID } from '@/lib/chainConfig'

export function Header() {
  const { isConnected, chainId } = useAccount()
  const wrongChain = isConnected && chainId !== APP_CHAIN_ID

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 backdrop-blur-xl"
      style={{
        background: 'rgba(10, 22, 40, 0.85)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ background: 'rgba(34, 211, 238, 0.15)' }}
          aria-hidden="true"
        >
          <GitBranch size={16} style={{ color: 'var(--accent)' }} />
        </div>
        <span
          className="display text-base font-bold"
          style={{ color: 'var(--ink)' }}
        >
          MergePay
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {wrongChain && (
          <div
            className="hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold sm:flex"
            style={{ background: 'rgba(248, 113, 113, 0.12)', color: 'var(--danger)' }}
            role="alert"
          >
            <AlertTriangle size={12} aria-hidden="true" />
            Wrong network
          </div>
        )}
        <ConnectKitButton />
      </div>
    </header>
  )
}
