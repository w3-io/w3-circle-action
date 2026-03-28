#!/bin/bash
# Set up secrets for the CCTP cross-chain workflow.
#
# Prerequisites:
#   - W3_SECRETS_API_URL and W3_SECRETS_AUTH_TOKEN in your .env
#   - A wallet private key with testnet USDC on Ethereum Sepolia
#
# Usage:
#   ./scripts/setup-secrets.sh <private-key> [recipient-address]
#
# The private key is stored in the W3 secrets API under the
# cctp-testnet environment. It's used by the workflow to sign
# on-chain transactions (approve, burn, mint).
#
# If no recipient is provided, the wallet's own address is used
# (transfers to self for testing).

set -euo pipefail

PRIVATE_KEY="${1:-}"
RECIPIENT="${2:-}"

if [ -z "${PRIVATE_KEY}" ]; then
  echo "Usage: ./scripts/setup-secrets.sh <private-key> [recipient-address]"
  echo ""
  echo "  private-key:       0x-prefixed wallet private key"
  echo "  recipient-address: (optional) destination address for USDC"
  echo "                     defaults to the wallet's own address"
  echo ""
  echo "The wallet needs:"
  echo "  - Testnet USDC on Ethereum Sepolia (faucet.circle.com)"
  echo "  - Sepolia ETH for gas (sepoliafaucet.com)"
  echo "  - Fuji AVAX for gas on the mint side (faucet.avax.network)"
  exit 1
fi

# Load .env from protocol repo if available
PROTOCOL_DIR="$(cd "$(dirname "$0")/../../../protocol" 2>/dev/null && pwd)"
if [ -f "${PROTOCOL_DIR}/.env" ]; then
  # shellcheck disable=SC1091
  source "${PROTOCOL_DIR}/.env"
fi

API_URL="${W3_SECRETS_API_URL:-}"
AUTH_TOKEN="${W3_SECRETS_AUTH_TOKEN:-}"

if [ -z "${API_URL}" ] || [ -z "${AUTH_TOKEN}" ]; then
  echo "Error: W3_SECRETS_API_URL and W3_SECRETS_AUTH_TOKEN must be set"
  echo "Check your protocol/.env file"
  exit 1
fi

ENV_ID="0x892e4bbe33281932fee226828545da9128de2f498144c32b95cba70e31449267"

# Derive wallet address from private key
if command -v node &>/dev/null; then
  WALLET=$(node -e "
    const { ethers } = require('ethers');
    const w = new ethers.Wallet('${PRIVATE_KEY}');
    console.log(w.address);
  " 2>/dev/null) || WALLET="(could not derive — install ethers)"
else
  WALLET="(node not available to derive address)"
fi

# Default recipient to wallet's own address
RECIPIENT="${RECIPIENT:-${WALLET}}"

echo "=== CCTP Secrets Setup ==="
echo "Environment: cctp-testnet (${ENV_ID})"
echo "Wallet:      ${WALLET}"
echo "Recipient:   ${RECIPIENT}"
echo ""

# Set CCTP_PRIVATE_KEY
echo -n "Setting CCTP_PRIVATE_KEY... "
curl -s -X PUT \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  "${API_URL}/environments/${ENV_ID}/secrets/CCTP_PRIVATE_KEY" \
  -d "{\"value\": \"${PRIVATE_KEY}\"}" | jq -r '.message // "done"'

# Set CCTP_RECIPIENT
echo -n "Setting CCTP_RECIPIENT... "
curl -s -X PUT \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  "${API_URL}/environments/${ENV_ID}/secrets/CCTP_RECIPIENT" \
  -d "{\"value\": \"${RECIPIENT}\"}" | jq -r '.message // "done"'

echo ""
echo "=== Secrets configured ==="
echo ""
echo "To deploy and test:"
echo "  cd protocol"
echo "  make dev          # Start local network"
echo "  w3 workflow deploy ../w3-circle-action/workflows/cctp-cross-chain.yaml"
echo "  w3 workflow cctp-cross-chain-transfer trigger"
echo ""
echo "To check your USDC balance:"
echo "  # Sepolia"
echo "  cast call 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 'balanceOf(address)(uint256)' ${WALLET} --rpc-url https://rpc.sepolia.org"
echo "  # Fuji"
echo "  cast call 0x5425890298aed601595a70AB815c96711a31Bc65 'balanceOf(address)(uint256)' ${WALLET} --rpc-url https://api.avax-test.network/ext/bc/C/rpc"
