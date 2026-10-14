import { describe, expect, it } from 'vitest'
import type { ExtractedContentBundle } from '../../../../domain/content-extraction'
import { mapExtractedAttachmentToContextSources } from './context-attachment-extraction-adapter'

describe('context attachment extraction adapter', () => {
  it('maps PDF and Office units to separately budgeted context sources', () => {
    const sources = mapExtractedAttachmentToContextSources({
      path: 'attachments/report.pdf',
      version: 3,
      bundle: bundle()
    })

    expect(sources).toEqual([
      expect.objectContaining({
        kind: 'attachment',
        id: 'attachments/report.pdf#page/000001',
        version: 3,
        documentKey: 'page/000001',
        checksum: `sha256:${'1'.repeat(64)}`,
        content: expect.stringContaining('First page')
      }),
      expect.objectContaining({
        kind: 'attachment',
        id: 'attachments/report.pdf#page/000002',
        version: 3,
        documentKey: 'page/000002',
        checksum: `sha256:${'2'.repeat(64)}`,
        content: expect.stringContaining('Second page')
      })
    ])
  })
})

function bundle(): ExtractedContentBundle {
  return {
    sourceChecksum: `sha256:${'a'.repeat(64)}`,
    format: 'pdf',
    extractorVersion: 'pdf-v1',
    units: [
      {
        key: 'page/000001',
        title: 'Page 1',
        text: 'First page',
        checksum: `sha256:${'1'.repeat(64)}`,
        byteSize: 10
      },
      {
        key: 'page/000002',
        title: 'Page 2',
        text: 'Second page',
        checksum: `sha256:${'2'.repeat(64)}`,
        byteSize: 11
      }
    ]
  }
}
