// Cards for the sandbox tools.
//
// WHY THESE EXIST: `sandbox-job-start` in particular carries the most consequential payload in the
// product — a PROGRAM somebody wrote, the language it runs in, and what it printed — and it rendered
// as a JSON dump. The program is code: it deserves numbers and a fixed-width block, not a quoted
// string with escaped newlines.
//
// EVERY FIELD READ HERE WAS CHECKED AGAINST THE GO SIDE. `sandbox-job-start` returns
// `{content, meta:{jobId, exitCode, state, view}}` where `content` is the process output; a card that
// reads a field nobody sets is indistinguishable from no card at all, which is how this file would
// fail silently.
//
// The `lang` argument is shown as a FIELD rather than buried in the arguments JSON, because it is the
// one thing a reader most needs to check: the same text means different things in bash and PowerShell,
// and the engine deliberately refuses to guess.

import { type CardHandler, field, fields, n, s } from './shared'

/** The first line of the tool's text, for a header that says what happened at a glance. */
function firstLine(text: string): string {
  const line = (text.split('\n')[0] ?? '').trim()
  return line.length > 90 ? `${line.slice(0, 90)}…` : line
}

const jobStart: CardHandler = ({ tool, data, input, output, error }) => {
  if (tool !== 'sandbox-job-start') return null
  const program = s(input, 'command') || s(input, 'program')
  const lang = s(input, 'lang')
  const mode = s(input, 'mode')
  const jobId = s(data, 'jobId')
  const exitCode = n(data, 'exitCode')
  const state = s(data, 'state')
  const workdir = s(input, 'workdir')

  return {
    subtitle: lang ? `${lang}${mode ? ` (${mode})` : ''}` : 'sandbox',
    input: {
      fields: fields(
        field('terminal', 'tcLanguage', lang, { mono: true }),
        field('folder', 'tcWorkdir', workdir, { mono: true }),
        field('tag', 'tcMode', mode, { mono: true }),
      ),
      // THE PROGRAM, NUMBERED. A window's start line is 1 here because this is the whole program the
      // caller sent — there is no larger file it came from.
      body: program
        ? { kind: 'code', name: '', text: program, startLine: 1 }
        : undefined,
    },
    result: {
      fields: fields(
        field('check', 'tcJob', jobId, { mono: true }),
        field(
          'info',
          'tcExit',
          exitCode === 0 ? '0' : String(exitCode ?? ''),
          exitCode === 0 ? undefined : { tone: 'destructive' },
        ),
        field('info', 'tcState', state, { mono: true }),
      ),
      // A FAILURE IS SHOWN AS THE FAILURE, in the destructive tone, and the output — which is usually
      // empty on a refusal — is not drawn as an empty block.
      body: error
        ? { kind: 'text', text: error, tone: 'destructive' }
        : output
          ? { kind: 'code', name: '', text: output }
          : undefined,
    },
  }
}

const jobOutput: CardHandler = ({ tool, data, output }) => {
  if (tool !== 'sandbox-job-output') return null
  const jobId = s(data, 'jobId')
  const total = n(data, 'totalLines')
  return {
    subtitle: total ? `${total} lines` : 'sandbox',
    input: { fields: fields(field('check', 'tcJob', jobId, { mono: true })) },
    result: {
      fields: [],
      body: output ? { kind: 'code', name: '', text: output } : undefined,
    },
  }
}

const jobWait: CardHandler = ({ tool, data, output }) => {
  if (tool !== 'sandbox-job-wait') return null
  const jobId = s(data, 'jobId')
  const exitCode = n(data, 'exitCode')
  return {
    subtitle: s(data, 'state'),
    input: { fields: fields(field('check', 'tcJob', jobId, { mono: true })) },
    result: {
      fields: fields(
        field('info', 'tcExit', exitCode === 0 ? '0' : String(exitCode ?? ''), {
          tone: exitCode === 0 ? undefined : 'destructive',
        }),
      ),
      body: output ? { kind: 'code', name: '', text: output } : undefined,
    },
  }
}

const jobKill: CardHandler = ({ tool, data }) => {
  if (tool !== 'sandbox-job-kill') return null
  return {
    subtitle: 'sandbox',
    input: {
      fields: fields(field('check', 'tcJob', s(data, 'jobId'), { mono: true })),
    },
    result: { fields: fields(field('info', 'tcState', s(data, 'state'))) },
  }
}

const info: CardHandler = ({ tool, data }) => {
  if (tool !== 'sandbox-info') return null
  const langs = Array.isArray(data['langs'])
    ? (data['langs'] as unknown[]).map(String).join(', ')
    : s(data, 'langs')
  return {
    subtitle: [s(data, 'os'), s(data, 'arch')].filter(Boolean).join('/'),
    input: { fields: [] },
    result: {
      fields: fields(
        field('folder', 'tcWorkspace', s(data, 'workspace'), { mono: true }),
        field('home', 'tcHome', s(data, 'home'), { mono: true }),
        // THE LANGUAGES, because this list is the answer to "what do I pass as lang" — the reason
        // sandbox-info exists at all.
        field('terminal', 'tcLanguages', langs, { mono: true }),
      ),
    },
  }
}

const filePatch: CardHandler = ({ tool, input, output, error }) => {
  if (tool !== 'sandbox-file-patch') return null
  const patch = s(input, 'patch')
  return {
    subtitle: firstLine(output || error || 'patch'),
    input: {
      fields: [],
      // A PATCH IS CODE, and its shape IS its meaning: the `+`/`-` prefixes and the `***` markers are
      // what a reader checks. Numbers let a "hunk 2 failed" message be found.
      body: patch
        ? { kind: 'code', name: '', text: patch, startLine: 1 }
        : undefined,
    },
    result: {
      fields: [],
      body: error
        ? { kind: 'text', text: error, tone: 'destructive' }
        : output
          ? { kind: 'text', text: output }
          : undefined,
    },
  }
}

export const sandboxHandlers = [
  info,
  jobStart,
  jobOutput,
  jobWait,
  jobKill,
  filePatch,
]
