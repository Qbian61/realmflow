import type { ExtractedContentBundle } from '../../../../domain/content-extraction'
import {
  buildLongTextSummary,
  type ConversationAttachmentDescriptor,
  type LongTextChunk,
  type PreparedConversationAttachment
} from '../../../../domain/conversation-input'

export type ConversationExtractionResult = {
  attachment: PreparedConversationAttachment
  contextSection: string
  chunks: LongTextChunk[]
}

export function adaptExtractedBundleForConversation(input: {
  attachment: ConversationAttachmentDescriptor
  bundle: ExtractedContentBundle
  longTextCharacters: number
  chunkCharacters: number
  summaryCharacters: number
}): ConversationExtractionResult {
  const text = input.bundle.units
    .map(
      (unit) =>
        `[内容单元 ${unit.key}: ${unit.title}]\n${unit.text}`
    )
    .join('\n\n')
  const extraction =
    input.attachment.mediaKind === 'image' ? 'ocr' : 'parser'

  if (text.length > input.longTextCharacters) {
    const summary = buildLongTextSummary({
      attachmentId: input.attachment.id,
      text,
      chunkCharacters: input.chunkCharacters,
      summaryCharacters: input.summaryCharacters
    })
    return {
      attachment: {
        attachmentId: input.attachment.id,
        fileName: input.attachment.fileName,
        mimeType: input.attachment.mimeType,
        kind: input.attachment.mediaKind,
        status: 'ready',
        extraction,
        summary
      },
      contextSection:
        `[附件 ${input.attachment.id}: ${input.attachment.fileName}，` +
        `长文本摘要，可按 chunk id 回取]\n${summary.root.summary}`,
      chunks: summary.chunks
    }
  }

  return {
    attachment: {
      attachmentId: input.attachment.id,
      fileName: input.attachment.fileName,
      mimeType: input.attachment.mimeType,
      kind: input.attachment.mediaKind,
      status: 'ready',
      extraction,
      content: text
    },
    contextSection:
      `[附件 ${input.attachment.id}: ${input.attachment.fileName}]\n${text}`,
    chunks: []
  }
}
