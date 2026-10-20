<script lang="ts">
  // ExtensionsDetail — the WHOLE config surface of each discovered extension.
  // (The Tools page shows only the subset a tool requires; this page edits every
  // declared knob, e.g. bundled's model.* refs + brave_api_key.)
  import type { AppStore } from '$lib/store.svelte'
  import type { ExtensionInfo, ProviderInfo, ToolConfig } from '$lib/models'
  import { t } from '$lib/i18n.svelte'
  import { showErrorToast, showToast } from '$lib/toast.svelte'
  import { AppIcons } from '$lib/icons'
  import { Select } from '$lib/components/ui/select'
  import StructuredConfigEditor from '$lib/components/StructuredConfigEditor.svelte'

  let { store }: { store: AppStore } = $props()

  let extensions = $state<ExtensionInfo[]>([])
  let configs = $state<Record<string, Record<string, unknown>>>({})
  // Per-extension: which secret knobs are SET (the server never returns their
  // value). The UI shows "set / not set" and a write-only field.
  let secretSet = $state<Record<string, Set<string>>>({})
  // Knobs the user is currently re-entering (a secret field is write-only:
  // it only appears once the user clicks "replace").
  let editingSecret = $state<Record<string, boolean>>({})
  let providers = $state<Record<string, ProviderInfo>>({})
  let expanded = $state<string | null>(null)
  let loading = $state(true)
  const drafts = $state<Record<string, string>>({})

  $effect(() => {
    void (async () => {
      try {
        extensions = await store.api.extensions()
        for (const e of extensions) {
          const cfg = await store.api.extensionConfig(e.extId)
          configs[e.extId] = cfg.values
          secretSet[e.extId] = new Set(cfg.secretSet)
        }
      } catch (e) {
        showErrorToast(t('loadError', { e: String(e) }))
      }
      try {
        providers = await store.api.providers()
      } catch {
        /* providers optional */
      }
      loading = false
    })()
  })

  /** Registered models of [capability] as `provider_id/model_id` refs. */
  function modelRefs(capability: string): string[] {
    const out: string[] = []
    for (const p of Object.values(providers)) {
      if (p.capability !== capability) continue
      for (const m of p.models) out.push(`${p.providerId}/${m.id}`)
    }
    return out.sort()
  }

  function knobValue(extId: string, knob: ToolConfig): string {
    const k = `${extId}.${knob.name}`
    if (k in drafts) return drafts[k]
    const v = (configs[extId] ?? {})[knob.name]
    return v == null ? '' : String(v)
  }

  /**
   * structuredValue parses a structured knob's current value for the editor.
   *
   * The stored form is JSON text; a value that is already an object/array (some
   * paths return it parsed) is used as-is. An unparseable or empty value becomes
   * the empty shape, so the editor starts clean instead of throwing.
   */
  function structuredValue(extId: string, knob: ToolConfig): unknown {
    const k = `${extId}.${knob.name}`
    const raw = k in drafts ? drafts[k] : (configs[extId] ?? {})[knob.name]
    if (raw == null || raw === '') return knob.type === 'object' ? {} : []
    if (typeof raw !== 'string') return raw
    try {
      return JSON.parse(raw)
    } catch {
      return knob.type === 'object' ? {} : []
    }
  }

  function fmtDefault(v: unknown): string {
    return v == null ? '' : String(v)
  }

  async function saveKnob(extId: string, knob: ToolConfig, value: string) {
    try {
      await store.api.setToolConfigValue(extId, knob.name, value)
      if (knob.kind === 'secret') {
        // The value is write-only: track only whether it is now set.
        const s = new Set(secretSet[extId] ?? [])
        if (value === '') s.delete(knob.name)
        else s.add(knob.name)
        secretSet = { ...secretSet, [extId]: s }
        editingSecret = { ...editingSecret, [`${extId}.${knob.name}`]: false }
        delete drafts[`${extId}.${knob.name}`]
        showToast(t('saved'))
        return
      }
      const vals = { ...(configs[extId] ?? {}) }
      if (value === '') delete vals[knob.name]
      else vals[knob.name] = value
      configs = { ...configs, [extId]: vals }
      delete drafts[`${extId}.${knob.name}`]
      showToast(t('saved'))
    } catch (e) {
      showErrorToast(String(e))
    }
  }

  /** Whether a secret knob currently has a value set (server-reported). */
  function isSecretSet(extId: string, name: string): boolean {
    return secretSet[extId]?.has(name) ?? false
  }
</script>

<div class="h-full w-full p-4">
  {#if loading}
    <div class="flex justify-center py-8">
      <span class="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"></span>
    </div>
  {:else if extensions.length === 0}
    <p class="py-2 text-center text-meta text-muted-foreground">{t('noExtensions')}</p>
  {:else}
    {#each extensions as ext (ext.extId)}
      <div class="mb-2 rounded-md border border-border bg-card">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2.5 text-left"
          onclick={() => (expanded = expanded === ext.extId ? null : ext.extId)}
        >
          <span class="min-w-0 flex-1 truncate font-mono text-meta">{ext.extId}</span>
          <span class="text-micro text-muted-foreground">{ext.configFields.length} {t('configKnobs')}</span>
          <span class="text-micro text-muted-foreground">{#if expanded === ext.extId}<AppIcons.chevron_down class="size-3" />{:else}<AppIcons.chevron_right class="size-3" />{/if}</span>
        </button>

        {#if expanded === ext.extId}
          <div class="space-y-3 border-t border-border/60 px-3 py-3">
            {#each ext.configFields as knob (knob.name)}
              <label class="block">
                <span class="mb-1 flex items-center gap-1.5 text-meta">
                  <span class="font-mono">{knob.name}</span>
                  {#if knob.description}
                    <span class="text-micro text-muted-foreground">— {knob.description}</span>
                  {/if}
                </span>
                <!-- STRUCTURED knobs come FIRST, before the secret branch.
                     A structured knob may itself be kind=secret (the sandbox list
                     holds a token per item): checking `kind` first would render
                     it as one masked textarea and hide the whole form. -->
                {#if (knob.type === 'list' || knob.type === 'object') && knob.fields?.length}
                  <StructuredConfigEditor
                    fields={knob.fields}
                    itemType={knob.itemType}
                    minItems={knob.minItems}
                    maxItems={knob.maxItems}
                    mode={knob.type === 'list' ? 'list' : 'object'}
                    value={structuredValue(ext.extId, knob)}
                    onchange={v => (drafts[`${ext.extId}.${knob.name}`] = JSON.stringify(v))}
                  />
                  <div class="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      class="rounded-md border border-border px-3 py-1 text-meta hover:bg-muted"
                      onclick={() => void saveKnob(ext.extId, knob, drafts[`${ext.extId}.${knob.name}`] ?? JSON.stringify(structuredValue(ext.extId, knob)))}
                    >{t('save')}</button>
                    <span class="text-micro text-muted-foreground">{t('structHint')}</span>
                  </div>
                {:else if knob.kind === 'secret'}
                  {@const key = `${ext.extId}.${knob.name}`}
                  <div class="flex items-center gap-2">
                    {#if isSecretSet(ext.extId, knob.name) && !editingSecret[key]}
                      <!-- A value is set; the server never returns it. Show a
                           badge + replace/clear, never the credential. -->
                      <span class="flex items-center gap-1.5 text-meta text-muted-foreground">
                        <span class="size-1.5 rounded-full bg-emerald-500"></span>
                        {t('secretSet')}
                      </span>
                      <button
                        type="button"
                        class="rounded-md border border-border px-3 text-meta hover:bg-muted"
                        onclick={() => (editingSecret = { ...editingSecret, [key]: true })}
                      >{t('replace')}</button>
                      <button
                        type="button"
                        class="rounded-md border border-border px-3 text-meta hover:bg-muted"
                        onclick={() => void saveKnob(ext.extId, knob, '')}
                      >{t('clear')}</button>
                    {:else}
                      <input
                        type="password"
                        autocomplete="new-password"
                        value={drafts[key] ?? ''}
                        placeholder={t('secretNotSet')}
                        class="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
                        oninput={e => (drafts[key] = e.currentTarget.value)}
                        onkeydown={e => e.key === 'Enter' && void saveKnob(ext.extId, knob, drafts[key] ?? '')}
                      />
                      <button
                        type="button"
                        class="rounded-md border border-border px-3 text-meta hover:bg-muted"
                        onclick={() => void saveKnob(ext.extId, knob, drafts[key] ?? '')}
                      >{t('save')}</button>
                      {#if editingSecret[key]}
                        <button
                          type="button"
                          class="rounded-md border border-border px-3 text-meta hover:bg-muted"
                          onclick={() => (editingSecret = { ...editingSecret, [key]: false })}
                        >{t('cancel')}</button>
                      {/if}
                    {/if}
                  </div>
                {:else if knob.kind === 'model'}
                  <Select
                    value={knobValue(ext.extId, knob)}
                    items={[{ value: '', label: t('none') }, ...modelRefs(knob.capability).map(ref => ({ value: ref, label: ref }))]}
                    onchange={v => void saveKnob(ext.extId, knob, v)}
                  />
                {:else if knob.type === 'enum' && knob.enumValues.length}
                  <Select
                    value={knobValue(ext.extId, knob)}
                    items={[{ value: '', label: t('none') }, ...knob.enumValues.map(ev => ({ value: ev, label: ev }))]}
                    onchange={v => void saveKnob(ext.extId, knob, v)}
                  />
                {:else if knob.type === 'boolean'}
                  <Select
                    value={knobValue(ext.extId, knob)}
                    items={[{ value: '', label: t('none') }, { value: 'true', label: 'true' }, { value: 'false', label: 'false' }]}
                    onchange={v => void saveKnob(ext.extId, knob, v)}
                  />
                {:else}
                  <div class="flex gap-2">
                    <input
                      type={knob.type === 'number' ? 'number' : 'text'}
                      value={knobValue(ext.extId, knob)}
                      placeholder={fmtDefault(knob.defaultValue)}
                      class="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
                      oninput={e => (drafts[`${ext.extId}.${knob.name}`] = e.currentTarget.value)}
                      onkeydown={e => e.key === 'Enter' && void saveKnob(ext.extId, knob, drafts[`${ext.extId}.${knob.name}`] ?? knobValue(ext.extId, knob))}
                    />
                    <button
                      type="button"
                      class="rounded-md border border-border px-3 text-meta hover:bg-muted"
                      onclick={() => void saveKnob(ext.extId, knob, drafts[`${ext.extId}.${knob.name}`] ?? knobValue(ext.extId, knob))}
                    >{t('save')}</button>
                  </div>
                {/if}
              </label>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>
