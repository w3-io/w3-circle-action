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

  // -- Platform API: Wallets --------------------------------------------------

  test('create-wallet-set calls platform API', async () => {
    mockCore.setInputs({
      command: 'create-wallet-set',
      'api-key': 'TEST:id:secret',
      name: 'test-set',
    })
    mockOk({ data: { walletSet: { id: 'ws-123', name: 'test-set' } } })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.id).toBe('ws-123')
    expect(mockCore.getErrors()).toHaveLength(0)

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/w3s/developer/walletSets')
    expect(opts.headers.Authorization).toBe('Bearer TEST:id:secret')
  })

  test('create-wallet calls platform API with blockchains', async () => {
    mockCore.setInputs({
      command: 'create-wallet',
      'api-key': 'TEST:id:secret',
      'wallet-set-id': 'ws-123',
      blockchains: 'ETH-SEPOLIA, AVAX-FUJI',
    })
    mockOk({
      data: {
        wallets: [{ id: 'w-1', address: '0xabc', blockchain: 'ETH-SEPOLIA' }],
      },
    })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result).toHaveLength(1)
    expect(result[0].blockchain).toBe('ETH-SEPOLIA')
    expect(mockCore.getErrors()).toHaveLength(0)

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.blockchains).toEqual(['ETH-SEPOLIA', 'AVAX-FUJI'])
  })

  test('get-wallet returns wallet details', async () => {
    mockCore.setInputs({
      command: 'get-wallet',
      'api-key': 'TEST:id:secret',
      'wallet-id': 'w-123',
    })
    mockOk({ data: { wallet: { id: 'w-123', address: '0xabc', state: 'LIVE' } } })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.id).toBe('w-123')
    expect(result.state).toBe('LIVE')
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  test('list-wallets returns array', async () => {
    mockCore.setInputs({
      command: 'list-wallets',
      'api-key': 'TEST:id:secret',
    })
    mockOk({ data: { wallets: [{ id: 'w-1' }, { id: 'w-2' }] } })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result).toHaveLength(2)
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  test('get-balance returns token balances', async () => {
    mockCore.setInputs({
      command: 'get-balance',
      'api-key': 'TEST:id:secret',
      'wallet-id': 'w-123',
    })
    mockOk({
      data: {
        tokenBalances: [{ token: { symbol: 'USDC' }, amount: '10.00' }],
      },
    })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result[0].token.symbol).toBe('USDC')
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  // -- Platform API: Transactions ---------------------------------------------

  test('transfer calls platform API', async () => {
    mockCore.setInputs({
      command: 'transfer',
      'api-key': 'TEST:id:secret',
      'wallet-id': 'w-123',
      'destination-address': '0xdef',
      amount: '5.00',
    })
    mockOk({ data: { id: 'tx-1', state: 'INITIATED' } })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.id).toBe('tx-1')
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  test('get-transaction returns status', async () => {
    mockCore.setInputs({
      command: 'get-transaction',
      'api-key': 'TEST:id:secret',
      'transaction-id': 'tx-123',
    })
    mockOk({ data: { transaction: { id: 'tx-123', state: 'CONFIRMED' } } })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.state).toBe('CONFIRMED')
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  test('estimate-fee returns fee tiers', async () => {
    mockCore.setInputs({
      command: 'estimate-fee',
      'api-key': 'TEST:id:secret',
      'wallet-id': 'w-123',
      'destination-address': '0xdef',
      'token-id': 'tok-1',
      amount: '1.00',
    })
    mockOk({ data: { low: '0.001', medium: '0.002', high: '0.003' } })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.medium).toBe('0.002')
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  // -- Platform API: Compliance -----------------------------------------------

  test('screen-address calls compliance API', async () => {
    mockCore.setInputs({
      command: 'screen-address',
      'api-key': 'TEST:id:secret',
      address: '0xabc123',
    })
    mockOk({ data: { result: 'PASS', riskScore: 0 } })

    await run()

    const result = JSON.parse(mockCore.getOutputs().result)
    expect(result.result).toBe('PASS')
    expect(mockCore.getErrors()).toHaveLength(0)
  })

  // -- Platform API: Auth errors ----------------------------------------------

  test('platform command without api-key fails', async () => {
    mockCore.setInputs({
      command: 'create-wallet-set',
      name: 'test',
    })

    await run()

    const errors = mockCore.getErrors()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('MISSING_API_KEY')
  })

  test('platform API 401 reports auth error', async () => {
    mockCore.setInputs({
      command: 'list-wallets',
      'api-key': 'bad-key',
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ code: 401, message: 'Invalid credentials' }),
    })

    await run()

    const errors = mockCore.getErrors()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Invalid credentials')
  })
})
