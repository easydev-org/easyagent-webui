<script lang="ts">
  // ToolPicker — pick a preset's tool whitelist, GROUPED BY EXTENSION. A tool
  // whose bare name collides across extensions is addressed as `<extId>.<name>`
  // (the value shown in parens) so exactly one extension's tool is selected.
  import type { ToolInfo } from '$lib/models'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '$lib/utils'
  import type { ToolEffect } from '$lib/models'
  import {
    canonicalizeSelection,
    disqualifiedByConfig,
    groupByExtension,
    isColliding,
    toolIneligible,
    toolValue,
  } from '$lib/tool-selection'
  import { Switch } from '$lib/components/ui/switch'

  let {
    tools,
    config,
    selected = $bindable(new Set<string>()),
  }: {
    tools: ToolInfo[]
    /**
     * The aggregate `{toolName: {knob: value}}` config map, so a tool whose REQUIRED config is unmet
     * is disabled (it cannot run).
     *
     * UNDEFINED MEANS "NOT LOADED", AND IS NOT THE SAME AS `{}`. Omitted, nothing is disabled — the
     * picker does not know the config and must not pretend a blank one. It used to default to `{}`,
     * and combined with an unconditional prune below that DELETED every configured tool from a stored
     * whitelist the moment the panel opened. Callers pass `undefined` while loading, or when the
     * fetch failed, and the picker stays neutral.
     */
    config?: Record<string, unknown>
    selected?: Set<string>
  } = $props()

  const eligible = (tl: ToolInfo) => toolIneligible(tl, config) === null

  // Canonicalize the STORED whitelist for DISPLAY only: an entry that predates
  // the collision-aware form (`<extId>.<name>`) must still highlight the right
  // tool. This is a pure derived — it must NOT write back to `selected`, or it
  // would read and write the same state and loop forever
  // (`effect_update_depth_exceeded`, thrown on mount). Writes happen only in the
  // user actions below, each seeding the next set from this canonical view.
  const canonical = $derived(canonicalizeSelection(tools, [...selected]))

  const groups = $derived(groupByExtension(tools))
  const valueOf = (tl: ToolInfo) => toolValue(tools, tl)
  const allOn = $derived(
    tools.length > 0 && tools.filter(eligible).every(tl => canonical.has(valueOf(tl))),
  )

  function toggle(v: string, on: boolean) {
    if (on) {
      const tl = tools.find(t => valueOf(t) === v)
      if (tl && !eligible(tl)) return // a tool with unmet required config cannot run
    }
    const next = new Set(canonical)
    if (on) next.add(v)
    else next.delete(v)
    selected = next
  }

  function toggleGroup(list: ToolInfo[], on: boolean) {
    const next = new Set(canonical)
    for (const tl of list) {
      if (on && !eligible(tl)) continue // skip ineligible tools
      const v = valueOf(tl)
      if (on) next.add(v)
      else next.delete(v)
    }
    selected = next
  }

  // ONLY A REAL, FETCHED CONFIG MAY DISQUALIFY ANYTHING.
  //
  // This used to prune whenever a selected tool looked ineligible, and `config` defaulted to `{}` —
  // so on mount, before any config was fetched, every tool with a required knob counted as unmet and
  // was removed from `selected`. The panel then wrote that pruned set back on save: opening a preset
  // to look at it silently dropped its configured tools. `disqualifiedByConfig` returns nothing for
  // an unknown config, and the effect only writes when it names something.
  $effect(() => {
    const stale = disqualifiedByConfig(tools, canonical, config).filter(v => canonical.has(v))
    if (stale.length === 0) return
    const next = new Set(canonical)
    for (const v of stale) next.delete(v)
    selected = next
  })

  /**
   * effectClass colours the effect chip by how much it can disturb.
   *
   * `medium` and `high` are the two that confirm before running, so they are the two that must be visible
   * at a glance; `none` and `low` stay muted so the eye lands on what matters.
   */
  function effectClass(e: ToolEffect): string {
    switch (e) {
      case 'high':
        return 'bg-destructive/15 text-destructive'
      case 'medium':
        return 'bg-warning/15 text-warning'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  function toggleAll(on: boolean) {
    selected = on ? new Set(tools.filter(eligible).map(valueOf)) : new Set()
  }
</script>

<div>
  <div class="mb-2 flex items-center gap-2">
    <span class="text-meta font-semibold">{t('tools')} · {canonical.size}</span>
    <button
      type="button"
      class="ml-auto text-micro text-primary hover:underline"
      onclick={() => toggleAll(!allOn)}>{allOn ? t('clearAll') : t('selectAll')}</button
    >
  </div>

  <div class="max-h-72 space-y-3 overflow-y-auto rounded-md border border-border p-2">
    {#each groups as g (g.extId)}
      {@const allOnGroup = g.tools.every(tl => canonical.has(valueOf(tl)))}
      <div>
        <div class="mb-1 flex items-center gap-2">
          <span
            class="font-mono text-micro font-semibold tracking-wider text-muted-foreground uppercase"
            >{g.extId}</span
          >
          <span class="text-micro text-muted-foreground">· {g.tools.length}</span>
          <button
            type="button"
            class="ml-auto text-micro text-primary hover:underline"
            onclick={() => toggleGroup(g.tools, !allOnGroup)}
            >{allOnGroup ? t('clearAll') : t('selectAll')}</button
          >
        </div>
        <div class="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {#each g.tools as tl (valueOf(tl))}
            {@const v = valueOf(tl)}
            {@const ok = eligible(tl)}
            <label
              class={cn(
                'flex items-center gap-2 rounded px-1.5 py-1',
                ok ? 'cursor-pointer hover:bg-muted' : 'cursor-not-allowed opacity-50',
              )}
              title={ok ? tl.description : t('toolNeedsConfig')}
            >
              <Switch checked={canonical.has(v)} disabled={!ok} onchange={on => toggle(v, on)} />
              <!--
                THE EFFECT IS SHOWN NEXT TO THE NAME because "what does this do" is the question a user
                asks when granting a preset wholesale. A destructive tool inside a group of twenty reads
                exactly like the harmless ones otherwise, and the description is a hover away.
              -->
              <span class="min-w-0 flex-1 truncate font-mono text-micro">{tl.name}</span>
              {#if tl.effect}
                <span
                  class={cn(
                    'shrink-0 rounded px-1 py-px text-[9px] leading-none',
                    effectClass(tl.effect),
                  )}
                  title={t('toolEffectHint')}>{tl.effect}</span
                >
              {/if}
              {#if isColliding(tools, tl.name)}
                <span class="shrink-0 text-micro text-warning" title={t('collisionNote')}
                  >({g.extId})</span
                >
              {/if}
              {#if tl.requiredConfig.length > 0}
                <span
                  class="shrink-0 text-micro {ok ? 'text-muted-foreground' : 'text-destructive'}"
                  title={ok ? t('requiredConfig') : t('toolNeedsConfig')}>*</span
                >
              {/if}
            </label>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
