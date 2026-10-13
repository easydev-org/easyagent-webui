import path from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

/**
 * Vitest config for the whole repo.
 *
 * - `svelte()` lets tests import `.svelte` components.
 * - `resolve.conditions: ['browser']` is REQUIRED: without it Svelte resolves
 *   to its SERVER build and `mount()` throws "not available on the server".
 * - the `$lib` alias mirrors `vite.config.ts`.
 * - `environment: 'jsdom'` gives components a DOM to mount into.
 *
 * This is what makes a component MOUNT test possible — the static checks
 * (`tsc`/`svelte-check`/`biome`) and the pure-TS tests cannot catch a
 * mount-time crash (a Svelte 5 effect that reads AND writes the same state
 * loops with `effect_update_depth_exceeded`; a bad `$props` destructure or a
 * missing required prop throws). Every new/changed component SHOULD get a
 * mount smoke test.
 */
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: { $lib: path.resolve('./src/lib') },
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
  },
})
