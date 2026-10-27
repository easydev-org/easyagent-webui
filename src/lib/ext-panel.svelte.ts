// Helpers for an extension view, which is a PAGE in the app's own navigation stack.
//
// It used to keep a private stack and float over the conversation. That was wrong on two counts:
// on a phone it split the screen in half (an absolutely-positioned panel over a live layout), and
// it duplicated navigation the app already has. Promoting it to an AppPage means the Shell's own
// compact/wide rule applies — one pane on a phone, two on a tablet — exactly like the mailbox
// overlay.
//
// The one-at-a-time rule lives in nav.ts: every ext_view shares a key, so pushing a second replaces
// the first.

import type { AppPage } from './nav'

/**
 * Build the page to push for an extension view.
 *
 * Returns a page rather than pushing it, because the navigation stack belongs to the store and this
 * module must stay free of it — the caller (a tool card) already has the store in scope, and a
 * helper that reached for a global would be untestable.
 *
 * Every ext_view shares the SAME key, so pushPage REPLACES any existing one: at most one extension
 * view is open at a time, and a new one covers the old one rather than stacking behind it. The
 * browse trail lives in the extension's own hash router, where it belongs.
 */
export function extViewPage(v: {
  ext: string
  route: string
  title: string
  session: string
}): AppPage {
  return { kind: 'ext_view', key: 'ext_view', ...v }
}

/** Build the iframe src for an extension view. */
export function extViewSrc(ext: string, route: string, session: string, theme: 'light' | 'dark'): string {
  // `session` scopes the data; `theme` pre-applies the host's palette before first paint, because
  // an iframe has its own <html> and would otherwise flash light in dark mode.
  // NO tenant: it lives in the bearer token and the extension resolves it server-side.
  const q = new URLSearchParams({ session, theme })
  const r = route.startsWith('/') ? route : `/${route}`
  return `/ext/${ext}/?${q.toString()}#${r}`
}
