/**
 * A group message from another session shows THAT session's picture.
 *
 * THE BUG THIS PINS: the bubble seeded the identicon from the sender's id and passed `avatar=""`, so every peer
 * rendered an identical honeycomb. The seed was right — it named the right session — but a seed is not the picture:
 * the avatar a session uploaded lives on its row, and the row has to be asked for at render time.
 *
 * IT ASKS BY ID because that is all the message carries (`group:<id>/<session>`). Copying an avatar into the
 * transcript instead would freeze it at send time, so a session that changed its picture would keep showing the old
 * one in every message it had ever sent.
 */
import { mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '$lib/i18n.svelte'
import type { ChatMessage } from '$lib/models'
import MessageBubble from './MessageBubble.svelte'

let host: HTMLElement | null = null
let app: Record<string, unknown> | null = null

/** A minimal store: only what the bubble reads for an avatar. */
function storeWith(session: { id: string; avatarFile?: string } | null) {
  return {
    sessionById: (id: string) =>
      session && session.id === id ? session : null,
    sessionAvatar: (id: string) =>
      session && session.id === id ? (session.avatarFile ?? '') : '',
    groups: [] as unknown[],
    api: { fetchFileBytes: vi.fn(async () => new Uint8Array()) },
  }
}

function groupMessage(from: string): ChatMessage {
  return {
    id: 'm1',
    role: 'user',
    // The wire form: `group:<id>` for the user's own post, `group:<id>/<sender>` for a member's.
    source: `group:grp-1/${from}`,
    parts: [
      { id: 'p1', type: 'text', text: 'on it' } as ChatMessage['parts'][number],
    ],
  } as ChatMessage
}

function render(msg: ChatMessage, store: ReturnType<typeof storeWith>) {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = mount(MessageBubble, {
    target: host,
    props: {
      msg,
      api: store.api as never,
      store: store as never,
      onUndo: () => {},
      sessionLabel: (id: string) => `name-${id}`,
    },
  })
  return host
}

afterEach(() => {
  if (app) unmount(app)
  if (host) host.remove()
  app = null
  host = null
  setLocale('en')
})

describe('MessageBubble avatar for a group sender', () => {
  it("resolves the SENDING session's picture by its id", () => {
    setLocale('en')
    const avatarFile = 'file:abc123'
    const store = storeWith({ id: 'worker-1', avatarFile })
    const spy = vi.spyOn(store, 'sessionAvatar')

    render(groupMessage('worker-1'), store)

    // THE ASSERTION IS THE LOOKUP, not the pixels: what went wrong was that the picture was never asked for at all,
    // so the bubble drew a honeycomb for every peer. Asking by the SENDER's id is the whole fix.
    expect(spy).toHaveBeenCalledWith('worker-1')
  })

  it('falls back to the identicon when the sender has no picture', () => {
    setLocale('en')
    const el = render(groupMessage('worker-2'), storeWith({ id: 'worker-2' }))
    expect(el.textContent).toContain('name-worker-2')
  })

  it('a message the USER posted is not attributed to a session', () => {
    setLocale('en')
    const own = { ...groupMessage(''), source: 'group:grp-1' } as ChatMessage
    const el = render(own, storeWith(null))
    // No sender segment means the reader wrote it: no speaker label, no avatar.
    expect(el.textContent).not.toContain('name-')
  })
})
