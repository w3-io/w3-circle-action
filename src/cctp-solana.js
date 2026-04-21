/**
 * CCTP V2 Solana operations via the W3 bridge.
 *
 * All operations — including PDA derivation and address encoding —
 * go through the bridge. No @solana/web3.js dependency.
 *
 * Burn: depositForBurn on TokenMessengerMinter
 * Mint: receiveMessage on MessageTransmitter
 */

import { createHash } from 'node:crypto'
import { solana, crypto } from '@w3-io/action-core'
import { CircleError } from './circle.js'

// ─── Bridge-based helpers ────────────────────────────────────────────

/** Derive a PDA via the bridge. Returns the base58 address. */
async function findPda(programId, seeds) {
  // Convert Buffer seeds to hex for the bridge
  const hexSeeds = seeds.map((s) => (Buffer.isBuffer(s) ? '0x' + s.toString('hex') : s))
  const result = await solana.findPda({ seeds: hexSeeds, programId })
  return result.address
}

/** Decode a base58 address to raw bytes via the bridge. */
async function decodeAddr(address) {
  const result = await solana.decodeAddress({ address })
  return Buffer.from(result.bytes.replace(/^0x/, ''), 'hex')
}

/** Get ATA address via the bridge. */
async function getAta(mint, owner) {
  const result = await solana.getAta({ owner, mint })
  return result.address
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
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8)
}

/** Borsh-encode a Vec<u8>: 4-byte LE length + bytes */
function borshVec(data) {
  const len = Buffer.alloc(4)
  len.writeUInt32LE(data.length)
  return Buffer.concat([len, data])
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
export async function mintSolana({
  chain,
  messageBytes,
  attestation,
  contracts,
  domains,
  rpcUrl: _rpcUrl,
}) {
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

  const { pubkey: payerPubkey } = await solana.payerAddress()

  const { sourceDomain, nonceBytes, burnToken, mintRecipient } = parseMessage(messageBytes)

  // Encode the raw mintRecipient bytes back to base58
  const mintRecipientHex = '0x' + Buffer.from(mintRecipient).toString('hex')
  const { address: mintRecipientB58 } = await solana.encodeAddress({ bytes: mintRecipientHex })

  // Derive PDAs via bridge
  const tmmIdBytes = await decodeAddr(tmmId)
  const usdcMintBytes = await decodeAddr(usdcMint)

  const authorityPda = await findPda(mtId, [
    Buffer.from('message_transmitter_authority'),
    tmmIdBytes,
  ])
  const mtState = await findPda(mtId, [Buffer.from('message_transmitter')])
  const usedNonce = await findPda(mtId, [Buffer.from('used_nonce'), nonceBytes])
  const mtEventAuth = await findPda(mtId, [Buffer.from('__event_authority')])

  const tmmState = await findPda(tmmId, [Buffer.from('token_messenger')])
  const remoteTmm = await findPda(tmmId, [
    Buffer.from('remote_token_messenger'),
    uint32BE(sourceDomain),
  ])
  const tokenMinter = await findPda(tmmId, [Buffer.from('token_minter')])
  const localToken = await findPda(tmmId, [Buffer.from('local_token'), usdcMintBytes])
  const tokenPair = await findPda(tmmId, [
    Buffer.from('token_pair'),
    uint32BE(sourceDomain),
    burnToken,
  ])
  const feeRecipientAta = await getAta(usdcMint, mintRecipientB58)
  const recipientAta = await getAta(usdcMint, mintRecipientB58)
  const custody = await findPda(tmmId, [Buffer.from('custody'), usdcMintBytes])
  const tmmEventAuth = await findPda(tmmId, [Buffer.from('__event_authority')])

  // Instruction data
  const msgData = Buffer.from(messageBytes.replace(/^0x/, ''), 'hex')
  const attData = Buffer.from(attestation.replace(/^0x/, ''), 'hex')
  const data =
    '0x' +
    Buffer.concat([
      anchorDiscriminator('receive_message'),
      borshVec(msgData),
      borshVec(attData),
    ]).toString('hex')

  const SPL_TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  const SYSTEM = '11111111111111111111111111111111'

  const accounts = [
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: payerPubkey, isSigner: true, isWritable: false },
    { pubkey: authorityPda, isSigner: false, isWritable: false },
    { pubkey: mtState, isSigner: false, isWritable: false },
    { pubkey: usedNonce, isSigner: false, isWritable: true },
    { pubkey: tmmId, isSigner: false, isWritable: false },
    { pubkey: SYSTEM, isSigner: false, isWritable: false },
    { pubkey: mtEventAuth, isSigner: false, isWritable: false },
    { pubkey: mtId, isSigner: false, isWritable: false },
    { pubkey: tmmState, isSigner: false, isWritable: false },
    { pubkey: remoteTmm, isSigner: false, isWritable: false },
    { pubkey: tokenMinter, isSigner: false, isWritable: false },
    { pubkey: localToken, isSigner: false, isWritable: true },
    { pubkey: tokenPair, isSigner: false, isWritable: false },
    { pubkey: feeRecipientAta, isSigner: false, isWritable: true },
    { pubkey: recipientAta, isSigner: false, isWritable: true },
    { pubkey: custody, isSigner: false, isWritable: true },
    { pubkey: SPL_TOKEN, isSigner: false, isWritable: false },
    { pubkey: tmmEventAuth, isSigner: false, isWritable: false },
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
export async function burnSolana({
  chain,
  destinationChain,
  recipient,
  amount,
  contracts,
  domains,
  destinationCaller,
}) {
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new Error('amount must be a positive number')
  }

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

  const { pubkey: payerPubkey } = await solana.payerAddress()

  // Recipient: EVM address → bytes32, Solana pubkey → 32 bytes via bridge
  let mintRecipientBytes
  if (recipient.startsWith('0x')) {
    mintRecipientBytes = Buffer.alloc(32)
    Buffer.from(recipient.replace(/^0x/, ''), 'hex').copy(mintRecipientBytes, 12)
  } else {
    mintRecipientBytes = await decodeAddr(recipient)
  }

  let callerBytes
  if (destinationCaller) {
    if (destinationCaller.startsWith('0x')) {
      callerBytes = Buffer.from(destinationCaller.replace(/^0x/, '').padStart(64, '0'), 'hex')
    } else {
      callerBytes = await decodeAddr(destinationCaller)
    }
  } else {
    callerBytes = Buffer.alloc(32)
  }

  const { pubkey: eventDataPubkey } = await solana.generateKeypair()

  // Derive PDAs via bridge
  const payerBytes = await decodeAddr(payerPubkey)
  const usdcMintBytes = await decodeAddr(usdcMint)

  const senderAuth = await findPda(tmmId, [Buffer.from('sender_authority')])
  const payerAta = await getAta(usdcMint, payerPubkey)
  const denylist = await findPda(tmmId, [Buffer.from('denylist_account'), payerBytes])
  const mtState = await findPda(mtId, [Buffer.from('message_transmitter')])
  const tmmState = await findPda(tmmId, [Buffer.from('token_messenger')])
  const remoteTmm = await findPda(tmmId, [
    Buffer.from('remote_token_messenger'),
    uint32BE(destInfo.domain),
  ])
  const tokenMinter = await findPda(tmmId, [Buffer.from('token_minter')])
  const localToken = await findPda(tmmId, [Buffer.from('local_token'), usdcMintBytes])
  const eventAuth = await findPda(tmmId, [Buffer.from('__event_authority')])

  const SPL_TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  const SYSTEM = '11111111111111111111111111111111'

  const data =
    '0x' +
    Buffer.concat([
      anchorDiscriminator('deposit_for_burn'),
      uint64LE(rawAmount),
      uint32LE(destInfo.domain),
      mintRecipientBytes,
      callerBytes,
      uint64LE(100000n), // max_fee: match EVM DEFAULT_MAX_FEE
      uint32LE(0), // min_finality_threshold
    ]).toString('hex')

  const accounts = [
    { pubkey: payerPubkey, isSigner: true, isWritable: false },
    { pubkey: payerPubkey, isSigner: true, isWritable: true },
    { pubkey: senderAuth, isSigner: false, isWritable: false },
    { pubkey: payerAta, isSigner: false, isWritable: true },
    { pubkey: denylist, isSigner: false, isWritable: false },
    { pubkey: mtState, isSigner: false, isWritable: true },
    { pubkey: tmmState, isSigner: false, isWritable: false },
    { pubkey: remoteTmm, isSigner: false, isWritable: false },
    { pubkey: tokenMinter, isSigner: false, isWritable: false },
    { pubkey: localToken, isSigner: false, isWritable: true },
    { pubkey: usdcMint, isSigner: false, isWritable: true },
    { pubkey: eventDataPubkey, isSigner: true, isWritable: true },
    { pubkey: mtId, isSigner: false, isWritable: false },
    { pubkey: tmmId, isSigner: false, isWritable: false },
    { pubkey: SPL_TOKEN, isSigner: false, isWritable: false },
    { pubkey: SYSTEM, isSigner: false, isWritable: false },
    { pubkey: eventAuth, isSigner: false, isWritable: false },
    { pubkey: tmmId, isSigner: false, isWritable: false },
  ]

  const result = await solana.callProgram({
    network: chain,
    programId: tmmId,
    accounts,
    data,
    ephemeralSignerPubkeys: [eventDataPubkey],
  })

  const eventAccount = await solana.getAccount({
    network: chain,
    address: eventDataPubkey,
  })

  const eventData = Buffer.from(eventAccount.data || '', 'base64')
  const msgLen = eventData.readUInt32LE(8)
  const msgBytes = eventData.subarray(12, 12 + msgLen)
  const messageBytesHex = '0x' + msgBytes.toString('hex')

  const { hash: messageHash } = await crypto.keccak256({ data: messageBytesHex })

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
