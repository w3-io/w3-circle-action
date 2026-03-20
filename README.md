# W3 Circle Action

Circle CCTP, programmable wallets, transfers, compliance, and fee estimation.

## About Circle

[Circle](https://circle.com) is the issuer of USDC, the leading regulated
stablecoin with $30B+ in circulation. CCTP enables native USDC transfers
between blockchains through a burn-and-mint mechanism — no bridge, no
wrapped tokens, no liquidity fragmentation. Audited by Trail of Bits and
Halborn.

## Usage

```yaml
# CCTP attestation (no auth needed)
- name: Check attestation
  uses: w3-io/w3-circle-action@v0
  with:
    command: get-attestation
    sandbox: 'true'
    message-hash: '0xabcdef...'

# Create a wallet (requires api-key)
- name: Create wallet
  uses: w3-io/w3-circle-action@v0
  with:
    command: create-wallet
    api-key: ${{ secrets.CIRCLE_API_KEY }}
    wallet-set-id: 'ws-uuid'
    blockchains: 'ETH-SEPOLIA'
```

## Commands

| Command                | Description                         | Auth    |
| ---------------------- | ----------------------------------- | ------- |
| **CCTP**               |                                     |         |
| `get-attestation`      | Check CCTP attestation status       | None    |
| `wait-for-attestation` | Poll until attestation complete     | None    |
| `get-supported-chains` | List CCTP-supported chains          | None    |
| `get-domain-info`      | Get chain domain/contract details   | None    |
| **Wallets**            |                                     |         |
| `create-wallet-set`    | Create a wallet set                 | API key |
| `create-wallet`        | Create developer-controlled wallets | API key |
| `get-wallet`           | Get wallet details                  | API key |
| `list-wallets`         | List wallets with filters           | API key |
| `get-balance`          | Get wallet token balances           | API key |
| **Transactions**       |                                     |         |
| `transfer`             | Transfer tokens between wallets     | API key |
| `get-transaction`      | Get transaction status              | API key |
| `estimate-fee`         | Estimate transfer gas fee           | API key |
| **Compliance**         |                                     |         |
| `screen-address`       | Screen address for KYC/AML          | API key |

## Documentation

See [docs/guide.md](docs/guide.md) for full reference including output
schemas, workflow examples, and CCTP transfer flow.

## Development

```bash
npm install
npm test          # 61 tests
npm run lint      # eslint
npm run all       # format + lint + test + bundle
```
