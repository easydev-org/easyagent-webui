import { beforeEach, describe, expect, it } from 'vitest'
import { clearSelections, selectionsFor, setSelection } from './session-scope.svelte'

/**
 * The console's selection store.
 *
 * The console never interprets these values, so what there is to test is the SHAPE of the store: a
 * value belongs to one conversation, an empty id is a clear rather than a stored blank, and the
 * returned maps are copies so a caller cannot mutate the store by holding one.
 */

const S = 'session-1'

beforeEach(() => {
  clearSelections(S)
  clearSelections('session-2')
})

describe('selectionsFor', () => {
  it('is empty for an unknown conversation', () => {
    expect(selectionsFor(S)).toEqual({})
  })

  it('is empty for the empty session id, which cannot own a selection', () => {
    // A view opened from the shelf has no conversation. Giving it a shared bucket would let two
    // unrelated panels see each other's values.
    setSelection('', 'sandbox', 'dev-1')
    expect(selectionsFor('')).toEqual({})
  })

  it('returns a copy, so a caller cannot mutate the store', () => {
    setSelection(S, 'sandbox', 'dev-1')
    const got = selectionsFor(S)
    got.sandbox = 'tampered'
    expect(selectionsFor(S).sandbox).toBe('dev-1')
  })
})

describe('setSelection', () => {
  it('records a value per namespace', () => {
    setSelection(S, 'sandbox', 'dev-1')
    setSelection(S, 'gitdev', 'acme/api')
    expect(selectionsFor(S)).toEqual({ sandbox: 'dev-1', gitdev: 'acme/api' })
  })

  it('overwrites an existing namespace', () => {
    setSelection(S, 'sandbox', 'dev-1')
    setSelection(S, 'sandbox', 'dev-2')
    expect(selectionsFor(S)).toEqual({ sandbox: 'dev-2' })
  })

  it('treats an empty id as a CLEAR, not as a stored blank', () => {
    // "Nothing is selected" has to be representable. Storing "" would leave every panel
    // special-casing a value that looks present.
    setSelection(S, 'sandbox', 'dev-1')
    setSelection(S, 'sandbox', '')
    expect(selectionsFor(S)).toEqual({})
  })

  it('returns the new map for the caller', () => {
    expect(setSelection(S, 'sandbox', 'dev-1')).toEqual({ sandbox: 'dev-1' })
  })

  it('keeps conversations apart', () => {
    // THE LEAK THIS PREVENTS: session A's sandbox must never be shown as session B's. It would look
    // like the panel opened on the wrong machine, with nothing to indicate why.
    setSelection(S, 'sandbox', 'dev-1')
    setSelection('session-2', 'sandbox', 'dev-9')
    expect(selectionsFor(S)).toEqual({ sandbox: 'dev-1' })
    expect(selectionsFor('session-2')).toEqual({ sandbox: 'dev-9' })
  })
})

describe('clearSelections', () => {
  it('forgets one conversation without touching the others', () => {
    setSelection(S, 'sandbox', 'dev-1')
    setSelection('session-2', 'sandbox', 'dev-9')
    clearSelections(S)
    expect(selectionsFor(S)).toEqual({})
    expect(selectionsFor('session-2')).toEqual({ sandbox: 'dev-9' })
  })

  it('is harmless for a conversation with nothing selected', () => {
    expect(() => clearSelections('never-used')).not.toThrow()
  })
})
