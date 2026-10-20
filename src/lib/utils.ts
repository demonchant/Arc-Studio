import { type Address, isAddress } from 'viem'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { APP_CHAIN_ID } from '@/lib/chainConfig'

/** Format an Ethereum address to short form: 0x1234...abcd */
export function fmtAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/** Format a USDC amount from raw bigint (6 decimals) to human string with 2 dp */
export function fmtUsdc(raw: bigint): string {
  return Amount.fromRaw(raw, usdcDecimalsFor(APP_CHAIN_ID)).toFixed(2)
}

/** Format a Unix timestamp (seconds) to locale date+time string */
export function fmtTimestamp(unixSecs: bigint | number): string {
  const ms = typeof unixSecs === 'bigint' ? Number(unixSecs) * 1000 : unixSecs * 1000
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Format an ISO date string to a readable form */
export function fmtIsoDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Parse a USDC human amount string to bigint (6 decimals). Returns null if invalid. */
export function parseUsdcInput(s: string): bigint | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null
  const [whole, frac = ''] = trimmed.split('.')
  const fracPadded = frac.padEnd(6, '0')
  const raw = BigInt(whole) * 1_000_000n + BigInt(fracPadded)
  if (raw <= 0n) return null
  return raw
}

/** Validate an Ethereum address. Returns true if valid. */
export function isValidAddress(s: string): s is Address {
  return isAddress(s)
}

/**
 * Canonical owner/repo string from inputs.
 * Always lowercased so the keccak256 hash produced at bounty-creation time
 * matches the hash recomputed from PR data at release time.
 */
export function canonicalRepo(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`
}
