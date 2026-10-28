// Shared types and readers for the tool-card registry.
//
// A card is a PLAIN DESCRIPTION, not markup: `cardFor` returns a spec and a component renders it.
// That split is what makes the mapping unit-testable — no Svelte, no DOM, no i18n side effects — and
// it is why the registry can cover a dozen tools without a dozen bespoke components.
//
// Every reader here is defensive by design. `data` comes from a tool that may be a different version
// than this client expects, so a missing field must yield an empty row rather than an exception: a
// card with one blank row is a nuisance, a card that throws takes the whole message with it.

/** One labelled row on a card. */
export interface CardField {
  /** AppIcons key. */
  icon: string
  /** i18n key or a literal when the label is data (a path, a model name). */
  label: string
  value: string
  mono?: boolean
  tone?: 'default' | 'success' | 'destructive' | 'muted' | 'warning'
}

/** A structured body rendered under a section's fields. */
export type CardBody =
  | { kind: 'text'; text: string; tone?: 'default' | 'destructive' }
  | { kind: 'command'; command: string; workdir?: string; timeout?: string }
  | { kind: 'code'; name: string; text: string; startLine?: number }
  | { kind: 'diff'; diff: string }
  | { kind: 'kv'; rows: Array<{ k: string; v: string; mono?: boolean }> }
  | { kind: 'markdown'; text: string }
  | { kind: 'media'; code: string; mime?: string; name?: string; caption?: string }
  | { kind: 'audio'; code: string; caption?: string }
  | { kind: 'files'; files: Array<{ code: string; mime?: string; name?: string }> }
  | {
      kind: 'messages'
      entries: Array<{
        role: string
        content: string
        tool_name?: string
        created_at?: string
        depth?: number
      }>
    }
  | {
      kind: 'list'
      rows: Array<{ label: string; sub?: string; url?: string }>
    }

/** One half of a card: the arguments, or the result. */
export interface CardSection {
  fields: CardField[]
  body?: CardBody
}

export interface CardSpec {
  /** Header subtitle — replaces the redundant italic title when present. */
  subtitle: string
  input: CardSection
  result: CardSection
}

/** Everything a handler needs, read once from the part. */
export interface CardCtx {
  /** Bare tool name, extension prefix stripped. */
  tool: string
  /** `state.data` — the result's structured payload. */
  data: Record<string, unknown>
  /** `state.input` — the arguments. A non-object (still streaming, or malformed) is `{}`. */
  input: Record<string, unknown>
  /** The result TEXT. Some payloads live only here (code, diffs, markdown). */
  output: string
  /** The call's error text, '' on success. */
  error: string
}

export type CardHandler = (ctx: CardCtx) => CardSpec | null

/** Strip an extension prefix: `github.git-ws-clone` -> `git-ws-clone`. */
export function bareToolName(tool: string): string {
  const m = /^[A-Za-z0-9_-]+\.([a-z0-9][a-z0-9-]*)$/.exec(tool)
  return m ? m[1]! : tool
}

// ---- readers ----

/** A string field, or '' when absent or of another type. */
export function s(o: Record<string, unknown> | null | undefined, k: string): string {
  if (!o) return ''
  const v = o[k]
  return typeof v === 'string' ? v : ''
}

/** A number field, or 0. Accepts a numeric string, which is how JSON sub-objects often arrive. */
export function n(o: Record<string, unknown> | null | undefined, k: string): number {
  if (!o) return 0
  const v = o[k]
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const parsed = Number(v)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/** An array field, or [] when absent. */
export function arr<T = unknown>(
  o: Record<string, unknown> | null | undefined,
  k: string,
): T[] {
  if (!o) return []
  const v = o[k]
  return Array.isArray(v) ? (v as T[]) : []
}

/** The first non-empty string among `keys`, across `data` then `input`. */
export function pickString(
  keys: string[],
  ...sources: Array<Record<string, unknown> | null | undefined>
): string {
  for (const src of sources) {
    for (const k of keys) {
      const v = s(src, k)
      if (v !== '') return v
    }
  }
  return ''
}

/** A human-readable byte size. */
export function humanBytes(v: number): string {
  if (!Number.isFinite(v) || v < 0) return ''
  if (v < 1024) return `${v} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = v / 1024
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[i]}`
}

/** First line of a multi-line string, truncated — for a subtitle. */
export function firstLine(text: string, max = 80): string {
  const line = (text.split('\n')[0] ?? '').trim()
  return line.length > max ? line.slice(0, max) + '…' : line
}

/**
 * Strip a leading `N  ` line-number gutter from read output.
 *
 * The producer emits `${padStart(width)}  ${line}` — number, then EXACTLY two spaces, then the
 * content. Only that fixed separator may go: a greedy `\s{2,}` also eats the content's own leading
 * indentation, which silently re-indents the code being read.
 */
export function stripLineNumbers(text: string): string {
  return text
    .split('\n')
    .map(l => l.replace(/^ *\d+ {2}/, '').replace(/^ *\d+\t/, ''))
    .join('\n')
}

/**
 * A card row, or null when there is nothing to show.
 *
 * "Skip when empty" is the whole point of this helper: a card for a tool that returned four of its
 * six possible fields should show four rows, not six with two blanks.
 *
 * A NUMBER is always kept — including zero, which is information ("0 files changed", "exit 0"). An
 * empty STRING is dropped, because that is how a missing field reads after the defensive readers
 * above, and a blank row is worse than no row.
 */
export function field(
  icon: string,
  label: string,
  value: string | number,
  opts: { mono?: boolean; tone?: CardField['tone'] } = {},
): CardField | null {
  const v = typeof value === 'number' ? String(value) : value
  if (typeof value === 'string' && v === '') return null
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  return { icon, label, value: v, mono: opts.mono, tone: opts.tone }
}

/** Compact a list of nullable fields, dropping the nulls. */
export function fields(...items: Array<CardField | null>): CardField[] {
  return items.filter((f): f is CardField => f !== null)
}
