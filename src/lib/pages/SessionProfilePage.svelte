<script lang="ts">
  // SessionProfilePage — the session's own page, shaped like a contact card.
  //
  // IT REPLACED TWO DIALOGS: a read-only "session info" sheet whose only action was "Edit", and a
  // settings dialog that opened on top of it. Two steps to change one field, and neither could show
  // the picture it was letting you pick.
  //
  // A PAGE, NOT A DIALOG, because this is somewhere you go rather than a decision you take. The IM
  // shape is deliberate: a header with the picture, then the fields, then the actions — the same
  // layout a chat app puts a contact behind, so "how do I change this session's picture" is answered
  // by the thing the picture itself is.
  //
  // THE CHAT BUTTON IS THE WAY BACK INTO THE CONVERSATION. Reaching this page FROM the chat leaves the
  // chat underneath on a wide screen and replaces it on a compact one, so the header carries an
  // explicit "chat" action that opens the session rather than relying on Back: back returns to
  // wherever the reader came from, which is not necessarily the conversation.
  import type { PageProps } from '$lib/page-props'
  import { t } from '$lib/i18n.svelte'
  import { showErrorToast, showToast } from '$lib/toast.svelte'
  import { Prefs } from '$lib/prefs'
  import { guessMime } from '$lib/media'
  import { modelRefOf, sessionName } from '$lib/models'
  import type { ModelInfo, Session } from '$lib/models'
  import { buildModelOptions, variantsFor } from '$lib/chat-helpers'
  import { draftFromSession, isDirty, settingsPatch, type ProfileDraft } from '$lib/session-profile'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'
  import ChatAvatar from '$lib/components/ChatAvatar.svelte'
  import { Select } from '$lib/components/ui/select'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { AppIcons } from '$lib/icons'

  let { store }: PageProps = $props()

  // THE SESSION IS READ FROM THE STORE, which the list stream keeps current: editing here and then
  // watching the row update is what makes the page feel attached to the app rather than a form
  // floating beside it.
  const session = $derived<Session | null>(store.activeSession)
  const sid = $derived(store.activeSessionId ?? '')

  const fallbackLocale = Prefs.loadAgentLocale()

  let draft = $state<ProfileDraft>({
    name: '',
    model: '',
    variant: '',
    preset: '',
    locale: fallbackLocale,
    avatarFile: '',
    intro: '',
  })

  let allModels = $state<ModelInfo[]>([])
  let presetOptions = $state<string[]>([])
  let loadingModels = $state(false)
  let saving = $state(false)
  let uploadingAvatar = $state(false)

  // SEEDED ONCE PER SESSION, not on every store update: the session row changes whenever the agent
  // writes a message, and re-seeding would throw away whatever the user had typed.
  let seededFor = $state('')

  $effect(() => {
    const s = session
    if (!s || seededFor === s.id) return
    seededFor = s.id
    draft = draftFromSession(s, fallbackLocale)
  })

  $effect(() => {
    void (async () => {
      try {
        presetOptions = (await store.api.presets()).map(p => p.id)
      } catch {
        /* presets are optional: a deployment may define none */
      }
    })()
  })

  // MODELS ARE LOADED LAZILY, once, on first use: the catalogue is one call per provider and this
  // page is not on the path of sending a message.
  $effect(() => {
    if (!session || allModels.length > 0 || loadingModels) return
    void (async () => {
      loadingModels = true
      const out: ModelInfo[] = []
      try {
        const provs = await store.api.providers()
        for (const pid of Object.keys(provs)) {
          try {
            out.push(...(await store.api.models(pid)))
          } catch {
            /* one provider's failure must not empty the picker */
          }
        }
      } catch (e) {
        showErrorToast(String(e))
      }
      allModels = out
      loadingModels = false
    })()
  })

  const modelOptions = $derived(buildModelOptions(allModels, draft.model))
  const variants = $derived(variantsFor(allModels, draft.model))
  const dirty = $derived(session ? isDirty(draft, session, fallbackLocale) : false)

  $effect(() => {
    // A variant belongs to a model; switching models must not carry "high" onto one without it.
    if (variants.length && !variants.some(v => v.id === draft.variant)) draft.variant = ''
    if (!variants.length && draft.variant) draft.variant = ''
  })

  function pickAvatar() {
    if (!session || uploadingAvatar) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      void (async () => {
        uploadingAvatar = true
        try {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const done = await store.api.uploadFile({
            path: '',
            name: file.name || 'avatar',
            mimeType: file.type || guessMime(file.name),
            bytes,
          })
          draft.avatarFile = `file:${done.code}`
        } catch (e) {
          showErrorToast(String(e))
        } finally {
          uploadingAvatar = false
        }
      })()
    }
    input.click()
  }

  async function save() {
    if (!session || !sid || saving) return
    saving = true
    try {
      const updated = await store.api.settings(sid, settingsPatch(draft))
      store.applySession(updated)
      seededFor = updated.id
      draft = draftFromSession(updated, fallbackLocale)
      showToast(t('saved'))
    } catch (e) {
      showErrorToast(String(e))
    } finally {
      saving = false
    }
  }

  function openChat() {
    if (sid) store.pickSession(sid)
  }
</script>

<!-- ONE COLUMN, TOP TO BOTTOM. The Shell wraps every page in a `flex` ROW, so a page with several
     sibling roots lays them out sideways. A single flex-col root is what keeps the header above the
     content. -->
<div class="flex h-full min-h-0 w-full min-w-0 flex-col">
  <PageHeader title={t('sessionProfile')} onBack={() => store.popPage()}>
    {#snippet right()}
      <!-- THE WAY BACK TO THE CONVERSATION, explicitly. Back returns to wherever the reader came
           from — the list, a search, another page — which is not necessarily this session's chat. -->
      <button
        type="button"
        class="rounded p-1.5 text-primary hover:bg-muted disabled:opacity-40"
        title={t('openChat')}
        aria-label={t('openChat')}
        disabled={!sid}
        onclick={openChat}
      >
        <AppIcons.chat class="size-[18px]" />
      </button>
    {/snippet}
  </PageHeader>

  {#if !session}
    <p class="p-4 text-meta text-muted-foreground">{t('sessionProfileNoSession')}</p>
  {:else}
    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- THE CARD: picture, name, one-line intro. The intro is editable here rather than shown as
           text because this is the page's own subject, and a read-only line followed by an identical
           input below it would be two controls for one value. -->
      <section class="flex flex-col items-center gap-3 border-b border-border px-4 py-6">
        <button
          type="button"
          class="group relative rounded-full"
          title={t('avatarChoose')}
          aria-label={t('avatarChoose')}
          disabled={uploadingAvatar}
          onclick={pickAvatar}
        >
          <ChatAvatar
            seed={session.id}
            avatar={draft.avatarFile}
            size={96}
            label={sessionName(session)}
            fetchBytes={store.api.fetchFileBytes.bind(store.api)}
          />
          <span
            class="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {#if uploadingAvatar}
              <span class="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
              ></span>
            {:else}
              <AppIcons.edit class="size-6" />
            {/if}
          </span>
        </button>

        <div class="text-center">
          <div class="text-base font-semibold break-all">{sessionName(session)}</div>
          <div class="mt-0.5 font-mono text-micro text-muted-foreground">{session.id}</div>
        </div>

        {#if draft.avatarFile}
          <button
            type="button"
            class="text-micro text-muted-foreground hover:text-destructive"
            onclick={() => (draft.avatarFile = '')}
          >
            {t('avatarRemove')}
          </button>
        {/if}
      </section>

      <div class="space-y-4 p-4">
        <label class="block">
          <span class="mb-1 block text-meta font-medium text-muted-foreground"
            >{t('introLabel')}</span
          >
          <Textarea bind:value={draft.intro} rows={2} placeholder={t('introPlaceholder')} />
          <span class="mt-1 block text-micro text-muted-foreground">{t('introHint')}</span>
        </label>

        <label class="block">
          <span class="mb-1 block text-meta font-medium text-muted-foreground"
            >{t('modelLabel')}</span
          >
          <Select
            bind:value={draft.model}
            placeholder={loadingModels ? t('loading') : t('none')}
            items={modelOptions}
          />
        </label>

        {#if variants.length}
          <label class="block">
            <span class="mb-1 block text-meta font-medium text-muted-foreground"
              >{t('variantLabel')}</span
            >
            <Select
              bind:value={draft.variant}
              items={[
                { value: '', label: t('variantNone') },
                ...variants.map(v => ({ value: v.id, label: v.name || v.id })),
              ]}
            />
          </label>
        {/if}

        <label class="block">
          <span class="mb-1 block text-meta font-medium text-muted-foreground"
            >{t('presetLabel')}</span
          >
          <Select
            bind:value={draft.preset}
            items={presetOptions.map(id => ({ value: id, label: id }))}
          />
        </label>

        <label class="block">
          <span class="mb-1 block text-meta font-medium text-muted-foreground"
            >{t('agentLocale')}</span
          >
          <Select
            bind:value={draft.locale}
            items={[
              { value: 'zh', label: '中文' },
              { value: 'en', label: 'English' },
            ]}
          />
        </label>
      </div>
    </div>

    <!-- THE ACTION BAR STAYS PUT. Saving is about the whole card, so it must be reachable without
         scrolling back past six fields; and a disabled Save is what tells the reader that nothing
         has changed yet. -->
    <div class="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
      <button
        type="button"
        class="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        onclick={() => {
          if (session) draft = draftFromSession(session, fallbackLocale)
        }}
        disabled={!dirty || saving}>{t('reset')}</button
      >
      <button
        type="button"
        class="ml-auto rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/80 disabled:opacity-40"
        disabled={!dirty || saving}
        onclick={() => void save()}
      >
        {saving ? t('saving') : t('save')}
      </button>
    </div>
  {/if}
</div>
