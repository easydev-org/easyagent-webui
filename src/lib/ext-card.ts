// Contract for an extension-rendered tool card.
//
// An extension that wants to draw its own card puts this in its tool result's `data.card`:
//
//   data: { view: {...}, card: { ext: "github", route: "/card/<tool>/<id>" } }
//
// `view` and `card` are SIBLINGS, not nested, because they answer different questions and either can
// exist without the other: a clone tool has both (a card summarising the repo, a button opening the
// tree), a delete tool has only a card.
//
// The card is rendered in an IFRAME, not as HTML the extension returns. Two reasons, and the first is
// decisive:
//
//   * this app is styled with Tailwind, whose classes are generated at BUILD time. Markup from an
//     extension carries class names this build never saw, so it would render unstyled — invisibly
//     broken in a way no error reports;
//   * an iframe gives the extension its own document, so it can reuse the components it already has
//     rather than reimplementing them against a description protocol that would keep growing.
//
// The cost is a second document per card, so it is mounted LAZILY: the card starts as the plain
// rendering and only becomes an iframe when the reader asks for it.

export interface ExtCard {
  /** Extension id — matches the Service `<id>-ext` and the mount `/ext/<id>`. */
  ext: string
  /** Hash route INSIDE that extension's UI. */
  route: string
  /** Card title, when the extension wants one shown above its frame. */
  title?: string
}

/** The scope the frame needs to find its data. */
export interface ExtCardScope {
  session: string
  theme: 'light' | 'dark'
}

/**
 * The iframe src for an extension card.
 *
 * `session` scopes the data; `theme` pre-applies the host's palette before first paint, because an
 * iframe has its own <html> and would otherwise flash light in dark mode. No tenant: it lives in the
 * bearer token and the extension resolves it server-side.
 */
export function extCardSrc(card: ExtCard, scope: ExtCardScope): string {
  const q = new URLSearchParams({ session: scope.session, theme: scope.theme })
  const route = card.route.startsWith('/') ? card.route : `/${card.route}`
  return `/ext/${card.ext}/?${q.toString()}#${route}`
}

/**
 * Read a card declaration out of a tool result's data, or null.
 *
 * Validated rather than trusted: a malformed entry must fall back to the plain rendering, not put a
 * broken iframe in the message.
 */
export function extCardFrom(data: Record<string, unknown> | null | undefined): ExtCard | null {
  if (!data) return null
  const v = data['card'] as Partial<ExtCard> | undefined
  if (!v || typeof v.ext !== 'string' || typeof v.route !== 'string') return null
  if (v.ext === '' || v.route === '') return null
  return { ext: v.ext, route: v.route, title: typeof v.title === 'string' ? v.title : undefined }
}
