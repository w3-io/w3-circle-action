import * as core from '@actions/core'
import { CircleClient, CircleError } from './circle.js'

const COMMANDS = {
  'get-attestation': runGetAttestation,
  'wait-for-attestation': runWaitForAttestation,
  'get-supported-chains': runGetSupportedChains,
  'get-domain-info': runGetDomainInfo,
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

    const client = new CircleClient({
      apiKey: core.getInput('api-key') || undefined,
      irisUrl: core.getInput('iris-url') || undefined,
      sandbox: core.getInput('sandbox') === 'true',
      maxRetries: core.getInput('max-retries') ? Number(core.getInput('max-retries')) : undefined,
      retryDelay: core.getInput('retry-delay') ? Number(core.getInput('retry-delay')) : undefined,
      timeout: core.getInput('timeout') ? Number(core.getInput('timeout')) : undefined,
    })

    const result = await handler(client)
    core.setOutput('result', JSON.stringify(result))

    writeSummary(command, result)
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
  const messageHash = core.getInput('message-hash', { required: true })
  const pollInterval = core.getInput('poll-interval')
    ? Number(core.getInput('poll-interval'))
    : undefined
  const maxAttempts = core.getInput('max-attempts')
    ? Number(core.getInput('max-attempts'))
    : undefined
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

// -- Job summary ------------------------------------------------------------

function writeSummary(command, result) {
  const heading = `Circle CCTP: ${command}`

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
