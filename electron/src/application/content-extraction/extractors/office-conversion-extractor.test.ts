import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { ExtractedContentBundle } from '../../../../../domain/content-extraction'
import type { LocalContentExtractor } from '../local-content-extraction-service'
import * as officeExtractors from './office-conversion-extractor'
import {
  OfficeConversionContentExtractor,
  OfficeSanitizedContentExtractor
} from './office-conversion-extractor'

const LEGACY_NATIVE = [
  ['doc', 'content'],
  ['dot', 'content'],
  ['xls', 'sheet/workbook'],
  ['xlt', 'sheet/workbook'],
  ['ppt', 'slide/000001'],
  ['pps', 'slide/000001'],
  ['pot', 'slide/000001']
] as const
const LEGACY_CONVERT = ['wps', 'wpt'] as const
const SANITIZED = [
  'dotx', 'docm', 'dotm', 'xltx', 'xlsm', 'xltm', 'potx', 'pptm', 'ppsm',
  'potm'
] as const

describe('Office conversion content extractors', () => {
  it.each(LEGACY_NATIVE)(
    'extracts %s CFB text natively before LibreOffice fallback',
    async (format, expectedKey) => {
      const modern = modernExtractor()
      const convertBytes = vi.fn()
      const bytes = legacyBinaryText(`${format} quarterly roadmap`)
      const result = await legacyOfficeExtractor(
        { convertBytes },
        modern
      ).extract(input(`source.${format}`, bytes))

      expect(convertBytes).not.toHaveBeenCalled()
      expect(result.sourceChecksum).toBe(digest(bytes))
      expect(result.format).toBe(format)
      expect(result.units[0]).toMatchObject({
        key: expectedKey,
        text: expect.stringContaining(`${format} quarterly roadmap`),
        metadata: {
          format,
          extraction: 'legacy_office_native'
        }
      })
    }
  )

  it('falls back to LibreOffice conversion when native legacy extraction is empty', async () => {
    const modern = modernExtractor()
    const convertBytes = vi.fn().mockResolvedValue({
      outputFormat: 'docx',
      bytes: MODERN_BYTES
    })
    const result = await legacyOfficeExtractor(
      { convertBytes },
      modern
    ).extract(input('source.doc', SOURCE_BYTES))

    expect(convertBytes).toHaveBeenCalledWith({
      bytes: SOURCE_BYTES,
      sourceFormat: 'doc',
      signal: expect.any(AbortSignal)
    })
    expect(modern.extract).toHaveBeenCalledWith(
      'docx',
      expect.objectContaining({ bytes: MODERN_BYTES })
    )
    expect(result.units[0]?.metadata?.extraction).toContain('office_convert')
  })

  it.each(LEGACY_CONVERT)('converts %s bytes before modern extraction', async (format) => {
    const modern = modernExtractor()
    const convertBytes = vi.fn().mockResolvedValue({
      outputFormat: target(format),
      bytes: MODERN_BYTES
    })
    const result = await new OfficeConversionContentExtractor(
      { convertBytes },
      modern
    ).extract(input(`source.${format}`))

    expect(convertBytes).toHaveBeenCalledWith({
      bytes: SOURCE_BYTES,
      sourceFormat: format,
      signal: expect.any(AbortSignal)
    })
    expect(modern.extract).toHaveBeenCalledWith(
      target(format),
      expect.objectContaining({ bytes: MODERN_BYTES })
    )
    expect(result.sourceChecksum).toBe(digest(SOURCE_BYTES))
    expect(result.units[0]?.metadata?.extraction).toContain('office_convert')
  })

  it.each(SANITIZED)(
    'sanitizes %s without executing active content',
    async (format) => {
      const modern = modernExtractor()
      const sanitizeBytes = vi.fn().mockResolvedValue({
        outputFormat: target(format),
        bytes: MODERN_BYTES,
        macrosRemoved: !format.endsWith('x'),
        templateMaterialized: format.includes('t'),
        removedParts: ['word/vbaProject.bin']
      })
      const result = await new OfficeSanitizedContentExtractor(
        { sanitizeBytes },
        modern
      ).extract(input(`source.${format}`))

      expect(sanitizeBytes).toHaveBeenCalledWith({
        bytes: SOURCE_BYTES,
        sourceFormat: format,
        signal: expect.any(AbortSignal)
      })
      expect(modern.extract).toHaveBeenCalledWith(
        target(format),
        expect.objectContaining({ bytes: MODERN_BYTES })
      )
      expect(result.units[0]?.metadata?.extraction).toContain(
        'office_sanitize'
      )
    }
  )
})

const SOURCE_BYTES = Uint8Array.from(
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
)
const MODERN_BYTES = Uint8Array.from(Buffer.from('PK\u0003\u0004modern'))

function input(fileName: string, bytes: Uint8Array = SOURCE_BYTES) {
  return {
    bytes,
    fileName,
    sourceChecksum: digest(bytes),
    policy: {
      consumer: 'knowledge_index' as const,
      allowLocalOcr: true,
      allowLocalConversion: true,
      maxCharacters: 100_000,
      maxUnits: 1_000
    },
    signal: new AbortController().signal,
    depth: 0
  }
}

type LegacyOfficeContentExtractorCtor = new (
  converter: ConstructorParameters<typeof OfficeConversionContentExtractor>[0],
  modern: ConstructorParameters<typeof OfficeConversionContentExtractor>[1]
) => LocalContentExtractor

function legacyOfficeExtractor(
  converter: ConstructorParameters<typeof OfficeConversionContentExtractor>[0],
  modern: ConstructorParameters<typeof OfficeConversionContentExtractor>[1]
): Pick<LocalContentExtractor, 'extract'> {
  const ctor = (
    officeExtractors as typeof officeExtractors & {
      LegacyOfficeContentExtractor?: LegacyOfficeContentExtractorCtor
    }
  ).LegacyOfficeContentExtractor
  expect(ctor).toBeTypeOf('function')
  if (!ctor) {
    throw new Error('LegacyOfficeContentExtractor is missing')
  }
  return new ctor(converter, modern)
}

function legacyBinaryText(text: string): Uint8Array {
  const buffer = Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(64),
    Buffer.from(text, 'utf16le')
  ])
  const copy = new Uint8Array(buffer.byteLength)
  copy.set(buffer)
  return copy
}

function modernExtractor() {
  return {
    extract: vi.fn(
      async (
        format: 'docx' | 'xlsx' | 'pptx'
      ): Promise<ExtractedContentBundle> => ({
        sourceChecksum: digest(MODERN_BYTES),
        format,
        extractorVersion: `${format}-v1`,
        units: [
          {
            key: 'content',
            title: `source.${format}`,
            text: 'Converted content',
            checksum: digest(Buffer.from('Converted content')),
            byteSize: 17,
            metadata: { format, extraction: format }
          }
        ]
      })
    )
  }
}

function target(format: string): 'docx' | 'xlsx' | 'pptx' {
  if (['doc', 'dot', 'wps', 'wpt', 'dotx', 'docm', 'dotm'].includes(format)) {
    return 'docx'
  }
  if (['xls', 'xlt', 'xltx', 'xlsm', 'xltm'].includes(format)) return 'xlsx'
  return 'pptx'
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
