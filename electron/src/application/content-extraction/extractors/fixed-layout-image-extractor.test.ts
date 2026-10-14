import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  FixedLayoutContentExtractor,
  ImageOcrContentExtractor
} from './fixed-layout-image-extractor'

describe('FixedLayoutContentExtractor', () => {
  it('keeps native OFD text and OCRs only scanned pages', async () => {
    const port = {
      inspectBytes: vi.fn().mockResolvedValue({
        format: 'ofd',
        metadata: { title: 'Invoice' },
        pages: [
          {
            pageNumber: 1,
            sourcePath: 'page-1.xml',
            text: 'Native invoice',
            characterCount: 14,
            ocrRequired: false
          },
          {
            pageNumber: 2,
            sourcePath: 'page-2.xml',
            text: '',
            characterCount: 0,
            ocrRequired: true
          }
        ],
        pageCount: 2,
        characterCount: 14,
        ocrRequired: true
      }),
      ocrPageBytes: vi.fn().mockResolvedValue({
        language: 'chi_sim',
        blocks: [block('扫描发票')]
      })
    }

    await expect(
      new FixedLayoutContentExtractor(port).extract(input('invoice.ofd'))
    ).resolves.toMatchObject({
      units: [
        {
          key: 'page/000001',
          text: 'Native invoice',
          metadata: { extraction: 'ofd_native', page: 1 }
        },
        {
          key: 'page/000002',
          text: '扫描发票',
          metadata: { extraction: 'ofd_ocr', page: 2 }
        }
      ]
    })
    expect(port.ocrPageBytes).toHaveBeenCalledOnce()
  })
})

describe('ImageOcrContentExtractor', () => {
  it.each(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'])(
    'extracts %s through bounded local OCR',
    async (extension) => {
      const port = {
        ocrBytes: vi.fn().mockResolvedValue({
          language: 'eng',
          blocks: [block('RealmFlow')]
        })
      }

      await expect(
        new ImageOcrContentExtractor(port).extract(
          input(`diagram.${extension}`, { ocrLanguage: 'eng' })
        )
      ).resolves.toMatchObject({
        units: [
          {
            key: 'content',
            text: 'RealmFlow',
            metadata: {
              extraction: 'image_ocr'
            }
          }
        ]
      })
      expect(port.ocrBytes).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        `diagram.${extension}`,
        extension === 'jpg' ? 'jpeg' : extension,
        expect.any(AbortSignal),
        { language: 'eng' }
      )
    }
  )

  it('maps empty or failed OCR to a stable error', async () => {
    await expect(
      new ImageOcrContentExtractor({
        ocrBytes: vi.fn().mockResolvedValue({
          language: 'eng',
          blocks: []
        })
      }).extract(input('empty.png'))
    ).rejects.toMatchObject({ code: 'extraction_ocr_failed' })
  })
})

function input(
  fileName: string,
  policy: { ocrLanguage?: string } = {}
) {
  const bytes = Uint8Array.from(
    Buffer.from(fileName.endsWith('.ofd') ? 'PK\u0003\u0004' : 'image')
  )
  return {
    bytes,
    fileName,
    sourceChecksum: digest(bytes),
    policy: {
      consumer: 'knowledge_index' as const,
      allowLocalOcr: true,
      allowLocalConversion: false,
      maxCharacters: 100_000,
      maxUnits: 2_000,
      ...policy
    },
    signal: new AbortController().signal,
    depth: 0
  }
}

function block(text: string) {
  return {
    text,
    confidence: 0.99,
    bounds: { x: 1, y: 1, width: 20, height: 8 }
  }
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
