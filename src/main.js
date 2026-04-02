import * as core from '@actions/core'
import { CircleClient, CircleError, DOMAINS, CONTRACTS } from './circle.js'
import { approveBurn, burn, mint, replaceMessage } from './cctp-onchain.js'
import { mintSolana, burnSolana } from './cctp-solana.js'

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

export async function run() {
  try {
    const command = core.getInput('command', { required: true })
    const handler = COMMANDS[command]

    if (!handler) {
      core.setFailed(
        `Unknown command: "${command}". Available: ${Object.keys(COMMANDS).join(', ')}`,
      )
      return
    }

    const timeoutInput = core.getInput('timeout')
    const client = new CircleClient({
      apiKey: core.getInput('api-key') || undefined,
      apiUrl: core.getInput('api-url') || undefined,
      entitySecret: core.getInput('entity-secret') || undefined,
      irisUrl: core.getInput('iris-url') || undefined,
      sandbox: core.getInput('sandbox') === 'true',
      timeout: timeoutInput ? Number(timeoutInput) : undefined,
    })

    const result = await handler(client)
    core.setOutput('result', JSON.stringify(result))

    try { writeSummary(command, result) } catch { /* summary is best-effort */ }
  } catch (error) {
    if (error instanceof CircleError) {
      core.setFailed(`Circle error (${error.code}): ${error.message}`)
    } else {
      core.setFailed(error.message)
    }
  }
}

// -- Command handlers -------------------------------------------------------

async function runGetAttestation(client) {
  const messageHash = core.getInput('message-hash', { required: true })
  return client.getAttestation(messageHash)
}

async function runWaitForAttestation(client) {
  // Support both hyphenated and underscored input names
  const txHash = core.getInput('tx-hash') || core.getInput('tx_hash')
  const sourceDomain = core.getInput('source-domain') || core.getInput('source_domain')
  const messageHash = core.getInput('message-hash') || core.getInput('message_hash')
  const pollIntervalInput = core.getInput('poll-interval')
  const maxAttemptsInput = core.getInput('max-attempts')
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
  const network = core.getInput('network') || undefined
  return client.getSupportedChains(network)
}

async function runGetDomainInfo(client) {
  const chain = core.getInput('chain', { required: true })
  return client.getDomainInfo(chain)
}

// -- CCTP on-chain commands --------------------------------------------------

async function runApproveBurn() {
  const chain = core.getInput('chain', { required: true })
  const amount = core.getInput('amount', { required: true })
  return approveBurn({ chain, amount, domains: DOMAINS, contracts: CONTRACTS })
}

async function runBurn() {
  const chain = core.getInput('chain', { required: true })
  const destinationChain = core.getInput('destination-chain', { required: true })
  const recipient = core.getInput('destination-address', { required: true })
  const amount = core.getInput('amount', { required: true })
  const destinationCaller = core.getInput('destination-caller') || undefined

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
  const chain = core.getInput('chain', { required: true })
  const messageBytes = core.getInput('message-bytes', { required: true })
  const attestation = core.getInput('attestation', { required: true })

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
  const chain = core.getInput('chain', { required: true })
  const originalMessageBytes = core.getInput('original-message-bytes', { required: true })
  const originalAttestation = core.getInput('original-attestation', { required: true })
  const newDestinationCaller = core.getInput('destination-caller') || undefined
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
  const name = core.getInput('name', { required: true })
  return client.createWalletSet({ name })
}

async function runCreateWallet(client) {
  const walletSetId = core.getInput('wallet-set-id', { required: true })
  const blockchains = core
    .getInput('blockchains', { required: true })
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const countInput = core.getInput('count')
  const count = countInput ? Number(countInput) : 1
  return client.createWallet({ walletSetId, blockchains, count })
}

async function runGetWallet(client) {
  const walletId = core.getInput('wallet-id', { required: true })
  return client.getWallet(walletId)
}

async function runListWallets(client) {
  const walletSetId = core.getInput('wallet-set-id') || undefined
  const blockchain = core.getInput('blockchain') || undefined
  const pageSizeInput = core.getInput('page-size')
  const pageSize = pageSizeInput ? Number(pageSizeInput) : undefined
  return client.listWallets({ walletSetId, blockchain, pageSize })
}

async function runGetBalance(client) {
  const walletId = core.getInput('wallet-id', { required: true })
  return client.getBalance(walletId)
}

// -- Platform API: Transactions ---------------------------------------------

async function runTransfer(client) {
  const walletId = core.getInput('wallet-id', { required: true })
  const destinationAddress = core.getInput('destination-address', { required: true })
  const amount = core.getInput('amount', { required: true })
  const tokenId = core.getInput('token-id') || undefined
  const blockchain = core.getInput('blockchain') || undefined
  return client.transfer({ walletId, destinationAddress, tokenId, amount, blockchain })
}

async function runGetTransaction(client) {
  const transactionId = core.getInput('transaction-id', { required: true })
  return client.getTransaction(transactionId)
}

async function runEstimateFee(client) {
  const walletId = core.getInput('wallet-id', { required: true })
  const destinationAddress = core.getInput('destination-address', { required: true })
  const tokenId = core.getInput('token-id', { required: true })
  const amount = core.getInput('amount', { required: true })
  return client.estimateFee({ walletId, destinationAddress, tokenId, amount })
}

// -- Platform API: Compliance -----------------------------------------------

async function runScreenAddress(client) {
  const address = core.getInput('address', { required: true })
  const chain = core.getInput('blockchain', { required: true })
  return client.screenAddress(address, { chain })
}

// -- Job summary ------------------------------------------------------------

function writeSummary(command, result) {
  const heading = `Circle: ${command}`

  if (command === 'get-attestation' || command === 'wait-for-attestation') {
    const status = result.status === 'complete' ? 'Complete' : 'Pending'
    core.summary
      .addHeading(heading, 3)
      .addRaw(`**Message Hash:** \`${result.messageHash}\`\n\n`)
      .addRaw(`**Status:** ${status}\n\n`)
    if (result.attestation) {
      core.summary.addRaw(`**Attestation:** \`${result.attestation.slice(0, 20)}...\`\n\n`)
    }
    if (result.attempts) {
      core.summary.addRaw(`**Poll attempts:** ${result.attempts}\n\n`)
    }
    core.summary.write()
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

    core.summary
      .addHeading(heading, 3)
      .addTable([headerRow, ...dataRows])
      .write()
    return
  }

  core.summary
    .addHeading(heading, 3)
    .addCodeBlock(JSON.stringify(result, null, 2), 'json')
    .write()
}
