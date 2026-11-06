// Which renderer an extension's tool result asks the console to use.
//
// A card is a PURE RENDER of the call that already happened:
//
//     card(tool, input, metadata, output) -> DOM
//
// Everything it shows is in the tool result the host already holds. It does not fetch anything, so it
// cannot be slow, cannot be rate-limited, and cannot disagree with what the tool returned. That last
// point matters most: a card that re-queries a workspace shows a DIFFERENT thing from the result beside
// it the moment the workspace changes — or nothing at all once the workspace expires, even though the
// result is still perfectly readable.
//
// An extension declares one in its tool result's `data.card`:
//
//     data: { card: { ext: "gitdev", template: "pr" } }
//
// `template` names WHICH renderer, not where to fetch: the extension maps it to a component.
//
// `view` stays a SEPARATE declaration, and a sibling, because the two answer different questions:
// `view` is a place you can GO (which may fail later — the workspace can expire, and that failure
// belongs to the moment you click it), `card` is what already happened.
//
// THE CARD IS RENDERED IN AN IFRAME, not as HTML the extension returns. The first reason is decisive:
// this app is styled with Tailwind, whose classes are generated at BUILD time, so markup from an
// extension would carry class names this build never saw and render unstyled — broken in a way nothing
// reports.
//
// WHAT IS NOT HERE ANY MORE: the postMessage protocol. It lives in @easydev-org/ext-ui, whose `host`
// entry this app imports — the constants, the validators, the payload builder and the frame URL all
// come from there. This file kept a hand-written copy of every one of them, which is exactly the drift
// the package exists to prevent.

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
export function extCardFrom(
  data: Record<string, unknown> | null | undefined,
): ExtCard | null {
  if (!data) return null
  const v = data['card'] as Partial<ExtCard> | undefined
  if (!v || typeof v.ext !== 'string' || typeof v.template !== 'string')
    return null
  if (v.ext === '' || v.template === '') return null
  return { ext: v.ext, template: v.template }
}
