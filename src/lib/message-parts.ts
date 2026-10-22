// Pure part transformations — every ChatPart[] edit the stream needs, with no
// runes and no store state. MessageStore wraps these with setMsg/streamingId;
// the event router uses `filePartFrom` directly. Keeping them pure makes the
// trickiest streaming logic unit-testable in isolation.
import { pretty } from './message-mapping'
import type { ChatPart, ToolState } from './models'

/** Extra fields a tool result can carry, mirrored from the wire. */
export interface ToolResultExtra {
  errorMsg?: string
  changeId?: string
  diff?: string
  additions?: number
  deletions?: number
  data?: Record<string, unknown>
}

/** Add an empty text/reasoning part if absent (idempotent by id). */
export function ensurePartIn(
  parts: ChatPart[],
  partId: string,
  type: string,
): ChatPart[] {
  return parts.some(p => p.id === partId)
    ? parts
    : [...parts, { id: partId, type, text: '', tool: '' }]
}

/** Append streamed text to a part, creating it if the delta arrives first. */
export function appendDeltaTo(
  parts: ChatPart[],
  partId: string,
  delta: string,
  reasoning: boolean,
): ChatPart[] {
  const pidx = parts.findIndex(p => p.id === partId)
  const next = [...parts]
  if (pidx >= 0) {
    next[pidx] = { ...next[pidx]!, text: next[pidx]!.text + delta }
  } else {
    next.push({
      id: partId,
      type: reasoning ? 'reasoning' : 'text',
      text: delta,
      tool: '',
    })
  }
  return next
}

/** Create the tool part as soon as argument streaming begins (idempotent). */
export function startToolPartIn(
  parts: ChatPart[],
  partId: string,
  name: string,
): ChatPart[] {
  if (parts.some(p => p.id === partId)) return parts
  const state: ToolState = { status: 'running', title: name, inputText: '' }
  return [...parts, { id: partId, type: 'tool', text: '', tool: name, state }]
}

/** Accumulate streamed tool-argument JSON for the live preview. */
export function appendToolInputTo(
  parts: ChatPart[],
  partId: string,
  delta: string,
): ChatPart[] {
  return parts.map(p => {
    if (p.id !== partId) return p
    const old: ToolState = p.state ?? { status: '', title: '' }
    return {
      ...p,
      state: { ...old, inputText: (old.inputText ?? '') + delta },
    }
  })
}

/** Insert/replace a tool part with its complete `input` payload. */
export function addToolPartIn(
  parts: ChatPart[],
  partId: string,
  name: string,
  input: unknown,
): ChatPart[] {
  const asMap =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null
  const state: ToolState = { status: 'running', title: name, input: asMap }
  const part: ChatPart = {
    id: partId,
    type: 'tool',
    text: '',
    tool: name,
    state,
  }
  const next = [...parts]
  const pidx = next.findIndex(p => p.id === partId)
  if (pidx >= 0) next[pidx] = part
  else next.push(part)
  return next
}

/** Fold a tool result (string/JSON/null) plus extras into the part's state. */
export function applyToolResultTo(
  parts: ChatPart[],
  partId: string,
  result: unknown,
  extra: ToolResultExtra = {},
): ChatPart[] {
  return parts.map(p => {
    if (p.id !== partId) return p
    const old = p.state ?? { status: '', title: '' }
    const output =
      typeof result === 'string'
        ? result
        : result == null
          ? null
          : pretty(result)
    return {
      ...p,
      state: {
        status: extra.errorMsg != null ? 'error' : 'complete',
        title: old.title,
        error: extra.errorMsg ?? old.error ?? null,
        input: old.input ?? null,
        output: output ?? old.output ?? null,
        data: extra.data ?? old.data ?? null,
        changeId: extra.changeId ?? old.changeId ?? null,
        diff: extra.diff ?? old.diff ?? null,
        additions: extra.additions ?? old.additions ?? null,
        deletions: extra.deletions ?? old.deletions ?? null,
        toolState: old.toolState ?? null,
      } satisfies ToolState,
    }
  })
}

/** One `tool-output-available` / `tool-output-error` frame. */
export interface ToolOutputUpdate {
  /** Snapshot of the output so far. Empty for an error frame. */
  content: string
  /** "ok" | "timeout" | "cancelled" | "error" — how the call ended. */
  state?: string
  error?: string
  changeId?: string
  diff?: string
  additions?: number
  deletions?: number
  /** The tool's structured output (jobId, exitCode, files...). */
  data?: Record<string, unknown>
  /** True while the tool still runs: the frame is a snapshot, not the answer. */
  preliminary?: boolean
}

/**
 * Apply one tool-output frame to a part.
 *
 * The frame REPLACES the output: the server sends snapshots (the AI SDK's
 * `preliminary` convention), so the newest frame is the whole truth. That is what
 * makes a dropped frame harmless — the next one re-states everything — whereas
 * appending deltas would corrupt the result permanently.
 *
 * A `preliminary` frame leaves the card `running`; the terminal one completes it.
 */
export function applyToolOutputTo(
  parts: ChatPart[],
  partId: string,
  upd: ToolOutputUpdate,
): ChatPart[] {
  const next = [...parts]
  const idx = next.findIndex(p => p.id === partId)
  const finished = !upd.preliminary
  const failed = upd.state === 'error' || upd.error != null

  if (idx < 0) {
    // Output arrived before the tool-call frame. Keep it: a tool that prints
    // immediately would otherwise lose its first lines.
    next.push({
      id: partId,
      type: 'tool',
      text: '',
      tool: 'tool',
      state: {
        status: finished ? (failed ? 'error' : 'complete') : 'running',
        title: 'tool',
        output: upd.content,
        data: upd.data ?? null,
        error: upd.error ?? null,
        toolState: upd.state ?? null,
      },
    })
    return next
  }

  const p = next[idx]
  const old = p.state ?? { status: '', title: '' }
  next[idx] = {
    ...p,
    state: {
      ...old,
      status: finished ? (failed ? 'error' : 'complete') : 'running',
      output: upd.content,
      error: upd.error ?? (finished ? old.error : null) ?? null,
      data: upd.data ?? old.data ?? null,
      changeId: upd.changeId ?? old.changeId ?? null,
      diff: upd.diff ?? old.diff ?? null,
      additions: upd.additions ?? old.additions ?? null,
      deletions: upd.deletions ?? old.deletions ?? null,
      // How the call ended, kept separate from the text so the card can say
      // "stopped after N lines" rather than pretending it failed.
      toolState: upd.state ?? old.toolState ?? null,
    },
  }
  return next
}

/** Build the file part for a streamed `file`/`reasoning-file` event. Returns
 *  null when the event carries no usable code. */
export function filePartFrom(params: Record<string, unknown>): ChatPart | null {
  const code = params['code'] as string | undefined
  if (code == null || code === '') return null
  return {
    id: `f${code}`,
    type: 'file',
    text: '',
    tool: '',
    code,
    name: (params['name'] as string | undefined) ?? null,
    mime: (params['mediaType'] as string | undefined) ?? null,
    size: params['size'] != null ? Number(params['size']) : null,
    width: params['width'] != null ? Number(params['width']) : null,
    height: params['height'] != null ? Number(params['height']) : null,
    durationMs:
      params['durationMs'] != null
        ? Number(params['durationMs'])
        : params['duration_ms'] != null
          ? Number(params['duration_ms'])
          : null,
    thumbCode:
      (params['thumbCode'] as string | undefined) ??
      (params['thumb_code'] as string | undefined) ??
      null,
    thumbhash: (params['thumbhash'] as string | undefined) ?? null,
  }
}
