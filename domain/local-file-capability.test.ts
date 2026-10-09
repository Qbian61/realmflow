import { describe, expect, it } from 'vitest'
import {
  classifyLocalFileCapability,
  LocalFileCapabilityError
} from './local-file-capability'

describe('local file capability', () => {
  it('treats text MIME and a specific text extension as compatible', () => {
    expect(
      classifyLocalFileCapability({
        fileName: 'README.md',
        mimeType: 'text/markdown',
        head: Buffer.from('# RealmFlow\n')
      })
    ).toMatchObject({
      format: 'md',
      readMode: 'text',
      writable: true,
      preferredTool: 'files.read'
    })
  })

  it('detects an extensionless strict UTF-8 file as text', () => {
    expect(
      classifyLocalFileCapability({
        fileName: 'LICENSE',
        head: Buffer.from('Copyright 2026')
      })
    ).toMatchObject({
      format: 'text',
      readMode: 'text',
      writable: true
    })
  })

  it('keeps invalid UTF-8 binary content unsupported', () => {
    expect(
      classifyLocalFileCapability({
        fileName: 'payload',
        head: Buffer.from([0xff, 0xfe, 0x00, 0x01])
      })
    ).toMatchObject({
      format: 'unknown',
      readMode: 'unsupported',
      writable: false
    })
  })

  it('uses signatures to expose the revision-safe PDF editor', () => {
    expect(
      classifyLocalFileCapability({
        fileName: 'download',
        head: Buffer.from('%PDF-1.7')
      })
    ).toMatchObject({
      format: 'pdf',
      readMode: 'structured',
      writable: true,
      supportsRevision: true,
      preferredTool: 'pdf.inspect'
    })
  })

  it('exposes DOCX through the revision-safe document editor', () => {
    expect(
      classifyLocalFileCapability({
        fileName: 'report.docx',
        head: Buffer.from([0x50, 0x4b, 0x03, 0x04])
      })
    ).toMatchObject({
      format: 'docx',
      readMode: 'structured',
      writable: true,
      creatable: true,
      supportsRevision: true,
      preferredTool: 'document.inspect'
    })
  })

  it('exposes PPTX through the revision-safe presentation editor', () => {
    expect(
      classifyLocalFileCapability({
        fileName: 'deck.pptx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        head: Buffer.from([0x50, 0x4b, 0x03, 0x04])
      })
    ).toMatchObject({
      format: 'pptx',
      readMode: 'structured',
      writable: true,
      creatable: true,
      supportsRevision: true,
      preferredTool: 'presentation.inspect'
    })
  })

  it.each([
    ['report.doc', 'doc'],
    ['template.dot', 'dot'],
    ['writer.wps', 'wps'],
    ['writer-template.wpt', 'wpt'],
    ['ledger.xls', 'xls'],
    ['ledger-template.xlt', 'xlt'],
    ['deck.ppt', 'ppt'],
    ['show.pps', 'pps'],
    ['deck-template.pot', 'pot']
  ])(
    'requires an explicit modern-format import for %s',
    (fileName, format) => {
      expect(
        classifyLocalFileCapability({
          fileName,
          head: LEGACY_OFFICE_HEADER
        })
      ).toMatchObject({
        format,
        readMode: 'structured',
        writable: false,
        creatable: false,
        conversionRequired: true,
        supportsRevision: false,
        preferredTool: 'office.import_legacy'
      })
    }
  )

  it.each([
    ['template.dotx', 'dotx'],
    ['template.xltx', 'xltx'],
    ['template.potx', 'potx'],
    ['report.docm', 'docm'],
    ['template.dotm', 'dotm'],
    ['ledger.xlsm', 'xlsm'],
    ['template.xltm', 'xltm'],
    ['deck.pptm', 'pptm'],
    ['show.ppsm', 'ppsm'],
    ['template.potm', 'potm']
  ])(
    'opens %s read-only before an explicit safe-copy operation',
    (fileName, format) => {
      expect(
        classifyLocalFileCapability({
          fileName,
          head: Buffer.from([0x50, 0x4b, 0x03, 0x04])
        })
      ).toMatchObject({
        format,
        readMode: 'structured',
        writable: false,
        creatable: false,
        conversionRequired: true,
        preservesMacros: false,
        supportsRevision: false,
        preferredTool: 'office.inspect_original'
      })
    }
  )

  it('rejects a legacy Office extension with an OOXML ZIP signature', () => {
    expect(() =>
      classifyLocalFileCapability({
        fileName: 'report.doc',
        head: Buffer.from([0x50, 0x4b, 0x03, 0x04])
      })
    ).toThrowError(
      expect.objectContaining<Partial<LocalFileCapabilityError>>({
        code: 'file_format_conflict'
      })
    )
  })

  it.each([
    ['report.xlsx', Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'xlsx'],
    ['report.csv', Buffer.from('name,count\nRealmFlow,12\n'), 'csv'],
    ['report.tsv', Buffer.from('name\tcount\nRealmFlow\t12\n'), 'tsv']
  ])(
    'exposes %s through the structured spreadsheet tools',
    (fileName, head, format) => {
      expect(
        classifyLocalFileCapability({ fileName, head })
      ).toMatchObject({
        format,
        readMode: 'structured',
        writable: true,
        creatable: true,
        supportsRevision: true,
        preferredTool: 'spreadsheet.inspect'
      })
    }
  )

  it.each([
    [
      'photo.png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      'png'
    ],
    ['photo.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'jpeg'],
    ['animation.gif', Buffer.from('GIF89a'), 'gif'],
    ['diagram.webp', Buffer.from('RIFF1234WEBP'), 'webp'],
    [
      'diagram.svg',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      'svg'
    ]
  ])('exposes %s through the revision-safe image tools', (fileName, head, format) => {
    expect(classifyLocalFileCapability({ fileName, head })).toMatchObject({
      format,
      readMode: 'preview',
      writable: true,
      supportsRevision: true,
      preferredTool: 'image.inspect'
    })
  })

  it.each([
    ['bundle.zip', Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'zip'],
    [
      'bundle.tar',
      Buffer.concat([Buffer.alloc(257), Buffer.from('ustar')]),
      'tar'
    ],
    ['bundle.tgz', Buffer.from([0x1f, 0x8b, 0x08, 0x00]), 'tgz'],
    ['bundle.gz', Buffer.from([0x1f, 0x8b, 0x08, 0x00]), 'gz']
  ])('exposes %s through the archive tools', (fileName, head, format) => {
    expect(classifyLocalFileCapability({ fileName, head })).toMatchObject({
      format,
      readMode: 'archive',
      writable: true,
      creatable: true,
      supportsRevision: false,
      preferredTool: 'archives.list'
    })
  })

  it('treats TGZ and the generic GZIP MIME type as compatible', () => {
    expect(
      classifyLocalFileCapability({
        fileName: 'bundle.tgz',
        mimeType: 'application/gzip',
        head: Buffer.from([0x1f, 0x8b, 0x08, 0x00])
      })
    ).toMatchObject({
      format: 'tgz',
      readMode: 'archive',
      preferredTool: 'archives.list'
    })
  })

  it('exposes OFD as a read-only fixed-layout preview', () => {
    expect(
      classifyLocalFileCapability({
        fileName: 'invoice.ofd',
        mimeType: 'application/ofd',
        head: Buffer.from([0x50, 0x4b, 0x03, 0x04])
      })
    ).toMatchObject({
      format: 'ofd',
      readMode: 'preview',
      writable: false,
      creatable: false,
      supportsRevision: false,
      preferredTool: 'fixed_layout.inspect'
    })
  })

  it('rejects a non-ZIP payload with an OFD extension', () => {
    expect(() =>
      classifyLocalFileCapability({
        fileName: 'invoice.ofd',
        head: Buffer.from('%PDF-1.7')
      })
    ).toThrowError(
      expect.objectContaining<Partial<LocalFileCapabilityError>>({
        code: 'file_format_conflict'
      })
    )
  })

  it.each(['bundle.7z', 'bundle.rar'])(
    'keeps %s unsupported without a packaged local adapter',
    (fileName) => {
      expect(
        classifyLocalFileCapability({
          fileName,
          head: Buffer.from([0xff, 0x00, 0xaa, 0x55])
        })
      ).toMatchObject({
        readMode: 'unsupported',
        writable: false,
        creatable: false,
        preferredTool: null
      })
    }
  )

  it('rejects a ZIP extension with a GZIP signature', () => {
    expect(() =>
      classifyLocalFileCapability({
        fileName: 'bundle.zip',
        head: Buffer.from([0x1f, 0x8b, 0x08, 0x00])
      })
    ).toThrowError(
      expect.objectContaining<Partial<LocalFileCapabilityError>>({
        code: 'file_format_conflict'
      })
    )
  })

  it('reports a stable conflict when extension and signature disagree', () => {
    expect(() =>
      classifyLocalFileCapability({
        fileName: 'invoice.pdf',
        head: Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
        ])
      })
    ).toThrowError(
      expect.objectContaining<Partial<LocalFileCapabilityError>>({
        code: 'file_format_conflict'
      })
    )
  })
})

const LEGACY_OFFICE_HEADER = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1
])
