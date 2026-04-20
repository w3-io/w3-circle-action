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

import { ethereum, crypto } from '@w3-io/action-core'
import { CircleError } from './circle.js'

/**
 * Pad an EVM address to bytes32 for CCTP.
 * 20-byte address left-padded with 12 zero bytes.
 */
export function addressToBytes32(address) {
  const clean = address.replace(/^0x/, '').toLowerCase().padStart(40, '0')
  return '0x' + '0'.repeat(24) + clean
}

/**
 * Parse a uint256 amount from human-readable to raw units.
 * Reads decimals from the USDC contract.
 */
export async function parseAmount(network, usdcAddress, amount, rpcUrl) {
  // Read USDC decimals
  const { result: decimalsStr } = await ethereum.readContract({
    network,
    contract: usdcAddress,
    method: 'function decimals() returns (uint8)',
    ...(rpcUrl ? { rpcUrl } : {}),
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
export async function approveBurn({ chain, amount, domains, contracts, rpcUrl }) {
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new Error('amount must be a positive number')
  }

  const chainInfo = domains[chain]
  if (!chainInfo) throw new CircleError(`Unknown chain: ${chain}`, { code: 'UNKNOWN_CHAIN' })

  const chainContracts = contracts[chain]
  if (!chainContracts) {
    throw new CircleError(`No CCTP contracts configured for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  }

  const network = chain
  const parsedAmount = await parseAmount(network, chainInfo.usdc, amount, rpcUrl)

  const result = await ethereum.callContract({
    network,
    contract: chainInfo.usdc,
    method: 'function approve(address,uint256) returns (bool)',
    args: [chainContracts.tokenMessenger, parsedAmount],
    ...(rpcUrl ? { rpcUrl } : {}),
  })

  return {
    txHash: result.txHash || result.transactionHash || result.signature,
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
export async function burn({
  rpcUrl,
  chain,
  destinationChain,
  recipient,
  amount,
  domains,
  contracts,
  destinationCaller,
}) {
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new Error('amount must be a positive number')
  }

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

  const network = chain
  const rpc = rpcUrl ? { rpcUrl } : {}
  const parsedAmount = await parseAmount(network, sourceInfo.usdc, amount, rpcUrl)
  const mintRecipient = addressToBytes32(recipient)

  // Approve USDC for TokenMessenger (combined into burn to avoid cross-step nonce races)
  await ethereum.callContract({
    network,
    contract: sourceInfo.usdc,
    method: 'function approve(address,uint256) returns (bool)',
    args: [chainContracts.tokenMessenger, parsedAmount],
    ...rpc,
  })

  // Wait for approve tx to confirm before submitting burn tx.
  // Ethereum: 12s blocks, Base: 2s blocks.
  // TODO: Replace with actual tx confirmation wait
  const BLOCK_WAIT = network === 'ethereum' ? 15000 : 10000
  await new Promise((resolve) => setTimeout(resolve, BLOCK_WAIT))

  const DEFAULT_MAX_FEE = '100000' // 0.10 USDC
  const callerBytes32 = destinationCaller
    ? addressToBytes32(destinationCaller)
    : '0x0000000000000000000000000000000000000000000000000000000000000000'

  const result = await ethereum.callContract({
    network,
    contract: chainContracts.tokenMessenger,
    method: 'function depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
    args: [
      parsedAmount,
      destInfo.domain,
      mintRecipient,
      sourceInfo.usdc,
      callerBytes32,
      DEFAULT_MAX_FEE,
      '0',
    ],
    ...rpc,
  })

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
  const { hash: messageHash } = await crypto.keccak256({ data: messageBytes })

  return {
    txHash: result.txHash || result.transactionHash || result.signature,
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
export async function mint({ chain, messageBytes, attestation, contracts, rpcUrl }) {
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

  const rpc = rpcUrl ? { rpcUrl } : {}
  const result = await ethereum.callContract({
    network,
    contract: chainContracts.messageTransmitter,
    method: 'function receiveMessage(bytes,bytes)',
    ...rpc,
    args: [messageBytes, attestation],
  })

  return {
    txHash: result.txHash || result.transactionHash || result.signature,
    chain,
    success: true,
  }
}

/**
 * Replace a pending CCTP message on the source chain.
 */
export async function replaceMessage({
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
    const { hash } = await crypto.keccak256({ data: newMessageBytes })
    newMessageHash = '0x' + hash
  }

  return {
    txHash: result.txHash || result.transactionHash || result.signature,
    chain,
    newMessageBytes,
    newMessageHash,
  }
}
