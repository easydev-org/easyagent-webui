import { describe, expect, it } from 'vitest'
import { extCardFrom, extCardSrc, MSG_OPEN_VIEW, openViewFrom } from './ext-card'

describe('extCardFrom', () => {
  it('reads a well-formed declaration', () => {
    expect(extCardFrom({ card: { ext: 'github', template: 'gh-pr-files' } })).toEqual({
      ext: 'github',
      template: 'gh-pr-files',
    })
  })

  it('ignores a tool result that declares no card', () => {
    expect(extCardFrom({})).toBeNull()
    expect(extCardFrom(null)).toBeNull()
    // A `view` alone must NOT be mistaken for a card: a view is a place, a card is a render of what
    // already happened, and only one of them can fail after the fact.
    expect(extCardFrom({ view: { ext: 'github', route: '/ws/x/tree/' } })).toBeNull()
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
    expect(extCardFrom({ card: { ext: 'github', route: '/card/ws1' } })).toBeNull()
  })
})

describe('extCardSrc', () => {
  it('carries the template in the hash and the theme in the query', () => {
    expect(extCardSrc({ ext: 'github', template: 'gh-pr-files' }, 'dark')).toBe(
      '/ext/github/?theme=dark#/card/gh-pr-files',
    )
  })

  it('escapes a template that would otherwise break the path', () => {
    const src = extCardSrc({ ext: 'github', template: 'a/b' }, 'light')
    expect(src.endsWith('#/card/a%2Fb')).toBe(true)
  })

  // The data goes over postMessage, not the URL: a tool result can be large, and a URL ends up in
  // history and in logs. Neither the session nor the tenant belongs here either — the card reads
  // nothing, so it needs no scope.
  it('puts no data, session or tenant in the URL', () => {
    const src = extCardSrc({ ext: 'github', template: 't' }, 'light')
    expect(src).not.toContain('session')
    expect(src).not.toContain('tenant')
    expect(src).not.toContain('data')
  })
})

describe('openViewFrom', () => {
  it('accepts a well-formed request from a card', () => {
    expect(
      openViewFrom({ type: MSG_OPEN_VIEW, ext: 'github', route: '/ws/a/tree/', title: 'r' }),
    ).toEqual({ type: MSG_OPEN_VIEW, ext: 'github', route: '/ws/a/tree/', title: 'r' })
  })

  // The frame is a separate document. Anything else arriving on `message` — the theme channel, a
  // stray payload, another origin — must not be able to push a page.
  it('ignores every other message shape', () => {
    expect(openViewFrom({ type: 'easyagent:theme', theme: 'dark' })).toBeNull()
    expect(openViewFrom({ type: MSG_OPEN_VIEW })).toBeNull()
    expect(openViewFrom({ type: MSG_OPEN_VIEW, ext: 'github' })).toBeNull()
    expect(openViewFrom({ type: MSG_OPEN_VIEW, ext: '', route: '/x' })).toBeNull()
    expect(openViewFrom({ type: MSG_OPEN_VIEW, ext: 'github', route: '' })).toBeNull()
    expect(openViewFrom('easyagent:open-view')).toBeNull()
    expect(openViewFrom(null)).toBeNull()
  })
})
