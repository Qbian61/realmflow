import { isKnownTextFileName } from './local-file-capability'

export type DocumentReadMode = 'text' | 'document' | 'unsupported'

export type DocumentExtractionKind = 'text' | 'docx' | 'pdf'

export type DocumentTextBlock = {
  id: string
  type: 'heading' | 'paragraph' | 'list_item' | 'table'
  text: string
  level?: number
  rows?: string[][]
}

export type DocumentPage = {
  pageNumber: number
  text: string
  items?: Array<{
    text: string
    x: number
    y: number
    width: number
    height: number
  }>
}

export type ExtractedDocumentText = {
  text: string
  extraction: DocumentExtractionKind
  characterCount: number
  truncated: boolean
  blocks?: DocumentTextBlock[]
  pages?: DocumentPage[]
  chunk?: {
    id: string
    index: number
    count: number
    startCharacter: number
    endCharacter: number
  }
  nextChunkId?: string | null
}

export type DocumentExtractionErrorCode =
  | 'tool_document_unsupported'
  | 'tool_document_invalid'
  | 'tool_document_encrypted'
  | 'tool_document_empty'
  | 'tool_document_chunk_invalid'
  | 'tool_document_ocr_required'
  | 'tool_document_too_large'

const DOCUMENT_EXTENSIONS = new Set(['.docx', '.pdf'])

export class DocumentExtractionError extends Error {
  readonly name = 'DocumentExtractionError'

  constructor(
    readonly code: DocumentExtractionErrorCode,
    message: string
  ) {
    super(message)
  }
}

export function classifyDocumentReadMode(input: {
  fileName: string
  mimeType?: string
}): DocumentReadMode {
  const extension = fileExtension(input.fileName)
  const mimeType = input.mimeType?.trim().toLowerCase()
  if (
    isKnownTextFileName(input.fileName) ||
    mimeType?.startsWith('text/') ||
    mimeType === 'application/json'
  ) {
    return 'text'
  }
  if (
    DOCUMENT_EXTENSIONS.has(extension) ||
    mimeType === 'application/pdf' ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'document'
  }
  return 'unsupported'
}

export function validateDocumentSourceSize(
  sizeBytes: number,
  maxBytes: number
): void {
  if (
    !Number.isSafeInteger(sizeBytes) ||
    !Number.isSafeInteger(maxBytes) ||
    sizeBytes < 0 ||
    maxBytes < 1 ||
    sizeBytes > maxBytes
  ) {
    throw new DocumentExtractionError(
      'tool_document_too_large',
      'Document exceeds the local parsing limit'
    )
  }
}

export function normalizeExtractedDocumentText(input: {
  text: string
  extraction: DocumentExtractionKind
  maxCharacters: number
}): ExtractedDocumentText {
  if (!Number.isSafeInteger(input.maxCharacters) || input.maxCharacters < 1) {
    throw new DocumentExtractionError(
      'tool_document_too_large',
      'Document output limit is invalid'
    )
  }
  const normalized = input.text
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!normalized) {
    throw new DocumentExtractionError(
      'tool_document_empty',
      'Document contains no readable text'
    )
  }
  return {
    text: normalized.slice(0, input.maxCharacters),
    extraction: input.extraction,
    characterCount: normalized.length,
    truncated: normalized.length > input.maxCharacters
  }
}

function fileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase()
  const dot = normalized.lastIndexOf('.')
  return dot < 0 ? '' : normalized.slice(dot)
}
