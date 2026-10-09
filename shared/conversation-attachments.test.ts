import { describe, expect, it } from 'vitest'
import {
  parsePickConversationAttachmentsCommand,
  parseRemoveConversationAttachmentCommand
} from './conversation-attachments'

describe('conversation attachment contract', () => {
  it('accepts opaque draft ownership and idempotency identifiers', () => {
    expect(
      parsePickConversationAttachmentsCommand({
        requestId: 'request-1',
        draftId: 'draft-1'
      })
    ).toEqual({
      requestId: 'request-1',
      draftId: 'draft-1'
    })
    expect(
      parseRemoveConversationAttachmentCommand({
        requestId: 'request-2',
        draftId: 'draft-1',
        attachmentId: 'attachment-1'
      })
    ).toEqual({
      requestId: 'request-2',
      draftId: 'draft-1',
      attachmentId: 'attachment-1'
    })
  })

  it('rejects unknown fields and invalid identifiers', () => {
    expect(() =>
      parsePickConversationAttachmentsCommand({
        requestId: 'request-1',
        draftId: '../draft',
        path: '/private/file.txt'
      })
    ).toThrow('Invalid conversation attachment command')
  })
})
