#!/usr/bin/env node
/**
 * `dsh-tui` executable entry: hands the argument vector to the launcher and
 * reports failures without a stack trace unless asked.
 * @module @gblelis/dsh-tui/bin
 */

import { main, reportFailure } from './launcher/main.ts'

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code },
  (error: unknown) => {
    reportFailure(error)
    process.exitCode = 1
  },
)
