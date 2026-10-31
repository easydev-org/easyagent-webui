import { describe, expect, it } from 'vitest'
import type { ToolInfo } from './models'
import {
  canonicalizeSelection,
  groupByExtension,
  isColliding,
  sanitizeToolName,
  toolValue,
} from './tool-selection'

const t = (category: string, name: string): ToolInfo => ({
  name,
  description: '',
  category,
  requiredConfig: [],
})

describe('toolValue', () => {
  it('uses the bare name when unique across extensions', () => {
    const all = [t('bundled', 'todo-write'), t('workspace', 'sandbox-job-start')]
    expect(toolValue(all, all[0]!)).toBe('todo-write')
  })

  it('qualifies as <extId>.<name> when the bare name collides', () => {
    const all = [t('extA', 'search'), t('extB', 'search')]
    expect(toolValue(all, all[0]!)).toBe('extA.search')
    expect(toolValue(all, all[1]!)).toBe('extB.search')
    expect(isColliding(all, 'search')).toBe(true)
    expect(isColliding(all, 'todo-write')).toBe(false)
  })
})

describe('groupByExtension', () => {
  it('groups by extension id and sorts stably', () => {
    const all = [
      t('workspace', 'sandbox-job-start'),
      t('bundled', 'todo-write'),
      t('bundled', 'time-wait'),
    ]
    const g = groupByExtension(all)
    expect(g.map(x => x.extId)).toEqual(['bundled', 'workspace'])
    expect(g[0]!.tools.map(x => x.name)).toEqual(['time-wait', 'todo-write'])
    expect(g[1]!.tools.map(x => x.name)).toEqual(['sandbox-job-start'])
  })
})

describe('canonicalizeSelection', () => {
  const all = [
    t('extA', 'search'),
    t('extB', 'search'),
    t('bundled', 'todo-write'),
  ]

  it('keeps a qualified entry verbatim', () => {
    expect([...canonicalizeSelection(all, ['extA.search'])]).toEqual([
      'extA.search',
    ])
  })

  it('resolves a unique bare name to its value', () => {
    expect([...canonicalizeSelection(all, ['todo-write'])]).toEqual([
      'todo-write',
    ])
  })

  it('keeps an unknown entry so it is not silently dropped', () => {
    expect([...canonicalizeSelection(all, ['ghost'])]).toEqual(['ghost'])
  })

  it('drops blanks', () => {
    expect([...canonicalizeSelection(all, ['', '  ', 'todo-write'])]).toEqual([
      'todo-write',
    ])
  })
})

describe('sanitized bare name (gateway charset)', () => {
  it('sanitizes out-of-charset characters in the bare value', () => {
    expect(sanitizeToolName('model.image')).toBe('model-image')
    expect(
      toolValue([t('bundled', 'model.image')], t('bundled', 'model.image')),
    ).toBe('model-image')
  })

  it('resolves a legacy RAW dotted name to its sanitized value (not misread as <extId>.<name>)', () => {
    const all = [t('bundled', 'model.image')]
    // A stored bare entry `model.image` (pre-sanitize) must resolve to the
    // current value `model-image`, NOT be treated as extId `model`.
    expect([...canonicalizeSelection(all, ['model.image'])]).toEqual([
      'model-image',
    ])
  })

  it('keeps a raw qualified entry resolving to its current value', () => {
    const all = [t('extA', 'search'), t('extB', 'search')]
    expect([...canonicalizeSelection(all, ['extA.search'])]).toEqual([
      'extA.search',
    ])
  })
})
