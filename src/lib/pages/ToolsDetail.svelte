<script lang="ts">
  // ToolsDetail — tools grouped by extension, expandable cards showing what the
  // tool is, the config knobs it REQUIRES (read-only, with their current value
  // and a per-knob status), and its parameter schema.
  //
  // This page is READ-ONLY: config is edited on the Extensions page (an
  // extension's whole surface), so a knob's value is shown here but not edited.
  import type { AppStore } from '$lib/store.svelte'
  import type { ToolConfig, ToolInfo } from '$lib/models'
  import { t } from '$lib/i18n.svelte'
  import { Prefs } from '$lib/prefs'
  import { showErrorToast } from '$lib/toast.svelte'
  import { AppIcons } from '$lib/icons'
  import { parseToolParams } from '$lib/tool-params'

  let { store }: { store: AppStore } = $props()

  let tools = $state<ToolInfo[]>([])
  let config = $state<Record<string, unknown>>({})
  let expanded = $state<string | null>(null)
  let loading = $state(true)

  $effect(() => {
    void (async () => {
      try {
        tools = await store.api.tools(Prefs.loadAgentLocale())
      } catch (e) {
        showErrorToast(t('loadError', { e: String(e) }))
      }
      try {
        config = await store.api.toolConfig()
      } catch {
        /* no config yet */
      }
      loading = false
    })()
  })

  const categories = $derived.by(() => {
    const cats: Record<string, ToolInfo[]> = {}
    for (const tl of tools) {
      const k = tl.category || 'other'
      ;(cats[k] ??= []).push(tl)
    }
    return Object.entries(cats)
  })

  function toolConfigValues(name: string): Record<string, unknown> {
    const v = config[name]
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  }

  function knobValue(tl: ToolInfo, knob: ToolConfig): string {
    const v = toolConfigValues(tl.name)[knob.name]
    return v == null ? '' : String(v)
  }

  function knobSet(tl: ToolInfo, knob: ToolConfig): boolean {
    return knobValue(tl, knob) !== ''
  }

  function requiredMissing(tl: ToolInfo): boolean {
    const vals = toolConfigValues(tl.name)
    return tl.requiredConfig.some(name => {
      const v = vals[name]
      return v == null || String(v) === ''
    })
  }

  /** A knob counts as configured only when its value is non-empty (an
   *  explicitly unset knob is stored as '' and must read as "needs config"). */
  function hasAnyConfig(tl: ToolInfo): boolean {
    return Object.values(toolConfigValues(tl.name)).some(v => v != null && String(v) !== '')
  }
</script>

<div class="h-full w-full p-4">
  {#if loading}
    <div class="flex justify-center py-8">
      <span class="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"></span>
    </div>
  {:else if tools.length === 0}
    <p class="py-2 text-center text-meta text-muted-foreground">{t('noTools')}</p>
  {:else}
    <p class="mb-2 text-micro text-muted-foreground">{t('toolsReadOnlyHint')}</p>
    {#each categories as [cat, list] (cat)}
      <div class="mt-3 first:mt-0 mb-1 text-micro font-semibold tracking-wider text-muted-foreground uppercase">{cat}</div>
      {#each list as tl (tl.name)}
        {@const knobs = tl.config ?? []}
        {@const hasConfig = hasAnyConfig(tl)}
        {@const req = requiredMissing(tl)}
        <div class="mb-2 rounded-md border border-border bg-card">
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            onclick={() => (expanded = expanded === tl.name ? null : tl.name)}
          >
            <span class="min-w-0 flex-1 truncate font-mono text-meta">{tl.name}</span>
            {#if knobs.length === 0}
              <span class="text-micro text-muted-foreground">{t('noConfig')}</span>
            {:else}
              <span class="text-micro {req ? 'text-destructive' : hasConfig ? 'text-success' : 'text-warning'}">
                {req ? t('requiredConfig') : hasConfig ? t('configured') : t('needsConfig')}
              </span>
            {/if}
            <span class="text-micro text-muted-foreground">{#if expanded === tl.name}<AppIcons.chevron_down class="size-3" />{:else}<AppIcons.chevron_right class="size-3" />{/if}</span>
          </button>

          {#if expanded === tl.name}
            <div class="space-y-3 border-t border-border/60 px-3 py-3">
              {#if tl.description}
                <p class="text-micro text-muted-foreground">{tl.description}</p>
              {/if}

              {#if knobs.length > 0}
                <div>
                  <div class="mb-1 text-micro font-semibold text-muted-foreground">{t('requiredConfigTitle')}</div>
                  <div class="space-y-1">
                    {#each knobs as knob (knob.name)}
                      {@const set = knobSet(tl, knob)}
                      {@const required = tl.requiredConfig.includes(knob.name)}
                      <div class="flex items-center gap-2 text-micro">
                        <AppIcons.circle class="size-2.5 shrink-0 {set ? 'text-success' : required ? 'text-destructive' : 'text-muted-foreground'}" />
                        <span class="shrink-0 font-mono">{knob.name}</span>
                        {#if required}<span class="shrink-0 text-destructive">*</span>{/if}
                        <span class="min-w-0 flex-1 truncate text-muted-foreground">
                          {set ? knobValue(tl, knob) : t('unset')}
                        </span>
                        <span class="shrink-0 text-muted-foreground">
                          {#if knob.kind === 'model'}{t('kindModel')} · {knob.capability}{:else}{knob.type}{/if}
                        </span>
                      </div>
                    {/each}
                  </div>
                  <p class="mt-1 text-micro text-muted-foreground">{t('editInExtensions')}</p>
                </div>
              {/if}

              {#if tl.parameters && Object.keys(tl.parameters).length}
                <div class="rounded-sm border border-border/40 p-2">
                  <div class="mb-1 text-micro font-semibold text-muted-foreground">{t('toolParams')}</div>
                  <div class="space-y-1">
                    {#each parseToolParams(tl.parameters) as p (p.name)}
                      <div class="flex gap-2 text-micro">
                        <span class="font-mono">{p.name}{p.required ? ' *' : ''}</span>
                        <span class="text-muted-foreground">{p.type}</span>
                        {#if p.description}
                          <span class="min-w-0 flex-1 truncate text-muted-foreground">{p.description}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/each}
  {/if}
</div>
