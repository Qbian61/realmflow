import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  type ConversationAttachmentEnvelope,
  type ConversationAttachmentDescriptor,
  type ConversationImagePart,
  type PreparedConversationAttachment
} from '../../../../domain/conversation-input'
import type { ConversationAttachmentRepository } from '../../infrastructure/sqlite/conversation-attachment-repository'
import type { LocalContentExtractionService } from '../content-extraction/local-content-extraction-service'
import { adaptExtractedBundleForConversation } from './conversation-extraction-adapter'

const MAX_DOCUMENT_CHARACTERS = 200_000
const MAX_CONTENT_UNITS = 1_000

type PreprocessorRepository = Pick<
  ConversationAttachmentRepository,
  'get' | 'resolveBlobPath' | 'updateStatus' | 'replaceChunks'
>

export class ConversationInputPreprocessor {
  private readonly longTextCharacters: number
  private readonly chunkCharacters: number
  private readonly summaryCharacters: number
  private readonly contentExtractor?: Pick<
    LocalContentExtractionService,
    'extract'
  >

  constructor(
    private readonly repository: PreprocessorRepository,
    private readonly rootPath: string,
    options: {
      longTextCharacters?: number
      chunkCharacters?: number
      summaryCharacters?: number
      contentExtractor?: Pick<LocalContentExtractionService, 'extract'>
    } = {}
  ) {
    this.longTextCharacters = options.longTextCharacters ?? 12_000
    this.chunkCharacters = options.chunkCharacters ?? 4_000
    this.summaryCharacters = options.summaryCharacters ?? 480
    this.contentExtractor = options.contentExtractor
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
          descriptor.mediaKind === 'image' &&
          input.modelSupportsVision &&
          input.allowImageEgress
            ? this.prepareVisionImage(
                descriptor,
                bytes,
                imageParts,
                contextSections
              )
            : await this.prepareExtractedContent(
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

  private prepareVisionImage(
    descriptor: ConversationAttachmentDescriptor,
    bytes: Uint8Array,
    imageParts: ConversationImagePart[],
    contextSections: string[]
  ): PreparedConversationAttachment {
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

  private async prepareExtractedContent(
    descriptor: ConversationAttachmentDescriptor,
    bytes: Uint8Array,
    contextSections: string[]
  ): Promise<PreparedConversationAttachment> {
    if (!this.contentExtractor) {
      throw new Error('本地内容抽取服务不可用')
    }
    const bundle = await this.contentExtractor.extract({
      fileName: descriptor.fileName,
      mimeType: descriptor.mimeType,
      bytes: Uint8Array.from(bytes),
      sourceChecksum: `sha256:${descriptor.checksumSha256}`,
      signal: new AbortController().signal,
      depth: 0,
      policy: {
        consumer: 'conversation',
        allowLocalOcr: true,
        allowLocalConversion: true,
        maxCharacters: MAX_DOCUMENT_CHARACTERS,
        maxUnits: MAX_CONTENT_UNITS
      }
    })
    const result = adaptExtractedBundleForConversation({
      attachment: descriptor,
      bundle,
      longTextCharacters: this.longTextCharacters,
      chunkCharacters: this.chunkCharacters,
      summaryCharacters: this.summaryCharacters
    })
    await this.repository.replaceChunks(descriptor.id, result.chunks)
    contextSections.push(result.contextSection)
    return result.attachment
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
