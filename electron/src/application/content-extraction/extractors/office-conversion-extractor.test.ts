import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { ExtractedContentBundle } from '../../../../../domain/content-extraction'
import {
  OfficeConversionContentExtractor,
  OfficeSanitizedContentExtractor
} from './office-conversion-extractor'

const LEGACY = [
  'doc', 'dot', 'wps', 'wpt', 'xls', 'xlt', 'ppt', 'pps', 'pot'
] as const
const SANITIZED = [
  'dotx', 'docm', 'dotm', 'xltx', 'xlsm', 'xltm', 'potx', 'pptm', 'ppsm',
  'potm'
] as const

describe('Office conversion content extractors', () => {
  it.each(LEGACY)('converts %s bytes before modern extraction', async (format) => {
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

function input(fileName: string) {
  return {
    bytes: SOURCE_BYTES,
    fileName,
    sourceChecksum: digest(SOURCE_BYTES),
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
