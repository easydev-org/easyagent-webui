/**
 * Which picture a session renders.
 *
 * THE DECISION LIVES HERE, not in the component, because it has three states and only one of them is
 * "show the stored image". A branch inside a Svelte template cannot be tested without a DOM harness
 * this project does not have, and getting it wrong is a blank circle — the one outcome worse than
 * either picture.
 *
 * IT IS CALLED "RESOLVE", NOT "PLAN". `Plan` in this codebase means `agent/resolve.go`'s TurnPlan: the
 * whole resolved shape of a turn — system prompt, tool whitelist, turn budget. That word carries
 * weight, and nothing here is planned, staged or deferred; a stored string is read once and one answer
 * comes out. "Resolve" is what this repository already uses for "decide the effective value from what
 * was stored", which is exactly this.
 *
 * THE RULE:
 *
 *   no avatar            → identicon (the honeycomb seeded by the session name)
 *   `file:<code>`        → that image, fetched from the agent's blob store
 *   anything else        → identicon
 *   the fetch fails      → identicon
 *
 * A PLAIN URL IS REFUSED ON PURPOSE. The console renders what the agent stores; a URL would make it
 * fetch from a host the agent never vouched for, and nothing on this side could tell a broken link from
 * a deleted file.
 */

export type AvatarSource = 'identicon' | 'file'

export interface ResolvedAvatar {
  source: AvatarSource
  /** The blob code, when `source === 'file'`. Empty otherwise. */
  code: string
}

/**
 * resolveAvatar reads a session's stored avatar and says how to render it.
 *
 * IT DOES NOT DECIDE ABOUT FAILURES — a fetch that errors falls back to the identicon in the
 * component, because that is a runtime fact this function cannot know.
 */
export function resolveAvatar(
  avatar: string | undefined | null,
): ResolvedAvatar {
  const raw = (avatar ?? '').trim()
  if (!raw.startsWith('file:')) {
    return { source: 'identicon', code: '' }
  }
  const code = raw.slice('file:'.length).trim()
  // `file:` WITH NOTHING AFTER IT IS NOT A PICTURE. Treating it as one would fetch an empty code and
  // land in the error path, which renders the identicon anyway — but by accident rather than by rule.
  if (!code) {
    return { source: 'identicon', code: '' }
  }
  return { source: 'file', code }
}
