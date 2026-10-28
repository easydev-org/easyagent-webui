// Contract for an extension-rendered tool card.
//
// A card is a PURE RENDER of the call that already happened:
//
//     card(tool, input, metadata, output) -> DOM
//
// Everything it shows is in the tool result the host already holds. It does not fetch anything, so
// it cannot be slow, cannot be rate-limited, and cannot disagree with what the tool returned. That
// last point matters most: a card that re-queries a workspace shows a DIFFERENT thing from the
// result beside it the moment the workspace changes — or nothing at all once the workspace expires,
// even though the result is still perfectly readable.
//
// An extension declares one in its tool result's `data.card`:
//
//     data: { card: { ext: "github", template: "repo-clone" } }
//
// `template` names WHICH renderer, not where to fetch: the extension maps it to a component. The
// host passes the data in (see MSG_CARD_DATA).
//
// `view` stays a SEPARATE declaration, and a sibling, because the two answer different questions:
// `view` is a place you can GO (which may fail later — the workspace can expire, and that failure
// belongs to the moment you click it), `card` is what already happened.
//
// The card is rendered in an IFRAME, not as HTML the extension returns. The first reason is
// decisive: this app is styled with Tailwind, whose classes are generated at BUILD time, so markup
// from an extension would carry class names this build never saw and render unstyled — broken in a
// way nothing reports.

export interface ExtCard {
  /** Extension id — matches the Service `<id>-ext` and the mount `/ext/<id>`. */
  ext: string
  /** Which of the extension's card renderers to use. Opaque to the host. */
  template: string
}

/**
 * Read a card declaration out of a tool result's data, or null.
 *
 * Validated rather than trusted: a malformed entry must fall back to the plain rendering, not put a
 * broken frame in the message.
 */
export function extCardFrom(data: Record<string, unknown> | null | undefined): ExtCard | null {
  if (!data) return null
  const v = data['card'] as Partial<ExtCard> | undefined
  if (!v || typeof v.ext !== 'string' || typeof v.template !== 'string') return null
  if (v.ext === '' || v.template === '') return null
  return { ext: v.ext, template: v.template }
}

/**
 * The iframe src for an extension card.
 *
 * Only the TEMPLATE and the theme travel in the URL. The theme is there because the frame has its own
 * `<html>` and would otherwise flash light in dark mode before a message could arrive. The DATA does
 * not: it goes over postMessage once the frame is ready, because a tool result can be large and a URL
 * is the wrong place for it — it lands in history and in logs.
 *
 * No session and no tenant: the card reads nothing, so it needs neither.
 */
export function extCardSrc(card: ExtCard, theme: 'light' | 'dark'): string {
  const q = new URLSearchParams({ theme })
  return `/ext/${card.ext}/?${q.toString()}#/card/${encodeURIComponent(card.template)}`
}

/** The frame is ready for its data. */
export const MSG_CARD_READY = 'easyagent:card-ready'

/** The host hands the call to the frame. */
export const MSG_CARD_DATA = 'easyagent:card-data'

/** The frame reports its content height, so the host can size it exactly. */
export const MSG_CARD_HEIGHT = 'easyagent:card-height'

/**
 * The frame asks the HOST to open a view.
 *
 * Why a message and not a link: the card renders inside a frame a few hundred pixels tall, so an
 * `<a href="#/ws/…">` would open the full browser INSIDE that frame — unusable, and the reader would
 * have to collapse the card to get out. Only the host can put a view where views belong (the side
 * panel on a wide screen, a full page on a phone).
 *
 * This is why `card` and `view` are separate declarations: the card knows WHICH route is worth
 * opening, the host knows where to open it — and only THEN can the "this workspace expired" error be
 * reported, at the moment somebody actually asks for it.
 */
export const MSG_OPEN_VIEW = 'easyagent:open-view'

export interface OpenViewMessage {
  type: typeof MSG_OPEN_VIEW
  ext: string
  route: string
  title?: string
}

/**
 * Read an open-view request, or null.
 *
 * Validated on arrival rather than trusted: a frame is a separate document, and a malformed request
 * must not become a broken page push.
 */
export function openViewFrom(data: unknown): OpenViewMessage | null {
  if (data === null || typeof data !== 'object') return null
  const d = data as Partial<OpenViewMessage>
  if (d.type !== MSG_OPEN_VIEW) return null
  if (typeof d.ext !== 'string' || d.ext === '') return null
  if (typeof d.route !== 'string' || d.route === '') return null
  return {
    type: MSG_OPEN_VIEW,
    ext: d.ext,
    route: d.route,
    title: typeof d.title === 'string' ? d.title : undefined,
  }
}

/** What the host hands the frame: the three fields of the call, and nothing else. */
export interface CardPayload {
  type: typeof MSG_CARD_DATA
  /** The tool's name, bare (extension prefix stripped by the caller). */
  tool: string
  /** `state.input` — the arguments. */
  input: Record<string, unknown>
  /** `state.data` — the structured result. */
  data: Record<string, unknown>
  /** The result text, which some tools put their answer in. */
  output: string
  /** The call's error text, '' on success. */
  error: string
}
