<script lang="ts">
  // The shelf: extension UIs this tenant can open.
  //
  // Only extensions that ANSWER `/ext/<id>/api/v1/ui` appear. A registered extension with no UI is a
  // tool provider, not a place to visit, and listing it would offer a link to nothing.
  import { onMount } from 'svelte'
  import { getLocale, t } from '$lib/i18n.svelte'
  import { AppIcons } from '$lib/icons'
  import type { PageProps } from '$lib/page-props'
  import { descriptionFor, discoverExtUis, type ExtUi } from '$lib/ext-catalog.svelte'
  import { extViewPage } from '$lib/ext-panel.svelte'
  import PageHeader from '$lib/components/layout/PageHeader.svelte'

  let { store }: PageProps = $props()

  // `getLocale` reads the module's `$state`, so switching language re-renders these descriptions with
  // everything else.
  const locale = $derived(getLocale())

  let items = $state<ExtUi[]>([])
  let loading = $state(true)
  let error = $state('')

  async function load(): Promise<void> {
    error = ''
    loading = true
    try {
      items = await discoverExtUis(store.api)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  }

  onMount(() => {
    void load()
  })

  /**
   * Open an extension's UI as a page.
   *
   * No session: the shelf is not inside a conversation, so the extension starts at whichever route
   * it treats as home. A card opened from a chat passes the session instead, because there it has
   * data to scope.
   */
  function open(e: ExtUi): void {
    store.pushPage(extViewPage({ ext: e.id, route: '/', title: e.title, session: '' }))
  }
</script>

{#if error}
  <div class="state err">
    {error}
    <button type="button" class="retry" onclick={() => void load()}>{t('retry')}</button>
  </div>
{:else}
  <!-- The same bar as every other page, so a reader moving between them sees one layout rather than
       a page that appears to be missing its header. -->
  <div class="page">
    <PageHeader title={t('tabExtensions')}>
      {#snippet right()}
        <button
          type="button"
          class="rounded p-1.5 text-muted-foreground hover:bg-muted"
          aria-label={t('retry')}
          title={t('retry')}
          onclick={() => void load()}
        >
          <AppIcons.refresh class="size-[18px]" />
        </button>
      {/snippet}
    </PageHeader>

    {#if loading}
      <div class="state muted">{t('loading')}</div>
    {:else if items.length === 0}
      <div class="state muted">
        {t('noExtUis')}
        <div class="hint t-meta">
          An extension appears here when it serves its own browser UI. Tool-only extensions do not.
        </div>
      </div>
    {:else}
      <ul class="grid">
        {#each items as e (e.id)}
          <li>
            <button type="button" class="card" onclick={() => open(e)} title={e.base}>
              {#if e.icon}
                <!-- The extension serves its own icon, so it can change without a host release. -->
                <img class="glyph-img" src={e.icon} alt="" width="28" height="28" />
              {:else}
                <!-- No declared icon: a neutral glyph rather than a broken image. -->
                <span class="glyph"><AppIcons.apps class="size-5" /></span>
              {/if}
              <span class="name">{e.title}</span>
              {#if descriptionFor(e, locale)}
                <span class="desc">{descriptionFor(e, locale)}</span>
              {/if}
              <span class="id mono">{e.id}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  /* A column, so the header stays put and only the list scrolls. */
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .grid {
    margin: 0;
    padding: var(--sp-md);
    list-style: none;
    display: grid;
    /* TWO things were wrong with `repeat(auto-fill, minmax(180px, 1fr))`:
     *
     *  - `auto-fill` reserves a track for every slot that WOULD fit, so with two extensions in a wide
     *    panel it created eight empty tracks and the two cards sat at opposite ends with a void
     *    between them. `auto-fit` collapses the unused tracks, which is what "lay these out" means.
     *  - `1fr` let each card grow to fill whatever width was left, so two cards stretched across the
     *    whole panel. A max caps the card and leaves the extra space at the END of the row.
     */
    grid-template-columns: repeat(auto-fit, minmax(180px, 220px));
    justify-content: start;
    align-content: start;
    gap: var(--sp-sm);
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: var(--sp-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--card);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .card:hover {
    background: var(--muted);
  }
  .glyph {
    color: var(--primary);
    margin-bottom: var(--sp-xs, 4px);
  }
  /* The extension's own icon. Sized by the attributes so a missing intrinsic size cannot break the
     layout before it loads. */
  .glyph-img {
    width: 28px;
    height: 28px;
    margin-bottom: var(--sp-xs, 4px);
    border-radius: 6px;
    object-fit: contain;
  }
  /* Two lines at most: a description is a hint, not a paragraph, and an unbounded one would make
     cards of wildly different heights in the same row. */
  .desc {
    font-size: var(--text-meta, 12px);
    line-height: 1.4;
    color: var(--muted-foreground);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .name {
    font-weight: 600;
    font-size: var(--text-body, 14px);
  }
  .id {
    font-size: var(--text-micro, 11px);
    color: var(--muted-foreground);
  }
  .state {
    padding: var(--sp-xl);
    text-align: center;
  }
  .state.err {
    color: var(--destructive);
    display: flex;
    flex-direction: column;
    gap: var(--sp-sm);
    align-items: center;
  }
  .hint {
    margin-top: var(--sp-sm);
    color: var(--muted-foreground);
  }
  .retry {
    font: inherit;
    font-size: var(--text-meta, 12px);
    padding: 4px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--card);
    color: var(--foreground);
    cursor: pointer;
  }
</style>
