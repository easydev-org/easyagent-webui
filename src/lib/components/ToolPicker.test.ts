import { mount, unmount } from 'svelte'
import { describe, expect, it } from 'vitest'
import type { ToolInfo } from '$lib/models'
import ToolPicker from './ToolPicker.svelte'

/**
 * Mount smoke tests for ToolPicker. The static checks and the pure-TS unit
 * tests CANNOT catch a mount-time crash; an earlier version canonicalized the
 * selection in an `$effect` that read AND wrote the bound `selected` state,
 * which looped forever (`effect_update_depth_exceeded`) the moment the picker
 * mounted with a non-empty tool list. These tests mount it for real.
 */
const t = (category: string, name: string): ToolInfo => ({
  name,
  description: '',
  category,
  requiredConfig: [],
})

function render(tools: ToolInfo[], selected: Set<string>): () => void {
  const app = mount(ToolPicker, {
    target: document.body,
    props: { tools, selected },
  })
  return () => unmount(app)
}

describe('ToolPicker mounts without crashing', () => {
  it('a plain non-empty selection', () => {
    const done = render([t('bundled', 'todo-write')], new Set(['todo-write']))
    expect(document.body.textContent).toContain('todo-write')
    done()
  })

  it('a qualified selection (same bare name in two extensions)', () => {
    const done = render(
      [t('extA', 'search'), t('extB', 'search')],
      new Set(['extA.search']),
    )
    expect(document.body.textContent).toContain('search')
    done()
  })

  it('a legacy raw dotted entry (model.image)', () => {
    const done = render([t('bundled', 'model.image')], new Set(['model.image']))
    expect(document.body.textContent).toContain('model.image')
    done()
  })

  it('an empty tool list', () => {
    const done = render([], new Set())
    done()
  })
})
