/**
 * Circle CCTP API client.
 *
 * Two API surfaces:
 *
 *   IRIS API (CCTP attestation, public):
 *     - No auth required
 *     - Attestation lookups by message hash
 *     - Used for cross-chain USDC transfers
 *
 *   Circle Platform API (wallets, compliance, paymaster):
 *     - Requires Bearer token (api-key)
 *     - Developer console: https://console.circle.com
 *
 * Phase 1 implements the IRIS API only. Platform API commands will be
 * added in a later phase.
 */

const DEFAULT_IRIS_URL = 'https://iris-api.circle.com'
const DEFAULT_IRIS_SANDBOX_URL = 'https://iris-api-sandbox.circle.com'

// CCTP domain numbers — Circle's chain identifiers for cross-chain messaging.
// Source: https://github.com/circlefin/cctp-sample-app
const DOMAINS = {
  // Mainnet
  ethereum: { domain: 0, chainId: 1, usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
  avalanche: { domain: 1, chainId: 43114, usdc: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e' },
  optimism: { domain: 2, chainId: 10, usdc: '0x0b2c639c533813f4aa9d7837caf62653d097ff85' },
  arbitrum: { domain: 3, chainId: 42161, usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
  base: { domain: 6, chainId: 8453, usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' },
  polygon: { domain: 7, chainId: 137, usdc: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' },

  // Testnet (Sepolia / Fuji)
  'ethereum-sepolia': {
    domain: 0,
    chainId: 11155111,
    usdc: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
  },
  'avalanche-fuji': {
    domain: 1,
    chainId: 43113,
    usdc: '0x5425890298aed601595a70ab815c96711a31bc65',
  },
  'arbitrum-sepolia': {
    domain: 3,
    chainId: 421614,
    usdc: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d',
  },
}

// CCTP contract addresses per chain (testnet).
// Mainnet addresses follow the same pattern but differ per deployment.
const CONTRACTS = {
  'ethereum-sepolia': {
    tokenMessenger: '0x9f3b8679c73c2fef8b59b4f3444d4e156fb70aa5',
    messageTransmitter: '0x7865fafc2db2093669d92c0f33aeef291086befd',
  },
  'avalanche-fuji': {
    tokenMessenger: '0xeb08f243e5d3fcff26a9e38ae5520a669f4019d0',
    messageTransmitter: '0xa9fb1b3009dcb79e2fe346c16a604b8fa8ae0a79',
  },
  'arbitrum-sepolia': {
    tokenMessenger: '0x9f3b8679c73c2fef8b59b4f3444d4e156fb70aa5',
    messageTransmitter: '0xacf1ceef35caac005e15888ddb8a3515c41b4872',
  },
}

export class CircleError extends Error {
  constructor(message, { status, body, code } = {}) {
    super(message)
    this.name = 'CircleError'
    this.status = status
    this.body = body
    this.code = code
  }
}

export class CircleClient {
  constructor({
    apiKey,
    irisUrl,
    sandbox = false,
    maxRetries = 3,
    retryDelay = 2,
    timeout = 30,
  } = {}) {
    this.apiKey = apiKey || null
    this.irisUrl = irisUrl
      ? irisUrl.replace(/\/+$/, '')
      : sandbox
        ? DEFAULT_IRIS_SANDBOX_URL
        : DEFAULT_IRIS_URL
    this.maxRetries = maxRetries
    this.retryDelay = retryDelay
    this.timeout = timeout * 1000
  }

  // ---------------------------------------------------------------------------
  // CCTP commands
  // ---------------------------------------------------------------------------

  /**
   * Get attestation for a CCTP message by its hash.
   *
   * The message hash is the keccak256 of the message bytes emitted by
   * MessageSent event on the source chain. Poll this endpoint after
   * calling depositForBurn — attestation becomes available once Circle's
   * attestation service has observed and signed the message.
   *
   * @param {string} messageHash - 0x-prefixed keccak256 hash of the message
   * @returns {{ status: string, attestation: string|null }}
   */
  async getAttestation(messageHash) {
    if (!messageHash) {
      throw new CircleError('message-hash is required', { code: 'MISSING_MESSAGE_HASH' })
    }

    const normalized = messageHash.startsWith('0x') ? messageHash : `0x${messageHash}`

    const data = await this.irisRequest('GET', `/attestations/${normalized}`)

    return {
      messageHash: normalized,
      status: data.status || 'pending_confirmations',
      attestation: data.attestation || null,
    }
  }

  /**
   * List supported CCTP chains with domain numbers, chain IDs, and USDC addresses.
   *
   * @param {string} [network] - "mainnet" or "testnet" (default: both)
   * @returns {{ chains: object[], count: number }}
   */
  getSupportedChains(network) {
    const entries = Object.entries(DOMAINS).map(([name, info]) => ({
      name,
      domain: info.domain,
      chainId: info.chainId,
      usdc: info.usdc,
      network: name.includes('-') ? 'testnet' : 'mainnet',
      contracts: CONTRACTS[name] || null,
    }))

    const filtered = network ? entries.filter((c) => c.network === network) : entries

    return { chains: filtered, count: filtered.length }
  }

  /**
   * Get domain info for a specific chain.
   *
   * @param {string} chain - Chain name (e.g. "ethereum", "arbitrum-sepolia")
   * @returns {object} Chain info with domain, chainId, USDC address, contracts
   */
  getDomainInfo(chain) {
    if (!chain) {
      throw new CircleError('chain is required', { code: 'MISSING_CHAIN' })
    }

    const normalized = chain.toLowerCase().trim()
    const info = DOMAINS[normalized]

    if (!info) {
      const available = Object.keys(DOMAINS).join(', ')
      throw new CircleError(`Unknown chain: "${chain}". Available: ${available}`, {
        code: 'UNKNOWN_CHAIN',
      })
    }

    return {
      name: normalized,
      domain: info.domain,
      chainId: info.chainId,
      usdc: info.usdc,
      network: normalized.includes('-') ? 'testnet' : 'mainnet',
      contracts: CONTRACTS[normalized] || null,
    }
  }

  /**
   * Poll attestation status until complete or timeout.
   *
   * Useful in workflows that need to wait for attestation before
   * calling receiveMessage on the destination chain.
   *
   * @param {string} messageHash - 0x-prefixed message hash
   * @param {object} [options]
   * @param {number} [options.pollInterval=5] - Seconds between polls
   * @param {number} [options.maxAttempts=60] - Maximum poll attempts
   * @returns {{ status: string, attestation: string|null, attempts: number }}
   */
  async waitForAttestation(messageHash, { pollInterval = 5, maxAttempts = 60 } = {}) {
    if (!messageHash) {
      throw new CircleError('message-hash is required', { code: 'MISSING_MESSAGE_HASH' })
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.getAttestation(messageHash)

      if (result.status === 'complete') {
        return { ...result, attempts: attempt }
      }

      if (attempt < maxAttempts) {
        await this.sleep(pollInterval * 1000)
      }
    }

    throw new CircleError(
      `Attestation not ready after ${maxAttempts} attempts (${maxAttempts * pollInterval}s)`,
      { code: 'ATTESTATION_TIMEOUT' },
    )
  }

  // ---------------------------------------------------------------------------
  // IRIS API HTTP
  // ---------------------------------------------------------------------------

  async irisRequest(method, path) {
    const url = `${this.irisUrl}${path}`
    const response = await fetch(url, {
      method,
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeout),
    })

    const text = await response.text()

    // IRIS returns 404 for not-yet-attested messages — treat as pending
    if (response.status === 404) {
      return { status: 'pending_confirmations', attestation: null }
    }

    if (!response.ok) {
      throw new CircleError(`IRIS API error: ${response.status}`, {
        status: response.status,
        body: text,
        code: 'IRIS_ERROR',
      })
    }

    try {
      return JSON.parse(text)
    } catch {
      throw new CircleError('Invalid JSON from IRIS API', {
        status: response.status,
        body: text,
        code: 'PARSE_ERROR',
      })
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
