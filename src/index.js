// Entry point.
import { run } from './main.js'

// Suppress unhandled rejections from @actions/core Summary module
// (it throws when GITHUB_STEP_SUMMARY file operations fail).
// Without this, Node.js exits with code 1 on any unhandled rejection.
process.on('unhandledRejection', () => {})

run()
