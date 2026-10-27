// The extension panel: a stack of frames on the right edge of a chat.
//
// ONE STACK, not one panel per tool. A session browses a repository: repo → directory → file, and
// each step should be reachable back out of. A ping-pong of open/close per click loses that history,
// so the panel keeps frames and pops them.
//
// Each frame is an IFRAME onto an extension's own UI, served under /ext/<id>/ and proxied here by
// Caddy. That is what makes it SAME-ORIGIN with this app, so the extension's own fetches carry this
// origin's credentials instead of needing a second login.
//
// The panel is positioned ABSOLUTE over the conversation, the way PermissionsPanel is — a flex
// sibling needs the parent to give up width it does not own, and the first attempt at the
// permissions drawer did exactly that and squeezed the conversation to nothing.

export interface ExtFrame {
  /** Extension id, matching the Service `<id>-ext` and the mount `/ext/<id>`. */
  ext: string
  /** Hash route INSIDE that extension's UI, e.g. "/ws/abc/tree/src". */
  route: string
  /** Breadcrumb / tab label. */
  title: string
  /** The session the frame belongs to. Captured when pushed. */
  //
  // No tenant: the extension resolves it from the bearer token on the server. Passing one here
  // would make the tenant caller-controlled, which is the hole the extension's API closed.
  session: string
}

export const extPanel = $state<{ frames: ExtFrame[] }>({ frames: [] })

/** Push a frame. A frame identical to the current top is ignored rather than stacked twice. */
export function pushFrame(f: ExtFrame): void {
  const top = extPanel.frames[extPanel.frames.length - 1]
  if (top && top.ext === f.ext && top.route === f.route) return
  extPanel.frames.push(f)
}

/** Replace the current top instead of stacking on it (used when a frame navigates itself). */
export function replaceFrame(f: ExtFrame): void {
  if (extPanel.frames.length === 0) {
    extPanel.frames.push(f)
    return
  }
  extPanel.frames[extPanel.frames.length - 1] = f
}

export function popFrame(): void {
  extPanel.frames.pop()
}

export function closePanel(): void {
  extPanel.frames = []
}

export function popTo(index: number): void {
  if (index < 0 || index >= extPanel.frames.length) return
  extPanel.frames = extPanel.frames.slice(0, index + 1)
}

/** The frame on top, or null. */
export function currentFrame(): ExtFrame | null {
  return extPanel.frames[extPanel.frames.length - 1] ?? null
}

/**
 * Build the iframe src for a frame.
 *
 * `theme` is passed because an iframe has its own <html>: the host's data-theme does not reach it,
 * and applying it from inside the document would flash one light frame first. The extension reads
 * this on load; later changes arrive over postMessage (see ExtPanel.svelte).
 */
export function frameSrc(f: ExtFrame, theme: 'light' | 'dark'): string {
  const q = new URLSearchParams({ session: f.session, theme })
  const route = f.route.startsWith('/') ? f.route : `/${f.route}`
  return `/ext/${f.ext}/?${q.toString()}#${route}`
}
