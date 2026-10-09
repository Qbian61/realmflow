// @vitest-environment node

import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import {
  FixedLayoutAdapter,
  type FixedLayoutInspection
} from './fixed-layout-adapter'
import {
  FixedLayoutService,
  type FixedLayoutStorage
} from './fixed-layout-service'
import { LocalTesseractOcrAdapter } from './local-tesseract-ocr-adapter'

describe('FixedLayoutService', () => {
  it('returns relative source facts after checksum verification', async () => {
    const storage = createStorage()
    const adapter = {
      inspect: vi.fn().mockResolvedValue(INSPECTION),
      renderPage: vi.fn()
    } satisfies Pick<FixedLayoutAdapter, 'inspect' | 'renderPage'>

    const result = await new FixedLayoutService({ adapter, storage }).inspect({
      sourceCanonicalPath: '/workspace/invoice.ofd',
      sourceRelativePath: 'invoice.ofd',
      signal: signal()
    })

    expect(adapter.inspect).toHaveBeenCalledWith({ content: OFD_BYTES })
    expect(result).toEqual({
      sourcePath: 'invoice.ofd',
      sourceChecksum: sha256(OFD_BYTES),
      ...INSPECTION
    })
  })

  it('rejects a source changed during parsing', async () => {
    const storage = createStorage()
    storage.checksum
      .mockResolvedValueOnce(sha256(OFD_BYTES))
      .mockResolvedValueOnce(sha256(Buffer.from('changed')))

    await expect(
      new FixedLayoutService({
        adapter: {
          inspect: vi.fn().mockResolvedValue(INSPECTION),
          renderPage: vi.fn()
        },
        storage
      }).inspect({
        sourceCanonicalPath: '/workspace/invoice.ofd',
        sourceRelativePath: 'invoice.ofd',
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'file_conflict' })
  })

  it('does not return an inspection after cancellation', async () => {
    const controller = new AbortController()
    const adapter = {
      inspect: vi.fn().mockImplementation(async () => {
        controller.abort()
        return INSPECTION
      }),
      renderPage: vi.fn()
    }

    await expect(
      new FixedLayoutService({
        adapter,
        storage: createStorage()
      }).inspect({
        sourceCanonicalPath: '/workspace/invoice.ofd',
        sourceRelativePath: 'invoice.ofd',
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('renders and recognizes one scanned OFD page locally', async () => {
    const adapter = {
      inspect: vi.fn().mockResolvedValue(OCR_INSPECTION),
      renderPage: vi.fn().mockResolvedValue({
        sourcePage: 2,
        mimeType: 'image/png',
        width: 100,
        height: 120,
        content: Buffer.from('png')
      })
    }
    const localOcr = {
      recognize: vi.fn().mockResolvedValue({
        language: 'chi_sim',
        blocks: [
          {
            text: '发票',
            confidence: 0.96,
            bounds: { x: 5, y: 8, width: 30, height: 12 }
          }
        ]
      })
    }

    await expect(
      new FixedLayoutService({
        adapter,
        storage: createStorage(),
        localOcr
      }).ocr({
        sourceCanonicalPath: '/workspace/invoice.ofd',
        sourceRelativePath: 'invoice.ofd',
        pageNumber: 2,
        language: 'chi_sim',
        maxDimension: 120,
        signal: signal()
      })
    ).resolves.toEqual({
      sourceOfd: 'invoice.ofd',
      sourcePage: 2,
      provider: 'local',
      language: 'chi_sim',
      blocks: [
        {
          text: '发票',
          confidence: 0.96,
          bounds: { x: 5, y: 8, width: 30, height: 12 }
        }
      ]
    })
    expect(adapter.renderPage).toHaveBeenCalledWith({
      content: OFD_BYTES,
      pageNumber: 2,
      maxDimension: 120
    })
    expect(localOcr.recognize).toHaveBeenCalledWith(
      {
        content: Buffer.from('png'),
        sourcePath: 'invoice.ofd#page=2',
        language: 'chi_sim'
      },
      expect.any(AbortSignal)
    )
  })

  it('rejects redundant OCR for a native-text page', async () => {
    await expect(
      new FixedLayoutService({
        adapter: {
          inspect: vi.fn().mockResolvedValue(INSPECTION),
          renderPage: vi.fn()
        },
        storage: createStorage(),
        localOcr: { recognize: vi.fn() }
      }).ocr({
        sourceCanonicalPath: '/workspace/invoice.ofd',
        sourceRelativePath: 'invoice.ofd',
        pageNumber: 1,
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'fixed_layout_ocr_not_required' })
  })

  it('reports unavailable local OCR before rendering a scanned page', async () => {
    const adapter = {
      inspect: vi.fn().mockResolvedValue(OCR_INSPECTION),
      renderPage: vi.fn()
    }
    await expect(
      new FixedLayoutService({
        adapter,
        storage: createStorage()
      }).ocr({
        sourceCanonicalPath: '/workspace/invoice.ofd',
        sourceRelativePath: 'invoice.ofd',
        pageNumber: 2,
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'fixed_layout_ocr_unavailable' })
    expect(adapter.renderPage).not.toHaveBeenCalled()
  })

  it(
    'recognizes a real embedded OFD scan with the bundled local runtime',
    async () => {
      const content = await scannedOfdFixture()
      const storage = {
        read: vi.fn().mockResolvedValue(content),
        checksum: vi.fn().mockResolvedValue(sha256(content))
      }
      const service = new FixedLayoutService({
        adapter: new FixedLayoutAdapter(),
        storage,
        localOcr: new LocalTesseractOcrAdapter()
      })

      const result = await service.ocr({
        sourceCanonicalPath: '/workspace/scan.ofd',
        sourceRelativePath: 'scan.ofd',
        pageNumber: 1,
        language: 'eng',
        maxDimension: 1_200,
        signal: signal()
      })

      expect(result.sourcePage).toBe(1)
      expect(result.provider).toBe('local')
      expect(result.blocks.map(({ text }) => text).join(' ')).toContain(
        'REALMFLOW'
      )
    },
    30_000
  )
})

const OFD_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01])
const INSPECTION: FixedLayoutInspection = {
  format: 'ofd',
  metadata: { title: 'Invoice' },
  pages: [
    {
      pageNumber: 1,
      sourcePath: 'Doc_0/Pages/Page_0/Content.xml',
      widthMm: 210,
      heightMm: 297,
      text: 'Invoice',
      characterCount: 7,
      ocrRequired: false
    }
  ],
  pageCount: 1,
  characterCount: 7,
  ocrRequired: false
}
const OCR_INSPECTION: FixedLayoutInspection = {
  ...INSPECTION,
  pages: [
    INSPECTION.pages[0]!,
    {
      pageNumber: 2,
      sourcePath: 'Doc_0/Pages/Page_1/Content.xml',
      widthMm: 210,
      heightMm: 297,
      text: '',
      characterCount: 0,
      ocrRequired: true
    }
  ],
  pageCount: 2,
  ocrRequired: true
}

function createStorage(): FixedLayoutStorage & {
  checksum: ReturnType<typeof vi.fn>
} {
  return {
    read: vi.fn().mockResolvedValue(OFD_BYTES),
    checksum: vi.fn().mockResolvedValue(sha256(OFD_BYTES))
  }
}

function signal(): AbortSignal {
  return new AbortController().signal
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

async function scannedOfdFixture(): Promise<Buffer> {
  const image = await sharp(
    Buffer.from(
      '<svg width="800" height="180" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="180" fill="white"/><text x="30" y="125" font-family="Arial" font-size="96" fill="black">REALMFLOW</text></svg>'
    )
  )
    .png()
    .toBuffer()
  const archive = new JSZip()
  archive.file(
    'OFD.xml',
    '<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>'
  )
  archive.file(
    'Doc_0/Document.xml',
    '<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016"><ofd:CommonData><ofd:PageArea><ofd:PhysicalBox>0 0 210 50</ofd:PhysicalBox></ofd:PageArea><ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes></ofd:CommonData><ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/></ofd:Pages></ofd:Document>'
  )
  archive.file(
    'Doc_0/DocumentRes.xml',
    '<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res"><ofd:MultiMedias><ofd:MultiMedia ID="1" Type="Image" Format="PNG"><ofd:MediaFile>scan.png</ofd:MediaFile></ofd:MultiMedia></ofd:MultiMedias></ofd:Res>'
  )
  archive.file(
    'Doc_0/Pages/Page_0/Content.xml',
    '<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016"><ofd:Content><ofd:Layer><ofd:ImageObject ResourceID="1" Boundary="0 0 210 50"/></ofd:Layer></ofd:Content></ofd:Page>'
  )
  archive.file('Doc_0/Res/scan.png', image)
  return archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    platform: 'UNIX'
  })
}
