<script lang="ts">
  // ToolPartView — web port of flutter widgets/tool_part.dart: a foldable tool
  // card (header icon+name+status, sections for input / content / metadata,
  // first-class file refs from data.files).
  import type { ChatPart, ToolState } from '$lib/models'
  import type { AgentApi } from '$lib/api'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '$lib/utils'
  import { AppIcons } from '$lib/icons'
  import MediaAttachment from './MediaAttachment.svelte'
  import type { FileRef } from '$lib/models'


  import type { AppStore } from '$lib/store.svelte'
  import TodosPanel from './TodosPanel.svelte'
  import { isTodoWrite, parseTodos } from '$lib/todos'
  import ToolCard from './ToolCard.svelte'
  import { cardFor } from '$lib/tool-cards'
  import ExtCardFrame from './ExtCardFrame.svelte'
  import { extCardFrom } from '$lib/ext-card'

  let {
    part,
    isStreaming = false,
    api,
    session = '',
    store,
  }: {
    part: ChatPart
    isStreaming?: boolean
    api: AgentApi
    // The session this card belongs to. Passed down rather than read from a global: the panel is
    // opened from a CARD, and a card only knows its own message's session.
    //
    // No tenant: it lives inside the bearer token, and the extension resolves it server-side. A
    // client that could name its own tenant could read someone else's data.
    session?: string
    // Needed to push the extension view onto the app's navigation stack. Optional so a card
    // rendered outside a shell (a test, a preview) still renders — it just cannot open a view.
    store?: AppStore
  } = $props()

  let open = $state(true)
  let inputOpen = $state(true)
  let contentOpen = $state(true)
  let metaOpen = $state(true)

  const toolState: ToolState | null = $derived(part.state ?? null)
  const tool = $derived(part.tool)
  const status = $derived(toolState?.status ?? 'complete')
  const hasError = $derived(status === 'error')
  const running = $derived(isStreaming && status === 'running')
  const input = $derived((toolState?.input ?? {}) as Record<string, unknown>)

  const output = $derived(toolState?.output ?? '')
  // How the call ended, when it is worth saying out loud. "ok" is the normal case
  // and needs no label; anything else is the difference between "finished" and
  // "stopped after printing what it had".
  // Only a genuinely interrupted or failed call gets a label. "ok" (and the words
  // tools use for it — a job says "done", a build "finished") is the normal case
  // and needs no explanation.
  const OK_STATES = new Set(['ok', 'done', 'finished', 'exited', 'complete', 'completed', 'success', 'succeeded'])
  const endedEarly = $derived(
    toolState?.toolState != null &&
      toolState.toolState !== '' &&
      !OK_STATES.has(toolState.toolState),
  )
  const meta = $derived((toolState?.data ?? {}) as Record<string, unknown>)
  const metaEntries = $derived(Object.entries(meta).filter(([k]) => k !== 'files'))

  /**
   * A `todo-write` card draws the checklist instead of its arguments.
   *
   * Null while the arguments are still streaming (only `inputText` exists): the raw preview is the
   * honest thing to show then, because the list is still being written.
   */
  const todoList = $derived(isTodoWrite(tool) ? parseTodos(input) : null)

  /**
   * The "pretty" description of this call, or null when no handler claims the tool.
   *
   * Cheap enough to derive: the handlers are pure lookups over data already in the part. When it is
   * null the card keeps the raw JSON it always had — which is also what a tool from an extension
   * this build does not know about will get.
   */
  const card = $derived(
    cardFor(tool || toolState?.title || '', meta, input, output, toolState?.error ?? ''),
  )

  /**
   * An extension's OWN card, when the tool result declares one.
   *
   * Ranked ABOVE the built-in registry: the extension knows its own payload, and it ships on its own
   * schedule, so its rendering is more likely to be right than a registry compiled into this app. The
   * built-in cards exist for the bundled tools, which have no extension to ask.
   */
  const extCard = $derived(extCardFrom(meta))
  const hasCard = $derived(card !== null || extCard !== null)

  /**
   * Pretty is the default WHEN a card exists; raw is always one tap away.
   *
   * Derived rather than stateful so a call that starts streaming (no card yet) flips to pretty on its
   * own once the handler can read it — a user who never touched the toggle should not have to.
   */
  let preferPretty = $state(true)
  const showPretty = $derived(hasCard && preferPretty)

  interface MediaRef {
    code: string
    mime?: string | null
    name?: string | null
  }
  // First-class produced-file refs from `data.files` (the unified key), with
  // the server-derived media metadata when present.
  const fileRefs = $derived.by<FileRef[]>(() => {
    const out: FileRef[] = []
    const collect = (v: unknown) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as Record<string, unknown>
        const code = o['code']
        if (typeof code === 'string' && code) {
          out.push({
            code,
            mime: (o['mime'] as string) ?? null,
            name: (o['name'] as string) ?? null,
            size: o['size'] != null ? Number(o['size']) : null,
            width: o['width'] != null ? Number(o['width']) : null,
            height: o['height'] != null ? Number(o['height']) : null,
            durationMs:
              o['duration_ms'] != null
                ? Number(o['duration_ms'])
                : o['durationMs'] != null
                  ? Number(o['durationMs'])
                  : null,
            thumbCode:
              (o['thumb_code'] as string) ??
              (o['thumbCode'] as string) ??
              null,
            thumbhash: (o['thumbhash'] as string) ?? null,
          })
        }
      }
    }
    const files = meta['files']
    if (Array.isArray(files)) files.forEach(collect)
    else collect(files)
    return out
  })

  const changeId = $derived((toolState?.changeId as string | undefined) ?? ((toolState?.data?.['change_id'] as string | undefined) ?? ''))
  const diffText = $derived((toolState?.diff as string | undefined) ?? ((toolState?.data?.['diff'] as string | undefined) ?? ''))
  const additions = $derived((toolState?.additions as number | undefined) ?? 0)
  const deletions = $derived((toolState?.deletions as number | undefined) ?? 0)
  const hasMeta = $derived(!!changeId || !!diffText || additions > 0 || deletions > 0)

  /** flutter `toolDisplayName`: `todowrite` shows as `todo`. */
  function toolDisplayName(name: string): string {
    return name === 'todowrite' ? 'todo' : name
  }


  function prettyJson(o: unknown): string {
    try {
      return JSON.stringify(o, null, 2)
    } catch {
      return String(o)
    }
  }
</script>

<div
  class={cn(
    'min-w-0 max-w-full rounded-sm text-meta',
    hasError ? 'bg-destructive/5' : 'bg-muted/35',
  )}
>
  <!-- header: [fold button ... open button]

       The two buttons are SIBLINGS in a flex row, not nested. The first version put the "open"
       control inside the fold <button>, which is invalid HTML: a button may not contain
       interactive content, so the browser treated the inner element as part of the outer one and a
       click on "open" just folded the card. `stopPropagation` cannot fix that — the event is
       delivered to the outer button because the inner one was never an independent control. -->
  <div class="flex w-full items-center gap-1">
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
      onclick={() => (open = !open)}
    >
      {#if running}
        <AppIcons.more class="size-3.5 shrink-0 text-warning" />
      {:else if hasError}
        <AppIcons.error class="size-3.5 shrink-0 text-destructive" />
      {:else}
        <AppIcons.success class="size-3.5 shrink-0 text-success" />
      {/if}
      <AppIcons.tools class="size-3.5 shrink-0 text-primary" />
      <span class="min-w-0 truncate font-semibold text-muted-foreground">{toolDisplayName(tool || toolState?.title || 'tool')}</span>
      {#if toolState?.title}
        <span class="min-w-0 flex-1 truncate text-micro text-muted-foreground italic">{toolState.title}</span>
      {:else}
        <span class="flex-1"></span>
      {/if}
      {#if open}<AppIcons.chevron_down class="size-3.5 shrink-0 text-muted-foreground" />{:else}<AppIcons.chevron_right class="size-3.5 shrink-0 text-muted-foreground" />{/if}
    </button>
    {#if hasCard}
      <!-- Two SEGMENTS, both visible, the active one filled.

           A single button showing the CURRENT mode was the first attempt and it read as a second
           control appearing after a click: press "Pretty", the button becomes "Basic", and the reader
           cannot tell whether that is a new button or the same one. Showing both states always makes
           the choice legible and the current one obvious.

           A sibling of the fold button, not a child: a button may not contain interactive content, so
           nesting would make the outer fold handler swallow these clicks. -->
      <div class="flex shrink-0 items-center rounded border border-border/60 p-px" role="group">
        <button
          type="button"
          class="rounded-sm px-1.5 py-0.5 text-micro font-medium {preferPretty
            ? 'text-muted-foreground hover:bg-muted'
            : 'bg-primary/15 text-primary'}"
          aria-pressed={!preferPretty}
          onclick={() => (preferPretty = false)}
        >
          {t('toolViewBasic')}
        </button>
        <button
          type="button"
          class="rounded-sm px-1.5 py-0.5 text-micro font-medium {preferPretty
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-muted'}"
          aria-pressed={preferPretty}
          onclick={() => (preferPretty = true)}
        >
          {t('toolViewPretty')}
        </button>
      </div>
    {/if}
  </div>

  {#if open}
    {#if showPretty && extCard}
      <!-- The extension draws this call in FULL: its arguments and its result, as its own sections,
           with any action at the end.

           From the outside it is ONE card, and that is deliberate: only the extension knows how its
           own payload divides into "what was asked" and "what came back" — and for some tools there
           is no meaningful split at all. The host does not second-guess the division.

           The body has no padding of its own: the card is a document, and it lays itself out. -->
      <div class="min-w-0 pb-2">
        <!-- The card receives the CALL, not a place to look it up: input, structured data and the
             result text. It renders those and nothing else, so it still works when the workspace
             behind the call has expired. `session` only matters if it asks to open a view. -->
        <ExtCardFrame
          card={extCard}
          tool={tool || ''}
          {input}
          data={meta}
          {output}
          error={toolState?.error ?? ''}
          {session}
          {store}
        />
      </div>
    {:else}
    <div class="min-w-0 space-y-2 px-2.5 pb-2.5">
      <!-- input section -->
      {#if Object.keys(input).length}
        <div class="min-w-0 rounded-sm border border-border/50 bg-background/50">
          <button
            type="button"
            class="flex w-full items-center gap-1 px-2 py-1 text-micro text-muted-foreground"
            onclick={() => (inputOpen = !inputOpen)}
          >
            {#if inputOpen}<AppIcons.chevron_down class="size-3.5" />{:else}<AppIcons.chevron_right class="size-3.5" />{/if}
            <AppIcons.braces class="size-[13px] text-primary" />
            <span>{t('toolInputParams')}</span>
          </button>
          {#if inputOpen}
            {#if showPretty && card}
              <!-- Pretty: the handler's description of these arguments. A checklist drawn as JSON is
                   the same information with the structure thrown away, which is why this exists. -->
              <div class="min-w-0 px-2 pb-2">
                {#if todoList}
                  <TodosPanel todos={todoList} />
                {:else}
                  <ToolCard section={card.input} {api} />
                {/if}
              </div>
            {:else}
              <!-- Includes the extension-card case: an extension describes its RESULT, not its
                   arguments, so the arguments keep the plain rendering. Drawing them through two
                   different systems would show the same JSON twice. -->
              <pre class="max-h-52 min-w-0 overflow-auto px-2 pb-2 font-mono text-[11px] wrap-anywhere whitespace-pre-wrap">{prettyJson(input)}</pre>
            {/if}
          {/if}
        </div>
      {:else if toolState?.inputText}
        <!-- Arguments still streaming (tool-input-delta): raw JSON preview. -->
        <div class="min-w-0 rounded-sm border border-border/50 bg-background/50">
          <button
            type="button"
            class="flex w-full items-center gap-1 px-2 py-1 text-micro text-muted-foreground"
            onclick={() => (inputOpen = !inputOpen)}
          >
            {#if inputOpen}<AppIcons.chevron_down class="size-3.5" />{:else}<AppIcons.chevron_right class="size-3.5" />{/if}
            <AppIcons.braces class="size-[13px] text-primary" />
            <span>{t('toolInputParams')}</span>
          </button>
          {#if inputOpen}
            <pre class="max-h-52 min-w-0 overflow-auto px-2 pb-2 font-mono text-[11px] wrap-anywhere whitespace-pre-wrap">{toolState.inputText}</pre>
          {/if}
        </div>
      {/if}

      <!-- content section -->
      {#if hasError}
        <div class="min-w-0 rounded-sm border border-destructive/40 bg-background/50">
          <button type="button" class="flex w-full items-center gap-1 px-2 py-1 text-micro text-destructive">
            <AppIcons.chevron_down class="size-3.5" />
            <AppIcons.error class="size-[13px]" />
            <span>{t('error')}</span>
          </button>
          <pre class="max-h-52 min-w-0 overflow-auto px-2 pb-2 font-mono text-[11px] wrap-anywhere whitespace-pre-wrap text-destructive">{toolState?.error}</pre>
        </div>
      {/if}

      <div class="min-w-0 rounded-sm border border-border/50 bg-background/50">
        <button
          type="button"
          class="flex w-full items-center gap-1 px-2 py-1 text-micro text-muted-foreground"
          onclick={() => (contentOpen = !contentOpen)}
        >
          {#if contentOpen}<AppIcons.chevron_down class="size-3.5" />{:else}<AppIcons.chevron_right class="size-3.5" />{/if}
          <AppIcons.file class="size-[13px] text-primary" />
          <span>{t('toolContent')}</span>
        </button>
        {#if contentOpen}
          <div class="px-2 pb-2">
            {#if showPretty && extCard}
              <!-- The extension draws its own card, in its own document (see ext-card.ts for why an
                   iframe rather than returned HTML), and it is mounted when scrolled into view.
                   `store` lets the card ask the HOST to open a view: the card knows which route is
                   worth opening, only the host knows where views live. -->
              <ExtCardFrame card={extCard} session={session} {store} />
            {:else if showPretty && card}
              <!-- The handler's reading of the result: fields plus a typed body (code, diff, image,
                   list…). The RAW text stays one tap away — this replaces the presentation of the
                   output, never the output itself. -->
              <ToolCard section={card.result} {api} />
            {:else}
              <!-- ONE rendering path for every tool.

                   The output is the same field whether the call is still running or finished: the
                   server sends snapshots, so `output` always holds everything known so far. There is
                   no separate "live transcript" to reconcile, which is why a partial result stays
                   readable after an interrupt instead of vanishing. -->
              {#if output}
                <pre
                  class="max-h-72 min-w-0 overflow-auto font-mono text-[11px] wrap-anywhere whitespace-pre-wrap">{output}</pre>
              {/if}
            {/if}
            {#if running}
              <p class="mt-1 text-micro text-muted-foreground italic">{t('running')}</p>
            {:else if endedEarly}
              <p class="mt-1 text-micro text-warning italic">
                {toolState?.toolState === 'timeout'
                  ? 'stopped: timed out'
                  : toolState?.toolState === 'cancelled'
                    ? 'stopped: cancelled'
                    : `stopped: ${toolState?.toolState}`}
              </p>
            {/if}
          </div>
        {/if}
      </div>

      <!-- produced files (first-class cards, `data.files`) -->
      {#if fileRefs.length}
        <div class="flex flex-wrap gap-2">
          {#each fileRefs as f (f.code)}
            <MediaAttachment {api} file={f} siblings={fileRefs} />
          {/each}
        </div>
      {/if}

      <!-- metadata section -->
      {#if hasMeta}
        <div class="min-w-0 rounded-sm border border-border/50 bg-background/50">
          <button
            type="button"
            class="flex w-full items-center gap-1 px-2 py-1 text-micro text-muted-foreground"
            onclick={() => (metaOpen = !metaOpen)}
          >
            {#if metaOpen}<AppIcons.chevron_down class="size-3.5" />{:else}<AppIcons.chevron_right class="size-3.5" />{/if}
            <AppIcons.info class="size-[13px] text-primary" />
            <span>{t('metadata')}</span>
          </button>
          {#if metaOpen}
            <div class="min-w-0 px-2 pb-2">
              {#if changeId}
                <div class="flex items-center gap-1 pb-1 text-micro">
                  <AppIcons.commit class="size-[13px] text-primary" />
                  <span class="text-muted-foreground">change_id</span>
                  <span class="min-w-0 truncate font-mono text-primary">{changeId}</span>
                </div>
              {/if}
              {#if (additions ?? 0) > 0 || (deletions ?? 0) > 0}
                <div class="flex items-center gap-1 pb-1 text-micro">
                  <AppIcons.diff class="size-[13px] {deletions ? 'text-destructive' : 'text-success'}" />
                  <span class="text-muted-foreground">diff</span>
                  <span class="font-mono {deletions ? 'text-destructive' : 'text-success'}">+{additions ?? 0} -{deletions ?? 0}</span>
                </div>
              {/if}
              {#if diffText}
                <div class="max-h-52 min-w-0 overflow-auto rounded-sm bg-muted/40 p-1 font-mono text-[11px] wrap-anywhere whitespace-pre-wrap">{diffText}</div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
    {/if}
  {/if}
</div>
