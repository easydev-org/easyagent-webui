import { describe, expect, it } from 'vitest'
import { cardFor } from './tool-cards'

/**
 * The registry is pure by construction, so these tests exercise the real mapping rather than a copy
 * of it. What they guard is the failure that is otherwise invisible: a handler reading a field the
 * tool never sets produces a card with no rows, which looks exactly like a tool that has no card.
 */

describe('cardFor', () => {
  it('returns null for a tool nobody claims, so the caller keeps raw JSON', () => {
    expect(cardFor('some-unknown-tool', {}, {}, 'out')).toBeNull()
  })

  it('strips an extension prefix before matching', () => {
    const spec = cardFor('github.git-ws-clone', {}, { repo: 'a/b' }, 'ok')
    // No handler claims git-ws-clone (that is an extension tool), so this proves the PREFIX was
    // removed rather than the name being taken literally.
    expect(spec).toBeNull()
    const mine = cardFor('bundled.file-info', { name: 'a.txt', size: 10 }, { code: 'x' })
    expect(mine).not.toBeNull()
  })

  it('builds file-info rows from the payload the tool actually returns', () => {
    const spec = cardFor(
      'file-info',
      { name: 'a.txt', mime: 'text/plain', size: 2048, sha256: 'abc123def456ghi' },
      { code: 'c1' },
    )
    expect(spec).not.toBeNull()
    const values = spec!.result.fields.map((f: { value: string }) => f.value)
    expect(values).toContain('a.txt')
    expect(values).toContain('text/plain')
    expect(values).toContain('2.0 KB')
    // The digest is truncated for display; the full value is not useful at a glance.
    expect(values).toContain('abc123def456ghi')
  })

  it('omits rows whose value is missing instead of showing blanks', () => {
    const spec = cardFor('file-info', { name: 'only-name' }, { code: 'c1' })
    expect(spec!.result.fields.map((f: { label: string }) => f.label)).toEqual(['tcName'])
  })

  it('keeps a numeric zero, which is information', () => {
    const spec = cardFor('file-read', { code: 'c', offset: 0, lines: 0 }, { code: 'c' })
    const labels = spec!.result.fields.map((f: { label: string }) => f.label)
    expect(labels).toContain('tcLines')
  })

  it('reads todo counts from the stored rows, tolerating either case of the field names', () => {
    const spec = cardFor(
      'todo-write',
      {
        todos: [
          { Content: 'a', Status: 'completed', Priority: 'high' },
          { Content: 'b', Status: 'pending', Priority: 'low' },
        ],
      },
      {},
    )
    const byLabel = Object.fromEntries(spec!.result.fields.map((f: { label: string; value: string }) => [f.label, f.value]))
    expect(byLabel['tcTotal']).toBe('2')
    expect(byLabel['tcDone']).toBe('1')
    expect(byLabel['tcRemaining']).toBe('1')
  })

  it('strips the line-number gutter without eating the code indentation', () => {
    // The producer writes `<n>  <content>`; the content's own indentation must survive.
    const spec = cardFor(
      'file-read',
      { code: 'a.go', offset: 0, lines: 2 },
      {},
      '1  func main() {\n2      return\n',
    )
    const body = spec!.result.body
    expect(body?.kind).toBe('code')
    if (body?.kind === 'code') {
      expect(body.text).toBe('func main() {\n    return')
    }
  })

  it('renders a fetched page as markdown, not as raw text', () => {
    const spec = cardFor('web-fetch', { url: 'https://x', contentType: 'text/markdown' }, {}, '# Hi')
    expect(spec!.result.body?.kind).toBe('markdown')
  })

  it('attaches the generated media file so it can be previewed', () => {
    const spec = cardFor(
      'image-generate',
      { files: [{ code: 'f1', mime: 'image/png', name: 'p.png', bytes: 100 }], model: 'm' },
      { prompt: 'a cat' },
    )
    expect(spec!.result.body).toEqual({
      kind: 'media',
      code: 'f1',
      mime: 'image/png',
      name: 'p.png',
    })
  })
})
