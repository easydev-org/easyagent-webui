import { describe, expect, it } from 'vitest'
import { planAvatar } from './avatar-plan'

/**
 * THREE STATES, AND ONLY ONE OF THEM IS "SHOW THE STORED IMAGE".
 *
 * The failure this guards against is a blank circle: a session with no avatar, or with a broken one,
 * must still render something. That is the identicon, exactly as every session showed before avatars
 * existed.
 */
describe('planAvatar', () => {
  it('derives the identicon when no avatar is set', () => {
    for (const v of [undefined, null, '', '   ']) {
      expect(planAvatar(v)).toEqual({ source: 'identicon', code: '' })
    }
  })

  it('uses the stored image when one is set', () => {
    expect(planAvatar('file:abc123')).toEqual({ source: 'file', code: 'abc123' })
  })

  it('tolerates whitespace around the code', () => {
    expect(planAvatar('  file:abc123  ')).toEqual({ source: 'file', code: 'abc123' })
  })

  /**
   * `file:` WITH NOTHING AFTER IT IS NOT A PICTURE.
   *
   * Treating it as one would fetch an empty code and land in the error path, where the identicon
   * appears anyway — the same result, reached by accident. A rule that only works by accident is one
   * that stops working the moment the error path changes.
   */
  it('derives the identicon for a bare file: prefix', () => {
    expect(planAvatar('file:')).toEqual({ source: 'identicon', code: '' })
    expect(planAvatar('file:   ')).toEqual({ source: 'identicon', code: '' })
  })

  /**
   * A PLAIN URL IS REFUSED.
   *
   * The console renders what the agent stores. A URL would make it fetch from a host the agent never
   * vouched for, and nothing here could tell a broken link from a deleted file — the reader would see
   * an empty circle with no explanation.
   */
  it('refuses anything that is not file:<code>', () => {
    for (const v of ['https://example.com/a.png', 'abc123', 'javascript:alert(1)', 'FILE:abc']) {
      expect(planAvatar(v)).toEqual({ source: 'identicon', code: '' })
    }
  })
})
