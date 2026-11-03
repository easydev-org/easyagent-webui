import { describe, expect, it } from 'vitest'
import { extCardFrom } from './ext-card'

/**
 * The card DECLARATION — the one piece of this contract the console still owns.
 *
 * THE PROTOCOL'S OWN TESTS LIVE IN THE PACKAGE NOW. `extCardSrc`, `openViewFrom` and the message
 * constants moved to `@easydev-org/ext-ui/host` and are tested there, beside the code: keeping a
 * second copy here would only pin this repository's copy of a shape it no longer contains, and would
 * pass while the package's version drifted.
 */

describe('extCardFrom', () => {
  it('reads a well-formed declaration', () => {
    expect(
      extCardFrom({ card: { ext: 'github', template: 'gh-pr-files' } }),
    ).toEqual({
      ext: 'github',
      template: 'gh-pr-files',
    })
  })

  it('ignores a tool result that declares no card', () => {
    expect(extCardFrom({})).toBeNull()
    expect(extCardFrom(null)).toBeNull()
    // A `view` alone must NOT be mistaken for a card: a view is a place, a card is a render of what
    // already happened, and only one of them can fail after the fact.
    expect(
      extCardFrom({ view: { ext: 'github', route: '/ws/x/tree/' } }),
    ).toBeNull()
  })

  it('rejects a malformed declaration rather than building a broken frame', () => {
    expect(extCardFrom({ card: { ext: '', template: 'x' } })).toBeNull()
    expect(extCardFrom({ card: { ext: 'github', template: '' } })).toBeNull()
    expect(extCardFrom({ card: { ext: 'github' } })).toBeNull()
    expect(extCardFrom({ card: 'github' })).toBeNull()
  })

  // A ROUTE is the shape this used to have, and it is exactly what made a card fetch and then fail
  // when the workspace expired. It must not be accepted as a card.
  it('does not accept a route-shaped declaration', () => {
    expect(
      extCardFrom({ card: { ext: 'github', route: '/card/ws1' } }),
    ).toBeNull()
  })
})
