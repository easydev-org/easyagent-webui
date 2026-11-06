// What extension UIs this deployment can actually serve.
//
// The agent knows which extensions are REGISTERED (ListExtensions), but not which of them have a
// browser UI: that is a property of the extension's own HTTP surface, and the agent never touches it.
//
// So the question is asked where the answer lives — `GET /ext/<id>/api/v1/ui`, which each extension
// answers with its id, base and title. A 200 means "this extension serves a UI"; anything else means
// it does not, and the extension is left out rather than offered as a broken link.
//
// This also settles "is it available to this tenant?" without a second concept: the same reverse
// proxy and the same bearer token serve that path, so an extension this tenant cannot reach is an
// extension that does not answer.

import type { AgentApi } from './api'

export interface ExtUi {
  /** Extension id — the Service `<id>-ext` and the mount `/ext/<id>`. */
  id: string
  /** What the extension calls itself. */
  title: string
  /** Where it is mounted, as it reported. Used instead of guessing the prefix. */
  base: string
  /** What it is for, keyed by language tag. Empty when the extension declared none. */
  descriptions: Record<string, string>
  /** Absolute URL of the shelf icon, or '' when the extension declared none. */
  icon: string
}

/** The shape an extension answers `/api/v1/ui` with. */
interface UiInfo {
  base?: unknown
  id?: unknown
  title?: unknown
  descriptions?: unknown
  icon?: unknown
}

/**
 * Read the description table, keeping only non-empty strings.
 *
 * The host renders whichever entry matches the reader's language, so a blank entry would be a card
 * with a description slot that is silently empty — worse than having none at all.
 */
function readDescriptions(v: unknown): Record<string, string> {
  if (v === null || typeof v !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && val.trim() !== '') out[k.toLowerCase()] = val
  }
  return out
}

/**
 * Turn the declared icon path into a URL under the mount.
 *
 * The extension serves its own icon, so the host must not assume where it lives: an absolute URL is
 * left alone, and anything else is joined to the base the extension REPORTED — the same value its own
 * assets resolve against.
 */
function resolveIcon(base: string, v: unknown): string {
  if (typeof v !== 'string' || v.trim() === '') return ''
  const path = v.trim()
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path
  const root = base.replace(/\/+$/, '')
  return `${root}/${path.replace(/^\/+/, '')}`
}

/**
 * The description to show for a locale.
 *
 * Exact tag first, then the bare language (`zh-Hans` -> `zh`), then English, then whatever the
 * extension sent. That order matters: falling straight to "first entry" would show Chinese to an
 * English reader whenever the extension happened to list it first.
 */
export function descriptionFor(ex: ExtUi, locale: string): string {
  const d = ex.descriptions
  if (Object.keys(d).length === 0) return ''
  const tag = locale.toLowerCase()
  if (d[tag]) return d[tag]!
  const lang = tag.split('-')[0] ?? ''
  if (lang !== '' && d[lang]) return d[lang]!
  if (d['en']) return d['en']!
  return Object.values(d)[0] ?? ''
}

/**
 * The bearer the host stored, read from localStorage.
 *
 * Reads it the way the extension UIs themselves do — same origin, so the token the host already
 * saved is the token this probe carries. No second login, and nothing is put in a URL.
 */
function storedToken(): string {
  try {
    return globalThis.localStorage?.getItem('agent.token') ?? ''
  } catch {
    // A storage-restricted context. The probe will come back unauthorised, which reads as "no UI" —
    // the correct conservative answer.
    return ''
  }
}

/** Probe one extension, or null when it has no UI. */
async function probe(id: string, token: string): Promise<ExtUi | null> {
  try {
    const r = await fetch(`/ext/${encodeURIComponent(id)}/api/v1/ui`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    if (!r.ok) return null
    const info = (await r.json()) as UiInfo
    const base = typeof info.base === 'string' && info.base !== '' ? info.base : `/ext/${id}`
    return {
      id,
      // The extension's own name for itself; the id is the fallback, never a blank cell.
      title: typeof info.title === 'string' && info.title !== '' ? info.title : id,
      base,
      descriptions: readDescriptions(info.descriptions),
      // Resolved against the mount the extension reported, so an icon path is a path under it rather
      // than a URL the host had to guess. An empty value means the shelf draws a neutral glyph.
      icon: resolveIcon(base, info.icon),
    }
  } catch {
    // Unreachable (a 502 from the proxy, a network failure) means the same thing as "no UI" here:
    // there is nothing to open.
    return null
  }
}

/**
 * The extension UIs available right now.
 *
 * Takes the REGISTERED ids from the agent and asks each one. Probing in parallel because the calls
 * are independent and a serial walk would take a second per shelf opening.
 */
export async function discoverExtUis(api: AgentApi): Promise<ExtUi[]> {
  let ids: string[] = []
  try {
    const list = await api.extensions()
    ids = list.map(e => e.extId).filter(Boolean)
  } catch {
    // Without the registry there is nothing to probe; an empty shelf is the honest result.
    return []
  }
  const token = storedToken()
  const found = await Promise.all(ids.map(id => probe(id, token)))
  return found.filter((e): e is ExtUi => e !== null).sort((a, b) => a.title.localeCompare(b.title))
}
