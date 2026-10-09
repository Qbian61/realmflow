import type { LongTextChunk } from '../../../../domain/conversation-input'

export class ConversationAttachmentChunkReader {
  constructor(
    private readonly repository: {
      getChunkForConversation(
        chunkId: string,
        conversationId: string
      ): Promise<LongTextChunk | undefined>
    }
  ) {}

  async read(input: {
    chunkId: string
    conversationId: string
  }): Promise<LongTextChunk> {
    if (
      !input.chunkId.trim() ||
      !input.conversationId.trim() ||
      !/:chunk:[1-9][0-9]*$/.test(input.chunkId)
    ) {
      throw new Error('Conversation attachment chunk request is invalid')
    }
    const chunk = await this.repository.getChunkForConversation(
      input.chunkId,
      input.conversationId
    )
    if (!chunk) {
      throw new Error('Conversation attachment chunk is unavailable')
    }
    return structuredClone(chunk)
  }
}
