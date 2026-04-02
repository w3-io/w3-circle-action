export const id = 272;
export const ids = [272];
export const modules = {

/***/ 5272:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  run: () => (/* binding */ run)
});

// EXTERNAL MODULE: ./node_modules/@actions/core/lib/core.js
var lib_core = __webpack_require__(7484);
;// CONCATENATED MODULE: ./src/circle.js
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


class CircleError extends Error {
  constructor(message, { status, body, code } = {}) {
    super(message)
    this.name = 'CircleError'
    this.status = status
    this.body = body
    this.code = code
  }
}

class CircleClient {
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

// EXTERNAL MODULE: external "node:http"
var external_node_http_ = __webpack_require__(7067);
;// CONCATENATED MODULE: ./lib/bridge.js
/**
 * @w3-io/bridge — W3 syscall bridge SDK.
 *
 * Provides chain operations (Ethereum, Bitcoin, Solana) and crypto
 * primitives to Docker-based actions via the W3 bridge socket.
 *
 * The bridge socket is mounted into every container at the path
 * specified by the W3_BRIDGE_SOCKET environment variable (or
 * available via TCP at W3_BRIDGE_URL for macOS dev).
 *
 * Zero dependencies — uses Node.js built-in http module.
 *
 * @example
 * ```js
 * import { bridge } from '@w3-io/bridge'
 *
 * const { result } = await bridge.ethereum.readContract({
 *   network: 'base',
 *   contract: '0xd1b1...',
 *   method: 'function balanceOf(address) returns (uint256)',
 *   args: ['0x51AaE...'],
 * })
 * ```
 */



// ─── Transport ──────────────────────────────────────────────────────

/**
 * Make an HTTP request to the bridge.
 *
 * Supports Unix socket (production) and TCP (macOS dev fallback).
 * Automatically resolves the bridge endpoint from environment variables.
 *
 * @param {string} path - URL path (e.g., "/ethereum/read-contract")
 * @param {object} body - JSON request body
 * @returns {Promise<object>} Parsed JSON response
 */
async function request(path, body) {
  const socketPath = process.env.W3_BRIDGE_SOCKET
  const bridgeUrl = process.env.W3_BRIDGE_URL

  if (!socketPath && !bridgeUrl) {
    throw new BridgeError(
      'BRIDGE_NOT_AVAILABLE',
      'Neither W3_BRIDGE_SOCKET nor W3_BRIDGE_URL is set. ' +
        'This SDK requires the W3 bridge — run inside a W3 workflow step.',
    )
  }

  const payload = JSON.stringify(body)

  const options = socketPath
    ? {
        socketPath,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }
    : {
        hostname: new URL(bridgeUrl).hostname,
        port: new URL(bridgeUrl).port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }

  return new Promise((resolve, reject) => {
    const req = external_node_http_.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.ok === false) {
            reject(
              new BridgeError(
                parsed.code || 'BRIDGE_ERROR',
                parsed.error || 'Unknown bridge error',
              ),
            )
          } else {
            resolve(parsed)
          }
        } catch {
          reject(new BridgeError('PARSE_ERROR', `Invalid JSON response: ${data.slice(0, 200)}`))
        }
      })
    })

    req.on('error', (err) => {
      reject(new BridgeError('CONNECTION_ERROR', `Bridge connection failed: ${err.message}`))
    })

    req.write(payload)
    req.end()
  })
}

/** GET request (for health checks). */
async function get(path) {
  const socketPath = process.env.W3_BRIDGE_SOCKET
  const bridgeUrl = process.env.W3_BRIDGE_URL

  if (!socketPath && !bridgeUrl) {
    throw new BridgeError('BRIDGE_NOT_AVAILABLE', 'Bridge not configured')
  }

  const options = socketPath
    ? { socketPath, path, method: 'GET' }
    : {
        hostname: new URL(bridgeUrl).hostname,
        port: new URL(bridgeUrl).port,
        path,
        method: 'GET',
      }

  return new Promise((resolve, reject) => {
    const req = external_node_http_.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve({ raw: data })
        }
      })
    })
    req.on('error', (err) => {
      reject(new BridgeError('CONNECTION_ERROR', `Bridge connection failed: ${err.message}`))
    })
    req.end()
  })
}

// ─── Error ──────────────────────────────────────────────────────────

class BridgeError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
  }
}

// ─── Chain helpers ──────────────────────────────────────────────────

function chainRequest(chain, action, network, params) {
  return request(`/${chain}/${action}`, { network, params })
}

// ─── Ethereum ───────────────────────────────────────────────────────

const ethereum = {
  /** Read a contract view function. */
  readContract({ network, contract, method, args, abi, rpcUrl }) {
    return chainRequest('ethereum', 'read-contract', network, {
      contract,
      method,
      args,
      abi,
      rpcUrl,
    })
  },

  /** Call a state-changing contract function (requires signer). */
  callContract({ network, contract, method, args, abi, value, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'call-contract', network, {
      contract,
      method,
      args,
      abi,
      value,
      rpcUrl,
      gasLimit,
    })
  },

  /** Get ETH balance. */
  getBalance({ network, address, rpcUrl }) {
    return chainRequest('ethereum', 'get-balance', network, { address, rpcUrl })
  },

  /** Get ERC-20 token balance. */
  getTokenBalance({ network, token, address, rpcUrl }) {
    return chainRequest('ethereum', 'get-token-balance', network, { token, address, rpcUrl })
  },

  /** Get ERC-20 allowance. */
  getTokenAllowance({ network, token, owner, spender, rpcUrl }) {
    return chainRequest('ethereum', 'get-token-allowance', network, {
      token,
      owner,
      spender,
      rpcUrl,
    })
  },

  /** Transfer ETH. */
  transfer({ network, to, value, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'transfer', network, { to, value, rpcUrl, gasLimit })
  },

  /** Transfer ERC-20 tokens. */
  transferToken({ network, token, to, amount, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'transfer-token', network, {
      token,
      to,
      amount,
      rpcUrl,
      gasLimit,
    })
  },

  /** Approve ERC-20 spending. */
  approveToken({ network, token, spender, amount, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'approve-token', network, {
      token,
      spender,
      amount,
      rpcUrl,
      gasLimit,
    })
  },

  /** Send raw transaction with calldata. */
  sendTransaction({ network, to, data, value, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'send-transaction', network, {
      to,
      data,
      value,
      rpcUrl,
      gasLimit,
    })
  },

  /** Deploy a contract from bytecode. */
  deployContract({ network, bytecode, args, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'deploy-contract', network, {
      bytecode,
      args,
      rpcUrl,
      gasLimit,
    })
  },

  /** Get transaction receipt. */
  getTransaction({ network, hash, rpcUrl }) {
    return chainRequest('ethereum', 'get-transaction', network, { hash, rpcUrl })
  },

  /** Query contract event logs. */
  getEvents({ network, address, topics, fromBlock, toBlock, rpcUrl }) {
    return chainRequest('ethereum', 'get-events', network, {
      address,
      topics,
      fromBlock,
      toBlock,
      rpcUrl,
    })
  },

  /** Resolve ENS name. */
  resolveName({ network, name, rpcUrl }) {
    return chainRequest('ethereum', 'resolve-name', network, { name, rpcUrl })
  },

  /** Wait for transaction confirmation. */
  waitForTransaction({ network, hash, confirmations, rpcUrl }) {
    return chainRequest('ethereum', 'wait-for-transaction', network, {
      hash,
      confirmations,
      rpcUrl,
    })
  },

  /** Get ERC-721 NFT owner. */
  getNftOwner({ network, token, tokenId, rpcUrl }) {
    return chainRequest('ethereum', 'get-nft-owner', network, { token, tokenId, rpcUrl })
  },

  /** Transfer ERC-721 NFT. */
  transferNft({ network, token, tokenId, to, rpcUrl, gasLimit }) {
    return chainRequest('ethereum', 'transfer-nft', network, {
      token,
      tokenId,
      to,
      rpcUrl,
      gasLimit,
    })
  },
}

// ─── Bitcoin ────────────────────────────────────────────────────────

const bitcoin = {
  /** Get BTC balance. */
  getBalance({ network, address }) {
    return chainRequest('bitcoin', 'get-balance', network, { address })
  },

  /** Get UTXOs. */
  getUtxos({ network, address }) {
    return chainRequest('bitcoin', 'get-utxos', network, { address })
  },

  /** Get transaction details. */
  getTransaction({ network, txid }) {
    return chainRequest('bitcoin', 'get-transaction', network, { txid })
  },

  /** Get current fee rate estimates. */
  getFeeRate({ network }) {
    return chainRequest('bitcoin', 'get-fee-rate', network, {})
  },

  /** Send BTC. */
  send({ network, to, amount, feeRate }) {
    return chainRequest('bitcoin', 'send', network, { to, amount, feeRate })
  },

  /** Wait for transaction confirmation. */
  waitForTransaction({ network, txid, confirmations }) {
    return chainRequest('bitcoin', 'wait-for-transaction', network, { txid, confirmations })
  },
}

// ─── Solana ─────────────────────────────────────────────────────────

const solana = {
  /** Get SOL balance. */
  getBalance({ network, address, rpcUrl }) {
    return chainRequest('solana', 'get-balance', network, { address, rpcUrl })
  },

  /** Get SPL token balance. */
  getTokenBalance({ network, address, mint, rpcUrl }) {
    return chainRequest('solana', 'get-token-balance', network, { address, mint, rpcUrl })
  },

  /** Get account data. */
  getAccount({ network, address, rpcUrl }) {
    return chainRequest('solana', 'get-account', network, { address, rpcUrl })
  },

  /** List SPL token accounts. */
  getTokenAccounts({ network, owner, rpcUrl }) {
    return chainRequest('solana', 'get-token-accounts', network, { owner, rpcUrl })
  },

  /** Transfer SOL. */
  transfer({ network, to, amount, rpcUrl }) {
    return chainRequest('solana', 'transfer', network, { to, amount, rpcUrl })
  },

  /** Transfer SPL tokens. */
  transferToken({ network, mint, to, amount, rpcUrl }) {
    return chainRequest('solana', 'transfer-token', network, { mint, to, amount, rpcUrl })
  },

  /**
   * Invoke a Solana program instruction.
   *
   * @param {string[]} [ephemeralSignerPubkeys] - Pubkeys of ephemeral keypairs
   *   (from `generateKeypair`) to include as additional transaction signers.
   *   Only the specified keypairs are included — not all generated ones.
   */
  callProgram({ network, programId, accounts, data, rpcUrl, ephemeralSignerPubkeys }) {
    return chainRequest('solana', 'call-program', network, {
      programId,
      accounts,
      data,
      rpcUrl,
      ephemeralSignerPubkeys,
    })
  },

  /** Get transaction details. */
  getTransaction({ network, signature, rpcUrl }) {
    return chainRequest('solana', 'get-transaction', network, { signature, rpcUrl })
  },

  /** Wait for transaction confirmation. */
  waitForTransaction({ network, signature, rpcUrl }) {
    return chainRequest('solana', 'wait-for-transaction', network, { signature, rpcUrl })
  },

  /**
   * Generate an ephemeral keypair for use as an additional signer.
   *
   * The private key is held by the protocol — only the public key
   * is returned. When `callProgram` is called, all generated keypairs
   * are automatically included as transaction signers.
   *
   * Used for Solana programs that require non-PDA signer accounts
   * (e.g., Anchor `init` for event data accounts in CCTP).
   *
   * @returns {{ pubkey: string }} Base58 public key
   */
  generateKeypair() {
    return request('/solana/generate-keypair', {})
  },

  /**
   * Get the payer's public key.
   *
   * Returns the pubkey of the configured Solana signer (W3_SECRET_SOLANA).
   * No secret exposed. Use this to derive ATAs and PDAs that include
   * the payer's pubkey as a seed.
   *
   * @returns {{ pubkey: string }} Base58 public key
   */
  payerAddress() {
    return get('/solana/payer-address')
  },
}

// ─── Crypto ─────────────────────────────────────────────────────────

const bridge_crypto = {
  /** Keccak-256 hash. */
  keccak256({ data }) {
    return request('/crypto/keccak256', { params: { data } })
  },

  /** AES-256-GCM encrypt. */
  aesEncrypt({ key, data }) {
    return request('/crypto/aes-encrypt', { params: { key, data } })
  },

  /** AES-256-GCM decrypt. */
  aesDecrypt({ key, data }) {
    return request('/crypto/aes-decrypt', { params: { key, data } })
  },

  /** Ed25519 sign. */
  ed25519Sign({ key, data }) {
    return request('/crypto/ed25519-sign', { params: { key, data } })
  },

  /** Ed25519 verify. */
  ed25519Verify({ key, data, signature }) {
    return request('/crypto/ed25519-verify', { params: { key, data, signature } })
  },

  /** Ed25519 public key from private key. */
  ed25519PublicKey({ key }) {
    return request('/crypto/ed25519-public-key', { params: { key } })
  },

  /** HKDF key derivation. */
  hkdf({ key, salt, info, length }) {
    return request('/crypto/hkdf', { params: { key, salt, info, length } })
  },

  /** JWT sign. */
  jwtSign({ algorithm, key, payload, expiry }) {
    return request('/crypto/jwt-sign', { params: { algorithm, key, payload, expiry } })
  },

  /** JWT verify. */
  jwtVerify({ algorithm, key, token }) {
    return request('/crypto/jwt-verify', { params: { algorithm, key, token } })
  },

  /** TOTP generate/verify. */
  totp({ key, digits, period, algorithm, time }) {
    return request('/crypto/totp', { params: { key, digits, period, algorithm, time } })
  },
}

// ─── Health ─────────────────────────────────────────────────────────

/** Check bridge health. */
function health() {
  return get('/health')
}

/** Send a heartbeat to keep the step alive during long operations. */
function heartbeat() {
  return request('/heartbeat', {})
}

/**
 * Start a background heartbeat interval.
 *
 * Returns a function to stop the heartbeat. Call this at the
 * start of long-running operations and stop it when done.
 *
 * @param {number} [intervalMs=10000] - Heartbeat interval in milliseconds
 * @returns {() => void} Stop function
 */
function startHeartbeat(intervalMs = 10_000) {
  const timer = setInterval(() => {
    heartbeat().catch(() => {
      // Swallow errors — heartbeat is best-effort
    })
  }, intervalMs)
  // Don't keep the process alive just for heartbeats
  timer.unref()
  return () => clearInterval(timer)
}

// ─── Convenience export ─────────────────────────────────────────────

/**
 * Bridge namespace — groups all operations.
 *
 * @example
 * ```js
 * import { bridge } from '@w3-io/bridge'
 *
 * await bridge.ethereum.readContract({ ... })
 * await bridge.crypto.keccak256({ data: '0xdeadbeef' })
 * await bridge.health()
 * ```
 */
const bridge = {
  ethereum,
  bitcoin,
  solana,
  crypto: bridge_crypto,
  health,
  heartbeat,
  startHeartbeat,
}

;// CONCATENATED MODULE: ./src/cctp-onchain.js
/**
 * CCTP on-chain operations via the W3 bridge.
 *
 * All chain operations go through the bridge socket — no ethers.js.
 * The protocol handles signing, RPC routing, and key management.
 *
 * Flow:
 *   1. approve-burn: Approve TokenMessenger to spend USDC
 *   2. burn: Call depositForBurn on source chain → get messageBytes + messageHash
 *   3. (wait-for-attestation: existing IRIS command)
 *   4. mint: Call receiveMessage on destination chain → USDC minted
 *   5. replace-message: Replace pending message (destinationCaller/recipient)
 */




/**
 * Pad an EVM address to bytes32 for CCTP.
 * 20-byte address left-padded with 12 zero bytes.
 */
function addressToBytes32(address) {
  const clean = address.replace(/^0x/, '').toLowerCase().padStart(40, '0')
  return '0x' + '0'.repeat(24) + clean
}

/**
 * Parse a uint256 amount from human-readable to raw units.
 * Reads decimals from the USDC contract.
 */
async function parseAmount(network, usdcAddress, amount) {
  // Read USDC decimals
  const { result: decimalsStr } = await ethereum.readContract({
    network,
    contract: usdcAddress,
    method: 'function decimals() returns (uint8)',
  })
  const decimals = parseInt(decimalsStr, 10) || 6
  // Parse amount with decimals
  const parts = amount.split('.')
  const whole = parts[0] || '0'
  const frac = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals)
  return BigInt(whole + frac).toString()
}

/**
 * Approve TokenMessenger to spend USDC.
 */
async function approveBurn({ chain, amount, domains, contracts }) {
  const chainInfo = domains[chain]
  if (!chainInfo) throw new CircleError(`Unknown chain: ${chain}`, { code: 'UNKNOWN_CHAIN' })

  const chainContracts = contracts[chain]
  if (!chainContracts) {
    throw new CircleError(`No CCTP contracts configured for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  }

  const network = chain
  const parsedAmount = await parseAmount(network, chainInfo.usdc, amount)

  const result = await ethereum.callContract({
    network,
    contract: chainInfo.usdc,
    method: 'function approve(address,uint256) returns (bool)',
    args: [chainContracts.tokenMessenger, parsedAmount],
  })

  return {
    txHash: result.transactionHash || result.signature,
    spender: chainContracts.tokenMessenger,
    amount,
    chain,
  }
}

/**
 * Burn USDC on source chain via CCTP depositForBurn.
 *
 * Returns messageBytes and messageHash for attestation and minting.
 */
async function burn({
  chain,
  destinationChain,
  recipient,
  amount,
  domains,
  contracts,
  destinationCaller,
}) {
  const sourceInfo = domains[chain]
  const destInfo = domains[destinationChain]
  if (!sourceInfo) throw new CircleError(`Unknown source chain: ${chain}`, { code: 'UNKNOWN_CHAIN' })
  if (!destInfo) {
    throw new CircleError(`Unknown destination chain: ${destinationChain}`, {
      code: 'UNKNOWN_CHAIN',
    })
  }

  const chainContracts = contracts[chain]
  if (!chainContracts) {
    throw new CircleError(`No CCTP contracts configured for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  }

  if (!recipient) {
    throw new CircleError('recipient address is required', { code: 'MISSING_RECIPIENT' })
  }

  const network = chain
  const parsedAmount = await parseAmount(network, sourceInfo.usdc, amount)
  const mintRecipient = addressToBytes32(recipient)

  // Approve USDC for TokenMessenger (combined into burn to avoid cross-step nonce races)
  await ethereum.callContract({
    network,
    contract: sourceInfo.usdc,
    method: 'function approve(address,uint256) returns (bool)',
    args: [chainContracts.tokenMessenger, parsedAmount],
  })

  // Wait for approve tx to be mined before submitting burn tx
  // (bridge doesn't manage pending nonces across sequential calls)
  await new Promise((resolve) => setTimeout(resolve, 3000))

  let result
  if (destinationCaller) {
    // CCTP V2: depositForBurn with explicit destinationCaller
    const callerBytes32 = addressToBytes32(destinationCaller)
    const DEFAULT_MAX_FEE = '100000'
    result = await ethereum.callContract({
      network,
      contract: chainContracts.tokenMessenger,
      method: 'function depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
      args: [parsedAmount, destInfo.domain, mintRecipient, sourceInfo.usdc, callerBytes32, DEFAULT_MAX_FEE, '0'],
    })
  } else {
    // CCTP V2: depositForBurn with destinationCaller, maxFee, minFinalityThreshold.
    // maxFee: Circle charges a fee for attestation. Default 100000 ($0.10 USDC).
    // Set maxFee to 0 will cause attestation to be delayed (insufficient_fee).
    const zeroCaller = '0x0000000000000000000000000000000000000000000000000000000000000000'
    const DEFAULT_MAX_FEE = '100000' // 0.10 USDC — covers attestation fee
    result = await ethereum.callContract({
      network,
      contract: chainContracts.tokenMessenger,
      method: 'function depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
      args: [parsedAmount, destInfo.domain, mintRecipient, sourceInfo.usdc, zeroCaller, DEFAULT_MAX_FEE, '0'],
    })
  }

  // Extract MessageSent event from transaction logs.
  // The bridge returns the transaction receipt which includes logs.
  // MessageSent event topic: keccak256("MessageSent(bytes)")
  const MESSAGE_SENT_TOPIC = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036'

  let messageBytes = null
  if (result.logs) {
    for (const log of JSON.parse(result.logs)) {
      if (log.topics && log.topics[0] === MESSAGE_SENT_TOPIC) {
        // MessageSent event data is the ABI-encoded message bytes
        // First 32 bytes = offset, next 32 bytes = length, rest = data
        const data = log.data.replace(/^0x/, '')
        const offset = parseInt(data.slice(0, 64), 16) * 2
        const length = parseInt(data.slice(offset, offset + 64), 16) * 2
        messageBytes = '0x' + data.slice(offset + 64, offset + 64 + length)
        break
      }
    }
  }

  if (!messageBytes) {
    throw new CircleError('MessageSent event not found in transaction receipt', {
      code: 'EVENT_NOT_FOUND',
    })
  }

  // Compute messageHash (keccak256)
  const { hash: messageHash } = await bridge_crypto.keccak256({ data: messageBytes })

  return {
    txHash: result.transactionHash || result.signature,
    sourceDomain: sourceInfo.domain,
    messageBytes,
    messageHash: '0x' + messageHash,
    amount,
    source: chain,
    destination: destinationChain,
    recipient,
  }
}

/**
 * Mint USDC on destination chain by calling receiveMessage.
 */
async function mint({ chain, messageBytes, attestation, contracts }) {
  const chainContracts = contracts[chain]
  if (!chainContracts) {
    throw new CircleError(`No CCTP contracts configured for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  }

  if (!messageBytes) {
    throw new CircleError('message-bytes is required (from burn step)', {
      code: 'MISSING_MESSAGE_BYTES',
    })
  }
  if (!attestation) {
    throw new CircleError('attestation is required (from wait-for-attestation step)', {
      code: 'MISSING_ATTESTATION',
    })
  }

  const network = chain

  const result = await ethereum.callContract({
    network,
    contract: chainContracts.messageTransmitter,
    method: 'function receiveMessage(bytes,bytes)',
    args: [messageBytes, attestation],
  })

  return {
    txHash: result.transactionHash || result.signature,
    chain,
    success: true,
  }
}

/**
 * Replace a pending CCTP message on the source chain.
 */
async function replaceMessage({
  chain,
  originalMessageBytes,
  originalAttestation,
  newDestinationCaller,
  contracts,
}) {
  const chainContracts = contracts[chain]
  if (!chainContracts) {
    throw new CircleError(`No CCTP contracts configured for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  }

  if (!originalMessageBytes) {
    throw new CircleError('original-message-bytes is required', { code: 'MISSING_MESSAGE_BYTES' })
  }
  if (!originalAttestation) {
    throw new CircleError('original-attestation is required', { code: 'MISSING_ATTESTATION' })
  }

  const callerBytes32 = newDestinationCaller
    ? addressToBytes32(newDestinationCaller)
    : '0x' + '0'.repeat(64)

  const network = chain

  const result = await ethereum.callContract({
    network,
    contract: chainContracts.messageTransmitter,
    method: 'function replaceMessage(bytes,bytes,bytes,bytes32)',
    args: [originalMessageBytes, originalAttestation, '0x', callerBytes32],
  })

  // Extract new MessageSent event
  const MESSAGE_SENT_TOPIC = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036'
  let newMessageBytes = null
  if (result.logs) {
    for (const log of JSON.parse(result.logs)) {
      if (log.topics && log.topics[0] === MESSAGE_SENT_TOPIC) {
        const data = log.data.replace(/^0x/, '')
        const offset = parseInt(data.slice(0, 64), 16) * 2
        const length = parseInt(data.slice(offset, offset + 64), 16) * 2
        newMessageBytes = '0x' + data.slice(offset + 64, offset + 64 + length)
        break
      }
    }
  }

  let newMessageHash = null
  if (newMessageBytes) {
    const { hash } = await bridge_crypto.keccak256({ data: newMessageBytes })
    newMessageHash = '0x' + hash
  }

  return {
    txHash: result.transactionHash || result.signature,
    chain,
    newMessageBytes,
    newMessageHash,
  }
}

// EXTERNAL MODULE: external "node:crypto"
var external_node_crypto_ = __webpack_require__(7598);
// EXTERNAL MODULE: ./node_modules/@solana/web3.js/lib/index.cjs.js
var index_cjs = __webpack_require__(9443);
;// CONCATENATED MODULE: ./src/cctp-solana.js
/**
 * CCTP V2 Solana operations via the W3 bridge.
 *
 * Chain operations go through bridge.solana.callProgram().
 * PDA derivation uses @solana/web3.js (temporary — W3-332 tracks
 * adding a bridge route for this).
 *
 * Burn: depositForBurn on TokenMessengerMinter
 * Mint: receiveMessage on MessageTransmitter
 */






// ─── PDA Derivation ───────────────────────────────────────────────
// Uses @solana/web3.js PublicKey.findProgramAddressSync only.
// W3-332 will replace this with bridge.solana.findPda().

function findPda(programId, seeds) {
  return index_cjs/* PublicKey */.J3.findProgramAddressSync(
    seeds,
    new index_cjs/* PublicKey */.J3(programId),
  )
}

function uint32BE(n) {
  const buf = Buffer.alloc(4)
  buf.writeUInt32BE(n)
  return buf
}

function uint32LE(n) {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(n)
  return buf
}

function uint64LE(n) {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(BigInt(n))
  return buf
}

/** Anchor discriminator: SHA256("global:<name>")[0..8] */
function anchorDiscriminator(name) {
  return (0,external_node_crypto_.createHash)('sha256').update(`global:${name}`).digest().subarray(0, 8)
}

/** Borsh-encode a Vec<u8>: 4-byte LE length + bytes */
function borshVec(data) {
  const len = Buffer.alloc(4)
  len.writeUInt32LE(data.length)
  return Buffer.concat([len, data])
}

/** Get associated token address (SPL Token convention) */
function getAta(mint, owner) {
  const [ata] = index_cjs/* PublicKey */.J3.findProgramAddressSync(
    [
      new index_cjs/* PublicKey */.J3(owner).toBuffer(),
      new index_cjs/* PublicKey */.J3('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(),
      new index_cjs/* PublicKey */.J3(mint).toBuffer(),
    ],
    new index_cjs/* PublicKey */.J3('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
  )
  return ata.toBase58()
}

// ─── Message Parsing ──────────────────────────────────────────────

const MSG = {
  NONCE_INDEX: 12,
  SENDER_INDEX: 44,
  BODY_INDEX: 140,
}

function parseMessage(messageBytes) {
  const buf = Buffer.from(messageBytes.replace(/^0x/, ''), 'hex')
  const sourceDomain = buf.readUInt32BE(4)
  const nonceBytes = buf.subarray(MSG.NONCE_INDEX, MSG.SENDER_INDEX)
  const body = buf.subarray(MSG.BODY_INDEX)
  const burnToken = body.subarray(4, 36)
  const mintRecipient = body.subarray(36, 68)
  return { sourceDomain, nonceBytes, burnToken, mintRecipient, raw: buf }
}

// ─── Resolve chain config ─────────────────────────────────────────

function resolveChain(chain, contracts, domains) {
  const chainContracts = contracts[chain]
  if (!chainContracts) {
    throw new CircleError(`No CCTP contracts configured for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  }
  const chainInfo = domains[chain]
  if (!chainInfo) {
    throw new CircleError(`Unknown chain: ${chain}`, { code: 'UNKNOWN_CHAIN' })
  }
  return { chainContracts, chainInfo }
}

// ─── Mint (receiveMessage) ────────────────────────────────────────

/**
 * Mint USDC on Solana by calling receiveMessage on MessageTransmitter V2.
 */
async function mintSolana({ chain, messageBytes, attestation, contracts, domains, rpcUrl }) {
  if (!messageBytes) {
    throw new CircleError('message-bytes is required', { code: 'MISSING_MESSAGE_BYTES' })
  }
  if (!attestation) {
    throw new CircleError('attestation is required', { code: 'MISSING_ATTESTATION' })
  }

  const { chainContracts, chainInfo } = resolveChain(chain, contracts, domains)
  const mtId = chainContracts.messageTransmitter
  const tmmId = chainContracts.tokenMessenger
  const usdcMint = chainInfo.usdc

  // Get the payer's pubkey for accounts that reference it
  const { pubkey: payerPubkey } = await solana.payerAddress()

  const { sourceDomain, nonceBytes, burnToken, mintRecipient } = parseMessage(messageBytes)
  const mintRecipientB58 = new index_cjs/* PublicKey */.J3(mintRecipient).toBase58()

  // Derive PDAs
  const [authorityPda] = findPda(mtId, [
    Buffer.from('message_transmitter_authority'),
    new index_cjs/* PublicKey */.J3(tmmId).toBuffer(),
  ])
  const [mtState] = findPda(mtId, [Buffer.from('message_transmitter')])
  const [usedNonce] = findPda(mtId, [Buffer.from('used_nonce'), nonceBytes])
  const [mtEventAuth] = findPda(mtId, [Buffer.from('__event_authority')])

  const [tmmState] = findPda(tmmId, [Buffer.from('token_messenger')])
  const [remoteTmm] = findPda(tmmId, [
    Buffer.from('remote_token_messenger'),
    uint32BE(sourceDomain),
  ])
  const [tokenMinter] = findPda(tmmId, [Buffer.from('token_minter')])
  const [localToken] = findPda(tmmId, [
    Buffer.from('local_token'),
    new index_cjs/* PublicKey */.J3(usdcMint).toBuffer(),
  ])
  const [tokenPair] = findPda(tmmId, [
    Buffer.from('token_pair'),
    uint32BE(sourceDomain),
    burnToken,
  ])
  const feeRecipientAta = getAta(usdcMint, mintRecipientB58) // fee goes to recipient
  const recipientAta = getAta(usdcMint, mintRecipientB58)
  const [custody] = findPda(tmmId, [Buffer.from('custody'), new index_cjs/* PublicKey */.J3(usdcMint).toBuffer()])
  const [tmmEventAuth] = findPda(tmmId, [Buffer.from('__event_authority')])

  // Instruction data
  const msgData = Buffer.from(messageBytes.replace(/^0x/, ''), 'hex')
  const attData = Buffer.from(attestation.replace(/^0x/, ''), 'hex')
  const data =
    '0x' +
    Buffer.concat([anchorDiscriminator('receive_message'), borshVec(msgData), borshVec(attData)])
      .toString('hex')

  const SPL_TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  const SYSTEM = '11111111111111111111111111111111'

  // Account list — order follows Anchor IDL
  const accounts = [
    // receiveMessage core accounts
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: false }, // caller
    { pubkey: authorityPda.toBase58(), isSigner: false, isWritable: false },
    { pubkey: mtState.toBase58(), isSigner: false, isWritable: false },
    { pubkey: usedNonce.toBase58(), isSigner: false, isWritable: true },
    { pubkey: tmmId, isSigner: false, isWritable: false }, // receiver
    { pubkey: SYSTEM, isSigner: false, isWritable: false },
    // #[event_cpi] for MessageTransmitter
    { pubkey: mtEventAuth.toBase58(), isSigner: false, isWritable: false },
    { pubkey: mtId, isSigner: false, isWritable: false },
    // CPI remaining accounts for TokenMessengerMinter
    { pubkey: tmmState.toBase58(), isSigner: false, isWritable: false },
    { pubkey: remoteTmm.toBase58(), isSigner: false, isWritable: false },
    { pubkey: tokenMinter.toBase58(), isSigner: false, isWritable: false },
    { pubkey: localToken.toBase58(), isSigner: false, isWritable: true },
    { pubkey: tokenPair.toBase58(), isSigner: false, isWritable: false },
    { pubkey: feeRecipientAta, isSigner: false, isWritable: true },
    { pubkey: recipientAta, isSigner: false, isWritable: true },
    { pubkey: custody.toBase58(), isSigner: false, isWritable: true },
    { pubkey: SPL_TOKEN, isSigner: false, isWritable: false },
    // #[event_cpi] for TokenMessengerMinter
    { pubkey: tmmEventAuth.toBase58(), isSigner: false, isWritable: false },
    { pubkey: tmmId, isSigner: false, isWritable: false },
  ]

  const result = await solana.callProgram({
    network: chain,
    programId: mtId,
    accounts,
    data,
  })

  return { signature: result.signature, chain, success: true }
}

// ─── Burn (depositForBurn) ────────────────────────────────────────

/**
 * Burn USDC on Solana via depositForBurn on TokenMessengerMinter V2.
 */
async function burnSolana({
  chain,
  destinationChain,
  recipient,
  amount,
  contracts,
  domains,
  destinationCaller,
}) {
  if (!recipient) {
    throw new CircleError('destination-address is required', { code: 'MISSING_RECIPIENT' })
  }

  const { chainContracts, chainInfo } = resolveChain(chain, contracts, domains)
  const destInfo = domains[destinationChain]
  if (!destInfo) {
    throw new CircleError(`Unknown destination chain: ${destinationChain}`, {
      code: 'UNKNOWN_CHAIN',
    })
  }

  const mtId = chainContracts.messageTransmitter
  const tmmId = chainContracts.tokenMessenger
  const usdcMint = chainInfo.usdc
  const rawAmount = BigInt(Math.round(parseFloat(amount) * 1e6))

  // Get the payer's pubkey for accounts and PDA derivation
  const { pubkey: payerPubkey } = await solana.payerAddress()

  // Recipient: EVM address → bytes32, Solana pubkey → 32 bytes
  let mintRecipientBytes
  if (recipient.startsWith('0x')) {
    mintRecipientBytes = Buffer.alloc(32)
    Buffer.from(recipient.replace(/^0x/, ''), 'hex').copy(mintRecipientBytes, 12)
  } else {
    mintRecipientBytes = new index_cjs/* PublicKey */.J3(recipient).toBuffer()
  }

  const callerBytes = destinationCaller
    ? destinationCaller.startsWith('0x')
      ? Buffer.from(destinationCaller.replace(/^0x/, '').padStart(64, '0'), 'hex')
      : new index_cjs/* PublicKey */.J3(destinationCaller).toBuffer()
    : Buffer.alloc(32)

  // Generate ephemeral keypair for MessageSent event data
  const { pubkey: eventDataPubkey } = await solana.generateKeypair()

  // Derive PDAs using the actual payer pubkey
  const [senderAuth] = findPda(tmmId, [Buffer.from('sender_authority')])
  const payerAta = getAta(usdcMint, payerPubkey)
  const [denylist] = findPda(tmmId, [
    Buffer.from('denylist_account'),
    new index_cjs/* PublicKey */.J3(payerPubkey).toBuffer(),
  ])
  const [mtState] = findPda(mtId, [Buffer.from('message_transmitter')])
  const [tmmState] = findPda(tmmId, [Buffer.from('token_messenger')])
  const [remoteTmm] = findPda(tmmId, [
    Buffer.from('remote_token_messenger'),
    uint32BE(destInfo.domain),
  ])
  const [tokenMinter] = findPda(tmmId, [Buffer.from('token_minter')])
  const [localToken] = findPda(tmmId, [
    Buffer.from('local_token'),
    new index_cjs/* PublicKey */.J3(usdcMint).toBuffer(),
  ])
  const [eventAuth] = findPda(tmmId, [Buffer.from('__event_authority')])

  const SPL_TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  const SYSTEM = '11111111111111111111111111111111'

  // Instruction data
  const data =
    '0x' +
    Buffer.concat([
      anchorDiscriminator('deposit_for_burn'),
      uint64LE(rawAmount),
      uint32LE(destInfo.domain),
      mintRecipientBytes,
      callerBytes,
      uint64LE(0n), // max_fee
      uint32LE(0), // min_finality_threshold
    ]).toString('hex')

  // Account list — order follows Anchor IDL
  const accounts = [
    { pubkey: payerPubkey, isSigner: true, isWritable: false }, // owner
    { pubkey: payerPubkey, isSigner: true, isWritable: true }, // event_rent_payer
    { pubkey: senderAuth.toBase58(), isSigner: false, isWritable: false },
    { pubkey: payerAta, isSigner: false, isWritable: true }, // burn_token_account
    { pubkey: denylist.toBase58(), isSigner: false, isWritable: false },
    { pubkey: mtState.toBase58(), isSigner: false, isWritable: true },
    { pubkey: tmmState.toBase58(), isSigner: false, isWritable: false },
    { pubkey: remoteTmm.toBase58(), isSigner: false, isWritable: false },
    { pubkey: tokenMinter.toBase58(), isSigner: false, isWritable: false },
    { pubkey: localToken.toBase58(), isSigner: false, isWritable: true },
    { pubkey: usdcMint, isSigner: false, isWritable: true },
    { pubkey: eventDataPubkey, isSigner: true, isWritable: true },
    { pubkey: mtId, isSigner: false, isWritable: false },
    { pubkey: tmmId, isSigner: false, isWritable: false },
    { pubkey: SPL_TOKEN, isSigner: false, isWritable: false },
    { pubkey: SYSTEM, isSigner: false, isWritable: false },
    // #[event_cpi]
    { pubkey: eventAuth.toBase58(), isSigner: false, isWritable: false },
    { pubkey: tmmId, isSigner: false, isWritable: false },
  ]

  const result = await solana.callProgram({
    network: chain,
    programId: tmmId,
    accounts,
    data,
    ephemeralSignerPubkeys: [eventDataPubkey],
  })

  // Read the MessageSent event data account
  const eventAccount = await solana.getAccount({
    network: chain,
    address: eventDataPubkey,
  })

  // Parse: skip 8-byte Anchor discriminator, then Borsh Vec<u8>
  const eventData = Buffer.from(eventAccount.data || '', 'base64')
  const msgLen = eventData.readUInt32LE(8)
  const msgBytes = eventData.subarray(12, 12 + msgLen)
  const messageBytesHex = '0x' + msgBytes.toString('hex')

  // Compute messageHash via bridge crypto
  const { hash: messageHash } = await bridge_crypto.keccak256({ data: messageBytesHex })

  return {
    signature: result.signature,
    messageBytes: messageBytesHex,
    messageHash: '0x' + messageHash,
    amount,
    source: chain,
    destination: destinationChain,
    recipient,
  }
}

;// CONCATENATED MODULE: ./src/main.js





const COMMANDS = {
  // CCTP (IRIS API — no auth)
  'get-attestation': runGetAttestation,
  'wait-for-attestation': runWaitForAttestation,
  'get-supported-chains': runGetSupportedChains,
  'get-domain-info': runGetDomainInfo,
  // CCTP on-chain (requires private-key + RPC)
  'approve-burn': runApproveBurn,
  burn: runBurn,
  mint: runMint,
  'replace-message': runReplaceMessage,
  // Setup (Platform API — requires api-key + entity-secret)
  'register-entity-secret': runRegisterEntitySecret,
  // Wallets (Platform API — requires api-key)
  'create-wallet-set': runCreateWalletSet,
  'create-wallet': runCreateWallet,
  'get-wallet': runGetWallet,
  'list-wallets': runListWallets,
  'get-balance': runGetBalance,
  // Transactions (Platform API — requires api-key)
  transfer: runTransfer,
  'get-transaction': runGetTransaction,
  'estimate-fee': runEstimateFee,
  // Compliance (Platform API — requires api-key)
  'screen-address': runScreenAddress,
}

async function run() {
  try {
    const command = lib_core.getInput('command', { required: true })
    const handler = COMMANDS[command]

    if (!handler) {
      lib_core.setFailed(
        `Unknown command: "${command}". Available: ${Object.keys(COMMANDS).join(', ')}`,
      )
      return
    }

    const timeoutInput = lib_core.getInput('timeout')
    const client = new CircleClient({
      apiKey: lib_core.getInput('api-key') || undefined,
      apiUrl: lib_core.getInput('api-url') || undefined,
      entitySecret: lib_core.getInput('entity-secret') || undefined,
      irisUrl: lib_core.getInput('iris-url') || undefined,
      sandbox: lib_core.getInput('sandbox') === 'true',
      timeout: timeoutInput ? Number(timeoutInput) : undefined,
    })

    const result = await handler(client)
    lib_core.setOutput('result', JSON.stringify(result))

    // Set individual outputs for piping between steps (avoids fromJSON on large values)
    if (result.txHash) lib_core.setOutput('tx_hash', result.txHash)
    if (result.sourceDomain != null) lib_core.setOutput('source_domain', String(result.sourceDomain))
    if (result.messageHash) lib_core.setOutput('message_hash', result.messageHash)
    if (result.messageBytes) lib_core.setOutput('message_bytes', result.messageBytes)
    if (result.message) lib_core.setOutput('message', result.message)
    if (result.attestation) lib_core.setOutput('attestation', result.attestation)

    // Summary disabled — @actions/core Summary throws unhandled rejections
    // in environments without GITHUB_STEP_SUMMARY set.
  } catch (error) {
    if (error instanceof CircleError) {
      lib_core.setFailed(`Circle error (${error.code}): ${error.message}`)
    } else {
      lib_core.setFailed(error.message)
    }
  }
}

// -- Command handlers -------------------------------------------------------

async function runGetAttestation(client) {
  const messageHash = lib_core.getInput('message-hash', { required: true })
  return client.getAttestation(messageHash)
}

async function runWaitForAttestation(client) {
  // Support both hyphenated and underscored input names
  const txHash = lib_core.getInput('tx-hash') || lib_core.getInput('tx_hash')
  const sourceDomain = lib_core.getInput('source-domain') || lib_core.getInput('source_domain')
  const messageHash = lib_core.getInput('message-hash') || lib_core.getInput('message_hash')
  const pollIntervalInput = lib_core.getInput('poll-interval')
  const maxAttemptsInput = lib_core.getInput('max-attempts')
  const pollInterval = pollIntervalInput ? Number(pollIntervalInput) : undefined
  const maxAttempts = maxAttemptsInput ? Number(maxAttemptsInput) : undefined

  // V2: use tx-hash + source-domain (preferred — instant when fee is set)
  if (txHash && sourceDomain) {
    return client.waitForAttestationV2(txHash, Number(sourceDomain), { pollInterval, maxAttempts })
  }

  // V1 fallback: use message-hash
  if (!messageHash) {
    throw new Error('Either tx-hash + source-domain (V2) or message-hash (V1) is required')
  }
  return client.waitForAttestation(messageHash, { pollInterval, maxAttempts })
}

async function runGetSupportedChains(client) {
  const network = lib_core.getInput('network') || undefined
  return client.getSupportedChains(network)
}

async function runGetDomainInfo(client) {
  const chain = lib_core.getInput('chain', { required: true })
  return client.getDomainInfo(chain)
}

// -- CCTP on-chain commands --------------------------------------------------

async function runApproveBurn() {
  const chain = lib_core.getInput('chain', { required: true })
  const amount = lib_core.getInput('amount', { required: true })
  return approveBurn({ chain, amount, domains: DOMAINS, contracts: CONTRACTS })
}

async function runBurn() {
  const chain = lib_core.getInput('chain', { required: true })
  const destinationChain = lib_core.getInput('destination-chain', { required: true })
  const recipient = lib_core.getInput('destination-address', { required: true })
  const amount = lib_core.getInput('amount', { required: true })
  const destinationCaller = lib_core.getInput('destination-caller') || undefined

  // Route to Solana implementation for Solana source chains
  const chainInfo = DOMAINS[chain]
  if (chainInfo && chainInfo.type === 'solana') {
    return burnSolana({
      chain,
      destinationChain,
      recipient,
      amount,
      contracts: CONTRACTS,
      domains: DOMAINS,
      destinationCaller,
    })
  }

  return burn({
    chain,
    destinationChain,
    recipient,
    amount,
    domains: DOMAINS,
    contracts: CONTRACTS,
    destinationCaller,
  })
}

async function runMint() {
  const chain = lib_core.getInput('chain', { required: true })
  const messageBytes = lib_core.getInput('message-bytes', { required: true })
  const attestation = lib_core.getInput('attestation', { required: true })

  // Route to Solana implementation for Solana chains
  const chainInfo = DOMAINS[chain]
  if (chainInfo && chainInfo.type === 'solana') {
    return mintSolana({
      chain,
      messageBytes,
      attestation,
      contracts: CONTRACTS,
      domains: DOMAINS,
    })
  }

  return mint({ chain, messageBytes, attestation, contracts: CONTRACTS })
}

async function runReplaceMessage() {
  const chain = lib_core.getInput('chain', { required: true })
  const originalMessageBytes = lib_core.getInput('original-message-bytes', { required: true })
  const originalAttestation = lib_core.getInput('original-attestation', { required: true })
  const newDestinationCaller = lib_core.getInput('destination-caller') || undefined
  return replaceMessage({
    chain,
    originalMessageBytes,
    originalAttestation,
    newDestinationCaller,
    contracts: CONTRACTS,
  })
}

// -- Platform API: Setup ----------------------------------------------------

async function runRegisterEntitySecret(client) {
  return client.registerEntitySecret()
}

// -- Platform API: Wallets --------------------------------------------------

async function runCreateWalletSet(client) {
  const name = lib_core.getInput('name', { required: true })
  return client.createWalletSet({ name })
}

async function runCreateWallet(client) {
  const walletSetId = lib_core.getInput('wallet-set-id', { required: true })
  const blockchains = lib_core.getInput('blockchains', { required: true })
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const countInput = lib_core.getInput('count')
  const count = countInput ? Number(countInput) : 1
  return client.createWallet({ walletSetId, blockchains, count })
}

async function runGetWallet(client) {
  const walletId = lib_core.getInput('wallet-id', { required: true })
  return client.getWallet(walletId)
}

async function runListWallets(client) {
  const walletSetId = lib_core.getInput('wallet-set-id') || undefined
  const blockchain = lib_core.getInput('blockchain') || undefined
  const pageSizeInput = lib_core.getInput('page-size')
  const pageSize = pageSizeInput ? Number(pageSizeInput) : undefined
  return client.listWallets({ walletSetId, blockchain, pageSize })
}

async function runGetBalance(client) {
  const walletId = lib_core.getInput('wallet-id', { required: true })
  return client.getBalance(walletId)
}

// -- Platform API: Transactions ---------------------------------------------

async function runTransfer(client) {
  const walletId = lib_core.getInput('wallet-id', { required: true })
  const destinationAddress = lib_core.getInput('destination-address', { required: true })
  const amount = lib_core.getInput('amount', { required: true })
  const tokenId = lib_core.getInput('token-id') || undefined
  const blockchain = lib_core.getInput('blockchain') || undefined
  return client.transfer({ walletId, destinationAddress, tokenId, amount, blockchain })
}

async function runGetTransaction(client) {
  const transactionId = lib_core.getInput('transaction-id', { required: true })
  return client.getTransaction(transactionId)
}

async function runEstimateFee(client) {
  const walletId = lib_core.getInput('wallet-id', { required: true })
  const destinationAddress = lib_core.getInput('destination-address', { required: true })
  const tokenId = lib_core.getInput('token-id', { required: true })
  const amount = lib_core.getInput('amount', { required: true })
  return client.estimateFee({ walletId, destinationAddress, tokenId, amount })
}

// -- Platform API: Compliance -----------------------------------------------

async function runScreenAddress(client) {
  const address = lib_core.getInput('address', { required: true })
  const chain = lib_core.getInput('blockchain', { required: true })
  return client.screenAddress(address, { chain })
}

// -- Job summary ------------------------------------------------------------

async function writeSummary(command, result) {
  const heading = `Circle: ${command}`

  if (command === 'get-attestation' || command === 'wait-for-attestation') {
    const status = result.status === 'complete' ? 'Complete' : 'Pending'
    core.summary.addHeading(heading, 3).addRaw(`**Status:** ${status}\n\n`)
    if (result.attestation) {
      core.summary.addRaw(`**Attestation:** \`${result.attestation.slice(0, 20)}...\`\n\n`)
    }
    await core.summary.write()
    return
  }

  if (command === 'get-supported-chains' && result.chains) {
    const headerRow = [
      { data: 'Name', header: true },
      { data: 'Domain', header: true },
      { data: 'Chain ID', header: true },
      { data: 'Network', header: true },
    ]
    const dataRows = result.chains.map((c) => [
      c.name,
      String(c.domain),
      String(c.chainId),
      c.network,
    ])

    core.summary.addHeading(heading, 3).addTable([headerRow, ...dataRows])
    await core.summary.write()
    return
  }

  core.summary.addHeading(heading, 3)
    .addCodeBlock(JSON.stringify(result, null, 2), 'json')
  await core.summary.write()
}


/***/ })

};
