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

import { createHash } from 'node:crypto'
import { PublicKey } from '@solana/web3.js'
import { bridge } from '@w3-io/action-core'
import { CircleError } from './circle.js'

// Thin wrappers over action-core bridge to match the existing calling convention.
const solana = {
  payerAddress() {
    return bridge.chain('solana', 'payer-address', {})
  },
  generateKeypair() {
    return bridge.chain('solana', 'generate-keypair', {})
  },
  callProgram(params) {
    return bridge.chain('solana', 'call-program', params)
  },
  getAccount(params) {
    return bridge.chain('solana', 'get-account', params)
  },
}

const crypto = {
  keccak256({ data }) {
    return bridge.crypto('keccak256', { data })
  },
}

// ─── PDA Derivation ───────────────────────────────────────────────
// Uses @solana/web3.js PublicKey.findProgramAddressSync only.
// W3-332 will replace this with bridge.solana.findPda().

function findPda(programId, seeds) {
  return PublicKey.findProgramAddressSync(
    seeds,
    new PublicKey(programId),
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
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8)
}

/** Borsh-encode a Vec<u8>: 4-byte LE length + bytes */
function borshVec(data) {
  const len = Buffer.alloc(4)
  len.writeUInt32LE(data.length)
  return Buffer.concat([len, data])
}

/** Get associated token address (SPL Token convention) */
function getAta(mint, owner) {
  const [ata] = PublicKey.findProgramAddressSync(
    [
      new PublicKey(owner).toBuffer(),
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(),
      new PublicKey(mint).toBuffer(),
    ],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
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
export async function mintSolana({ chain, messageBytes, attestation, contracts, domains, rpcUrl }) {
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
  const mintRecipientB58 = new PublicKey(mintRecipient).toBase58()

  // Derive PDAs
  const [authorityPda] = findPda(mtId, [
    Buffer.from('message_transmitter_authority'),
    new PublicKey(tmmId).toBuffer(),
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
    new PublicKey(usdcMint).toBuffer(),
  ])
  const [tokenPair] = findPda(tmmId, [
    Buffer.from('token_pair'),
    uint32BE(sourceDomain),
    burnToken,
  ])
  const feeRecipientAta = getAta(usdcMint, mintRecipientB58) // fee goes to recipient
  const recipientAta = getAta(usdcMint, mintRecipientB58)
  const [custody] = findPda(tmmId, [Buffer.from('custody'), new PublicKey(usdcMint).toBuffer()])
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
export async function burnSolana({
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
    mintRecipientBytes = new PublicKey(recipient).toBuffer()
  }

  const callerBytes = destinationCaller
    ? destinationCaller.startsWith('0x')
      ? Buffer.from(destinationCaller.replace(/^0x/, '').padStart(64, '0'), 'hex')
      : new PublicKey(destinationCaller).toBuffer()
    : Buffer.alloc(32)

  // Generate ephemeral keypair for MessageSent event data
  const { pubkey: eventDataPubkey } = await solana.generateKeypair()

  // Derive PDAs using the actual payer pubkey
  const [senderAuth] = findPda(tmmId, [Buffer.from('sender_authority')])
  const payerAta = getAta(usdcMint, payerPubkey)
  const [denylist] = findPda(tmmId, [
    Buffer.from('denylist_account'),
    new PublicKey(payerPubkey).toBuffer(),
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
    new PublicKey(usdcMint).toBuffer(),
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
