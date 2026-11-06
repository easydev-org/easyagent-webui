import { describe, expect, it } from 'vitest'
import { draftFromSession, isDirty, settingsPatch } from './session-profile'

const stored = {
  name: 'ci',
  model: 'gw/one',
  variant: 'high',
  preset: 'default',
  locale: 'zh',
  avatarFile: 'file:abc',
  intro: 'CI triage',
}

describe('draftFromSession', () => {
  it('copies what is stored', () => {
    expect(draftFromSession(stored, 'en')).toEqual({
      name: 'ci',
      model: 'gw/one',
      variant: 'high',
      preset: 'default',
      locale: 'zh',
      avatarFile: 'file:abc',
      intro: 'CI triage',
    })
  })

  /**
   * AN EMPTY LOCALE IS "THE DEFAULT", NOT "NO LANGUAGE".
   *
   * Sessions created before locale pinning carry ''. Rendering that as an empty selector reads as a
   * missing setting rather than the effective one.
   */
  it('shows the effective locale when the session has none', () => {
    expect(draftFromSession({ ...stored, locale: '' }, 'en').locale).toBe('en')
  })

  it('treats a missing avatar and intro as empty strings, not undefined', () => {
    const d = draftFromSession({ ...stored, avatarFile: undefined, intro: undefined }, 'en')
    expect(d.avatarFile).toBe('')
    expect(d.intro).toBe('')
  })
})

describe('settingsPatch', () => {
  /**
   * THE TWO OPTIONAL FIELDS ARE ALWAYS SENT, INCLUDING EMPTY.
   *
   * On the wire they are `optional`: absent = leave alone, present-but-empty = clear. Omitting them
   * when blank is the tempting symmetry with `model`/`preset`, and it makes clearing impossible.
   */
  it('always carries the avatar and intro, even when empty', () => {
    const p = settingsPatch({
      model: 'gw/one',
      variant: '',
      preset: '',
      locale: 'zh',
      name: '',
      avatarFile: '',
      intro: '',
    })
    expect(p).toHaveProperty('avatarFile', '')
    expect(p).toHaveProperty('intro', '')
  })

  it('omits model and preset when blank, because blank has no meaning for them', () => {
    const p = settingsPatch({
      model: '',
      variant: '',
      preset: '',
      locale: 'zh',
      name: 'x',
      avatarFile: 'file:x',
      intro: 'x',
    })
    expect(p).not.toHaveProperty('model')
    expect(p).not.toHaveProperty('preset')
  })

  /** The intro is stored trimmed, so a draft full of trailing spaces must not look like a change. */
  it('trims the intro and nothing else', () => {
    const p = settingsPatch({
      model: 'gw/one',
      variant: '',
      preset: 'default',
      locale: 'zh',
      name: 'ci',
      avatarFile: 'file:abc',
      intro: '  CI triage  ',
    })
    expect(p['intro']).toBe('CI triage')
    expect(p['avatarFile']).toBe('file:abc')
  })
})

describe('isDirty', () => {
  it('is clean for an untouched draft', () => {
    expect(isDirty(draftFromSession(stored, 'en'), stored, 'en')).toBe(false)
  })

  it('notices each field independently', () => {
    const base = draftFromSession(stored, 'en')
    for (const k of ['model', 'variant', 'preset', 'locale', 'avatarFile', 'intro'] as const) {
      expect(isDirty({ ...base, [k]: `${base[k]}x` }, stored, 'en')).toBe(true)
    }
  })

  /** Typing spaces into the intro and saving would store nothing new, so it is not a change. */
  it('ignores whitespace-only edits to the intro', () => {
    const base = draftFromSession(stored, 'en')
    expect(isDirty({ ...base, intro: '  CI triage  ' }, stored, 'en')).toBe(false)
  })
})

/**
 * THE DISPLAY NAME IS PART OF THE PROFILE, SO IT PARTICIPATES IN DIRTY TRACKING.
 *
 * A Save that is disabled after the user retyped the name would be a bug the user sees and cannot
 * explain — the field they just changed is the only one that looks unchanged.
 */
describe('isDirty: name', () => {
  it('notices a name change', () => {
    const base = draftFromSession(stored, 'en')
    expect(isDirty({ ...base, name: 'something else' }, stored, 'en')).toBe(true)
  })

  it('is clean when the name is unchanged', () => {
    const base = draftFromSession(stored, 'en')
    expect(isDirty(base, stored, 'en')).toBe(false)
  })
})
