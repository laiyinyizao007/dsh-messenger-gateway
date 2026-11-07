/**
 * Error log for the gateway.
 *
 * The harness log is rate-limited: a busy deployment drops messages, and the
 * one line that matters — the stack of a failed turn — is exactly the one
 * that gets dropped. This writes the failures to a file that nothing else
 * touches.
 *
 *   ~/.dsh/profiles/web/messenger-gateway-errors.log
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Where the failures land. */
export function errorLogPath() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'profiles', 'web', 'messenger-gateway-errors.log')
}

/**
 * Append one failure.
 *
 * @param {string} what - What failed.
 * @param {unknown} error - The error, with its stack when it has one.
 */
export function logFailure(what, error) {
  try {
    const path = errorLogPath()
    mkdirSync(dirname(path), { recursive: true })
    const stack = error && typeof error === 'object' && error.stack ? error.stack : String(error)
    appendFileSync(path, `\n=== ${new Date().toISOString()} ${what} ===\n${stack}\n`, { mode: 0o600 })
  } catch {
    // A failure to record a failure must not become a failure.
  }
}
