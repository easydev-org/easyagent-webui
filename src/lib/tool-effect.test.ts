import { describe, expect, it } from 'vitest'
import { effectNeedsConfirmation } from './models'

/**
 * TWO LEVELS ASK FOR CONFIRMATION.
 *
 * `low` touches only the caller's own state; interrupting every such act would train the user to click
 * through the dialog, which is how a confirmation stops carrying information.
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

  /**
   * THERE IS NO FALLBACK, SO THERE IS NO CASE TO TEST FOR ONE.
   *
   * The agent refuses to register a tool without a valid effect, so this type cannot receive an unknown
   * value. `effectNeedsConfirmation` therefore has no default branch — a switch over the four levels with
   * no fall-through, which makes "add a fifth level" a compile error rather than a silently-confirmed one.
   */
})
