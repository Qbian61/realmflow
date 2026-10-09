import type { ConversationAttachmentDescriptor } from '../domain/conversation-input'

export type PickConversationAttachmentsCommand = {
  requestId: string
  draftId: string
}

export type RemoveConversationAttachmentCommand = {
  requestId: string
  draftId: string
  attachmentId: string
}

export type ConversationAttachmentPickerResult = {
  accepted: ConversationAttachmentDescriptor[]
  rejected: Array<{
    fileName: string
    code: string
    message: string
  }>
}

export interface ConversationAttachmentApi {
  pick(
    command: PickConversationAttachmentsCommand
  ): Promise<ConversationAttachmentPickerResult>
  remove(command: RemoveConversationAttachmentCommand): Promise<void>
}

export type ConversationAttachmentSubmission = {
  draftId: string
  attachmentIds: string[]
  allowImageEgress: boolean
}

export function parsePickConversationAttachmentsCommand(
  value: unknown
): PickConversationAttachmentsCommand {
  const input = command(value, ['requestId', 'draftId'])
  return {
    requestId: identifier(input.requestId),
    draftId: identifier(input.draftId)
  }
}

export function parseRemoveConversationAttachmentCommand(
  value: unknown
): RemoveConversationAttachmentCommand {
  const input = command(value, ['requestId', 'draftId', 'attachmentId'])
  return {
    requestId: identifier(input.requestId),
    draftId: identifier(input.draftId),
    attachmentId: identifier(input.attachmentId)
  }
}

function command(
  value: unknown,
  allowed: readonly string[]
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid()
  }
  const result = value as Record<string, unknown>
  if (Object.keys(result).some((key) => !allowed.includes(key))) {
    throw invalid()
  }
  return result
}

function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)
  ) {
    throw invalid()
  }
  return value
}

function invalid(): Error {
  return new Error('Invalid conversation attachment command')
}
