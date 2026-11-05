<script lang="ts">
  // SessionList — web port of flutter screens/session_list_page.dart: search,
  // multi-select batch delete, long-press actions (delete / mark read), new
  // session (prompt), unread badges, pull-refresh, empty + error states.
  import type { PageProps } from '$lib/page-props'
  import { t } from '$lib/i18n.svelte'
  import { showErrorToast, showToast } from '$lib/toast.svelte'
  import { promptDialog, confirmDialog } from '$lib/dialogs'
  import { Prefs } from '$lib/prefs'
  import { sessionName } from '$lib/models'
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

  let { store }: PageProps = $props()

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

  function create() {
    newSessionOpen = true
  }

  async function onCreateSession(name: string, locale: 'zh' | 'en') {
    try {
      // Pin the language at creation so the session never drifts with the
      // mutable tenant default.
      await store.api.createSession({ name, locale })
      newSessionOpen = false
      await store.refreshSessions()
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
      await store.refreshSessions()
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

  <SectionLabel class="normal-case">{t('recent')}</SectionLabel>

  <div
    class="min-h-0 flex-1 overflow-y-auto"
    role="list"
    ontouchstart={onTouchStart}
    ontouchmove={onTouchMove}
  >
    {#if display.length === 0}
      <EmptyState>{t('noSessions')}</EmptyState>
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

  <NewSessionDialog
    bind:open={newSessionOpen}
    defaultLocale={Prefs.loadAgentLocale()}
    onCreate={(name, locale) => void onCreateSession(name, locale)}
  />
</div>
