import { describe, expect, it } from 'vitest'
import {
  CONTENT_EXTRACTION_LIMITS,
  ContentExtractionError,
  classifyExtractableContent,
  createArchiveEntryUnitKey,
  createEmailAttachmentUnitKey,
  createEpubSpineUnitKey,
  createPageUnitKey,
  createSheetUnitKey,
  createSlideUnitKey
} from './content-extraction'

describe('content extraction domain', () => {
  it.each([
    ['notes.md', 'text', 'guaranteed'],
    ['report.docx', 'document', 'guaranteed'],
    ['invoice.pdf', 'document', 'guaranteed'],
    ['table.csv', 'spreadsheet', 'guaranteed'],
    ['table.tsv', 'spreadsheet', 'guaranteed'],
    ['table.xlsx', 'spreadsheet', 'guaranteed'],
    ['deck.pptx', 'presentation', 'guaranteed'],
    ['invoice.ofd', 'fixed_layout', 'guaranteed'],
    ['scan.png', 'image_ocr', 'guaranteed'],
    ['scan.jpg', 'image_ocr', 'guaranteed'],
    ['scan.jpeg', 'image_ocr', 'guaranteed'],
    ['scan.webp', 'image_ocr', 'guaranteed'],
    ['scan.gif', 'image_ocr', 'guaranteed'],
    ['diagram.svg', 'image_ocr', 'guaranteed'],
    ['legacy.doc', 'office_convert', 'guaranteed'],
    ['legacy.dot', 'office_convert', 'guaranteed'],
    ['legacy.wps', 'office_convert', 'guaranteed'],
    ['legacy.wpt', 'office_convert', 'guaranteed'],
    ['legacy.xls', 'office_convert', 'guaranteed'],
    ['legacy.xlt', 'office_convert', 'guaranteed'],
    ['legacy.ppt', 'office_convert', 'guaranteed'],
    ['legacy.pps', 'office_convert', 'guaranteed'],
    ['legacy.pot', 'office_convert', 'guaranteed'],
    ['macro.docm', 'office_sanitize', 'guaranteed'],
    ['template.dotm', 'office_sanitize', 'guaranteed'],
    ['template.dotx', 'office_sanitize', 'guaranteed'],
    ['macro.xlsm', 'office_sanitize', 'guaranteed'],
    ['template.xltm', 'office_sanitize', 'guaranteed'],
    ['template.xltx', 'office_sanitize', 'guaranteed'],
    ['macro.pptm', 'office_sanitize', 'guaranteed'],
    ['show.ppsm', 'office_sanitize', 'guaranteed'],
    ['template.potm', 'office_sanitize', 'guaranteed'],
    ['template.potx', 'office_sanitize', 'guaranteed'],
    ['bundle.zip', 'archive', 'guaranteed'],
    ['bundle.tar', 'archive', 'guaranteed'],
    ['bundle.tgz', 'archive', 'guaranteed'],
    ['bundle.gz', 'archive', 'guaranteed'],
    ['letter.odt', 'ecosystem', 'guaranteed'],
    ['table.ods', 'ecosystem', 'guaranteed'],
    ['deck.odp', 'ecosystem', 'guaranteed'],
    ['letter.rtf', 'ecosystem', 'guaranteed'],
    ['message.eml', 'ecosystem', 'guaranteed'],
    ['archive.mbox', 'ecosystem', 'guaranteed'],
    ['message.msg', 'ecosystem', 'guaranteed'],
    ['page.mhtml', 'ecosystem', 'guaranteed'],
    ['page.mht', 'ecosystem', 'guaranteed'],
    ['book.epub', 'ecosystem', 'guaranteed'],
    ['document.pages', 'capability_probe', 'capability_gated'],
    ['table.numbers', 'capability_probe', 'capability_gated'],
    ['deck.key', 'capability_probe', 'capability_gated'],
    ['diagram.vsd', 'capability_probe', 'capability_gated'],
    ['diagram.vsdx', 'capability_probe', 'capability_gated'],
    ['publication.pub', 'capability_probe', 'capability_gated'],
    ['project.mpp', 'capability_probe', 'capability_gated'],
    ['binary.exe', 'unsupported', 'unsupported']
  ] as const)(
    'classifies %s as %s with %s support',
    (fileName, strategy, support) => {
      expect(classifyExtractableContent({ fileName })).toMatchObject({
        strategy,
        support
      })
    }
  )

  it.each([
    [
      'https://docs.example.test/download/brief',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      undefined,
      'docx',
      'document'
    ],
    [
      '/exports/revenue',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=binary',
      undefined,
      'xlsx',
      'spreadsheet'
    ],
    [
      '/exports/roadmap',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      undefined,
      'pptx',
      'presentation'
    ],
    [
      '/documents/brief',
      'text/markdown; charset=utf-8',
      undefined,
      'md',
      'text'
    ],
    [
      '/download',
      'application/octet-stream',
      new TextEncoder().encode('%PDF-1.7\n'),
      'pdf',
      'document'
    ]
  ] as const)(
    'classifies extensionless %s from MIME or signature',
    (fileName, mimeType, head, format, strategy) => {
      expect(
        classifyExtractableContent({
          fileName,
          mimeType,
          ...(head ? { head } : {})
        })
      ).toEqual({
        format,
        strategy,
        support: 'guaranteed'
      })
    }
  )

  it('creates stable logical unit keys', () => {
    expect(createPageUnitKey(3)).toBe('page/000003')
    expect(createSlideUnitKey(12)).toBe('slide/000012')
    expect(createSheetUnitKey('  Revenue / 2026  ')).toBe(
      'sheet/revenue-2026'
    )
    expect(
      createArchiveEntryUnitKey('reports/../reports/Q1.xlsx', 'sheet/summary')
    ).toBe('entry/reports/q1.xlsx/sheet/summary')
    expect(
      createEmailAttachmentUnitKey(2, 'Quarterly Report.pdf', 'page/000001')
    ).toBe('attachment/000002/quarterly-report.pdf/page/000001')
    expect(createEpubSpineUnitKey(3, 'Text/Chapter 1.xhtml')).toBe(
      'spine/000003/text-chapter-1.xhtml'
    )
  })

  it('defines bounded local extraction defaults', () => {
    expect(CONTENT_EXTRACTION_LIMITS).toEqual(
      expect.objectContaining({
        maxSourceBytes: 100 * 1024 * 1024,
        maxExtractedCharacters: 10_000_000,
        maxPages: 2_000,
        maxSheets: 200,
        maxNonEmptyCells: 1_000_000,
        maxSlides: 10_000,
        maxArchiveDepth: 2,
        maxArchiveEntries: 1_000,
        maxArchiveExpandedBytes: 200 * 1024 * 1024,
        maxArchiveCompressionRatio: 100,
        timeoutMs: 120_000
      })
    )
  })

  it('preserves a public extraction error code', () => {
    const error = new ContentExtractionError(
      'extraction_encrypted',
      'Document is encrypted'
    )

    expect(error).toMatchObject({
      name: 'ContentExtractionError',
      code: 'extraction_encrypted',
      message: 'Document is encrypted'
    })
  })
})
