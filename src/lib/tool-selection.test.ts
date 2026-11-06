import { describe, expect, it } from 'vitest'
import type { ToolInfo } from './models'
import {
  canonicalizeSelection,
  disqualifiedByConfig,
  groupByExtension,
  isColliding,
  sanitizeToolName,
  toolIneligible,
  toolValue,
} from './tool-selection'

const t = (category: string, name: string): ToolInfo => ({
  name,
  description: '',
  category,
  requiredConfig: [],
  effect: 'none',
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
  const all = [t('extA', 'search'), t('extB', 'search'), t('bundled', 'todo-write')]

  it('keeps a qualified entry verbatim', () => {
    expect([...canonicalizeSelection(all, ['extA.search'])]).toEqual(['extA.search'])
  })

  it('resolves a unique bare name to its value', () => {
    expect([...canonicalizeSelection(all, ['todo-write'])]).toEqual(['todo-write'])
  })

  it('keeps an unknown entry so it is not silently dropped', () => {
    expect([...canonicalizeSelection(all, ['ghost'])]).toEqual(['ghost'])
  })

  it('drops blanks', () => {
    expect([...canonicalizeSelection(all, ['', '  ', 'todo-write'])]).toEqual(['todo-write'])
  })
})

describe('sanitized bare name (gateway charset)', () => {
  it('sanitizes out-of-charset characters in the bare value', () => {
    expect(sanitizeToolName('model.image')).toBe('model-image')
    expect(toolValue([t('bundled', 'model.image')], t('bundled', 'model.image'))).toBe(
      'model-image',
    )
  })

  it('resolves a legacy RAW dotted name to its sanitized value (not misread as <extId>.<name>)', () => {
    const all = [t('bundled', 'model.image')]
    // A stored bare entry `model.image` (pre-sanitize) must resolve to the
    // current value `model-image`, NOT be treated as extId `model`.
    expect([...canonicalizeSelection(all, ['model.image'])]).toEqual(['model-image'])
  })

  it('keeps a raw qualified entry resolving to its current value', () => {
    const all = [t('extA', 'search'), t('extB', 'search')]
    expect([...canonicalizeSelection(all, ['extA.search'])]).toEqual(['extA.search'])
  })
})

/**
 * A TOOL THAT CANNOT RUN MUST NOT BE SELECTABLE — AND A TOOL WE CANNOT JUDGE MUST STAY SELECTABLE.
 *
 * The second half is the one that cost data: the picker used to treat "no config fetched" as "every
 * knob is blank" and PRUNED every configured tool out of the stored whitelist, then wrote the pruned
 * set back on save. A preset that worked lost its tools by being opened.
 */
describe('toolIneligible', () => {
  const needs = (name: string, ...required: string[]) => ({
    name,
    requiredConfig: required,
  })

  it('allows a tool with no required config, whatever the config says', () => {
    expect(toolIneligible(needs('plain'), undefined)).toBeNull()
    expect(toolIneligible(needs('plain'), {})).toBeNull()
  })

  it('allows when every required knob has a value', () => {
    expect(
      toolIneligible(needs('web-search', 'search_provider'), {
        'web-search': { search_provider: 'tavily' },
      }),
    ).toBeNull()
  })

  it('reports an unmet knob: missing, empty, or null', () => {
    const t = needs('web-search', 'search_provider')
    expect(toolIneligible(t, {})).toBe('config-unmet')
    expect(toolIneligible(t, { 'web-search': { search_provider: '' } })).toBe('config-unmet')
    expect(toolIneligible(t, { 'web-search': { search_provider: null } })).toBe('config-unmet')
    expect(toolIneligible(t, { 'web-search': {} })).toBe('config-unmet')
  })

  /** `undefined` is "not loaded". It must not be read as "nothing configured". */
  it('does not judge when no config was fetched', () => {
    expect(toolIneligible(needs('web-search', 'search_provider'), undefined)).toBeNull()
  })

  it('tolerates a knob value that is not an object', () => {
    expect(toolIneligible(needs('x', 'k'), { x: 'not-an-object' })).toBe('config-unmet')
  })
})

describe('disqualifiedByConfig', () => {
  it('never disqualifies anything when no config was fetched', () => {
    const all = [
      {
        name: 'web-search',
        category: 'bundled',
        requiredConfig: ['search_provider'],
      },
    ]
    const selected = new Set([sanitizeToolName('web-search')])
    expect(disqualifiedByConfig(all as never, selected, undefined)).toEqual([])
  })

  it('names the selected entries whose config went away', () => {
    const all = [
      {
        name: 'web-search',
        category: 'bundled',
        requiredConfig: ['search_provider'],
      },
      { name: 'plain', category: 'bundled', requiredConfig: [] },
    ]
    const selected = new Set([sanitizeToolName('web-search'), sanitizeToolName('plain')])
    expect(disqualifiedByConfig(all as never, selected, {})).toEqual([
      sanitizeToolName('web-search'),
    ])
  })

  /**
   * AN UNKNOWN ENTRY IS NOT AN OFFENDER.
   *
   * A whitelist entry naming a tool this deployment does not have is kept on purpose, so that opening
   * the preset on a machine missing an extension does not rewrite it. Pruning it here would undo that.
   */
  it('leaves entries that match no tool alone', () => {
    const selected = new Set(['ghost-tool'])
    expect(disqualifiedByConfig([], selected, {})).toEqual([])
  })
})
