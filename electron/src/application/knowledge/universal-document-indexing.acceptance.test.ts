import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  ContentExtractionStrategy,
  ExtractedContentBundle
} from '../../../../domain/content-extraction'
import {
  LocalContentExtractionService,
  MemoryContentExtractionCache,
  type LocalContentExtractor
} from '../content-extraction/local-content-extraction-service'
import { mapExtractedBundleToKnowledgeDocuments } from './knowledge-extraction-adapter'

const guaranteedFamilies = [
  ['notes.txt', 'text'],
  ['brief.docx', 'document'],
  ['report.pdf', 'document'],
  ['table.csv', 'spreadsheet'],
  ['workbook.xlsx', 'spreadsheet'],
  ['deck.pptx', 'presentation'],
  ['invoice.ofd', 'fixed_layout'],
  ['scan.png', 'image_ocr'],
  ['legacy.doc', 'office_convert'],
  ['macro.docm', 'office_sanitize'],
  ['bundle.zip', 'archive'],
  ['letter.odt', 'ecosystem'],
  ['message.eml', 'ecosystem'],
  ['book.epub', 'ecosystem']
] as const satisfies ReadonlyArray<
  readonly [string, ContentExtractionStrategy]
>

describe('universal document indexing acceptance', () => {
  it.each(guaranteedFamilies)(
    'turns %s into stable frozen knowledge documents through %s extraction',
    async (fileName, strategy) => {
      const extractors = createExtractors()
      const service = new LocalContentExtractionService({
        extractors,
        cache: new MemoryContentExtractionCache()
      })
      const bytes =
        fileName === 'report.pdf'
          ? new TextEncoder().encode('%PDF-1.7 acceptance')
          : new TextEncoder().encode(`synthetic:${fileName}`)
      const sourceChecksum = digest(bytes)
      const input = {
        bytes,
        fileName,
        sourceChecksum,
        policy: {
          consumer: 'knowledge_index' as const,
          allowLocalOcr: true,
          allowLocalConversion: true,
          maxCharacters: 10_000,
          maxUnits: 100
        },
        signal: new AbortController().signal,
        depth: 0
      }

      const first = await service.extract(input)
      const second = await service.extract(input)
      const firstDocuments = mapExtractedBundleToKnowledgeDocuments(
        first,
        `source:${fileName}`
      )
      const secondDocuments = mapExtractedBundleToKnowledgeDocuments(
        second,
        `source:${fileName}`
      )

      expect(firstDocuments).toEqual(secondDocuments)
      expect(firstDocuments).toEqual([
        expect.objectContaining({
          documentKey: 'content',
          sourceEntityId: `source:${fileName}`,
          content: `indexed:${fileName}`
        })
      ])
      const selected = extractors.find(
        (extractor) => extractor.strategy === strategy
      )
      expect(selected?.extract).toHaveBeenCalledOnce()
      expect(
        extractors
          .filter((extractor) => extractor.strategy !== strategy)
          .every((extractor) => !vi.mocked(extractor.extract).mock.calls.length)
      ).toBe(true)
    }
  )
})

function createExtractors(): LocalContentExtractor[] {
  const strategies: ContentExtractionStrategy[] = [
    'text',
    'document',
    'spreadsheet',
    'presentation',
    'fixed_layout',
    'image_ocr',
    'office_convert',
    'office_sanitize',
    'archive',
    'ecosystem'
  ]
  return strategies.map((strategy) => ({
    strategy,
    version: `acceptance-${strategy}-v1`,
    extract: vi.fn().mockImplementation(
      async (input): Promise<ExtractedContentBundle> => {
        const text = `indexed:${input.fileName}`
        return {
          sourceChecksum: input.sourceChecksum,
          format: input.fileName.split('.').at(-1) ?? 'unknown',
          extractorVersion: `acceptance-${strategy}-v1`,
          units: [
            {
              key: 'content',
              title: input.fileName,
              text,
              checksum: digest(text),
              byteSize: Buffer.byteLength(text),
              metadata: {
                format: input.fileName.split('.').at(-1) ?? 'unknown',
                extraction: strategy
              }
            }
          ]
        }
      }
    )
  }))
}

function digest(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
