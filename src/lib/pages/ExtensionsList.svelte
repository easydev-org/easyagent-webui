<script lang="ts">
  // The shelf: extension UIs this tenant can open.
  //
  // Only extensions that ANSWER `/ext/<id>/api/v1/ui` appear. A registered extension with no UI is a
  // tool provider, not a place to visit, and listing it would offer a link to nothing.
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { AppIcons } from '$lib/icons'
  import type { PageProps } from '$lib/page-props'
  import { discoverExtUis, type ExtUi } from '$lib/ext-catalog.svelte'
  import { extViewPage } from '$lib/ext-panel.svelte'

  let { store }: PageProps = $props()

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
{:else if loading}
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
          <span class="glyph"><AppIcons.apps class="size-5" /></span>
          <span class="name">{e.title}</span>
          <span class="id mono">{e.id}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .grid {
    margin: 0;
    padding: var(--sp-md);
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--sp-sm);
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
