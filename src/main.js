import * as core from '@actions/core'
import { createCommandRouter, setJsonOutput, setOutputs, writeSummary, handleError } from '@w3-io/action-core'
import { CircleClient, DOMAINS, CONTRACTS } from './circle.js'
import { approveBurn, burn, mint, replaceMessage } from './cctp-onchain.js'
import { mintSolana, burnSolana } from './cctp-solana.js'

// -- Shared helpers ---------------------------------------------------------

function getClient() {
  const timeoutInput = core.getInput('timeout')
  return new CircleClient({
    apiKey: core.getInput('api-key') || undefined,
    apiUrl: core.getInput('api-url') || undefined,
    entitySecret: core.getInput('entity-secret') || undefined,
    irisUrl: core.getInput('iris-url') || undefined,
    sandbox: core.getInput('sandbox') === 'true',
    timeout: timeoutInput ? Number(timeoutInput) : undefined,
  })
}

function getRpcUrl() {
  return core.getInput('rpc-url') || core.getInput('rpc_url') || undefined
}

/** Set per-field outputs for cross-job piping (avoids fromJSON). */
function setPipeOutputs(result) {
  setOutputs({
    tx_hash: result.txHash,
    source_domain: result.sourceDomain != null ? String(result.sourceDomain) : undefined,
    message_hash: result.messageHash,
    message_bytes: result.messageBytes,
    message: result.message,
    attestation: result.attestation,
  })
}

// -- Command router ---------------------------------------------------------

const router = createCommandRouter({
  // CCTP (IRIS API — no auth)
  'get-attestation': async () => {
    const client = getClient()
    const messageHash = core.getInput('message-hash', { required: true })
    const result = await client.getAttestation(messageHash)
    setJsonOutput('result', result)
    setPipeOutputs(result)
    const status = result.status === 'complete' ? 'Complete' : 'Pending'
    await writeSummary('Circle: get-attestation', [['Status', status]])
  },

  'wait-for-attestation': async () => {
    const client = getClient()
    const txHash = core.getInput('tx-hash') || core.getInput('tx_hash')
    const sourceDomain = core.getInput('source-domain') || core.getInput('source_domain')
    const messageHash = core.getInput('message-hash') || core.getInput('message_hash')
    const pollIntervalInput = core.getInput('poll-interval')
    const maxAttemptsInput = core.getInput('max-attempts')
    const pollInterval = pollIntervalInput ? Number(pollIntervalInput) : undefined
    const maxAttempts = maxAttemptsInput ? Number(maxAttemptsInput) : undefined

    let result
    if (txHash && sourceDomain) {
      result = await client.waitForAttestationV2(txHash, Number(sourceDomain), { pollInterval, maxAttempts })
    } else if (messageHash) {
      result = await client.waitForAttestation(messageHash, { pollInterval, maxAttempts })
    } else {
      throw new Error('Either tx-hash + source-domain (V2) or message-hash (V1) is required')
    }

    setJsonOutput('result', result)
    setPipeOutputs(result)
    const status = result.status === 'complete' ? 'Complete' : 'Pending'
    await writeSummary('Circle: wait-for-attestation', [['Status', status]])
  },

  'get-supported-chains': async () => {
    const client = getClient()
    const network = core.getInput('network') || undefined
    const result = await client.getSupportedChains(network)
    setJsonOutput('result', result)
    await writeSummary('Circle: get-supported-chains', result)
  },

  'get-domain-info': async () => {
    const client = getClient()
    const chain = core.getInput('chain', { required: true })
    const result = await client.getDomainInfo(chain)
    setJsonOutput('result', result)
    await writeSummary('Circle: get-domain-info', result)
  },

  // CCTP on-chain (requires bridge signer + RPC)
  'approve-burn': async () => {
    const chain = core.getInput('chain', { required: true })
    const amount = core.getInput('amount', { required: true })
    const result = await approveBurn({ chain, amount, domains: DOMAINS, contracts: CONTRACTS, rpcUrl: getRpcUrl() })
    setJsonOutput('result', result)
    setPipeOutputs(result)
    await writeSummary('Circle: approve-burn', [['Chain', chain], ['Amount', `${amount} USDC`]])
  },

  burn: async () => {
    const chain = core.getInput('chain', { required: true })
    const destinationChain = core.getInput('destination-chain', { required: true })
    const recipient = core.getInput('destination-address', { required: true })
    const amount = core.getInput('amount', { required: true })
    const destinationCaller = core.getInput('destination-caller') || undefined
    const rpcUrl = getRpcUrl()

    const chainInfo = DOMAINS[chain]
    const result = chainInfo && chainInfo.type === 'solana'
      ? await burnSolana({ chain, destinationChain, recipient, amount, contracts: CONTRACTS, domains: DOMAINS, destinationCaller })
      : await burn({ chain, destinationChain, recipient, rpcUrl, amount, domains: DOMAINS, contracts: CONTRACTS, destinationCaller })

    setJsonOutput('result', result)
    setPipeOutputs(result)
    await writeSummary('Circle: burn', [['Source', chain], ['Destination', destinationChain], ['Amount', `${amount} USDC`], ['TX', `\`${result.txHash}\``]])
  },

  mint: async () => {
    const chain = core.getInput('chain', { required: true })
    const messageBytes = core.getInput('message-bytes', { required: true })
    const attestation = core.getInput('attestation', { required: true })

    const chainInfo = DOMAINS[chain]
    const result = chainInfo && chainInfo.type === 'solana'
      ? await mintSolana({ chain, messageBytes, attestation, contracts: CONTRACTS, domains: DOMAINS })
      : await mint({ chain, messageBytes, attestation, contracts: CONTRACTS, rpcUrl: getRpcUrl() })

    setJsonOutput('result', result)
    setPipeOutputs(result)
    await writeSummary('Circle: mint', [['Chain', chain], ['TX', `\`${result.txHash}\``]])
  },

  'replace-message': async () => {
    const chain = core.getInput('chain', { required: true })
    const originalMessageBytes = core.getInput('original-message-bytes', { required: true })
    const originalAttestation = core.getInput('original-attestation', { required: true })
    const newDestinationCaller = core.getInput('destination-caller') || undefined
    const result = await replaceMessage({ chain, originalMessageBytes, originalAttestation, newDestinationCaller, contracts: CONTRACTS })
    setJsonOutput('result', result)
    setPipeOutputs(result)
    await writeSummary('Circle: replace-message', result)
  },

  // Platform API: Setup
  'register-entity-secret': async () => {
    const client = getClient()
    const result = await client.registerEntitySecret()
    setJsonOutput('result', result)
    await writeSummary('Circle: register-entity-secret', result)
  },

  // Platform API: Wallets
  'create-wallet-set': async () => {
    const client = getClient()
    const name = core.getInput('name', { required: true })
    const result = await client.createWalletSet({ name })
    setJsonOutput('result', result)
    await writeSummary('Circle: create-wallet-set', result)
  },

  'create-wallet': async () => {
    const client = getClient()
    const walletSetId = core.getInput('wallet-set-id', { required: true })
    const blockchains = core.getInput('blockchains', { required: true }).split(',').map((s) => s.trim()).filter(Boolean)
    const countInput = core.getInput('count')
    const result = await client.createWallet({ walletSetId, blockchains, count: countInput ? Number(countInput) : 1 })
    setJsonOutput('result', result)
    await writeSummary('Circle: create-wallet', result)
  },

  'get-wallet': async () => {
    const client = getClient()
    const walletId = core.getInput('wallet-id', { required: true })
    const result = await client.getWallet(walletId)
    setJsonOutput('result', result)
    await writeSummary('Circle: get-wallet', result)
  },

  'list-wallets': async () => {
    const client = getClient()
    const walletSetId = core.getInput('wallet-set-id') || undefined
    const blockchain = core.getInput('blockchain') || undefined
    const pageSizeInput = core.getInput('page-size')
    const result = await client.listWallets({ walletSetId, blockchain, pageSize: pageSizeInput ? Number(pageSizeInput) : undefined })
    setJsonOutput('result', result)
    await writeSummary('Circle: list-wallets', result)
  },

  'get-balance': async () => {
    const client = getClient()
    const walletId = core.getInput('wallet-id', { required: true })
    const result = await client.getBalance(walletId)
    setJsonOutput('result', result)
    await writeSummary('Circle: get-balance', result)
  },

  // Platform API: Transactions
  transfer: async () => {
    const client = getClient()
    const walletId = core.getInput('wallet-id', { required: true })
    const destinationAddress = core.getInput('destination-address', { required: true })
    const amount = core.getInput('amount', { required: true })
    const tokenId = core.getInput('token-id') || undefined
    const blockchain = core.getInput('blockchain') || undefined
    const result = await client.transfer({ walletId, destinationAddress, tokenId, amount, blockchain })
    setJsonOutput('result', result)
    await writeSummary('Circle: transfer', result)
  },

  'get-transaction': async () => {
    const client = getClient()
    const transactionId = core.getInput('transaction-id', { required: true })
    const result = await client.getTransaction(transactionId)
    setJsonOutput('result', result)
    await writeSummary('Circle: get-transaction', result)
  },

  'estimate-fee': async () => {
    const client = getClient()
    const walletId = core.getInput('wallet-id', { required: true })
    const destinationAddress = core.getInput('destination-address', { required: true })
    const tokenId = core.getInput('token-id', { required: true })
    const amount = core.getInput('amount', { required: true })
    const result = await client.estimateFee({ walletId, destinationAddress, tokenId, amount })
    setJsonOutput('result', result)
    await writeSummary('Circle: estimate-fee', result)
  },

  // Platform API: Compliance
  'screen-address': async () => {
    const client = getClient()
    const address = core.getInput('address', { required: true })
    const chain = core.getInput('blockchain', { required: true })
    const result = await client.screenAddress(address, { chain })
    setJsonOutput('result', result)
    await writeSummary('Circle: screen-address', result)
  },
})

export function run() {
  router()
}
