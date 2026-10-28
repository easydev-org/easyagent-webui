<script lang="ts">
  // Renders ONE CardSection: its labelled rows and its optional body.
  //
  // The caller draws two of these per tool card — one for the arguments, one for the result — each
  // with its own Pretty/raw toggle. Keeping the section a separate component is what makes those two
  // halves symmetrical instead of two nearly-identical blocks of markup.
  import { t } from '$lib/i18n.svelte'
  import { AppIcons } from '$lib/icons'
  import { cn } from '$lib/utils'
  import type { CardBody, CardSection } from '$lib/tool-cards'
  import type { AgentApi } from '$lib/api'
  import MediaAttachment from './MediaAttachment.svelte'

  // `api` is only needed for media bodies: the attachment component resolves a file code to a URL
  // through it. Optional so a card with no media renders without one.
  let { section, api }: { section: CardSection; api?: AgentApi } = $props()

  /** Resolve a label: a `tc*` key is localized, anything else is literal data. */
  function lbl(key: string): string {
    if (!key.startsWith('tc')) return key
    const resolved = t(key)
    // t() echoes the key when it is missing; falling back to the key is still the best available
    // answer, but the card should not show `tcQuery` to a reader, so strip the prefix.
    return resolved === key ? key.slice(2) : resolved
  }

  function icon(name: string) {
    const map = AppIcons as unknown as Record<string, typeof AppIcons.file>
    return map[name] ?? AppIcons.circle
  }

  const tone = (v: CardSection['fields'][number]['tone']): string =>
    v === 'success'
      ? 'text-success'
      : v === 'destructive'
        ? 'text-destructive'
        : v === 'warning'
          ? 'text-warning'
          : v === 'muted'
            ? 'text-muted-foreground'
            : 'text-foreground'
</script>

{#if section.fields.length > 0}
  <dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5">
    {#each section.fields as f (f.label + f.value)}
      {@const Icon = icon(f.icon)}
      <dt class="flex items-center gap-1 text-micro text-muted-foreground">
        <Icon class="size-3 shrink-0" />
        <span class="truncate">{lbl(f.label)}</span>
      </dt>
      <dd class={cn('min-w-0 truncate text-meta', f.mono && 'font-mono', tone(f.tone))} title={f.value}>
        {f.value}
      </dd>
    {/each}
  </dl>
{/if}

{#if section.body}
  {@const body: CardBody = section.body}
  <div class="mt-1.5 min-w-0">
    {#if body.kind === 'code'}
      <!-- No line-number gutter here: the payload's own was stripped by the handler, and a second,
           differently-aligned one is worse than none. The row above says which lines these are. -->
      <pre
        class="max-h-64 overflow-auto rounded-sm border border-border/50 bg-card px-2 py-1.5 font-mono text-[11px] leading-[1.45]">{body.text}</pre>
    {:else if body.kind === 'diff'}
      <pre
        class="max-h-64 overflow-auto rounded-sm border border-border/50 bg-card px-2 py-1.5 font-mono text-[11px] leading-[1.45]">{body.diff}</pre>
    {:else if body.kind === 'text'}
      <pre
        class={cn(
          'max-h-64 overflow-auto rounded-sm border border-border/50 bg-card px-2 py-1.5 font-mono text-[11px] wrap-anywhere whitespace-pre-wrap',
          body.tone === 'destructive' && 'text-destructive',
        )}>{body.text}</pre>
    {:else if body.kind === 'command'}
      <pre
        class="overflow-auto rounded-sm border border-border/50 bg-card px-2 py-1.5 font-mono text-[11px]"><span
          class="text-muted-foreground">$ </span>{body.command}</pre>
    {:else if body.kind === 'kv'}
      <dl class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {#each body.rows as r (r.k)}
          <dt class="text-micro text-muted-foreground">{lbl(r.k)}</dt>
          <dd class={cn('min-w-0 truncate text-meta', r.mono && 'font-mono')} title={r.v}>{r.v}</dd>
        {/each}
      </dl>
    {:else if body.kind === 'markdown'}
      <!-- Fetched pages arrive as markdown; a wall of asterisks is not what was fetched. Sanitized
           in $lib/markdown — the source is somebody else's HTML. -->
      <div class="max-h-64 overflow-auto text-meta leading-relaxed">
        {#await import('$lib/markdown') then md}
          <div>{@html md.renderMarkdown(body.text)}</div>
        {:catch}
          <pre class="whitespace-pre-wrap font-mono text-[11px]">{body.text}</pre>
        {/await}
      </div>
    {:else if body.kind === 'media'}
      <!-- One component for every media case: it resolves a file code to a URL through `api`, picks
           the right element (img/video/audio) from the mime, and keeps the full-screen viewer. A
           hand-rolled <audio> tag beside it would drift from all of that. -->
      {#if api}
        <MediaAttachment {api} code={body.code} mime={body.mime} name={body.name ?? ''} />
      {/if}
    {:else if body.kind === 'audio'}
      {#if api}
        <MediaAttachment {api} code={body.code} name={body.caption ?? ''} mime="audio/mpeg" />
      {/if}
    {:else if body.kind === 'files'}
      <div class="flex flex-wrap gap-1">
        {#if api}
          {#each body.files as f (f.code)}
            <MediaAttachment {api} code={f.code} mime={f.mime} name={f.name ?? ''} />
          {/each}
        {/if}
      </div>
    {:else if body.kind === 'messages'}
      <ul class="max-h-64 overflow-auto rounded-sm border border-border/50">
        {#each body.entries as e, i (i)}
          <li class="border-b border-border/30 px-2 py-1 last:border-0">
            <div class="flex items-center gap-1 text-micro text-muted-foreground">
              <span class="font-semibold">{e.role}</span>
              {#if e.tool_name}<span class="font-mono">{e.tool_name}</span>{/if}
              {#if e.created_at}<span class="ml-auto">{e.created_at}</span>{/if}
            </div>
            <div class="line-clamp-3 text-meta wrap-anywhere">{e.content}</div>
          </li>
        {/each}
      </ul>
    {:else if body.kind === 'list'}
      <ul class="max-h-64 overflow-auto rounded-sm border border-border/50">
        {#each body.rows as r, i (i)}
          <li class="border-b border-border/30 px-2 py-1 last:border-0">
            {#if r.url}
              <a href={r.url} target="_blank" rel="noopener noreferrer" class="text-meta text-primary hover:underline">
                {r.label}
              </a>
            {:else}
              <span class="text-meta">{r.label}</span>
            {/if}
            {#if r.sub}<div class="line-clamp-2 text-micro text-muted-foreground">{r.sub}</div>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
