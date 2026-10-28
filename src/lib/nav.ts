// Per-tab navigation stacks — pure array operations behind AppStore's
// pushPage/pushSibling/popPage. Kept separate (and tested) so the reset/pop
// rules are explicit: same-key pages replace at their depth, a sibling drill-in
// keeps the stack at [root, current], and popping never goes below the root.
// Three tabs, not two. `extensions` is a shelf of the extension UIs this tenant can use — a place to
// go rather than a setting, so it sits beside Chat rather than inside Config.
export type SiderTab = 'chat' | 'extensions' | 'config'
export type SessionOverlay = 'mailbox'

export type AppPage =
  | { kind: 'chat_list'; key: 'chat_list' }
  | { kind: 'chat_session'; key: 'chat_session' }
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
