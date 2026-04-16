# E2E Test Results

> Last verified: 2026-04-16 (entity secret re-registered, wallet ops unblocked)

## Prerequisites

The env var names below are what the local E2E script expects. In your
own workflows, name repo secrets however you like; the fixed contract
is the action-input names (`api-key`, `entity-secret`, etc.).

| Credential                | Env var                | Source                                    |
| ------------------------- | ---------------------- | ----------------------------------------- |
| Circle Platform API key   | `CIRCLE_API_KEY`       | Circle dashboard                          |
| Entity secret (plaintext) | `CIRCLE_ENTITY_SECRET` | Generated via `openssl rand -hex 32`      |
| Recovery file             | (save to Bitwarden)    | Returned once by `register-entity-secret` |

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
   password-manager item. It is returned exactly once. Without it you
   cannot rotate the entity secret later.

## Results

| #   | Step                          | Command                | Status | Notes                         |
| --- | ----------------------------- | ---------------------- | ------ | ----------------------------- |
| 1   | Get supported CCTP chains     | `get-supported-chains` | PASS   | 11 chains incl. testnets      |
| 2   | Get domain info (ETH Sepolia) | `get-domain-info`      | PASS   | domain=0                      |
| 3   | Create a wallet set           | `create-wallet-set`    | PASS   | needs entity-secret           |
| 4   | Extract wallet set ID         | (run step)             | PASS   |                               |
| 5   | Create a wallet (ETH Sepolia) | `create-wallet`        | PASS   | needs entity-secret           |
| 6   | Extract wallet ID/address     | (run step)             | PASS   | result is bare array — `.[0]` |
| 7   | List wallets                  | `list-wallets`         | PASS   |                               |
| 8   | Get the created wallet        | `get-wallet`           | PASS   |                               |
| 9   | Get wallet balance            | `get-balance`          | PASS   | balance: empty (unfunded)     |

**Summary: 9/9 active steps pass.**

## Skipped Commands

| Command                                    | Reason                                            |
| ------------------------------------------ | ------------------------------------------------- |
| `approve-burn` / `burn`                    | Needs Sepolia USDC + ETH on a Circle wallet       |
| `mint`                                     | Needs message-bytes + attestation from a burn tx  |
| `get-attestation` / `wait-for-attestation` | Needs burn tx-hash + source-domain                |
| `replace-message`                          | Only needed when a burn message errored           |
| `transfer`                                 | Needs funded wallet with token balance            |
| `get-transaction`                          | Needs a completed transfer                        |
| `estimate-fee`                             | Sandbox rejects when balance is zero              |
| `screen-address`                           | Sandbox returns 400; production-only endpoint     |
| `register-entity-secret`                   | One-time; re-running would error `already exists` |

## How to run

```bash
export CIRCLE_API_KEY="TEST_API_KEY:..."
export CIRCLE_ENTITY_SECRET="<64-hex plaintext from Bitwarden>"

w3 workflow test --execute test/workflows/e2e.yaml
```
