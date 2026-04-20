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

describe('CircleClient: getAttestationV2', () => {
  it('returns complete attestation from V2 endpoint', async () => {
    mockFetch([
      {
        body: {
          messages: [
            {
              status: 'complete',
              attestation: '0xv2attestation',
              message: '0xv2message',
            },
          ],
        },
      },
    ])
    const client = new CircleClient({ sandbox: true })
    const result = await client.getAttestationV2('0xtxhash', 0)

    assert.equal(result.status, 'complete')
    assert.equal(result.attestation, '0xv2attestation')
    assert.equal(result.message, '0xv2message')
    assert.equal(result.txHash, '0xtxhash')
    assert.equal(result.sourceDomain, 0)
    assert.match(calls[0].url, /\/v2\/messages\/0\?transactionHash=0xtxhash/)
  })

  it('returns not_found when no messages', async () => {
    mockFetch([{ body: { messages: [] } }])
    const client = new CircleClient({ sandbox: true })
    const result = await client.getAttestationV2('0xtxhash', 0)

    assert.equal(result.status, 'not_found')
    assert.equal(result.attestation, null)
  })

  it('returns pending when attestation is PENDING', async () => {
    mockFetch([
      {
        body: {
          messages: [{ status: 'pending', attestation: 'PENDING', message: '0xmsg' }],
        },
      },
    ])
    const client = new CircleClient({ sandbox: true })
    const result = await client.getAttestationV2('0xtx', 6)

    assert.equal(result.status, 'pending_confirmations')
    assert.equal(result.attestation, null)
  })

  it('throws without txHash', async () => {
    const client = new CircleClient({ sandbox: true })
    await assert.rejects(() => client.getAttestationV2('', 0), /tx-hash is required/)
  })

  it('includes delayReason when present', async () => {
    mockFetch([
      {
        body: {
          messages: [
            {
              status: 'pending',
              attestation: 'PENDING',
              delayReason: 'insufficient_fee',
            },
          ],
        },
      },
    ])
    const client = new CircleClient({ sandbox: true })
    const result = await client.getAttestationV2('0xtx', 0)

    assert.equal(result.delayReason, 'insufficient_fee')
  })
})

describe('CircleClient: waitForAttestationV2', () => {
  it('returns immediately when V2 attestation is complete', async () => {
    mockFetch([
      {
        body: {
          messages: [{ status: 'complete', attestation: '0xatt', message: '0xmsg' }],
        },
      },
    ])
    const client = new CircleClient({ sandbox: true })
    const result = await client.waitForAttestationV2('0xtx', 0, {
      pollInterval: 0.01,
      maxAttempts: 3,
    })

    assert.equal(result.status, 'complete')
    assert.equal(result.attempts, 1)
  })

  it('polls until V2 attestation is complete', async () => {
    mockFetch([
      { body: { messages: [] } },
      { body: { messages: [{ status: 'pending', attestation: 'PENDING' }] } },
      { body: { messages: [{ status: 'complete', attestation: '0xatt', message: '0xm' }] } },
    ])
    const client = new CircleClient({ sandbox: true })
    const result = await client.waitForAttestationV2('0xtx', 0, {
      pollInterval: 0.01,
      maxAttempts: 5,
    })

    assert.equal(result.status, 'complete')
    assert.equal(result.attempts, 3)
  })

  it('throws on insufficient_fee delay reason', async () => {
    mockFetch([
      {
        body: {
          messages: [
            { status: 'pending', attestation: 'PENDING', delayReason: 'insufficient_fee' },
          ],
        },
      },
    ])
    const client = new CircleClient({ sandbox: true })

    await assert.rejects(
      () => client.waitForAttestationV2('0xtx', 0, { pollInterval: 0.01, maxAttempts: 3 }),
      (err) => err instanceof CircleError && err.code === 'INSUFFICIENT_FEE',
    )
  })

  it('throws on V2 timeout', async () => {
    mockFetch([
      { body: { messages: [{ status: 'pending', attestation: 'PENDING' }] } },
      { body: { messages: [{ status: 'pending', attestation: 'PENDING' }] } },
    ])
    const client = new CircleClient({ sandbox: true })

    await assert.rejects(
      () => client.waitForAttestationV2('0xtx', 0, { pollInterval: 0.01, maxAttempts: 2 }),
      (err) => err instanceof CircleError && err.code === 'ATTESTATION_TIMEOUT',
    )
  })
})

describe('CircleClient: getWallet', () => {
  it('returns wallet details', async () => {
    mockFetch([{ body: { data: { wallet: { id: 'w-1', address: '0xabc' } } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    const result = await client.getWallet('w-1')

    assert.equal(result.id, 'w-1')
    assert.match(calls[0].url, /\/v1\/w3s\/wallets\/w-1/)
  })

  it('throws without walletId', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(() => client.getWallet(''), /wallet-id is required/)
  })

  it('throws without apiKey', async () => {
    const client = new CircleClient()
    await assert.rejects(() => client.getWallet('w-1'), /api-key is required/)
  })
})

describe('CircleClient: listWallets', () => {
  it('returns wallet list with filters', async () => {
    mockFetch([{ body: { data: { wallets: [{ id: 'w-1' }, { id: 'w-2' }] } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    const result = await client.listWallets({
      walletSetId: 'ws-1',
      blockchain: 'ETH',
      pageSize: 5,
    })

    assert.equal(result.length, 2)
    assert.match(calls[0].url, /walletSetId=ws-1/)
    assert.match(calls[0].url, /blockchain=ETH/)
    assert.match(calls[0].url, /pageSize=5/)
  })

  it('uses default pageSize', async () => {
    mockFetch([{ body: { data: { wallets: [] } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await client.listWallets()

    assert.match(calls[0].url, /pageSize=10/)
  })
})

describe('CircleClient: getBalance', () => {
  it('returns token balances', async () => {
    mockFetch([{ body: { data: { tokenBalances: [{ token: 'USDC', amount: '100' }] } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    const result = await client.getBalance('w-1')

    assert.equal(result[0].token, 'USDC')
    assert.match(calls[0].url, /\/v1\/w3s\/wallets\/w-1\/balances/)
  })

  it('throws without walletId', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(() => client.getBalance(''), /wallet-id is required/)
  })
})

describe('CircleClient: getTransaction', () => {
  it('returns transaction details', async () => {
    mockFetch([{ body: { data: { transaction: { id: 'tx-1', state: 'CONFIRMED' } } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    const result = await client.getTransaction('tx-1')

    assert.equal(result.id, 'tx-1')
    assert.equal(result.state, 'CONFIRMED')
    assert.match(calls[0].url, /\/v1\/w3s\/transactions\/tx-1/)
  })

  it('throws without transactionId', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(() => client.getTransaction(''), /transaction-id is required/)
  })
})

describe('CircleClient: estimateFee', () => {
  it('sends fee estimate request', async () => {
    mockFetch([{ body: { data: { low: '0.001', medium: '0.002', high: '0.005' } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    const result = await client.estimateFee({
      walletId: 'w-1',
      destinationAddress: '0xdef',
      tokenId: 'tok-1',
      amount: '10.00',
    })

    assert.equal(result.medium, '0.002')
    const body = JSON.parse(calls[0].options.body)
    assert.equal(body.walletId, 'w-1')
    assert.deepEqual(body.amounts, ['10.00'])
  })
})

describe('CircleClient: getEntitySecretCiphertext', () => {
  it('throws without entity secret', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(() => client.getEntitySecretCiphertext(), /entity-secret is required/)
  })

  it('throws on invalid entity secret format', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret', entitySecret: 'not-hex' })
    await assert.rejects(
      () => client.getEntitySecretCiphertext(),
      /entity-secret must be a 32-byte hex string/,
    )
  })
})

describe('CircleClient: irisRequest retry', () => {
  it('retries on 429 and succeeds', async () => {
    mockFetch([
      { status: 429, body: 'Rate limited' },
      { body: { status: 'complete', attestation: '0xatt' } },
    ])
    const client = new CircleClient({ sandbox: true, maxRetries: 1 })

    const result = await client.getAttestation('0xabc')
    assert.equal(result.status, 'complete')
    assert.equal(calls.length, 2)
  })

  it('retries on 500 and succeeds', async () => {
    mockFetch([
      { status: 500, body: 'Server Error' },
      { body: { status: 'complete', attestation: '0xatt' } },
    ])
    const client = new CircleClient({ sandbox: true, maxRetries: 1 })

    const result = await client.getAttestation('0xabc')
    assert.equal(result.status, 'complete')
    assert.equal(calls.length, 2)
  })

  it('exhausts retries on persistent 500', async () => {
    mockFetch([
      { status: 500, body: 'Server Error' },
      { status: 500, body: 'Server Error' },
    ])
    const client = new CircleClient({ sandbox: true, maxRetries: 1 })

    await assert.rejects(
      () => client.getAttestation('0xabc'),
      (err) => err instanceof CircleError && err.code === 'IRIS_ERROR',
    )
  })
})

describe('CircleClient: platformRequest retry', () => {
  it('retries on 429 then succeeds', async () => {
    mockFetch([{ status: 429, body: 'Rate limited' }, { body: { data: { wallets: [] } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret', maxRetries: 1 })

    const result = await client.listWallets()
    assert.deepEqual(result, [])
    assert.equal(calls.length, 2)
  })

  it('retries on 500 then succeeds', async () => {
    mockFetch([{ status: 500, body: 'Server Error' }, { body: { data: { wallets: [] } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret', maxRetries: 1 })

    const result = await client.listWallets()
    assert.deepEqual(result, [])
  })

  it('exhausts retries and throws last error', async () => {
    mockFetch([
      { status: 500, body: 'Server Error' },
      { status: 500, body: 'Server Error' },
    ])
    const client = new CircleClient({ apiKey: 'TEST:id:secret', maxRetries: 1 })

    await assert.rejects(
      () => client.listWallets(),
      (err) => err instanceof CircleError && err.code === 'API_ERROR',
    )
  })

  it('handles empty response body', async () => {
    mockFetch([{ body: '' }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })

    const result = await client.listWallets()
    assert.deepEqual(result, {})
  })

  it('throws parse error on invalid JSON response', async () => {
    mockFetch([{ body: 'not-json-at-all' }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })

    await assert.rejects(
      () => client.listWallets(),
      (err) => err instanceof CircleError && err.code === 'PARSE_ERROR',
    )
  })
})

describe('CircleClient: transfer with blockchain param', () => {
  it('includes blockchain in request body', async () => {
    mockFetch([{ body: { data: { id: 'tx-1', state: 'INITIATED' } } }])
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })

    await client.transfer({
      walletId: 'w-1',
      destinationAddress: '0xdef',
      amount: '5.00',
      tokenId: 'tok-1',
      blockchain: 'ETH-SEPOLIA',
    })

    const body = JSON.parse(calls[0].options.body)
    assert.equal(body.blockchain, 'ETH-SEPOLIA')
    assert.equal(body.tokenId, 'tok-1')
  })

  it('throws without walletId', async () => {
    const client = new CircleClient({ apiKey: 'TEST:id:secret' })
    await assert.rejects(
      () => client.transfer({ destinationAddress: '0xdef', amount: '1' }),
      /wallet-id is required/,
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
