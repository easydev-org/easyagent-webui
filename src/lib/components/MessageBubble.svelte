<script lang="ts">
  // MessageBubble — web port of flutter widgets/message_bubble.dart:
  // reasoning-first ordering, file-ref chips, foldable reasoning + compaction
  // blocks, tool cards, error styling and the hover actions row
  // (copy / retry / edit / undo with confirm).
  import type { AgentApi } from '$lib/api'
  import type { ChatMessage, ChatPart } from '$lib/models'
  import { t } from '$lib/i18n.svelte'
  import { renderMarkdown } from '$lib/markdown'
  import { showToast } from '$lib/toast.svelte'
  import { cn } from '$lib/utils'
  import { AppIcons } from '$lib/icons'
  import { now } from '$lib/clock.svelte'
  import { Dialog } from '$lib/components/ui/dialog'
  import { Textarea } from '$lib/components/ui/textarea'
  import ChatAvatar from '$lib/components/ChatAvatar.svelte'
  import ToolPartView from './ToolPartView.svelte'
  import type { AppStore } from '$lib/store.svelte'
  import MediaAttachment from './MediaAttachment.svelte'
  import FileRefText from './FileRefText.svelte'
  import CompactionDivider from './CompactionDivider.svelte'

  let {
    msg,
    api,
    onUndo,
    onResend,
    onEdit,
    onRegenerate,
    onOpenSession,
    onOpenGroup,
    sessionExists,
    sessionLabel,
    sessionId = '',
    store,
  }: {
    msg: ChatMessage
    api: AgentApi
    onUndo: (messageId: string) => void
    // For opening an extension view from a tool card: it is a PAGE on this store's stack.
    store?: AppStore
    onResend?: ((text: string) => void) | null
    onEdit?: ((text: string) => void) | null
    /** Re-run the turn from THIS agent step: withdraw this message and
     *  everything after, then continue (no prompt inserted). */
    onRegenerate?: (() => void) | null
    /** Open the session named by a `session:{name}` source (jump to it). */
    onOpenSession?: ((sessionId: string) => void) | null
    /** Opens a GROUP by ID, for a `group:` source. The id is the identity; the name is only what the chip displays. */
    onOpenGroup?: ((groupId: string) => void) | null
    /** Whether a `session:{name}` source still resolves to a live session. */
    sessionExists?: ((sessionId: string) => boolean) | null
    /** Resolves a session id to its display name, for a chip or an avatar caption. */
    sessionLabel?: ((sessionId: string) => string) | null
    /** Id of the OPEN session, used to seed the assistant avatar on the left. */
    sessionId?: string
  } = $props()

  const isUser = $derived(msg.role === 'user')
  const isError = $derived(msg.role === 'error')
  const isRoleSystem = $derived(msg.role === 'system' || msg.role === 'event')
  // A compaction checkpoint is a persisted SYSTEM message: render it as a
  // centered divider, NOT a bubble (and never with an assistant avatar).
  const isCompaction = $derived(msg.role === 'compaction')
  const isStreaming = $derived(msg.status === 'streaming')
  // Optimistic user bubble awaiting the backend `message-added` confirmation:
  // a spinner sits to its LEFT and every action is hidden until it lands.
  const isSending = $derived(msg.status === 'sending')

  // ---- message ORIGIN (msg.source) ----
  //   ''            -> agent-authored row (assistant/event), or a legacy user
  //                    message with no recorded origin -> treated as `user`
  //   'user'        -> a human prompt (the reader's own message)
  //   'session:X'   -> delivered by another session (subsession / mail-send)
  //   'system:X'    -> produced by automation
  // A `session:X` message is treated as INCOMING (left-aligned, carrying the
  // SENDER's avatar) even though its role is `user`; `system:X` renders as a
  // centred notice. Only the reader's OWN prompts stay right-aligned — and,
  // per spec, carry NO avatar (avatars live on the LEFT only).
  /**
   * WHERE THE MESSAGE CAME FROM.
   *
   * `group:<name>/<sender>` IS ITS OWN KIND, not a session hand-off: a group message came from a
   * CONVERSATION, and the reader should be able to open that conversation — a `session:` source only knows
   * the sender, so the group half would be lost and the message would look like a private message.
   */
  const sourceKind = $derived<'user' | 'session' | 'system' | 'group' | 'other'>(
    msg.source.startsWith('group:')
      ? 'group'
      : msg.source.startsWith('session:')
        ? 'session'
        : msg.source.startsWith('system:')
          ? 'system'
          : msg.source === '' || msg.source === 'user'
            ? 'user'
            : 'other',
  )
  /**
   * What follows `session:` / `system:` / `group:`, up to the sender.
   *
   * FOR A GROUP THIS IS AN ID, not a name: `group:<id>/<sender>` is what the agent writes now that the id is the
   * identity. The chip labels itself with the group's name, but it NAVIGATES by this value — so treating it as a
   * name would open nothing the moment a group was renamed.
   */
  const sourceName = $derived(
    sourceKind === 'session'
      ? msg.source.slice('session:'.length)
      : sourceKind === 'system'
        ? msg.source.slice('system:'.length)
        : sourceKind === 'group'
          ? msg.source.slice('group:'.length).split('/')[0] || ''
          : '',
  )
  /**
   * The group's DISPLAY NAME for a `group:` source.
   *
   * `sourceName` is the id — the address the chip navigates by — so showing it put a 32-character string in a chip
   * a person reads. The name comes from the store when the list has the group, falling back to the id so an unknown
   * group is still attributable rather than blank.
   */
  const groupLabel = $derived(
    sourceKind === 'group'
      ? (store?.groups.find(g => g.id === sourceName)?.name ?? sourceName)
      : '',
  )

  /** The sending session for a `group:` source ('' when the user posted it). */
  const groupSender = $derived(
    sourceKind === 'group' ? msg.source.slice('group:'.length).split('/')[1] || '' : '',
  )
  // A system-sourced message renders like a system notice (centred).
  const isSystem = $derived(isRoleSystem || sourceKind === 'system')
  /**
   * WHETHER THE READER WROTE THIS — and a GROUP message they posted counts.
   *
   * A message the USER sent to a group arrives in the coordinator's transcript as `group:<id>` with NO sender
   * segment; a member's post carries `group:<id>/<session>`. That empty tail is the discriminator, and it is the
   * only one available: both are role `user`, because both ARE user-shaped input to the model.
   *
   * TREATING THEM AS INCOMING WAS WRONG IN A WAY THAT READS AS A BUG: the person's own words appeared on the left
   * with an avatar, indistinguishable from a worker's report, so "did I say that or did something else" had no
   * answer on the page where they supervise.
   *
   * A SESSION HAND-OFF STAYS INCOMING: role `user`, but written by another session, not by this reader.
   */
  const isOwn = $derived(
    isUser && sourceKind !== 'session' && (sourceKind !== 'group' || groupSender === ''),
  )

  /**
   * senderLabel renders a session id as the name a reader knows it by.
   *
   * THE ID IS WHAT THE WIRE CARRIES and the name is what a person recognises; showing the id in a chip would
   * make the reader match a 32-character string against a list. Falls back to the id so an unresolvable
   * sender is still attributable rather than blank.
   */
  function senderLabel(id: string): string {
    return sessionLabel?.(id) || id
  }
  // An agent-authored assistant step (never a hand-off / system / compaction).
  // Undo applies to it too (withdraw this step and everything after); the
  // regenerate action re-runs the turn from here.
  const isAssistant = $derived(msg.role === 'assistant')
  const canUndo = $derived(!isSending && !isStreaming && (isOwn || isAssistant))
  // Left-aligned and avatar-bearing (assistant replies, session hand-offs).
  const incoming = $derived(!isOwn && !isSystem)

  // Jump-to-session is offered only while the source session still exists.
  const canOpenSession = $derived(
    (sourceKind === 'session' ||
      (sourceKind === 'group' &&
        !!groupSender &&
        (!sessionExists || sessionExists(groupSender)))) &&
      !!onOpenSession,
  )
  // Every LEFT-side avatar: a session hand-off uses the SOURCE session id; an
  // assistant reply (or any other incoming row) uses the OPEN session id.
  const avatarSeed = $derived(
    sourceKind === 'session'
      ? sourceName
      : sourceKind === 'group' && groupSender
        ? groupSender
        : sessionId || 'assistant',
  )
  const showAvatar = $derived(incoming && !isError && !isSending)

  /**
   * Source chip tone: sky for a session hand-off, violet for a system notice, emerald for a group.
   *
   * THE GROUP CASE WAS MISSING, so a group message would have drawn the system notice's violet — and the chip
   * itself was not rendered at all, because the condition below only knew two kinds.
   */
  const sourceChipClass = $derived(
    cn(
      'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium',
      sourceKind === 'session'
        ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
        : sourceKind === 'group'
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          : 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    ),
  )

  // Reasoning always renders ABOVE the rest (stable partition).
  /**
   * A GROUP MESSAGE IS DRAWN FROM THE EVENT, NOT FROM THE PROMPT WRITTEN ABOUT IT.
   *
   * The `text` part of a channel-delivered message is a rendering for the model: it names the sender, quotes
   * the body, and appends the routing instruction. Drawn in a bubble, that showed the reader the envelope —
   * including a note about how to reply — as if they had typed it.
   *
   * WHEN A `channel` PART EXISTS IT REPLACES THE TEXT PART. The prompt rendering stays in the record, because
   * the model still reads it; the console reads the event.
   */
  const channelPart = $derived(msg.parts.find(p => p.type === 'channel') ?? null)

  const ordered = $derived.by<ChatPart[]>(() => {
    const rest = msg.parts.filter(p => p.type !== 'reasoning' && p.type !== 'channel')
    // The event stands in for the rendered prompt, so the rendered prompt is dropped — not appended after it.
    const body = channelPart ? rest.filter(p => p.type !== 'text') : rest
    const lead: ChatPart[] = [
      ...msg.parts.filter(p => p.type === 'reasoning'),
      ...(channelPart
        ? [
            {
              id: channelPart.id,
              type: 'text',
              text: channelPart.text ?? '',
              tool: '',
            } as ChatPart,
          ]
        : []),
    ]
    return [...lead, ...body]
  })

  const hasText = $derived(msg.parts.some(p => p.type === 'text' || p.type === 'reasoning'))

  // All file parts in this message (stable), so a file card can open the
  // viewer with sibling navigation (←/→) across the message's files.
  const fileRefs = $derived(
    msg.parts
      .filter(p => p.type === 'file' && p.code)
      .map(p => ({
        code: p.code as string,
        name: p.name ?? null,
        mime: p.mime ?? null,
        size: p.size ?? null,
        width: p.width ?? null,
        height: p.height ?? null,
        durationMs: p.durationMs ?? null,
        thumbCode: p.thumbCode ?? null,
        thumbhash: p.thumbhash ?? null,
      })),
  )

  /**
   * HOW MANY ATTACHMENTS THIS MESSAGE CARRIES, and which part opens the block.
   *
   * ONE FILLS THE BUBBLE; SEVERAL ARE A GRID. Stacking them at full width turns three photos into three screens
   * of scrolling, while drawing a single one at tile size makes it too small to see. The block is rendered once,
   * at the position of the first file part — the place a reader expects the attachments, after the text that
   * introduces them.
   */
  const fileParts = $derived(msg.parts.filter(p => p.type === 'file' && p.code))
  const fileBlockAt = $derived(fileParts[0]?.id ?? '')

  let reasoningOpen = $state(false)
  let editOpen = $state(false)
  let editText = $state('')
  let undoOpen = $state(false)
  let retryOpen = $state(false)
  let regenerateOpen = $state(false)

  function textOfMessage(): string {
    return msg.parts
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join('\n')
  }

  function copy() {
    const text = msg.parts
      .filter(p => p.type === 'text' || p.type === 'reasoning')
      .map(p => p.text)
      .join('\n')
    void navigator.clipboard.writeText(text).then(() => showToast(t('copied')))
  }

  function beginEdit() {
    editText = textOfMessage()
    editOpen = true
  }

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

  // NOTE: the bubble has NO context-menu / long-press action sheet.
  // Selecting message text (notably long-press-to-select on touch) used to
  // surface a stray popup, so that whole path was removed. All message actions
  // live in the hover row below (copy / retry / edit / undo).
</script>

{#snippet chipBody()}
  {#if sourceKind === 'group'}
    <!-- A GROUP MESSAGE SAYS WHICH CONVERSATION IT CAME FROM AND WHO SPOKE, because those are two different
         questions and a chip that answered only one left the reader guessing.

         "YOU" IS SAID EXPLICITLY when the reader wrote it. A group message they posted carries no sender, and
         leaving the chip to imply authorship by alignment alone made the reader compare bubbles instead of reading
         a label — on the page where they supervise, "did I say that or did something else" has to be answerable at
         a glance.

         THE NAME, NOT THE ID. `sourceName` holds the id — that is the address — so printing it raw put a
         32-character string where a label belongs. -->
    <AppIcons.users class="size-3" />
    {#if groupSender}
      {t('mailboxFromGroup')}
      {#if groupLabel}<span class="opacity-80">· {groupLabel}</span>{/if}
      <span class="opacity-80">· {senderLabel(groupSender)}</span>
    {:else}
      {t('mailboxFromYouInGroup')}
      {#if groupLabel}<span class="opacity-80">· {groupLabel}</span>{/if}
    {/if}
  {:else if sourceKind === 'session'}
    <AppIcons.chat class="size-3" />
    {t('mailboxFromSession')}
    {#if sourceName}<span class="opacity-80">· {sourceName}</span>{/if}
  {:else}
    <AppIcons.bolt class="size-3" />
    {t('mailboxFromSystem')}
    {#if sourceName}<span class="opacity-80">· {sourceName}</span>{/if}
  {/if}
{/snippet}

{#if isCompaction}
  <!-- A compaction checkpoint: centered divider, no bubble / avatar / actions. -->
  {#each msg.parts.filter(p => p.type === 'compaction') as part (part.id)}
    <CompactionDivider {part} />
  {/each}
{:else if isStreaming && ordered.length === 0}
  <div class="mb-3 flex items-center gap-2 text-micro text-muted-foreground">
    <span
      class="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
    ></span>
    {#if msg.retrying}
      {t('retrying')} (#{msg.retrying.attempt})
    {:else}
      {t('thinking')}
    {/if}
  </div>
{:else}
  <div
    class={cn(
      'mb-3 flex flex-col',
      isSystem ? 'items-center' : isOwn ? 'items-end' : 'items-start',
    )}
  >
    <!-- Avatars live ABOVE the bubble, flush to the left edge: the assistant
         reply and a session hand-off each show a 28px avatar on its own row
         above the bubble; the reader's OWN prompt has none. The bubble below
         stays left-aligned (incoming) / right-aligned (own). -->
    {#if showAvatar}
      <div class="mb-1 flex w-full items-center">
        {#if canOpenSession}
          <!-- Session hand-off: the SOURCE session's avatar jumps to it. -->
          <button
            type="button"
            class="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={sourceName}
            aria-label={t('mailboxFromSession')}
            onclick={() => onOpenSession?.(sourceName)}
          >
            <ChatAvatar seed={avatarSeed} size={28} />
          </button>
        {:else}
          <span
            class="shrink-0"
            title={sourceKind === 'session' ? sourceName : ''}
            aria-hidden={sourceKind !== 'session'}
          >
            <ChatAvatar seed={avatarSeed} size={28} />
          </span>
        {/if}
      </div>
    {/if}
    <!-- Sending row: the spinner sits to the LEFT of the user bubble while the
         backend has not yet confirmed the write. -->
    <div class={cn('flex max-w-full items-center gap-2', isOwn ? 'flex-row' : 'flex-row-reverse')}>
      {#if isSending}
        <span
          class="size-3 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
          title={t('sending')}
          aria-label={t('sending')}
        ></span>
      {/if}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class={cn(
          'min-w-0 max-w-full rounded-md border px-3 py-2.5',
          isError && 'border-destructive/40 bg-destructive/10',
          isSystem && 'border-muted-foreground/25 bg-muted/30',
          sourceKind === 'session' && !isError && 'border-sky-500/40 bg-sky-500/10',
          isOwn && !isError && !isSystem && 'border-primary/40 bg-primary/12',
          !isOwn && !isError && !isSystem && sourceKind !== 'session' && 'border-border/50 bg-card',
        )}
      >
        <div class="flex min-w-0 max-w-full flex-col items-start gap-2 text-left">
          {#if isError}
            <span class="text-micro font-semibold text-destructive">
              {msg.errorKind === 'send' ? t('sendFailedTitle') : t('modelError')}
            </span>
          {/if}
          <!-- A MESSAGE THE READER WROTE NEEDS NO SOURCE CHIP: alignment and the bubble already say it is theirs,
               and a chip reading "you, in group X" is a label on something self-evident. It is kept for everyone
               ELSE's messages, where the chip is the only thing that says which conversation it came from. -->
          {#if (sourceKind === 'session' || sourceKind === 'system' || sourceKind === 'group') && !isOwn}
            <!-- Source chip: "来自会话 · {name}" / "来自系统 · {name}". The
               session chip opens that session when it still exists. -->
            <!-- A GROUP CHIP OPENS THE GROUP, NOT THE SENDER: the chip names which conversation this came
                 from, so that is where a click should land. The sender's own card is one click away from the
                 group's member list. -->
            {#if sourceKind === 'group' && onOpenGroup && sourceName}
              <button
                type="button"
                onclick={() => onOpenGroup?.(sourceName)}
                title={sourceName}
                class={sourceChipClass}
              >
                {@render chipBody()}
              </button>
            {:else if canOpenSession}
              <button
                type="button"
                onclick={() => onOpenSession?.(sourceName)}
                title={sourceName}
                class={sourceChipClass}
              >
                {@render chipBody()}
              </button>
            {:else}
              <span class={sourceChipClass}>{@render chipBody()}</span>
            {/if}
          {/if}
          {#each ordered as part (part.id)}
            {#if part.type === 'text'}
              <FileRefText text={part.text} {api} markdown={!isUser} streaming={isStreaming} />
            {:else if part.type === 'file' && part.id === fileBlockAt}
              <!-- EVERY ATTACHMENT OF THIS MESSAGE, drawn once. A single one fills the bubble; several share a
                   grid row, which is how a message with three photos stays the size of a message. -->
              {#if fileRefs.length === 1}
                <MediaAttachment {api} file={fileRefs[0]!} siblings={fileRefs} />
              {:else}
                <div class="flex flex-wrap gap-1">
                  {#each fileRefs as f (f.code)}
                    <MediaAttachment {api} file={f} siblings={fileRefs} dimension={96} />
                  {/each}
                </div>
              {/if}
            {:else if part.type === 'file'}
              <!-- DRAWN BY THE BLOCK ABOVE. A file part after the first is part of that same block. -->
            {:else if part.type === 'reasoning'}
              <!-- flutter `_ReasoningBlock`: amber LEFT border, warning tint,
                 right-only radius, auto-expanded while streaming. -->
              <div
                class="w-full rounded-r-sm border-l-2 border-l-warning bg-warning/5 py-1 pr-2 pl-3"
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-1.5 text-left text-micro font-semibold text-warning"
                  onclick={() => (reasoningOpen = !reasoningOpen)}
                >
                  {#if reasoningOpen}<AppIcons.chevron_down
                      class="size-3.5"
                    />{:else}<AppIcons.chevron_right class="size-3.5" />{/if}
                  <span>{t('thinkLabel')}{isStreaming ? '…' : ''}</span>
                </button>
                {#if reasoningOpen || isStreaming}
                  <div class="md-body pt-1 text-muted-foreground">
                    {#if isStreaming}<span class="whitespace-pre-wrap break-words">{part.text}</span
                      >{:else}{@html renderMarkdown(part.text)}{/if}
                  </div>
                {/if}
              </div>
            {:else if part.type === 'tool' && part.state}
              <div class="w-full">
                <!-- sessionId scopes the extension's data to THIS session; `store` is what lets the
                   card push the view onto the app's navigation stack.
                   No tenant: it lives inside the token and the extension resolves it server-side. -->
                <ToolPartView {part} {isStreaming} {api} session={sessionId} {store} />
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </div>

    {#if !isStreaming && !isSystem}
      <div
        class={cn(
          'mt-1 flex items-center gap-0.5 text-micro text-muted-foreground',
          isOwn ? 'justify-end' : 'justify-start',
        )}
      >
        {#if hasText}
          <button
            type="button"
            class="rounded p-0.5 hover:bg-muted"
            title={t('copy')}
            aria-label={t('copy')}
            onclick={copy}><AppIcons.copy class="size-3.5" /></button
          >
        {/if}
        <!-- retry / edit apply ONLY to the reader's OWN prompts (never a
             session hand-off); undo also applies to an agent assistant step,
             and regenerate re-runs the turn from that step. -->
        {#if !isSending && isOwn && onResend}
          <button
            type="button"
            class="rounded p-0.5 hover:bg-muted"
            title={t('retry')}
            aria-label={t('retry')}
            onclick={() => (retryOpen = true)}><AppIcons.refresh class="size-3.5" /></button
          >
        {/if}
        {#if !isSending && isOwn && onEdit}
          <button
            type="button"
            class="rounded p-0.5 hover:bg-muted"
            title={t('edit')}
            aria-label={t('edit')}
            onclick={beginEdit}><AppIcons.edit class="size-3.5" /></button
          >
        {/if}
        {#if !isSending && isAssistant && onRegenerate}
          <button
            type="button"
            class="rounded p-0.5 hover:bg-muted"
            title={t('regenerate')}
            aria-label={t('regenerate')}
            onclick={() => (regenerateOpen = true)}><AppIcons.refresh class="size-3.5" /></button
          >
        {/if}
        {#if canUndo}
          <button
            type="button"
            class="rounded p-0.5 hover:bg-muted"
            title={t('undo')}
            aria-label={t('undo')}
            onclick={() => (undoOpen = true)}><AppIcons.undo class="size-3.5" /></button
          >
        {/if}
        {#if msg.createdAt}
          <span class="ml-1 tabular-nums opacity-70">{fmtTime(msg.createdAt, now())}</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<!-- edit dialog -->
<Dialog bind:open={editOpen} title={t('editMessage')}>
  {#snippet children()}
    <Textarea bind:value={editText} rows={5} />
  {/snippet}
  {#snippet footer()}
    <button
      type="button"
      class="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
      onclick={() => (editOpen = false)}>{t('cancel')}</button
    >
    <button
      type="button"
      class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/80"
      onclick={() => {
        const v = editText.trim()
        editOpen = false
        if (v) onEdit?.(v)
      }}>{t('apply')}</button
    >
  {/snippet}
</Dialog>

<!-- retry confirm: withdraws this message and everything after, then resends -->
<Dialog bind:open={retryOpen} title={t('retryTitle')}>
  {#snippet children()}
    <div class="text-meta text-muted-foreground">{t('retryBody')}</div>
  {/snippet}
  {#snippet footer()}
    <button
      type="button"
      class="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
      onclick={() => (retryOpen = false)}>{t('cancel')}</button
    >
    <button
      type="button"
      class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/80"
      onclick={() => {
        retryOpen = false
        onResend?.(textOfMessage())
      }}>{t('retry')}</button
    >
  {/snippet}
</Dialog>

<!-- undo confirm -->
<Dialog bind:open={undoOpen} title={t('undoTitle')}>
  {#snippet children()}
    <div class="text-meta text-muted-foreground">{t('undoBody')}</div>
  {/snippet}
  {#snippet footer()}
    <button
      type="button"
      class="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
      onclick={() => (undoOpen = false)}>{t('cancel')}</button
    >
    <button
      type="button"
      class="rounded-md bg-destructive px-3 py-1.5 text-sm text-white hover:bg-destructive/80"
      onclick={() => {
        undoOpen = false
        onUndo(msg.id)
      }}>{t('undo')}</button
    >
  {/snippet}
</Dialog>

<!-- regenerate confirm: withdraw this agent step and everything after, then
     re-run the turn from here (no prompt is inserted). -->
<Dialog bind:open={regenerateOpen} title={t('regenerateTitle')}>
  {#snippet children()}
    <div class="text-meta text-muted-foreground">{t('regenerateBody')}</div>
  {/snippet}
  {#snippet footer()}
    <button
      type="button"
      class="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
      onclick={() => (regenerateOpen = false)}>{t('cancel')}</button
    >
    <button
      type="button"
      class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/80"
      onclick={() => {
        regenerateOpen = false
        onRegenerate?.()
      }}>{t('regenerate')}</button
    >
  {/snippet}
</Dialog>
