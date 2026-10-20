<script lang="ts">
  // AdminConsole — the ADMIN-ONLY surface. Shown INSTEAD of the chat/settings
  // shell when the active token resolves to `role: admin` (see App.svelte): the
  // admin token can manage tenants + their tokens (agent.v1.AdminService) but
  // has no tenant, so chat/config are meaningless for it.
  import { onMount } from 'svelte'
  import { AdminApi, type AdminToken, type Tenant, type TenantToken } from '$lib/admin'
  import { t } from '$lib/i18n.svelte'
  import { showErrorToast, showToast } from '$lib/toast.svelte'
  import { confirmDialog } from '$lib/dialogs'
  import { AppIcons } from '$lib/icons'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'
  import SectionLabel from '$lib/components/layout/SectionLabel.svelte'
  import EmptyState from '$lib/components/layout/EmptyState.svelte'
  import IconButton from '$lib/components/layout/IconButton.svelte'

  let {
    baseUrl,
    token,
    scope = '*',
    onLogout,
  }: { baseUrl: string; token: string; scope?: string; onLogout: () => void } = $props()

  // A platform admin (scope '*') sees/manages everything; a delegated admin is
  // limited to its subtree (the server enforces this too).
  const isPlatform = $derived(scope === '*' || scope === '')

  // `$derived` (not a plain const): reads the props reactively and rebuilds the
  // client if baseUrl/token ever change (they are stable per mount).
  const api = $derived(new AdminApi(baseUrl, token))

  let tenants = $state<Tenant[]>([])
  let loading = $state(true)
  let expanded = $state<string | null>(null)
  let tokens = $state<Record<string, TenantToken[]>>({})

  // create form
  let newId = $state('')
  let newName = $state('')
  let creating = $state(false)
  let createOpen = $state(false)
  // One-time secrets revealed once (create tenant / issue / rotate token).
  //
  // `username` is set for DELEGATED-ADMIN tokens: unlike a tenant token, that
  // credential is a PAIR — the bearer token alone is not enough, the login form
  // also demands the subtree root's id/name as the username, and the server
  // rejects anything else with "invalid username or token". Showing only the
  // token left a freshly created sub-admin unable to sign in at all, because the
  // "label" typed in the create box is NOT a username (it is never checked).
  let revealed = $state<{ label: string; value: string; username?: string } | null>(null)
  let issueLabel = $state('')
  // delegated admin tokens for the current scope
  let adminTokens = $state<AdminToken[]>([])
  let newAdminLabel = $state('')
  let createParent = $state<string | null>(null) // domain to add a user into
  // inline token rename
  let renaming = $state<string | null>(null)
  let renameValue = $state('')

  // The subtree ROOT of a tenant (self if it is a root).
  function rootOf(t: Tenant): string {
    return t.scopeId || t.id
  }

  // Hierarchical view: each subtree root ("domain") with its member users.
  interface Domain {
    id: string
    name: string
    disabled: boolean
    members: Tenant[]
    adminTokens: AdminToken[]
  }
  const domains = $derived.by<Domain[]>(() => {
    const roots = tenants.filter(t => rootOf(t) === t.id)
    return roots.map(r => ({
      id: r.id,
      name: r.name,
      disabled: r.disabled,
      members: tenants.filter(t => t.id !== r.id && rootOf(t) === r.id),
      adminTokens: r.id === scope ? adminTokens : [],
    }))
  })

  function openCreate(parentId: string | null) {
    createParent = parentId
    newId = ''
    newName = ''
    createOpen = true
  }

  onMount(() => {
    void load()
  })

  async function load() {
    loading = true
    try {
      tenants = await api.listTenants()
    } catch (e) {
      showErrorToast(String(e))
    }
    loading = false
    if (isPlatform) return
    // A delegated admin also sees the delegated-admin tokens of its subtree.
    await loadAdminTokens()
  }

  async function loadAdminTokens() {
    try {
      adminTokens = await api.listAdminTokens(scope)
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function createAdmin(scopeId: string) {
    try {
      const plaintext = await api.createAdminToken(scopeId, newAdminLabel.trim() || 'sub-admin')
      // The username a delegated admin must type is the subtree root's ID or
      // NAME — never the label entered above, which is only a display name.
      // Prefer the human-readable name; the id is shown as well in the dialog.
      const rootName = tenants.find(t => t.id === scopeId)?.name || scopeId
      revealed = {
        label: `${t('adminSubAdmin')} — ${scopeId}`,
        value: plaintext,
        username: rootName,
      }
      newAdminLabel = ''
      await loadAdminTokens()
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  function startRename(tok: TenantToken) {
    renaming = tok.tokenId
    renameValue = tok.label
  }

  async function commitRename(tn: Tenant) {
    if (renaming == null) return
    try {
      await api.setTokenLabel(renaming, renameValue.trim())
      showToast(t('saved'))
      renaming = null
      await toggleRefresh(tn.id)
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function revokeAdmin(tok: AdminToken) {
    const ok = await confirmDialog({
      title: t('adminRevokeToken'),
      body: tok.label || tok.tokenId,
      confirmLabel: t('delete'),
      destructive: true,
    })
    if (!ok) return
    try {
      await api.revokeAdminToken(tok.tokenId)
      await loadAdminTokens()
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function toggleExpand(id: string) {
    if (expanded === id) {
      expanded = null
      return
    }
    expanded = id
    try {
      tokens = { ...tokens, [id]: await api.listTokens(id) }
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function create() {
    if (creating) return
    creating = true
    try {
      // A platform admin adding a user INSIDE a domain supplies the id; every
      // other case (a new domain, or a delegated admin) lets the server
      // generate it under the subtree root.
      const id = isPlatform && createParent ? newId.trim() : ''
      const r = await api.createTenant(id, newName.trim() || id, createParent ?? '')
      revealed = { label: `${t('adminBootstrapToken')} — ${r.id}`, value: r.token }
      newId = ''
      newName = ''
      showToast(t('saved'))
      await load()
    } catch (e) {
      showErrorToast(String(e))
    }
    creating = false
  }

  async function setDisabled(tn: Tenant, disabled: boolean) {
    try {
      await api.updateTenant(tn.id, { disabled })
      showToast(t('saved'))
      await load()
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function remove(tn: Tenant) {
    const ok = await confirmDialog({
      title: t('adminDisableTenant'),
      body: tn.id,
      confirmLabel: t('confirm'),
      destructive: true,
    })
    if (!ok) return
    try {
      await api.deleteTenant(tn.id)
      showToast(t('saved'))
      await load()
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function issue(tn: Tenant) {
    try {
      const plaintext = await api.issueToken(tn.id, issueLabel.trim() || 'token')
      revealed = { label: `${t('adminToken')} — ${tn.id}`, value: plaintext }
      issueLabel = ''
      await toggleRefresh(tn.id)
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function rotate(tn: Tenant, tok: TenantToken) {
    const ok = await confirmDialog({
      title: t('adminRotateToken'),
      body: tok.label,
      confirmLabel: t('confirm'),
      destructive: true,
    })
    if (!ok) return
    try {
      const plaintext = await api.rotateToken(tok.tokenId)
      revealed = { label: `${t('adminToken')} — ${tn.id}`, value: plaintext }
      await toggleRefresh(tn.id)
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function revoke(tn: Tenant, tok: TenantToken) {
    const ok = await confirmDialog({
      title: t('adminRevokeToken'),
      body: tok.label,
      confirmLabel: t('delete'),
      destructive: true,
    })
    if (!ok) return
    try {
      await api.revokeToken(tok.tokenId)
      await toggleRefresh(tn.id)
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function toggleRefresh(id: string) {
    try {
      tokens = { ...tokens, [id]: await api.listTokens(id) }
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      showToast(t('copied'))
    } catch {
      /* clipboard optional */
    }
  }
</script>

<div class="flex h-full w-full flex-col">
  <PageHeader title={t('adminTitle')}>
    <IconButton icon={AppIcons.login} label={t('signOut')} onclick={onLogout} />
  </PageHeader>

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if revealed}
      <div class="m-3 rounded-md border border-warning/40 bg-warning/10 p-3">
        <div class="mb-1 text-meta font-semibold text-warning">{revealed.label}</div>
        <div class="mb-2 text-micro text-muted-foreground">{t('adminTokenOnce')}</div>
        {#if revealed.username}
          <!-- A delegated-admin credential is a PAIR. Showing only the token is
               what made a new sub-admin unable to sign in: the login form also
               requires this username, and the server rejects anything else. -->
          <div class="mb-2 rounded bg-warning/10 px-2 py-1.5 text-micro">
            <div class="text-muted-foreground">{t('adminLoginUsername')}</div>
            <div class="flex items-center gap-2">
              <code class="min-w-0 flex-1 truncate font-mono">{revealed.username}</code>
              <IconButton icon={AppIcons.copy} label={t('copy')} onclick={() => void copy(revealed!.username!)} />
            </div>
          </div>
        {/if}
        <div class="flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-micro">{revealed.value}</code>
          <IconButton icon={AppIcons.copy} label={t('copy')} onclick={() => void copy(revealed!.value)} />
          <IconButton icon={AppIcons.close} label={t('close')} onclick={() => (revealed = null)} />
        </div>
      </div>
    {/if}

    {#if !isPlatform}
      <div class="mx-3 mt-3 rounded-md border border-border bg-muted/40 px-3 py-2">
        <div class="text-micro text-muted-foreground">{t('adminDelegatedScope')}</div>
        <div class="font-mono text-meta">{scope}</div>
      </div>
    {/if}

    <!-- domains (subtree roots) with their member users -->
    <div class="flex items-center pr-2">
      <SectionLabel class="min-w-0 flex-1">{t('adminDomains')} · {domains.length}</SectionLabel>
      <IconButton icon={AppIcons.add} label={t('adminCreateDomain')} variant="primary" class="p-1" onclick={() => openCreate(null)} />
    </div>

    {#if loading}
      <div class="flex justify-center py-8">
        <span class="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"></span>
      </div>
    {:else if domains.length === 0}
      <EmptyState>{t('adminNoTenants')}</EmptyState>
    {:else}
      {#each domains as dom (dom.id)}
        <!-- DOMAIN (subtree root) -->
        <div class="flex items-center gap-2 bg-muted/50 px-3 py-2">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 text-left"
            onclick={() => void toggleExpand('dom:' + dom.id)}
          >
            {#if expanded === 'dom:' + dom.id}<AppIcons.chevron_down class="size-4 shrink-0 text-muted-foreground" />{:else}<AppIcons.chevron_right class="size-4 shrink-0 text-muted-foreground" />{/if}
            <AppIcons.jobs class="size-4 shrink-0 text-primary" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-body font-semibold">{dom.name || dom.id}</span>
              <span class="block truncate font-mono text-micro text-muted-foreground">{dom.id} · {dom.members.length} {t('adminUsers')}</span>
            </span>
            {#if dom.disabled}<span class="text-micro text-destructive">{t('adminDisabled')}</span>{/if}
          </button>
          <IconButton icon={AppIcons.add} label={t('adminCreateUser')} onclick={() => openCreate(dom.id)} />
        </div>

        {#if expanded === 'dom:' + dom.id}
          <!-- domain-level: its own sub-admin tokens -->
          <div class="border-y border-border bg-card px-4 py-2 pl-9">
            <div class="mb-1 flex items-center gap-2 text-micro text-muted-foreground">
              <AppIcons.key class="size-3.5" />{t('adminSubAdmins')}
            </div>
            {#each dom.adminTokens as at (at.tokenId)}
              <div class="flex items-center gap-2 py-1">
                <span class="min-w-0 flex-1 truncate text-meta">{at.label || at.tokenId}</span>
                {#if at.revoked}
                  <span class="text-micro text-destructive">{t('adminRevoked')}</span>
                {:else}
                  <IconButton icon={AppIcons.delete} label={t('adminRevokeToken')} variant="destructive" onclick={() => void revokeAdmin(at)} />
                {/if}
              </div>
            {/each}
            <div class="mt-1 flex items-end gap-2">
              <Input bind:value={newAdminLabel} placeholder={t('adminTokenLabel')} />
              <Button size="sm" onclick={() => void createAdmin(dom.id)}>{t('adminCreateSubAdmin')}</Button>
            </div>
          </div>
        {/if}

        <!-- USERS (tenants in the domain) -->
        {#each dom.members as tn (tn.id)}
          <button
            type="button"
            class="flex w-full items-center gap-3 border-b border-border/60 px-4 py-2.5 pl-9 text-left hover:bg-muted"
            onclick={() => void toggleExpand(tn.id)}
          >
            {#if expanded === tn.id}<AppIcons.chevron_down class="size-4 shrink-0 text-muted-foreground" />{:else}<AppIcons.chevron_right class="size-4 shrink-0 text-muted-foreground" />{/if}
            <AppIcons.terminal class="size-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-body">{tn.name || tn.id}</span>
              <span class="block truncate font-mono text-micro text-muted-foreground">{tn.id}</span>
            </span>
            {#if tn.disabled}<span class="text-micro text-destructive">{t('adminDisabled')}</span>{/if}
          </button>

          {#if expanded === tn.id}
            <div class="border-b border-border bg-muted/30 pl-9">
              <div class="flex items-end gap-2 px-4 py-3">
                <label class="block min-w-0 flex-1">
                  <span class="mb-1 block text-meta text-muted-foreground">{t('adminTokenLabel')}</span>
                  <Input bind:value={issueLabel} placeholder="ci" />
                </label>
                <Button size="sm" onclick={() => void issue(tn)}>{t('adminIssueToken')}</Button>
              </div>
              {#if (tokens[tn.id] ?? []).length === 0}
                <p class="px-4 pb-3 text-micro text-muted-foreground">{t('adminNoTokens')}</p>
              {:else}
                {#each tokens[tn.id] ?? [] as tok (tok.tokenId)}
                  <div class="flex items-center gap-2 px-4 py-2">
                    <AppIcons.key class="size-4 shrink-0 text-muted-foreground" />
                    {#if renaming === tok.tokenId}
                      <Input bind:value={renameValue} />
                      <Button size="sm" onclick={() => void commitRename(tn)}>{t('save')}</Button>
                      <Button size="sm" variant="outline" onclick={() => (renaming = null)}>{t('cancel')}</Button>
                    {:else}
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-meta">{tok.label || tok.tokenId}</span>
                        <span class="block truncate text-micro text-muted-foreground">{tok.lastUsedAt ? t('adminUsed') : t('adminUnused')}</span>
                      </span>
                      {#if tok.revoked}
                        <span class="text-micro text-destructive">{t('adminRevoked')}</span>
                      {:else}
                        <IconButton icon={AppIcons.edit} label={t('adminRenameToken')} onclick={() => startRename(tok)} />
                        <IconButton icon={AppIcons.refresh} label={t('adminRotateToken')} onclick={() => void rotate(tn, tok)} />
                        <IconButton icon={AppIcons.delete} label={t('adminRevokeToken')} variant="destructive" onclick={() => void revoke(tn, tok)} />
                      {/if}
                    {/if}
                  </div>
                {/each}
              {/if}
              <div class="flex items-center gap-2 border-t border-border px-4 py-2.5">
                <Button size="sm" variant="outline" onclick={() => void setDisabled(tn, !tn.disabled)}>
                  {tn.disabled ? t('adminEnable') : t('adminDisable')}
                </Button>
                {#if !tn.disabled}
                  <Button size="sm" variant="destructive" onclick={() => void remove(tn)}>{t('adminDisableTenant')}</Button>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      {/each}
    {/if}

    {#if !isPlatform}
      <!-- delegated administrators of this subtree (re-delegation) -->
      <div class="flex items-center pr-2">
        <SectionLabel class="min-w-0 flex-1">{t('adminSubAdmins')} · {adminTokens.length}</SectionLabel>
      </div>
      <div class="flex items-end gap-2 px-4 py-2">
        <label class="block">
          <span class="mb-1 block text-meta text-muted-foreground">{t('adminTokenLabel')}</span>
          <Input bind:value={newAdminLabel} placeholder="ops" />
        </label>
        <Button size="sm" onclick={() => void createAdmin()}>{t('adminCreateSubAdmin')}</Button>
      </div>
      {#each adminTokens as at (at.tokenId)}
        <div class="flex items-center gap-3 px-4 py-2">
          <AppIcons.key class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-meta">{at.label || at.tokenId}</span>
            <span class="block truncate font-mono text-micro text-muted-foreground">{at.scopeTenantId}</span>
          </span>
          {#if at.revoked}
            <span class="text-micro text-destructive">{t('adminRevoked')}</span>
          {:else}
            <IconButton icon={AppIcons.delete} label={t('adminRevokeToken')} variant="destructive" onclick={() => void revokeAdmin(at)} />
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

{#if createOpen}
  <div
    class="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
    role="presentation"
    onclick={() => (createOpen = false)}
  >
    <div
      class="w-[min(92vw,420px)] rounded-lg border border-border bg-card p-4 shadow-xl"
      role="presentation"
      onclick={e => e.stopPropagation()}
    >
      <div class="mb-3 text-sm font-semibold">{t('adminCreateTenant')}</div>
      {#if isPlatform}
        <label class="mb-3 block">
          <span class="mb-1 block text-meta text-muted-foreground">{t('adminTenantId')}</span>
          <Input bind:value={newId} placeholder="acme" />
        </label>
      {:else}
        <p class="mb-3 text-micro text-muted-foreground">{t('adminSubTenantIdHint')}</p>
      {/if}
      <label class="mb-4 block">
        <span class="mb-1 block text-meta text-muted-foreground">{t('adminTenantName')}</span>
        <Input bind:value={newName} placeholder="Acme Inc" />
      </label>
      <div class="flex justify-end gap-2">
        <Button variant="outline" onclick={() => (createOpen = false)}>{t('cancel')}</Button>
        <Button
          disabled={(isPlatform && newId.trim() === '') || (!isPlatform && newName.trim() === '') || creating}
          onclick={() => void create()}
        >
          {creating ? t('saving') : t('create')}
        </Button>
      </div>
    </div>
  </div>
{/if}
