import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import {
  classifyLocalFileCapability,
  LocalFileCapabilityError
} from './local-file-capability'

export const CONVERSATION_ATTACHMENT_LIMITS = {
  image: 20 * 1024 * 1024,
  document: 20 * 1024 * 1024
} as const

export type ConversationAttachmentMediaKind = 'image' | 'document'

export type ConversationAttachmentProbe =
  | {
      outcome: 'accepted'
      mimeType: string
      mediaKind: ConversationAttachmentMediaKind
      maxSizeBytes: number
    }
  | {
      outcome: 'rejected'
      code:
        | 'unsupported_type'
        | 'unsupported_archive'
        | 'mime_mismatch'
        | 'size_limit_exceeded'
      message: string
    }

export type ConversationAttachmentDescriptor = {
  id: string
  ownerId: string
  fileName: string
  mimeType: string
  mediaKind: ConversationAttachmentMediaKind
  sizeBytes: number
  checksumSha256: string
  source: 'picker' | 'paste' | 'drop'
  status: 'registered' | 'ready' | 'failed'
  errorCode?: string
  errorMessage?: string
  createdAt: number
}

export type LongTextChunk = {
  id: string
  attachmentId: string
  start: number
  end: number
  digest: string
  content: string
  summary: string
}

export type LongTextSummary = {
  attachmentId: string
  sourceDigest: string
  chunks: LongTextChunk[]
  root: {
    id: string
    childIds: string[]
    summary: string
  }
}

export type ConversationImagePart = {
  attachmentId: string
  mimeType: string
  dataBase64: string
}

export type PreparedConversationAttachment = {
  attachmentId: string
  fileName: string
  mimeType: string
  kind: ConversationAttachmentMediaKind
  status: 'ready' | 'failed'
  extraction?: 'text' | 'parser' | 'ocr' | 'vision'
  content?: string
  summary?: LongTextSummary
  errorCode?: string
  errorMessage?: string
}

export type ConversationAttachmentEnvelope = {
  attachments: PreparedConversationAttachment[]
  contextText: string
  imageParts: ConversationImagePart[]
  errors: Array<{
    attachmentId: string
    code: string
    message: string
  }>
}

export type ConversationSlashCommand =
  | {
      name: 'new' | 'compact' | 'retry' | 'context'
      kind: 'system'
      arguments: Record<string, never>
    }
  | {
      name: 'reasoning'
      kind: 'system'
      arguments: { level: 'auto' | 'low' | 'medium' | 'high' }
    }
  | {
      name: 'review'
      kind: 'prompt'
      arguments: { prompt: string }
    }

export type ConversationSlashCommandResult =
  | { outcome: 'not_command' }
  | { outcome: 'command'; command: ConversationSlashCommand }
  | {
      outcome: 'error'
      code: 'unknown_command' | 'invalid_arguments'
      message: string
    }

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.csv': 'text/csv',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.webp': 'image/webp'
}

const ARCHIVE_EXTENSIONS = new Set([
  '.7z',
  '.bz2',
  '.gz',
  '.rar',
  '.tar',
  '.tgz',
  '.zip'
])

const IMAGE_SIGNATURES: Readonly<
  Record<string, (prefix: Uint8Array) => boolean>
> = {
  'image/gif': (prefix) =>
    startsWithAscii(prefix, 'GIF87a') || startsWithAscii(prefix, 'GIF89a'),
  'image/jpeg': (prefix) =>
    prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff,
  'image/png': (prefix) =>
    startsWithBytes(prefix, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': (prefix) =>
    startsWithAscii(prefix, 'RIFF') &&
    startsWithAscii(prefix.slice(8), 'WEBP')
}

export function probeConversationAttachment(input: {
  fileName: string
  declaredMimeType?: string
  sizeBytes: number
  prefix: Uint8Array
}): ConversationAttachmentProbe {
  const extension = extname(input.fileName).toLowerCase()
  let capability
  try {
    capability = classifyLocalFileCapability({
      fileName: input.fileName,
      mimeType: input.declaredMimeType,
      head: input.prefix
    })
  } catch (error) {
    if (!(error instanceof LocalFileCapabilityError)) throw error
    return {
      outcome: 'rejected',
      code: 'mime_mismatch',
      message: '文件内容与扩展名不一致'
    }
  }
  if (
    ARCHIVE_EXTENSIONS.has(extension) ||
    (isArchiveSignature(input.prefix) && capability.format !== 'docx')
  ) {
    return {
      outcome: 'rejected',
      code: 'unsupported_archive',
      message: '暂不支持压缩包附件'
    }
  }
  const mimeType = MIME_BY_EXTENSION[extension]
  if (!mimeType) {
    return {
      outcome: 'rejected',
      code: 'unsupported_type',
      message: '不支持此文件类型'
    }
  }
  const mediaKind: ConversationAttachmentMediaKind = mimeType.startsWith(
    'image/'
  )
    ? 'image'
    : 'document'
  const maxSizeBytes = CONVERSATION_ATTACHMENT_LIMITS[mediaKind]
  if (input.sizeBytes > maxSizeBytes) {
    return {
      outcome: 'rejected',
      code: 'size_limit_exceeded',
      message: `文件大小不能超过 ${Math.floor(maxSizeBytes / 1024 / 1024)}MB`
    }
  }
  if (
    input.declaredMimeType &&
    input.declaredMimeType !== 'application/octet-stream' &&
    input.declaredMimeType !== mimeType
  ) {
    return {
      outcome: 'rejected',
      code: 'mime_mismatch',
      message: '文件内容与扩展名不一致'
    }
  }
  if (
    mediaKind === 'image' &&
    !IMAGE_SIGNATURES[mimeType]?.(input.prefix)
  ) {
    return {
      outcome: 'rejected',
      code: 'mime_mismatch',
      message: '文件内容与扩展名不一致'
    }
  }
  if (
    mimeType === 'application/pdf' &&
    !startsWithAscii(input.prefix, '%PDF-')
  ) {
    return {
      outcome: 'rejected',
      code: 'mime_mismatch',
      message: '文件内容与扩展名不一致'
    }
  }
  return { outcome: 'accepted', mimeType, mediaKind, maxSizeBytes }
}

export function buildLongTextSummary(input: {
  attachmentId: string
  text: string
  chunkCharacters?: number
  summaryCharacters?: number
}): LongTextSummary {
  const chunkCharacters = Math.max(16, input.chunkCharacters ?? 4_000)
  const summaryCharacters = Math.max(16, input.summaryCharacters ?? 240)
  const chunks: LongTextChunk[] = []
  for (let start = 0; start < input.text.length; start += chunkCharacters) {
    const end = Math.min(input.text.length, start + chunkCharacters)
    const content = input.text.slice(start, end)
    const digest = sha256(content)
    chunks.push({
      id: `${input.attachmentId}:chunk:${chunks.length + 1}`,
      attachmentId: input.attachmentId,
      start,
      end,
      digest,
      content,
      summary: compactText(content, summaryCharacters)
    })
  }
  const combinedSummary = chunks.map(({ summary }) => summary).join(' ')
  return {
    attachmentId: input.attachmentId,
    sourceDigest: sha256(input.text),
    chunks,
    root: {
      id: `${input.attachmentId}:summary:root`,
      childIds: chunks.map(({ id }) => id),
      summary: compactText(combinedSummary, summaryCharacters)
    }
  }
}

export function parseConversationSlashCommand(
  value: string
): ConversationSlashCommandResult {
  const match = /^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(value.trim())
  if (!match) return { outcome: 'not_command' }
  const name = match[1].toLowerCase()
  const argument = match[2]?.trim() ?? ''
  if (name === 'reasoning') {
    if (!['auto', 'low', 'medium', 'high'].includes(argument)) {
      return {
        outcome: 'error',
        code: 'invalid_arguments',
        message: 'reasoning 仅支持 auto、low、medium 或 high'
      }
    }
    return {
      outcome: 'command',
      command: {
        name,
        kind: 'system',
        arguments: {
          level: argument as 'auto' | 'low' | 'medium' | 'high'
        }
      }
    }
  }
  if (name === 'review') {
    if (!argument) {
      return {
        outcome: 'error',
        code: 'invalid_arguments',
        message: 'review 需要提供审查目标'
      }
    }
    return {
      outcome: 'command',
      command: {
        name,
        kind: 'prompt',
        arguments: { prompt: argument }
      }
    }
  }
  if (['new', 'compact', 'retry', 'context'].includes(name)) {
    if (argument) {
      return {
        outcome: 'error',
        code: 'invalid_arguments',
        message: `/${name} 不接受参数`
      }
    }
    return {
      outcome: 'command',
      command: {
        name: name as 'new' | 'compact' | 'retry' | 'context',
        kind: 'system',
        arguments: {}
      }
    }
  }
  return {
    outcome: 'error',
    code: 'unknown_command',
    message: `未知命令：/${name}`
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function compactText(value: string, limit: number): string {
  const compacted = value.replace(/\s+/g, ' ').trim()
  return compacted.length <= limit
    ? compacted
    : compacted.slice(0, Math.max(0, limit - 1)).trimEnd() + '…'
}

function startsWithAscii(value: Uint8Array, expected: string): boolean {
  return startsWithBytes(value, [...Buffer.from(expected)])
}

function startsWithBytes(
  value: Uint8Array,
  expected: readonly number[]
): boolean {
  return (
    value.length >= expected.length &&
    expected.every((byte, index) => value[index] === byte)
  )
}

function isArchiveSignature(prefix: Uint8Array): boolean {
  return (
    startsWithBytes(prefix, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(prefix, [0x1f, 0x8b]) ||
    startsWithAscii(prefix, 'Rar!\u001a\u0007')
  )
}
