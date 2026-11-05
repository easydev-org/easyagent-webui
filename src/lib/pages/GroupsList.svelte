<script lang="ts">
  // GroupsList — the groups this tenant has, as a page under the chat tab.
  //
  // A GROUP IS A CONVERSATION, not a setting, which is why it lives here rather than in the sidebar: the
  // sidebar holds "where do I configure things", and a group is somewhere to talk.
  //
  // CREATION IS A USER ACTION. The coordinator is a required choice made here — a group with no coordinator
  // routes its messages nowhere, so the form cannot submit without one.
  import type { PageProps } from '$lib/page-props'
  import { t } from '$lib/i18n.svelte'
  import { showErrorToast, showToast } from '$lib/toast.svelte'
  import { sessionName } from '$lib/models'
  import type { Group } from '$lib/models'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'
  import { Input } from '$lib/components/ui/input'
  import { Select } from '$lib/components/ui/select'
  import { Dialog } from '$lib/components/ui/dialog'
  import { AppIcons } from '$lib/icons'
  import ChatAvatar from '$lib/components/ChatAvatar.svelte'

  let { store }: PageProps = $props()

  let groups = $state<Group[]>([])
  let loading = $state(true)
  let creating = $state(false)
  let busy = $state(false)

  // The create form. The coordinator is required, so it starts empty and the Save button waits for it.
  let newName = $state('')
  let newCoordinator = $state('')
  // ONE LINE SAYING WHAT THE GROUP IS FOR, set while the person naming it still has the answer in mind.
  let newIntro = $state('')

  /**
   * EVERY SESSION IS A CANDIDATE COORDINATOR, but only one that coordinates nothing yet can be chosen.
   *
   * The server enforces one-coordinator-per-session; filtering here is not a substitute for that check, it
   * is what stops the form from offering a choice that would be refused. A session already coordinating
   * another group is shown as unavailable rather than hidden: hiding it would make the user wonder where
   * their session went.
   */
  const candidates = $derived(
    store.sessions
      .map(s => ({ value: s.id, label: sessionName(s) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  )

  async function load() {
    loading = true
    try {
      groups = await store.api.groups()
    } catch (e) {
      showErrorToast(String(e))
    } finally {
      loading = false
    }
  }

  $effect(() => {
    void load()
  })

  async function create() {
    if (!newName.trim() || !newCoordinator || busy) return
    busy = true
    try {
      const g = await store.api.createGroup({
        name: newName.trim(),
        coordinator: newCoordinator,
        createdBy: 'user',
        intro: newIntro.trim(),
      })
      creating = false
      newName = ''
      newCoordinator = ''
      newIntro = ''
      showToast(t('groupCreated'))
      await load()
      store.pushPage({ kind: 'group_chat', key: 'group_chat', id: g.name })
    } catch (e) {
      showErrorToast(String(e))
    } finally {
      busy = false
    }
  }

  function open(name: string) {
    store.pushPage({ kind: 'group_chat', key: 'group_chat', id: name })
  }
</script>

<!-- ONE COLUMN: the Shell wraps pages in a flex ROW, so several sibling roots would lay out sideways. -->
<div class="flex h-full min-h-0 w-full min-w-0 flex-col">
  <PageHeader title={t('groupsTitle')} onBack={() => store.popPage()}>
    <button
      type="button"
      class="ml-auto rounded p-1.5 text-primary hover:bg-muted"
      title={t('groupNew')}
      aria-label={t('groupNew')}
      onclick={() => (creating = true)}
    >
      <AppIcons.add class="size-[18px]" />
    </button>
  </PageHeader>

  <div class="min-h-0 flex-1 overflow-y-auto p-4">
    {#if loading}
      <p class="py-6 text-center text-meta text-muted-foreground">{t('loading')}</p>
    {:else if groups.length === 0}
      <div class="flex flex-col items-center gap-3 py-16 text-center">
        <AppIcons.users class="size-10 text-muted-foreground/40" />
        <p class="text-meta text-muted-foreground">{t('groupsEmpty')}</p>
        <button
          type="button"
          class="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/80"
          onclick={() => (creating = true)}>{t('groupNew')}</button
        >
      </div>
    {:else}
      <div class="space-y-2">
        {#each groups as g (g.name)}
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-left hover:bg-muted/50"
            onclick={() => open(g.name)}
          >
            <ChatAvatar
              seed={g.name}
              avatar={g.avatarFile ?? ''}
              size={40}
              label={g.name}
              fetchBytes={store.api.fetchFileBytes.bind(store.api)}
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-body font-medium">{g.name}</span>
              <span class="block text-micro text-muted-foreground"
                >{t('groupMemberCount', { arg1: g.memberCount })}</span
              >
            </span>
            <AppIcons.chevron_right class="size-4 shrink-0 text-muted-foreground" />
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if creating}
  <Dialog bind:open={creating} title={t('groupNew')}>
    {#snippet children()}
      <div class="space-y-3">
        <label class="block">
          <span class="mb-1 block text-meta text-muted-foreground">{t('groupNameLabel')}</span>
          <Input bind:value={newName} placeholder={t('groupNamePlaceholder')} />
        </label>
        <label class="block">
          <span class="mb-1 block text-meta text-muted-foreground">{t('groupIntroLabel')}</span>
          <Input bind:value={newIntro} placeholder={t('groupIntroPlaceholder')} />
        </label>
        <label class="block">
          <span class="mb-1 block text-meta text-muted-foreground"
            >{t('groupCoordinatorLabel')}</span
          >
          <Select
            bind:value={newCoordinator}
            items={candidates}
            placeholder={t('groupCoordinatorPick')}
          />
          <span class="mt-1 block text-micro text-muted-foreground"
            >{t('groupCoordinatorHint')}</span
          >
        </label>
      </div>
    {/snippet}
    {#snippet footer()}
      <button
        type="button"
        class="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
        onclick={() => (creating = false)}>{t('cancel')}</button
      >
      <button
        type="button"
        class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/80 disabled:opacity-40"
        disabled={!newName.trim() || !newCoordinator || busy}
        onclick={() => void create()}>{t('create')}</button
      >
    {/snippet}
  </Dialog>
{/if}
