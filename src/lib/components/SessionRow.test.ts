import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '$lib/i18n.svelte'
import type { Session } from '$lib/models'
import SessionRow from './SessionRow.svelte'

/**
 * The row's relative-time stamp must REFRESH as wall-clock advances. It is
 * derived from a reactive clock, not a bare `Date.now()` — the old version
 * froze the label at whatever it said on first render (stuck on "1 分钟前"
 * until something else re-rendered the row).
 */
function session(lastMessageAt: string): Session {
  return {
    id: 'demo:repo:main',
    org: 'demo',
    repo: 'repo',
    branch: 'main',
    model: '',
    variant: '',
    preset: '',
    createdAt: lastMessageAt,
    updatedAt: lastMessageAt,
    lastMessageAt,
    lastMessagePreview: '',
  } as Session
}

afterEach(() => {
  vi.useRealTimers()
})

describe('SessionRow relative-time stamp', () => {
  it('updates as the clock advances (no user interaction)', async () => {
    setLocale('en')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:59Z'))
    // last message 59s before "now" -> "just now".
    const app = mount(SessionRow, {
      target: document.body,
      props: { session: session('2026-01-01T00:00:00Z') },
    })
    const stamp = () =>
      document.querySelector('button span.w-\\[52px\\]')?.textContent?.trim() ??
      ''
    expect(stamp()).toBe('just now')
    // 30s later the shared clock ticks AND a minute boundary is crossed; the
    // label must re-render with no user interaction.
    await vi.advanceTimersByTimeAsync(31_000)
    await tick()
    expect(stamp()).toBe('1 min ago')
    unmount(app)
  })
})
