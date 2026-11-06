<script lang="ts">
  // GroupInfo — the group's own page, shaped like a contact card.
  //
  // THE SAME PAGE A SESSION HAS, for the same reason: a conversation has an identity (a picture, a name, what
  // it is for) and a cast (who is in it). A transcript shows the ones who spoke; this shows everyone, which is
  // the question a reader actually asks before writing.
  //
  // THE MEMBER LIST IS THE POINT. A group message arrives attributed to a session, and the reader needs to see
  // that session's picture and one-line intro to know who they are talking to — the same information the
  // coordinator gets from `group-members`.
  import type { PageProps } from '$lib/page-props'
  import { t } from '$lib/i18n.svelte'
  import { showErrorToast, showToast } from '$lib/toast.svelte'
  import { guessMime } from '$lib/media'
  import { sessionName } from '$lib/models'
  import type { Group, GroupMember } from '$lib/models'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'
  import ChatAvatar from '$lib/components/ChatAvatar.svelte'
  import { Input } from '$lib/components/ui/input'
  import { Dialog } from '$lib/components/ui/dialog'
  import { Textarea } from '$lib/components/ui/textarea'
  import { AppIcons } from '$lib/icons'

  let { store, initialId }: PageProps = $props()

  const groupId = $derived(initialId ?? '')

  let group = $state<Group | null>(null)
  let members = $state<GroupMember[]>([])
  let loading = $state(true)
  let failed = $state('')
  let saving = $state(false)
  let uploading = $state(false)

  // The editable fields, seeded once from the loaded group.
  let avatarFile = $state('')
  /** The editable display name. Saving it is an ordinary edit now — nothing is keyed by it. */
  let draftName = $state('')
  let intro = $state('')
  /** Whether the "add member" picker is open. */
  let adding = $state(false)
  /** Session ids picked in that dialog, before the round trip. */
  let picked = $state<string[]>([])
  /** A member removal in flight, so its row can show it and not be clicked twice. */
  let removing = $state('')
  let seededFor = $state('')

  const coordinator = $derived(members.find(m => m.role === 'coordinator')?.session ?? '')

  /**
   * A member's display name and intro come from the STORE, not from the membership row.
   *
   * The row records who joined and when; the session row is what carries the label and the one-line
   * description. Reading them here means a member that is renamed shows its new name, which is right for a
   * page that describes the group AS IT IS NOW rather than as it was when someone joined.
   */
  function memberSession(id: string) {
    return store.sessionById(id)
  }

  function memberLabel(id: string): string {
    const s = memberSession(id)
    return s ? sessionName(s) : id
  }

  function memberIntro(id: string): string {
    return memberSession(id)?.intro ?? ''
  }

  $effect(() => {
    const g = groupId
    if (!g) return
    void (async () => {
      loading = true
      try {
        const meta = await store.api.group(g)
        group = meta.group
        members = meta.members
        if (seededFor !== g) {
          seededFor = g
          avatarFile = meta.group.avatarFile ?? ''
          draftName = meta.group.name
          intro = meta.group.intro ?? ''
        }
      } catch (e) {
        failed = String(e)
      } finally {
        loading = false
      }
    })()
  })

  const dirty = $derived(
    !!group && (avatarFile !== (group.avatarFile ?? '') || intro !== (group.intro ?? '')),
  )

  function pickAvatar() {
    if (!group || uploading) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      void (async () => {
        uploading = true
        try {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const done = await store.api.uploadFile({
            path: '',
            name: file.name || 'avatar',
            mimeType: file.type || guessMime(file.name),
            bytes,
          })
          avatarFile = `file:${done.code}`
        } catch (e) {
          showErrorToast(String(e))
        } finally {
          uploading = false
        }
      })()
    }
    input.click()
  }

  async function save() {
    if (!group || saving) return
    saving = true
    try {
      const updated = await store.api.updateGroup({
        // THE ID IDENTIFIES; the name is an ordinary field, so it travels only when it changed. Sending it always
        // would make every save a rename attempt, and a collision on an unchanged name would be reported as one.
        id: group.id,
        ...(draftName.trim() !== group.name ? { name: draftName.trim() } : {}),
        avatarFile,
        intro: intro.trim(),
      })
      group = updated
      // THE LIST AND THE TRANSCRIPT HEADER READ FROM THE STORE, so the picture and the one-line purpose update
      // everywhere the group appears once this page is saved.
      void store.refreshGroups()
      showToast(t('saved'))
    } catch (e) {
      showErrorToast(String(e))
    } finally {
      saving = false
    }
  }

  /**
   * THE SESSIONS THAT COULD JOIN: everything this tenant has, minus the members already here.
   *
   * NOT FILTERED BY ROLE. A session coordinating another group is still a legitimate plain member of this one —
   * the constraint is one COORDINATORSHIP per session, not one membership, and hiding such a session would make
   * the picker lie about who can be added.
   */
  const candidates = $derived(
    store.sessions
      .filter(s => !members.some(m => m.session === s.id))
      .map(s => ({ id: s.id, label: s.name || s.id }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  )

  function togglePick(id: string) {
    picked = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]
  }

  async function addMembers() {
    if (!group || picked.length === 0) return
    try {
      await store.api.addGroupMembers(group.name, picked)
      const meta = await store.api.group(group.name)
      members = meta.members
      const n = picked.length
      adding = false
      picked = []
      showToast(t('groupMembersAdded', { arg1: n }))
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  /**
   * removeMember drops one session from the group.
   *
   * THE COORDINATOR IS NOT OFFERED: the server refuses to remove it, because a group with no coordinator routes
   * its messages to nobody. Moving the role first is the way to hand a group over, and hiding the button here
   * says that without making the user discover it through an error.
   */
  async function removeMember(id: string) {
    if (!group || removing) return
    removing = id
    try {
      members = await store.api.removeGroupMember(group.name, id)
    } catch (e) {
      showErrorToast(String(e))
    } finally {
      removing = ''
    }
  }

  function reset() {
    if (!group) return
    avatarFile = group.avatarFile ?? ''
    intro = group.intro ?? ''
  }

  function openChat() {
    if (groupId) store.pushPage({ kind: 'group_chat', key: 'group_chat', id: groupId })
  }
</script>

<!-- ONE COLUMN: the Shell wraps pages in a flex ROW, so several sibling roots would lay out sideways. -->
<div class="flex h-full min-h-0 w-full min-w-0 flex-col">
  <PageHeader title={t('groupInfo')} onBack={() => store.popPage()}>
    {#snippet right()}
      <!-- THE WAY BACK INTO THE CONVERSATION, explicitly: Back returns to wherever the reader came from,
           which is not necessarily this group's transcript. -->
      <button
        type="button"
        class="rounded p-1.5 text-primary hover:bg-muted disabled:opacity-40"
        title={t('openChat')}
        aria-label={t('openChat')}
        disabled={!groupId}
        onclick={openChat}
      >
        <AppIcons.chat class="size-[18px]" />
      </button>
    {/snippet}
  </PageHeader>

  {#if loading}
    <p class="p-4 text-meta text-muted-foreground">{t('loading')}</p>
  {:else if failed}
    <p class="p-4 text-meta text-destructive">{failed}</p>
  {:else if group}
    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- THE CARD: picture, name, member count. The same shape as a session's profile page. -->
      <section class="flex flex-col items-center gap-3 border-b border-border px-4 py-6">
        <button
          type="button"
          class="group relative rounded-full"
          title={t('avatarChoose')}
          aria-label={t('avatarChoose')}
          disabled={uploading}
          onclick={pickAvatar}
        >
          <ChatAvatar
            seed={group.name}
            avatar={avatarFile}
            size={96}
            label={group.name}
            fetchBytes={store.api.fetchFileBytes.bind(store.api)}
          />
          <span
            class="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {#if uploading}
              <span class="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
              ></span>
            {:else}
              <AppIcons.edit class="size-6" />
            {/if}
          </span>
        </button>

        <!-- THE NAME IS AN EDITABLE FIELD NOW, not a heading. It used to be immutable because it was the group's
             identity; it is a label, and editing it touches nothing else. -->
        <div class="w-full max-w-sm text-center">
          <Input bind:value={draftName} class="text-center text-base font-semibold" />
          <div class="mt-1 text-micro text-muted-foreground">
            {t('groupMemberCount', { arg1: members.length })}
          </div>
        </div>

        {#if avatarFile}
          <button
            type="button"
            class="text-micro text-muted-foreground hover:text-destructive"
            onclick={() => (avatarFile = '')}
          >
            {t('avatarRemove')}
          </button>
        {/if}
      </section>

      <div class="space-y-4 p-4">
        <label class="block">
          <span class="mb-1 block text-meta font-medium text-muted-foreground"
            >{t('groupIntroLabel')}</span
          >
          <Textarea bind:value={intro} rows={2} placeholder={t('groupIntroPlaceholder')} />
          <span class="mt-1 block text-micro text-muted-foreground">{t('groupIntroHint')}</span>
        </label>
      </div>

      <!-- THE MEMBERS. Coordinator first — that is the session a user's message reaches, so it is the one a
           reader most needs to recognise. -->
      <div class="border-t border-border">
        <div class="flex items-center gap-2 px-4 pt-4 pb-1">
          <span class="text-meta font-medium text-muted-foreground">
            {t('groupMembersTitle', { arg1: members.length })}
          </span>
          <!-- ADDING A MEMBER IS A GROUP ACTION, so it sits with the list rather than behind an edit mode: the list
               is what a reader is looking at when they notice someone is missing. -->
          <button
            type="button"
            class="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-micro text-primary hover:bg-muted"
            title={t('groupAddMember')}
            aria-label={t('groupAddMember')}
            onclick={() => {
              picked = []
              adding = true
            }}
          >
            <AppIcons.add class="size-3.5" />
            {t('groupAddMember')}
          </button>
        </div>
        <div class="pb-3">
          {#each members as m (m.session)}
            <div class="flex items-start gap-3 px-4 py-2">
              <button
                type="button"
                class="shrink-0 rounded-full"
                title={memberLabel(m.session)}
                aria-label={memberLabel(m.session)}
                onclick={() => {
                  // A MEMBER'S PICTURE OPENS THEIR CARD, the same gesture as in the transcript.
                  store.activeSessionId = m.session
                  store.pushPage({ kind: 'session_profile', key: 'session_profile' })
                }}
              >
                <ChatAvatar
                  seed={m.session}
                  avatar={memberSession(m.session)?.avatarFile ?? ''}
                  size={40}
                  label={memberLabel(m.session)}
                  fetchBytes={store.api.fetchFileBytes.bind(store.api)}
                />
              </button>
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2">
                  <span class="truncate text-body font-medium">{memberLabel(m.session)}</span>
                  {#if m.session === coordinator}
                    <!-- THE ROLE, because it is a routing fact: this is where a user's message arrives. -->
                    <span
                      class="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                      >{t('groupRoleCoordinator')}</span
                    >
                  {/if}
                  {#if m.session === store.activeSessionId}
                    <span class="shrink-0 text-micro text-muted-foreground"
                      >{t('groupRoleThis')}</span
                    >
                  {/if}
                </div>
                {#if memberIntro(m.session)}
                  <div class="mt-0.5 text-micro text-muted-foreground">
                    {memberIntro(m.session)}
                  </div>
                {/if}
              </div>
              <!-- THE COORDINATOR HAS NO REMOVE BUTTON. The server refuses it — a group whose coordinator was
                   removed routes its messages to nobody — and offering a button that always fails is worse than
                   not offering it. -->
              {#if m.session !== coordinator}
                <button
                  type="button"
                  class="shrink-0 self-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
                  title={t('groupRemoveMember')}
                  aria-label={t('groupRemoveMember')}
                  disabled={removing === m.session}
                  onclick={() => void removeMember(m.session)}
                >
                  {#if removing === m.session}
                    <span
                      class="block size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
                    ></span>
                  {:else}
                    <AppIcons.close class="size-3.5" />
                  {/if}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- THE ACTION BAR STAYS PUT, exactly as on a session's profile: saving is about the whole card. -->
    <div class="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
      <button
        type="button"
        class="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        onclick={reset}
        disabled={!dirty || saving}>{t('reset')}</button
      >
      <button
        type="button"
        class="ml-auto rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/80 disabled:opacity-40"
        disabled={!dirty || saving}
        onclick={() => void save()}
      >
        {saving ? t('saving') : t('save')}
      </button>
    </div>
  {/if}
</div>

{#if adding}
  <Dialog bind:open={adding} title={t('groupAddMember')}>
    {#snippet children()}
      {#if candidates.length === 0}
        <!-- EVERY SESSION IS ALREADY A MEMBER, which is a real state and not a failure: saying so is better than
             an empty picker the reader would try to interact with. -->
        <p class="py-4 text-center text-meta text-muted-foreground">{t('groupNoCandidates')}</p>
      {:else}
        <div class="max-h-72 overflow-y-auto">
          {#each candidates as c (c.id)}
            <label
              class="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={picked.includes(c.id)}
                onchange={() => togglePick(c.id)}
                class="size-4"
              />
              <span class="min-w-0 flex-1 truncate text-body">{c.label}</span>
            </label>
          {/each}
        </div>
      {/if}
    {/snippet}
    {#snippet footer()}
      <button
        type="button"
        class="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
        onclick={() => {
          adding = false
          picked = []
        }}>{t('cancel')}</button
      >
      <button
        type="button"
        class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/80 disabled:opacity-40"
        disabled={picked.length === 0}
        onclick={() => void addMembers()}
      >
        {t('groupAddMember')}
      </button>
    {/snippet}
  </Dialog>
{/if}
