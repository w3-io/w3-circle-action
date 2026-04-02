// Capture ALL stdout/stderr to a file inside the container,
// then run the real entry point.
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs'

const LOG = '/tmp/w3-action-debug.log'
const origStdout = process.stdout.write.bind(process.stdout)
const origStderr = process.stderr.write.bind(process.stderr)

process.stdout.write = (chunk, ...args) => {
  try { appendFileSync(LOG, `[stdout] ${chunk}`) } catch {}
  return origStdout(chunk, ...args)
}
process.stderr.write = (chunk, ...args) => {
  try { appendFileSync(LOG, `[stderr] ${chunk}`) } catch {}
  return origStderr(chunk, ...args)
}

process.on('uncaughtException', (err) => {
  try { appendFileSync(LOG, `[UNCAUGHT] ${err.stack || err}\n`) } catch {}
  origStderr(`[UNCAUGHT] ${err.message}\n`)
})
process.on('unhandledRejection', (err) => {
  try { appendFileSync(LOG, `[UNHANDLED_REJECTION] ${err?.stack || err}\n`) } catch {}
  origStderr(`[UNHANDLED_REJECTION] ${err?.message || err}\n`)
})

// Now run the actual action
import('./main.js').then(m => m.run()
  .then(() => { process.exitCode = 0 })
  .catch((e) => {
    try { appendFileSync(LOG, `[CATCH] ${e?.stack || e}\n`) } catch {}
    process.exitCode = 1
  })
)

// On exit, dump the debug log to stdout so W3 runner captures it
process.on('exit', (code) => {
  try {
    const log = readFileSync(LOG, 'utf8')
    origStdout(`[EXIT code=${code}]\n${log}\n`)
  } catch {}
})
