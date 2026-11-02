<script lang="ts">
  // Permissions — the session's grants, as a PAGE.
  //
  // CHANNELS ARE A SEPARATE PAGE NOW. They shared a tab strip here, which made the second one
  // undiscoverable: a reader who never clicked the tab did not know subscriptions existed. They are
  // different questions — what may this session do, versus what does it hear — and each deserves its
  // own entry in the menu.
  //
  // IT USED TO BE A 340px PANEL PINNED TO THE RIGHT EDGE of the conversation, which is the wrong shape
  // for what it is. Granting a permission is not a glance: it is reading a list of what each extension
  // can ask for, deciding which instances to allow, and often comparing that against what is already
  // held. A panel that covers half the conversation makes the user scroll in a column narrower than
  // the content deserves, and there is nothing on the other side they need to see at the same time —
  // this is a place to go, like the mailbox, not a thing to peek at.
  //
  // THE DATA IS LOADED HERE, not in the panel: the panel stays presentational so the page owns the
  // single source both tabs read, and a refresh refetches once rather than once per tab.
  import type { PageProps } from '$lib/page-props'
  import { t } from '$lib/i18n.svelte'
  import { showErrorToast } from '$lib/toast.svelte'
  import type { Denial, PermissionDecl, SessionGrant } from '$lib/models'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'
  import PermissionsPanel from '$lib/components/PermissionsPanel.svelte'

  let { store }: PageProps = $props()

  const sid = $derived(store.activeSessionId ?? '')

  let decls = $state<PermissionDecl[]>([])
  let grants = $state<SessionGrant[]>([])
  let denials = $state<Denial[]>([])
  let loading = $state(true)

  async function refresh() {
    if (!sid) return
    loading = true
    try {
      // DECLARATIONS COME FROM THE EXTENSIONS, fetched fresh each time: a newly-deployed extension
      // should appear without a page reload.
      const [d, g] = await Promise.all([
        store.api.listPermissionDecls(),
        store.api.listGrants(sid),
      ])
      decls = d
      grants = g
      // REFUSALS ARE LOADED SEPARATELY AND MAY FAIL WITHOUT EMPTYING THE PAGE: a deployment without a
      // runtime bus cannot answer, and losing the grant list because of it would be a worse trade than
      // showing one section short.
      denials = await store.api.listDenials(sid).catch(() => [])
    } catch (e) {
      showErrorToast(String(e))
    } finally {
      loading = false
    }
  }

  // Refetched when the session changes, so arriving here from a different chat cannot show the
  // previous one's grants.
  $effect(() => {
    const id = sid
    if (!id) return
    void refresh()
  })

  async function grant(decl: PermissionDecl, params: string) {
    try {
      // (session, EXTENSION, capability, params, risk) — the extension first, then the capability it
      // exposes. Getting these the other way round would create a grant for a permission that does
      // not exist, which the extension would then refuse at call time rather than here.
      await store.api.createGrant(sid, decl.extId, decl.key, params, decl.risk)
      await refresh()
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function revoke(g: SessionGrant) {
    try {
      await store.api.revokeGrant(sid, g.id)
      await refresh()
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  /**
   * Grant a capability because it was REFUSED, not because it was browsed to.
   *
   * NO PARAMS: a refusal records the capability, not a target, because the gate that refused never
   * interpreted the arguments — it only knew the session held nothing for that key. So this grants the
   * boolean capability, which is exactly what the refusal was about. A capability that also needs
   * params is granted from the list below, where the declared shape is known.
   */
  async function grantDenied(d: Denial) {
    try {
      await store.api.createGrant(sid, d.extId, d.capability, '', '')
      await refresh()
    } catch (e) {
      showErrorToast(String(e))
    }
  }
</script>

<PageHeader title={t('permissionsTitle')} onBack={() => store.popPage()} />

{#if !sid}
  <p class="p-4 text-meta text-muted-foreground">{t('permissionsNoSession')}</p>
{:else if loading && decls.length === 0}
  <p class="p-4 text-meta text-muted-foreground">{t('loading')}</p>
{:else}
  <!--
    REFUSED FIRST, AND ABOVE THE LIST.

    A reader who arrives here because something stopped working is looking for the reason, and the
    reason is in this block. The full catalogue below is what they browse when nothing is wrong — so
    the order is "what just broke" then "what could I grant", not the reverse.
  -->
  {#if denials.length > 0}
    <section class="border-b border-border bg-amber-500/5 px-4 py-3">
      <h2 class="mb-2 text-micro font-semibold tracking-wide text-muted-foreground uppercase">
        {t('denialsTitle')}
      </h2>
      <p class="mb-2 text-micro text-muted-foreground">{t('denialsHint')}</p>
      <ul class="flex flex-col gap-2">
        {#each denials as d (d.extId + '/' + d.capability)}
          <li class="flex items-start justify-between gap-3 rounded border border-amber-600/30 px-2 py-1.5">
            <div class="min-w-0">
              <div class="truncate font-mono text-[11px]">
                {d.extId}<span class="text-muted-foreground">/</span>{d.capability}
              </div>
              <!-- THE TOOL, not the capability, is what a reader recognises — and the count says
                   whether this was a one-off or a wall they kept hitting. -->
              <div class="truncate text-[11px] text-muted-foreground">
                {d.tool}{#if d.count > 1}&nbsp;· {t('denialsCount', { n: String(d.count) })}{/if}
              </div>
            </div>
            <button
              class="shrink-0 rounded border border-border px-2 py-0.5 text-micro hover:border-foreground/40"
              onclick={() => void grantDenied(d)}
            >
              {t('permissionsGrant')}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <!-- FULL WIDTH, FULL HEIGHT. The panel's own `w-[340px]` is overridden rather than removed: the
       component still knows how to be a side panel, and this page is the only caller that wants it
       to be a page. -->
  <PermissionsPanel
    sessionId={sid}
    {decls}
    {grants}
    locale={''}
    ongrant={grant}
    onrevoke={revoke}
    class="w-full"
  />
{/if}
