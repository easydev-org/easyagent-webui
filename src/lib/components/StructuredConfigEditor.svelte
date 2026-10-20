<script lang="ts">
  // Editor for a STRUCTURED config knob (type list/object with a declared
  // `fields` shape).
  //
  // Why it exists: such a knob used to be one `json` textarea, so every user
  // hand-wrote things like
  //   [{"name":"w1","url":"http://worker:80","token":"..."}]
  // and a typo surfaced only when a tool ran. Here the shape drives the UI:
  // one card per list item with a "+" to add, a picker for an enum field, a
  // masked input for a per-field secret, and a URL-ish keyboard for format: uri.
  //
  // The component owns only PRESENTATION. Validation is the server's job (it has
  // the same schema), so bypassing this UI cannot save a malformed value.
  import type { ConfigFieldSchema } from '$lib/models'
  import { t } from '$lib/i18n.svelte'
  import { AppIcons } from '$lib/icons'

  interface Props {
    fields: ConfigFieldSchema[]
    itemType?: string
    minItems?: number
    maxItems?: number
    /** 'list' renders repeatable cards; 'object' renders one card. */
    mode: 'list' | 'object'
    /** The current value: an array (list) or a record (object). */
    value: unknown
    /** Emitted with the new value on every edit. */
    onchange: (next: unknown) => void
  }
  let { fields, itemType = 'object', minItems = 0, maxItems = 0, mode, value, onchange }: Props = $props()

  /** Rows are always objects here: a scalar list still becomes {value: "..."}. */
  type Row = Record<string, unknown>

  function asRows(): Row[] {
    if (mode === 'object') {
      const o = (value ?? {}) as Row
      return [o]
    }
    const v = Array.isArray(value) ? (value as Row[]) : []
    return v
  }

  /** Effective fields: for a scalar list, one synthetic "value" field. */
  const schema = $derived<ConfigFieldSchema[]>(fields.length ? fields : [{ name: 'value', type: itemType || 'string', kind: 'value', format: '', enumValues: [], required: false, description: '' }])

  function emit(rows: Row[]) {
    onchange(mode === 'object' ? (rows[0] ?? {}) : rows)
  }

  function blankRow(): Row {
    const r: Row = {}
    for (const f of schema) r[f.name] = f.defaultValue ?? (f.type === 'boolean' ? false : '')
    return r
  }

  function addRow() {
    if (maxItems > 0 && asRows().length >= maxItems) return
    emit([...asRows(), blankRow()])
  }

  function removeRow(i: number) {
    const rows = [...asRows()]
    rows.splice(i, 1)
    emit(rows)
  }

  function setField(i: number, name: string, v: unknown) {
    const rows = [...asRows()]
    rows[i] = { ...rows[i], [name]: v }
    emit(rows)
  }

  const rows = $derived(asRows())
  const canAdd = $derived(maxItems > 0 ? rows.length < maxItems : true)
  const canRemove = $derived(mode === 'list' && rows.length > minItems)

  /**
   * A short placeholder per format, so an empty field still says what it wants.
   * (The server validates the real value; this is only a hint.)
   */
  function formatHint(format: string): string {
    switch (format) {
      case 'uri':
        return 'https://…'
      case 'host':
        return 'example.com'
      case 'path':
        return '/var/lib/…'
      case 'email':
        return 'a@b.c'
      case 'duration':
        return '30s'
      case 'semver':
        return '1.2.3'
      default:
        return ''
    }
  }
</script>

<div class="space-y-2">
  {#each rows as row, i (i)}
    <div class="rounded-md border border-border bg-card/40 p-2.5">
      {#if mode === 'list'}
        <div class="mb-1.5 flex items-center justify-between">
          <span class="text-micro text-muted-foreground">{t('structItem').replace('N', String(i + 1))}</span>
          {#if canRemove}
            <button
              type="button"
              class="text-destructive hover:opacity-70"
              title={t('structRemove')}
              onclick={() => removeRow(i)}
            ><AppIcons.delete class="size-3.5" /></button>
          {/if}
        </div>
      {/if}
      <div class="space-y-2">
        {#each schema as f (f.name)}
          <label class="block">
            <span class="mb-0.5 flex items-center gap-1 text-micro">
              <span class="font-mono">{f.name}</span>
              {#if f.required}<span class="text-destructive">*</span>{/if}
              {#if f.description}
                <span class="truncate text-muted-foreground">— {f.description}</span>
              {/if}
            </span>
            {#if f.type === 'enum' && f.enumValues.length}
              <!-- enum: a fixed set, so a picker — never free text. -->
              <select
                class="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                value={String(row[f.name] ?? '')}
                onchange={e => setField(i, f.name, e.currentTarget.value)}
              >
                <option value="">—</option>
                {#each f.enumValues as ev (ev)}
                  <option value={ev}>{ev}</option>
                {/each}
              </select>
            {:else if f.type === 'boolean'}
              <select
                class="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                value={String(row[f.name] ?? '')}
                onchange={e => setField(i, f.name, e.currentTarget.value === 'true')}
              >
                <option value="">—</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            {:else if f.kind === 'secret'}
              <!-- A per-field secret: masked, and the server never echoes it. -->
              <input
                type="password"
                autocomplete="new-password"
                class="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                value={String(row[f.name] ?? '')}
                placeholder={row[f.name] ? '••••••••' : t('secretNotSet')}
                oninput={e => setField(i, f.name, e.currentTarget.value)}
              />
            {:else}
              <input
                type={f.type === 'number' ? 'number' : 'text'}
                inputmode={f.format === 'uri' ? 'url' : undefined}
                class="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
                value={String(row[f.name] ?? '')}
                placeholder={f.defaultValue ?? formatHint(f.format)}
                oninput={e => setField(i, f.name, f.type === 'number' ? Number(e.currentTarget.value) : e.currentTarget.value)}
              />
            {/if}
          </label>
        {/each}
      </div>
    </div>
  {/each}

  {#if mode === 'list' && canAdd}
    <button
      type="button"
      class="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-meta text-muted-foreground hover:bg-muted"
      onclick={addRow}
    ><AppIcons.add class="size-3.5" />{t('structAdd')}</button>
  {/if}
</div>

