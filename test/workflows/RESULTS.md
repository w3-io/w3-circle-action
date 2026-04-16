# E2E Test Results

> Last verified: 2026-04-16 (full CCTP round-trip Base Sepolia ↔ Avalanche Fuji)

## Workflows

| File                   | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `e2e.yaml`             | Circle Platform API: wallets, wallet sets, balances      |
| `cctp-roundtrip.yaml`  | CCTP V2: Base Sepolia → Avalanche Fuji → back end-to-end |

## Prerequisites

The env var names below are what the local E2E scripts expect. In your
own workflows, name repo secrets however you like; the fixed contract
is the action-input names (`api-key`, `entity-secret`, etc.).

| Credential                | Env var                | Source                                    |
| ------------------------- | ---------------------- | ----------------------------------------- |
| Circle Platform API key   | `CIRCLE_API_KEY`       | Circle dashboard                          |
| Entity secret (plaintext) | `CIRCLE_ENTITY_SECRET` | Generated via `openssl rand -hex 32`      |
| Recovery file             | (save to password mgr) | Returned once by `register-entity-secret` |
| Self-custody signer key   | `W3_SECRET_ETHEREUM`   | Any funded EOA on Base Sepolia + Fuji     |

### One-time setup per Circle account

1. Generate the plaintext entity secret and save it to a password
   manager **before** doing anything else:

   ```bash
   openssl rand -hex 32
   ```

2. Register the ciphertext with Circle via the action's
   `register-entity-secret` command (our action handles the RSA-OAEP
   encryption and base64 encoding against Circle's public key).

3. Save the `recoveryFile` field from the response to the same
   password-manager item. It is returned exactly once.

### CCTP round-trip — additional setup

CCTP on-chain burn/mint commands use self-custody signing via the
W3 bridge, not the custodial Circle wallet. This is independent of
the Circle API key setup.

1. Generate a private key and save to a password manager.
2. Export it as `W3_SECRET_ETHEREUM` in the shell that will run the
   workflow, and also set it as `W3_BRIDGE_SIGNER_ETHEREUM` when
   starting a local bridge for testing.
3. Derive the address (e.g. `cast wallet address --private-key "$W3_SECRET_ETHEREUM"`)
   and fund that address on both chains:
   - Base Sepolia: ≥1 USDC (https://faucet.circle.com) + ~0.01 ETH
     (https://www.alchemy.com/faucets/base-sepolia)
   - Avalanche Fuji: ~0.1 AVAX (https://faucet.avax.network) —
     USDC arrives from the mint on the first leg

## Results

### `e2e.yaml` — Circle Platform API (9/9 active steps PASS)

| #   | Step                          | Command                | Status | Notes                     |
| --- | ----------------------------- | ---------------------- | ------ | ------------------------- |
| 1   | Get supported CCTP chains     | `get-supported-chains` | PASS   | 11 chains incl. testnets  |
| 2   | Get domain info (ETH Sepolia) | `get-domain-info`      | PASS   | domain=0                  |
| 3   | Create a wallet set           | `create-wallet-set`    | PASS   | needs entity-secret       |
| 4   | Extract wallet set ID         | (run step)             | PASS   |                           |
| 5   | Create a wallet (ETH Sepolia) | `create-wallet`        | PASS   | needs entity-secret       |
| 6   | Extract wallet ID/address     | (run step)             | PASS   | result is bare array      |
| 7   | List wallets                  | `list-wallets`         | PASS   |                           |
| 8   | Get the created wallet        | `get-wallet`           | PASS   |                           |
| 9   | Get wallet balance            | `get-balance`          | PASS   | balance: empty (unfunded) |

### `cctp-roundtrip.yaml` — CCTP V2 round-trip (10/10 steps PASS)

| #   | Step                        | Command                | Status | Notes                    |
| --- | --------------------------- | ---------------------- | ------ | ------------------------ |
| 1   | Burn 1 USDC on Base         | `burn`                 | PASS   | approve + depositForBurn |
| 2   | Extract Base burn details   | (run step)             | PASS   | tx-hash + messageBytes   |
| 3   | Wait for Base attestation   | `wait-for-attestation` | PASS   | ~6s on sandbox           |
| 4   | Extract Base attestation    | (run step)             | PASS   | attestation + message    |
| 5   | Mint on Avalanche Fuji      | `mint`                 | PASS   | receiveMessage on Fuji   |
| 6   | Burn 0.9 USDC on Fuji       | `burn`                 | PASS   | return leg               |
| 7   | Extract Fuji burn details   | (run step)             | PASS   |                          |
| 8   | Wait for Fuji attestation   | `wait-for-attestation` | PASS   |                          |
| 9   | Extract Fuji attestation    | (run step)             | PASS   |                          |
| 10  | Mint back on Base Sepolia   | `mint`                 | PASS   | round trip complete      |

Round-trip wall time: **52 seconds**.

Per-run value cost: the return leg burns 0.9 USDC (less than the
~0.99987 USDC received after the Base→Fuji fast-transfer fee), so
each round trip retains ~0.1 USDC worth of balance on Fuji. Net
out-of-pocket per run: ~0.1 USDC on Base + 2 × ~0.00013 USDC
fast-transfer fees + L1/L2 gas.

## Skipped Commands

| Command                  | Reason                                            |
| ------------------------ | ------------------------------------------------- |
| `transfer`               | Circle-internal transfer; needs a destination     |
|                          | Circle wallet + token balance on it               |
| `get-transaction`        | Needs a completed `transfer`                      |
| `estimate-fee`           | Sandbox rejects when balance is zero              |
| `screen-address`         | Production-only; sandbox returns 400              |
| `register-entity-secret` | One-time; re-running errors `already exists`      |
| `replace-message`        | Only fires when a burn message errored            |

## How to run

### Circle Platform API (`e2e.yaml`)

```bash
export CIRCLE_API_KEY="TEST_API_KEY:..."
export CIRCLE_ENTITY_SECRET="<64-hex plaintext>"

w3 workflow test --execute test/workflows/e2e.yaml
```

### CCTP round-trip (`cctp-roundtrip.yaml`)

```bash
# Start a bridge server with the self-custody signer attached.
# Keep this running in a separate terminal.
W3_BRIDGE_SIGNER_ETHEREUM="$W3_SECRET_ETHEREUM" \
  w3 bridge serve --port 8232 --allow '*'

# From macOS, action containers reach the host at host.docker.internal.
W3_BRIDGE_URL='http://host.docker.internal:8232' \
  w3 workflow test --execute test/workflows/cctp-roundtrip.yaml
```
