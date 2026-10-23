<script lang="ts">
  // What a session LISTENS TO.
  //
  // Rendered from what the extensions declare, like the permissions tab: a channel and its
  // documented topic shapes come from a manifest, never from this file. Adding an extension
  // that publishes a new channel must not mean editing the console.
  //
  // The pattern field is pre-filled from the selected channel's documented topic shape,
  // because a user should not have to derive "tag.agentdev/mrflow.>" from documentation —
  // but it stays editable, since the documented shape is a shape, not the only valid filter.
  import { t } from '$lib/i18n.svelte'
  import type { ChannelDecl, ChannelSubscription } from '$lib/models'
  import { cn } from '$lib/utils'

  interface Props {
    decls: ChannelDecl[]
    subs: ChannelSubscription[]
    locale?: string
    error?: string
    onsubscribe: (channel: string, pattern: string, wake: boolean) => Promise<void> | void
    onunsubscribe: (sub: ChannelSubscription) => Promise<void> | void
  }
  let { decls, subs, locale = '', error = '', onsubscribe, onunsubscribe }: Props = $props()

  let adding = $state(false)
  let channel = $state('')
  let pattern = $state('')
  let wake = $state(true)
  let busy = $state(false)

  /** Suggested pattern for the selected channel's first documented topic.
   *
   *  A documented shape like "tag.<owner>/<repo>.<tag>" becomes "tag.<owner>/<repo>.>":
   *  the LITERAL segments are kept and only the trailing placeholders collapse into ">".
   *
   *  Keeping the placeholders is deliberate. Filling them in would require the console to
   *  guess a repository, and a wrong guess silently subscribes to nothing. Dropping them
   *  ("tag.>") subscribes to EVERY repository, which is more than the user asked for and is
   *  the kind of over-broad permission that is easy to leave in place. Leaving "<owner>/<repo>"
   *  visible makes the missing part obvious, and the user cannot submit it by accident
   *  because "<" is not a valid subject segment. */
  function suggestPattern(d: ChannelDecl | undefined): string {
    if (!d || d.topics.length === 0) return ''
    const shape = d.topics[0].pattern
    const head = shape.split('<')[0].replace(/[.\/]$/, '')
    return head ? head + '.<owner>/<repo>.>' : '<owner>/<repo>.>'
  }

  function startAdd(d?: ChannelDecl) {
    adding = true
    channel = d?.name ?? ''
    pattern = suggestPattern(d)
    wake = true
  }

  async function confirm() {
    if (busy || !channel || !pattern) return
    busy = true
    try {
      await onsubscribe(channel, pattern, wake)
      adding = false
    } finally {
      busy = false
    }
  }

  /** Why the pattern cannot be submitted, or '' when it can.
   *
   *  Mirrors the server's rules so the user is told HERE rather than by a rejected request.
   *  A leftover "<owner>" placeholder is the common case: it is what the suggestion fills in,
   *  and it is not a valid subject segment — catching it locally makes the required edit
   *  obvious instead of producing a server error that reads like a bug. */
  const patternError = $derived.by(() => {
    const p = pattern.trim()
    if (p === '') return t('channelsPatternRequired')
    if (p.includes('<') || p.includes(' ')) return t('channelsPatternPlaceholder')
    const segs = p.split('.')
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]
      if (s === '') return t('channelsPatternEmptySegment')
      if (s === '>') {
        if (i !== segs.length - 1) return t('channelsPatternWildcardLast')
        continue
      }
      if (s !== '*' && (s.includes('*') || s.includes('>'))) return t('channelsPatternWholeSegment')
    }
    return ''
  })

  const canConfirm = $derived(channel.trim() !== '' && patternError === '')
</script>

<div class="space-y-3">
  {#if error}
    <p class="text-micro text-destructive">{error}</p>
  {/if}

  <section>
    <h3 class="mb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">
      {t('channelsSubscribed')}
    </h3>
    {#if subs.length === 0}
      <p class="text-micro text-muted-foreground italic">{t('channelsNoneSubscribed')}</p>
    {:else}
      {#each subs as s (s.id)}
        <div class="mb-1 rounded border border-border">
          <div class="flex items-center justify-between gap-2 px-2 py-1">
            <span class="min-w-0 flex-1 truncate font-mono text-[10px]">
              {s.channel}.{s.pattern}
            </span>
            {#if s.system}
              <!-- The built-in subscription is shown but not removable: it is how anything
                   reaches this session by name. -->
              <span class="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">
                {t('channelsBuiltIn')}
              </span>
            {:else}
              <button
                class="shrink-0 rounded px-1 text-micro text-destructive hover:bg-destructive/10"
                onclick={() => void onunsubscribe(s)}
              >
                {t('unsubscribe')}
              </button>
            {/if}
          </div>
          <p class="px-2 pb-1 text-[9px] text-muted-foreground">
            {s.wake ? t('channelsWakes') : t('channelsContextOnly')}
          </p>
        </div>
      {/each}
    {/if}
  </section>

  {#if !adding}
    <button
      class="w-full rounded border border-dashed border-border py-1 text-micro text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      onclick={() => startAdd()}
    >
      + {t('channelsSubscribe')}
    </button>
  {:else}
    <div class="rounded border border-border bg-muted/30 p-2">
      <p class="mb-2 text-micro font-medium">{t('channelsSubscribe')}</p>

      {#if decls.length > 0}
        <label class="mb-1.5 block">
          <span class="text-[10px] text-muted-foreground">{t('channelsChannel')}</span>
          <select
            class="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
            bind:value={channel}
            onchange={() => (pattern = suggestPattern(decls.find(d => d.name === channel)))}
          >
            <option value="">—</option>
            {#each [...new Set(decls.map(d => d.name))] as name (name)}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </label>
      {:else}
        <label class="mb-1.5 block">
          <span class="text-[10px] text-muted-foreground">{t('channelsChannel')}</span>
          <input
            class="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 font-mono text-[11px]"
            bind:value={channel}
          />
        </label>
      {/if}

      <label class="mb-1.5 block">
        <span class="text-[10px] text-muted-foreground">{t('channelsPattern')}</span>
        <input
          class="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 font-mono text-[11px]"
          bind:value={pattern}
          placeholder="tag.owner/repo.>"
        />
      </label>
      {#if patternError}
        <p class="mb-1.5 text-[9px] text-destructive">{patternError}</p>
      {/if}

      <!-- The documented topic shapes, so a user can see what this channel emits without
           reading the extension's manifest. -->
      {#each decls.filter(d => !channel || d.name === channel) as d (d.extId + d.name)}
        {#if d.topics.length > 0}
          <div class="mb-1.5 rounded bg-background/60 px-1.5 py-1">
            {#each d.topics as top (top.pattern)}
              <p class="font-mono text-[9px] text-muted-foreground">{top.pattern}</p>
              {#if top.descriptions?.[locale] || top.description}
                <p class="mb-1 text-[9px] text-muted-foreground italic">
                  {top.descriptions?.[locale] || top.description}
                </p>
              {/if}
            {/each}
          </div>
        {/if}
      {/each}

      <label class="mb-2 flex items-center gap-1.5">
        <input type="checkbox" bind:checked={wake} />
        <span class="text-[10px]">{t('channelsWake')}</span>
      </label>
      <p class="mb-2 text-[9px] text-muted-foreground italic">{t('channelsWakeHint')}</p>

      <div class="flex justify-end gap-2">
        <button
          class="rounded px-2 py-1 text-micro text-muted-foreground hover:bg-muted"
          onclick={() => (adding = false)}
        >
          {t('cancel')}
        </button>
        <button
          class={cn(
            'rounded bg-primary px-2 py-1 text-micro text-primary-foreground',
            (!canConfirm || busy) && 'opacity-50',
          )}
          disabled={!canConfirm || busy}
          onclick={() => void confirm()}
        >
          {t('confirm')}
        </button>
      </div>
    </div>
  {/if}
</div>
