import { createHash } from 'node:crypto'
import {
  classifyDocumentReadMode,
  DocumentExtractionError,
  normalizeExtractedDocumentText,
  validateDocumentSourceSize,
  type DocumentPage,
  type DocumentTextBlock,
  type ExtractedDocumentText
} from '../../../../domain/document-text-extraction'

const DEFAULT_MAX_SOURCE_BYTES = 20 * 1024 * 1024

type ParsedDocx = {
  text: string
  blocks: DocumentTextBlock[]
}

type ParsedPdf = {
  text: string
  pages: DocumentPage[]
}

type DocxParser = (bytes: Uint8Array) => Promise<string | ParsedDocx>
type PdfParser = (bytes: Uint8Array) => Promise<string | ParsedPdf>

export interface DocumentTextExtractor {
  extract(input: {
    bytes: Uint8Array
    fileName: string
    mimeType?: string
    maxCharacters: number
    chunkId?: string
  }): Promise<ExtractedDocumentText>
}

export class LocalDocumentTextExtractor implements DocumentTextExtractor {
  private readonly parseDocx: DocxParser
  private readonly parsePdf: PdfParser
  private readonly maxSourceBytes: number

  constructor(
    options: {
      parseDocx?: DocxParser
      parsePdf?: PdfParser
      maxSourceBytes?: number
    } = {}
  ) {
    this.parseDocx = options.parseDocx ?? parseDocx
    this.parsePdf = options.parsePdf ?? parsePdf
    this.maxSourceBytes =
      options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES
  }

  async extract(input: {
    bytes: Uint8Array
    fileName: string
    mimeType?: string
    maxCharacters: number
    chunkId?: string
  }): Promise<ExtractedDocumentText> {
    validateDocumentSourceSize(input.bytes.byteLength, this.maxSourceBytes)
    const mode = classifyDocumentReadMode(input)
    if (mode === 'unsupported') {
      throw new DocumentExtractionError(
        'tool_document_unsupported',
        'Document format is unsupported'
      )
    }

    try {
      if (mode === 'text') {
        return normalizeAndChunk({
          bytes: input.bytes,
          text: new TextDecoder('utf-8', { fatal: true }).decode(input.bytes),
          extraction: 'text',
          maxCharacters: input.maxCharacters,
          chunkId: input.chunkId
        })
      }

      const extension = fileExtension(input.fileName)
      const extraction =
        extension === '.pdf' || input.mimeType === 'application/pdf'
          ? 'pdf'
          : 'docx'
      requireSignature(input.bytes, extraction)
      const parsed =
        extraction === 'pdf'
          ? await this.parsePdf(input.bytes)
          : await this.parseDocx(input.bytes)
      const structured =
        typeof parsed === 'string' ? { text: parsed } : parsed
      if (extraction === 'pdf' && !structured.text.trim()) {
        throw new DocumentExtractionError(
          'tool_document_ocr_required',
          'PDF requires OCR'
        )
      }
      return normalizeAndChunk({
        bytes: input.bytes,
        text: structured.text,
        extraction,
        maxCharacters: input.maxCharacters,
        chunkId: input.chunkId,
        blocks: 'blocks' in structured ? structured.blocks : undefined,
        pages: 'pages' in structured ? structured.pages : undefined
      })
    } catch (error) {
      if (error instanceof DocumentExtractionError) throw error
      if (isEncryptedError(error)) {
        throw new DocumentExtractionError(
          'tool_document_encrypted',
          'Document is encrypted'
        )
      }
      throw new DocumentExtractionError(
        'tool_document_invalid',
        'Document could not be parsed'
      )
    }
  }
}

function normalizeAndChunk(input: {
  bytes: Uint8Array
  text: string
  extraction: ExtractedDocumentText['extraction']
  maxCharacters: number
  chunkId?: string
  blocks?: DocumentTextBlock[]
  pages?: DocumentPage[]
}): ExtractedDocumentText {
  const normalized = normalizeExtractedDocumentText({
    text: input.text,
    extraction: input.extraction,
    maxCharacters: Number.MAX_SAFE_INTEGER
  })
  const digest = createHash('sha256').update(input.bytes).digest('hex')
  const chunkCount = Math.max(
    1,
    Math.ceil(normalized.characterCount / input.maxCharacters)
  )
  const chunkIndex = resolveChunkIndex(input.chunkId, digest, chunkCount)
  const startCharacter = chunkIndex * input.maxCharacters
  const endCharacter = Math.min(
    normalized.characterCount,
    startCharacter + input.maxCharacters
  )
  const shouldExposeChunk = chunkCount > 1 || input.chunkId !== undefined
  return {
    text: normalized.text.slice(startCharacter, endCharacter),
    extraction: input.extraction,
    characterCount: normalized.characterCount,
    truncated: endCharacter < normalized.characterCount,
    ...(chunkCount === 1 && input.blocks ? { blocks: input.blocks } : {}),
    ...(chunkCount === 1 && input.pages ? { pages: input.pages } : {}),
    ...(shouldExposeChunk
      ? {
          chunk: {
            id: chunkId(digest, chunkIndex),
            index: chunkIndex + 1,
            count: chunkCount,
            startCharacter,
            endCharacter
          },
          nextChunkId:
            chunkIndex + 1 < chunkCount
              ? chunkId(digest, chunkIndex + 1)
              : null
        }
      : {})
  }
}

function resolveChunkIndex(
  value: string | undefined,
  digest: string,
  chunkCount: number
): number {
  if (!value) return 0
  const match = /^([a-f0-9]{64}):chunk:([1-9][0-9]*)$/.exec(value)
  const index = match ? Number(match[2]) - 1 : -1
  if (match?.[1] !== digest || index < 0 || index >= chunkCount) {
    throw new DocumentExtractionError(
      'tool_document_chunk_invalid',
      'Document chunk is unavailable'
    )
  }
  return index
}

function chunkId(digest: string, zeroBasedIndex: number): string {
  return `${digest}:chunk:${zeroBasedIndex + 1}`
}

async function parseDocx(bytes: Uint8Array): Promise<ParsedDocx> {
  const mammoth = await import('mammoth')
  const { parseFragment } = await import('parse5')
  const result = await mammoth.convertToHtml({
    buffer: Buffer.from(bytes)
  })
  const blocks = extractDocxBlocks(
    parseFragment(result.value) as unknown as HtmlNode
  )
  return {
    text: blocks.map((block) => block.text).join('\n'),
    blocks
  }
}

async function parsePdf(bytes: Uint8Array): Promise<ParsedPdf> {
  const { getDocument } = await import(
    'pdfjs-dist/legacy/build/pdf.mjs'
  )
  const document = await getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: true
  }).promise
  try {
    const pages: DocumentPage[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const items = content.items.filter(isPdfTextItem) as PdfTextItem[]
      pages.push({
        pageNumber,
        text: joinPdfTextItems(items),
        items: items
          .filter(({ str }) => Boolean(str))
          .map((item) => ({
            text: item.str,
            x: item.transform[4] ?? 0,
            y: item.transform[5] ?? 0,
            width: item.width,
            height: item.height
          }))
      })
    }
    return {
      text: pages.map((page) => page.text).join('\f'),
      pages
    }
  } finally {
    await document.destroy()
  }
}

type PdfTextItem = {
  str: string
  width: number
  height: number
  transform: readonly number[]
  hasEOL?: boolean
}

type HtmlNode = {
  nodeName?: string
  tagName?: string
  value?: string
  childNodes?: HtmlNode[]
}

function extractDocxBlocks(root: HtmlNode): DocumentTextBlock[] {
  const blocks: DocumentTextBlock[] = []
  const visit = (node: HtmlNode): void => {
    const tagName = node.tagName?.toLowerCase()
    if (tagName && /^h[1-6]$/.test(tagName)) {
      appendBlock(blocks, {
        type: 'heading',
        level: Number(tagName.slice(1)),
        text: htmlText(node)
      })
      return
    }
    if (tagName === 'p') {
      appendBlock(blocks, { type: 'paragraph', text: htmlText(node) })
      return
    }
    if (tagName === 'li') {
      appendBlock(blocks, { type: 'list_item', text: htmlText(node) })
      return
    }
    if (tagName === 'table') {
      const rows = descendants(node, new Set(['tr'])).map((row) =>
        descendants(row, new Set(['td', 'th'])).map(htmlText)
      )
      appendBlock(blocks, {
        type: 'table',
        text: rows.map((row) => row.join(' | ')).join('\n'),
        rows
      })
      return
    }
    for (const child of node.childNodes ?? []) visit(child)
  }
  visit(root)
  return blocks
}

function appendBlock(
  blocks: DocumentTextBlock[],
  block: Omit<DocumentTextBlock, 'id'>
): void {
  const text = block.text.trim()
  if (!text) return
  blocks.push({
    ...block,
    id: `block-${blocks.length + 1}`,
    text
  })
}

function descendants(node: HtmlNode, tags: Set<string>): HtmlNode[] {
  const result: HtmlNode[] = []
  for (const child of node.childNodes ?? []) {
    if (child.tagName && tags.has(child.tagName.toLowerCase())) {
      result.push(child)
    } else {
      result.push(...descendants(child, tags))
    }
  }
  return result
}

function htmlText(node: HtmlNode): string {
  if (node.nodeName === '#text') return node.value ?? ''
  return (node.childNodes ?? []).map(htmlText).join('').trim()
}

export function joinPdfTextItems(items: readonly unknown[]): string {
  let result = ''
  let previous: PdfTextItem | undefined
  for (const value of items) {
    if (!isPdfTextItem(value) || !value.str) continue
    if (previous) {
      const previousX = previous.transform[4] ?? 0
      const currentX = value.transform[4] ?? 0
      const previousY = previous.transform[5] ?? 0
      const currentY = value.transform[5] ?? 0
      const lineHeight = Math.max(previous.height, value.height, 1)
      const lineChanged =
        previous.hasEOL === true ||
        Math.abs(currentY - previousY) > lineHeight * 0.5
      const horizontalGap = currentX - (previousX + previous.width)
      const needsSpace =
        !lineChanged &&
        horizontalGap > lineHeight * 0.15 &&
        !/\s$/.test(result) &&
        !/^\s/.test(value.str)
      if (lineChanged) result += '\n'
      else if (needsSpace) result += ' '
    }
    result += value.str
    previous = value
  }
  return result.trim()
}

function requireSignature(
  bytes: Uint8Array,
  extraction: 'docx' | 'pdf'
): void {
  const valid =
    extraction === 'pdf'
      ? startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
      : startsWith(bytes, [0x50, 0x4b])
  if (!valid) {
    throw new DocumentExtractionError(
      'tool_document_invalid',
      'Document signature does not match its format'
    )
  }
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

function fileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase()
  const dot = normalized.lastIndexOf('.')
  return dot < 0 ? '' : normalized.slice(dot)
}

function isEncryptedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /password|encrypted/i.test(message)
}

function isPdfTextItem(value: unknown): value is PdfTextItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'str' in value &&
    typeof value.str === 'string' &&
    'width' in value &&
    typeof value.width === 'number' &&
    'height' in value &&
    typeof value.height === 'number' &&
    'transform' in value &&
    Array.isArray(value.transform)
  )
}
