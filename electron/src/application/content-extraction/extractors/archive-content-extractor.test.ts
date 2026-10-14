import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  ContentExtractionError,
  type ExtractedContentBundle
} from '../../../../../domain/content-extraction'
import { ArchiveContentExtractor } from './archive-content-extractor'

describe('ArchiveContentExtractor', () => {
  it('recursively extracts supported entries with stable prefixed keys', async () => {
    const entries = {
      readEntries: vi.fn().mockResolvedValue([
        {
          path: 'docs/readme.txt',
          bytes: Uint8Array.from(Buffer.from('hello'))
        },
        {
          path: 'assets/blob.bin',
          bytes: Uint8Array.from([0, 1, 2])
        },
        {
          path: 'nested/bundle.zip',
          bytes: Uint8Array.from(Buffer.from('PK\u0003\u0004nested'))
        }
      ])
    }
    const extractEntry = vi.fn(
      async (entry): Promise<ExtractedContentBundle> => ({
        sourceChecksum: entry.sourceChecksum,
        format: entry.fileName.endsWith('.zip') ? 'zip' : 'txt',
        extractorVersion: 'child-v1',
        units: [
          {
            key: entry.fileName.endsWith('.zip')
              ? 'entry/note.txt/content'
              : 'content',
            title: 'Child',
            text: 'Extracted child',
            checksum: digest(Buffer.from('Extracted child')),
            byteSize: 15
          }
        ]
      })
    )

    const result = await new ArchiveContentExtractor(
      entries,
      { extract: extractEntry }
    ).extract(input())

    expect(result.units.map(({ key }) => key)).toEqual([
      'entry/docs/readme.txt/content',
      'entry/nested/bundle.zip/entry/note.txt/content'
    ])
    expect(extractEntry).toHaveBeenCalledTimes(2)
    expect(extractEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'nested/bundle.zip',
        depth: 1
      })
    )
  })

  it('maps unsafe archives and excessive recursion to stable errors', async () => {
    const unsafe = {
      readEntries: vi.fn().mockRejectedValue(
        Object.assign(new Error('unsafe'), {
          code: 'archive_unsafe_path'
        })
      )
    }
    await expect(
      new ArchiveContentExtractor(unsafe, { extract: vi.fn() }).extract(
        input()
      )
    ).rejects.toMatchObject({ code: 'extraction_archive_unsafe' })

    const nested = {
      readEntries: vi.fn().mockResolvedValue([
        {
          path: 'nested.zip',
          bytes: Uint8Array.from(Buffer.from('PK\u0003\u0004nested'))
        }
      ])
    }
    await expect(
      new ArchiveContentExtractor(nested, {
        extract: vi.fn().mockRejectedValue(
          new ContentExtractionError(
            'extraction_archive_unsafe',
            'Archive nesting exceeds the extraction limit'
          )
        )
      }).extract(input({ depth: 2 }))
    ).rejects.toMatchObject({ code: 'extraction_archive_unsafe' })
  })
})

function input(changes: { depth?: number } = {}) {
  const bytes = Uint8Array.from(Buffer.from('PK\u0003\u0004archive'))
  return {
    bytes,
    fileName: 'bundle.zip',
    sourceChecksum: digest(bytes),
    policy: {
      consumer: 'knowledge_index' as const,
      allowLocalOcr: true,
      allowLocalConversion: true,
      maxCharacters: 1_000_000,
      maxUnits: 1_000
    },
    signal: new AbortController().signal,
    depth: changes.depth ?? 0
  }
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
