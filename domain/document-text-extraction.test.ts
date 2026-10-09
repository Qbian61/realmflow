import { describe, expect, it } from 'vitest'
import {
  classifyDocumentReadMode,
  DocumentExtractionError,
  normalizeExtractedDocumentText,
  validateDocumentSourceSize
} from './document-text-extraction'

describe('document text extraction domain', () => {
  it.each([
    ['notes.md', undefined, 'text'],
    ['data.json', 'application/octet-stream', 'text'],
    ['worker.ts', undefined, 'text'],
    ['index.py', undefined, 'text'],
    ['pyproject.toml', undefined, 'text'],
    [
      'resume.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'document'
    ],
    ['resume.pdf', 'application/pdf', 'document'],
    ['photo.png', 'image/png', 'unsupported']
  ] as const)(
    'classifies %s as %s',
    (fileName, mimeType, expected) => {
      expect(classifyDocumentReadMode({ fileName, mimeType })).toBe(expected)
    }
  )

  it('normalizes extracted text and reports bounded output metadata', () => {
    expect(
      normalizeExtractedDocumentText({
        text: '  First paragraph. \r\n\r\n\r\n Second paragraph.  ',
        extraction: 'docx',
        maxCharacters: 24
      })
    ).toEqual({
      text: 'First paragraph.\n\nSecond',
      extraction: 'docx',
      characterCount: 35,
      truncated: true
    })
  })

  it('rejects extraction with no meaningful text', () => {
    expect(() =>
      normalizeExtractedDocumentText({
        text: ' \n\t\f ',
        extraction: 'pdf',
        maxCharacters: 10_000
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'tool_document_empty',
        message: 'Document contains no readable text'
      })
    )
  })

  it('rejects sources above the local parsing bound', () => {
    expect(() => validateDocumentSourceSize(20_000_001, 20_000_000)).toThrowError(
      expect.objectContaining({
        code: 'tool_document_too_large'
      })
    )
  })

  it('exposes stable safe document error codes', () => {
    const error = new DocumentExtractionError(
      'tool_document_invalid',
      'Document is malformed'
    )

    expect(error).toMatchObject({
      name: 'DocumentExtractionError',
      code: 'tool_document_invalid',
      message: 'Document is malformed'
    })
  })
})
