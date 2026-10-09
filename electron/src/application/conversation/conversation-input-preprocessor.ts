import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  buildLongTextSummary,
  type ConversationAttachmentEnvelope,
  type ConversationAttachmentDescriptor,
  type ConversationImagePart,
  type PreparedConversationAttachment
} from '../../../../domain/conversation-input'
import type { ConversationAttachmentRepository } from '../../infrastructure/sqlite/conversation-attachment-repository'
import type { DocumentTextExtractor } from '../documents/local-document-text-extractor'

const MAX_DOCUMENT_CHARACTERS = 200_000

type PreprocessorRepository = Pick<
  ConversationAttachmentRepository,
  'get' | 'resolveBlobPath' | 'updateStatus' | 'replaceChunks'
>

export class ConversationInputPreprocessor {
  private readonly longTextCharacters: number
  private readonly chunkCharacters: number
  private readonly summaryCharacters: number
  private readonly ocr?: (input: {
    attachmentId: string
    mimeType: string
    bytes: Uint8Array
  }) => Promise<string>
  private readonly documentTextExtractor?: DocumentTextExtractor

  constructor(
    private readonly repository: PreprocessorRepository,
    private readonly rootPath: string,
    options: {
      longTextCharacters?: number
      chunkCharacters?: number
      summaryCharacters?: number
      ocr?: ConversationInputPreprocessor['ocr']
      documentTextExtractor?: DocumentTextExtractor
    } = {}
  ) {
    this.longTextCharacters = options.longTextCharacters ?? 12_000
    this.chunkCharacters = options.chunkCharacters ?? 4_000
    this.summaryCharacters = options.summaryCharacters ?? 480
    this.ocr = options.ocr
    this.documentTextExtractor = options.documentTextExtractor
  }

  async prepare(input: {
    attachmentIds: readonly string[]
    ownerId: string
    modelSupportsVision: boolean
    allowImageEgress: boolean
  }): Promise<ConversationAttachmentEnvelope> {
    const attachments: PreparedConversationAttachment[] = []
    const imageParts: ConversationImagePart[] = []
    const contextSections: string[] = []
    const errors: ConversationAttachmentEnvelope['errors'] = []
    for (const attachmentId of [...new Set(input.attachmentIds)]) {
      const descriptor = await this.repository.get(attachmentId)
      if (!descriptor || descriptor.ownerId !== input.ownerId) {
        const message = '附件不存在或不属于当前消息'
        attachments.push({
          attachmentId,
          fileName: descriptor?.fileName ?? attachmentId,
          mimeType: descriptor?.mimeType ?? 'application/octet-stream',
          kind: descriptor?.mediaKind ?? 'document',
          status: 'failed',
          errorCode: 'ownership_conflict',
          errorMessage: message
        })
        errors.push({
          attachmentId,
          code: 'ownership_conflict',
          message
        })
        continue
      }
      try {
        const bytes = await readFile(
          this.resolveManagedPath(
            await this.repository.resolveBlobPath(attachmentId)
          )
        )
        const prepared =
          descriptor.mediaKind === 'image'
            ? await this.prepareImage(
                descriptor,
                bytes,
                input.modelSupportsVision,
                input.allowImageEgress,
                imageParts,
                contextSections
              )
            : await this.prepareDocument(
                descriptor,
                bytes,
                contextSections
              )
        attachments.push(prepared)
        await this.repository.updateStatus({
          id: attachmentId,
          status: 'ready'
        })
      } catch (error) {
        const message = errorMessage(error)
        attachments.push({
          attachmentId,
          fileName: descriptor.fileName,
          mimeType: descriptor.mimeType,
          kind: descriptor.mediaKind,
          status: 'failed',
          errorCode: 'parse_failed',
          errorMessage: message
        })
        errors.push({ attachmentId, code: 'parse_failed', message })
        await this.repository.updateStatus({
          id: attachmentId,
          status: 'failed',
          errorCode: 'parse_failed',
          errorMessage: message
        })
      }
    }
    return {
      attachments,
      contextText: [
        ...contextSections,
        ...errors.map(
          (error) =>
            `[附件 ${error.attachmentId} 处理失败]\n${error.message}`
        )
      ].join('\n\n'),
      imageParts,
      errors
    }
  }

  private async prepareImage(
    descriptor: ConversationAttachmentDescriptor,
    bytes: Uint8Array,
    modelSupportsVision: boolean,
    allowImageEgress: boolean,
    imageParts: ConversationImagePart[],
    contextSections: string[]
  ): Promise<PreparedConversationAttachment> {
    if (modelSupportsVision && allowImageEgress) {
      imageParts.push({
        attachmentId: descriptor.id,
        mimeType: descriptor.mimeType,
        dataBase64: Buffer.from(bytes).toString('base64')
      })
      contextSections.push(
        `[附件 ${descriptor.id}: ${descriptor.fileName}，图片内容将发送给所选模型]`
      )
      return {
        attachmentId: descriptor.id,
        fileName: descriptor.fileName,
        mimeType: descriptor.mimeType,
        kind: 'image',
        status: 'ready',
        extraction: 'vision'
      }
    }
    if (!this.ocr) {
      throw new Error('当前模型不支持图片，且本地 OCR 不可用')
    }
    const content = await this.ocr({
      attachmentId: descriptor.id,
      mimeType: descriptor.mimeType,
      bytes
    })
    contextSections.push(
      `[附件 ${descriptor.id}: ${descriptor.fileName}，本地 OCR]\n${content}`
    )
    return {
      attachmentId: descriptor.id,
      fileName: descriptor.fileName,
      mimeType: descriptor.mimeType,
      kind: 'image',
      status: 'ready',
      extraction: 'ocr',
      content
    }
  }

  private async prepareDocument(
    descriptor: ConversationAttachmentDescriptor,
    bytes: Uint8Array,
    contextSections: string[]
  ): Promise<PreparedConversationAttachment> {
    const text = isPlainText(descriptor.mimeType)
      ? decodeUtf8(bytes)
      : await this.parseStructuredDocument(descriptor, bytes)
    if (text.length > this.longTextCharacters) {
      const summary = buildLongTextSummary({
        attachmentId: descriptor.id,
        text,
        chunkCharacters: this.chunkCharacters,
        summaryCharacters: this.summaryCharacters
      })
      await this.repository.replaceChunks(descriptor.id, summary.chunks)
      contextSections.push(
        `[附件 ${descriptor.id}: ${descriptor.fileName}，长文本摘要，可按 chunk id 回取]\n${summary.root.summary}`
      )
      return {
        attachmentId: descriptor.id,
        fileName: descriptor.fileName,
        mimeType: descriptor.mimeType,
        kind: 'document',
        status: 'ready',
        extraction: isPlainText(descriptor.mimeType) ? 'text' : 'parser',
        summary
      }
    }
    await this.repository.replaceChunks(descriptor.id, [])
    contextSections.push(
      `[附件 ${descriptor.id}: ${descriptor.fileName}]\n${text}`
    )
    return {
      attachmentId: descriptor.id,
      fileName: descriptor.fileName,
      mimeType: descriptor.mimeType,
      kind: 'document',
      status: 'ready',
      extraction: isPlainText(descriptor.mimeType) ? 'text' : 'parser',
      content: text
    }
  }

  private async parseStructuredDocument(
    descriptor: ConversationAttachmentDescriptor,
    bytes: Uint8Array
  ): Promise<string> {
    if (!this.documentTextExtractor) {
      throw new Error(`本地解析器暂不支持 ${descriptor.mimeType}`)
    }
    const result = await this.documentTextExtractor.extract({
      fileName: descriptor.fileName,
      mimeType: descriptor.mimeType,
      bytes: Uint8Array.from(bytes),
      maxCharacters: MAX_DOCUMENT_CHARACTERS
    })
    return result.text
  }

  private resolveManagedPath(relativePath: string): string {
    const root = resolve(this.rootPath)
    const candidate = resolve(root, relativePath)
    if (candidate !== root && !candidate.startsWith(`${root}/`)) {
      throw new Error('附件路径超出托管目录')
    }
    return candidate
  }
}

function isPlainText(mimeType: string): boolean {
  return mimeType.startsWith('text/') || mimeType === 'application/json'
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
