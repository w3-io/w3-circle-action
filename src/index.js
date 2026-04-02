// Entry point. Catches any unhandled rejections to prevent exit code 1.
import { run } from './main.js'

run().catch((err) => {
  process.stderr.write(`Unhandled: ${err?.message || err}\n`)
  process.exitCode = 1
})
