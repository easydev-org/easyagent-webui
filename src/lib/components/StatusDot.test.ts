/**
 * StatusDot draws one fact — is this session working — the same way everywhere.
 *
 * THE CASES THAT MATTER ARE THE TWO QUIET ONES. "unknown" must be visibly different from "idle" (the lease could not
 * be read, so we do not know), and an ABSENT status must draw nothing at all: a caller that never asked should not
 * be shown a grey dot claiming the session is stopped.
 */
import { mount, unmount } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'
import StatusDot from './StatusDot.svelte'

let host: HTMLElement | null = null
let app: Record<string, unknown> | null = null

function render(props: { status?: string }) {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = mount(StatusDot, { target: host, props })
  return host
}

afterEach(() => {
  if (app) unmount(app)
  if (host) host.remove()
  app = null
  host = null
})

describe('StatusDot', () => {
  it('pulses when busy', () => {
    const dot = render({ status: 'busy' }).querySelector('span')
    expect(dot?.className).toContain('animate-pulse')
    expect(dot?.className).toContain('bg-success')
  })

  it('is quiet when idle', () => {
    const dot = render({ status: 'idle' }).querySelector('span')
    expect(dot?.className).not.toContain('animate-pulse')
    expect(dot?.className).toContain('bg-muted-foreground/60')
  })

  it('is amber when the lease could not be read', () => {
    const dot = render({ status: 'unknown' }).querySelector('span')
    expect(dot?.className).toContain('bg-warning')
  })

  it('draws nothing when nobody asked', () => {
    expect(render({}).querySelector('span')).toBeNull()
  })
})
