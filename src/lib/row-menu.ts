/**
 * Long-press and right-click, for a row that opens a context menu.
 *
 * THE TWO ENTRIES ARE ONE FEATURE AND HAVE TO AGREE. Desktop right-click and a touch long-press both mean
 * "tell me about this row", and on a phone `contextmenu` may never fire at all — iOS Safari does not send it — so a
 * row that only handled right-click had no menu on the device where a menu matters most.
 *
 * THE ANCHOR IS THE ROW, not the pointer. A menu positioned at the cursor gives no clue which of a dozen similar
 * rows it acts on; anchoring to the row's rectangle centres it on the thing it is about.
 *
 * THE TRAILING CLICK IS SWALLOWED after a long press. Without it the finger lifting fires a click on the row
 * underneath the menu that just opened, and the reader lands somewhere they did not ask to go.
 */
const LP_MS = 480

export interface RowMenuAnchor {
  top: number
  bottom: number
  left: number
  right: number
}

export interface LongPressHandlers {
  oncontextmenu: (e: MouseEvent) => void
  ontouchstart: (e: TouchEvent) => void
  ontouchmove: (e: TouchEvent) => void
  ontouchend: (e: TouchEvent) => void
  ontouchcancel: (e: TouchEvent) => void
}

/**
 * rowLongPress builds the five handlers a row needs.
 *
 * `request` is called with the row's rectangle. Passing `null` disables the menu entirely — a row in select mode
 * must not open one, because the reader is choosing rows, not acting on one.
 */
export function rowLongPress(
  request: ((anchor: RowMenuAnchor) => void) | null,
  enabled = true,
): LongPressHandlers {
  let timer: ReturnType<typeof setTimeout> | null = null
  let suppressTap = false

  function cancel() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function anchorOf(el: HTMLElement): RowMenuAnchor {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  }

  return {
    oncontextmenu: e => {
      if (!request || !enabled) return
      e.preventDefault()
      request(anchorOf(e.currentTarget as HTMLElement))
    },
    ontouchstart: e => {
      if (!request || !enabled) return
      const el = e.currentTarget as HTMLElement
      timer = setTimeout(() => {
        timer = null
        suppressTap = true
        navigator.vibrate?.(10)
        request(anchorOf(el))
      }, LP_MS)
    },
    ontouchmove: cancel,
    ontouchend: e => {
      cancel()
      if (suppressTap) {
        // The long press fired: swallow the trailing click so the row does not ALSO navigate behind the menu.
        e.preventDefault()
        suppressTap = false
      }
    },
    ontouchcancel: cancel,
  }
}
