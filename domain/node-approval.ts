export type NodeApprovalResult = 'approved' | 'rejected'
export type NodeApprovalActorType = 'local_user' | 'system'

export function normalizeNodeApprovalNote(
  note: string | undefined
): string | undefined {
  const normalized = note?.trim()
  if (!normalized) return undefined
  if (normalized.length > 2_000) {
    throw new Error('Approval note must be at most 2000 characters')
  }
  return normalized
}
