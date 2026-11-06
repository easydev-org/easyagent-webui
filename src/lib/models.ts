/** Bundled fallback copy of the server capability matrix (canonical api
 * types only). Used until ListProvidersCatalog answers; the server response
 * overrides it. */
export const FALLBACK_API_TYPE_CAPABILITIES: Record<string, string[]> = {
  'openai-compatible': ['text', 'embedding', 'image', 'speech', 'transcription', 'realtime'],
  openai: ['text', 'embedding', 'image', 'speech', 'transcription', 'realtime'],
  anthropic: ['text'],
  deepseek: ['text'],
  google: ['text'],
  'vercel-compatible-gateway': [
    'text',
    'image',
    'video',
    'speech',
    'transcription',
    'embedding',
    'rerank',
    'realtime',
  ],
  cohere: ['text', 'rerank'],
}

/** The 8 first-class modalities, in section order. */
export const kModelCapabilities = [
  'text',
  'image',
  'video',
  'speech',
  'transcription',
  'embedding',
  'rerank',
  'realtime',
] as const

// Domain models — direct port of flutter/lib/models.dart (the subset the UI
// uses; legacy container/ops models are intentionally omitted).

export interface Session {
  /** The session's identity AND address: random, immutable, what every RPC takes. */
  id: string
  /**
   * The DISPLAY label. Not unique, editable, and not an address.
   *
   * EMPTY FALLS BACK TO THE ID, which is why `sessionName()` exists and why nothing should read this
   * field directly: a session created without a label would otherwise render as a blank row.
   */
  name: string
  org: string
  repo: string
  branch: string
  /** Canonical model reference "provider_id/model_id". */
  model: string
  /** Selected reasoning variant id ('' = provider default). */
  variant: string
  preset: string
  tipId?: string
  maxTurns?: number
  systemPrompt?: string
  locale?: string
  /** SINGLE-STEP token counters (the cumulative input/output/total fields
   *  7/8/9 were removed in proto #4; a "total" is lastInput + lastOutput). */
  lastInputTokens?: number
  lastOutputTokens?: number
  createdAt: string
  updatedAt: string
  unreadCount?: number
  lastMessageAt: string
  lastMessagePreview: string
  /** Monotonic server-owned counter; unread = messageSeq - readSeq. */
  messageSeq: number
  /** Runtime status from the server's run lease: 'busy' while a turn holds it
   *  (including mid-retry), 'idle' otherwise, 'unknown' when the lease could
   *  not be read. Empty on a reply that did not read the lease. */
  status?: 'busy' | 'idle' | 'unknown'
  /** The session's picture as `file:<code>` (empty = derive the identicon). */
  avatarFile?: string
  /** One line describing what this session is, injected into the turn's <env>. */
  intro?: string
}

/**
 * sessionName is what to SHOW for a session.
 *
 * THREE SOURCES, IN ORDER: an explicit org/repo/branch label (a git-backed session describes itself
 * better than any user-typed name), then the user's display name, then the id as a last resort. The id
 * is opaque, so showing it is a fallback rather than a choice — but a blank row is worse, and a session
 * created without a label is a legal state.
 */
export function sessionName(s: Session): string {
  if (s.org) return `${s.org}:${s.repo}:${s.branch}`
  return s.name || s.id
}

// ---- messages ----

export interface ToolState {
  status: string // pending | running | complete | error
  title: string
  input?: Record<string, unknown> | null
  output?: string | null
  error?: string | null
  data?: Record<string, unknown> | null
  changeId?: string | null
  diff?: string | null
  additions?: number | null
  deletions?: number | null
  /** Raw streamed tool-argument JSON (tool-input-delta), shown live until the
   *  complete `input` arrives with `tool-call`. */
  inputText?: string | null
  /** How the tool call ENDED: "ok" | "timeout" | "cancelled" | "error".
   *
   *  Separate from `status`, which is about rendering: a call that stopped early
   *  after printing twenty useful lines is complete-ish (status "complete") but
   *  its `toolState` is "timeout" — the card should say so instead of pretending
   *  the tool failed or that it finished cleanly.
   *
   *  This text never reaches the model; only the final result does. */
  toolState?: string | null
}

export interface MessagePart {
  id: string
  type: string // text | reasoning | tool | compaction | file | tool_result
  text?: string | null
  tool?: string | null
  toolCallId?: string | null
  state?: ToolState | null
  metadata?: Record<string, unknown> | null
  /**
   * A CHANNEL EVENT (`type='channel'`): the message a session heard, as the object it was.
   *
   * The `text` part beside it is the PROMPT RENDERING written for the model; this is the message itself, so the
   * console can draw what was said instead of the envelope it was wrapped in.
   */
  channel?: string | null
  topic?: string | null
  group?: string | null
  from?: string | null
  fromName?: string | null
  // Compaction (`type='compaction'`) display metadata.
  compactionReason?: 'manual' | 'overflow' | null
  foldedCount?: number | null
  foldedTokens?: number | null
  code?: string | null
  name?: string | null
  mime?: string | null
  size?: number | null
  // Server-derived media facts (may be absent until the agent's media probe
  // finishes, or for non-media files).
  width?: number | null
  height?: number | null
  durationMs?: number | null
  thumbCode?: string | null
  thumbhash?: string | null
}

export interface Message {
  id: string
  role: string
  parts: MessagePart[]
  createdAt?: string | null
  prevId: string
  /** ORIGIN of the message ('' for agent-authored rows): `user`,
   *  `session:{name}`, `system:{name}`, or extension-defined. */
  source: string
}

// ---- attachments ----

export interface UploadedFileSource {
  path: string
  name: string
  mimeType: string
  bytes?: Uint8Array | null
}

export type UploadState = 'idle' | 'uploading' | 'done' | 'error'

/** Server-side record for an uploaded file, or a LOCAL pending attachment. */
export interface UploadedFile {
  code: string
  name?: string | null
  mime?: string | null
  size?: number | null
  sha256?: string | null
  deduped: boolean
  localPath: string
  uploadState: UploadState
  error?: string | null
  /** Upload progress 0..100 while `uploadState === 'uploading'`; -1 when the
   *  total is not yet known. Byte-level (XHR upload progress), not a timer. */
  uploadPct?: number | null
}

export function isUploading(f: UploadedFile): boolean {
  return f.uploadState === 'uploading'
}
export function hasUploadError(f: UploadedFile): boolean {
  return f.uploadState === 'error'
}

export interface ChatDraft {
  text: string
  attachments: UploadedFile[]
}

// ---- chat streaming domain ----

export interface ChatPart {
  id: string
  type: string
  text: string
  tool: string
  state?: ToolState | null
  code?: string | null
  name?: string | null
  mime?: string | null
  size?: number | null
  width?: number | null
  height?: number | null
  durationMs?: number | null
  thumbCode?: string | null
  thumbhash?: string | null
  /**
   * A CHANNEL EVENT (`type='channel'`): the message a session heard, as the object it was.
   *
   * The `text` part beside it is the PROMPT RENDERING written for the model; this is the message itself, so the
   * console can draw what was said instead of the envelope it was wrapped in.
   */
  channel?: string | null
  topic?: string | null
  group?: string | null
  from?: string | null
  fromName?: string | null
  // Compaction (`type='compaction'`) display metadata.
  compactionReason?: 'manual' | 'overflow' | null
  foldedCount?: number | null
  foldedTokens?: number | null
}

/** A single produced-file descriptor, as emitted by tools in
 *  `data.files` and by the built-in media tools. */
export interface FileRef {
  code: string
  name?: string | null
  mime?: string | null
  size?: number | null
  width?: number | null
  height?: number | null
  durationMs?: number | null
  thumbCode?: string | null
  thumbhash?: string | null
  /** UI-only: a local object URL for a not-yet-uploaded attachment. When set
   *  the viewer uses it directly instead of fetching the code from the agent. */
  localUrl?: string | null
}

export interface ChatMessage {
  id: string
  role: string
  /** `sending` = optimistic user bubble awaiting the backend `message-added`
   *  event (left spinner, actions hidden). */
  status: 'sending' | 'streaming' | 'complete' | 'error'
  parts: ChatPart[]
  createdAt: string
  seq?: number | null
  /** Server chain pin; '' for local-only messages. */
  prevId: string
  /** Client-only bubble (optimistic user msg / streaming assistant). */
  isLocal: boolean
  /** ORIGIN of the message: `user`, `session:{name}`, `system:{name}`, or
   *  extension-defined. '' for agent-authored rows. */
  source: string
  /** For a local `role:'error'` bubble only: what failed, so the card can
   *  label it. `send` = the prompt RPC failed; `model` = an upstream/model
   *  error surfaced on the stream. Never persisted. */
  errorKind?: 'send' | 'model'
  /** Server-assigned id for an optimistic bubble, learned from the Prompt
   *  `accepted` response. Kept separate from `id` (the stable local key) so
   *  the optimistic bubble and its persisted copy can coexist until the
   *  backend `message-added` event lets `mergeServer` drop the former. */
  serverId?: string
  /** Set while a transient provider failure is being retried (the server
   *  announced a `retry` for this streaming step). Drives a subtle "retrying"
   *  indicator; cleared by the next delta or the step's terminal event. */
  retrying?: { attempt: number; delayMs: number }
}

// ---- mailbox ----

export interface MailboxEntry {
  id: string
  msgType: string
  /** ORIGIN of the message: `user`, `session:{name}`, `system:{name}`, or an
   *  extension-defined value. */
  source: string
  payload: string
  effectiveAt?: string | null
  status: string
  createdAt: string
  consumedAt?: string | null
}

// ---- presets / tools ----

export interface Preset {
  id: string
  systemPrompt: string
  systemPromptI18n: Record<string, string>
  tools: string[]
  maxTurns: number
  isSystem: boolean
}

export interface ToolConfigField {
  key: string
  label: string
  type: string // select-provider | select-model | text | number
  placeholder: string
  dependsOnProvider?: string | null
}

export interface ToolConfig {
  name: string
  // string | number | boolean | enum | json | list | object
  //
  // `list`/`object` carry `fields` (their shape) and are rendered as a real
  // form. `json` with no fields is the FALLBACK: a raw blob in a textarea.
  type: string
  /** `value` (ordinary knob) or `model` (a provider_id/model_id reference). */
  kind: string
  /** When kind == 'model': the modality the reference must match. */
  capability: string
  enumValues: string[]
  defaultValue?: unknown
  description: string
  scope: string // global | session
  /**
   * The shape of a structured knob: the keys of an object, or of each list item
   * when itemType == 'object'. Empty = untyped (json fallback).
   */
  fields?: ConfigFieldSchema[] | null
  /** Element type when type == 'list'. */
  itemType?: string
  minItems?: number
  maxItems?: number
  /**
   * The namespace this knob's stored value is scoped to ('' = extension-level).
   *
   * It is part of the storage ADDRESS, so a write must send it back or it lands
   * in a different cell than the read used.
   */
  namespace?: string
}

/**
 * ConfigFieldSchema is one key of a structured config value.
 *
 * It is what lets the console render a form instead of a JSON textarea: `enum`
 * becomes a picker (os -> linux|windows|macos|android), `kind: 'secret'` a masked
 * input, `format: 'uri'` a URL field. `fields` nests one level for an object.
 */
export interface ConfigFieldSchema {
  name: string
  type: string // string | number | boolean | enum | json | object
  kind: string // value | secret
  format: string // uri | host | path | email | duration | semver
  enumValues: string[]
  defaultValue?: string | null
  required: boolean
  description: string
  fields?: ConfigFieldSchema[] | null
}

/**
 * ExtensionNamespace is one declared grouping of an extension's tools and
 * config (pvc, build, storage, ...).
 *
 * The ORDER the extension declares is preserved: it reflects how the extension
 * is actually used, which an alphabetical sort would lose.
 */
export interface ExtensionNamespace {
  name: string
  description: string
}

/** One tool plus the namespace it belongs to ('' = ungrouped). */
export interface ExtensionToolInfo {
  name: string
  namespace: string
  description: string
}

export interface ToolInfo {
  name: string
  description: string
  category: string
  parameters?: Record<string, unknown> | null
  configFields?: ToolConfigField[] | null
  config?: ToolConfig[] | null
  requiredConfig: string[]
  /**
   * What CALLING this tool does, independent of who may call it.
   *
   * SEPARATE FROM PERMISSIONS. `requires` says whether the session may call it; this says what happens
   * once it does — so a user can be told "this one only reads" without having to open the extension.
   *
   *   'none'    nothing changes
   *   'low'     only the caller's own state changes
   *   'medium'  state others already depend on changes
   *   'high'    an asset is consumed
   *
   * REQUIRED. The agent does not register a tool that omits it, so a tool without one cannot reach this
   * type — and a client that tolerated its absence would hide exactly the defect the server refuses.
   */
  effect: ToolEffect
}

export type ToolEffect = 'none' | 'low' | 'medium' | 'high'

/** Whether a call at this effect should be confirmed before it runs. */
/**
 * Whether a tool with this effect asks for confirmation before running.
 *
 * THERE IS NO FALLBACK LEVEL. The agent refuses to register a tool whose effect is missing or invalid, so
 * a tool in this list always carries one — an unknown value here means the client and the server disagree
 * about the protocol, which is a bug to surface rather than a level to guess. Guessing `high` would have
 * made every such bug look like a cautious UI instead of a mismatch.
 */
export function effectNeedsConfirmation(e: ToolEffect): boolean {
  switch (e) {
    case 'none':
    case 'low':
      return false
    case 'medium':
    case 'high':
      return true
  }
}

/** A discovered extension's whole config surface (not per-tool). */
export interface ExtensionInfo {
  extId: string
  version: string
  capabilities: string[]
  tools: string[]
  configFields: ToolConfig[]
  /** Declared groupings, in the author's order. */
  namespaces: ExtensionNamespace[]
  /** Each tool with its namespace ('' = ungrouped). */
  toolsDetailed: ExtensionToolInfo[]
}

// ---- providers / models ----

export interface ProviderModel {
  id: string
  name: string
  /** >0 text model; 0 = multimodal (gateway superset). */
  contextLimit?: number | null
  modelType: string
}

export interface ProviderInfo {
  providerId: string
  /** The single modality this provider serves (semantic grouping). */
  capability: string
  apiType: string
  baseUrl: string
  apiKey: string
  headers?: Record<string, string> | null
  models: ProviderModel[]
}

export interface ProviderDraft {
  originalId: string | null
  id: string
  capability: string
  apiType: string
  baseUrl: string
  apiKey: string
  models: ProviderModel[]
}

export function draftFromProvider(p: ProviderInfo): ProviderDraft {
  return {
    originalId: p.providerId,
    id: p.providerId,
    capability: p.capability,
    apiType: p.apiType,
    baseUrl: p.baseUrl,
    apiKey: p.apiKey,
    models: [...p.models],
  }
}

export interface ModelVariantInfo {
  id: string
  name: string
  description: string
}

export interface ModelInfo {
  id: string
  name: string
  providerId: string
  contextLimit?: number | null
  reasoning?: boolean
  toolCall?: boolean
  variants: ModelVariantInfo[]
}

/** The canonical "provider_id/model_id" reference for a model row. */
export function modelRefOf(m: ModelInfo): string {
  return m.providerId ? `${m.providerId}/${m.id}` : m.id
}

// ---- backends (saved connections) ----

export interface BackendCfg {
  name: string
  baseUrl: string
  token: string
  /** Human username (tenant name) resolved from the token at connect/switch
   *  time via AgentService.GetIdentity. Absent for legacy entries. */
  username?: string
}

/** The caller's resolved identity (from its bearer token). */
export interface Identity {
  tenant: string
  tenantName: string
  role: 'tenant' | 'admin'
  /**
   * Admin scope: `'*'` (the platform admin) or a subtree root id (a delegated admin). Empty for a
   * tenant.
   *
   * IT IS ON THE WIRE AND WAS MISSING HERE. `GetIdentityResponse` has carried `scope` since the
   * delegated-admin feature landed; this interface did not, so the only way to read it was to declare
   * it inline at the call site — which is what `App.svelte` did, and why the compiler was the only
   * thing that noticed the field was missing.
   */
  scope: string
}

/**
 * One permission a session holds.
 *
 * A permission is a (capability, params) pair, so a session may hold several grants of the
 * same capability with different params — "merge in this repository" and "merge in that
 * one" are separate authorisations, each revocable on its own.
 *
 * `params` is the extension's own JSON text. This console NEVER parses it to make decisions:
 * it renders it through the extension's declared schema and shows it back. Whether a grant
 * covers a call is decided by the extension, which is the only side that knows what a
 * "repository" is.
 */
export interface SessionGrant {
  /** Handle for revoking THIS instance. */
  id: string
  extId: string
  capability: string
  /** JSON text whose shape the extension declared. Empty for a boolean capability. */
  params: string
  /** read | write | destructive — presentation only; drives the warning in the UI. */
  risk: string
  /**
   * The object this grant is narrowed to, or empty for everywhere.
   *
   * `group:<id>` FOR THE GROUP CAPABILITIES. Without showing it, three rows saying `group.spawn` look like three
   * copies of one permission, and a reader cannot tell that granting one group does not grant another.
   */
  scope: string
  grantedAt: string
  /** "user" | "auto:fork:<parent>" | "auto:preset:<name>" | "auto:create:<session>". */
  grantedBy: string
}

/**
 * Denial is one capability a session was refused in the last day.
 *
 * A REFUSAL IS A FACT ABOUT AN ATTEMPT, not about a permission: the session asked for something it
 * holds no grant for, and was told so. This row exists so the reader can turn that into a grant
 * without hunting through a transcript for which capability was missing.
 */
export interface Denial {
  extId: string
  /** The capability key a grant is made against. */
  capability: string
  /** One tool that was refused for it, most recently — easier to recognise than a capability key. */
  tool: string
  /** Unix milliseconds. First is the original sighting, not the most recent one. */
  firstAt: number
  lastAt: number
  /** How many refusals folded into this row. */
  count: number
}

/** One permission an extension declares, as published in its manifest. */
export interface PermissionDecl {
  /**
   * The extension this declaration belongs to.
   *
   * IT WAS MISSING FROM THIS TYPE while api.ts has always populated it, because the panel groups
   * grants by extId and looks declarations up by (extId, key) — the field was used in three places and
   * declared in none. Nothing failed until a new caller tried to pass a declaration onward to
   * createGrant, which needs the extension.
   */
  extId: string
  key: string
  label: string
  descriptions: Record<string, string>
  risk: string
  /** Shape of one grant's params, using the SAME schema as config knobs. */
  paramsFields: ConfigFieldSchema[]
}

/**
 * One channel a session follows.
 *
 * `pattern` is a NATS subject filter WITHIN the channel, so a user can follow one
 * repository's tags ("tag.agentdev/mrflow.>") instead of every tag in the world. `wake`
 * decides whether a matching message starts a turn or only lands in the session's context.
 */
export interface ChannelSubscription {
  id: string
  channel: string
  pattern: string
  wake: boolean
  /** The built-in session-channel subscription: how anything reaches this session. */
  system: boolean
}

/** One channel an extension declares it publishes to. */
export interface ChannelDecl {
  extId: string
  name: string
  description: string
  descriptions: Record<string, string>
  /** Documented topic shapes, e.g. "tag.owner/repo.v1.2.3". Documentation only. */
  topics: {
    pattern: string
    description: string
    descriptions: Record<string, string>
  }[]
}

/** Display name for a connection. The webui is served same-origin with the
 *  agent, so the host no longer distinguishes accounts; fall back to the host
 *  (useful for the `?base=` dev override) and let callers prefer a custom name. */
export function backendNameFor(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname
  } catch {
    return baseUrl
  }
}

// ---- groups ----

/**
 * A group: a named set of sessions that can see each other, with ONE coordinator that receives what a user
 * says to the group and hands pieces to members.
 *
 * THE ROLE IS A ROUTING FACT, not a permission tier: the coordinator is where the group's messages arrive.
 */
export interface Group {
  /** The group's identity: random and immutable, and what every API takes. */
  id: string
  /** The display label. Unique per tenant, and editable — nothing routes by it. */
  name: string
  avatarFile?: string
  /** One line saying what the group is for (empty = say nothing). */
  intro?: string
  createdBy: string
  createdAt: string
  memberCount: number
  /**
   * The newest message, for the list row — the same preview a session row shows.
   *
   * EMPTY MEANS "nothing was said, or the last few messages carried only files". A row without a preview said how
   * many people were in the group and never what they were talking about.
   */
  lastMessagePreview?: string
  /** When that message was sent; absent for a group with no messages. */
  lastMessageAt?: string
}

/**
 * ReplyObligation is one outstanding debt: a session was asked something in a group and has not answered.
 *
 * OUTSTANDING ONLY on the wire. A reader asking "who has not answered" is not asking for the history of settled ones.
 */
export interface ReplyObligation {
  id: string
  /** The session that owes the answer. */
  session: string
  /** The session it owes, and that a reply must be addressed to. */
  from: string
  seq: number
  messageId: string
  createdAt: string
  /** How many times it has been chased, and when it last was. */
  remindCount: number
  remindedAt?: string
}

export interface GroupMember {
  session: string
  /** 'coordinator' | 'member' */
  role: 'coordinator' | 'member' | string
  /**
   * `busy` while a turn holds this session's run lease ANYWHERE, `idle` otherwise.
   *
   * Read from the shared lease rather than from one replica's active set: a turn runs on one process, and a
   * process-local answer showed "idle" for working sessions on every other one.
   */
  status?: 'busy' | 'idle' | 'unknown' | string
  joinedAt: string
  joinedBy: string
}

/**
 * One message in a group's transcript.
 *
 * A GROUP HAS ITS OWN TRANSCRIPT — not an index over member sessions — so a member that joins later can read
 * what was said before it arrived, and a message outlives the departure of everyone who saw it.
 */
export interface GroupMessage {
  id: string
  /** The group's id. The NAME is on `groupName` and is the one current when the page loaded. */
  groupId: string
  /**
   * WHO WROTE THIS: "user" | "session" | "system".
   *
   * A SYSTEM MESSAGE IS THE PLATFORM'S — today, "you were addressed and have not replied". It is neither the user's
   * nor a session's, so it renders as a notice rather than in anybody's bubble.
   */
  kind?: string
  /**
   * WHETHER THIS ASKS OR ANSWERS: "request" | "reply" | empty.
   *
   * A REQUEST LEAVES SOMEONE OWING AN ANSWER; a reply closes that. Empty is a person's message or a system notice.
   */
  intent?: string
  /** The group's display name, for a transcript header. */
  groupName?: string
  /** The sending session's id, or empty when a user posted it. */
  sender: string
  /** The sender's label at the time of sending; survives a later rename. */
  senderName?: string
  body: string
  /** Position within the group, starting at 1. The resume cursor for a watch. */
  seq: number
  createdAt: string
  /**
   * Files posted with the message: a picture, a voice note, a document.
   *
   * EACH ONE IS A `file:<code>` REFERENCE, not bytes. The blob lives once in the tenant's store, so the same
   * recording is not copied for every member who opens the transcript.
   */
  attachments?: FileRef[]
}
