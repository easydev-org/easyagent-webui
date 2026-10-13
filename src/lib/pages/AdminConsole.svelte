<script lang="ts">
  // AdminConsole — the ADMIN-ONLY surface. Shown INSTEAD of the chat/settings
  // shell when the active token resolves to `role: admin` (see App.svelte): the
  // admin token can manage tenants + their tokens (agent.v1.AdminService) but
  // has no tenant, so chat/config are meaningless for it.
  import { onMount } from 'svelte'
  import { AdminApi, type Tenant, type TenantToken } from '$lib/admin'
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

  let { baseUrl, token, onLogout }: { baseUrl: string; token: string; onLogout: () => void } =
    $props()

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
  // one-time secrets revealed once (create tenant / issue / rotate token)
  let revealed = $state<{ label: string; value: string } | null>(null)
  let issueLabel = $state('')

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
    const id = newId.trim()
    if (!id || creating) return
    creating = true
    try {
      const plaintext = await api.createTenant(id, newName.trim() || id)
      revealed = { label: `${t('adminBootstrapToken')} — ${id}`, value: plaintext }
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
        <div class="flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-micro">{revealed.value}</code>
          <IconButton icon={AppIcons.copy} label={t('copy')} onclick={() => void copy(revealed!.value)} />
          <IconButton icon={AppIcons.close} label={t('close')} onclick={() => (revealed = null)} />
        </div>
      </div>
    {/if}

    <!-- tenants: section header with an ADD action (matches ProvidersList). -->
    <div class="flex items-center pr-2">
      <SectionLabel class="min-w-0 flex-1">{t('adminTenants')} · {tenants.length}</SectionLabel>
      <IconButton icon={AppIcons.add} label={t('adminCreateTenant')} variant="primary" class="p-1" onclick={() => (createOpen = true)} />
    </div>

    {#if loading}
      <div class="flex justify-center py-8">
        <span class="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"></span>
      </div>
    {:else if tenants.length === 0}
      <EmptyState>{t('adminNoTenants')}</EmptyState>
    {:else}
      {#each tenants as tn (tn.id)}
        <!-- one flat hover row per tenant; click expands its token list -->
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted"
          onclick={() => void toggleExpand(tn.id)}
        >
          {#if expanded === tn.id}<AppIcons.chevron_down class="size-4 shrink-0 text-muted-foreground" />{:else}<AppIcons.chevron_right class="size-4 shrink-0 text-muted-foreground" />{/if}
          <span class="min-w-0 flex-1">
            <span class="block truncate text-body font-medium">{tn.name || tn.id}</span>
            <span class="block truncate font-mono text-micro text-muted-foreground">{tn.id}</span>
          </span>
          {#if tn.disabled}
            <span class="text-micro text-destructive">{t('adminDisabled')}</span>
          {/if}
        </button>

        {#if expanded === tn.id}
          <div class="border-t border-border bg-muted/30">
            <!-- issue a new token -->
            <div class="flex items-end gap-2 px-4 py-3">
              <label class="block">
                <span class="mb-1 block text-meta text-muted-foreground">{t('adminTokenLabel')}</span>
                <Input bind:value={issueLabel} placeholder="ci" />
              </label>
              <Button size="sm" onclick={() => void issue(tn)}>{t('adminIssueToken')}</Button>
            </div>
            {#if (tokens[tn.id] ?? []).length === 0}
              <p class="px-4 pb-3 text-micro text-muted-foreground">{t('adminNoTokens')}</p>
            {:else}
              {#each tokens[tn.id] ?? [] as tok (tok.tokenId)}
                <div class="flex items-center gap-3 px-4 py-2">
                  <AppIcons.key class="size-4 shrink-0 text-muted-foreground" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-meta">{tok.label || tok.tokenId}</span>
                    <span class="block truncate text-micro text-muted-foreground">{tok.lastUsedAt ? t('adminUsed') : t('adminUnused')}</span>
                  </span>
                  {#if tok.revoked}
                    <span class="text-micro text-destructive">{t('adminRevoked')}</span>
                  {:else}
                    <IconButton icon={AppIcons.refresh} label={t('adminRotateToken')} onclick={() => void rotate(tn, tok)} />
                    <IconButton icon={AppIcons.delete} label={t('adminRevokeToken')} variant="destructive" onclick={() => void revoke(tn, tok)} />
                  {/if}
                </div>
              {/each}
            {/if}
            <!-- tenant-level actions -->
            <div class="flex items-center gap-2 border-t border-border px-4 py-2.5">
              <Button size="sm" variant="outline" onclick={() => void setDisabled(tn, !tn.disabled)}>
                {tn.disabled ? t('adminEnable') : t('adminDisable')}
              </Button>
              {#if !tn.disabled}
                <Button size="sm" variant="destructive" onclick={() => void remove(tn)}>
                  {t('adminDisableTenant')}
                </Button>
              {/if}
            </div>
          </div>
        {/if}
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
      <label class="mb-3 block">
        <span class="mb-1 block text-meta text-muted-foreground">{t('adminTenantId')}</span>
        <Input bind:value={newId} placeholder="acme" />
      </label>
      <label class="mb-4 block">
        <span class="mb-1 block text-meta text-muted-foreground">{t('adminTenantName')}</span>
        <Input bind:value={newName} placeholder="Acme Inc" />
      </label>
      <div class="flex justify-end gap-2">
        <Button variant="outline" onclick={() => (createOpen = false)}>{t('cancel')}</Button>
        <Button disabled={newId.trim() === '' || creating} onclick={() => void create()}>
          {creating ? t('saving') : t('create')}
        </Button>
      </div>
    </div>
  </div>
{/if}
