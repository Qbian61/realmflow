import JSZip from 'jszip'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  FixedLayoutAdapter,
  FixedLayoutError
} from './fixed-layout-adapter'

describe('FixedLayoutAdapter', () => {
  const adapter = new FixedLayoutAdapter()

  it('extracts OFD metadata, ordered pages, dimensions, and text', async () => {
    const inspection = await adapter.inspect({
      content: await ofdFixture()
    })

    expect(inspection).toEqual({
      format: 'ofd',
      metadata: {
        title: 'RealmFlow invoice',
        author: 'Local User',
        creator: 'RealmFlow',
        creationDate: '2026-10-07'
      },
      pages: [
        {
          pageNumber: 1,
          sourcePath: 'Doc_0/Pages/Page_0/Content.xml',
          widthMm: 210,
          heightMm: 297,
          text: 'Invoice 2026\nTotal 100',
          characterCount: 22,
          ocrRequired: false
        },
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
      characterCount: 22,
      ocrRequired: true
    })
  })

  it.each([
    {
      name: 'traversal DocRoot',
      overrides: { docRoot: '../outside.xml' },
      code: 'fixed_layout_unsafe_path'
    },
    {
      name: 'missing Document.xml',
      overrides: { omitDocument: true },
      code: 'fixed_layout_invalid'
    },
    {
      name: 'missing page content',
      overrides: { omitSecondPage: true },
      code: 'fixed_layout_invalid'
    },
    {
      name: 'malformed XML',
      overrides: { documentXml: '<ofd:Document>' },
      code: 'fixed_layout_invalid'
    }
  ])('rejects $name', async ({ overrides, code }) => {
    await expect(
      adapter.inspect({ content: await ofdFixture(overrides) })
    ).rejects.toMatchObject({ code })
  })

  it('rejects source, XML, page-count, and text limits', async () => {
    const source = await ofdFixture()
    const cases = [
      { limits: { maxSourceBytes: 10 } },
      { limits: { maxXmlBytes: 10 } },
      { limits: { maxPages: 1 } },
      { limits: { maxCharacters: 5 } }
    ]

    for (const { limits } of cases) {
      await expect(
        adapter.inspect({ content: source, limits })
      ).rejects.toEqual(
        new FixedLayoutError(
          'fixed_layout_too_large',
          'OFD exceeds a fixed-layout safety limit'
        )
      )
    }
  })

  it('rejects unsafe ZIP entry names before parsing', async () => {
    const archive = new JSZip()
    archive.file('../OFD.xml', '<OFD/>')

    await expect(
      adapter.inspect({
        content: await archive.generateAsync({ type: 'nodebuffer' })
      })
    ).rejects.toMatchObject({ code: 'fixed_layout_unsafe_path' })
  })

  it('renders an embedded scanned page image to a bounded PNG', async () => {
    const rendered = await adapter.renderPage({
      content: await ofdFixture({ scannedImage: true }),
      pageNumber: 2,
      maxDimension: 100
    })
    const metadata = await sharp(rendered.content).metadata()

    expect(rendered).toMatchObject({
      sourcePage: 2,
      mimeType: 'image/png',
      width: 71,
      height: 100
    })
    expect(metadata).toMatchObject({ format: 'png', width: 71, height: 100 })
  })

  it('rejects pages without a supported embedded raster resource', async () => {
    await expect(
      adapter.renderPage({
        content: await ofdFixture(),
        pageNumber: 2
      })
    ).rejects.toMatchObject({
      code: 'fixed_layout_ocr_render_unsupported'
    })
  })
})

async function ofdFixture(
  overrides: {
    docRoot?: string
    omitDocument?: boolean
    omitSecondPage?: boolean
    documentXml?: string
    scannedImage?: boolean
  } = {}
): Promise<Buffer> {
  const archive = new JSZip()
  archive.file(
    'OFD.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:DocBody>
    <ofd:DocInfo>
      <ofd:Title>RealmFlow invoice</ofd:Title>
      <ofd:Author>Local User</ofd:Author>
      <ofd:Creator>RealmFlow</ofd:Creator>
      <ofd:CreationDate>2026-10-07</ofd:CreationDate>
    </ofd:DocInfo>
    <ofd:DocRoot>${overrides.docRoot ?? 'Doc_0/Document.xml'}</ofd:DocRoot>
  </ofd:DocBody>
</ofd:OFD>`
  )
  if (!overrides.omitDocument) {
    archive.file(
      'Doc_0/Document.xml',
      overrides.documentXml ??
        `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:CommonData>
    <ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea>
    ${overrides.scannedImage ? '<ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes>' : ''}
  </ofd:CommonData>
  <ofd:Pages>
    <ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/>
    <ofd:Page ID="2" BaseLoc="Pages/Page_1/Content.xml"/>
  </ofd:Pages>
</ofd:Document>`
    )
  }
  if (overrides.scannedImage) {
    archive.file(
      'Doc_0/DocumentRes.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res">
  <ofd:MultiMedias>
    <ofd:MultiMedia ID="1" Type="Image" Format="PNG">
      <ofd:MediaFile>page-2.png</ofd:MediaFile>
    </ofd:MultiMedia>
  </ofd:MultiMedias>
</ofd:Res>`
    )
    archive.file(
      'Doc_0/Res/page-2.png',
      await sharp({
        create: {
          width: 20,
          height: 30,
          channels: 3,
          background: '#ffffff'
        }
      }).png().toBuffer()
    )
  }
  archive.file(
    'Doc_0/Pages/Page_0/Content.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Content><ofd:Layer>
    <ofd:TextObject><ofd:TextCode>Invoice 2026</ofd:TextCode></ofd:TextObject>
    <ofd:TextObject><ofd:TextCode>Total 100</ofd:TextCode></ofd:TextObject>
  </ofd:Layer></ofd:Content>
</ofd:Page>`
  )
  if (!overrides.omitSecondPage) {
    archive.file(
      'Doc_0/Pages/Page_1/Content.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
    <ofd:Content><ofd:Layer><ofd:ImageObject ResourceID="1" Boundary="0 0 210 297"/></ofd:Layer></ofd:Content>
</ofd:Page>`
    )
  }
  return archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    platform: 'UNIX'
  })
}
