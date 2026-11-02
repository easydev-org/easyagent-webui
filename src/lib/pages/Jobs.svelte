<script lang="ts">
  // Tasks — the background jobs a conversation started, as a PAGE.
  //
  // A PAGE AND NOT A PANEL, for the same reason permissions are: a job list is read, not glanced at.
  // A reader compares what finished against what is still going, and often wants the title of the one
  // that is stuck — all of which a 340px column beside the conversation makes worse.
  //
  // THE DATA IS LOADED HERE. The list is a snapshot, so the page owns when it is taken; a job that
  // ends while the page is open is noticed on the next refresh rather than pushed into a component
  // that would then have to own a subscription it cannot tear down on the way out.
  import type { PageProps } from '$lib/page-props'
  import { t } from '$lib/i18n.svelte'
  import { showErrorToast } from '$lib/toast.svelte'
  import type { Job } from '$lib/models'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'

  let { store }: PageProps = $props()

  const sid = $derived(store.activeSessionId ?? '')

  let jobs = $state<Job[]>([])
  let loading = $state(true)
  let loadedAt = $state(0)

  async function refresh() {
    if (!sid) return
    loading = true
    try {
      jobs = await store.api.listJobs(sid)
      loadedAt = Date.now()
    } catch (e) {
      showErrorToast(String(e))
    } finally {
      loading = false
    }
  }

  // Refetched when the conversation changes, so arriving here from a different chat cannot show the
  // previous one's jobs.
  $effect(() => {
    const id = sid
    if (!id) return
    void refresh()
  })

  /**
   * NEWEST FIRST. The job a reader just started is the one they came to look at, and a conversation
   * that has run fifty builds should not put the interesting row at the bottom.
   */
  const ordered = $derived([...jobs].sort((a, b) => b.startedAt - a.startedAt))

  /**
   * A ROW'S TONE COMES FROM THE EXIT CODE, NOT THE STATE.
   *
   * `done` covers both a green build and a red one — the state says why the job stopped and the code
   * says what the ending was worth. Colouring on `done` alone would paint every failure as success.
   */
  function tone(j: Job): string {
    if (j.state === 'running') return 'run'
    if (j.state === 'cancelled' || j.state === 'lost') return 'warn'
    if (j.exitCode === undefined) return '' // ended, but nothing said how
    return j.exitCode === 0 ? 'ok' : 'bad'
  }

  /** "3m 20s" / "45s" — how long it has been going, or how long it took. */
  function duration(j: Job): string {
    const end = j.finishedAt > 0 ? j.finishedAt : Date.now()
    const ms = Math.max(0, end - j.startedAt)
    const s = Math.round(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ${s % 60}s`
    return `${Math.floor(m / 60)}h ${m % 60}m`
  }

  /**
   * WHETHER CANCELLING IS WORTH OFFERING.
   *
   * `kill` ends a process the extension owns; `request` only asks a remote system, which may finish
   * its current step first. Anything else has nothing to stop, and a button that cannot work teaches
   * the reader that buttons here do not work.
   */
  function cancelHint(j: Job): string {
    if (j.state !== 'running') return ''
    if (j.cancelMode === 'kill') return t('jobsCancellable')
    if (j.cancelMode === 'request') return t('jobsCancellableByRequest')
    return ''
  }
</script>

<PageHeader title={t('jobsTitle')} onBack={() => store.popPage()}>
  <button
    type="button"
    class="text-meta text-muted-foreground hover:text-foreground"
    onclick={() => void refresh()}
    disabled={loading}
  >
    {t('refresh')}
  </button>
</PageHeader>

{#if !sid}
  <p class="p-4 text-meta text-muted-foreground">{t('jobsNoSession')}</p>
{:else if loading && jobs.length === 0}
  <p class="p-4 text-meta text-muted-foreground">{t('loading')}</p>
{:else if jobs.length === 0}
  <p class="p-4 text-meta text-muted-foreground">{t('jobsEmpty')}</p>
{:else}
  <ul class="divide-y divide-border">
    {#each ordered as j (j.id)}
      <li class="flex flex-col gap-1 px-4 py-3">
        <div class="flex items-baseline gap-2">
          <span class="truncate font-medium">{j.title || j.id}</span>
          <span class="shrink-0 rounded-full border px-2 text-[11px] {tone(j) === 'ok'
            ? 'border-green-600 text-green-600'
            : tone(j) === 'bad'
              ? 'border-red-600 text-red-600'
              : tone(j) === 'warn'
                ? 'border-amber-600 text-amber-600'
                : tone(j) === 'run'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-border text-muted-foreground'}">
            {j.state}{#if j.exitCode !== undefined}, exit {j.exitCode}{/if}
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
          <span class="font-mono">{j.id}</span>
          <span>{j.kind}</span>
          <span>{duration(j)}</span>
          {#if cancelHint(j)}<span>{cancelHint(j)}</span>{/if}
        </div>
        {#if j.reason}
          <p class="text-[11px] text-muted-foreground">{j.reason}</p>
        {/if}
        <!-- THE OUTPUT IS NOT HERE, deliberately: it lives where the work ran, and the extension's
             own tool reads it. Naming that tool is more useful than a truncated copy that would send
             the reader looking for the rest. -->
        <p class="text-[11px] text-muted-foreground">
          {t('jobsOutputHint')}
        </p>
      </li>
    {/each}
  </ul>
{/if}
