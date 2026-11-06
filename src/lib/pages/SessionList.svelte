<script lang="ts">
  // SessionList — web port of flutter screens/session_list_page.dart: search,
  // multi-select batch delete, long-press actions (delete / mark read), new
  // session (prompt), unread badges, pull-refresh, empty + error states.
  import type { PageProps } from '$lib/page-props'
  import { t } from '$lib/i18n.svelte'
  import { showErrorToast, showToast } from '$lib/toast.svelte'
  import { promptDialog, confirmDialog } from '$lib/dialogs'
  import { Prefs } from '$lib/prefs'
  import { sessionName, type Group } from '$lib/models'
  import { previewLabel } from '$lib/api-mappers'
  import NewSessionDialog from './NewSessionDialog.svelte'
  import SessionRow from '$lib/components/SessionRow.svelte'
  import ContextMenu, { type ContextMenuItem } from '$lib/components/ContextMenu.svelte'
  import type { MenuAnchor } from '$lib/context-menu-position'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'
  import IconButton from '$lib/components/layout/IconButton.svelte'
  import SectionLabel from '$lib/components/layout/SectionLabel.svelte'
  import EmptyState from '$lib/components/layout/EmptyState.svelte'
  import ReconnectBanner from '$lib/components/ReconnectBanner.svelte'
  import { AppIcons } from '$lib/icons'
  import { rowLongPress } from '$lib/row-menu'
  import { cn } from '$lib/utils'
  import { now } from '$lib/clock.svelte'
  import ChatAvatar from '$lib/components/ChatAvatar.svelte'

  let { store }: PageProps = $props()

  /**
   * GROUPS ARE LISTED WITH THE SESSIONS, because they are the same kind of thing: a conversation you open and
   * type into. They used to live behind an unlabelled icon in the header, which put the two live groups in this
   * tenant somewhere no reader would look — and a conversation nobody can find is not a feature.
   *
   * The list is reloaded when this page mounts. Groups change rarely (a person creates one), and the cost of a
   * second call on mount is nothing next to showing a stale set.
   */
  $effect(() => {
    void store.refreshGroups()
  })

  let searching = $state(false)
  let q = $state('')
  let selectMode = $state(false)
  let selected = $state<Set<string>>(new Set())
  // Pull-to-refresh (flutter RefreshIndicator): refresh when dragged from top.
  let refreshStartY: number | null = null
  let refreshing = $state(false)

  async function onTouchStart(e: TouchEvent) {
    const el = e.currentTarget as HTMLElement
    refreshStartY = el.scrollTop <= 0 ? e.touches[0]!.clientY : null
  }

  async function onTouchMove(e: TouchEvent) {
    if (refreshStartY == null || refreshing) return
    const dy = e.touches[0]!.clientY - refreshStartY
    if (dy > 64) {
      refreshing = true
      refreshStartY = null
      await store.refreshSessions()
      refreshing = false
    }
  }

  const filtered = $derived.by(() => {
    if (!q.trim()) return store.sessions
    const needle = q.trim().toLowerCase()
    return store.sessions.filter(
      s =>
        s.id.toLowerCase().includes(needle) ||
        s.lastMessagePreview.toLowerCase().includes(needle) ||
        `${s.org}:${s.repo}:${s.branch}`.toLowerCase().includes(needle),
    )
  })

  /**
   * THE LIST IS FLAT NOW.
   *
   * It used to nest a session under whichever one named it in its `group` column, which is the model
   * that was removed: that column conflated "which group am I in" with "which session forked me", and
   * a list built on it could not show a session that belongs to TWO groups at all. Groups live in
   * their own table with real membership, so a session's group affiliations are a page of their own,
   * not a nesting relationship in a flat list.
   */
  const display = $derived(filtered)

  /**
   * A LIST ROW'S TIME LABEL — the same wording SessionRow uses for a session.
   *
   * It differs from a message's own timestamp on purpose: a list is scanned for "is this old or new", which is
   * answered in hours and days, while a message in a conversation is read for "how long ago exactly".
   */
  function fmtTime(iso: string, at: number): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const mins = Math.floor((at - d.getTime()) / 60000)
    if (mins < 1) return t('timeJustNow')
    if (mins < 60) return t('timeMinAgo', { arg1: mins })
    if (mins < 60 * 24) return t('timeHour', { arg1: Math.floor(mins / 60) })
    if (mins < 60 * 24 * 7) return t('timeDay', { arg1: Math.floor(mins / (60 * 24)) })
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  function exitSelect() {
    selectMode = false
    selected = new Set()
  }

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected = next
  }

  function toggleAll() {
    if (selected.size === display.length) selected = new Set()
    else selected = new Set(display.map(s => s.id))
  }

  async function deleteSelected() {
    if (!selected.size) return
    const ok = await confirmDialog({
      title: t('deleteSessionsTitle', { n: selected.size }),
      body: t('deleteSessionsBody', { arg1: selected.size }),
      confirmLabel: t('delete'),
      destructive: true,
    })
    if (!ok) return
    const failed = await store.deleteSessions([...selected])
    if (failed.length) showErrorToast(t('deleteFailed', { n: failed.length }))
    else showToast(t('deleted'))
    exitSelect()
  }

  let newSessionOpen = $state(false)

  /**
   * Whether the group section is expanded, and the choice is REMEMBERED.
   *
   * See the note at the section itself: every session now owns a room, so the group list grows with the session
   * count and would otherwise sit on top of the sessions the reader came for.
   */
  let groupsOpen = $state(Prefs.loadGroupsOpen())
  function toggleGroups() {
    groupsOpen = !groupsOpen
    Prefs.saveGroupsOpen(groupsOpen)
  }

  /**
   * isSessionRoom reports whether a group is a SESSION'S OWN ROOM rather than a group a person made.
   *
   * THE PROVENANCE IS IN `created_by`, which is `session:<id>` for the automatic room and `user…` for anything a
   * person created. It is a label on the row rather than a separate kind, because the two are the same thing to
   * every other part of the system — a group with members and a transcript — and a second kind would mean every
   * reader branching on it.
   */
  function isSessionRoom(g: Group): boolean {
    return g.createdBy.startsWith('session:')
  }

  function create() {
    newSessionOpen = true
  }

  async function onCreateSession(name: string, locale: 'zh' | 'en') {
    try {
      // Pin the language at creation so the session never drifts with the
      // mutable tenant default.
      const created = await store.api.createSession({ name, locale })
      newSessionOpen = false
      /**
       * THE NEW ROOM IS REFRESHED TOO, and the reader is taken straight into it.
       *
       * THE ROOM IS THE POINT of creating a session now: it is the plain-conversation page where you give orders
       * and watch what happens. Landing in the transcript instead would show the tool cards first, which is the
       * view you open when something looks wrong — not the one you start from.
       */
      await Promise.all([store.refreshSessions(), store.refreshGroups()])
      if (created.groupId) {
        store.pushPage({ kind: 'group_chat', key: 'group_chat', id: created.groupId })
      }
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  // Row context menu (desktop right-click / mobile long-press). Anchored to
  // the ROW (not the raw cursor point): the menu is vertically centred on the
  // row and right-aligned to its trailing edge, and the source row is
  // highlighted while open — with dozens of near-identical rows a cursor
  // anchor gives no clue which session the menu acts on.
  let rowMenu = $state<{ sid: string; anchor: MenuAnchor } | null>(null)

  /**
   * A GROUP ROW'S OWN MENU, kept separate from a session's.
   *
   * THE TWO ROWS ACT ON DIFFERENT THINGS: a session row forks and deletes a session; a group row opens its
   * transcript, its card, and deletes the group. Sharing one menu state would have forced every item to check
   * which kind of row it came from, and the first item added in the wrong branch would act on the wrong object.
   */
  let groupMenu = $state<{ id: string; name: string; anchor: MenuAnchor } | null>(null)

  /**
   * Open a session's PROFILE from its picture in the list.
   *
   * THE SESSION BECOMES ACTIVE FIRST. The profile page reads the active session, so opening a profile
   * without selecting it would either show the previous one's data or nothing — and the capsule in the
   * chat header, which also opens this page, only exists for the active session.
   */
  function openProfile(sid: string) {
    store.activeSessionId = sid
    store.pushPage({ kind: 'session_profile', key: 'session_profile' })
  }

  function openRowMenu(sid: string, anchor: MenuAnchor) {
    rowMenu = { sid, anchor }
  }

  const rowMenuItems = $derived.by(() => {
    if (!rowMenu) return []
    const s = store.sessionById(rowMenu.sid)
    const items: ContextMenuItem[] = []
    if (s && store.isUnread(s)) items.push({ value: 'read', label: t('markRead') })
    items.push({ value: 'fork', label: t('fork') })
    items.push({ value: 'delete', label: t('deleteSession'), destructive: true })
    return items
  })

  const groupMenuItems = $derived.by(() => {
    if (!groupMenu) return []
    const items: ContextMenuItem[] = [
      { value: 'open', label: t('openChat') },
      { value: 'info', label: t('groupInfo') },
    ]
    // THE LIST'S MENU OFFERS DELETION because that is where a reader tidies up; the group's own card does not,
    // since a destructive action does not belong next to "Save".
    items.push({ value: 'delete', label: t('groupDelete'), destructive: true })
    return items
  })

  async function onGroupMenuPick(value: string) {
    // THE ID ROUTES; THE NAME LABELS. A confirmation that said "delete 8f3a…?" would be unreadable, and a route
    // built from a name would break the moment someone renamed the group.
    const id = groupMenu?.id ?? ''
    const name = groupMenu?.name ?? ''
    groupMenu = null
    if (!id) return
    if (value === 'open') {
      store.pushPage({ kind: 'group_chat', key: 'group_chat', id })
    } else if (value === 'info') {
      store.pushPage({ kind: 'group_info', key: 'group_info', id })
    } else if (value === 'delete') {
      await deleteGroupFlow(id, name)
    }
  }

  /**
   * deleteGroupFlow confirms, then deletes.
   *
   * THE BODY SAYS WHAT GOES WITH IT — the transcript — because a deletion a reader did not expect to lose the
   * conversation is the kind of surprise that makes them distrust the next one.
   */
  async function deleteGroupFlow(id: string, name: string) {
    const ok = await confirmDialog({
      title: t('groupDelete'),
      body: t('groupDeleteBody', { arg1: name }),
      confirmLabel: t('delete'),
      destructive: true,
    })
    if (!ok) return
    try {
      await store.api.deleteGroup(id)
      await store.refreshGroups()
      showToast(t('groupDeleted'))
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function onRowMenuPick(value: string) {
    const sid = rowMenu?.sid
    rowMenu = null
    if (!sid) return
    if (value === 'read') {
      store.markSessionRead(sid)
    } else if (value === 'fork') {
      await forkFlow(sid)
    } else if (value === 'delete') {
      await deleteFlow(sid)
    }
  }

  /** Fork a session from the LIST (without opening it): ask for the branch
   *  name, fork, refresh the list. The fork appears as a new subsession row. */
  async function forkFlow(sid: string) {
    const branch = await promptDialog({ title: t('fork'), confirmLabel: t('create') })
    if (!branch) return
    try {
      await store.api.fork(sid, branch)
      // THE FORK HAS ITS OWN ROOM, and the list has to show it without a reload.
      await Promise.all([store.refreshSessions(), store.refreshGroups()])
      showToast(t('forked'))
    } catch {
      showErrorToast(t('forkFailed'))
    }
  }

  async function deleteFlow(sid: string | null) {
    const ok = await confirmDialog({
      title: t('deleteSession'),
      body: sid ? t('deleteSessionBody', { arg1: sessionName(store.sessionById(sid)!) }) : '',
      confirmLabel: t('delete'),
      destructive: true,
    })
    if (!ok || !sid) return
    try {
      await store.deleteSession(sid)
      showToast(t('deleted'))
    } catch (e) {
      showErrorToast(String(e))
    }
  }
</script>

<div class="flex h-full w-full flex-col">
  <PageHeader>
    {#if selectMode}
      <IconButton icon={AppIcons.close} label={t('cancel')} onclick={exitSelect} />
      <span class="min-w-0 flex-1 truncate text-base font-semibold"
        >{t('selectedCount', { n: selected.size })}</span
      >
      <IconButton icon={AppIcons.list} label={t('selectAll')} onclick={toggleAll} />
      <IconButton
        icon={AppIcons.delete}
        label={t('delete')}
        variant={selected.size ? 'destructive' : 'ghost'}
        disabled={!selected.size}
        onclick={() => void deleteSelected()}
      />
    {:else if searching}
      <IconButton
        icon={AppIcons.back}
        onclick={() => {
          q = ''
          searching = false
        }}
      />
      <input
        bind:value={q}
        class="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
        placeholder={t('searchHint')}
      />
    {:else}
      <span class="min-w-0 flex-1 truncate text-base font-semibold">{t('tabChat')}</span>
      <IconButton
        icon={AppIcons.search}
        label={t('search')}
        variant="primary"
        onclick={() => (searching = true)}
      />
      <!-- GROUPS SIT BESIDE "NEW SESSION" because they are the other way to start a conversation: a group
           with a coordinator, rather than a session of your own. -->
      <IconButton
        icon={AppIcons.users}
        label={t('groupsTitle')}
        variant="primary"
        onclick={() => store.pushPage({ kind: 'group_list', key: 'group_list' })}
      />
      <IconButton
        icon={AppIcons.list}
        label={t('selectSessions')}
        variant="primary"
        onclick={() => (selectMode = true)}
      />
      <IconButton
        icon={AppIcons.add}
        label={t('newSession')}
        variant="primary"
        onclick={() => void create()}
      />
    {/if}
  </PageHeader>

  <ReconnectBanner />

  <div
    class="min-h-0 flex-1 overflow-y-auto"
    role="list"
    ontouchstart={onTouchStart}
    ontouchmove={onTouchMove}
  >
    <!-- GROUPS AND SESSIONS SHARE ONE SCROLL AREA, so neither can push the other out of reach by being long —
         but they cannot both be visible at once either, and the groups are the part that grows without bound:
         every session a person makes now owns a room, so a tenant with thirty sessions has thirty groups ABOVE
         the sessions it actually came here to read.

         SO THE GROUP SECTION COLLAPSES. It opens by default (one or two groups should not need discovering) and
         the choice is remembered, because the reason to close it is persistent: this tenant has too many. -->
    {#if !selectMode && !searching && store.groups.length > 0}
      <button
        type="button"
        class="flex w-full items-center gap-2 px-4 py-2 text-left"
        aria-expanded={groupsOpen}
        onclick={toggleGroups}
      >
        <span
          class="flex-1 text-micro font-semibold tracking-wider text-muted-foreground uppercase"
        >
          {t('groupsTitle')} · {store.groups.length}
        </span>
        <AppIcons.chevron_down
          class={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            groupsOpen ? '' : '-rotate-90',
          )}
        />
      </button>
      <div class="space-y-1 px-2 pb-1" role="list" hidden={!groupsOpen}>
        {#each store.groups as g (g.id)}
          <!-- A GROUP ROW IS A CONVERSATION ROW, and it now reads like one: picture, name, WHAT WAS LAST SAID,
               and when. It used to show a member count instead of the preview, so a reader scanning the list
               learned how many people were in a group but not what they were talking about.

               THE MEMBER COUNT IS STILL HERE, moved beside the name where a chat puts nothing: it is a fact
               about the group rather than the thing a reader is looking for. -->
          {@const groupHandlers = rowLongPress(
            anchor => (groupMenu = { id: g.id, name: g.name, anchor }),
            !selectMode,
          )}
          <button
            type="button"
            class={cn(
              'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left select-none [-webkit-touch-callout:none]',
              groupMenu?.id === g.id ? 'bg-muted' : 'hover:bg-muted/50',
            )}
            onclick={() => store.pushPage({ kind: 'group_chat', key: 'group_chat', id: g.id })}
            oncontextmenu={groupHandlers.oncontextmenu}
            ontouchstart={groupHandlers.ontouchstart}
            ontouchmove={groupHandlers.ontouchmove}
            ontouchend={groupHandlers.ontouchend}
            ontouchcancel={groupHandlers.ontouchcancel}
          >
            <ChatAvatar
              seed={g.name}
              avatar={g.avatarFile ?? ''}
              size={36}
              label={g.name}
              fetchBytes={store.api.fetchFileBytes.bind(store.api)}
            />
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline gap-2">
                <span class="min-w-0 flex-1 truncate text-body font-medium">{g.name}</span>
                <!-- A SESSION'S OWN ROOM IS MARKED, because it is a different kind of place: it exists so one
                     session can be directed, and it disappears with that session. A list where the two looked
                     identical would make "why is this group empty" a recurring question. -->
                {#if isSessionRoom(g)}
                  <span
                    class="shrink-0 rounded border border-border px-1 text-[9px] text-muted-foreground"
                    >{t('groupSessionRoom')}</span
                  >
                {/if}
                {#if g.lastMessageAt}
                  <span class="shrink-0 text-micro text-muted-foreground tabular-nums"
                    >{fmtTime(g.lastMessageAt, now())}</span
                  >
                {/if}
              </span>
              <span class="flex items-baseline gap-2">
                <span class="min-w-0 flex-1 truncate text-micro text-muted-foreground"
                  >{g.lastMessagePreview || t('groupMemberCount', { arg1: g.memberCount })}</span
                >
              </span>
            </span>
            <AppIcons.chevron_right class="size-4 shrink-0 text-muted-foreground" />
          </button>
        {/each}
      </div>
    {/if}

    {#if display.length > 0}
      <SectionLabel class="normal-case">{t('recent')}</SectionLabel>
    {/if}

    {#if display.length === 0}
      <!-- THE PAGE IS NOT EMPTY IF THERE ARE GROUPS: the groups section above is a list of conversations, so
           "no sessions" would contradict what the reader can see. It is shown only when there is nothing at
           all, and then it is true. -->
      {#if store.groups.length === 0}
        <EmptyState>{t('noSessions')}</EmptyState>
      {/if}
    {:else}
      {#each display as s (s.id)}
        <SessionRow
          session={s}
          isActive={s.id === store.activeSessionId}
          subtitle={previewLabel(s.lastMessagePreview) || s.id}
          unread={store.isUnread(s)}
          unreadCount={store.unreadCountFor(s)}
          selectable={selectMode}
          selected={selected.has(s.id)}
          onTap={() => (selectMode ? toggle(s.id) : store.pickSession(s.id))}
          fetchBytes={store.api.fetchFileBytes.bind(store.api)}
          onAvatarTap={() => openProfile(s.id)}
          menuOpen={rowMenu?.sid === s.id}
          onMenuRequest={selectMode ? null : anchor => openRowMenu(s.id, anchor)}
        />
      {/each}
    {/if}
  </div>

  {#if rowMenu}
    <ContextMenu
      anchor={rowMenu.anchor}
      items={rowMenuItems}
      onPick={v => void onRowMenuPick(v)}
      onClose={() => (rowMenu = null)}
    />
  {/if}

  <!-- ONE MENU AT A TIME: opening a group's menu closes a session's, because two floating menus over the same list
       is a state the reader never asked for. -->
  {#if groupMenu}
    <ContextMenu
      anchor={groupMenu.anchor}
      items={groupMenuItems}
      onPick={v => void onGroupMenuPick(v)}
      onClose={() => (groupMenu = null)}
    />
  {/if}

  <NewSessionDialog
    bind:open={newSessionOpen}
    defaultLocale={Prefs.loadAgentLocale()}
    onCreate={(name, locale) => void onCreateSession(name, locale)}
  />
</div>
