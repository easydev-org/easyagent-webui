<script lang="ts">
  // Channels — what this conversation listens to, as a PAGE of its own.
  //
  // IT USED TO BE A TAB BESIDE PERMISSIONS, and that was a false pairing. "What may this session do"
  // and "what does it hear" are different questions with different answers, different controls and
  // different reasons to be here — and putting them behind one tab strip meant a reader had to
  // discover the second one to know it existed. Two menu entries cost less than a hidden tab.
  //
  // THE DATA IS LOADED HERE for the same reason the permissions page loads its own: the panel stays
  // presentational, a refresh refetches once, and the page owns when the snapshot is taken.
  import type { PageProps } from '$lib/page-props'
  import { t } from '$lib/i18n.svelte'
  import { showErrorToast } from '$lib/toast.svelte'
  import type { ChannelDecl, ChannelSubscription } from '$lib/models'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'
  import ChannelsTab from '$lib/components/ChannelsTab.svelte'

  let { store }: PageProps = $props()

  const sid = $derived(store.activeSessionId ?? '')

  let decls = $state<ChannelDecl[]>([])
  let subs = $state<ChannelSubscription[]>([])
  let error = $state('')
  let loading = $state(true)

  async function refresh() {
    if (!sid) return
    loading = true
    try {
      // DECLARATIONS COME FROM THE EXTENSIONS, fetched fresh: a newly-deployed extension should appear
      // here without a reload.
      const [d, s] = await Promise.all([store.api.listChannels(), store.api.listSubscriptions(sid)])
      decls = d
      subs = s
      error = ''
    } catch (e) {
      error = String(e)
      showErrorToast(String(e))
    } finally {
      loading = false
    }
  }

  // Refetched when the conversation changes, so arriving here from another chat cannot show the
  // previous one's subscriptions.
  $effect(() => {
    const id = sid
    if (!id) return
    void refresh()
  })

  async function subscribe(channel: string, pattern: string, wake: boolean) {
    try {
      await store.api.subscribeChannel(sid, channel, pattern, wake)
      await refresh()
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function unsubscribe(sub: ChannelSubscription) {
    try {
      await store.api.unsubscribeChannel(sid, sub.id)
      await refresh()
    } catch (e) {
      showErrorToast(String(e))
    }
  }
</script>

<!--
  ONE COLUMN, TOP TO BOTTOM.

  THE SHELL WRAPS EVERY PAGE IN A ROW (`flex`, no direction), so a page that returns several sibling
  roots lays them out SIDEWAYS: the header beside the content instead of above it, which is what this
  page looked like. Chat avoids it by returning a single flex-col root, and so does this now.
-->
<div class="flex h-full min-h-0 w-full min-w-0 flex-col">
  <PageHeader title={t('channelsTitle')} onBack={() => store.popPage()} />

  {#if !sid}
    <p class="p-4 text-meta text-muted-foreground">{t('permissionsNoSession')}</p>
  {:else if loading && decls.length === 0 && subs.length === 0}
    <p class="p-4 text-meta text-muted-foreground">{t('loading')}</p>
  {:else}
    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <ChannelsTab
        {decls}
        {subs}
        locale={''}
        {error}
        onsubscribe={subscribe}
        onunsubscribe={unsubscribe}
      />
    </div>
  {/if}
</div>
