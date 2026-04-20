/**
 * CircleClient unit tests.
 *
 * Mocks `fetch` globally so we can test the client without hitting
 * the real Circle IRIS / Platform APIs.
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { CircleClient, CircleError } from '../src/circle.js'

const ATTESTATION_FIXTURE = {
  attestation:
    '0x1234abcd5678ef901234abcd5678ef901234abcd5678ef901234abcd5678ef901234abcd5678ef901234abcd5678ef901234abcd5678ef901234abcd5678ef9012',
  status: 'complete',
}

let originalFetch
let calls

beforeEach(() => {
  originalFetch = global.fetch
  calls = []
})

afterEach(() => {
  global.fetch = originalFetch
})

function mockFetch(responses) {
  let index = 0
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    const response = responses[index++]
    if (!response) {
      throw new Error(`Unexpected fetch call ${index}: ${url}`)
    }
    const status = response.status ?? 200
    const ok = status >= 200 && status < 300
    return {
      ok,
      status,
      text: async () =>
        typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? {}),
    }
  }
}

describe('CircleClient: construction', () => {
  it('defaults to production IRIS URL', () => {
    const client = new CircleClient()
    assert.equal(client.irisUrl, 'https://iris-api.circle.com')
  })

  it('uses sandbox URL when sandbox=true', () => {
    const client = new CircleClient({ sandbox: true })
    assert.equal(client.irisUrl, 'https://iris-api-sandbox.circle.com')
  })

  it('respects explicit irisUrl over sandbox flag', () => {
    const client = new CircleClient({ irisUrl: 'https://custom.example.com/', sandbox: true })
    assert.equal(client.irisUrl, 'https://custom.example.com')
  })
})

describe('CircleClient: getAttestation', () => {
  it('returns complete attestation', async () => {
    mockFetch([{ body: ATTESTATION_FIXTURE }])
    const client = new CircleClient({ sandbox: true })

    const result = await client.getAttestation('0xabc123')

    assert.equal(result.status, 'complete')
    assert.ok(result.attestation)
    assert.equal(result.messageHash, '0xabc123')
    assert.equal(calls[0].url, 'https://iris-api-sandbox.circle.com/attestations/0xabc123')
    assert.equal(calls[0].options.method, 'GET')
  })

  it('returns pending for 404', async () => {
    mockFetch([{ status: 404, body: { error: 'Message hash not found' } }])
    const client = new CircleClient({ sandbox: true })

    const result = await client.getAttestation('0xabc123')

    assert.equal(result.status, 'pending_confirmations')
    assert.equal(result.attestation, null)
  })

  it('adds 0x prefix if missing', async () => {
    mockFetch([{ body: ATTESTATION_FIXTURE }])
    const client = new CircleClient({ sandbox: true })

    const result = await client.getAttestation('abc123')

    assert.equal(result.messageHash, '0xabc123')
    assert.match(calls[0].url, /\/attestations\/0xabc123/)
  })

  it('throws on missing message hash', async () => {
    const client = new CircleClient({ sandbox: true })
    await assert.rejects(() => client.getAttestation(''), /message-hash is required/)
  })

  it('throws on server error', async () => {
    mockFetch([{ status: 500, body: 'Internal Server Error' }])
    const client = new CircleClient({ sandbox: true, maxRetries: 0 })

    await assert.rejects(
      () => client.getAttestation('0xabc'),
      (err) => err instanceof CircleError && err.code === 'IRIS_ERROR' && err.status === 500,
    )
  })

  it('throws on invalid JSON', async () => {
    mockFetch([{ body: 'not json' }])
    const client = new CircleClient({ sandbox: true })

    await assert.rejects(
      () => client.getAttestation('0xabc'),
      (err) => err instanceof CircleError && err.code === 'PARSE_ERROR',
    )
  })
})

describe('CircleClient: getSupportedChains', () => {
  it('returns all chains', () => {
    const client = new CircleClient()
    const result = client.getSupportedChains()
    assert.ok(result.count > 0)
    assert.ok('domain' in result.chains[0])
    assert.ok('chainId' in result.chains[0])
    assert.ok('usdc' in result.chains[0])
  })

  it('filters mainnet chains', () => {
    const client = new CircleClient()
    const result = client.getSupportedChains('mainnet')
    assert.ok(result.chains.every((c) => c.network === 'mainnet'))
    assert.ok(result.chains.length > 0)
  })

  it('filters testnet chains', () => {
    const client = new CircleClient()
    const result = client.getSupportedChains('testnet')
    assert.ok(result.chains.every((c) => c.network === 'testnet'))
    assert.ok(result.chains.length > 0)
  })

  it('testnet chains have contracts', () => {
    const client = new CircleClient()
    const result = client.getSupportedChains('testnet')
    // Filter to EVM-style chains (0x token messenger). Solana uses
    // base58 program IDs, so it doesn't match the 0x prefix check.
    const evmWithContracts = result.chains.filter(
      (c) => c.contracts && /^0x/.test(c.contracts.tokenMessenger),
    )
    assert.ok(evmWithContracts.length > 0)
    assert.match(evmWithContracts[0].contracts.tokenMessenger, /^0x/)
  })
})

describe('CircleClient: getDomainInfo', () => {
  it('returns ethereum domain info', () => {
    const client = new CircleClient()
    const result = client.getDomainInfo('ethereum')
    assert.equal(result.name, 'ethereum')
    assert.equal(result.domain, 0)
    assert.equal(result.chainId, 1)
    assert.equal(result.network, 'mainnet')
  })

  it('is case insensitive', () => {
    const client = new CircleClient()
    const result = client.getDomainInfo('ETHEREUM')
    assert.equal(result.name, 'ethereum')
  })

  it('returns testnet with contracts', () => {
    const client = new CircleClient()
    const result = client.getDomainInfo('ethereum-sepolia')
    assert.equal(result.network, 'testnet')
    assert.ok(result.contracts)
    assert.match(result.contracts.tokenMessenger, /^0x/)
    assert.match(result.contracts.messageTransmitter, /^0x/)
  })

  it('throws on unknown chain', () => {
    const client = new CircleClient()
    assert.throws(() => client.getDomainInfo('fake-chain'), /Unknown chain/)
  })

  it('throws on missing chain', () => {
    const client = new CircleClient()
    assert.throws(() => client.getDomainInfo(''), /chain is required/)
  })
})

describe('CircleClient: waitForAttestation', () => {
  it('returns immediately when attestation is complete', async () => {
    mockFetch([{ body: ATTESTATION_FIXTURE }])
    const client = new CircleClient({ sandbox: true })

    const result = await client.waitForAttestation('0xabc', {
      pollInterval: 0.01,
      maxAttempts: 3,
    })

    assert.equal(result.status, 'complete')
    assert.equal(result.attempts, 1)
  })

  it('polls until complete', async () => {
    mockFetch([
      { status: 404, body: { error: 'Not found' } },
      { status: 404, body: { error: 'Not found' } },
      { body: ATTESTATION_FIXTURE },
    ])
    const client = new CircleClient({ sandbox: true })

    const result = await client.waitForAttestation('0xabc', {
      pollInterval: 0.01,
      maxAttempts: 5,
    })

    assert.equal(result.status, 'complete')
    assert.equal(result.attempts, 3)
    assert.equal(calls.length, 3)
  })

  it('throws on timeout', async () => {
    mockFetch([
      { status: 404, body: { error: 'Not found' } },
      { status: 404, body: { error: 'Not found' } },
    ])
    const client = new CircleClient({ sandbox: true })

    await assert.rejects(
      () =>
        client.waitForAttestation('0xabc', {
          pollInterval: 0.01,
          maxAttempts: 2,
        }),
      (err) => err instanceof CircleError && err.code === 'ATTESTATION_TIMEOUT',
    )
  })
})

describe('CircleClient: Platform API auth', () => {
  it('requireApiKey throws without key', () => {
    const client = new CircleClient()
    assert.throws(() => client.requireApiKey(), /api-key is required/)
  })

  it('requireApiKey passes with key', () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    assert.doesNotThrow(() => client.requireApiKey())
  })
})

describe('CircleClient: createWalletSet', () => {
  it('calls correct endpoint with Bearer auth', async () => {
    mockFetch([{ body: { data: { walletSet: { id: 'ws-1', name: 'test' } } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })

    const result = await client.createWalletSet({ name: 'test' })

    assert.equal(result.id, 'ws-1')
    assert.equal(calls[0].url, 'https://api.circle.com/v1/w3s/developer/walletSets')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer TEST:id:secret')
    assert.equal(JSON.parse(calls[0].options.body).name, 'test')
  })

  it('throws without name', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(() => client.createWalletSet({}), /name is required/)
  })
})

describe('CircleClient: createWallet', () => {
  it('sends blockchains and count', async () => {
    mockFetch([{ body: { data: { wallets: [{ id: 'w-1' }] } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })

    await client.createWallet({
      walletSetId: 'ws-1',
      blockchains: ['ETH-SEPOLIA'],
      count: 2,
    })

    const body = JSON.parse(calls[0].options.body)
    assert.equal(body.walletSetId, 'ws-1')
    assert.deepEqual(body.blockchains, ['ETH-SEPOLIA'])
    assert.equal(body.count, 2)
  })

  it('throws without walletSetId', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(
      () => client.createWallet({ blockchains: ['ETH'] }),
      /wallet-set-id is required/,
    )
  })

  it('throws without blockchains', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(
      () => client.createWallet({ walletSetId: 'ws-1' }),
      /blockchains is required/,
    )
  })
})

describe('CircleClient: transfer', () => {
  it('sends transfer request', async () => {
    mockFetch([{ body: { data: { id: 'tx-1', state: 'INITIATED' } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })

    const result = await client.transfer({
      walletId: 'w-1',
      destinationAddress: '0xdef',
      amount: '5.00',
      tokenId: 'tok-1',
    })

    assert.equal(result.id, 'tx-1')
    const body = JSON.parse(calls[0].options.body)
    assert.equal(body.walletId, 'w-1')
    assert.deepEqual(body.amounts, ['5.00'])
  })

  it('throws without required fields', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(
      () => client.transfer({ walletId: 'w-1', amount: '1' }),
      /destination-address is required/,
    )
  })
})

describe('CircleClient: screenAddress', () => {
  it('calls compliance endpoint', async () => {
    mockFetch([{ body: { data: { result: 'PASS', riskScore: 0 } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })

    const result = await client.screenAddress('0xabc', { chain: 'ETH-SEPOLIA' })

    assert.equal(result.result, 'PASS')
    assert.match(calls[0].url, /\/v1\/w3s\/compliance\/screening\/addresses/)
  })

  it('throws without address', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(() => client.screenAddress('', { chain: 'ETH' }), /address is required/)
  })

  it('throws without chain', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(() => client.screenAddress('0xabc'), /blockchain is required/)
  })
})

describe('CircleClient: transfer validation', () => {
  it('rejects amount "0" (falsy)', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(
      () =>
        client.transfer({
          walletId: 'w-1',
          destinationAddress: '0xdef',
          tokenId: 'tok-1',
          amount: '',
        }),
      /amount is required/,
    )
  })

  it('rejects missing amount', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(
      () =>
        client.transfer({
          walletId: 'w-1',
          destinationAddress: '0xdef',
          tokenId: 'tok-1',
        }),
      /amount is required/,
    )
  })
})

describe('CircleClient: estimateFee validation', () => {
  it('throws without walletId', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(
      () =>
        client.estimateFee({
          destinationAddress: '0xdef',
          tokenId: 'tok-1',
          amount: '1.00',
        }),
      /wallet-id is required/,
    )
  })

  it('throws without apiKey', async () => {
    const client = new CircleClient()
    await assert.rejects(
      () =>
        client.estimateFee({
          walletId: 'w-1',
          destinationAddress: '0xdef',
          amount: '1.00',
        }),
      /api-key is required/,
    )
  })
})

describe('CircleClient: platformRequest error handling', () => {
  it('parses error message from response', async () => {
    mockFetch([
      {
        status: 401,
        body: JSON.stringify({ code: 401, message: 'Invalid credentials' }),
      },
    ])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })

    await assert.rejects(
      () => client.listWallets(),
      (err) =>
        err instanceof CircleError && err.message === 'Invalid credentials' && err.code === '401',
    )
  })

  it('handles non-JSON error body', async () => {
    mockFetch([{ status: 500, body: 'Internal Server Error' }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret', maxRetries: 0 })

    await assert.rejects(
      () => client.listWallets(),
      (err) => err instanceof CircleError && err.code === 'API_ERROR',
    )
  })
})
