/**
 * Circle API client.
 *
 * Two API surfaces:
 *
 *   IRIS API (CCTP attestation, public):
 *     - No auth required
 *     - Attestation lookups by message hash
 *     - Used for cross-chain USDC transfers
 *
 *   Circle Platform API (wallets, compliance, transactions):
 *     - Requires Bearer token (api-key)
 *     - Key format: ENV:ID:SECRET (e.g. TEST_API_KEY:abc123:def456)
 *     - Developer console: https://console.circle.com
 */

const DEFAULT_API_URL = 'https://api.circle.com'
const DEFAULT_IRIS_URL = 'https://iris-api.circle.com'
const DEFAULT_IRIS_SANDBOX_URL = 'https://iris-api-sandbox.circle.com'

// CCTP domain numbers — Circle's chain identifiers for cross-chain messaging.
// Source: https://github.com/circlefin/cctp-sample-app
const DOMAINS = {
  // Mainnet
  ethereum: {
    domain: 0,
    chainId: 1,
    network: 'mainnet',
    usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  },
  avalanche: {
    domain: 1,
    chainId: 43114,
    network: 'mainnet',
    usdc: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
  },
  optimism: {
    domain: 2,
    chainId: 10,
    network: 'mainnet',
    usdc: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
  },
  arbitrum: {
    domain: 3,
    chainId: 42161,
    network: 'mainnet',
    usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  },
  base: {
    domain: 6,
    chainId: 8453,
    network: 'mainnet',
    usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  },
  polygon: {
    domain: 7,
    chainId: 137,
    network: 'mainnet',
    usdc: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  },

  // Solana
  solana: {
    domain: 5,
    network: 'mainnet',
    type: 'solana',
    usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  'solana-devnet': {
    domain: 5,
    network: 'testnet',
    type: 'solana',
    usdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  },

  // Testnet (Sepolia / Fuji)
  'ethereum-sepolia': {
    domain: 0,
    chainId: 11155111,
    network: 'testnet',
    usdc: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
  },
  'avalanche-fuji': {
    domain: 1,
    chainId: 43113,
    network: 'testnet',
    usdc: '0x5425890298aed601595a70ab815c96711a31bc65',
  },
  'arbitrum-sepolia': {
    domain: 3,
    chainId: 421614,
    network: 'testnet',
    usdc: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d',
  },
}

// CCTP V2 contract addresses per chain.
// EVM mainnet uses CREATE2 — same addresses across all chains.
const CONTRACTS = {
  // EVM mainnet (CREATE2 — identical addresses)
  ethereum: {
    tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  },
  avalanche: {
    tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  },
  optimism: {
    tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  },
  arbitrum: {
    tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  },
  base: {
    tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  },
  polygon: {
    tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  },
  // EVM testnet
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
  // Solana CCTP V2 (same addresses on mainnet and devnet)
  solana: {
    tokenMessenger: 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
    messageTransmitter: 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
  },
  'solana-devnet': {
    tokenMessenger: 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
    messageTransmitter: 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
  },
}

// Exported for use by cctp-onchain.js
export { DOMAINS, CONTRACTS }

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
  constructor({ apiKey, apiUrl, entitySecret, irisUrl, sandbox = false, timeout = 30 } = {}) {
    this.apiKey = apiKey || null
    this.entitySecret = entitySecret || null
    this.cachedPublicKey = null
    this.apiUrl = apiUrl ? apiUrl.replace(/\/+$/, '') : DEFAULT_API_URL
    this.irisUrl = irisUrl
      ? irisUrl.replace(/\/+$/, '')
      : sandbox
        ? DEFAULT_IRIS_SANDBOX_URL
        : DEFAULT_IRIS_URL
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

    const data = await this.irisRequest('GET', `/attestations/${encodeURIComponent(normalized)}`)

    return {
      messageHash: normalized,
      status: data.status ?? 'pending_confirmations',
      attestation: data.attestation ?? null,
    }
  }

  /**
   * Get CCTP V2 attestation by transaction hash and source domain.
   *
   * V2 uses `/v2/messages/{sourceDomain}?transactionHash={txHash}` instead
   * of the V1 message-hash endpoint. Returns instantly when fee is sufficient.
   *
   * @param {string} txHash - Source chain transaction hash
   * @param {number} sourceDomain - CCTP source domain number
   * @returns {{ status: string, attestation: string|null, message: string|null }}
   */
  async getAttestationV2(txHash, sourceDomain) {
    if (!txHash) throw new CircleError('tx-hash is required', { code: 'MISSING_TX_HASH' })

    const data = await this.irisRequest(
      'GET',
      `/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(txHash)}`,
    )

    const msg = data.messages?.[0]
    if (!msg) {
      return { status: 'not_found', attestation: null, message: null, txHash }
    }

    return {
      txHash,
      sourceDomain,
      status: msg.status === 'complete' ? 'complete' : 'pending_confirmations',
      attestation: msg.attestation !== 'PENDING' ? msg.attestation : null,
      message: msg.message ?? null,
      delayReason: msg.delayReason ?? null,
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
      network: info.network,
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
      network: info.network,
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

  /**
   * Poll V2 attestation until complete or timeout.
   *
   * @param {string} txHash - Source chain transaction hash
   * @param {number} sourceDomain - CCTP source domain number
   * @param {object} [options]
   * @param {number} [options.pollInterval=5] - Seconds between polls
   * @param {number} [options.maxAttempts=60] - Maximum poll attempts
   * @returns {{ status, attestation, message, attempts }}
   */
  async waitForAttestationV2(txHash, sourceDomain, { pollInterval = 5, maxAttempts = 60 } = {}) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.getAttestationV2(txHash, sourceDomain)

      if (result.status === 'complete') {
        return { ...result, attempts: attempt }
      }

      if (result.delayReason === 'insufficient_fee') {
        throw new CircleError(
          `CCTP V2 requires maxFee > 0. Set a fee in depositForBurn. Delay reason: ${result.delayReason}`,
          { code: 'INSUFFICIENT_FEE' },
        )
      }

      if (attempt < maxAttempts) {
        await this.sleep(pollInterval * 1000)
      }
    }

    throw new CircleError(
      `V2 attestation not ready after ${maxAttempts} attempts`,
      { code: 'ATTESTATION_TIMEOUT' },
    )
  }

  // ---------------------------------------------------------------------------
  // Platform API: Wallets
  // ---------------------------------------------------------------------------

  requireApiKey() {
    if (!this.apiKey) {
      throw new CircleError('api-key is required for Platform API commands', {
        code: 'MISSING_API_KEY',
      })
    }
  }

  /**
   * Get the entity secret ciphertext for write operations.
   *
   * Circle requires an entitySecretCiphertext for wallet creation,
   * transfers, and signing. The entity secret (32-byte hex) is encrypted
   * with Circle's RSA public key.
   *
   * @returns {Promise<string>} Base64-encoded RSA-OAEP ciphertext
   */
  async getEntitySecretCiphertext() {
    if (!this.entitySecret) {
      throw new CircleError(
        'entity-secret is required for write operations (wallet creation, transfers)',
        { code: 'MISSING_ENTITY_SECRET' },
      )
    }

    if (!/^[0-9a-f]{64}$/i.test(this.entitySecret)) {
      throw new CircleError('entity-secret must be a 32-byte hex string (64 characters)', {
        code: 'INVALID_ENTITY_SECRET',
      })
    }

    // Fetch and cache Circle's RSA public key
    if (!this.cachedPublicKey) {
      const keyData = await this.platformRequest('GET', '/v1/w3s/config/entity/publicKey')
      const pem = keyData.data?.publicKey
      if (!pem) {
        throw new CircleError('Failed to fetch Circle public key', { code: 'PUBLIC_KEY_ERROR' })
      }

      const pemBody = pem
        .replace('-----BEGIN PUBLIC KEY-----', '')
        .replace('-----END PUBLIC KEY-----', '')
        .replace(/\s/g, '')
      const binaryDer = Buffer.from(pemBody, 'base64')
      this.cachedPublicKey = await crypto.subtle.importKey(
        'spki',
        binaryDer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt'],
      )
    }

    // Encrypt the entity secret
    const secretBytes = Buffer.from(this.entitySecret, 'hex')
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      this.cachedPublicKey,
      secretBytes,
    )

    return Buffer.from(encrypted).toString('base64')
  }

  /**
   * Register an entity secret with Circle (one-time setup).
   *
   * Must be called before wallet creation or transaction signing.
   * Returns a recovery file that should be saved securely.
   *
   * @returns {{ recoveryFile: string }}
   */
  async registerEntitySecret() {
    this.requireApiKey()
    const ciphertext = await this.getEntitySecretCiphertext()
    const data = await this.platformRequest('POST', '/v1/w3s/config/entity/entitySecret', {
      entitySecretCiphertext: ciphertext,
    })
    return data.data || data
  }

  /**
   * Create a wallet set to group related wallets.
   *
   * @param {object} options
   * @param {string} options.name - Wallet set name
   * @returns {object} Created wallet set
   */
  async createWalletSet({ name }) {
    this.requireApiKey()
    if (!name) throw new CircleError('name is required', { code: 'MISSING_NAME' })

    const body = { idempotencyKey: crypto.randomUUID(), name }
    if (this.entitySecret) {
      body.entitySecretCiphertext = await this.getEntitySecretCiphertext()
    }
    const data = await this.platformRequest('POST', '/v1/w3s/developer/walletSets', body)
    return data.data?.walletSet || data
  }

  /**
   * Create a developer-controlled wallet.
   *
   * @param {object} options
   * @param {string} options.walletSetId - ID of the wallet set
   * @param {string[]} options.blockchains - Blockchains to enable (e.g. ["ETH-SEPOLIA"])
   * @param {number} [options.count=1] - Number of wallets to create
   * @returns {object} Created wallet(s)
   */
  async createWallet({ walletSetId, blockchains, count = 1 }) {
    this.requireApiKey()
    if (!walletSetId)
      throw new CircleError('wallet-set-id is required', { code: 'MISSING_WALLET_SET_ID' })
    if (!blockchains?.length)
      throw new CircleError('blockchains is required', { code: 'MISSING_BLOCKCHAINS' })

    const body = { idempotencyKey: crypto.randomUUID(), walletSetId, blockchains, count }
    if (this.entitySecret) {
      body.entitySecretCiphertext = await this.getEntitySecretCiphertext()
    }
    const data = await this.platformRequest('POST', '/v1/w3s/developer/wallets', body)
    return data.data?.wallets || data
  }

  /**
   * Get wallet details by ID.
   *
   * @param {string} walletId - Wallet UUID
   * @returns {object} Wallet details
   */
  async getWallet(walletId) {
    this.requireApiKey()
    if (!walletId) throw new CircleError('wallet-id is required', { code: 'MISSING_WALLET_ID' })

    const data = await this.platformRequest(
      'GET',
      `/v1/w3s/wallets/${encodeURIComponent(walletId)}`,
    )
    return data.data?.wallet || data
  }

  /**
   * List wallets with optional filters.
   *
   * @param {object} [options]
   * @param {string} [options.walletSetId] - Filter by wallet set
   * @param {string} [options.blockchain] - Filter by blockchain
   * @param {number} [options.pageSize=10] - Results per page
   * @returns {object} Wallet list
   */
  async listWallets({ walletSetId, blockchain, pageSize = 10 } = {}) {
    this.requireApiKey()

    const params = new URLSearchParams()
    if (walletSetId) params.set('walletSetId', walletSetId)
    if (blockchain) params.set('blockchain', blockchain)
    params.set('pageSize', String(pageSize))

    const qs = params.toString()
    const data = await this.platformRequest('GET', `/v1/w3s/wallets?${qs}`)
    return data.data?.wallets || data
  }

  /**
   * Get token balances for a wallet.
   *
   * @param {string} walletId - Wallet UUID
   * @returns {object} Token balances
   */
  async getBalance(walletId) {
    this.requireApiKey()
    if (!walletId) throw new CircleError('wallet-id is required', { code: 'MISSING_WALLET_ID' })

    const data = await this.platformRequest(
      'GET',
      `/v1/w3s/wallets/${encodeURIComponent(walletId)}/balances`,
    )
    return data.data?.tokenBalances || data
  }

  // ---------------------------------------------------------------------------
  // Platform API: Transactions
  // ---------------------------------------------------------------------------

  /**
   * Transfer tokens between wallets or to an external address.
   *
   * @param {object} options
   * @param {string} options.walletId - Source wallet ID
   * @param {string} options.destinationAddress - Recipient address
   * @param {string} options.tokenId - Token UUID (from Circle token registry)
   * @param {string} options.amount - Amount as string (e.g. "1.50")
   * @param {string} [options.blockchain] - Blockchain (e.g. "ETH-SEPOLIA")
   * @returns {object} Transaction details
   */
  async transfer({ walletId, destinationAddress, tokenId, amount, blockchain }) {
    this.requireApiKey()
    if (!walletId) throw new CircleError('wallet-id is required', { code: 'MISSING_WALLET_ID' })
    if (!destinationAddress)
      throw new CircleError('destination-address is required', { code: 'MISSING_DESTINATION' })
    if (!amount) throw new CircleError('amount is required', { code: 'MISSING_AMOUNT' })

    const body = {
      idempotencyKey: crypto.randomUUID(),
      walletId,
      destinationAddress,
      amounts: [amount],
      feeLevel: 'MEDIUM',
    }
    if (this.entitySecret) {
      body.entitySecretCiphertext = await this.getEntitySecretCiphertext()
    }

    if (tokenId) body.tokenId = tokenId
    if (blockchain) body.blockchain = blockchain

    const data = await this.platformRequest('POST', '/v1/w3s/developer/transactions/transfer', body)
    return data.data || data
  }

  /**
   * Get transaction status by ID.
   *
   * @param {string} transactionId - Transaction UUID
   * @returns {object} Transaction details with status
   */
  async getTransaction(transactionId) {
    this.requireApiKey()
    if (!transactionId)
      throw new CircleError('transaction-id is required', { code: 'MISSING_TRANSACTION_ID' })

    const data = await this.platformRequest(
      'GET',
      `/v1/w3s/transactions/${encodeURIComponent(transactionId)}`,
    )
    return data.data?.transaction || data
  }

  /**
   * Estimate transfer fee before executing.
   *
   * @param {object} options
   * @param {string} options.walletId - Source wallet ID
   * @param {string} options.destinationAddress - Recipient address
   * @param {string} options.tokenId - Token UUID
   * @param {string} options.amount - Transfer amount
   * @returns {object} Fee estimate with low/medium/high tiers
   */
  async estimateFee({ walletId, destinationAddress, tokenId, amount }) {
    this.requireApiKey()
    if (!walletId) throw new CircleError('wallet-id is required', { code: 'MISSING_WALLET_ID' })

    const data = await this.platformRequest('POST', '/v1/w3s/transactions/transfer/estimateFee', {
      walletId,
      destinationAddress,
      tokenId,
      amounts: [amount],
    })
    return data.data || data
  }

  // ---------------------------------------------------------------------------
  // Platform API: Compliance
  // ---------------------------------------------------------------------------

  /**
   * Screen an address for compliance (KYC/AML).
   *
   * @param {string} address - Blockchain address to screen
   * @returns {object} Screening result with risk indicators
   */
  async screenAddress(address, { chain } = {}) {
    this.requireApiKey()
    if (!address) throw new CircleError('address is required', { code: 'MISSING_ADDRESS' })
    if (!chain)
      throw new CircleError('blockchain is required for compliance screening', {
        code: 'MISSING_CHAIN',
      })

    const data = await this.platformRequest('POST', '/v1/w3s/compliance/screening/addresses', {
      idempotencyKey: crypto.randomUUID(),
      address,
      chain,
    })
    return data.data || data
  }

  // ---------------------------------------------------------------------------
  // Platform API HTTP
  // ---------------------------------------------------------------------------

  async platformRequest(method, path, body) {
    const url = `${this.apiUrl}${path}`
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    }

    const options = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeout),
    }

    if (body && method !== 'GET') {
      headers['Content-Type'] = 'application/json'
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)
    const text = await response.text()

    if (!response.ok) {
      let errorMessage = `Circle API error: ${response.status}`
      let errorCode = 'API_ERROR'
      try {
        const err = JSON.parse(text)
        if (err.message) errorMessage = err.message
        if (err.code) errorCode = String(err.code)
      } catch {
        // use default message
      }
      throw new CircleError(errorMessage, {
        status: response.status,
        body: text,
        code: errorCode,
      })
    }

    if (!text || !text.trim()) return {}

    try {
      return JSON.parse(text)
    } catch {
      throw new CircleError('Invalid JSON from Circle API', {
        status: response.status,
        body: text,
        code: 'PARSE_ERROR',
      })
    }
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
