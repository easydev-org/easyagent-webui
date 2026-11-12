/**
 * What a conversation has "selected", per namespace, as relayed to extension views.
 *
 * THE CONSOLE DOES NOT INTERPRET ANY OF THIS. A namespace is a string an extension declared in its
 * `ui.json` (`sessionViews[].selectionNamespace`); a value is whatever that extension put there. The
 * console stores the pair and hands the whole map to every view opened for the same session.
 *
 * That indirection is the point: the sandbox panel can tell the console "the reader is looking at
 * machine dev-1" without the console ever learning what a machine is, and a second extension that
 * declares the same namespace sees the same value — so two panels can agree on what is being looked
 * at without knowing about each other.
 *
 * IN MEMORY, KEYED BY SESSION, AND DELIBERATELY NOT PERSISTED:
 *
 *   * not persisted because a selection describes "what I am looking at right now", not a setting;
 *     restoring one after a reload would reopen a panel pointed at something the reader never chose;
 *   * keyed by session because a value from one conversation must not leak into another — the sandbox
 *     of session A is not a thing session B should be shown.
 */

/** namespace -> id, for one conversation. */
type Selections = Record<string, string>

const bySession = new Map<string, Selections>()

/**
 * The selections for a conversation, or an empty map.
 *
 * A COPY, so a caller cannot mutate the store by holding the object.
 */
export function selectionsFor(sessionId: string): Selections {
  if (sessionId === '') return {}
  return { ...(bySession.get(sessionId) ?? {}) }
}

/**
 * Record a selection and return the new map for that conversation.
 *
 * AN EMPTY ID CLEARS THE NAMESPACE rather than storing a blank value: "nothing is selected" has to be
 * representable, and a blank string would otherwise be a selection that happens to be empty — which
 * an extension would then have to special-case.
 */
export function setSelection(sessionId: string, namespace: string, id: string): Selections {
  if (sessionId === '' || namespace === '') return selectionsFor(sessionId)
  const next = { ...(bySession.get(sessionId) ?? {}) }
  if (id === '') delete next[namespace]
  else next[namespace] = id
  if (Object.keys(next).length === 0) bySession.delete(sessionId)
  else bySession.set(sessionId, next)
  return { ...next }
}

/**
 * Forget a conversation's selections.
 *
 * CALLED WHEN THE VIEW CLOSES, not when the session ends: the selection describes the panel's state,
 * and a panel that is gone has no state to describe. Keeping it would mean reopening the side view
 * jumps to a machine the reader picked in some earlier sitting.
 */
export function clearSelections(sessionId: string): void {
  if (sessionId === '') return
  bySession.delete(sessionId)
}
