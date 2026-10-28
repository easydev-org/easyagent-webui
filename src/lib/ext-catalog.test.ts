import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { descriptionFor, discoverExtUis, type ExtUi } from './ext-catalog.svelte'

/**
 * The shelf is driven by one question per extension: does `/ext/<id>/api/v1/ui` answer? A 200 means
 * "this extension has a UI"; anything else means there is nothing to open, and offering the link
 * anyway would be offering a broken one.
 *
 * These tests pin that rule, including the parts that are easy to get wrong: a 502 is not a UI, and
 * the bearer travels in a header rather than the query.
 */

/** Build an api double returning the given registered extension ids. */
function fakeApi(ids: string[]) {
  return {
    extensions: () => Promise.resolve(ids.map(extId => ({ extId }) as never)),
  } as never
}

beforeEach(() => {
  // Guard, not a precondition: `storedToken` treats a missing localStorage as "no token", so a test
  // that never sets one is still valid — it exercises that path.
  globalThis.localStorage?.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Replace `fetch` for the duration of one test.
 *
 * `globalThis.fetch = …` rather than `vi.stubGlobal`, because stubGlobal's teardown clears
 * `localStorage` in this environment — which is the very thing these tests set up.
 */
function withFetch(fn: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(fn as unknown as typeof fetch)
}

describe('discoverExtUis', () => {
  it('keeps only the extensions that answer, and uses the title they report', async () => {
    withFetch((url: string) =>
      Promise.resolve(
        url.includes('/ext/github/')
          ? new Response(JSON.stringify({ id: 'github', title: 'GitHub', base: '/ext/github' }), {
              status: 200,
            })
          : new Response('bad gateway', { status: 502 }),
      ),
    )

    const got = await discoverExtUis(fakeApi(['github', 'sandbox']))
    expect(got).toEqual([
      { id: 'github', title: 'GitHub', base: '/ext/github', descriptions: {}, icon: '' },
    ])
  })

  it('treats a 502 as "no UI", not as an error', async () => {
    // The reverse proxy answers 502 for an extension with no Service. That must read as "nothing to
    // open" rather than breaking the whole shelf.
    withFetch(() => Promise.resolve(new Response('', { status: 502 })))
    expect(await discoverExtUis(fakeApi(['a', 'b']))).toEqual([])
  })

  it('survives a network failure for one extension', async () => {
    withFetch((url: string) =>
      url.includes('/ext/ok/')
        ? Promise.resolve(new Response(JSON.stringify({ title: 'OK' }), { status: 200 }))
        : Promise.reject(new Error('boom')),
    )
    const got = await discoverExtUis(fakeApi(['ok', 'broken']))
    expect(got.map(e => e.id)).toEqual(['ok'])
  })

  it('falls back to the id when an extension reports no title', async () => {
    withFetch(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })))
    const got = await discoverExtUis(fakeApi(['plain']))
    expect(got[0]).toEqual({
      id: 'plain',
      title: 'plain',
      base: '/ext/plain',
      descriptions: {},
      icon: '',
    })
  })

  it('sends the bearer as a header, never in the URL', async () => {
    // Without a storage this test cannot express its point; skip rather than assert on a missing
    // platform feature, which would be a test of jsdom rather than of this code.
    if (!globalThis.localStorage) return
    globalThis.localStorage.setItem('agent.token', 'secret-token')
    const spy = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })))
    withFetch(spy)
    await discoverExtUis(fakeApi(['x']))

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain('secret-token')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-token')
  })

  it('returns an empty shelf when the registry itself fails', async () => {
    withFetch(() => Promise.reject(new Error('should not be called')))
    const api = { extensions: () => Promise.reject(new Error('no agent')) } as never
    expect(await discoverExtUis(api)).toEqual([])
  })

  // The shelf says what an extension is FOR. Only the extension knows, so it declares the text and
  // the host renders the entry matching the reader's language.
  it('reads the descriptions and resolves the icon under the reported mount', async () => {
    withFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'github',
            title: 'GitHub',
            base: '/ext/github',
            descriptions: { en: 'Repos and PRs', zh: '仓库与合并请求' },
            icon: '/icon.svg',
          }),
          { status: 200 },
        ),
      ),
    )
    const [got] = await discoverExtUis(fakeApi(['github']))
    expect(got!.descriptions).toEqual({ en: 'Repos and PRs', zh: '仓库与合并请求' })
    expect(got!.icon).toBe('/ext/github/icon.svg')
  })

  it('drops blank description entries rather than rendering an empty slot', async () => {
    withFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ descriptions: { en: 'Real', zh: '   ' } }), { status: 200 }),
      ),
    )
    const [got] = await discoverExtUis(fakeApi(['x']))
    expect(got!.descriptions).toEqual({ en: 'Real' })
  })
})

describe('descriptionFor', () => {
  const ex = (descriptions: Record<string, string>): ExtUi => ({
    id: 'x',
    title: 'X',
    base: '/ext/x',
    descriptions,
    icon: '',
  })

  it('prefers an exact locale match', () => {
    expect(descriptionFor(ex({ en: 'E', 'zh-hans': 'Z' }), 'zh-Hans')).toBe('Z')
  })

  // A region variant must fall back to its language, or `zh-CN` would miss a `zh` entry entirely.
  it('falls back to the bare language', () => {
    expect(descriptionFor(ex({ zh: 'Z' }), 'zh-CN')).toBe('Z')
  })

  // English is the safer fallback than "whatever was listed first": an extension that happened to
  // list Chinese first would otherwise show Chinese to an English reader.
  it('falls back to English before an arbitrary entry', () => {
    expect(descriptionFor(ex({ fr: 'F', en: 'E' }), 'de')).toBe('E')
  })

  it('uses the only entry when nothing matches', () => {
    expect(descriptionFor(ex({ fr: 'F' }), 'de')).toBe('F')
  })

  it('returns empty when the extension declared none', () => {
    expect(descriptionFor(ex({}), 'en')).toBe('')
  })
})
