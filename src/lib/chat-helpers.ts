// Pure helpers for the chat composer + settings dialog: model-option and
// variant resolution, and the compact token/duration labels. No component
// state, so they can be unit-tested and keep Chat.svelte's script lean.
import { type ModelInfo, type ModelVariantInfo, modelRefOf } from './models'

/** Overlay option list for the model picker: every loaded model, plus the
 *  currently-selected ref when it is not among them (so a session bound to a
 *  model the tenant no longer advertises still shows its value). */
/**
 * buildModelOptions lists the models a session may be set to.
 *
 * `NO_MODEL` IS AN OFFERED OPTION, not a placeholder. A session can exist before its model is chosen, and the
 * picker has to be able to RETURN to that state — an option that only appears when the list is empty
 * ("none selected") can be left but never re-entered, so a user who picked a model by accident could not undo it.
 *
 * The empty value is what the Select renders as its placeholder, which is the same visually and different in
 * behaviour: selecting it writes '' and clears the column to NULL.
 */
export const NO_MODEL = ''

export function buildModelOptions(
  allModels: ModelInfo[],
  selectedRef: string,
): Array<{ value: string; label: string }> {
  const opts = allModels.map(m => ({
    value: modelRefOf(m),
    label: modelRefOf(m),
  }))
  // AN ORPHANED REFERENCE IS STILL SHOWN, so a session pointing at a model the tenant no longer lists does not
  // silently read as "no model" — the difference matters when deciding whether to re-point it.
  if (selectedRef && !allModels.some(m => modelRefOf(m) === selectedRef)) {
    opts.unshift({ value: selectedRef, label: selectedRef })
  }
  return opts
}

/** Reasoning variants advertised by the selected model ([] when unmatched). */
export function variantsFor(allModels: ModelInfo[], selectedRef: string): ModelVariantInfo[] {
  const sel = allModels.filter(m => modelRefOf(m) === selectedRef)
  return sel.length ? sel[0]!.variants : []
}

/** Compact context-token label: '' / 1.2k / 12k / 1.5M. */
export function fmtContext(tokens: number): string {
  if (tokens <= 0) return ''
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 10_000) return `${Math.round(tokens / 1000)}k`
  return `${(tokens / 1000).toFixed(1)}k`
}

/** m:ss elapsed label for the hold-to-talk indicator. */
export function fmtElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
