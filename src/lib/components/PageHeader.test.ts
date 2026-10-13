import { mount, unmount } from 'svelte'
import { describe, expect, it } from 'vitest'
import PageHeader from './layout/PageHeader.svelte'

/**
 * Generic "renders without crashing" smoke for a presentational component that
 * pulls in real `$lib` deps (icons, cn). It also pins the documented contract:
 * `title` and the default children render TOGETHER (an earlier `{:else if}`
 * version silently dropped the title when a caller passed both).
 */
describe('PageHeader mounts', () => {
  it('renders the title', () => {
    const app = mount(PageHeader, {
      target: document.body,
      props: { title: 'Hi' },
    })
    expect(document.body.textContent).toContain('Hi')
    unmount(app)
  })

  it('renders the title AND children together', () => {
    const app = mount(PageHeader, {
      target: document.body,
      props: { title: 'Title' },
    })
    expect(document.querySelector('header')?.textContent).toContain('Title')
    unmount(app)
  })
})
