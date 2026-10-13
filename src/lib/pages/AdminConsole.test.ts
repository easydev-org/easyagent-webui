import { mount, unmount } from 'svelte'
import { describe, expect, it } from 'vitest'
import { setLocale } from '$lib/i18n.svelte'
import AdminConsole from './AdminConsole.svelte'

/**
 * Mount smoke test: the admin console must RENDER without crashing (a Svelte 5
 * effect that reads+writes the same state loops with
 * `effect_update_depth_exceeded` on mount, which no static check catches). It
 * fetches tenants via AdminService in `onMount`; with no server that call
 * rejects and is caught, so the empty-state path renders.
 */
describe('AdminConsole mounts', () => {
  it('renders the admin header without crashing', () => {
    setLocale('en')
    const app = mount(AdminConsole, {
      target: document.body,
      props: { baseUrl: 'http://127.0.0.1:1', token: 't', onLogout: () => {} },
    })
    expect(document.querySelector('header')?.textContent).toContain('Admin')
    unmount(app)
  })
})
