# E2E Test Results

> Last verified: 2026-04-15

## Prerequisites

| Credential | Env var | Source |
|-----------|---------|--------|
| Circle Platform API key | `CIRCLE_API_KEY` | Circle dashboard |
| Circle entity secret | `CIRCLE_ENTITY_SECRET` | Circle dashboard (32-byte hex) |

## Results

| # | Step | Command | Status | Notes |
|---|------|---------|--------|-------|
| 1 | Get supported CCTP chains | `get-supported-chains` | PASS | sandbox mode |
| 2 | Get domain info (ETH Sepolia) | `get-domain-info` | PASS | |
| 3 | Create a wallet set | `create-wallet-set` | PASS | Needs entity-secret |
| 4 | Extract wallet set ID | (run step) | PASS | |
| 5 | Create a wallet (ETH Sepolia) | `create-wallet` | PASS | Needs entity-secret |
| 6 | Extract wallet ID/address | (run step) | PASS | |
| 7 | List wallets | `list-wallets` | PASS | |
| 8 | Get the created wallet | `get-wallet` | PASS | |
| 9 | Get wallet balance | `get-balance` | PASS | |
| 10 | Screen an address | `screen-address` | FAIL | Needs entity-secret for some setups |

**Summary: 2/3 command categories pass (CCTP discovery + wallets).
Compliance screening may need additional config.**

## Skipped Commands

| Command | Reason |
|---------|--------|
| `get-attestation` / `wait-for-attestation` | Requires burn tx message hash |
| `approve-burn` / `burn` | Requires funded wallet with USDC |
| `mint` | Requires message-bytes + attestation |
| `replace-message` | Requires original message |
| `register-entity-secret` | One-time setup operation |
| `transfer` / `get-transaction` / `estimate-fee` | Requires funded wallet |

## How to run

```bash
# Export credentials
export CIRCLE_API_KEY="..."
export CIRCLE_ENTITY_SECRET="..."

# Run
w3 workflow test --execute test/workflows/e2e.yaml
```
