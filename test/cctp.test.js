/**
 * CCTP on-chain and Solana unit tests.
 *
 * Tests amount validation (rejects before any bridge calls),
 * parseAmount arithmetic, and addressToBytes32 padding.
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'

// ─── Amount validation ──────────────────────────────────────────────
// approveBurn, burn, and burnSolana all validate amount before making
// any bridge or RPC calls, so no mocking is needed for these tests.

describe('approveBurn: amount validation', () => {
  let approveBurn

  beforeEach(async () => {
    ;({ approveBurn } = await import('../src/cctp-onchain.js'))
  })

  const badAmounts = [
    { value: 'abc', label: 'non-numeric string "abc"' },
    { value: '0', label: 'zero' },
    { value: '-1', label: 'negative' },
    { value: '', label: 'empty string' },
  ]

  for (const { value, label } of badAmounts) {
    it(`rejects ${label}`, async () => {
      await assert.rejects(
        () =>
          approveBurn({
            chain: 'ethereum',
            amount: value,
            domains: {},
            contracts: {},
          }),
        /amount must be a positive number/,
      )
    })
  }
})

describe('burn: amount validation', () => {
  let burn

  beforeEach(async () => {
    ;({ burn } = await import('../src/cctp-onchain.js'))
  })

  const badAmounts = [
    { value: 'abc', label: 'non-numeric string "abc"' },
    { value: '0', label: 'zero' },
    { value: '-1', label: 'negative' },
    { value: '', label: 'empty string' },
  ]

  for (const { value, label } of badAmounts) {
    it(`rejects ${label}`, async () => {
      await assert.rejects(
        () =>
          burn({
            chain: 'ethereum',
            destinationChain: 'base',
            recipient: '0xabc',
            amount: value,
            domains: {},
            contracts: {},
          }),
        /amount must be a positive number/,
      )
    })
  }
})

describe('burnSolana: amount validation', () => {
  let burnSolana

  beforeEach(async () => {
    ;({ burnSolana } = await import('../src/cctp-solana.js'))
  })

  const badAmounts = [
    { value: 'abc', label: 'non-numeric string "abc"' },
    { value: '0', label: 'zero' },
    { value: '-1', label: 'negative' },
    { value: '', label: 'empty string' },
  ]

  for (const { value, label } of badAmounts) {
    it(`rejects ${label}`, async () => {
      await assert.rejects(
        () =>
          burnSolana({
            chain: 'solana',
            destinationChain: 'ethereum',
            recipient: '0xabc',
            amount: value,
            contracts: {},
            domains: {},
          }),
        /amount must be a positive number/,
      )
    })
  }
})

// ─── parseAmount ────────────────────────────────────────────────────
// parseAmount reads decimals from the USDC contract via bridge, so we
// mock the bridge module's ethereum.readContract to return decimals.

describe('parseAmount', () => {
  let parseAmount
  let bridgeModule

  beforeEach(async () => {
    // Import the bridge module and mock readContract
    bridgeModule = await import('../lib/bridge.js')
    mock.method(bridgeModule.ethereum, 'readContract', async () => ({
      result: '6',
    }))
    ;({ parseAmount } = await import('../src/cctp-onchain.js'))
  })

  afterEach(() => {
    mock.restoreAll()
  })

  it('parses "1.5" with 6 decimals to "1500000"', async () => {
    const result = await parseAmount('ethereum', '0xusdc', '1.5')
    assert.equal(result, '1500000')
  })

  it('parses "0.000001" with 6 decimals to "1"', async () => {
    const result = await parseAmount('ethereum', '0xusdc', '0.000001')
    assert.equal(result, '1')
  })

  it('parses integer "10" with 6 decimals to "10000000"', async () => {
    const result = await parseAmount('ethereum', '0xusdc', '10')
    assert.equal(result, '10000000')
  })
})

// ─── addressToBytes32 ───────────────────────────────────────────────

describe('addressToBytes32', () => {
  let addressToBytes32

  beforeEach(async () => {
    ;({ addressToBytes32 } = await import('../src/cctp-onchain.js'))
  })

  it('pads a 20-byte EVM address to 32 bytes (64 hex chars + 0x)', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678'
    const result = addressToBytes32(addr)
    // 0x + 24 zero chars + 40 address chars = 66 chars total
    assert.equal(result.length, 66)
    assert.ok(result.startsWith('0x000000000000000000000000'))
    assert.ok(result.endsWith('1234567890abcdef1234567890abcdef12345678'))
  })

  it('handles address without 0x prefix', () => {
    const addr = 'abcdef0123456789abcdef0123456789abcdef01'
    const result = addressToBytes32(addr)
    assert.equal(result.length, 66)
    assert.ok(result.startsWith('0x000000000000000000000000'))
    assert.ok(result.endsWith(addr))
  })
})
