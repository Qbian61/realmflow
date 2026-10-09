import { describe, expect, it, vi } from 'vitest'
import { ConversationAttachmentChunkReader } from './conversation-attachment-chunk-reader'

describe('ConversationAttachmentChunkReader', () => {
  it('returns only a chunk owned by the current conversation', async () => {
    const getChunkForConversation = vi.fn().mockResolvedValue({
      id: 'attachment-1:chunk:2',
      attachmentId: 'attachment-1',
      start: 80,
      end: 160,
      digest: 'a'.repeat(64),
      content: 'requested content',
      summary: 'requested'
    })
    const reader = new ConversationAttachmentChunkReader({
      getChunkForConversation
    })

    await expect(
      reader.read({
        chunkId: 'attachment-1:chunk:2',
        conversationId: 'conversation-1'
      })
    ).resolves.toMatchObject({
      attachmentId: 'attachment-1',
      content: 'requested content'
    })
    expect(getChunkForConversation).toHaveBeenCalledWith(
      'attachment-1:chunk:2',
      'conversation-1'
    )
  })

  it('fails without exposing whether a chunk belongs to another conversation', async () => {
    const reader = new ConversationAttachmentChunkReader({
      getChunkForConversation: vi.fn().mockResolvedValue(undefined)
    })

    await expect(
      reader.read({
        chunkId: 'attachment-1:chunk:2',
        conversationId: 'conversation-2'
      })
    ).rejects.toThrow('Conversation attachment chunk is unavailable')
  })
})
