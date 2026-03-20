# W3 Circle Action

Cross-chain USDC transfers via Circle's CCTP (Cross-Chain Transfer Protocol).

## About Circle

[Circle](https://circle.com) is the issuer of USDC, the leading regulated
stablecoin with $30B+ in circulation. CCTP enables native USDC transfers
between blockchains through a burn-and-mint mechanism — no bridge, no
wrapped tokens, no liquidity fragmentation. Audited by Trail of Bits and
Halborn.

## Usage

```yaml
- name: Check attestation
  uses: w3-io/w3-circle-action@v0
  with:
    command: get-attestation
    sandbox: 'true'
    message-hash: '0xabcdef...'
```

## Commands

| Command                | Description                       | Auth |
| ---------------------- | --------------------------------- | ---- |
| `get-attestation`      | Check CCTP attestation status     | None |
| `wait-for-attestation` | Poll until attestation complete   | None |
| `get-supported-chains` | List CCTP-supported chains        | None |
| `get-domain-info`      | Get chain domain/contract details | None |

## Documentation

See [docs/guide.md](docs/guide.md) for full reference including output
schemas, workflow examples, and CCTP transfer flow.

## Development

```bash
npm install
npm test          # 37 tests
npm run lint      # eslint
npm run all       # format + lint + test + bundle
```
