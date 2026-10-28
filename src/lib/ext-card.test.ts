import { describe, expect, it } from 'vitest'
import { extCardFrom, extCardSrc } from './ext-card'

describe('extCardFrom', () => {
  it('reads a well-formed declaration', () => {
    expect(
      extCardFrom({ card: { ext: 'github', route: '/card/git-ws-clone/abc', title: 'repo' } }),
    ).toEqual({ ext: 'github', route: '/card/git-ws-clone/abc', title: 'repo' })
  })

  it('ignores a tool result that declares no card', () => {
    expect(extCardFrom({})).toBeNull()
    expect(extCardFrom(null)).toBeNull()
    // A `view` alone must NOT be mistaken for a card: they answer different questions and either can
    // exist without the other.
    expect(extCardFrom({ view: { ext: 'github', route: '/ws/x/tree/' } })).toBeNull()
  })

  it('rejects a malformed declaration rather than building a broken frame', () => {
    expect(extCardFrom({ card: { ext: '', route: '/x' } })).toBeNull()
    expect(extCardFrom({ card: { ext: 'github', route: '' } })).toBeNull()
    expect(extCardFrom({ card: { ext: 'github' } })).toBeNull()
    expect(extCardFrom({ card: 'github' })).toBeNull()
  })
})

describe('extCardSrc', () => {
  it('carries the session and theme, and puts the route in the hash', () => {
    const src = extCardSrc(
      { ext: 'github', route: '/card/a' },
      { session: 's1', theme: 'dark' },
    )
    expect(src).toBe('/ext/github/?session=s1&theme=dark#/card/a')
  })

  it('normalises a route without a leading slash', () => {
    const src = extCardSrc({ ext: 'github', route: 'card/a' }, { session: 's', theme: 'light' })
    expect(src.endsWith('#/card/a')).toBe(true)
  })

  // The tenant must NOT appear: it lives in the bearer token and the extension resolves it
  // server-side. A client that could name its own tenant could read someone else's data.
  it('never puts a tenant in the URL', () => {
    const src = extCardSrc({ ext: 'github', route: '/c' }, { session: 's', theme: 'light' })
    expect(src).not.toContain('tenant')
  })
})
