# W3 Circle Action

Circle CCTP, programmable wallets, transfers, compliance, and fee estimation.

## Quick Start

```yaml
- name: Check attestation
  uses: w3-io/w3-circle-action@v0
  with:
    command: get-attestation
    sandbox: 'true'
    message-hash: '0xabcdef...'
```

## Commands

| Command                | Description                         | Auth            |
| ---------------------- | ----------------------------------- | --------------- |
| `approve-burn`         | Approve USDC spend for CCTP burn    | None (on-chain) |
| `burn`                 | Burn USDC on source chain           | None (on-chain) |
| `mint`                 | Mint USDC on destination chain      | None (on-chain) |
| `replace-message`      | Replace a pending CCTP message      | None (on-chain) |
| `get-attestation`      | Check CCTP attestation status       | None            |
| `wait-for-attestation` | Poll until attestation complete     | None            |
| `get-supported-chains` | List CCTP-supported chains          | None            |
| `get-domain-info`      | Get chain domain/contract details   | None            |
| `create-wallet-set`    | Create a wallet set                 | API key         |
| `create-wallet`        | Create developer-controlled wallets | API key         |
| `get-wallet`           | Get wallet details                  | API key         |
| `list-wallets`         | List wallets with filters           | API key         |
| `get-balance`          | Get wallet token balances           | API key         |
| `transfer`             | Transfer tokens between wallets     | API key         |
| `get-transaction`      | Get transaction status              | API key         |
| `estimate-fee`         | Estimate transfer gas fee           | API key         |
| `screen-address`       | Screen address for KYC/AML          | API key         |

## Inputs

| Input                    | Required | Default | Description                                                                   |
| ------------------------ | -------- | ------- | ----------------------------------------------------------------------------- |
| `command`                | Yes      | —       | Operation to perform (see Commands)                                           |
| `api-key`                | No       | —       | Circle Platform API key (required for wallet/transaction/compliance commands) |
| `entity-secret`          | No       | —       | Entity secret (32-byte hex) for wallet creation and transaction signing       |
| `api-url`                | No       | —       | Circle Platform API base URL override                                         |
| `iris-url`               | No       | —       | IRIS API base URL override                                                    |
| `sandbox`                | No       | `false` | Use IRIS sandbox (testnet) instead of production                              |
| `private-key`            | No       | —       | Wallet private key for on-chain CCTP commands                                 |
| `rpc-url`                | No       | —       | JSON-RPC endpoint URL                                                         |
| `destination-chain`      | No       | —       | Destination chain name for burn (e.g. `avalanche-fuji`)                       |
| `destination-caller`     | No       | —       | Restrict who can call receiveMessage on destination                           |
| `message-bytes`          | No       | —       | Message bytes from burn step (for mint)                                       |
| `attestation`            | No       | —       | Attestation from wait-for-attestation (for mint)                              |
| `original-message-bytes` | No       | —       | Original message bytes (for replace-message)                                  |
| `original-attestation`   | No       | —       | Original attestation (for replace-message)                                    |
| `message-hash`           | No       | —       | Keccak256 hash of the CCTP message                                            |
| `chain`                  | No       | —       | Chain name (e.g. `ethereum`, `arbitrum-sepolia`)                              |
| `network`                | No       | —       | Filter chains by network: `mainnet` or `testnet`                              |
| `wallet-id`              | No       | —       | Wallet UUID                                                                   |
| `wallet-set-id`          | No       | —       | Wallet set UUID                                                               |
| `name`                   | No       | —       | Name for wallet set creation                                                  |
| `blockchains`            | No       | —       | Comma-separated blockchain identifiers (e.g. `ETH-SEPOLIA,AVAX-FUJI`)         |
| `count`                  | No       | `1`     | Number of wallets to create                                                   |
| `blockchain`             | No       | —       | Single blockchain filter (e.g. `ETH-SEPOLIA`)                                 |
| `page-size`              | No       | `10`    | Results per page for list operations                                          |
| `destination-address`    | No       | —       | Recipient blockchain address                                                  |
| `token-id`               | No       | —       | Circle token UUID                                                             |
| `amount`                 | No       | —       | Transfer amount as string (e.g. `1.50`)                                       |
| `transaction-id`         | No       | —       | Transaction UUID                                                              |
| `address`                | No       | —       | Blockchain address to screen for compliance                                   |
| `poll-interval`          | No       | `5`     | Seconds between attestation polls                                             |
| `max-attempts`           | No       | `60`    | Maximum attestation poll attempts                                             |
| `timeout`                | No       | `30`    | Request timeout in seconds                                                    |

## Outputs

| Output   | Description                  |
| -------- | ---------------------------- |
| `result` | JSON result of the operation |

## Authentication

CCTP off-chain commands (attestation, supported chains) require no authentication. On-chain CCTP commands require a `private-key` and `rpc-url`. Wallet, transaction, and compliance commands require an `api-key` from [Circle Console](https://console.circle.com). Store credentials in your repository secrets.
