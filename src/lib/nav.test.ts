// Navigation-stack tests — the push/replace/sibling/pop rules.
import { describe, expect, it } from 'vitest'
import {
  type AppPage,
  depthOf,
  popPage,
  pushAtDepth,
  pushPage,
  pushSibling,
  rootPageFor,
} from './nav'

const root = rootPageFor('chat')
const session: AppPage = { kind: 'chat_session', key: 'chat_session' }

describe('rootPageFor', () => {
  it('maps each tab to its root', () => {
    expect(rootPageFor('chat')).toEqual({ kind: 'chat_list', key: 'chat_list' })
    expect(rootPageFor('config')).toEqual({
      kind: 'config_root',
      key: 'config_root',
    })
  })
})

describe('pushPage', () => {
  it('appends a new page', () => {
    expect(pushPage([root], session)).toEqual([root, session])
  })

  it('replaces at the depth of a same-key page (truncating deeper pages)', () => {
    const a: AppPage = { kind: 'config_sub', key: 'sub', id: 'a' }
    const b: AppPage = { kind: 'config_sub', key: 'sub', id: 'b' }
    const stack = [root, a]
    expect(pushPage(stack, b)).toEqual([root, b])
  })

  it('does not mutate the input', () => {
    const stack = [root]
    pushPage(stack, session)
    expect(stack).toEqual([root])
  })
})

describe('pushSibling', () => {
  it('keeps the stack at [root, current] then pushes the sibling', () => {
    const a: AppPage = { kind: 'config_sub', key: 'a', id: 'a' }
    const b: AppPage = { kind: 'config_sub', key: 'b', id: 'b' }
    const stack: AppPage[] = [root, a, { kind: 'preset_form', key: 'preset_form_new' }]
    expect(pushSibling(stack, b)).toEqual([root, b])
  })

  it('behaves like pushPage from a bare root', () => {
    expect(pushSibling([root], session)).toEqual([root, session])
  })
})

describe('popPage', () => {
  it('pops the top page', () => {
    expect(popPage([root, session])).toEqual([root])
  })

  it('never pops below the root', () => {
    expect(popPage([root])).toEqual([root])
    expect(popPage([])).toEqual([])
  })
})

describe('pushAtDepth', () => {
  const list = rootPageFor('chat')
  const group: AppPage = { kind: 'group_chat', key: 'group_chat', id: 'g1' }
  const info: AppPage = { kind: 'group_info', key: 'group_info', id: 'g1' }
  const profile: AppPage = { kind: 'session_profile', key: 'session_profile' }
  const mailbox: AppPage = {
    kind: 'chat_overlay',
    key: 'chat_overlay',
    overlay: 'mailbox',
  }

  it('assigns each page its own level', () => {
    expect(depthOf(list)).toBe(1)
    expect(depthOf(group)).toBe(2)
    expect(depthOf(info)).toBe(3)
    expect(depthOf(profile)).toBe(3)
    expect(depthOf(mailbox)).toBe(3)
  })

  /**
   * THE BUG THIS FIXES: open a group, then a session, and the wide screen showed BOTH — two conversations side by
   * side. They are alternatives, not a path.
   */
  it('a second conversation REPLACES the first', () => {
    let stack = pushAtDepth([list], group)
    stack = pushAtDepth(stack, session)
    expect(stack.map(p => p.kind)).toEqual(['chat_list', 'chat_session'])
  })

  /**
   * TWO INFO PAGES IS WORSE THAN TWO CONVERSATIONS: two cards, no conversation, and Back going nowhere useful.
   *
   * A second info page REPLACES the first at the same level — the conversation underneath is kept, because the
   * new card is still about that conversation (opening a member's profile from a group's member list is exactly
   * this case).
   */
  it('a second info page REPLACES the first, keeping the conversation', () => {
    let stack = pushAtDepth([list], group)
    stack = pushAtDepth(stack, info)
    stack = pushAtDepth(stack, profile)
    expect(stack.map(p => p.kind)).toEqual(['chat_list', 'group_chat', 'session_profile'])
  })

  // AND AN INFO PAGE FOR A DIFFERENT CONVERSATION DOES NOT SURVIVE THE SWITCH: the card belonged to the old one.
  it('an info page does not follow you into another conversation', () => {
    let stack = pushAtDepth([list], group)
    stack = pushAtDepth(stack, info)
    stack = pushAtDepth(stack, session)
    stack = pushAtDepth(stack, profile)
    expect(stack.map(p => p.kind)).toEqual(['chat_list', 'chat_session', 'session_profile'])
  })

  // Drilling in still grows the stack — the ladder is not a cap of two.
  it('a deeper page grows the stack', () => {
    let stack = pushAtDepth([list], session)
    stack = pushAtDepth(stack, profile)
    stack = pushAtDepth(stack, mailbox)
    expect(stack.map(p => p.kind)).toEqual(['chat_list', 'chat_session', 'chat_overlay'])
  })

  /**
   * OPENING A CONVERSATION WHILE AN INFO PAGE IS OPEN collapses back to [list, conversation] — the info page
   * belonged to the conversation being left.
   */
  it('leaving a conversation drops its info page', () => {
    let stack = pushAtDepth([list], session)
    stack = pushAtDepth(stack, profile)
    stack = pushAtDepth(stack, group)
    expect(stack.map(p => p.kind)).toEqual(['chat_list', 'group_chat'])
  })

  // Re-opening the page you are already on must not build a second copy of it.
  it('re-opening the same page is a no-op', () => {
    let stack = pushAtDepth([list], group)
    stack = pushAtDepth(stack, info)
    const again = pushAtDepth(stack, info)
    expect(again.map(p => p.kind)).toEqual(['chat_list', 'group_chat', 'group_info'])
  })

  // The list is never replaced by a list: a push at depth 1 keeps exactly one root.
  it('a list push does not stack a second list', () => {
    const stack = pushAtDepth([list], rootPageFor('chat'))
    expect(stack.filter(p => depthOf(p) === 1)).toHaveLength(1)
  })
})
