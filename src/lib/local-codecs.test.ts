// Local store JSON codec tests — the exact key shapes the Flutter/Drift store
// reads. Only the draft attachment codec remains (the message-chain codecs were
// removed along with the message mirror).
import { describe, expect, it } from 'vitest'
import { fileFromJson, fileToJson } from './local-codecs'

describe('file codec', () => {
  it('round-trips an uploaded-file record', () => {
    const f = {
      code: 'c1',
      name: 'a.txt',
      mime: 'text/plain',
      size: 3,
      localPath: '',
      uploadState: 'done' as const,
      deduped: false,
      sha256: null,
    }
    expect(fileFromJson(fileToJson(f))).toMatchObject({
      code: 'c1',
      name: 'a.txt',
      mime: 'text/plain',
      size: 3,
      uploadState: 'done',
    })
  })

  it('defaults uploadState to done', () => {
    expect(fileFromJson({ code: 'x' }).uploadState).toBe('done')
  })
})
