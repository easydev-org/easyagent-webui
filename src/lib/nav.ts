// Per-tab navigation stacks — pure array operations behind AppStore's
// pushPage/pushSibling/popPage. Kept separate (and tested) so the reset/pop
// rules are explicit: same-key pages replace at their depth, a sibling drill-in
// keeps the stack at [root, current], and popping never goes below the root.
// Three tabs, not two. `extensions` is a shelf of the extension UIs this tenant can use — a place to
// go rather than a setting, so it sits beside Chat rather than inside Config.
export type SiderTab = 'chat' | 'extensions' | 'config'
// A full-page view that sits ON TOP of the session, reached from the chat header and left with the
// back button. Both entries are pages, not panels: a panel that covers half the conversation makes
// the user choose between reading the session and managing it, and neither is a modal decision.
// `jobs` sits beside `permissions` because it answers the same kind of question: what is going on in
// this conversation that is not in the transcript. A job outlives the call that started it, so the
// conversation is the only place it belongs to — and the only place a reader thinks to look.
// `channels` IS NOT A TAB OF `permissions`. They sat behind one tab strip and the second was
// undiscoverable: "what may this session do" and "what does it hear" are different questions, so
// each gets its own entry rather than one hiding the other.
export type SessionOverlay = 'mailbox' | 'permissions' | 'channels'

export type AppPage =
  | { kind: 'chat_list'; key: 'chat_list' }
  | { kind: 'chat_session'; key: 'chat_session' }
  // The session's own page: picture, intro, model, preset. It sits ON TOP of the session, the way a
  // contact card sits on top of a conversation in an IM app, and it is reached from the chat header.
  //
  // A PAGE RATHER THAN A DIALOG. It replaced two dialogs that stacked on each other — a read-only
  // info sheet whose only action was "Edit", and the settings form behind it — which made changing one
  // field a two-step ritual and left neither able to show the picture it was letting you choose.
  | { kind: 'session_profile'; key: 'session_profile' }
  /**
   * The group list and one group's transcript.
   *
   * THEY LIVE UNDER THE CHAT TAB rather than in the sidebar: a group is a conversation, and putting it beside
   * "settings" would say it is a place to configure rather than a place to talk.
   */
  | { kind: 'group_list'; key: 'group_list' }
  | { kind: 'group_chat'; key: 'group_chat'; id: string }
  /**
   * A group's own page: picture, intro, member list — the same card a session has.
   *
   * A GROUP IS A CONVERSATION AND A SET OF PEOPLE, and both halves need somewhere to be looked at. The
   * member list in particular answers "who am I talking to", which the transcript alone cannot: it shows the
   * ones who spoke, not the ones who did not.
   */
  | { kind: 'group_info'; key: 'group_info'; id: string }
  | { kind: 'chat_overlay'; key: 'chat_overlay'; overlay: SessionOverlay }
  // An extension's own UI, as a PAGE rather than a floating panel.
  //
  // Being a page is what makes it behave like the mailbox overlay on every screen size: the Shell
  // shows one pane when compact and two when wide, so a phone gets the extension full-screen with a
  // back button instead of a panel squeezed beside the conversation.
  //
  // ONE at a time, by construction: every ext_view uses the SAME key, and pushPage replaces a page
  // whose key already exists. Opening a second view replaces the first rather than stacking, which
  // is the rule this feature wants — a browse trail lives inside the extension's own router (its
  // hash), not in this stack.
  | {
      kind: 'ext_view'
      key: 'ext_view'
      ext: string
      route: string
      title: string
      session: string
    }
  | { kind: 'config_root'; key: 'config_root' }
  // The shelf: every extension that serves a UI, as a list.
  | { kind: 'ext_list'; key: 'ext_list' }
  | { kind: 'config_sub'; key: string; id: string }
  | { kind: 'providers_list'; key: 'providers_list' }
  | { kind: 'preset_form'; key: 'preset_form_new' }
  | { kind: 'provider_form'; key: 'provider_form' }
  | { kind: 'provider_models'; key: string; modelId: string | null }

export function rootPageFor(tab: SiderTab): AppPage {
  switch (tab) {
    case 'chat':
      return { kind: 'chat_list', key: 'chat_list' }
    case 'extensions':
      return { kind: 'ext_list', key: 'ext_list' }
    case 'config':
      return { kind: 'config_root', key: 'config_root' }
  }
}

/** Push a page; a same-key page replaces at (and truncates from) its depth. */
export function pushPage(stack: AppPage[], page: AppPage): AppPage[] {
  const list = [...stack]
  const idx = list.findIndex(p => p.key === page.key)
  if (idx !== -1) list.splice(idx, list.length - idx)
  list.push(page)
  return list
}

/** Push a SIBLING drill-in: replaces the current drill-in, keeping the stack
 *  at [root, current] so the tablet split never shows two parallels. */
export function pushSibling(stack: AppPage[], page: AppPage): AppPage[] {
  const list = stack.length > 1 ? stack.slice(0, 1) : [...stack]
  return pushPage(list, page)
}

/** Pop the top page; never pops below the root. */
export function popPage(stack: AppPage[]): AppPage[] {
  return stack.length > 1 ? stack.slice(0, -1) : [...stack]
}

/**
 * THE DEPTH A PAGE BELONGS AT.
 *
 * A stack position is not an accident of click order — it is what the page IS. The chat tab has exactly three
 * levels, and a page may only ever sit at its own:
 *
 *   1  the list            chat_list, group_list
 *   2  a conversation      chat_session, group_chat
 *   3  about it            session_profile, group_info, mailbox, permissions, channels, ext_view
 *
 * WHY THIS EXISTS. Pushing pages in click order let the chat tab hold two CONVERSATIONS at once — open a group,
 * then a session, and a wide screen showed both side by side. They are alternatives, not a path: a reader is
 * either in this conversation or that one. The same applied to two info pages, which is worse — two cards, no
 * conversation, and neither Back button going anywhere useful.
 *
 * The rule below turns that from something every call site must remember into something the stack enforces.
 */
export function depthOf(page: AppPage): number {
  switch (page.kind) {
    case 'chat_list':
    case 'group_list':
      return 1
    case 'chat_session':
    case 'group_chat':
      return 2
    default:
      // Everything that is ABOUT a conversation, or belongs to no conversation at all (the config and extension
      // shelves have their own root and never mix with the chat tab's pages).
      return 3
  }
}

/**
 * pushAtDepth pushes a page, keeping the stack consistent with the depth ladder.
 *
 * THE RULE, exactly as the console needs it:
 *
 *   · A PAGE DEEPER THAN THE STACK GROWS IT — that is a drill-in.
 *   · A PAGE AT OR ABOVE AN EXISTING DEPTH TRUNCATES BACK TO IT, then pushes. Opening a session while an info
 *     page is open therefore leaves [list, session], not [list, session, info, session].
 *   · A PAGE AT THE SAME DEPTH THAT IS THE SAME PAGE IS A NO-OP. Re-opening the conversation you are already in
 *     must not build a second copy of it, which is what "push and let it replace by key" did for pages whose key
 *     carries an id.
 *
 * THE ROOT IS NEVER REPLACED. Popping to depth 0 would leave the tab with no page at all; a push at depth 1 is
 * handled by the list's own navigation, which never pushes a second list.
 */
export function pushAtDepth(stack: AppPage[], page: AppPage): AppPage[] {
  const depth = depthOf(page)
  // Keep every page shallower than this one; a page AT this depth is being replaced, not stacked on.
  const kept = stack.filter(p => depthOf(p) < depth)
  kept.push(page)
  return kept
}
