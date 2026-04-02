/**
 * CCTP on-chain operations via the W3 syscall bridge.
 *
 * Uses bridge.chain() for all contract interactions — no bundled ethers.
 * The bridge handles signing, gas estimation, and broadcasting.
 * Private keys are held by the bridge via W3_SECRET_* env vars.
 *
 * Flow:
 *   1. approve-burn: Approve TokenMessenger to spend USDC
 *   2. burn: Call depositForBurn on source chain → get messageBytes + messageHash
 *   3. (wait-for-attestation: existing IRIS API command)
 *   4. mint: Call receiveMessage on destination chain → USDC minted
 */

import { bridge } from '@w3-io/action-core'
import { CircleError } from './circle.js'

/**
 * Pad an Ethereum address to bytes32 for CCTP.
 * 20-byte address left-padded with 12 zero bytes.
 */
function addressToBytes32(address) {
  const clean = address.toLowerCase().replace('0x', '')
  return '0x' + '0'.repeat(24) + clean
}

/**
 * Parse logs JSON from bridge response to find a specific event.
 */
function findEvent(logsJson, contractAddress, eventTopic) {
  const logs = typeof logsJson === 'string' ? JSON.parse(logsJson) : logsJson
  for (const log of logs) {
    const addr = (log.address || '').toLowerCase()
    const topics = log.topics || []
    if (
      addr === contractAddress.toLowerCase() &&
      topics[0]?.toLowerCase() === eventTopic.toLowerCase()
    ) {
      return log
    }
  }
  return null
}

// Event topic hashes
const MESSAGE_SENT_TOPIC =
  '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036'
const DEPOSIT_FOR_BURN_TOPIC =
  '0x2fa9ca894982930190727e75500a97d8dc500233a5065e0f3126c48fbe0343c0'

/**
 * Approve TokenMessenger to spend USDC via bridge.
 */
export async function approveBurn({
  chain,
  amount,
  domains,
  contracts,
}) {
  const chainInfo = domains[chain]
  if (!chainInfo)
    throw new CircleError(`Unknown chain: ${chain}`, { code: 'UNKNOWN_CHAIN' })

  const chainContracts = contracts[chain]
  if (!chainContracts) {
    throw new CircleError(`No CCTP contracts configured for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  }

  // Get decimals via read-contract
  const decimalsResult = await bridge.chain('ethereum', 'read-contract', {
    contractAddress: chainInfo.usdc,
    functionSignature: 'function decimals() view returns (uint8)',
    args: '[]',
  }, chain)
  const decimals = parseInt(decimalsResult.result || '6', 10)

  // Check balance
  const balResult = await bridge.chain('ethereum', 'get-token-balance', {
    address: 'self', // bridge resolves signer address
    tokenAddress: chainInfo.usdc,
  }, chain)

  // Approve
  const approveResult = await bridge.chain('ethereum', 'call-contract', {
    contractAddress: chainInfo.usdc,
    functionSignature:
      'function approve(address spender, uint256 amount) returns (bool)',
    args: JSON.stringify([chainContracts.tokenMessenger, amount]),
  }, chain)

  return {
    txHash: approveResult.txHash,
    spender: chainContracts.tokenMessenger,
    amount,
    chain,
    blockNumber: approveResult.blockNumber,
  }
}

/**
 * Burn USDC on source chain via CCTP depositForBurn.
 */
export async function burn({
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
  if (!sourceInfo)
    throw new CircleError(`Unknown source chain: ${chain}`, {
      code: 'UNKNOWN_CHAIN',
    })
  if (!destInfo)
    throw new CircleError(`Unknown destination chain: ${destinationChain}`, {
      code: 'UNKNOWN_CHAIN',
    })

  const chainContracts = contracts[chain]
  if (!chainContracts)
    throw new CircleError(`No CCTP contracts for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })

  if (!recipient)
    throw new CircleError('recipient address is required', {
      code: 'MISSING_RECIPIENT',
    })

  const mintRecipient = addressToBytes32(recipient)

  let result
  if (destinationCaller) {
    const callerBytes32 = addressToBytes32(destinationCaller)
    result = await bridge.chain('ethereum', 'call-contract', {
      contractAddress: chainContracts.tokenMessenger,
      functionSignature:
        'function depositForBurnWithCaller(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller) returns (uint64 nonce)',
      args: JSON.stringify([
        amount,
        destInfo.domain,
        mintRecipient,
        sourceInfo.usdc,
        callerBytes32,
      ]),
    }, chain)
  } else {
    result = await bridge.chain('ethereum', 'call-contract', {
      contractAddress: chainContracts.tokenMessenger,
      functionSignature:
        'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)',
      args: JSON.stringify([
        amount,
        destInfo.domain,
        mintRecipient,
        sourceInfo.usdc,
      ]),
    }, chain)
  }

  // Extract MessageSent event from logs
  const msgLog = findEvent(
    result.logs,
    chainContracts.messageTransmitter,
    MESSAGE_SENT_TOPIC,
  )
  if (!msgLog) {
    throw new CircleError('MessageSent event not found in receipt', {
      code: 'EVENT_NOT_FOUND',
    })
  }
  const messageBytes = msgLog.data

  // Compute messageHash via bridge crypto
  const hashResult = await bridge.crypto('keccak-256', { data: messageBytes })
  const messageHash = hashResult.hash

  // Extract nonce from DepositForBurn event
  const burnLog = findEvent(
    result.logs,
    chainContracts.tokenMessenger,
    DEPOSIT_FOR_BURN_TOPIC,
  )
  const nonce = burnLog?.topics?.[1]
    ? parseInt(burnLog.topics[1], 16).toString()
    : null

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
 */
export async function mint({
  chain,
  messageBytes,
  attestation,
  contracts,
}) {
  const chainContracts = contracts[chain]
  if (!chainContracts)
    throw new CircleError(`No CCTP contracts for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  if (!messageBytes)
    throw new CircleError('message-bytes is required', {
      code: 'MISSING_MESSAGE_BYTES',
    })
  if (!attestation)
    throw new CircleError('attestation is required', {
      code: 'MISSING_ATTESTATION',
    })

  const result = await bridge.chain('ethereum', 'call-contract', {
    contractAddress: chainContracts.messageTransmitter,
    functionSignature:
      'function receiveMessage(bytes message, bytes attestation) returns (bool success)',
    args: JSON.stringify([messageBytes, attestation]),
  }, chain)

  return {
    txHash: result.txHash,
    chain,
    blockNumber: result.blockNumber,
    success: result.status === 'success',
  }
}

/**
 * Replace a pending CCTP message.
 */
export async function replaceMessage({
  chain,
  originalMessageBytes,
  originalAttestation,
  newDestinationCaller,
  contracts,
}) {
  const chainContracts = contracts[chain]
  if (!chainContracts)
    throw new CircleError(`No CCTP contracts for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  if (!originalMessageBytes)
    throw new CircleError('original-message-bytes is required', {
      code: 'MISSING_MESSAGE_BYTES',
    })
  if (!originalAttestation)
    throw new CircleError('original-attestation is required', {
      code: 'MISSING_ATTESTATION',
    })

  const callerBytes32 = newDestinationCaller
    ? addressToBytes32(newDestinationCaller)
    : '0x' + '0'.repeat(64)

  const result = await bridge.chain('ethereum', 'call-contract', {
    contractAddress: chainContracts.messageTransmitter,
    functionSignature:
      'function replaceMessage(bytes originalMessage, bytes originalAttestation, bytes newMessageBody, bytes32 newDestinationCaller)',
    args: JSON.stringify([
      originalMessageBytes,
      originalAttestation,
      '0x', // empty = keep original body
      callerBytes32,
    ]),
  }, chain)

  // Extract new MessageSent event
  const msgLog = findEvent(
    result.logs,
    chainContracts.messageTransmitter,
    MESSAGE_SENT_TOPIC,
  )
  const newMessageBytes = msgLog?.data || null

  let newMessageHash = null
  if (newMessageBytes) {
    const hashResult = await bridge.crypto('keccak-256', {
      data: newMessageBytes,
    })
    newMessageHash = hashResult.hash
  }

  return {
    txHash: result.txHash,
    chain,
    blockNumber: result.blockNumber,
    newMessageBytes,
    newMessageHash,
  }
}
