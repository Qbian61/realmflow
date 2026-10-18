import {
  normalizeDshConversationPromptBlock,
  type DshConversationInputEnvelope
} from '../../../../shared/dsh-conversation-input-contract'
import type { ConversationImagePart } from '../../../../domain/conversation-input'
import type { DshAcpPromptBlock } from '../../ai-run/application/ports'

export function buildDshPromptBlocks(
  envelope: DshConversationInputEnvelope,
  imageParts: readonly ConversationImagePart[] = []
): DshAcpPromptBlock[] {
  const imagesByAttachmentId = new Map(
    imageParts.map((part) => [part.attachmentId, part])
  )
  const customInstructions = envelope.runtime.customInstructions?.trim()
  let instructionsAdded = false
  return envelope.prompt.blocks.map((block, index) => {
    const normalized = normalizeDshConversationPromptBlock(block, index)
    switch (normalized.type) {
      case 'text':
        if (customInstructions && !instructionsAdded) {
          instructionsAdded = true
          return {
            type: 'text',
            text: [
              '## Selected Skill instructions',
              customInstructions,
              '',
              '## User request',
              normalized.text
            ].join('\n')
          }
        }
        return {
          type: 'text',
          text: normalized.text
        }
      case 'resource_link':
        return {
          type: 'resource_link',
          uri: normalized.uri,
          ...(normalized.name ? { name: normalized.name } : {})
        }
      case 'image':
        const image = imagesByAttachmentId.get(normalized.attachmentId)
        if (!image) {
          throw new Error(
            `DSH image payload is missing: ${normalized.attachmentId}`
          )
        }
        if (image.mimeType !== normalized.mediaType) {
          throw new Error(
            `DSH image media type mismatch: ${normalized.attachmentId}`
          )
        }
        return {
          type: 'image',
          data: image.dataBase64,
          mimeType: normalized.mediaType
        }
    }
  })
}
