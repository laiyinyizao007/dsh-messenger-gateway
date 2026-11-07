import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Guards for the turn path.
 *
 * Upstream declared the reply text as a constant and then appended the cost
 * footer to it, so every reply failed with "Assignment to constant variable"
 * whenever `telegram.costFooter` was on. A behavioural test would need the
 * whole agent loop; the failure was a declaration, so the guard is on the
 * declaration.
 */

const source = readFileSync(new URL('../lib/gateway-turn.js', import.meta.url), 'utf8')

describe('the reply text', () => {
  it('is declared with let, because the cost footer appends to it', () => {
    assert.match(source, /let answer = processed\.text/)
    assert.doesNotMatch(source, /const answer = processed\.text/)
  })

  it('still receives the cost footer when the setting is on', () => {
    assert.match(source, /if \(footer\) answer \+= footer/)
  })
})

describe('the plugin source', () => {
  const files = ['../lib/gateway.js', '../lib/gateway-turn.js', '../lib/index.js', '../lib/router.js']

  it('never assigns to a name it declared as a constant', () => {
    for (const file of files) {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8')
      const constants = new Set()
      for (const match of text.matchAll(/^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/gm)) {
        constants.add(match[1])
      }
      for (const match of text.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*(\+?=|--|\+\+)(?!=)/gm)) {
        const name = match[1]
        // A later declaration may shadow an earlier one; only flag a name that
        // is never declared again with let or var.
        const shadowed = new RegExp(`\\b(let|var)\\s+${name}\\b`).test(text)
        if (constants.has(name) && !shadowed) {
          assert.fail(`${file}: "${name}" is declared const and later assigned`)
        }
      }
    }
  })
})
