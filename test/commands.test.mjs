import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mergeDynamicCommands, TELEGRAM_DESCRIPTION_BUDGET } from '../lib/commands.js'

/**
 * Telegram refuses a command list whose descriptions add up to more than
 * 5000 characters, and it reports that as `BOT_COMMANDS_TOO_MUCH` — which
 * reads like a count problem, so the list that was over budget looked fine.
 */

const skill = (name, length) => ({ name, description: 'a'.repeat(length) })

describe('mergeDynamicCommands', () => {
  it('keeps the list inside the description budget', () => {
    const merged = mergeDynamicCommands([], Array.from({ length: 200 }, (_, i) => skill(`s${i}`, 80)), 100)
    const chars = merged.reduce((sum, command) => sum + command.description.length, 0)
    assert.ok(chars <= TELEGRAM_DESCRIPTION_BUDGET, `descriptions total ${chars}`)
  })

  it('truncates a single long description to the per-command limit', () => {
    const merged = mergeDynamicCommands([], [skill('long', 6000)], 100)
    assert.equal(merged.length, 1)
    assert.equal(merged[0].description.length, 256)
  })

  it('stops adding commands once the accumulated descriptions would pass the budget', () => {
    const merged = mergeDynamicCommands([], Array.from({ length: 300 }, (_, i) => skill(`s${i}`, 100)), 100)
    const chars = merged.reduce((sum, command) => sum + command.description.length, 0)
    assert.ok(chars <= TELEGRAM_DESCRIPTION_BUDGET)
    // The budget bites before the count limit: 100 commands of 80 characters
    // would be 8000 characters, so the list stops short of 100.
    assert.ok(merged.length < 100)
  })

  it('never exceeds the command count limit either', () => {
    const merged = mergeDynamicCommands([], Array.from({ length: 200 }, (_, i) => skill(`s${i}`, 5)), 100)
    assert.ok(merged.length <= 100)
  })

  it('keeps the base commands and adds the dynamic ones after them', () => {
    const base = [{ command: 'start', description: 'Start' }]
    const merged = mergeDynamicCommands(base, [skill('extra', 5)], 100)
    assert.equal(merged[0].command, 'start')
    assert.equal(merged[merged.length - 1].command, 'extra')
  })
})
