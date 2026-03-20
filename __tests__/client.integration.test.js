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
