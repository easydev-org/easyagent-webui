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
  import { buildModelOptions } from '$lib/chat-helpers'
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
  /**
   * THE SELECTED MODEL'S VARIANTS, loaded on their own.
   *
   * The variant picker used to derive from `allModels`, which only fills once EVERY provider has answered — so
   * the field appeared seconds after the rest of the page, and the card visibly changed shape while the reader
   * was looking at it. A variant belongs to one model, so one provider's answer is enough, and it is fetched
   * first: the field is there when the page is.
   */
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

  // MODELS ARE LOADED LAZILY, once, for the MODEL PICKER ONLY.
  //
  // THE REASONING FIELD NO LONGER WAITS FOR THIS. It offers the same four choices for every model, because a
  // variant is a value the turn merges into the request body and whether the provider acts on it is the
  // provider's business — so making the field depend on a catalogue answer was a dependency that bought
  // nothing and cost a visible layout shift on every visit.
  //
  // The providers are still fetched in parallel: the picker is the only thing waiting, and one slow provider
  // should not hold up the rest.
  $effect(() => {
    if (!session || allModels.length > 0 || loadingModels) return
    void (async () => {
      loadingModels = true
      const out: ModelInfo[] = []
      try {
        const provs = await store.api.providers()
        const pids = Object.keys(provs)

        const answers = await Promise.all(
          pids.map(pid =>
            store.api.models(pid).catch(() => {
              // ONE PROVIDER'S FAILURE MUST NOT EMPTY THE PICKER.
              return [] as ModelInfo[]
            }),
          ),
        )
        for (const models of answers) out.push(...models)
      } catch (e) {
        showErrorToast(String(e))
      }
      allModels = out
      loadingModels = false
    })()
  })

  const modelOptions = $derived(buildModelOptions(allModels, draft.model))
  const dirty = $derived(session ? isDirty(draft, session, fallbackLocale) : false)

  /**
   * THE REASONING CHOICES ARE A CONSTANT, NOT A PROPERTY OF THE MODEL.
   *
   * Four entries, always: "default" (the empty id — the absence of a choice) and the three levels the backend
   * accepts. Nothing is fetched to know this, so the field is in the page's FIRST PAINT.
   *
   * A MODEL THAT DOES NOT REASON IGNORES THE VALUE. That is a provider's business; hiding the control until a
   * catalogue answered made the page grow a row a second after it rendered, which is what the reader noticed.
   *
   * "default" IS `''` because that is what the wire treats as "no variant": the backend sends nothing, and the
   * provider applies its own default. A separate "default" id would be a fourth value the model has to interpret.
   */
  /**
   * THE SELECT HAS NO EMPTY OPTION, so "default" needs a real value.
   *
   * This component treats `''` as NOTHING SELECTED and renders its placeholder — which is why the field read
   * blank while the session was on its default. `DEFAULT_LEVEL` is the value the control shows; it is mapped back
   * to `''` on the way to the server, because `''` is what the wire and the store mean by "no variant".
   */
  const DEFAULT_LEVEL = 'default'
  const REASONING_VARIANTS: { id: string; name: string }[] = [
    { id: DEFAULT_LEVEL, name: '' },
    { id: 'low', name: 'low' },
    { id: 'medium', name: 'medium' },
    { id: 'high', name: 'high' },
  ]

  /** The level the SELECT shows for a stored variant ('' → the default entry). */
  const shownLevel = $derived(draft.variant || DEFAULT_LEVEL)

  /** The level to STORE for a SELECT value ('default' → '', which is what "no variant" is). */
  function storedLevel(shown: string): string {
    return shown === DEFAULT_LEVEL ? '' : shown
  }

  /**
   * A SAVED LEVEL IS PRUNED ONLY WHEN IT IS NO LONGER OFFERED.
   *
   * The stored value comes from the database and may predate a level being withdrawn. Clearing it unconditionally
   * on mount — which an earlier version did while the catalogue was still empty — turned a session's "high" into
   * "default" and the next Save wrote that loss back.
   */
  const knownLevels = new Set(['low', 'medium', 'high'])
  $effect(() => {
    // A STORED LEVEL THAT IS NO LONGER OFFERED is cleared, so the saved value can never be one the picker cannot
    // show. `''` is fine — it is the default.
    if (draft.variant && !knownLevels.has(draft.variant)) draft.variant = ''
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
          <!-- THE PLACEHOLDER IS THE "NO MODEL" STATE, and it is reachable: an empty value both displays as the
               placeholder and writes NULL, so a model picked by accident can be undone. -->
          <Select
            bind:value={draft.model}
            placeholder={loadingModels ? t('loading') : t('modelNone')}
            disabled={loadingModels}
            items={modelOptions}
          />
        </label>

        <!-- ALWAYS PRESENT, WITH A FIXED SET OF CHOICES.
             This used to be wrapped in `{#if variants.length}`, so the page rendered WITHOUT the field and grew a
             row when a model catalogue answered — the visible jump this page was known for, and a dependency
             that bought nothing: the choices are the same for every model.

             "Default" is the empty value, and it is listed first because it is the state a session is in until
             someone chooses otherwise. -->
        <label class="block">
          <span class="mb-1 block text-meta font-medium text-muted-foreground"
            >{t('variantLabel')}</span
          >
          <Select
            value={shownLevel}
            onchange={v => (draft.variant = storedLevel(v))}
            items={REASONING_VARIANTS.map(v => ({
              value: v.id,
              label: v.id === DEFAULT_LEVEL ? t('variantNone') : v.name,
            }))}
          />
        </label>

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
