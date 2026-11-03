<script lang="ts">
  // An extension's own rendering of a tool card — a PURE RENDER of the call.
  //
  // The frame fetches nothing. The host hands it the call's three fields (input, data, output) and
  // the extension maps them to DOM. That is why a card still works when the workspace behind it has
  // expired: the card was never looking at the workspace, only at what the tool returned.
  //
  // Mounted when scrolled into view, not on render: a session can hold dozens of calls, and each
  // card is a second document.
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  // The protocol comes from the package on BOTH ends, which is the whole point of it existing: this
  // file used to keep a hand-written copy of every constant and validator below.
  import {
    cardDataMessage,
    cardHeightFrom,
    cardSrc,
    isCardReady,
    MSG_THEME,
    openViewFrom,
  } from '@easydev-org/ext-ui/host'
  import type { ExtCard } from '$lib/ext-card'
  import { extViewPage } from '$lib/ext-panel.svelte'
  import type { AppStore } from '$lib/store.svelte'

  let {
    card,
    tool = '',
    input = {},
    data = {},
    output = '',
    error = '',
    session = '',
    store,
  }: {
    card: ExtCard
    /** The call's three fields — everything the card may render. */
    tool?: string
    input?: Record<string, unknown>
    data?: Record<string, unknown>
    output?: string
    error?: string
    /** Only used to open a VIEW; the card itself needs no session. */
    session?: string
    store?: AppStore
  } = $props()

  function themeNow(): 'light' | 'dark' {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  }

  let height = $state(96)
  let failed = $state(false)
  let frame: HTMLIFrameElement | null = $state(null)
  let host: HTMLDivElement | null = $state(null)
  let visible = $state(false)

  $effect(() => {
    if (!host || visible) return
    if (typeof IntersectionObserver === 'undefined') {
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
      { rootMargin: '200px' },
    )
    io.observe(host)
    return () => io.disconnect()
  })

  /**
   * Turn a reactive value into something `postMessage` can carry.
   *
   * THE PAYLOAD IS A SVELTE PROXY. `input` and `data` come from `$derived` over `$state`, so they are
   * deep reactive wrappers. `postMessage` uses the structured clone algorithm, which refuses a Proxy
   * outright — `DataCloneError: could not be cloned` — and the message is never delivered at all.
   *
   * That failure is easy to misread: the card sits on "waiting for data" and every other explanation
   * (a timing race, a missing scope) fits. The browser console is the only place it shows.
   *
   * A JSON round-trip strips the proxies and costs one serialisation of a payload that is about to
   * cross a document boundary anyway. Everything here is plain data by construction — tool results
   * are JSON — so nothing is lost.
   */
  function plain<T>(v: T): T {
    try {
      return JSON.parse(JSON.stringify(v)) as T
    } catch {
      // A cyclic or otherwise unserialisable value would have failed the clone anyway; send what can
      // be sent rather than dropping the whole payload.
      return {} as T
    }
  }

  /** Send the call. Idempotent: the frame may announce readiness more than once (a reload). */
  function pushData(win: Window | null | undefined): void {
    if (!win) return
    // `cardDataMessage` adds the `type` discriminator the frame validates on. A payload missing it
    // renders nothing, with no error on either side — which is exactly the failure this package
    // exists to make impossible.
    win.postMessage(
      cardDataMessage({
        tool,
        input: plain(input),
        data: plain(data),
        output,
        error,
      }),
      '*',
    )
  }

  /**
   * Three things arrive from the frame: readiness, its height, and requests to open a view.
   *
   * All gated on `ev.source === frame.contentWindow`. A frame is a separate document, and without
   * that check any card on the page — or the page's own scripts — could resize this one or navigate
   * the reader.
   */
  const onMessage = (ev: MessageEvent): void => {
    if (!frame || ev.source !== frame.contentWindow) return

    if (isCardReady(ev.data)) {
      // The frame says it is listening. This is the ONLY moment it can be sure a message will not
      // race the listener being registered in the child.
      pushData(frame.contentWindow)
      return
    }
    // 0 means "not a height message". The package refuses zero, negative and non-finite values,
    // because a zero-height card is invisible and a NaN one collapses the conversation layout.
    const h = cardHeightFrom(ev.data)
    if (h > 0) {
      // Capped: a card reports its CONTENT height, and a runaway one must not push the conversation
      // off screen.
      height = Math.min(Math.max(h, 60), 640)
      return
    }
    const open = openViewFrom(ev.data)
    if (open) {
      if (!store) return
      store.pushPage(
        extViewPage({
          ext: open.ext,
          route: open.route,
          title: open.title || card.template,
          session,
        }),
      )
    }
  }

  /**
   * Push again once the frame has loaded.
   *
   * The readiness handshake is the primary path, and on its own it was enough until it was not: a
   * frame that loads, announces, and then RELOADS (a hash-only navigation inside the extension, an
   * iframe sandbox quirk) announces from a new document, and a message sent to the previous one is
   * lost — leaving the card on "waiting for data" forever with no error anywhere.
   *
   * Re-sending on load is idempotent: the card replaces its payload wholesale, so a duplicate
   * delivery costs one render and cannot corrupt anything.
   */
  function onFrameLoad(): void {
    pushData(frame?.contentWindow)
  }

  onMount(() => {
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  })

  // Push the theme after load, and again on a change while the frame is open.
  $effect(() => {
    const mode = themeNow()
    if (!frame) return
    frame.contentWindow?.postMessage({ type: MSG_THEME, theme: mode }, '*')
  })

  // The session is passed even though this route renders from the payload: the extension's UI is one
  // document, and its api client scopes every request by `?session=`. The URL's shape — theme in the
  // query, template in the hash, template percent-encoded — is the package's, not this file's.
  const src = $derived(cardSrc(card.ext, card.template, themeNow(), session))
</script>

<div bind:this={host} class="min-w-0">
  {#if failed}
    <div class="rounded-sm border border-destructive/40 px-2 py-1.5 text-micro text-destructive">
      {t('extCardFailed')}
      <code class="ml-1 font-mono">{card.ext} / {card.template}</code>
    </div>
  {:else if visible}
    <iframe
      bind:this={frame}
      {src}
      title={card.template}
      class="w-full rounded-sm border border-border/50 bg-background"
      style={`height:${height}px`}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      onload={onFrameLoad}
      onerror={() => (failed = true)}
    ></iframe>
  {:else}
    <!-- Placeholder while off screen: a reserved height, so scrolling past does not jump when the
         frame mounts. -->
    <div
      class="rounded-sm border border-border/50 bg-muted/20"
      style={`height:${height}px`}
      aria-hidden="true"
    ></div>
  {/if}
</div>
