# TODO

## Circle Platform API — remaining commands

These commands need a funded second Circle wallet (or specific
Dashboard config) to exercise. Document and verify when the
prereqs are in place.

- [ ] `transfer` — Circle-internal transfer between two Circle
      wallets. Needs a destination wallet and a token balance on
      the source wallet.
- [ ] `get-transaction` — needs an ID from a completed transfer.
- [ ] `estimate-fee` — sandbox rejects when balance is zero;
      requires the transfer wallet to be funded first.

## Compliance — production-only

- [ ] `screen-address` — Circle's Compliance API rejects sandbox
      keys with HTTP 400. Move to a production-tier credential
      to verify, or document permanently as production-only.

## CCTP — error / replace flow

- [ ] `replace-message` — only fires when an in-flight CCTP burn
      message errored. Synthesize an errored burn (e.g., bad
      recipient bytes) so we can exercise the recovery path.

## CCTP — additional chains

The action's chain registry currently covers Ethereum, Base,
Arbitrum, Optimism, Polygon, Avalanche on mainnet, plus the
matching testnets (Sepolia / Fuji). Add as Circle deploys:

- [ ] Linea (Sepolia + mainnet)
- [ ] Sonic (Blaze + mainnet)
- [ ] Codex / Hyperliquid / other CCTP V2 chains as they ship

## CI — secrets and recovery hygiene

- [ ] Document the entity-secret rotation playbook in
      `docs/guide.md` so the next "I lost the recovery file"
      incident has a clear, rehearsed escape path.
- [ ] Move the bridge signer key out of `W3_SECRET_ETHEREUM` and
      into a dedicated `W3_BRIDGE_SIGNER_ETHEREUM` secret so the
      naming matches the bridge's own env contract.
