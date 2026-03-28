/**
 * Unit tests for CCTP on-chain operations.
 *
 * These test the logic without hitting real chains.
 * Integration tests that hit testnets are in cctp-onchain.integration.test.js.
 */

import { jest } from '@jest/globals'

// Mock ethers before importing
const mockApprove = jest.fn()
const mockAllowance = jest.fn()
const mockBalanceOf = jest.fn()
const mockDecimals = jest.fn()
const mockDepositForBurn = jest.fn()
const mockReceiveMessage = jest.fn()
const mockParseLog = jest.fn()
const mockWait = jest.fn()

jest.unstable_mockModule('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn().mockImplementation(() => ({})),
    Wallet: jest.fn().mockImplementation((key, provider) => ({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      provider,
    })),
    Contract: jest.fn().mockImplementation((address, abi, signer) => {
      // Return different mocks based on the ABI content
      const abiStr = JSON.stringify(abi)
      if (abiStr.includes('approve')) {
        return {
          approve: mockApprove,
          allowance: mockAllowance,
          balanceOf: mockBalanceOf,
          decimals: mockDecimals,
        }
      }
      if (abiStr.includes('depositForBurn')) {
        return {
          depositForBurn: mockDepositForBurn,
          interface: { parseLog: mockParseLog },
        }
      }
      if (abiStr.includes('receiveMessage')) {
        return {
          receiveMessage: mockReceiveMessage,
          interface: { parseLog: mockParseLog },
        }
      }
      return {}
    }),
    parseUnits: jest.fn().mockReturnValue(10000000n), // 10 USDC in 6 decimals
    formatUnits: jest.fn().mockReturnValue('10.0'),
    keccak256: jest
      .fn()
      .mockReturnValue('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'),
    zeroPadValue: jest
      .fn()
      .mockReturnValue('0x0000000000000000000000001234567890abcdef1234567890abcdef12345678'),
  },
}))

const { approveBurn, burn, mint } = await import('../src/cctp-onchain.js')
const { DOMAINS, CONTRACTS } = await import('../src/circle.js')

describe('approveBurn', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDecimals.mockResolvedValue(6)
    mockBalanceOf.mockResolvedValue(100000000n) // 100 USDC
    mockAllowance.mockResolvedValue(0n)
    mockApprove.mockResolvedValue({
      wait: jest.fn().mockResolvedValue({ hash: '0xtxhash', blockNumber: 123 }),
    })
  })

  test('approves TokenMessenger to spend USDC', async () => {
    mockAllowance.mockResolvedValueOnce(0n).mockResolvedValueOnce(10000000n)

    const result = await approveBurn({
      chain: 'ethereum-sepolia',
      amount: '10',
      privateKey: '0x' + 'a'.repeat(64),
      domains: DOMAINS,
      contracts: CONTRACTS,
    })

    expect(result.skipped).toBe(false)
    expect(result.txHash).toBe('0xtxhash')
    expect(result.spender).toBe(CONTRACTS['ethereum-sepolia'].tokenMessenger)
  })

  test('skips approve if allowance is sufficient', async () => {
    mockAllowance.mockResolvedValue(20000000n) // 20 USDC already approved

    const result = await approveBurn({
      chain: 'ethereum-sepolia',
      amount: '10',
      privateKey: '0x' + 'a'.repeat(64),
      domains: DOMAINS,
      contracts: CONTRACTS,
    })

    expect(result.skipped).toBe(true)
    expect(result.txHash).toBeNull()
    expect(mockApprove).not.toHaveBeenCalled()
  })

  test('throws on insufficient balance', async () => {
    mockBalanceOf.mockResolvedValue(1000000n) // 1 USDC, need 10

    await expect(
      approveBurn({
        chain: 'ethereum-sepolia',
        amount: '10',
        privateKey: '0x' + 'a'.repeat(64),
        domains: DOMAINS,
        contracts: CONTRACTS,
      }),
    ).rejects.toThrow('Insufficient USDC balance')
  })

  test('throws on unknown chain', async () => {
    await expect(
      approveBurn({
        chain: 'fake-chain',
        amount: '10',
        privateKey: '0x' + 'a'.repeat(64),
        domains: DOMAINS,
        contracts: CONTRACTS,
      }),
    ).rejects.toThrow('Unknown chain')
  })

  test('throws on missing private key', async () => {
    await expect(
      approveBurn({
        chain: 'ethereum-sepolia',
        amount: '10',
        privateKey: '',
        domains: DOMAINS,
        contracts: CONTRACTS,
      }),
    ).rejects.toThrow('private-key is required')
  })
})

describe('burn', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDecimals.mockResolvedValue(6)

    // Mock depositForBurn returning a tx with receipt containing events
    const mockReceipt = {
      hash: '0xburnhash',
      blockNumber: 456,
      logs: [
        {
          topics: ['0xmessagesent'],
          data: '0xmessagedata',
        },
        {
          topics: ['0xdepositforburn'],
          data: '0xburndata',
        },
      ],
    }
    mockDepositForBurn.mockResolvedValue({
      wait: jest.fn().mockResolvedValue(mockReceipt),
    })

    // Mock event parsing
    mockParseLog
      .mockReturnValueOnce({ name: 'MessageSent', args: { message: '0xmessagebytes' } })
      .mockReturnValueOnce({ name: 'DepositForBurn', args: { nonce: 42n } })
  })

  test('burns USDC and returns message data', async () => {
    const result = await burn({
      chain: 'ethereum-sepolia',
      destinationChain: 'avalanche-fuji',
      recipient: '0x' + 'b'.repeat(40),
      amount: '10',
      privateKey: '0x' + 'a'.repeat(64),
      domains: DOMAINS,
      contracts: CONTRACTS,
    })

    expect(result.txHash).toBe('0xburnhash')
    expect(result.messageBytes).toBe('0xmessagebytes')
    expect(result.messageHash).toBeTruthy()
    expect(result.nonce).toBe('42')
    expect(result.source).toBe('ethereum-sepolia')
    expect(result.destination).toBe('avalanche-fuji')
  })

  test('throws on missing recipient', async () => {
    await expect(
      burn({
        chain: 'ethereum-sepolia',
        destinationChain: 'avalanche-fuji',
        recipient: '',
        amount: '10',
        privateKey: '0x' + 'a'.repeat(64),
        domains: DOMAINS,
        contracts: CONTRACTS,
      }),
    ).rejects.toThrow('recipient address is required')
  })
})

describe('mint', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReceiveMessage.mockResolvedValue({
      wait: jest.fn().mockResolvedValue({
        hash: '0xminthash',
        blockNumber: 789,
        status: 1,
      }),
    })
  })

  test('mints USDC on destination chain', async () => {
    const result = await mint({
      chain: 'avalanche-fuji',
      messageBytes: '0xmessagebytes',
      attestation: '0xattestationbytes',
      privateKey: '0x' + 'a'.repeat(64),
      contracts: CONTRACTS,
    })

    expect(result.txHash).toBe('0xminthash')
    expect(result.chain).toBe('avalanche-fuji')
    expect(result.success).toBe(true)
  })

  test('throws on missing message-bytes', async () => {
    await expect(
      mint({
        chain: 'avalanche-fuji',
        messageBytes: '',
        attestation: '0xattestation',
        privateKey: '0x' + 'a'.repeat(64),
        contracts: CONTRACTS,
      }),
    ).rejects.toThrow('message-bytes is required')
  })

  test('throws on missing attestation', async () => {
    await expect(
      mint({
        chain: 'avalanche-fuji',
        messageBytes: '0xmessage',
        attestation: '',
        privateKey: '0x' + 'a'.repeat(64),
        contracts: CONTRACTS,
      }),
    ).rejects.toThrow('attestation is required')
  })
})
