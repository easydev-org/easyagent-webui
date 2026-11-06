// Pure protobuf → UI-model mappers for the agent API, plus the per-file
// ingest uploader and its JSON helpers. No client state — AgentApi composes
// these, and they are independently unit-testable.

import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { IngestFileRequestSchema, IngestFileResponseSchema } from '../gen/agent/v1/agent_pb.js'
import { t } from './i18n.svelte'
import type { GroupMessage, Message, MessagePart, Session, SessionGrant } from './models'

/**
 * Map a grant from the wire.
 *
 * `params` passes through as TEXT, untouched: its shape is the declaring extension's
 * business, and this console only renders it. Parsing it here to "help" would mean this
 * file knowing what a repository is.
 */
export function grantFromPb(g: {
  id: string
  extId: string
  capability: string
  params: string
  risk: string
  grantedAt: string
  grantedBy: string
  scope: string
}): SessionGrant {
  return {
    id: g.id,
    extId: g.extId,
    capability: g.capability,
    params: g.params,
    risk: g.risk,
    scope: g.scope,
    grantedAt: g.grantedAt,
    grantedBy: g.grantedBy,
  }
}

/** An empty grant, for the "create returned nothing" path. */
export function emptyGrant(): SessionGrant {
  return {
    id: '',
    extId: '',
    capability: '',
    params: '',
    risk: '',
    scope: '',
    grantedAt: '',
    grantedBy: '',
  }
}

/** bigint | number | null → number (codegenv2 encodes int64 as bigint). */
export const n = (v: bigint | number | undefined | null): number =>
  v == null ? 0 : typeof v === 'bigint' ? Number(v) : v

export function decodeJson(data: string): Record<string, unknown> {
  if (!data) return {}
  try {
    const v = JSON.parse(data)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** google.protobuf.Value (kind oneof) → plain JSON value. */
export function valueToJson(v: unknown): unknown {
  if (!v || typeof v !== 'object') return null
  const k = (v as { kind?: { case?: string; value?: unknown } }).kind
  if (!k?.case) return null
  switch (k.case) {
    case 'nullValue':
      return null
    case 'numberValue':
    case 'stringValue':
    case 'boolValue':
      return k.value
    case 'listValue':
      return ((k.value as { values?: unknown[] })?.values ?? []).map(valueToJson)
    case 'structValue':
      return structToJson(k.value)
    default:
      return null
  }
}

function structToJson(v: unknown): Record<string, unknown> {
  const fields = (v as { fields?: Record<string, unknown> })?.fields
  if (!fields) return {}
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(fields)) out[k] = valueToJson(val)
  return out
}

export function sessionFromPb(s: import('../gen/agent/v1/agent_pb.js').Session): Session {
  return {
    id: s.id,
    name: s.name,
    org: s.org,
    repo: s.repo,
    branch: s.branch,
    // A SESSION MAY HAVE NO MODEL, and the server sends it as an absent field rather than ''. The console renders
    // that as "not chosen yet" — see the profile page's picker, where the placeholder IS that state.
    model: s.model ?? '',
    variant: s.variant,
    preset: s.preset,
    tipId: s.tipId || undefined,
    maxTurns: s.maxTurns || undefined,
    systemPrompt: s.systemPrompt || undefined,
    locale: s.locale || undefined,
    lastInputTokens: s.lastInputTokens,
    lastOutputTokens: s.lastOutputTokens,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    unreadCount: s.unreadCount,
    lastMessageAt: s.lastMessageAt,
    lastMessagePreview: s.lastMessagePreview,
    messageSeq: s.messageSeq,
    avatarFile: s.avatarFile || undefined,
    intro: s.intro || undefined,
    // 'unknown' (a transient read error) is surfaced so the row shows a
    // distinct badge instead of a misleading idle or a bare gap.
    status:
      s.status === 'busy' || s.status === 'idle' || s.status === 'unknown' ? s.status : undefined,
  }
}

/**
 * Sentinel the agent stores as `last_message_preview` when a session's tip is
 * a compaction checkpoint. Must match `COMPACTION_PREVIEW` in the agent.
 */
export const COMPACTION_PREVIEW = '__compacted__'

/** Localized list label for a preview value (compaction sentinel → label). */
export function previewLabel(preview: string): string {
  return preview === COMPACTION_PREVIEW ? t('historyCompacted') : preview
}

type PbPart = {
  id: string
  messageId: string
  type: string
  data: string
}

type PbMessage = {
  id: string
  role: string
  createdAt: string
  prevId: string
  source: string
  parts: PbPart[]
}

export function messageFromPb(m: PbMessage): Message {
  // Pair each tool call with its result (tool_use_id) so history renders one
  // tool card per call — matching the live stream shape.
  const decoded = m.parts.map(p => [p, decodeJson(p.data)] as const)
  const results: Record<string, Record<string, unknown>> = {}
  for (const [p, d] of decoded) {
    if (p.type === 'tool_result') {
      const id = d['tool_use_id'] as string | undefined
      if (id) results[id] = d
    }
  }
  const parts: MessagePart[] = []
  for (const [p, d] of decoded) {
    switch (p.type) {
      case 'text':
        parts.push({
          id: p.id,
          type: 'text',
          text: (d['text'] as string) || '',
        })
        break
      case 'reasoning':
        parts.push({
          id: p.id,
          type: 'reasoning',
          text: (d['text'] as string) || '',
        })
        break
      case 'summary':
      case 'compaction':
        parts.push({
          id: p.id,
          type: 'compaction',
          text: (d['summary'] as string) || '',
          compactionReason:
            d['reason'] === 'manual' || d['reason'] === 'overflow' ? d['reason'] : null,
          foldedCount: typeof d['folded_count'] === 'number' ? d['folded_count'] : null,
          foldedTokens: typeof d['folded_tokens'] === 'number' ? d['folded_tokens'] : null,
        })
        break
      case 'channel': {
        /**
         * A CHANNEL EVENT, STORED AS THE OBJECT IT WAS.
         *
         * The `text` part beside it is the PROMPT RENDERING — "The user posted to group "release": … [Posted
         * in group …]" — written for the model. Drawing that in a bubble made the console show the envelope and
         * the routing notice as if the reader had typed them.
         *
         * The event carries the message and who sent it, so the console can draw the message itself.
         */
        const data = (d['data'] as Record<string, unknown> | undefined) ?? {}
        parts.push({
          id: p.id,
          type: 'channel',
          text: (data['text'] as string) || '',
          channel: (d['channel'] as string) || '',
          topic: (d['topic'] as string) || '',
          group: (data['group'] as string) || '',
          from: (data['from'] as string) || '',
          fromName: (data['from_name'] as string) || '',
        })
        break
      }
      case 'file':
        parts.push({
          id: p.id,
          type: 'file',
          code: (d['code'] as string) || '',
          name: (d['name'] as string) || '',
          mime: d['mime'] as string | undefined,
          size: d['size'] != null ? Number(d['size']) : undefined,
          width: d['width'] != null ? Number(d['width']) : undefined,
          height: d['height'] != null ? Number(d['height']) : undefined,
          durationMs:
            d['duration_ms'] != null
              ? Number(d['duration_ms'])
              : d['durationMs'] != null
                ? Number(d['durationMs'])
                : undefined,
          thumbCode:
            (d['thumb_code'] as string | undefined) ?? (d['thumbCode'] as string | undefined),
          thumbhash: (d['thumbhash'] as string | undefined) ?? undefined,
        })
        break
      case 'tool': {
        const callId = (d['id'] as string) || p.messageId
        const res = results[callId]
        const content = res?.['content']
        const meta =
          (res?.['meta'] as Record<string, unknown> | undefined) ??
          (res?.['metadata'] as Record<string, unknown> | undefined)
        // A FAILED CALL HAS `state: "error"` AND ITS REASON IN `meta.error` — not in `content`, which is
        // the empty string because the tool printed nothing. This used to set status 'complete'
        // unconditionally and read only `content`, so a refused or crashing tool rendered as a green
        // card with no body: the user saw that a step failed and could not see why.
        const failed = res?.['state'] === 'error' || typeof meta?.['error'] === 'string'
        parts.push({
          id: p.id,
          type: 'tool',
          tool: (d['name'] as string) || '',
          toolCallId: callId,
          state: {
            status: res ? (failed ? 'error' : 'complete') : 'running',
            title: (d['name'] as string) || '',
            input: (d['input'] as Record<string, unknown>) || null,
            output: typeof content === 'string' ? content : null,
            error: typeof meta?.['error'] === 'string' ? (meta['error'] as string) : null,
            data: meta ?? null,
            // How the call ended, so a rebuilt transcript says "timed out" the same
            // way the live one did.
            toolState: (res?.['state'] as string | undefined) ?? null,
          },
        })
        break
      }
      case 'tool_result': {
        const id = (d['tool_use_id'] as string) || p.messageId
        if (results[id] && m.parts.some(q => q.type === 'tool')) break
        const content = d['content']
        const meta =
          (d['meta'] as Record<string, unknown> | undefined) ??
          (d['metadata'] as Record<string, unknown> | undefined)
        // THE ORPHAN CASE — a result with no tool part to pair with. It has the same shape, and the
        // same trap: the reason for a failure lives in meta.error while content is empty.
        const failed = d['state'] === 'error' || typeof meta?.['error'] === 'string'
        parts.push({
          id: p.id,
          type: 'tool',
          tool: '',
          toolCallId: id,
          state: {
            status: failed ? 'error' : 'complete',
            title: '',
            output: typeof content === 'string' ? content : null,
            error: typeof meta?.['error'] === 'string' ? (meta['error'] as string) : null,
          },
        })
        break
      }
    }
  }
  return {
    id: m.id,
    role: m.role,
    createdAt: m.createdAt || null,
    prevId: m.prevId,
    source: m.source,
    parts,
  }
}

/**
 * Connect-unary POST of a pre-serialised protobuf message with upload
 * progress. `Content-Type: application/proto` + a bare message body is exactly
 * what the Connect binary unary protocol is; success returns the response
 * message (also bare protobuf), a Connect error is surfaced as an Error.
 *
 * Falls back to `fallback()` when XHR progress is unusable (no
 * XMLHttpRequest, or the transport refuses the hand-rolled request), so the
 * upload itself can never regress just because progress is unavailable.
 */
export function uploadIngest(
  baseUrl: string,
  token: string,
  body: Uint8Array,
  onProgress: ((done: number, total: number) => void) | undefined,
  fallback: () => Promise<{ code: string; mime: string }>,
): Promise<{ code: string; mime: string }> {
  if (typeof XMLHttpRequest === 'undefined' || onProgress === undefined) {
    return fallback()
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let settled = false
    const useFallback = () => {
      if (settled) return
      settled = true
      fallback().then(resolve, reject)
    }
    try {
      xhr.open('POST', `${baseUrl}/agent.v1.AgentService/IngestFile`, true)
      xhr.responseType = 'arraybuffer'
      xhr.setRequestHeader('Content-Type', 'application/proto')
      xhr.setRequestHeader('Connect-Protocol-Version', '1')
      if (token !== '') xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    } catch {
      useFallback()
      return
    }
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(e.loaded, e.total)
    }
    xhr.onerror = () => useFallback()
    xhr.ontimeout = () => useFallback()
    xhr.onload = () => {
      if (settled) return
      if (xhr.status >= 200 && xhr.status < 300) {
        settled = true
        try {
          const msg = fromBinary(
            IngestFileResponseSchema,
            new Uint8Array(xhr.response as ArrayBuffer),
          )
          resolve({ code: msg.code, mime: msg.mime })
        } catch (e) {
          reject(e)
        }
        return
      }
      // A protocol-level refusal (auth/validation): surface it as an error
      // rather than silently retrying through the fallback transport.
      settled = true
      reject(
        new Error(
          `upload failed: HTTP ${xhr.status} ${
            xhr.response instanceof ArrayBuffer
              ? new TextDecoder().decode(new Uint8Array(xhr.response))
              : ''
          }`.trim(),
        ),
      )
    }
    // Copy into a plain ArrayBuffer to satisfy the XHR body types (TS models
    // Uint8Array's buffer as ArrayBufferLike, which may be a SharedArrayBuffer).
    xhr.send(body.slice().buffer)
  })
}

/** Serialise an IngestFile request to its binary Connect body. */
export function encodeIngestRequest(bytes: Uint8Array, name: string): Uint8Array {
  return toBinary(IngestFileRequestSchema, create(IngestFileRequestSchema, { data: bytes, name }))
}

/**
 * groupFromPb maps a group row.
 *
 * `intro` is the one line saying what the group is for — the same idea as a session's intro, and the reason a
 * woken coordinator does not have to infer its job from the names of the sessions it is writing to.
 */
export function groupFromPb(
  g: import('../gen/agent/v1/agent_pb.js').Group,
): import('./models.js').Group {
  return {
    id: g.id,
    name: g.name,
    avatarFile: g.avatarFile || undefined,
    intro: g.intro || undefined,
    createdBy: g.createdBy,
    createdAt: g.createdAt,
    memberCount: Number(g.memberCount),
    lastMessagePreview: g.lastMessagePreview || undefined,
    lastMessageAt: g.lastMessageAt || undefined,
  }
}

/**
 * groupMessageFromPb maps one transcript row.
 *
 * `sender` IS EMPTY FOR A USER POST, and that is a real value rather than a missing one: the console renders
 * a user's message differently from a session's, and treating "no sender" as an unknown session would put an
 * avatar on something a person typed.
 */
export function groupMessageFromPb(
  m: import('../gen/agent/v1/agent_pb.js').GroupMessage,
): GroupMessage {
  return {
    id: m.id,
    groupId: m.groupId,
    kind: m.kind || undefined,
    groupName: m.groupName || undefined,
    sender: m.sender,
    senderName: m.senderName || undefined,
    body: m.body,
    seq: Number(m.seq),
    createdAt: m.createdAt,
    // AN ATTACHMENT IS A `file:<code>` REFERENCE, the same shape a session message's file part uses — so the
    // same renderer draws both and a picture in a group looks like a picture in a chat.
    attachments: (m.attachments ?? []).map(a => ({
      code: a.code,
      name: a.name || null,
      // THE TYPE THE AGENT DERIVED AT INGEST. Without it the card cannot tell a picture from a document and
      // draws a generic file chip — which is exactly what an attachment without a type used to look like.
      mime: a.mime || null,
      size: Number(a.size) || null,
    })),
  }
}
