#!/bin/bash
# Test CCTP on-chain flow: Ethereum Sepolia → Avalanche Fuji
#
# Prerequisites:
#   - CCTP_PRIVATE_KEY: wallet private key with testnet USDC + Sepolia ETH
#   - Testnet USDC on Sepolia: faucet.circle.com
#   - Sepolia ETH for gas: sepoliafaucet.com or similar
#
# Optional env vars:
#   - ETHEREUM_SEPOLIA_RPC_URL: custom Sepolia RPC (defaults to public)
#   - AVALANCHE_FUJI_RPC_URL: custom Fuji RPC (defaults to public)
#
# Usage:
#   export CCTP_PRIVATE_KEY="0x..."
#   ./scripts/test-cctp-onchain.sh [amount] [recipient]

set -euo pipefail

AMOUNT="${1:-0.01}"
RECIPIENT="${2:-}"  # defaults to same wallet

if [ -z "${CCTP_PRIVATE_KEY:-}" ]; then
  echo "Error: CCTP_PRIVATE_KEY env var is required"
  echo ""
  echo "Set it to a wallet private key that has:"
  echo "  - Testnet USDC on Ethereum Sepolia (get from faucet.circle.com)"
  echo "  - Sepolia ETH for gas (get from sepoliafaucet.com)"
  echo ""
  echo "Usage: CCTP_PRIVATE_KEY=0x... ./scripts/test-cctp-onchain.sh [amount]"
  exit 1
fi

echo "=== CCTP On-Chain Test: Sepolia → Fuji ==="
echo "Amount: ${AMOUNT} USDC"
echo ""

# Use node to derive the wallet address from the private key
WALLET=$(node -e "
  const { ethers } = require('ethers');
  const w = new ethers.Wallet('${CCTP_PRIVATE_KEY}');
  console.log(w.address);
")
echo "Wallet: ${WALLET}"
RECIPIENT="${RECIPIENT:-$WALLET}"
echo "Recipient: ${RECIPIENT}"
echo ""

# Helper to run a command via the action's main.js
run_command() {
  local cmd="$1"
  shift
  node -e "
    process.env.INPUT_COMMAND = '${cmd}';
    process.env.INPUT_SANDBOX = 'true';
    process.env.INPUT_CHAIN = process.env.INPUT_CHAIN || '';
    $@
    import('./src/main.js').then(m => m.run());
  " 2>&1 || true
}

echo "--- Step 1: Approve TokenMessenger to spend USDC ---"
INPUT_COMMAND=approve-burn \
INPUT_CHAIN=ethereum-sepolia \
INPUT_AMOUNT="${AMOUNT}" \
INPUT_PRIVATE_KEY="${CCTP_PRIVATE_KEY}" \
INPUT_SANDBOX=true \
node -e "
  process.env.INPUT_COMMAND = 'approve-burn';
  process.env.INPUT_CHAIN = 'ethereum-sepolia';
  process.env.INPUT_AMOUNT = '${AMOUNT}';
  process.env['INPUT_PRIVATE-KEY'] = '${CCTP_PRIVATE_KEY}';
  process.env.INPUT_SANDBOX = 'true';
  import('./src/main.js').then(m => m.run());
"
echo ""

echo "--- Step 2: Burn USDC on Sepolia ---"
BURN_OUTPUT=$(INPUT_COMMAND=burn \
INPUT_CHAIN=ethereum-sepolia \
INPUT_DESTINATION_CHAIN=avalanche-fuji \
INPUT_DESTINATION_ADDRESS="${RECIPIENT}" \
INPUT_AMOUNT="${AMOUNT}" \
INPUT_PRIVATE_KEY="${CCTP_PRIVATE_KEY}" \
INPUT_SANDBOX=true \
node -e "
  process.env.INPUT_COMMAND = 'burn';
  process.env.INPUT_CHAIN = 'ethereum-sepolia';
  process.env['INPUT_DESTINATION-CHAIN'] = 'avalanche-fuji';
  process.env['INPUT_DESTINATION-ADDRESS'] = '${RECIPIENT}';
  process.env.INPUT_AMOUNT = '${AMOUNT}';
  process.env['INPUT_PRIVATE-KEY'] = '${CCTP_PRIVATE_KEY}';
  process.env.INPUT_SANDBOX = 'true';
  import('./src/main.js').then(m => m.run());
" 2>&1)
echo "${BURN_OUTPUT}"

# Extract messageHash from output
MESSAGE_HASH=$(echo "${BURN_OUTPUT}" | grep -o '"messageHash":"0x[a-f0-9]*"' | head -1 | cut -d'"' -f4)
MESSAGE_BYTES=$(echo "${BURN_OUTPUT}" | grep -o '"messageBytes":"0x[a-f0-9]*"' | head -1 | cut -d'"' -f4)

if [ -z "${MESSAGE_HASH}" ]; then
  echo "Error: Could not extract messageHash from burn output"
  exit 1
fi

echo ""
echo "Message Hash: ${MESSAGE_HASH}"
echo ""

echo "--- Step 3: Wait for attestation ---"
node -e "
  process.env.INPUT_COMMAND = 'wait-for-attestation';
  process.env['INPUT_MESSAGE-HASH'] = '${MESSAGE_HASH}';
  process.env.INPUT_SANDBOX = 'true';
  process.env['INPUT_POLL-INTERVAL'] = '10';
  process.env['INPUT_MAX-ATTEMPTS'] = '30';
  import('./src/main.js').then(m => m.run());
"
echo ""

# Extract attestation (this is tricky from stdout — in practice, use the action output)
echo "--- Step 4: Mint on Fuji ---"
echo "(Mint step requires attestation from step 3)"
echo "In a W3 workflow, the attestation flows between steps automatically."
echo ""
echo "To complete manually:"
echo "  1. Get attestation: curl https://iris-api-sandbox.circle.com/attestations/${MESSAGE_HASH}"
echo "  2. Run mint command with message-bytes and attestation"
