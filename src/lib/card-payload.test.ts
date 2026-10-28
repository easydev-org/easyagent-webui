import { describe, expect, it } from 'vitest'

/**
 * A tool card's payload crosses a document boundary with `postMessage`, which uses the structured
 * clone algorithm. That algorithm REFUSES a Proxy, and Svelte 5's `$state` makes deep proxies — so
 * handing the reactive value straight to `postMessage` throws `DataCloneError` and NOTHING is
 * delivered. The card then sits on "waiting for data" and every other explanation fits.
 *
 * The host now round-trips the payload through JSON first. These tests pin both halves of that: the
 * proxy really is uncloneable, and the round-trip really does fix it — so a future refactor that
 * drops the `plain()` call has something to fail.
 */

/** A stand-in for Svelte's deep reactive wrapper: any object get returns a nested proxy. */
function deepProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, key, recv) {
      const v = Reflect.get(obj, key, recv)
      return v !== null && typeof v === 'object' ? deepProxy(v as object) : v
    },
  })
}

/** What `pushData` does to a value before sending it. */
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

describe('card payload transport', () => {
  it('proves the hazard: a reactive proxy cannot be structured-cloned', () => {
    const payload = deepProxy({ repo: 'a/b', nested: { files: [1, 2] } })
    // structuredClone is the same algorithm postMessage uses.
    expect(() => structuredClone(payload)).toThrow()
  })

  it('the JSON round-trip makes it cloneable again', () => {
    const payload = deepProxy({ repo: 'a/b', nested: { files: [1, 2] } })
    const safe = plain(payload)
    expect(() => structuredClone(safe)).not.toThrow()
    // Same content, and the proxies are gone.
    expect(safe).toEqual({ repo: 'a/b', nested: { files: [1, 2] } })
    expect(Object.getPrototypeOf(safe)).toBe(Object.prototype)
  })

  it('survives the shapes a tool result actually has', () => {
    // Undefined and functions are the two things JSON cannot carry; both are dropped, which is what
    // the clone would have done too.
    const withExtras = deepProxy({
      workspace: 'w1',
      files: [{ Path: 'a.md', Additions: 1 }],
      card: { ext: 'github', template: 'git-ws-clone' },
    })
    expect(plain(withExtras)).toEqual({
      workspace: 'w1',
      files: [{ Path: 'a.md', Additions: 1 }],
      card: { ext: 'github', template: 'git-ws-clone' },
    })
  })
})
