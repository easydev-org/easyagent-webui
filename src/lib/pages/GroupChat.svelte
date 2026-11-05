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
  import { showErrorToast, showToast } from '$lib/toast.svelte'
  import { now } from '$lib/clock.svelte'
  import { guessMime } from '$lib/media'
  import type { FileRef, GroupMember, GroupMessage } from '$lib/models'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'
  import ChatAvatar from '$lib/components/ChatAvatar.svelte'
  import MediaAttachment from '$lib/components/MediaAttachment.svelte'
  import FileRefText from '$lib/components/FileRefText.svelte'
  import { VoiceRecorder } from '$lib/voice'
  import { fmtElapsed } from '$lib/chat-helpers'
  import { AppIcons } from '$lib/icons'
  import { cn } from '$lib/utils'

  let { store, initialId }: PageProps = $props()

  const group = $derived(initialId ?? '')

  let messages = $state<GroupMessage[]>([])
  let members = $state<GroupMember[]>([])
  let loading = $state(true)
  let sending = $state(false)
  let text = $state('')
  let failed = $state('')
  /**
   * ATTACHMENTS ARE UPLOADED BEFORE THE MESSAGE IS POSTED.
   *
   * A group message carries `file:<code>` references, so the bytes have to exist before the transcript can
   * point at them. Uploading first also means a message is posted with everything it needs or not at all —
   * a half-uploaded message would wake a member that finds nothing to read.
   */
  let attachments = $state<FileRef[]>([])
  let uploading = $state(false)
  let voiceMode = $state(false)
  let recording = $state(false)
  let recordElapsed = $state(0)
  let recordTimer: ReturnType<typeof setInterval> | null = null
  const recorder = new VoiceRecorder()

  /** Upload one file and hold its reference for the next send. */
  async function uploadOne(file: File) {
    uploading = true
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const done = await store.api.uploadFile({
        path: '',
        name: file.name || 'file',
        mimeType: file.type || guessMime(file.name),
        bytes,
      })
      // DEDUPE BY CODE: identical bytes yield the same code, and two entries sharing one break the keyed list.
      if (!attachments.some(a => a.code === done.code)) attachments = [...attachments, done]
    } catch (e) {
      showErrorToast(String(e))
    } finally {
      uploading = false
    }
  }

  function pickFiles(accept: string) {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    if (accept) input.accept = accept
    input.onchange = () => {
      for (const f of input.files ?? []) void uploadOne(f)
    }
    input.click()
  }

  /** Hold-to-talk: press starts, release uploads. The same recorder the chat uses. */
  async function startRecording() {
    if (recording) return
    recording = true
    recordElapsed = 0
    recordTimer = setInterval(() => (recordElapsed += 200), 200)
    const ok = await recorder.start()
    if (!ok) {
      if (recordTimer) {
        clearInterval(recordTimer)
        recordTimer = null
      }
      recording = false
      showErrorToast(t('voicePermission'))
    }
  }

  async function stopRecording() {
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }
    if (!recording) return
    recording = false
    const src = await recorder.stop()
    if (!src) {
      showToast(t('voiceTooShort'))
      return
    }
    // A VOICE NOTE IS A FILE LIKE ANY OTHER: it uploads, and the message carries its reference.
    uploading = true
    try {
      const done = await store.api.uploadFile({
        path: '',
        name: src.name,
        mimeType: src.mimeType,
        bytes: src.bytes,
      })
      if (!attachments.some(a => a.code === done.code)) attachments = [...attachments, done]
    } catch (e) {
      showErrorToast(String(e))
    } finally {
      uploading = false
    }
  }

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

  /**
   * Open a member's own profile page from their picture.
   *
   * A GROUP IS WHERE SEVERAL SESSIONS ARE SEEN SIDE BY SIDE, and the picture is the thing the reader
   * recognises them by. Tapping it doing nothing is the one place that feels broken: every other avatar in
   * this app — the session list, the chat header — is a doorway to that session's card.
   *
   * THE PROFILE PAGE READS THE ACTIVE SESSION, so it must be selected first. Setting it here rather than
   * navigating blind is what makes the page show THIS member instead of whoever was selected before.
   */
  function openMemberProfile(m: GroupMessage) {
    if (!m.sender) return
    store.activeSessionId = m.sender
    store.pushPage({ kind: 'session_profile', key: 'session_profile' })
  }

  /**
   * THE SENDER'S OWN PICTURE, if they have one.
   *
   * A message carries the sender's NAME as it was when sent, but not their avatar — the picture is a property
   * of the session, not of the message, and storing a copy per message would freeze an image the session may
   * have since changed. So the picture is read from the live session and the identicon is what shows when there
   * is none, which is the same rule as everywhere else.
   */
  function avatarOf(m: GroupMessage): string {
    if (!m.sender) return ''
    return store.sessions.find(x => x.id === m.sender)?.avatarFile ?? ''
  }

  /**
   * RELATIVE TIME, WORDED EXACTLY AS A CHAT WORDS IT.
   *
   * `10:56` is a clock reading, which asks the reader to compare it against their own. "3 minutes ago" is what
   * they actually wanted to know — and the two screens are the same conversation in two shapes, so they say it
   * the same way.
   *
   * THIS IS A COPY OF MessageBubble's fmtTime, deliberately: the group's transcript does not use that component
   * (its rows are not a session chain), and duplicating four lines is cheaper than a shared helper whose only
   * caller is a component that cannot be reused. The wording comes from the same i18n keys, so it cannot
   * drift in translation.
   */
  function fmtTime(iso: string, at: number): string {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const atDate = new Date(at)
    const mins = Math.floor((at - d.getTime()) / 60000)
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    if (mins < 1) return t('timeJustNow')
    if (mins < 60) return t('timeMinAgo', { arg1: mins })
    if (d.toDateString() === atDate.toDateString()) return hm
    return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
  }

  /**
   * copyBody puts a message's words on the clipboard, with the same toast a chat shows.
   *
   * THE SAME SHAPE AS MessageBubble's copy, including the absence of an error branch: a clipboard write that
   * the browser refuses is not something this page can act on, and a toast about it would report a failure the
   * reader can do nothing about. The chat made that call first; the group follows it.
   */
  function copyBody(text: string) {
    void navigator.clipboard.writeText(text).then(() => showToast(t('copied')))
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
    // A MESSAGE NEEDS SOMETHING IN IT: words, a file, or both.
    if ((!body && attachments.length === 0) || sending || uploading) return
    sending = true
    try {
      await store.api.sendGroupMessage(group, body, sendAs, attachments)
      text = ''
      attachments = []
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
      <!-- THE HEADER OPENS THE GROUP'S CARD, the same gesture a chat header already has: clicking the name
           there opens the session's profile. A group's picture, purpose and member list live one page in, and
           this is where a reader looks for them. -->
      <button
        type="button"
        class="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        title={t('groupInfo')}
        aria-label={t('groupInfo')}
        onclick={() => store.pushPage({ kind: 'group_info', key: 'group_info', id: group })}
      >
        <AppIcons.info class="size-[18px]" />
      </button>
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
        <!-- THE SAME SHAPE AS A ONE-TO-ONE CHAT, with the two things a group needs on top.
             A bubble is a block you read down: the picture and the speaker's name share one row ABOVE the
             bubble, flush left, and the bubble sits under them.

             THE NAME SITS BESIDE THE PICTURE, not below it. Below read as a caption on the avatar rather than
             as the author of the message, and it pushed the bubble a line further down for no gain.

             THE TIME MOVES TO THE ACTION ROW, under the bubble, next to copy — the same place and the same
             wording as a chat ("just now", "3 minutes ago"). A group has no undo (there is nothing to withdraw
             from a transcript several people have read), so copy is the only action there. -->
        <div class={cn('mb-3 flex flex-col', mine ? 'items-end' : 'items-start')}>
          {#if !mine}
            <div class="mb-1 flex w-full items-center gap-2">
              <!-- A MEMBER'S PICTURE OPENS THEIR CARD, the same gesture as every other avatar in this app. -->
              <button
                type="button"
                class="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={labelOf(m)}
                aria-label={labelOf(m)}
                onclick={() => openMemberProfile(m)}
              >
                <ChatAvatar
                  seed={m.sender}
                  size={28}
                  label={labelOf(m)}
                  avatar={avatarOf(m)}
                  fetchBytes={store.api.fetchFileBytes.bind(store.api)}
                />
              </button>
              <span class="truncate text-micro font-semibold">{labelOf(m)}</span>
            </div>
          {/if}

          <div class="flex max-w-[85%] flex-col {mine ? 'items-end' : 'items-start'}">
            <div
              class={cn(
                'min-w-0 max-w-full space-y-1.5 rounded-md border px-3 py-2.5 break-words',
                mine ? 'border-primary/40 bg-primary/12' : 'border-border/50 bg-card',
              )}
            >
              <!-- MARKDOWN, EXACTLY AS A CHAT RENDERS IT: a session's reply is prose that uses lists, emphasis
                   and code, and printing it as one pre-wrapped block lost all of it — a numbered plan arrived as
                   a wall of asterisks. The user's own words stay plain: they are what a person typed, not a
                   document, and running them through a renderer would make their asterisks mean something. -->
              {#if m.body}
                <FileRefText text={m.body} api={store.api} markdown={!mine} />
              {/if}
              <!-- AN ATTACHMENT IS A `file:<code>` REFERENCE, drawn by the same component a chat uses — so a
                   picture in a group looks like a picture in a chat, and a voice note plays the same way.

                   ONE ATTACHMENT FILLS THE BUBBLE; SEVERAL ARE A GRID. Stacking them at full width pushed the
                   conversation off the screen — three photos became three screens of scrolling — while a single
                   one at tile size was too small to see. The grid is the shape an IM app uses for the same
                   reason: the bubble stays about the size of its contents. -->
              {#if (m.attachments ?? []).length === 1}
                <MediaAttachment
                  api={store.api}
                  file={m.attachments![0]}
                  siblings={m.attachments ?? []}
                />
              {:else if (m.attachments ?? []).length > 1}
                <div class="flex flex-wrap gap-1">
                  {#each m.attachments! as f (f.code)}
                    <MediaAttachment
                      api={store.api}
                      file={f}
                      siblings={m.attachments ?? []}
                      dimension={96}
                    />
                  {/each}
                </div>
              {/if}
            </div>
            <div
              class={cn(
                'mt-1 flex items-center gap-0.5 text-micro text-muted-foreground',
                mine ? 'justify-end' : 'justify-start',
              )}
            >
              <!-- COPY, because a group message can be quoted somewhere else. NO UNDO: a group has a
                   transcript several sessions have already read, and withdrawing it would not unsend it. -->
              {#if m.body}
                <button
                  type="button"
                  class="rounded p-0.5 hover:bg-muted"
                  title={t('copy')}
                  aria-label={t('copy')}
                  onclick={() => void copyBody(m.body)}
                >
                  <AppIcons.copy class="size-3.5" />
                </button>
              {/if}
              <span class="ml-1 tabular-nums opacity-70">{fmtTime(m.createdAt, now())}</span>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- THE COMPOSER IS THE SAME COMPOSER AS A ONE-TO-ONE CHAT.
         A group is a conversation; a reader who has typed in one has already learned where the field is, how
         tall it grows, and what the send circle looks like. A second, smaller box here made the same act feel
         like a different feature — and the field was visibly narrower than the messages above it.

         A GROUP ALSO ACCEPTS WHAT A CHAT ACCEPTS: a picture, a voice note, a file. Those are attachments —
         `file:<code>` references — so a voice note posted here plays, looks and behaves exactly like one
         posted in a one-to-one chat. -->
    <div class="shrink-0 border-t border-border bg-card px-3 pt-1 pb-1">
      {#if attachments.length}
        <div class="mb-2 flex flex-wrap gap-1 pt-1">
          {#each attachments as a (a.code)}
            <div class="relative">
              <MediaAttachment
                api={store.api}
                code={a.code}
                name={a.name ?? ''}
                mime={a.mime}
                size={a.size ?? null}
                dimension={64}
              />
              <button
                type="button"
                class="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-muted-foreground/70 text-white hover:bg-destructive"
                title={t('delete')}
                aria-label={t('delete')}
                onclick={() => (attachments = attachments.filter(x => x.code !== a.code))}
              >
                <AppIcons.close class="size-2.5" />
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <div class="flex items-center gap-2">
        <!-- Left: mic/keyboard toggle, in the same 42px slot the chat uses. -->
        <button
          type="button"
          class="flex size-[42px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40"
          title={voiceMode ? t('keyboardMode') : t('voiceMode')}
          aria-label={voiceMode ? t('keyboardMode') : t('voiceMode')}
          disabled={sending}
          onclick={() => (voiceMode = !voiceMode)}
        >
          {#if voiceMode}<AppIcons.keyboard class="size-[22px]" />{:else}<AppIcons.mic
              class="size-[22px]"
            />{/if}
        </button>

        <div
          class="relative min-h-[44px] flex-1 rounded-md border {recording
            ? 'border-destructive bg-destructive/12'
            : 'border-border/60 bg-muted'}"
        >
          <textarea
            bind:value={text}
            rows="1"
            class="block w-full min-h-[42px] max-h-40 resize-none border-0 bg-transparent px-3 py-[10px] text-sm leading-[21px] outline-none placeholder:text-muted-foreground {voiceMode
              ? 'invisible'
              : ''}"
            placeholder={attachments.length ? '' : t('groupMessagePlaceholder')}
            onkeydown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}></textarea>

          {#if voiceMode}
            <!-- HOLD TO TALK, exactly as in the chat: press starts, release uploads. The label sits on top of
                 the (invisible) textarea so the field's geometry cannot change between the two modes. -->
            <button
              type="button"
              class="absolute inset-0 flex items-start justify-center touch-none select-none px-3 py-[10px] text-sm leading-[21px] [-webkit-touch-callout:none] {recording
                ? 'font-semibold text-destructive'
                : 'text-muted-foreground'}"
              oncontextmenu={e => e.preventDefault()}
              onpointerdown={e => {
                e.preventDefault()
                try {
                  e.currentTarget.setPointerCapture(e.pointerId)
                } catch {
                  /* unsupported */
                }
                void startRecording()
              }}
              onpointerup={() => void stopRecording()}
              onpointercancel={() => void stopRecording()}
            >
              {recording ? `${t('releaseToSend')} · ${fmtElapsed(recordElapsed)}` : t('holdToTalk')}
            </button>
          {/if}
        </div>

        <button
          type="button"
          class="flex size-[42px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40"
          title={t('attach')}
          aria-label={t('attach')}
          disabled={sending || uploading}
          onclick={() => pickFiles('')}
        >
          {#if uploading}
            <span
              class="block size-5 animate-spin rounded-full border-2 border-border border-t-muted-foreground"
            ></span>
          {:else}
            <AppIcons.add class="size-5" />
          {/if}
        </button>

        <!-- Send: one circle, disabled until there is something to send — words or a file. -->
        <button
          type="button"
          class="flex size-[42px] shrink-0 items-center justify-center rounded-full border border-primary bg-card text-primary disabled:border-border disabled:text-muted-foreground disabled:opacity-40"
          title={t('send')}
          aria-label={t('send')}
          disabled={(!text.trim() && attachments.length === 0) || sending || uploading}
          onclick={() => void send()}
        >
          {#if sending}
            <span
              class="block size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
            ></span>
          {:else}
            <AppIcons.send class="size-5" />
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>
