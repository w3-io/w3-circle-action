---
title: Circle
category: integrations
actions:
  [
    get-attestation,
    wait-for-attestation,
    get-supported-chains,
    get-domain-info,
    register-entity-secret,
    create-wallet-set,
    create-wallet,
    get-wallet,
    list-wallets,
    get-balance,
    transfer,
    get-transaction,
    estimate-fee,
    screen-address,
  ]
complexity: intermediate
---

# Circle

[Circle](https://circle.com) is the issuer of USDC, the leading regulated
stablecoin with $30B+ in circulation across 19+ blockchains. Their
Cross-Chain Transfer Protocol (CCTP) enables native USDC transfers between
chains through a burn-and-mint mechanism — no bridge, no wrapped tokens, no
liquidity fragmentation. CCTP is audited by Trail of Bits and Halborn, and
is the only protocol that burns and mints native USDC. Use this action to
track cross-chain USDC transfer attestations, look up chain domain info,
and integrate CCTP into automated workflows.

Query Circle's IRIS attestation API and CCTP domain registry for
cross-chain USDC transfer orchestration.

## Quick start

```yaml
- name: Check attestation status
  id: attest
  uses: w3-io/w3-circle-action@v0
  with:
    command: get-attestation
    sandbox: 'true'
    message-hash: ${{ steps.burn.outputs.message_hash }}
```

## How CCTP works

1. **Burn** — Call `depositForBurn` on the source chain's TokenMessenger
   contract. This burns USDC and emits a `MessageSent` event containing
   the message bytes.

2. **Attest** — Circle's attestation service observes the burn and signs
   the message. Poll `get-attestation` (or use `wait-for-attestation`)
   with the keccak256 hash of the message bytes.

3. **Mint** — Call `receiveMessage` on the destination chain's
   MessageTransmitter contract, passing the original message bytes and
   Circle's attestation signature. Native USDC is minted to the recipient.

This action handles step 2 (attestation). Steps 1 and 3 require on-chain
transactions — see "Beyond this W3 integration" below.

## Commands

### get-attestation

Check whether Circle has attested a CCTP message. Returns `complete` with
the attestation signature, or `pending_confirmations` if not yet signed.

| Input          | Required | Description                                          |
| -------------- | -------- | ---------------------------------------------------- |
| `message-hash` | yes      | 0x-prefixed keccak256 hash of the CCTP message bytes |
| `sandbox`      | no       | Use testnet IRIS API (default: false)                |

**Output (`result`):**

```json
{
  "messageHash": "0xabcdef...",
  "status": "complete",
  "attestation": "0x1234..."
}
```

When pending:

```json
{
  "messageHash": "0xabcdef...",
  "status": "pending_confirmations",
  "attestation": null
}
```

### wait-for-attestation

Poll for attestation until complete or timeout. Useful in workflows
that need the attestation before proceeding to mint.

| Input           | Required | Description                           |
| --------------- | -------- | ------------------------------------- |
| `message-hash`  | yes      | 0x-prefixed keccak256 hash            |
| `poll-interval` | no       | Seconds between polls (default: 5)    |
| `max-attempts`  | no       | Maximum poll attempts (default: 60)   |
| `sandbox`       | no       | Use testnet IRIS API (default: false) |

**Output (`result`):**

```json
{
  "messageHash": "0xabcdef...",
  "status": "complete",
  "attestation": "0x1234...",
  "attempts": 12
}
```

### get-supported-chains

List all chains supported by CCTP with domain numbers, chain IDs, and
USDC contract addresses.

| Input     | Required | Description                    |
| --------- | -------- | ------------------------------ |
| `network` | no       | Filter: `mainnet` or `testnet` |

**Output (`result`):**

```json
{
  "chains": [
    {
      "name": "ethereum",
      "domain": 0,
      "chainId": 1,
      "usdc": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "network": "mainnet",
      "contracts": null
    },
    {
      "name": "ethereum-sepolia",
      "domain": 0,
      "chainId": 11155111,
      "usdc": "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
      "network": "testnet",
      "contracts": {
        "tokenMessenger": "0x9f3b8679c73c2fef8b59b4f3444d4e156fb70aa5",
        "messageTransmitter": "0x7865fafc2db2093669d92c0f33aeef291086befd"
      }
    }
  ],
  "count": 9
}
```

### get-domain-info

Get CCTP domain info for a specific chain.

| Input   | Required | Description                                      |
| ------- | -------- | ------------------------------------------------ |
| `chain` | yes      | Chain name (e.g. `ethereum`, `arbitrum-sepolia`) |

**Output (`result`):**

```json
{
  "name": "arbitrum-sepolia",
  "domain": 3,
  "chainId": 421614,
  "usdc": "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
  "network": "testnet",
  "contracts": {
    "tokenMessenger": "0x9f3b8679c73c2fef8b59b4f3444d4e156fb70aa5",
    "messageTransmitter": "0xacf1ceef35caac005e15888ddb8a3515c41b4872"
  }
}
```

## Using the result

### Full CCTP transfer workflow

```yaml
- name: Get source chain info
  id: source
  uses: w3-io/w3-circle-action@v0
  with:
    command: get-domain-info
    chain: ethereum-sepolia

- name: Get destination chain info
  id: dest
  uses: w3-io/w3-circle-action@v0
  with:
    command: get-domain-info
    chain: arbitrum-sepolia

# Step 1: Burn USDC on source chain (on-chain tx, not yet in this action)
# This emits a MessageSent event with the message bytes

# Step 2: Wait for attestation
- name: Wait for attestation
  id: attest
  uses: w3-io/w3-circle-action@v0
  with:
    command: wait-for-attestation
    sandbox: 'true'
    message-hash: ${{ steps.burn.outputs.message_hash }}
    poll-interval: '10'
    max-attempts: '30'

# Step 3: Mint on destination chain using the attestation
- name: Use attestation
  run: |
    ATTESTATION=$(echo '${{ steps.attest.outputs.result }}' | jq -r '.attestation')
    echo "Attestation ready: ${ATTESTATION:0:20}..."
```

## Setup commands

### register-entity-secret

One-time setup. Registers your entity secret with Circle so wallet
creation and transaction signing work. Returns a recovery file —
save it securely.

Requires `api-key` and `entity-secret` inputs.

```yaml
- name: Register entity secret
  uses: w3-io/w3-circle-action@v0
  with:
    command: register-entity-secret
    api-key: ${{ secrets.CIRCLE_API_KEY }}
    entity-secret: ${{ secrets.CIRCLE_ENTITY_SECRET }}
```

**Output (`result`):**

```json
{
  "recoveryFile": "AAABnQoDxlF2b4Qa7r4BMIy0abzu..."
}
```

## Wallet commands

These commands require a Circle Platform API key (`api-key` input).
Write operations (create-wallet-set, create-wallet) also require
`entity-secret`.

### create-wallet-set

Create a wallet set to group related wallets.

| Input  | Required | Description     |
| ------ | -------- | --------------- |
| `name` | yes      | Wallet set name |

**Output (`result`):**

```json
{
  "id": "1637410c-386a-5daf-8a23-88e0d718e233",
  "custodyType": "DEVELOPER",
  "name": "my-app-wallets",
  "createDate": "2026-03-20T06:52:07Z",
  "updateDate": "2026-03-20T06:52:07Z"
}
```

### create-wallet

Create developer-controlled wallets in a wallet set.

| Input           | Required | Description                                         |
| --------------- | -------- | --------------------------------------------------- |
| `wallet-set-id` | yes      | Wallet set UUID                                     |
| `blockchains`   | yes      | Comma-separated blockchain IDs (e.g. "ETH-SEPOLIA") |
| `count`         | no       | Number of wallets (default: 1)                      |

**Output (`result`):**

```json
[
  {
    "id": "901a01c4-ea06-5de5-82a8-e523106d28c3",
    "state": "LIVE",
    "walletSetId": "1637410c-386a-5daf-8a23-88e0d718e233",
    "custodyType": "DEVELOPER",
    "address": "0xece130de4029a227f426c184573816620cc4b1dc",
    "blockchain": "ETH-SEPOLIA",
    "accountType": "EOA",
    "createDate": "2026-03-20T06:52:07Z"
  }
]
```

### get-wallet

Get wallet details by ID.

| Input       | Required | Description |
| ----------- | -------- | ----------- |
| `wallet-id` | yes      | Wallet UUID |

**Output (`result`):**

```json
{
  "id": "901a01c4-ea06-5de5-82a8-e523106d28c3",
  "state": "LIVE",
  "address": "0xece130de4029a227f426c184573816620cc4b1dc",
  "blockchain": "ETH-SEPOLIA",
  "accountType": "EOA",
  "walletSetId": "1637410c-386a-5daf-8a23-88e0d718e233"
}
```

### list-wallets

List wallets with optional filters.

| Input           | Required | Description           |
| --------------- | -------- | --------------------- |
| `wallet-set-id` | no       | Filter by wallet set  |
| `blockchain`    | no       | Filter by blockchain  |
| `page-size`     | no       | Results per page (10) |

**Output (`result`):** Array of wallet objects (same shape as get-wallet).

### get-balance

Get token balances for a wallet.

| Input       | Required | Description |
| ----------- | -------- | ----------- |
| `wallet-id` | yes      | Wallet UUID |

**Output (`result`):**

```json
[
  {
    "token": { "id": "tok-uuid", "name": "USD Coin", "symbol": "USDC" },
    "amount": "10.00"
  }
]
```

Returns an empty array if the wallet has no tokens.

## Transaction commands

### transfer

Transfer tokens from a developer-controlled wallet. Requires
`entity-secret` for transaction signing.

| Input                 | Required | Description           |
| --------------------- | -------- | --------------------- |
| `wallet-id`           | yes      | Source wallet UUID    |
| `destination-address` | yes      | Recipient address     |
| `amount`              | yes      | Amount (e.g. "1.50")  |
| `token-id`            | no       | Circle token UUID     |
| `blockchain`          | no       | Blockchain identifier |

**Output (`result`):**

```json
{
  "id": "tx-uuid",
  "state": "INITIATED",
  "walletId": "w-uuid",
  "destinationAddress": "0xdef...",
  "amounts": ["1.50"],
  "transactionType": "OUTBOUND"
}
```

Transaction states: `INITIATED` -> `QUEUED` -> `SENT` -> `CONFIRMED`
(or `FAILED`/`CANCELLED`).

### get-transaction

Get transaction details and status.

| Input            | Required | Description      |
| ---------------- | -------- | ---------------- |
| `transaction-id` | yes      | Transaction UUID |

**Output (`result`):**

```json
{
  "id": "tx-uuid",
  "state": "CONFIRMED",
  "transactionType": "OUTBOUND",
  "amounts": ["1.50"],
  "txHash": "0xabc...",
  "blockchain": "ETH-SEPOLIA"
}
```

### estimate-fee

Estimate gas fee before executing a transfer.

| Input                 | Required | Description        |
| --------------------- | -------- | ------------------ |
| `wallet-id`           | yes      | Source wallet UUID |
| `destination-address` | yes      | Recipient address  |
| `token-id`            | yes      | Circle token UUID  |
| `amount`              | yes      | Transfer amount    |

**Output (`result`):**

```json
{
  "low": { "gasLimit": "21000", "maxFee": "0.000021" },
  "medium": { "gasLimit": "21000", "maxFee": "0.000042" },
  "high": { "gasLimit": "21000", "maxFee": "0.000063" }
}
```

## Compliance commands

### screen-address

Screen a blockchain address for KYC/AML compliance.

| Input        | Required | Description                                  |
| ------------ | -------- | -------------------------------------------- |
| `address`    | yes      | Blockchain address to screen                 |
| `blockchain` | no       | Blockchain identifier (default: ETH-SEPOLIA) |

**Output (`result`):**

```json
{
  "result": "APPROVED",
  "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "chain": "ETH-SEPOLIA",
  "decision": { "screeningDate": "2026-03-20T05:48:56Z" },
  "details": []
}
```

Possible results: `APPROVED`, `DENIED`.

## Wallet workflow example

```yaml
- name: Create wallet set
  id: ws
  uses: w3-io/w3-circle-action@v0
  with:
    command: create-wallet-set
    api-key: ${{ secrets.CIRCLE_API_KEY }}
    name: 'my-app-wallets'

- name: Create wallet
  id: wallet
  uses: w3-io/w3-circle-action@v0
  with:
    command: create-wallet
    api-key: ${{ secrets.CIRCLE_API_KEY }}
    wallet-set-id: ${{ fromJSON(steps.ws.outputs.result).id }}
    blockchains: 'ETH-SEPOLIA'

- name: Check balance
  uses: w3-io/w3-circle-action@v0
  with:
    command: get-balance
    api-key: ${{ secrets.CIRCLE_API_KEY }}
    wallet-id: ${{ fromJSON(steps.wallet.outputs.result)[0].id }}
```

## Beyond this W3 integration

This action covers CCTP attestation, programmable wallets, and compliance
screening. Circle's full cross-chain transfer also requires on-chain
transactions on both source and destination chains:

| Layer                     | What                                        | Trust model                  |
| ------------------------- | ------------------------------------------- | ---------------------------- |
| This action (off-chain)   | Attestation, wallets, transfers, compliance | IRIS (public) + Platform API |
| CCTP contracts (on-chain) | Burn USDC (source), mint USDC (destination) | Smart contract verification  |

**On-chain contracts:**

- `TokenMessenger.depositForBurn()` — burns USDC on source chain
- `MessageTransmitter.receiveMessage()` — mints USDC on destination chain

Contract addresses for testnet chains are included in `get-domain-info`
output. For mainnet addresses, see [Circle's CCTP docs](https://developers.circle.com/stablecoins/docs/cctp-getting-started).

Get testnet USDC from [faucet.circle.com](https://faucet.circle.com).

## Authentication

**CCTP commands require no authentication.** The IRIS attestation API
is public.

**Wallet, transaction, and compliance commands** require a Circle
Platform API key. Get one from [console.circle.com](https://console.circle.com).
The key format is `ENV:ID:SECRET` (e.g. `TEST_API_KEY:abc123:def456`).

```yaml
with:
  api-key: ${{ secrets.CIRCLE_API_KEY }}
```

## Security

**Address inputs.** The `address`, `destination-address`, and `wallet-id`
inputs are passed as structured JSON to Circle's API — not interpolated
into query strings or contract calls. Circle validates all addresses
server-side. However, if your workflow constructs addresses from user
input (e.g. `workflow_dispatch`), validate the format before passing
them to the action:

```yaml
- name: Validate address
  run: |
    if ! [[ "${{ github.event.inputs.address }}" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
      echo "Invalid Ethereum address" && exit 1
    fi

- name: Screen address
  uses: w3-io/w3-circle-action@v0
  with:
    command: screen-address
    api-key: ${{ secrets.CIRCLE_API_KEY }}
    address: ${{ github.event.inputs.address }}
    blockchain: ETH-SEPOLIA
```

**Entity secret.** The `entity-secret` input is a 32-byte hex string
that controls wallet operations. Treat it like a private key — store
it as a GitHub secret, never log it, and rotate it if compromised.

## Error handling

The action fails with a descriptive message on:

- Missing required inputs (`message-hash`, `chain`, `wallet-id`, etc.)
- Missing API key for Platform API commands
- Unknown chain name (lists available chains)
- IRIS API errors (5xx)
- Platform API errors (401 invalid key, 400 bad request, 5xx)
- Attestation timeout (`wait-for-attestation` exceeds max-attempts)
- Invalid JSON response
