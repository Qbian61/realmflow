import { describe, expect, it } from 'vitest'
import type { ExtractedContentBundle } from '../../../../domain/content-extraction'
import { mapExtractedBundleToKnowledgeDocuments } from './knowledge-extraction-adapter'

describe('mapExtractedBundleToKnowledgeDocuments', () => {
  it('preserves stable unit identity and source metadata', () => {
    const bundle: ExtractedContentBundle = {
      sourceChecksum: `sha256:${'a'.repeat(64)}`,
      format: 'pdf',
      extractorVersion: 'pdf-v1',
      units: [
        {
          key: 'page/000001',
          title: 'Invoice - Page 1',
          text: 'invoice content',
          checksum: `sha256:${'b'.repeat(64)}`,
          byteSize: 15,
          metadata: {
            format: 'pdf',
            extraction: 'pdf',
            page: 1
          }
        }
      ]
    }

    expect(
      mapExtractedBundleToKnowledgeDocuments(bundle, 'source-1')
    ).toEqual([
      {
        documentKey: 'page/000001',
        sourceEntityId: 'source-1',
        title: 'Invoice - Page 1',
        content: 'invoice content',
        checksum: `sha256:${'b'.repeat(64)}`,
        byteSize: 15
      }
    ])
  })
})
