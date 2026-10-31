<script lang="ts">
  // Permissions — the session's grants and channel subscriptions, as a PAGE.
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
  import type { PermissionDecl, SessionGrant } from '$lib/models'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'
  import PermissionsPanel from '$lib/components/PermissionsPanel.svelte'

  let { store }: PageProps = $props()

  const sid = $derived(store.activeSessionId ?? '')

  let decls = $state<PermissionDecl[]>([])
  let grants = $state<SessionGrant[]>([])
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
</script>

<PageHeader title={t('permissionsTitle')} onBack={() => store.popPage()} />

{#if !sid}
  <p class="p-4 text-meta text-muted-foreground">{t('permissionsNoSession')}</p>
{:else if loading && decls.length === 0}
  <p class="p-4 text-meta text-muted-foreground">{t('loading')}</p>
{:else}
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
    onclose={() => store.popPage()}
    class="w-full border-l-0"
  />
{/if}
