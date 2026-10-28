<script lang="ts">
  // An extension's own UI, rendered as a PAGE.
  //
  // It receives the standard PageProps shape so the Shell can treat it like any other page: on a
  // phone the Shell shows only this pane (full width, with the back button in the header), and on a
  // wide screen it sits beside the conversation. An absolutely-positioned overlay — the previous
  // design — split a phone screen in half instead.
  import { serveBridge } from '$lib/ext-bridge'
  import { extViewSrc } from '$lib/ext-panel.svelte'
  import { t } from '$lib/i18n.svelte'
  import type { PageProps } from '$lib/page-props'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'

  let { store, view }: PageProps & {
    view?: { ext: string; route: string; title: string; session: string }
  } = $props()

  function themeNow(): 'light' | 'dark' {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  }

  // Carry the theme INTO the iframe: it has its own <html>, so data-theme here does not reach it.
  // Set on the src (first paint) and pushed on change (a switch while the view is open).
  $effect(() => {
    const mode = themeNow()
    document
      .querySelectorAll<HTMLIFrameElement>('iframe[data-ext-frame]')
      .forEach(f => f.contentWindow?.postMessage({ type: 'easyagent:theme', theme: mode }, '*'))
  })

  // The data bridge: the iframe asks, this side fetches with the real bearer.
  //
  // The token must not enter the iframe — not in the URL (history, logs) and not over postMessage
  // (any XSS in that UI would hold a long-lived credential). So the frame asks and this side, which
  // already holds the token, performs the request.
  $effect(() => {
    const ext = view?.ext
    if (!ext) return
    // A frame that asks before the bridge exists would wait forever, and the panel would look
    // "loaded but empty". Logging the handshake makes that visible instead of silent.
    console.info('[ext-view] bridge listening for', ext)
    return serveBridge(
      () => store.api.token,
      win => (document.querySelector<HTMLIFrameElement>('iframe[data-ext-frame]')?.contentWindow === win ? ext : null),
      () => themeNow(),
    )
  })
</script>

{#if view}
  <div class="flex h-full min-h-0 w-full flex-col">
    <PageHeader title={view.title || view.ext} onBack={() => store.popPage()} />
    <iframe
      data-ext-frame
      title={view.title || view.ext}
      src={extViewSrc(view.ext, view.route, view.session, themeNow())}
      class="min-h-0 w-full flex-1 border-0 bg-background"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    ></iframe>
  </div>
{:else}
  <div class="p-6 text-center text-meta text-muted-foreground">{t('noSessions')}</div>
{/if}
