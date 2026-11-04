/**
 * The session profile page's draft state.
 *
 * KEPT OUT OF THE COMPONENT FOR THE SAME REASON AS `resolveAvatar`: the save rule has failure modes
 * that are silent, and a Svelte component cannot be tested here without a DOM harness. The three that
 * matter:
 *
 *   · CLEARING MUST BE EXPRESSIBLE. `avatar` and `intro` are `optional` on the wire — absent means
 *     "leave it alone", present-but-empty means "clear it" — so the request has to carry a key for
 *     every field the user touched, even when its value is ''.
 *   · UNTOUCHED FIELDS MUST NOT BE SENT. Sending them blank would wipe a profile on an ordinary save.
 *   · THE MODEL FALLBACK IS A DISPLAY CHOICE, NOT A SAVE. When a session names a model the provider
 *     catalogue no longer lists, the page shows the first available one so the picker is not blank —
 *     but saving that fallback would silently repoint the session at a different model.
 */
import type { Session } from './models'

export interface ProfileDraft {
  model: string
  variant: string
  preset: string
  locale: string
  avatarFile: string
  intro: string
}

/**
 * draftFromSession seeds the editable fields from what is stored.
 *
 * `locale` FALLS BACK TO THE EFFECTIVE DEFAULT because a session created before locale pinning
 * carries '' — showing an empty selector would read as "no language" rather than "the default".
 */
export function draftFromSession(
  session: Pick<
    Session,
    'model' | 'variant' | 'preset' | 'locale' | 'avatarFile' | 'intro'
  >,
  fallbackLocale: string,
): ProfileDraft {
  return {
    model: session.model,
    variant: session.variant,
    preset: session.preset,
    locale: session.locale || fallbackLocale,
    avatarFile: session.avatarFile ?? '',
    intro: session.intro ?? '',
  }
}

/**
 * settingsPatch turns a draft into the field bag `api.settings` expects.
 *
 * IT ALWAYS CARRIES `avatarFile` AND `intro`, INCLUDING WHEN EMPTY. The other fields are omitted when
 * blank because blank has no meaning for them (a session always has a model, and an empty preset
 * means "the default"). These two are different: '' is a real value that means "clear it", and the
 * only way to say "leave it" is to not send the key at all — which is what `optional` buys on the
 * wire. A caller that omits them cannot clear a picture once it is set.
 */
export function settingsPatch(draft: ProfileDraft): Record<string, unknown> {
  return {
    ...(draft.model ? { model: draft.model } : {}),
    variant: draft.variant,
    ...(draft.preset ? { preset: draft.preset } : {}),
    locale: draft.locale,
    avatarFile: draft.avatarFile,
    intro: draft.intro.trim(),
  }
}

/**
 * isDirty says whether saving would change anything.
 *
 * COMPARED AGAINST THE STORED SESSION, not against the last draft, so a value the user typed and then
 * undid does not keep the Save button lit. `intro` is compared trimmed because that is what would be
 * stored.
 */
export function isDirty(
  draft: ProfileDraft,
  session: Pick<
    Session,
    'model' | 'variant' | 'preset' | 'locale' | 'avatarFile' | 'intro'
  >,
  fallbackLocale: string,
): boolean {
  const base = draftFromSession(session, fallbackLocale)
  return (
    draft.model !== base.model ||
    draft.variant !== base.variant ||
    draft.preset !== base.preset ||
    draft.locale !== base.locale ||
    draft.avatarFile !== base.avatarFile ||
    draft.intro.trim() !== base.intro.trim()
  )
}
