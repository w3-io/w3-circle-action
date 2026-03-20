import { jest } from '@jest/globals'
import { readFileSync } from 'fs'

const fixtureResponse = JSON.parse(
  readFileSync(new URL('../__fixtures__/api-response.json', import.meta.url)),
)

const mockFetch = jest.fn()
global.fetch = mockFetch

const mockCore = await import('../__fixtures__/core.js')
jest.unstable_mockModule('@actions/core', () => mockCore)

const { run } = await import('../src/main.js')

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

describe('run', () => {
  beforeEach(() => {
    mockCore.reset()
    mockFetch.mockReset()
  })

  // -- get-attestation --------------------------------------------------------

  test('get-attestation returns complete attestation', async () => {
    mockCore.setInputs({
      command: 'get-attestation',
      'message-hash': '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    })
    mockOk(fixtureResponse)

    await run()

    const outputs = mockCore.getOutputs()
    expect(outputs.result).toBeDefined()
    const result = JSON.parse(outputs.result)
    expect(result.status).toBe('complete')
    expect(result.attestation).toBeDefined()
    expect(result.messageHash).toMatch(/^0x/)
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  test('get-attestation returns pending for 404', async () => {
    mockCore.setInputs({
      command: 'get-attestation',
      'message-hash': '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    })
    mock404()

    await run()

    const outputs = mockCore.getOutputs()
    const result = JSON.parse(outputs.result)
    expect(result.status).toBe('pending_confirmations')
    expect(result.attestation).toBeNull()
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  test('get-attestation adds 0x prefix if missing', async () => {
    mockCore.setInputs({
      command: 'get-attestation',
      'message-hash': 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    })
    mockOk(fixtureResponse)

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.messageHash).toBe(
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    )
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  test('get-attestation fails without message-hash', async () => {
    mockCore.setInputs({ command: 'get-attestation' })

    await run()

    expect(mockCore.getErrors()).toHaveLength(1)
  })

  // -- get-supported-chains ---------------------------------------------------

  test('get-supported-chains returns all chains', async () => {
    mockCore.setInputs({ command: 'get-supported-chains' })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.chains).toBeDefined()
    expect(result.count).toBeGreaterThan(0)
    expect(result.chains[0]).toHaveProperty('domain')
    expect(result.chains[0]).toHaveProperty('chainId')
    expect(result.chains[0]).toHaveProperty('usdc')
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  test('get-supported-chains filters by network', async () => {
    mockCore.setInputs({
      command: 'get-supported-chains',
      network: 'testnet',
    })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.chains.every((c) => c.network === 'testnet')).toBe(true)
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  // -- get-domain-info --------------------------------------------------------

  test('get-domain-info returns chain details', async () => {
    mockCore.setInputs({
      command: 'get-domain-info',
      chain: 'ethereum',
    })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.name).toBe('ethereum')
    expect(result.domain).toBe(0)
    expect(result.chainId).toBe(1)
    expect(result.usdc).toMatch(/^0x/)
    expect(result.network).toBe('mainnet')
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  test('get-domain-info returns testnet chain with contracts', async () => {
    mockCore.setInputs({
      command: 'get-domain-info',
      chain: 'ethereum-sepolia',
    })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.domain).toBe(0)
    expect(result.network).toBe('testnet')
    expect(result.contracts).toBeDefined()
    expect(result.contracts.tokenMessenger).toMatch(/^0x/)
    expect(result.contracts.messageTransmitter).toMatch(/^0x/)
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  test('get-domain-info fails for unknown chain', async () => {
    mockCore.setInputs({
      command: 'get-domain-info',
      chain: 'solana',
    })

    await run()

    const errors = mockCore.getErrors()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('UNKNOWN_CHAIN')
  })

  test('get-domain-info fails without chain input', async () => {
    mockCore.setInputs({ command: 'get-domain-info' })

    await run()

    expect(mockCore.getErrors()).toHaveLength(1)
  })

  // -- General ----------------------------------------------------------------

  test('unknown command fails with available commands listed', async () => {
    mockCore.setInputs({ command: 'nonexistent' })

    await run()

    const errors = mockCore.getErrors()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Unknown command')
    expect(errors[0]).toContain('nonexistent')
    expect(errors[0]).toContain('get-attestation')
  })

  test('IRIS API error is reported as failure', async () => {
    mockCore.setInputs({
      command: 'get-attestation',
      'message-hash': '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    await run()

    const errors = mockCore.getErrors()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('IRIS_ERROR')
  })

  test('sandbox flag uses sandbox URL', async () => {
    mockCore.setInputs({
      command: 'get-attestation',
      'message-hash': '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      sandbox: 'true',
    })
    mockOk(fixtureResponse)

    await run()

    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('iris-api-sandbox.circle.com')
    expect(mockCore.getErrors()).toHaveLength(0)
  })
})
