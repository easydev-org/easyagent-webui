import { describe, expect, it } from 'vitest'
import { MessageStore } from './message-store.svelte'

// The store file exports a singleton class; build a fresh one per test so the
// cases cannot see each other's state.
function freshStore(): MessageStore {
  return new MessageStore()
}

describe('appendToolProgress', () => {
  // Regression: a tool's step is PERSISTED as soon as its text is done, and the
  // tool runs after that. Progress frames therefore arrive against a row that is
  // no longer "local", and setMsg() drops mutations for persisted rows. Every
  // frame was discarded, so the tool card stayed empty until the final result
  // landed — which reads as "streaming does not work".
  it('applies frames to an already-persisted message', () => {
    const s = freshStore()
    // A persisted (server-owned) assistant row, as it looks after the step ended.
    s.messages = [
      {
        id: 'msg-1',
        role: 'assistant',
        status: 'complete',
        parts: [
          { id: 'call-1', type: 'tool', text: '', tool: 'sandbox-job-start', state: { status: 'running', title: 'sandbox-job-start' } },
        ],
        createdAt: new Date().toISOString(),
        prevId: '',
        source: '',
        seq: 1,
        isLocal: false,
      },
    ]

    s.appendToolProgress('msg-1', 'call-1', 'line1')
    s.appendToolProgress('msg-1', 'call-1', 'line2')

    const part = s.messages[0]!.parts.find(p => p.id === 'call-1')
    expect(part?.state?.progress).toBe('line1\nline2')
  })

  it('creates the bubble when progress beats the step', () => {
    const s = freshStore()
    s.appendToolProgress('msg-new', 'call-9', 'early')
    const msg = s.messages.find(m => m.id === 'msg-new')
    expect(msg).toBeTruthy()
    expect(msg?.parts.find(p => p.id === 'call-9')?.state?.progress).toBe('early')
  })
})
