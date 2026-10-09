export type LocalFileReadMode =
  | 'text'
  | 'structured'
  | 'preview'
  | 'archive'
  | 'unsupported'

export type LocalFileCapability = {
  format: string
  readMode: LocalFileReadMode
  writable: boolean
  creatable: boolean
  conversionRequired: boolean
  preservesMacros: boolean
  supportsRevision: boolean
  preferredTool:
    | 'files.read'
    | 'documents.read'
    | 'document.inspect'
    | 'pdf.inspect'
    | 'spreadsheet.inspect'
    | 'presentation.inspect'
    | 'office.import_legacy'
    | 'office.inspect_original'
    | 'office.create_safe_copy'
    | 'image.inspect'
    | 'archives.list'
    | 'fixed_layout.inspect'
    | null
}

export class LocalFileCapabilityError extends Error {
  readonly name = 'LocalFileCapabilityError'
  readonly code = 'file_format_conflict'

  constructor() {
    super('File format conflicts with its extension or MIME type')
  }
}

const TEXT_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.conf',
  '.cpp',
  '.cs',
  '.css',
  '.env',
  '.go',
  '.graphql',
  '.h',
  '.hpp',
  '.htm',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsonl',
  '.jsx',
  '.kt',
  '.kts',
  '.less',
  '.log',
  '.lua',
  '.md',
  '.markdown',
  '.mjs',
  '.mts',
  '.php',
  '.properties',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
  '.zsh'
])

const SPREADSHEET_EXTENSIONS = new Set(['.csv', '.tsv', '.xlsx'])

const LEGACY_OFFICE_EXTENSIONS = new Set([
  '.doc',
  '.dot',
  '.pot',
  '.pps',
  '.ppt',
  '.wpt',
  '.wps',
  '.xls',
  '.xlt'
])

const OFFICE_SAFE_COPY_EXTENSIONS = new Set([
  '.docm',
  '.dotm',
  '.dotx',
  '.potm',
  '.potx',
  '.ppsm',
  '.pptm',
  '.xlsm',
  '.xltm',
  '.xltx'
])

const TEXT_FILE_NAMES = new Set([
  'dockerfile',
  'gemfile',
  'makefile',
  'procfile'
])

type DetectedSignature =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'zip'
  | 'tar'
  | 'gzip'
  | 'cfb'

export function classifyLocalFileCapability(input: {
  fileName: string
  mimeType?: string
  head?: Uint8Array
}): LocalFileCapability {
  const extension = fileExtension(input.fileName)
  const extensionFormat = formatFromExtension(extension)
  const mimeFormat = formatFromMime(input.mimeType)
  const signature = detectSignature(input.head)

  assertNoFormatConflict({ extensionFormat, mimeFormat, signature })
  if (
    (extensionFormat && isTextFormat(extensionFormat)) ||
    (mimeFormat && isTextFormat(mimeFormat))
  ) {
    if (!isStrictUtf8Text(input.head)) throw new LocalFileCapabilityError()
  }

  const format =
    formatFromSignature(signature, extensionFormat) ??
    extensionFormat ??
    mimeFormat ??
    (isStrictUtf8Text(input.head) ? 'text' : 'unknown')

  if (isTextFormat(format)) {
    return {
      format,
      readMode: 'text',
      writable: true,
      creatable: true,
      conversionRequired: false,
      preservesMacros: false,
      supportsRevision: true,
      preferredTool: 'files.read'
    }
  }
  if (format === 'docx') {
    return {
      format,
      readMode: 'structured',
      writable: true,
      creatable: true,
      conversionRequired: false,
      preservesMacros: false,
      supportsRevision: true,
      preferredTool: 'document.inspect'
    }
  }
  if (format === 'pdf') {
    return {
      format,
      readMode: 'structured',
      writable: true,
      creatable: false,
      conversionRequired: false,
      preservesMacros: false,
      supportsRevision: true,
      preferredTool: 'pdf.inspect'
    }
  }
  if (format === 'csv' || format === 'tsv' || format === 'xlsx') {
    return {
      format,
      readMode: 'structured',
      writable: true,
      creatable: true,
      conversionRequired: false,
      preservesMacros: false,
      supportsRevision: true,
      preferredTool: 'spreadsheet.inspect'
    }
  }
  if (format === 'pptx') {
    return {
      format,
      readMode: 'structured',
      writable: true,
      creatable: true,
      conversionRequired: false,
      preservesMacros: false,
      supportsRevision: true,
      preferredTool: 'presentation.inspect'
    }
  }
  if (isLegacyOfficeFormat(format)) {
    return {
      format,
      readMode: 'structured',
      writable: false,
      creatable: false,
      conversionRequired: true,
      preservesMacros: false,
      supportsRevision: false,
      preferredTool: 'office.import_legacy'
    }
  }
  if (isOfficeSafeCopyFormat(format)) {
    return {
      format,
      readMode: 'structured',
      writable: false,
      creatable: false,
      conversionRequired: true,
      preservesMacros: false,
      supportsRevision: false,
      preferredTool: 'office.inspect_original'
    }
  }
  if (
    format === 'png' ||
    format === 'jpeg' ||
    format === 'webp' ||
    format === 'gif' ||
    format === 'svg'
  ) {
    return {
      format,
      readMode: 'preview',
      writable: true,
      creatable: true,
      conversionRequired: false,
      preservesMacros: false,
      supportsRevision: true,
      preferredTool: 'image.inspect'
    }
  }
  if (format === 'ofd') {
    return {
      format,
      readMode: 'preview',
      writable: false,
      creatable: false,
      conversionRequired: false,
      preservesMacros: false,
      supportsRevision: false,
      preferredTool: 'fixed_layout.inspect'
    }
  }
  if (
    format === 'zip' ||
    format === 'tar' ||
    format === 'tgz' ||
    format === 'gz'
  ) {
    return {
      format,
      readMode: 'archive',
      writable: true,
      creatable: true,
      conversionRequired: false,
      preservesMacros: false,
      supportsRevision: false,
      preferredTool: 'archives.list'
    }
  }
  return {
    format,
    readMode: 'unsupported',
    writable: false,
    creatable: false,
    conversionRequired: false,
    preservesMacros: false,
    supportsRevision: false,
    preferredTool: null
  }
}

export function isKnownTextFileName(fileName: string): boolean {
  const normalized = baseName(fileName).toLowerCase()
  return (
    TEXT_FILE_NAMES.has(normalized) ||
    TEXT_EXTENSIONS.has(fileExtension(normalized))
  )
}

function assertNoFormatConflict(input: {
  extensionFormat?: string
  mimeFormat?: string
  signature?: DetectedSignature
}): void {
  const signatureFormat = formatFromSignature(
    input.signature,
    input.extensionFormat
  )
  if (
    signatureFormat &&
    input.extensionFormat &&
    !signatureMatchesFormat(input.signature, input.extensionFormat)
  ) {
    throw new LocalFileCapabilityError()
  }
  if (
    signatureFormat &&
    input.mimeFormat &&
    !signatureMatchesFormat(input.signature, input.mimeFormat)
  ) {
    throw new LocalFileCapabilityError()
  }
  if (
    input.extensionFormat &&
    input.mimeFormat &&
    !formatsCompatible(input.extensionFormat, input.mimeFormat) &&
    !(isTextFormat(input.extensionFormat) && isTextFormat(input.mimeFormat))
  ) {
    throw new LocalFileCapabilityError()
  }
}

function formatsCompatible(left: string, right: string): boolean {
  return (
    left === right ||
    ((left === 'tgz' || left === 'gz') &&
      (right === 'tgz' || right === 'gz'))
  )
}

function signatureMatchesFormat(
  signature: DetectedSignature | undefined,
  format: string
): boolean {
  if (!signature) return true
  if (signature === 'zip') {
    return (
      format === 'docx' ||
      format === 'xlsx' ||
      format === 'pptx' ||
      isOfficeSafeCopyFormat(format) ||
      format === 'ofd' ||
      format === 'zip'
    )
  }
  if (signature === 'cfb') return isLegacyOfficeFormat(format)
  if (signature === 'gzip') return format === 'tgz' || format === 'gz'
  return signature === format
}

function formatFromSignature(
  signature: DetectedSignature | undefined,
  extensionFormat: string | undefined
): string | undefined {
  if (!signature) return undefined
  if (
    signature === 'zip' &&
    (
      extensionFormat === 'docx' ||
      extensionFormat === 'xlsx' ||
      extensionFormat === 'pptx' ||
      extensionFormat === 'ofd' ||
      isOfficeSafeCopyFormat(extensionFormat)
    )
  ) {
    return extensionFormat
  }
  if (signature === 'cfb') {
    return extensionFormat && isLegacyOfficeFormat(extensionFormat)
      ? extensionFormat
      : 'legacy-office'
  }
  if (signature === 'gzip') {
    return extensionFormat === 'tgz' || extensionFormat === 'gz'
      ? extensionFormat
      : 'gz'
  }
  return signature
}

function formatFromExtension(extension: string): string | undefined {
  if (LEGACY_OFFICE_EXTENSIONS.has(extension)) return extension.slice(1)
  if (OFFICE_SAFE_COPY_EXTENSIONS.has(extension)) return extension.slice(1)
  if (SPREADSHEET_EXTENSIONS.has(extension)) return extension.slice(1)
  if (TEXT_EXTENSIONS.has(extension)) return extension.slice(1)
  if (extension === '.pdf') return 'pdf'
  if (extension === '.docx') return 'docx'
  if (extension === '.pptx') return 'pptx'
  if (extension === '.png') return 'png'
  if (extension === '.jpg' || extension === '.jpeg') return 'jpeg'
  if (extension === '.webp') return 'webp'
  if (extension === '.gif') return 'gif'
  if (extension === '.svg') return 'svg'
  if (extension === '.zip') return 'zip'
  if (extension === '.ofd') return 'ofd'
  if (extension === '.tar') return 'tar'
  if (extension === '.tgz') return 'tgz'
  if (extension === '.gz') return 'gz'
  return undefined
}

function formatFromMime(mimeType: string | undefined): string | undefined {
  const normalized = mimeType?.trim().toLowerCase()
  if (!normalized || normalized === 'application/octet-stream') return undefined
  if (normalized.startsWith('text/')) return 'text'
  if (normalized === 'application/json') return 'json'
  if (normalized === 'application/pdf') return 'pdf'
  if (
    normalized ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx'
  }
  if (
    normalized ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.template'
  ) {
    return 'dotx'
  }
  if (normalized === 'application/vnd.ms-word.document.macroenabled.12') {
    return 'docm'
  }
  if (normalized === 'application/vnd.ms-word.template.macroenabled.12') {
    return 'dotm'
  }
  if (
    normalized ===
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'xlsx'
  }
  if (
    normalized ===
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template'
  ) {
    return 'xltx'
  }
  if (normalized === 'application/vnd.ms-excel.sheet.macroenabled.12') {
    return 'xlsm'
  }
  if (normalized === 'application/vnd.ms-excel.template.macroenabled.12') {
    return 'xltm'
  }
  if (
    normalized ===
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return 'pptx'
  }
  if (
    normalized ===
    'application/vnd.openxmlformats-officedocument.presentationml.template'
  ) {
    return 'potx'
  }
  if (
    normalized ===
    'application/vnd.ms-powerpoint.presentation.macroenabled.12'
  ) {
    return 'pptm'
  }
  if (
    normalized ===
    'application/vnd.ms-powerpoint.slideshow.macroenabled.12'
  ) {
    return 'ppsm'
  }
  if (
    normalized ===
    'application/vnd.ms-powerpoint.template.macroenabled.12'
  ) {
    return 'potm'
  }
  if (normalized === 'text/csv') return 'csv'
  if (normalized === 'text/tab-separated-values') return 'tsv'
  if (normalized === 'image/png') return 'png'
  if (normalized === 'image/jpeg') return 'jpeg'
  if (normalized === 'image/webp') return 'webp'
  if (normalized === 'image/gif') return 'gif'
  if (normalized === 'image/svg+xml') return 'svg'
  if (normalized === 'application/zip') return 'zip'
  if (normalized === 'application/ofd') return 'ofd'
  if (normalized === 'application/x-tar') return 'tar'
  if (normalized === 'application/gzip') return 'gz'
  if (normalized === 'application/msword') return 'doc'
  if (normalized === 'application/vnd.ms-excel') return 'xls'
  if (normalized === 'application/vnd.ms-powerpoint') return 'ppt'
  if (
    normalized === 'application/vnd.ms-works' ||
    normalized === 'application/vnd.ms-write'
  ) {
    return 'wps'
  }
  return undefined
}

function detectSignature(head: Uint8Array | undefined): DetectedSignature | undefined {
  if (!head || head.byteLength < 2) return undefined
  if (startsWithAscii(head, '%PDF-')) return 'pdf'
  if (
    startsWithBytes(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return 'png'
  }
  if (startsWithBytes(head, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWithAscii(head, 'GIF87a') || startsWithAscii(head, 'GIF89a')) {
    return 'gif'
  }
  if (
    startsWithAscii(head, 'RIFF') &&
    head.byteLength >= 12 &&
    startsWithAscii(head.subarray(8), 'WEBP')
  ) {
    return 'webp'
  }
  if (
    startsWithBytes(head, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(head, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(head, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return 'zip'
  }
  if (
    head.byteLength >= 262 &&
    startsWithAscii(head.subarray(257), 'ustar')
  ) {
    return 'tar'
  }
  if (startsWithBytes(head, [0x1f, 0x8b, 0x08])) return 'gzip'
  if (
    startsWithBytes(
      head,
      [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
    )
  ) {
    return 'cfb'
  }
  return undefined
}

function isStrictUtf8Text(head: Uint8Array | undefined): boolean {
  if (!head || head.byteLength === 0) return true
  if (head.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head)
    return true
  } catch {
    return false
  }
}

function isTextFormat(format: string): boolean {
  return (
    format === 'text' ||
    TEXT_EXTENSIONS.has(`.${format}`)
  )
}

function isLegacyOfficeFormat(format: string): boolean {
  return LEGACY_OFFICE_EXTENSIONS.has(`.${format}`)
}

function isOfficeSafeCopyFormat(format: string | undefined): boolean {
  return format !== undefined && OFFICE_SAFE_COPY_EXTENSIONS.has(`.${format}`)
}

function startsWithAscii(value: Uint8Array, prefix: string): boolean {
  return startsWithBytes(value, Array.from(prefix, (character) => character.charCodeAt(0)))
}

function startsWithBytes(value: Uint8Array, prefix: number[]): boolean {
  return (
    value.byteLength >= prefix.length &&
    prefix.every((byte, index) => value[index] === byte)
  )
}

function baseName(fileName: string): string {
  return fileName.trim().replaceAll('\\', '/').split('/').at(-1) ?? ''
}

function fileExtension(fileName: string): string {
  const normalized = baseName(fileName).toLowerCase()
  const dot = normalized.lastIndexOf('.')
  return dot < 0 ? '' : normalized.slice(dot)
}
