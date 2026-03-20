import { jest } from '@jest/globals'
import { readFileSync } from 'fs'
import { CircleClient, CircleError } from '../src/circle.js'

const fixtureResponse = JSON.parse(
  readFileSync(new URL('../__fixtures__/api-response.json', import.meta.url)),
)

const mockFetch = jest.fn()
global.fetch = mockFetch

function mockOk(data) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  })
}

function mock404() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 404,
    text: async () => JSON.stringify({ error: 'Message hash not found' }),
  })
}

function mockError(status, body) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => body,
  })
}

describe('CircleClient', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  test('constructor defaults to production IRIS URL', () => {
    const client = new CircleClient()
    expect(client.irisUrl).toBe('https://iris-api.circle.com')
  })

  test('constructor uses sandbox URL when sandbox=true', () => {
    const client = new CircleClient({ sandbox: true })
    expect(client.irisUrl).toBe('https://iris-api-sandbox.circle.com')
  })

  test('constructor respects explicit irisUrl over sandbox flag', () => {
    const client = new CircleClient({ irisUrl: 'https://custom.example.com/', sandbox: true })
    expect(client.irisUrl).toBe('https://custom.example.com')
  })

  describe('getAttestation', () => {
    const client = new CircleClient({ sandbox: true })

    test('returns complete attestation', async () => {
      mockOk(fixtureResponse)

      const result = await client.getAttestation('0xabc123')

      expect(result.status).toBe('complete')
      expect(result.attestation).toBeDefined()
      expect(result.messageHash).toBe('0xabc123')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://iris-api-sandbox.circle.com/attestations/0xabc123',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    test('returns pending for 404', async () => {
      mock404()

      const result = await client.getAttestation('0xabc123')

      expect(result.status).toBe('pending_confirmations')
      expect(result.attestation).toBeNull()
    })

    test('adds 0x prefix if missing', async () => {
      mockOk(fixtureResponse)

      const result = await client.getAttestation('abc123')

      expect(result.messageHash).toBe('0xabc123')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/attestations/0xabc123'),
        expect.anything(),
      )
    })

    test('throws on missing message hash', async () => {
      await expect(client.getAttestation('')).rejects.toThrow('message-hash is required')
    })

    test('throws on server error', async () => {
      mockError(500, 'Internal Server Error')

      try {
        await client.getAttestation('0xabc')
      } catch (e) {
        expect(e).toBeInstanceOf(CircleError)
        expect(e.code).toBe('IRIS_ERROR')
        expect(e.status).toBe(500)
      }
    })

    test('throws on invalid JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'not json',
      })

      try {
        await client.getAttestation('0xabc')
      } catch (e) {
        expect(e).toBeInstanceOf(CircleError)
        expect(e.code).toBe('PARSE_ERROR')
      }
    })
  })

  describe('getSupportedChains', () => {
    const client = new CircleClient()

    test('returns all chains', () => {
      const result = client.getSupportedChains()
      expect(result.count).toBeGreaterThan(0)
      expect(result.chains[0]).toHaveProperty('domain')
      expect(result.chains[0]).toHaveProperty('chainId')
      expect(result.chains[0]).toHaveProperty('usdc')
    })

    test('filters mainnet chains', () => {
      const result = client.getSupportedChains('mainnet')
      expect(result.chains.every((c) => c.network === 'mainnet')).toBe(true)
      expect(result.chains.length).toBeGreaterThan(0)
    })

    test('filters testnet chains', () => {
      const result = client.getSupportedChains('testnet')
      expect(result.chains.every((c) => c.network === 'testnet')).toBe(true)
      expect(result.chains.length).toBeGreaterThan(0)
    })

    test('testnet chains have contracts', () => {
      const result = client.getSupportedChains('testnet')
      const withContracts = result.chains.filter((c) => c.contracts)
      expect(withContracts.length).toBeGreaterThan(0)
      expect(withContracts[0].contracts.tokenMessenger).toMatch(/^0x/)
    })
  })

  describe('getDomainInfo', () => {
    const client = new CircleClient()

    test('returns ethereum domain info', () => {
      const result = client.getDomainInfo('ethereum')
      expect(result.name).toBe('ethereum')
      expect(result.domain).toBe(0)
      expect(result.chainId).toBe(1)
      expect(result.network).toBe('mainnet')
    })

    test('is case insensitive', () => {
      const result = client.getDomainInfo('ETHEREUM')
      expect(result.name).toBe('ethereum')
    })

    test('returns testnet with contracts', () => {
      const result = client.getDomainInfo('ethereum-sepolia')
      expect(result.network).toBe('testnet')
      expect(result.contracts).toBeDefined()
      expect(result.contracts.tokenMessenger).toMatch(/^0x/)
      expect(result.contracts.messageTransmitter).toMatch(/^0x/)
    })

    test('throws on unknown chain', () => {
      expect(() => client.getDomainInfo('solana')).toThrow('Unknown chain')
    })

    test('throws on missing chain', () => {
      expect(() => client.getDomainInfo('')).toThrow('chain is required')
    })
  })

  describe('waitForAttestation', () => {
    const client = new CircleClient({ sandbox: true })

    test('returns immediately when attestation is complete', async () => {
      mockOk(fixtureResponse)

      const result = await client.waitForAttestation('0xabc', {
        pollInterval: 0.01,
        maxAttempts: 3,
      })

      expect(result.status).toBe('complete')
      expect(result.attempts).toBe(1)
    })

    test('polls until complete', async () => {
      mock404()
      mock404()
      mockOk(fixtureResponse)

      const result = await client.waitForAttestation('0xabc', {
        pollInterval: 0.01,
        maxAttempts: 5,
      })

      expect(result.status).toBe('complete')
      expect(result.attempts).toBe(3)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    test('throws on timeout', async () => {
      mock404()
      mock404()

      try {
        await client.waitForAttestation('0xabc', { pollInterval: 0.01, maxAttempts: 2 })
        throw new Error('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(CircleError)
        expect(e.code).toBe('ATTESTATION_TIMEOUT')
      }
    })
  })
})
