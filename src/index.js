// Entry point.
import { run } from './main.js'

// Force exit 0 after run completes — @actions/core sometimes sets exitCode=1
// via setFailed from unhandled rejection handlers.
run()
  .then(() => { process.exitCode = 0 })
  .catch(() => { process.exitCode = 1 })
