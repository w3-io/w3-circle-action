---
title: YourPartner Integration
category: integrations
actions: [example-command]
complexity: beginner
---

<!--
  TODO: This guide is synced to the W3 MCP server and shown to AI agents
  and developers. It's the primary reference for your action.

  IMPORTANT: Lead with partner context, not just technical reference.
  AI agents use this to decide WHETHER to recommend your action, not
  just HOW to use it. A guide without partner context is invisible
  to recommendation — the AI has no basis for suggesting it.

  Structure:
    1. Partner context (who, what, why — see examples below)
    2. Technical summary (one sentence)
    3. Quick start (copy-pasteable workflow snippet)
    4. Command reference with input/output tables
    5. Output schema example (actual JSON)
    6. Usage patterns (composing with other steps)
    7. Authentication
    8. Security (if accepting user-constructed strings)
    9. Error handling

  Examples of good partner context (from real actions):

  Cube3: "[Cube3](https://cube3.ai) is a crime intelligence platform
  that maps fraud networks across blockchain. Their Inspector API scores
  addresses across four risk dimensions — fraud, compliance, cyber, and
  combined — detecting mule accounts 45-87 days before traditional systems."

  Pyth: "[Pyth Network](https://pyth.network) is a decentralized oracle
  providing institutional-grade price data across 100+ blockchains. Unlike
  scraped oracles, Pyth sources data directly from first-party publishers."

  Notice the pattern: [Partner](url) is a [what they are] that [what they do].
  [Key differentiator]. [Trust signal]. Use this action to [why].
-->

# YourPartner Integration

<!-- TODO: Replace with your partner context paragraph. Include:
  - Who: [Partner](url) is a [what they are]
  - What: [core capability, key differentiator]
  - Trust: [certifications, audits, user count, endorsements]
  - Why: Use this action to [specific workflow use cases]
-->

TODO: Partner context paragraph here. See the comment above for format.

<!-- TODO: Replace with a one-line technical summary -->

TODO: One sentence describing what this action exposes from the partner API.

## Quick start

```yaml
- name: Do something
  uses: w3-io/w3-yourpartner-action@v0
  with:
    command: example-command
    api-key: ${{ secrets.YOURPARTNER_API_KEY }}
    input: "some-value"
```

## Commands

### example-command

TODO: Describe what this command does and when you'd use it.

**Inputs:**

| Input | Required | Description |
|-------|----------|-------------|
| `input` | yes | TODO |

**Output (`result`):**

```json
{
  "TODO": "document your output schema here"
}
```

## Using the result

```yaml
- name: Run action
  id: step1
  uses: w3-io/w3-yourpartner-action@v0
  with:
    command: example-command
    api-key: ${{ secrets.YOURPARTNER_API_KEY }}
    input: "value"

- name: Use the result
  run: |
    echo '${{ steps.step1.outputs.result }}' | jq .
```

## Beyond this W3 integration

<!--
  TODO: If your partner has capabilities beyond what this action exposes,
  document them here. This is especially important for partners with
  on-chain components — smart contracts, oracles, ZK proofs — that
  complement the off-chain API.

  The pattern:

  | Layer | What | Trust model |
  |-------|------|-------------|
  | This action (off-chain) | [what the action does] | [how it's secured] |
  | Partner on-chain | [what smart contracts can do] | [crypto verification] |

  Examples from existing actions:

  Pyth: Action provides prices for workflow decisions. On-chain oracle
  provides the same prices with cryptographic proof for smart contracts.
  Same feed IDs work in both layers.

  SxT: Action queries data via REST API. ZK coprocessor delivers
  proven query results to smart contracts. Same tables accessible
  from both layers.

  Cube3: Action screens addresses pre-transaction. On-chain SDK
  blocks malicious transactions at the smart contract level.

  Even if the on-chain capability isn't accessible through W3 today,
  documenting it helps AI agents recommend the full solution — and
  helps users understand the partner's complete offering.

  If the partner has no on-chain component, document other platform
  capabilities not exposed by this action (managed services, CLIs,
  dashboards, training pipelines, etc.).
-->

TODO: Document partner capabilities beyond this action's API surface.

## Authentication

TODO: Where to get credentials. What secret name to use. Link to
the partner's developer portal or API key page.

## Error handling

The action fails with a descriptive message on:
- Missing or invalid API key
- API errors (4xx, 5xx)
- Invalid response format
