<script lang="ts">
  // ChatAvatar — the session's picture.
  //
  // TWO SOURCES, ONE COMPONENT. A session may carry a `file:<code>` (its own uploaded image); when it
  // does not, the honeycomb identicon is derived from the seed exactly as before. Keeping the fallback
  // HERE rather than at every call site means a session without a picture cannot accidentally render
  // as a blank circle: the caller passes what it has and this decides.
  //
  // THE CODE IS NOT A URL. Bytes live in the agent's blob store and arrive over RPC, so they are
  // fetched once, turned into an object URL, and revoked when the component goes away — a leaked
  // object URL keeps the whole blob alive in memory for the life of the page.
  import { avatarSpec, type HexCell } from '$lib/identicon'
  import { resolveAvatar } from '$lib/avatar-source'

  let {
    seed,
    size = 40,
    avatar = '',
    /**
     * Fetches a `file:<code>`'s bytes. INJECTED RATHER THAN IMPORTED, because this component renders
     * inside the session list where the API client lives on the store — importing one here would give
     * it a second, differently-configured client.
     */
    fetchBytes,
    label = '',
  }: {
    seed: string
    size?: number
    avatar?: string
    fetchBytes?: (code: string) => Promise<Uint8Array>
    label?: string
  } = $props()

  const spec = $derived(avatarSpec(seed))
  const d = $derived(size)

  // THE CHOICE IS A PURE FUNCTION, so it is tested without a DOM: no avatar and an unusable avatar both
  // resolve to the identicon, and only a well-formed `file:<code>` becomes an image.
  const resolved = $derived(resolveAvatar(avatar))
  const code = $derived(resolved.source === 'file' ? resolved.code : '')

  let src = $state('')
  let failed = $state(false)

  $effect(() => {
    const c = code
    if (!c || !fetchBytes) {
      src = ''
      failed = false
      return
    }
    let url = ''
    let cancelled = false
    void (async () => {
      try {
        const bytes = await fetchBytes(c)
        if (cancelled) return
        // THE BYTES ARE COPIED INTO A FRESH ARRAY: the RPC result may be a view onto a larger buffer,
        // and a Blob over the view would keep that whole buffer alive.
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]))
        src = url
      } catch {
        // A BROKEN PICTURE FALLS BACK TO THE IDENTICON rather than an empty circle: the session still
        // needs something to render, and a missing blob is not something the reader can act on.
        if (!cancelled) failed = true
      }
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  })

  const showImage = $derived(!!src && !failed)

  function points(h: HexCell): string {
    const cx = d / 2 + h.x * d
    const cy = d / 2 + h.y * d
    const r = h.r * d
    const pts: string[] = []
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3
      pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
    }
    return pts.join(' ')
  }
</script>

{#if showImage}
  <img
    {src}
    alt={label || seed}
    width={d}
    height={d}
    class="shrink-0 rounded-full object-cover"
    style="width:{d}px;height:{d}px"
    onerror={() => (failed = true)}
  />
{:else}
  <svg width={d} height={d} viewBox="0 0 {d} {d}" class="shrink-0" aria-hidden="true">
    <clipPath id={`av-${seed.replace(/[^a-zA-Z0-9]/g, '')}`}>
      <circle cx={d / 2} cy={d / 2} r={d / 2} />
    </clipPath>
    <circle cx={d / 2} cy={d / 2} r={d / 2} fill={spec.bg} />
    <g clip-path={`url(#av-${seed.replace(/[^a-zA-Z0-9]/g, '')})`}>
      {#each spec.hexes.filter(h => h.on) as h}
        <polygon points={points(h)} fill={spec.fg} />
      {/each}
    </g>
  </svg>
{/if}
