/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * Arc Mainnet only.
 * Arc Testnet is NOT included so writes cannot accidentally go to testnet.
 *
 * Writes are gated in the app by MAINNET_READY in src/lib/chainConfig.ts.
 * Until the real mainnet contract address is provided and MAINNET_READY = true,
 * all write operations are disabled regardless of which chain is connected.
 */

import { http, createConfig } from 'wagmi'
import { arc } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URL so trace events show the correct chain name
registerChain(arc.id, arc.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arc],
  connectors: [injected()],
  transports: {
    [arc.id]: http(),
  },
})
