<script lang="ts">
  // An extension's OWN rendering of a tool card, in an iframe.
  //
  // Lazy on purpose: a session can hold dozens of tool calls, and mounting a second document for each
  // would cost far more than the card is worth. The frame is created only when the reader asks for it,
  // and once created it stays — collapsing and re-expanding should not re-fetch.
  //
  // Height is reported BY THE FRAME, not guessed here. The extension knows how tall its content is;
  // this side cannot, and a fixed height either clips a tall card or leaves a gap under a short one.
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { AppIcons } from '$lib/icons'
  import { extCardSrc, type ExtCard } from '$lib/ext-card'

  let {
    card,
    session = '',
  }: {
    card: ExtCard
    /** Scopes the extension's data. Empty means "not known here", and the frame says so. */
    session?: string
  } = $props()

  function themeNow(): 'light' | 'dark' {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  }

  let open = $state(false)
  let height = $state(220)
  let failed = $state(false)
  let frame: HTMLIFrameElement | null = $state(null)

  // The frame announces its height; a card that renders asynchronously re-announces when it grows.
  const onMessage = (ev: MessageEvent): void => {
    const d = ev.data as { type?: string; height?: number } | null
    if (d?.type !== 'easyagent:card-height') return
    // Only the frame we created may set our height: another card's frame, or the page itself, must
    // not be able to resize this one.
    if (!frame || ev.source !== frame.contentWindow) return
    if (typeof d.height === 'number' && d.height > 0) {
      height = Math.min(Math.max(d.height, 80), 640)
    }
  }

  onMount(() => {
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  })

  // Push the theme in after load, and again when it changes while the frame is open.
  $effect(() => {
    const mode = themeNow()
    if (!frame) return
    frame.contentWindow?.postMessage({ type: 'easyagent:theme', theme: mode }, '*')
  })

  const src = $derived(extCardSrc(card, { session, theme: themeNow() }))
</script>

{#if !open}
  <button
    type="button"
    class="flex items-center gap-1 rounded px-1.5 py-0.5 text-micro font-medium text-primary hover:bg-primary/10"
    onclick={() => (open = true)}
    title={t('extCardShow')}
  >
    <AppIcons.apps class="size-3" />
    {t('extCardShow')}
  </button>
{:else}
  <div class="min-w-0">
    {#if card.title}
      <div class="mb-1 truncate text-micro font-semibold text-muted-foreground">{card.title}</div>
    {/if}
    {#if session === ''}
      <!-- Without a session the extension cannot find the call's data, and an empty frame looks like
           a rendering bug rather than a missing scope. -->
      <div class="rounded-sm border border-border/50 px-2 py-1.5 text-micro text-muted-foreground">
        {t('extCardNoSession')}
      </div>
    {:else if failed}
      <div class="rounded-sm border border-destructive/40 px-2 py-1.5 text-micro text-destructive">
        {t('extCardFailed')}
        <code class="ml-1 font-mono">{card.ext}{card.route}</code>
      </div>
    {:else}
      <iframe
        bind:this={frame}
        {src}
        title={card.title ?? card.ext}
        class="w-full rounded-sm border border-border/50 bg-background"
        style={`height:${height}px`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onerror={() => (failed = true)}
      ></iframe>
    {/if}
  </div>
{/if}
