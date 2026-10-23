import { describe, expect, it } from 'vitest'
import { MessageStore } from './message-store.svelte'

function freshStore(): MessageStore {
  return new MessageStore()
}

function persistedMsg(id: string, partId: string) {
  return {
    id,
    role: 'assistant' as const,
    status: 'complete' as const,
    parts: [
      {
        id: partId,
        type: 'tool' as const,
        text: '',
        tool: 'sandbox-job-start',
        state: { status: 'running', title: 'sandbox-job-start' },
      },
    ],
    createdAt: new Date().toISOString(),
    prevId: '',
    source: '',
    seq: 1,
    isLocal: false,
  }
}

describe('applyToolOutput', () => {
  // Regression: a tool's step is PERSISTED as soon as its text is done, and the
  // tool runs after that. Routing output through the replay guard (setMsg, which
  // ignores persisted rows) discarded every frame, so the card stayed empty until
  // the final result landed.
  it('applies to an already-persisted message', () => {
    const s = freshStore()
    s.messages = [persistedMsg('msg-1', 'call-1')]

    s.applyToolOutput('msg-1', 'call-1', { content: 'line1', preliminary: true })
    expect(s.messages[0]!.parts[0]!.state?.output).toBe('line1')
    // Provisional frames leave the card running.
    expect(s.messages[0]!.parts[0]!.state?.status).toBe('running')

    s.applyToolOutput('msg-1', 'call-1', { content: 'line1\nline2', preliminary: true })
    expect(s.messages[0]!.parts[0]!.state?.output).toBe('line1\nline2')

    s.applyToolOutput('msg-1', 'call-1', { content: 'line1\nline2', state: 'ok' })
    expect(s.messages[0]!.parts[0]!.state?.status).toBe('complete')
  })

  // Snapshots REPLACE: each frame carries the whole output, so appending would
  // duplicate every line once per frame.
  it('replaces rather than appends', () => {
    const s = freshStore()
    s.messages = [persistedMsg('msg-1', 'call-1')]
    s.applyToolOutput('msg-1', 'call-1', { content: 'a\nb', state: 'ok' })
    s.applyToolOutput('msg-1', 'call-1', { content: 'a\nb', state: 'ok' })
    expect(s.messages[0]!.parts[0]!.state?.output).toBe('a\nb')
  })

  // Live frames carry only the NEW lines, so the server never resends the whole
  // output — one frame per line with the full content is O(n²), and a large job made
  // that obvious.
  it('appends deltas while the tool runs', () => {
    const s = freshStore()
    s.messages = [persistedMsg('msg-1', 'call-1')]
    s.applyToolOutput('msg-1', 'call-1', { delta: 'line1', preliminary: true })
    s.applyToolOutput('msg-1', 'call-1', { delta: 'line2', preliminary: true })
    s.applyToolOutput('msg-1', 'call-1', { delta: 'line3', preliminary: true })
    expect(s.messages[0]!.parts[0]!.state?.output).toBe('line1\nline2\nline3')
    expect(s.messages[0]!.parts[0]!.state?.status).toBe('running')
  })

  // The terminal frame is authoritative: it REPLACES whatever the deltas built. That is
  // what makes a lost live frame harmless — the client converges on the real result.
  it('terminal content replaces accumulated deltas', () => {
    const s = freshStore()
    s.messages = [persistedMsg('msg-1', 'call-1')]
    s.applyToolOutput('msg-1', 'call-1', { delta: 'partial', preliminary: true })
    s.applyToolOutput('msg-1', 'call-1', { content: 'the whole truth', state: 'ok' })
    expect(s.messages[0]!.parts[0]!.state?.output).toBe('the whole truth')
    expect(s.messages[0]!.parts[0]!.state?.status).toBe('complete')
  })

  // An error frame carries no output; it must not wipe what was already printed.
  it('error frame keeps earlier output', () => {
    const s = freshStore()
    s.messages = [persistedMsg('msg-1', 'call-1')]
    s.applyToolOutput('msg-1', 'call-1', { delta: 'printed before failing', preliminary: true })
    s.applyToolOutput('msg-1', 'call-1', { state: 'error', error: 'boom' })
    const st = s.messages[0]!.parts[0]!.state!
    expect(st.output).toBe('printed before failing')
    expect(st.status).toBe('error')
    expect(st.error).toBe('boom')
  })

  // An interrupted call keeps what it printed. That is the whole reason the
  // server delivers snapshots: the last one is still the truth.
  it('keeps partial output when the call stopped early', () => {
    const s = freshStore()
    s.messages = [persistedMsg('msg-1', 'call-1')]
    s.applyToolOutput('msg-1', 'call-1', { delta: 'tick1', preliminary: true })
    s.applyToolOutput('msg-1', 'call-1', { delta: 'tick2', preliminary: true })
    s.applyToolOutput('msg-1', 'call-1', { content: 'tick1\ntick2', state: 'timeout' })

    const st = s.messages[0]!.parts[0]!.state!
    expect(st.output).toBe('tick1\ntick2')
    // Complete enough to stop showing "running", but flagged as stopped early.
    expect(st.status).toBe('complete')
    expect(st.toolState).toBe('timeout')
  })

  it('marks a tool error', () => {
    const s = freshStore()
    s.messages = [persistedMsg('msg-1', 'call-1')]
    s.applyToolOutput('msg-1', 'call-1', { state: 'error', error: 'boom' })
    const st = s.messages[0]!.parts[0]!.state!
    expect(st.status).toBe('error')
    expect(st.error).toBe('boom')
  })

  it('creates the bubble when output beats the step', () => {
    const s = freshStore()
    s.applyToolOutput('msg-new', 'call-9', { delta: 'early', preliminary: true })
    const msg = s.messages.find(m => m.id === 'msg-new')
    expect(msg).toBeTruthy()
    expect(msg?.parts.find(p => p.id === 'call-9')?.state?.output).toBe('early')
  })
})
