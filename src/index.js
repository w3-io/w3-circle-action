import { run } from './main.js'

// Suppress stray unhandled rejections from @actions/core internals.
// Without this, Node.js >= 15 exits with code 1 on any unhandled rejection.
process.on('unhandledRejection', () => {})

run()
