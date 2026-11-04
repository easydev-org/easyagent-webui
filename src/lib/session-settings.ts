/**
 * Which of the session's optional profile fields a save request should carry.
 *
 * PRESENCE IS THE SIGNAL, NOT THE VALUE. On the wire `avatar_file` and `intro` are `optional`, where
 * an absent field means "leave it alone" and a present-but-empty one means "clear it". That makes
 * "did the caller mention this field at all?" a real question the request cannot express any other
 * way — and getting it wrong is silent:
 *
 *   · always sending them      → saving the model wipes the picture and the intro
 *   · always omitting them     → clearing becomes impossible, since '' and "absent" look identical
 *
 * So the caller's own object decides: a key that is not there is not sent, and a key that is there is
 * sent verbatim (including ''). This function exists to make that rule testable without a network
 * stub, because a bug here loses data rather than merely failing to save.
 */
export interface OptionalProfileFields {
  avatarFile?: string
  intro?: string
}

export function optionalProfileFields(
  settings: Record<string, unknown>,
): OptionalProfileFields {
  const out: OptionalProfileFields = {}
  if ('avatarFile' in settings)
    out.avatarFile = (settings['avatarFile'] as string) || ''
  if ('intro' in settings) out.intro = (settings['intro'] as string) || ''
  return out
}
