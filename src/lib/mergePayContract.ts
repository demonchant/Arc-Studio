/**
 * MergePay contract configuration.
 *
 * Testnet deployment (Arc Testnet, chain ID 5042002):
 *   Address: 0xd22e0efe90d9a92ea9c669acfb610e42a4129e84
 *   Tx:      0x20d6aad398ae14c6d8027b548748ba21ec5b445353df71f4b172eefc2ea352e8
 *   Explorer: https://explorer.testnet.arc.io/address/0xd22e0efe90d9a92ea9c669acfb610e42a4129e84
 *
 * Mainnet deployment (Arc Mainnet, chain ID 5042):
 *   Address: PENDING — run scripts/deploy-mainnet.sh externally, sign in wallet,
 *            then set MERGEPAY_MAINNET_ADDRESS in src/lib/chainConfig.ts.
 *
 * The app targets Arc Mainnet (APP_CHAIN_ID = 5042).
 * MERGEPAY_ADDRESS below is null until the mainnet address is provided.
 * MAINNET_READY gates all write operations in the UI.
 */
import artifact from '../../contracts/out/MergePay.sol/MergePay.json'
import {
  MAINNET_READY,
  MERGEPAY_MAINNET_ADDRESS,
  MERGEPAY_TESTNET_ADDRESS,
} from './chainConfig'

export { MAINNET_READY }

/**
 * The active contract address for the current app chain (Arc Mainnet).
 * Null until the mainnet deployment is complete.
 * Never use the testnet address for mainnet interactions.
 */
export const MERGEPAY_ADDRESS = MERGEPAY_MAINNET_ADDRESS

/**
 * The testnet address, kept for reference and testnet-specific tooling.
 * Not used by the mainnet app.
 */
export const MERGEPAY_TESTNET_ADDRESS_REF = MERGEPAY_TESTNET_ADDRESS

export const MERGEPAY_ABI = artifact.abi

export const MERGEPAY = MERGEPAY_ADDRESS
  ? ({ address: MERGEPAY_ADDRESS, abi: MERGEPAY_ABI } as const)
  : null

export type BountyState = 0 | 1 | 2 // Funded, Released, Refunded

export interface BountyData {
  funder: string
  recipient: string
  amount: bigint
  expiresAt: bigint
  repositoryHash: string
  issueNumber: bigint
  state: BountyState
}

export const BOUNTY_STATE_LABEL: Record<number, string> = {
  0: 'Funded',
  1: 'Released',
  2: 'Refunded',
}
