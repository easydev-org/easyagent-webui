// MessageSync — reconciles the reactive store with the authoritative server
// chain: incremental sync (tip anchor), full baseline, paged fetch and the
// post-turn reconcile. It owns the in-memory sync anchor (tip) and knows nothing
// about the live stream (MessagesController owns that and calls in here).
//
// There is NO local message mirror: switching sessions always needs the network
// (the controller rebuilds + init()s per session, so a baseline fetch is
// unavoidable), so a mirror would only save the first frame while adding a
// second source of truth (hydrate + cache-consistency checks + a per-page
// DELETE+reinsert). The window lives purely in memory.
import type { AgentApi } from './api'
import { mapMessagesToChat } from './message-mapping'
import type { MessageStore } from './message-store.svelte'

export class MessageSync {
  /** Newest server message id we hold — the stream anchor and delta cursor. */
  syncedTipId = ''

  constructor(
    private api: AgentApi,
    private getSessionId: () => string,
    private store: MessageStore,
  ) {}

  /** Incremental when we hold an anchor, else a baseline fetch. */
  async sync(sid: string): Promise<void> {
    this.store.loading = this.store.messages.length === 0
    this.store.notify()
    try {
      if (this.syncedTipId) {
        const r = await this.api.messagesAfter(sid, this.syncedTipId)
        if (r.resync) {
          await this.baseline(sid)
        } else if (
          r.messages.length === 0 &&
          this.store.messages.length === 0
        ) {
          await this.baseline(sid)
        } else {
          this.store.mergeServer(r.messages)
          this.syncedTipId = r.tipId
        }
      } else {
        await this.baseline(sid)
      }
    } catch {
      /* offline: keep whatever the window already shows */
    }
    this.store.loading = false
    this.store.notify()
  }

  /** Full baseline: the newest page, replacing the in-memory window. */
  async baseline(sid: string): Promise<void> {
    try {
      const [msgs, more] = await this.api.messages(sid, undefined, 50)
      const chat = mapMessagesToChat(msgs)
      this.store.messages = [
        ...this.store.inFlightLocal(),
        ...this.store.errors,
        ...chat,
      ]
      this.store.renumber()
      this.store.hasMore = more
      this.syncedTipId = chat.length ? chat[chat.length - 1]!.id : ''
    } catch {
      /* keep the existing window */
    }
  }

  /** Page of older messages (load-more). */
  async fetch(before?: string): Promise<void> {
    this.store.loading = true
    this.store.notify()
    try {
      const sid = this.getSessionId()
      const [msgs, more] = await this.api.messages(sid, before, 50)
      const chat = mapMessagesToChat(msgs)
      if (before != null) {
        const existing = new Set(this.store.messages.map(m => m.id))
        this.store.messages = [
          ...chat.filter(m => !existing.has(m.id)),
          ...this.store.messages,
        ]
      } else {
        this.store.messages = [
          ...this.store.inFlightLocal(),
          ...this.store.errors,
          ...chat,
        ]
      }
      this.store.renumber()
      this.store.hasMore = more
    } catch {
      /* keep current view */
    }
    this.store.loading = false
    this.store.notify()
  }

  /** After a turn completes (or a message-added nudge), pull the server delta
   *  and adopt real ids. */
  async reconcile(): Promise<void> {
    const sid = this.getSessionId()
    try {
      if (!this.syncedTipId) {
        await this.baseline(sid)
        return
      }
      const r = await this.api.messagesAfter(sid, this.syncedTipId)
      if (r.resync) {
        await this.baseline(sid)
        return
      }
      this.store.mergeServer(r.messages)
      this.syncedTipId = r.tipId
      this.store.notify()
    } catch {
      /* offline reconcile retry on next turn */
    }
  }
}
