import { describe, expect, it } from 'vitest'
import { optionalProfileFields } from './session-settings'

/**
 * PRESENCE IS THE SIGNAL.
 *
 * Both failure modes here are silent, which is why the rule is pinned:
 *
 *   always sending them   → saving the model wipes the picture and the intro
 *   always omitting them  → clearing becomes impossible, because '' and "absent" look identical on a
 *                           proto3 string
 */
describe('optionalProfileFields', () => {
  it('sends nothing when the caller did not mention the fields', () => {
    // The ordinary model/preset/locale save. It must NOT clear the profile.
    expect(optionalProfileFields({ model: 'a/b', locale: 'en' })).toEqual({})
  })

  it('sends an empty value when the caller explicitly clears a field', () => {
    expect(optionalProfileFields({ avatarFile: '', intro: '' })).toEqual({
      avatarFile: '',
      intro: '',
    })
  })

  it('sends a set value verbatim', () => {
    expect(optionalProfileFields({ avatarFile: 'file:abc', intro: 'CI triage' })).toEqual({
      avatarFile: 'file:abc',
      intro: 'CI triage',
    })
  })

  /**
   * ONE FIELD AT A TIME.
   *
   * A caller that only re-picks the picture must not disturb the intro, and the reverse. Partial
   * updates are the normal case: the dialog binds both, but nothing guarantees every caller does.
   */
  it('lets one field move without the other', () => {
    expect(optionalProfileFields({ avatarFile: 'file:abc' })).toEqual({
      avatarFile: 'file:abc',
    })
    expect(optionalProfileFields({ intro: 'CI triage' })).toEqual({
      intro: 'CI triage',
    })
  })

  it('treats null and undefined as empty rather than sending the word', () => {
    expect(optionalProfileFields({ avatarFile: null, intro: undefined })).toEqual({
      avatarFile: '',
      intro: '',
    })
  })
})

/**
 * `name` FOLLOWS THE SAME PRESENCE RULE AS THE AVATAR AND THE INTRO.
 *
 * It is `optional` on the wire for the same reason: absent = leave it alone, present-but-empty = clear
 * it. And clearing is meaningful here — an empty display name means "show the id", which is what a
 * session created without a label looks like.
 */
describe('optionalProfileFields: name', () => {
  it('is not sent when the caller did not mention it', () => {
    expect(optionalProfileFields({ model: 'a/b' })).not.toHaveProperty('name')
  })

  it('is sent when cleared, so the id can show through', () => {
    expect(optionalProfileFields({ name: '' })).toEqual({ name: '' })
  })

  it('is sent verbatim when set', () => {
    expect(optionalProfileFields({ name: 'check the build' })).toEqual({
      name: 'check the build',
    })
  })
})
