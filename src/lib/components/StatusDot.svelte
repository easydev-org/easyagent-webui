<script lang="ts">
  // StatusDot — one session's runtime status, as a badge on its avatar.
  //
  // IT IS ONE COMPONENT SO THE LIST AND A GROUP'S MEMBER LIST AGREE. The same fact was drawn in one place and
  // missing from the other, which is how a reader learns to distrust both: a green dot beside a session in the list
  // and nothing beside the same session in its group reads as "the group page does not know".
  //
  // RUNNING (incl. mid-retry) = pulsing green; idle = grey; unknown (lease read failed) = amber. AN ABSENT STATUS
  // DRAWS NOTHING, which is different from idle: a caller that never asked should not claim the session is stopped.
  import { t } from '$lib/i18n.svelte'

  let {
    status,
    size = 'md',
    ring = true,
  }: {
    /** `busy` | `idle` | `unknown`, or undefined when the caller did not ask. */
    status?: string
    /** `sm` sits inline in a name row; `md` sits on an avatar. */
    size?: 'sm' | 'md'
    /** The background-coloured ring that separates the dot from a picture behind it. */
    ring?: boolean
  } = $props()

  const box = $derived(size === 'sm' ? 'size-2' : 'size-2.5')
  const ringClass = $derived(ring ? 'ring-2 ring-background' : '')
</script>

{#if status === 'busy'}
  <span
    class="block animate-pulse rounded-full bg-success {box} {ringClass}"
    title={t('running')}
    aria-label={t('running')}
  ></span>
{:else if status === 'idle'}
  <span
    class="block rounded-full bg-muted-foreground/60 {box} {ringClass}"
    title={t('idle')}
    aria-label={t('idle')}
  ></span>
{:else if status === 'unknown'}
  <span
    class="block rounded-full bg-warning {box} {ringClass}"
    title={t('statusUnknown')}
    aria-label={t('statusUnknown')}
  ></span>
{/if}
