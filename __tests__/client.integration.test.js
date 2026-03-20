import { CircleClient } from '../src/circle.js'

// IRIS API is public — no auth needed. Skip with SKIP_LIVE_TESTS=1.
const SKIP = process.env.SKIP_LIVE_TESTS === '1'
const describeIf = (cond) => (cond ? describe : describe.skip)

describeIf(!SKIP)('Integration (IRIS API sandbox)', () => {
  const client = new CircleClient({ sandbox: true })

  test('get-attestation returns pending for unknown hash', async () => {
    const hash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    const result = await client.getAttestation(hash)
    expect(result.status).toBe('pending_confirmations')
    expect(result.attestation).toBeNull()
  })

  test('get-supported-chains returns chains', () => {
    const result = client.getSupportedChains()
    expect(result.count).toBeGreaterThan(0)
    expect(result.chains[0].usdc).toMatch(/^0x/)
  })

  test('get-domain-info returns ethereum details', () => {
    const result = client.getDomainInfo('ethereum')
    expect(result.domain).toBe(0)
    expect(result.chainId).toBe(1)
  })
})

// Platform API — requires CIRCLE_API_KEY env var
const API_KEY = process.env.CIRCLE_API_KEY

describeIf(API_KEY)('Integration (Platform API)', () => {
  const client = new CircleClient({ apiKey: API_KEY })

  test('list-wallets returns array', async () => {
    const result = await client.listWallets()
    expect(Array.isArray(result)).toBe(true)
  })

  test('screen-address approves known good address', async () => {
    // Vitalik's address — well known, not sanctioned
    const result = await client.screenAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', {
      chain: 'ETH-SEPOLIA',
    })
    expect(result.result).toBe('APPROVED')
    expect(result.address).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
  })
})
