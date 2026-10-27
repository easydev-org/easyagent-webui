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

  import { pushFrame } from '$lib/ext-panel.svelte'

  let {
    part,
    isStreaming = false,
    api,
    tenant = '',
    session = '',
  }: {
    part: ChatPart
    isStreaming?: boolean
    api: AgentApi
    // The scope the extension needs to find its data. Passed down rather than read from a global:
    // the panel is opened from a CARD, and a card only knows what its own message was scoped to.
    tenant?: string
    session?: string
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

  // A tool may point at a view of its own results: `data.view = { ext, route, title }`.
  //
  // Kept in `data` rather than derived from the tool's name because only the tool knows WHERE its
  // results live — a clone names the workspace it just created, a status names the one it was given.
  // Reading it from `data` also means an old client shows nothing rather than a broken button: the
  // key is simply absent.
  interface ToolView {
    ext: string
    route: string
    title?: string
  }
  const view = $derived.by<ToolView | null>(() => {
    const v = meta['view'] as Partial<ToolView> | undefined
    if (!v || typeof v.ext !== 'string' || typeof v.route !== 'string') return null
    if (v.ext === '' || v.route === '') return null
    return { ext: v.ext, route: v.route, title: v.title }
  })

  function openPanel(): void {
    if (!view) return
    pushFrame({
      ext: view.ext,
      route: view.route,
      title: view.title || tool || view.ext,
      tenant,
      session,
    })
  }

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
  <!-- header: status icon → ONE fixed glyph → name → italic title → chevron -->
  <button
    type="button"
    class="flex w-full items-center gap-1 px-2 py-1 text-left"
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
    {#if view}
      <!-- Inside the header row but NOT nested in the fold button: a click here opens the panel, and
           nesting it would also toggle the card. `stopPropagation` alone is not enough, because the
           fold handler is on the parent element and would still fire on the same event. -->
      <span
        role="button"
        tabindex="0"
        class="shrink-0 rounded px-1.5 py-0.5 text-micro font-medium text-primary hover:bg-primary/10"
        title={t('openInPanel')}
        onclick={e => {
          e.stopPropagation()
          e.preventDefault()
          openPanel()
        }}
        onkeydown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation()
            e.preventDefault()
            openPanel()
          }
        }}
      >
        {t('open')}
      </span>
    {/if}
    {#if open}<AppIcons.chevron_down class="size-3.5 shrink-0 text-muted-foreground" />{:else}<AppIcons.chevron_right class="size-3.5 shrink-0 text-muted-foreground" />{/if}
  </button>

  {#if open}
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
            <pre class="max-h-52 min-w-0 overflow-auto px-2 pb-2 font-mono text-[11px] wrap-anywhere whitespace-pre-wrap">{prettyJson(input)}</pre>
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
            <!-- ONE rendering path for every tool.

                 The output is the same field whether the call is still running or
                 finished: the server sends snapshots, so `output` always holds
                 everything known so far. There is no separate "live transcript"
                 to reconcile, which is why a partial result stays readable after
                 an interrupt instead of vanishing. -->
            {#if output}
              <pre
                class="max-h-72 min-w-0 overflow-auto font-mono text-[11px] wrap-anywhere whitespace-pre-wrap">{output}</pre>
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
</div>
