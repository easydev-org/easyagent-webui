// Cards for the bundled tools — the ones the agent ships with, whose payload shapes this app can
// know at build time.
//
// Each handler returns null for "not mine", so the registry can simply walk a list. Every handler is
// written against the payload the tool ACTUALLY returns (checked against the Go side), because a
// card that reads a field nobody sets is indistinguishable from no card at all.

import {
  arr,
  type CardCtx,
  type CardHandler,
  field,
  fields,
  firstLine,
  humanBytes,
  n,
  s,
  stripLineNumbers,
} from './shared'

// ---- files ----

const fileInfo: CardHandler = ({ tool, data, input }) => {
  if (tool !== 'file-info') return null
  const code = s(data, 'code') || s(input, 'code')
  return {
    subtitle: 'fileInfo',
    input: { fields: fields(field('file', 'tcFile', code, { mono: true })) },
    result: {
      fields: fields(
        field('file', 'tcName', s(data, 'name')),
        field('file', 'tcMime', s(data, 'mime'), { mono: true }),
        field('database', 'tcSize', humanBytes(n(data, 'size'))),
        // The digest is long and meaningless at a glance; kept in a mono row so it can be compared,
        // not read.
        field('checks', 'tcSha256', s(data, 'sha256').slice(0, 16), {
          mono: true,
        }),
      ),
    },
  }
}

const fileRead: CardHandler = ({ tool, data, input, output }) => {
  if (tool !== 'file-read') return null
  const code = s(data, 'code') || s(input, 'code')
  const offset = n(data, 'offset')
  const lines = n(data, 'lines')
  return {
    subtitle: 'fileRead',
    input: {
      fields: fields(
        field('file', 'tcFile', code, { mono: true }),
        field('list', 'tcOffset', n(input, 'offset')),
        field('list', 'tcLimit', n(input, 'limit')),
      ),
    },
    result: {
      fields: fields(
        field('list', 'tcLines', lines),
        // The gutter is chrome for the model; on a card it is noise on every line.
        field('list', 'tcFrom', offset + 1),
      ),
      body: output
        ? {
            kind: 'code',
            name: code,
            text: stripLineNumbers(output),
            startLine: offset + 1,
          }
        : undefined,
    },
  }
}

// ---- todo ----

const todoWrite: CardHandler = ({ tool, data, input }) => {
  if (tool !== 'todo-write' && tool !== 'todowrite') return null
  // The RESULT carries the stored rows; the input carries what was asked for. They agree, so the
  // result is preferred — it is what the session now holds.
  const raw = arr<Record<string, unknown>>(data, 'todos').length
    ? arr<Record<string, unknown>>(data, 'todos')
    : arr<Record<string, unknown>>(input, 'todos')
  const total = raw.length
  const done = raw.filter(t => {
    const st = (s(t, 'Status') || s(t, 'status')).toLowerCase()
    return st === 'completed' || st === 'cancelled'
  }).length
  return {
    subtitle: 'todos',
    input: { fields: fields(field('todo', 'tcCount', total)) },
    result: {
      // The checklist itself is drawn by the card component when the tool is todo-write; here only
      // the counts belong, so a collapsed card still says something useful.
      fields: fields(
        field('todo', 'tcTotal', total),
        field('success', 'tcDone', done, {
          tone: done === total && total > 0 ? 'success' : undefined,
        }),
        field('clock', 'tcRemaining', total - done),
      ),
    },
  }
}

// ---- history ----

interface HistoryEntry {
  role?: string
  content?: string
  tool_name?: string
  created_at?: string
  /** The message's position in the conversation; the only address the tools print. */
  seq?: number
}

const history: CardHandler = ({ tool, data, input }) => {
  // `history-range-read` replaced `history-range`, whose window was measured from the tip and moved
  // as messages arrived. Keep the old name so an older transcript still renders.
  if (tool !== 'history-search' && tool !== 'history-range-read' && tool !== 'history-range')
    return null
  const entries = arr<HistoryEntry>(data, 'entries')
  return {
    subtitle: 'history',
    input: {
      fields: fields(
        field('compass', 'tcQuery', s(input, 'query') || s(input, 'search')),
        field('clock', 'tcStart', s(input, 'start')),
        field('clock', 'tcEnd', s(input, 'end')),
        field('list', 'tcLimit', n(input, 'limit')),
      ),
    },
    result: {
      fields: fields(field('history', 'tcEntries', entries.length)),
      body: entries.length
        ? {
            kind: 'messages',
            entries: entries.map(e => ({
              role: e.role ?? '',
              content: e.content ?? '',
              tool_name: e.tool_name,
              created_at: e.created_at,
              seq: e.seq,
            })),
          }
        : undefined,
    },
  }
}

// ---- web ----

const webFetch: CardHandler = ({ tool, data, input, output }) => {
  if (tool !== 'web-fetch') return null
  const url = s(data, 'url') || s(input, 'url')
  return {
    subtitle: 'webFetch',
    input: {
      fields: fields(
        field('cloud_down', 'tcUrl', url, { mono: true }),
        field('braces', 'tcFormat', s(input, 'format')),
      ),
    },
    result: {
      fields: fields(
        field('braces', 'tcContentType', s(data, 'contentType'), {
          mono: true,
        }),
        field('list', 'tcLength', humanBytes(output.length)),
      ),
      // Fetched pages are markdown or text already; rendering as markdown is what makes a fetched
      // README readable instead of a wall of asterisks.
      body: output ? { kind: 'markdown', text: output } : undefined,
    },
  }
}

// ---- media generation ----

interface StoredFile {
  code?: string
  mime?: string
  name?: string
  bytes?: number
}

/** Shared by every generation tool: they all return `{ files, model }`. */
function mediaCard(
  label: string,
  subtitleKey: string,
  opts: { audio?: boolean } = {},
): CardHandler {
  return ({ tool, data, input, output }) => {
    if (tool !== label) return null
    const files = arr<StoredFile>(data, 'files')
    const first = files[0]
    const model = s(data, 'model')
    const prompt = s(input, 'prompt')
    return {
      subtitle: subtitleKey,
      input: {
        fields: fields(
          field('asterisk', 'tcPrompt', firstLine(prompt, 60)),
          field('cpu', 'tcModel', model, { mono: true }),
          field('code', 'tcReference', s(data, 'source') || s(data, 'reference'), { mono: true }),
        ),
      },
      result: {
        fields: fields(
          field('list', 'tcFiles', files.length),
          field('database', 'tcSize', humanBytes(files.reduce((a, f) => a + (f.bytes ?? 0), 0))),
        ),
        body: first
          ? opts.audio
            ? { kind: 'audio', code: first.code ?? '', caption: first.name }
            : files.length === 1
              ? {
                  kind: 'media',
                  code: first.code ?? '',
                  mime: first.mime,
                  name: first.name,
                }
              : {
                  kind: 'files',
                  files: files.map(f => ({
                    code: f.code ?? '',
                    mime: f.mime,
                    name: f.name,
                  })),
                }
          : output
            ? { kind: 'text', text: output }
            : undefined,
      },
    }
  }
}

// ---- groups ----
//
// THE CROSS-SESSION TOOLS ARE group-create / spawn / group-send NOW. `subsession-create` and
// `mail-send` are gone from the agent, so cards that matched them could never fire — a handler whose
// `tool !==` guard can never be false is dead weight that reads as a supported feature.

const groupCreate: CardHandler = ({ tool, data, input, output }) => {
  if (tool !== 'group-create') return null
  return {
    subtitle: 'group',
    input: {
      fields: fields(field('group', 'tcGroup', s(input, 'name'), { mono: true })),
    },
    result: {
      fields: fields(field('group', 'tcGroup', s(data, 'group'), { mono: true })),
      body: output ? { kind: 'text', text: output } : undefined,
    },
  }
}

const spawn: CardHandler = ({ tool, data, input, output }) => {
  if (tool !== 'spawn') return null
  return {
    subtitle: 'spawn',
    input: {
      fields: fields(
        field('chat', 'tcDescription', firstLine(s(input, 'task') || s(input, 'name'), 60)),
      ),
    },
    result: {
      // THE ID IS SHOWN because that is what group-send takes; the name is only a label.
      fields: fields(
        field('group', 'tcGroup', s(data, 'group'), { mono: true }),
        field('robot', 'tcSession', s(data, 'worker'), { mono: true }),
        field('bot', 'tcDescription', firstLine(s(data, 'name'), 60)),
      ),
      body: output ? { kind: 'text', text: output } : undefined,
    },
  }
}

const groupSend: CardHandler = ({ tool, data, input, output }) => {
  if (tool !== 'group-send') return null
  const to = arr<string>(data, 'to')
  const inputTo = arr<string>(input, 'to')
  const recipients = to.length ? to : inputTo
  return {
    subtitle: 'group',
    input: {
      fields: fields(field('group', 'tcGroup', s(input, 'group'), { mono: true })),
    },
    result: {
      fields: fields(
        field('group', 'tcGroup', s(data, 'group'), { mono: true }),
        field('inbox', 'tcTo', recipients.join(', '), { mono: true }),
      ),
      body: output ? { kind: 'text', text: output } : undefined,
    },
  }
}

/** In match order. A tool listed twice would shadow the second entry, so keep it unique. */
export const bundledHandlers: CardHandler[] = [
  fileInfo,
  fileRead,
  todoWrite,
  history,
  webFetch,
  mediaCard('image-generate', 'imageGenerate'),
  mediaCard('image-edit', 'imageEdit'),
  mediaCard('video-generate', 'videoGenerate'),
  mediaCard('tts-generate', 'ttsGenerate', { audio: true }),
  mediaCard('tts-clone', 'ttsClone', { audio: true }),
  groupCreate,
  spawn,
  groupSend,
]

export type { CardCtx }
