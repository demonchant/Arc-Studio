/**
 * MergePay contract configuration.
 *
 * Testnet deployment (Arc Testnet, chain ID 5042002):
 *   Address: 0xd22e0efe90d9a92ea9c669acfb610e42a4129e84
 *   Tx:      0x20d6aad398ae14c6d8027b548748ba21ec5b445353df71f4b172eefc2ea352e8
 *   Explorer: https://explorer.testnet.arc.io/address/0xd22e0efe90d9a92ea9c669acfb610e42a4129e84
 *
 * Mainnet deployment (Arc Mainnet, chain ID 5042):
 *   Address:  0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470
 *   Tx:       0x84f060634a466e2b0b915408bf1d561b5c0be88aff31e6b00f66dd304069770f
 *   Block:    27024790
 *   Deployer: 0xf7c1F9f31A6D4dc9d725527a0A3819c1274E3245
 *   Explorer: https://explorer.arc.io/address/0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470
 *
 * The app targets Arc Mainnet (APP_CHAIN_ID = 5042).
 * MAINNET_READY = true. All write operations are enabled.
 */
import abi from './abi/MergePay.json'
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

export const MERGEPAY_ABI = abi

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
