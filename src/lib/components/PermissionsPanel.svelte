<script lang="ts">
  // Session permissions panel.
  //
  // Renders ENTIRELY from what the extensions declare: an extension id, a permission key,
  // a risk, and a params shape. This file never mentions a repository, a sandbox or any
  // other extension concept — if it did, adding a new extension would mean editing the
  // console, which is the coupling the permission design exists to avoid.
  //
  // A session may hold SEVERAL grants of the same key with different params ("merge in
  // this repo" and "merge in that one" are separate authorisations), so grants are listed
  // per instance with their own revoke button, and "grant another" is always offered.
  import { AppIcons } from '$lib/icons'
  import { t } from '$lib/i18n.svelte'
  import type { PermissionDecl, SessionGrant } from '$lib/models'
  import { cn } from '$lib/utils'
  import ChannelsTab from './ChannelsTab.svelte'
  import type { ChannelDecl, ChannelSubscription } from '$lib/models'

  interface Props {
    /** Session whose permissions are shown. */
    sessionId: string
    /** Declared by the discovered extensions. */
    decls: PermissionDecl[]
    /** Currently held. */
    grants: SessionGrant[]
    /** Locale for labels/descriptions. */
    locale?: string
    ongrant: (decl: PermissionDecl, params: string) => Promise<void> | void
    onrevoke: (grant: SessionGrant) => Promise<void> | void
    onclose: () => void
    class?: string
    // Channel tab data. Passed in already loaded rather than fetched here: this component
    // is presentational, and the page owns the data so both tabs read one source.
    channels?: ChannelDecl[]
    subs?: ChannelSubscription[]
    chError?: string
    onsubscribe?: (channel: string, pattern: string, wake: boolean) => Promise<void> | void
    onunsubscribe?: (sub: ChannelSubscription) => Promise<void> | void
  }
  let {
    sessionId, decls, grants, locale = '', ongrant, onrevoke, onclose, class: className,
    channels = [], subs = [], chError = '', onsubscribe, onunsubscribe,
  }: Props = $props()

  // Two tabs rather than two panels: permissions and channels answer the same question
  // ("what may this session do, and what does it hear"), so side by side would just hide one
  // behind the other.
  type Tab = 'permissions' | 'channels'
  let tab = $state<Tab>('permissions')

  /** Grants grouped by extension, then by capability, so the list mirrors how a user
   *  thinks ("what may this session do to gitea"). */
  const grouped = $derived.by(() => {
    const byExt = new Map<string, Map<string, SessionGrant[]>>()
    for (const g of grants) {
      if (!byExt.has(g.extId)) byExt.set(g.extId, new Map())
      const caps = byExt.get(g.extId)!
      if (!caps.has(g.capability)) caps.set(g.capability, [])
      caps.get(g.capability)!.push(g)
    }
    return [...byExt.entries()].sort(([a], [b]) => a.localeCompare(b))
  })

  /** Declarations for one (extension, key), or undefined when the extension has
   *  disappeared since the grant was made. */
  function declFor(extId: string, key: string): PermissionDecl | undefined {
    return decls.find(d => d.extId === extId && d.key === key)
  }

  function label(d: PermissionDecl | undefined, key: string): string {
    if (!d) return key
    return d.descriptions?.[locale] || d.label || key
  }

  const riskClass = (risk: string): string =>
    risk === 'destructive'
      ? 'bg-destructive/10 text-destructive border-destructive/30'
      : risk === 'write'
        ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
        : 'bg-muted text-muted-foreground border-border'

  /** Render params as "repo: agentdev/*" for display.
   *
   *  Deliberately dumb: it prints the JSON's key/value pairs and nothing more. The console
   *  does not know what "repo" means, and giving it an opinion would break the moment an
   *  extension declares different params. */
  function paramsText(raw: string): string {
    if (!raw) return ''
    try {
      const v = JSON.parse(raw) as Record<string, unknown>
      return Object.entries(v)
        .map(([k, val]) => `${k}: ${typeof val === 'string' ? val : JSON.stringify(val)}`)
        .join(', ')
    } catch {
      return raw
    }
  }

  /** Which declaration is being granted, if any. */
  let granting = $state<PermissionDecl | null>(null)
  let draft = $state<Record<string, string>>({})
  let busy = $state(false)

  function startGrant(d: PermissionDecl) {
    granting = d
    draft = {}
    for (const f of d.paramsFields) draft[f.name] = ''
  }

  async function confirmGrant() {
    if (!granting || busy) return
    busy = true
    try {
      // Params are built as the DECLARED fields only: an undeclared key would be a value
      // the extension never asked for and cannot match.
      const params: Record<string, string> = {}
      for (const f of granting.paramsFields) {
        const v = (draft[f.name] ?? '').trim()
        if (v !== '') params[f.name] = v
      }
      await ongrant(granting, Object.keys(params).length ? JSON.stringify(params) : '')
      granting = null
    } finally {
      busy = false
    }
  }

  const canConfirm = $derived(
    granting != null &&
      granting.paramsFields
        .filter(f => f.required)
        .every(f => (draft[f.name] ?? '').trim() !== ''),
  )
</script>

<aside
  class={cn(
    'flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-background',
    className,
  )}
>
  <header class="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
    <span class="text-sm font-semibold">{t('permissionsTitle')}</span>
    <button
      class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={t('close')}
      onclick={onclose}
    >
      <AppIcons.x class="size-4" />
    </button>
  </header>

  <!-- Tabs, not two panels: "what may this session do" and "what does it hear" are the same
       question asked twice. -->
  <div class="flex shrink-0 border-b border-border">
    <button
      class={cn(
        'flex-1 py-1.5 text-micro',
        tab === 'permissions'
          ? 'border-b-2 border-primary font-semibold text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onclick={() => (tab = 'permissions')}
    >
      {t('permissionsTab')}
    </button>
    <button
      class={cn(
        'flex-1 py-1.5 text-micro',
        tab === 'channels'
          ? 'border-b-2 border-primary font-semibold text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onclick={() => (tab = 'channels')}
    >
      {t('channelsTab')}
    </button>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto p-3">
    {#if tab === 'channels'}
      <ChannelsTab
        decls={channels}
        subs={subs}
        {locale}
        error={chError}
        onsubscribe={onsubscribe ?? (() => {})}
        onunsubscribe={onunsubscribe ?? (() => {})}
      />
    {:else}
    {#if grouped.length === 0 && decls.length === 0}
      <p class="text-micro text-muted-foreground italic">{t('permissionsNoneAvailable')}</p>
    {:else}
      {#each grouped as [extId, caps] (extId)}
        <section class="mb-4">
          <h3 class="mb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">
            {extId}
          </h3>
          {#each [...caps.entries()] as [key, items] (key)}
            {@const d = declFor(extId, key)}
            <div class="mb-2 rounded border border-border">
              <div class="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
                <span class="min-w-0 truncate text-micro font-medium">{label(d, key)}</span>
                {#if d?.risk}
                  <span class={cn('shrink-0 rounded border px-1 text-[9px]', riskClass(d.risk))}>
                    {d.risk}
                  </span>
                {/if}
              </div>
              {#each items as g (g.id)}
                <!-- One grant per row, with the rows visually separated.
                     Without that, several grants of the same capability read as one block
                     and "Revoke" is ambiguous: which of these three am I removing? -->
                <div class="flex items-center justify-between gap-2 border-t border-border/50 px-2 py-1 first:border-t-0">
                  <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                    {paramsText(g.params) || t('permissionsNoParams')}
                  </span>
                  <button
                    class="shrink-0 rounded px-1 text-micro text-destructive hover:bg-destructive/10"
                    title={`${t('revoke')}: ${paramsText(g.params) || t('permissionsNoParams')}`}
                    onclick={() => void onrevoke(g)}
                  >
                    {t('revoke')}
                  </button>
                </div>
                {#if g.grantedBy.startsWith('auto:fork:')}
                  <p class="px-2 pb-1 text-[9px] text-muted-foreground italic">
                    {t('permissionsInherited')} {g.grantedBy.slice('auto:fork:'.length)}
                  </p>
                {/if}
              {/each}
            </div>
            {#if d}
              <button
                class="mb-2 w-full rounded border border-dashed border-border py-1 text-micro text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                onclick={() => startGrant(d)}
              >
                + {t('permissionsGrantAnother')}
              </button>
            {/if}
          {/each}
        </section>
      {/each}

      {#if granting}
        <div class="mt-3 rounded border border-border bg-muted/30 p-2">
          <p class="mb-2 text-micro font-medium">
            {t('permissionsGrant')}: {label(granting, granting.key)}
          </p>
          {#if granting.paramsFields.length === 0}
            <p class="mb-2 text-[10px] text-muted-foreground italic">{t('permissionsNoParams')}</p>
          {:else}
            {#each granting.paramsFields as f (f.name)}
              <label class="mb-1.5 block">
                <span class="text-[10px] text-muted-foreground">
                  {f.name}{f.required ? ' *' : ''}
                </span>
                <input
                  class="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 font-mono text-[11px]"
                  bind:value={draft[f.name]}
                  placeholder={f.description || ''}
                />
              </label>
            {/each}
          {/if}
          {#if granting.risk === 'destructive'}
            <p class="mb-2 text-[10px] text-destructive">
              ⚠ {t('permissionsDestructiveWarning')}
            </p>
          {/if}
          <div class="flex justify-end gap-2">
            <button
              class="rounded px-2 py-1 text-micro text-muted-foreground hover:bg-muted"
              onclick={() => (granting = null)}
            >
              {t('cancel')}
            </button>
            <button
              class="rounded bg-primary px-2 py-1 text-micro text-primary-foreground disabled:opacity-50"
              disabled={!canConfirm || busy}
              onclick={() => void confirmGrant()}
            >
              {t('confirm')}
            </button>
          </div>
        </div>
      {/if}

      {#if grouped.length === 0}
        <p class="mt-2 text-micro text-muted-foreground italic">{t('permissionsNoneHeld')}</p>
      {/if}
    {/if}
    {/if}
  </div>
</aside>
