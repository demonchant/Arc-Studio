/**
 * Canonical network configuration for MergePay.
 *
 * SINGLE SOURCE OF TRUTH for chain IDs, USDC addresses, and contract addresses.
 * Every other module imports from here. No hardcoded literals anywhere else.
 *
 * ── Chain ID verification ──────────────────────────────────────────────────
 * Source 1: Arc Studio onchain-facts registry (src/onchain-facts.ts)
 *   Arc Testnet: chainId 5042002, name "Arc Testnet", isTestnet true
 *   Arc Mainnet: chainId 5042,    name "Arc",         isTestnet false
 *
 * Source 2: viem installed chain definitions (node_modules/viem/_cjs/chains/)
 *   arcTestnet.js: id 5042002, name "Arc Testnet", testnet true
 *   arc.js:        id 5042,    name "Arc"
 *
 * ── USDC verification ──────────────────────────────────────────────────────
 * Address 0x3600000000000000000000000000000000000000
 * Verified live on Arc Mainnet via read_contract:
 *   name()     = "USDC"
 *   decimals() = 6  (ERC-20 token amounts use 6 decimals)
 *   Native gas on Arc also uses USDC but with 18 decimals for gas accounting.
 *   These are two views of the same asset — do not sum or double-count them.
 * Same address on both Arc networks per Arc Studio registry.
 *
 * ── Mainnet deployment ─────────────────────────────────────────────────────
 * MergePay deployed to Arc Mainnet on 2026-10-21.
 * Address:  0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470
 * Tx hash:  0x84f060634a466e2b0b915408bf1d561b5c0be88aff31e6b00f66dd304069770f
 * Block:    27024790
 * Deployer: 0xf7c1F9f31A6D4dc9d725527a0A3819c1274E3245
 * USDC arg: 0x3600000000000000000000000000000000000000
 * Fee:      0.014477232 USDC
 *
 * Onchain read verification (this session, before activation):
 *   usdc()        = 0x3600000000000000000000000000000000000000  ✓
 *   bountyCount() = 0  ✓
 *   bytecode      = 2835 bytes present  ✓
 *
 * ── Current app target ─────────────────────────────────────────────────────
 * APP_CHAIN_ID = ARC_MAINNET_CHAIN_ID
 * MAINNET_READY = true (address is set)
 */

/** Arc Testnet — chain ID: viem arcTestnet.id = 5042002 */
export const ARC_TESTNET_CHAIN_ID = 5042002 as const

/** Arc Mainnet — chain ID: viem arc.id = 5042 */
export const ARC_MAINNET_CHAIN_ID = 5042 as const

/**
 * The chain this app currently targets.
 * Currently set to mainnet. The wagmi config (src/config.ts) includes the
 * `arc` chain so MetaMask can connect to Arc Mainnet.
 *
 * Writes are still gated by MAINNET_READY below — they remain disabled until
 * the real deployed contract address is provided.
 */
export const APP_CHAIN_ID = ARC_MAINNET_CHAIN_ID

/** USDC ERC-20 address (same on both Arc networks). */
export const USDC_ADDRESS_TESTNET = '0x3600000000000000000000000000000000000000' as const
export const USDC_ADDRESS_MAINNET = '0x3600000000000000000000000000000000000000' as const
export const USDC_ADDRESS = USDC_ADDRESS_MAINNET

/**
 * Testnet deployment — preserved, not affected by mainnet config.
 * Chain: Arc Testnet (5042002)
 * Tx: 0x20d6aad398ae14c6d8027b548748ba21ec5b445353df71f4b172eefc2ea352e8
 * Explorer: https://explorer.testnet.arc.io/address/0xd22e0efe90d9a92ea9c669acfb610e42a4129e84
 */
export const MERGEPAY_TESTNET_ADDRESS = '0xd22e0efe90d9a92ea9c669acfb610e42a4129e84' as const

/**
 * Mainnet contract address.
 *
 * PENDING DEPLOYMENT — this value is null until you run the external deploy
 * script (scripts/deploy-mainnet.sh), sign the transaction in your wallet,
 * and provide the resulting address here.
 *
 * Do not use the testnet address here. Do not guess or invent an address.
 * Set this only to a value from a real broadcast receipt.
 */
export const MERGEPAY_MAINNET_ADDRESS: `0x${string}` | null =
  '0x18884Bf15639FE43d8FD560bc73Ed8B18bAD1470'

/**
 * True only when the mainnet contract address has been filled in above.
 * The app checks this flag before enabling any write operations.
 * All write buttons, forms, and contract calls must be gated on this flag.
 */
export const MAINNET_READY = MERGEPAY_MAINNET_ADDRESS !== null
