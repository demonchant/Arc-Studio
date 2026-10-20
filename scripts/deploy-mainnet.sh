#!/usr/bin/env bash
# =============================================================================
# MergePay — Arc Mainnet external deployment script
#
# SECURITY RULES (read before running):
#   - Never pass a private key on the command line or in an environment variable
#     that is visible to other processes.
#   - Use a Foundry encrypted keystore (cast wallet import) or a hardware
#     signer (Ledger/Trezor via --ledger / --trezor) so the key is never
#     in plaintext on disk or in shell history.
#   - The --broadcast flag is NOT present in the dry-run command (Step 1).
#     You must add it yourself for the live deploy (Step 2) after reviewing
#     the dry-run output.
#   - This script reads no .env file and prints no secrets.
#
# PREREQUISITES (on your local machine, not in Arc Studio):
#   1. Foundry installed: https://getfoundry.sh
#      Check:  forge --version   (must be >= 0.3)
#   2. Contract source cloned or downloaded — the MergePay.sol source and its
#      OpenZeppelin dependencies must be present locally.
#      Easiest: clone the Arc-Studio app source repo, then cd into it.
#   3. Keystore created (one-time):
#        cast wallet import mergepaydeploy --interactive
#      This prompts for your private key and a password, stores encrypted.
#      The key is never written to disk in plaintext.
#   4. OR use a hardware signer: add --ledger --hd-paths "m/44'/60'/0'/0/0"
#      to the forge create command below instead of --account.
#
# VERIFIED MAINNET PARAMETERS (do not change without re-verification):
#   Chain ID:     5042
#   RPC:          https://rpc.mainnet.arc.io
#   Explorer:     https://explorer.arc.io
#   USDC address: 0x3600000000000000000000000000000000000000
#   USDC name():  "USDC"   (verified via read_contract this session)
#   USDC decimals(): 6     (verified via read_contract this session)
#   evm_version:  paris    (matches foundry.toml)
#   solc:         0.8.28   (matches foundry.toml)
#
# Sources:
#   Arc Studio onchain-facts.ts (generated registry, chainId 5042 entry)
#   viem arc chain definition (arc.id = 5042, arc.rpcUrls)
#   Live eth_call to 0x3600...0000 on Arc Mainnet RPC
# =============================================================================

set -euo pipefail

CHAIN_ID=5042
RPC="https://rpc.mainnet.arc.io"
USDC="0x3600000000000000000000000000000000000000"
EXPECTED_USDC_NAME="USDC"

echo "=== MergePay Mainnet Deployment Script ==="
echo ""
echo "Chain ID : $CHAIN_ID"
echo "RPC      : $RPC"
echo "USDC     : $USDC"
echo ""

# ---------------------------------------------------------------------------
# Step 0: Pre-flight checks — verify chain ID and USDC before spending gas
# ---------------------------------------------------------------------------
echo ">>> Step 0: Pre-flight verification"

ACTUAL_CHAIN_HEX=$(cast rpc --rpc-url "$RPC" eth_chainId 2>&1)
ACTUAL_CHAIN=$(python3 -c "print(int('$ACTUAL_CHAIN_HEX'.strip().strip('\"'), 16))" 2>/dev/null || echo "UNKNOWN")

if [ "$ACTUAL_CHAIN" != "$CHAIN_ID" ]; then
  echo "ERROR: Expected chain ID $CHAIN_ID but got '$ACTUAL_CHAIN'. Aborting."
  exit 1
fi
echo "    chain ID confirmed: $ACTUAL_CHAIN"

USDC_NAME=$(cast call --rpc-url "$RPC" "$USDC" "name()(string)" 2>&1)
if [ "$USDC_NAME" != "$EXPECTED_USDC_NAME" ]; then
  echo "ERROR: USDC name() returned '$USDC_NAME', expected '$EXPECTED_USDC_NAME'. Aborting."
  exit 1
fi
echo "    USDC name() confirmed: $USDC_NAME"
echo "    Pre-flight PASSED."
echo ""

# ---------------------------------------------------------------------------
# Step 1: DRY RUN (no --broadcast)
#
# Review this output carefully. It shows:
#   - Estimated gas
#   - Calldata (constructor args)
#   - Sender address
#   - No transaction is submitted
#
# Run with:  bash scripts/deploy-mainnet.sh
# ---------------------------------------------------------------------------
echo ">>> Step 1: Dry run (no broadcast)"
echo "    Review the output below, then run Step 2 to broadcast."
echo ""

# Replace --account mergepaydeploy with --ledger if using a hardware wallet.
# The password for the keystore account will be prompted interactively.
forge create \
  --rpc-url "$RPC" \
  --chain-id "$CHAIN_ID" \
  --account mergepaydeploy \
  contracts/MergePay.sol:MergePay \
  --constructor-args "$USDC"

# NOTE: No --broadcast above. This is intentional.
# The forge create dry-run simulates the deployment and shows gas estimates
# without submitting anything to the network.

echo ""
echo "=== Dry run complete. ==="
echo ""
echo "If the output above looks correct (sender address, gas estimate, USDC arg),"
echo "run Step 2 below manually in your terminal:"
echo ""
echo "--- STEP 2: Live broadcast (run this yourself after reviewing Step 1) ---"
echo ""
cat << 'BROADCAST_CMD'
forge create \
  --rpc-url https://rpc.mainnet.arc.io \
  --chain-id 5042 \
  --account mergepaydeploy \
  --broadcast \
  contracts/MergePay.sol:MergePay \
  --constructor-args 0x3600000000000000000000000000000000000000
BROADCAST_CMD
echo ""
echo "After broadcast, Foundry prints:"
echo "  Deployer: <your address>"
echo "  Deployed to: <CONTRACT ADDRESS>     <-- copy this"
echo "  Transaction hash: <TX HASH>          <-- copy this"
echo ""
echo "Then provide both values to Arc Studio to enable mainnet mode in the app."
echo ""
echo "HARDWARE WALLET ALTERNATIVE (Ledger):"
echo "  Replace '--account mergepaydeploy' with '--ledger' in both commands above."
echo "  Foundry will prompt you to confirm on the device."
