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
  import {
    extCardSrc,
    MSG_CARD_HEIGHT,
    MSG_OPEN_VIEW,
    openViewFrom,
    type ExtCard,
  } from '$lib/ext-card'
  import { extViewPage } from '$lib/ext-panel.svelte'
  import type { AppStore } from '$lib/store.svelte'

  let {
    card,
    session = '',
    store,
  }: {
    card: ExtCard
    /** Scopes the extension's data. Empty means "not known here", and the frame says so. */
    session?: string
    /** Needed to open a view the card asks for: only the host knows where views live. */
    store?: AppStore
  } = $props()

  function themeNow(): 'light' | 'dark' {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  }

  /**
   * The frame's height, before and after the card reports its own.
   *
   * Starts small on purpose: the card measures and announces itself within a frame or two, and a
   * tall placeholder would show as a pale block that collapses — the reader sees a jump where
   * nothing is happening. A short one grows into the content instead.
   */
  let height = $state(96)
  let failed = $state(false)
  let frame: HTMLIFrameElement | null = $state(null)
  let host: HTMLDivElement | null = $state(null)
  /**
   * Mounted only once the card has been scrolled into view.
   *
   * A session can hold dozens of calls and each card is a second document; mounting them all on
   * render is what makes a long conversation stutter. Waiting for visibility gives the pretty
   * rendering immediately in the place the reader is looking, and costs nothing for the rest.
   */
  let visible = $state(false)

  $effect(() => {
    if (!host || visible) return
    if (typeof IntersectionObserver === 'undefined') {
      // No observer (an old engine, a test): show the card rather than never showing it.
      visible = true
      return
    }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          visible = true
          io.disconnect()
        }
      },
      // A little ahead of the viewport, so the frame is ready before it is scrolled to.
      { rootMargin: '200px' },
    )
    io.observe(host)
    return () => io.disconnect()
  })

  /**
   * Two things arrive from the frame: its height, and requests to open a view.
   *
   * Both are gated on `ev.source === frame.contentWindow`. A frame is a separate document, and
   * without that check any card on the page — or the page's own scripts — could resize this one or
   * navigate the reader somewhere.
   */
  const onMessage = (ev: MessageEvent): void => {
    if (!frame || ev.source !== frame.contentWindow) return
    const h = ev.data as { type?: string; height?: number } | null
    if (h?.type === MSG_CARD_HEIGHT) {
      if (typeof h.height === 'number' && h.height > 0) {
        // Capped: the frame reports its CONTENT height, and a runaway card must not push the
        // conversation off screen. The card is a summary, not a page.
        height = Math.min(Math.max(h.height, 80), 640)
      }
      return
    }
    const open = openViewFrom(ev.data)
    if (open) {
      if (!store) return
      // ONE extension view at a time, newest wins — same rule the tool card's Open button follows,
      // because it lands on the same page key.
      store.pushPage(
        extViewPage({
          ext: open.ext,
          route: open.route,
          title: open.title ?? card.title ?? open.ext,
          session,
        }),
      )
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

<div bind:this={host} class="min-w-0">
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
  {:else if visible}
    <iframe
      bind:this={frame}
      {src}
      title={card.title ?? card.ext}
      class="w-full rounded-sm border border-border/50 bg-background"
      style={`height:${height}px`}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      onerror={() => (failed = true)}
    ></iframe>
  {:else}
    <!-- Placeholder while off screen: same border and a reserved height, so scrolling past does not
         jump when the frame mounts. -->
    <div
      class="rounded-sm border border-border/50 bg-muted/20"
      style={`height:${height}px`}
      aria-hidden="true"
    ></div>
  {/if}
</div>
