import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  ContentExtractionPolicy,
  ExtractedContentBundle
} from '../../../../domain/content-extraction'
import {
  LocalContentExtractionService,
  MemoryContentExtractionCache,
  type LocalContentExtractor
} from './local-content-extraction-service'

const policy: ContentExtractionPolicy = {
  consumer: 'conversation',
  allowLocalOcr: true,
  allowLocalConversion: true,
  maxCharacters: 10_000,
  maxUnits: 10,
  ocrLanguage: 'chi_sim'
}

describe('LocalContentExtractionService', () => {
  it('routes detected content to the matching extractor', async () => {
    const extractor = fakeExtractor('document')
    const service = new LocalContentExtractionService({
      extractors: [extractor],
      cache: new MemoryContentExtractionCache()
    })
    const bytes = Buffer.from('%PDF-1.7\ncontent')

    await expect(
      service.extract({
        bytes,
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        sourceChecksum: digest(bytes),
        policy,
        signal: new AbortController().signal,
        depth: 0
      })
    ).resolves.toMatchObject({
      format: 'pdf',
      extractorVersion: 'fake-v1',
      units: [{ key: 'content', text: 'extracted invoice.pdf' }]
    })
    expect(extractor.extract).toHaveBeenCalledOnce()
  })

  it('routes same-strategy formats to a format-specific extractor', async () => {
    const docx = {
      ...fakeExtractor('document'),
      formats: ['docx']
    }
    const pdf = {
      ...fakeExtractor('document'),
      formats: ['pdf']
    }
    const service = new LocalContentExtractionService({
      extractors: [docx, pdf],
      cache: new MemoryContentExtractionCache()
    })
    const bytes = Buffer.from('%PDF-1.7\ncontent')

    await service.extract({
      bytes,
      fileName: 'invoice.pdf',
      sourceChecksum: digest(bytes),
      policy,
      signal: new AbortController().signal,
      depth: 0
    })

    expect(docx.extract).not.toHaveBeenCalled()
    expect(pdf.extract).toHaveBeenCalledOnce()
  })

  it('routes legacy Office CFB files to native legacy extraction before conversion', async () => {
    const bytes = Uint8Array.from([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
      ...Buffer.from('native legacy body', 'utf16le')
    ])
    const legacyOffice = {
      ...fakeExtractor('legacy_office' as LocalContentExtractor['strategy'], {
        sourceChecksum: digest(bytes),
        format: 'doc',
        extractorVersion: 'legacy-native-v1',
        units: [
          {
            key: 'content',
            title: 'brief.doc',
            text: 'native legacy body',
            checksum: digest(Buffer.from('native legacy body')),
            byteSize: 18
          }
        ]
      }),
      formats: ['doc']
    }
    const converter = {
      ...fakeExtractor('office_convert'),
      formats: ['doc', 'wps']
    }
    const service = new LocalContentExtractionService({
      extractors: [legacyOffice, converter],
      cache: new MemoryContentExtractionCache()
    })

    await service.extract({
      bytes,
      fileName: 'brief.doc',
      sourceChecksum: digest(bytes),
      policy,
      signal: new AbortController().signal,
      depth: 0
    })

    expect(legacyOffice.extract).toHaveBeenCalledOnce()
    expect(converter.extract).not.toHaveBeenCalled()
  })

  it('coalesces concurrent requests for the same extraction key', async () => {
    let release!: (bundle: ExtractedContentBundle) => void
    const extractor = fakeExtractor(
      'document',
      new Promise<ExtractedContentBundle>((resolve) => {
        release = resolve
      })
    )
    const service = new LocalContentExtractionService({
      extractors: [extractor],
      cache: new MemoryContentExtractionCache()
    })
    const bytes = Buffer.from('%PDF-1.7\ncontent')
    const input = {
      bytes,
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      sourceChecksum: digest(bytes),
      policy,
      signal: new AbortController().signal,
      depth: 0
    }

    const first = service.extract(input)
    const second = service.extract(input)
    release(bundle('invoice.pdf'))

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(extractor.extract).toHaveBeenCalledOnce()
  })

  it('isolates cache entries by OCR language and policy version', async () => {
    const extractor = fakeExtractor('document')
    const cache = new MemoryContentExtractionCache()
    const service = new LocalContentExtractionService({
      extractors: [extractor],
      cache,
      policyVersion: 'policy-v2'
    })
    const bytes = Buffer.from('%PDF-1.7\ncontent')
    const common = {
      bytes,
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      sourceChecksum: digest(bytes),
      signal: new AbortController().signal,
      depth: 0
    }

    await service.extract({ ...common, policy })
    await service.extract({ ...common, policy })
    await service.extract({
      ...common,
      policy: { ...policy, ocrLanguage: 'eng' }
    })

    expect(extractor.extract).toHaveBeenCalledTimes(2)
    expect(cache.size).toBe(2)
  })

  it('reads cached extraction without invoking the extractor', async () => {
    const extractor = fakeExtractor('document')
    const service = new LocalContentExtractionService({
      extractors: [extractor],
      cache: new MemoryContentExtractionCache()
    })
    const bytes = Buffer.from('%PDF-1.7\ncontent')
    const input = {
      bytes,
      fileName: 'invoice.pdf',
      sourceChecksum: digest(bytes),
      policy,
      signal: new AbortController().signal,
      depth: 0
    }

    await service.extract(input)
    vi.mocked(extractor.extract).mockClear()

    await expect(service.getCached(input)).resolves.toMatchObject({
      units: [{ text: 'extracted invoice.pdf' }]
    })
    expect(extractor.extract).not.toHaveBeenCalled()
  })

  it('rejects checksum mismatch before invoking an extractor', async () => {
    const extractor = fakeExtractor('document')
    const service = new LocalContentExtractionService({
      extractors: [extractor],
      cache: new MemoryContentExtractionCache()
    })

    await expect(
      service.extract({
        bytes: Buffer.from('%PDF-1.7'),
        fileName: 'invoice.pdf',
        sourceChecksum: `sha256:${'a'.repeat(64)}`,
        policy,
        signal: new AbortController().signal,
        depth: 0
      })
    ).rejects.toMatchObject({
      code: 'source_changed_during_extraction'
    })
    expect(extractor.extract).not.toHaveBeenCalled()
  })

  it('rejects empty or over-budget extraction results', async () => {
    const empty = fakeExtractor('document', {
      ...bundle('invoice.pdf'),
      units: []
    })
    const service = new LocalContentExtractionService({
      extractors: [empty],
      cache: new MemoryContentExtractionCache()
    })
    const bytes = Buffer.from('%PDF-1.7')
    const input = {
      bytes,
      fileName: 'invoice.pdf',
      sourceChecksum: digest(bytes),
      policy,
      signal: new AbortController().signal,
      depth: 0
    }

    await expect(service.extract(input)).rejects.toMatchObject({
      code: 'extraction_empty'
    })

    const oversized = fakeExtractor('document', {
      ...bundle('invoice.pdf'),
      units: [
        {
          ...bundle('invoice.pdf').units[0]!,
          text: 'x'.repeat(101)
        }
      ]
    })
    await expect(
      new LocalContentExtractionService({
        extractors: [oversized],
        cache: new MemoryContentExtractionCache()
      }).extract({
        ...input,
        policy: { ...policy, maxCharacters: 100 }
      })
    ).rejects.toMatchObject({ code: 'extraction_limit_exceeded' })
  })
})

function fakeExtractor(
  strategy: LocalContentExtractor['strategy'],
  result:
    | ExtractedContentBundle
    | Promise<ExtractedContentBundle> = bundle('invoice.pdf')
): LocalContentExtractor {
  return {
    strategy,
    version: 'fake-v1',
    extract: vi.fn().mockImplementation(async () => result)
  }
}

function bundle(fileName: string): ExtractedContentBundle {
  return {
    sourceChecksum: digest(Buffer.from('%PDF-1.7\ncontent')),
    format: 'pdf',
    extractorVersion: 'fake-v1',
    units: [
      {
        key: 'content',
        title: fileName,
        text: `extracted ${fileName}`,
        checksum: digest(Buffer.from('content')),
        byteSize: 7
      }
    ]
  }
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
