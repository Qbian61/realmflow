export const WORKBENCH_ATTACHMENT_OWNER_TYPES = [
  'task_record',
  'site_icon',
  'memo'
] as const

export type WorkbenchAttachmentOwnerType =
  (typeof WORKBENCH_ATTACHMENT_OWNER_TYPES)[number]

export type WorkbenchAttachment = {
  id: string
  ownerType: WorkbenchAttachmentOwnerType
  ownerId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  createdAt: number
}

export type AttachmentOwnerQuery = {
  ownerType: WorkbenchAttachmentOwnerType
  ownerId: string
}

export type PickWorkbenchAttachmentCommand = AttachmentOwnerQuery & {
  requestId: string
  accept: 'any' | 'image'
}

export type DeleteWorkbenchAttachmentCommand = {
  requestId: string
  attachmentId: string
}

export type WorkbenchAttachmentMutationResult = {
  attachmentId: string
}

export interface WorkbenchAttachmentApi {
  list(query: AttachmentOwnerQuery): Promise<WorkbenchAttachment[]>
  pickAndAttach(
    command: Omit<PickWorkbenchAttachmentCommand, 'accept'> & {
      accept?: PickWorkbenchAttachmentCommand['accept']
    }
  ): Promise<WorkbenchAttachment | undefined>
  readImage(attachmentId: string): Promise<string>
  open(attachmentId: string): Promise<void>
  reveal(attachmentId: string): Promise<void>
  delete(
    command: DeleteWorkbenchAttachmentCommand
  ): Promise<WorkbenchAttachmentMutationResult>
}

export function parseAttachmentOwnerQuery(
  value: unknown
): AttachmentOwnerQuery {
  const input = record(value)
  return {
    ownerType: ownerType(input.ownerType),
    ownerId: identifier(input.ownerId, 'ownerId')
  }
}

export function parsePickWorkbenchAttachmentCommand(
  value: unknown
): PickWorkbenchAttachmentCommand {
  const input = record(value)
  const accept = input.accept ?? 'any'
  if (accept !== 'any' && accept !== 'image') {
    throw new Error('Invalid attachment command: accept')
  }
  return {
    requestId: identifier(input.requestId, 'requestId'),
    ...parseAttachmentOwnerQuery(input),
    accept
  }
}

export function parseDeleteWorkbenchAttachmentCommand(
  value: unknown
): DeleteWorkbenchAttachmentCommand {
  const input = record(value)
  return {
    requestId: identifier(input.requestId, 'requestId'),
    attachmentId: identifier(input.attachmentId, 'attachmentId')
  }
}

export function parseAttachmentId(value: unknown): string {
  const result = identifier(value, 'attachmentId')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(result)) {
    throw new Error('Invalid attachment command: attachmentId')
  }
  return result
}

function ownerType(value: unknown): WorkbenchAttachmentOwnerType {
  if (
    typeof value !== 'string' ||
    !WORKBENCH_ATTACHMENT_OWNER_TYPES.includes(
      value as WorkbenchAttachmentOwnerType
    )
  ) {
    throw new Error('Invalid attachment command: ownerType')
  }
  return value as WorkbenchAttachmentOwnerType
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid attachment command: ${field}`)
  }
  return value.trim()
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid attachment command')
  }
  return value as Record<string, unknown>
}
