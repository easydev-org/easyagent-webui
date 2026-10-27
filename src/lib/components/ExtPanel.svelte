<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { AppIcons } from '$lib/icons'
  import { cn } from '$lib/utils'
  import { serveBridge } from '$lib/ext-bridge'
  import {
    closePanel,
    currentFrame,
    extPanel,
    frameSrc,
    popFrame,
    popTo,
    type ExtFrame,
  } from '$lib/ext-panel.svelte'

  let { onclose, api }: { onclose: () => void; api?: { token: string } } = $props()

  // Theme and token read from the live app state rather than threaded through Chat as props:
  // the theme is already the single source of truth on <html data-theme>, and the token lives
  // on the api client. Passing them down would add two props to every intermediate component for
  // values that have exactly one owner.
  function themeNow(): 'light' | 'dark' {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  }

  // The bearer of the ACTIVE connection. It lives on the api client and nowhere else; the bridge
  // reads it per request so a re-login mid-session is picked up.
  function getToken(): string {
    return api?.token ?? ''
  }

  // Only the TOP frame is mounted as an iframe.
  //
  // Keeping every frame alive would hold a full JS runtime per step of a browse (30-40 MB each);
  // hiding them with CSS is worse than unmounting, because the memory stays. Going back re-mounts
  // and re-fetches — for a file tree that is a request against a local checkout, not a network round
  // trip, so the cost is negligible next to the memory.
  const top = $derived(currentFrame())

  // The host's theme is pushed INTO each iframe: it has its own <html>, so data-theme on this
  // document does not reach it. Pushed on load via the src query, and on change via postMessage so
  // a switch while the panel is open takes effect without a reload.
  $effect(() => {
    const mode = themeNow()
    for (const f of document.querySelectorAll<HTMLIFrameElement>('iframe[data-ext-frame]')) {
      f.contentWindow?.postMessage({ type: 'easyagent:theme', theme: mode }, '*')
    }
  })

  // The data bridge: the iframe asks, this side fetches with the real bearer.
  //
  // The token never enters the iframe. It could not be read from storage anyway (it is a live
  // variable here), and putting it in the frame's URL would leak a long-lived credential into
  // history and logs.
  $effect(() => {
    // Read theme at CALL time through the closure, so a theme switch while the panel is open is
    // picked up without re-registering the listener.
    const stop = serveBridge(
      // The bearer comes from the api client, which is the one place that owns it.
      () => getToken(),
      win => {
        // Only a frame this panel created may use the bridge, and only for its OWN extension:
        // otherwise one extension's UI could read another's data with the same credential.
        const f = top
        if (!f) return null
        const el = document.querySelector<HTMLIFrameElement>('iframe[data-ext-frame]')
        return el?.contentWindow === win ? f.ext : null
      },
      () => themeNow(),
    )
    return stop
  })

  function title(f: ExtFrame, i: number): string {
    return f.title || `${f.ext} ${i + 1}`
  }
</script>

{#if extPanel.frames.length > 0}
  <div
    class="absolute inset-y-0 right-0 z-20 flex h-full w-[min(760px,60vw)] shrink-0 flex-col border-l border-border bg-background"
    role="complementary"
    aria-label={t('extPanel')}
  >
    <!-- Breadcrumb = the stack. Clicking a crumb pops back to it, which is the only way out of a
         deep route without closing the panel and starting over. -->
    <div class="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
      {#if extPanel.frames.length > 1}
        <button
          type="button"
          class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          title={t('back')}
          aria-label={t('back')}
          onclick={() => popFrame()}
        >
          <AppIcons.chevronLeft class="size-4" />
        </button>
      {/if}
      <div class="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {#each extPanel.frames as f, i (i)}
          {#if i > 0}<span class="shrink-0 text-meta text-muted-foreground">/</span>{/if}
          <button
            type="button"
            class={cn(
              'max-w-[14em] truncate rounded px-1.5 py-0.5 text-meta',
              i === extPanel.frames.length - 1
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
            title={title(f, i)}
            onclick={() => popTo(i)}
          >
            {title(f, i)}
          </button>
        {/each}
      </div>
      <button
        type="button"
        class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        title={t('close')}
        aria-label={t('close')}
        onclick={() => {
          closePanel()
          onclose()
        }}
      >
        <AppIcons.close class="size-4" />
      </button>
    </div>

    {#if top}
      <!-- sandbox: allow-scripts WITHOUT allow-same-origin would break the UI's own fetches, and
           with it the panel is same-origin by construction (this app proxies /ext/<id>), so the
           extension UI runs with this origin's authority. That is the same trust as first-party
           code, which is what it is: these UIs are built from our own repositories. -->
      <iframe
        data-ext-frame
        title={top.title || top.ext}
        src={frameSrc(top, themeNow())}
        class="min-h-0 w-full flex-1 border-0 bg-background"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      ></iframe>
    {/if}
  </div>
{/if}
