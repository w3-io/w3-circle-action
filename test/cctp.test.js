/**
 * CCTP on-chain and Solana unit tests.
 *
 * Tests amount validation (rejects before any bridge calls),
 * parseAmount arithmetic, addressToBytes32 padding, and happy-path
 * flows for approveBurn, burn, mint, replaceMessage, burnSolana,
 * and mintSolana with mocked bridge calls.
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
    bridgeModule = await import('@w3-io/action-core')
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

// ─── approveBurn happy path ─────────────────────────────────────────

describe('approveBurn: happy path', () => {
  let approveBurn, bridgeModule

  beforeEach(async () => {
    bridgeModule = await import('@w3-io/action-core')
    mock.method(bridgeModule.ethereum, 'readContract', async () => ({ result: '6' }))
    mock.method(bridgeModule.ethereum, 'callContract', async () => ({
      txHash: '0xapprove-tx',
    }))
    ;({ approveBurn } = await import('../src/cctp-onchain.js'))
  })

  afterEach(() => {
    mock.restoreAll()
  })

  it('approves TokenMessenger to spend USDC', async () => {
    const domains = {
      ethereum: { domain: 0, usdc: '0xusdc' },
    }
    const contracts = {
      ethereum: {
        tokenMessenger: '0xtokenMessenger',
        messageTransmitter: '0xmessageTransmitter',
      },
    }
    const result = await approveBurn({
      chain: 'ethereum',
      amount: '10',
      domains,
      contracts,
    })

    assert.equal(result.txHash, '0xapprove-tx')
    assert.equal(result.spender, '0xtokenMessenger')
    assert.equal(result.amount, '10')
    assert.equal(result.chain, 'ethereum')
  })

  it('throws on unknown chain', async () => {
    await assert.rejects(
      () =>
        approveBurn({
          chain: 'fakenet',
          amount: '10',
          domains: {},
          contracts: {},
        }),
      /Unknown chain: fakenet/,
    )
  })

  it('throws on missing contracts', async () => {
    const domains = { ethereum: { domain: 0, usdc: '0xusdc' } }
    await assert.rejects(
      () =>
        approveBurn({
          chain: 'ethereum',
          amount: '10',
          domains,
          contracts: {},
        }),
      /No CCTP contracts configured/,
    )
  })

  it('passes rpcUrl through to bridge calls', async () => {
    const domains = { ethereum: { domain: 0, usdc: '0xusdc' } }
    const contracts = {
      ethereum: { tokenMessenger: '0xtm', messageTransmitter: '0xmt' },
    }
    await approveBurn({
      chain: 'ethereum',
      amount: '5',
      domains,
      contracts,
      rpcUrl: 'https://custom-rpc.example.com',
    })
    // Verify readContract was called with rpcUrl
    const readCall = bridgeModule.ethereum.readContract.mock.calls[0]
    assert.equal(readCall.arguments[0].rpcUrl, 'https://custom-rpc.example.com')
    // Verify callContract was called with rpcUrl
    const callCall = bridgeModule.ethereum.callContract.mock.calls[0]
    assert.equal(callCall.arguments[0].rpcUrl, 'https://custom-rpc.example.com')
  })
})

// ─── burn happy path ────────────────────────────────────────────────

describe('burn: happy path', () => {
  let burn, bridgeModule

  // Build a MessageSent log entry: topic + ABI-encoded message bytes
  // ABI encoding: offset (32 bytes) + length (32 bytes) + data
  const MESSAGE_SENT_TOPIC = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036'
  const fakeMessage = 'deadbeef'.repeat(8)
  // offset = 0x20 (32 decimal), length = 32 (0x20), data = fakeMessage
  const offset = '0000000000000000000000000000000000000000000000000000000000000020'
  const length = '0000000000000000000000000000000000000000000000000000000000000020'
  const logData = '0x' + offset + length + fakeMessage

  let originalSetTimeout

  beforeEach(async () => {
    // Patch setTimeout to fire immediately (avoids 10-15s BLOCK_WAIT)
    originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn, _ms) => originalSetTimeout(fn, 0)
    bridgeModule = await import('@w3-io/action-core')
    let callCount = 0
    mock.method(bridgeModule.ethereum, 'readContract', async () => ({ result: '6' }))
    mock.method(bridgeModule.ethereum, 'callContract', async () => {
      callCount++
      if (callCount === 1) {
        // First call is the approve
        return { txHash: '0xapprove-tx' }
      }
      // Second call is depositForBurn
      return {
        txHash: '0xburn-tx',
        logs: JSON.stringify([{ topics: [MESSAGE_SENT_TOPIC], data: logData }]),
      }
    })
    mock.method(bridgeModule.crypto, 'keccak256', async () => ({
      hash: 'abc123def456'.padEnd(64, '0'),
    }))
    ;({ burn } = await import('../src/cctp-onchain.js'))
  })

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout
    mock.restoreAll()
  })

  it('burns USDC and returns messageBytes + messageHash', async () => {
    const domains = {
      ethereum: { domain: 0, usdc: '0xusdc' },
      base: { domain: 6, usdc: '0xusdc-base' },
    }
    const contracts = {
      ethereum: { tokenMessenger: '0xtm', messageTransmitter: '0xmt' },
    }
    const result = await burn({
      chain: 'ethereum',
      destinationChain: 'base',
      recipient: '0x1234567890abcdef1234567890abcdef12345678',
      amount: '5',
      domains,
      contracts,
    })

    assert.equal(result.txHash, '0xburn-tx')
    assert.equal(result.source, 'ethereum')
    assert.equal(result.destination, 'base')
    assert.equal(result.amount, '5')
    assert.ok(result.messageBytes.startsWith('0x'))
    assert.ok(result.messageHash.startsWith('0x'))
    assert.equal(result.sourceDomain, 0)
  })

  it('throws on unknown source chain', async () => {
    await assert.rejects(
      () =>
        burn({
          chain: 'fakenet',
          destinationChain: 'base',
          recipient: '0xabc',
          amount: '5',
          domains: { base: { domain: 6 } },
          contracts: {},
        }),
      /Unknown source chain/,
    )
  })

  it('throws on unknown destination chain', async () => {
    await assert.rejects(
      () =>
        burn({
          chain: 'ethereum',
          destinationChain: 'fakenet',
          recipient: '0xabc',
          amount: '5',
          domains: { ethereum: { domain: 0, usdc: '0xusdc' } },
          contracts: { ethereum: { tokenMessenger: '0x1' } },
        }),
      /Unknown destination chain/,
    )
  })

  it('throws on missing recipient', async () => {
    await assert.rejects(
      () =>
        burn({
          chain: 'ethereum',
          destinationChain: 'base',
          recipient: '',
          amount: '5',
          domains: {
            ethereum: { domain: 0, usdc: '0xusdc' },
            base: { domain: 6 },
          },
          contracts: { ethereum: { tokenMessenger: '0x1' } },
        }),
      /recipient address is required/,
    )
  })

  it('throws when MessageSent event is missing from logs', async () => {
    // Override callContract to return no logs
    mock.restoreAll()
    globalThis.setTimeout = (fn, _ms) => originalSetTimeout(fn, 0)
    bridgeModule = await import('@w3-io/action-core')
    mock.method(bridgeModule.ethereum, 'readContract', async () => ({ result: '6' }))
    mock.method(bridgeModule.ethereum, 'callContract', async () => ({
      txHash: '0xburn-tx',
      logs: JSON.stringify([]),
    }))

    const domains = {
      ethereum: { domain: 0, usdc: '0xusdc' },
      base: { domain: 6 },
    }
    const contracts = {
      ethereum: { tokenMessenger: '0xtm', messageTransmitter: '0xmt' },
    }

    await assert.rejects(
      () =>
        burn({
          chain: 'ethereum',
          destinationChain: 'base',
          recipient: '0x1234567890abcdef1234567890abcdef12345678',
          amount: '5',
          domains,
          contracts,
        }),
      /MessageSent event not found/,
    )
  })

  it('uses destinationCaller when provided', async () => {
    const domains = {
      ethereum: { domain: 0, usdc: '0xusdc' },
      base: { domain: 6, usdc: '0xusdc-base' },
    }
    const contracts = {
      ethereum: { tokenMessenger: '0xtm', messageTransmitter: '0xmt' },
    }
    const result = await burn({
      chain: 'ethereum',
      destinationChain: 'base',
      recipient: '0x1234567890abcdef1234567890abcdef12345678',
      amount: '5',
      domains,
      contracts,
      destinationCaller: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    })

    assert.equal(result.txHash, '0xburn-tx')
    // Verify the callContract for depositForBurn used the destinationCaller
    const depositCall = bridgeModule.ethereum.callContract.mock.calls[1]
    const args = depositCall.arguments[0].args
    // args[4] is the callerBytes32
    assert.ok(args[4].includes('abcdefabcdefabcdefabcdefabcdefabcdefabcd'))
  })
})

// ─── mint happy path ────────────────────────────────────────────────

describe('mint: happy path', () => {
  let mint, bridgeModule

  beforeEach(async () => {
    bridgeModule = await import('@w3-io/action-core')
    mock.method(bridgeModule.ethereum, 'callContract', async () => ({
      txHash: '0xmint-tx',
    }))
    ;({ mint } = await import('../src/cctp-onchain.js'))
  })

  afterEach(() => {
    mock.restoreAll()
  })

  it('calls receiveMessage and returns success', async () => {
    const contracts = {
      base: { tokenMessenger: '0xtm', messageTransmitter: '0xmt' },
    }
    const result = await mint({
      chain: 'base',
      messageBytes: '0xdeadbeef',
      attestation: '0xattestationdata',
      contracts,
    })

    assert.equal(result.txHash, '0xmint-tx')
    assert.equal(result.chain, 'base')
    assert.equal(result.success, true)

    // Verify it called receiveMessage on messageTransmitter
    const call = bridgeModule.ethereum.callContract.mock.calls[0]
    assert.equal(call.arguments[0].contract, '0xmt')
    assert.ok(call.arguments[0].method.includes('receiveMessage'))
    assert.deepEqual(call.arguments[0].args, ['0xdeadbeef', '0xattestationdata'])
  })

  it('throws when contracts not configured', async () => {
    await assert.rejects(
      () =>
        mint({
          chain: 'fakenet',
          messageBytes: '0xdeadbeef',
          attestation: '0xatt',
          contracts: {},
        }),
      /No CCTP contracts configured/,
    )
  })

  it('throws without messageBytes', async () => {
    const contracts = { base: { messageTransmitter: '0xmt' } }
    await assert.rejects(
      () => mint({ chain: 'base', messageBytes: '', attestation: '0xatt', contracts }),
      /message-bytes is required/,
    )
  })

  it('throws without attestation', async () => {
    const contracts = { base: { messageTransmitter: '0xmt' } }
    await assert.rejects(
      () => mint({ chain: 'base', messageBytes: '0xaa', attestation: '', contracts }),
      /attestation is required/,
    )
  })

  it('passes rpcUrl through to callContract', async () => {
    const contracts = { base: { messageTransmitter: '0xmt' } }
    await mint({
      chain: 'base',
      messageBytes: '0xdeadbeef',
      attestation: '0xatt',
      contracts,
      rpcUrl: 'https://rpc.example.com',
    })
    const call = bridgeModule.ethereum.callContract.mock.calls[0]
    assert.equal(call.arguments[0].rpcUrl, 'https://rpc.example.com')
  })
})

// ─── replaceMessage happy path ──────────────────────────────────────

describe('replaceMessage: happy path', () => {
  let replaceMessage, bridgeModule

  const MESSAGE_SENT_TOPIC = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036'
  const fakeMessage = 'cafebabe'.repeat(8)
  const offset = '0000000000000000000000000000000000000000000000000000000000000020'
  const length = '0000000000000000000000000000000000000000000000000000000000000020'
  const logData = '0x' + offset + length + fakeMessage

  beforeEach(async () => {
    bridgeModule = await import('@w3-io/action-core')
    mock.method(bridgeModule.ethereum, 'callContract', async () => ({
      txHash: '0xreplace-tx',
      logs: JSON.stringify([{ topics: [MESSAGE_SENT_TOPIC], data: logData }]),
    }))
    mock.method(bridgeModule.crypto, 'keccak256', async () => ({
      hash: 'replacehash'.padEnd(64, '0'),
    }))
    ;({ replaceMessage } = await import('../src/cctp-onchain.js'))
  })

  afterEach(() => {
    mock.restoreAll()
  })

  it('replaces message and returns new messageBytes + hash', async () => {
    const contracts = {
      ethereum: { tokenMessenger: '0xtm', messageTransmitter: '0xmt' },
    }
    const result = await replaceMessage({
      chain: 'ethereum',
      originalMessageBytes: '0xoriginal',
      originalAttestation: '0xoriginalatt',
      newDestinationCaller: '0x1234567890abcdef1234567890abcdef12345678',
      contracts,
    })

    assert.equal(result.txHash, '0xreplace-tx')
    assert.equal(result.chain, 'ethereum')
    assert.ok(result.newMessageBytes.startsWith('0x'))
    assert.ok(result.newMessageHash.startsWith('0x'))
  })

  it('uses zero bytes32 when no newDestinationCaller', async () => {
    const contracts = {
      ethereum: { tokenMessenger: '0xtm', messageTransmitter: '0xmt' },
    }
    await replaceMessage({
      chain: 'ethereum',
      originalMessageBytes: '0xoriginal',
      originalAttestation: '0xoriginalatt',
      contracts,
    })

    const call = bridgeModule.ethereum.callContract.mock.calls[0]
    const args = call.arguments[0].args
    // args[3] is the callerBytes32 — should be all zeros
    assert.equal(args[3], '0x' + '0'.repeat(64))
  })

  it('throws without contracts', async () => {
    await assert.rejects(
      () =>
        replaceMessage({
          chain: 'fakenet',
          originalMessageBytes: '0xaa',
          originalAttestation: '0xbb',
          contracts: {},
        }),
      /No CCTP contracts configured/,
    )
  })

  it('throws without originalMessageBytes', async () => {
    const contracts = { ethereum: { messageTransmitter: '0xmt' } }
    await assert.rejects(
      () =>
        replaceMessage({
          chain: 'ethereum',
          originalMessageBytes: '',
          originalAttestation: '0xbb',
          contracts,
        }),
      /original-message-bytes is required/,
    )
  })

  it('throws without originalAttestation', async () => {
    const contracts = { ethereum: { messageTransmitter: '0xmt' } }
    await assert.rejects(
      () =>
        replaceMessage({
          chain: 'ethereum',
          originalMessageBytes: '0xaa',
          originalAttestation: '',
          contracts,
        }),
      /original-attestation is required/,
    )
  })

  it('handles missing logs (no new MessageSent event)', async () => {
    mock.restoreAll()
    bridgeModule = await import('@w3-io/action-core')
    mock.method(bridgeModule.ethereum, 'callContract', async () => ({
      txHash: '0xreplace-tx',
      // no logs field
    }))

    const contracts = {
      ethereum: { tokenMessenger: '0xtm', messageTransmitter: '0xmt' },
    }
    const result = await replaceMessage({
      chain: 'ethereum',
      originalMessageBytes: '0xoriginal',
      originalAttestation: '0xoriginalatt',
      contracts,
    })

    assert.equal(result.txHash, '0xreplace-tx')
    assert.equal(result.newMessageBytes, null)
    assert.equal(result.newMessageHash, null)
  })
})

// ─── mintSolana happy path ──────────────────────────────────────────

describe('mintSolana: validation', () => {
  let mintSolana

  beforeEach(async () => {
    ;({ mintSolana } = await import('../src/cctp-solana.js'))
  })

  it('throws without messageBytes', async () => {
    await assert.rejects(
      () =>
        mintSolana({
          chain: 'solana',
          messageBytes: '',
          attestation: '0xatt',
          contracts: { solana: { messageTransmitter: 'mt', tokenMessenger: 'tmm' } },
          domains: { solana: { domain: 5, usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' } },
        }),
      /message-bytes is required/,
    )
  })

  it('throws without attestation', async () => {
    await assert.rejects(
      () =>
        mintSolana({
          chain: 'solana',
          messageBytes: '0xaa',
          attestation: '',
          contracts: { solana: { messageTransmitter: 'mt', tokenMessenger: 'tmm' } },
          domains: { solana: { domain: 5, usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' } },
        }),
      /attestation is required/,
    )
  })

  it('throws on missing contracts', async () => {
    await assert.rejects(
      () =>
        mintSolana({
          chain: 'solana',
          messageBytes: '0xaa',
          attestation: '0xbb',
          contracts: {},
          domains: { solana: { domain: 5 } },
        }),
      /No CCTP contracts configured/,
    )
  })

  it('throws on unknown chain', async () => {
    await assert.rejects(
      () =>
        mintSolana({
          chain: 'solana',
          messageBytes: '0xaa',
          attestation: '0xbb',
          contracts: { solana: { messageTransmitter: 'mt', tokenMessenger: 'tmm' } },
          domains: {},
        }),
      /Unknown chain/,
    )
  })
})

describe('mintSolana: happy path', () => {
  let mintSolana, bridgeModule

  // Build a valid CCTP V2 message for parseMessage.
  // Layout: version(4) + sourceDomain(4) + nonce(32) + sender(32) + ...pad to 140... + body
  // Body: burnToken(32 at body+4) + mintRecipient(32 at body+36)
  function buildFakeMessage() {
    const buf = Buffer.alloc(208)
    buf.writeUInt32BE(0, 4) // sourceDomain = 0 (ethereum)
    buf.fill(0x01, 12, 44) // nonce bytes
    // burnToken at body+4 = 144 (32 zero bytes = fake USDC mint)
    buf.fill(0xaa, 144, 176)
    // mintRecipient at body+36 = 176 (32 zero bytes = fake recipient)
    buf.fill(0xbb, 176, 208)
    return '0x' + buf.toString('hex')
  }

  let pdaCounter = 0

  beforeEach(async () => {
    pdaCounter = 0
    bridgeModule = await import('@w3-io/action-core')
    mock.method(bridgeModule.solana, 'payerAddress', async () => ({
      pubkey: '11111111111111111111111111111112',
    }))
    mock.method(bridgeModule.solana, 'callProgram', async () => ({
      signature: 'solana-mint-sig-123',
    }))
    mock.method(bridgeModule.solana, 'findPda', async () => ({
      address: `PDA${++pdaCounter}111111111111111111111111111`,
      bump: '255',
    }))
    mock.method(bridgeModule.solana, 'decodeAddress', async ({ address }) => ({
      bytes: '0x' + Buffer.alloc(32, 0xcc).toString('hex'),
    }))
    mock.method(bridgeModule.solana, 'encodeAddress', async () => ({
      address: 'EncodedAddr1111111111111111111111111',
    }))
    mock.method(bridgeModule.solana, 'getAta', async () => ({
      address: 'ATA11111111111111111111111111111111',
      bump: '254',
    }))
    mock.method(bridgeModule.crypto, 'keccak256', async () => ({
      hash: 'solanahash'.padEnd(64, '0'),
    }))
    ;({ mintSolana } = await import('../src/cctp-solana.js'))
  })

  afterEach(() => {
    mock.restoreAll()
  })

  it('calls receiveMessage and returns signature', async () => {
    const fakeMsg = await buildFakeMessage()
    const contracts = {
      solana: {
        tokenMessenger: 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
        messageTransmitter: 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
      },
    }
    const domains = {
      solana: {
        domain: 5,
        type: 'solana',
        usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
    }

    const result = await mintSolana({
      chain: 'solana',
      messageBytes: fakeMsg,
      attestation: '0xdeadbeefdeadbeef',
      contracts,
      domains,
    })

    assert.equal(result.signature, 'solana-mint-sig-123')
    assert.equal(result.chain, 'solana')
    assert.equal(result.success, true)

    // Verify callProgram was called with the messageTransmitter program
    const call = bridgeModule.solana.callProgram.mock.calls[0]
    assert.equal(call.arguments[0].programId, 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC')
    assert.equal(call.arguments[0].network, 'solana')
    // Verify accounts list has expected entries (20 accounts total)
    assert.ok(call.arguments[0].accounts.length >= 15)
    // Verify data starts with 0x (hex-encoded instruction)
    assert.ok(call.arguments[0].data.startsWith('0x'))
  })
})

// ─── burnSolana happy path ──────────────────────────────────────────

describe('burnSolana: happy path', () => {
  let burnSolana, bridgeModule
  let pdaCounter = 0

  beforeEach(async () => {
    pdaCounter = 0
    bridgeModule = await import('@w3-io/action-core')
    mock.method(bridgeModule.solana, 'payerAddress', async () => ({
      pubkey: '11111111111111111111111111111112',
    }))
    mock.method(bridgeModule.solana, 'generateKeypair', async () => ({
      pubkey: 'EphemeralPubkey1111111111111111111111111111',
    }))
    mock.method(bridgeModule.solana, 'callProgram', async () => ({
      signature: 'solana-burn-sig-456',
    }))
    mock.method(bridgeModule.solana, 'findPda', async () => ({
      address: `BurnPDA${++pdaCounter}11111111111111111111111`,
      bump: '255',
    }))
    mock.method(bridgeModule.solana, 'decodeAddress', async () => ({
      bytes: '0x' + Buffer.alloc(32, 0xdd).toString('hex'),
    }))
    mock.method(bridgeModule.solana, 'getAta', async () => ({
      address: 'BurnATA1111111111111111111111111111',
      bump: '254',
    }))
    // Build fake event data: 8-byte discriminator + 4-byte length + message bytes
    const msgBytes = Buffer.alloc(32, 0xab)
    const eventData = Buffer.alloc(8 + 4 + msgBytes.length)
    eventData.writeUInt32LE(msgBytes.length, 8)
    msgBytes.copy(eventData, 12)
    mock.method(bridgeModule.solana, 'getAccount', async () => ({
      data: eventData.toString('base64'),
    }))
    mock.method(bridgeModule.crypto, 'keccak256', async () => ({
      hash: 'burnhash'.padEnd(64, '0'),
    }))
    ;({ burnSolana } = await import('../src/cctp-solana.js'))
  })

  afterEach(() => {
    mock.restoreAll()
  })

  it('burns USDC on Solana and returns messageBytes + hash', async () => {
    const contracts = {
      solana: {
        tokenMessenger: 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
        messageTransmitter: 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
      },
    }
    const domains = {
      solana: {
        domain: 5,
        type: 'solana',
        usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
      ethereum: { domain: 0 },
    }

    const result = await burnSolana({
      chain: 'solana',
      destinationChain: 'ethereum',
      recipient: '0x1234567890abcdef1234567890abcdef12345678',
      amount: '10',
      contracts,
      domains,
    })

    assert.equal(result.signature, 'solana-burn-sig-456')
    assert.equal(result.source, 'solana')
    assert.equal(result.destination, 'ethereum')
    assert.equal(result.amount, '10')
    assert.ok(result.messageBytes.startsWith('0x'))
    assert.ok(result.messageHash.startsWith('0x'))
  })

  it('throws on missing recipient', async () => {
    const contracts = {
      solana: {
        tokenMessenger: 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
        messageTransmitter: 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
      },
    }
    const domains = {
      solana: {
        domain: 5,
        type: 'solana',
        usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
      ethereum: { domain: 0 },
    }

    await assert.rejects(
      () =>
        burnSolana({
          chain: 'solana',
          destinationChain: 'ethereum',
          recipient: '',
          amount: '10',
          contracts,
          domains,
        }),
      /destination-address is required/,
    )
  })

  it('throws on unknown destination chain', async () => {
    const contracts = {
      solana: {
        tokenMessenger: 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
        messageTransmitter: 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
      },
    }
    const domains = {
      solana: {
        domain: 5,
        type: 'solana',
        usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
    }

    await assert.rejects(
      () =>
        burnSolana({
          chain: 'solana',
          destinationChain: 'fakenet',
          recipient: '0xabc',
          amount: '10',
          contracts,
          domains,
        }),
      /Unknown destination chain/,
    )
  })

  it('handles Solana pubkey recipient (non-0x)', async () => {
    const contracts = {
      solana: {
        tokenMessenger: 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
        messageTransmitter: 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
      },
    }
    const domains = {
      solana: {
        domain: 5,
        type: 'solana',
        usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
      'solana-devnet': { domain: 5 },
    }

    const result = await burnSolana({
      chain: 'solana',
      destinationChain: 'solana-devnet',
      recipient: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '5',
      contracts,
      domains,
    })

    assert.equal(result.signature, 'solana-burn-sig-456')
    assert.equal(result.recipient, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
  })

  it('handles destinationCaller as Solana pubkey', async () => {
    const contracts = {
      solana: {
        tokenMessenger: 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
        messageTransmitter: 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
      },
    }
    const domains = {
      solana: {
        domain: 5,
        type: 'solana',
        usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
      ethereum: { domain: 0 },
    }

    const result = await burnSolana({
      chain: 'solana',
      destinationChain: 'ethereum',
      recipient: '0x1234567890abcdef1234567890abcdef12345678',
      amount: '3',
      contracts,
      domains,
      destinationCaller: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    })

    assert.equal(result.signature, 'solana-burn-sig-456')
  })
})
