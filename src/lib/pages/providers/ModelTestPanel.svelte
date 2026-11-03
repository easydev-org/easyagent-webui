<script lang="ts">
  // The test panel for ONE model, shaped by its modality.
  //
  // WHY NOT ONE BUTTON FOR ALL OF THEM. A test has to send something the model can act on, and the
  // modalities do not share an input: a chat model takes a question, an image model takes a prompt, a
  // speech model takes words to say, a transcription model takes RECORDED AUDIO. A single "test"
  // button could only ever say whether the provider row parsed — which is the thing that never goes
  // wrong.
  //
  // THE OUTPUT IS SHAPED THE SAME WAY. Text comes back as text; the others come back as files the
  // caller renders by media type, because an image-edit returning three images and a TTS call
  // returning one clip are the same shape to a renderer and different shapes to a form.
  import { t } from '$lib/i18n.svelte'
  import { AppIcons } from '$lib/icons'
  import { Input } from '$lib/components/ui/input'
  import type { AppStore } from '$lib/store.svelte'

  let {
    store,
    capability,
    providerId,
    modelId,
    apiType,
    baseUrl,
    apiKey,
  }: {
    store: AppStore
    capability: string
    providerId: string
    modelId: string
    apiType: string
    baseUrl: string
    apiKey: string
  } = $props()

  let prompt = $state('')
  let voice = $state('')
  let testing = $state(false)
  let ok = $state<boolean | null>(null)
  let message = $state('')
  let files = $state<{ mediaType: string; url: string }[]>([])
  let recording = $state(false)
  let recorder: MediaRecorder | null = null
  let recordError = $state('')

  /**
   * TWO KINDS OF TTS MODEL, AND THEY NEED DIFFERENT INPUT.
   *
   * A `-customvoice` model speaks in one of its OWN voices, named; sending anything else is a 400 that
   * lists them. A `-base` model is a VOICE CLONER: it cannot speak without a reference sample, so
   * there is no preset to choose and the request fails without `ref_audio`.
   *
   * The suffix is the only signal the gateway gives — there is no capability flag for it — so this is
   * where the distinction has to be made.
   */
  const isCloningVoice = $derived(/tts-base/.test(modelId))
  const isPresetVoice = $derived(capability === 'speech' && !isCloningVoice)

  /** The gateway's own preset list, from the error it returns for an unknown name. */
  const PRESET_VOICES = [
    'aiden',
    'dylan',
    'eric',
    'ono_anna',
    'ryan',
    'serena',
    'sohee',
    'uncle_fu',
    'vivian',
  ]

  const needsPrompt = $derived(capability !== 'transcription')

  const placeholder = $derived(
    capability === 'image'
      ? 'a red fox sitting in snow, wide shot'
      : capability === 'video'
        ? 'waves breaking on a black sand beach'
        : capability === 'speech'
          ? 'The quick brown fox jumps over the lazy dog.'
          : 'What is the capital of France?',
  )

  // A PRESET VOICE IS CHOSEN, NOT TYPED: the gateway rejects anything not on its list, so a free-text
  // field would be a field whose valid values the user has to discover by failing.
  $effect(() => {
    if (isPresetVoice && voice === '') voice = 'serena'
  })

  // OBJECT URLS ARE REVOKED WHEN THE RESULT IS REPLACED, not on unmount alone: a user who tests three
  // times would otherwise hold three images' worth of memory until they left the page.
  function clearFiles(): void {
    for (const f of files) URL.revokeObjectURL(f.url)
    files = []
  }
  $effect(() => () => clearFiles())

  async function run(audio?: Uint8Array, audioMediaType?: string): Promise<void> {
    if (testing) return
    testing = true
    ok = null
    message = ''
    clearFiles()
    try {
      const r = await store.api.testProvider({
        apiType,
        baseUrl,
        apiKey,
        providerId,
        model: modelId ? `${providerId}/${modelId}` : providerId,
        capability,
        prompt: prompt.trim(),
        voice: isPresetVoice ? voice : '',
        audio,
        audioMediaType,
      })
      ok = r.ok
      message = r.result || (r.ok ? t('testPassed') : '')
      files = r.files.map(f => ({
        mediaType: f.mediaType,
        // `f.data` is a Uint8Array over a possibly-shared buffer; Blob wants an ArrayBufferView over
        // a plain one, so the slice gives it a copy it can accept.
        url: URL.createObjectURL(new Blob([f.data.slice()], { type: f.mediaType })),
      }))
    } catch (e) {
      ok = false
      message = String(e)
    }
    testing = false
  }

  /**
   * RECORD, THEN SEND THE BYTES.
   *
   * The API takes audio as base64 rather than a file handle, because the console talks to the agent
   * over Connect and a streaming upload for a five-second clip would be more machinery than the
   * feature. MediaRecorder gives a Blob; its arrayBuffer is what the request carries.
   */
  async function toggleRecording(): Promise<void> {
    recordError = ''
    if (recording) {
      recorder?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const mr = new MediaRecorder(stream)
      recorder = mr
      mr.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      mr.onstop = () => {
        recording = false
        for (const track of stream.getTracks()) track.stop()
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' })
        void blob.arrayBuffer().then(buf => run(new Uint8Array(buf), blob.type))
      }
      mr.start()
      recording = true
    } catch (e) {
      recordError = e instanceof Error ? e.message : String(e)
    }
  }
</script>

<div class="space-y-2 rounded-md border border-border p-3">
  {#if needsPrompt}
    <label class="block">
      <span class="mb-1 block text-meta text-muted-foreground">
        {capability === 'speech' ? t('testTextToSpeak') : t('testPrompt')}
      </span>
      <textarea
        bind:value={prompt}
        rows={capability === 'speech' ? 3 : 2}
        class="w-full rounded-md border border-input bg-background px-3 py-2 text-meta"
        {placeholder}></textarea>
    </label>
  {:else}
    <p class="text-meta text-muted-foreground">{t('testRecordHint')}</p>
  {/if}

  {#if isPresetVoice}
    <label class="block">
      <span class="mb-1 block text-meta text-muted-foreground">{t('testVoice')}</span>
      <select
        bind:value={voice}
        class="w-full rounded-md border border-input bg-background px-3 py-2 text-meta"
      >
        {#each PRESET_VOICES as v (v)}
          <option value={v}>{v}</option>
        {/each}
      </select>
    </label>
  {:else if isCloningVoice}
    <!-- A VOICE CLONER CANNOT SPEAK WITHOUT A SAMPLE, so there is nothing to pick and the request
         would fail. Say why instead of offering an empty field. -->
    <p class="text-micro text-muted-foreground">{t('testCloningNeedsReference')}</p>
  {/if}

  <div class="flex flex-wrap items-center gap-2">
    {#if capability === 'transcription'}
      <button
        type="button"
        class="rounded-md border border-border px-3 py-1.5 text-meta hover:bg-muted disabled:opacity-40"
        disabled={testing}
        onclick={() => void toggleRecording()}
      >
        <AppIcons.mic class="mr-1 inline size-3.5" />{recording
          ? t('testStopRecording')
          : t('testRecord')}
      </button>
    {:else}
      <button
        type="button"
        class="rounded-md border border-border px-3 py-1.5 text-meta hover:bg-muted disabled:opacity-40"
        disabled={testing || !prompt.trim()}
        onclick={() => void run()}
      >
        <AppIcons.flask class="mr-1 inline size-3.5" />{testing
          ? t('connecting')
          : t('test')}</button
      >
    {/if}
  </div>

  {#if recordError}
    <p class="text-micro text-destructive">{recordError}</p>
  {/if}

  {#if ok !== null}
    <div
      class="rounded-md border {ok
        ? 'border-success/40 bg-success/10 text-success'
        : 'border-destructive/40 bg-destructive/10 text-destructive'} px-3 py-2 text-micro"
    >
      {message}
    </div>
  {/if}

  {#if files.length}
    <div class="flex flex-wrap gap-2">
      {#each files as f (f.url)}
        {#if f.mediaType.startsWith('image/')}
          <img
            src={f.url}
            alt={t('testResultAlt')}
            class="max-h-64 rounded-md border border-border"
          />
        {:else if f.mediaType.startsWith('audio/')}
          <audio controls src={f.url} class="w-full"></audio>
        {:else if f.mediaType.startsWith('video/')}
          <!-- A MODEL'S OUTPUT HAS NO CAPTION TRACK. The a11y rule assumes authored media, where a
               missing track is an omission; here there is nothing to caption but what the model
               invented a moment ago. The lint is silenced rather than satisfied with an empty track,
               because an empty track tells a screen reader "captions exist and say nothing". -->
          <!-- svelte-ignore a11y_media_has_caption -->
          <video controls src={f.url} class="max-h-64 rounded-md border border-border"></video>
        {:else}
          <!-- An unknown media type is still a result: offer it as a download rather than refusing to
               show what the model produced. -->
          <a href={f.url} download class="text-primary underline">{f.mediaType}</a>
        {/if}
      {/each}
    </div>
  {/if}
</div>
