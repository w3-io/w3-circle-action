/**
 * CCTP on-chain operations: approve, burn, and mint.
 *
 * Uses ethers.js to interact with CCTP smart contracts directly.
 * This enables W3 workflows to perform cross-chain USDC transfers
 * without relying on Circle's Platform API — just a wallet private
 * key and RPC endpoints.
 *
 * Flow:
 *   1. approve-burn: Approve TokenMessenger to spend USDC
 *   2. burn: Call depositForBurn on source chain → get messageBytes + messageHash
 *   3. (wait-for-attestation: existing Phase 1 command)
 *   4. mint: Call receiveMessage on destination chain → USDC minted
 */

import { ethers } from 'ethers'
import { CircleError } from './circle.js'

// CCTP V1 ABIs (minimal — only the functions we call)
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
]

const TOKEN_MESSENGER_ABI = [
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) external returns (uint64 nonce)',
  'event DepositForBurn(uint64 indexed nonce, address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller)',
]

const MESSAGE_TRANSMITTER_ABI = [
  'function receiveMessage(bytes message, bytes attestation) external returns (bool success)',
  'event MessageSent(bytes message)',
  'event MessageReceived(address indexed caller, uint32 sourceDomain, uint64 indexed nonce, bytes32 sender, bytes messageBody)',
]

/**
 * Resolve an RPC URL for a chain.
 *
 * Checks for chain-specific env vars first (e.g., ETHEREUM_SEPOLIA_RPC_URL),
 * then falls back to a generic RPC_URL input, then to public defaults.
 *
 * @param {string} chain - Chain name (e.g., "ethereum-sepolia")
 * @returns {string} RPC URL
 */
function resolveRpcUrl(chain, inputRpcUrl) {
  // Check chain-specific env var: ETHEREUM_SEPOLIA_RPC_URL
  const envKey = chain.toUpperCase().replace(/-/g, '_') + '_RPC_URL'
  if (process.env[envKey]) return process.env[envKey]

  // Check generic input
  if (inputRpcUrl) return inputRpcUrl

  // Public defaults for testnets (rate-limited, fine for testing)
  const defaults = {
    'ethereum-sepolia': 'https://ethereum-sepolia-rpc.publicnode.com',
    'avalanche-fuji': 'https://api.avax-test.network/ext/bc/C/rpc',
    'arbitrum-sepolia': 'https://sepolia-rollup.arbitrum.io/rpc',
    'base-sepolia': 'https://sepolia.base.org',
    'polygon-amoy': 'https://rpc-amoy.polygon.technology',
  }

  if (defaults[chain]) return defaults[chain]

  throw new CircleError(
    `No RPC URL for "${chain}". Set ${envKey} env var or provide rpc-url input.`,
    { code: 'MISSING_RPC_URL' },
  )
}

/**
 * Create a signer from a private key and RPC URL.
 *
 * @param {string} privateKey - 0x-prefixed private key
 * @param {string} rpcUrl - JSON-RPC endpoint
 * @returns {ethers.Wallet} Connected wallet
 */
function createSigner(privateKey, rpcUrl) {
  if (!privateKey) {
    throw new CircleError('private-key is required for on-chain CCTP commands', {
      code: 'MISSING_PRIVATE_KEY',
    })
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  return new ethers.Wallet(privateKey, provider)
}

/**
 * Pad an Ethereum address to bytes32 for CCTP.
 *
 * CCTP expects recipient addresses as bytes32 — a 20-byte address
 * left-padded with 12 zero bytes.
 *
 * @param {string} address - 0x-prefixed Ethereum address
 * @returns {string} bytes32 representation
 */
function addressToBytes32(address) {
  return ethers.zeroPadValue(address, 32)
}

/**
 * Approve TokenMessenger to spend USDC.
 *
 * @param {object} options
 * @param {string} options.chain - Source chain name
 * @param {string} options.amount - USDC amount (human-readable, e.g., "10.5")
 * @param {string} options.privateKey - Wallet private key
 * @param {string} [options.rpcUrl] - RPC endpoint override
 * @param {object} options.domains - DOMAINS from circle.js
 * @param {object} options.contracts - CONTRACTS from circle.js
 * @returns {{ txHash, spender, amount, allowance }}
 */
export async function approveBurn({ chain, amount, privateKey, rpcUrl, domains, contracts }) {
  const chainInfo = domains[chain]
  if (!chainInfo) throw new CircleError(`Unknown chain: ${chain}`, { code: 'UNKNOWN_CHAIN' })

  const chainContracts = contracts[chain]
  if (!chainContracts) {
    throw new CircleError(`No CCTP contracts configured for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  }

  const rpc = resolveRpcUrl(chain, rpcUrl)
  const signer = createSigner(privateKey, rpc)

  const usdc = new ethers.Contract(chainInfo.usdc, ERC20_ABI, signer)
  const decimals = await usdc.decimals()
  const parsedAmount = ethers.parseUnits(amount, decimals)

  // Check current balance
  const balance = await usdc.balanceOf(signer.address)
  if (balance < parsedAmount) {
    throw new CircleError(
      `Insufficient USDC balance: have ${ethers.formatUnits(balance, decimals)}, need ${amount}`,
      { code: 'INSUFFICIENT_BALANCE' },
    )
  }

  // Check existing allowance — skip approve if already sufficient
  const currentAllowance = await usdc.allowance(signer.address, chainContracts.tokenMessenger)
  if (currentAllowance >= parsedAmount) {
    return {
      txHash: null,
      spender: chainContracts.tokenMessenger,
      amount: amount,
      allowance: ethers.formatUnits(currentAllowance, decimals),
      skipped: true,
      message: 'Sufficient allowance already exists',
    }
  }

  const tx = await usdc.approve(chainContracts.tokenMessenger, parsedAmount)
  const receipt = await tx.wait()

  const newAllowance = await usdc.allowance(signer.address, chainContracts.tokenMessenger)

  return {
    txHash: receipt.hash,
    spender: chainContracts.tokenMessenger,
    amount: amount,
    allowance: ethers.formatUnits(newAllowance, decimals),
    skipped: false,
    chain,
    blockNumber: receipt.blockNumber,
  }
}

/**
 * Burn USDC on source chain via CCTP depositForBurn.
 *
 * Returns the messageBytes and messageHash needed for attestation
 * and minting on the destination chain.
 *
 * @param {object} options
 * @param {string} options.chain - Source chain name
 * @param {string} options.destinationChain - Destination chain name
 * @param {string} options.recipient - Recipient address on destination chain
 * @param {string} options.amount - USDC amount (human-readable)
 * @param {string} options.privateKey - Wallet private key
 * @param {string} [options.rpcUrl] - RPC endpoint override
 * @param {object} options.domains - DOMAINS from circle.js
 * @param {object} options.contracts - CONTRACTS from circle.js
 * @returns {{ txHash, messageBytes, messageHash, nonce, amount, source, destination }}
 */
export async function burn({
  chain,
  destinationChain,
  recipient,
  amount,
  privateKey,
  rpcUrl,
  domains,
  contracts,
}) {
  const sourceInfo = domains[chain]
  const destInfo = domains[destinationChain]
  if (!sourceInfo)
    throw new CircleError(`Unknown source chain: ${chain}`, { code: 'UNKNOWN_CHAIN' })
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

  const rpc = resolveRpcUrl(chain, rpcUrl)
  const signer = createSigner(privateKey, rpc)

  // Parse amount
  const usdc = new ethers.Contract(sourceInfo.usdc, ERC20_ABI, signer)
  const decimals = await usdc.decimals()
  const parsedAmount = ethers.parseUnits(amount, decimals)

  // Call depositForBurn
  const tokenMessenger = new ethers.Contract(
    chainContracts.tokenMessenger,
    TOKEN_MESSENGER_ABI,
    signer,
  )

  const mintRecipient = addressToBytes32(recipient)

  const tx = await tokenMessenger.depositForBurn(
    parsedAmount,
    destInfo.domain,
    mintRecipient,
    sourceInfo.usdc,
  )

  const receipt = await tx.wait()

  // Extract MessageSent event to get messageBytes
  const messageTransmitter = new ethers.Contract(
    chainContracts.messageTransmitter,
    MESSAGE_TRANSMITTER_ABI,
    signer,
  )

  let messageBytes = null
  for (const log of receipt.logs) {
    try {
      const parsed = messageTransmitter.interface.parseLog({
        topics: log.topics,
        data: log.data,
      })
      if (parsed && parsed.name === 'MessageSent') {
        messageBytes = parsed.args.message
        break
      }
    } catch {
      // Not a MessageSent event from this contract
    }
  }

  if (!messageBytes) {
    throw new CircleError('MessageSent event not found in transaction receipt', {
      code: 'EVENT_NOT_FOUND',
    })
  }

  // Compute messageHash (keccak256 of messageBytes)
  const messageHash = ethers.keccak256(messageBytes)

  // Extract nonce from DepositForBurn event
  let nonce = null
  for (const log of receipt.logs) {
    try {
      const parsed = tokenMessenger.interface.parseLog({
        topics: log.topics,
        data: log.data,
      })
      if (parsed && parsed.name === 'DepositForBurn') {
        nonce = parsed.args.nonce.toString()
        break
      }
    } catch {
      // Not our event
    }
  }

  return {
    txHash: receipt.hash,
    messageBytes: messageBytes,
    messageHash: messageHash,
    nonce,
    amount,
    source: chain,
    destination: destinationChain,
    recipient,
    blockNumber: receipt.blockNumber,
  }
}

/**
 * Mint USDC on destination chain by calling receiveMessage.
 *
 * Requires the messageBytes from the burn step and the attestation
 * from Circle's IRIS API.
 *
 * @param {object} options
 * @param {string} options.chain - Destination chain name
 * @param {string} options.messageBytes - Message bytes from burn step
 * @param {string} options.attestation - Attestation from IRIS API
 * @param {string} options.privateKey - Wallet private key
 * @param {string} [options.rpcUrl] - RPC endpoint override
 * @param {object} options.contracts - CONTRACTS from circle.js
 * @returns {{ txHash, chain, blockNumber, success }}
 */
export async function mint({ chain, messageBytes, attestation, privateKey, rpcUrl, contracts }) {
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

  const rpc = resolveRpcUrl(chain, rpcUrl)
  const signer = createSigner(privateKey, rpc)

  const messageTransmitter = new ethers.Contract(
    chainContracts.messageTransmitter,
    MESSAGE_TRANSMITTER_ABI,
    signer,
  )

  const tx = await messageTransmitter.receiveMessage(messageBytes, attestation)
  const receipt = await tx.wait()

  return {
    txHash: receipt.hash,
    chain,
    blockNumber: receipt.blockNumber,
    success: receipt.status === 1,
  }
}
