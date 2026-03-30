/**
 * CCTP on-chain operations: approve, burn, and mint.
 *
 * Uses the W3 bridge SDK to interact with CCTP smart contracts via
 * the protocol's native chain operations. No ethers.js dependency —
 * the bridge handles RPC connections, ABI encoding, and signing.
 *
 * Signing keys are held by the bridge via W3_SECRET_* and never
 * enter the container.
 *
 * Flow:
 *   1. approve-burn: Approve TokenMessenger to spend USDC
 *   2. burn: Call depositForBurn on source chain → get messageBytes + messageHash
 *   3. (wait-for-attestation: existing Phase 1 command)
 *   4. mint: Call receiveMessage on destination chain → USDC minted
 */

import { w3 } from './bridge.js'
import { CircleError } from './circle.js'

/**
 * Pad an Ethereum address to bytes32 for CCTP.
 *
 * CCTP expects recipient addresses as bytes32 — a 20-byte address
 * left-padded with 12 zero bytes.
 *
 * @param {string} address - 0x-prefixed Ethereum address
 * @returns {string} bytes32 representation (0x + 64 hex chars)
 */
function addressToBytes32(address) {
  const stripped = address.replace(/^0x/, '').toLowerCase()
  return '0x' + stripped.padStart(64, '0')
}

/**
 * Parse a human-readable USDC amount into its smallest unit.
 *
 * @param {string} amount - e.g., "10.5"
 * @param {number} decimals - token decimals (typically 6 for USDC)
 * @returns {string} amount in smallest unit as a decimal string
 */
function parseUnits(amount, decimals) {
  const [whole, frac = ''] = amount.split('.')
  const padded = frac.padEnd(decimals, '0').slice(0, decimals)
  return BigInt(whole + padded).toString()
}

/**
 * Format smallest-unit amount to human-readable.
 *
 * @param {string} raw - amount in smallest unit
 * @param {number} decimals - token decimals
 * @returns {string} human-readable amount
 */
function formatUnits(raw, decimals) {
  const str = raw.padStart(decimals + 1, '0')
  const whole = str.slice(0, str.length - decimals) || '0'
  const frac = str.slice(str.length - decimals)
  return frac ? `${whole}.${frac.replace(/0+$/, '')}` : whole
}

/**
 * Find a log entry matching an event topic signature.
 *
 * @param {Array} logs - Parsed log entries from bridge response
 * @param {string} topicHash - The keccak256 of the event signature
 * @returns {object|null} The matching log entry, or null
 */
function findLog(logs, topicHash) {
  return logs.find((log) => log.topics && log.topics[0] === topicHash) || null
}

/**
 * Approve TokenMessenger to spend USDC.
 *
 * @param {object} options
 * @param {string} options.chain - Source chain name (e.g., "ethereum-sepolia")
 * @param {string} options.amount - USDC amount (human-readable, e.g., "10.5")
 * @param {string} [options.senderAddress] - Sender address for balance check (optional)
 * @param {object} options.domains - DOMAINS from circle.js
 * @param {object} options.contracts - CONTRACTS from circle.js
 * @returns {{ txHash, spender, amount, chain, blockNumber }}
 */
export async function approveBurn({ chain, amount, senderAddress, domains, contracts }) {
  const chainInfo = domains[chain]
  if (!chainInfo) throw new CircleError(`Unknown chain: ${chain}`, { code: 'UNKNOWN_CHAIN' })

  const chainContracts = contracts[chain]
  if (!chainContracts) {
    throw new CircleError(`No CCTP contracts configured for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  }

  // Read token decimals
  const decimalsResult = await w3.ethereum.readContract({
    network: chain,
    contract: chainInfo.usdc,
    method: 'decimals()',
  })
  const decimals = Number(decimalsResult.result)
  const parsedAmount = parseUnits(amount, decimals)

  // Check current balance (if sender address is known)
  if (senderAddress) {
    const balanceResult = await w3.ethereum.readContract({
      network: chain,
      contract: chainInfo.usdc,
      method: 'balanceOf(address)',
      args: [senderAddress],
    })
    const balance = BigInt(balanceResult.result)
    if (balance < BigInt(parsedAmount)) {
      throw new CircleError(
        `Insufficient USDC balance: have ${formatUnits(balance.toString(), decimals)}, need ${amount}`,
        { code: 'INSUFFICIENT_BALANCE' },
      )
    }
  }

  // Always approve — don't skip even if allowance looks sufficient.
  // In a multi-validator environment, different validators execute
  // approve and burn steps. A stale allowance check can cause the
  // burn to revert if the allowance was consumed by a prior run.
  const result = await w3.ethereum.callContract({
    network: chain,
    contract: chainInfo.usdc,
    method: 'approve(address,uint256)',
    args: [chainContracts.tokenMessenger, parsedAmount],
  })

  return {
    txHash: result.txHash,
    spender: chainContracts.tokenMessenger,
    amount,
    skipped: false,
    chain,
    blockNumber: result.blockNumber,
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
 * @param {object} options.domains - DOMAINS from circle.js
 * @param {object} options.contracts - CONTRACTS from circle.js
 * @returns {{ txHash, messageBytes, messageHash, nonce, amount, source, destination }}
 */
export async function burn({ chain, destinationChain, recipient, amount, domains, contracts }) {
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

  // Parse amount
  const decimalsResult = await w3.ethereum.readContract({
    network: chain,
    contract: sourceInfo.usdc,
    method: 'decimals()',
  })
  const decimals = Number(decimalsResult.result)
  const parsedAmount = parseUnits(amount, decimals)

  const mintRecipient = addressToBytes32(recipient)

  // Call depositForBurn
  const result = await w3.ethereum.callContract({
    network: chain,
    contract: chainContracts.tokenMessenger,
    method: 'depositForBurn(uint256,uint32,bytes32,address)',
    args: [parsedAmount, String(destInfo.domain), mintRecipient, sourceInfo.usdc],
  })

  // Parse logs from the receipt to find MessageSent and DepositForBurn events
  const logs = JSON.parse(result.logs || '[]')

  // MessageSent topic: keccak256("MessageSent(bytes)")
  const messageSentTopic = (await w3.crypto.keccak256({ data: toHex('MessageSent(bytes)') })).hash

  const messageSentLog = findLog(logs, messageSentTopic)
  if (!messageSentLog) {
    throw new CircleError('MessageSent event not found in transaction receipt', {
      code: 'EVENT_NOT_FOUND',
    })
  }

  // MessageSent(bytes message) — the message is ABI-encoded in the data field.
  // ABI encoding for a single dynamic bytes: offset (32 bytes) + length (32 bytes) + data.
  const messageData = messageSentLog.data
  const messageBytes = decodeAbiBytes(messageData)

  // Compute messageHash (keccak256 of messageBytes)
  const messageHashResult = await w3.crypto.keccak256({ data: messageBytes })
  const messageHash = messageHashResult.hash

  // DepositForBurn topic: keccak256("DepositForBurn(uint64,address,uint256,address,bytes32,uint32,bytes32,bytes32)")
  const depositForBurnSig =
    'DepositForBurn(uint64,address,uint256,address,bytes32,uint32,bytes32,bytes32)'
  const depositForBurnTopic = (await w3.crypto.keccak256({ data: toHex(depositForBurnSig) })).hash

  const depositLog = findLog(logs, depositForBurnTopic)
  // Nonce is the first indexed parameter (topics[1])
  const nonce = depositLog ? String(BigInt(depositLog.topics[1])) : null

  return {
    txHash: result.txHash,
    messageBytes,
    messageHash,
    nonce,
    amount,
    source: chain,
    destination: destinationChain,
    recipient,
    blockNumber: result.blockNumber,
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
 * @param {object} options.contracts - CONTRACTS from circle.js
 * @returns {{ txHash, chain, blockNumber, success }}
 */
export async function mint({ chain, messageBytes, attestation, contracts }) {
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

  const result = await w3.ethereum.callContract({
    network: chain,
    contract: chainContracts.messageTransmitter,
    method: 'receiveMessage(bytes,bytes)',
    args: [messageBytes, attestation],
  })

  return {
    txHash: result.txHash,
    chain,
    blockNumber: result.blockNumber,
    success: result.status === 'success',
  }
}

// ── Utilities ──────────────────────────────────────────────────────

/**
 * Convert a UTF-8 string to 0x-prefixed hex.
 * @param {string} str
 * @returns {string}
 */
function toHex(str) {
  return '0x' + Buffer.from(str, 'utf8').toString('hex')
}

/**
 * Decode ABI-encoded dynamic bytes from a log data field.
 *
 * ABI encoding for a single `bytes` parameter:
 *   - 32 bytes: offset to data
 *   - 32 bytes: length of data
 *   - N bytes: the actual data (padded to 32-byte boundary)
 *
 * @param {string} data - 0x-prefixed hex string
 * @returns {string} 0x-prefixed hex of the decoded bytes
 */
function decodeAbiBytes(data) {
  const hex = data.replace(/^0x/, '')
  // Read offset (first 32 bytes = 64 hex chars)
  const offset = parseInt(hex.slice(0, 64), 16) * 2
  // Read length at offset
  const length = parseInt(hex.slice(offset, offset + 64), 16) * 2
  // Read data after length
  return '0x' + hex.slice(offset + 64, offset + 64 + length)
}
