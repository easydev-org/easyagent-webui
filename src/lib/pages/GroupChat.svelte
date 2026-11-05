<script lang="ts">
  // GroupChat — one group's transcript.
  //
  // THE TRANSCRIPT IS THE GROUP'S OWN, not an index over member sessions: a message posted here is stored
  // before it is delivered, so a member that joins later reads what it missed and a message outlives the
  // departure of everyone who saw it.
  //
  // THE STREAM IS THE ONLY WRITER. Sending goes through the RPC, which stores the message; the message then
  // arrives on the watch like any other. Appending the sent message locally would show it twice whenever the
  // watch caught up, and in the wrong order whenever two people posted at once.
  import { untrack } from 'svelte'
  import type { PageProps } from '$lib/page-props'
  import { t } from '$lib/i18n.svelte'
  import { showErrorToast } from '$lib/toast.svelte'
  import { now } from '$lib/clock.svelte'
  import type { GroupMember, GroupMessage } from '$lib/models'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'
  import ChatAvatar from '$lib/components/ChatAvatar.svelte'
  import { AppIcons } from '$lib/icons'

  let { store, initialId }: PageProps = $props()

  const group = $derived(initialId ?? '')

  let messages = $state<GroupMessage[]>([])
  let members = $state<GroupMember[]>([])
  let loading = $state(true)
  let sending = $state(false)
  let text = $state('')
  let failed = $state('')

  // The sender: the user posts with NO sender, which the server treats as "reaches the coordinator".
  const sendAs = ''

  let listEl: HTMLDivElement | null = $state(null)
  let followBottom = $state(true)

  const coordinator = $derived(members.find(m => m.role === 'coordinator')?.session ?? '')

  /** A member's display name, falling back to the id when the session cannot be resolved. */
  function labelOf(m: GroupMessage): string {
    if (!m.sender) return t('groupYou')
    if (m.senderName) return m.senderName
    const s = store.sessions.find(x => x.id === m.sender)
    return s ? s.name || s.id : m.sender
  }

  function stamp(iso: string): string {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  $effect(() => {
    // `untrack` the clock: this effect exists to scroll, and reading `now()` reactively would make it rerun
    // every second for no reason.
    void now()
    untrack(() => {
      if (followBottom && listEl) listEl.scrollTop = listEl.scrollHeight
    })
  })

  $effect(() => {
    const name = group
    if (!name) return
    void (async () => {
      loading = true
      try {
        const meta = await store.api.group(name)
        members = meta.members
        // THE PAGE PROVIDES THE HISTORY, THE STREAM PROVIDES THE FUTURE. Loading a page first means the view
        // is populated even if the stream takes a moment to open.
        const page = await store.api.groupMessages(name, 0, 100)
        messages = page.messages
        // The watch starts from the newest message we hold, so nothing in the page is replayed.
        void watch(name, page.latestSeq)
      } catch (e) {
        failed = String(e)
      } finally {
        loading = false
      }
    })()
  })

  async function watch(name: string, sinceSeq: number) {
    try {
      for await (const m of store.api.watchGroup(name, sinceSeq)) {
        // THE STREAM IS AUTHORITATIVE AND ALSO IDEMPOTENT: a reconnect replays from the cursor, so a message
        // may arrive twice. Deduping by seq keeps the list from growing duplicates after a dropped stream.
        if (messages.some(x => x.seq === m.seq)) continue
        messages = [...messages, m]
      }
    } catch {
      /* the stream ended; the next mount restarts it. A reconnect banner would be noise here. */
    }
  }

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    sending = true
    try {
      await store.api.sendGroupMessage(group, body, sendAs)
      text = ''
      followBottom = true
    } catch (e) {
      showErrorToast(String(e))
    } finally {
      sending = false
    }
  }

  function onScroll() {
    const el = listEl
    if (!el) return
    followBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }
</script>

<div class="flex h-full min-h-0 w-full min-w-0 flex-col">
  <PageHeader title={group} onBack={() => store.popPage()}>
    {#snippet right()}
      <span class="text-micro text-muted-foreground"
        >{t('groupMemberCount', { arg1: members.length })}</span
      >
    {/snippet}
  </PageHeader>

  {#if loading}
    <p class="p-4 text-meta text-muted-foreground">{t('loading')}</p>
  {:else if failed}
    <p class="p-4 text-meta text-destructive">{failed}</p>
  {:else}
    <div
      bind:this={listEl}
      onscroll={onScroll}
      class="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
    >
      {#if messages.length === 0}
        <p class="py-10 text-center text-meta text-muted-foreground">{t('groupNoMessages')}</p>
      {/if}
      {#each messages as m (m.seq)}
        {@const mine = !m.sender}
        <div class="flex gap-2 {mine ? 'flex-row-reverse' : ''}">
          <ChatAvatar
            seed={m.sender || group}
            size={28}
            label={labelOf(m)}
            fetchBytes={store.api.fetchFileBytes.bind(store.api)}
          />
          <div class="min-w-0 max-w-[78%]">
            <div class="mb-0.5 flex items-baseline gap-2 {mine ? 'justify-end' : ''}">
              <span class="text-micro font-semibold">{labelOf(m)}</span>
              <span class="text-micro text-muted-foreground">{stamp(m.createdAt)}</span>
            </div>
            <div
              class="rounded-lg px-2.5 py-1.5 text-meta whitespace-pre-wrap break-words {mine
                ? 'bg-primary/14'
                : 'bg-muted'}"
            >
              {m.body}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div class="flex shrink-0 items-end gap-2 border-t border-border px-3 py-2">
      <textarea
        bind:value={text}
        rows="1"
        placeholder={t('groupMessagePlaceholder')}
        class="min-h-9 flex-1 resize-none rounded-md border border-border bg-transparent px-2 py-1.5 text-meta outline-none focus:border-primary"
        onkeydown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send()
          }
        }}></textarea>
      <button
        type="button"
        class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/80 disabled:opacity-40"
        disabled={!text.trim() || sending}
        onclick={() => void send()}
      >
        <AppIcons.send class="size-4" />
      </button>
    </div>

    {#if coordinator}
      <p class="shrink-0 border-t border-border px-3 py-1 text-micro text-muted-foreground">
        {t('groupRoutingHint')}
      </p>
    {/if}
  {/if}
</div>
