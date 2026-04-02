/**
 * CCTP V2 Solana operations — burn and mint.
 *
 * Burn: call depositForBurn on TokenMessengerMinter to send USDC
 *       from Solana to any CCTP-supported chain.
 *
 * Mint: call receiveMessage on MessageTransmitter to receive USDC
 *       on Solana from any CCTP-supported chain.
 *
 * Account layouts and PDA seeds follow the V2 Anchor IDL:
 * https://github.com/circlefin/solana-cctp-contracts/tree/master/programs/v2
 */

import { createHash } from 'node:crypto'
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import bs58 from 'bs58'
import { ethers } from 'ethers'
import { CircleError } from './circle.js'

// Well-known programs
const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111')
const SPL_TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')

const DEFAULT_RPC_URLS = {
  solana: 'https://api.mainnet-beta.solana.com',
  'solana-devnet': 'https://api.devnet.solana.com',
}

// ─── Helpers ──────────────────────────────────────────────────────────

function findPda(programId, seeds) {
  return PublicKey.findProgramAddressSync(seeds, programId)
}

/** Anchor discriminator: SHA256("global:<name>")[0..8] */
function anchorDiscriminator(name) {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8)
}

/** Borsh-encode a Vec<u8>: 4-byte LE length prefix + bytes. */
function borshVec(data) {
  const len = Buffer.alloc(4)
  len.writeUInt32LE(data.length)
  return Buffer.concat([len, data])
}

/** Resolve RPC URL from env, input, or defaults. */
function resolveRpc(chain, inputRpcUrl) {
  const envKey = chain.toUpperCase().replace(/-/g, '_') + '_RPC_URL'
  const rpc = process.env[envKey] || inputRpcUrl || DEFAULT_RPC_URLS[chain]
  if (!rpc) {
    throw new CircleError(
      `No RPC URL for "${chain}". Set ${envKey} env var or provide rpc-url input.`,
      { code: 'MISSING_RPC_URL' },
    )
  }
  return rpc
}

/** Parse a Solana keypair from base58, JSON array, or hex. */
function parseKeypair(input) {
  if (!input) {
    throw new CircleError('private-key is required for Solana CCTP', {
      code: 'MISSING_PRIVATE_KEY',
    })
  }
  if (input.startsWith('[')) {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(input)))
  }
  if (input.startsWith('0x') || /^[0-9a-fA-F]{128}$/.test(input)) {
    return Keypair.fromSecretKey(Buffer.from(input.replace(/^0x/, ''), 'hex'))
  }
  return Keypair.fromSecretKey(bs58.decode(input))
}

/** Validate chain/contracts/domains and return resolved objects. */
function resolveChain(chain, contracts, domains) {
  const chainContracts = contracts[chain]
  if (!chainContracts) {
    throw new CircleError(`No CCTP contracts configured for ${chain}`, {
      code: 'MISSING_CONTRACTS',
    })
  }
  const chainInfo = domains[chain]
  if (!chainInfo) {
    throw new CircleError(`Unknown chain: ${chain}`, {
      code: 'UNKNOWN_CHAIN',
    })
  }
  return {
    messageTransmitterId: new PublicKey(chainContracts.messageTransmitter),
    tokenMessengerId: new PublicKey(chainContracts.tokenMessenger),
    usdcMint: new PublicKey(chainInfo.usdc),
    chainInfo,
    chainContracts,
  }
}

/** Build, sign, send, and confirm a versioned transaction. */
async function sendAndConfirm(connection, payer, instructions) {
  const latestBlockhash = await connection.getLatestBlockhash()
  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions,
  }).compileToV0Message()

  const tx = new VersionedTransaction(messageV0)
  tx.sign([payer])

  const signature = await connection.sendTransaction(tx, { maxRetries: 3 })
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    'confirmed',
  )
  return signature
}

// ─── CCTP V2 Message Parsing ──────────────────────────────────────────

/**
 * Parse fields from CCTP V2 message bytes.
 *
 * Message layout (big-endian):
 *   bytes 0-3:     version (uint32)
 *   bytes 4-7:     sourceDomain (uint32)
 *   bytes 8-11:    destinationDomain (uint32)
 *   bytes 12-43:   nonce (32 bytes in V2)
 *   bytes 44-75:   sender (bytes32)
 *   bytes 76-107:  recipient (bytes32)
 *   bytes 108-139: destinationCaller (bytes32)
 *   bytes 140+:    messageBody
 *
 * Message body for depositForBurn:
 *   bytes 0-3:     version (uint32)
 *   bytes 4-35:    burnToken (bytes32)
 *   bytes 36-67:   mintRecipient (bytes32)
 *   bytes 68-99:   amount (uint256)
 *   bytes 100-131: messageSender (bytes32)
 */
const MSG = {
  NONCE_INDEX: 12,
  SENDER_INDEX: 44,
  BODY_INDEX: 140,
}

function parseMessage(messageBytes) {
  const buf = Buffer.from(messageBytes.replace(/^0x/, ''), 'hex')
  const sourceDomain = buf.readUInt32BE(4)
  // V2 nonce is 32 bytes (bytes 12-43)
  const nonceBytes = buf.subarray(MSG.NONCE_INDEX, MSG.SENDER_INDEX)
  // Message body
  const body = buf.subarray(MSG.BODY_INDEX)
  const burnToken = body.subarray(4, 36)
  const mintRecipient = body.subarray(36, 68)
  return { sourceDomain, nonceBytes, burnToken, mintRecipient, raw: buf }
}

// ─── Mint (receiveMessage) ────────────────────────────────────────────

/**
 * Mint USDC on Solana by calling receiveMessage on MessageTransmitter V2.
 *
 * Account order follows the Anchor IDL:
 *   1. payer (signer, writable)
 *   2. caller (signer)
 *   3. authority_pda
 *   4. message_transmitter state
 *   5. used_nonce (writable, init)
 *   6. receiver (TokenMessengerMinter program)
 *   7. system_program
 *   8. event_authority (MessageTransmitter, #[event_cpi])
 *   9. program self (MessageTransmitter, #[event_cpi])
 *   -- remaining accounts for TokenMessengerMinter CPI --
 *   10. token_messenger state
 *   11. remote_token_messenger
 *   12. token_minter
 *   13. local_token (writable)
 *   14. token_pair
 *   15. fee_recipient_token_account (writable, V2)
 *   16. recipient_token_account (writable)
 *   17. custody_token_account (writable)
 *   18. token_program
 *   19. event_authority (TokenMessengerMinter, #[event_cpi])
 *   20. program (TokenMessengerMinter)
 */
export async function mintSolana({
  chain,
  messageBytes,
  attestation,
  privateKey,
  rpcUrl,
  contracts,
  domains,
}) {
  if (!messageBytes) {
    throw new CircleError('message-bytes is required', { code: 'MISSING_MESSAGE_BYTES' })
  }
  if (!attestation) {
    throw new CircleError('attestation is required', { code: 'MISSING_ATTESTATION' })
  }

  const { messageTransmitterId, tokenMessengerId, usdcMint } = resolveChain(
    chain,
    contracts,
    domains,
  )
  const payer = parseKeypair(privateKey)
  const connection = new Connection(resolveRpc(chain, rpcUrl), 'confirmed')

  const { sourceDomain, nonceBytes, burnToken, mintRecipient } = parseMessage(messageBytes)
  const mintRecipientPubkey = new PublicKey(mintRecipient)

  // Derive PDAs
  const [authorityPda] = findPda(messageTransmitterId, [
    Buffer.from('message_transmitter_authority'),
    tokenMessengerId.toBuffer(),
  ])
  const [messageTransmitterState] = findPda(messageTransmitterId, [
    Buffer.from('message_transmitter'),
  ])
  // V2: used_nonce PDA uses raw nonce bytes (32 bytes), not bitmap
  const [usedNonce] = findPda(messageTransmitterId, [Buffer.from('used_nonce'), nonceBytes])
  const [mtEventAuthority] = findPda(messageTransmitterId, [Buffer.from('__event_authority')])

  const [tokenMessengerState] = findPda(tokenMessengerId, [Buffer.from('token_messenger')])
  const [remoteTokenMessenger] = findPda(tokenMessengerId, [
    Buffer.from('remote_token_messenger'),
    uint32BE(sourceDomain),
  ])
  const [tokenMinter] = findPda(tokenMessengerId, [Buffer.from('token_minter')])
  const [localToken] = findPda(tokenMessengerId, [
    Buffer.from('local_token'),
    usdcMint.toBuffer(),
  ])
  const [tokenPair] = findPda(tokenMessengerId, [
    Buffer.from('token_pair'),
    uint32BE(sourceDomain),
    burnToken,
  ])
  // Fee recipient — for permissionless receiveMessage, fees go to the caller
  const feeRecipientTokenAccount = getAssociatedTokenAddressSync(usdcMint, payer.publicKey, true)
  const recipientTokenAccount = getAssociatedTokenAddressSync(usdcMint, mintRecipientPubkey, true)
  const [custodyTokenAccount] = findPda(tokenMessengerId, [
    Buffer.from('custody'),
    usdcMint.toBuffer(),
  ])
  const [tmmEventAuthority] = findPda(tokenMessengerId, [Buffer.from('__event_authority')])

  // Instruction data: discriminator + borsh(message) + borsh(attestation)
  const msgData = Buffer.from(messageBytes.replace(/^0x/, ''), 'hex')
  const attData = Buffer.from(attestation.replace(/^0x/, ''), 'hex')
  const data = Buffer.concat([
    anchorDiscriminator('receive_message'),
    borshVec(msgData),
    borshVec(attData),
  ])

  const instruction = {
    programId: messageTransmitterId,
    keys: [
      // Core receiveMessage accounts
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // caller
      { pubkey: authorityPda, isSigner: false, isWritable: false },
      { pubkey: messageTransmitterState, isSigner: false, isWritable: false },
      { pubkey: usedNonce, isSigner: false, isWritable: true },
      { pubkey: tokenMessengerId, isSigner: false, isWritable: false }, // receiver
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      // #[event_cpi] for MessageTransmitter
      { pubkey: mtEventAuthority, isSigner: false, isWritable: false },
      { pubkey: messageTransmitterId, isSigner: false, isWritable: false },
      // Remaining accounts for TokenMessengerMinter CPI
      { pubkey: tokenMessengerState, isSigner: false, isWritable: false },
      { pubkey: remoteTokenMessenger, isSigner: false, isWritable: false },
      { pubkey: tokenMinter, isSigner: false, isWritable: false },
      { pubkey: localToken, isSigner: false, isWritable: true },
      { pubkey: tokenPair, isSigner: false, isWritable: false },
      { pubkey: feeRecipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: custodyTokenAccount, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM, isSigner: false, isWritable: false },
      // #[event_cpi] for TokenMessengerMinter
      { pubkey: tmmEventAuthority, isSigner: false, isWritable: false },
      { pubkey: tokenMessengerId, isSigner: false, isWritable: false },
    ],
    data,
  }

  const signature = await sendAndConfirm(connection, payer, [instruction])

  return { signature, chain, success: true }
}

// ─── Burn (depositForBurn) ────────────────────────────────────────────

/**
 * Burn USDC on Solana via depositForBurn on TokenMessengerMinter V2.
 *
 * No SPL approve needed — the owner signs directly as burn authority.
 *
 * Account order:
 *   1. owner (signer)
 *   2. event_rent_payer (signer, writable) — pays for MessageSent event account
 *   3. sender_authority_pda
 *   4. burn_token_account (writable)
 *   5. denylist_account
 *   6. message_transmitter (writable)
 *   7. token_messenger
 *   8. remote_token_messenger
 *   9. token_minter
 *   10. local_token (writable)
 *   11. burn_token_mint (writable)
 *   12. message_sent_event_data (signer, writable) — fresh keypair
 *   13. message_transmitter_program
 *   14. token_messenger_minter_program (self)
 *   15. token_program
 *   16. system_program
 *   17. event_authority (#[event_cpi])
 *   18. program self (#[event_cpi])
 *
 * @returns {{ signature, messageBytes, messageHash, nonce, source, destination }}
 */
export async function burnSolana({
  chain,
  destinationChain,
  recipient,
  amount,
  privateKey,
  rpcUrl,
  contracts,
  domains,
  destinationCaller,
}) {
  if (!recipient) {
    throw new CircleError('destination-address is required', { code: 'MISSING_RECIPIENT' })
  }
  if (!amount) {
    throw new CircleError('amount is required', { code: 'MISSING_AMOUNT' })
  }

  const { messageTransmitterId, tokenMessengerId, usdcMint, chainInfo } = resolveChain(
    chain,
    contracts,
    domains,
  )
  const destInfo = domains[destinationChain]
  if (!destInfo) {
    throw new CircleError(`Unknown destination chain: ${destinationChain}`, {
      code: 'UNKNOWN_CHAIN',
    })
  }

  const payer = parseKeypair(privateKey)
  const connection = new Connection(resolveRpc(chain, rpcUrl), 'confirmed')

  // Parse amount to raw USDC units (6 decimals)
  const rawAmount = BigInt(Math.round(parseFloat(amount) * 1e6))

  // The recipient address: for EVM destinations, left-pad 20 bytes to 32.
  // For Solana destinations, use the pubkey directly.
  let mintRecipientBytes
  if (recipient.startsWith('0x')) {
    // EVM address → bytes32
    mintRecipientBytes = Buffer.alloc(32)
    Buffer.from(recipient.replace(/^0x/, ''), 'hex').copy(mintRecipientBytes, 12)
  } else {
    // Solana pubkey
    mintRecipientBytes = new PublicKey(recipient).toBuffer()
  }

  // destinationCaller: restrict who can call receiveMessage (bytes32, default = anyone)
  const callerBytes = destinationCaller
    ? destinationCaller.startsWith('0x')
      ? Buffer.from(destinationCaller.replace(/^0x/, '').padStart(64, '0'), 'hex')
      : new PublicKey(destinationCaller).toBuffer()
    : Buffer.alloc(32) // zero = permissionless

  // Derive PDAs
  const [senderAuthorityPda] = findPda(tokenMessengerId, [Buffer.from('sender_authority')])
  const burnTokenAccount = getAssociatedTokenAddressSync(usdcMint, payer.publicKey)
  const [denylistAccount] = findPda(tokenMessengerId, [
    Buffer.from('denylist_account'),
    payer.publicKey.toBuffer(),
  ])
  const [messageTransmitterState] = findPda(messageTransmitterId, [
    Buffer.from('message_transmitter'),
  ])
  const [tokenMessengerState] = findPda(tokenMessengerId, [Buffer.from('token_messenger')])
  const [remoteTokenMessenger] = findPda(tokenMessengerId, [
    Buffer.from('remote_token_messenger'),
    uint32BE(destInfo.domain),
  ])
  const [tokenMinter] = findPda(tokenMessengerId, [Buffer.from('token_minter')])
  const [localToken] = findPda(tokenMessengerId, [
    Buffer.from('local_token'),
    usdcMint.toBuffer(),
  ])
  const [eventAuthority] = findPda(tokenMessengerId, [Buffer.from('__event_authority')])

  // MessageSent event data account — must be a fresh keypair
  const messageSentEventData = Keypair.generate()

  // Instruction data: discriminator + params
  const data = Buffer.concat([
    anchorDiscriminator('deposit_for_burn'),
    uint64LE(rawAmount),
    uint32LE(destInfo.domain),
    mintRecipientBytes,
    callerBytes,
    uint64LE(0n), // max_fee (0 = no fee limit)
    uint32LE(0), // min_finality_threshold (0 = default)
  ])

  const instruction = {
    programId: tokenMessengerId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // owner
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // event_rent_payer
      { pubkey: senderAuthorityPda, isSigner: false, isWritable: false },
      { pubkey: burnTokenAccount, isSigner: false, isWritable: true },
      { pubkey: denylistAccount, isSigner: false, isWritable: false },
      { pubkey: messageTransmitterState, isSigner: false, isWritable: true },
      { pubkey: tokenMessengerState, isSigner: false, isWritable: false },
      { pubkey: remoteTokenMessenger, isSigner: false, isWritable: false },
      { pubkey: tokenMinter, isSigner: false, isWritable: false },
      { pubkey: localToken, isSigner: false, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: true }, // burn_token_mint
      { pubkey: messageSentEventData.publicKey, isSigner: true, isWritable: true },
      { pubkey: messageTransmitterId, isSigner: false, isWritable: false },
      { pubkey: tokenMessengerId, isSigner: false, isWritable: false }, // self
      { pubkey: SPL_TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      // #[event_cpi]
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: tokenMessengerId, isSigner: false, isWritable: false },
    ],
    data,
  }

  // Need to sign with both payer and the event data keypair
  const latestBlockhash = await connection.getLatestBlockhash()
  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [instruction],
  }).compileToV0Message()

  const tx = new VersionedTransaction(messageV0)
  tx.sign([payer, messageSentEventData])

  const signature = await connection.sendTransaction(tx, { maxRetries: 3 })
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    'confirmed',
  )

  // Fetch the MessageSent event data to extract messageBytes and messageHash
  const eventAccountInfo = await connection.getAccountInfo(messageSentEventData.publicKey)
  if (!eventAccountInfo) {
    throw new CircleError('MessageSent event account not found after burn', {
      code: 'EVENT_NOT_FOUND',
    })
  }

  // The event data account contains the CCTP message.
  // Skip the 8-byte Anchor discriminator prefix.
  const eventData = eventAccountInfo.data
  const messageData = eventData.subarray(8)

  // Extract the actual message bytes (Borsh Vec<u8>: 4-byte LE length + data)
  const msgLen = messageData.readUInt32LE(0)
  const messageBytesBuf = messageData.subarray(4, 4 + msgLen)
  const messageBytesHex = '0x' + messageBytesBuf.toString('hex')

  // Compute messageHash (keccak256)
  // CCTP uses keccak256 for the message hash across all chains
  const messageHash = ethers.keccak256(messageBytesHex)

  return {
    signature,
    messageBytes: messageBytesHex,
    messageHash,
    amount,
    source: chain,
    destination: destinationChain,
    recipient,
  }
}

// ─── Encoding helpers ────────────────────────────────────────────────

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
