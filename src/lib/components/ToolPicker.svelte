<script lang="ts">
  // ToolPicker — pick a preset's tool whitelist, GROUPED BY EXTENSION. A tool
  // whose bare name collides across extensions is addressed as `<extId>.<name>`
  // (the value shown in parens) so exactly one extension's tool is selected.
  import type { ToolInfo } from '$lib/models'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '$lib/utils'
  import {
    canonicalizeSelection,
    groupByExtension,
    isColliding,
    toolValue,
  } from '$lib/tool-selection'
  import { Switch } from '$lib/components/ui/switch'

  let {
    tools,
    selected = $bindable(new Set<string>()),
  }: {
    tools: ToolInfo[]
    selected?: Set<string>
  } = $props()

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
    tools.length > 0 && tools.every(tl => canonical.has(valueOf(tl))),
  )

  function toggle(v: string, on: boolean) {
    const next = new Set(canonical)
    if (on) next.add(v)
    else next.delete(v)
    selected = next
  }

  function toggleGroup(list: ToolInfo[], on: boolean) {
    const next = new Set(canonical)
    for (const tl of list) {
      const v = valueOf(tl)
      if (on) next.add(v)
      else next.delete(v)
    }
    selected = next
  }

  function toggleAll(on: boolean) {
    selected = on ? new Set(tools.map(valueOf)) : new Set()
  }
</script>

<div>
  <div class="mb-2 flex items-center gap-2">
    <span class="text-meta font-semibold">{t('tools')} · {canonical.size}</span>
    <button
      type="button"
      class="ml-auto text-micro text-primary hover:underline"
      onclick={() => toggleAll(!allOn)}
    >{allOn ? t('clearAll') : t('selectAll')}</button>
  </div>

  <div class="max-h-72 space-y-3 overflow-y-auto rounded-md border border-border p-2">
    {#each groups as g (g.extId)}
      {@const allOnGroup = g.tools.every(tl => canonical.has(valueOf(tl)))}
      <div>
        <div class="mb-1 flex items-center gap-2">
          <span class="font-mono text-micro font-semibold tracking-wider text-muted-foreground uppercase">{g.extId}</span>
          <span class="text-micro text-muted-foreground">· {g.tools.length}</span>
          <button
            type="button"
            class="ml-auto text-micro text-primary hover:underline"
            onclick={() => toggleGroup(g.tools, !allOnGroup)}
          >{allOnGroup ? t('clearAll') : t('selectAll')}</button>
        </div>
        <div class="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {#each g.tools as tl (valueOf(tl))}
            {@const v = valueOf(tl)}
            <label
              class={cn(
                'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted',
                tl.requiredConfig.length > 0 && 'text-muted-foreground',
              )}
              title={tl.description}
            >
              <Switch checked={canonical.has(v)} onchange={on => toggle(v, on)} />
              <span class="min-w-0 flex-1 truncate font-mono text-micro">{tl.name}</span>
              {#if isColliding(tools, tl.name)}
                <span class="shrink-0 text-micro text-warning" title={t('collisionNote')}>({g.extId})</span>
              {/if}
              {#if tl.requiredConfig.length > 0}
                <span class="shrink-0 text-micro text-destructive" title={t('requiredConfig')}>*</span>
              {/if}
            </label>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
