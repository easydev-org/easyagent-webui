// The postMessage bridge between this app and an extension UI in an iframe.
//
// WHY A BRIDGE AT ALL: the extension UI is served from /ext/<id>/ through this origin, but the
// credential that authorises its data is the bearer TOKEN, which lives in this app's JavaScript.
// An iframe must not receive it:
//
//   * same-origin + allow-same-origin would let extension code read this app's storage, but the
//     token is also not in storage — it is a live variable, so the iframe cannot obtain it anyway;
//   * putting it in the iframe URL would put a long-lived credential in a URL: history, logs,
//     referrers;
//   * handing it over postMessage works, but then the extension holds it and any XSS in that UI
//     has the token.
//
// So the iframe ASKS and this side performs the fetch. The extension never sees the token, and the
// tenant never has to travel as a query parameter either — it comes out of the token on the server,
// exactly as it does for every other call.

export interface BridgeRequest {
  /** Correlates the answer; chosen by the iframe. */
  id: string
  /** Path WITHIN the extension's API, e.g. "tree?ws=abc&dir=src". Never a full URL. */
  path: string
}

export interface BridgeResponse {
  id: string
  ok: boolean
  status: number
  /** Parsed JSON on success, or an error message. */
  body?: unknown
  error?: string
}

export const BRIDGE_REQUEST = 'easyagent:ext-fetch'
export const BRIDGE_RESPONSE = 'easyagent:ext-fetch:result'
export const BRIDGE_HELLO = 'easyagent:ext-hello'

/** The extension id a frame was mounted for, given its window. */
type ExtOf = (win: Window) => string | null

/**
 * Serve bridge requests from iframes.
 *
 * @param token  the bearer for the active connection; read at CALL time so a re-login is picked up
 * @param extOf  maps an iframe's window to its extension id, so a frame can only reach its own API
 */
export function serveBridge(token: () => string, extOf: ExtOf, theme: () => 'light' | 'dark'): () => void {
  function onMessage(ev: MessageEvent): void {
    const data = ev.data as { type?: string; id?: string; path?: string } | null
    if (!data || typeof data.type !== 'string') return

    const ext = extOf(ev.source as Window)
    if (ext === null) {
      // Say so rather than dropping it: a frame whose source does not match is indistinguishable
      // from a frame that never asked, and both look like "the panel loaded but shows nothing".
      if (data.type === BRIDGE_REQUEST) {
        console.warn('[ext-bridge] REJECTED a request from an unrecognised frame', {
          type: data.type,
          origin: ev.origin,
          sameAsTop: ev.source === window,
        })
      }
      return
    }

    if (data.type === BRIDGE_HELLO) {
      post(ev.source as Window, { type: 'easyagent:theme', theme: theme() })
      return
    }
    if (data.type !== BRIDGE_REQUEST || typeof data.id !== 'string' || typeof data.path !== 'string') {
      return
    }

    void handle(ev.source as Window, ext, data.id, data.path)
  }

  async function handle(win: Window, ext: string, id: string, path: string): Promise<void> {
    const reply = (r: Omit<BridgeResponse, 'id'>): void => post(win, { ...r, id })

    // Only a path, never a URL: an absolute URL would let a frame request another origin with this
    // app's credential. `..` is refused for the same reason — it could climb out of the ext prefix.
    if (path.startsWith('/') || path.startsWith('http') || path.includes('..')) {
      reply({ ok: false, status: 400, error: 'path must be relative and stay under the extension' })
      return
    }

    try {
      const r = await fetch(`/ext/${ext}/api/${path}`, {
        headers: token() ? { authorization: `Bearer ${token()}` } : {},
      })
      const text = await r.text()
      let body: unknown = text
      try {
        body = JSON.parse(text)
      } catch {
        // Not JSON: report the text so the frame can show something real instead of "{}".
      }
      reply({ ok: r.ok, status: r.status, body })
    } catch (e) {
      reply({ ok: false, status: 0, error: e instanceof Error ? e.message : String(e) })
    }
  }

  function post(win: Window, msg: unknown): void {
    // '*' rather than a target origin: the frames are same-origin by construction (this app proxies
    // /ext/<id>), and pinning an origin here would break a deployment behind any other hostname.
    win.postMessage(msg, '*')
  }

  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}
