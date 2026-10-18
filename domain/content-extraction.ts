export type ContentExtractionStrategy =
  | 'text'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'fixed_layout'
  | 'image_ocr'
  | 'legacy_office'
  | 'office_convert'
  | 'office_sanitize'
  | 'archive'
  | 'ecosystem'
  | 'capability_probe'
  | 'unsupported'

export type ContentExtractionSupport =
  | 'guaranteed'
  | 'capability_gated'
  | 'unsupported'

export type ExtractableContentFormat = Readonly<{
  format: string
  strategy: ContentExtractionStrategy
  support: ContentExtractionSupport
}>

export type ContentExtractionConsumer =
  | 'knowledge_index'
  | 'conversation'
  | 'tool'
  | 'context_attachment'
  | 'artifact_sync'
  | 'repository_snapshot'
  | 'online_document'
  | 'workbench'
  | 'file_search'

export type ContentExtractionPolicy = Readonly<{
  consumer: ContentExtractionConsumer
  allowLocalOcr: boolean
  allowLocalConversion: boolean
  maxCharacters: number
  maxUnits: number
  ocrLanguage?: string
}>

export type ExtractedContentUnit = Readonly<{
  key: string
  title: string
  text: string
  checksum: string
  byteSize: number
  metadata?: Readonly<{
    format: string
    extraction: string
    page?: number
    sheet?: string
    slide?: number
    archiveEntry?: string
  }>
}>

export type ExtractedContentBundle = Readonly<{
  sourceChecksum: string
  format: string
  extractorVersion: string
  units: readonly ExtractedContentUnit[]
}>

export const CONTENT_EXTRACTION_ERROR_CODES = [
  'extraction_unsupported',
  'extraction_invalid',
  'extraction_encrypted',
  'extraction_ocr_required',
  'extraction_ocr_failed',
  'extraction_converter_unavailable',
  'extraction_limit_exceeded',
  'extraction_archive_unsafe',
  'extraction_empty',
  'extraction_interrupted',
  'source_changed_during_extraction'
] as const

export type ContentExtractionErrorCode =
  (typeof CONTENT_EXTRACTION_ERROR_CODES)[number]

const CONTENT_EXTRACTION_ERROR_CODE_SET = new Set<string>(
  CONTENT_EXTRACTION_ERROR_CODES
)

export function isContentExtractionErrorCode(
  value: unknown
): value is ContentExtractionErrorCode {
  return (
    typeof value === 'string' &&
    CONTENT_EXTRACTION_ERROR_CODE_SET.has(value)
  )
}

export class ContentExtractionError extends Error {
  readonly name = 'ContentExtractionError'

  constructor(
    readonly code: ContentExtractionErrorCode,
    message: string
  ) {
    super(message)
  }
}

export const CONTENT_EXTRACTION_LIMITS = Object.freeze({
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

const STRATEGY_BY_EXTENSION = new Map<
  string,
  Pick<ExtractableContentFormat, 'strategy' | 'support'>
>([
  ...entries(
    [
      'c', 'cc', 'conf', 'cpp', 'cs', 'css', 'env', 'go', 'graphql', 'h',
      'hpp', 'htm', 'html', 'ini', 'java', 'js', 'json', 'jsonl', 'jsx',
      'kt', 'kts', 'less', 'log', 'lua', 'md', 'markdown', 'mjs', 'mts',
      'php', 'properties', 'py', 'rb', 'rs', 'scss', 'sh', 'sql', 'swift',
      'toml', 'ts', 'tsx', 'txt', 'vue', 'xml', 'yaml', 'yml', 'zsh'
    ],
    'text'
  ),
  ...entries(['docx', 'pdf'], 'document'),
  ...entries(['csv', 'tsv', 'xlsx'], 'spreadsheet'),
  ...entries(['pptx'], 'presentation'),
  ...entries(['ofd'], 'fixed_layout'),
  ...entries(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'], 'image_ocr'),
  ...entries(
    ['doc', 'dot', 'xls', 'xlt', 'ppt', 'pps', 'pot'],
    'legacy_office'
  ),
  ...entries(['wps', 'wpt'], 'office_convert'),
  ...entries(
    [
      'docm', 'dotm', 'dotx', 'xlsm', 'xltm', 'xltx', 'pptm', 'ppsm',
      'potm', 'potx'
    ],
    'office_sanitize'
  ),
  ...entries(['zip', 'tar', 'tgz', 'gz'], 'archive'),
  ...entries(
    [
      'odt', 'ods', 'odp', 'rtf', 'eml', 'mbox', 'msg', 'mhtml', 'mht',
      'epub'
    ],
    'ecosystem'
  ),
  ...entries(
    ['pages', 'numbers', 'key', 'vsd', 'vsdx', 'pub', 'mpp'],
    'capability_probe',
    'capability_gated'
  )
])

const FORMAT_BY_MIME_TYPE = new Map<string, string>([
  ['application/pdf', 'pdf'],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'docx'
  ],
  [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xlsx'
  ],
  [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'pptx'
  ],
  ['application/json', 'json'],
  ['application/ld+json', 'json'],
  ['application/xml', 'xml'],
  ['application/xhtml+xml', 'html'],
  ['text/csv', 'csv'],
  ['text/tab-separated-values', 'tsv'],
  ['text/markdown', 'md'],
  ['text/html', 'html'],
  ['text/xml', 'xml'],
  ['text/yaml', 'yaml']
])

export function classifyExtractableContent(input: {
  fileName: string
  mimeType?: string
  head?: Uint8Array
}): ExtractableContentFormat {
  const signatureFormat = detectSignatureFormat(input.head)
  if (signatureFormat) return classifiedFormat(signatureFormat)

  const mimeType = normalizeMimeType(input.mimeType)
  const mimeFormat = mimeType ? FORMAT_BY_MIME_TYPE.get(mimeType) : undefined
  if (mimeFormat) return classifiedFormat(mimeFormat)

  const extension = fileExtension(input.fileName)
  const classified = STRATEGY_BY_EXTENSION.get(extension)
  if (classified) {
    return {
      format: extension,
      ...classified
    }
  }
  if (mimeType?.startsWith('text/')) {
    return classifiedFormat('txt')
  }
  return {
    format: extension || 'unknown',
    strategy: 'unsupported',
    support: 'unsupported'
  }
}

function classifiedFormat(format: string): ExtractableContentFormat {
  const classified = STRATEGY_BY_EXTENSION.get(format)
  if (!classified) {
    return {
      format,
      strategy: 'unsupported',
      support: 'unsupported'
    }
  }
  return { format, ...classified }
}

function normalizeMimeType(value: string | undefined): string | undefined {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase()
  return normalized || undefined
}

function detectSignatureFormat(head: Uint8Array | undefined): string | undefined {
  if (
    head &&
    head.byteLength >= 5 &&
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46 &&
    head[4] === 0x2d
  ) {
    return 'pdf'
  }
  return undefined
}

export function createPageUnitKey(page: number): string {
  return `page/${positiveOrdinal(page, 'Page')}`
}

export function createSlideUnitKey(slide: number): string {
  return `slide/${positiveOrdinal(slide, 'Slide')}`
}

export function createSheetUnitKey(sheet: string): string {
  return `sheet/${safeKeySegment(sheet, 'Sheet')}`
}

export function createArchiveEntryUnitKey(
  entryPath: string,
  childKey: string
): string {
  const segments: string[] = []
  for (const raw of entryPath.replace(/\\/g, '/').split('/')) {
    const segment = raw.trim()
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(safeKeySegment(segment, 'Archive entry'))
  }
  if (segments.length === 0) {
    throw new ContentExtractionError(
      'extraction_archive_unsafe',
      'Archive entry path is invalid'
    )
  }
  const normalizedChild = childKey
    .split('/')
    .map((segment) => safeKeySegment(segment, 'Child document'))
    .join('/')
  return `entry/${segments.join('/')}/${normalizedChild}`
}

export function createEmailAttachmentUnitKey(
  attachment: number,
  fileName: string,
  childKey: string
): string {
  const normalizedChild = childKey
    .split('/')
    .map((segment) => safeKeySegment(segment, 'Email attachment child'))
    .join('/')
  return (
    `attachment/${positiveOrdinal(attachment, 'Email attachment')}/` +
    `${safeKeySegment(fileName, 'Email attachment')}/${normalizedChild}`
  )
}

export function createEpubSpineUnitKey(
  spine: number,
  href: string
): string {
  return (
    `spine/${positiveOrdinal(spine, 'EPUB spine')}/` +
    safeKeySegment(href.replace(/[\\/]+/g, '-'), 'EPUB spine href')
  )
}

function entries(
  formats: readonly string[],
  strategy: ContentExtractionStrategy,
  support: ContentExtractionSupport = 'guaranteed'
): Array<
  [
    string,
    Pick<ExtractableContentFormat, 'strategy' | 'support'>
  ]
> {
  return formats.map((format) => [format, { strategy, support }])
}

function fileExtension(fileName: string): string {
  const name = fileName.trim().toLowerCase().split(/[/\\]/).at(-1) ?? ''
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1)
}

function positiveOrdinal(value: number, label: string): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ContentExtractionError(
      'extraction_invalid',
      `${label} number is invalid`
    )
  }
  return String(value).padStart(6, '0')
}

function safeKeySegment(value: string, label: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  if (!normalized || normalized === '.' || normalized === '..') {
    throw new ContentExtractionError(
      'extraction_invalid',
      `${label} name is invalid`
    )
  }
  return normalized
}
