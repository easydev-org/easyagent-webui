// A shared, REACTIVE "now" that ticks once every 30s.
//
// Relative-time labels (SessionRow's WeChat-style stamp, MessageBubble's
// "just now / N 分钟前") are computed from `Date.now()` — which is NOT a
// reactive dependency. So a `$derived`/template that reads it only recomputes
// when the MESSAGE changes, and the label FREEZES at whatever it said on first
// render (e.g. stuck on "1 分钟前" until something else re-renders the row).
//
// Reading `now()` inside a reactive context (a `$derived` or a template
// expression) subscribes to this clock, so the label re-renders as wall-clock
// advances. The ticker starts on first read and lives for the tab's lifetime
// (one 30s interval, trivial cost).

// A heartbeat counter: it changes every tick, and reading it in a reactive
// context is what makes a caller re-run. The VALUE of "now" is read live from
// `Date.now()` (so it is correct even on the very first render, before any
// tick, regardless of when this module happened to load).
let heartbeat = $state(0)
let timer: ReturnType<typeof setInterval> | null = null

function ensureTicking(): void {
  if (timer !== null || typeof window === 'undefined') return
  timer = setInterval(() => {
    heartbeat += 1
  }, 30_000)
}

/** The current wall-clock time, in ms. Reactive: a caller re-runs every ~30s. */
export function now(): number {
  ensureTicking()
  // `heartbeat - heartbeat` reads the heartbeat (subscribing the caller to it)
  // while cancelling out; the real value is the live clock.
  return Date.now() + heartbeat - heartbeat
}
