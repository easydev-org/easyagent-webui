import { describe, expect, it } from 'vitest'
import { effectNeedsConfirmation, type ToolEffect } from './models'

/**
 * TWO LEVELS ASK FOR CONFIRMATION, AND AN UNKNOWN ONE ASKS TOO.
 *
 * `low` touches only the caller's own state; interrupting every such act would train the user to click
 * through the dialog, which is how a confirmation stops carrying information. But a tool that did not say
 * what it does must NOT be presented as harmless — the safe direction for an unknown impact is the worst.
 */
describe('effectNeedsConfirmation', () => {
  it('does not confirm for the two lower levels', () => {
    expect(effectNeedsConfirmation('none')).toBe(false)
    expect(effectNeedsConfirmation('low')).toBe(false)
  })

  it('confirms for the two higher levels', () => {
    expect(effectNeedsConfirmation('medium')).toBe(true)
    expect(effectNeedsConfirmation('high')).toBe(true)
  })

  it('confirms when the effect is missing or empty', () => {
    const unknownEffects: Array<ToolEffect | undefined | null> = [
      undefined,
      null,
      '' as unknown as ToolEffect,
    ]
    for (const v of unknownEffects) {
      expect(effectNeedsConfirmation(v)).toBe(true)
    }
  })
})
