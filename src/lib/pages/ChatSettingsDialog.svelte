<script lang="ts">
  // ChatSettingsDialog — model / variant / preset / locale pickers for the open
  // session, plus its picture and one-line intro. Purely presentational: the
  // parent owns the loads, the upload and the save.
  import { t } from '$lib/i18n.svelte'
  import { Select } from '$lib/components/ui/select'
  import { Dialog } from '$lib/components/ui/dialog'
  import ChatAvatar from '$lib/components/ChatAvatar.svelte'
  import type { ModelVariantInfo } from '$lib/models'

  let {
    open = $bindable(false),
    selectedRef = $bindable(''),
    variant = $bindable(''),
    preset = $bindable(''),
    locale = $bindable(''),
    avatarFile = $bindable(''),
    intro = $bindable(''),
    /** Seed for the identicon shown when the session has no picture. */
    seed = '',
    loadingModels,
    modelOptions,
    variants,
    presetOptions,
    fetchBytes,
    onPickAvatar,
    onSave,
  }: {
    open: boolean
    selectedRef: string
    variant: string
    preset: string
    locale: string
    avatarFile: string
    intro: string
    seed: string
    loadingModels: boolean
    modelOptions: Array<{ value: string; label: string }>
    variants: ModelVariantInfo[]
    presetOptions: string[]
    fetchBytes?: (code: string) => Promise<Uint8Array>
    /** Opens a file picker and uploads; the parent sets `avatarFile`. */
    onPickAvatar: () => void
    onSave: () => void
  } = $props()
</script>

<Dialog bind:open title={t('settingsTitle')}>
  {#snippet children()}
    <div class="space-y-3">
      <!-- THE PICTURE IS PART OF THE SESSION, so it is edited here rather than in a profile page of
           its own. "Remove" sets the value to '' rather than hiding the control: clearing is how a
           session goes back to the derived identicon, and a hidden button would make that look like
           an unsupported state. -->
      <div class="flex items-center gap-3">
        <ChatAvatar {seed} avatar={avatarFile} {fetchBytes} size={48} />
        <div class="flex flex-col items-start gap-1">
          <span class="text-meta text-muted-foreground">{t('avatarLabel')}</span>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-md border border-border px-2 py-1 text-micro hover:bg-muted"
              onclick={onPickAvatar}>{t('avatarChoose')}</button
            >
            {#if avatarFile}
              <button
                type="button"
                class="rounded-md px-2 py-1 text-micro text-muted-foreground hover:bg-muted"
                onclick={() => (avatarFile = '')}>{t('avatarRemove')}</button
              >
            {/if}
          </div>
        </div>
      </div>
      <label class="block">
        <span class="mb-1 block text-meta text-muted-foreground">{t('introLabel')}</span>
        <textarea
          bind:value={intro}
          rows="2"
          placeholder={t('introPlaceholder')}
          class="w-full resize-none rounded-md border border-border bg-transparent px-2 py-1.5 text-meta outline-none focus:border-primary"
        ></textarea>
      </label>
      <label class="block">
        <span class="mb-1 block text-meta text-muted-foreground">{t('modelLabel')}</span>
        <Select
          bind:value={selectedRef}
          placeholder={loadingModels ? t('loading') : t('none')}
          items={modelOptions}
        />
      </label>
      {#if variants.length}
        <label class="block">
          <span class="mb-1 block text-meta text-muted-foreground">{t('variantLabel')}</span>
          <Select
            bind:value={variant}
            items={[
              { value: '', label: t('variantNone') },
              ...variants.map(v => ({ value: v.id, label: v.name || v.id })),
            ]}
          />
        </label>
      {/if}
      <label class="block">
        <span class="mb-1 block text-meta text-muted-foreground">{t('presetLabel')}</span>
        <Select bind:value={preset} items={presetOptions.map(id => ({ value: id, label: id }))} />
      </label>
      <label class="block">
        <span class="mb-1 block text-meta text-muted-foreground">{t('agentLocale')}</span>
        <Select
          bind:value={locale}
          items={[
            { value: 'zh', label: '中文' },
            { value: 'en', label: 'English' },
          ]}
        />
      </label>
      <p class="text-micro text-muted-foreground">{t('turnsByPreset')}</p>
      <p class="text-micro text-muted-foreground">{t('sysPromptByPreset')}</p>
    </div>
  {/snippet}
  {#snippet footer()}
    <button
      type="button"
      class="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
      onclick={() => (open = false)}>{t('cancel')}</button
    >
    <button
      type="button"
      class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/80"
      onclick={onSave}>{t('save')}</button
    >
  {/snippet}
</Dialog>
